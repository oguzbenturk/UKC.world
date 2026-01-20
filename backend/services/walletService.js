import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { initiateGatewayDeposit } from './paymentGatewayService.js';

const DEFAULT_CURRENCY = process.env.DEFAULT_WALLET_CURRENCY?.toUpperCase() || 'EUR';
const VALID_TRANSACTION_STATUSES = new Set(['pending', 'completed', 'failed', 'cancelled']);
const VALID_DIRECTIONS = new Set(['credit', 'debit', 'adjustment']);
const GLOBAL_SCOPE_ID = '00000000-0000-0000-0000-000000000000';
const VALID_DEPOSIT_METHODS = new Set(['card', 'bank_transfer', 'binance_pay', 'crypto', 'manual']);
const APPROVABLE_DEPOSIT_STATUSES = new Set(['pending', 'processing']);
const BANK_REFERENCE_PREFIX = 'BT';
const VALID_PAYMENT_METHOD_STATUSES = new Set(['active', 'inactive']);
const VALID_VERIFICATION_STATUSES = new Set(['unverified', 'pending', 'under_review', 'verified', 'rejected', 'needs_more_info']);
const VALID_KYC_STATUSES = new Set(['pending', 'under_review', 'approved', 'rejected', 'needs_more_info']);
const TOTAL_SPENT_TRANSACTION_TYPES = new Set(['payment', 'credit']);
const LEGACY_MIRROR_ENABLED = process.env.WALLET_ENABLE_LEGACY_MIRROR === 'true';

const DEFAULT_DEPOSIT_POLICY = Object.freeze({
  allowUnlimitedDeposits: true,
  maxPerTransaction: null,
  maxPerDay: null,
  maxPerMonth: null
});

const DEFAULT_PREFERENCES = Object.freeze({
  depositPolicy: DEFAULT_DEPOSIT_POLICY
});

const DEFAULT_SETTINGS = {
  discountPercent: 0,
  cardFeePercent: 0,
  withdrawalAutoApproveAfterHours: 12,
  withdrawalProcessingTimeDays: 1,
  allowMixedPayments: true,
  autoUseWalletFirst: true,
  requireKycForWithdrawals: true,
  kycDocumentRequirements: [],
  enabledGateways: ['stripe', 'iyzico', 'paytr', 'binance_pay'],
  preferences: DEFAULT_PREFERENCES,
  isDefault: false
};

const MISSING_RELATION_CODE = '42P01';

function isMissingRelationError(error) {
  return Boolean(error?.code === MISSING_RELATION_CODE);
}

function normalizeCurrency(currency) {
  return (currency || DEFAULT_CURRENCY).toUpperCase();
}

function toNumeric(value) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(4));
}

function ensurePlainObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return { ...fallback };
}

function toBooleanFlag(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }
  }

  if (typeof value === 'number') {
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
  }

  return defaultValue;
}

function cloneDefaultPreferences() {
  return {
    depositPolicy: { ...DEFAULT_DEPOSIT_POLICY },
    kycDocumentRequirements: []
  };
}

function normalizePreferences(preferences) {
  const base = ensurePlainObject(preferences);
  const normalizedPolicy = {
    ...DEFAULT_DEPOSIT_POLICY,
    ...ensurePlainObject(base.depositPolicy)
  };
  const normalizedKycRequirements = Array.isArray(base.kycDocumentRequirements)
    ? base.kycDocumentRequirements.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    ...cloneDefaultPreferences(),
    ...base,
    depositPolicy: {
      ...normalizedPolicy,
      allowUnlimitedDeposits: toBooleanFlag(normalizedPolicy.allowUnlimitedDeposits, true)
    },
    kycDocumentRequirements: normalizedKycRequirements
  };
}

function mergePreferences(basePreferences = {}, incomingPreferences = {}) {
  const normalizedBase = normalizePreferences(basePreferences);
  const normalizedIncoming = normalizePreferences(incomingPreferences);
  const rawIncomingPolicy = ensurePlainObject(incomingPreferences?.depositPolicy);

  const mergedPolicy = { ...normalizedBase.depositPolicy };
  const incomingPolicy = normalizedIncoming.depositPolicy;

  if ('maxPerTransaction' in rawIncomingPolicy) {
    mergedPolicy.maxPerTransaction = incomingPolicy.maxPerTransaction;
  }

  if ('maxPerDay' in rawIncomingPolicy) {
    mergedPolicy.maxPerDay = incomingPolicy.maxPerDay;
  }

  if ('maxPerMonth' in rawIncomingPolicy) {
    mergedPolicy.maxPerMonth = incomingPolicy.maxPerMonth;
  }

  if ('allowUnlimitedDeposits' in rawIncomingPolicy) {
    mergedPolicy.allowUnlimitedDeposits = toBooleanFlag(
      incomingPolicy.allowUnlimitedDeposits,
      normalizedBase.depositPolicy.allowUnlimitedDeposits
    );
  }

  return {
    ...normalizedBase,
    ...normalizedIncoming,
    depositPolicy: {
      ...mergedPolicy
    }
  };
}

function resolveDepositPolicy(rawPreferences = {}) {
  const policy = normalizePreferences({ depositPolicy: rawPreferences }).depositPolicy;

  const toLimit = (value) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Number(parsed.toFixed(4));
  };

  return {
    allowUnlimitedDeposits: policy.allowUnlimitedDeposits !== false,
    maxPerTransaction: toLimit(policy.maxPerTransaction),
    maxPerDay: toLimit(policy.maxPerDay),
    maxPerMonth: toLimit(policy.maxPerMonth)
  };
}

function resolveEnabledGateways(settings) {
  const configured = Array.isArray(settings?.enabledGateways) && settings.enabledGateways.length > 0
    ? settings.enabledGateways
    : DEFAULT_SETTINGS.enabledGateways;

  return new Set(configured.map((gatewayKey) => gatewayKey.toLowerCase()));
}

function normalizeScopeIdentifier(scopeType = 'global', scopeId) {
  const resolvedType = (scopeType || 'global').toLowerCase();
  if (resolvedType === 'global') {
    return { scopeType: 'global', scopeId: GLOBAL_SCOPE_ID };
  }

  if (!scopeId) {
    throw new Error(`scopeId is required for scopeType "${resolvedType}"`);
  }

  return { scopeType: resolvedType, scopeId };
}

