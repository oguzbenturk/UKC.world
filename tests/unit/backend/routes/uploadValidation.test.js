// tests/unit/backend/routes/uploadValidation.test.js
//
// Unit tests for the pure upload-validation helpers in
// backend/utils/uploadValidation.js. The historical version of this code
// rejected legitimate phone photos (HEIC, .jfif, capitalised extensions,
// missing extensions) which surfaced to shop staff as "image upload failed"
// with no detail. These tests pin down the relaxed acceptance rules.

import {
  IMAGE_MIME_TO_EXT,
  EXT_ALIASES,
  normalizeSafeExtension,
  extMatchesExpected,
  validateMimeAndExtension,
} from '../../../../backend/utils/uploadValidation.js';

const imageFile = (mimetype, originalname) => ({ mimetype, originalname });

describe('IMAGE_MIME_TO_EXT — modern phone formats are allow-listed', () => {
  test.each([
    ['image/jpeg', '.jpg'],
    ['image/pjpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/gif', '.gif'],
    ['image/webp', '.webp'],
    ['image/heic', '.heic'],
    ['image/heif', '.heif'],
    ['image/avif', '.avif'],
  ])('%s → %s', (mime, expectedExt) => {
    expect(IMAGE_MIME_TO_EXT[mime]).toBe(expectedExt);
  });
});

describe('normalizeSafeExtension', () => {
  test('strips and lower-cases', () => {
    expect(normalizeSafeExtension('Photo.JPG')).toBe('.jpg');
  });

  test('returns the fallback when name has no extension', () => {
    expect(normalizeSafeExtension('IMG_1234', '.fallback')).toBe('.fallback');
  });

  test('returns the fallback for path-traversal style names', () => {
    expect(normalizeSafeExtension('../etc/passwd', '.bin')).toBe('.bin');
  });

  test('returns empty fallback when fallback is empty string', () => {
    expect(normalizeSafeExtension('noext', '')).toBe('');
  });

  test('rejects suspiciously long extensions', () => {
    expect(normalizeSafeExtension('weird.thisistoolong', '.bin')).toBe('.bin');
  });
});

describe('extMatchesExpected — alias groups', () => {
  test('exact match passes', () => {
    expect(extMatchesExpected('.png', '.png')).toBe(true);
  });

  test('empty extension trusts the mime', () => {
    expect(extMatchesExpected('', '.jpg')).toBe(true);
  });

  test('jpg/jpeg/jfif/pjpeg are all interchangeable', () => {
    expect(extMatchesExpected('.jpeg', '.jpg')).toBe(true);
    expect(extMatchesExpected('.jfif', '.jpg')).toBe(true);
    expect(extMatchesExpected('.pjpeg', '.jpg')).toBe(true);
    expect(extMatchesExpected('.jpe', '.jpg')).toBe(true);
  });

  test('heic and heif are interchangeable', () => {
    expect(extMatchesExpected('.heif', '.heic')).toBe(true);
    expect(extMatchesExpected('.heic', '.heif')).toBe(true);
  });

  test('mismatched extension is still rejected for unrelated formats', () => {
    expect(extMatchesExpected('.png', '.jpg')).toBe(false);
    expect(extMatchesExpected('.heic', '.png')).toBe(false);
  });
});

describe('validateMimeAndExtension — image uploads', () => {
  test('accepts standard JPEG with matching extension', () => {
    const ok = validateMimeAndExtension(imageFile('image/jpeg', 'shot.jpg'), IMAGE_MIME_TO_EXT);
    expect(ok).toBe(true);
  });

  test('accepts iPhone HEIC (regression: previously rejected)', () => {
    const ok = validateMimeAndExtension(imageFile('image/heic', 'IMG_1234.HEIC'), IMAGE_MIME_TO_EXT);
    expect(ok).toBe(true);
  });

  test('accepts HEIF with .heic extension (alias group)', () => {
    const ok = validateMimeAndExtension(imageFile('image/heif', 'IMG_1234.heic'), IMAGE_MIME_TO_EXT);
    expect(ok).toBe(true);
  });

  test('accepts JPEG saved with Windows .jfif extension (regression)', () => {
    const ok = validateMimeAndExtension(imageFile('image/jpeg', 'screenshot.jfif'), IMAGE_MIME_TO_EXT);
    expect(ok).toBe(true);
  });

  test('accepts file with NO extension when mime is valid (regression)', () => {
    const ok = validateMimeAndExtension(imageFile('image/jpeg', 'IMG_1234'), IMAGE_MIME_TO_EXT);
    expect(ok).toBe(true);
  });

  test('accepts WebP and AVIF (modern formats)', () => {
    expect(validateMimeAndExtension(imageFile('image/webp', 'pic.webp'), IMAGE_MIME_TO_EXT)).toBe(true);
    expect(validateMimeAndExtension(imageFile('image/avif', 'pic.avif'), IMAGE_MIME_TO_EXT)).toBe(true);
  });

  test('rejects unknown mime type', () => {
    expect(validateMimeAndExtension(imageFile('application/octet-stream', 'thing.bin'), IMAGE_MIME_TO_EXT))
      .toBe(false);
  });

  test('rejects PDF posing as image', () => {
    expect(validateMimeAndExtension(imageFile('application/pdf', 'fake.jpg'), IMAGE_MIME_TO_EXT))
      .toBe(false);
  });

  test('rejects mismatched mime + extension (PNG bytes with .jpg name)', () => {
    // The expected ext for image/png is .png, so .jpg is not in its alias group.
    expect(validateMimeAndExtension(imageFile('image/png', 'sneaky.jpg'), IMAGE_MIME_TO_EXT))
      .toBe(false);
  });

  test('gracefully handles missing file object', () => {
    expect(validateMimeAndExtension(null, IMAGE_MIME_TO_EXT)).toBe(false);
    expect(validateMimeAndExtension(undefined, IMAGE_MIME_TO_EXT)).toBe(false);
  });

  test('gracefully handles missing fields on file', () => {
    expect(validateMimeAndExtension({}, IMAGE_MIME_TO_EXT)).toBe(false);
  });
});

describe('EXT_ALIASES — symmetry sanity check', () => {
  test('all groups contain at least 2 members', () => {
    for (const group of EXT_ALIASES) {
      expect(group.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('no extension appears in two different groups', () => {
    const seen = new Set();
    for (const group of EXT_ALIASES) {
      for (const ext of group) {
        expect(seen.has(ext)).toBe(false);
        seen.add(ext);
      }
    }
  });
});
