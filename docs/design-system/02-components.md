# Components

Every pattern here is lifted from `plannivo.com/styles.css`. Assume [tokens.css](tokens.css) is loaded. React-ready patterns use Tailwind arbitrary values where helpful.

## Kicker (section label)

Numbered badge + uppercase monospace label. Appears above every section title.

```html
<p class="kicker"><span>01</span>&nbsp;&nbsp;Platform for watersports academies</p>
```

```css
.kicker {
  font-family: var(--mono);
  font-size: 0.72rem; font-weight: 400;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--ink-60);
  display: inline-flex; align-items: center; gap: 0.6em;
  margin: 0 0 2rem;
}
.kicker > span {
  padding: 3px 8px; border-radius: 3px;
  background: var(--ink); color: var(--bone);
  font-size: 0.62rem; letter-spacing: 0.08em; font-weight: 500;
}
```

**React:**
```jsx
<p className="kicker"><span>{number}</span>&nbsp;&nbsp;{label}</p>
```

---

## Buttons

Two variants. **That's it.** Primary is ink pill; quiet is underlined link.

### Primary (dark pill)

```html
<a href="#demo" class="btn btn-primary">
  Book a 20-min demo
  <svg width="16" height="16" ...><path .../></svg>
</a>
```

```css
.btn {
  display: inline-flex; align-items: center; gap: 0.55em;
  text-decoration: none; cursor: pointer;
  font-family: var(--sans); font-size: 0.93rem; font-weight: 500;
  letter-spacing: 0.005em;
  padding: 0.9em 1.55em;
  border: 1px solid transparent;
  border-radius: 999px;
  transition: all 0.25s ease;
}
.btn-primary {
  background: var(--ink);
  color: var(--bone);
}
.btn-primary:hover {
  background: var(--seafoam);
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -10px rgba(85, 120, 114, 0.5);
}
.btn-primary svg { transition: transform 0.25s ease; }
.btn-primary:hover svg { transform: translateX(3px); }
```

### Quiet (underlined link)

```css
.btn-quiet {
  background: transparent;
  color: var(--ink-80);
  padding: 0.9em 0.2em;
  border-bottom: 1px solid var(--ink-20);
  border-radius: 0;
}
.btn-quiet:hover {
  color: var(--seafoam);
  border-color: var(--seafoam);
}
```

**Do not** add a third button variant (outlined, ghost, danger-red, etc.). If you need destructive intent, use plain text with `color: #8B4A3A` inline — keep it rare.

---

## Display heading with italic accent

```html
<h1 class="display">
  The operating <span class="shift">surface</span><br>
  for <em>modern water schools.</em>
</h1>
```

```css
.display {
  font-family: var(--serif);
  font-variation-settings: "opsz" 144, "SOFT" 50, "wght" 400;
  font-size: clamp(2.4rem, 7vw, 5.6rem);
  line-height: 1.02; letter-spacing: -0.028em;
  color: var(--ink);
  margin: 0;
}
.display em {
  font-style: italic;
  font-variation-settings: "opsz" 144, "SOFT" 80, "wght" 380;
  color: var(--seafoam);
}
.display .shift {
  display: inline-block;
  font-variation-settings: "opsz" 144, "SOFT" 30, "wght" 460;
  letter-spacing: -0.035em;
}
```

`<em>` gets the sage color + softer italic. `.shift` bumps the optical weight on one word for visual rhythm. Use sparingly — one `.shift` per headline at most.

---

## Nav / masthead

```html
<header class="masthead">
  <a href="#" class="mark">
    <span class="mark-dot"></span>
    <span class="mark-word">Plannivo</span>
  </a>
  <nav class="nav">
    <a href="#platform">Platform</a>
    <a href="#product">Product</a>
    <a href="#customers">Customers</a>
    <a href="#pricing" class="quiet">Pricing</a>
    <a href="#demo" class="cta">Book a demo</a>
  </nav>
</header>
```

