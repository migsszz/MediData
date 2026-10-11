/**
 * Minimal promise wrapper over one IndexedDB object store, with an in-memory
 * fallback for environments where IndexedDB is missing or blocked (private
 * windows, some test runners). In the fallback, queued writes survive only
 * until the tab closes.
 */
export interface KeyValueStore<T extends { id: string }> {
  all(): Promise<T[]>;
  put(value: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export function openStore<T extends { id: string }>(dbName: string, storeName: string): KeyValueStore<T> {
  const memory = new Map<string, T>();
  const memoryStore: KeyValueStore<T> = {
    all: async () => [...memory.values()],
    put: async (v) => void memory.set(v.id, v),
    remove: async (id) => void memory.delete(id)
  };

  if (typeof indexedDB === 'undefined') return memoryStore;

  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  const tx = async <R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const db = await open();
    return new Promise<R>((resolve, reject) => {
      const req = fn(db.transaction(storeName, mode).objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  const safe = async <R>(op: () => Promise<R>, fallback: () => Promise<R>): Promise<R> => {
    try {
      return await op();
    } catch {
      return fallback();
    }
  };

  return {
    all: () => safe(() => tx('readonly', (s) => s.getAll() as IDBRequest<T[]>), memoryStore.all),
    put: (v) => safe(() => tx('readwrite', (s) => s.put(v)).then(() => undefined), () => memoryStore.put(v)),
    remove: (id) => safe(() => tx('readwrite', (s) => s.delete(id)).then(() => undefined), () => memoryStore.remove(id))
  };
}
