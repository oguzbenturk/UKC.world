# Migration Plan — bring Plannivo landing-page style to akyaka.plannivo.com

**Goal:** make the akyaka app visually match the plannivo.com landing page (cream palette, Fraunces/Instrument Sans/JetBrains Mono, seafoam accents, monospace labels), without rewriting feature logic.

**Strategy:** bottom-up. Swap foundations (fonts, tokens, Tailwind config) first so the rest of the app automatically inherits the new look through global CSS vars. Then walk the chrome (navbar, sidebar). Then polish feature pages.

**Scope:** Akyaka branch only. Do not touch Plannivo's (`main`) branding in this work — that's a separate product decision.

---

## Phase 0 — Safety (1 commit)

Before any visual change lands, make the new design opt-in behind a flag so you can toggle back if something breaks during the demo.

1. Add a feature flag in [src/config](../../src/config) or [backend/.env.akyaka.production](../../backend/.env.akyaka.production): `VITE_AKYAKA_THEME=plannivo` (default off).
2. In [src/App.jsx](../../src/App.jsx), conditionally apply a `data-theme="plannivo"` attribute on `<html>` or the root div when the flag is on.
3. Wrap the new token values inside a `[data-theme="plannivo"]` selector in the stylesheet so the OLD UI continues to work when the flag is off.

This is overkill if you're committing to the new look today — skip Phase 0 in that case and just do the swap in-place. Mentioning it here in case you want to A/B it with the customer.

---

## Phase 1 — Foundations

One commit. Replaces fonts and palette at the root so every class downstream picks up new values.

### 1.1 Load Google Fonts

**File:** [index.html](../../index.html)

