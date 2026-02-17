const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchJSON(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { 'Authorization': token ? `Bearer ${token}` : undefined }});
  if (!res.ok) throw new Error('Failed request');
  return res.json();
}

export async function getDailyOperations({ date, rentalsScope }) {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (rentalsScope) params.append('rentalsScope', rentalsScope);
  return fetchJSON(`${API_BASE}/finances/daily-operations?${params.toString()}`);
}

export default { getDailyOperations };
