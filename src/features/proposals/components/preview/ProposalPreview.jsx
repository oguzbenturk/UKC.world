import React, { useMemo } from 'react';
import { BRAND, SECTION_ORDER } from '../../constants';
import { resolveContentValue } from '../../utils/contentValue';
import { computeProposalTotals } from '../../utils/totals';
import { useProposalLabels } from '../../hooks/useProposalLabels';

// On-screen HTML mirror of the PDF ("blend" style: Antrasit header + Duotone-blue
// accents + the prototype's price boxes & highlighted schedule). Reused on the
// public page. Inline styles keep it self-contained (works without Tailwind config).

const fmtDate = (value, lang) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value || '');
  try {
    return new Intl.DateTimeFormat(lang, { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

const Multi = ({ value, lang }) => {
  const text = resolveContentValue(value, lang);
  const parts = String(text).split('\n');
  return parts.map((p, i) => (
    <React.Fragment key={i}>{p}{i < parts.length - 1 ? <br /> : null}</React.Fragment>
  ));
};

export default function ProposalPreview({
  content = {},
  lang = 'en',
  preparedFor = '',
  quoteDate,
  currencyCode = 'EUR',
}) {
  const tpRaw = useProposalLabels(lang);
  const tp = (k) => tpRaw(`pdf.${k}`); // structural labels live under the `pdf` block
  const brand = content.brand || {};
  const sections = content.sections || {};

  // Section numbering — count only enabled sections that have content (terms unnumbered).
  const numbered = useMemo(() => {
    const map = {};
    let n = 0;
    for (const key of SECTION_ORDER) {
      if (key === 'intro' || key === 'terms') continue;
      if (!sections[key]) continue;
      const val = content[key];
      const hasContent = Array.isArray(val) ? val.length > 0
        : (key === 'price_summary' ? true : !!val);
      if (!hasContent) continue;
      n += 1;
      map[key] = n;
    }
    return map;
  }, [content, sections]);

  const totals = computeProposalTotals(content, currencyCode);
  const ps = content.price_summary || {};
  const psRegular = resolveContentValue(ps.regular_total, lang) || totals.regularTotalStr;
  const psSavings = resolveContentValue(ps.savings, lang) || totals.savingsStr;
  const psCash = resolveContentValue(ps.cash_price, lang) || totals.cashPriceStr;

  const sectionTitle = (key, labelKey) => (
    <div style={{
      background: BRAND.antrasit, color: BRAND.white, fontWeight: 700, fontSize: 13,
      letterSpacing: 0.5, padding: '8px 12px', borderBottom: `2px solid ${BRAND.blue}`,
      marginTop: 18,
    }}>
      {numbered[key] ? `${numbered[key]}.  ` : ''}{tp(labelKey)}
    </div>
  );

  const showSection = (key) => {
    if (!sections[key]) return false;
    const val = content[key];
    if (Array.isArray(val)) return val.length > 0;
    if (key === 'intro') return !!resolveContentValue(val, lang);
    return true;
  };

  return (
    <div style={{
      background: BRAND.white, color: BRAND.ink, width: '100%', maxWidth: 820,
      margin: '0 auto', fontFamily: '"Poppins", system-ui, sans-serif', fontSize: 13,
      boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
    }}>
      {/* Header */}
      <div style={{ background: BRAND.antrasit, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: BRAND.white, fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>
            <Multi value={brand.title} lang={lang} />
          </div>
          <div style={{ color: '#C8CACE', fontSize: 9, marginTop: 4 }}>
            <Multi value={brand.subtitle} lang={lang} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: BRAND.blue, fontSize: 10 }}>{tp('quotation')}  |  {fmtDate(quoteDate, lang)}</div>
          <div style={{ color: '#A8ABB0', fontSize: 8, marginTop: 2 }}>{resolveContentValue(brand.website, lang)}</div>
        </div>
      </div>
      <div style={{ background: BRAND.blue, height: 6 }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Prepared-for + intro */}
        {preparedFor && (
          <div style={{ fontSize: 10, color: BRAND.antrasit, marginBottom: 6 }}>
            {tp('prepared_for')}: <b>{preparedFor}</b>
          </div>
        )}
        {showSection('intro') && (
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: BRAND.ink, margin: '0 0 6px' }}>
            <Multi value={content.intro} lang={lang} />
          </p>
        )}

        {/* 1. Package overview */}
        {showSection('package_items') && (
          <>
            {sectionTitle('package_items', 'sec_overview')}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr style={{ background: BRAND.antrasitDk, color: BRAND.white }}>
                  <th style={thStyle('22%')}>{tp('th_item')}</th>
                  <th style={thStyle('38%')}>{tp('th_details')}</th>
                  <th style={{ ...thStyle('20%'), textAlign: 'center' }}>{tp('th_regular')}</th>
                  <th style={{ ...thStyle('20%'), textAlign: 'center' }}>{tp('th_cash')}</th>
                </tr>
              </thead>
              <tbody>
                {content.package_items.map((it, i) => (
                  <tr key={i} style={{ background: i % 2 ? BRAND.rowStripe : BRAND.rowLight }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: BRAND.antrasit }}><Multi value={it.item} lang={lang} /></td>
                    <td style={tdStyle}><Multi value={it.details} lang={lang} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: BRAND.muted }}><Multi value={it.regular} lang={lang} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: BRAND.blueDk }}><Multi value={it.cash} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* 2. Price summary */}
        {showSection('price_summary') && (
          <>
            {sectionTitle('price_summary', 'sec_price')}
            <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
              {priceBox(tp('ps_regular'), psRegular, resolveContentValue(ps.regular_sub, lang), BRAND.rowLight, BRAND.antrasitLt, BRAND.muted, true)}
              {priceBox(tp('ps_save'), psSavings, resolveContentValue(ps.savings_sub, lang), BRAND.antrasit, BRAND.blue, BRAND.blueTextSoft, false)}
              {priceBox(tp('ps_cash'), psCash, resolveContentValue(ps.cash_sub, lang), BRAND.blue, BRAND.white, '#DFF3FC', false)}
            </div>
          </>
        )}

        {/* 3. What's included */}
        {showSection('included') && (
          <>
            {sectionTitle('included', 'sec_included')}
            <div style={{ marginTop: 6 }}>
              {content.included.map((b, i) => (
                <div key={i} style={{ display: 'flex', borderBottom: `1px solid ${BRAND.border}`, background: i % 2 ? BRAND.rowStripe : BRAND.rowLight }}>
                  <div style={{
                    width: '27%', background: BRAND.antrasit, color: BRAND.white, padding: '9px 8px',
                    textAlign: 'center', borderBottom: `2px solid ${BRAND.blue}`,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 11 }}><Multi value={b.title} lang={lang} /></div>
                    <div style={{ fontSize: 8.5, color: BRAND.blueTextSoft, marginTop: 2 }}><Multi value={b.sub} lang={lang} /></div>
                  </div>
                  <div style={{ flex: 1, padding: '10px 12px', fontSize: 12, lineHeight: 1.5 }}>
                    <Multi value={b.desc} lang={lang} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 4. Weekly schedule */}
        {showSection('schedule') && (
          <>
            {sectionTitle('schedule', 'sec_schedule')}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr style={{ background: BRAND.antrasitDk, color: BRAND.white }}>
                  <th style={{ ...thStyle('10%'), textAlign: 'center' }}>{tp('sh_day')}</th>
                  <th style={{ ...thStyle('11%'), textAlign: 'center' }}>{tp('sh_date')}</th>
                  <th style={thStyle('46%')}>{tp('sh_activity')}</th>
                  <th style={{ ...thStyle('16%'), textAlign: 'center' }}>{tp('sh_rental')}</th>
                  <th style={{ ...thStyle('17%'), textAlign: 'center' }}>{tp('sh_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {content.schedule.map((d, i) => (
                  <tr key={i} style={{ background: i % 2 ? BRAND.rowStripe : BRAND.rowLight }}>
                    <td style={{ ...tdStyle, textAlign: 'center', ...(d.highlight ? { background: BRAND.blue, color: BRAND.white, fontWeight: 700 } : {}) }}>
                      <Multi value={d.day} lang={lang} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}><Multi value={d.date} lang={lang} /></td>
                    <td style={tdStyle}><Multi value={d.activity} lang={lang} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: d.highlight ? BRAND.blueDk : BRAND.ink }}><Multi value={d.rental} lang={lang} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: d.highlight ? 700 : 400, color: d.highlight ? BRAND.blueDk : BRAND.ink }}><Multi value={d.cost} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resolveContentValue(content.schedule_note, lang) && (
              <div style={{ fontSize: 8.5, fontStyle: 'italic', color: BRAND.muted, marginTop: 4 }}>
                <Multi value={content.schedule_note} lang={lang} />
              </div>
            )}
          </>
        )}

        {/* 5. Benefits */}
        {showSection('benefits') && (
          <>
            {sectionTitle('benefits', 'sec_benefits')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
              {content.benefits.map((b, i) => (
                <div key={i} style={{ background: BRAND.blueTint, borderTop: `2.5px solid ${BRAND.blue}`, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700, color: BRAND.blueDk, fontSize: 11 }}><Multi value={b.title} lang={lang} /></div>
                  <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 4 }}><Multi value={b.desc} lang={lang} /></div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Terms (unnumbered) */}
        {showSection('terms') && (
          <>
            <div style={{
              background: BRAND.antrasit, color: BRAND.white, fontWeight: 700, fontSize: 13,
              letterSpacing: 0.5, padding: '8px 12px', borderBottom: `2px solid ${BRAND.blue}`, marginTop: 18,
            }}>
              {tp('sec_terms')}
            </div>
            <div style={{ marginTop: 6 }}>
              {content.terms.map((t, i) => (
                <div key={i} style={{ fontSize: 11.5, color: BRAND.muted, lineHeight: 1.6 }}>
                  -  <Multi value={t} lang={lang} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: BRAND.antrasit, borderTop: `3px solid ${BRAND.blue}`, padding: '10px 18px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: BRAND.white, fontWeight: 700, fontSize: 9 }}><Multi value={brand.footer_left} lang={lang} /></div>
        <div style={{ color: '#C8CACE', fontSize: 9 }}>{resolveContentValue(brand.footer_right, lang) || tp('footer_right')}</div>
      </div>
    </div>
  );
}

const thStyle = (width) => ({
  width, textAlign: 'left', fontSize: 10, fontWeight: 700, padding: '7px 8px',
});
const tdStyle = { fontSize: 12, padding: '7px 8px', borderBottom: `1px solid ${BRAND.border}`, verticalAlign: 'middle' };

function priceBox(label, value, sub, bg, valColor, labelColor, strike) {
  return (
    <div style={{ flex: 1, background: bg, padding: '12px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: labelColor }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: valColor, lineHeight: 1.2, textDecoration: strike ? 'line-through' : 'none' }}>{value}</div>
      <div style={{ fontSize: 8.5, color: labelColor, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
