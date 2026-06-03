// Client-side jsPDF + autoTable generator for the Teklif (proposal) PDF.
// Mirrors ProposalPreview: Antrasit header band, Duotone-blue accents, package
// overview + weekly schedule tables, 3-box price summary, included cards,
// benefits cards, terms. Unicode font embedded per language (no transliteration).

import { BRAND, SECTION_ORDER, hexToRgb } from '../constants';
import { resolveContentValue } from '../utils/contentValue';
import { computeProposalTotals } from '../utils/totals';
import { loadProposalLabels } from '../hooks/useProposalLabels';
import { embedProposalFont } from './proposalFonts';

const C = {
  antrasit: hexToRgb(BRAND.antrasit),
  antrasitDk: hexToRgb(BRAND.antrasitDk),
  antrasitLt: hexToRgb(BRAND.antrasitLt),
  blue: hexToRgb(BRAND.blue),
  blueDk: hexToRgb(BRAND.blueDk),
  blueTint: hexToRgb(BRAND.blueTint),
  blueTextSoft: hexToRgb(BRAND.blueTextSoft),
  ink: hexToRgb(BRAND.ink),
  muted: hexToRgb(BRAND.muted),
  rowLight: hexToRgb(BRAND.rowLight),
  rowStripe: hexToRgb(BRAND.rowStripe),
  border: hexToRgb(BRAND.border),
  white: [255, 255, 255],
  softBlueSub: hexToRgb('#DFF3FC'),
  headerGrey: hexToRgb('#C8CACE'),
  headerGrey2: hexToRgb('#A8ABB0'),
};

