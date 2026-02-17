// Utilities for displaying names compactly and safely

/**
 * Compact a full name to a maximum character length.
 * - Prefer keeping first name fully, then add last initial if room.
 * - If still too long, cut and add ellipsis.
 */
export function compactName(fullName = '', maxChars = 12) {
  const name = (fullName || '').trim();
  if (name.length <= maxChars) return name;

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return name.slice(0, Math.max(1, maxChars - 1)) + '…';
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  const lastInitial = last ? last[0] + '.' : '';
  const candidate = `${first} ${lastInitial}`.trim();
  if (candidate.length <= maxChars) return candidate;

  // Fallback: cut first name to fit
  const allowance = Math.max(1, maxChars - 1);
  return first.slice(0, allowance) + '…';
}

/**
 * Strip HTML tags from a string to produce plain text for tooltips.
 */
export function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
