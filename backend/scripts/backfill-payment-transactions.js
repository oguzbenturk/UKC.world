#!/usr/bin/env node

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { appendCreatedBy, resolveSystemActorId } from '../utils/auditUtils.js';

const dryRun = process.argv.includes('--dry-run');

async function backfillPaymentTransactions() {
  console.log('🔄 Stripe ödeme defter kaydı backfill başlatılıyor...');
  console.log(`Dry-run: ${dryRun ? 'EVET' : 'HAYIR'}`);

  const { rows } = await pool.query(`
    SELECT 
      pi.*, 
      t.id AS existing_transaction_id
    FROM payment_intents pi
    LEFT JOIN transactions t 
      ON t.reference_number = pi.stripe_payment_intent_id 
      AND t.type = 'payment'
    WHERE pi.status = 'succeeded'
      AND (t.id IS NULL)
  `);

  if (rows.length === 0) {
    console.log('✅ Eksik defter kaydı bulunmadı.');
    return;
  }

  console.log(`🧾 ${rows.length} adet payment intent için defter kaydı eksik.`);

  let createdCount = 0;

  for (const record of rows) {
    const minorUnits = Number(record.amount);
    if (!Number.isFinite(minorUnits) || minorUnits <= 0) {
      console.warn(`⚠️ Atlanıyor: ${record.stripe_payment_intent_id} (geçersiz tutar)`);
      continue;
    }

    const amountDecimal = Number((minorUnits / 100).toFixed(2));
    const currency = (record.currency || 'eur').toUpperCase();
    const description = record.description || `Stripe Ödemesi - ${record.stripe_payment_intent_id}`;

    console.log(
      `• ${record.stripe_payment_intent_id} | Kullanıcı: ${record.user_id} | Tutar: €${amountDecimal} ${currency} | Booking: ${record.booking_id || '—'}`
    );

    if (!dryRun) {
      const systemActorId = resolveSystemActorId();
      const baseColumns = [
        'id',
        'user_id',
        'amount',
        'type',
        'description',
        'payment_method',
        'reference_number',
        'booking_id',
        'entity_type',
        'transaction_date',
        'currency',
        'status'
      ];
      const baseValues = [
        uuidv4(),
        record.user_id,
        amountDecimal,
        'payment',
        description,
        'stripe_payment',
        record.stripe_payment_intent_id,
        record.booking_id,
        record.booking_id ? 'booking' : 'payment_intent',
        new Date(),
        currency,
        'completed'
      ];
      const { columns, values } = appendCreatedBy(baseColumns, baseValues, systemActorId);
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

      await pool.query(
        `INSERT INTO transactions (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
    }

    createdCount += 1;
  }

  console.log(`\n${dryRun ? '🔍 Simülasyon tamamlandı' : '✅ Backfill tamamlandı'}: ${createdCount} kayıt işlendi.`);
}

backfillPaymentTransactions()
  .then(() => {
    console.log('🎯 İşlem bitti.');
  })
  .catch((error) => {
    console.error('💥 Backfill başarısız:', error);
    throw error;
  });
