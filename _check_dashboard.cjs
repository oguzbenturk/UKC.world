const http = require('http');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjlmNjRjZWJiLThkZDAtNGZmMy1iZTY2LTc3YmViNzNiMDc1MCIsImVtYWlsIjoiYWRtaW5AcGxhbm5pdm8uY29tIiwicm9sZSI6ImFkbWluIiwidHdvRmFjdG9yVmVyaWZpZWQiOnRydWUsImp0aSI6IjMzMDc5N2ZkNGY0Yjg0ODkzMDFlOGQ4NWQ2Y2JhMDI4IiwiaWF0IjoxNzczOTk3ODA2LCJleHAiOjE3NzQwODQyMDZ9.EubokClANVoaTzLOuEljdfa_zuogJEMc7Dag6NpJUxo';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 4000, path, method: 'GET',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { reject(new Error(`Parse error: ${body.substring(0,200)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const startDate = '2026-03-01';
  const endDate = '2026-03-31';

  // 1. Check /finances/summary (Lessons mode)
  console.log('=== /finances/summary (lessons) ===');
  const summary = await apiGet(`/api/finances/summary?startDate=${startDate}&endDate=${endDate}&serviceType=lesson&mode=lessons`);
  if (summary.error) { console.log('ERROR:', summary.error); } else {
    console.log(`  Total Bookings: ${summary.bookings?.total_bookings} (${summary.bookings?.completed_bookings} completed, ${summary.bookings?.paid_bookings} paid)`);
    console.log(`  Booking Revenue: €${summary.bookings?.booking_revenue}`);
    console.log(`  Lesson Revenue (wallet charges): €${summary.revenue?.other_revenue_breakdown?.wallet_lesson_charges}`);
    console.log(`  Package Revenue: €${summary.revenue?.package_revenue}`);
    console.log(`  Instructor Commission: €${summary.netRevenue?.instructor_commission}`);
  }

  // 2. Check /finances/lesson-breakdown
  console.log('\n=== /finances/lesson-breakdown ===');
  const breakdown = await apiGet(`/api/finances/lesson-breakdown?startDate=${startDate}&endDate=${endDate}`);
  if (breakdown.error) { console.log('ERROR:', breakdown.error); } else {
    console.log(`  Services: ${breakdown.services?.length || 0} services`);
    if (breakdown.services) {
      breakdown.services.forEach(s => console.log(`    ${s.name}: ${s.bookings} bookings, €${s.revenue.toFixed(2)} revenue, €${s.avgPrice.toFixed(2)} avg`));
    }
    
    console.log(`\n  Instructors: ${breakdown.instructors?.length || 0} instructors`);
    let totalRev = 0, totalCom = 0;
    if (breakdown.instructors) {
      breakdown.instructors.forEach(i => {
        totalRev += i.revenue;
        totalCom += i.commission;
        const pct = i.revenue > 0 ? ((i.commission / i.revenue) * 100).toFixed(1) : '0.0';
        const ok = i.revenue >= i.commission ? 'OK' : 'WARN';
        console.log(`    ${i.name}: Rev=€${i.revenue.toFixed(2)}, Com=€${i.commission.toFixed(2)} (${pct}%), ${i.bookings} bookings, ${i.hours}h [${ok}]`);
      });
    }
    console.log(`\n  Breakdown Totals: Rev=€${totalRev.toFixed(2)}, Com=€${totalCom.toFixed(2)}`);
  }

  // 3. Cross-check
  console.log('\n=== Cross-check ===');
  if (summary.netRevenue?.instructor_commission != null && breakdown.instructors) {
    const summaryCommission = parseFloat(summary.netRevenue.instructor_commission);
    let breakdownTotal = breakdown.instructors.reduce((s, i) => s + i.commission, 0);
    console.log(`  Summary commission:    €${summaryCommission.toFixed(2)}`);
    console.log(`  Breakdown instructor sum: €${breakdownTotal.toFixed(2)}`);
    const diff = Math.abs(summaryCommission - breakdownTotal);
    console.log(`  Difference:            €${diff.toFixed(2)} ${diff < 1 ? '✓ MATCH' : '✗ MISMATCH'}`);
    
    // Also check: total bookings
    const summaryBookings = parseInt(summary.bookings?.total_bookings || 0);
    const breakdownBookings = breakdown.instructors.reduce((s, i) => s + i.bookings, 0);
    console.log(`\n  Summary total bookings:    ${summaryBookings}`);
    console.log(`  Breakdown instructor sum:  ${breakdownBookings}`);
    console.log(`  Difference:                ${Math.abs(summaryBookings - breakdownBookings)} ${summaryBookings === breakdownBookings ? '✓ MATCH' : '✗ MISMATCH'}`);
  }
})();
