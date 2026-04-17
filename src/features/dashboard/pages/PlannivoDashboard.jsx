/**
 * PlannivoDashboard — preview of the new design-system dashboard.
 *
 * Matches the reference from plannivo.com's landing page:
 *   cream background, Fraunces serif greeting, mono kicker, right-aligned
 *   stat cluster, instructor-row calendar with seafoam/clay/sand lesson blocks,
 *   April revenue with a seafoam sparkline.
 *
 * Tokens + conventions: see docs/design-system/
 *
 * This is a standalone page (scoped CSS, no Ant Design, no Tailwind) so the
 * rest of the app is unaffected while the design is reviewed. When ready to
 * promote, wire useDashboardData() in place of the demo fixtures below and
 * route this as the default /dashboard entry.
 */
import { useContext, useMemo } from 'react';
import { AuthContext } from '@/shared/contexts/authContextInstance';
import './PlannivoDashboard.css';

// ─────────────────────────────  DEMO FIXTURES  ──────────────────────────────
// Wire these to useDashboardData() when promoting this page to production.

const STATS = [
  { value: '12',   label: 'Lessons today' },
  { value: '€840', label: 'Expected revenue' },
  { value: '5',    label: 'Check-ins pending' },
];

const NAV_ITEMS = [
  'Dashboard',
  'Calendar',
  'Students',
  'Instructors',
  'Shop',
  'Finance',
  'Care',
  'Marketing',
];

// 9 hour columns: index 0 = 08:00, 1 = 09:00, ..., 8 = 16:00.
const HOUR_COUNT = 9;
const HOURS = Array.from({ length: HOUR_COUNT }, (_, i) => String(8 + i).padStart(2, '0'));

const SCHEDULE = [
  { name: 'Siyabend', blocks: [
    { type: 'a', label: 'Kite L2 · Ayşe',        start: 1, span: 2 },
    { type: 'b', label: 'Wing L1 · Mert',        start: 4, span: 1 },
  ]},
  { name: 'Arda',     blocks: [
    { type: 'b', label: 'Supervision · group',   start: 1, span: 2 },
    { type: 'a', label: 'Kite L3 · Ali',         start: 5, span: 2 },
  ]},
  { name: 'Elif',     blocks: [
    { type: 'b', label: 'Foil L1 · Kemal',       start: 2, span: 2 },
  ]},
  { name: 'Malek',    blocks: [
    { type: 'c', label: 'Kite Camp · 4 riders',  start: 3, span: 3 },
  ]},
  { name: 'Ufuk',     blocks: [
    { type: 'a', label: 'Kite L2',               start: 2, span: 1 },
    { type: 'b', label: 'Downwinder',            start: 4, span: 1 },
  ]},
];

// April-over-April revenue trend (thousands of euros), 12 weekly-ish points.
const REVENUE_TREND = [38.0, 37.5, 38.2, 38.8, 39.1, 38.9, 39.5, 40.1, 40.8, 41.2, 41.6, 42.1];

// ─────────────────────────────  HELPERS  ────────────────────────────────────

function formatToday(date = new Date()) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const day     = String(date.getDate()).padStart(2, '0');
  const month   = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${weekday} · ${day} ${month}`;
}

/**
 * Build the SVG path data for the revenue sparkline.
 * Returns { line, area, dot } — all in viewBox 0 0 400 80 coordinates.
 */
function buildSparkPath(values, width = 400, height = 80, pad = 6) {
  if (!values.length) return { line: '', area: '', dot: { cx: 0, cy: 0 } };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const line = points.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`)).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const [dx, dy] = points[points.length - 1];

  return { line, area, dot: { cx: dx, cy: dy } };
}

// ─────────────────────────────  COMPONENT  ──────────────────────────────────

export default function PlannivoDashboard() {
  // Auth is optional for this preview — useContext returns null if there's no
  // AuthProvider, so the page renders offline/without a backend.
  const auth = useContext(AuthContext);
  const firstName = auth?.user?.first_name;
  // The bootstrap creates an admin literally named "Admin"; fall back to "Oguz"
  // so the preview matches the reference screenshot. Override by renaming the
  // admin user in settings.
  const displayName = (firstName && firstName !== 'Admin') ? firstName : 'Oguz';

  const todayLabel = useMemo(() => formatToday(), []);
  const spark = useMemo(() => buildSparkPath(REVENUE_TREND), []);

  return (
    <div className="plan-dash">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="plan-side">
        <div className="plan-brand plan-reveal" style={{ '--d': '0ms' }}>
          <span className="plan-brand-dot" aria-hidden="true" />
          <span>Plannivo</span>
        </div>

        <ul className="plan-nav">
          {NAV_ITEMS.map((item, i) => (
            <li
              key={item}
              className={`${i === 0 ? 'is-active' : ''} plan-reveal`}
              style={{ '--d': `${80 + i * 40}ms` }}
            >
              <span className="plan-nav-dot" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="plan-side-foot plan-reveal" style={{ '--d': '600ms' }}>
          v0.0.3 · live
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="plan-main">
        <header className="plan-top">
          <div>
            <p className="plan-kicker plan-reveal" style={{ '--d': '100ms' }}>{todayLabel}</p>
            <h1 className="plan-greeting plan-reveal" style={{ '--d': '180ms' }}>
              Good morning, {displayName}.
            </h1>
          </div>

          <div className="plan-stats">
            {STATS.map((s, i) => (
              <div key={s.label} className="plan-reveal" style={{ '--d': `${260 + i * 80}ms` }}>
                <span className="stat-num">{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </header>

        {/* ── Calendar ─────────────────────────────────────────────────── */}
        <section className="plan-calendar plan-reveal" style={{ '--d': '520ms' }} aria-label="Today's schedule">
          <div className="plan-cal-hours">
            <span aria-hidden="true" />
            {HOURS.map((h) => <span key={h}>{h}</span>)}
          </div>

          <div className="plan-cal-rows">
            {SCHEDULE.map((row) => (
              <div key={row.name} className="plan-cal-row">
                <span className="plan-cal-name">{row.name}</span>
                <div className="plan-cal-track">
                  {row.blocks.map((b, i) => (
                    <div
                      key={`${row.name}-${i}`}
                      className={`plan-lesson t-${b.type}`}
                      style={{
                        left:  `${(b.start / HOUR_COUNT) * 100}%`,
                        width: `calc(${(b.span / HOUR_COUNT) * 100}% - 4px)`,
                      }}
                      title={b.label}
                    >
                      <span>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Revenue ──────────────────────────────────────────────────── */}
        <section className="plan-revenue plan-reveal" style={{ '--d': '700ms' }} aria-label="April revenue">
          <div>
            <p className="plan-eyebrow">APRIL REVENUE</p>
            <h2 className="plan-rev-num">€ 42,180</h2>
            <p className="plan-rev-delta">↗ 14% vs April 2025</p>
          </div>

          <svg className="plan-spark" viewBox="0 0 400 92" preserveAspectRatio="none" aria-hidden="true">
            {/* Subtle midline so the sparkline has a reference without any axis labels */}
            <line x1="0" y1="46" x2="400" y2="46" className="spark-axis" />
            <path className="spark-area" d={spark.area} />
            <path className="spark-line" d={spark.line} />
            <circle className="spark-dot" cx={spark.dot.cx} cy={spark.dot.cy} r="3" />
          </svg>
        </section>
      </main>
    </div>
  );
}
