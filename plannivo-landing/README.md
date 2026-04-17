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

The form currently simulates a 900 ms async delay and shows a success message. To wire a real backend, replace the `await new Promise(...)` block in `script.js` with a `fetch()` to your endpoint.

## Design tokens (key)

| Token | Value | Use |
|---|---|---|
| `--bone` | `#F0EADD` | Page background |
| `--ink` | `#141E28` | Primary text |
| `--seafoam` | `#557872` | Brand accent, CTAs |
| `--clay` | `#B9876D` | Warm highlight |
| `--line` | `#D8CEB6` | Borders, dividers |

Fonts loaded from Google Fonts: Fraunces (variable), Instrument Sans, JetBrains Mono.
