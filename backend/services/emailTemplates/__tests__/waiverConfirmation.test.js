/* eslint-env jest */
/* global describe, it, expect */

import { buildWaiverConfirmationEmail } from '../waiverConfirmation.js';

describe('buildWaiverConfirmationEmail', () => {
  it('creates subject, html, and text content with defaults', () => {
    const result = buildWaiverConfirmationEmail({
      signerName: 'Jamie Rivera',
      recipientEmail: 'jamie@example.com',
      waiverVersion: '1.2',
      signedAt: '2025-10-14T10:15:00.000Z',
      familyMemberName: 'Sky Rivera',
      languageCode: 'en',
      photoConsent: true,
      waiverDashboardUrl: 'https://app.example.com/student/family',
      signaturePreviewUrl: 'https://cdn.example.com/signatures/test.png'
    });

    expect(result.subject).toContain('Sky Rivera');
    expect(result.html).toContain('Jamie Rivera');
    expect(result.html).toContain('Version 1.2');
    expect(result.html).toContain('Sky Rivera');
    expect(result.html).toContain('Photo & video consent was granted');
    expect(result.text).toContain('Sky Rivera');
    expect(result.text).toContain('View your waiver: https://app.example.com/student/family');
  });
});
