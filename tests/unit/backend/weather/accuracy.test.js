/* eslint-env jest */
/* global describe, it, expect */
import { computeMae } from '../../../../backend/services/weather/accuracy.js';

const pairs = (errs) => errs.map((e) => ({ pred: 10 + e, actual: 10 }));

describe('computeMae', () => {
  it('null below the 20-pair floor', () => {
    expect(computeMae(pairs([1, -1, 2]))).toBeNull();
  });
  it('mean absolute error over enough pairs', () => {
    const errs = Array.from({ length: 20 }, (_, i) => (i % 2 ? 2 : -2)); // |err| always 2
    expect(computeMae(pairs(errs))).toBe(2);
  });
  it('ignores pairs with a null actual', () => {
    const good = pairs(Array.from({ length: 20 }, () => 3)); // |err| 3
    good.push({ pred: 10, actual: null });
    expect(computeMae(good)).toBe(3);
  });
});
