// Branded Duotone Pro Center Urla PDF export for the spare-parts manifest.
// Reuses the proposal PDF brand system (antrasit header band + blue bar) and
// its runtime Unicode font embedding so all 6 app languages render correctly.

import dayjs from 'dayjs';
import { BRAND, hexToRgb } from '@/features/proposals/constants';
import { embedProposalFont } from '@/features/proposals/pdf/proposalFonts';

const C = {
  antrasit: hexToRgb(BRAND.antrasit),
  blue: hexToRgb(BRAND.blue),
  blueTint: hexToRgb(BRAND.blueTint),
  ink: hexToRgb(BRAND.ink),
  muted: hexToRgb(BRAND.muted),
  rowStripe: hexToRgb(BRAND.rowStripe),
  border: hexToRgb(BRAND.border),
  white: [255, 255, 255],
  amber: hexToRgb('#D97706'),
  amberBg: hexToRgb('#FEF3E2'),
  emerald: hexToRgb('#059669'),
  emeraldBg: hexToRgb('#E7F6EF'),
  rose: hexToRgb('#E11D48'),
  headerGrey: hexToRgb('#C8CACE'),
};

const CURRENCY_SYMBOLS = { EUR: '€', TRY: '₺', USD: '$', GBP: '£' };

const money = (amount, currency = 'EUR') => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${sym}${Number(amount).toFixed(2)}`;
};

const d = (v) => (v ? dayjs(v).format('DD.MM.YYYY') : '—');

export async function exportSparePartsPdf({ orders = [], totals = {}, t, lang = 'en' }) {
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const FAMILY = await embedProposalFont(doc, lang);
  const setF = (style = 'normal') => doc.setFont(FAMILY, style);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const cw = pageWidth - margin * 2;
  let y = margin;

  // ── Header band ────────────────────────────────────────────────────────────
  const headerH = 52;
  doc.setFillColor(...C.antrasit);
  doc.rect(margin, y, cw, headerH, 'F');
  setF('bold');
  doc.setFontSize(17);
  doc.setTextColor(...C.white);
  doc.text('DUOTONE PRO CENTER URLA', margin + 14, y + 25);
  setF('normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.headerGrey);
  doc.text(`UKC.Care · ${t('admin:spareParts.title')}`, margin + 14, y + 40);
  doc.setFontSize(9);
  doc.setTextColor(...C.blue);
  doc.text(dayjs().format('DD.MM.YYYY HH:mm'), pageWidth - margin - 14, y + 24, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(...C.headerGrey);
  doc.text(t('admin:spareParts.results', { count: orders.length }), pageWidth - margin - 14, y + 39, { align: 'right' });
  y += headerH;
  doc.setFillColor(...C.blue);
  doc.rect(margin, y, cw, 5, 'F');
  y += 5 + 16;

  // ── Per-currency summary boxes ────────────────────────────────────────────
  const currencies = Object.entries(totals);
  if (currencies.length) {
    const boxW = 200;
    const boxH = 52;
    let bx = margin;
    for (const [cur, v] of currencies) {
      if (bx + boxW > pageWidth - margin) break; // never overflow the row
      doc.setFillColor(...C.blueTint);
      doc.setDrawColor(...C.border);
      doc.roundedRect(bx, y, boxW, boxH, 5, 5, 'FD');
      setF('bold');
      doc.setFontSize(10);
      doc.setTextColor(...C.antrasit);
      doc.text(cur, bx + 12, y + 18);
      doc.setFontSize(7);
      doc.setTextColor(...C.amber);
      doc.text(t('admin:spareParts.totals.outstanding').toUpperCase(), bx + 12, y + 32);
      doc.setFontSize(11);
      doc.text(money(v.unpaid, cur), bx + 12, y + 45);
      doc.setFontSize(7);
      doc.setTextColor(...C.emerald);
      doc.text(t('admin:spareParts.totals.paid').toUpperCase(), bx + 110, y + 32);
      doc.setFontSize(11);
      doc.text(money(v.paid, cur), bx + 110, y + 45);
      bx += boxW + 12;
    }
    y += boxH + 16;
  }

  // ── Manifest table ────────────────────────────────────────────────────────
  const head = [[
    '#',
    t('admin:spareParts.table.part'),
    t('admin:spareParts.table.quantity'),
    t('admin:spareParts.table.supplier'),
    t('admin:spareParts.table.status'),
    t('admin:spareParts.pdf.created'),
    t('admin:spareParts.filters.status.ordered'),
    t('admin:spareParts.filters.status.received'),
    t('admin:spareParts.table.payment'),
    t('admin:spareParts.table.cost'),
  ]];

  const body = orders.map((o) => [
    String(o.id).padStart(4, '0'),
    o.notes ? `${o.partName}\n${o.notes}` : o.partName,
    `×${o.quantity}`,
    o.supplier || '—',
    t(`admin:spareParts.filters.status.${o.status}`),
    d(o.createdAt),
    d(o.orderedAt),
    d(o.receivedAt),
    o.paymentStatus === 'paid' ? t('admin:spareParts.payment.paid') : t('admin:spareParts.payment.unpaid'),
    money(o.costAmount, o.currency),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 46 },
    head,
    body,
    theme: 'grid',
    styles: {
      font: FAMILY,
      fontSize: 8,
      textColor: C.ink,
      lineColor: C.border,
      lineWidth: 0.4,
      cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: C.antrasit,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: C.rowStripe },
    columnStyles: {
      0: { cellWidth: 36, textColor: C.muted },
      1: { cellWidth: 170, fontStyle: 'bold' },
      2: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 74 },
      5: { cellWidth: 62, textColor: C.muted },
      6: { cellWidth: 62, textColor: C.muted },
      7: { cellWidth: 62, textColor: C.muted },
      8: { cellWidth: 66, fontStyle: 'bold', halign: 'center' },
      9: { cellWidth: 64, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const order = orders[data.row.index];
      if (!order) return;
      if (data.column.index === 8) {
        const paid = order.paymentStatus === 'paid';
        data.cell.styles.textColor = paid ? C.emerald : C.amber;
        data.cell.styles.fillColor = paid ? C.emeraldBg : C.amberBg;
      }
      if (data.column.index === 4) {
        if (order.status === 'cancelled') data.cell.styles.textColor = C.rose;
        else if (order.status === 'received') data.cell.styles.textColor = C.emerald;
        else if (order.status === 'ordered') data.cell.styles.textColor = C.blue;
        else data.cell.styles.textColor = C.muted;
      }
    },
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.border);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    setF('normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text('UKC.Care — Duotone Pro Center Urla', margin, pageHeight - 20);
    doc.text(
      `${t('admin:spareParts.pdf.generated')}: ${dayjs().format('DD.MM.YYYY HH:mm')}   ·   ${p} / ${pageCount}`,
      pageWidth - margin,
      pageHeight - 20,
      { align: 'right' }
    );
  }

  doc.save(`duotone-pro-center-urla-spare-parts-${dayjs().format('YYYYMMDD')}.pdf`);
}
