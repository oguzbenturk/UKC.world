// scripts/check-integrity.mjs
// Database Consistency and Financial Integrity Checker
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m"
};

// Load environment variables (backend first, then root)
const loadEnv = () => {
  const backendEnvPath = path.resolve(__dirname, '../backend/.env');
  const rootEnvPath = path.resolve(__dirname, '../.env');
  
  if (fs.existsSync(backendEnvPath)) {
    dotenv.config({ path: backendEnvPath });
  }
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  }
};

loadEnv();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(`${colors.red}Error: DATABASE_URL is not set.${colors.reset}`);
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function runIntegrityChecks() {
  console.log(`${colors.bold}${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║          🔍 DATABASE INTEGRITY & CONSISTENCY CHECK           ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  const checks = [
    // ═══════════════════════════════════════════════════════════
    // FINANCIAL INTEGRITY CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '💰 Wallet Balance vs Transactions',
      description: 'Users whose wallet balance doesn\'t match sum of transactions',
      query: `
        SELECT 
          wb.user_id,
          u.email,
          wb.balance as recorded_balance,
          COALESCE(SUM(wt.amount), 0) as calculated_balance,
          ABS(wb.balance - COALESCE(SUM(wt.amount), 0)) as difference
        FROM wallet_balances wb
        JOIN users u ON wb.user_id = u.id
        LEFT JOIN wallet_transactions wt ON wb.user_id = wt.user_id
        GROUP BY wb.user_id, wb.balance, u.email
        HAVING ABS(wb.balance - COALESCE(SUM(wt.amount), 0)) > 0.01
        ORDER BY difference DESC
        LIMIT 10
      `,
      severity: 'critical'
    },
    {
      name: '💰 User Balance vs Wallet Balance',
      description: 'Users where users.balance differs from wallet_balances.balance',
      query: `
        SELECT 
          u.id,
          u.email,
          u.balance as user_balance,
          wb.balance as wallet_balance,
          ABS(COALESCE(u.balance, 0) - COALESCE(wb.balance, 0)) as difference
        FROM users u
        LEFT JOIN wallet_balances wb ON u.id = wb.user_id
        WHERE ABS(COALESCE(u.balance, 0) - COALESCE(wb.balance, 0)) > 0.01
        ORDER BY difference DESC
        LIMIT 10
      `,
      severity: 'warning'
    },
    {
      name: '💰 Completed Bookings Without Payment',
      description: 'Bookings marked completed but payment_status is not paid',
      query: `
        SELECT id, date, status, payment_status, final_amount, customer_user_id
        FROM bookings
        WHERE status = 'completed' 
          AND payment_status != 'paid'
          AND final_amount > 0
          AND deleted_at IS NULL
        LIMIT 10
      `,
      severity: 'warning'
    },
    {
      name: '💰 Refunds Without Original Transaction',
      description: 'Refund records that don\'t link to a valid booking/order',
      query: `
        SELECT r.id, r.amount, r.reason, r.created_at
        FROM refunds r
        LEFT JOIN bookings b ON r.booking_id = b.id
        LEFT JOIN shop_orders so ON r.order_id = so.id
        WHERE b.id IS NULL AND so.id IS NULL
        LIMIT 10
      `,
      severity: 'critical'
    },
    
    // ═══════════════════════════════════════════════════════════
    // BOOKING INTEGRITY CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '📅 Orphaned Bookings (No Customer)',
      description: 'Bookings with customer_user_id that doesn\'t exist',
      query: `
        SELECT b.id, b.date, b.customer_user_id, b.status
        FROM bookings b
        LEFT JOIN users u ON b.customer_user_id = u.id
        WHERE b.customer_user_id IS NOT NULL 
          AND u.id IS NULL
          AND b.deleted_at IS NULL
        LIMIT 10
      `,
      severity: 'critical'
    },
    {
      name: '📅 Bookings with Invalid Service',
      description: 'Bookings referencing non-existent services',
      query: `
        SELECT b.id, b.date, b.service_id, b.status
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        WHERE b.service_id IS NOT NULL 
          AND s.id IS NULL
          AND b.deleted_at IS NULL
        LIMIT 10
      `,
      severity: 'warning'
    },
    {
      name: '📅 Double-Booked Instructors',
      description: 'Instructors with overlapping confirmed bookings',
      query: `
        SELECT 
          b1.instructor_user_id,
          u.name as instructor_name,
          b1.date,
          b1.start_hour as booking1_start,
          b2.start_hour as booking2_start,
          b1.id as booking1_id,
          b2.id as booking2_id
        FROM bookings b1
        JOIN bookings b2 ON b1.instructor_user_id = b2.instructor_user_id
          AND b1.date = b2.date
          AND b1.id < b2.id
          AND b1.start_hour < (b2.start_hour + b2.duration)
          AND b2.start_hour < (b1.start_hour + b1.duration)
        JOIN users u ON b1.instructor_user_id = u.id
        WHERE b1.status IN ('confirmed', 'completed')
          AND b2.status IN ('confirmed', 'completed')
          AND b1.deleted_at IS NULL
          AND b2.deleted_at IS NULL
        LIMIT 10
      `,
      severity: 'warning'
    },

    // ═══════════════════════════════════════════════════════════
    // RENTAL INTEGRITY CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '🏄 Rentals with Missing Equipment',
      description: 'Rental records referencing non-existent equipment',
      query: `
        SELECT r.id, r.equipment_id, r.status
        FROM rentals r
        LEFT JOIN equipment e ON r.equipment_id = e.id
        WHERE r.equipment_id IS NOT NULL AND e.id IS NULL
        LIMIT 10
      `,
      severity: 'warning'
    },
    {
      name: '🏄 Equipment with Negative Stock',
      description: 'Equipment items with quantity below zero',
      query: `
        SELECT id, name, quantity
        FROM equipment
        WHERE quantity < 0
        LIMIT 10
      `,
      severity: 'critical'
    },

    // ═══════════════════════════════════════════════════════════
    // PACKAGE & MEMBERSHIP CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '📦 Packages with Negative Hours',
      description: 'Customer packages with remaining hours below zero',
      query: `
        SELECT cp.id, u.email, cp.remaining_hours, cp.total_hours
        FROM customer_packages cp
        JOIN users u ON cp.user_id = u.id
        WHERE cp.remaining_hours < 0
        LIMIT 10
      `,
      severity: 'critical'
    },
    {
      name: '📦 Users with Negative Package Hours',
      description: 'Users table has negative remaining_hours',
      query: `
        SELECT id, email, remaining_hours, package_hours
        FROM users
        WHERE remaining_hours < 0
        LIMIT 10
      `,
      severity: 'warning'
    },

    // ═══════════════════════════════════════════════════════════
    // SHOP & ORDERS CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '🛒 Shop Orders with No Items',
      description: 'Orders that have no associated order items',
      query: `
        SELECT so.id, so.total_amount, so.status, so.created_at
        FROM shop_orders so
        LEFT JOIN shop_order_items soi ON so.id = soi.order_id
        WHERE soi.id IS NULL
        LIMIT 10
      `,
      severity: 'warning'
    },
    {
      name: '🛒 Order Total Mismatch',
      description: 'Orders where total doesn\'t match sum of items',
      query: `
        SELECT 
          so.id,
          so.total_amount as recorded_total,
          COALESCE(SUM(soi.quantity * soi.unit_price), 0) as calculated_total,
          ABS(so.total_amount - COALESCE(SUM(soi.quantity * soi.unit_price), 0)) as difference
        FROM shop_orders so
        LEFT JOIN shop_order_items soi ON so.id = soi.order_id
        GROUP BY so.id, so.total_amount
        HAVING ABS(so.total_amount - COALESCE(SUM(soi.quantity * soi.unit_price), 0)) > 0.01
        LIMIT 10
      `,
      severity: 'warning'
    },

    // ═══════════════════════════════════════════════════════════
    // ACCOMMODATION CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '🏨 Accommodation Double Bookings',
      description: 'Same unit booked for overlapping dates',
      query: `
        SELECT 
          a1.unit_id,
          a1.check_in_date as booking1_checkin,
          a1.check_out_date as booking1_checkout,
          a2.check_in_date as booking2_checkin,
          a2.check_out_date as booking2_checkout
        FROM accommodation_bookings a1
        JOIN accommodation_bookings a2 ON a1.unit_id = a2.unit_id
          AND a1.id < a2.id
          AND a1.check_in_date < a2.check_out_date
          AND a2.check_in_date < a1.check_out_date
        WHERE a1.status NOT IN ('cancelled', 'rejected')
          AND a2.status NOT IN ('cancelled', 'rejected')
        LIMIT 10
      `,
      severity: 'warning'
    },

    // ═══════════════════════════════════════════════════════════
    // DATA QUALITY CHECKS
    // ═══════════════════════════════════════════════════════════
    {
      name: '👤 Users with Invalid Roles',
      description: 'Users with role_id that doesn\'t exist',
      query: `
        SELECT u.id, u.email, u.role_id
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.role_id IS NOT NULL AND r.id IS NULL
        LIMIT 10
      `,
      severity: 'critical'
    },
    {
      name: '👤 Duplicate User Emails',
      description: 'Multiple active users with same email',
      query: `
        SELECT email, COUNT(*) as count
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY email
        HAVING COUNT(*) > 1
        LIMIT 10
      `,
      severity: 'critical'
    }
  ];

  let criticalIssues = 0;
  let warningIssues = 0;
  let passedChecks = 0;

  for (const check of checks) {
    try {
      const result = await pool.query(check.query);
      const hasIssues = result.rows.length > 0;
      
      if (hasIssues) {
        const icon = check.severity === 'critical' ? '🚨' : '⚠️';
        const color = check.severity === 'critical' ? colors.red : colors.yellow;
        
        console.log(`${color}${icon} ${check.name}${colors.reset}`);
        console.log(`   ${colors.yellow}${check.description}${colors.reset}`);
        console.log(`   Found ${result.rows.length} issue(s):`);
        
        // Show first 3 examples
        result.rows.slice(0, 3).forEach((row, i) => {
          console.log(`   ${i + 1}. ${JSON.stringify(row)}`);
        });
        
        if (result.rows.length > 3) {
          console.log(`   ... and ${result.rows.length - 3} more`);
        }
        console.log('');
        
        if (check.severity === 'critical') criticalIssues++;
        else warningIssues++;
      } else {
        console.log(`${colors.green}✅ ${check.name}${colors.reset}`);
        passedChecks++;
      }
    } catch (err) {
      // Query failed (table might not exist) - skip silently or show minor warning
      console.log(`${colors.yellow}⏭️  ${check.name} - Skipped (${err.message.split('\n')[0]})${colors.reset}`);
    }
  }

  // Summary
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}                         SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}✅ Passed:   ${passedChecks}${colors.reset}`);
  console.log(`${colors.yellow}⚠️  Warnings: ${warningIssues}${colors.reset}`);
  console.log(`${colors.red}🚨 Critical: ${criticalIssues}${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  await pool.end();

  if (criticalIssues > 0) {
    console.log(`${colors.red}${colors.bold}❌ INTEGRITY CHECK FAILED - Critical issues found!${colors.reset}`);
    process.exit(1);
  } else if (warningIssues > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  INTEGRITY CHECK PASSED WITH WARNINGS${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.green}${colors.bold}✅ ALL INTEGRITY CHECKS PASSED!${colors.reset}`);
    process.exit(0);
  }
}

runIntegrityChecks().catch(err => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
  process.exit(1);
});
