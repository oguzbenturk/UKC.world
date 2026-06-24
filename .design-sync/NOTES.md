# design-sync notes

## 2026-06-24 — first sync (tokens-only brand foundation)

**This repo is an application, not a design system.** Decided with the user (who said
"I will design new web pages etc"): rather than force the package-shape converter onto an
app whose components won't render in isolation, we sync a **brand foundation** so the
Claude Design agent designs new pages on-brand.

What shipped to project `UKC · Plannivo Brand`:
- `tokens/` — colors, typography, radius/shadow/gradient tokens (JSON + CSS vars), all
  extracted from real code (no invented values).
- `fonts/` — Duotone (brand display) + Gotham-TR (fallback, Turkish coverage) woff2.
- `styles.css` — @font-face + @imports tokens; the look every design inherits.
- `guidelines/plannivo-design-language.md` — teaches the agent the idiom: Ant Design v5
  ConfigProvider tokens + Tailwind utilities, light white/sky/slate palette ONLY.
- `README.md`.

**Deliberately NOT shipped:** `_ds_bundle.js`, `components/`, `_ds_sync.json`. There is no
isolable compiled component library here, so there is nothing to bundle or render-verify.
Next sync has no anchor → it re-derives everything (correct, by design).

**Brand truth captured (keep in sync if the app's theme changes):**
- Antd theme (src/main.jsx): colorPrimary/colorInfo `#3B82F6`, colorSuccess `#10B981`,
  colorWarning `#F59E0B`; Button active `#2563EB`.
- Tailwind brand colors (tailwind.config.js): `antrasit #4B4F54`, `duotone-blue #00A8C4`.
- :root (src/index.css): `--brand-primary #3B82F6`, `--brand-success #10B981`,
  `--brand-warning #F59E0B`.
- Signature primary gradient: `linear-gradient(135deg, #2563EB ~0.92, #38BDF8 ~0.88)`.
- Form-builder secondary accent: teal `#0077B6 / #0096C7 / #48CAE4`.
- Radii: pill `9999px` (FABs/buttons), `12px` inputs, `10px` small, `14px`/`20px` cards.
- Card shadow: `0 4px 24px rgba(0,0,0,0.08)`.
- Owner rule (memory): **light themes only** — white/sky/slate, never dark.
