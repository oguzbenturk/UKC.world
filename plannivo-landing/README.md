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

## Demo form

There is no backend yet. On submit, the form opens the visitor's mail client with a pre-filled message to `hello@plannivo.com` (subject + academy + contact), then shows a success note. To wire a real backend, replace the `mailto:` block in `script.js` with a `fetch()` to your endpoint.

## Design tokens (key)

"Gale warning" theme — daylight sport poster: white/sky/sea-slate with one loud accent.

| Token | Value | Use |
|---|---|---|
| `--white` | `#FFFFFF` | Page background |
| `--foam` | `#F1F7FC` | Tinted sections, cards |
| `--sky` | `#CFE9FB` | Light sky fills, washes |
| `--ink` | `#0A2337` | Primary text, marquee band |
| `--signal` | `#FF4D12` | Kite-canopy orange — CTAs & killer words only |
| `--surf` | `#0C7BD6` | Links, wind streamlines |
| `--line` | `#D9E5EE` | Borders, dividers |

Signature devices: `--punch` (hard 6px poster shadow), `--cut` (speed-cut clip-path on buttons/tags), animated wind-streamline SVG in hero/closer, ink marquee band.

Fonts loaded from Google Fonts: Archivo (variable, width axis 62–125), JetBrains Mono.

## Honesty rule (do not break)

Copy is deliberately truthful: founded 2025, ONE live customer (Duotone Pro Center Urla → ukc.plannivo.com), Iyzico is the only live payment provider. The page turns this into the pitch ("One customer. On purpose." / "Be the second.") — never add fake logos, customer counts, or revenue stats.
