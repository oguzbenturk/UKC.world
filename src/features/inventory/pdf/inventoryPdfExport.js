// Branded Duotone Pro Center Urla PDF of the equipment inventory (whatever is
// currently filtered on the page). Same brand system as the spare-parts and
// proposal PDFs: antrasit header band + blue bar, runtime Unicode font so all six
// app languages render, footer with page numbers.

import dayjs from 'dayjs';
import { BRAND, hexToRgb } from '@/features/proposals/constants';
import { embedProposalFont } from '@/features/proposals/pdf/proposalFonts';
import { TYPE_ORDER } from '../utils/constants';
import { compareSizes } from '../utils/sizeKeys';

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
  roseBg: hexToRgb('#FDE8EC'),
  headerGrey: hexToRgb('#C8CACE'),
};

const typeRank = (typeKey) => {
  const i = TYPE_ORDER.indexOf(typeKey);
  return i === -1 ? TYPE_ORDER.length : i;
};

// Type → model family → size → asset code, so the printed list reads like the grid.
const sortUnits = (units) => [...units].sort((a, b) =>
  typeRank(a.typeKey) - typeRank(b.typeKey) ||
  a.family.localeCompare(b.family) ||
  compareSizes(a.sizeKey, b.sizeKey) ||
  (a.serialNumber || '').localeCompare(b.serialNumber || '')
);

/**
 * @param {object} args
 * @param {Array}  args.units          normalised units (see facets.normalizeUnit)
 * @param {object} args.ctx            { t, typeLabel, subtypeLabel, conditionLabel, statusLabel }
 * @param {string} args.filtersSummary human-readable description of the active filters ('' when none)
 * @param {object} args.stats          { total, available, maintenance, poor } for the whole inventory
 * @param {string} args.lang           i18n language for the embedded font
 */
export async function exportInventoryPdf({ units = [], ctx, filtersSummary = '', stats = {}, lang = 'en', fileTag = 'all' }) {
  const { t } = ctx;
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

  const title = t('common:inventory.pdfTitle', { defaultValue: 'Equipment inventory' });
  const generatedLabel = t('common:inventory.pdfGenerated', { defaultValue: 'Generated' });

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
  doc.text(`UKC · ${title}`, margin + 14, y + 40);
  doc.setFontSize(9);
  doc.setTextColor(...C.blue);
  doc.text(dayjs().format('DD.MM.YYYY HH:mm'), pageWidth - margin - 14, y + 24, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(...C.headerGrey);
  doc.text(
    `${units.length} ${t('common:inventory.statUnits', { defaultValue: 'units' })}`,
    pageWidth - margin - 14,
    y + 39,
    { align: 'right' }
  );
  y += headerH;
  doc.setFillColor(...C.blue);
  doc.rect(margin, y, cw, 5, 'F');
  y += 5 + 16;

  // ── Summary boxes (whole inventory) ────────────────────────────────────────
  const boxes = [
    { label: t('common:inventory.totalItems'), value: stats.total, color: C.antrasit },
    { label: t('common:inventory.statAvailable', { defaultValue: 'available' }), value: stats.available, color: C.emerald },
    { label: t('common:inventory.statMaintenance', { defaultValue: 'in maintenance' }), value: stats.maintenance, color: C.amber },
    { label: t('common:inventory.statPoor', { defaultValue: 'worn out' }), value: stats.poor, color: C.rose },
  ].filter((b) => b.value !== undefined);
  if (boxes.length) {
    const boxW = 150;
    const boxH = 46;
    let bx = margin;
    for (const b of boxes) {
      if (bx + boxW > pageWidth - margin) break;
      doc.setFillColor(...C.blueTint);
      doc.setDrawColor(...C.border);
      doc.roundedRect(bx, y, boxW, boxH, 5, 5, 'FD');
      setF('normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.text(String(b.label).toUpperCase(), bx + 12, y + 16);
      setF('bold');
      doc.setFontSize(15);
      doc.setTextColor(...b.color);
      doc.text(String(b.value ?? 0), bx + 12, y + 36);
      bx += boxW + 10;
    }
    y += boxH + 12;
  }

  // ── Active filters line ───────────────────────────────────────────────────
  if (filtersSummary) {
    setF('normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    const label = t('common:inventory.pdfFilters', { defaultValue: 'Filters' });
    doc.text(`${label}: ${filtersSummary}`, margin, y + 4);
    y += 16;
  }

  // ── Unit table ────────────────────────────────────────────────────────────
  const head = [[
    '#',
    t('common:inventory.assetCode'),
    t('common:inventory.equipmentType'),
    t('common:inventory.modelCol'),
    t('common:inventory.enteredName'),
    t('common:inventory.brand'),
    t('common:inventory.size'),
    t('common:inventory.subtype', { defaultValue: 'Sub-type' }),
    t('common:inventory.condition'),
    t('common:inventory.statusField'),
    t('common:inventory.location'),
  ]];

  const rows = sortUnits(units);
  const body = rows.map((u, i) => [
    String(i + 1),
    u.serialNumber || '—',
    ctx.typeLabel(u.typeKey),
    u.family || u.name,
    u.name,
    u.brand || '—',
    u.size || '—',
    (u.subtypes || []).map(ctx.subtypeLabel).join(' / ') || '—',
    u.condition ? ctx.conditionLabel(u.condition) : '—',
    ctx.statusLabel(u.status),
    u.location || '—',
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
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
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
      0: { cellWidth: 28, textColor: C.muted },
      1: { cellWidth: 60, fontStyle: 'bold' },
      2: { cellWidth: 68 },
      3: { cellWidth: 92, fontStyle: 'bold' },
      4: { cellWidth: 104, textColor: C.muted },
      5: { cellWidth: 68 },
      6: { cellWidth: 54, halign: 'center' },
      7: { cellWidth: 66 },
      8: { cellWidth: 60, halign: 'center' },
      9: { cellWidth: 68, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const u = rows[data.row.index];
      if (!u) return;
      if (data.column.index === 8) {
        if (u.condition === 'poor') {
          data.cell.styles.textColor = C.rose;
          data.cell.styles.fillColor = C.roseBg;
        } else if (u.condition === 'fair') {
          data.cell.styles.textColor = C.amber;
        }
      }
      if (data.column.index === 9) {
        if (u.status === 'maintenance') {
          data.cell.styles.textColor = C.amber;
          data.cell.styles.fillColor = C.amberBg;
        } else if (u.status === 'available') {
          data.cell.styles.textColor = C.emerald;
          data.cell.styles.fillColor = C.emeraldBg;
        } else if (u.status === 'retired') {
          data.cell.styles.textColor = C.muted;
        } else {
          data.cell.styles.textColor = C.blue;
        }
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
    doc.text('Duotone Pro Center Urla — UKC', margin, pageHeight - 20);
    doc.text(
      `${generatedLabel}: ${dayjs().format('DD.MM.YYYY HH:mm')}   ·   ${p} / ${pageCount}`,
      pageWidth - margin,
      pageHeight - 20,
      { align: 'right' }
    );
  }

  doc.save(`duotone-pro-center-urla-inventory-${fileTag}-${dayjs().format('YYYYMMDD')}.pdf`);
}
