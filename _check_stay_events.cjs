const http = require('http');
const ld = JSON.stringify({ email: 'admin@plannivo.com', password: 'asdasd35' });

const lr = http.request({ hostname: 'localhost', port: 4000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': ld.length } }, (res) => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => {
    const tk = JSON.parse(b).token;

    // Test accommodation summary
    const r1 = http.request({ hostname: 'localhost', port: 4000, path: '/api/finances/summary?startDate=2020-01-01&endDate=2027-12-31&serviceType=accommodation&mode=accrual', method: 'GET', headers: { 'Authorization': 'Bearer ' + tk } }, (rs) => {
      let bd = '';
      rs.on('data', d => bd += d);
      rs.on('end', () => {
        const d = JSON.parse(bd);
        console.log('=== ACCOMMODATION SUMMARY ===');
        console.log('Revenue:', JSON.stringify(d.revenue, null, 2));
      });
    });
    r1.end();

    // Test accommodation bookings detail
    const r2 = http.request({ hostname: 'localhost', port: 4000, path: '/api/accommodation/bookings?startDate=2020-01-01&endDate=2027-12-31', method: 'GET', headers: { 'Authorization': 'Bearer ' + tk } }, (rs) => {
      let bd = '';
      rs.on('data', d => bd += d);
      rs.on('end', () => {
        const d = JSON.parse(bd);
        console.log('=== ACCOMMODATION BOOKINGS ===');
        console.log('Count:', Array.isArray(d) ? d.length : 'not array');
        if (Array.isArray(d) && d.length > 0) {
          console.log('Sample:', JSON.stringify(d[0], null, 2));
        }
      });
    });
    r2.end();

    // Test events
    const r3 = http.request({ hostname: 'localhost', port: 4000, path: '/api/events?from=2020-01-01&to=2027-12-31', method: 'GET', headers: { 'Authorization': 'Bearer ' + tk } }, (rs) => {
      let bd = '';
      rs.on('data', d => bd += d);
      rs.on('end', () => {
        const d = JSON.parse(bd);
        console.log('=== EVENTS ===');
        console.log('Count:', Array.isArray(d) ? d.length : 'not array');
        if (Array.isArray(d) && d.length > 0) {
          console.log('Sample:', JSON.stringify(d[0], null, 2));
        }
      });
    });
    r3.end();
  });
});
lr.write(ld);
lr.end();
