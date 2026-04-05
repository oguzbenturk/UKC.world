const STORAGE_KEY = 'instructorColors.v1';

const DEFAULT_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4', '#EAB308', '#84CC16'
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function loadInstructorColors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveInstructorColors(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getInstructorColor(instructorId, instructorName, map) {
  if (!instructorId && !instructorName) return '#94A3B8';
  const key = String(instructorId || instructorName);
  if (map && map[key]) return map[key];
  const idx = hashString(key) % DEFAULT_PALETTE.length;
  return DEFAULT_PALETTE[idx];
}

export function setInstructorColor(instructorId, color, map) {
  const key = String(instructorId);
  const next = { ...(map || {}) };
  next[key] = color;
  saveInstructorColors(next);
  return next;
}
