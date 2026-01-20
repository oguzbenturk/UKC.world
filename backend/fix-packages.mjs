import { pool } from './db.js';

async function fixPackages() {
  const client = await pool.connect();
  try {
    console.log('Fixing package lesson_service_name values and service types...\n');

    // Fix "BEGINNER" - change "Private Lesson" (singular) to "Private Lessons" (plural)
    const result1 = await client.query(`
      UPDATE service_packages 
      SET lesson_service_name = 'Private Lessons'
      WHERE name = 'BEGINNER' AND lesson_service_name != 'Private Lessons'
      RETURNING id, name, lesson_service_name
    `);
    if (result1.rows.length > 0) {
      console.log(`✅ Updated BEGINNER: ${result1.rows[0].lesson_service_name}`);
    } else {
      console.log('ℹ️  BEGINNER already correct');
    }

    // Fix "4H Premium Lesson" - change "Advance Lessons" to "Private Lessons"
    const result2 = await client.query(`
      UPDATE service_packages 
      SET lesson_service_name = 'Private Lessons'
      WHERE name = '4H Premium Lesson' AND lesson_service_name != 'Private Lessons'
      RETURNING id, name, lesson_service_name
    `);
    if (result2.rows.length > 0) {
      console.log(`✅ Updated 4H Premium Lesson: ${result2.rows[0].lesson_service_name}`);
    } else {
      console.log('ℹ️  4H Premium Lesson already correct');
    }

    // Fix "Group Lessons" service - change service_type from 'private' to 'group'
    const result3 = await client.query(`
      UPDATE services 
      SET service_type = 'group'
      WHERE name = 'Group Lessons' AND service_type != 'group'
      RETURNING id, name, service_type
    `);
    if (result3.rows.length > 0) {
      console.log(`✅ Updated Group Lessons service: service_type = ${result3.rows[0].service_type}`);
    } else {
      console.log('ℹ️  Group Lessons service already correct');
    }

    // Verify all packages
    const verifyResult = await client.query(`
      SELECT id, name, lesson_service_name, total_hours, sessions_count
      FROM service_packages
      ORDER BY name
    `);

    console.log('\n📊 All packages after fix:');
    for (const row of verifyResult.rows) {
      console.log(`  - ${row.name}: "${row.lesson_service_name}" (${row.total_hours}h, ${row.sessions_count} sessions)`);
    }

    // Verify all services
    const verifyServices = await client.query(`
      SELECT id, name, service_type
      FROM services
      ORDER BY name
    `);

    console.log('\n📊 All services after fix:');
    for (const row of verifyServices.rows) {
      console.log(`  - ${row.name}: service_type = ${row.service_type}`);
    }

    console.log('\n✅ Database fixed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
  }
}

fixPackages();
