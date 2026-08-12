// Generates every PWA image asset from the REAL brand wordmark, so the installed
// app icon is the same lockup as the navbar on ukc.plannivo.com:
// Gotham Bold "UKC" at 0.1em letter-spacing + the emerald brand dot
// (see src/shared/components/ui/UkcBrandDot.jsx — the CSS below mirrors it).
//
// Rendering goes through Playwright's Chromium with the actual
// ds-bundle/fonts/Gotham-Bold-TR.woff2 inlined as a data: URI. That means real
// Gotham glyphs and real kerning — no system-font substitution, no tracing, and
// no dependency on the font being installed on whatever machine runs this.
//
// Outputs (all committed, all served straight from public/):
//   public/icons/icon-{192,512}.png              manifest, purpose "any"
//   public/icons/icon-maskable-{192,512}.png     manifest, purpose "maskable"
//   public/icons/apple-touch-icon.png            180x180, iOS home screen
//   public/icons/shortcut-{calendar,bookings,customers}.png   96x96 manifest shortcuts
//   public/splash/splash-*.png                   iOS apple-touch-startup-image
//
// Re-run after any brand change:
//   node scripts/generate-pwa-assets.mjs
//
// HEADS UP when you do: nginx serves every .png under `expires 1y, immutable`
// (infrastructure/nginx.conf), and these filenames carry no content hash. A
// device that already cached icon-512.png will keep the OLD artwork for a year.
// So if the mark ever changes, either rename the files (and update
// public/manifest.json + index.html) or append a ?v=N query to their URLs.
// The manifest itself is capped at max-age=3600, so it always picks up quickly.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS_DIR = path.join(ROOT, 'public', 'icons');
const SPLASH_DIR = path.join(ROOT, 'public', 'splash');

// Brand tokens — antrasit from tailwind.config.js, emerald-400 is the dot in
// UkcBrandDot.jsx (`bg-emerald-400`). Keep these in sync with the manifest's
// theme_color if the brand ever moves.
const BG = '#4b4f54';
const INK = '#ffffff';
const DOT = '#34d399';

const fontB64 = fs.readFileSync(path.join(ROOT, 'ds-bundle', 'fonts', 'Gotham-Bold-TR.woff2')).toString('base64');

// Pull the shortcut glyphs out of the same Heroicons package the app renders,
// so the long-press menu matches the UI instead of using look-alike shapes.
function heroiconPaths(name) {
  const src = fs.readFileSync(path.join(ROOT, 'node_modules', '@heroicons', 'react', '24', 'outline', `${name}.js`), 'utf8');
  return [...src.matchAll(/d:\s*"([^"]+)"/g)].map((m) => m[1]);
}

const wordmarkHtml = (targetRatio) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Gotham Bold';
    src: url(data:font/woff2;base64,${fontB64}) format('woff2');
    font-weight: 700; font-style: normal;
  }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
  body {
    background: ${BG};
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  #mark {
    display: inline-flex; align-items: baseline; white-space: nowrap;
    font-family: 'Gotham Bold'; font-weight: 700; color: ${INK};
    font-size: 100px;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  /* 0.1em tracking is applied AFTER the final C too; cancel that trailing space
     so the dot sits exactly 0.03em off the C and the lockup optically centres. */
  #ukc { letter-spacing: 0.1em; margin-right: -0.1em; }
  #dot {
    display: inline-block; flex-shrink: 0; border-radius: 9999px;
    background: ${DOT};
    width: 0.26em; height: 0.26em;
    position: relative; top: -0.02em; margin-left: 0.03em;
  }
</style></head><body>
  <div id="mark"><span id="ukc">UKC</span><span id="dot"></span></div>
  <script>window.__ratio = ${targetRatio};</script>
</body></html>`;

const glyphHtml = (paths) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: ${BG}; display: flex; align-items: center; justify-content: center; }
  svg { width: 62%; height: 62%; }
</style></head><body>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
       stroke-width="1.6" stroke="${DOT}" stroke-linecap="round" stroke-linejoin="round">
    ${paths.map((d) => `<path d="${d}" />`).join('\n    ')}
  </svg>
</body></html>`;

// Fit the wordmark to `ratio` of the shorter edge by measuring its real rendered
// width once, then solving for the font-size. Measuring beats hardcoding a size:
// it stays correct if the font or the tracking ever changes.
async function shootWordmark(page, { width, height, ratio, out }) {
  await page.setViewportSize({ width, height });
  await page.setContent(wordmarkHtml(ratio), { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const mark = document.getElementById('mark');
    const target = Math.min(window.innerWidth, window.innerHeight) * window.__ratio;
    const natural = mark.getBoundingClientRect().width;
    mark.style.fontSize = `${(100 * target) / natural}px`;
  });
  await page.screenshot({ path: out, type: 'png' });
  return out;
}

async function shootGlyph(page, { size, paths, out }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(glyphHtml(paths), { waitUntil: 'load' });
  await page.screenshot({ path: out, type: 'png' });
  return out;
}

