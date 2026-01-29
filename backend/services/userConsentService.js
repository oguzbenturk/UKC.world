import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

export const LATEST_TERMS_VERSION = process.env.TERMS_VERSION || '2025-10-01';

let consentSchemaEnsured = false;

const ensureConsentSchema = async (client = pool) => {
  if (consentSchemaEnsured) {
    return;
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_consents (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      terms_version TEXT NOT NULL,
      terms_accepted_at TIMESTAMPTZ,
      marketing_email_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      marketing_sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      marketing_whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_consents_terms_version
      ON user_consents(terms_version);
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION set_user_consents_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    DROP TRIGGER IF EXISTS user_consents_set_updated_at ON user_consents;
  `);

  await client.query(`
    CREATE TRIGGER user_consents_set_updated_at
    BEFORE UPDATE ON user_consents
    FOR EACH ROW
    EXECUTE FUNCTION set_user_consents_updated_at();
  `);

  consentSchemaEnsured = true;
};

const mapConsentRow = (row) => {
  if (!row) {
    return null;
  }

  const termsAcceptedAt = row.terms_accepted_at ? new Date(row.terms_accepted_at).toISOString() : null;

  return {
    userId: row.user_id,
    termsVersion: row.terms_version,
    termsAcceptedAt,
    marketingEmailOptIn: row.marketing_email_opt_in,
    marketingSmsOptIn: row.marketing_sms_opt_in,
    marketingWhatsappOptIn: row.marketing_whatsapp_opt_in,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
};

const buildConsentPayload = (row) => {
  const consent = mapConsentRow(row);
  const acceptedLatest = !!consent && !!consent.termsAcceptedAt && consent.termsVersion === LATEST_TERMS_VERSION;

  return {
    latestTermsVersion: LATEST_TERMS_VERSION,
    termsVersion: consent?.termsVersion ?? null,
    termsAcceptedAt: consent?.termsAcceptedAt ?? null,
    requiresTermsAcceptance: !acceptedLatest,
    communicationPreferences: {
      email: consent?.marketingEmailOptIn ?? false,
      sms: consent?.marketingSmsOptIn ?? false,
      whatsapp: consent?.marketingWhatsappOptIn ?? false
    }
  };
};

export async function getConsentStatus(userId, client = pool) {
  if (!userId) {
    throw new Error('userId is required to load consent status');
  }

  await ensureConsentSchema(client);

  const { rows } = await client.query(
    `SELECT user_id, terms_version, terms_accepted_at, marketing_email_opt_in, marketing_sms_opt_in, marketing_whatsapp_opt_in, created_at, updated_at
       FROM user_consents
      WHERE user_id = $1`,
    [userId]
  );

  const consent = rows[0] || null;
  return buildConsentPayload(consent);
}

export async function updateUserConsent({
  userId,
  acceptTerms,
  allowEmail,
  allowSms,
  allowWhatsapp,
  termsVersion,
  acceptWaiver
}) {
  if (!userId) {
    throw new Error('userId is required to update consent');
  }

  const client = await pool.connect();

  try {
    await ensureConsentSchema(client);
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT user_id, terms_version, terms_accepted_at, marketing_email_opt_in, marketing_sms_opt_in, marketing_whatsapp_opt_in
         FROM user_consents
        WHERE user_id = $1
        FOR UPDATE`,
      [userId]
    );

    const existing = existingResult.rows[0] || null;
    const needsTermsAcceptance = !existing || !existing.terms_accepted_at || existing.terms_version !== LATEST_TERMS_VERSION;

    if (needsTermsAcceptance && acceptTerms !== true) {
      const error = new Error('Latest terms must be accepted');
      error.code = 'CONSENT_TERMS_REQUIRED';
      throw error;
    }

    const next = {
      termsVersion: existing?.terms_version ?? LATEST_TERMS_VERSION,
      termsAcceptedAt: existing?.terms_accepted_at ?? null,
      marketingEmailOptIn: existing?.marketing_email_opt_in ?? false,
      marketingSmsOptIn: existing?.marketing_sms_opt_in ?? false,
      marketingWhatsappOptIn: existing?.marketing_whatsapp_opt_in ?? false
    };

    if (acceptTerms === true) {
      next.termsVersion = termsVersion || LATEST_TERMS_VERSION;
      if (next.termsVersion !== LATEST_TERMS_VERSION) {
        const error = new Error('Invalid terms version supplied');
        error.code = 'CONSENT_TERMS_VERSION_MISMATCH';
        throw error;
      }
      next.termsAcceptedAt = new Date();
    } else if (acceptTerms === false && !needsTermsAcceptance) {
      // We do not allow retracting acceptance in-app; ignore and log for auditing
      logger.warn('Attempt to revoke terms acceptance ignored', { userId });
    }

    if (typeof allowEmail === 'boolean') {
      next.marketingEmailOptIn = allowEmail;
    }

    if (typeof allowSms === 'boolean') {
      next.marketingSmsOptIn = allowSms;
    }

    if (typeof allowWhatsapp === 'boolean') {
      next.marketingWhatsappOptIn = allowWhatsapp;
    }

    const upsertResult = await client.query(
      `INSERT INTO user_consents (
         user_id,
         terms_version,
         terms_accepted_at,
         marketing_email_opt_in,
         marketing_sms_opt_in,
         marketing_whatsapp_opt_in
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         terms_version = EXCLUDED.terms_version,
         terms_accepted_at = EXCLUDED.terms_accepted_at,
         marketing_email_opt_in = EXCLUDED.marketing_email_opt_in,
         marketing_sms_opt_in = EXCLUDED.marketing_sms_opt_in,
         marketing_whatsapp_opt_in = EXCLUDED.marketing_whatsapp_opt_in,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        next.termsVersion,
        next.termsAcceptedAt,
        next.marketingEmailOptIn,
        next.marketingSmsOptIn,
        next.marketingWhatsappOptIn
      ]
    );

    // If acceptWaiver is true, also create a waiver record
    if (acceptWaiver === true) {
      // Check if user already has a valid waiver
      const existingWaiverResult = await client.query(
        `SELECT id FROM liability_waivers 
         WHERE user_id = $1 
         AND signed_at > NOW() - INTERVAL '365 days'
         ORDER BY signed_at DESC LIMIT 1`,
        [userId]
      );

      // Only create waiver if they don't have a recent one
      if (existingWaiverResult.rows.length === 0) {
        await client.query(
          `INSERT INTO liability_waivers (
            user_id,
            signer_user_id,
            waiver_version,
            language_code,
            agreed_to_terms,
            signed_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [userId, userId, '2025-01-01', 'en', true]
        );
      }
    }

    await client.query('COMMIT');

    return buildConsentPayload(upsertResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}