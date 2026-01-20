import { randomUUID } from 'node:crypto';

const DEFAULT_SESSION_EXPIRY_MINUTES = Number.parseInt(process.env.BINANCE_PAY_SESSION_EXPIRES_MINUTES, 10) || 15;

export async function initiateDeposit({
  amount,
  currency,
  userId,
  metadata = {},
  referenceCode
}) {
  const invoiceId = randomUUID();
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const sessionMetadata = {
    provider: 'binance_pay',
    invoiceId,
    referenceCode: referenceCode || null,
    ...metadata
  };

  return {
    gateway: 'binance_pay',
    shouldAutoComplete: false,
    status: 'pending',
    gatewayTransactionId: `sim-binance-${invoiceId}`,
    metadata: sessionMetadata,
    session: {
      provider: 'binance_pay',
      invoiceId,
      checkoutUrl: metadata?.redirectUrl || `https://pay.binance.com/en/invoice/${invoiceId}`,
      qrCodeUrl: `https://pay.binance.com/qr/${invoiceId}`,
      expiresAt,
      amount,
      currency,
      userId
    }
  };
}
