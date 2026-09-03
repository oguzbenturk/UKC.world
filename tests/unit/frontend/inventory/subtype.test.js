import { describe, test, expect } from 'vitest';
import { subtypesOf, SUBTYPE_IDS, subtypeOrder } from '@/features/inventory/utils/subtype';
import { foldText, tokensOf } from '@/features/inventory/utils/text';
import { sizeKey } from '@/features/inventory/utils/sizeKeys';

const unit = (typeKey, name, size = '') => ({ typeKey, name, size, sizeKey: sizeKey({ typeKey, size }) });

describe('foldText', () => {
  test('folds Turkish letters and curly apostrophes', () => {
    expect(foldText('Can Yeleği')).toBe('can yelegi');
    expect(foldText('5 İp Bar')).toBe('5 ip bar');
    expect(foldText('Ayakkabı')).toBe('ayakkabi');
    expect(foldText('Element 4’3')).toBe("element 4'3");
    expect(foldText('Çocuk  Wetsuit ')).toBe('cocuk wetsuit');
  });
  test('tokens keep thickness and apostrophes', () => {
    expect(tokensOf("Element 4'3")).toEqual(['element', "4'3"]);
    expect(tokensOf('Wetsuit Shorty 4.3')).toEqual(['wetsuit', 'shorty', '4.3']);
  });
});

describe('subtypesOf', () => {
  test.each([
    ['harness', 'Seat Harness', ['seat']],
    ['harness', 'Sit', ['seat']],
    ['harness', 'Belt Harness LF', ['waist']],
    ['harness', 'Harness Apex', ['waist']],
    ['harness', 'Freestyler', ['waist']],
    ['harness', 'Harness', []],
    ['wetsuit', 'Wetsuit Shorty 4.3', ['shorty']],
    ['wetsuit', 'Element 4’3', ['full']],
    ['wetsuit', 'Wetsuit 5’4', ['full']],
    ['wetsuit', 'Element 2’2 Wetsuit', []],
    ['wetsuit', 'Tribord Çocuk Wetsuit', ['kids']],
    ['wetsuit', 'Çocuk Shorty', ['shorty', 'kids']],
    ['wetsuit', 'Wetsuit (Spiro shorty)', ['shorty']],
    ['safety gear', 'Can Yeleği', ['lifevest']],
    ['safety gear', 'Impact Vest Jobe Liberty', ['impact']],
    ['safety gear', 'Kask Olaian', ['helmet']],
    ['control bar', '5 İp Bar', ['5line']],
    ['control bar', 'Trust Bar 26', ['4line']],
    ['kite', 'Evo 5 İp Asistan', ['5line']],
    ['kite', 'Mono 22', []],
    ['wing/foil', 'LF Mast', ['mast']],
    ['wing/foil', 'Set Fanatic Wingfoil Kanat', ['wing']],
    ['wing/foil', 'Fanatic Skywing', ['wing']],
    ['accessory', 'Elektrik Pompa', ['pump']],
    ['accessory', '14 Tane Leash', ['leash']],
    ['footwear', 'Ayakkabı', []],
  ])('%s "%s" -> %j', (type, name, expected) => {
    expect(subtypesOf(unit(type, name))).toEqual(expected);
  });

  test('boards are directional by size, twin-tip otherwise', () => {
    expect(subtypesOf(unit('board', 'Board Gonzales', '138x41.5cm'))).toEqual(['twintip']);
    expect(subtypesOf(unit('board', 'Soleil Concept Blue', "5'1"))).toEqual(['directional']);
  });

  test('kids size flags a wetsuit even without the word', () => {
    expect(subtypesOf(unit('wetsuit', 'Oleon', 'KIDS'))).toEqual(['kids']);
  });

  test('ids and rail order', () => {
    expect(SUBTYPE_IDS.has('lifevest')).toBe(true);
    expect(SUBTYPE_IDS.has('bogus')).toBe(false);
    expect(subtypeOrder('wetsuit')).toEqual(['shorty', 'full', 'kids']);
    expect(subtypeOrder('footwear')).toEqual([]);
  });
});
