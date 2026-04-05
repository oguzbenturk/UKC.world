/**
 * Persona + Iyzico sandbox defaults for User_browser_tests.
 *
 * Resolution order (email / password):
 * 1. USER_BROWSER_STUDENT_EMAIL / USER_BROWSER_STUDENT_PASSWORD — explicit override
 * 2. .browser-student-credentials.json — last successful student-register-and-iyzico-wallet (or manual write)
 * 3. REGISTER_TEST_EMAIL (email only) + TestPass123! if that was used for registration
 * 4. STUDENT_* from root e2e helpers
 *
 * For wallet-only runs after a prior registration, the credentials file is still updated by:
 *   student-register-and-iyzico-wallet.spec.ts
 */
import { STUDENT_EMAIL, STUDENT_PASSWORD } from '../../helpers';
import { readBrowserStudentCredentials } from './browserStudentCredentialsStore';

const DEFAULT_REG_PASSWORD = 'TestPass123!';

export function getUserBrowserStudentEmail(): string {
  const fromEnv = process.env.USER_BROWSER_STUDENT_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  const persisted = readBrowserStudentCredentials();
  if (persisted) return persisted.email;
  const registerFixed = process.env.REGISTER_TEST_EMAIL?.trim();
  if (registerFixed) return registerFixed;
  return STUDENT_EMAIL;
}

export function getUserBrowserStudentPassword(): string {
  const fromEnv = process.env.USER_BROWSER_STUDENT_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const persisted = readBrowserStudentCredentials();
  if (persisted) return persisted.password;
  if (process.env.REGISTER_TEST_EMAIL?.trim()) {
    return process.env.REGISTER_TEST_PASSWORD?.trim() || DEFAULT_REG_PASSWORD;
  }
  return STUDENT_PASSWORD;
}

/** Shown on Iyzico card holder field */
export function getIyzicoCardHolderName(): string {
  return process.env.IYZICO_TEST_CARD_NAME?.trim() || 'Mehmet Ural';
}

export function getIyzicoTestCard(): {
  number: string;
  exp: string;
  cvc: string;
  smsCode: string;
} {
  return {
    number: process.env.IYZICO_TEST_CARD_NUMBER?.trim() || '5890040000000016',
    exp: process.env.IYZICO_TEST_CARD_EXP?.trim() || '12/35',
    cvc: process.env.IYZICO_TEST_CARD_CVC?.trim() || '456',
    smsCode: process.env.IYZICO_TEST_SMS_CODE?.trim() || '283126',
  };
}

/** TRY: Turkish grouping 99.999 → 99999 for Ant InputNumber */
export function getWalletDepositAmountTry(): number {
  const raw = process.env.USER_BROWSER_WALLET_DEPOSIT_TRY?.trim();
  if (raw) return Number.parseFloat(raw.replace(/\./g, '')) || 99999;
  return 99999;
}
