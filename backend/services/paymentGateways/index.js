import { initiateDeposit as iyzicoInitiateDeposit } from './iyzicoGateway.js';

const gateways = {
  iyzico: {
    initiateDeposit: iyzicoInitiateDeposit
  }
};

export function getGateway(key) {
  if (!key) {
    return null;
  }

  return gateways[key.toLowerCase()] || null;
}

export const supportedGateways = Object.freeze(Object.keys(gateways));
