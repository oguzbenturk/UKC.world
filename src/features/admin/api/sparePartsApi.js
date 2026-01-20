const base = '/api/spare-parts';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export async function listSpareParts({ status, q } = {}) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (q) params.append('q', q);
  const res = await fetch(`${base}?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export async function createSparePart(payload) {
  const res = await fetch(base, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create');
  return res.json();
}

export async function updateSparePart(id, patch) {
  const res = await fetch(`${base}/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update');
  return res.json();
}

export async function deleteSparePart(id) {
  const res = await fetch(`${base}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete');
  return res.json();
}
