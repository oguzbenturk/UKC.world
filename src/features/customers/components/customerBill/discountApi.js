// Thin wrapper around the /api/discounts endpoints. Mirrors the raw-fetch +
// localStorage token pattern used by EnhancedCustomerDetailModal.

const buildHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const handle = async (res) => {
  if (!res.ok) {
    let detail = '';
    try { const body = await res.json(); detail = body?.error || JSON.stringify(body); }
    catch { detail = await res.text().catch(() => ''); }
    const err = new Error(`Request failed (${res.status}): ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

export const fetchCustomerDiscounts = async (customerId) => {
  const res = await fetch(`/api/discounts?customer_id=${encodeURIComponent(customerId)}`, {
    headers: buildHeaders(),
  });
  const data = await handle(res);
  return data.discounts || [];
};

export const applyDiscount = async ({ customerId, entityType, entityId, percent, reason, participantUserId = null }) => {
  const res = await fetch('/api/discounts', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      customer_id: customerId,
      entity_type: entityType,
      entity_id: entityId,
      percent,
      reason,
      participant_user_id: participantUserId || null,
    }),
  });
  return handle(res);
};

export const applyBulkDiscount = async ({ customerId, percent, items, reason }) => {
  const res = await fetch('/api/discounts/bulk', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      customer_id: customerId,
      percent,
      items,
      reason,
    }),
  });
  return handle(res);
};

export const removeDiscount = async (id) => {
  const res = await fetch(`/api/discounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  return handle(res);
};
