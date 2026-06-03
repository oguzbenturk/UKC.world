import dayjs from 'dayjs';
import Decimal from 'decimal.js';
import { buildDefaultContent } from '../constants';
import { formatMoney } from './money';
import { catalogToLineItem } from './catalogToLineItem';

// Auto-generate a COMPLETE proposal document from a few wizard inputs.
// selections: [{ type:'package'|'accommodation'|'service'|'rental', entity, qty }]
//   qty meaning: accommodation=nights, service(lesson)=hours, rental=count, package=count
// opts: { startDate, discountPct, hoursPerDay, people, lang, currencyCode, validDays, tp }
//   tp = i18n.getFixedT(lang, 'proposal') (boilerplate is generated in `lang`).

const round2 = (n) => new Decimal(n || 0).toDecimalPlaces(2).toNumber();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function generateProposalContent(selections, opts) {
  const {
    startDate, discountPct = 0, hoursPerDay = 2, lang = 'en', currencyCode = 'EUR', people = 1, tp,
  } = opts;
  const t = tp || ((k) => k);
  const disc = new Decimal(discountPct || 0).div(100);
  const start = startDate ? dayjs(startDate) : dayjs();

  const fmtShort = (d) => {
    try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(d.toDate()); }
    catch { return d.format('D MMM'); }
  };
  const fmtLong = (d) => {
    try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(d.toDate()); }
    catch { return d.format('D MMMM'); }
  };

  const content = buildDefaultContent();

  // ── Categorize ───────────────────────────────────────────────────────────────
  const accommodation = selections.find((s) => s.type === 'accommodation');
  const lessonSel = selections.filter((s) => s.type === 'service');
  const packageSel = selections.filter((s) => s.type === 'package');

  // Schedule span: accommodation nights, or nights bundled inside a chosen package.
  const accNights = accommodation ? Math.max(1, num(accommodation.qty) || 1) : 0;
  const pkgNights = packageSel.reduce((s, p) => s + num(p.entity.accommodation_nights), 0);
  const nights = accNights || pkgNights;
  const checkout = start.add(nights, 'day');

  // Lesson hours: explicit lesson services + hours bundled inside chosen packages.
  const serviceHours = lessonSel.reduce((s, x) => s + num(x.qty), 0);
  const pkgHours = packageSel.reduce((s, p) => s + num(p.entity.total_hours), 0);
  const lessonHours = serviceHours + pkgHours;
  const lessonDays = lessonHours ? Math.max(1, Math.ceil(lessonHours / hoursPerDay)) : 0;

  // ── Package items (regular + cash via discount %) ────────────────────────────
  let regularSum = new Decimal(0);
  let cashSum = new Decimal(0);
  content.package_items = selections.map((s) => {
    const base = catalogToLineItem({ type: s.type, entity: s.entity, lang, currencyCode });
    const unit = new Decimal(base._amounts.regular || 0);
    const qty = num(s.qty) || 1;
    const lineRegular = unit.times(qty);
    const lineCash = lineRegular.times(new Decimal(1).minus(disc));
    regularSum = regularSum.plus(lineRegular);
    cashSum = cashSum.plus(lineCash);

    let details;
    if (s.type === 'accommodation') details = t('gen.detail.accommodation', { nights: accNights, range: `${fmtShort(start)} – ${fmtShort(checkout)}` });
    else if (s.type === 'service') details = t('gen.detail.lesson', { hours: qty, perDay: hoursPerDay, days: Math.max(1, Math.ceil(qty / hoursPerDay)) });
    else details = base.details[lang] || ''; // package / rental: catalog-derived detail

    if (people > 1 && (s.type === 'service' || s.type === 'package')) {
      details = `${details}  ·  ${t('gen.summaryBit.people', { count: people })}`;
    }

    return {
      item: { [lang]: base.item[lang] },
      details: { [lang]: details },
      regular: formatMoney(round2(lineRegular.toNumber()), currencyCode),
      cash: formatMoney(round2(lineCash.toNumber()), currencyCode),
      _source: base._source,
      _amounts: { regular: round2(lineRegular.toNumber()), cash: round2(lineCash.toNumber()), currency: currencyCode },
    };
  });

  const regularTotal = round2(regularSum.toNumber());
  const cashTotal = round2(cashSum.toNumber());
  const savings = round2(regularSum.minus(cashSum).toNumber());

  // ── Price summary (auto) ─────────────────────────────────────────────────────
  const summaryBits = [];
  if (nights > 0) summaryBits.push(t('gen.summaryBit.nights', { nights }));
  if (lessonHours > 0) summaryBits.push(t('gen.summaryBit.hours', { hours: lessonHours }));
  if (people > 1) summaryBits.push(t('gen.summaryBit.people', { count: people }));
  content.price_summary = {
    regular_total: formatMoney(regularTotal, currencyCode),
    savings: formatMoney(savings, currencyCode),
    cash_price: formatMoney(cashTotal, currencyCode),
    regular_sub: { [lang]: t('gen.regularSub') },
    savings_sub: { [lang]: t('gen.savingsSub', { pct: discountPct }) },
    cash_sub: { [lang]: summaryBits.join(' + ') },
    _auto: { regular_total: true, savings: true, cash_price: true },
    _amounts: { regular_total: regularTotal, savings, cash_price: cashTotal },
  };

  // ── Intro ────────────────────────────────────────────────────────────────────
  content.intro = { [lang]: t('gen.intro') };

  // ── What's included (one card per selection) ─────────────────────────────────
  content.included = selections.map((s) => {
    const base = catalogToLineItem({ type: s.type, entity: s.entity, lang, currencyCode });
    const name = base.item[lang] || '';
    let sub;
    if (s.type === 'accommodation') sub = t('gen.includedSub.accommodation', { nights: accNights });
    else if (s.type === 'service') sub = t('gen.includedSub.lesson', { hours: num(s.qty) });
    else sub = base.details[lang] || name; // package / rental
    const descType = (s.type === 'service' || s.type === 'package') ? 'lesson' : s.type;
    return { title: { [lang]: name.toUpperCase() }, sub: { [lang]: sub }, desc: { [lang]: t(`gen.includedDesc.${descType}`) } };
  });

  // ── Weekly schedule (auto from dates) ────────────────────────────────────────
  const schedule = [];
  if (nights > 0) {
    let lessonCount = 0;
    for (let d = 0; d <= nights; d += 1) {
      const date = start.add(d, 'day');
      const row = { day: { [lang]: t('gen.schedule.day', { n: d + 1 }) }, date: { [lang]: fmtShort(date) }, rental: '-', cost: '-', highlight: false };
      if (d === 0) row.activity = { [lang]: t('gen.schedule.checkin') };
      else if (d === nights) row.activity = { [lang]: t('gen.schedule.checkout') };
      else if (lessonCount < lessonDays) { lessonCount += 1; row.activity = { [lang]: t('gen.schedule.lesson', { hours: hoursPerDay }) }; row.highlight = true; }
      else row.activity = { [lang]: t('gen.schedule.free') };
      schedule.push(row);
    }
  } else if (lessonDays > 0) {
    for (let d = 0; d < lessonDays; d += 1) {
      const date = start.add(d, 'day');
      schedule.push({ day: { [lang]: t('gen.schedule.day', { n: d + 1 }) }, date: { [lang]: fmtShort(date) }, activity: { [lang]: t('gen.schedule.lesson', { hours: hoursPerDay }) }, rental: '-', cost: '-', highlight: true });
    }
  }
  content.schedule = schedule;
  content.schedule_note = { [lang]: t('gen.scheduleNote') };
  content.sections.schedule = schedule.length > 0;

  // ── Benefits ─────────────────────────────────────────────────────────────────
  const benefits = [];
  if (savings > 0) benefits.push({ title: { [lang]: t('gen.benefits.save.title', { amount: formatMoney(savings, currencyCode) }) }, desc: { [lang]: t('gen.benefits.save.desc', { pct: discountPct, amount: formatMoney(savings, currencyCode) }) } });
  if (nights > 0) benefits.push({ title: { [lang]: t('gen.benefits.location.title') }, desc: { [lang]: t('gen.benefits.location.desc') } });
  benefits.push({ title: { [lang]: t('gen.benefits.pro.title') }, desc: { [lang]: t('gen.benefits.pro.desc') } });
  content.benefits = benefits;

  // ── Terms ────────────────────────────────────────────────────────────────────
  const terms = [];
  if (discountPct > 0) terms.push({ [lang]: t('gen.terms.cash', { pct: discountPct }) });
  if (lessonDays > 0) terms.push({ [lang]: t('gen.terms.weather') });
  if (nights > 0) terms.push({ [lang]: t('gen.terms.dates', { from: fmtLong(start), to: fmtLong(checkout) }) });
  if (opts.validDays) terms.push({ [lang]: t('gen.terms.validity', { days: opts.validDays }) });
  content.terms = terms;

  return { content, totals: { regularTotal, cashTotal, savings } };
}
