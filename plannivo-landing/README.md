# Plannivo Landing Page

Static marketing site for `plannivo.com` — represents Plannivo the product, not any specific customer.

## Files

- `index.html` — single-page HTML, no build step
- `styles.css` — all styles, CSS custom properties for tokens
- `script.js` — IntersectionObserver reveals + count-up animations + form

## Local preview

Open `index.html` directly in a browser, or use any static server:

```sh
npx serve .
# → http://localhost:3000
```

## Deploy

Upload the three files to any static host (Netlify, Vercel, S3, nginx). Point `plannivo.com` DNS to the host.

Nginx snippet if self-hosting alongside the app:

```nginx
server {
  listen 80;
  server_name plannivo.com www.plannivo.com;
  root /var/www/plannivo-landing;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

## Product video

The dashboard mock's calendar was removed — a film of the real app goes in its place. When the video is ready: drop `tour.mp4` next to `index.html`, then in `index.html` replace the `.tour-placeholder` div inside `.prod-video` with:

```html
<video class="tour-video" src="tour.mp4" muted loop playsinline autoplay preload="metadata"></video>
```

(The `.tour-video` CSS — absolute fill, object-fit cover — is already in place. Keep the video muted+playsinline or mobile browsers will refuse to autoplay.)

## Demo form

There is no backend yet. On submit, the form opens the visitor's mail client with a pre-filled message to `hello@plannivo.com` (subject + academy + contact), then shows a success note. To wire a real backend, replace the `mailto:` block in `script.js` with a `fetch()` to your endpoint.

## Design tokens (key)

"Sea-glass" theme — water-clear premium SaaS: white + barely-there aqua, petrol ink, one turquoise→azure gradient spent only on killer words, buttons and thin rules.

| Token | Value | Use |
|---|---|---|
| `--white` | `#FFFFFF` | Page background |
| `--aqua` / `--aqua-2` | `#F7FCFC` / `#EFF9FA` | Barely-there aqua tints |
| `--ink` | `#0B2437` | Deep marine navy text; also solid CTA background |
| `--turq` → `--azure` | `#0E9488` → `#1E6FD6` | The gradient (`--grad`) — killer words and thin rules ONLY (buttons are solid ink) |
| `--glass` | `rgba(255,255,255,0.72)` | Frosted glass cards (backdrop blur) |

Signature devices: underwater caustic light veil (`#fCaustics` feTurbulence SVG filter, SMIL shimmer) behind hero/promise/closer; floating glass instrument chips (wind/gusts/water) in the hero; bento feature grid; product frame with pointer-tracked 3D tilt.

Fonts loaded from Google Fonts: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (data labels).

## Variants

`variants/` holds the four candidate art directions from the 2026-07-04 redesign round (seaglass = promoted to main, horizon, regatta, goldenhour). **Do not upload `variants/` to production** — deploy only `index.html`, `styles.css`, `script.js` (plus `.well-known/`).

## Honesty rule (do not break)

Copy is deliberately truthful: founded 2025, ONE live customer (Duotone Pro Center Urla → ukc.plannivo.com), Iyzico is the only live payment provider. The page turns this into the pitch ("One customer. On purpose." / "Be the second.") — never add fake logos, customer counts, or revenue stats.
