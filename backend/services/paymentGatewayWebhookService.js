import crypto from 'node:crypto';
import Stripe from 'stripe';

import { pool } from '../db.js';
import { logger, AppError } from '../middlewares/errorHandler.js';
import { approveDepositRequest, rejectDepositRequest } from './walletService.js';
import { resolveSystemActorId } from '../utils/auditUtils.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUCCESS_STATUSES = new Set(['succeeded', 'success', 'paid', 'pay_success', 'completed', 'approved']);
const FAILURE_STATUSES = new Set(['failed', 'declined', 'pay_fail', 'payment_failed', 'rejected', 'cancelled', 'canceled']);

class WebhookSignatureError extends AppError {
	constructor(provider, message) {
		super(message || `Invalid ${provider} webhook signature`, 400);
		this.name = 'WebhookSignatureError';
	}
}

function ensurePlainObject(candidate) {
	if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
		return candidate;
	}
	return {};
}

function toNumber(value) {
	if (value == null) {
		return null;
	}
	const parsed = Number(value);
	if (Number.isFinite(parsed)) {
		return parsed;
	}
	return null;
}

function normalizeCurrency(value) {
	if (!value || typeof value !== 'string') {
		return null;
	}
	return value.trim().toUpperCase();
}

function buildAckResponse(provider, extra = {}) {
	return {
		provider,
		acknowledged: true,
		receivedAt: new Date().toISOString(),
		...extra
	};
}

function createHashDigest(payload) {
	try {
		return crypto.createHash('sha256').update(payload).digest('hex');
	} catch (error) {
		logger.warn('Failed to hash webhook payload', { error: error.message });
		return null;
	}
}

