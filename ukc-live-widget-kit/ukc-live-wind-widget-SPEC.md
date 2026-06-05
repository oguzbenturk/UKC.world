# UKC "LIVE … kts" nav badge — exact replication spec

Goal: reproduce the **exact** wind widget from urlakite.com (the `LIVE … kts`
badge in the header) on **ukc.plannivo.com**, pixel-for-pixel.

This is the small badge in the top nav: a coloured Windguru logo with the word
**LIVE**, the current average wind number overlaid on it, and a **kts** label.
The logo's colour changes with wind strength.

Source files on the old site: `js/wing.js`, `lib/api.php`, and the `.wg-*` rules
in `css/style.css`. Everything you need is reproduced verbatim below.

---

## 1. Required image assets (copy these 6 files exactly)

From `images/main/` on the old site → copy into the new app's public assets
(keep the filenames):

| File | Used when |
|---|---|
| `wglogo.png`       | default (wind ≤ 6 kts / no reading) |
| `wglogo-sky.png`   | spare "sky" state |
| `wglogo-aqua.png`  | 6–10 kts |
| `wglogo-grass.png` | 10–18 kts |
| `wglogo-sun.png`   | 18–23 kts |
| `wglogo-mars.png`  | > 22 kts |

Each is a ~70px-wide coloured Windguru logo. **Pixel accuracy depends on these
exact images** — don't regenerate them.

---

## 2. Exact markup (verbatim from the old nav)

Turkish pages:
```html
<!-- wingy table -->
<a href="./weather#we" title="Hava Durumu sayfası için, tıklayınız.">
    <div id="sidewing nav-logo-wrap local-scroll">
       <div class="wg-main">
         <div class="wg-htxt">LIVE</div>
        <div class="wg-bg"></div>
         <div id="live" class="wg-txt"></div>
         <div class="wg-ctxt wg-htxt">kts</div>
    </div>
    </div>
</a>
<!-- wingy table ends -->
```

English pages add a blinking red dot before LIVE:
```html
<div class="wg-htxt"><i class="fa fa-circle text-danger Blink"></i>LIVE</div>
```

DOM order matters — the number (`#live`/`.wg-txt`) and `kts` (`.wg-ctxt`) are
pulled back **on top of** the logo (`.wg-bg`) via negative margins.

---

## 3. Exact CSS (verbatim from css/style.css)

