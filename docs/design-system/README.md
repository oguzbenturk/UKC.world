# Plannivo Design System (for akyaka.plannivo.com)

Design reference for bringing the **plannivo.com landing-page style** into the **akyaka.plannivo.com app**. Everything here is extracted from `plannivo.com/styles.css` on 2026-04-17.

## The feel

> Calm typography, muted palette, no dopamine hooks. Built to be glanced at between lessons — not stared at all day.
>
> — plannivo.com, section 03

Maritime editorial. Cream paper background, deep marine-ink text, muted seafoam and clay accents. Serif display (Fraunces), clean sans for UI (Instrument Sans), monospace for labels (JetBrains Mono).

**Three rules**, in priority order:
1. **Quieter than you think it should be.** Remove a color before adding one. Remove a shadow before blurring one harder.
2. **Typography carries the hierarchy.** Don't use color to mean "important" — use type size, weight, and the serif vs. sans switch.
3. **Monospace is a signal.** Labels, timestamps, coordinates, version strings, status text. Never body copy, never headings.

## What's in this folder

| File | What it covers |
|---|---|
| [tokens.css](tokens.css) | **Drop-in stylesheet.** All CSS variables (colors, fonts, spacing, shadows) + Fraunces variable-font axis presets. Copy to `src/styles/tokens.css`. |
| [01-foundations.md](01-foundations.md) | Palette, typography system, rhythm, motion. The "why" behind the tokens. |
| [02-components.md](02-components.md) | Buttons, kickers, chapter layout, feature lists, dashboard frame, calendar blocks, ticker, forms, pills. With HTML/CSS examples. |
| [03-migration-plan.md](03-migration-plan.md) | **Phased plan** to apply this to the akyaka React app. Lists the exact files, classes, and grep commands. |
| [assets/](assets/) | Logos, favicon SVGs, OG images (as we generate them). |

## How to use this folder

### If you're implementing the redesign (step-by-step)

1. Read [01-foundations.md](01-foundations.md) once — understand the palette + type system.
2. Skim [02-components.md](02-components.md) — note which patterns the app needs.
3. Follow [03-migration-plan.md](03-migration-plan.md) phase by phase. Commit per phase.

### If you're building one new page/component

1. Copy [tokens.css](tokens.css) → `src/styles/tokens.css` and import from `src/index.css` (one-time setup).
2. Use Tailwind classes that map to the tokens (e.g. `bg-bone`, `text-ink`, `border-line`) — the Tailwind config changes in [03-migration-plan.md § 1.5](03-migration-plan.md#15-rewrite-tailwindconfigjs) make these available.
3. For serif headings with variable-font tuning, reach for the `.fv-*` utility classes in [tokens.css](tokens.css) (e.g. `className="font-serif fv-h2"`).
4. When unsure, open [plannivo.com](https://plannivo.com) in a second tab and inspect the same pattern there.

### If you're reviewing someone else's redesign

Quick review checklist:
- [ ] No `font-duotone-*` or `font-gotham-*` classes left
- [ ] No `emerald-*`, `blue-500`, or saturated brand colors in chrome
- [ ] Headings are Fraunces; body is Instrument Sans; labels are JetBrains Mono
- [ ] Buttons are either `bg-ink text-bone` (primary) or underlined link (quiet) — no third variant
- [ ] Stat numbers use `font-feature-settings: "tnum" 1`
- [ ] Italic text inside headings is seafoam color
- [ ] Cards use `bg-paper` or `bg-paper-soft`, never `bg-white`
- [ ] Borders are `--line` or `--line-soft`, never pure gray

## Source

Everything here is reverse-engineered from **the live plannivo.com landing page** on 2026-04-17. If plannivo.com updates its style and we want to track, refresh by running:

```bash
curl -sL https://plannivo.com/styles.css > /tmp/plannivo-styles-latest.css
# diff against tokens.css and the reference snippets in 02-components.md
```

If plannivo.com redesigns and we don't want to follow, freeze this folder as "the Akyaka look" — the tokens aren't coupled to plannivo.com at runtime.

## Open questions / decisions to make later

These are deliberate gaps — design decisions the customer should weigh in on, not things we can just derive from the landing page.

1. **Dark mode?** The landing page is cream-only. If akyaka needs a dark variant for indoor evening use, we'd add an `--ink` background variant with `--bone` text. Not defined here.
2. **School-specific accent color.** The `--seafoam` is Plannivo's brand. A real customer (not demo Akyaka) might want their academy's accent color instead. Treat `--seafoam` as "slot 1, replaceable per tenant."
3. **Logo.** Plannivo uses a simple dot-in-circle. Akyaka's real customer logo goes here when we have it — for now, keep the same mark or swap with a placeholder in `assets/`.
4. **Destructive actions.** No red/orange tokens exist. Delete buttons and failure states need a color — propose `#8B4A3A` (muted terracotta-red) and formalize in a Phase 7.
5. **Data visualization beyond sparklines.** Plannivo uses one seafoam line. If akyaka needs bar charts or multi-series charts, we'll need a small restrained palette (seafoam, clay, sand) plus one more hue — to be designed.

## Not in scope here

- Animations beyond fade-in-on-reveal and pulsing dot — if the app needs chart tweening, modal transitions, etc., those are motion-design work, separate document.
- A11y audit — tokens preserve contrast ratios from plannivo.com (which look roughly WCAG AA for body text on bone), but every new component should be spot-checked with a contrast tool.
- Backend templates (invoices, PDFs, exports) — mention handled briefly in [03-migration-plan.md § 5.2](03-migration-plan.md#52-email-templates), but PDFs with Fraunces require separate font-embedding work.

---

## Next step when you're ready to execute

Start with [03-migration-plan.md § Phase 1](03-migration-plan.md#phase-1--foundations). It's the one that unlocks everything else — loading Fraunces + swapping tokens changes the entire app's baseline without touching any component code.