const fmtDate = (value, lang) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value || '');
  try {
    return new Intl.DateTimeFormat(lang, { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

export async function exportProposalPdf({
  content = {},
  lang = 'en',
  preparedFor = '',
  quoteDate,
  currencyCode = 'EUR',
  fileName,
  output = 'save', // 'save' | 'bloburl'
}) {
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;
  const tpRaw = await loadProposalLabels(lang);
  const tp = (k) => tpRaw(`pdf.${k}`); // structural labels live under the `pdf` block

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const FAMILY = await embedProposalFont(doc, lang);
  const setF = (style = 'normal') => doc.setFont(FAMILY, style);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const cw = pageWidth - margin * 2;
  const FOOTER_H = 34;
  const bottomLimit = pageHeight - FOOTER_H - 8;

  const T = (v) => resolveContentValue(v, lang);
  const brand = content.brand || {};
  const sections = content.sections || {};

  let y = margin;
  const ensureSpace = (h) => {
    if (y + h > bottomLimit) { doc.addPage(); y = margin; }
  };

  // ── Header band ───────────────────────────────────────────────────────────
  const headerH = 54;
  doc.setFillColor(...C.antrasit);
  doc.rect(margin, y, cw, headerH, 'F');
  setF('bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.white);
  doc.text(T(brand.title) || 'DUOTONE PRO CENTER URLA', margin + 14, y + 26);
  setF('normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.headerGrey);
  doc.text(T(brand.subtitle) || '', margin + 14, y + 42);
  // right column
  doc.setFontSize(9);
  doc.setTextColor(...C.blue);
  doc.text(`${tp('quotation')}  |  ${fmtDate(quoteDate, lang)}`, pageWidth - margin - 14, y + 24, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(...C.headerGrey2);
  doc.text(T(brand.website) || '', pageWidth - margin - 14, y + 38, { align: 'right' });
  y += headerH;
  // blue bar
  doc.setFillColor(...C.blue);
  doc.rect(margin, y, cw, 6, 'F');
  y += 6 + 18;

  // section counter (numbered sections only)
  let counter = 0;
  const sectionBanner = (labelKey, numbered = true) => {
    ensureSpace(40);
    const h = 22;
    doc.setFillColor(...C.antrasit);
    doc.rect(margin, y, cw, h, 'F');
    doc.setFillColor(...C.blue);
    doc.rect(margin, y + h, cw, 2, 'F'); // blue underline
    setF('bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.white);
    let label = tp(labelKey);
    if (numbered) { counter += 1; label = `${counter}.  ${label}`; }
    doc.text(label, margin + 10, y + 15);
    y += h + 2 + 8;
  };

  const hasContent = (key) => {
    if (!sections[key]) return false;
    const val = content[key];
    if (Array.isArray(val)) return val.length > 0;
    if (key === 'intro') return !!T(val);
    return true;
  };

  // ── Prepared for + intro ────────────────────────────────────────────────────
  if (preparedFor) {
    setF('normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.antrasit);
    doc.text(`${tp('prepared_for')}: `, margin, y);
    const lblW = doc.getTextWidth(`${tp('prepared_for')}: `);
    setF('bold');
    doc.text(String(preparedFor), margin + lblW, y);
    y += 16;
  }
  if (hasContent('intro')) {
    setF('normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.ink);
    const lines = doc.splitTextToSize(T(content.intro).replace(/\n/g, ' '), cw);
    ensureSpace(lines.length * 14 + 6);
    doc.text(lines, margin, y, { lineHeightFactor: 1.45 });
    y += lines.length * 14 + 8;
  }

  // ── 1. Package overview (autoTable) ─────────────────────────────────────────
  if (hasContent('package_items')) {
    sectionBanner('sec_overview');
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: FOOTER_H + 8 },
      head: [[tp('th_item'), tp('th_details'), tp('th_regular'), tp('th_cash')]],
      body: content.package_items.map((it) => [
        T(it.item), T(it.details), T(it.regular), T(it.cash),
      ]),
      styles: { font: FAMILY, fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 8, right: 8 }, lineColor: C.border, lineWidth: 0.5, textColor: C.ink, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: C.antrasitDk, textColor: C.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.rowStripe },
      bodyStyles: { fillColor: C.rowLight },
      columnStyles: {
        0: { cellWidth: cw * 0.22, fontStyle: 'bold', textColor: C.antrasit },
        1: { cellWidth: cw * 0.38 },
        2: { cellWidth: cw * 0.20, halign: 'center', textColor: C.muted },
        3: { cellWidth: cw * 0.20, halign: 'center', fontStyle: 'bold', textColor: C.blueDk },
      },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ── 2. Price summary (3 manual boxes) ───────────────────────────────────────
  if (hasContent('price_summary')) {
    sectionBanner('sec_price');
    const totals = computeProposalTotals(content, currencyCode);
    const ps = content.price_summary || {};
    const boxH = 72;
    ensureSpace(boxH);
    const gap = 2;
    const boxW = (cw - gap * 2) / 3;
    const drawBox = (idx, label, value, sub, bg, valColor, labelColor, strike) => {
      const x = margin + idx * (boxW + gap);
      doc.setFillColor(...bg);
      doc.rect(x, y, boxW, boxH, 'F');
      setF('normal');
      doc.setFontSize(8);
      doc.setTextColor(...labelColor);
      doc.text(label, x + boxW / 2, y + 16, { align: 'center' });
      setF('bold');
      doc.setFontSize(22);
      doc.setTextColor(...valColor);
      doc.text(String(value), x + boxW / 2, y + 44, { align: 'center' });
      if (strike && value) {
        const vw = doc.getTextWidth(String(value));
        doc.setDrawColor(...valColor);
        doc.setLineWidth(1.2);
        doc.line(x + boxW / 2 - vw / 2, y + 39, x + boxW / 2 + vw / 2, y + 39);
      }
      setF('normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...labelColor);
      doc.text(doc.splitTextToSize(sub || '', boxW - 10), x + boxW / 2, y + 60, { align: 'center' });
    };
    drawBox(0, tp('ps_regular'), T(ps.regular_total) || totals.regularTotalStr, T(ps.regular_sub), C.rowLight, C.antrasitLt, C.muted, true);
    drawBox(1, tp('ps_save'), T(ps.savings) || totals.savingsStr, T(ps.savings_sub), C.antrasit, C.blue, C.blueTextSoft, false);
    drawBox(2, tp('ps_cash'), T(ps.cash_price) || totals.cashPriceStr, T(ps.cash_sub), C.blue, C.white, C.softBlueSub, false);
    y += boxH + 14;
  }

  // ── 3. What's included (manual rows: label box + description) ────────────────
  if (hasContent('included')) {
    sectionBanner('sec_included');
    const labelW = cw * 0.27;
    const descW = cw * 0.73;
    content.included.forEach((b, i) => {
      setF('normal');
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(T(b.desc), descW - 22);
      const rowH = Math.max(46, descLines.length * 13 + 18);
      ensureSpace(rowH);
      // backgrounds
      doc.setFillColor(...(i % 2 ? C.rowStripe : C.rowLight));
      doc.rect(margin, y, cw, rowH, 'F');
      doc.setFillColor(...C.antrasit);
      doc.rect(margin, y, labelW, rowH, 'F');
      doc.setFillColor(...C.blue);
      doc.rect(margin, y + rowH - 2, labelW, 2, 'F');
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, cw, rowH);
      // label box text
      setF('bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.white);
      const titleLines = doc.splitTextToSize(T(b.title), labelW - 12);
      doc.text(titleLines, margin + labelW / 2, y + 16, { align: 'center' });
      setF('normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.blueTextSoft);
      const subLines = doc.splitTextToSize(T(b.sub), labelW - 12);
      doc.text(subLines, margin + labelW / 2, y + 16 + titleLines.length * 11, { align: 'center' });
      // description
      setF('normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      doc.text(descLines, margin + labelW + 12, y + 16, { lineHeightFactor: 1.4 });
      y += rowH;
    });
    y += 14;
  }

  // ── 4. Weekly schedule (autoTable, highlight rows) ───────────────────────────
  if (hasContent('schedule')) {
    sectionBanner('sec_schedule');
    const highlightSet = new Set();
    content.schedule.forEach((d, i) => { if (d.highlight) highlightSet.add(i); });
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: FOOTER_H + 8 },
      head: [[tp('sh_day'), tp('sh_date'), tp('sh_activity'), tp('sh_rental'), tp('sh_cost')]],
      body: content.schedule.map((d) => [T(d.day), T(d.date), T(d.activity), T(d.rental) || '-', T(d.cost) || '-']),
      styles: { font: FAMILY, fontSize: 8.5, cellPadding: { top: 7, bottom: 7, left: 7, right: 7 }, lineColor: C.border, lineWidth: 0.5, textColor: C.ink, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: C.antrasitDk, textColor: C.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.rowStripe },
      bodyStyles: { fillColor: C.rowLight },
      columnStyles: {
        0: { cellWidth: cw * 0.10, halign: 'center' },
        1: { cellWidth: cw * 0.11, halign: 'center' },
        2: { cellWidth: cw * 0.46 },
        3: { cellWidth: cw * 0.16, halign: 'center' },
        4: { cellWidth: cw * 0.17, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const isHi = highlightSet.has(data.row.index);
        if (isHi && data.column.index === 0) {
          data.cell.styles.fillColor = C.blue;
          data.cell.styles.textColor = C.white;
          data.cell.styles.fontStyle = 'bold';
        }
        if (isHi && (data.column.index === 3 || data.column.index === 4)) {
          data.cell.styles.textColor = C.blueDk;
          if (data.column.index === 4) data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
    if (T(content.schedule_note)) {
      setF('normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.muted);
      const noteLines = doc.splitTextToSize(T(content.schedule_note), cw);
      ensureSpace(noteLines.length * 10 + 6);
      doc.text(noteLines, margin, y, { lineHeightFactor: 1.3 });
      y += noteLines.length * 10 + 8;
    } else {
      y += 8;
    }
  }

  // ── 5. Benefits (manual 2-col cards) ─────────────────────────────────────────
  if (hasContent('benefits')) {
    sectionBanner('sec_benefits');
    const colGap = 8;
    const colW = (cw - colGap) / 2;
    for (let i = 0; i < content.benefits.length; i += 2) {
      const pair = [content.benefits[i], content.benefits[i + 1]].filter(Boolean);
      // measure
      const measured = pair.map((b) => {
        doc.setFontSize(8.5);
        const titleLines = doc.splitTextToSize(T(b.title), colW - 20);
        const descLines = doc.splitTextToSize(T(b.desc), colW - 20);
        return { b, titleLines, descLines, h: 14 + titleLines.length * 12 + descLines.length * 12 + 14 };
      });
      const rowH = Math.max(...measured.map((m) => m.h));
      ensureSpace(rowH + 8);
      measured.forEach((m, j) => {
        const x = margin + j * (colW + colGap);
        doc.setFillColor(...C.blueTint);
        doc.rect(x, y, colW, rowH, 'F');
        doc.setFillColor(...C.blue);
        doc.rect(x, y, colW, 2.5, 'F'); // top accent
        setF('bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...C.blueDk);
        doc.text(m.titleLines, x + 10, y + 16);
        setF('normal');
        doc.setTextColor(...C.ink);
        doc.text(m.descLines, x + 10, y + 16 + m.titleLines.length * 12 + 4, { lineHeightFactor: 1.4 });
      });
      y += rowH + 8;
    }
    y += 6;
  }

  // ── Terms (unnumbered) ───────────────────────────────────────────────────────
  if (hasContent('terms')) {
    sectionBanner('sec_terms', false);
    setF('normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    content.terms.forEach((t) => {
      const lines = doc.splitTextToSize(`-  ${T(t)}`, cw - 6);
      ensureSpace(lines.length * 13 + 4);
      doc.text(lines, margin, y, { lineHeightFactor: 1.5 });
      y += lines.length * 13 + 4;
    });
  }

  // ── Footer on every page ─────────────────────────────────────────────────────
  const footerLeft = T(brand.footer_left) || 'Duotone Pro Center Urla  (UKC)  |  Urla, Izmir, Turkey';
  const footerRight = T(brand.footer_right) || tp('footer_right');
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    const fy = pageHeight - FOOTER_H;
    doc.setFillColor(...C.antrasit);
    doc.rect(margin, fy, cw, FOOTER_H, 'F');
    doc.setFillColor(...C.blue);
    doc.rect(margin, fy, cw, 3, 'F');
    setF('bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.white);
    doc.text(footerLeft, margin + 14, fy + 21);
    setF('normal');
    doc.setTextColor(...C.headerGrey);
    doc.text(footerRight, pageWidth - margin - 14, fy + 21, { align: 'right' });
  }

  const safeName = (fileName || 'teklif').replace(/[^\w.-]+/g, '_');
  if (output === 'bloburl') {
    return doc.output('bloburl');
  }
  doc.save(`${safeName}.pdf`);
  return null;
}