```css
/* LIVE label, and reused for the "kts" label via .wg-ctxt.wg-htxt */
.wg-htxt {
    color: #fff;
    float: left;
    font-size: 20px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    letter-spacing: 0.7em;
    line-height: 2.7;
    -webkit-font-smoothing: antialiased;
    opacity: 0.9;
}

/* "kts" label */
.wg-ctxt {
    margin-left: -65px;
    font-size: 15px !important;
    line-height: 3.8 !important;
    letter-spacing: 0.2em !important;
}

/* the live wind number (#live) */
.wg-txt {
    color: #000;
    font-size: 18px;
    margin-left: -123px;
    margin-top: 12px;
    float: left;
}

/* the coloured Windguru logo plate behind the number */
.wg-bg {
    background: url(../images/main/wglogo.png) 10px 5px no-repeat;
    float: left;
    background-size: 70px;
    width: 150px;
    height: 55px;
}

/* wind-strength colour states (swap the logo image) */
.sky   { background: url(../images/main/wglogo-sky.png)   10px 5px no-repeat; background-size:70px; }
.aqua  { background: url(../images/main/wglogo-aqua.png)  10px 5px no-repeat; background-size:70px; }
.grass { background: url(../images/main/wglogo-grass.png) 10px 5px no-repeat; background-size:70px; }
.sun   { background: url(../images/main/wglogo-sun.png)   10px 5px no-repeat; background-size:70px; }
.mars  { background: url(../images/main/wglogo-mars.png)  10px 5px no-repeat; background-size:70px; }

/* digit-count fitting (keeps the number centred on the logo) */
.replace1 { padding-left: 13px; }  /* 1 char, e.g. "5"   */
.replace3 { padding-left: 5px;  }  /* 2–3 chars, e.g. "12" / "5.3" */
/* .no-replace = 4 chars, e.g. "12.4" → no extra padding */

/* blinking red dot (EN pages) */
.Blink { animation: blinker 1.5s cubic-bezier(.5, 0, 1, 1) infinite alternate; }
@keyframes blinker { from { opacity: 1; } to { opacity: 0; } }

/* mobile (300–450px) overrides */
@media only screen and (min-width: 300px) and (max-width: 450px) {
    .wg-bg, .wg-ctxt, .wg-htxt, .wg-txt { float: left !important; }
    .wg-htxt {
        color: #fff !important; font-size: 15px !important;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif !important;
        letter-spacing: 2px !important; line-height: 3.7 !important;
        -webkit-font-smoothing: antialiased !important; opacity: 0.9 !important;
        margin-left: -20px !important;
    }
    .wg-bg {
        background: url(../images/main/wglogo.png) 10px 5px no-repeat !important;
        background-size: 55px !important; width: 70px !important; height: 55px !important;
        margin-top: 5px !important; margin-left: -7px !important;
    }
    .sky, .aqua, .grass, .sun, .mars { background-size: 55px !important; }
    .wg-txt {
        color: #000 !important; font-size: 14px !important; font-weight: 700 !important;
        margin-left: -46px !important; margin-top: 17px !important;
    }
    .wg-ctxt { color: #fff !important; margin-left: 1px !important; }
    .replace1 { padding-left: 10px; }
    .replace3 { padding-left: 3px; }
}
```

> Note: in the URL the old CSS uses `../images/main/…` (relative to `/css/`).
> In the new app, change these to your asset path (e.g. `/images/main/…`).

---

## 4. Exact behaviour (from js/wing.js)

1. On load, poll for the current reading, then repeat **every 1 000 000 ms
   (~16.7 min)** — keep this interval to match exactly.
2. Set the number into `#live` (`.wg-txt`).
3. Colour the logo by average wind (knots) — `logo_color()`:

   | Wind (kts) | class added to `.wg-bg` |
   |---|---|
   | ≤ 6 | (none — stays default `wglogo.png`) |
   | > 6 and < 10 | `aqua` |
   | > 10 and < 18 | `grass` |
   | > 18 and < 23 | `sun` |
   | > 22 | `mars` |

   (Boundaries are intentionally as written — exactly 6/10/18 keep the previous
   colour. Reproduce as-is for identical behaviour.)

4. **Digit-fit class** by the number's character length (old PHP did this):

   | Chars | Example | class |
   |---|---|---|
   | 1 | `5` | `replace1` |
   | 2 | `12` | `replace3` |
   | 3 | `5.3` | `replace3` |
   | 4 | `12.4` | `no-replace` |

5. Safety guard (`sanitize_live`): if the response looks like leaked source
   (length > 160, or contains `<?php`, `$_`, `windguru`, `<iframe`, `<script`,
   `<!doctype`) or has no number, show a neutral `–` instead.

---

## 5. Data source

Old site proxied through PHP (`lib/api.php`, POST `get-info=aa`) which called:

```
https://www.windguru.cz/int/wgsapi.php?id_station=539&password=urlakite&q=station_data_current
```

- **Station 539 = Urla Kite Center**, read password `urlakite`.
- Returns JSON; the badge uses `wind_avg` (rounded to 1 decimal), shown as kts.
- **CORS is open** (`access-control-allow-origin: *`) → the new app can fetch it
  directly in the browser; no PHP proxy needed. (See `ukc-windguru-export.md`
  for the full field list and an optional backend-proxy route.)

Sample: `{"wind_avg":5.32,"wind_max":5.9,"wind_direction":225,"temperature":19.4, …}`
→ `round(5.32,1)=5.3` → 3 chars → `.replace3` → displayed as **5.3 kts**, logo `aqua`.

