import { pool } from '../db.js';
import { appendCreatedBy, resolveSystemActorId } from '../utils/auditUtils.js';

/**
 * Student Accounts Migration Script
 * 
 * This script populates missing student_accounts records by calculating
 * balances and totals from the transaction ledger (source of truth).
 * 
 * Usage:
 *   node scripts/migrate-student-accounts.js [--dry-run] [--limit=N] [--user-id=UUID]
 */

class StudentAccountsMigrator {
  constructor() {
    this.dryRun = false;
    this.limit = null;
    this.specificUserId = null;
    this.results = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
      skipped: 0
    };
  }

  parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  roundCurrency(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
  }

  parseDateSafe(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async calculateUserFinancials(userId) {
    const query = `
      SELECT 
        id, amount, type, status, description, payment_method,
        COALESCE(transaction_date, created_at) as effective_date,
        created_at
      FROM transactions 
      WHERE user_id = $1 
      ORDER BY effective_date DESC, id DESC
    `;
    
    const { rows } = await pool.query(query, [userId]);
    
    let balance = 0;
    let totalSpent = 0;
    let lastPaymentAt = null;

    for (const transaction of rows) {
      const amount = this.parseNumber(transaction.amount);
      const type = (transaction.type || '').toLowerCase();
      const effectiveDate = this.parseDateSafe(transaction.effective_date);

      balance += amount;

      // Track spending and last payment using the same logic as studentPortalService
      const updateLastPayment = () => {
        if (effectiveDate && (!lastPaymentAt || effectiveDate > lastPaymentAt)) {
          lastPaymentAt = effectiveDate;
        }
      };

      switch (type) {
        case 'payment':
        case 'credit':
          if (amount !== 0) {
            totalSpent += Math.abs(amount);
            updateLastPayment();
          }
          break;
        case 'package_refund':
        case 'refund':
        case 'booking_deleted_refund':
          if (amount > 0) {
            updateLastPayment();
          }
          break;
        case 'package_purchase':
        case 'booking_charge':
        case 'charge':
        case 'debit':
        case 'service_payment':
        case 'rental_payment':
          break;
        default:
          if (amount > 0) {
            totalSpent += amount;
            updateLastPayment();
          }
      }
    }

    return {
      balance: this.roundCurrency(balance),
      totalSpent: this.roundCurrency(totalSpent),
      lastPaymentAt,
      transactionCount: rows.length
    };
  }

  async getUsersNeedingMigration() {
    let query = `
      SELECT u.id, u.name, u.email, 
             sa.user_id as has_account,
             sa.balance as stored_balance,
             sa.total_spent as stored_total_spent,
             (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as transaction_count
      FROM users u
      LEFT JOIN student_accounts sa ON sa.user_id = u.id
      WHERE (
        -- Users with transactions but no student_accounts row
        (sa.user_id IS NULL AND EXISTS (SELECT 1 FROM transactions WHERE user_id = u.id))
        OR
        -- Users with student_accounts but zero values despite having transactions
        (sa.user_id IS NOT NULL AND sa.balance = 0 AND sa.total_spent = 0 AND EXISTS (SELECT 1 FROM transactions WHERE user_id = u.id))
      )
    `;

    const params = [];
    
    if (this.specificUserId) {
      query += ` AND u.id = $${params.length + 1}`;
      params.push(this.specificUserId);
    }

    query += ` ORDER BY u.created_at DESC`;

    if (this.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(this.limit);
    }

    const { rows } = await pool.query(query, params);
    return rows;
  }

  async migrateUser(user) {
    console.log(`\n📊 Processing ${user.name} (${user.email})...`);
    
    try {
      // Calculate correct financial values from transactions
      const calculated = await this.calculateUserFinancials(user.id);
      
      console.log(`   Transactions: ${calculated.transactionCount}`);
      console.log(`   Calculated Balance: €${calculated.balance}`);
      console.log(`   Calculated Total Spent: €${calculated.totalSpent}`);
      console.log(`   Last Payment: ${calculated.lastPaymentAt ? calculated.lastPaymentAt.toISOString().split('T')[0] : 'None'}`);

      if (calculated.transactionCount === 0) {
        console.log(`   ⏭️  No transactions, skipping`);
        this.results.skipped++;
        return;
      }

      if (this.dryRun) {
        console.log(`   🏃 DRY RUN: Would ${user.has_account ? 'update' : 'create'} student_accounts record`);
        this.results.processed++;
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const systemActorId = resolveSystemActorId();

        if (user.has_account) {
          // Update existing record
          await client.query(`
            UPDATE student_accounts 
            SET balance = $1, 
                total_spent = $2, 
                last_payment_date = $3,
                updated_at = NOW()
            WHERE user_id = $4
          `, [
            calculated.balance,
            calculated.totalSpent,
            calculated.lastPaymentAt,
            user.id
          ]);
          
          console.log(`   ✅ Updated student_accounts record`);
          this.results.updated++;
        } else {
          // Create new record
          const baseColumns = ['user_id', 'balance', 'total_spent', 'last_payment_date'];
          const baseValues = [
            user.id,
            calculated.balance,
            calculated.totalSpent,
            calculated.lastPaymentAt
          ];
          const { columns, values } = appendCreatedBy(baseColumns, baseValues, systemActorId);
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

          await client.query(`
            INSERT INTO student_accounts (${columns.join(', ')}, created_at, updated_at)
            VALUES (${placeholders}, NOW(), NOW())
          `, values);
          
          console.log(`   ✅ Created student_accounts record`);
          this.results.created++;
        }

        await client.query('COMMIT');
        this.results.processed++;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      this.results.errors++;
    }
  }

  async run() {
    console.log('🔧 Starting Student Accounts Migration...\n');
    
    if (this.dryRun) {
      console.log('🏃 DRY RUN MODE - No changes will be made\n');
    }

    try {
      const users = await this.getUsersNeedingMigration();
      console.log(`📋 Found ${users.length} users needing migration\n`);

      if (users.length === 0) {
        console.log('✅ No migration needed - all users have correct student_accounts records');
        return;
      }

      for (const user of users) {
        await this.migrateUser(user);
      }

      this.printSummary();

    } catch (error) {
      console.error('💥 Migration failed:', error);
      throw error;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total processed: ${this.results.processed}`);
    console.log(`Records created: ${this.results.created}`);
    console.log(`Records updated: ${this.results.updated}`);
    console.log(`Errors: ${this.results.errors}`);
    console.log(`Skipped: ${this.results.skipped}`);
    
    const successRate = this.results.processed > 0 
      ? ((this.results.processed - this.results.errors) / this.results.processed * 100).toFixed(1)
      : 100;
    
    console.log(`Success rate: ${successRate}%`);
    
    if (this.results.errors === 0 && this.results.processed > 0) {
      console.log('\n✅ Migration completed successfully!');
    } else if (this.results.errors > 0) {
      console.log('\n⚠️  Migration completed with some errors');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const migrator = new StudentAccountsMigrator();

  // Parse command line arguments
  for (const arg of args) {
    if (arg === '--dry-run') {
      migrator.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      migrator.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--user-id=')) {
      migrator.specificUserId = arg.split('=')[1];
    } else if (arg === '--help') {
      console.log(`
Student Accounts Migration Script

Usage:
  node scripts/migrate-student-accounts.js [options]

Options:
  --dry-run           Show what would be changed without making changes
  --limit=N           Process only N users (for testing)
  --user-id=UUID      Process only a specific user
  --help              Show this help message

Examples:
  node scripts/migrate-student-accounts.js --dry-run
  node scripts/migrate-student-accounts.js --limit=5
  node scripts/migrate-student-accounts.js --user-id=123e4567-e89b-12d3-a456-426614174000
      `);
      return;
    }
  }

  try {
    await migrator.run();
  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  }
}

// Run if called directly
main().catch(console.error);

export { StudentAccountsMigrator };