const http = require('http');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } };
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers: { Authorization: 'Bearer ' + token } };
    const req = http.request(opts, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const login = await post('http://localhost:4000/api/auth/login', { email: 'admin@plannivo.com', password: 'asdasd35' });
  const token = login.token;

  const r = await get('http://localhost:4000/api/finances/wallet-deposits?startDate=2026-01-01&endDate=2026-12-31', token);
  console.log('Stats:', JSON.stringify(r.stats));
  console.log('Deposits count:', r.deposits?.length);
  console.log('Trends:', JSON.stringify(r.trends));
  console.log('Top depositors:', r.topDepositors?.length);
  if (r.topDepositors?.length > 0) console.log('Top:', JSON.stringify(r.topDepositors[0]));
  if (r.deposits?.length > 0) console.log('Sample:', JSON.stringify(r.deposits[0]));
}

main().catch(console.error);
