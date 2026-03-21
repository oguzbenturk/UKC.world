const http = require('http');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } };
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers: { Authorization: 'Bearer ' + token } };
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const login = await post('http://localhost:4000/api/auth/login', { email: 'admin@plannivo.com', password: 'asdasd35' });
  const token = login.token;

  const r = await get('http://localhost:4000/api/finances/wallet-deposits?startDate=2026-01-01&endDate=2026-12-31&offset=950', token);
  console.log('Stats:', JSON.stringify(r.stats));
  console.log('Deposits count:', r.deposits?.length);
  if (r.topDepositors?.length > 0) console.log('Top depositor:', JSON.stringify(r.topDepositors[0]));
  
  // Show a TRY sample and EUR sample
  const trySample = r.deposits?.find(d => d.currency === 'TRY');
  const eurSample = r.deposits?.find(d => d.currency === 'EUR');
  if (trySample) console.log('TRY sample:', JSON.stringify(trySample));
  if (eurSample) console.log('EUR sample:', JSON.stringify(eurSample));
}

main().catch(console.error);