**Logo mark** = colored dot (`--seafoam`, with `--seafoam-soft` halo via `box-shadow: 0 0 0 4px`) + wordmark in Fraunces `opsz=9, wght=460`.

**Nav links** = `--ink-60`, hover → `--ink`. `.quiet` variant → `--ink-40`.

**CTA pill** = same as `.btn-primary` but smaller (`0.85rem`, padding `0.6em 1.15em`).

Mobile collapses: `@media (max-width: 760px)` — hide non-CTA links, shrink gap to `1.1rem`.

---

## Horizon rule (fading divider)

Not a plain `<hr>`. Fades into transparency at the edges.

```css
.horizon-rule {
  height: 1px;
  margin: 0 var(--page-pad);
  background: linear-gradient(to right,
    transparent,
    var(--line) 8%,
    var(--line) 92%,
    transparent);
}
```

Use between the masthead and hero, and between major chapters where a full `border-top` would be too loud.

---

## Chapter layout

The core layout primitive. Two-column grid with sticky sidekicker.

```html
<section class="chapter">
  <div class="chapter-grid">
    <aside class="chapter-meta">
      <p class="kicker"><span>02</span>&nbsp;&nbsp;A single surface</p>
    </aside>
    <div class="chapter-body">
      <h2 class="h2">Ten tools <em>collapsed</em><br>into one quiet interface.</h2>
      <p class="body-copy">Most water schools run on six spreadsheets...</p>
      <!-- content -->
    </div>
  </div>
</section>
```

```css
.chapter { padding: var(--chapter-gap) var(--page-pad); }
.chapter-grid {
  max-width: var(--max); margin: 0 auto;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 4rem; align-items: start;
}
.chapter-meta .kicker { margin: 0.5em 0 0; position: sticky; top: 2rem; }
.chapter-body { max-width: 820px; }
.chapter-body > * + * { margin-top: 1.75rem; }
@media (max-width: 900px) {
  .chapter-grid { grid-template-columns: 1fr; gap: 1rem; }
  .chapter-meta .kicker { position: static; }
}
```

This is how every non-hero section is composed. In React, build a `<Chapter number={02} label="A single surface">...</Chapter>` component.

---

## Feature list (2-column grid with numbered items)

```html
<ul class="feature-list">
  <li>
    <span class="feat-num">01</span>
    <div>
      <h3>Bookings &amp; calendar</h3>
      <p>Lessons, rentals, group matching, no-show windows — all on one canvas.</p>
    </div>
  </li>
  <!-- 02, 03, ... -->
</ul>
```

```css
.feature-list {
  list-style: none; padding: 0; margin: 3.5rem 0 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.feature-list li {
  display: grid;
  grid-template-columns: 3.5ch 1fr;
  gap: 1.25rem;
  padding: 2rem 1.5rem 2rem 0;
  border-top: 1px solid var(--line);
  transition: background 0.35s ease;
}
.feature-list li:nth-child(even) {
  padding-left: 2rem;
  border-left: 1px solid var(--line);
}
.feature-list li:hover {
  background: linear-gradient(to bottom, transparent, rgba(85, 120, 114, 0.04));
}
.feat-num {
  font-family: var(--mono);
  font-size: 0.7rem; letter-spacing: 0.1em;
  color: var(--ink-40);
  padding-top: 0.3em;
}
.feature-list h3 {
  font-family: var(--serif);
  font-variation-settings: "opsz" 30, "SOFT" 20, "wght" 500;
  font-size: 1.2rem; letter-spacing: -0.012em;
  color: var(--ink);
  margin: 0 0 0.45em;
}
.feature-list p {
  margin: 0;
  color: var(--ink-60); font-size: 0.94rem; line-height: 1.55;
}
```

Collapses to 1-col at `max-width: 700px`.

---

## Product/dashboard frame

The "screenshot inside a browser chrome" treatment used to preview the app.

```html
<div class="product-frame">
  <div class="product-top">
    <span class="product-dot"></span>
    <span class="product-dot"></span>
    <span class="product-dot"></span>
    <span class="product-url">akyaka.plannivo.com&nbsp;/&nbsp;dashboard</span>
  </div>
  <div class="product-body">
    <aside class="prod-side">...</aside>
    <main class="prod-main">...</main>
  </div>
</div>
```

