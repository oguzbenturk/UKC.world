/**
 * App Version - Auto-incremented on each deployment
 * Format: Major.Minor.Patch (Semantic Versioning)
 * 
 * This version is displayed in:
 * - Navbar (next to Plannivo branding)
 * - index.html meta tag
 * - Console on app load
 * 
 * Version is auto-incremented by push-all.js and push-sync.js on each deploy
 */
export const APP_VERSION = '0.1.36';

// Log version on app load (helpful for debugging)
if (typeof window !== 'undefined') {
  console.log(`%c🚀 Plannivo v${APP_VERSION}`, 'color: #3B82F6; font-weight: bold; font-size: 14px;');
}
