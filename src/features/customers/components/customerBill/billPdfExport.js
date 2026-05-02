// PDF export for the Customer Bill. Lazy-imports jsPDF + jspdf-autotable so
// we don't pay the bundle cost unless the user actually clicks Download.
// Mirrors the export pattern at PayrollDashboard.jsx:233.

import { CATEGORY_DISPLAY_ORDER, CATEGORY_LABELS } from './billAggregator';

const BRAND_RGB = [0, 168, 196];

const fmtShort = (date) => date
  ? date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const STATUS_LABEL = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  package: 'Incl. in package',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

// jsPDF's built-in Helvetica only covers Latin-1, so Turkish glyphs (ğ, ş, ç,
// ı, İ, etc.) render as missing characters. Rather than embedding a heavy
// Unicode TTF (which made the layout look too bold), we transliterate Turkish
// characters to their closest ASCII equivalents at render time. Names like
// "Gürkan Köksal" become "Gurkan Koksal", which Helvetica draws cleanly.
const TURKISH_MAP = {
  'ı': 'i', 'İ': 'I',
  'ğ': 'g', 'Ğ': 'G',
  'ş': 's', 'Ş': 'S',
  'ç': 'c', 'Ç': 'C',
  'ö': 'o', 'Ö': 'O',
  'ü': 'u', 'Ü': 'U',
};

const transliterate = (input) => {
  if (input == null) return input;
  const s = String(input);
  // Fast path: skip non-ASCII detection if everything is ASCII already.
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  let out = '';
  for (const ch of s) {
    out += TURKISH_MAP[ch] ?? ch;
  }
  // Strip remaining combining diacritics from any non-Turkish accented
  // characters (é, à, etc.) so they degrade to plain ASCII too.
  return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
};

// Rasterize the Duotone Pro Center SVG to a high-DPI PNG data URL so jsPDF
// can embed it via addImage. We render at 4× the target print size so the
// logo stays crisp on paper.
async function loadLogoPngDataUrl(targetWidthPt = 280, dpr = 4) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || (800 / 112.5);
      const canvas = document.createElement('canvas');
      const targetWidthPx = targetWidthPt * dpr;
      canvas.width = targetWidthPx;
      canvas.height = Math.round(targetWidthPx / aspect);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve({ dataUrl: canvas.toDataURL('image/png'), aspect });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = '/dps-procenter.svg?v=3';
  });
}

