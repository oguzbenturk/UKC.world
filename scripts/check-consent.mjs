import { pool } from '../backend/db.js';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/check-consent.mjs <email>');
    process.exit(1);
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, c.terms_version, c.terms_accepted_at, c.marketing_email_opt_in,
              c.marketing_sms_opt_in, c.marketing_whatsapp_opt_in
         FROM users u
         LEFT JOIN user_consents c ON c.user_id = u.id
        WHERE u.email = $1`,
      [email]
    );

    console.log(rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
