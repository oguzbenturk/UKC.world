#!/usr/bin/env node

/**
 * CRITICAL FINANCIAL LOGIC INVESTIGATION
 * 
 * The user is absolutely right: if someone paid €590 total, 
 * their balance cannot exceed €590. This indicates a fundamental 
 * error in our financial logic.
 */

import { pool } from '../db.js';
import { computeTransactionAggregates } from '../services/studentPortalService.js';

const BUGRA_USER_ID = '00ce21b8-d345-43ac-9ae8-215e0755e15b';

async function investigateFinancialLogicError() {
    console.log('🚨 CRITICAL FINANCIAL LOGIC INVESTIGATION');
    console.log('=' .repeat(60));
    console.log('If Buğra paid €590 total, his balance CANNOT exceed €590!\n');
    
    try {
        // Get all transactions with detailed analysis
        const result = await pool.query(`
            SELECT 
                id,
                amount,
                type,
                description,
                reference_number,
                created_at,
                CASE 
                    WHEN amount > 0 AND type = 'payment' THEN 'MONEY_IN'
                    WHEN amount < 0 THEN 'MONEY_OUT' 
                    WHEN amount > 0 AND type != 'payment' THEN 'REFUND'
                    ELSE 'OTHER'
                END as money_flow,
                CASE 
                    WHEN amount > 0 AND type = 'payment' THEN amount
                    ELSE 0
                END as actual_payment,
                CASE 
                    WHEN amount < 0 THEN ABS(amount)
                    ELSE 0
                END as actual_charge,
                CASE 
                    WHEN amount > 0 AND type != 'payment' THEN amount
                    ELSE 0
                END as refund_amount
            FROM transactions 
            WHERE user_id = $1 
            ORDER BY created_at ASC
        `, [BUGRA_USER_ID]);
        
        const transactions = result.rows;
        
        let totalActualPayments = 0;
        let totalCharges = 0;
        let totalRefunds = 0;
        let runningBalance = 0;
        let moneyInSystem = 0; // Track real money that entered the system
        
        console.log('📊 TRANSACTION ANALYSIS:');
        console.log('Type'.padEnd(25) + 'Amount'.padEnd(12) + 'Money Flow'.padEnd(15) + 'Running Balance'.padEnd(18) + 'Real Money In System');
        console.log('-'.repeat(90));
        
        transactions.forEach((tx) => {
            const amount = parseFloat(tx.amount);
            runningBalance += amount;
            
            if (tx.money_flow === 'MONEY_IN') {
                totalActualPayments += amount;
                moneyInSystem += amount; // Real money entered
            } else if (tx.money_flow === 'MONEY_OUT') {
                totalCharges += Math.abs(amount);
                moneyInSystem -= Math.abs(amount); // Real money left
            } else if (tx.money_flow === 'REFUND') {
                totalRefunds += amount;
                // Refunds should NOT add new money to the system!
                // They should only return previously charged money
            }
            
            console.log(
                `${tx.type}`.padEnd(25) + 
                `€${amount}`.padEnd(12) + 
                `${tx.money_flow}`.padEnd(15) + 
                `€${runningBalance.toFixed(2)}`.padEnd(18) + 
                `€${moneyInSystem.toFixed(2)}`
            );
        });
        
        console.log('\n🔍 FINANCIAL REALITY CHECK:');
        console.log(`Total Actual Payments (real money in): €${totalActualPayments.toFixed(2)}`);
        console.log(`Total Charges (money spent): €${totalCharges.toFixed(2)}`);
        console.log(`Total Refunds: €${totalRefunds.toFixed(2)}`);
        console.log(`Current Running Balance: €${runningBalance.toFixed(2)}`);
        console.log(`Real Money in System: €${moneyInSystem.toFixed(2)}`);
        
        console.log('\n🚨 LOGIC VIOLATIONS:');
        if (runningBalance > totalActualPayments) {
            console.log(`❌ IMPOSSIBLE: Balance (€${runningBalance.toFixed(2)}) > Payments (€${totalActualPayments.toFixed(2)})`);
            console.log(`   This means we created €${(runningBalance - totalActualPayments).toFixed(2)} out of thin air!`);
        }
        
        if (totalRefunds > totalCharges) {
            console.log(`❌ SUSPICIOUS: Refunds (€${totalRefunds.toFixed(2)}) > Charges (€${totalCharges.toFixed(2)})`);
            console.log(`   How can we refund more than we charged?`);
        }
        
        if (totalRefunds > totalActualPayments) {
            console.log(`❌ IMPOSSIBLE: Refunds (€${totalRefunds.toFixed(2)}) > Payments (€${totalActualPayments.toFixed(2)})`);
            console.log(`   We cannot refund more money than was actually paid!`);
        }
        
        console.log('\n💡 WHAT THE BALANCE SHOULD BE:');
        console.log(`Maximum possible balance: €${totalActualPayments.toFixed(2)} (if nothing was spent)`);
        console.log(`Logical balance (raw running balance clamped to payments): €${Math.min(runningBalance, totalActualPayments).toFixed(2)}`);

        const transactionSummary = computeTransactionAggregates(
            transactions.map((tx) => ({
                amount: parseFloat(tx.amount),
                type: tx.type,
                createdAt: tx.created_at
            }))
        );

        console.log('\n🧮 Student portal reconciliation logic:');
        console.log(`   Aggregated balance: €${transactionSummary.balance.toFixed(2)}`);
        console.log(`   Aggregated total spent: €${transactionSummary.totalSpent.toFixed(2)}`);
        if (transactionSummary.lastPaymentAt) {
            console.log(`   Last payment at: ${transactionSummary.lastPaymentAt.toISOString()}`);
        }
        if (transactionSummary.balance > totalActualPayments) {
            console.log('   ⚠️ Aggregated balance capped at total payments to avoid impossible over-credit.');
        }
        
        // Let's analyze the refund sources
        console.log('\n🔍 REFUND SOURCE ANALYSIS:');
        const refundTransactions = transactions.filter((tx) => tx.money_flow === 'REFUND');
        refundTransactions.forEach((tx) => {
          const ref = tx.referenceNumber || tx.reference_number || 'N/A';
          console.log(`€${tx.amount} - ${tx.type} - ref: ${ref} - ${tx.description}`);
        });
        
        const refundTotalsByReference = refundTransactions.reduce((acc, tx) => {
          const ref = tx.referenceNumber || tx.reference_number || tx.description || 'N/A';
          acc[ref] = (acc[ref] || 0) + parseFloat(tx.amount);
          return acc;
        }, {});
        
        console.log('\n📑 REFUND TOTALS BY REFERENCE:');
        Object.entries(refundTotalsByReference)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .forEach(([ref, total]) => {
            console.log(`${ref}: €${total.toFixed(2)}`);
          });
        
        const duplicateRefunds = refundTransactions.reduce((acc, tx) => {
          const key = `${tx.type}|${tx.description}|${tx.referenceNumber || tx.reference_number || 'N/A'}|${tx.amount}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        
        const duplicateEntries = Object.entries(duplicateRefunds).filter(([, count]) => count > 1);
        if (duplicateEntries.length) {
          console.log('\n🚨 DUPLICATE REFUND RECORDS DETECTED:');
          duplicateEntries.forEach(([key, count]) => {
            console.log(`${count}x ${key}`);
          });
        } else {
          console.log('\n✅ No exact duplicate refund records found (same type/description/reference/amount).');
        }
        
        // Check if this is a credit/package system issue
        console.log('\n🤔 POSSIBLE EXPLANATIONS:');
        console.log('1. Package/Credit System: User bought packages, used them, got refunds');
        console.log('2. Booking System: Bookings were charged, then refunded when deleted');
        console.log('3. Data Migration Issue: Incorrect historical data');
        console.log('4. Business Logic Error: Refunds creating new money instead of returning old money');
        
        // Let's check if there are packages involved
        const packageTransactions = transactions.filter(tx => tx.type.includes('package'));
        if (packageTransactions.length > 0) {
            console.log('\n📦 PACKAGE TRANSACTIONS FOUND:');
            let packagePurchases = 0;
            let packageRefunds = 0;
            
            packageTransactions.forEach(tx => {
                const amount = parseFloat(tx.amount);
                if (amount < 0) {
                    packagePurchases += Math.abs(amount);
                } else {
                    packageRefunds += amount;
                }
                console.log(`€${amount} - ${tx.type} - ${tx.description}`);
            });
            
            console.log(`\nPackage Purchases: €${packagePurchases.toFixed(2)}`);
            console.log(`Package Refunds: €${packageRefunds.toFixed(2)}`);
            
            if (packageRefunds > packagePurchases) {
                console.log(`❌ IMPOSSIBLE: Package refunds exceed package purchases!`);
            }
        }
        
    } catch (error) {
        console.error('❌ Investigation failed:', error);
    }
}

investigateFinancialLogicError().then(() => {
    console.log('\n🎯 Investigation completed!');
}).catch(error => {
    console.error('💥 Investigation failed:', error);
    throw error;
});