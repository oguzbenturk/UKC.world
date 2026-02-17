import { randomUUID } from 'node:crypto';

export async function initiateDeposit({
  amount,
  currency,
  userId,
  metadata = {},
  referenceCode
}) {
  const invoiceId = randomUUID();

  return {
    gateway: 'paytr',
    shouldAutoComplete: false,
    status: 'requires_action',
    gatewayTransactionId: `sim-paytr-${invoiceId}`,
    metadata: {
      provider: 'paytr',
      referenceCode: referenceCode || null,
      ...metadata
    },
    session: {
      provider: 'paytr',
      iframeUrl: `https://sandbox-paytr.example/pay/${invoiceId}`,
      token: invoiceId,
      amount,
      currency,
      userId
    }
  };
}
