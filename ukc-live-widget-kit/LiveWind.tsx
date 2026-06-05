/**
 * LiveWind — live wind readout for UKC's own Windguru station (id 539).
 *
 * Drop into the plannivo app, e.g. src/components/LiveWind.tsx, then render
 * <LiveWind /> anywhere. Self-contained: data fetch + 15-min auto-refresh
 * + Tailwind styling that matches the cyan→blue / slate design system.
 *
 * If you prefer to hide the password, point WIND_URL at your own backend
 * proxy route instead (see ukc-windguru-export.md, section 2C) — the markup
 * stays identical.
 */
import { useEffect, useState } from "react";

const STATION_ID = 539;
const STATION_PASSWORD = "urlakite"; // read-only, current-data only
const WIND_URL =
  `https://www.windguru.cz/int/wgsapi.php?id_station=${STATION_ID}` +
  `&password=${STATION_PASSWORD}&q=station_data_current`;
const POLL_MS = 15 * 60 * 1000;

interface WindNow {
  wind_avg: number;
  wind_max: number;
  wind_min: number;
  wind_direction: number;
  temperature: number;
  datetime: string;
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
const compass = (deg: number) => COMPASS[Math.round(deg / 22.5) % 16];

// knots → rough state colour, mirrors the legacy badge thresholds
function windTone(kts: number): string {
  if (kts > 22) return "text-red-400";
  if (kts > 18) return "text-amber-300";
  if (kts > 10) return "text-emerald-300";
  if (kts > 6) return "text-cyan-300";
  return "text-slate-300";
}

export default function LiveWind() {
  const [data, setData] = useState<WindNow | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(WIND_URL, { cache: "no-store" });
        const j = (await r.json()) as Partial<WindNow>;
        if (alive && typeof j.wind_avg === "number") {
          setData(j as WindNow);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const avg = data ? data.wind_avg.toFixed(1) : "–";
  const gust = data ? data.wind_max.toFixed(1) : "–";
  const temp = data ? Math.round(data.temperature) : null;
  const dir = data?.wind_direction ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 p-5 shadow-xl">
      {/* cyan accent glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
            Live · Urla Gülbahçe
          </span>
        </div>
        {temp !== null && (
          <span className="text-sm font-medium text-slate-300">{temp}°C</span>
        )}
      </div>

      <div className="flex items-end gap-5">
        {/* direction arrow */}
        <div className="flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30">
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 text-white transition-transform duration-700"
              style={{ transform: `rotate(${dir}deg)` }}
              fill="currentColor"
              aria-hidden="true"
            >
              {/* arrow points in the direction the wind blows TO */}
              <path d="M12 2l5 9h-3.5v11h-3V11H7l5-9z" />
            </svg>
          </div>
          <span className="mt-1 text-xs font-semibold text-slate-300">
            {data ? `${compass(dir)} · ${dir}°` : "—"}
          </span>
        </div>

        {/* avg + gust */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-extrabold leading-none ${windTone(data?.wind_avg ?? 0)}`}>
              {avg}
            </span>
            <span className="text-lg font-semibold text-slate-400">kts</span>
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Gust <span className="font-semibold text-slate-200">{gust}</span> kts
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3 text-[11px] text-slate-500">
        {error
          ? "Live data temporarily unavailable"
          : data
          ? `Updated ${data.datetime}`
          : "Loading live conditions…"}
      </div>
    </div>
  );
}