// [cssWidth, cssHeight, devicePixelRatio, label] — iOS only accepts a startup
// image whose media query matches the device exactly, so each entry becomes one
// PNG plus one <link> in index.html.
const IOS_DEVICES = [
  [320, 568, 2, 'iPhone SE (1st gen)'],
  [375, 667, 2, 'iPhone SE 2/3, 8, 7, 6s'],
  [414, 736, 3, 'iPhone 8 Plus, 7 Plus'],
  [375, 812, 3, 'iPhone X, XS, 11 Pro, 12/13 mini'],
  [414, 896, 2, 'iPhone XR, 11'],
  [414, 896, 3, 'iPhone XS Max, 11 Pro Max'],
  [390, 844, 3, 'iPhone 12, 12 Pro, 13, 13 Pro, 14'],
  [428, 926, 3, 'iPhone 12/13 Pro Max, 14 Plus'],
  [393, 852, 3, 'iPhone 14 Pro, 15, 15 Pro, 16'],
  [430, 932, 3, 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus'],
  [402, 874, 3, 'iPhone 16 Pro'],
  [440, 956, 3, 'iPhone 16 Pro Max'],
  [768, 1024, 2, 'iPad 9.7", mini'],
  [810, 1080, 2, 'iPad 10.2"'],
  [820, 1180, 2, 'iPad Air 10.9"'],
  [834, 1112, 2, 'iPad Pro 10.5", Air 10.5"'],
  [834, 1194, 2, 'iPad Pro 11"'],
  [1024, 1366, 2, 'iPad Pro 12.9"'],
];
// iPads live on a desk in landscape; phones effectively always launch portrait.
const LANDSCAPE_MIN_WIDTH = 768;

fs.mkdirSync(ICONS_DIR, { recursive: true });
fs.mkdirSync(SPLASH_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const written = [];

try {
  // ── App icons ────────────────────────────────────────────────────────────
  // "any" is shown as-is in docks/taskbars, so it runs edge-to-edge. "maskable"
  // is cropped to a platform shape (Android circle/squircle), so the lockup is
  // pulled into the safe zone — the inner 80% — at a smaller ratio.
  for (const size of [192, 512]) {
    written.push(await shootWordmark(page, {
      width: size, height: size, ratio: 0.66,
      out: path.join(ICONS_DIR, `icon-${size}.png`),
    }));
    written.push(await shootWordmark(page, {
      width: size, height: size, ratio: 0.50,
      out: path.join(ICONS_DIR, `icon-maskable-${size}.png`),
    }));
  }

  // iOS rounds this itself — ship it square and fully opaque.
  written.push(await shootWordmark(page, {
    width: 180, height: 180, ratio: 0.64,
    out: path.join(ICONS_DIR, 'apple-touch-icon.png'),
  }));

  // ── Manifest shortcut glyphs (long-press the installed icon) ──────────────
  for (const [file, icon] of [
    ['shortcut-calendar', 'CalendarDaysIcon'],
    ['shortcut-bookings', 'TicketIcon'],
    ['shortcut-customers', 'UserGroupIcon'],
  ]) {
    written.push(await shootGlyph(page, {
      size: 96, paths: heroiconPaths(icon),
      out: path.join(ICONS_DIR, `${file}.png`),
    }));
  }

  // ── iOS launch screens ───────────────────────────────────────────────────
  for (const [cssW, cssH, dpr] of IOS_DEVICES) {
    written.push(await shootWordmark(page, {
      width: cssW * dpr, height: cssH * dpr, ratio: 0.52,
      out: path.join(SPLASH_DIR, `splash-${cssW}x${cssH}@${dpr}x-portrait.png`),
    }));
    if (cssW >= LANDSCAPE_MIN_WIDTH) {
      written.push(await shootWordmark(page, {
        width: cssH * dpr, height: cssW * dpr, ratio: 0.52,
        out: path.join(SPLASH_DIR, `splash-${cssW}x${cssH}@${dpr}x-landscape.png`),
      }));
    }
  }
} finally {
  await browser.close();
}

const total = written.reduce((sum, f) => sum + fs.statSync(f).size, 0);
console.log(`\nGenerated ${written.length} assets (${(total / 1024).toFixed(0)} KB total)`);
for (const f of written) {
  console.log(`  ${path.relative(ROOT, f).replace(/\\/g, '/').padEnd(52)} ${(fs.statSync(f).size / 1024).toFixed(1)} KB`);
}

// The <link rel="apple-touch-startup-image"> block for index.html — printed so
// index.html and this device table can never silently drift apart.
console.log('\n--- index.html apple-touch-startup-image block ---');
for (const [cssW, cssH, dpr, label] of IOS_DEVICES) {
  const q = (o) => `(device-width: ${cssW}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o})`;
  console.log(`  <link rel="apple-touch-startup-image" media="${q('portrait')}" href="/splash/splash-${cssW}x${cssH}@${dpr}x-portrait.png"><!-- ${label} -->`);
  if (cssW >= LANDSCAPE_MIN_WIDTH) {
    console.log(`  <link rel="apple-touch-startup-image" media="${q('landscape')}" href="/splash/splash-${cssW}x${cssH}@${dpr}x-landscape.png">`);
  }
}
console.log('');
