# UKC Live Wind — widget kit for ukc.plannivo.com

Everything needed to put UKC's live wind on the new site. Copy this whole folder
into the plannivo workspace.

## Contents
| File | What it is |
|---|---|
| `LiveWindBadge.tsx` + `LiveWindBadge.css` | **Exact 1:1 port** of the old urlakite.com "LIVE … kts" nav badge |
| `LiveWind.tsx` | Alternative **modern card** (cyan→blue/slate, matches plannivo design) |
| `images/` | The 6 `wglogo*.png` images the badge needs (don't regenerate) |
| `ukc-live-wind-widget-SPEC.md` | Full precision spec + checklist for the exact badge |
| `ukc-windguru-export.md` | Station/data reference (IDs, endpoint, fields, other spots) |

## Quick start (exact old badge)
1. Copy `images/*.png` → `public/images/main/` in the plannivo app
   (or change the 7 `url(...)` paths in `LiveWindBadge.css`).
2. Copy `LiveWindBadge.tsx` + `LiveWindBadge.css` → `src/components/`.
3. Render it: `import LiveWindBadge from "@/components/LiveWindBadge";` → `<LiveWindBadge />`.
4. Ensure **Font Awesome 4** is loaded (for the blinking dot) — or replace the
   `<i className="fa fa-circle …" />` with a small CSS dot.

## Quick start (modern card instead)
Copy `LiveWind.tsx` → `src/components/`, render `<LiveWind />`. Tailwind-only,
no images needed.

## Data
- Station **539** (Urla Kite Center), read password `urlakite`.
- Endpoint (CORS-open, browser-callable):
  `https://www.windguru.cz/int/wgsapi.php?id_station=539&password=urlakite&q=station_data_current`
- To hide the password, proxy via the backend and point the component's
  `WIND_URL`/`WIND_URL` at your route (see `ukc-windguru-export.md` §2C).