export async function exportBillPdf({
  customerName,
  customerEmail,
  customerPhone,
  customerAddress,
  billRef,
  issuedAt,
  period,
  grouped,
  totals,
  baseCurrency,
  formatCurrency,
}) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  // Wrap formatCurrency so any currency-symbol/locale output flows through
  // transliteration too (e.g. NBSP narrow spaces from Intl.NumberFormat).
  const fmt = (v) => transliterate(formatCurrency(v || 0, baseCurrency));
  const tr = transliterate;

  // ── Letterhead ────────────────────────────────────────────────────────
  // Centered Duotone Pro Center logo + double rule (matches on-screen bill).
  const logoTargetWidth = 280; // points
  const logo = await loadLogoPngDataUrl(logoTargetWidth);
  let separatorY = 70;
  if (logo) {
    const logoHeight = logoTargetWidth / logo.aspect;
    const logoX = (pageWidth - logoTargetWidth) / 2;
    const logoY = 30;
    doc.addImage(logo.dataUrl, 'PNG', logoX, logoY, logoTargetWidth, logoHeight);
    separatorY = logoY + logoHeight + 14;
  } else {
    // Fallback: bold wordmark if the SVG fails to load.
    doc.setFontSize(18);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text('DUOTONE PRO CENTER', pageWidth / 2, 56, { align: 'center' });
    separatorY = 74;
  }

  // Double-rule signature: heavy black + brand teal hairline below.
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1.5);
  doc.line(margin, separatorY, pageWidth - margin, separatorY);
  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(0.8);
  doc.line(margin, separatorY + 3, pageWidth - margin, separatorY + 3);
  doc.setLineWidth(0.2);

  // Issued date aligned right, like the on-screen bill.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`ISSUED ${(issuedAt || '').toUpperCase()}`, pageWidth - margin, separatorY + 18, { align: 'right' });

  // ── Bill-to ───────────────────────────────────────────────────────────
  let y = separatorY + 38;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('BILL TO', margin, y);
  doc.text('PERIOD', pageWidth / 2, y);
  y += 14;
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(tr(customerName || ''), margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(period ? `${period[0]} - ${period[1]}` : 'All time', pageWidth / 2, y);
  y += 12;
  if (customerEmail) { doc.text(tr(customerEmail), margin, y); y += 11; }
  if (customerPhone) { doc.text(tr(customerPhone), margin, y); y += 11; }
  if (customerAddress) {
    doc.setTextColor(120, 120, 120);
    doc.text(tr(customerAddress), margin, y);
    y += 11;
  }

  let cursorY = y + 14;

  // ── Section tables ────────────────────────────────────────────────────
  for (const cat of CATEGORY_DISPLAY_ORDER) {
    const rows = grouped[cat];
    if (!rows || rows.length === 0) continue;
    const subtotal = totals.subtotalsByCategory[cat] || 0;

    autoTable(doc, {
      startY: cursorY,
      head: [[
        {
          content: `${CATEGORY_LABELS[cat]}  (${rows.length})`,
          colSpan: 5,
          styles: { halign: 'left', fillColor: [245, 247, 250], textColor: [40, 60, 80], fontStyle: 'bold' },
        },
        {
          content: fmt(subtotal),
          styles: { halign: 'right', fillColor: [245, 247, 250], textColor: [40, 60, 80], fontStyle: 'bold' },
        },
      ], [
        'Date', 'Description', 'Qty', 'Unit price', 'Amount', 'Status',
      ]],
      body: rows.map(it => [
        fmtShort(it.date),
        tr(it.description) + (it.detail ? `\n${tr(it.detail)}` : ''),
        it.qtyDisplay ?? String(it.qty),
        it.unitPrice != null ? fmt(it.unitPrice) : '-',
        it.status === 'package' ? 'included' : fmt(it.amount),
        STATUS_LABEL[it.status] || it.status,
      ]),
      styles: { fontSize: 8, cellPadding: 4, lineColor: [230, 230, 230] },
      headStyles: { fillColor: [255, 255, 255], textColor: [120, 120, 120], fontStyle: 'normal', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 60, halign: 'right' },
        4: { cellWidth: 60, halign: 'right' },
        5: { cellWidth: 70, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.row.section === 'body') {
          const row = rows[data.row.index];
          if (row?.status === 'cancelled') {
            data.cell.styles.textColor = [180, 180, 180];
          }
          if (data.column.index === 4 || data.column.index === 2 || data.column.index === 3) {
            data.cell.styles.halign = 'right';
          }
        }
      },
      margin: { left: margin, right: margin },
    });
    cursorY = doc.lastAutoTable.finalY + 14;
  }

  // ── Totals — mirrors the on-screen layout ────────────────────────────
  // Heavy black rule above Subtotal, indented category subtotals in light
  // gray, Payments / Refunds in colored bold, heavy black rule above
  // Balance Due, Balance Due as the largest line.
  if (cursorY > doc.internal.pageSize.getHeight() - 220) {
    doc.addPage();
    cursorY = 60;
  }

  const totalsBlockWidth = 280;
  const totalsLeft = pageWidth - margin - totalsBlockWidth;
  const totalsRight = pageWidth - margin;

  // Top heavy black rule
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1.2);
  doc.line(totalsLeft, cursorY, totalsRight, cursorY);
  doc.setLineWidth(0.2);
  cursorY += 14;

  // Subtotal (medium)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('Subtotal', totalsLeft, cursorY);
  doc.text(fmt(totals.subtotal), totalsRight, cursorY, { align: 'right' });
  cursorY += 12;

  // Indented category subtotals (small, gray)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  for (const cat of CATEGORY_DISPLAY_ORDER) {
    const v = totals.subtotalsByCategory[cat] || 0;
    if (v <= 0) continue;
    doc.text(CATEGORY_LABELS[cat], totalsLeft + 12, cursorY);
    doc.text(fmt(v), totalsRight, cursorY, { align: 'right' });
    cursorY += 11;
  }

  // Hairline separator
  cursorY += 4;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(totalsLeft, cursorY, totalsRight, cursorY);
  cursorY += 12;

  // Payments received (emerald) — shown as a positive amount; the math
  // (Subtotal − Payments = Balance Due) is conveyed by the Balance Due row,
  // not by a leading minus sign.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('Payments received', totalsLeft, cursorY);
  doc.setTextColor(5, 150, 105);
  doc.text(fmt(totals.paymentsReceived), totalsRight, cursorY, { align: 'right' });
  cursorY += 13;

  // Bottom heavy black rule before Balance Due
  cursorY += 4;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1.2);
  doc.line(totalsLeft, cursorY, totalsRight, cursorY);
  doc.setLineWidth(0.2);
  cursorY += 18;

  // Balance Due (large, bold, colored)
  const balanceColor = totals.balanceDue > 0.005 ? [225, 29, 72] : BRAND_RGB;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('BALANCE DUE', totalsLeft, cursorY);
  doc.setFontSize(16);
  doc.setTextColor(...balanceColor);
  doc.text(fmt(totals.balanceDue), totalsRight, cursorY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  cursorY += 14;

  // ── Footer note ───────────────────────────────────────────────────────
  const footY = doc.internal.pageSize.getHeight() - 28;
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text(
    'This statement reflects activity on file at the time of generation. Contact Duotone Pro Center Urla for discrepancies.',
    margin,
    footY,
  );
  doc.text('Duotone Pro Center Urla  ·  Powered by UKC', pageWidth - margin, footY, { align: 'right' });

  const safeName = (customerName || 'Customer').replace(/[^a-zA-Z0-9-_]+/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  doc.save(`DPC-Statement-${safeName}-${datePart}.pdf`);
}