```css
.product-frame {
  max-width: var(--max); margin: 4rem auto 0;
  background: var(--paper-soft);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 40px 80px -40px rgba(20, 30, 40, 0.14),
    0 15px 25px -20px rgba(20, 30, 40, 0.08);
}
.product-top {
  display: flex; align-items: center; gap: 0.5em;
  padding: 0.75rem 1rem;
  background: var(--bone);
  border-bottom: 1px solid var(--line);
}
.product-dot {
  width: 11px; height: 11px; border-radius: 50%;
  background: var(--line);
}
.product-dot:nth-child(2) { background: var(--clay-soft); }
.product-dot:nth-child(3) { background: var(--seafoam-soft); }
.product-url {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--ink-40);
  letter-spacing: 0.02em;
}
.product-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 540px;
}
```

For the **real akyaka app shell** (not a marketing mockup), skip the traffic-light dots and the URL bar — just keep the frame pattern: `--paper-soft` background, `--line` border, `14px` radius, the big `--shadow-frame`.

### Sidebar navigation inside the frame

```css
.prod-side {
  padding: 1.5rem 1.25rem;
  background: var(--paper);
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column;
}
.prod-side ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.1em; }
.prod-side li {
  padding: 0.55em 0.75em;
  color: var(--ink-60);
  border-radius: 6px;
  font-size: 0.88rem;
}
.prod-side li.is-active {
  background: var(--bone);
  color: var(--ink);
  font-weight: 500;
}
.prod-tick {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--seafoam);
}
```

Active item: warm bone background, `--ink` text, small seafoam dot. No icons on nav items — copy is the hierarchy.

---

## Calendar (lesson blocks)

The screenshot shows lesson blocks at `--seafoam-soft`, `--clay-soft`, and `--sand` backgrounds. Hour headers in mono.

```css
.prod-calendar {
  background: var(--bone);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 1.25rem 1rem;
}
.prod-cal-hours {
  display: grid;
  grid-template-columns: 100px repeat(9, 1fr);
  font-family: var(--mono); font-size: 0.66rem;
  color: var(--ink-40); letter-spacing: 0.08em;
  padding-bottom: 0.4rem;
  border-bottom: 1px dashed var(--line);
}
.prod-cal-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  align-items: center;
  height: 34px;
}
.prod-cal-name {
  font-family: var(--sans); font-weight: 500;
  font-size: 0.8rem; color: var(--ink-60);
}
.prod-lesson {
  position: absolute; top: 3px; bottom: 3px;
  padding: 0 0.8em;
  border-radius: 5px;
  border: 1px solid rgba(20, 30, 40, 0.05);
  font-size: 0.73rem; color: var(--ink);
  display: flex; align-items: center;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.prod-lesson:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px -8px rgba(20, 30, 40, 0.2);
}
.prod-lesson.a { background: var(--seafoam-soft); }
.prod-lesson.b { background: var(--clay-soft);   color: #6B4A37; }
.prod-lesson.c { background: var(--sand);        color: #5C4A2A; }
```

**Mapping to booking types** is up to us — suggestion:
- `.a` seafoam → lessons
- `.b` clay → rentals / equipment
- `.c` sand → camps / group sessions

Keep it to 3 colors. If more categories are needed, vary opacity or add a mono label, don't introduce new hues.

---

## Revenue / stat row with sparkline