function generateBankTransferReference(userId) {
  const randomSegment = Math.random().toString(36).slice(2, 10).toUpperCase();
  const userSegment = (userId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();

  return [BANK_REFERENCE_PREFIX, userSegment, randomSegment].filter(Boolean).join('-');
}

function buildDefaultSettingsRow({ scopeType, scopeId, currency, overrides = {} }) {
  const normalizedCurrency = normalizeCurrency(currency);
  const enabledGateways = Array.isArray(overrides.enabledGateways) && overrides.enabledGateways.length > 0
    ? [...overrides.enabledGateways]
    : [...DEFAULT_SETTINGS.enabledGateways];
  const preferences = normalizePreferences(overrides.preferences ?? DEFAULT_SETTINGS.preferences);
  const preferencesCopy = JSON.parse(JSON.stringify(preferences));

  return {
    scope_type: scopeType,
    scope_id: scopeId,
    currency: normalizedCurrency,
    discount_percent: overrides.discountPercent ?? DEFAULT_SETTINGS.discountPercent,
    card_fee_percent: overrides.cardFeePercent ?? DEFAULT_SETTINGS.cardFeePercent,
    withdrawal_auto_approve_after_hours: overrides.withdrawalAutoApproveAfterHours ?? DEFAULT_SETTINGS.withdrawalAutoApproveAfterHours,
    withdrawal_processing_time_days: overrides.withdrawalProcessingTimeDays ?? DEFAULT_SETTINGS.withdrawalProcessingTimeDays,
    allow_mixed_payments: overrides.allowMixedPayments ?? DEFAULT_SETTINGS.allowMixedPayments,
    auto_use_wallet_first: overrides.autoUseWalletFirst ?? DEFAULT_SETTINGS.autoUseWalletFirst,
    require_kyc_for_withdrawals: overrides.requireKycForWithdrawals ?? DEFAULT_SETTINGS.requireKycForWithdrawals,
    enabled_gateways: enabledGateways,
    preferences: preferencesCopy,
    is_default: overrides.isDefault ?? true,
    created_at: overrides.createdAt ?? null,
    updated_at: overrides.updatedAt ?? null
  };
}

function mapSettingsRow(row) {
  if (!row) {
    return null;
  }

  const preferences = normalizePreferences(row.preferences);
  const preferencesCopy = JSON.parse(JSON.stringify(preferences));
  const enabledGateways = Array.isArray(row.enabled_gateways) ? [...row.enabled_gateways] : [...DEFAULT_SETTINGS.enabledGateways];

  return {
    scopeType: row.scope_type,
    scopeId: row.scope_id === GLOBAL_SCOPE_ID ? null : row.scope_id,
    currency: row.currency,
    discountPercent: toNumeric(row.discount_percent),
    cardFeePercent: toNumeric(row.card_fee_percent),
    withdrawalAutoApproveAfterHours: row.withdrawal_auto_approve_after_hours != null
      ? Number(row.withdrawal_auto_approve_after_hours)
      : DEFAULT_SETTINGS.withdrawalAutoApproveAfterHours,
    withdrawalProcessingTimeDays: row.withdrawal_processing_time_days != null
      ? Number(row.withdrawal_processing_time_days)
      : DEFAULT_SETTINGS.withdrawalProcessingTimeDays,
    allowMixedPayments: row.allow_mixed_payments ?? DEFAULT_SETTINGS.allowMixedPayments,
    autoUseWalletFirst: row.auto_use_wallet_first ?? DEFAULT_SETTINGS.autoUseWalletFirst,
    requireKycForWithdrawals: row.require_kyc_for_withdrawals ?? DEFAULT_SETTINGS.requireKycForWithdrawals,
    enabledGateways,
    preferences: preferencesCopy,
    kycDocumentRequirements: Array.isArray(preferencesCopy.kycDocumentRequirements)
      ? [...preferencesCopy.kycDocumentRequirements]
      : [],
    isDefault: row.is_default ?? DEFAULT_SETTINGS.isDefault,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDepositRow(row) {
  if (!row) {
    return null;
  }

  const metadata = ensurePlainObject(row.metadata);
  const verificationMetadata = ensurePlainObject(row.verification_metadata);

  return {
    id: row.id,
    userId: row.user_id,
    currency: row.currency,
    amount: toNumeric(row.amount),
    method: row.method,
    status: row.status,
    referenceCode: row.reference_code,
    proofUrl: row.proof_url,
    gateway: row.gateway,
    gatewayTransactionId: row.gateway_transaction_id,
    bankAccountId: row.bank_account_id,
    bankReferenceCode: row.bank_reference_code,
    paymentMethodId: row.payment_method_id,
    initiatedBy: row.initiated_by,
    processedBy: row.processed_by,
    processedAt: row.processed_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    failureReason: row.failure_reason,
    notes: row.notes,
    metadata: { ...metadata },
    verificationMetadata: { ...verificationMetadata },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBankAccountRow(row) {
  if (!row) {
    return null;
  }

  const metadata = ensurePlainObject(row.metadata);
  const verificationMetadata = ensurePlainObject(row.verification_metadata);

  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id === GLOBAL_SCOPE_ID ? null : row.scope_id,
    currency: row.currency,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountNumber: row.account_number,
    iban: row.iban,
    swiftCode: row.swift_code,
    routingNumber: row.routing_number,
    instructions: row.instructions,
    metadata: { ...metadata },
    isActive: row.is_active,
    isPrimary: row.is_primary,
    displayOrder: row.display_order,
    verificationStatus: row.verification_status || 'unverified',
    verificationMetadata: { ...verificationMetadata },
    verificationNotes: row.verification_notes,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPaymentMethodRow(row) {
  if (!row) {
    return null;
  }

  const metadata = ensurePlainObject(row.metadata);
  const verificationMetadata = ensurePlainObject(row.verification_metadata);

  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    provider: row.provider,
    displayName: row.display_name,
    maskedIdentifier: row.masked_identifier,
    externalId: row.external_id,
    status: row.status,
    verificationStatus: row.verification_status || 'unverified',
    verificationMetadata: { ...verificationMetadata },
    verificationNotes: row.verification_notes,
    lastVerifiedBy: row.last_verified_by,
    verifiedAt: row.verified_at,
    metadata: { ...metadata },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapKycDocumentRow(row) {
  if (!row) {
    return null;
  }

  const metadata = ensurePlainObject(row.metadata);

  return {
    id: row.id,
    userId: row.user_id,
    paymentMethodId: row.payment_method_id,
    documentType: row.document_type,
    status: row.status,
    fileUrl: row.file_url,
    storagePath: row.storage_path,
    metadata: { ...metadata },
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePaymentMethodStatus(status, defaultStatus = 'active') {
  if (!status) {
    return defaultStatus;
  }

  const normalized = String(status).trim().toLowerCase();
  if (!VALID_PAYMENT_METHOD_STATUSES.has(normalized)) {
    throw new Error(`Unsupported payment method status: ${status}`);
  }
  return normalized;
}

function normalizeVerificationStatus(status, defaultStatus = 'unverified') {
  if (!status) {
    return defaultStatus;
  }

  const normalized = String(status).trim().toLowerCase();
  if (!VALID_VERIFICATION_STATUSES.has(normalized)) {
    throw new Error(`Unsupported verification status: ${status}`);
  }
  return normalized;
}

function normalizeKycStatus(status, defaultStatus = 'pending') {
  if (!status) {
    return defaultStatus;
  }

  const normalized = String(status).trim().toLowerCase();
  if (!VALID_KYC_STATUSES.has(normalized)) {
    throw new Error(`Unsupported KYC status: ${status}`);
  }
  return normalized;
}

async function fetchBankAccountRowById(id) {
  if (!id) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT *
     FROM wallet_bank_accounts
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function fetchPaymentMethodRowById(id, { client } = {}) {
  if (!id) {
    return null;
  }

  const executor = client || pool;
  const { rows } = await executor.query(
    `SELECT *
       FROM wallet_payment_methods
      WHERE id = $1
      LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function ensureUserKycRequirements({ userId, requiredDocumentTypes = [], client } = {}) {
  if (!userId) {
    throw new Error('userId is required to evaluate KYC requirements');
  }

  if (!Array.isArray(requiredDocumentTypes) || requiredDocumentTypes.length === 0) {
    return;
  }

  const uniqueRequired = [...new Set(requiredDocumentTypes.filter((doc) => typeof doc === 'string' && doc.trim().length > 0))];
  if (uniqueRequired.length === 0) {
    return;
  }

  const executor = client || pool;
  const { rows } = await executor.query(
    `SELECT DISTINCT document_type
       FROM wallet_kyc_documents
      WHERE user_id = $1
        AND document_type = ANY($2::text[])
        AND status = 'approved'`,
    [userId, uniqueRequired]
  );

  const approvedTypes = new Set(rows.map((row) => row.document_type));
  const missing = uniqueRequired.filter((doc) => !approvedTypes.has(doc));

  if (missing.length > 0) {
    throw new Error(`Required verification document(s) missing: ${missing.join(', ')}`);
  }
}

function extractVerificationMetadata(baseMetadata = {}, overrideMetadata = {}) {
  const primary = ensurePlainObject(baseMetadata);
  const override = ensurePlainObject(overrideMetadata);
  return { ...primary, ...override };
}

async function handleDepositPaymentMethodVerification({
  depositRow,
  transactionRecord,
  reviewerId,
  client,
  verificationDetails
}) {
  if (!depositRow) {
    return;
  }

  const method = (depositRow.method || '').toLowerCase();
  if (!['card', 'binance_pay'].includes(method)) {
    return;
  }

  const depositMetadata = ensurePlainObject(depositRow.metadata);
  const verificationMetadata = extractVerificationMetadata(depositRow.verification_metadata, verificationDetails);
  const paymentMethodId = depositRow.payment_method_id
    || verificationMetadata.paymentMethodId
    || depositMetadata.paymentMethodId;

  if (!paymentMethodId) {
    return;
  }

  const baseVerificationMetadata = {
    depositId: depositRow.id,
    method,
    gateway: depositRow.gateway,
    gatewayTransactionId: depositRow.gateway_transaction_id,
    transactionId: transactionRecord?.id || null,
    amount: toNumeric(depositRow.amount),
    currency: depositRow.currency,
    source: 'deposit'
  };

  if (method === 'card') {
    const cardMetadata = extractVerificationMetadata(
      verificationMetadata.card,
      depositMetadata.card
    );
    const threeDSMetadata = extractVerificationMetadata(
      verificationMetadata.threeDS,
      depositMetadata.threeDS || depositMetadata?.gatewayResponse?.threeDS
    );

    const payload = { ...baseVerificationMetadata };
    if (Object.keys(cardMetadata).length > 0) {
      payload.card = cardMetadata;
    }
    if (Object.keys(threeDSMetadata).length > 0) {
      payload.threeDS = threeDSMetadata;
    }
    if (depositMetadata.gatewayResponse) {
      payload.gatewayResponse = ensurePlainObject(depositMetadata.gatewayResponse);
    }

    await updatePaymentMethodVerificationStatus({
      paymentMethodId,
      status: 'verified',
      metadata: payload,
      reviewerId,
      client
    });
    return;
  }

  const binanceVerification = extractVerificationMetadata(
    verificationMetadata.binancePay,
    verificationMetadata.binance
  );
  const binanceDepositDetails = extractVerificationMetadata(
    depositMetadata.binancePayVerification,
    depositMetadata.binancePay
  );
  const combinedBinanceMeta = {
    ...binanceDepositDetails,
    ...binanceVerification
  };

  const payerId = combinedBinanceMeta.payerId || combinedBinanceMeta.customerId || combinedBinanceMeta.payer_id;
  const transactionHash = combinedBinanceMeta.transactionHash
    || combinedBinanceMeta.txHash
    || combinedBinanceMeta.transactionId
    || combinedBinanceMeta.tx_hash;

  const binancePayload = {
    ...baseVerificationMetadata,
    binancePay: {
      payerId: payerId || null,
      transactionHash: transactionHash || null,
      reference: combinedBinanceMeta.reference
        || combinedBinanceMeta.invoiceId
        || depositRow.reference_code
        || depositRow.gateway_transaction_id
        || null
    }
  };

  const status = payerId && transactionHash ? 'verified' : 'needs_more_info';

  await updatePaymentMethodVerificationStatus({
    paymentMethodId,
    status,
    metadata: binancePayload,
    reviewerId,
    client
  });
}

async function loadActiveBankAccount({ id, currency, scopeType, scopeId } = {}) {
  if (!id) {
    return null;
  }

  const row = await fetchBankAccountRowById(id);
  if (!row || row.is_active === false) {
    return null;
  }

  if (currency && row.currency && normalizeCurrency(row.currency) !== normalizeCurrency(currency)) {
    return null;
  }

  if (scopeType) {
    const { scopeType: expectedType, scopeId: expectedId } = normalizeScopeIdentifier(scopeType, scopeId);
    const isGlobal = row.scope_type === 'global' || row.scope_id === GLOBAL_SCOPE_ID;
    const matchesScope =
      row.scope_type === expectedType &&
      (row.scope_type === 'global' || row.scope_id === expectedId);

    if (!matchesScope && !isGlobal) {
      return null;
    }
  }

  return mapBankAccountRow(row);
}

async function fetchSettingsRow(scopeType, scopeId, currency, client = pool) {
  const normalizedCurrency = normalizeCurrency(currency);
  const { scopeType: resolvedScopeType, scopeId: resolvedScopeId } = normalizeScopeIdentifier(scopeType, scopeId);

  const { rows } = await client.query(
    `SELECT *
     FROM wallet_settings
     WHERE scope_type = $1 AND scope_id = $2 AND currency = $3
     LIMIT 1`,
    [resolvedScopeType, resolvedScopeId, normalizedCurrency]
  );

  return rows[0] || null;
}

function buildUpsertParameters({ scopeType, scopeId, currency, settings }) {
  const normalizedCurrency = normalizeCurrency(currency);

  const numericDiscount = toNumeric(settings.discountPercent);
  const numericCardFee = toNumeric(settings.cardFeePercent);
  const autoApproveHours = settings.withdrawalAutoApproveAfterHours != null
    ? Number(settings.withdrawalAutoApproveAfterHours)
    : DEFAULT_SETTINGS.withdrawalAutoApproveAfterHours;
  const processingDays = settings.withdrawalProcessingTimeDays != null
    ? Number(settings.withdrawalProcessingTimeDays)
    : DEFAULT_SETTINGS.withdrawalProcessingTimeDays;

  const enabledGateways = Array.isArray(settings.enabledGateways) && settings.enabledGateways.length > 0
    ? settings.enabledGateways
    : DEFAULT_SETTINGS.enabledGateways;

  const preferences = ensurePlainObject(settings.preferences, DEFAULT_SETTINGS.preferences);

  return {
    scopeType,
    scopeId,
    currency: normalizedCurrency,
    discountPercent: numericDiscount,
    cardFeePercent: numericCardFee,
    withdrawalAutoApproveAfterHours: autoApproveHours,
    withdrawalProcessingTimeDays: processingDays,
    allowMixedPayments: settings.allowMixedPayments ?? DEFAULT_SETTINGS.allowMixedPayments,
    autoUseWalletFirst: settings.autoUseWalletFirst ?? DEFAULT_SETTINGS.autoUseWalletFirst,
    requireKycForWithdrawals: settings.requireKycForWithdrawals ?? DEFAULT_SETTINGS.requireKycForWithdrawals,
    enabledGateways,
    preferences,
    isDefault: settings.isDefault ?? DEFAULT_SETTINGS.isDefault
  };
}

async function upsertSettingsRow({ scopeType, scopeId, currency, settings }) {
  const params = buildUpsertParameters({ scopeType, scopeId, currency, settings });

  const { rows } = await pool.query(
    `INSERT INTO wallet_settings (
       scope_type,
       scope_id,
       currency,
       discount_percent,
       card_fee_percent,
       withdrawal_auto_approve_after_hours,
       withdrawal_processing_time_days,
       allow_mixed_payments,
       auto_use_wallet_first,
       require_kyc_for_withdrawals,
       enabled_gateways,
       preferences,
       is_default,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, NOW(), NOW()
     )
     ON CONFLICT (scope_type, scope_id, currency)
     DO UPDATE SET
       discount_percent = EXCLUDED.discount_percent,
       card_fee_percent = EXCLUDED.card_fee_percent,
       withdrawal_auto_approve_after_hours = EXCLUDED.withdrawal_auto_approve_after_hours,
       withdrawal_processing_time_days = EXCLUDED.withdrawal_processing_time_days,
       allow_mixed_payments = EXCLUDED.allow_mixed_payments,
       auto_use_wallet_first = EXCLUDED.auto_use_wallet_first,
       require_kyc_for_withdrawals = EXCLUDED.require_kyc_for_withdrawals,
       enabled_gateways = EXCLUDED.enabled_gateways,
       preferences = EXCLUDED.preferences,
       is_default = EXCLUDED.is_default,
       updated_at = NOW()
     RETURNING *`,
    [
      params.scopeType,
      params.scopeId,
      params.currency,
      params.discountPercent,
      params.cardFeePercent,
      params.withdrawalAutoApproveAfterHours,
      params.withdrawalProcessingTimeDays,
      params.allowMixedPayments,
      params.autoUseWalletFirst,
      params.requireKycForWithdrawals,
      params.enabledGateways,
      JSON.stringify(params.preferences || {}),
      params.isDefault
    ]
  );

  return rows[0];
}

function mergeSettings(baseSettings, incomingSettings = {}) {
  const normalized = { ...baseSettings };

  if (incomingSettings.discountPercent !== undefined) {
    normalized.discountPercent = toNumeric(incomingSettings.discountPercent);
  }

  if (incomingSettings.cardFeePercent !== undefined) {
    normalized.cardFeePercent = toNumeric(incomingSettings.cardFeePercent);
  }

  if (incomingSettings.withdrawalAutoApproveAfterHours !== undefined) {
    normalized.withdrawalAutoApproveAfterHours = Number(incomingSettings.withdrawalAutoApproveAfterHours);
  }

  if (incomingSettings.withdrawalProcessingTimeDays !== undefined) {
    normalized.withdrawalProcessingTimeDays = Number(incomingSettings.withdrawalProcessingTimeDays);
  }

  if (incomingSettings.allowMixedPayments !== undefined) {
    normalized.allowMixedPayments = Boolean(incomingSettings.allowMixedPayments);
  }

  if (incomingSettings.autoUseWalletFirst !== undefined) {
    normalized.autoUseWalletFirst = Boolean(incomingSettings.autoUseWalletFirst);
  }

  if (incomingSettings.requireKycForWithdrawals !== undefined) {
    normalized.requireKycForWithdrawals = Boolean(incomingSettings.requireKycForWithdrawals);
  }

  if (incomingSettings.enabledGateways && Array.isArray(incomingSettings.enabledGateways)) {
    normalized.enabledGateways = [...incomingSettings.enabledGateways];
  }

  if (incomingSettings.preferences) {
    normalized.preferences = mergePreferences(normalized.preferences, incomingSettings.preferences);
  } else {
    normalized.preferences = normalizePreferences(normalized.preferences);
  }

  normalized.kycDocumentRequirements = Array.isArray(normalized.preferences?.kycDocumentRequirements)
    ? [...normalized.preferences.kycDocumentRequirements]
    : [];

  if (incomingSettings.isDefault !== undefined) {
    normalized.isDefault = Boolean(incomingSettings.isDefault);
  }

  return normalized;
}

async function ensureBalance(client, userId, currency) {
  const normalized = normalizeCurrency(currency);

  const { rows } = await client.query(
    `SELECT * FROM wallet_balances WHERE user_id = $1 AND currency = $2 FOR UPDATE`,
    [userId, normalized]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const insertResult = await client.query(
    `INSERT INTO wallet_balances (user_id, currency)
     VALUES ($1, $2)
     RETURNING *`,
    [userId, normalized]
  );

  return insertResult.rows[0];
}

/**
 * Creates a wallet balance entry for a new user with their preferred currency.
 * This should be called during user registration to initialize their wallet.
 * @param {string} userId - The user's ID
 * @param {string} preferredCurrency - The user's preferred currency (defaults to EUR)
 * @returns {Promise<Object>} The created wallet balance record
 */
export async function createWalletForUser(userId, preferredCurrency = 'EUR') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const balanceRecord = await ensureBalance(client, userId, preferredCurrency);
    await client.query('COMMIT');
    logger.info('Wallet created for new user', { userId, currency: preferredCurrency });
    return balanceRecord;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create wallet for user:', { userId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

export async function getWalletAccountSummary(userId, currency = DEFAULT_CURRENCY) {
  if (!userId) {
    throw new Error('getWalletAccountSummary requires userId');
  }

  const normalized = normalizeCurrency(currency);

  let balanceRow = null;
  try {
    const { rows } = await pool.query(
      `SELECT id,
              available_amount,
              pending_amount,
              non_withdrawable_amount,
              updated_at
         FROM wallet_balances
        WHERE user_id = $1 AND currency = $2`,
      [userId, normalized]
    );
    balanceRow = rows[0] || null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }

  let balanceId = null;
  let available = 0;
  let pending = 0;
  let nonWithdrawable = 0;
  let updatedAt = null;

  if (balanceRow) {
    balanceId = balanceRow.id;
    available = toNumeric(balanceRow.available_amount);
    pending = toNumeric(balanceRow.pending_amount);
    nonWithdrawable = toNumeric(balanceRow.non_withdrawable_amount);
    updatedAt = balanceRow.updated_at;
  }

  let totalCredits = 0;
  let ledgerDebits = 0;
  let lastCreditAt = null;
  let lastTransactionAt = null;

  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'completed' AND available_delta > 0 THEN available_delta ELSE 0 END), 0) AS total_credits,
         COALESCE(SUM(CASE WHEN status = 'completed' AND available_delta < 0 THEN -available_delta ELSE 0 END), 0) AS total_debits,
         MAX(CASE WHEN status = 'completed' AND available_delta > 0 THEN transaction_date END) AS last_credit_at,
         MAX(transaction_date) AS last_transaction_at
       FROM wallet_transactions
       WHERE user_id = $1 AND currency = $2`,
      [userId, normalized]
    );

    if (rows.length > 0) {
      const ledgerRow = rows[0];
      totalCredits = toNumeric(ledgerRow.total_credits);
      ledgerDebits = toNumeric(ledgerRow.total_debits);
      lastCreditAt = ledgerRow.last_credit_at || null;
      lastTransactionAt = ledgerRow.last_transaction_at || null;
    }
  } catch (ledgerError) {
    if (!isMissingRelationError(ledgerError)) {
      throw ledgerError;
    }
  }

  const derivedDebits = toNumeric(totalCredits - available);
  const resolvedDebits = Math.max(0, ledgerDebits, derivedDebits);
  const totalSpent = toNumeric(resolvedDebits);

  return {
    source: 'wallet',
    currency: normalized,
    balanceId,
    available,
    pending,
    nonWithdrawable,
    updatedAt,
    totalCredits,
    totalDebits: toNumeric(resolvedDebits),
    totalSpent,
    lastCreditAt,
    lastTransactionAt
  };
}

export async function getBalance(userId, currency = DEFAULT_CURRENCY) {
  const normalized = normalizeCurrency(currency);
  const { rows } = await pool.query(
    `SELECT available_amount, pending_amount, non_withdrawable_amount, updated_at
     FROM wallet_balances
     WHERE user_id = $1 AND currency = $2`,
    [userId, normalized]
  );

  if (rows.length === 0) {
    return {
      currency: normalized,
      available: 0,
      pending: 0,
      nonWithdrawable: 0,
      updatedAt: null
    };
  }

  const row = rows[0];
  return {
    currency: normalized,
    available: toNumeric(row.available_amount),
    pending: toNumeric(row.pending_amount),
    nonWithdrawable: toNumeric(row.non_withdrawable_amount),
    updatedAt: row.updated_at
  };
}

export async function fetchTransactions(userId, {
  limit = 50,
  offset = 0,
  currency,
  status,
  transactionType,
  startDate,
  endDate,
  direction
} = {}) {
  const filters = [];
  const params = [];
  let index = 0;

  if (userId) {
    index += 1;
    params.push(userId);
    filters.push(`user_id = $${index}`);
  }

  if (currency) {
    index += 1;
    params.push(normalizeCurrency(currency));
    filters.push(`currency = $${index}`);
  }

  if (status) {
    index += 1;
    params.push(status);
    filters.push(`status = $${index}`);
  } else {
    filters.push(`status != 'cancelled'`);
  }

  if (transactionType) {
    index += 1;
    params.push(transactionType);
    filters.push(`transaction_type = $${index}`);
  }

  if (direction) {
    index += 1;
    params.push(direction);
    filters.push(`direction = $${index}`);
  }

  if (startDate) {
    index += 1;
    params.push(new Date(startDate));
    filters.push(`transaction_date >= $${index}`);
  }

  if (endDate) {
    index += 1;
    params.push(new Date(endDate));
    filters.push(`transaction_date <= $${index}`);
  }

  index += 1;
  params.push(Math.max(1, Number(limit)));
  const limitPlaceholder = `$${index}`;
  index += 1;
  params.push(Math.max(0, Number(offset)));
  const offsetPlaceholder = `$${index}`;

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT *
    FROM wallet_transactions
    ${whereClause}
    ORDER BY transaction_date DESC, created_at DESC
    LIMIT ${limitPlaceholder}
    OFFSET ${offsetPlaceholder}
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

export async function getTransactionById(transactionId, client) {
  const executor = client ?? pool;
  const { rows } = await executor.query(
    `SELECT * FROM wallet_transactions WHERE id = $1`,
    [transactionId]
  );
  return rows[0] || null;
}

function resolveDirection(amount, explicit) {
  if (explicit && VALID_DIRECTIONS.has(explicit)) {
    return explicit;
  }
  const numericAmount = toNumeric(amount);
  if (numericAmount > 0) {
    return 'credit';
  }
  if (numericAmount < 0) {
    return 'debit';
  }
  return 'adjustment';
}

async function mirrorLegacyBalance({ client, userId, availableBalance, totalSpentDelta, shouldUpdateLastPayment }) {
  if (!LEGACY_MIRROR_ENABLED) {
    return;
  }

  try {
    await client.query(
      `UPDATE users
         SET balance = $1,
             total_spent = CASE WHEN $3 > 0 THEN COALESCE(total_spent, 0) + $3 ELSE total_spent END,
             last_payment_date = CASE WHEN $4 THEN NOW() ELSE last_payment_date END,
             updated_at = NOW()
       WHERE id = $2`,
      [availableBalance, userId, totalSpentDelta, shouldUpdateLastPayment]
    );
  } catch (error) {
    logger.warn?.('Failed to mirror wallet balance to users table', {
      userId,
      error: error.message
    });
  }
}

export async function recordTransaction({
  userId,
  amount,
  transactionType,
  currency = DEFAULT_CURRENCY,
  status = 'completed',
  direction,
  availableDelta,
  pendingDelta = 0,
  nonWithdrawableDelta = 0,
  metadata = {},
  description,
  paymentMethod,
  referenceNumber,
  bookingId,
  rentalId,
  exchangeRate,
  entityType,
  relatedEntityType,
  relatedEntityId,
  createdBy,
  allowNegative = false,
  client: existingClient,
  // Transaction transparency fields (for audit trail)
  originalAmount = null,
  originalCurrency = null,
  transactionExchangeRate = null
}) {

  if (!transactionType) {
    throw new Error('recordTransaction requires transactionType');
  }

  if (!VALID_TRANSACTION_STATUSES.has(status)) {
    throw new Error(`Invalid wallet transaction status: ${status}`);
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const numericAmount = toNumeric(amount);
  const finalDirection = resolveDirection(numericAmount, direction);
  const metadataObject = ensurePlainObject(metadata);
  const resolvedEntityType = entityType || metadataObject.entityType || relatedEntityType || null;
  const resolvedRelatedEntityType = relatedEntityType || resolvedEntityType;
  const resolvedRelatedEntityId = relatedEntityId || metadataObject.entityId || null;
  const resolvedPaymentMethod = paymentMethod ?? metadataObject.paymentMethod ?? null;
  const resolvedReferenceNumber = referenceNumber ?? metadataObject.referenceNumber ?? null;
  const resolvedBookingId = bookingId
    ?? (resolvedRelatedEntityType === 'booking' ? resolvedRelatedEntityId : null)
    ?? metadataObject.bookingId
    ?? metadataObject.booking_id
    ?? null;
  const resolvedRentalId = rentalId
    ?? (resolvedRelatedEntityType === 'rental' ? resolvedRelatedEntityId : null)
    ?? metadataObject.rentalId
    ?? metadataObject.rental_id
    ?? null;
  const resolvedExchangeRate = (() => {
    const source = exchangeRate ?? metadataObject.exchangeRate;
    if (source === undefined || source === null || source === '') {
      return null;
    }
    const parsed = Number.parseFloat(source);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Number(parsed.toFixed(6));
  })();
  const numericAvailableDelta = availableDelta !== undefined ? toNumeric(availableDelta) : numericAmount;
  const numericPendingDelta = toNumeric(pendingDelta);
  const numericNonWithdrawableDelta = toNumeric(nonWithdrawableDelta);

  let client = existingClient;
  let shouldRelease = false;
  let shouldCommit = false;

  if (!client) {
    client = await pool.connect();
    shouldRelease = true;
    shouldCommit = true;
  }

  try {
    if (shouldCommit) {
      await client.query('BEGIN');
    }

    const balanceRow = await ensureBalance(client, userId, normalizedCurrency);

    const currentAvailable = toNumeric(balanceRow.available_amount);
    const currentPending = toNumeric(balanceRow.pending_amount);
    const currentNonWithdrawable = toNumeric(balanceRow.non_withdrawable_amount);

    const nextAvailable = toNumeric(currentAvailable + numericAvailableDelta);
    const nextPending = toNumeric(currentPending + numericPendingDelta);
    const nextNonWithdrawable = toNumeric(currentNonWithdrawable + numericNonWithdrawableDelta);
    const totalSpentDelta = numericAvailableDelta > 0 && TOTAL_SPENT_TRANSACTION_TYPES.has(transactionType)
      ? toNumeric(numericAvailableDelta)
      : 0;
    const shouldUpdateLastPayment = totalSpentDelta > 0;

    if (!allowNegative && nextAvailable < -0.0001) {
      throw new Error('Insufficient wallet balance');
    }

    if (nextPending < -0.0001) {
      throw new Error('Pending wallet balance cannot be negative');
    }

    if (nextNonWithdrawable < -0.0001) {
      throw new Error('Non-withdrawable wallet balance cannot be negative');
    }

    if (allowNegative && nextAvailable < -0.0001) {
      // Allow the migration guard to accept overdrafts for this transaction within the current session
      await client.query("SELECT set_config('wallet.allow_negative', 'true', true)");
    }

    await client.query(
      `UPDATE wallet_balances
       SET available_amount = $1,
           pending_amount = $2,
           non_withdrawable_amount = $3,
           last_transaction_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [nextAvailable, nextPending, nextNonWithdrawable, balanceRow.id]
    );

    const { rows } = await client.query(
      `INSERT INTO wallet_transactions (
         user_id,
         balance_id,
         transaction_type,
         status,
         direction,
         currency,
         amount,
         available_delta,
         pending_delta,
         non_withdrawable_delta,
         balance_available_after,
         balance_pending_after,
         balance_non_withdrawable_after,
         description,
         payment_method,
         reference_number,
         booking_id,
         rental_id,
         exchange_rate,
         entity_type,
         metadata,
         related_entity_type,
         related_entity_id,
         created_by,
         original_amount,
         original_currency,
         transaction_exchange_rate
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21::jsonb, $22, $23, $24, $25, $26, $27
       )
       RETURNING *`,
      [
        userId,
        balanceRow.id,
        transactionType,
        status,
        finalDirection,
        normalizedCurrency,
        numericAmount,
        numericAvailableDelta,
        numericPendingDelta,
        numericNonWithdrawableDelta,
        nextAvailable,
        nextPending,
        nextNonWithdrawable,
        description || null,
        resolvedPaymentMethod,
        resolvedReferenceNumber,
        resolvedBookingId,
        resolvedRentalId,
        resolvedExchangeRate,
        resolvedEntityType,
        JSON.stringify(metadataObject),
        resolvedRelatedEntityType || null,
        resolvedRelatedEntityId || null,
        createdBy || null,
        originalAmount !== null ? toNumeric(originalAmount) : null,
        originalCurrency ? originalCurrency.toUpperCase() : null,
        transactionExchangeRate !== null ? toNumeric(transactionExchangeRate) : null
      ]
    );

    await mirrorLegacyBalance({
      client,
      userId,
      availableBalance: nextAvailable,
      totalSpentDelta,
      shouldUpdateLastPayment
    });

    if (shouldCommit) {
      await client.query('COMMIT');
    }

    return rows[0];
  } catch (error) {
    if (shouldCommit) {
      await client.query('ROLLBACK');
    }
    logger.error('Wallet transaction failed:', error);
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

export async function recordLegacyTransaction({
  userId,
  amount,
  type,
  transactionType,
  currency = DEFAULT_CURRENCY,
  status = 'completed',
  direction,
  description,
  paymentMethod,
  referenceNumber,
  bookingId,
  rentalId,
  exchangeRate,
  entityType,
  relatedEntityType,
  relatedEntityId,
  metadata = {},
  createdBy,
  allowNegative = false,
  client
}) {
  const normalizedType = transactionType || type;
  if (!normalizedType) {
    throw new Error('recordLegacyTransaction requires type/transactionType');
  }

  const metadataObject = ensurePlainObject(metadata);

  if (paymentMethod !== undefined && paymentMethod !== null && metadataObject.paymentMethod === undefined) {
    metadataObject.paymentMethod = paymentMethod;
  }

  if (referenceNumber !== undefined && referenceNumber !== null && metadataObject.referenceNumber === undefined) {
    metadataObject.referenceNumber = referenceNumber;
  }

  if (bookingId && metadataObject.bookingId === undefined) {
    metadataObject.bookingId = bookingId;
  }

  if (rentalId && metadataObject.rentalId === undefined) {
    metadataObject.rentalId = rentalId;
  }

  if (entityType && metadataObject.entityType === undefined) {
    metadataObject.entityType = entityType;
  }

  if (exchangeRate !== undefined && exchangeRate !== null && metadataObject.exchangeRate === undefined) {
    metadataObject.exchangeRate = exchangeRate;
  }

  const resolvedBookingId = bookingId
    ?? metadataObject.bookingId
    ?? metadataObject.booking_id
    ?? null;

  const resolvedRentalId = rentalId
    ?? metadataObject.rentalId
    ?? metadataObject.rental_id
    ?? null;

  const resolvedEntityType = entityType
    ?? relatedEntityType
    ?? metadataObject.entityType
    ?? metadataObject.entity_type
    ?? null;

  const resolvedRelatedEntityType = relatedEntityType ?? resolvedEntityType;
  let resolvedRelatedEntityId = relatedEntityId ?? metadataObject.entityId ?? metadataObject.relatedEntityId ?? null;

  if (!resolvedRelatedEntityId) {
    if (resolvedRelatedEntityType === 'booking') {
      resolvedRelatedEntityId = resolvedBookingId;
    } else if (resolvedRelatedEntityType === 'rental') {
      resolvedRelatedEntityId = resolvedRentalId;
    }
  }

  return recordTransaction({
    userId,
    amount,
    transactionType: normalizedType,
    currency,
    status,
    direction,
    description,
    paymentMethod: paymentMethod ?? metadataObject.paymentMethod ?? null,
    referenceNumber: referenceNumber ?? metadataObject.referenceNumber ?? null,
    bookingId: resolvedBookingId,
    rentalId: resolvedRentalId,
    exchangeRate,
    entityType: resolvedEntityType,
    relatedEntityType: resolvedRelatedEntityType,
    relatedEntityId: resolvedRelatedEntityId,
    metadata: metadataObject,
    createdBy,
    allowNegative,
    client
  });
}

export async function calculateAvailableBalance(userId, currency = DEFAULT_CURRENCY) {
  const balance = await getBalance(userId, currency);
  return balance.available;
}

export async function lockFundsForBooking({ userId, amount, bookingId, currency = DEFAULT_CURRENCY, client, originalAmount: providedOriginalAmount = null, originalCurrency: providedOriginalCurrency = null, transactionExchangeRate = null }) {
  const absolute = Math.abs(toNumeric(amount));
  if (absolute === 0) {
    return null;
  }

  // Transaction transparency: capture original booking amount if different from wallet currency
  const originalAmount = providedOriginalAmount !== null ? toNumeric(providedOriginalAmount) : absolute;
  const originalCurrency = providedOriginalCurrency || currency;

  return recordTransaction({
    userId,
    amount: 0,
    transactionType: 'wallet_lock',
    currency,
    direction: 'adjustment',
    availableDelta: -absolute,
    pendingDelta: absolute,
    metadata: { bookingId },
    relatedEntityType: 'booking',
    relatedEntityId: bookingId || null,
    allowNegative: false,
    client,
    // Transaction transparency fields
    originalAmount,
    originalCurrency,
    transactionExchangeRate
  });
}

export async function releaseLockedFunds({ userId, amount, bookingId, currency = DEFAULT_CURRENCY, client, reason = 'release', originalAmount: providedOriginalAmount = null, originalCurrency: providedOriginalCurrency = null, transactionExchangeRate = null }) {
  const absolute = Math.abs(toNumeric(amount));
  if (absolute === 0) {
    return null;
  }

  const isCapture = reason === 'capture';

  // Transaction transparency: capture original booking amount
  const originalAmount = providedOriginalAmount !== null ? toNumeric(providedOriginalAmount) : absolute;
  const originalCurrency = providedOriginalCurrency || currency;

  return recordTransaction({
    userId,
    amount: 0,
    transactionType: isCapture ? 'wallet_capture' : 'wallet_unlock',
    currency,
    direction: 'adjustment',
    availableDelta: isCapture ? 0 : absolute,
    pendingDelta: -absolute,
    metadata: { bookingId, reason },
    relatedEntityType: 'booking',
    relatedEntityId: bookingId || null,
    allowNegative: isCapture,
    client,
    // Transaction transparency fields
    originalAmount,
    originalCurrency,
    transactionExchangeRate
  });
}

export function applyDiscountsAndFees({ amount, paymentMix = {}, config = {} }) {
  const baseAmount = toNumeric(amount);
  if (baseAmount <= 0) {
    return {
      walletPortion: 0,
      cardPortion: 0,
      discountAmount: 0,
      cardFeeAmount: 0,
      totalDue: 0
    };
  }

  const {
    walletPercent = 100,
    discountPercent = toNumeric(config.discount_percent ?? config.discountPercent ?? 0),
    cardFeePercent = toNumeric(config.card_fee_percent ?? config.cardFeePercent ?? 0)
  } = {
    ...config,
    ...paymentMix
  };

  const walletPortion = toNumeric((baseAmount * walletPercent) / 100);
  const cardPortion = toNumeric(baseAmount - walletPortion);
  const discountAmount = toNumeric((walletPortion * discountPercent) / 100);
  const cardFeeAmount = toNumeric((cardPortion * cardFeePercent) / 100);
  const totalDue = toNumeric(walletPortion + cardPortion + cardFeeAmount - discountAmount);

  return {
    walletPortion,
    cardPortion,
    discountAmount,
    cardFeeAmount,
    totalDue
  };
}

export async function requestWithdrawal({ userId, amount, currency = DEFAULT_CURRENCY, payoutMethodId, metadata = {}, client: existingClient }) {
  const numericAmount = Math.abs(toNumeric(amount));
  if (numericAmount <= 0) {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const balance = await getBalance(userId, normalizedCurrency);
  if (balance.available < numericAmount - 0.0001) {
    throw new Error('Withdrawal amount exceeds available wallet balance');
  }

  const settings = await getWalletSettings({
    scopeType: 'user',
    scopeId: userId,
    currency: normalizedCurrency,
    includeDefaults: true
  });

  const requireKyc = settings?.requireKycForWithdrawals !== false;
  const requiredDocuments = settings?.kycDocumentRequirements || settings?.preferences?.kycDocumentRequirements || [];

  await ensureUserKycRequirements({ userId, requiredDocumentTypes: requiredDocuments });

  let payoutMethod = null;
  const resolvedPayoutMethodId = payoutMethodId || null;

  if (resolvedPayoutMethodId) {
    payoutMethod = await getPaymentMethodById(resolvedPayoutMethodId, { userId, includeInactive: false });
    if (!payoutMethod) {
      throw new Error('Selected payout method is not available');
    }

    if (payoutMethod.verificationStatus !== 'verified' && requireKyc) {
      throw new Error('Selected payout method has not passed verification');
    }
  } else if (requireKyc) {
    throw new Error('A verified payout method is required when withdrawals require KYC');
  }

  let client = existingClient;
  let shouldRelease = false;
  let shouldCommit = false;

  if (!client) {
    client = await pool.connect();
    shouldRelease = true;
    shouldCommit = true;
  }

  try {
    if (shouldCommit) {
      await client.query('BEGIN');
    }

    // Transaction transparency: capture original withdrawal amount/currency
    const originalAmount = numericAmount;
    const originalCurrency = normalizedCurrency;

    await recordTransaction({
      userId,
      amount: -numericAmount,
      transactionType: 'withdrawal_request',
      currency: normalizedCurrency,
      status: 'pending',
      direction: 'debit',
      availableDelta: -numericAmount,
      pendingDelta: numericAmount,
      metadata: {
        payoutMethodId: resolvedPayoutMethodId,
        stage: 'request',
        payoutProvider: payoutMethod?.provider || null
      },
      relatedEntityType: 'withdrawal_request',
      allowNegative: false,
      client,
      // Transaction transparency fields
      originalAmount,
      originalCurrency
    });

    const { rows } = await client.query(
      `INSERT INTO wallet_withdrawal_requests (
         user_id,
         payout_method_id,
         amount,
         currency,
         status,
         metadata
       ) VALUES ($1, $2, $3, $4, 'pending', $5::jsonb)
       RETURNING *`,
      [
        userId,
        resolvedPayoutMethodId || null,
        numericAmount,
        normalizedCurrency,
        JSON.stringify({ ...ensurePlainObject(metadata), payoutMethodProvider: payoutMethod?.provider || null })
      ]
    );

    if (shouldCommit) {
      await client.query('COMMIT');
    }

    return rows[0];
  } catch (error) {
    if (shouldCommit) {
      await client.query('ROLLBACK');
    }
    logger.error('Wallet withdrawal request failed:', error);
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

export async function approveWithdrawal({ requestId, approverId, autoApproved = false }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM wallet_withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );

    if (rows.length === 0) {
      throw new Error('Withdrawal request not found');
    }

    const request = rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return request;
    }

    const settings = await getWalletSettings({
      scopeType: 'user',
      scopeId: request.user_id,
      currency: request.currency,
      includeDefaults: true,
      client
    });

    const requiredDocuments = settings?.kycDocumentRequirements || settings?.preferences?.kycDocumentRequirements || [];
    await ensureUserKycRequirements({
      userId: request.user_id,
      requiredDocumentTypes: requiredDocuments,
      client
    });

    if (settings?.requireKycForWithdrawals !== false) {
      if (!request.payout_method_id) {
        throw new Error('Withdrawal request does not have a verified payout method');
      }

      const payoutMethodRow = await fetchPaymentMethodRowById(request.payout_method_id, { client });
      if (!payoutMethodRow || payoutMethodRow.user_id !== request.user_id) {
        throw new Error('Withdrawal payout method is invalid');
      }

      if (payoutMethodRow.status !== 'active') {
        throw new Error('Withdrawal payout method is not active');
      }

      if ((payoutMethodRow.verification_status || '').toLowerCase() !== 'verified') {
        throw new Error('Withdrawal payout method has not passed verification');
      }
    }

    await client.query(
      `UPDATE wallet_withdrawal_requests
       SET status = 'processing',
           approved_at = NOW(),
           auto_approved = $2,
           approved_by = $3,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('approvedBy', $3)
       WHERE id = $1`,
      [requestId, autoApproved, approverId || null]
    );

    const { rows: updatedRows } = await client.query(`SELECT * FROM wallet_withdrawal_requests WHERE id = $1`, [requestId]);
    await client.query('COMMIT');
    return updatedRows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Wallet withdrawal approval failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeWithdrawal({ requestId, processorId, success = true, metadata = {} }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM wallet_withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );

    if (rows.length === 0) {
      throw new Error('Withdrawal request not found');
    }

    const request = rows[0];
    if (!['processing', 'pending'].includes(request.status)) {
      await client.query('ROLLBACK');
      return request;
    }

    if (success) {
      await client.query(
        `UPDATE wallet_withdrawal_requests
         SET status = 'completed',
             processed_at = NOW(),
             completed_at = NOW(),
             processed_by = $2,
             metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object('processedBy', $2)
                        || $3::jsonb
         WHERE id = $1`,
        [requestId, processorId || null, JSON.stringify(metadata || {})]
      );

      await recordTransaction({
        userId: request.user_id,
        amount: 0,
        transactionType: 'withdrawal_settlement',
        currency: request.currency,
        status: 'completed',
        direction: 'adjustment',
        availableDelta: 0,
        pendingDelta: -toNumeric(request.amount),
        metadata: { requestId, stage: 'complete', ...metadata },
        relatedEntityType: 'withdrawal_request',
        relatedEntityId: requestId,
        allowNegative: false,
        client,
        // Transaction transparency fields
        originalAmount: toNumeric(request.amount),
        originalCurrency: request.currency
      });
    } else {
      await client.query(
        `UPDATE wallet_withdrawal_requests
         SET status = 'rejected',
             processed_at = NOW(),
             rejected_at = NOW(),
             processed_by = $2,
             rejection_reason = $3,
             metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object('processedBy', $2, 'rejectionReason', $3)
                        || $4::jsonb
         WHERE id = $1`,
        [requestId, processorId || null, metadata.rejectionReason || '', JSON.stringify(metadata || {})]
      );

      await recordTransaction({
        userId: request.user_id,
        amount: 0,
        transactionType: 'withdrawal_reversal',
        currency: request.currency,
        status: 'cancelled',
        direction: 'adjustment',
        availableDelta: toNumeric(request.amount),
        pendingDelta: -toNumeric(request.amount),
        metadata: { requestId, stage: 'reversal', ...metadata },
        relatedEntityType: 'withdrawal_request',
        relatedEntityId: requestId,
        allowNegative: false,
        client,
        // Transaction transparency fields
        originalAmount: toNumeric(request.amount),
        originalCurrency: request.currency
      });
    }

    const { rows: updatedRows } = await client.query(`SELECT * FROM wallet_withdrawal_requests WHERE id = $1`, [requestId]);

    await client.query('COMMIT');
    return updatedRows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Wallet withdrawal finalization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function listWithdrawalRequests({
  userId,
  status,
  limit = 50,
  offset = 0,
  includeUserDetails = false,
  startDate,
  endDate,
  sortDirection = 'desc'
} = {}) {
  const params = [];
  const clauses = [];

  if (userId) {
    params.push(userId);
    clauses.push(`wr.user_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    clauses.push(`wr.status = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    clauses.push(`wr.requested_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    clauses.push(`wr.requested_at <= $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  params.push(safeLimit);
  params.push(safeOffset);

  const selectFields = includeUserDetails
    ? `wr.*, u.name AS user_name, u.email AS user_email, u.role_id`
    : 'wr.*';

  const joinClause = includeUserDetails ? 'LEFT JOIN users u ON wr.user_id = u.id' : '';
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderDirection = sortDirection === 'asc' ? 'ASC' : 'DESC';

  const { rows } = await pool.query(
    `SELECT ${selectFields}
     FROM wallet_withdrawal_requests wr
     ${joinClause}
     ${whereClause}
     ORDER BY wr.requested_at ${orderDirection}
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );

  return rows;
}

export async function getWalletSettings({
  scopeType = 'global',
  scopeId,
  currency = DEFAULT_CURRENCY,
  includeDefaults = true,
  client
} = {}) {
  const normalizedCurrency = normalizeCurrency(currency);
  const { scopeType: resolvedScopeType, scopeId: resolvedScopeId } = normalizeScopeIdentifier(scopeType, scopeId);

  const executor = client || pool;
  const currentRow = await fetchSettingsRow(resolvedScopeType, resolvedScopeId, normalizedCurrency, executor);
  if (currentRow) {
    return mapSettingsRow(currentRow);
  }

  if (includeDefaults && resolvedScopeType !== 'global') {
    const fallbackRow = await fetchSettingsRow('global', null, normalizedCurrency, executor);
    if (fallbackRow) {
      return mapSettingsRow(fallbackRow);
    }
  }

  if (!includeDefaults) {
    return null;
  }

  const defaultRow = buildDefaultSettingsRow({
    scopeType: resolvedScopeType,
    scopeId: resolvedScopeId,
    currency: normalizedCurrency,
    overrides: { isDefault: true }
  });

  return mapSettingsRow(defaultRow);
}

export async function saveWalletSettings({
  scopeType = 'global',
  scopeId,
  currency = DEFAULT_CURRENCY,
  settings = {},
  updatedBy
} = {}) {
  const normalizedCurrency = normalizeCurrency(currency);
  const { scopeType: resolvedScopeType, scopeId: resolvedScopeId } = normalizeScopeIdentifier(scopeType, scopeId);

  const existingRow = await fetchSettingsRow(resolvedScopeType, resolvedScopeId, normalizedCurrency);

  const baseSettings = existingRow
    ? mapSettingsRow(existingRow)
    : mapSettingsRow(
        buildDefaultSettingsRow({
          scopeType: resolvedScopeType,
          scopeId: resolvedScopeId,
          currency: normalizedCurrency,
          overrides: { isDefault: resolvedScopeType === 'global' }
        })
      );

  const mergedSettings = mergeSettings(baseSettings, settings);

  const upsertedRow = await upsertSettingsRow({
    scopeType: resolvedScopeType,
    scopeId: resolvedScopeId,
    currency: normalizedCurrency,
    settings: mergedSettings
  });

  if (updatedBy) {
    try {
      await pool.query(
        `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [
          resolvedScopeType === 'user' ? resolvedScopeId : updatedBy,
          updatedBy,
          'wallet.settings.updated',
          JSON.stringify({ scopeType: resolvedScopeType, scopeId: resolvedScopeId })
        ]
      );
    } catch (error) {
      logger.warn('Failed to append wallet settings audit log', { error: error.message });
    }
  }

  return mapSettingsRow(upsertedRow);
}

export async function updateWalletPreferences({
  userId,
  preferences,
  currency = DEFAULT_CURRENCY,
  updatedBy
} = {}) {
  if (!userId) {
    throw new Error('updateWalletPreferences requires userId');
  }

  const normalizedPreferences = ensurePlainObject(preferences);

  return saveWalletSettings({
    scopeType: 'user',
    scopeId: userId,
    currency,
    settings: { preferences: normalizedPreferences },
    updatedBy: updatedBy || userId
  });
}

export async function listPaymentMethods({
  userId,
  status,
  verificationStatus,
  type,
  provider,
  includeInactive = false,
  limit = 50,
  offset = 0
} = {}) {
  if (!userId) {
    throw new Error('listPaymentMethods requires userId');
  }

  const filters = ['user_id = $1'];
  const params = [userId];
  let paramIndex = params.length;

  if (type) {
    paramIndex += 1;
    params.push(type);
    filters.push(`type = $${paramIndex}`);
  }

  if (provider) {
    paramIndex += 1;
    params.push(provider);
    filters.push(`provider = $${paramIndex}`);
  }

  if (status) {
    const normalizedStatus = normalizePaymentMethodStatus(status);
    paramIndex += 1;
    params.push(normalizedStatus);
    filters.push(`status = $${paramIndex}`);
  } else if (!includeInactive) {
    filters.push(`status = 'active'`);
  }

  if (verificationStatus) {
    const normalizedVerificationStatus = normalizeVerificationStatus(verificationStatus);
    paramIndex += 1;
    params.push(normalizedVerificationStatus);
    filters.push(`verification_status = $${paramIndex}`);
  }

  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);

  params.push(safeLimit);
  params.push(safeOffset);

  const { rows } = await pool.query(
    `SELECT *
       FROM wallet_payment_methods
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );

  return rows.map(mapPaymentMethodRow);
}

export async function getPaymentMethodById(paymentMethodId, { userId, includeInactive = false, client } = {}) {
  if (!paymentMethodId) {
    throw new Error('paymentMethodId is required');
  }

  const row = await fetchPaymentMethodRowById(paymentMethodId, { client });
  if (!row) {
    return null;
  }

  if (userId && row.user_id !== userId) {
    return null;
  }

  if (!includeInactive && row.status !== 'active') {
    return null;
  }

  return mapPaymentMethodRow(row);
}

export async function updatePaymentMethodVerificationStatus({
  paymentMethodId,
  status,
  reviewerId,
  verifiedAt,
  metadata,
  notes,
  client: existingClient
} = {}) {
  if (!paymentMethodId) {
    throw new Error('paymentMethodId is required');
  }

  const normalizedStatus = normalizeVerificationStatus(status);
  const normalizedMetadata = ensurePlainObject(metadata);

  let client = existingClient;
  let shouldRelease = false;

  if (!client) {
    client = await pool.connect();
    shouldRelease = true;
    await client.query('BEGIN');
  }

  try {
    const currentRow = await fetchPaymentMethodRowById(paymentMethodId, { client });
    if (!currentRow) {
      throw new Error('Payment method not found');
    }

    const mergedVerificationMetadata = {
      ...ensurePlainObject(currentRow.verification_metadata),
      ...normalizedMetadata
    };

    let resolvedVerifiedAt = verifiedAt ? new Date(verifiedAt) : currentRow.verified_at;
    if (normalizedStatus === 'verified' && !resolvedVerifiedAt) {
      resolvedVerifiedAt = new Date();
    }

    if (normalizedStatus !== 'verified') {
      resolvedVerifiedAt = normalizedStatus === 'unverified' ? null : resolvedVerifiedAt;
    }

    const { rows } = await client.query(
      `UPDATE wallet_payment_methods
          SET verification_status = $2,
              verification_metadata = $3::jsonb,
              verification_notes = COALESCE($4, verification_notes),
              last_verified_by = $5,
              verified_at = $6,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        paymentMethodId,
        normalizedStatus,
        JSON.stringify(mergedVerificationMetadata),
        notes || null,
        reviewerId || null,
        resolvedVerifiedAt
      ]
    );

    if (!rows.length) {
      throw new Error('Failed to update payment method verification status');
    }

    if (!existingClient) {
      await client.query('COMMIT');
    }

    return mapPaymentMethodRow(rows[0]);
  } catch (error) {
    if (!existingClient) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

export async function submitKycDocument({
  userId,
  paymentMethodId,
  documentType,
  fileUrl,
  storagePath,
  metadata,
  submittedBy
} = {}) {
  if (!userId) {
    throw new Error('submitKycDocument requires userId');
  }

  if (!documentType) {
    throw new Error('documentType is required');
  }

  if (paymentMethodId) {
    const method = await getPaymentMethodById(paymentMethodId, { userId, includeInactive: true });
    if (!method) {
      throw new Error('Payment method not found for user');
    }
  }

  const normalizedStatus = normalizeKycStatus('pending');
  const normalizedMetadata = ensurePlainObject(metadata);

  const { rows } = await pool.query(
    `INSERT INTO wallet_kyc_documents (
         user_id,
         payment_method_id,
         document_type,
         status,
         file_url,
         storage_path,
         metadata,
         submitted_by,
         submitted_at,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), NOW(), NOW())
       RETURNING *`,
    [
      userId,
      paymentMethodId || null,
      documentType,
      normalizedStatus,
      fileUrl || null,
      storagePath || null,
      JSON.stringify(normalizedMetadata),
      submittedBy || userId
    ]
  );

  return mapKycDocumentRow(rows[0]);
}

export async function listKycDocuments({
  userId,
  paymentMethodId,
  status,
  limit = 50,
  offset = 0
} = {}) {
  if (!userId) {
    throw new Error('listKycDocuments requires userId');
  }

  const filters = ['user_id = $1'];
  const params = [userId];
  let paramIndex = params.length;

  if (paymentMethodId) {
    paramIndex += 1;
    params.push(paymentMethodId);
    filters.push(`payment_method_id = $${paramIndex}`);
  }

  if (status) {
    const normalizedStatus = normalizeKycStatus(status);
    paramIndex += 1;
    params.push(normalizedStatus);
    filters.push(`status = $${paramIndex}`);
  }

  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);

  params.push(safeLimit);
  params.push(safeOffset);

  const { rows } = await pool.query(
    `SELECT *
       FROM wallet_kyc_documents
      WHERE ${filters.join(' AND ')}
      ORDER BY submitted_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}`,
    params
  );

  return rows.map(mapKycDocumentRow);
}

export async function reviewKycDocument({
  documentId,
  status,
  reviewerId,
  reviewNotes,
  rejectionReason,
  metadata,
  client: existingClient
} = {}) {
  if (!documentId) {
    throw new Error('documentId is required');
  }

  const normalizedStatus = normalizeKycStatus(status);
  const normalizedMetadata = ensurePlainObject(metadata);

  let client = existingClient;
  let shouldRelease = false;

  if (!client) {
    client = await pool.connect();
    shouldRelease = true;
    await client.query('BEGIN');
  }

  try {
    const { rows: currentRows } = await client.query(
      `SELECT * FROM wallet_kyc_documents WHERE id = $1 FOR UPDATE`,
      [documentId]
    );

    if (!currentRows.length) {
      throw new Error('KYC document not found');
    }

    const current = currentRows[0];
    const mergedMetadata = {
      ...ensurePlainObject(current.metadata),
      ...normalizedMetadata
    };

    const { rows } = await client.query(
      `UPDATE wallet_kyc_documents
          SET status = $2,
              reviewed_by = $3,
              reviewed_at = NOW(),
              review_notes = $4,
              rejection_reason = $5,
              metadata = $6::jsonb,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        documentId,
        normalizedStatus,
        reviewerId || null,
        reviewNotes || null,
        rejectionReason || null,
        JSON.stringify(mergedMetadata)
      ]
    );

    if (!rows.length) {
      throw new Error('Failed to update KYC document');
    }

    if (current.payment_method_id) {
      let targetStatus = null;

      if (normalizedStatus === 'approved') {
        targetStatus = 'verified';
      } else if (normalizedStatus === 'rejected') {
        targetStatus = 'rejected';
      } else if (normalizedStatus === 'needs_more_info') {
        targetStatus = 'needs_more_info';
      }

      if (targetStatus) {
        await updatePaymentMethodVerificationStatus({
          paymentMethodId: current.payment_method_id,
          status: targetStatus,
          reviewerId,
          metadata: { kycDocumentId: documentId, status: normalizedStatus },
          notes: reviewNotes,
          client
        });
      }
    }

    if (!existingClient) {
      await client.query('COMMIT');
    }

    return mapKycDocumentRow(rows[0]);
  } catch (error) {
    if (!existingClient) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

export async function createDepositRequest({
  userId,
  amount,
  currency = DEFAULT_CURRENCY,
  method = 'card',
  metadata = {},
  referenceCode,
  proofUrl,
  notes,
  autoComplete = false,
  gateway,
  gatewayTransactionId,
  initiatedBy,
  bankAccountId,
  bankReference,
  paymentMethodId,
  verification
} = {}) {
  if (!userId) {
    throw new Error('createDepositRequest requires userId');
  }

  const numericAmount = toNumeric(amount);
  if (!(numericAmount > 0)) {
    throw new Error('Deposit amount must be greater than zero');
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedMethod = (method || 'card').toLowerCase();

  if (!VALID_DEPOSIT_METHODS.has(normalizedMethod)) {
    throw new Error(`Unsupported deposit method: ${normalizedMethod}`);
  }

  const settings = await getWalletSettings({
    scopeType: 'user',
    scopeId: userId,
    currency: normalizedCurrency
  });

  const depositPolicy = resolveDepositPolicy(settings?.preferences?.depositPolicy);
  const allowedGateways = resolveEnabledGateways(settings);

  if (depositPolicy.allowUnlimitedDeposits === false) {
    const { maxPerTransaction } = depositPolicy;
    if (maxPerTransaction != null && numericAmount > maxPerTransaction) {
      throw new Error(
        `Deposit amount exceeds per-transaction limit (${maxPerTransaction} ${normalizedCurrency})`
      );
    }
  }

  const assertGatewayEnabled = (gatewayKey) => {
    if (!gatewayKey) {
      return;
    }

    const normalizedGateway = gatewayKey.toLowerCase();
    if (!allowedGateways.has(normalizedGateway)) {
      throw new Error(`Payment gateway "${normalizedGateway}" is disabled for deposits`);
    }
  };

  const client = await pool.connect();
  let depositRow;
  let transactionRecord = null;
  let paymentMethodRow = null;

  try {
    await client.query('BEGIN');

    const baseMetadata = ensurePlainObject(metadata);
    baseMetadata.method = normalizedMethod;

    let resolvedPaymentMethodId = paymentMethodId || baseMetadata.paymentMethodId || null;
    if (resolvedPaymentMethodId) {
      const row = await fetchPaymentMethodRowById(resolvedPaymentMethodId, { client });
      if (!row || row.user_id !== userId) {
        throw new Error('Payment method not found for user');
      }

      if (row.status !== 'active') {
        throw new Error('Payment method is not active');
      }

      const normalizedMethodType = (row.type || '').toLowerCase();
      if (normalizedMethod === 'card' && normalizedMethodType !== 'card') {
        throw new Error('Selected payment method does not support card deposits');
      }

      if (normalizedMethod === 'binance_pay' && row.provider !== 'binance_pay') {
        throw new Error('Selected payment method does not match Binance Pay requirements');
      }

      resolvedPaymentMethodId = row.id;
      paymentMethodRow = row;
      baseMetadata.paymentMethodId = row.id;
      baseMetadata.paymentMethodProvider = row.provider;
      baseMetadata.paymentMethodType = row.type;
    }

    let verificationPayload = extractVerificationMetadata(baseMetadata.verificationMetadata, verification);
    if (baseMetadata.verification) {
      verificationPayload = extractVerificationMetadata(verificationPayload, baseMetadata.verification);
      delete baseMetadata.verification;
    }
    if (baseMetadata.verificationMetadata) {
      delete baseMetadata.verificationMetadata;
    }

    let resolvedGateway = gateway || baseMetadata.gateway || null;
    if (typeof resolvedGateway === 'string') {
      resolvedGateway = resolvedGateway.toLowerCase();
    }
    let resolvedGatewayTransactionId = gatewayTransactionId || null;
    let resolvedProofUrl = proofUrl || null;
    let shouldAutoComplete = autoComplete === true;
    let resolvedBankAccountId = bankAccountId || null;
    let resolvedReferenceCode = referenceCode || null;
    let resolvedBankReference = bankReference || resolvedReferenceCode;
    let gatewaySession = null;

    if (normalizedMethod === 'bank_transfer') {
      if (!resolvedBankAccountId) {
        throw new Error('bankAccountId is required for bank transfer deposits');
      }

      const bankAccount = await loadActiveBankAccount({
        id: resolvedBankAccountId,
        currency: normalizedCurrency
      });

      if (!bankAccount) {
        throw new Error('Selected bank account is not available for bank transfers');
      }

      resolvedBankAccountId = bankAccount.id;
      shouldAutoComplete = false;
      resolvedGateway = null;

      if (!resolvedBankReference) {
        resolvedBankReference = generateBankTransferReference(userId);
      }

      if (!resolvedReferenceCode) {
        resolvedReferenceCode = resolvedBankReference;
      }

      baseMetadata.bankTransfer = {
        bankAccountId: bankAccount.id,
        bankReference: resolvedBankReference,
        currency: bankAccount.currency,
        bankName: bankAccount.bankName,
        accountHolder: bankAccount.accountHolder,
        accountNumber: bankAccount.accountNumber,
        iban: bankAccount.iban,
        swiftCode: bankAccount.swiftCode,
        routingNumber: bankAccount.routingNumber,
        instructions: bankAccount.instructions
      };
    } else if (normalizedMethod === 'card' || normalizedMethod === 'binance_pay') {
      const defaultGateway = normalizedMethod === 'card' ? 'stripe' : 'binance_pay';
      resolvedGateway = (resolvedGateway || defaultGateway).toLowerCase();

      assertGatewayEnabled(resolvedGateway);

      const gatewayInitiation = await initiateGatewayDeposit({
        gateway: resolvedGateway,
        amount: numericAmount,
        currency: normalizedCurrency,
        userId,
        metadata: { ...baseMetadata },
        referenceCode
      });

      if (gatewayInitiation) {
        if (gatewayInitiation.gateway) {
          assertGatewayEnabled(gatewayInitiation.gateway);
          resolvedGateway = gatewayInitiation.gateway.toLowerCase();
        }

        if (gatewayInitiation.metadata) {
          baseMetadata.gatewayResponse = gatewayInitiation.metadata;
        }

        if (gatewayInitiation.session) {
          gatewaySession = gatewayInitiation.session;
          baseMetadata.gatewaySession = gatewayInitiation.session;
        }

        if (gatewayInitiation.gatewayTransactionId) {
          resolvedGatewayTransactionId = gatewayInitiation.gatewayTransactionId;
        }

        if (gatewayInitiation.proofUrl && !resolvedProofUrl) {
          resolvedProofUrl = gatewayInitiation.proofUrl;
        }

        if (gatewayInitiation.shouldAutoComplete === true) {
          shouldAutoComplete = true;
        } else if (gatewayInitiation.shouldAutoComplete === false) {
          shouldAutoComplete = false;
        }
      }

      baseMetadata.gateway = resolvedGateway;
    } else if (resolvedGateway) {
      assertGatewayEnabled(resolvedGateway);
      baseMetadata.gateway = resolvedGateway;
    }

    if (normalizedMethod === 'card' && paymentMethodRow) {
      verificationPayload = extractVerificationMetadata(verificationPayload, {
        card: ensurePlainObject(baseMetadata.card || baseMetadata.gatewayResponse?.card)
      });
    }

    if (normalizedMethod === 'binance_pay') {
      verificationPayload = extractVerificationMetadata(verificationPayload, {
        binancePay: ensurePlainObject(baseMetadata.binancePayVerification || {})
      });
    }

    const insertResult = await client.query(
      `INSERT INTO wallet_deposit_requests (
         user_id,
         currency,
         amount,
         method,
         status,
         reference_code,
         proof_url,
         gateway,
         gateway_transaction_id,
         bank_account_id,
         bank_reference_code,
         payment_method_id,
         verification_metadata,
         initiated_by,
         metadata,
         notes,
         created_at,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb, $15, NOW(), NOW()
       )
       RETURNING *`,
      [
        userId,
        normalizedCurrency,
        numericAmount,
        normalizedMethod,
        resolvedReferenceCode || null,
        resolvedProofUrl || null,
        resolvedGateway || null,
        resolvedGatewayTransactionId || null,
        resolvedBankAccountId || null,
        resolvedBankReference || null,
        resolvedPaymentMethodId || null,
        JSON.stringify(verificationPayload),
        initiatedBy || userId,
        JSON.stringify(baseMetadata),
        notes || null
      ]
    );

    depositRow = insertResult.rows[0];

    if (shouldAutoComplete) {
      const transactionMetadata = {
        ...baseMetadata,
        depositId: depositRow.id
      };

      transactionRecord = await recordTransaction({
        userId,
        amount: numericAmount,
        transactionType: 'wallet_deposit',
        currency: normalizedCurrency,
        status: 'completed',
        direction: 'credit',
        availableDelta: numericAmount,
        metadata: transactionMetadata,
        description: notes || `Deposit via ${normalizedMethod}`,
        relatedEntityType: 'deposit_request',
        relatedEntityId: depositRow.id,
        createdBy: initiatedBy,
        client
      });

      const updateResult = await client.query(
        `UPDATE wallet_deposit_requests
         SET status = 'completed',
             processed_by = $2,
             processed_at = NOW(),
             completed_at = NOW(),
             metadata = metadata || $3::jsonb,
             verification_metadata = verification_metadata || $4::jsonb,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          depositRow.id,
          initiatedBy || userId,
          JSON.stringify({ transactionId: transactionRecord.id }),
          JSON.stringify(verificationPayload)
        ]
      );

      depositRow = updateResult.rows[0];

      await client.query(
        `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          initiatedBy || userId,
          'wallet.deposit.completed',
          JSON.stringify({
            depositId: depositRow.id,
            method: normalizedMethod,
            amount: numericAmount,
            currency: normalizedCurrency
          })
        ]
      );

      try {
        await handleDepositPaymentMethodVerification({
          depositRow,
          transactionRecord,
          reviewerId: initiatedBy || userId,
          client,
          verificationDetails: verificationPayload
        });
      } catch (verificationError) {
        logger.warn('Failed to update payment method verification after auto-complete deposit', {
          error: verificationError?.message,
          depositId: depositRow.id
        });
      }
    } else {
      await client.query(
        `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          initiatedBy || userId,
          'wallet.deposit.requested',
          JSON.stringify({
            depositId: depositRow.id,
            method: normalizedMethod,
            amount: numericAmount,
            currency: normalizedCurrency
          })
        ]
      );
    }

    await client.query('COMMIT');

    return {
      deposit: mapDepositRow(depositRow),
      transaction: transactionRecord,
      gatewaySession
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create deposit request:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function initiateBinancePayDeposit({
  userId,
  amount,
  currency = DEFAULT_CURRENCY,
  metadata = {},
  redirectUrl,
  cancelUrl,
  successUrl
} = {}) {
  if (!userId) {
    throw new Error('initiateBinancePayDeposit requires userId');
  }

  const enrichedMetadata = {
    ...ensurePlainObject(metadata),
    redirectUrl,
    cancelUrl,
    successUrl
  };

  const result = await createDepositRequest({
    userId,
    amount,
    currency,
    method: 'binance_pay',
    metadata: enrichedMetadata,
    autoComplete: false,
    gateway: 'binance_pay',
    initiatedBy: userId
  });

  const paymentSession = result.gatewaySession || {
    provider: 'binance_pay',
    status: 'pending',
    checkoutUrl: redirectUrl || `https://pay.binance.com/en/invoice/${result.deposit.id}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };

  return {
    deposit: result.deposit,
    transaction: result.transaction,
    paymentSession,
    gatewaySession: paymentSession
  };
}

export async function listUserDepositRequests({
  userId,
  status,
  method,
  limit = 50,
  offset = 0,
  startDate,
  endDate,
  sortDirection = 'desc'
} = {}) {
  if (!userId) {
    throw new Error('listUserDepositRequests requires userId');
  }

  const params = [userId];
  const clauses = ['user_id = $1'];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  if (method) {
    params.push(method);
    clauses.push(`method = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    clauses.push(`created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    clauses.push(`created_at <= $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  params.push(safeLimit);
  params.push(safeOffset);

  const orderDirection = sortDirection === 'asc' ? 'ASC' : 'DESC';

  const { rows } = await pool.query(
    `SELECT *
     FROM wallet_deposit_requests
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at ${orderDirection}
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );

  return rows.map(mapDepositRow);
}

export async function listBankAccounts({
  scopeType = 'global',
  scopeId,
  currency,
  includeInactive = false
} = {}) {
  const { scopeType: resolvedScopeType, scopeId: resolvedScopeId } = normalizeScopeIdentifier(scopeType, scopeId);

  const params = [resolvedScopeType, resolvedScopeId];
  const scopeSegments = ['(scope_type = $1 AND scope_id = $2)'];

  if (resolvedScopeType !== 'global') {
    params.push(GLOBAL_SCOPE_ID);
    scopeSegments.push(`(scope_type = 'global' AND scope_id = $${params.length})`);
  }

  const filters = [`(${scopeSegments.join(' OR ')})`];

  if (!includeInactive) {
    filters.push('is_active = true');
  }

  if (currency) {
    const normalizedCurrency = normalizeCurrency(currency);
    params.push(normalizedCurrency);
    filters.push(`currency = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT *
     FROM wallet_bank_accounts
     WHERE ${filters.join(' AND ')}
     ORDER BY is_primary DESC, display_order ASC, created_at DESC`,
    params
  );

  return rows.map(mapBankAccountRow);
}

export async function getBankAccountById({ id, includeInactive = false } = {}) {
  const row = await fetchBankAccountRowById(id);
  if (!row) {
    return null;
  }

  if (!includeInactive && row.is_active === false) {
    return null;
  }

  return mapBankAccountRow(row);
}

export async function saveBankAccount({
  id,
  scopeType = 'global',
  scopeId,
  currency = DEFAULT_CURRENCY,
  bankName,
  accountHolder,
  accountNumber,
  iban,
  swiftCode,
  routingNumber,
  instructions,
  metadata,
  isActive = true,
  isPrimary = false,
  displayOrder = 0,
  updatedBy
} = {}) {
  const { scopeType: resolvedScopeType, scopeId: resolvedScopeId } = normalizeScopeIdentifier(scopeType, scopeId);
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedMetadata = ensurePlainObject(metadata);
  const normalizedDisplayOrder = Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : 0;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let savedRow;

    if (id) {
      const { rows } = await client.query(
        `UPDATE wallet_bank_accounts
         SET bank_name = $1,
             account_holder = $2,
             account_number = $3,
             iban = $4,
             swift_code = $5,
             routing_number = $6,
             instructions = $7,
             metadata = $8::jsonb,
             is_active = $9,
             is_primary = $10,
             display_order = $11,
             currency = $12,
             updated_at = NOW()
         WHERE id = $13
           AND scope_type = $14
           AND scope_id = $15
         RETURNING *`,
        [
          bankName || null,
          accountHolder || null,
          accountNumber || null,
          iban || null,
          swiftCode || null,
          routingNumber || null,
          instructions || null,
          JSON.stringify(normalizedMetadata),
          isActive !== false,
          isPrimary === true,
          normalizedDisplayOrder,
          normalizedCurrency,
          id,
          resolvedScopeType,
          resolvedScopeId
        ]
      );

      savedRow = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO wallet_bank_accounts (
           scope_type,
           scope_id,
           currency,
           bank_name,
           account_holder,
           account_number,
           iban,
           swift_code,
           routing_number,
           instructions,
           metadata,
           is_active,
           is_primary,
           display_order,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, NOW(), NOW()
         )
         RETURNING *`,
        [
          resolvedScopeType,
          resolvedScopeId,
          normalizedCurrency,
          bankName || null,
          accountHolder || null,
          accountNumber || null,
          iban || null,
          swiftCode || null,
          routingNumber || null,
          instructions || null,
          JSON.stringify(normalizedMetadata),
          isActive !== false,
          isPrimary === true,
          normalizedDisplayOrder
        ]
      );

      savedRow = rows[0];
    }

    if (!savedRow) {
      throw new Error(id ? 'Bank account not found' : 'Failed to save bank account');
    }

    if (savedRow.is_primary) {
      await client.query(
        `UPDATE wallet_bank_accounts
         SET is_primary = false,
             updated_at = NOW()
         WHERE scope_type = $1
           AND scope_id = $2
           AND currency = $3
           AND id <> $4`,
        [savedRow.scope_type, savedRow.scope_id, savedRow.currency, savedRow.id]
      );
    }

    if (updatedBy) {
      await client.query(
        `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
         VALUES ($1, $2, $3, $4)` ,
        [
          resolvedScopeType === 'user' ? resolvedScopeId : updatedBy,
          updatedBy,
          'wallet.bank_account.saved',
          JSON.stringify({ bankAccountId: savedRow.id, scopeType: savedRow.scope_type })
        ]
      );
    }

    await client.query('COMMIT');

    return mapBankAccountRow(savedRow);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to save bank account:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function setBankAccountStatus({
  id,
  scopeType = 'global',
  scopeId,
  isActive,
  updatedBy
} = {}) {
  if (!id) {
    throw new Error('setBankAccountStatus requires id');
  }

  const { scopeType: resolvedScopeType, scopeId: resolvedScopeId } = normalizeScopeIdentifier(scopeType, scopeId);

  const { rows } = await pool.query(
    `UPDATE wallet_bank_accounts
     SET is_active = $1,
         updated_at = NOW()
     WHERE id = $2
       AND scope_type = $3
       AND scope_id = $4
     RETURNING *`,
    [
      isActive !== false,
      id,
      resolvedScopeType,
      resolvedScopeId
    ]
  );

  const updated = rows[0];

  if (!updated) {
    throw new Error('Bank account not found');
  }

  if (updatedBy) {
    await pool.query(
      `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
       VALUES ($1, $2, $3, $4)` ,
      [
        resolvedScopeType === 'user' ? resolvedScopeId : updatedBy,
        updatedBy,
        'wallet.bank_account.status_changed',
        JSON.stringify({ bankAccountId: updated.id, isActive: updated.is_active })
      ]
    );
  }

  return mapBankAccountRow(updated);
}

export async function listDepositRequests({
  userId,
  status,
  method,
  limit = 50,
  offset = 0,
  startDate,
  endDate,
  sortDirection = 'desc',
  includeUserDetails = false
} = {}) {
  const params = [];
  const clauses = [];

  if (userId) {
    params.push(userId);
    clauses.push(`dr.user_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    clauses.push(`dr.status = $${params.length}`);
  }

  if (method) {
    params.push(method);
    clauses.push(`dr.method = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    clauses.push(`dr.created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    clauses.push(`dr.created_at <= $${params.length}`);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  params.push(safeLimit);
  params.push(safeOffset);

  const selectFields = includeUserDetails
    ? `dr.*, u.name AS user_name, u.email AS user_email, u.role_id`
    : 'dr.*';

  const joinClause = includeUserDetails ? 'LEFT JOIN users u ON dr.user_id = u.id' : '';
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderDirection = sortDirection === 'asc' ? 'ASC' : 'DESC';

  const { rows } = await pool.query(
    `SELECT ${selectFields}
     FROM wallet_deposit_requests dr
     ${joinClause}
     ${whereClause}
     ORDER BY dr.created_at ${orderDirection}
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => {
    const deposit = mapDepositRow(row);
    if (includeUserDetails) {
      deposit.user = {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        roleId: row.role_id
      };
    }
    return deposit;
  });
}

export async function approveDepositRequest({
  requestId,
  processorId,
  metadata = {},
  notes,
  verification
} = {}) {
  if (!requestId) {
    throw new Error('approveDepositRequest requires requestId');
  }

  if (!processorId) {
    throw new Error('approveDepositRequest requires processorId');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT *
       FROM wallet_deposit_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (rows.length === 0) {
      throw new Error('Deposit request not found');
    }

    const request = rows[0];

    if (!APPROVABLE_DEPOSIT_STATUSES.has(request.status)) {
      throw new Error(`Cannot approve deposit request in status ${request.status}`);
    }

    const numericAmount = toNumeric(request.amount);
    if (!(numericAmount > 0)) {
      throw new Error('Deposit amount must be greater than zero');
    }

    const existingMetadata = ensurePlainObject(request.metadata);
    const additionalMetadata = ensurePlainObject(metadata);
    let verificationPayload = extractVerificationMetadata(request.verification_metadata, verification);
    if (additionalMetadata.verification) {
      verificationPayload = extractVerificationMetadata(verificationPayload, additionalMetadata.verification);
      delete additionalMetadata.verification;
    }

    const transactionMetadata = {
      ...existingMetadata,
      ...additionalMetadata,
      depositId: request.id
    };

    // Transaction transparency: capture original currency information
    // The deposit request stores the user's requested amount/currency
    // If conversion was applied, exchangeRate would be in metadata
    const originalAmount = numericAmount;
    const originalCurrency = request.currency;
    const transactionExchangeRate = existingMetadata.exchangeRate || null;

    const transactionRecord = await recordTransaction({
      userId: request.user_id,
      amount: numericAmount,
      transactionType: 'wallet_deposit',
      currency: request.currency,
      status: 'completed',
      direction: 'credit',
      availableDelta: numericAmount,
      metadata: transactionMetadata,
      description: notes || request.notes || `Deposit via ${request.method}`,
      relatedEntityType: 'deposit_request',
      relatedEntityId: request.id,
      createdBy: processorId,
      client,
      // Transaction transparency fields
      originalAmount,
      originalCurrency,
      transactionExchangeRate
    });

    const updatedMetadata = {
      ...transactionMetadata,
      transactionId: transactionRecord.id
    };

    const { rows: updatedRows } = await client.query(
      `UPDATE wallet_deposit_requests
       SET status = 'completed',
           processed_by = $2,
           processed_at = NOW(),
           completed_at = NOW(),
           failure_reason = NULL,
           notes = COALESCE($3, notes),
           metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
           verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || $5::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        request.id,
        processorId,
        notes || null,
        JSON.stringify(updatedMetadata),
        JSON.stringify(verificationPayload)
      ]
    );

    const updated = updatedRows[0];

    try {
      await handleDepositPaymentMethodVerification({
        depositRow: updated,
        transactionRecord,
        reviewerId: processorId,
        client,
        verificationDetails: verificationPayload
      });
    } catch (verificationError) {
      logger.warn('Failed to update payment method verification after deposit approval', {
        error: verificationError?.message,
        depositId: request.id
      });
    }

    await client.query(
      `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [
        request.user_id,
        processorId,
        'wallet.deposit.approved',
        JSON.stringify({
          depositId: request.id,
          amount: numericAmount,
          currency: request.currency
        })
      ]
    );

    await client.query('COMMIT');

    return {
      deposit: mapDepositRow(updated),
      transaction: transactionRecord
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to approve deposit request:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectDepositRequest({
  requestId,
  processorId,
  failureReason,
  metadata = {},
  notes
} = {}) {
  if (!requestId) {
    throw new Error('rejectDepositRequest requires requestId');
  }

  if (!processorId) {
    throw new Error('rejectDepositRequest requires processorId');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT *
       FROM wallet_deposit_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (rows.length === 0) {
      throw new Error('Deposit request not found');
    }

    const request = rows[0];

    if (!APPROVABLE_DEPOSIT_STATUSES.has(request.status)) {
      throw new Error(`Cannot reject deposit request in status ${request.status}`);
    }

    const additionalMetadata = ensurePlainObject(metadata);

    const { rows: updatedRows } = await client.query(
      `UPDATE wallet_deposit_requests
       SET status = 'cancelled',
           processed_by = $2,
           processed_at = NOW(),
           cancelled_at = NOW(),
           failure_reason = COALESCE($3, failure_reason),
           notes = COALESCE($4, notes),
           metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        request.id,
        processorId,
        failureReason || null,
        notes || null,
        JSON.stringify({ ...additionalMetadata, depositId: request.id })
      ]
    );

    const updated = updatedRows[0];

    await client.query(
      `INSERT INTO wallet_audit_logs (wallet_user_id, actor_user_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [
        request.user_id,
        processorId,
        'wallet.deposit.rejected',
        JSON.stringify({
          depositId: request.id,
          failureReason: failureReason || null
        })
      ]
    );

    await client.query('COMMIT');

    return mapDepositRow(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to reject deposit request:', error);
    throw error;
  } finally {
    client.release();
  }
}

export const __testables = {
  normalizePreferences,
  mergePreferences,
  resolveDepositPolicy,
  resolveEnabledGateways,
  toBooleanFlag
};

export default {
  createWalletForUser,
  getWalletAccountSummary,
  getBalance,
  fetchTransactions,
  getTransactionById,
  recordTransaction,
  recordLegacyTransaction,
  calculateAvailableBalance,
  lockFundsForBooking,
  releaseLockedFunds,
  applyDiscountsAndFees,
  requestWithdrawal,
  approveWithdrawal,
  finalizeWithdrawal,
  listWithdrawalRequests,
  getWalletSettings,
  saveWalletSettings,
  updateWalletPreferences,
  listBankAccounts,
  getBankAccountById,
  saveBankAccount,
  setBankAccountStatus,
  createDepositRequest,
  initiateBinancePayDeposit,
  listUserDepositRequests,
  listDepositRequests,
  approveDepositRequest,
  rejectDepositRequest
};
