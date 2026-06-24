# UKC · Plannivo Brand

Brand foundation for **Plannivo** — the watersports-academy management platform
(live: Duotone Pro Center Urla, `ukc.plannivo.com`). Loaded into Claude Design so new
pages, screens and flows come out on-brand.

This is a **brand foundation**, not a component library: Plannivo is an application whose
UI is composed from Ant Design + Tailwind inline in app code, so there are no standalone
components to ship. Instead this project gives the design agent the brand's real tokens,
fonts and conventions.

## What's here

| Path | What it is |
|---|---|
| `guidelines/plannivo-design-language.md` | **Start here.** How to build a Plannivo-looking page: idiom, color, type, shape, do/don't, a working snippet. |
| `styles.css` | Global stylesheet every design inherits — imports tokens, declares the brand `@font-face`s, ships `.plannivo-card` + `.btn-floating-*` + `.plannivo-label`. |
| `tokens/tokens.css` | All design tokens as CSS variables (`--ds-*`, plus the app's real `--brand-*`). |
| `tokens/colors.json` · `typography.json` · `radius-shadow.json` | The same tokens as structured data, each annotated with where it comes from in the app. |
| `fonts/` | The real brand fonts — Duotone (display) + Gotham-TR (Turkish/accent fallback), woff2. |
| `logo.svg` | The Plannivo / DPS mark. |

## The look in one line

Light, airy, rounded, professional — white & slate surfaces, a blue→sky accent, soft
shadows. Built with **Ant Design v5 (themed via `ConfigProvider`) + Tailwind utilities**.
**Light themes only.**

## Provenance

Every value is extracted from the live app — `tailwind.config.js`, `src/main.jsx`
(Ant Design theme), `src/index.css` — nothing invented.
