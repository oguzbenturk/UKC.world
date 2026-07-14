// Native jsPDF + autoTable bill renderer.
//
// Produces a pixel-perfect, vector-quality PDF that mirrors the on-screen
// bill design: centered Duotone Pro Center logo, double rule (black + teal),
// BILL TO / PERIOD grid, per-category section tables with subtotal headers,
// status pills, struck-through original prices on discounted rows, and the
// totals block (Subtotal → per-category breakdown → Payments received →
// Balance Due). Text remains real (selectable, searchable), tables paginate
// row-by-row so nothing is ever clipped, and Turkish characters are
// transliterated for Helvetica's Latin-1 charset.
//
// `exportBillPdfFromElement` kept as a fallback only.

import { CATEGORY_DISPLAY_ORDER, CATEGORY_LABELS } from './billAggregator';

const BRAND_RGB = [0, 168, 196];
const INK_RGB = [15, 23, 42];
const MUTED_RGB = [100, 116, 139];
const HAIRLINE_RGB = [226, 232, 240];
const ROW_HAIRLINE_RGB = [241, 245, 249];
const DISCOUNT_RGB = [225, 29, 72];
const PAID_RGB = [5, 150, 105];

const STATUS_LABEL = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  package: 'In package',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  charge: 'Charge',
  credit: 'Credit',
};
const STATUS_STYLE = {
  paid:      { fill: [220, 252, 231], text: [5, 122, 85] },
  unpaid:    { fill: [254, 243, 199], text: [161, 98, 7] },
  package:   { fill: [224, 242, 254], text: [3, 105, 161] },
  cancelled: { fill: [241, 245, 249], text: [100, 116, 139] },
  refunded:  { fill: [243, 232, 255], text: [126, 34, 206] },
  charge:    { fill: [241, 245, 249], text: [71, 85, 105] },
  credit:    { fill: [204, 251, 241], text: [15, 118, 110] },
};

const TURKISH_MAP = {
  'ı': 'i', 'İ': 'I',
  'ğ': 'g', 'Ğ': 'G',
  'ş': 's', 'Ş': 'S',
  'ç': 'c', 'Ç': 'C',
  'ö': 'o', 'Ö': 'O',
  'ü': 'u', 'Ü': 'U',
};

const transliterate = (input) => {
  if (input == null) return '';
  const s = String(input);
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  let out = '';
  for (const ch of s) out += TURKISH_MAP[ch] ?? ch;
  return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
};

const fmtShort = (date) => {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

async function loadLogoPngDataUrl(targetWidthPt = 280, dpr = 4) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const aspect = (img.naturalWidth && img.naturalHeight)
        ? img.naturalWidth / img.naturalHeight
        : 800 / 112.5;
      const canvas = document.createElement('canvas');
      const targetWidthPx = targetWidthPt * dpr;
      canvas.width = targetWidthPx;
      canvas.height = Math.round(targetWidthPx / aspect);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try { resolve({ dataUrl: canvas.toDataURL('image/png'), aspect }); }
      catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = '/dps-procenter.svg?v=3';
  });
}

