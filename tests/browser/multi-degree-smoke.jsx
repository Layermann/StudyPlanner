import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import usePlanner from '../../hooks/usePlanner';
import useCloudSync from '../../hooks/useCloudSync';
import { createDegree, initialDocument, readDocument } from '../../multi-degree.mjs';
import { workspaceKey, saveWorkspace } from '../../planner-storage.mjs';

window.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const clone = value => structuredClone(value);
class MemoryStorage {
  values = new Map(); fail = false;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key,value) { if(this.fail) throw new Error('quota'); this.values.set(key,value); }
  get length() { return this.values.size; } key(i) { return [...this.values.keys()][i]; }
}
function database(rows = {}) {
  const calls = []; const gates = new Map();
  const client = { from() {
    let mode = 'read', values; const filters = {};
    const query = { select() { return query; }, eq(k,v) { filters[k] = v; return query; }, insert(v) { mode = 'insert'; values = clone(v); return query; }, update(v) { mode = 'update'; values = clone(v); return query; }, async maybeSingle() {
      const owner = filters.owner ?? values?.owner; calls.push({ mode, owner, values: clone(values) });
      if (gates.has(owner)) await gates.get(owner).promise;
      if (client.readError && mode === 'read') return { error: new Error('offline'), data: null };
      const row = rows[owner];
      if (mode === 'read') return { data: row ? clone(row) : null, error: null };
      if (client.writeError) return { data: null, error: new Error('write failed') };
      if (mode === 'insert' && row) return { data:null, error:{ code:'23505' } };
      if (mode === 'update' && (!row || row.updated_at !== filters.updated_at)) return { data:null, error:null };
      rows[owner] = { ...row, ...values }; return { data:{ updated_at: values.updated_at },error:null };
    } }; return query;
  } };
  return { client, rows, calls, hold(owner) { let release; const promise = new Promise(resolve => release = resolve); gates.set(owner, {promise, release}); }, release(owner) { const gate=gates.get(owner); gates.delete(owner); gate.release(); } };
}
const revision = '2026-01-01T00:00:00.000Z';
const row = document => ({ data: document, updated_at: revision });
let root; let latest; let props;
function Harness({ owner, storage, db, prefix }) {
  const planner = usePlanner(owner, { storage, prefix, demoModules: [] });
  const cloud = useCloudSync({ client: db?.client, owner, enabled: !!db, planner, debounceMs: 5 });
  latest = { planner, cloud };
  return <p>{planner.plannerTitle}</p>;
}
async function mount(initial) {
  if(root) await act(async () => root.unmount());
  props = { owner:null, storage:new MemoryStorage(), prefix:`test-${crypto.randomUUID()}:`, ...initial };
  root = createRoot(document.getElementById('fixture'));
  await act(async () => root.render(<Harness {...props} />));
}
async function render(patch) { props={...props,...patch}; await act(async () => root.render(<Harness {...props} />)); }
async function change(fn) { await act(async () => fn(latest)); }
async function settle(ms=40) { await act(async () => new Promise(resolve => setTimeout(resolve,ms))); }
const checks=[];
async function check(name, fn) { await fn(); checks.push(name); const item=document.createElement('li'); item.textContent=`PASS: ${name}`; document.getElementById('checks').append(item); }
const oldConfirm=window.confirm;
window.confirm=()=>true;
try {
 await check('Degree creation, ID isolation, rename, note state, independent undo and reload', async () => {
  await mount(); const first=latest.planner.activeDegreeId;
  await change(({planner:p})=>p.addModule({name:'Original',credits:6,semester:p.semesters[0],container:p.containerTitles[0],status:'Completed',grade:1.7}));
  const moduleId=latest.planner.modules[0].id;
  await change(({planner:p})=>p.updateModule(moduleId,{notes:[{id:'same-note',title:'Exam',text:'Preserve',color:'#123456',size:'large',expanded:false}]}));
  const original=clone(latest.planner.document.degrees[0]);
  await change(({planner:p})=>p.addDegree('Bachelor','bachelor',180)); const second=latest.planner.activeDegreeId;
  assert(latest.planner.requirements[0].requiredCredits===180,'Wrong Bachelor target'); assert(latest.planner.modules.length===0,'Modules leaked');
  await change(({planner:p})=>p.addModule({name:'New module',credits:12,semester:p.semesters[0],container:p.containerTitles[0],status:'Planned',grade:''}));
  await change(({planner:p})=>p.updateModule(p.modules[0].id,{name:'Edited'}));
  const stale = latest.planner;
  await change(({planner:p})=>p.selectDegree(first));
  await change(()=>stale.updateModule(moduleId,{name:'BAD'}));
  equal(latest.planner.document.degrees[0],original,'Stale callback changed original degree');
  await change(({planner:p})=>p.undo()); assert(latest.planner.modules[0].notes.length===0,'Undo did not affect original degree history');
  assert(latest.planner.document.degrees[1].modules[0].name==='Edited','Undo corrupted second degree');
  await change(({planner:p})=>p.selectDegree(second)); await change(({planner:p})=>p.undo()); assert(latest.planner.modules[0].name==='New module','Per-degree undo missing');
  await change(({planner:p})=>p.renameSemester(p.semesters[0],'First year'));
  assert(latest.planner.modules[0].semester==='First year','Rename lost semester');
  await change(({planner:p})=>p.setRequirements(reqs=>reqs.map(req=>({...req,title:'Core'}))));
  assert(latest.planner.modules[0].container==='Core','Rename lost category');
  const stored=clone(latest.planner.document); const {storage,prefix}=props;
  await mount({storage,prefix}); equal(latest.planner.document,stored,'Reload changed document'); assert(latest.planner.activeDegreeId===second,'Selection not preserved');
 });
 await check('Adding and deleting modules preserve explicit imported ordering', async () => {
  const storage=new MemoryStorage(); const prefix='ordering:'; const document=initialDocument(); const degree=document.degrees[0];
  const module={name:'Later',id:'later',semesterId:degree.semesters[0].id,requirementId:degree.requirements[0].id,credits:6,status:'Planned',grade:'',notes:[],order:2};
  degree.modules=[module,{...module,id:'first',name:'First',order:0}];
  saveWorkspace(storage,workspaceKey(prefix,null),{document,activeDegreeId:degree.id,dirty:true});
  await mount({storage,prefix});
  await change(({planner:p})=>p.addModule({name:'Added',credits:6,semester:p.semesters[0],container:p.containerTitles[0],status:'Planned',grade:''}));
  equal(latest.planner.orderedModules.map(m=>m.name),['First','Later','Added'],'Add lost explicit order');
  await change(({planner:p})=>p.deleteModule('later'));
  equal(latest.planner.orderedModules.map(m=>m.name),['First','Added'],'Delete lost order');
 });
 await check('Deleting a degree and recovery preserve unrelated data and block final deletion', async () => {
  await mount(); const first=latest.planner.activeDegreeId; await change(({planner:p})=>p.addDegree('Second','other',60)); const second=latest.planner.activeDegreeId;
  await change(({planner:p})=>p.deleteDegree(first)); assert(latest.planner.degrees.length===1&&latest.planner.activeDegreeId===second,'Wrong degree deleted');
  await change(({planner:p})=>p.undo()); assert(latest.planner.degrees.length===1,'Undo resurrected unrelated degree');
  assert(latest.planner.deleteDegree(second)===false,'Deleted final degree');
  await change(({planner:p})=>p.restoreRecovery()); assert(latest.planner.degrees.length===2,'Recovery failed');
 });
 await check('Failed persistence does not apply edits; malformed caches are blocked', async () => {
  await mount(); const before=clone(latest.planner.document); props.storage.fail=true;
  await change(({planner:p})=>p.setPlannerTitle('Must not apply')); equal(latest.planner.document,before,'Unsaved change applied'); assert(latest.planner.storageError,'No storage feedback'); props.storage.fail=false;
  const storage=new MemoryStorage(); storage.setItem(workspaceKey('broken:',null),'{bad');
  await mount({storage,prefix:'broken:'}); assert(latest.planner.blocked,'Malformed data became defaults');
 });
 await check('An invalid local selection falls back without blocking subsequent edits', async () => {
  const storage=new MemoryStorage();const prefix='selection:';const document=initialDocument();
  storage.setItem(workspaceKey(prefix,null),JSON.stringify({document,activeDegreeId:'missing',dirty:false}));
  await mount({storage,prefix});assert(latest.planner.activeDegreeId===document.degrees[0].id,'Selection not repaired');
  await change(({planner:p})=>p.setPlannerTitle('Still editable'));
  assert(latest.planner.plannerTitle==='Still editable','Selection repair falsely detected a stale tab');
 });
 await check('Stale local tabs cannot overwrite a newer local document', async () => {
  await mount(); const key=workspaceKey(props.prefix,null); const newer=JSON.parse(props.storage.getItem(key)); newer.document.degrees[0].title='Other tab'; props.storage.setItem(key,JSON.stringify(newer));
  await change(({planner:p})=>p.setPlannerTitle('Stale edit'));
  assert(latest.planner.storageError,'No stale-tab error'); assert(JSON.parse(props.storage.getItem(key)).document.degrees[0].title==='Other tab','Newer local state overwritten');
 });
 await check('A blocked cache accepts a validated backup and retains the invalid source', async () => {
  const storage=new MemoryStorage(); const prefix='recover:'; const key=workspaceKey(prefix,null); storage.setItem(key,'{invalid');
  await mount({storage,prefix}); assert(latest.planner.blocked,'Invalid cache accepted');
  const backup=initialDocument(); backup.degrees[0].title='Recovered';
  await change(({planner:p})=>p.recoverFromFile({target:{files:[{text:async()=>JSON.stringify(backup)}],value:'file'}}));
  assert(!latest.planner.blocked&&latest.planner.plannerTitle==='Recovered','Valid backup did not recover');
  assert([...storage.values].some(([k,v])=>k.includes(':recovery')&&v==='{invalid'),'Original invalid data lost');
 });
 await check('Version 4 restore, legacy restore, invalid import and cancellation', async () => {
  await mount(); const before=clone(latest.planner.document);
  const upload=object=>({target:{files:[{text:async()=>JSON.stringify(object)}],value:'file'}});
  window.confirm=()=>false; await change(({planner:p})=>p.handleImportFile(upload({...before,degrees:[...before.degrees,createDegree('Extra','other',60)]}))); equal(latest.planner.document,before,'Canceled import replaced data');
  window.confirm=()=>true; await change(({planner:p})=>p.handleImportFile(upload({...before,degrees:[...before.degrees,createDegree('Extra','other',60)]}))); assert(latest.planner.degrees.length===2,'Full backup not restored');
  const legacy={version:3,theme:'midnight',plannerTitle:'Old',semesters:['Semester 1'],requirements:[{id:'r',title:'Core',requiredCredits:180}],modules:[]};
  await change(({planner:p})=>p.handleImportFile(upload(legacy))); assert(latest.planner.degrees.length===1&&latest.planner.plannerTitle==='Old','Legacy restore failed');
  const saved=clone(latest.planner.document); const originalAlert=window.alert; window.alert=()=>{};
  await change(({planner:p})=>p.handleImportFile(upload({version:9}))); window.alert=originalAlert; equal(latest.planner.document,saved,'Invalid import erased data');
 });
 await check('All degrees cloud roundtrip; switching alone does not write', async () => {
  const cloud=initialDocument(); cloud.degrees.push(createDegree('Second','bachelor',180)); const db=database({alice:row(cloud)});
  await mount({owner:'alice',db}); await settle(); assert(latest.planner.degrees.length===2,'Cloud only loaded one degree');
  const writes=()=>db.calls.filter(c=>c.mode!=='read'); const count=writes().length;
  await change(({planner:p})=>p.selectDegree(p.degrees[1].id)); await settle(); assert(writes().length===count,'Switch wrote to cloud');
  await change(({planner:p})=>p.setPlannerTitle('Cloud edit')); await settle(); assert(db.rows.alice.data.degrees[1].title==='Cloud edit','Cloud save lost second degree');
  equal(db.rows.alice.data,latest.planner.document,'Cloud roundtrip mismatch');
 });
 await check('Divergent local/cloud documents pause until explicit choice', async () => {
  const storage=new MemoryStorage(); const prefix='choice:'; const local=initialDocument(); local.degrees[0].title='Local';
  saveWorkspace(storage,workspaceKey(prefix,'alice'),{document:local,activeDegreeId:local.degrees[0].id,dirty:true,baseline:null});
  const remote=initialDocument(); remote.degrees[0].title='Remote'; const db=database({alice:row(remote)});
  await mount({owner:'alice',storage,prefix,db}); await settle(); assert(latest.cloud.cloudChoice,'No choice presented'); assert(db.calls.every(c=>c.mode==='read'),'Cloud overwritten before choice');
  await change(({cloud:c})=>c.chooseLocal()); await settle(); await settle(); assert(db.rows.alice.data.degrees[0].title==='Local','Explicit local choice did not save');
 });
 await check('Cloud reload and use-cloud retain recoverable local backup', async () => {
  const storage=new MemoryStorage(); const prefix='remote:'; const local=initialDocument(); local.degrees[0].title='Local copy';
  saveWorkspace(storage,workspaceKey(prefix,'alice'),{document:local,activeDegreeId:local.degrees[0].id,dirty:true});
  const remote=initialDocument(); remote.degrees[0].title='Remote copy'; const db=database({alice:row(remote)});
  await mount({owner:'alice',storage,prefix,db}); await settle(); await change(({cloud:c})=>c.chooseCloud()); await settle();
  assert(latest.planner.plannerTitle==='Remote copy','Use cloud did not load');
  assert([...storage.values].some(([k,v])=>k.includes(':recovery')&&v.includes('Local copy')),'Local recovery lost');
 });
 await check('Account switch cancels in-flight loads and isolates caches and guest data', async () => {
  const a=initialDocument(); a.degrees[0].title='Alice secret'; const b=initialDocument(); b.degrees[0].title='Bob'; const db=database({alice:row(a),bob:row(b)}); db.hold('alice');
  await mount({owner:'alice',db}); await render({owner:'bob'}); await settle(); assert(latest.planner.plannerTitle==='Bob','Account B not loaded');
  db.release('alice'); await settle(); assert(latest.planner.plannerTitle==='Bob','Late A load affected B');
  await render({owner:null}); assert(latest.planner.plannerTitle!=='Bob'&&latest.planner.plannerTitle!=='Alice secret','Guest contains account data');
  await render({owner:'new-account'}); await settle(); assert(db.rows['new-account'].data.degrees[0].title!=='Bob','B leaked into empty account');
 });
 await check('An in-flight write from account A cannot update account B or its UI', async () => {
  const a=initialDocument();a.degrees[0].title='Alice'; const b=initialDocument();b.degrees[0].title='Bob'; const db=database({alice:row(a),bob:row(b)});
  await mount({owner:'alice',db});await settle();db.hold('alice');
  await change(({planner:p})=>p.setPlannerTitle('Alice pending write'));await settle();
  await render({owner:'bob'});await settle();db.release('alice');await settle();
  assert(latest.planner.plannerTitle==='Bob','Old write changed active UI');assert(db.rows.bob.data.degrees[0].title==='Bob','Old write contaminated account B');
 });
 await check('Failed loads and future versions cannot trigger saves', async () => {
  const db=database({alice:row({version:9,degrees:[]})}); await mount({owner:'alice',db}); await settle(); assert(latest.cloud.syncError,'Future cloud version accepted'); assert(db.calls.every(c=>c.mode==='read'),'Future data overwritten');
  db.client.readError=true; await render({owner:'bob'}); await settle(); await change(({planner:p})=>p.setPlannerTitle('Offline local')); await settle(); assert(db.calls.every(c=>c.mode==='read'),'Failed load allowed save');
 });
 await check('Revision conflict pauses saves and preserves local export state', async () => {
  const db=database({alice:row(initialDocument())}); await mount({owner:'alice',db}); await settle();
  db.rows.alice.updated_at='2026-01-02T00:00:00.000Z'; db.rows.alice.data.degrees[0].title='Other device';
  await change(({planner:p})=>p.setPlannerTitle('Local conflict')); await settle();
  assert(latest.cloud.syncError,'Revision conflict ignored'); assert(db.rows.alice.data.degrees[0].title==='Other device','Remote edit overwritten'); assert(latest.planner.plannerTitle==='Local conflict','Local conflict lost');
  const count=db.calls.length; await change(({planner:p})=>p.setPlannerTitle('Another local')); await settle(); assert(db.calls.length===count,'Writes continued after conflict');
 });
 document.getElementById('result').textContent=`PASS — ${checks.length} integration checks`;
} catch(error) {
 document.getElementById('result').textContent=`FAIL — ${error.stack}`;
 console.error(error);
} finally {
 window.confirm=oldConfirm;
 if(root) await act(async()=>root.unmount());
 window.IS_REACT_ACT_ENVIRONMENT=false;
}
