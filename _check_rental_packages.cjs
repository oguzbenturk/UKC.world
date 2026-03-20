const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // 1. Check service_packages schema
  const spCols = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='service_packages' ORDER BY ordinal_position
  `);
  console.log('service_packages columns:', spCols.rows.map(r => r.column_name).join(', '));

  // 2. Check customer_packages with rental_days_total
  const custPkgs = await pool.query(`
    SELECT cp.id, cp.package_name, cp.purchase_price, cp.status, cp.package_type,
      cp.total_hours, cp.rental_days_total, cp.rental_days_used, cp.rental_days_remaining,
      cp.accommodation_nights_total
    FROM customer_packages cp
    WHERE cp.rental_days_total > 0 OR cp.package_type LIKE '%rental%'
    LIMIT 20
  `);
  console.log('\nCustomer packages with rental days:');
  console.table(custPkgs.rows);

  // 3. Check if there are any rentals linked to these packages
  const pkgRentals = await pool.query(`
    SELECT r.id, r.total_price, r.payment_status, r.rental_days_used,
      cp.package_name, cp.purchase_price, cp.rental_days_total
    FROM rentals r
    JOIN customer_packages cp ON cp.id = r.customer_package_id
    WHERE r.status IN ('completed','returned','closed','active')
    LIMIT 10
  `);
  console.log('\nRentals from packages:');
  console.table(pkgRentals.rows);

  // 4. Count ALL rentals including deleted/pending
  const allRentals = await pool.query(`
    SELECT status, payment_status, COUNT(*) as cnt, COALESCE(SUM(total_price),0) as revenue
    FROM rentals
    GROUP BY status, payment_status
    ORDER BY status, payment_status
  `);
  console.log('\nAll rentals by status/payment:');
  console.table(allRentals.rows);

  // 5. Check the revenue query - does it include package rental revenue?
  const summaryRevenue = await pool.query(`
    SELECT 
      COALESCE(SUM(total_price), 0) AS rental_revenue,
      COUNT(*) AS rental_count,
      SUM(CASE WHEN customer_package_id IS NOT NULL THEN 1 ELSE 0 END) as pkg_rentals,
      SUM(CASE WHEN customer_package_id IS NULL THEN 1 ELSE 0 END) as individual_rentals
    FROM rentals
    WHERE status IN ('completed','returned','closed','active')
  `);
  console.log('\nRental revenue summary:');
  console.table(summaryRevenue.rows);

  // 6. Package revenue that should be attributed to rentals
  const pkgRevenue = await pool.query(`
    SELECT COALESCE(SUM(cp.purchase_price), 0) as total_pkg_revenue,
      COUNT(*) as pkg_count
    FROM customer_packages cp
    WHERE cp.rental_days_total > 0
      AND cp.status IN ('active', 'completed', 'expired')
  `);
  console.log('\nPackage revenue with rental days (not attributed):');
  console.table(pkgRevenue.rows);

  await pool.end();
})();