```css
.prod-revenue {
  border-top: 1px solid var(--line);
  padding-top: 1.5rem;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2.5rem;
  align-items: center;
}
.prod-revenue h5 {                                    /* big number */
  font-family: var(--serif);
  font-variation-settings: "opsz" 72, "SOFT" 20, "wght" 380;
  font-size: 2.3rem; letter-spacing: -0.022em;
  margin: 0.2em 0 0;
}
.prod-delta {                                          /* "↗ 14% vs April 2025" */
  font-family: var(--mono); font-size: 0.78rem;
  color: var(--seafoam); letter-spacing: 0.04em;
  margin: 0.2em 0 0;
}
.prod-spark { width: 100%; height: 80px; }
.prod-spark .spark-line { fill: none; stroke: var(--seafoam); stroke-width: 1.5; }
.prod-spark .spark-area { fill: var(--seafoam); opacity: 0.1; }
.prod-spark .spark-dot  { fill: var(--seafoam); }
```

All chart accents use `--seafoam`. **Don't** switch to red/green for +/- deltas — keep seafoam for positive, muted `--ink-60` for neutral, and a single restrained warm tone (`#8B4A3A`) for negative in rare cases.

---

## Ticker (stat bar)

Horizontal strip of big numbers + labels. Good for a dashboard header or landing-page social proof.

```css
.ticker {
  padding: 2rem var(--page-pad);
  background: var(--paper);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.ticker-inner {
  max-width: var(--max); margin: 0 auto;
  display: flex; align-items: baseline;
  justify-content: space-evenly;
  flex-wrap: wrap; gap: 1rem 2rem;
}
.tick { display: inline-flex; align-items: baseline; gap: 0.7em; }
.tick-num {
  font-family: var(--serif);
  font-variation-settings: "opsz" 60, "SOFT" 20, "wght" 420;
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  color: var(--ink); letter-spacing: -0.015em;
  font-feature-settings: "tnum" 1;                  /* tabular digits */
}
.tick-label {
  font-family: var(--mono); font-size: 0.7rem;
  text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--ink-40);
}
.tick-sep {
  color: var(--ink-20);
  font-family: var(--serif); font-size: 1.4rem;
}
```

Always use `font-feature-settings: "tnum" 1` on numerical displays so digits align across rows.

---

## Form inputs

```css
label {
  font-family: var(--mono);
  font-size: 0.64rem;
  letter-spacing: 0.12em;
  color: var(--ink-40);
  text-transform: uppercase;
  display: block;
}
input[type="text"], input[type="email"], input[type="password"] {
  width: 100%; margin-top: 0.5em;
  padding: 0.95em 1.1em;
  background: var(--paper-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-family: var(--sans);
  font-size: 0.95rem;
  color: var(--ink);
}
input:focus {
  outline: none;
  border-color: var(--seafoam);
  box-shadow: 0 0 0 3px rgba(85, 120, 114, 0.15);
}
input::placeholder { color: var(--ink-40); }
```

Labels are mono uppercase above the field. Focus ring is a soft seafoam halo, not a default browser blue.

---

## Pills / badges

For status indicators inside the app (e.g. "active", "pending").

```css
.pill {
  display: inline-flex; align-items: center;
  padding: 0.25em 0.7em;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 0.68rem; letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pill-ink   { background: var(--ink);          color: var(--bone); }
.pill-soft  { background: var(--ink-10);       color: var(--ink-80); }
.pill-live  { background: var(--seafoam-soft); color: var(--ink); }
.pill-warm  { background: var(--clay-soft);    color: #6B4A37; }
```

Four variants. Don't exceed four.

---

## Live indicator (pulsing dot)

```css
.live-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--seafoam);
  box-shadow: 0 0 0 3px var(--seafoam-soft);
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.7); }
}
```

Use on "live" tiles, active WebSocket connections, or anywhere a subtle heartbeat is appropriate.

---

## What we're deliberately NOT providing

To keep the UI quiet, the following patterns are **intentionally omitted**:

- Modal dialogs with backdrop blur (use inline reveal instead)
- Toast notifications with color-coded backgrounds (use a mono-line message)
- Multi-color progress bars (use a single `--seafoam` line on `--ink-10` track)
- Gradient backgrounds (except the body's subtle radials)
- Avatars with saturated background colors (use `--sand` initials)
- Emoji status icons (use the dot system or mono text)

If a feature seems to need one of these, first ask "can this be said with typography and the existing palette?" — it usually can.
