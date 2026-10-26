export class PlanSyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// One controller per signed-in user. Writes are serialized and conditional on
// the exact revision read from the server, never a blind whole-plan upsert.
export function createPlanSync(client, owner) {
  let ready = false;
  let disposed = false;
  let revision = null;
  let queue = Promise.resolve();
  let failure = null;
  const assertReady = () => {
    if (disposed) throw new PlanSyncError('disposed', 'Session ended');
    if (!ready) throw failure || new PlanSyncError('not-loaded', 'Load the cloud plan before saving');
  };
  return {
    dispose() { disposed = true; ready = false; },
    async load() {
      ready = false;
      try {
        const { data, error } = await client.from('plans').select('data, updated_at').eq('owner', owner).maybeSingle();
        if (disposed) throw new PlanSyncError('disposed', 'Session ended');
        if (error) throw error;
        if (data && (!data.updated_at || !Number.isFinite(Date.parse(data.updated_at)) || !data.data || typeof data.data !== 'object' || Array.isArray(data.data))) {
          throw new PlanSyncError('invalid-data', 'Invalid cloud plan');
        }
        revision = data?.updated_at ?? null;
        failure = null;
        ready = true;
        return data;
      } catch (error) { failure = error; throw error; }
    },
    save(payload) {
      // Snapshot immediately so caller mutations cannot affect an enqueued save.
      const snapshot = JSON.parse(JSON.stringify(payload));
      const operation = queue.then(async () => {
        assertReady();
        const updated_at = new Date(Math.max(Date.now(), revision ? Date.parse(revision) + 1 : 0)).toISOString();
        try {
          const table = client.from('plans');
          const mutation = revision === null
            ? table.insert({ owner, data: snapshot, updated_at })
            : table.update({ data: snapshot, updated_at }).eq('owner', owner).eq('updated_at', revision);
          const { data, error } = await mutation.select('updated_at').maybeSingle();
          if (error?.code === '23505' || (!error && !data)) {
            throw new PlanSyncError('conflict', 'The cloud plan changed in another session');
          }
          if (error) throw error;
          if (!data?.updated_at || !Number.isFinite(Date.parse(data.updated_at))) {
            throw new PlanSyncError('invalid-data', 'Missing saved revision');
          }
          revision = data.updated_at;
          return data;
        } catch (error) {
          // A failed request might have reached the server. Do not retry a stale
          // revision or continue queued writes until a deliberate fresh load.
          ready = false;
          failure = error;
          throw error;
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
