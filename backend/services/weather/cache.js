const store = new Map();
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export const getCached = (key) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
};

export const setCached = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  store.set(key, { value, expires: Date.now() + ttlMs });
};

export const clearCache = () => store.clear();
