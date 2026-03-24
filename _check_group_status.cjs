const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

// 1) Show ALL participants across all group bookings (including pending_acceptance, invited)
pool.query(`
  SELECT gb.id, gb.title, gb.status as gb_status, 
    p.status as p_status, p.payment_status, p.is_organizer, p.user_id,
    u.first_name, u.last_name, u.email
  FROM group_bookings gb
  JOIN group_booking_participants p ON p.group_booking_id = gb.id
  LEFT JOIN users u ON u.id = p.user_id
  ORDER BY gb.created_at DESC
`).then(r => {
  console.log('=== ALL GROUP BOOKING PARTICIPANTS ===');
  r.rows.forEach(row => console.log(
    row.id.slice(0,8), '|', row.title, '| gb:', row.gb_status,
    '| p_status:', row.p_status, '| pay:', row.payment_status,
    '| org:', row.is_organizer, '| user:', (row.first_name||'') + ' ' + (row.last_name||''),
    '| email:', row.email || 'n/a'
  ));

  // 2) Also check bookings table for pending_partner bookings (the partner invite flow)
  return pool.query(`
    SELECT b.id, b.status, b.created_at,
      bp.user_id as participant_uid, bp.is_primary,
      pu.first_name as part_fn, pu.last_name as part_ln
    FROM bookings b
    LEFT JOIN booking_participants bp ON bp.booking_id = b.id
    LEFT JOIN users pu ON pu.id = bp.user_id
    WHERE b.status IN ('pending_partner', 'pending')
    ORDER BY b.created_at DESC
    LIMIT 20
  `);
}).then(r => {
  console.log('\n=== PENDING/PENDING_PARTNER BOOKINGS ===');
  r.rows.forEach(row => console.log(
    row.id.slice(0,8), '| status:', row.status, '| service:', row.service_name,
    '| participant:', (row.part_fn||'') + ' ' + (row.part_ln||''),
    '| primary:', row.is_primary
  ));
  pool.end();
});
