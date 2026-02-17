import { initiateDeposit as stripeInitiateDeposit } from './stripeGateway.js';
import { initiateDeposit as iyzicoInitiateDeposit } from './iyzicoGateway.js';
import { initiateDeposit as paytrInitiateDeposit } from './paytrGateway.js';
import { initiateDeposit as binancePayInitiateDeposit } from './binancePayGateway.js';

const gateways = {
  stripe: {
    initiateDeposit: stripeInitiateDeposit
  },
  iyzico: {
    initiateDeposit: iyzicoInitiateDeposit
  },
  paytr: {
    initiateDeposit: paytrInitiateDeposit
  },
  binance_pay: {
    initiateDeposit: binancePayInitiateDeposit
  }
};

export function getGateway(key) {
  if (!key) {
    return null;
  }

  return gateways[key.toLowerCase()] || null;
}

export const supportedGateways = Object.freeze(Object.keys(gateways));
