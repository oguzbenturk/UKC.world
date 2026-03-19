const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Instructors - join roles table
  const { rows: instructors } = await pool.query(
    `SELECT u.id, u.name, u.email, r.name as role_name
     FROM users u LEFT JOIN roles r ON u.role_id = r.id
     WHERE r.name IN ('instructor','admin','manager') AND u.deleted_at IS NULL ORDER BY u.name`
  );
  console.log('=== INSTRUCTORS ===');
  instructors.forEach(r => console.log(`  id=${r.id} | name=${r.name} | email=${r.email} | role=${r.role_name}`));

  // Lesson services
  const { rows: services } = await pool.query(
    `SELECT id, name, service_type, lesson_category_tag, price, duration, max_participants, discipline_tag
     FROM services WHERE category IN ('lesson','lessons','kitesurfing','wingfoil') ORDER BY name`
  );
  console.log('\n=== LESSON SERVICES ===');
  services.forEach(r => console.log(`  id=${r.id} | name=${r.name} | type=${r.service_type} | cat=${r.lesson_category_tag} | price=${r.price} | dur=${r.duration} | max=${r.max_participants} | disc=${r.discipline_tag}`));

  // Service packages
  const { rows: packages } = await pool.query(
    `SELECT id, name, price, total_hours, sessions_count, package_type, includes_accommodation, includes_rental, includes_lessons,
            accommodation_nights, rental_days, lesson_service_id, rental_service_id, accommodation_unit_id, lesson_service_name
     FROM service_packages ORDER BY name`
  );
  console.log('\n=== SERVICE PACKAGES ===');
  packages.forEach(r => console.log(`  id=${r.id} | name=${r.name} | price=${r.price} | hours=${r.total_hours} | sessions=${r.sessions_count} | type=${r.package_type} | accom=${r.includes_accommodation}/${r.accommodation_nights} | rental=${r.includes_rental}/${r.rental_days} | lessons=${r.includes_lessons} | lessonSvcId=${r.lesson_service_id} | rentalSvcId=${r.rental_service_id} | accomUnitId=${r.accommodation_unit_id}`));

  // Shop products
  const { rows: products } = await pool.query(
    `SELECT id, name, price, status FROM products WHERE status = 'active' ORDER BY name LIMIT 20`
  );
  console.log('\n=== SHOP PRODUCTS ===');
  products.forEach(r => console.log(`  id=${r.id} | name=${r.name} | price=${r.price}`));

  // Events
  const { rows: events } = await pool.query(
    `SELECT id, name, price, event_status, max_participants, current_participants FROM service_packages WHERE package_type IN ('event','downwinders','camps') ORDER BY name`
  );
  console.log('\n=== EVENTS ===');
  events.forEach(r => console.log(`  id=${r.id} | name=${r.name} | price=${r.price} | status=${r.event_status} | max=${r.max_participants} | current=${r.current_participants}`));

  // Member offerings - select all to discover columns
  const { rows: memberships } = await pool.query(
    `SELECT * FROM member_offerings WHERE is_active = true ORDER BY name`
  );
  console.log('\n=== MEMBER OFFERINGS ===');
  if (memberships.length > 0) console.log('  columns:', Object.keys(memberships[0]).join(', '));
  memberships.forEach(r => console.log(`  id=${r.id} | name=${r.name} | price=${r.price}`));

  // Accommodation units
  const { rows: units } = await pool.query(
    `SELECT id, name, type, price_per_night, capacity, status FROM accommodation_units ORDER BY name`
  );
  console.log('\n=== ACCOMMODATION UNITS ===');
  units.forEach(r => console.log(`  id=${r.id} | name=${r.name} | type=${r.type} | price=${r.price_per_night} | cap=${r.capacity} | status=${r.status}`));

  // Rental equipment services
  const { rows: rentals } = await pool.query(
    `SELECT id, name, price, service_type, category FROM services WHERE category IN ('rental','rentals') OR service_type = 'rental' ORDER BY name`
  );
  console.log('\n=== RENTAL SERVICES ===');
  rentals.forEach(r => console.log(`  id=${r.id} | name=${r.name} | price=${r.price} | type=${r.service_type} | cat=${r.category}`));

  pool.end();
})();
