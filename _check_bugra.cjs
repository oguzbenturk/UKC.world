const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

(async () => {
  // Find all Bentürk users
  const u = await pool.query("SELECT id, first_name, last_name, email, deleted_at FROM users WHERE last_name ILIKE '%ent%rk%' ORDER BY first_name");
  console.log('=== All Bentürk users ===');
  for (const row of u.rows) {
    console.log(row.id, row.first_name, row.last_name, row.deleted_at ? 'DELETED' : 'ACTIVE');
  }

  const allIds = u.rows.map(r => r.id);
  const deletedIds = u.rows.filter(r => r.deleted_at).map(r => r.id);
  const activeIds = u.rows.filter(r => !r.deleted_at).map(r => r.id);

  // group_booking_participants for ALL Bentürk users
  console.log('\n=== group_booking_participants for ALL Bentürk ===');
  const gbpAll = await pool.query(`
    SELECT gbp.id, gbp.user_id, gbp.group_booking_id, gbp.status,
           u.first_name, u.last_name, u.deleted_at as user_deleted,
           gb.title, gb.created_at, gb.status as gb_status
    FROM group_booking_participants gbp
    LEFT JOIN users u ON u.id = gbp.user_id
    LEFT JOIN group_bookings gb ON gb.id = gbp.group_booking_id
    WHERE gbp.user_id = ANY($1)
    ORDER BY gb.created_at DESC
  `, [allIds]);
  for (const r of gbpAll.rows) {
    console.log('  gbp:', r.id, '| user:', r.first_name, r.last_name, r.user_deleted ? 'DEL' : 'ACT',
      '| gb:', r.group_booking_id, r.title, r.created_at, r.gb_status, '| status:', r.status);
  }

  // booking_participants for ALL Bentürk users
  console.log('\n=== booking_participants for ALL Bentürk ===');
  const bpAll = await pool.query(`
    SELECT bp.id, bp.user_id, bp.booking_id,
           u.first_name, u.last_name, u.deleted_at as user_deleted,
           b.date, b.start_hour, b.status as b_status, b.deleted_at as booking_deleted
    FROM booking_participants bp
    LEFT JOIN users u ON u.id = bp.user_id
    LEFT JOIN bookings b ON b.id = bp.booking_id
    WHERE bp.user_id = ANY($1)
    ORDER BY b.date DESC
  `, [allIds]);
  for (const r of bpAll.rows) {
    console.log('  bp:', r.id, '| user:', r.first_name, r.last_name, r.user_deleted ? 'DEL' : 'ACT',
      '| booking:', r.date, r.start_hour, r.b_status, r.booking_deleted ? 'B-DELETED' : '');
  }

  // Remaining data for DELETED users
  console.log('\n=== Remaining data for DELETED Bentürk users ===');
  for (const did of deletedIds) {
    const user = u.rows.find(r => r.id === did);
    const checks = [
      ['wallet_transactions', "user_id"],
      ['customer_packages', "customer_id"],
      ['notifications', "user_id"],
      ['wallets', "user_id"],
    ];
    for (const [table, col] of checks) {
      try {
        const r = await pool.query('SELECT COUNT(*) as count FROM ' + table + ' WHERE ' + col + ' = $1', [did]);
        const count = parseInt(r.rows[0].count);
        if (count > 0) console.log('  ' + user.first_name + ' (' + did.substring(0,8) + '...) ' + table + ': ' + count);
      } catch(e) {}
    }
  }

  // Active Buğra - what does the student dashboard API see?
  const activeB = u.rows.find(r => !r.deleted_at && r.first_name.includes('ra'));
  if (activeB) {
    console.log('\n=== Active Buğra (' + activeB.id + ') bookings ===');
    const bk = await pool.query(`
      SELECT id, date, start_hour, status, customer_user_id, student_user_id
      FROM bookings WHERE (customer_user_id = $1 OR student_user_id = $1) AND deleted_at IS NULL
      ORDER BY date DESC LIMIT 10
    `, [activeB.id]);
    console.log('Bookings:', bk.rows.length);
    for (const r of bk.rows) {
      console.log('  booking:', r.id, r.date, r.start_hour, r.status);
    }

    // Check if she sees bookings from old deleted user IDs via group_booking_participants
    console.log('\n=== Group bookings visible to active Buğra ===');
    const gbVis = await pool.query(`
      SELECT gb.id, gb.title, gb.date, gb.status, gb.organizer_id,
             gbp.user_id as participant_user_id, gbp.status as part_status
      FROM group_bookings gb
      LEFT JOIN group_booking_participants gbp ON gbp.group_booking_id = gb.id
      WHERE gb.organizer_id = $1 OR gbp.user_id = $1
      ORDER BY gb.created_at DESC
    `, [activeB.id]);
    console.log('Group bookings:', gbVis.rows.length);
    for (const r of gbVis.rows) {
      console.log('  gb:', r.id, r.title, r.status, 'org:', r.organizer_id, 'part:', r.participant_user_id);
    }
  }

  // ALL group_bookings in system
  console.log('\n=== ALL group_bookings ===');
  const allGb = await pool.query(`
    SELECT gb.id, gb.title, gb.status, gb.organizer_id, gb.created_at, u.first_name, u.last_name, u.deleted_at as org_del
    FROM group_bookings gb LEFT JOIN users u ON u.id = gb.organizer_id ORDER BY gb.created_at DESC LIMIT 20
  `);
  for (const r of allGb.rows) {
    console.log('  gb:', r.id, '|', r.title, '|', r.status, '|', r.created_at, '| org:', r.first_name, r.last_name, r.org_del ? 'DEL' : 'ACT');
  }

  await pool.end();
})();
