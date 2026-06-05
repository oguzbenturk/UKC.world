/**
 * LiveWindBadge — 1:1 port of the urlakite.com "LIVE … kts" nav badge.
 *
 * Reproduces the exact DOM, classes, colour thresholds, digit-fit, poll interval
 * and safety guard from the old site's wing.js + api.php + style.css.
 * Styling lives in LiveWindBadge.css (keep the .wg-* class names intact).
 *
 * Requires: the 6 wglogo*.png images at /images/main/ (see LiveWindBadge.css),
 * and Font Awesome 4 for the blinking dot (or swap the <i> for a CSS dot).
 */
import { useEffect, useState } from "react";
import "./LiveWindBadge.css";

// Station 539 = Urla Kite Center. Read-only, current-data only.
// To hide the password, point this at your own backend proxy route instead.
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
  return ""; // 6/10/18 boundaries: keep default logo
}

// exact digit-fit from api.php (strlen of the rounded value)
function fitClass(text: string): string {
  if (text.length === 1) return "replace1";
  if (text.length === 2 || text.length === 3) return "replace3";
  return "no-replace"; // 4 chars
}

export default function LiveWindBadge() {
  const [num, setNum] = useState("–");
  const [tone, setTone] = useState("");
  const [fit, setFit] = useState("no-replace");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(WIND_URL, { cache: "no-store" });
        const j = await r.json();
        if (!alive || typeof j.wind_avg !== "number") return;
        const v = Math.round(j.wind_avg * 10) / 10; // round to 1 dp, PHP-style
        const text = String(v); // "5", "5.3", "12.4"
        setNum(text);
        setFit(fitClass(text));
        setTone(windClass(v));
      } catch {
        if (alive) {
          setNum("–"); // safety guard
          setTone("");
        }
      }
    };
    load();
    const id = setInterval(load, 1000000); // ~16.7 min, exactly as the old site
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <a href="/weather" title="Hava Durumu / Forecast">
      <div className="wg-main">
        <div className="wg-htxt">
          <i className="fa fa-circle text-danger Blink" aria-hidden="true" />
          LIVE
        </div>
        <div className={`wg-bg ${tone}`} />
        <div id="live" className={`wg-txt ${fit}`}>
          {num}
        </div>
        <div className="wg-ctxt wg-htxt">kts</div>
      </div>
    </a>
  );
}