function resolveDedupeKey(event) {
	const parts = [event.provider];
	if (event.externalId) {
		parts.push(event.externalId);
	}
	if (event.transactionId) {
		parts.push(event.transactionId);
	}
	if (event.referenceCode) {
		parts.push(event.referenceCode);
	}

	const joined = parts.filter(Boolean).join(':');
	if (joined) {
		return joined.toLowerCase();
	}

	if (event.rawBodyHash) {
		return `${event.provider}:${event.rawBodyHash}`;
	}

	return `${event.provider}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStatus(status) {
	if (!status) {
		return null;
	}
	return String(status).trim().toLowerCase();
}

function shouldTreatAsSuccess(provider, eventType, status) {
	const normalizedStatus = normalizeStatus(status);
	if (normalizedStatus && SUCCESS_STATUSES.has(normalizedStatus)) {
		return true;
	}

	const normalizedProvider = provider?.toLowerCase();
	const normalizedType = eventType?.toLowerCase();

	if (normalizedProvider === 'stripe') {
		return normalizedType === 'payment_intent.succeeded' || normalizedType === 'charge.succeeded';
	}

	if (normalizedProvider === 'binance_pay') {
		return normalizedStatus === 'pay_success';
	}

	return false;
}

function shouldTreatAsFailure(provider, eventType, status) {
	const normalizedStatus = normalizeStatus(status);
	if (normalizedStatus && FAILURE_STATUSES.has(normalizedStatus)) {
		return true;
	}

	const normalizedProvider = provider?.toLowerCase();
	const normalizedType = eventType?.toLowerCase();

	if (normalizedProvider === 'stripe') {
		return normalizedType === 'payment_intent.payment_failed' || normalizedType === 'charge.failed';
	}

	if (normalizedProvider === 'binance_pay') {
		return normalizedStatus === 'pay_fail';
	}

	return false;
}

function isUuid(value) {
	if (!value) {
		return false;
	}
	return UUID_REGEX.test(String(value));
}

async function appendDepositMetadata(depositId, metadata, verificationMetadata) {
	const meta = ensurePlainObject(metadata);
	const verification = ensurePlainObject(verificationMetadata);

	if (!depositId) {
		return null;
	}

	const hasMetadata = Object.keys(meta).length > 0;
	const hasVerification = Object.keys(verification).length > 0;

	if (!hasMetadata && !hasVerification) {
		return null;
	}

	await pool.query(
		`UPDATE wallet_deposit_requests
				SET metadata = metadata || $2::jsonb,
						verification_metadata = verification_metadata || $3::jsonb,
						updated_at = NOW()
			WHERE id = $1`,
		[depositId, JSON.stringify(meta || {}), JSON.stringify(verification || {})]
	);

	return true;
}

async function persistWebhookEvent(event) {
	const payload = ensurePlainObject(event.rawEvent || event.payload || {});
	const metadata = ensurePlainObject(event.metadata);

	const { rows } = await pool.query(
		`INSERT INTO payment_gateway_webhook_events (
			 provider,
			 event_type,
			 status,
			 external_id,
			 transaction_id,
			 deposit_id,
			 dedupe_key,
			 payload,
			 metadata,
			 acknowledged_at,
			 created_at,
			 updated_at
		 ) VALUES (
			 $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, NOW(), NOW(), NOW()
		 )
		 ON CONFLICT (dedupe_key) DO UPDATE
			 SET retry_count = payment_gateway_webhook_events.retry_count + 1,
					 status = EXCLUDED.status,
					 payload = EXCLUDED.payload,
					 metadata = payment_gateway_webhook_events.metadata || EXCLUDED.metadata,
					 acknowledged_at = COALESCE(payment_gateway_webhook_events.acknowledged_at, NOW()),
					 updated_at = NOW()
		 RETURNING *, (xmax = 0) AS inserted`,
		[
			event.provider,
			event.eventType,
			event.status,
			event.externalId,
			event.transactionId,
			event.depositId || null,
			event.dedupeKey,
			JSON.stringify(payload),
			JSON.stringify(
				{
					...metadata,
					amount: event.amount ?? null,
					currency: event.currency ?? null,
					referenceCode: event.referenceCode ?? null,
					receivedAt: event.receivedAt ?? new Date().toISOString()
				}
			)
		]
	);

	const record = rows[0];
	return {
		record,
		inserted: record?.inserted === true,
		alreadyProcessed: Boolean(record?.processed_at)
	};
}

async function finalizeWebhookEvent(eventId, { depositId, status, metadata }) {
	await pool.query(
		`UPDATE payment_gateway_webhook_events
				SET deposit_id = COALESCE($2, deposit_id),
						status = COALESCE($3, status),
						metadata = metadata || $4::jsonb,
						processed_at = NOW(),
						error_message = NULL,
						updated_at = NOW()
			WHERE id = $1`,
		[eventId, depositId || null, status || null, JSON.stringify(metadata || {})]
	);
}

async function recordWebhookError(eventId, error) {
	await pool.query(
		`UPDATE payment_gateway_webhook_events
				SET error_message = $2,
						metadata = metadata || $3::jsonb,
						updated_at = NOW()
			WHERE id = $1`,
		[
			eventId,
			error?.message || 'Unhandled webhook processing error',
			JSON.stringify({ lastErrorAt: new Date().toISOString() })
		]
	);
}

async function findDepositCandidate(event) {
	const clauses = [];
	const params = [];

	if (isUuid(event.depositId)) {
		params.push(event.depositId);
		clauses.push(`id = $${params.length}`);
	}

	if (event.transactionId) {
		params.push(event.transactionId);
		clauses.push(`gateway_transaction_id = $${params.length}`);
	}

	if (event.referenceCode) {
		params.push(event.referenceCode);
		clauses.push(`reference_code = $${params.length}`);
	}

	if (event.provider) {
		params.push(event.provider.toLowerCase());
		clauses.push(`LOWER(gateway) = $${params.length}`);
	}

	if (clauses.length === 0) {
		return null;
	}

	const whereClause = clauses.join(' OR ');

	const { rows } = await pool.query(
		`SELECT *
			 FROM wallet_deposit_requests
			WHERE ${whereClause}
			ORDER BY updated_at DESC
			LIMIT 1`,
		params
	);

	return rows[0] || null;
}

function sanitizeVerification(verification) {
	const payload = ensurePlainObject(verification);
	if (Object.keys(payload).length === 0) {
		return undefined;
	}
	return payload;
}

function isFinalizedStateError(error) {
	if (!error || !error.message) {
		return false;
	}
	const message = error.message.toLowerCase();
	return message.includes('cannot approve deposit request in status') || message.includes('cannot reject deposit request in status');
}

async function processNormalizedEvent(event) {
	const normalizedEvent = {
		...event,
		receivedAt: event.receivedAt || new Date().toISOString()
	};

	normalizedEvent.rawBodyHash = event.rawBody ? createHashDigest(event.rawBody) : null;
	normalizedEvent.dedupeKey = resolveDedupeKey(normalizedEvent);

	const { record, alreadyProcessed } = await persistWebhookEvent(normalizedEvent);

	if (alreadyProcessed) {
		logger.info('Webhook already processed; skipping', {
			provider: normalizedEvent.provider,
			dedupeKey: normalizedEvent.dedupeKey,
			eventId: normalizedEvent.externalId
		});

		const storedOutcome = ensurePlainObject(record?.metadata?.outcome);
		return {
			eventRecord: record,
			alreadyProcessed: true,
			outcome: storedOutcome.action
				? storedOutcome
				: { action: 'noop', status: record?.status || normalizedEvent.status || null }
		};
	}

	const depositRow = await findDepositCandidate(normalizedEvent);

	if (!depositRow) {
		logger.warn('No matching deposit request for webhook event', {
			provider: normalizedEvent.provider,
			dedupeKey: normalizedEvent.dedupeKey,
			eventId: normalizedEvent.externalId
		});

		await finalizeWebhookEvent(record.id, {
			depositId: null,
			status: normalizedEvent.status || 'ignored',
			metadata: {
				outcome: {
					action: 'ignored',
					reason: 'deposit_not_found',
					status: normalizedEvent.status || null
				}
			}
		});

		return {
			eventRecord: record,
			alreadyProcessed: false,
			outcome: {
				action: 'ignored',
				reason: 'deposit_not_found',
				status: normalizedEvent.status || null
			}
		};
	}

	const verificationPayload = sanitizeVerification(normalizedEvent.verification);
	const processorId = resolveSystemActorId() || depositRow.processed_by || depositRow.initiated_by || depositRow.user_id;
	const gatewayContext = {
		provider: normalizedEvent.provider,
		eventType: normalizedEvent.eventType,
		eventId: normalizedEvent.externalId,
		dedupeKey: normalizedEvent.dedupeKey,
		transactionId: normalizedEvent.transactionId
	};

	let outcome = { action: 'recorded', status: depositRow.status, depositId: depositRow.id };

	try {
		if (shouldTreatAsSuccess(normalizedEvent.provider, normalizedEvent.eventType, normalizedEvent.status)) {
			const metadata = {
				gatewayWebhook: {
					...gatewayContext,
					status: normalizedEvent.status,
					amount: normalizedEvent.amount ?? null,
					currency: normalizedEvent.currency ?? null
				}
			};

			const approval = await approveDepositRequest({
				requestId: depositRow.id,
				processorId,
				metadata,
				notes: `Auto-approved via ${normalizedEvent.provider} webhook`,
				verification: verificationPayload
			});

			outcome = {
				action: 'approved',
				status: approval.deposit?.status || 'completed',
				depositId: approval.deposit?.id || depositRow.id,
				transactionId: approval.transaction?.id || null
			};

			await finalizeWebhookEvent(record.id, {
				depositId: approval.deposit?.id || depositRow.id,
				status: outcome.status,
				metadata: {
					outcome,
					provider: normalizedEvent.provider
				}
			});

			return {
				eventRecord: { ...record, processed_at: new Date().toISOString() },
				alreadyProcessed: false,
				outcome
			};
		}

		if (shouldTreatAsFailure(normalizedEvent.provider, normalizedEvent.eventType, normalizedEvent.status)) {
			const rejection = await rejectDepositRequest({
				requestId: depositRow.id,
				processorId,
				failureReason: normalizedEvent.failureReason || `Gateway reported status ${normalizedEvent.status || 'unknown'}`,
				metadata: {
					gatewayWebhook: {
						...gatewayContext,
						status: normalizedEvent.status,
						failureReason: normalizedEvent.failureReason || null
					}
				},
				notes: `Auto-rejected via ${normalizedEvent.provider} webhook`
			});

			outcome = {
				action: 'rejected',
				status: rejection.status || 'failed',
				depositId: rejection.id || depositRow.id
			};

			await finalizeWebhookEvent(record.id, {
				depositId: rejection.id || depositRow.id,
				status: outcome.status,
				metadata: {
					outcome,
					provider: normalizedEvent.provider
				}
			});

			return {
				eventRecord: { ...record, processed_at: new Date().toISOString() },
				alreadyProcessed: false,
				outcome
			};
		}

		await appendDepositMetadata(depositRow.id, {
			gatewayWebhook: {
				...gatewayContext,
				status: normalizedEvent.status,
				amount: normalizedEvent.amount ?? null,
				currency: normalizedEvent.currency ?? null
			}
		}, verificationPayload);

		await finalizeWebhookEvent(record.id, {
			depositId: depositRow.id,
			status: normalizedEvent.status || depositRow.status,
			metadata: {
				outcome
			}
		});

		return {
			eventRecord: { ...record, processed_at: new Date().toISOString() },
			alreadyProcessed: false,
			outcome
		};
	} catch (error) {
		if (isFinalizedStateError(error)) {
			logger.info('Deposit already finalized; marking webhook as processed', {
				...gatewayContext,
				depositId: depositRow.id
			});

			await finalizeWebhookEvent(record.id, {
				depositId: depositRow.id,
				status: depositRow.status,
				metadata: {
					outcome: {
						action: 'noop',
						status: depositRow.status,
						depositId: depositRow.id
					}
				}
			});

			return {
				eventRecord: { ...record, processed_at: new Date().toISOString() },
				alreadyProcessed: false,
				outcome: {
					action: 'noop',
					status: depositRow.status,
					depositId: depositRow.id
				}
			};
		}

		await recordWebhookError(record.id, error);
		throw error;
	}
}

function extractLatestCharge(object) {
	const charges = Array.isArray(object?.charges?.data) ? object.charges.data : [];
	if (charges.length === 0) {
		return null;
	}
	return charges[charges.length - 1];
}

function buildStripeVerification(object) {
	const verification = {};
	const latestCharge = extractLatestCharge(object);
	const details = ensurePlainObject(latestCharge?.payment_method_details);
	const card = ensurePlainObject(details?.card);

	if (Object.keys(card).length > 0) {
		verification.card = {
			brand: card.brand || null,
			last4: card.last4 || null,
			expMonth: card.exp_month || null,
			expYear: card.exp_year || null,
			fingerprint: card.fingerprint || null
		};
	}

	const threeDS = ensurePlainObject(card?.three_d_secure);
	if (Object.keys(threeDS).length > 0) {
		verification.threeDS = {
			result: threeDS.result || null,
			version: threeDS.version || null,
			method: threeDS.authentication_flow || threeDS.eci || null
		};
	}

	return verification;
}

function getStripeClient() {
	if (!getStripeClient.instance) {
		const apiKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
		getStripeClient.instance = new Stripe(apiKey, { apiVersion: '2022-11-15' });
	}
	return getStripeClient.instance;
}

function constructStripeEvent(rawBody, signature) {
	const secret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!secret) {
		logger.warn('STRIPE_WEBHOOK_SECRET is not configured; skipping signature verification');
		return null;
	}

	if (!signature || !rawBody) {
		throw new WebhookSignatureError('stripe', 'Missing Stripe webhook signature or payload');
	}

	try {
		const stripe = getStripeClient();
		return stripe.webhooks.constructEvent(rawBody, signature, secret);
	} catch (error) {
		throw new WebhookSignatureError('stripe', error?.message || 'Invalid Stripe webhook signature');
	}
}

function normalizeStripeEvent({ payload, rawBody, signature }) {
	let event = ensurePlainObject(payload);
	try {
		const verified = constructStripeEvent(rawBody, signature);
		if (verified) {
			event = verified;
		}
	} catch (error) {
		if (error instanceof WebhookSignatureError) {
			throw error;
		}
		logger.warn('Stripe signature verification failed; falling back to provided payload', {
			error: error?.message
		});
	}

	const dataObject = ensurePlainObject(event?.data?.object);
	const metadata = ensurePlainObject(dataObject?.metadata);
	const latestCharge = extractLatestCharge(dataObject);

	const transactionId = dataObject.id || dataObject.payment_intent || latestCharge?.payment_intent || null;
	const depositId = metadata.depositId || metadata.walletDepositId || metadata.deposit_id || null;
	const referenceCode = metadata.referenceCode || metadata.reference_code || dataObject.description || null;

	const amount = typeof dataObject.amount_received === 'number'
		? dataObject.amount_received / 100
		: typeof dataObject.amount === 'number'
			? dataObject.amount / 100
			: null;

	const failureReason = latestCharge?.failure_message
		|| dataObject.cancellation_reason
		|| dataObject?.last_payment_error?.message
		|| null;

	return {
		provider: 'stripe',
		payload: event,
		rawEvent: event,
		rawBody,
		eventType: event.type || null,
		externalId: event.id || null,
		transactionId,
		depositId,
		referenceCode,
		status: dataObject.status || event.type || null,
		amount,
		currency: normalizeCurrency(dataObject.currency),
		verification: buildStripeVerification(dataObject),
		metadata: {
			livemode: event.livemode ?? false,
			paymentMethod: dataObject.payment_method || latestCharge?.payment_method || null,
			attemptCount: dataObject.attempt_count ?? null
		},
		failureReason
	};
}

function normalizeIyzicoEvent({ payload }) {
	const body = ensurePlainObject(payload);
	const meta = ensurePlainObject(body.metadata);

	const status = body.status || body.paymentStatus || body.state || null;
	const transactionId = body.paymentId || body.payment_id || body.transactionId || null;
	const depositId = meta.depositId || meta.walletDepositId || body.depositId || null;
	const referenceCode = meta.referenceCode || body.referenceCode || body.basketId || null;

	return {
		provider: 'iyzico',
		payload: body,
		rawEvent: body,
		eventType: body.eventType || body.type || null,
		externalId: body.eventId || body.paymentId || body.conversationId || null,
		transactionId,
		depositId,
		referenceCode,
		status,
		amount: toNumber(body.paidPrice),
		currency: normalizeCurrency(body.currency),
		verification: meta.verification || null,
		metadata: {
			conversationId: body.conversationId || null,
			installment: body.installment || null
		},
		failureReason: body.errorMessage || body.errorCode || null
	};
}

function normalizePaytrEvent({ payload }) {
	const body = ensurePlainObject(payload);
	const status = body.status || body.payment_status || body.result || null;
	const transactionId = body.merchant_oid || body.transaction_id || body.token || null;

	return {
		provider: 'paytr',
		payload: body,
		rawEvent: body,
		eventType: body.eventType || body.type || null,
		externalId: body.eventId || body.merchant_oid || null,
		transactionId,
		depositId: body.depositId || null,
		referenceCode: body.reference_code || body.referenceCode || null,
		status,
		amount: toNumber(body.total_amount ? body.total_amount / 100 : body.total_amount),
		currency: normalizeCurrency(body.currency),
		verification: body.verification || null,
		metadata: {
			hash: body.hash || null,
			paymentType: body.payment_type || null
		},
		failureReason: body.error_message || body.failed_reason || null
	};
}

function normalizeBinancePayEvent({ payload }) {
	const body = ensurePlainObject(payload);
	const data = ensurePlainObject(body.data);
	const meta = ensurePlainObject(data.metadata || body.metadata);

	const status = body.bizStatus || body.status || null;
	const transactionId = body.tradeNo || data.tradeNo || body.transactionId || null;
	const depositId = meta.depositId || meta.walletDepositId || body.depositId || null;
	const referenceCode = meta.referenceCode || body.merchantTradeNo || data.merchantTradeNo || null;

	const verification = {
		binancePay: {
			payerId: data.payerId || body.payerId || null,
			transactionHash: body.orderId || data.orderId || body.transactionHash || null,
			reference: referenceCode || body.bizId || data.bizId || null
		}
	};

	const amount = toNumber(data.totalAmount || body.totalAmount);

	return {
		provider: 'binance_pay',
		payload: body,
		rawEvent: body,
		eventType: body.eventType || body.type || null,
		externalId: body.bizId || data.bizId || null,
		transactionId,
		depositId,
		referenceCode,
		status,
		amount,
		currency: normalizeCurrency(data.currency || body.currency),
		verification,
		metadata: {
			merchantId: body.merchantId || null,
			env: body.env || null
		},
		failureReason: body.failMessage || body.errorMessage || null
	};
}

export async function handleStripeWebhook(context) {
	const normalizedEvent = normalizeStripeEvent(context);
	const result = await processNormalizedEvent(normalizedEvent);

	return buildAckResponse('stripe', {
		eventId: normalizedEvent.externalId,
		status: normalizedEvent.status || null,
		depositId: result.outcome?.depositId || normalizedEvent.depositId || null,
		outcome: result.outcome,
		alreadyProcessed: result.alreadyProcessed === true,
		dedupeKey: normalizedEvent.dedupeKey
	});
}

export async function handleIyzicoWebhook(context) {
	const normalizedEvent = normalizeIyzicoEvent(context);
	const result = await processNormalizedEvent(normalizedEvent);

	return buildAckResponse('iyzico', {
		eventId: normalizedEvent.externalId,
		status: normalizedEvent.status || null,
		depositId: result.outcome?.depositId || normalizedEvent.depositId || null,
		outcome: result.outcome,
		alreadyProcessed: result.alreadyProcessed === true,
		dedupeKey: normalizedEvent.dedupeKey
	});
}

export async function handlePaytrWebhook(context) {
	const normalizedEvent = normalizePaytrEvent(context);
	const result = await processNormalizedEvent(normalizedEvent);

	return buildAckResponse('paytr', {
		eventId: normalizedEvent.externalId,
		status: normalizedEvent.status || null,
		depositId: result.outcome?.depositId || normalizedEvent.depositId || null,
		outcome: result.outcome,
		alreadyProcessed: result.alreadyProcessed === true,
		dedupeKey: normalizedEvent.dedupeKey
	});
}

export async function handleBinancePayWebhook(context) {
	const normalizedEvent = normalizeBinancePayEvent(context);
	const result = await processNormalizedEvent(normalizedEvent);

	return buildAckResponse('binance_pay', {
		eventId: normalizedEvent.externalId,
		status: normalizedEvent.status || null,
		depositId: result.outcome?.depositId || normalizedEvent.depositId || null,
		outcome: result.outcome,
		alreadyProcessed: result.alreadyProcessed === true,
		dedupeKey: normalizedEvent.dedupeKey
	});
}

export async function handleGatewayWebhook(provider, context) {
	switch (provider) {
		case 'stripe':
			return handleStripeWebhook(context);
		case 'iyzico':
			return handleIyzicoWebhook(context);
		case 'paytr':
			return handlePaytrWebhook(context);
		case 'binance_pay':
			return handleBinancePayWebhook(context);
		default:
			throw new AppError(`Unsupported webhook provider: ${provider}`, 400);
	}
}

export default {
	handleStripeWebhook,
	handleIyzicoWebhook,
	handlePaytrWebhook,
	handleBinancePayWebhook,
	handleGatewayWebhook
};
