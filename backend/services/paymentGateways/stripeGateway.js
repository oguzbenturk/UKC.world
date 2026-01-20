import { randomUUID } from 'node:crypto';

export async function initiateDeposit({
  amount,
  currency,
  userId,
  metadata = {},
  referenceCode
}) {
  const sessionId = randomUUID();

  return {
    gateway: 'stripe',
    shouldAutoComplete: false,
    status: 'requires_payment_method',
    gatewayTransactionId: `sim-stripe-${sessionId}`,
    metadata: {
      provider: 'stripe',
      referenceCode: referenceCode || null,
      ...metadata
    },
    session: {
      provider: 'stripe',
      mode: 'payment',
      clientSecret: `pi_${sessionId}_secret_${sessionId.slice(0, 8)}`,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
      amount,
      currency,
      userId
    }
  };
}
