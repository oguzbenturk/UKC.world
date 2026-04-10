import { useState } from 'react';
import { HomeOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useImageAccent } from '@/features/outsider/hooks/useImageAccent';
import slsLogo from '../../../../DuotoneFonts/DPSLOGOS/sls.png';
import dlabLogo from '../../../../DuotoneFonts/DPSLOGOS/duotone-kiteboarding-d_lab-logo-new-2026.png';
import standardLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC_Logo_231121.ai.png';

function getCheapestDuration(durations) {
  if (!Array.isArray(durations) || !durations.length) return null;
  return durations.reduce((best, d) => {
    const p = Number(d.price);
    const bp = Number(best.price);
    if (Number.isFinite(p) && (!Number.isFinite(bp) || p < bp)) return d;
    return best;
  }, durations[0]);
}

function parseHoursFromStr(h) {
  const s = String(h ?? '').trim();
  const m = s.match(/^([\d.]+)\s*h$/i);
  if (m) return parseFloat(m[1]);
  return null;
}

/** Returns { duration, perHour } where perHour is the cheapest price-per-hour across all durations. */
function getCheapestPerHourRate(durations) {
  if (!Array.isArray(durations) || !durations.length) return { duration: null, perHour: null };
  let best = null;
  let bestRate = Infinity;
  for (const d of durations) {
    const price = Number(d.price);
    const h = parseHoursFromStr(d.hours);
    if (!Number.isFinite(price) || !h || h <= 0) continue;
    const rate = price / h;
    if (rate < bestRate) { bestRate = rate; best = d; }
  }
  return { duration: best, perHour: best ? bestRate : null };
}

function formatDurationBadgeLine(hours) {
  const s = String(hours ?? '').trim();
  if (!s || s === '—') return 'SESSION';
  const m = s.match(/^([\d.]+)\s*h$/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return s.toUpperCase().slice(0, 18);
    const label = n === 1 ? '1' : String(n).replace(/\.0+$/, '');
    return `${label}-HOUR`;
  }
  return s.toUpperCase().replace(/\s+/g, '-').slice(0, 18);
}

function tierLine(pkg) {
  const b = pkg.badges?.[0];
  if (b && String(b).trim()) {
    const t = String(b).trim();
    return t.length > 22 ? `${t.slice(0, 20)}…` : t;
  }
  const sub = String(pkg.subtitle || '').trim();
  if (sub) return sub.length > 22 ? `${sub.slice(0, 20)}…` : sub;
  return 'LESSON';
}

/** First sentence without regex lookbehind (Safari < 16.4 throws on `(?<=...)`). */
function firstDescriptionSnippet(raw) {
  const desc = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!desc) return '';
  for (let i = 0; i < desc.length; i++) {
    const c = desc[i];
    if (c === '.' || c === '!' || c === '?') {
      const next = desc[i + 1];
      if (next === undefined || /\s/.test(next)) {
        return desc.slice(0, i + 1).trim();
      }
    }
  }
  return desc;
}

