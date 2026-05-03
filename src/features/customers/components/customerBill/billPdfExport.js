// PDF export for the Customer Bill. Two paths:
//
//   1) `exportBillPdfFromElement(element, filename)` — preferred. Captures
//      the on-screen bill DOM with html2canvas and embeds it into a jsPDF
//      A4 doc, paginating across pages when the bill is taller than one
//      page. The PDF becomes a 1:1 visual match of the modal — same colors,
//      icons, status pills, table alignment, totals block.
//
//   2) `exportBillPdf({...})` — legacy text-based fallback that draws every
//      element manually with jsPDF text() / autoTable() calls. Kept around
//      so the export still works if html2canvas fails or the DOM ref is
//      somehow unavailable, but no longer the primary path.

import { CATEGORY_DISPLAY_ORDER, CATEGORY_LABELS } from './billAggregator';

// ─────────────────────────────────────────────────────────────────────────
// Path 1: DOM-capture export
// ─────────────────────────────────────────────────────────────────────────
export async function exportBillPdfFromElement(element, filename = 'DPC-Statement.pdf') {
  if (!element) throw new Error('exportBillPdfFromElement: element is required');

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // Wait for any <img> elements inside the bill to finish loading. html2canvas
  // captures synchronously, so an SVG/PNG that hasn't decoded yet shows up as
  // an empty space (which is what made the Duotone Pro Center logo disappear
  // from the first capture if the user hit Download immediately on open).
  const imgs = Array.from(element.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      // Safety timeout so a stuck image doesn't block the PDF forever.
      setTimeout(done, 3000);
    });
  }));

  // html2canvas reliably fails to rasterize SVG <img> sources — even when
  // loaded, even as a base64 data URL, even with allowTaint. The bulletproof
  // workaround is to rasterize the SVG to a PNG ourselves via canvas, then
  // swap the img's src to that PNG data URL before html2canvas runs. The
  // canvas API handles SVG drawing perfectly and emits a PNG that
  // html2canvas trivially copies into the capture.
  const restoreImgSrcs = [];
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!src.toLowerCase().includes('.svg')) continue;
    try {
      // Decode the SVG into a fresh Image (separate from the live <img> so
      // the user-visible element isn't flickered).
      const sourceImg = new Image();
      sourceImg.crossOrigin = 'anonymous';
      sourceImg.src = src;
      await new Promise((resolve, reject) => {
        if (sourceImg.complete && sourceImg.naturalWidth > 0) return resolve();
        sourceImg.addEventListener('load', resolve, { once: true });
        sourceImg.addEventListener('error', reject, { once: true });
        setTimeout(() => reject(new Error('svg load timeout')), 4000);
      });

      // Use the on-screen displayed size × 2 for retina-grade crispness.
      const displayWidth = img.clientWidth || sourceImg.naturalWidth || 600;
      const aspect = (sourceImg.naturalHeight && sourceImg.naturalWidth)
        ? sourceImg.naturalHeight / sourceImg.naturalWidth
        : (112.5 / 800);
      const displayHeight = img.clientHeight || Math.round(displayWidth * aspect);

      const offscreen = document.createElement('canvas');
      offscreen.width = displayWidth * 2;
      offscreen.height = displayHeight * 2;
      const ctx = offscreen.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(sourceImg, 0, 0, offscreen.width, offscreen.height);
      const pngDataUrl = offscreen.toDataURL('image/png');

      // Temporarily detach the modal img's onerror so a load failure on the
      // PNG (extremely unlikely, but defensive) doesn't permanently hide the
      // live logo via the modal's `onError={display:none}` handler.
      const originalOnError = img.onerror;
      img.onerror = null;

      restoreImgSrcs.push({ img, originalSrc: src, originalOnError });
      img.setAttribute('src', pngDataUrl);

      await new Promise(resolve => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 1500);
      });
    } catch (e) {
      console.warn('Bill PDF: failed to rasterize SVG to PNG; leaving original src', src, e);
    }
  }

  // Render at 2× device scale for print-quality crispness without ballooning
  // the resulting PDF size.
  let canvas;
  try {
    canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true, // tolerate the SVG even if CORS headers aren't set
      logging: false,
      imageTimeout: 5000,
      // Drop the on-screen-only action bar (Close/Print/Download buttons) and
      // anything else flagged as "no-print" so the captured image matches
      // what a printed page would show.
      ignoreElements: (el) => !!(el.classList && el.classList.contains('ukc-bill-no-print')),
    });
  } finally {
    // Always restore original SVG src values and the onerror handler, even
    // if html2canvas threw, so the live on-screen bill isn't left with
    // embedded data-URLs or a stripped error handler.
    for (const { img, originalSrc, originalOnError } of restoreImgSrcs) {
      img.setAttribute('src', originalSrc);
      if (originalOnError !== undefined) img.onerror = originalOnError;
    }
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const usablePtWidth = pageWidth - margin * 2;
  const usablePtHeight = pageHeight - margin * 2;

  // px ↔ pt conversion factor (the captured canvas is `scale` × element px).
  const ptPerCanvasPx = usablePtWidth / canvas.width;
  const fullPdfHeight = canvas.height * ptPerCanvasPx;

  if (fullPdfHeight <= usablePtHeight) {
    // Fits on one page — single addImage call, exact aspect ratio.
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      margin,
      margin,
      usablePtWidth,
      fullPdfHeight,
    );
  } else {
    // Multi-page: slice the canvas vertically into page-tall chunks. Naively
    // cutting at a fixed pixel height bisects whatever row of text happens
    // to straddle that line — the user sees the top half of a sentence at
    // the bottom of one page and the bottom half at the top of the next.
    //
    // To avoid that, before committing each slice we scan upward from the
    // proposed cut for a horizontal band of mostly-white pixels (i.e. a
    // gap between rows). Up to ~12% of a page-height of look-back is
    // allowed; if no clean gap is found we fall back to the original cut.
    const sliceCanvasPxHeight = Math.floor(usablePtHeight / ptPerCanvasPx);
    const lookBackLimit = Math.floor(sliceCanvasPxHeight * 0.12);
    const fullCtx = canvas.getContext('2d');

    // True if the row at `y` is "blank enough" to cut on — almost every
    // pixel near-white. Sampling every few px on the x-axis keeps this
    // cheap on a 2000-pixel-wide canvas.
    const isBlankRow = (y) => {
      if (y < 0 || y >= canvas.height) return false;
      let data;
      try { data = fullCtx.getImageData(0, y, canvas.width, 1).data; }
      catch { return false; }
      const step = 4 * 8; // every 8th pixel
      let nonWhite = 0;
      const total = Math.floor(canvas.width / 8);
      for (let i = 0; i < data.length; i += step) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 245 || g < 245 || b < 245) nonWhite += 1;
      }
      // A row is "blank" if fewer than 1% of sampled pixels carry ink.
      return nonWhite <= Math.max(1, Math.floor(total * 0.01));
    };

    const findCleanCut = (proposed) => {
      if (proposed >= canvas.height) return canvas.height;
      const minCut = Math.max(1, proposed - lookBackLimit);
      // Find a contiguous band of blank rows, then cut in the middle of it.
      let bandEnd = -1;
      for (let y = proposed; y >= minCut; y--) {
        if (isBlankRow(y)) {
          if (bandEnd === -1) bandEnd = y;
          // Walk up while still blank to find the band's start.
          let bandStart = y;
          while (bandStart - 1 >= minCut && isBlankRow(bandStart - 1)) bandStart -= 1;
          return Math.floor((bandStart + bandEnd) / 2);
        }
      }
      return proposed;
    };

    let yOffset = 0;
    let pageIndex = 0;

    while (yOffset < canvas.height) {
      const remaining = canvas.height - yOffset;
      const proposedEnd = yOffset + Math.min(sliceCanvasPxHeight, remaining);
      // Don't bother searching for a gap on the final slice or when the
      // slice already ends exactly at the canvas bottom.
      const cutEnd = (proposedEnd >= canvas.height)
        ? canvas.height
        : findCleanCut(proposedEnd);
      const thisSliceHeight = Math.max(1, cutEnd - yOffset);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = thisSliceHeight;
      const ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, yOffset, canvas.width, thisSliceHeight,
        0, 0, canvas.width, thisSliceHeight,
      );

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(
        sliceCanvas.toDataURL('image/png'),
        'PNG',
        margin,
        margin,
        usablePtWidth,
        thisSliceHeight * ptPerCanvasPx,
      );

      yOffset += thisSliceHeight;
      pageIndex += 1;
    }
  }

  pdf.save(filename);
}

// ─────────────────────────────────────────────────────────────────────────
// Path 2: legacy text-based export (fallback)
// ─────────────────────────────────────────────────────────────────────────

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

  const safeName = (customerName || 'Customer').replace(/[^a-zA-Z0-9-_]+/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  doc.save(`DPC-Statement-${safeName}-${datePart}.pdf`);
}
