import { randomUUID } from 'node:crypto';

import { logger } from '../middlewares/errorHandler.js';
import { getGateway, supportedGateways } from './paymentGateways/index.js';
import { normalizeGatewayPayload } from './paymentGateways/sharedValidation.js';

function normalizeGatewayKey(gateway) {
  if (!gateway) {
    return null;
  }
  return gateway.toLowerCase();
}

export function listSupportedGateways() {
  return supportedGateways;
}

function resolveIdempotencyKey(explicitKey) {
  if (explicitKey && typeof explicitKey === 'string' && explicitKey.trim().length > 0) {
    return explicitKey.trim();
  }

  return randomUUID();
}

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  if (error.retryable === true) {
    return true;
  }

  const message = String(error.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('temporarily unavailable');
}

async function executeWithRetries(operation, { maxAttempts, provider }) {
  let attempt = 0;
  let lastError;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      logger.warn('Gateway initiation attempt failed', {
        provider,
        attempt,
        maxAttempts,
        error: error?.message
      });

      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Gateway initiation failed');
}

export async function initiateGatewayDeposit({
  gateway,
  amount,
  currency,
  userId,
  clientIp,
  metadata,
  referenceCode,
  idempotencyKey,
  retryAttempts
}) {
  const normalizedGateway = normalizeGatewayKey(gateway);
  if (!normalizedGateway) {
    throw new Error('Payment gateway is required for card deposits');
  }

  const resolvedIdempotencyKey = resolveIdempotencyKey(idempotencyKey);
  const maxAttempts = Math.max(
    1,
    retryAttempts ?? Number.parseInt(process.env.PAYMENT_GATEWAY_RETRY_ATTEMPTS || '1', 10)
  );

  const sanitizedPayload = normalizeGatewayPayload({
    gateway: normalizedGateway,
    amount,
    currency,
    userId,
    metadata
  });

  const implementation = getGateway(normalizedGateway);
  if (!implementation?.initiateDeposit) {
    throw new Error(`Unsupported payment gateway: ${gateway}`);
  }

  const execute = async (attempt) => {
    logger.info('Initiating gateway deposit', {
      provider: normalizedGateway,
      attempt,
      maxAttempts,
      idempotencyKey: resolvedIdempotencyKey
    });

    return implementation.initiateDeposit({
      amount: sanitizedPayload.amount,
      currency: sanitizedPayload.currency,
      userId,
      clientIp,
      metadata: {
        ...sanitizedPayload.metadata,
        idempotencyKey: resolvedIdempotencyKey
      },
      referenceCode,
      idempotencyKey: resolvedIdempotencyKey
    });
  };

  return executeWithRetries(execute, { maxAttempts, provider: normalizedGateway });
}

export const __testables = {
  resolveIdempotencyKey,
  shouldRetry,
  executeWithRetries
};
