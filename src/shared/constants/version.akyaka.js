/**
 * Akyaka App Version - Auto-incremented on each deployment
 * Format: Major.Minor.Patch (Semantic Versioning)
 *
 * NOTE: During the demo phase Akyaka shares the same frontend bundle as Plannivo,
 * so this file is not imported by the bundle yet. It exists so push-akyaka.js has
 * a per-customer version target (independent of Plannivo's version.js) and is ready
 * to be imported once Akyaka's frontend branding diverges.
 *
 * Version is auto-incremented by push-akyaka.js on each deploy.
 */
export const APP_VERSION = '0.0.3';

// Log version on app load (helpful for debugging)
if (typeof window !== 'undefined') {
  console.log(`%c🚀 Akyaka v${APP_VERSION}`, 'color: #10B981; font-weight: bold; font-size: 14px;');
}
