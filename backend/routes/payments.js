import express from 'express';
import { body, validationResult } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { resolveActorId, resolveSystemActorId, appendCreatedBy } from '../utils/auditUtils.js';
import { recordLegacyTransaction } from '../services/walletService.js';
import Stripe from 'stripe';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create payment intent
router.post('/create-payment-intent', 
  authorizeRoles(['student', 'admin', 'manager']),
  [
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
    body('currency').isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),
    body('bookingId').optional().isInt().withMessage('Booking ID must be an integer'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { amount, currency, bookingId, description } = req.body;
      const userId = req.user.id;
      const actorId = resolveActorId(req);
      const now = new Date();

      // Create payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount, // Amount in cents
        currency: currency.toLowerCase(),
        metadata: {
          userId: userId.toString(),
          bookingId: bookingId ? bookingId.toString() : undefined,
          description: description || 'Kitesurfing service payment'
        }
      });

      // Store payment intent in database
      const paymentColumns = [
        'stripe_payment_intent_id',
        'user_id',
        'booking_id',
        'amount',
        'currency',
        'status',
        'description',
        'created_at',
        'updated_at'
      ];
      const paymentValues = [
        paymentIntent.id,
        userId,
        bookingId || null,
        amount,
        currency,
        paymentIntent.status,
        description || 'Kitesurfing service payment',
        now,
        now
      ];
      const { columns: paymentInsertColumns, values: paymentInsertValues } = appendCreatedBy(paymentColumns, paymentValues, actorId);
      const paymentPlaceholders = paymentInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

      await pool.query(
        `INSERT INTO payment_intents (${paymentInsertColumns.join(', ')}) VALUES (${paymentPlaceholders})`,
        paymentInsertValues
      );

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });

    } catch (error) {
      logger.error('Error creating payment intent:', error);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  }
);

// Confirm payment
router.post('/confirm-payment', 
  authorizeRoles(['student', 'admin', 'manager']),
  [
    body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { paymentIntentId } = req.body;
      const userId = req.user.id;
      const actorId = resolveActorId(req);

      // Retrieve payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Verify the payment intent belongs to the user
      if (paymentIntent.metadata.userId !== userId.toString()) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Update payment status in database
      const result = await pool.query(`
        UPDATE payment_intents 
        SET status = $1, updated_at = NOW()
        WHERE stripe_payment_intent_id = $2 AND user_id = $3
        RETURNING *
      `, [paymentIntent.status, paymentIntentId, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Payment intent not found' });
      }

      const paymentRecord = result.rows[0];

      if (paymentIntent.status === 'succeeded') {
        await ensurePaymentTransaction(paymentRecord, paymentIntent, actorId);
      }

      // If payment succeeded and there's a booking, update booking status
      if (paymentIntent.status === 'succeeded' && paymentRecord.booking_id) {
        await pool.query(
          'UPDATE bookings SET payment_status = $1 WHERE id = $2',
          ['paid', paymentRecord.booking_id]
        );
      }

      res.json({
        status: paymentIntent.status,
        payment: paymentRecord
      });

    } catch (error) {
      logger.error('Error confirming payment:', error);
      res.status(500).json({ error: 'Failed to confirm payment' });
    }
  }
);