// Strip leading non-letter junk (e.g. literal "### Name") that occasionally
// leaks in from imported customer data.
const cleanName = (name) => transliterate((name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'Customer');

export async function exportBillPdf({
  customerName,
  customerEmail,
  customerPhone,
  customerAddress,
  issuedAt,
  period,
  grouped,
  totals,
  baseCurrency,
  formatCurrency,
  isCohortMode = false,
  cohortPartyNames = [],
}) {
  const { default: jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const fmt = (v) => transliterate(formatCurrency(v || 0, baseCurrency));
  const tr = transliterate;
  const safeCustomerName = cleanName(customerName);

  // ── Letterhead ────────────────────────────────────────────────────────
  const logoTargetWidth = 320;
  const logo = await loadLogoPngDataUrl(logoTargetWidth);
  let separatorY = 76;
  if (logo) {
    const logoHeight = logoTargetWidth / logo.aspect;
    const logoX = (pageWidth - logoTargetWidth) / 2;
    const logoY = 36;
    doc.addImage(logo.dataUrl, 'PNG', logoX, logoY, logoTargetWidth, logoHeight);
    separatorY = logoY + logoHeight + 16;
  } else {
    doc.setFontSize(20);
    doc.setTextColor(...INK_RGB);
    doc.setFont('helvetica', 'bold');
    doc.text('DUOTONE PRO CENTER URLA', pageWidth / 2, 64, { align: 'center' });
    separatorY = 84;
  }

  // Heavy black rule + brand teal hairline below — editorial signature.
  doc.setDrawColor(...INK_RGB);
  doc.setLineWidth(2.4);
  doc.line(margin, separatorY, pageWidth - margin, separatorY);
  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(1.4);
  doc.line(margin, separatorY + 4, pageWidth - margin, separatorY + 4);
  doc.setLineWidth(0.2);

  // ── Bill-to / Period grid ─────────────────────────────────────────────
  let y = separatorY + 28;

  // Issued date (top-right)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_RGB);
  doc.text(`ISSUED ${tr((issuedAt || '').toUpperCase())}`, pageWidth - margin, y, { align: 'right' });
  y += 18;

  // Column labels
  const colMid = pageWidth / 2;
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'bold');
  doc.text(isCohortMode ? 'BILL TO (PAYER)' : 'BILL TO', margin, y);
  doc.text('PERIOD', colMid, y);
  y += 14;

  // Track separate Y cursors for the left (customer) and right (period) columns
  // so they can each grow independently without overlapping.
  let leftY = y;
  let rightY = y;

  // Customer name (left) + period value (right) — same baseline.
  doc.setFontSize(13);
  doc.setTextColor(...INK_RGB);
  doc.setFont('helvetica', 'bold');
  doc.text(safeCustomerName, margin, leftY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(period ? `${period[0]} → ${period[1]}` : 'All time', colMid, rightY);
  leftY += 14;
  rightY += 14;

  // Customer contacts (left column)
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (customerEmail) { doc.text(tr(customerEmail), margin, leftY); leftY += 11; }
  if (customerPhone) { doc.text(tr(customerPhone), margin, leftY); leftY += 11; }
  if (customerAddress) {
    doc.setTextColor(...MUTED_RGB);
    const addressLines = doc.splitTextToSize(tr(customerAddress), colMid - margin - 12);
    for (const line of addressLines) { doc.text(line, margin, leftY); leftY += 11; }
  }

  // Item count under period (right column)
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'bold');
  const itemCount = CATEGORY_DISPLAY_ORDER.reduce((acc, c) => acc + (grouped[c]?.length || 0), 0);
  doc.text(`${itemCount} ITEM${itemCount === 1 ? '' : 'S'} IN PERIOD`, colMid, rightY);
  rightY += 11;

  // Continue with the taller of the two columns.
  y = Math.max(leftY, rightY);

  // Cohort party tags
  if (isCohortMode && cohortPartyNames.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('COMBINED FOR', margin, y + 4);
    y += 16;
    let chipX = margin;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const name of cohortPartyNames) {
      const label = tr(name);
      const w = doc.getTextWidth(label) + 12;
      if (chipX + w > pageWidth - margin) { chipX = margin; y += 18; }
      doc.setFillColor(224, 242, 254);
      doc.setDrawColor(186, 230, 253);
      doc.roundedRect(chipX, y - 9, w, 14, 3, 3, 'FD');
      doc.setTextColor(3, 105, 161);
      doc.text(label, chipX + 6, y + 1);
      chipX += w + 4;
    }
    y += 8;
  }

  let cursorY = y + 18;

  // ── Section tables ────────────────────────────────────────────────────
  const visibleCategories = CATEGORY_DISPLAY_ORDER.filter((c) => (grouped[c]?.length || 0) > 0);
  const hasAnyDiscount = visibleCategories.some(
    (c) => (grouped[c] || []).some((r) => (r.discountAmount ?? 0) > 0)
  );

  for (const cat of visibleCategories) {
    const rows = grouped[cat];
    const subtotal = totals.subtotalsByCategory[cat] || 0;

    // ── Section banner (drawn as a separate one-row table so it stays
    //    grouped with its body table at page breaks) ───────────────────
    const bannerHeight = 22;
    if (cursorY + bannerHeight + 40 > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
    // Banner background
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, cursorY, contentWidth, bannerHeight, 'F');
    // Brand teal accent bar
    doc.setFillColor(...BRAND_RGB);
    doc.rect(margin, cursorY, 3, bannerHeight, 'F');
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK_RGB);
    doc.text(tr(CATEGORY_LABELS[cat]).toUpperCase(), margin + 12, cursorY + 14);
    // Row count chip
    const countLabel = String(rows.length);
    const countLabelWidth = doc.getTextWidth(countLabel) + 8;
    const titleWidth = doc.getTextWidth(tr(CATEGORY_LABELS[cat]).toUpperCase());
    doc.setDrawColor(...HAIRLINE_RGB);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 12 + titleWidth + 6, cursorY + 5, countLabelWidth, 12, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_RGB);
    doc.text(countLabel, margin + 12 + titleWidth + 6 + countLabelWidth / 2, cursorY + 13.5, { align: 'center' });
    // Subtotal (right)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK_RGB);
    doc.text(fmt(subtotal), pageWidth - margin - 6, cursorY + 14, { align: 'right' });
    cursorY += bannerHeight;

    // Body table
    const head = [[
      'Date',
      'Description',
      { content: 'Qty', styles: { halign: 'center' } },
      { content: 'Unit', styles: { halign: 'right' } },
      { content: 'Amount', styles: { halign: 'right' } },
      ...(hasAnyDiscount ? [{ content: 'Discount', styles: { halign: 'right' } }] : []),
      { content: 'Status', styles: { halign: 'center' } },
    ]];

    const body = rows.map((it) => {
      const isCancelled = it.status === 'cancelled';
      const isPackage = it.status === 'package';
      const hasDiscount = (it.discountAmount ?? 0) > 0;
      let descText = tr(it.description || '');
      if (it.detail) descText += `\n${tr(it.detail)}`;
      if (isCohortMode) {
        const parties = it.sharedCustomerNames?.length > 1
          ? it.sharedCustomerNames
          : (it.customerName ? [it.customerName] : []);
        if (parties.length > 0) descText += `\n${parties.map(tr).join(' · ')}`;
      }
      const amountCell = isPackage
        ? { content: 'included', styles: { fontStyle: 'italic', textColor: MUTED_RGB } }
        : hasDiscount
          ? { content: `${fmt(it.originalAmount)}\n${fmt(it.amount)}`, _hasStrike: true }
          : { content: fmt(it.amount) };
      const cells = [
        fmtShort(it.date),
        descText,
        { content: it.qtyDisplay ?? String(it.qty ?? 1) },
        { content: it.unitPrice != null ? fmt(it.unitPrice) : '—' },
        amountCell,
      ];
      if (hasAnyDiscount) {
        cells.push(hasDiscount
          ? { content: `${it.discountPercent}% −${fmt(it.discountAmount)}`, styles: { textColor: DISCOUNT_RGB, fontSize: 8 } }
          : { content: '—', styles: { textColor: [203, 213, 225] } });
      }
      cells.push({ content: STATUS_LABEL[it.status] || tr(it.status || ''), _statusKey: it.status });
      if (isCancelled) {
        cells.forEach((c) => {
          if (typeof c === 'string') return;
          c.styles = { ...(c.styles || {}), textColor: [148, 163, 184] };
        });
      }
      return cells;
    });

    // Compute column widths: Date 60, Qty 36, Unit 60, Amount 64,
    // (Discount 78), Status 70 — description gets the rest.
    const fixedCols = { date: 60, qty: 36, unit: 60, amount: 64, discount: 78, status: 70 };
    const descWidth = contentWidth
      - fixedCols.date
      - fixedCols.qty
      - fixedCols.unit
      - fixedCols.amount
      - (hasAnyDiscount ? fixedCols.discount : 0)
      - fixedCols.status;

    const columnStyles = {
      0: { cellWidth: fixedCols.date, halign: 'left' },
      1: { cellWidth: descWidth, halign: 'left' },
      2: { cellWidth: fixedCols.qty, halign: 'center' },
      3: { cellWidth: fixedCols.unit, halign: 'right' },
      4: { cellWidth: fixedCols.amount, halign: 'right' },
    };
    if (hasAnyDiscount) {
      columnStyles[5] = { cellWidth: fixedCols.discount, halign: 'right' };
      columnStyles[6] = { cellWidth: fixedCols.status, halign: 'center' };
    } else {
      columnStyles[5] = { cellWidth: fixedCols.status, halign: 'center' };
    }

    autoTable(doc, {
      startY: cursorY,
      head,
      body,
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: { top: 6, right: 8, bottom: 6, left: 10 },
        textColor: [51, 65, 85],
        lineColor: ROW_HAIRLINE_RGB,
        lineWidth: 0.4,
        valign: 'top',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [148, 163, 184],
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: { top: 6, right: 8, bottom: 6, left: 10 },
        lineColor: HAIRLINE_RGB,
        lineWidth: 0.4,
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles,
      margin: { left: margin, right: margin },
      tableLineColor: HAIRLINE_RGB,
      tableLineWidth: 0.4,
      // Status pill + struck-through original price rendering.
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const raw = data.cell.raw;
        if (!raw || typeof raw !== 'object') return;

        // Status pill (cell text was suppressed in didParseCell so we draw
        // the whole pill ourselves)
        if (raw._statusKey) {
          const style = STATUS_STYLE[raw._statusKey] || STATUS_STYLE.unpaid;
          const label = STATUS_LABEL[raw._statusKey] || raw._statusKey;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          const labelWidth = doc.getTextWidth(label);
          const padX = 8;
          const pillH = 12;
          const pillW = Math.max(labelWidth + padX * 2, 44);
          const cx = data.cell.x + data.cell.width / 2;
          const cy = data.cell.y + data.cell.height / 2;
          const px = cx - pillW / 2;
          const py = cy - pillH / 2;
          doc.setFillColor(...style.fill);
          doc.setDrawColor(...style.fill);
          doc.roundedRect(px, py, pillW, pillH, 6, 6, 'F');
          doc.setTextColor(...style.text);
          doc.text(label, cx, py + pillH / 2 + 2.4, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
        }

        // Strikethrough on the first line of a discounted Amount cell
        if (raw._hasStrike) {
          const lines = String(raw.content).split('\n');
          if (lines.length >= 1) {
            const original = lines[0];
            const cellRight = data.cell.x + data.cell.width - 8;
            const firstLineY = data.cell.y + 6 + 7; // padding + first line baseline approx
            const w = doc.getTextWidth(original);
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.6);
            doc.line(cellRight - w, firstLineY - 2, cellRight, firstLineY - 2);
            doc.setLineWidth(0.2);
          }
        }
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        // Right-align the Status column's raw text inside the cell so the
        // pill (drawn in didDrawCell) centers cleanly even before overdraw.
        if (data.cell.raw && data.cell.raw._statusKey) {
          data.cell.text = [''];
        }
      },
    });
    cursorY = doc.lastAutoTable.finalY + 14;
  }

  // ── Totals block ──────────────────────────────────────────────────────
  const totalsWidth = 280;
  const totalsLeft = pageWidth - margin - totalsWidth;
  const totalsRight = pageWidth - margin;
  // Approximate height needed for the totals so we keep them together.
  const perCategoryCount = visibleCategories.filter((c) => Math.abs(totals.subtotalsByCategory[c] || 0) >= 0.005).length;
  const perCustomerCount = isCohortMode && Array.isArray(totals.perCustomer) ? totals.perCustomer.length : 0;
  const approxTotalsHeight = 50 + perCategoryCount * 11 + (perCustomerCount > 0 ? 14 + perCustomerCount * 11 : 0) + 50;
  if (cursorY + approxTotalsHeight > pageHeight - margin) {
    doc.addPage();
    cursorY = margin;
  }

  // Heavy black rule above Subtotal
  doc.setDrawColor(...INK_RGB);
  doc.setLineWidth(1.6);
  doc.line(totalsLeft, cursorY, totalsRight, cursorY);
  doc.setLineWidth(0.2);
  cursorY += 16;

  // Subtotal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK_RGB);
  doc.text('Subtotal', totalsLeft, cursorY);
  doc.text(fmt(totals.subtotal), totalsRight, cursorY, { align: 'right' });
  cursorY += 12;

  // Per-category indented breakdown
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_RGB);
  for (const cat of visibleCategories) {
    const v = totals.subtotalsByCategory[cat] || 0;
    // Adjustments can net negative (customer in credit) — show any non-zero value.
    if (Math.abs(v) < 0.005) continue;
    doc.text(tr(CATEGORY_LABELS[cat]), totalsLeft + 12, cursorY);
    doc.text(fmt(v), totalsRight, cursorY, { align: 'right' });
    cursorY += 11;
  }

  // Per-customer breakdown (cohort mode only)
  if (isCohortMode && Array.isArray(totals.perCustomer) && totals.perCustomer.length > 1) {
    cursorY += 4;
    doc.setDrawColor(...HAIRLINE_RGB);
    doc.setLineWidth(0.4);
    doc.line(totalsLeft, cursorY, totalsRight, cursorY);
    cursorY += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('PER CUSTOMER', totalsLeft, cursorY);
    cursorY += 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    for (const pc of totals.perCustomer) {
      const label = tr(pc.customerName || '');
      doc.text(label, totalsLeft + 12, cursorY);
      doc.text(fmt(pc.subtotal), totalsRight, cursorY, { align: 'right' });
      cursorY += 11;
    }
  }

  // Hairline separator
  cursorY += 4;
  doc.setDrawColor(...HAIRLINE_RGB);
  doc.setLineWidth(0.4);
  doc.line(totalsLeft, cursorY, totalsRight, cursorY);
  cursorY += 14;

  // Payments received
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK_RGB);
  doc.text('Payments received', totalsLeft, cursorY);
  doc.setTextColor(...PAID_RGB);
  doc.text(fmt(totals.paymentsReceived), totalsRight, cursorY, { align: 'right' });
  cursorY += 14;

  // Heavy black rule before Balance Due
  doc.setDrawColor(...INK_RGB);
  doc.setLineWidth(1.6);
  doc.line(totalsLeft, cursorY, totalsRight, cursorY);
  doc.setLineWidth(0.2);
  cursorY += 20;

  // Balance Due — large, colored
  const dueRgb = totals.balanceDue > 0.005 ? DISCOUNT_RGB : BRAND_RGB;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK_RGB);
  doc.text('BALANCE DUE', totalsLeft, cursorY);
  doc.setFontSize(18);
  doc.setTextColor(...dueRgb);
  doc.text(fmt(totals.balanceDue), totalsRight, cursorY + 2, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  // ── Footer on every page ──────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Duotone Pro Center Urla', margin, pageHeight - 18);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
  }

  const safeName = safeCustomerName.replace(/[^a-zA-Z0-9-_]+/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  doc.save(`DPC-Statement-${safeName}-${datePart}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────
// Fallback: DOM-capture export. Kept for backwards compat — the native
// renderer above is the primary path now.
// ─────────────────────────────────────────────────────────────────────────
export async function exportBillPdfFromElement(element, filename = 'DPC-Statement.pdf') {
  if (!element) throw new Error('exportBillPdfFromElement: element is required');
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const DESKTOP_CAPTURE_WIDTH = 900;
  const clone = element.cloneNode(true);
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed;top:0;left:0;opacity:0;pointer-events:none;z-index:-1;width:${DESKTOP_CAPTURE_WIDTH}px;background:#ffffff`;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  let fullCanvas;
  try {
    fullCanvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: DESKTOP_CAPTURE_WIDTH,
      windowWidth: DESKTOP_CAPTURE_WIDTH,
      ignoreElements: (el) => !!(el.classList && el.classList.contains('ukc-bill-no-print')),
    });
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (fullCanvas.height / fullCanvas.width) * imgWidth;
  let position = margin;
  let heightLeft = imgHeight;
  const dataUrl = fullCanvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(dataUrl, 'JPEG', margin, position, imgWidth, imgHeight);
  heightLeft -= (pageHeight - margin * 2);
  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', margin, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - margin * 2);
  }
  pdf.save(filename);
}
