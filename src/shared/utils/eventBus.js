// Lightweight event bus without external deps
const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
  return () => off(event, callback);
}

export function off(event, callback) {
  const set = listeners.get(event);
  if (!set) return;
  set.delete(callback);
  if (set.size === 0) listeners.delete(event);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of Array.from(set)) {
    try { cb(payload); } catch {
      // swallow errors to avoid breaking emitters
    }
  }
}

export default { on, off, emit };
