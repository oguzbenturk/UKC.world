#!/usr/bin/env node

/**
 * Financial Reconciliation Test Script
 * 
 * This script tests the financial system by:
 * 1. Comparing stored balances vs calculated balances for all users
 * 2. Validating transaction aggregation logic
 * 3. Identifying discrepancies and potential issues
 * 4. Running stress tests on the reconciliation system
 */

import { pool } from '../db.js';
import { getStudentOverview } from '../services/studentPortalService.js';

const TOLERANCE = 0.01; // Cent-level tolerance for floating point comparison

class FinancialReconciliationTester {
  constructor() {
    this.results = {
      totalUsers: 0,
      usersWithTransactions: 0,
      perfectMatches: 0,
      balanceDiscrepancies: [],
      totalSpentDiscrepancies: [],
      systemErrors: [],
      detailedResults: []
    };
  }

  async runComprehensiveTest() {
    console.log('🔍 Starting comprehensive financial reconciliation test...\n');
    
    try {
      // Test 1: Get all users with their stored financial data
      const users = await this.getAllUsersWithFinancialData();
      console.log(`📊 Found ${users.length} users to test\n`);
      
      this.results.totalUsers = users.length;

      // Test 2: For each user, compare stored vs calculated values
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        console.log(`Testing user ${i + 1}/${users.length}: ${user.name} (${user.email})`);
        
        try {
          await this.testUserFinancialData(user);
        } catch (error) {
          console.error(`❌ Error testing user ${user.id}:`, error.message);
          this.results.systemErrors.push({
            userId: user.id,
            name: user.name,
            email: user.email,
            error: error.message
          });
        }
      }

      // Test 3: Run additional validation tests
      await this.runValidationTests();

      // Test 4: Generate comprehensive report
      this.generateReport();

    } catch (error) {
      console.error('💥 Critical error during testing:', error);
      throw error;
    } finally {
      await pool.end();
    }
  }

  async getAllUsersWithFinancialData() {
    const query = `
      SELECT u.id, u.name, u.email, u.role_id, r.name as role_name,
             sa.balance as stored_balance, 
             sa.total_spent as stored_total_spent,
             sa.last_payment_date as stored_last_payment,
             (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as transaction_count
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN student_accounts sa ON sa.user_id = u.id
      ORDER BY u.id DESC
    `;
    
    const { rows } = await pool.query(query);
    return rows;
  }

  async testUserFinancialData(user) {
    const userId = user.id;
    const storedBalance = this.parseNumber(user.stored_balance);
    const storedTotalSpent = this.parseNumber(user.stored_total_spent);
    const transactionCount = parseInt(user.transaction_count) || 0;

    // Skip users with no transactions
    if (transactionCount === 0) {
      console.log(`  ⏭️  No transactions, skipping`);
      return;
    }

    this.results.usersWithTransactions++;

    // Calculate balance using our transaction aggregation logic
    const calculated = await this.calculateUserFinancials(userId);
    
    // Compare stored vs calculated values
    const balanceDiff = Math.abs(storedBalance - calculated.balance);
    const totalSpentDiff = Math.abs(storedTotalSpent - calculated.totalSpent);

    const result = {
      userId,
      name: user.name,
      email: user.email,
      role: user.role_name,
      transactionCount,
      stored: {
        balance: storedBalance,
        totalSpent: storedTotalSpent,
        lastPayment: user.stored_last_payment
      },
      calculated: {
        balance: calculated.balance,
        totalSpent: calculated.totalSpent,
        lastPayment: calculated.lastPaymentAt
      },
      differences: {
        balance: calculated.balance - storedBalance,
        totalSpent: calculated.totalSpent - storedTotalSpent
      },
      isBalanceMatch: balanceDiff <= TOLERANCE,
      isTotalSpentMatch: totalSpentDiff <= TOLERANCE
    };

    this.results.detailedResults.push(result);

    // Log results
    if (result.isBalanceMatch && result.isTotalSpentMatch) {
      console.log(`  ✅ Perfect match - Balance: €${calculated.balance}, Total Spent: €${calculated.totalSpent}`);
      this.results.perfectMatches++;
    } else {
      console.log(`  ⚠️  Discrepancy found:`);
      if (!result.isBalanceMatch) {
        console.log(`     Balance: Stored €${storedBalance} vs Calculated €${calculated.balance} (diff: €${result.differences.balance})`);
        this.results.balanceDiscrepancies.push(result);
      }
      if (!result.isTotalSpentMatch) {
        console.log(`     Total Spent: Stored €${storedTotalSpent} vs Calculated €${calculated.totalSpent} (diff: €${result.differences.totalSpent})`);
        this.results.totalSpentDiscrepancies.push(result);
      }
    }

    // Test student portal service if user is a student
    if (user.role_name === 'student') {
      try {
        const overview = await getStudentOverview(userId);
        const portalBalance = overview.student.account.balance;
        
        if (Math.abs(portalBalance - calculated.balance) > TOLERANCE) {
          console.log(`  🚨 Student portal balance mismatch: Portal €${portalBalance} vs Expected €${calculated.balance}`);
        }
      } catch (error) {
        console.log(`  ❌ Student portal test failed: ${error.message}`);
      }
    }
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
      const effectiveDate = transaction.effective_date ? new Date(transaction.effective_date) : null;

      balance += amount;

      // Track spending and last payment using the same logic as the service
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
      balance: Math.round(balance * 100) / 100,
      totalSpent: Math.round(totalSpent * 100) / 100,
      lastPaymentAt,
      transactionCount: rows.length
    };
  }

  async runValidationTests() {
    console.log(`\n🧪 Running additional validation tests...\n`);

    // Test 1: Check for orphaned transactions
    const orphanedQuery = `
      SELECT COUNT(*) as count
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE u.id IS NULL
    `;
    const { rows: orphanedRows } = await pool.query(orphanedQuery);
    const orphanedCount = parseInt(orphanedRows[0]?.count) || 0;
    
    if (orphanedCount > 0) {
      console.log(`⚠️  Found ${orphanedCount} orphaned transactions (transactions without valid users)`);
    } else {
      console.log(`✅ No orphaned transactions found`);
    }

    // Test 2: Check for users with transactions but no student_accounts row
    const missingAccountsQuery = `
      SELECT u.id, u.name, u.email, COUNT(t.id) as transaction_count
      FROM users u
      INNER JOIN transactions t ON t.user_id = u.id
      LEFT JOIN student_accounts sa ON sa.user_id = u.id
      WHERE sa.user_id IS NULL
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(t.id) > 0
    `;
    const { rows: missingAccounts } = await pool.query(missingAccountsQuery);
    
    if (missingAccounts.length > 0) {
      console.log(`⚠️  Found ${missingAccounts.length} users with transactions but no student_accounts row:`);
      missingAccounts.forEach(user => {
        console.log(`   - ${user.name} (${user.email}): ${user.transaction_count} transactions`);
      });
    } else {
      console.log(`✅ All users with transactions have student_accounts rows`);
    }

    // Test 3: Check for extreme values that might indicate data corruption
    const extremeValuesQuery = `
      SELECT user_id, SUM(amount) as total_amount, COUNT(*) as transaction_count
      FROM transactions
      GROUP BY user_id
      HAVING ABS(SUM(amount)) > 50000 OR COUNT(*) > 1000
    `;
    const { rows: extremeValues } = await pool.query(extremeValuesQuery);
    
    if (extremeValues.length > 0) {
      console.log(`⚠️  Found ${extremeValues.length} users with extreme financial values (might need review):`);
      extremeValues.forEach(user => {
        console.log(`   - User ${user.user_id}: €${user.total_amount} total, ${user.transaction_count} transactions`);
      });
    } else {
      console.log(`✅ No extreme financial values detected`);
    }
  }

  generateReport() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 FINANCIAL RECONCILIATION TEST REPORT`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(`📈 SUMMARY STATISTICS:`);
    console.log(`   Total users tested: ${this.results.totalUsers}`);
    console.log(`   Users with transactions: ${this.results.usersWithTransactions}`);
    console.log(`   Perfect matches: ${this.results.perfectMatches}`);
    console.log(`   Balance discrepancies: ${this.results.balanceDiscrepancies.length}`);
    console.log(`   Total spent discrepancies: ${this.results.totalSpentDiscrepancies.length}`);
    console.log(`   System errors: ${this.results.systemErrors.length}`);

    const successRate = this.results.usersWithTransactions > 0 
      ? ((this.results.perfectMatches / this.results.usersWithTransactions) * 100).toFixed(2)
      : 0;
    
    console.log(`   Success rate: ${successRate}%\n`);

    if (this.results.balanceDiscrepancies.length > 0) {
      console.log(`⚠️  BALANCE DISCREPANCIES (Top 10):`);
      this.results.balanceDiscrepancies
        .sort((a, b) => Math.abs(b.differences.balance) - Math.abs(a.differences.balance))
        .slice(0, 10)
        .forEach(user => {
          console.log(`   ${user.name} (${user.email}): €${user.differences.balance} difference`);
          console.log(`     Stored: €${user.stored.balance}, Calculated: €${user.calculated.balance}`);
        });
      console.log();
    }

    if (this.results.totalSpentDiscrepancies.length > 0) {
      console.log(`⚠️  TOTAL SPENT DISCREPANCIES (Top 10):`);
      this.results.totalSpentDiscrepancies
        .sort((a, b) => Math.abs(b.differences.totalSpent) - Math.abs(a.differences.totalSpent))
        .slice(0, 10)
        .forEach(user => {
          console.log(`   ${user.name} (${user.email}): €${user.differences.totalSpent} difference`);
          console.log(`     Stored: €${user.stored.totalSpent}, Calculated: €${user.calculated.totalSpent}`);
        });
      console.log();
    }

    if (this.results.systemErrors.length > 0) {
      console.log(`❌ SYSTEM ERRORS:`);
      this.results.systemErrors.forEach(error => {
        console.log(`   ${error.name} (${error.email}): ${error.error}`);
      });
      console.log();
    }

    // Recommendations
    console.log(`💡 RECOMMENDATIONS:`);
    if (successRate < 95) {
      console.log(`   🔧 Consider running a financial data sync to fix discrepancies`);
    }
    if (this.results.balanceDiscrepancies.length > 0) {
      console.log(`   🔧 Run balance reconciliation for users with discrepancies`);
    }
    if (successRate >= 99) {
      console.log(`   ✅ Financial system is working correctly!`);
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
  }

  parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const _isQuiet = args.includes('--quiet');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const tester = new FinancialReconciliationTester();
  
  try {
    await tester.runComprehensiveTest();
  } catch (error) {
    console.error('💥 Test failed:', error);
    throw error;
  }
}

// Run if called directly
main().catch(console.error);

export { FinancialReconciliationTester };