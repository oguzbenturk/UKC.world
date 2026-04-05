import { resolveApiBaseUrl } from '@/shared/services/apiClient';

/** Stable key for cache-busting uploaded images (from API row). */
export function imageRevisionFromRecord(row) {
  if (!row) return '';
  const u = row.updatedAt ?? row.updated_at;
  if (u) {
    const t = new Date(u).getTime();
    if (Number.isFinite(t)) return t;
    return String(u);
  }
  return row.imageUrl || row.image_url || '';
}

function appendCacheBust(url, cacheBustKey) {
  if (
    cacheBustKey == null ||
    cacheBustKey === '' ||
    (typeof cacheBustKey === 'number' && !Number.isFinite(cacheBustKey))
  ) {
    return url;
  }
  const v = encodeURIComponent(String(cacheBustKey));
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${v}`;
}

/**
 * Turn stored upload paths (e.g. `/uploads/...`) into a browser-loadable URL in dev and prod.
 * @param {string} path
 * @param {string|number} [cacheBustKey] — e.g. `updatedAt` timestamp so replaced images are not served from disk cache
 */
export function resolvePublicUploadUrl(path, cacheBustKey) {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    const isUpload = /\/uploads\//i.test(trimmed);
    return isUpload ? appendCacheBust(trimmed, cacheBustKey) : trimmed;
  }
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  // Vite `public/` assets — same origin as the app
  if (
    normalized.startsWith('/Images/') ||
    normalized.startsWith('/assets/') ||
    normalized.startsWith('/DuotoneFonts/')
  ) {
    return normalized;
  }
  // Uploaded files: keep **same-origin** `/uploads/...` so:
  // - Dev: Vite proxies `/uploads` → backend (see vite.config.js). Using `http://localhost:4000/...`
  //   breaks when the app is opened via LAN IP or when :4000 is not reachable from the browser.
  // - Prod: nginx (or similar) proxies `/uploads` like `/api`.
  let out = normalized;
  if (normalized.startsWith('/uploads/')) {
    out = normalized;
  } else {
    const base = resolveApiBaseUrl();
    out = base ? `${base.replace(/\/$/, '')}${normalized}` : normalized;
  }
  if (out.startsWith('/uploads/') || /^https?:\/\//i.test(out)) {
    return appendCacheBust(out, cacheBustKey);
  }
  return out;
}
