import { pool } from './backend/db.js';

const bookingId = '789c1a77-ad67-43ee-b96b-9ab99c8d4278';
const client = await pool.connect();

try {
  await client.query('BEGIN');

  // Get booking
  const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  if (!booking) throw new Error('Booking not found');

  // Get service
  const { rows: [svc] } = await client.query(
    'SELECT id, name, category, service_type, duration, price, currency FROM services WHERE id = $1',
    [booking.service_id]
  );
  if (!svc) throw new Error('Service not found');

  // Calculate dates
  const serviceDurationHours = parseFloat(svc.duration) || 1;
  const bookingDate = booking.date || new Date().toISOString().split('T')[0];
  const startHour = parseFloat(booking.start_hour) || 9;
  const startDate = new Date(`${bookingDate}T${String(Math.floor(startHour)).padStart(2, '0')}:${String(Math.round((startHour % 1) * 60)).padStart(2, '0')}:00`);
  const endDate = new Date(startDate.getTime() + serviceDurationHours * 60 * 60 * 1000);

  const equipmentIds = JSON.stringify([booking.service_id]);
  const equipmentDetails = JSON.stringify({
    [svc.id]: { id: svc.id, name: svc.name, category: svc.category, price: parseFloat(svc.price) || 0, currency: svc.currency }
  });
  const totalPrice = parseFloat(booking.final_amount || booking.amount) || 0;

  const rentalResult = await client.query(
    `INSERT INTO rentals (
      user_id, equipment_ids, rental_date, start_date, end_date,
      status, total_price, payment_status, equipment_details, notes,
      created_by, family_member_id, participant_type
    ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
    RETURNING id`,
    [
      booking.student_user_id || booking.customer_user_id,
      equipmentIds,
      bookingDate,
      startDate.toISOString(),
      endDate.toISOString(),
      'active',
      totalPrice,
      booking.payment_status || 'paid',
      equipmentDetails,
      booking.notes || null,
      booking.student_user_id, // created_by
      booking.family_member_id || null,
      booking.family_member_id ? 'family_member' : 'self'
    ]
  );

  const rentalId = rentalResult.rows[0].id;
  console.log('Created rental:', rentalId);

  // Create rental_equipment link
  const dailyRate = parseFloat(svc.price) || 0;
  await client.query(
    `INSERT INTO rental_equipment (rental_id, equipment_id, daily_rate, created_by)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [rentalId, svc.id, dailyRate, booking.student_user_id]
  );

  await client.query('COMMIT');
  console.log('Rental created successfully for booking', bookingId);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Error:', e.message);
} finally {
  client.release();
  process.exit(0);
}
