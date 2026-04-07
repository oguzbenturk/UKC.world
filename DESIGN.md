# Design System — Plannivo (UKC.world)

Reference for building new features with a consistent look and feel. All UI uses Tailwind CSS utility classes. Avoid Ant Design visual components (Table, Card, Tag, Button) in new code — use them only for complex widgets (Modal shell, DatePicker, Dropdown) where Tailwind alone is impractical.

---

## Colors

### Backgrounds
| Usage | Class |
|---|---|
| Page background | `bg-slate-50` or inherited from layout |
| Card / panel | `bg-white` |
| Alternating table row | `bg-slate-50/40` |
| Skeleton placeholder | `bg-slate-200` |
| Empty state icon bg | `bg-sky-50` |

### Text
| Usage | Class |
|---|---|
| Primary heading | `text-slate-900` |
| Body text | `text-slate-700` or `text-slate-800` |
| Secondary / label | `text-slate-500` |
| Muted / hint | `text-slate-400` |
| Link / action | `text-sky-600` or `text-sky-700` |

### Status badges
Each status gets a bordered pill: `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium`

| Status | Classes |
|---|---|
| Success / completed | `bg-emerald-50 text-emerald-700 border-emerald-200` |
| Info / processing | `bg-sky-50 text-sky-700 border-sky-200` |
| Warning / pending | `bg-amber-50 text-amber-700 border-amber-200` |
| Error / failed | `bg-rose-50 text-rose-700 border-rose-200` |
| Neutral / default | `bg-slate-100 text-slate-600 border-slate-200` |
| Special / refunded | `bg-violet-50 text-violet-700 border-violet-200` |

### Category type badges (recommendations, services)
| Type | Classes |
|---|---|
| Product | `bg-sky-50 text-sky-700 border-sky-200` |
| Lesson / service | `bg-emerald-50 text-emerald-700 border-emerald-200` |
| Rental | `bg-amber-50 text-amber-700 border-amber-200` |
| Accommodation | `bg-violet-50 text-violet-700 border-violet-200` |
| Custom / other | `bg-slate-100 text-slate-600 border-slate-200` |

---

## Components

### Cards
```
rounded-2xl border border-slate-200 bg-white shadow-sm
```
- Use `overflow-hidden` when the card has a header with a border-bottom
- Header: `px-6 py-4 border-b border-slate-100`
- Header title: `text-sm font-semibold text-slate-900 uppercase tracking-wide`
- Body: `px-6 py-4`

### Stat cards
```html
<div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Label</p>
  <p class="mt-2 text-xl font-bold text-slate-900">Value</p>
  <p class="mt-1 text-xs text-slate-400">Hint</p>
</div>
```
Place in a grid: `grid grid-cols-2 md:grid-cols-4 gap-4`

### Buttons
**Primary:**
```
px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium shadow-sm hover:bg-sky-500 transition-colors
```

**Secondary:**
```
px-5 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors
```

**Danger:**
```
px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors
```

**Text / link:**
```
text-xs font-medium text-sky-600 hover:text-sky-800 transition-colors
```

### Tables
Use plain HTML `<table>` with Tailwind — no Ant Design Table.
```
Container:  rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden
Wrapper:    overflow-x-auto
Table:      min-w-full text-sm
Thead row:  border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500
Th:         text-left px-5 py-3 font-semibold
Tbody row:  border-b border-slate-100 last:border-b-0
            Alternating: idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
Td:         px-5 py-3.5
```

### Form fields
```
w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800
focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400
```
Labels: `text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5`

### Pagination
Simple previous/next with page indicator:
```html
<div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
  <button class="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
  <span class="text-xs text-slate-500">Page X of Y</span>
  <button ...>Next</button>
</div>
```

### Modals
Use Ant Design `Modal` as a container shell only. Style all content with Tailwind inside a `bg-white` wrapper. No gradient heroes, no heavy shadows.
- Header: same card header pattern (`px-6 pt-5 pb-4 border-b border-slate-100`)
- Sections separated by `border-b border-slate-100`
- Close: text button "Close" in the header, not an icon

### Empty states
```html
<div class="py-8 text-center">
  <p class="text-sm text-slate-500">No items yet</p>
  <p class="text-xs text-slate-400 mt-1">Description of what will appear here</p>
</div>
```

### Loading skeletons
```
animate-pulse
```
Use `rounded-2xl bg-slate-200` divs mimicking the layout structure (stat cards grid, content blocks).

---

## Typography

| Element | Classes |
|---|---|
| Page title (h1) | `text-3xl font-semibold tracking-tight text-slate-900` |
| Section title | `text-sm font-semibold text-slate-900 uppercase tracking-wide` |
| Card label | `text-xs font-semibold uppercase tracking-wide text-slate-500` |
| Body text | `text-sm text-slate-700` |
| Small label / hint | `text-xs text-slate-400` |
| Table header | `text-xs uppercase tracking-wide text-slate-500 font-semibold` |
| Stat value | `text-xl font-bold text-slate-900` |

Font families: `font-duotone-regular` for body, `font-duotone-bold-extended` for hero headings and large stat values.

---

## Spacing

- Page padding: `p-4 md:p-6` or `p-4 md:p-8`
- Content max width: `max-w-6xl mx-auto` (or `max-w-7xl` for student portal)
- Section gap: `space-y-5` or `space-y-6`
- Card internal padding: `p-5` or `px-6 py-4`
- Grid gaps: `gap-3` to `gap-4`

---

## Rounding

| Element | Radius |
|---|---|
| Cards, panels | `rounded-2xl` |
| Buttons | `rounded-xl` |
| Badges / pills | `rounded-full` |
| Form inputs | `rounded-lg` |
| Small buttons | `rounded-lg` |
| Images / thumbnails | `rounded-xl` |
| Progress bars | `rounded-full` |

---

## Shadows

Keep shadows minimal:
- Cards: `shadow-sm` only
- Buttons: `shadow-sm` only
- No heavy box-shadows, no `shadow-xl` on content cards
- No gradient backgrounds for hero sections — use flat `bg-white` cards

---

## Do / Don't

**Do:**
- Use Tailwind utility classes for all visual styling
- Use the slate color palette for neutrals
- Use bordered pill badges for statuses
- Keep layouts clean with white cards on a light background
- Use `text-sm` as the default body size
- Use `uppercase tracking-wide` for labels and section headers

**Don't:**
- Use Ant Design visual components (Table, Card, Tag, Button) for new features
- Use gradient backgrounds or glassmorphism effects
- Use heavy shadows (`shadow-xl`, `shadow-2xl`)
- Use emoji as icons in UI
- Use icon libraries (Ant Design Icons, Heroicons) unless absolutely necessary
- Use colored/dark hero banners — keep everything on white
- Mix gray shades — stick to `slate-*` throughout
