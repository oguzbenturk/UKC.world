export const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// UTF-8 BOM (U+FEFF) so Excel opens Turkish characters correctly; CRLF for Windows Excel.
const BOM = String.fromCharCode(0xfeff);
export const toCsv = (header, rows) =>
  BOM + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');

export const downloadCsv = (filename, text) => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ctx = { t, typeLabel(typeKey), subtypeLabel(id), conditionLabel(c), statusLabel(s) }
export const equipmentCsvColumns = (ctx) => [
  { header: ctx.t('common:inventory.assetCode'), get: (u) => u.serialNumber },
  { header: ctx.t('common:inventory.equipmentType'), get: (u) => ctx.typeLabel(u.typeKey) },
  { header: ctx.t('common:inventory.subtype', { defaultValue: 'Sub-type' }), get: (u) => (u.subtypes || []).map(ctx.subtypeLabel).join(' / ') },
  { header: ctx.t('common:inventory.modelCol'), get: (u) => u.family },
  { header: ctx.t('common:inventory.enteredName'), get: (u) => u.name },
  { header: ctx.t('common:inventory.brand'), get: (u) => u.brand },
  { header: ctx.t('common:inventory.size'), get: (u) => u.size },
  { header: ctx.t('common:inventory.condition'), get: (u) => ctx.conditionLabel(u.condition) },
  { header: ctx.t('common:inventory.statusField'), get: (u) => ctx.statusLabel(u.status) },
  { header: ctx.t('common:inventory.location'), get: (u) => u.location },
  { header: ctx.t('common:inventory.notes'), get: (u) => u.notes },
];

export const buildEquipmentCsv = (units, ctx, extra = []) => {
  const cols = [...equipmentCsvColumns(ctx), ...extra];
  return toCsv(cols.map((c) => c.header), units.map((u) => cols.map((c) => c.get(u))));
};