---

## 6. Faithful React port (1:1)

Ship the CSS above as a dedicated stylesheet so positioning is identical, then
use this component. It reproduces the exact DOM, classes, colour logic, digit-fit,
poll interval, and safety guard.

`LiveWindBadge.css` — paste the **Section 3** CSS verbatim (fix the image paths).

`LiveWindBadge.tsx`:
```tsx
import { useEffect, useState } from "react";
import "./LiveWindBadge.css";

const WIND_URL =
  "https://www.windguru.cz/int/wgsapi.php?id_station=539" +
  "&password=urlakite&q=station_data_current";

// exact colour thresholds from wing.js logo_color()
function windClass(kts: number): string {
  if (kts <= 6) return "";
  if (kts > 6 && kts < 10) return "aqua";
  if (kts > 10 && kts < 18) return "grass";
  if (kts > 18 && kts < 23) return "sun";
  if (kts > 22) return "mars";
  return ""; // 6/10/18 boundaries: keep default
}

// exact digit-fit from api.php (strlen of the rounded value)
function fitClass(text: string): string {
  if (text.length === 1) return "replace1";
  if (text.length === 2 || text.length === 3) return "replace3";
  return "no-replace"; // 4 chars
}

export default function LiveWindBadge() {
  const [num, setNum] = useState("–");
  const [tone, setTone] = useState("");      // aqua/grass/sun/mars
  const [fit, setFit] = useState("no-replace");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(WIND_URL, { cache: "no-store" });
        const j = await r.json();
        if (!alive || typeof j.wind_avg !== "number") return;
        const v = Math.round(j.wind_avg * 10) / 10;   // round to 1 dp, PHP-style
        const text = String(v);                        // "5", "5.3", "12.4"
        setNum(text);
        setFit(fitClass(text));
        setTone(windClass(v));
      } catch {
        if (alive) { setNum("–"); setTone(""); }       // safety guard
      }
    };
    load();
    const id = setInterval(load, 1000000);             // ~16.7 min, exactly as old
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <a href="/weather" title="Hava Durumu / Forecast">
      <div className="wg-main">
        <div className="wg-htxt">
          <i className="fa fa-circle text-danger Blink" aria-hidden="true" />LIVE
        </div>
        <div className={`wg-bg ${tone}`} />
        <div id="live" className={`wg-txt ${fit}`}>{num}</div>
        <div className="wg-ctxt wg-htxt">kts</div>
      </div>
    </a>
  );
}
```

Notes for an exact match:
- Keep the **DOM order** (LIVE → wg-bg → number → kts); the negative margins
  depend on it.
- The number uses **black text on the logo** by design (`.wg-txt{color:#000}`).
- "LIVE" relies on **Helvetica Neue** + `letter-spacing:0.7em`; the blinking dot
  needs **Font Awesome 4** (`fa fa-circle`) loaded in the app, or replace it with
  a small CSS dot if FA isn't available.
- The original `logo_color()` only **adds** colour classes (never clears the old
  one); this port sets exactly one tone class, which looks the same but is cleaner.
  If you want byte-identical behaviour, append instead of replace.
- If you proxy via the backend to hide the password, only swap `WIND_URL` — the
  rest is unchanged.

---

## 7. Precision checklist

- [ ] 6 `wglogo*.png` images copied, same filenames, same path.
- [ ] Section-3 CSS included verbatim (image paths adjusted).
- [ ] DOM order: LIVE → `.wg-bg` → `#live`/`.wg-txt` → `.wg-ctxt`.
- [ ] Number = `wind_avg` rounded to 1 dp, shown as kts.
- [ ] Colour thresholds 6/10/18/22 via `aqua/grass/sun/mars`.
- [ ] Digit-fit `replace1` / `replace3` / `no-replace`.
- [ ] Poll every 1 000 000 ms.
- [ ] Helvetica Neue for labels; Font Awesome 4 for the blink dot (EN style).
- [ ] Safety guard shows `–` on bad/empty response.