function cardTagline(pkg, max = 108) {
  const desc = String(pkg.description || '').trim();
  const text =
    desc.length > 0
      ? firstDescriptionSnippet(desc)
      : String(pkg.subtitle || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Primary stat line for bundle cards (stay / rental / hours) — not a generic fallback image. */
function bundlePrimaryStatLine(pkg) {
  const n = Number(pkg.accommodationNights ?? pkg.accommodation_nights);
  if (Number.isFinite(n) && n > 0) return n === 1 ? '1-NIGHT' : `${n}-NIGHT`;
  const rd = Number(pkg.rentalDays ?? pkg.rental_days);
  if (Number.isFinite(rd) && rd > 0) return rd === 1 ? '1-DAY' : `${rd}-DAY`;
  const th = Number(pkg.totalHours ?? pkg.total_hours);
  if (Number.isFinite(th) && th > 0) return formatDurationBadgeLine(`${th}h`);
  return 'BUNDLE';
}

function truncateTier(s, max = 22) {
  const t = String(s || '').trim();
  if (!t) return 'PACKAGE';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default function AcademyLessonPackageCard({
  pkg,
  resolvedImageSrc,
  imagePosition = 'center center',
  formatPrice,
  cardTitleHoverClass = '',
  onCardClick,
  /** Show cheapest per-hour rate instead of cheapest total price (lesson pages only) */
  showCheapestPerHour = false,
  /** Experience / service bundles: label for badge row 2 (e.g. "Lessons + Stay") */
  bundleSummaryLabel,
  /** Optional emerald note above title (e.g. owned remaining) */
  ownedHint,
  /** True when any variant of this service group is already owned by the user */
  isOwned = false,
}) {
  const [imageVisible, setImageVisible] = useState(true);
  const hasCover = !!(resolvedImageSrc && String(resolvedImageSrc).trim());
  const accentSrc = imageVisible && hasCover ? resolvedImageSrc : '';
  const { bottomHex } = useImageAccent(accentSrc, pkg.color || 'blue');

  const durationRows = Array.isArray(pkg.durations) ? pkg.durations : [];
  const cheapest = getCheapestDuration(durationRows);
  const hasLessonDurations =
    cheapest && Number.isFinite(Number(cheapest.price)) && durationRows.length > 0;
  const singlePrice = Number(pkg.price);

  let durationLine;
  let tier;
  let priceLabel;

  if (hasLessonDurations) {
    if (showCheapestPerHour) {
      const { duration: bestDur, perHour } = getCheapestPerHourRate(durationRows);
      if (bestDur && perHour != null) {
        durationLine = '1-HOUR';
        tier = tierLine(pkg);
        priceLabel = formatPrice(Math.round(perHour * 100) / 100);
      } else {
        durationLine = formatDurationBadgeLine(cheapest.hours);
        tier = tierLine(pkg);
        priceLabel = formatPrice(cheapest.price);
      }
    } else {
      durationLine = formatDurationBadgeLine(cheapest.hours);
      tier = tierLine(pkg);
      priceLabel = formatPrice(cheapest.price);
    }
  } else if (Number.isFinite(singlePrice)) {
    durationLine = bundlePrimaryStatLine(pkg);
    tier = truncateTier(bundleSummaryLabel || tierLine(pkg));
    priceLabel = formatPrice(singlePrice);
  } else {
    durationLine = 'SESSION';
    tier = truncateTier(bundleSummaryLabel || tierLine(pkg));
    priceLabel = '—';
  }

  const tagline = cardTagline(pkg);

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick();
          }
        }}
        onClick={onCardClick}
        className={`group relative flex min-h-[360px] flex-col overflow-hidden rounded-3xl transition-[transform,box-shadow,border-color] duration-300 cursor-pointer hover:-translate-y-1 md:backdrop-blur-none ${isOwned ? 'border border-emerald-500/70 bg-[#1a1f26]/60 shadow-[0_0_12px_rgba(16,185,129,0.45),0_0_28px_rgba(16,185,129,0.2)] hover:border-emerald-500/85 hover:shadow-[0_0_18px_rgba(16,185,129,0.6),0_0_40px_rgba(16,185,129,0.25)] md:bg-[#1a1f26]/92 md:shadow-[0_2px_20px_rgba(0,0,0,0.35),0_0_12px_rgba(16,185,129,0.35)] md:hover:shadow-[0_8px_28px_rgba(16,185,129,0.35),0_0_0_1px_rgba(16,185,129,0.4)]' : 'border border-[rgba(0,168,196,0.5)] bg-[#1a1f26]/60 shadow-[0_0_10px_rgba(0,168,196,0.3),0_0_25px_rgba(0,168,196,0.15)] backdrop-blur-sm hover:border-[rgba(0,168,196,0.75)] hover:shadow-[0_0_15px_rgba(0,168,196,0.45),0_0_35px_rgba(0,168,196,0.2)] md:border-[rgba(0,168,196,0.55)] md:bg-[#1a1f26]/92 md:shadow-[0_2px_20px_rgba(0,0,0,0.35)] md:hover:border-[rgba(0,168,196,0.85)] md:hover:shadow-[0_8px_28px_rgba(0,168,196,0.25),0_0_0_1px_rgba(0,168,196,0.35)]'} ${pkg.shadow || ''} ${pkg.border || ''}`}
      >
      {/* ~70% image / ~30% copy — flex ratio 7:3 */}
      <div className="relative min-h-[200px] flex-[7] overflow-hidden rounded-t-3xl">
        {hasCover && imageVisible ? (
          <img
            src={resolvedImageSrc}
            alt={pkg.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 max-md:group-hover:scale-[1.03] md:transition-none"
            style={{ objectPosition: imagePosition }}
            loading="lazy"
            onError={() => setImageVisible(false)}
          />
        ) : null}

        <div
          className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${pkg.gradient || 'from-gray-700 to-gray-900'} ${hasCover && imageVisible ? 'hidden' : ''}`}
        >
          <div className="px-4 text-center">
            <HomeOutlined className="mb-2 text-5xl text-white/40" />
            <p className="text-xs text-white/60">No image uploaded</p>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            /* Long soft blend into lower panel — no hard edge at seam */
            background: `linear-gradient(to top, ${bottomHex} 0%, ${bottomHex}e6 6%, ${bottomHex}99 14%, rgba(0,0,0,0.14) 38%, transparent 68%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(180,220,240,0.06)_0%,transparent_65%)]" />

        <div className="absolute left-2.5 top-2.5 z-20 flex flex-col items-start gap-1.5">
          {pkg.badges?.[0] === 'SLS' && (
            <img
              src={slsLogo}
              alt="SLS"
              className="h-8 w-auto drop-shadow-md"
              draggable={false}
            />
          )}
          {pkg.badges?.[0] === 'DLAB' && (
            <img
              src={dlabLogo}
              alt="D/LAB"
              className="h-8 w-auto drop-shadow-md"
              draggable={false}
            />
          )}
          {pkg.badges?.[0] === 'STANDARD' && (
            <img
              src={standardLogo}
              alt="Standard"
              className="h-8 w-auto drop-shadow-md"
              draggable={false}
            />
          )}
          {isOwned && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm">
              <CheckCircleFilled className="text-[10px]" /> OWNED
            </div>
          )}
        </div>

        <div className="absolute right-2.5 top-2.5 z-20 max-w-[46%] rounded-lg bg-black/85 px-2 py-1.5 text-right text-white shadow-md backdrop-blur-sm md:bg-slate-950/90">
          <p className="font-duotone-bold-extended text-[9px] uppercase leading-tight tracking-wide text-white/95">
            {durationLine}
          </p>
          <p className="mt-0.5 font-duotone-regular text-[8px] uppercase leading-snug tracking-wide text-white/75">
            {tier}
          </p>
          <p className="mt-0.5 font-duotone-regular text-[7px] uppercase tracking-[0.18em] text-white/55">
            FROM
          </p>
          <p className="font-duotone-bold-extended text-sm italic leading-none text-white">{priceLabel}</p>
          {isOwned && (
            <p className="mt-1 flex items-center justify-end gap-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-400">
              <CheckCircleFilled className="text-[9px]" /> Active Package
            </p>
          )}
        </div>
      </div>

      <div
        className="relative z-10 flex min-h-0 flex-[3] flex-col justify-center rounded-b-3xl px-3 py-3 text-center sm:px-4 sm:py-3.5"
        style={{ backgroundColor: bottomHex }}
      >
        {ownedHint ? (
          <p className="mb-1 text-[9px] font-duotone-bold uppercase tracking-wide text-emerald-400 sm:text-[10px]">
            {ownedHint}
          </p>
        ) : null}
        <h3
          className={`font-duotone-bold-extended text-sm uppercase leading-snug tracking-wide text-white transition-colors sm:text-base ${cardTitleHoverClass} line-clamp-2 break-words`}
        >
          {pkg.name}
        </h3>
        {tagline ? (
          <p className="mx-auto mt-1.5 max-w-md font-duotone-regular text-[10px] uppercase leading-snug tracking-wide text-white/75 line-clamp-3 sm:text-[11px]">
            {tagline}
          </p>
        ) : null}
      </div>
      </div>

    </div>
  );
}
