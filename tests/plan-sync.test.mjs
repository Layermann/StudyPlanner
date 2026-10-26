import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanSync } from '../plan-sync.mjs';
import { normalizeNotes } from '../planner-preferences.mjs';

const revision = '2026-01-01T00:00:00.000Z';
const plan = { modules: [{ id: 'm1', notes: [{id:'a', title:'Exam', text:'Keep this', expanded:false}, {id:'b', title:'Project', text:'Second note', expanded:true}] }], requirements: [{id:'r',title:'MINF',requiredCredits:6}], semesters: ['Semester 1'] };
function database(initial = {owner:'alice', data:plan, updated_at:revision}) {
  let row = initial ? structuredClone(initial) : null;
  let readError = null;
  let writeError = null;
  let releaseWrite = null;
  let writeGate = null;
  const calls = [];
  const client = {from(table) {
    assert.equal(table, 'plans');
    let mode = 'read'; let values; const filters = {};
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; return query; },
      insert(value) { mode='insert'; values=value; return query; },
      update(value) { mode='update'; values=value; return query; },
      async maybeSingle() {
        calls.push({mode, filters: {...filters}, values: structuredClone(values)});
        if (mode === 'read') return {data:row && row.owner === filters.owner ? structuredClone(row) : null, error:readError};
        if (writeGate) await writeGate;
        if (writeError) return {data:null,error:writeError};
        if (mode === 'insert') {
          if (row) return {data:null,error:{code:'23505'}};
          row=structuredClone(values);
        } else {
          if (!row || row.owner !== filters.owner || row.updated_at !== filters.updated_at) return {data:null,error:null};
          row={...row,...structuredClone(values)};
        }
        return {data:{updated_at:row.updated_at},error:null};
      },
    };
    return query;
  }};
  return {client,calls,get row(){return row;},set row(value){row=value;},setReadError(e){readError=e;},setWriteError(e){writeError=e;},holdWrites(){writeGate=new Promise(r=>releaseWrite=r);},release(){writeGate=null;releaseWrite();}};
}

test('failed initial load blocks all writes and preserves cloud data', async () => {
  const db=database(); db.setReadError(new Error('offline'));
  const sync=createPlanSync(db.client,'alice');
  await assert.rejects(sync.load(), /offline/);
  await assert.rejects(sync.save({modules:[]}), /offline/);
  assert.equal(db.calls.filter(c=>c.mode!=='read').length,0);
  assert.deepEqual(db.row.data, plan);
});

test('saving without loading is refused', async () => {
  const db=database(); const sync=createPlanSync(db.client,'alice');
  await assert.rejects(sync.save(plan), {code:'not-loaded'});
  assert.equal(db.calls.length,0);
});

test('two sessions: stale revision cannot overwrite newer notes', async () => {
  const db=database(); const a=createPlanSync(db.client,'alice'); const b=createPlanSync(db.client,'alice');
  await Promise.all([a.load(),b.load()]);
  const next=structuredClone(plan); next.modules[0].notes.push({id:'c',text:'New from A'});
  await a.save(next);
  await assert.rejects(b.save(plan), {code:'conflict'});
  await assert.rejects(b.save({modules:[]}), {code:'conflict'});
  assert.deepEqual(db.row.data,next);
  assert.equal(db.calls.filter(c=>c.mode==='update').length,2);
});

test('concurrent edits in one session are serialized with the latest revision', async () => {
  const db=database(); const sync=createPlanSync(db.client,'alice'); await sync.load(); db.holdWrites();
  const first=sync.save({...plan,title:'First'});
  const second=sync.save({...plan,title:'Second'});
  await new Promise(r=>setImmediate(r));
  assert.equal(db.calls.filter(c=>c.mode==='update').length,1);
  db.release(); await Promise.all([first,second]);
  const writes=db.calls.filter(c=>c.mode==='update');
  assert.equal(writes[1].filters.updated_at,writes[0].values.updated_at);
  assert.equal(db.row.data.title,'Second');
});

test('new plan creation uses insert and detects a competing creation', async () => {
  const db=database(null); const a=createPlanSync(db.client,'alice'); const b=createPlanSync(db.client,'alice');
  assert.equal(await a.load(),null); await b.load();
  await a.save(plan);
  await assert.rejects(b.save({modules:[]}),{code:'conflict'});
  assert.deepEqual(db.row.data,plan);
});

test('write failure pauses subsequent writes until fresh load', async () => {
  const db=database(); const sync=createPlanSync(db.client,'alice'); await sync.load();
  db.setWriteError(new Error('network failure'));
  await assert.rejects(sync.save(plan), /network failure/);
  db.setWriteError(null);
  await assert.rejects(sync.save(plan), /network failure/);
  await sync.load(); await sync.save(plan);
  assert.equal(db.calls.filter(c=>c.mode==='update').length,2);
});

test('dispose cancels queued saves from a previous account/session', async () => {
  const db=database(); const sync=createPlanSync(db.client,'alice'); await sync.load();
  sync.dispose(); await assert.rejects(sync.save(plan), {code:'disposed'});
  assert.equal(db.calls.filter(c=>c.mode!=='read').length,0);
});

test('multiple notes survive save, second-session load and JSON normalization', async () => {
  const db=database(); const a=createPlanSync(db.client,'alice'); await a.load(); await a.save(plan);
  const b=createPlanSync(db.client,'alice'); const loaded=await b.load();
  assert.deepEqual(normalizeNotes(loaded.data.modules[0].notes), normalizeNotes(plan.modules[0].notes));
});

test('invalid cloud revision blocks writes rather than replacing the plan', async () => {
  const db=database({owner:'alice',data:plan,updated_at:'invalid'}); const sync=createPlanSync(db.client,'alice');
  await assert.rejects(sync.load(), {code:'invalid-data'});
  await assert.rejects(sync.save(plan), {code:'invalid-data'});
});

test('caller mutations do not alter queued save snapshots', async () => {
  const db=database(); const sync=createPlanSync(db.client,'alice'); await sync.load();
  const next=structuredClone(plan); const promise=sync.save(next); next.modules[0].notes=[];
  await promise; assert.equal(db.row.data.modules[0].notes.length,2);
});
