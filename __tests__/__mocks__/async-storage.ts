// In-memory stub of AsyncStorage for Node-side tests.
const store = new Map<string, string>();

export default {
  getItem: jest.fn(async (k: string) => store.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    store.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    store.delete(k);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  getAllKeys: jest.fn(async () => Array.from(store.keys())),
  multiGet: jest.fn(async (keys: string[]) =>
    keys.map((k) => [k, store.get(k) ?? null] as [string, string | null])
  ),
};
