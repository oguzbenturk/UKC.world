# Foundations

The design language is **maritime editorial** — early-morning-on-the-water palette, Old Style serif for display, clean sans for body, monospace for labels and coordinates. The literal self-description from the source site is: *"Calm typography, muted palette, no dopamine hooks. Built to be glanced at between lessons — not stared at all day."*

## Color palette

Named after natural references. All tokens live in [tokens.css](tokens.css).

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `--bone` | `#F0EADD` | Page background. The warm cream everywhere behind content. Also the "inverse ink" color (used for text on dark buttons). |
| `--paper` | `#F5F0E3` | Cards, ticker strip, subtle wells — one notch warmer than bone. |
| `--paper-soft` | `#F8F4EA` | Product/dashboard inner surface — the lightest warm tone. |
| `--sand` | `#E5DCC8` | Neutral warm accent. Good for muted calendar blocks. |

### Ink (text)

One deep marine-black with opacity steps — this is how you get quiet hierarchy without introducing new colors.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#141E28` | Primary text, logo mark, buttons. |
| `--ink-80` | `rgba(20,30,40,0.80)` | Secondary text, body copy. |
| `--ink-60` | `rgba(20,30,40,0.60)` | Tertiary text, nav links (default state), feature descriptions. |
| `--ink-40` | `rgba(20,30,40,0.42)` | Quiet labels, monospace meta, timestamps, `quiet` nav variant. |
| `--ink-20` | `rgba(20,30,40,0.20)` | Separators, button underlines, ticker dots. |
| `--ink-10` | `rgba(20,30,40,0.10)` | Inline code background, hairlines. |

### Lines

| Token | Hex | Use |
|---|---|---|
| `--line` | `#D8CEB6` | Warm horizon line. Table borders, section separators. |
| `--line-soft` | `#E3DAC4` | Softer dividers where `--line` would be too loud. |

### Accents (use sparingly)

| Token | Hex | Use |
|---|---|---|
| `--seafoam` | `#557872` | **Primary accent.** Italic serif emphasis (`<em>` in display text), logo dot, primary-button hover, link-button hover. |
| `--seafoam-soft` | `#A7BAB4` | Halo around the logo dot, soft pills. |
| `--clay` | `#B9876D` | Warm terracotta accent. Dashboard brand dot ("UKC." orange circle in screenshot). |
| `--clay-soft` | `#E6D1BF` | Calendar blocks (warm side), soft pill. |

### Background texture

The body has subtle **radial gradients** layered over the cream to give it warmth, plus an SVG noise filter for paper grain:

```css
body {
  background: var(--bone);
  background-image:
    radial-gradient(ellipse 1200px 500px at 50% -5%,  rgba(85, 120, 114, 0.06), transparent 65%),
    radial-gradient(ellipse 900px  400px at 100% 45%, rgba(185, 135, 109, 0.04), transparent 65%),
    radial-gradient(ellipse 900px  400px at 0%   85%, rgba(85, 120, 114, 0.03), transparent 65%);
}
body::before {  /* paper grain */
  content: ""; position: fixed; inset: 0;
  pointer-events: none; opacity: 0.5; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg ...fractalNoise...></svg>");
}
```

Copy this from `plannivo.com/styles.css` verbatim — it's what makes the cream feel like a printed page instead of a flat fill.

---

## Typography

