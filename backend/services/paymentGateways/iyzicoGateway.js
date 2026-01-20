import { randomUUID } from 'node:crypto';

export async function initiateDeposit({
  amount,
  currency,
  userId,
  metadata = {},
  referenceCode
}) {
  const token = randomUUID();

  return {
    gateway: 'iyzico',
    shouldAutoComplete: false,
    status: 'requires_action',
    gatewayTransactionId: `sim-iyzico-${token}`,
    metadata: {
      provider: 'iyzico',
      referenceCode: referenceCode || null,
      ...metadata
    },
    session: {
      provider: 'iyzico',
      checkoutFormToken: token,
      threeDSUrl: `https://sandbox-iyzico.example/checkout/${token}`,
      amount,
      currency,
      userId
    }
  };
}
