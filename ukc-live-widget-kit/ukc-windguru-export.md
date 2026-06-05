# UKC Windguru — live station export (for ukc.plannivo.com)

Everything needed to show **live wind** on the new site, taken from the old
site's `lib/api.php`, `js/wing.js`, and `js/weather.js`.

---

## 1. UKC's own station (the live number)

- **Station ID:** `539`  (Urla Kite Center, Gülbahçe)
- **Read password:** `urlakite`
- **Live endpoint (JSON, CORS-enabled — callable from the browser):**

```
https://www.windguru.cz/int/wgsapi.php?id_station=539&password=urlakite&q=station_data_current
```

### Sample live response (fetched 2026-06-06 00:51 +03)
```json
{
  "wind_avg": 5.32,
  "wind_max": 5.9,
  "wind_min": 4.72,
  "wind_direction": 225,
  "temperature": 19.4,
  "mslp": 1011.95,
  "rh": 82,
  "datetime": "2026-06-06 00:51:08 +03",
  "unixtime": 1780696268
}
```

| Field | Meaning |
|---|---|
| `wind_avg` / `wind_max` / `wind_min` | wind speed (avg / gust / lull) — the legacy site shows `wind_avg` as **knots** |
| `wind_direction` | degrees (0–360; 225 = SW) |
| `temperature` | °C |
| `mslp` | mean sea-level pressure (hPa) |
| `rh` | relative humidity (%) |
| `datetime` / `unixtime` | time of reading (station tz +03) |

> Note on units: the old UKC site labels the value "kts" and uses `wind_avg`
> directly. If the new design needs a different unit, convert:
> `1 m/s = 1.94384 kts`, `1 kts = 1.852 km/h`.
> The `station_info` query is blocked for this read-password ("Not enough
> permission") — only `station_data_current` is available, which is all the
> live widget needs.

---

## 2. Drop-in code for the new app

### A. React hook (recommended — polls every ~15 min)
```tsx
import { useEffect, useState } from "react";

const UKC_STATION = 539;
const UKC_PASSWORD = "urlakite"; // read-only, current-data only

export interface WindNow {
  wind_avg: number;
  wind_max: number;
  wind_min: number;
  wind_direction: number;
  temperature: number;
  datetime: string;
}

export function useUkcWind(pollMs = 15 * 60 * 1000) {
  const [data, setData] = useState<WindNow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const url =
      `https://www.windguru.cz/int/wgsapi.php?id_station=${UKC_STATION}` +
      `&password=${UKC_PASSWORD}&q=station_data_current`;

    const load = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (alive && typeof j.wind_avg === "number") setData(j);
      } catch (e) {
        if (alive) setError(String(e));
      }
    };

    load();
    const id = setInterval(load, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [pollMs]);

  return { data, error };
}
```

Usage:
```tsx
const { data } = useUkcWind();
// data?.wind_avg.toFixed(1) + " kts", arrow rotated by data?.wind_direction
```

### B. Vanilla JS (mirrors the old `#live` header badge)
```html
<span id="ukc-live">–</span> kts
<script>
(function () {
  var url = "https://www.windguru.cz/int/wgsapi.php?id_station=539" +
            "&password=urlakite&q=station_data_current";
  function load() {
    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && typeof d.wind_avg === "number") {
          document.getElementById("ukc-live").textContent = d.wind_avg.toFixed(1);
        }
      })
      .catch(function () {});
  }
  load();
  setInterval(load, 900000); // 15 min
})();
</script>
```

### C. Optional: hide the password behind the existing backend
The new app already has a Node backend. If you'd rather not expose the password
in client code, add one route that proxies the call and returns the JSON:

```js
// e.g. backend/routes/weather.js
router.get("/wind/ukc", async (req, res) => {
  const r = await fetch(
    "https://www.windguru.cz/int/wgsapi.php?id_station=539" +
    "&password=urlakite&q=station_data_current"
  );
  res.set("Cache-Control", "public, max-age=300"); // 5-min cache
  res.json(await r.json());
});
```
Then the frontend calls `/api/wind/ukc` instead of windguru directly.
(The password only grants read access to current data, so exposing it client-side
is low-risk — this is just best practice.)

---

## 3. Other spots shown on the old weather page (not UKC-owned)

These belong to other stations, so there's **no JSON/password access** — the old
site embeds Windguru's public **station widgets**. Reuse the same embeds:

| Spot | Windguru station id |
|---|---|
| Urla Kite Center (own) | **539** |
| Alaçatı Plajı | 619 |
| Pırlanta Plajı | 429 |
| Ilıca Plajı | 455 |

Public widget embed (swap `id_station`; `type:'wind'` = graph, `type:'curr'` = current):
```html
<script src="https://www.windguru.cz/js/wgs_widget.php"></script>
<script>
WgsWidget({
  id_station: 539,
  height: 250,
  hours: 6,
  wj: 'knots',
  gustiness: true,
  divid: 'wgs_widget_539',
  type: 'wind'      // 'curr' for the current-conditions box
});
</script>
<div id="wgs_widget_539"></div>
```

### Forecast spots (Windguru `id_spot`, used by the old page's forecast iframes)
`590546`, `597906`, `576441`, `569426`, `98370`, `134293`

Forecast iframe embed:
```html
<iframe src="https://www.windguru.cz/wglive-iframe.php?id_spot=590546&wj=knots&tj=c&show=n,f"
        style="width:100%;height:254px;border:0" scrolling="no"
        sandbox="allow-same-origin allow-scripts"></iframe>
```

---

## 4. Colour thresholds the old badge used (knots → colour)
From `js/wing.js` `logo_color()`:

| Wind (kts) | State |
|---|---|
| 6–10 | aqua |
| 10–18 | grass (green) |
| 18–23 | sun (yellow) |
| > 22 | mars (red) |
