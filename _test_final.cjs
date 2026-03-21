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
  const r = await get('http://localhost:4000/api/finances/wallet-deposits?startDate=2026-01-01&endDate=2026-12-31', login.token);
  
  console.log('Stats:', JSON.stringify(r.stats));
  console.log('Sample deposit:', JSON.stringify(r.deposits?.[0]));
  console.log('Has currency field?', r.deposits?.[0]?.hasOwnProperty('currency'));
  console.log('Has originalAmount?', r.deposits?.[0]?.hasOwnProperty('originalAmount'));
}

main().catch(console.error);