// Process refund
router.post('/refund', 
  authorizeRoles(['admin', 'manager']),
  [
    body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
    body('amount').optional().isInt({ min: 1 }).withMessage('Refund amount must be a positive integer'),
    body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { paymentIntentId, amount, reason } = req.body;
      const actorId = resolveActorId(req);

      // Get payment intent from database
      const paymentResult = await pool.query(
        'SELECT * FROM payment_intents WHERE stripe_payment_intent_id = $1',
        [paymentIntentId]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment intent not found' });
      }

      const payment = paymentResult.rows[0];

      // Create refund with Stripe
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount || payment.amount, // Full refund if amount not specified
        metadata: {
          reason: reason || 'Requested by admin'
        }
      });

      // Store refund in database
      const refundTimestamp = new Date();
      const refundColumns = [
        'stripe_refund_id',
        'payment_intent_id',
        'amount',
        'reason',
        'status',
        'created_at'
      ];
      const refundValues = [
        refund.id,
        payment.id,
        refund.amount,
        reason || 'Requested by admin',
        refund.status,
        refundTimestamp
      ];
      const { columns: refundInsertColumns, values: refundInsertValues } = appendCreatedBy(refundColumns, refundValues, actorId);
      const refundPlaceholders = refundInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

      await pool.query(
        `INSERT INTO refunds (${refundInsertColumns.join(', ')}) VALUES (${refundPlaceholders})`,
        refundInsertValues
      );

      const refundCurrency = (refund.currency || payment.currency || 'eur').toUpperCase();
      const refundMinorUnits = Number.isFinite(refund.amount) ? refund.amount : payment.amount;
      const refundAmountDecimal = Number.isFinite(refundMinorUnits)
        ? Number((refundMinorUnits / 100).toFixed(2))
        : 0;
      const refundDescription = reason
        ? `Stripe iadesi: ${reason}`
        : `Stripe iadesi - ${paymentIntentId}`;

      // Avoid duplicate ledger entries when webhook or manual retry occurs
      const existingTxn = await pool.query(
        `SELECT id FROM wallet_transactions WHERE reference_number = $1 AND transaction_type = 'refund'`,
        [refund.id]
      );

      if (existingTxn.rows.length === 0) {
        try {
          await recordLegacyTransaction({
            userId: payment.user_id,
            amount: refundAmountDecimal,
            transactionType: 'refund',
            status: 'completed',
            direction: 'credit',
            description: refundDescription,
            currency: refundCurrency,
            paymentMethod: 'stripe_refund',
            referenceNumber: refund.id,
            bookingId: payment.booking_id || null,
            entityType: payment.booking_id ? 'booking' : 'payment_intent',
            relatedEntityType: payment.booking_id ? 'booking' : 'payment_intent',
            relatedEntityId: payment.booking_id || payment.id || null,
            metadata: {
              stripePaymentIntentId: paymentIntentId,
              refundId: refund.id,
              reason: reason || null,
              source: 'payments:refund'
            },
            createdBy: actorId || null
          });
        } catch (ledgerError) {
          logger.error('Failed to record refund in wallet ledger', {
            paymentIntentId,
            refundId: refund.id,
            userId: payment.user_id,
            amount: refundAmountDecimal,
            error: ledgerError?.message
          });
          throw ledgerError;
        }
      }

      // Update booking payment status if applicable
      if (payment.booking_id) {
        const refundAmount = refund.amount;
        const totalPaid = payment.amount;
        
        if (refundAmount >= totalPaid) {
          await pool.query(
            'UPDATE bookings SET payment_status = $1 WHERE id = $2',
            ['refunded', payment.booking_id]
          );
        } else {
          await pool.query(
            'UPDATE bookings SET payment_status = $1 WHERE id = $2',
            ['partially_refunded', payment.booking_id]
          );
        }
      }

      res.json({
        refund: {
          id: refund.id,
          amount: refund.amount,
          status: refund.status
        }
      });

    } catch (error) {
      logger.error('Error processing refund:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  }
);

// Get payment history
router.get('/history', authorizeRoles(['student', 'admin', 'manager']), async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = `
      SELECT 
        pi.*,
        b.lesson_date,
        b.lesson_type,
        u.name as customer_name
      FROM payment_intents pi
      LEFT JOIN bookings b ON pi.booking_id = b.id
      LEFT JOIN users u ON pi.user_id = u.id
    `;
    let params = [];

    // Students can only see their own payments
    if (userRole === 'student') {
      query += ' WHERE pi.user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY pi.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);

    res.json(result.rows);

  } catch (error) {
    logger.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Webhook endpoint for Stripe events
router.post('/webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      logger.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await handlePaymentSucceeded(paymentIntent);
        break;
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        await handlePaymentFailed(failedPayment);
        break;
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    logger.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handlePaymentSucceeded(paymentIntent) {
  try {
    // Update payment status in database and get record
    const { rows } = await pool.query(`
      UPDATE payment_intents 
      SET status = 'succeeded', updated_at = NOW()
      WHERE stripe_payment_intent_id = $1
      RETURNING *
    `, [paymentIntent.id]);

    let paymentRecord = rows[0];

    if (!paymentRecord) {
      const fallback = await pool.query(
        'SELECT * FROM payment_intents WHERE stripe_payment_intent_id = $1',
        [paymentIntent.id]
      );
      paymentRecord = fallback.rows[0];
    }

    if (paymentRecord) {
      const webhookActorId = resolveSystemActorId();
      await ensurePaymentTransaction(paymentRecord, paymentIntent, webhookActorId);
    }

    // If there's a booking associated, update its payment status
    if (paymentIntent.metadata.bookingId) {
      await pool.query(
        'UPDATE bookings SET payment_status = $1 WHERE id = $2',
        ['paid', paymentIntent.metadata.bookingId]
      );
    }

    logger.info(`Payment succeeded for payment intent: ${paymentIntent.id}`);
  } catch (error) {
    logger.error('Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(paymentIntent) {
  try {
    // Update payment status in database
    await pool.query(`
      UPDATE payment_intents 
      SET status = 'failed', updated_at = NOW()
      WHERE stripe_payment_intent_id = $1
    `, [paymentIntent.id]);

    logger.info(`Payment failed for payment intent: ${paymentIntent.id}`);
  } catch (error) {
    logger.error('Error handling payment failed:', error);
  }
}

async function ensurePaymentTransaction(paymentRecord, paymentIntent, actorId) {
  if (!paymentRecord) return;

  const referenceNumber = paymentIntent?.id || paymentRecord.stripe_payment_intent_id;
  if (!referenceNumber) return;

  const amountMinorUnits = Number(paymentRecord.amount);
  if (!Number.isFinite(amountMinorUnits) || amountMinorUnits <= 0) return;

  const existing = await pool.query(
    `SELECT id FROM wallet_transactions WHERE reference_number = $1 AND transaction_type = 'payment'`,
    [referenceNumber]
  );

  if (existing.rows.length > 0) {
    return;
  }

  const amountDecimal = Number((amountMinorUnits / 100).toFixed(2));
  const currency = (paymentIntent?.currency || paymentRecord.currency || 'eur').toUpperCase();
  const description = paymentIntent?.metadata?.description
    || paymentRecord.description
    || `Stripe Ödemesi - ${referenceNumber}`;

  try {
    await recordLegacyTransaction({
      userId: paymentRecord.user_id,
      amount: amountDecimal,
      transactionType: 'payment',
      status: 'completed',
      direction: 'credit',
      description,
      currency,
      paymentMethod: 'stripe_payment',
      referenceNumber,
      bookingId: paymentRecord.booking_id || null,
      entityType: paymentRecord.booking_id ? 'booking' : 'payment_intent',
      relatedEntityType: paymentRecord.booking_id ? 'booking' : 'payment_intent',
      relatedEntityId: paymentRecord.booking_id || paymentRecord.id || null,
      metadata: {
        stripePaymentIntentId: referenceNumber,
        paymentIntentMetadata: paymentIntent?.metadata || null,
        paymentIntentStatus: paymentIntent?.status || paymentRecord.status,
        source: 'payments:ensurePaymentTransaction'
      },
      createdBy: actorId || null
    });
  } catch (ledgerError) {
    logger.error('Failed to record stripe payment in wallet ledger', {
      paymentIntentId: referenceNumber,
      userId: paymentRecord.user_id,
      amount: amountDecimal,
      error: ledgerError?.message
    });
    throw ledgerError;
  }
}

export default router;
