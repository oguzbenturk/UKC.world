/**
 * Creates a realistic German student user with a 2500 EUR wallet balance.
 *
 * Usage:  node scripts/create-test-user.mjs
 *
 * Outputs the created user's credentials to the console.
 * To delete: DELETE /api/users/:id?hardDelete=true&deleteAllData=true
 */

const API = process.env.API_URL || 'http://localhost:4000/api';

// ── Realistic German customer profiles ─────────────────────────────
const PROFILES = [
  {
    first_name: 'Lukas',
    last_name: 'Hoffmann',
    email: 'lukas.hoffmann87@gmail.com',
    phone: '+4917612345678',
    date_of_birth: '1987-04-12',
    weight: 78,
    city: 'Hamburg',
    country: 'Germany',
    preferred_currency: 'EUR',
  },
  {
    first_name: 'Sophie',
    last_name: 'Müller',
    email: 'sophie.mueller92@gmail.com',
    phone: '+4915901234567',
    date_of_birth: '1992-08-03',
    weight: 62,
    city: 'Berlin',
    country: 'Germany',
    preferred_currency: 'EUR',
  },
  {
    first_name: 'Tobias',
    last_name: 'Schneider',
    email: 'tobias.schneider85@gmail.com',
    phone: '+4916098765432',
    date_of_birth: '1985-11-22',
    weight: 82,
    city: 'Munich',
    country: 'Germany',
    preferred_currency: 'EUR',
  },
  {
    first_name: 'Laura',
    last_name: 'Fischer',
    email: 'laura.fischer95@gmail.com',
    phone: '+4917623456789',
    date_of_birth: '1995-02-17',
    weight: 58,
    city: 'Cologne',
    country: 'Germany',
    preferred_currency: 'EUR',
  },
  {
    first_name: 'Maximilian',
    last_name: 'Weber',
    email: 'max.weber1990@gmail.com',
    phone: '+4915112345678',
    date_of_birth: '1990-06-30',
    weight: 85,
    city: 'Frankfurt',
    country: 'Germany',
    preferred_currency: 'EUR',
  },
];

async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function main() {
  // ── 1. Admin login ──
  const { token } = await api('POST', '/auth/login', {
    email: 'admin@plannivo.com',
    password: 'asdasd35',
  });

  // ── 2. Get student role ID ──
  const roles = await api('GET', '/roles', null, token);
  const studentRole = (Array.isArray(roles) ? roles : roles.roles || []).find(r => r.name === 'student');
  if (!studentRole) throw new Error('Student role not found');

  // ── 3. Pick a profile (rotate based on existing users to avoid email conflicts) ──
  const profile = PROFILES[Math.floor(Math.random() * PROFILES.length)];
  const password = 'asdasd35';

  // ── 4. Create user ──
  const user = await api('POST', '/users', {
    ...profile,
    password,
    role_id: studentRole.id,
  }, token);

  const userId = user.id || user.user?.id;
  if (!userId) throw new Error('No user ID in response: ' + JSON.stringify(user));

  // ── 5. Fund wallet with 2500 EUR ──
  await api('POST', '/wallet/manual-adjust', {
    userId,
    amount: 2500,
    currency: 'EUR',
    description: 'Initial wallet credit',
  }, token);

  console.log('\n✅ German customer created');
  console.log('   Name:     ', profile.first_name, profile.last_name);
  console.log('   Email:    ', profile.email);
  console.log('   Password: ', password);
  console.log('   Phone:    ', profile.phone);
  console.log('   DOB:      ', profile.date_of_birth);
  console.log('   City:     ', profile.city, ',', profile.country);
  console.log('   Wallet:    2500 EUR');
  console.log('   ID:       ', userId, '\n');
  console.log(`To delete:  node -e "fetch('http://localhost:4000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@plannivo.com',password:'asdasd35'})}).then(r=>r.json()).then(d=>fetch('http://localhost:4000/api/users/${userId}?hardDelete=true&deleteAllData=true',{method:'DELETE',headers:{Authorization:'Bearer '+d.token}})).then(r=>r.json()).then(console.log)"`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
