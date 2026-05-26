import { describe, test, expect } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import * as media from '../../../../backend/services/warrantyMediaService.js';

describe('warrantyMediaService.kindForMime', () => {
  test.each([
    ['image/jpeg',      'photo'],
    ['image/png',       'photo'],
    ['image/webp',      'photo'],
    ['image/heic',      'photo'],
    ['video/mp4',       'video'],
    ['video/quicktime', 'video'],
    ['video/webm',      'video'],
    ['application/pdf', null],
    ['text/plain',      null],
    ['',                null],
    [undefined,         null]
  ])('mime %s → %s', (mime, expected) => {
    expect(media.kindForMime(mime)).toBe(expected);
  });
});

describe('warrantyMediaService.validateUploadedFiles', () => {
  const photoFile = (size = 1024, name = 'a.jpg') => ({
    mimetype: 'image/jpeg', size, originalname: name
  });
  const videoFile = (size = 1024, name = 'a.mp4') => ({
    mimetype: 'video/mp4', size, originalname: name
  });

  test('accepts a single small photo', () => {
    expect(media.validateUploadedFiles([photoFile()])).toMatchObject({ ok: true });
  });

  test('rejects a photo over the 30MB limit', () => {
    const big = photoFile(media.MAX_PHOTO_SIZE + 1);
    const result = media.validateUploadedFiles([big]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PHOTO_TOO_LARGE');
    expect(result.status).toBe(413);
  });

  test('rejects a video over the 500MB limit', () => {
    const big = videoFile(media.MAX_VIDEO_SIZE + 1);
    const result = media.validateUploadedFiles([big]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VIDEO_TOO_LARGE');
  });

  test('rejects unsupported mime types', () => {
    const result = media.validateUploadedFiles([{
      mimetype: 'application/zip', size: 1024, originalname: 'x.zip'
    }]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_MIME');
  });

  test('rejects more than 10 photos per claim', () => {
    const tenPhotos = Array.from({ length: 10 }, (_, i) => photoFile(1024, `p${i}.jpg`));
    const result = media.validateUploadedFiles(tenPhotos, { existingPhotoCount: 1 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('TOO_MANY_PHOTOS');
  });

  test('rejects more than 3 videos per claim', () => {
    const result = media.validateUploadedFiles(
      [videoFile(), videoFile()],
      { existingVideoCount: 2 }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('TOO_MANY_VIDEOS');
  });

  test('rejects when cumulative bytes exceed 1.5GB cap', () => {
    // A 5 MB photo on top of an existing claim already 1.5 GB minus 1 MB —
    // each file is individually fine, but the cumulative total exceeds the cap.
    const fivemb = 5 * 1024 * 1024;
    const result = media.validateUploadedFiles([photoFile(fivemb)], {
      existingTotalBytes: media.MAX_TOTAL_PER_CLAIM - (1 * 1024 * 1024)
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CLAIM_QUOTA_EXCEEDED');
  });
});

describe('warrantyMediaService.purgeClaimFiles', () => {
  test('removes the claim directory if present', async () => {
    // Create a temp dir to act as the claim's media folder, write a file,
    // then call purgeClaimFiles. We bypass the production path by
    // round-tripping through claimDir() which uses backend/uploads/warranty.
    const fakeClaimId = `test-${Date.now()}`;
    const dir = media.claimDir(fakeClaimId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'sample.txt'), 'hello');

    await media.purgeClaimFiles(fakeClaimId);
    await expect(fs.access(dir)).rejects.toThrow();
  });

  test('is a no-op when the directory does not exist', async () => {
    const nonexistent = `test-missing-${Date.now()}`;
    await expect(media.purgeClaimFiles(nonexistent)).resolves.toBeUndefined();
  });
});
