// tests/unit/frontend/manager/productImagePayload.test.js
//
// Tests for the pure helpers extracted from ProductForm.jsx. They guard the
// two image-flow regressions that were hitting shop staff in production:
//   1. Adding a colour mid-edit wiped the existing gallery on save.
//   2. Upload errors (auth, CSRF, too-large, HEIC) all surfaced as a single
//      generic "upload failed" toast with no way to tell what went wrong.

import { describe, it, expect } from 'vitest';
import {
  buildImagePayload,
  describeUploadError,
} from '@/features/products/utils/productImagePayload';

describe('buildImagePayload', () => {
  it('handles empty inputs', () => {
    expect(buildImagePayload({})).toEqual({ colors: [], images: [] });
    expect(buildImagePayload()).toEqual({ colors: [], images: [] });
  });

  it('returns the gallery untouched when no colours are defined', () => {
    const result = buildImagePayload({
      colorNames: [],
      colorImagesMap: {},
      gallery: ['/uploads/images/a.jpg', '/uploads/images/b.jpg'],
    });
    expect(result.colors).toEqual([]);
    expect(result.images).toEqual(['/uploads/images/a.jpg', '/uploads/images/b.jpg']);
  });

  it('preserves the gallery when a colour is added (regression — used to wipe everything)', () => {
    const result = buildImagePayload({
      colorNames: ['Red'],
      colorImagesMap: { Red: [] },
      gallery: ['/uploads/images/legacy-1.jpg', '/uploads/images/legacy-2.jpg'],
    });
    expect(result.colors).toEqual([{ name: 'Red', imageCount: 0 }]);
    expect(result.images).toEqual([
      '/uploads/images/legacy-1.jpg',
      '/uploads/images/legacy-2.jpg',
    ]);
  });

  it('emits colour photos in colorNames order, gallery photos last', () => {
    const result = buildImagePayload({
      colorNames: ['Red', 'Blue'],
      colorImagesMap: {
        Red: ['/img/r1.jpg', '/img/r2.jpg'],
        Blue: ['/img/b1.jpg'],
      },
      gallery: ['/img/extra.jpg'],
    });
    expect(result.colors).toEqual([
      { name: 'Red', imageCount: 2 },
      { name: 'Blue', imageCount: 1 },
    ]);
    expect(result.images).toEqual([
      '/img/r1.jpg',
      '/img/r2.jpg',
      '/img/b1.jpg',
      '/img/extra.jpg',
    ]);
  });

  it('round-trips losslessly with the reload slicing convention', () => {
    // Build a payload, then simulate the reload logic in ProductForm that
    // slices `images` back into colour buckets using `imageCount`.
    const original = {
      colorNames: ['Red', 'Blue'],
      colorImagesMap: {
        Red: ['/r/1.jpg', '/r/2.jpg'],
        Blue: ['/b/1.jpg'],
      },
      gallery: ['/g/1.jpg'],
    };
    const { colors, images } = buildImagePayload(original);

    // Re-slice
    let idx = 0;
    const rebuilt = {};
    for (const c of colors) {
      rebuilt[c.name] = images.slice(idx, idx + c.imageCount);
      idx += c.imageCount;
    }
    const rebuiltGallery = images.slice(idx);

    expect(rebuilt).toEqual(original.colorImagesMap);
    expect(rebuiltGallery).toEqual(original.gallery);
  });

  it('treats missing colour buckets as empty (defensive)', () => {
    const result = buildImagePayload({
      colorNames: ['Red', 'Blue'],
      colorImagesMap: { Red: ['/r.jpg'] }, // Blue missing entirely
      gallery: [],
    });
    expect(result.colors).toEqual([
      { name: 'Red', imageCount: 1 },
      { name: 'Blue', imageCount: 0 },
    ]);
    expect(result.images).toEqual(['/r.jpg']);
  });
});

describe('describeUploadError', () => {
  it('maps 413 to a size-specific message regardless of body', () => {
    const err = { response: { status: 413, data: { error: 'whatever' } } };
    expect(describeUploadError(err, 'fallback')).toMatch(/15 MB/);
  });

  it('maps 401 to a session-expired message', () => {
    const err = { response: { status: 401, data: {} } };
    expect(describeUploadError(err, 'fallback')).toMatch(/session expired/i);
  });

  it('maps 403 to a permission message', () => {
    const err = { response: { status: 403, data: {} } };
    expect(describeUploadError(err, 'fallback')).toMatch(/permission/i);
  });

  it('surfaces the backend `error` field when the status is generic', () => {
    const err = {
      response: { status: 400, data: { error: 'Only image uploads are allowed (JPEG, PNG, GIF, WebP)' } },
    };
    expect(describeUploadError(err, 'fallback')).toMatch(/only image uploads/i);
  });

  it('prefers `error` over `message` in the backend body', () => {
    const err = {
      response: { status: 400, data: { error: 'specific', message: 'generic' } },
    };
    expect(describeUploadError(err, 'fallback')).toBe('specific');
  });

  it('falls back to the axios error message when no body is present', () => {
    const err = new Error('Network Error');
    expect(describeUploadError(err, 'fallback')).toBe('Network Error');
  });

  it('uses the i18n fallback as a last resort', () => {
    expect(describeUploadError(undefined, 'i18n fallback')).toBe('i18n fallback');
    expect(describeUploadError({}, 'i18n fallback')).toBe('i18n fallback');
  });
});