In `<head>`, add (right after the existing meta tags, before `<link rel="icon">`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,0..100;1,9..144,300..700,0..100&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500&display=swap">
```

Also change:
- `<meta name="theme-color" content="#0A0A0A" />` → `<meta name="theme-color" content="#F0EADD" />`
- `<title>Plannivo</title>` → keep (already good)

### 1.2 Drop in the design tokens

Copy [docs/design-system/tokens.css](tokens.css) → [src/styles/tokens.css](../../src/styles/tokens.css) and import it at the very top of [src/index.css](../../src/index.css):

```css
/* src/index.css — top of file */
@import './styles/tokens.css';
@import './styles/product-images.css';  /* existing line, keep */
/* ...rest of file */
```

### 1.3 Remove Duotone/Gotham font loading

**File:** [src/index.css](../../src/index.css)

Lines 4–~75 define `@font-face` for Duotone Bold Extended, Duotone Bold, Duotone Regular, Duotone Light Condensed, Duotone Medium Condensed, Gotham, Gotham Bold, Gotham Medium, Gotham Light. **Delete the entire block.** The Google Fonts link from 1.1 replaces them.

### 1.4 Rewrite the body base styles

Also in [src/index.css](../../src/index.css), replace the root `body` / `html` rules with:

```css
html, body { margin: 0; padding: 0; }
html { scroll-behavior: smooth; }

body {
  background: var(--bone);
  background-image:
    radial-gradient(ellipse 1200px 500px at 50% -5%,  rgba(85, 120, 114, 0.06), transparent 65%),
    radial-gradient(ellipse 900px  400px at 100% 45%, rgba(185, 135, 109, 0.04), transparent 65%),
    radial-gradient(ellipse 900px  400px at 0%   85%, rgba(85, 120, 114, 0.03), transparent 65%);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.55;
  font-feature-settings: "ss01", "ss02";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  min-height: 100vh;
}

/* Subtle paper grain — copy from plannivo.com/styles.css body::before */
body::before { /* see 01-foundations.md */ }
```

### 1.5 Rewrite tailwind.config.js

**File:** [tailwind.config.js](../../tailwind.config.js)

Replace `theme.extend.fontFamily` and `theme.extend.colors` with the Plannivo tokens:

```js
theme: {
  extend: {
    fontFamily: {
      serif: ['Fraunces', 'Cormorant Garamond', 'Georgia', 'serif'],
      sans:  ['Instrument Sans', '-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
    },
    colors: {
      bone:         '#F0EADD',
      paper:        '#F5F0E3',
      'paper-soft': '#F8F4EA',
      ink:          '#141E28',
      'ink-80':     'rgba(20, 30, 40, 0.80)',
      'ink-60':     'rgba(20, 30, 40, 0.60)',
      'ink-40':     'rgba(20, 30, 40, 0.42)',
      'ink-20':     'rgba(20, 30, 40, 0.20)',
      'ink-10':     'rgba(20, 30, 40, 0.10)',
      line:         '#D8CEB6',
      'line-soft':  '#E3DAC4',
      seafoam:      '#557872',
      'seafoam-soft': '#A7BAB4',
      clay:         '#B9876D',
      'clay-soft':  '#E6D1BF',
      sand:         '#E5DCC8',
      // Keep these aliases during migration so existing classes still build:
      'brand-ink':    '#141E28',
      'brand-paper':  '#F0EADD',
      'brand-navy':   '#557872',       // temporary alias, review per-usage
      'brand-navy-soft': '#A7BAB4',
    },
  },
},
```

Keeping the `brand-*` aliases pointing at new values means `bg-brand-ink` etc. still works but adopts the new look automatically — delete the aliases in Phase 3 once all usages are replaced.

### 1.6 Verify

- `npm run dev` (if you have node_modules locally) or just inspect visually once deployed.
- Open the app. Text should now be in Instrument Sans against a cream background.
- Run DevTools → `getComputedStyle(document.body)` — `font-family` should include "Instrument Sans".

---

## Phase 2 — Chrome (navbar, sidebar, masthead)

One commit per file, kept small for reviewability.

### 2.1 Navbar

**File:** [src/shared/components/layout/Navbar.jsx](../../src/shared/components/layout/Navbar.jsx)

Current state: imports `UkcBrandWordmark` from [src/shared/components/ui/UkcBrandDot.jsx](../../src/shared/components/ui/UkcBrandDot.jsx). Uses `emerald-400` dot.

Changes:
1. Replace `<UkcBrandWordmark />` with the Plannivo-style mark:
   ```jsx
   <a href="/" className="inline-flex items-center gap-[0.55em] text-ink font-serif text-[1.35rem] no-underline" style={{ fontVariationSettings: '"opsz" 9, "SOFT" 0, "wght" 460' }}>
     <span className="inline-block w-[11px] h-[11px] rounded-full bg-seafoam" style={{ boxShadow: '0 0 0 4px #A7BAB4' }} />
     <span>Plannivo</span>
   </a>
   ```
2. Nav links: `text-ink-60 hover:text-ink`, gap-8, 0.92rem font size.
3. CTA button: `bg-ink text-bone hover:bg-seafoam rounded-full px-[1.15em] py-[0.6em] text-[0.85rem]`.
4. Remove the `emerald-400` class (was the UKC dot color).

### 2.2 Sidebar (if present)

**File:** [src/shared/components/layout/Sidebar.jsx](../../src/shared/components/layout/Sidebar.jsx) (and [sidebar.css](../../src/styles/sidebar.css))

1. Background: `bg-paper border-r border-line`.
2. Nav items: `text-ink-60` default, `text-ink bg-bone` when active.
3. Active indicator: small 5px seafoam dot (see `.prod-tick` in [02-components.md](02-components.md)).
4. No icons. Labels only.
5. Font: `font-sans text-[0.88rem]`.

### 2.3 UkcBrandDot.jsx

**File:** [src/shared/components/ui/UkcBrandDot.jsx](../../src/shared/components/ui/UkcBrandDot.jsx)

Option A (minimal): rename the file to `PlannivoBrandMark.jsx`, update the color from `emerald-400` to `seafoam`, rename `UkcBrandWordmark` export to `PlannivoBrandWordmark`.

Option B (recommended): delete the file entirely and inline the mark inside Navbar per 2.1. It's a 10-line JSX blob that doesn't deserve its own module.

Search for remaining imports:
```
grep -rn "UkcBrand\|UkcBrandWordmark\|UkcBrandDot" src/
```
Replace each with the inline version.

---

## Phase 3 — Class-level rebrand (global find & replace)

33 occurrences of `font-duotone*` / `font-gotham*` across the codebase. Most are safe 1:1 replacements.

### 3.1 Tailwind class substitutions

Run as a **global find-and-replace** (Cursor/VSCode does this well):

| Old class | New class |
|---|---|
| `font-duotone-bold-extended` | `font-serif` (with `style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "wght" 460' }}` if it was a hero headline) |
| `font-duotone-bold` | `font-serif font-semibold` |
| `font-duotone-regular` | `font-serif` |
| `font-duotone-light-condensed` | `font-serif font-light` |
| `font-duotone-medium-condensed` | `font-serif font-medium` |
| `font-gotham-bold` | `font-sans font-bold` |
| `font-gotham-medium` | `font-sans font-medium` |
| `font-gotham-light` | `font-sans font-light` |
| `font-gotham` | `font-sans` |
| `bg-brand-ink` | `bg-ink` |
| `text-brand-ink` | `text-ink` |
| `bg-brand-navy` | `bg-seafoam` (or `bg-ink`, case-by-case) |
| `bg-brand-paper` | `bg-bone` |
| `bg-black` (in UI chrome, not images) | `bg-ink` |
| `bg-white` (in cards) | `bg-paper` |
| `text-white` (on dark buttons) | `text-bone` |
| `border-gray-*` | `border-line` or `border-line-soft` |
| `text-gray-500` / `text-gray-600` | `text-ink-60` |
| `text-gray-400` | `text-ink-40` |

**Verify script** (no code changes — just counts):
```bash
grep -rE "font-duotone|font-gotham|brand-navy|brand-ink|brand-paper" src/ | wc -l
# should return 0 when done
```

### 3.2 Accent colors → seafoam

Current accent is `emerald-400` / various emerald shades. Replace with `seafoam` (our `#557872`):

| Old class | New class |
|---|---|
| `text-emerald-400` | `text-seafoam` |
| `bg-emerald-400` | `bg-seafoam` |
| `text-emerald-500` / `text-emerald-600` | `text-seafoam` |
| `bg-emerald-50` / `bg-emerald-100` | `bg-seafoam/10` |
| `ring-emerald-*` | `ring-seafoam/40` |

Keep navy/blue as seafoam only where it was signaling "brand accent." If it was signaling "info" (e.g. a link to help docs), keep it blue — we haven't defined an info color and adding one should be a conscious decision.

### 3.3 Remove the tailwind.config.js aliases

Once 3.1 and 3.2 are done and `grep -rE "brand-" src/` returns zero:

**File:** [tailwind.config.js](../../tailwind.config.js)

Delete the `'brand-ink'`, `'brand-paper'`, `'brand-navy'`, `'brand-navy-soft'`, `'duotone-blue'`, `'antrasit'` aliases. Tailwind config should only have the Plannivo palette.

---

## Phase 4 — Component polish (per-feature, iterative)

Walk the app with the design system in hand. One feature per commit.

High-impact pages, in priority order:

1. **Dashboard** ([src/features/dashboard/pages/](../../src/features/dashboard/pages/))
   - Landing page after login. First impression.
   - Apply chapter-grid layout, kickers, serif H2, mono stat labels.
   - The "Good morning, Oguz." greeting should be `.h2` style with italic sage accent.

2. **Login page** ([src/features/auth/](../../src/features/auth/))
   - Central form on cream background.
   - Serif headline ("Welcome back."), mono labels, input styling from [02-components.md](02-components.md).

3. **Bookings / calendar** ([src/features/bookings/](../../src/features/bookings/))
   - Lesson blocks → `.prod-lesson.a` / `.b` / `.c` (seafoam-soft / clay-soft / sand).
   - Hour headers in JetBrains Mono.
   - No colored badges for status — use dots + mono labels.

4. **Customers / students** ([src/features/customers/](../../src/features/customers/), [src/features/students/](../../src/features/students/))
   - List view with border-line dividers, no card shadows.
   - Avatar fallback: sand-colored circle with serif initials.

5. **Finance / reports** ([src/features/finances/](../../src/features/finances/))
   - Numbers in Fraunces `.fv-tick` or `.fv-display-bold` depending on size.
   - `font-feature-settings: "tnum" 1` on all currency/numerical columns.
   - Chart strokes: `--seafoam` only (use [02-components.md](02-components.md) revenue pattern).

6. **Settings** ([src/features/settings/](../../src/features/settings/))
   - Form inputs per [02-components.md](02-components.md).
   - Section headers in serif H2.
   - "Save" button = `.btn-primary`.

Each feature commit message: `akyaka(design): <feature> — apply Plannivo tokens`.

---

## Phase 5 — Assets & metadata

### 5.1 Favicon & app icons

**Files:** [public/logo.svg](../../public/logo.svg), [public/logo.png](../../public/logo.png), [public/og-image.png](../../public/og-image.png), [public/og-image.svg](../../public/og-image.svg)

Currently all show the DPC (Duotone Pro Center) logo. Replace with Plannivo-style mark:

```xml
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
  <circle cx='16' cy='16' r='6' fill='#557872'/>
  <circle cx='16' cy='16' r='12' fill='none' stroke='#557872' stroke-opacity='0.4'/>
</svg>
```

This is the exact favicon plannivo.com uses. Save as `public/favicon.svg` and update `index.html` `<link rel="icon">` to point at it.

For `og-image.png` (1200×630) — generate a new one with:
- Cream background (`#F0EADD`)
- "Plannivo" wordmark in Fraunces 120pt
- Seafoam dot to the left
- Mono subtitle at the bottom: `The operating surface for modern water schools`

Save it in [docs/design-system/assets/](assets/) first for review, then copy to `public/`.

### 5.2 Email templates

**Folder:** [backend/templates/emails/](../../backend/templates/emails/) (if it exists; check file structure)

Email templates currently sign off as Plannivo (good) but may have old colors. Update:
- Header bg: `#F0EADD`
- Button bg: `#141E28` with `#F0EADD` text, `999px` border-radius
- Body font: fall back to Georgia / system serif (web-safe) since Instrument Sans isn't safe in email clients
- Footer: mono feel with web-safe "Courier New, monospace"

### 5.3 Login screen branding

The login screen probably still shows UKC. artwork. Replace with:
- Plannivo wordmark (serif, mark-dot)
- Hero tagline: `One calm surface. Every lesson booked.`
- Cream background with the 3 radial gradients

---

## Phase 6 — Verification checklist

Before declaring done:

- [ ] `grep -rE "font-duotone|font-gotham" src/` returns 0 matches
- [ ] `grep -rn "UkcBrand" src/` returns 0 matches
- [ ] `grep -rn "Duotone" src/` returns 0 matches (outside DuotoneFonts/ — which can be deleted)
- [ ] `grep -rn "emerald-" src/` returns 0 matches (replaced by seafoam)
- [ ] `npm run dev` starts and the app loads on cream background
- [ ] Fraunces is loaded (check DevTools → Network → fonts.googleapis.com)
- [ ] Logging in with `sergenerenler@plannivo.com` / `sergenerenler` lands on a dashboard using the new style
- [ ] Browser tab favicon is the seafoam dot-in-circle
- [ ] Tab title says "Plannivo"
- [ ] OG preview (paste the URL in Slack/iMessage) shows the new og-image
- [ ] Print preview / high-zoom at 200% still looks calm (no overflow, no weird line-breaks)

---

## Delete list (end state, once migration is done)

Safe to remove after Phase 5:

- [DuotoneFonts/QualityFonts/](../../DuotoneFonts/QualityFonts/) — whole folder, ~5MB of WOFF2 files we no longer load
- [DuotoneFonts/Lesson pictures/](../../DuotoneFonts/Lesson%20pictures/) — marketing pictures, unless still used for product imagery
- [src/shared/components/ui/UkcBrandDot.jsx](../../src/shared/components/ui/UkcBrandDot.jsx) — if inlined per 2.3 Option B
- [src/features/services/components/DuotoneEquipmentShowcase.jsx](../../src/features/services/components/DuotoneEquipmentShowcase.jsx) — rebrand or remove; not Plannivo

Do this as the **last** commit in the migration so you have time to catch any lingering imports.

---

## Rollback

If anything goes wrong mid-migration, you can revert a Phase in isolation:

```bash
git revert <phase-N-commit-sha>
```

Because each Phase landed as its own commit (see convention above), the revert is clean. The app will return to whatever state the previous Phase left it in.

For an emergency full-revert of all design work while keeping business logic changes:

```bash
# on Akyaka branch
git revert <phase-1-commit>..<phase-5-commit>
git push origin Akyaka
npm run push-akyaka
```