Three families, loaded from Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,0..100;1,9..144,300..700,0..100&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500&display=swap">
```

### Fraunces — display, serif

Variable font with an `opsz` (optical size, 9–144) and a custom `SOFT` axis (0–100, softness of letterforms). The SOFT axis is what gives the italic its distinctive rounded feel.

**Presets (defined as utility classes in [tokens.css](tokens.css)):**

| Class | `opsz` | `SOFT` | `wght` | Use |
|---|---|---|---|---|
| `.fv-display` | 144 | 50 | 400 | h1 — "The operating surface for modern water schools." |
| `.fv-display-em` | 144 | 80 | 380 | italic emphasis within h1 (sage-green) |
| `.fv-display-bold` | 144 | 30 | 460 | the one word that gets extra presence (e.g. "surface") |
| `.fv-h2` | 96 | 40 | 400 | section headings |
| `.fv-h2-em` | 96 | 80 | 380 | italic emphasis within h2 |
| `.fv-h3` | 30 | 20 | 500 | feature / card titles |
| `.fv-lede` | 18 | 0 | 370 | hero subtitle (serif at body size) |
| `.fv-mark-large` | 9 | 0 | 460 | logo wordmark, brand name |
| `.fv-tick` | 60 | 20 | 420 | large tabular number (ticker) |

**Rule of thumb:** headings always use Fraunces. Italics inside headings swap to `SOFT=80` and color `--seafoam`.

### Instrument Sans — body, UI

Standard sans for nav, buttons, body copy, form inputs. Weights 400–700, italic available.

- Base `body` size: `17px`, line-height `1.55`.
- Buttons: `0.93rem`, weight 500.
- Nav links: `0.92rem`, color `--ink-60`.
- Feature descriptions: `0.94rem`, line-height `1.55`, color `--ink-60`.
- `font-feature-settings: "ss01", "ss02"` enabled on body for stylistic sets.

### JetBrains Mono — labels, meta

Used for:
- **Kickers** (e.g. `01  PLATFORM FOR WATERSPORTS ACADEMIES`) — `0.72rem`, uppercase, letter-spacing `0.12em`.
- **Numbered badges** inside kickers — `0.62rem`, weight 500, `--ink` background, `--bone` text, `3px` radius.
- **Meta labels** — "LIVE FROM THE BEACH", "N 38°22′ · Urla", "06:41 — sunrise", "APRIL REVENUE", version strings.
- **Inline code tags** — `.mono-inline` class with `--ink-10` background.

**Rule of thumb:** anything that should feel like a map coordinate, a typewritten note, or a log entry = mono.

### Type scale summary

Fluid via `clamp()` so everything breathes from mobile to desktop:

| Role | Min | Preferred | Max |
|---|---|---|---|
| display | `2.4rem` | `7vw` | `5.6rem` |
| h2 | `1.9rem` | `4vw` | `3.2rem` |
| lede | `1.05rem` | `1.4vw` | `1.3rem` |
| body | `1rem` | — | — |

---

## Rhythm & spacing

| Token | Value | Use |
|---|---|---|
| `--page-pad` | `clamp(1.25rem, 4vw, 4rem)` | Left/right page padding |
| `--chapter-gap` | `clamp(4rem, 10vh, 8rem)` | Vertical space between major sections |
| `--max` | `1400px` | Max content width |

**Section rhythm pattern:** every major section is a "chapter" with a two-column grid:

```
[ 200px sidekicker ][  820px chapter body  ]

 01                  h2 with italic accent
 LABEL               body copy (max 60ch)
                     → grid of features / product frame / form
```

The sidekicker is sticky (`position: sticky; top: 2rem;`) so the section number floats with you as you scroll.

Breakpoint for collapsing to single column: `max-width: 900px`.

---

## Motion

Three patterns only — restraint is the point.

1. **`.reveal`** — fades in + translates up 8px on scroll. Offset per element via `style="--d:120ms"`.
2. **Horizon line draw** — 2.4s `stroke-dashoffset` animation on hero SVG.
3. **Ticker count-up** — JS counts `[data-count]` to the target number on reveal.

Transitions for hover: `0.25s ease` on `background`, `color`, `transform`. No bounce, no spring, no flashy easing.

---

## What this is NOT

- **Not high contrast.** The palette intentionally sits in a narrow band. Don't introduce pure white, pure black, or saturated primaries.
- **Not a dashboard-y style.** No gradient cards, no neon status chips, no drop-shadow cards floating at 12px blur. Shadows are `-40px` offset with tiny spread, used once (on the product frame).
- **Not sans-serif display.** Headings are always Fraunces. Don't substitute Inter/Sora/etc. at large sizes.
- **Not dark-mode first.** The palette reads dark-on-cream. A dark variant exists conceptually (ink background, bone text) but isn't defined here yet — add it as a follow-up if needed.
