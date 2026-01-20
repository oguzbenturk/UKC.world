import express from 'express';
import { getConsentStatus, updateUserConsent, LATEST_TERMS_VERSION } from '../services/userConsentService.js';

const router = express.Router();

router.get('/me', async (req, res) => {
  try {
    const status = await getConsentStatus(req.user.id);
    res.json(status);
  } catch (error) {
    console.error('Failed to load consent status', error);
    res.status(500).json({ error: 'Failed to load consent status' });
  }
});

router.post('/me', async (req, res) => {
  const { acceptTerms, allowEmail, allowSms, allowWhatsapp, termsVersion } = req.body || {};

  try {
    const status = await updateUserConsent({
      userId: req.user.id,
      acceptTerms,
      allowEmail,
      allowSms,
      allowWhatsapp,
      termsVersion: termsVersion || LATEST_TERMS_VERSION
    });
    res.json(status);
  } catch (error) {
    console.error('Failed to update consent', error);

    if (error.code === 'CONSENT_TERMS_REQUIRED') {
      return res.status(409).json({
        error: 'Terms acceptance required',
        code: error.code,
        latestTermsVersion: LATEST_TERMS_VERSION
      });
    }

    if (error.code === 'CONSENT_TERMS_VERSION_MISMATCH') {
      return res.status(400).json({
        error: 'Submitted terms version is not current',
        code: error.code,
        latestTermsVersion: LATEST_TERMS_VERSION
      });
    }

    res.status(500).json({ error: 'Failed to update consent' });
  }
});

export default router;
