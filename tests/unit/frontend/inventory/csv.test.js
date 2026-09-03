import { describe, test, expect } from 'vitest';
import { toCsv, csvEscape, buildEquipmentCsv } from '@/features/inventory/utils/csv';

describe('csv', () => {
  test('escapes quotes and wraps every cell', () => {
    expect(csvEscape('a "b"')).toBe('"a ""b"""');
    expect(csvEscape(null)).toBe('""');
  });

  test('starts with a BOM and uses CRLF', () => {
    const out = toCsv(['h1', 'h2'], [['x', 'y']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('"h1","h2"\r\n"x","y"');
  });

  test('buildEquipmentCsv renders labels and extra columns', () => {
    const ctx = {
      t: (k) => k.replace(/^common:inventory\./, ''),
      typeLabel: (k) => `T:${k}`,
      subtypeLabel: (k) => `S:${k}`,
      conditionLabel: (k) => `C:${k}`,
      statusLabel: (k) => `A:${k}`,
    };
    const unit = {
      serialNumber: 'K-001', typeKey: 'kite', subtypes: ['5line'], family: 'mono', name: 'Mono 22',
      brand: 'Duotone', size: '9m', condition: 'good', status: 'available', location: null, notes: 'Şerit',
    };
    const out = buildEquipmentCsv([unit], ctx, [{ header: 'Counted', get: () => 'FOUND' }]);
    const lines = out.slice(1).split('\r\n');
    expect(lines[0]).toBe('"assetCode","equipmentType","subtype","modelCol","enteredName","brand","size","condition","statusField","location","notes","Counted"');
    expect(lines[1]).toBe('"K-001","T:kite","S:5line","mono","Mono 22","Duotone","9m","C:good","A:available","","Şerit","FOUND"');
  });
});
