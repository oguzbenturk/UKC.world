#!/usr/bin/env node

/**
 * Investigation script for Buğra Bentürk's balance inconsistencies
 * This script will deep-dive into his financial data to find discrepancies
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

import { pool } from '../db.js';
import { getStudentOverview } from '../services/studentPortalService.js';

// Buğra's user ID from previous investigations
const BUGRA_USER_ID = '00ce21b8-d345-43ac-9ae8-215e0755e15b';

class BugraBalanceInvestigator {
    constructor() {
        // No need for student portal service instance
    }

    async investigateBalance() {
        console.log('🔍 Starting deep investigation of Buğra Bentürk\'s balance...\n');
        
        try {
            // Step 1: Get basic user info
            await this.getUserInfo();
            
            // Step 2: Get all transactions with detailed analysis
            await this.analyzeTransactions();
            
            // Step 3: Check student_accounts table
            await this.checkStudentAccounts();
            
            // Step 4: Check student portal service calculation
            await this.checkStudentPortalCalculation();
            
            // Step 5: Compare different calculation methods
            await this.compareCalculationMethods();
            
            // Step 6: Check for any database inconsistencies
            await this.checkDatabaseConsistencies();
            
        } catch (error) {
            console.error('❌ Investigation failed:', error.message);
            console.error(error.stack);
        }
    }

    async getUserInfo() {
        console.log('👤 USER INFORMATION');
        console.log('='.repeat(50));
        
        const userResult = await pool.query(
            'SELECT id, name, email, created_at FROM users WHERE id = $1',
            [BUGRA_USER_ID]
        );
        
        if (userResult.rows.length === 0) {
            throw new Error('User not found!');
        }
        
        const user = userResult.rows[0];
        console.log(`Name: ${user.name}`);
        console.log(`Email: ${user.email}`);
        console.log(`ID: ${user.id}`);
        console.log(`Created: ${user.created_at}`);
        console.log();
    }

    async analyzeTransactions() {
        console.log('💳 TRANSACTION ANALYSIS');
        console.log('='.repeat(50));
        
        const transactionsResult = await pool.query(`
            SELECT 
                id,
                amount,
                type,
                description,
                created_at,
                DATE(created_at) as transaction_date
            FROM transactions 
            WHERE user_id = $1 
            ORDER BY created_at ASC
        `, [BUGRA_USER_ID]);
        
        const transactions = transactionsResult.rows;
        console.log(`Total transactions: ${transactions.length}\n`);
        
        let runningBalance = 0;
        let totalPayments = 0;
        let totalCharges = 0;
        let totalRefunds = 0;
        
        const transactionsByType = {};
        const transactionsByDate = {};
        
        transactions.forEach((transaction, index) => {
            const amount = parseFloat(transaction.amount);
            runningBalance += amount;
            
            // Track by type
            if (!transactionsByType[transaction.type]) {
                transactionsByType[transaction.type] = { count: 0, total: 0 };
            }
            transactionsByType[transaction.type].count++;
            transactionsByType[transaction.type].total += amount;
            
            // Track by date
            const date = transaction.transaction_date;
            if (!transactionsByDate[date]) {
                transactionsByDate[date] = [];
            }
            transactionsByDate[date].push(transaction);
            
            // Categorize amounts
            if (amount > 0) {
                if (transaction.type.includes('payment')) {
                    totalPayments += amount;
                } else if (transaction.type.includes('refund')) {
                    totalRefunds += amount;
                }
            } else {
                totalCharges += Math.abs(amount);
            }
            
            console.log(`${index + 1}. €${amount} (${transaction.type}) - ${transaction.description} [${transaction.created_at.toISOString().split('T')[0]}] | Running: €${runningBalance.toFixed(2)}`);
        });
        
        console.log('\n📊 TRANSACTION SUMMARY:');
        console.log(`Final Balance: €${runningBalance.toFixed(2)}`);
        console.log(`Total Payments: €${totalPayments.toFixed(2)}`);
        console.log(`Total Charges: €${totalCharges.toFixed(2)}`);
        console.log(`Total Refunds: €${totalRefunds.toFixed(2)}`);
        
        console.log('\n📈 BY TRANSACTION TYPE:');
        Object.entries(transactionsByType).forEach(([type, data]) => {
            console.log(`${type}: ${data.count} transactions, €${data.total.toFixed(2)} total`);
        });
        
        console.log('\n📅 BY DATE:');
        Object.entries(transactionsByDate).forEach(([date, dayTransactions]) => {
            const dayTotal = dayTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
            console.log(`${date}: ${dayTransactions.length} transactions, €${dayTotal.toFixed(2)} net`);
        });
        
        console.log();
    }

    async checkStudentAccounts() {
        console.log('💾 STUDENT_ACCOUNTS TABLE');
        console.log('='.repeat(50));
        
        const accountResult = await pool.query(
            'SELECT * FROM student_accounts WHERE user_id = $1',
            [BUGRA_USER_ID]
        );
        
        if (accountResult.rows.length === 0) {
            console.log('❌ No student_accounts record found!');
        } else {
            const account = accountResult.rows[0];
            console.log(`Balance: €${account.balance}`);
            console.log(`Total Spent: €${account.total_spent || 'NULL'}`);
            console.log(`Last Payment Date: ${account.last_payment_date || 'NULL'}`);
            console.log(`Updated At: ${account.updated_at}`);
            console.log(`Created At: ${account.created_at}`);
        }
        console.log();
    }

    async checkStudentPortalCalculation() {
        console.log('🎯 STUDENT PORTAL SERVICE CALCULATION');
        console.log('='.repeat(50));
        
        try {
            const overviewData = await getStudentOverview(BUGRA_USER_ID);
            
            console.log('Student Overview Data:');
            console.log(`Balance: €${overviewData.profile?.balance || 'NULL'}`);
            console.log(`Total Spent: €${overviewData.profile?.total_spent || 'NULL'}`);
            console.log(`Last Payment Date: ${overviewData.profile?.last_payment_date || 'NULL'}`);
            console.log(`Package Hours: ${overviewData.profile?.package_hours || 'NULL'}`);
            console.log(`Remaining Hours: ${overviewData.profile?.remaining_hours || 'NULL'}`);
            
            if (overviewData.financialHistory && overviewData.financialHistory.length > 0) {
                console.log(`\nFinancial History Count: ${overviewData.financialHistory.length}`);
                console.log('Financial History Sample (first 5):');
                overviewData.financialHistory.slice(0, 5).forEach((item, index) => {
                    console.log(`${index + 1}. €${item.amount} - ${item.description} [${item.date || item.created_at}]`);
                });
            }
        } catch (error) {
            console.error('❌ Error getting student overview:', error.message);
        }
        console.log();
    }

    async compareCalculationMethods() {
        console.log('⚖️ CALCULATION METHOD COMPARISON');
        console.log('='.repeat(50));
        
        // Method 1: Direct transaction sum
        const directSumResult = await pool.query(
            'SELECT SUM(amount) as direct_balance FROM transactions WHERE user_id = $1',
            [BUGRA_USER_ID]
        );
        const directBalance = parseFloat(directSumResult.rows[0].direct_balance) || 0;
        
        // Method 2: Student accounts table
        const studentAccountResult = await pool.query(
            'SELECT balance FROM student_accounts WHERE user_id = $1',
            [BUGRA_USER_ID]
        );
        const studentAccountBalance = studentAccountResult.rows.length > 0 
            ? parseFloat(studentAccountResult.rows[0].balance) 
            : null;
        
        // Method 3: Manual calculation with business logic
        const paymentsResult = await pool.query(`
            SELECT SUM(amount) as total_payments 
            FROM transactions 
            WHERE user_id = $1 AND amount > 0 AND type = 'payment'
        `, [BUGRA_USER_ID]);
        
        const chargesResult = await pool.query(`
            SELECT SUM(ABS(amount)) as total_charges 
            FROM transactions 
            WHERE user_id = $1 AND amount < 0 AND (
                type LIKE '%charge%' OR 
                type LIKE '%purchase%'
            )
        `, [BUGRA_USER_ID]);
        
        const refundsResult = await pool.query(`
            SELECT SUM(amount) as total_refunds 
            FROM transactions 
            WHERE user_id = $1 AND amount > 0 AND type != 'payment'
        `, [BUGRA_USER_ID]);
        
        const totalPayments = parseFloat(paymentsResult.rows[0].total_payments) || 0;
        const totalCharges = parseFloat(chargesResult.rows[0].total_charges) || 0;
        const totalRefunds = parseFloat(refundsResult.rows[0].total_refunds) || 0;
        const manualBalance = totalPayments - totalCharges + totalRefunds;
        
        console.log('Method 1 (Direct Sum): €' + directBalance.toFixed(2));
        console.log('Method 2 (Student Accounts): €' + (studentAccountBalance?.toFixed(2) || 'NULL'));
        console.log('Method 3 (Manual Business Logic): €' + manualBalance.toFixed(2));
        console.log(`  - Payments: €${totalPayments.toFixed(2)}`);
        console.log(`  - Charges: €${totalCharges.toFixed(2)}`);
        console.log(`  - Refunds: €${totalRefunds.toFixed(2)}`);
        
        // Check for discrepancies
        const methods = [
            { name: 'Direct Sum', value: directBalance },
            { name: 'Student Accounts', value: studentAccountBalance },
            { name: 'Manual Logic', value: manualBalance }
        ].filter(m => m.value !== null);
        
        let hasDiscrepancy = false;
        for (let i = 0; i < methods.length - 1; i++) {
            for (let j = i + 1; j < methods.length; j++) {
                if (Math.abs(methods[i].value - methods[j].value) > 0.01) {
                    console.log(`\n🚨 DISCREPANCY FOUND: ${methods[i].name} (€${methods[i].value.toFixed(2)}) vs ${methods[j].name} (€${methods[j].value.toFixed(2)})`);
                    hasDiscrepancy = true;
                }
            }
        }
        
        if (!hasDiscrepancy) {
            console.log('\n✅ All calculation methods match!');
        }
        console.log();
    }

    async checkDatabaseConsistencies() {
        console.log('🔍 DATABASE CONSISTENCY CHECKS');
        console.log('='.repeat(50));
        
        // Check for orphaned transactions
        const orphanedResult = await pool.query(`
            SELECT COUNT(*) as orphaned_count 
            FROM transactions t 
            LEFT JOIN users u ON t.user_id = u.id 
            WHERE u.id IS NULL AND t.user_id = $1
        `, [BUGRA_USER_ID]);
        
        console.log(`Orphaned transactions: ${orphanedResult.rows[0].orphaned_count}`);
        
        // Check for duplicate transactions
        const duplicatesResult = await pool.query(`
            SELECT amount, type, description, created_at, COUNT(*) as duplicate_count
            FROM transactions 
            WHERE user_id = $1
            GROUP BY amount, type, description, created_at
            HAVING COUNT(*) > 1
        `, [BUGRA_USER_ID]);
        
        if (duplicatesResult.rows.length > 0) {
            console.log(`\n🚨 POTENTIAL DUPLICATES FOUND:`);
            duplicatesResult.rows.forEach(dup => {
                console.log(`€${dup.amount} (${dup.type}) - ${dup.description} [${dup.created_at.toISOString().split('T')[0]}] - Count: ${dup.duplicate_count}`);
            });
        } else {
            console.log('✅ No duplicate transactions found');
        }
        
        // Check transaction amount consistency
        const invalidAmountsResult = await pool.query(`
            SELECT id, amount, type, description 
            FROM transactions 
            WHERE user_id = $1 AND (
                amount IS NULL OR 
                amount = 0 OR
                ABS(amount) > 10000
            )
        `, [BUGRA_USER_ID]);
        
        if (invalidAmountsResult.rows.length > 0) {
            console.log(`\n🚨 SUSPICIOUS AMOUNTS FOUND:`);
            invalidAmountsResult.rows.forEach(trans => {
                console.log(`ID: ${trans.id}, Amount: €${trans.amount}, Type: ${trans.type}, Description: ${trans.description}`);
            });
        } else {
            console.log('✅ All transaction amounts look reasonable');
        }
        
        console.log();
    }
}

// Run the investigation
const investigator = new BugraBalanceInvestigator();
investigator.investigateBalance().then(() => {
    console.log('🎯 Investigation completed!');
}).catch(error => {
    console.error('💥 Investigation failed:', error);
    throw error;
});