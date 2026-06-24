# Plannivo — Design Language

Plannivo is a business-management platform for watersports / kite-surfing academies
(live customer: **Duotone Pro Center Urla**, `ukc.plannivo.com`). When you design a new
page, screen or flow, make it look like it belongs in this product. This doc tells you
exactly how — using the tokens, fonts and idioms in this project.

> **Source of truth:** read `styles.css` and `tokens/tokens.css` before you start.
> Every value below exists in those files. Use the tokens; don't hardcode hex.

---

## 1. The feel in one line

**Light, airy, rounded, professional.** White and slate surfaces, a confident blue→sky
accent, soft low-contrast shadows, generous rounding. It reads like a modern SaaS admin —
calm, legible, never heavy. **Never a dark theme.** (Owner rule: white / sky / slate only.)

---

## 2. Tech idiom — how pages are actually built

The app is **React + Ant Design v5 + TailwindCSS** (with MUI & Headless UI in places).
When you build a Plannivo page:

- **Controls come from Ant Design v5** — `Button`, `Input`, `Select`, `DatePicker`,
  `Table`, `Modal`, `Drawer`, `Tabs`, `Card`, `Tag`, `Steps`, `Form`. Don't reinvent form
  controls; use AntD and theme it.
- **Layout, spacing and color come from Tailwind utility classes** — `flex`, `grid`,
  `gap-*`, `p-*`, `rounded-2xl`, `shadow-*`, `bg-white`, `text-slate-*`, etc.
- **Wrap AntD in a `ConfigProvider`** carrying the theme tokens below, so AntD controls
  match the brand. This is the one setup step that makes everything look right.

```jsx
import { ConfigProvider, Button } from 'antd';

const theme = {
  token: {
    colorPrimary: '#3B82F6',   // --ds-primary
    colorInfo:    '#3B82F6',
    colorSuccess: '#10B981',   // --ds-success
    colorWarning: '#F59E0B',   // --ds-warning
    borderRadius: 10,
  },
  components: {
    Button: { colorPrimaryActive: '#2563EB' }, // no blue-shift on hover; darken on press
  },
};

export default function Page() {
  return (
    <ConfigProvider theme={theme}>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <h1 className="font-duotone-bold-extended text-2xl text-slate-800">Page title</h1>
          <p className="mt-2 text-slate-600">Body copy in the system sans.</p>
          <Button type="primary" className="mt-4">Primary action</Button>
        </div>
      </div>
    </ConfigProvider>
  );
}
```

---

## 3. Color — use the tokens

| Role | Token (CSS var) | Hex | Tailwind-ish |
|---|---|---|---|
| Primary action / brand | `--ds-primary` / `--brand-primary` | `#3B82F6` | `blue-500` |
| Primary pressed / gradient start | `--ds-primary-active` | `#2563EB` | `blue-600` |
| Accent (gradient end) | `--ds-sky` | `#38BDF8` | `sky-400` |
| Kite-brand cyan | `--ds-cyan` | `#00A8C4` | — |
| Brand charcoal (headings/labels) | `--ds-antrasit` | `#4B4F54` | `slate-600`-ish |
| Success | `--ds-success` | `#10B981` | `emerald-500` |
| Warning | `--ds-warning` | `#F59E0B` | `amber-500` |
| Danger | `--ds-danger` | `#F43F5E` | `rose-500` |
| Text — strong | `--ds-ink` | `#1F2937` | `slate-800` |
| Text — body | `--ds-body` | `#475569` | `slate-600` |
| Text — muted | `--ds-muted` | `#94A3B8` | `slate-400` |
| Border / divider | `--ds-border` | `#E2E8F0` | `slate-200` |
| Panel bg | `--ds-surface-2` | `#F1F5F9` | `slate-100` |
| Canvas bg | `--ds-surface-1` | `#F8FAFC` | `slate-50` |
| Card bg | `--ds-white` | `#FFFFFF` | `white` |

**Signature gradient** (`--ds-gradient-primary`): `linear-gradient(135deg, #2563EB, #38BDF8)`
— use on hero accents and important CTAs. A secondary **teal** palette
(`--ds-teal #0077B6 → --ds-teal-bright #0096C7`) appears on public form / lead-capture
pages; use it only there, otherwise default to the blue.

Rule: **one primary action per view.** Everything else is secondary (white) or ghost.

---

## 4. Type

- **Headings / brand text → Duotone** via the utility classes (`styles.css`):
  `font-duotone-bold-extended` (hero), `font-duotone-bold` (sections/cards),
  `font-duotone-light-condensed` (tall stats/subheads).
- **Body / UI text → system sans** (AntD default). **Do not** force Duotone onto long
  paragraphs — the Duotone files ship Basic Latin only; Turkish (ğ ı ş İ) and accents
  fall back to Gotham automatically, which is intended for short brand strings, not body.
- **Micro-labels** are uppercase, letter-spaced `0.1em`, 11px, charcoal — use
  `.plannivo-label` (form field labels, eyebrow text).

---

## 5. Shape, elevation, motion

- **Radius:** cards/modals `rounded-2xl` (20px, `--ds-radius-card`); inputs 12px;
  small controls/rows 10px; pills/FABs fully round (`--ds-radius-pill`).
- **Shadow:** default card = `--ds-shadow-card` (`0 4px 24px rgba(0,0,0,.08)`) — soft,
  low contrast. Popovers/menus = `--ds-shadow-pop`. Keep elevation gentle; this is a
  light UI, not a neumorphic one (the heavy offset shadow is reserved for floating
  buttons via `.btn-floating-*`).
- **Motion:** buttons *lift*, never flash — scale `1.02` on hover, `0.95` on press
  (150ms ease); floating buttons `translateY(-2px)` on hover.

---

## 6. Ready-made pieces in `styles.css`

- `.plannivo-card` — white, slate-200 border, 20px radius, soft shadow. The default
  container.
- `.btn-floating` + `.btn-floating-primary` / `-secondary` / `-danger` — the app's pill
  FAB / floating action buttons with the signature offset shadow and brand gradients.
- `.plannivo-label` — the uppercase micro-label.

---

## 7. Do / Don't

**Do**
- Start from a `bg-slate-50` canvas; lay white `.plannivo-card`s on it.
- Use AntD controls inside a `ConfigProvider` with the tokens above.
- Keep one clear primary (blue) action per screen; use the gradient for emphasis.
- Use Duotone for headings, system sans for body.

**Don't**
- No dark theme, no black backgrounds, no neon.
- Don't hardcode hex when a token/Tailwind class exists.
- Don't set Duotone as a global/body font.
- Don't add a second competing accent — blue is the brand; teal is form-pages only.
