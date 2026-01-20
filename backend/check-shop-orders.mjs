import { pool } from './db.js';

async function checkShopOrders() {
  try {
    console.log('\n=== Shop Orders Table Structure ===');
    const structureRes = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'shop_orders' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(structureRes.rows, null, 2));

    console.log('\n=== Sample Shop Orders ===');
    const ordersRes = await pool.query(`
      SELECT id, user_id, total_amount, status, payment_status, created_at 
      FROM shop_orders 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log(JSON.stringify(ordersRes.rows, null, 2));

    console.log('\n=== Shop Orders Count by Year ===');
    const countRes = await pool.query(`
      SELECT 
        EXTRACT(YEAR FROM created_at) as year,
        COUNT(*) as order_count,
        SUM(total_amount) as total_revenue
      FROM shop_orders
      GROUP BY year
      ORDER BY year DESC
    `);
    console.log(JSON.stringify(countRes.rows, null, 2));

    console.log('\n=== Instructor Commission History Table Structure ===');
    const commStructureRes = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'instructor_commission_history' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(commStructureRes.rows, null, 2));

    console.log('\n=== Commission History Sample ===');
    const commissionSampleRes = await pool.query(`
      SELECT *
      FROM instructor_commission_history
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log(JSON.stringify(commissionSampleRes.rows, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkShopOrders();
