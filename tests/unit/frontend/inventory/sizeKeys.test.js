import { describe, test, expect } from 'vitest';
import { sizeKey, sizeLabel, compareSizes, boardBand, parseMetres } from '@/features/inventory/utils/sizeKeys';

const t = (k) => k.replace(/^common:/, '');

describe('sizeKey', () => {
  test.each([
    ['kite', '7m', '7m'],
    ['kite', '7', '7m'],
    ['kite', '7.0m', '7m'],
    ['kite', '7 m', '7m'],
    ['kite', '17,5', '17.5m'],
    ['kite', '13.5m', '13.5m'],
    ['kite', '', '—'],
    ['kite', null, '—'],
    ['wing/foil', '5', '5m'],
    ['wing/foil', "5'8", "5'8"],
    ['wing/foil', '59cm', '59cm'],
    ['board', '136cm', '135-140'],
    ['board', '138x41.5cm', '135-140'],
    ['board', '133x40cm', '<=134'],
    ['board', '142x43cm', '141-145'],
    ['board', '160x150cm', '146+'],
    ['board', "5'1", 'directional'],
    ['control bar', '24', '24'],
    ['control bar', '22-24/Large', '22-24'],
    ['control bar', '12', '12'],
    ['footwear', '38-39', '38-39'],
    ['footwear', '40', '40'],
    ['harness', 'xl', 'XL'],
    ['wetsuit', 'Çocuk', 'KIDS'],
    ['safety gear', 'KIDS', 'KIDS'],
    ['harness', null, '—'],
    ['accessory', 'Uzun', 'Uzun'],
  ])('%s %j -> %s', (type, size, expected) => {
    expect(sizeKey({ typeKey: type, size })).toBe(expected);
  });

  test('accepts the raw type field too', () => {
    expect(sizeKey({ type: 'Kite', size: '9m' })).toBe('9m');
  });
});

describe('parseMetres / boardBand', () => {
  test('parses metre strings', () => {
    expect(parseMetres('9m')).toBe(9);
    expect(parseMetres('9 m²')).toBe(9);
    expect(parseMetres('136cm')).toBeNull();
  });
  test('bands boards', () => {
    expect(boardBand('')).toBe('—');
    expect(boardBand('junk')).toBe('junk');
  });
});

describe('sizeLabel', () => {
  test('translates blanks, kids and board bands; suffixes bars and shoes', () => {
    expect(sizeLabel('—', 'kite', t)).toBe('inventory.noSize');
    expect(sizeLabel('KIDS', 'wetsuit', t)).toBe('inventory.sizeKids');
    expect(sizeLabel('135-140', 'board', t)).toBe('inventory.bands.medium');
    expect(sizeLabel('directional', 'board', t)).toBe('inventory.bands.directional');
    expect(sizeLabel('24', 'control bar', t)).toBe('24 cm');
    expect(sizeLabel('22-24', 'control bar', t)).toBe('22–24 cm');
    expect(sizeLabel('38-39', 'footwear', t)).toBe('EU 38–39');
    expect(sizeLabel('9m', 'kite', t)).toBe('9m');
  });
});

describe('compareSizes', () => {
  test('orders metres numerically with blanks last', () => {
    expect(['9m', '13.5m', '5m', '—', '7m'].sort(compareSizes)).toEqual(['5m', '7m', '9m', '13.5m', '—']);
  });
  test('orders apparel sizes', () => {
    expect(['L', 'XS', 'KIDS', 'M', 'XXL'].sort(compareSizes)).toEqual(['KIDS', 'XS', 'M', 'L', 'XXL']);
  });
  test('orders board bands', () => {
    expect(['146+', 'directional', '<=134', '141-145'].sort(compareSizes)).toEqual(['<=134', '141-145', '146+', 'directional']);
  });
  test('numbers before text', () => {
    expect(['Uzun', '40', '38-39'].sort(compareSizes)).toEqual(['38-39', '40', 'Uzun']);
  });
});
