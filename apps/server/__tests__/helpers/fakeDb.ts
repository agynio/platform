export function makeFakeDb() {
  const state: any = { docs: new Map<string, any>(), indexes: [] as any[] };

  function makeKey(query: any) {
    const key: any = { nodeId: query.nodeId, scope: query.scope };
    if (query.threadId) key.threadId = query.threadId;
    return JSON.stringify(key);
  }

  function pruneEmpty(obj: any): any {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) {
        obj[k] = pruneEmpty(obj[k]);
        if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]) && Object.keys(obj[k]).length === 0) {
          delete obj[k];
        }
      }
    }
    return obj;
  }

  const coll = {
    createIndex: async (_spec: any, opts: any) => {
      state.indexes.push({ name: opts?.name || JSON.stringify(_spec), partialFilterExpression: opts?.partialFilterExpression });
    },
    findOne: async (query: any) => {
      const key = makeKey(query);
      return state.docs.get(key) || null;
    },
    updateOne: async (query: any, update: any, options: any) => {
      const key = makeKey(query);
      let doc = state.docs.get(key) || { ...query, data: {}, meta: {} };
      if (update.$set) {
        for (const k of Object.keys(update.$set)) {
          if (k.startsWith('data.')) {
            const path = k.slice(5);
            const parts = path.split('.');
            let cur: any = doc.data;
            for (let i = 0; i < parts.length - 1; i++) {
              const p = parts[i];
              if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
              cur = cur[p];
            }
            cur[parts[parts.length - 1]] = update.$set[k];
          } else {
            (doc as any)[k] = update.$set[k];
          }
        }
      }
      if (update.$unset) {
        for (const k of Object.keys(update.$unset)) {
          if (k.startsWith('data.')) {
            const path = k.slice(5);
            const parts = path.split('.');
            let cur: any = doc.data;
            const stack: any[] = [cur];
            for (let i = 0; i < parts.length - 1; i++) {
              const p = parts[i];
              if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) { cur[p] = {}; }
              cur = cur[p];
              stack.push(cur);
            }
            delete cur[parts[parts.length - 1]];
            // prune empty containers upwards
            for (let i = stack.length - 1; i >= 0; i--) {
              const container = stack[i];
              for (const key of Object.keys(container)) {
                if (container[key] && typeof container[key] === 'object' && !Array.isArray(container[key]) && Object.keys(container[key]).length === 0) {
                  delete container[key];
                }
              }
            }
          } else {
            delete (doc as any)[k];
          }
        }
      }
      if (update.$currentDate) {
        doc.meta = doc.meta || {};
        doc.meta.updatedAt = new Date();
      }
      if (options?.upsert && !state.docs.has(key)) {
        doc.meta = doc.meta || {};
        doc.meta.createdAt = new Date();
      }
      // do not prune empty nodes globally; directories may be empty
      state.docs.set(key, doc);
      return { upsertedCount: options?.upsert ? 1 : 0 } as any;
    },
    listIndexes: () => ({ toArray: async () => state.indexes }),
    insertOne: async (doc: any) => {
      const key = makeKey(doc);
      if (state.docs.has(key)) {
        const err: any = new Error('Duplicate key');
        err.code = 11000;
        throw err;
      }
      state.docs.set(key, { ...doc });
      return { insertedId: key } as any;
    },
    deleteMany: async (filter: any) => {
      if (!filter || Object.keys(filter).length === 0) {
        const deletedCount = state.docs.size;
        state.docs.clear();
        return { deletedCount } as any;
      }
      const key = makeKey(filter);
      const existed = state.docs.delete(key);
      return { deletedCount: existed ? 1 : 0 } as any;
    },
  } as any;

  const db = {
    collection: (_name: string) => coll,
  } as any;

  return { db, state };
}
