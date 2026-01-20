import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

// Keys that can be overridden via financial_settings_overrides.fields
const OVERRIDABLE_FIELDS = new Set([
  'tax_rate_pct',
  'insurance_rate_pct',
  'equipment_rate_pct',
  'payment_method_fees',
  'accrual_tax_rate_pct',
  'accrual_insurance_rate_pct', 
  'accrual_equipment_rate_pct',
  'accrual_payment_method_fees'
]);

export async function getActiveSettings(client) {
  const c = client || (await pool.connect());
  let release = () => {};
  if (!client) release = () => c.release();
  try {
    const { rows } = await c.query(
      `SELECT id, tax_rate_pct, insurance_rate_pct, equipment_rate_pct, payment_method_fees,
              accrual_tax_rate_pct, accrual_insurance_rate_pct, accrual_equipment_rate_pct, accrual_payment_method_fees,
              effective_from, effective_to, active, created_by, created_at, updated_at
       FROM financial_settings
       WHERE active = TRUE
       ORDER BY effective_from DESC
       LIMIT 1`
    );
    return rows[0] || null;
  } finally {
    release();
  }
}

export async function listOverrides({ scope_type, scope_value, settings_id, active }, client) {
  const c = client || (await pool.connect());
  let release = () => {};
  if (!client) release = () => c.release();
  try {
    const clauses = [];
    const params = [];
    let i = 1;
    if (scope_type) { clauses.push(`scope_type = $${i++}`); params.push(scope_type); }
    if (scope_value) { clauses.push(`scope_value = $${i++}`); params.push(scope_value); }
    if (settings_id) { clauses.push(`settings_id = $${i++}`); params.push(settings_id); }
    if (typeof active === 'boolean') { clauses.push(`active = $${i++}`); params.push(active); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await c.query(
      `SELECT id, settings_id, scope_type, scope_value, fields, precedence, active, created_by, created_at, updated_at
       FROM financial_settings_overrides
       ${where}
       ORDER BY precedence DESC, updated_at DESC`
      , params
    );
    return rows;
  } finally {
    release();
  }
}

function deepMergeFees(baseFees, overrideFees) {
  const result = { ...(baseFees || {}) };
  const src = overrideFees || {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    // Shallow merge per payment method entry
    result[k] = { ...(result[k] || {}), ...(v || {}) };
  }
  return result;
}

export async function resolveSettings(context = {}, client) {
  const c = client || (await pool.connect());
  let release = () => {};
  if (!client) release = () => c.release();
  try {
    const base = await getActiveSettings(c);
    if (!base) return null;

    // Collect potential scopes in descending priority order
    // Priority order: specific entity > category > service_type > payment_method generic
    const scopes = [];
    const { serviceType, serviceId, categoryId, paymentMethod } = context;
    if (serviceId) scopes.push({ scope_type: 'service_id', scope_value: String(serviceId) });
    if (categoryId) scopes.push({ scope_type: 'category', scope_value: String(categoryId) });
    if (serviceType) scopes.push({ scope_type: 'service_type', scope_value: String(serviceType) });
    if (paymentMethod) scopes.push({ scope_type: 'payment_method', scope_value: String(paymentMethod) });

  const merged = { ...base };
    // Fetch all overrides and apply by precedence (DESC) and then updated_at (DESC)
    if (scopes.length) {
      const scopeClauses = scopes.map((_, idx) => `(scope_type = $${idx * 2 + 1} AND scope_value = $${idx * 2 + 2})`).join(' OR ');
      const params = scopes.flatMap(s => [s.scope_type, s.scope_value]);
      params.push(base.id);
      const { rows } = await c.query(
        `SELECT * FROM financial_settings_overrides
         WHERE (${scopeClauses}) AND settings_id = $${params.length}
           AND active = TRUE
         ORDER BY precedence DESC, updated_at DESC`,
        params
      );

      rows.forEach((ov) => {
        const fields = ov.fields || {};
        Object.entries(fields).forEach(([k, v]) => {
          if (!OVERRIDABLE_FIELDS.has(k)) return;
          if (k === 'payment_method_fees' || k === 'accrual_payment_method_fees') {
            merged[k] = deepMergeFees(merged[k], v);
            return;
          }
          merged[k] = v;
        });
      });
    }
    return merged;
  } catch (err) {
    logger.warn('resolveSettings failed:', err.message);
    return null;
  } finally {
    release();
  }
}

// New function to resolve settings for accrual mode calculations
export async function resolveAccrualSettings(context = {}, client) {
  const settings = await resolveSettings(context, client);
  if (!settings) return null;
  
  // Return settings with accrual-specific rates, falling back to cash rates if not set
  return {
    ...settings,
    tax_rate_pct: settings.accrual_tax_rate_pct || settings.tax_rate_pct,
    insurance_rate_pct: settings.accrual_insurance_rate_pct || settings.insurance_rate_pct,
    equipment_rate_pct: settings.accrual_equipment_rate_pct || settings.equipment_rate_pct,
    payment_method_fees: settings.accrual_payment_method_fees || settings.payment_method_fees
  };
}

export function pickPaymentFee(payment_method_fees, method) {
  try {
    const fees = payment_method_fees || {};
    const entry = fees[method] || fees['card'] || null;
    if (!entry) return { pct: 0, fixed: 0 };
    return { pct: Number(entry.pct || 0), fixed: Number(entry.fixed || 0) };
  } catch {
    return { pct: 0, fixed: 0 };
  }
}
