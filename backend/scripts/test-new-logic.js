#!/usr/bin/env node

import { pool } from '../db.js';
import { computeTransactionAggregates } from '../services/studentPortalService.js';

const BUGRA_USER_ID = '00ce21b8-d345-43ac-9ae8-215e0755e15b';

async function testNewLogic() {
    console.log('🧮 TESTING NEW AGGREGATE LOGIC');
    console.log('=' .repeat(60));
    
    try {
        const result = await pool.query(`
            SELECT 
                amount,
                type,
                COALESCE(transaction_date, created_at) AS created_at
            FROM transactions 
            WHERE user_id = $1 
            ORDER BY COALESCE(transaction_date, created_at) ASC
        `, [BUGRA_USER_ID]);
        
        const transactions = result.rows.map((row) => ({
            amount: parseFloat(row.amount),
            type: row.type,
            createdAt: row.created_at
        }));
        
        console.log(`Processing ${transactions.length} transactions...\n`);
        
        // Test with new logic
        const aggregates = computeTransactionAggregates(transactions);
        
        console.log('📊 NEW LOGIC RESULTS:');
        console.log(`Balance: €${aggregates.balance}`);
        console.log(`Total Spent: €${aggregates.totalSpent}`);
        console.log(`Last Payment: ${aggregates.lastPaymentAt ? aggregates.lastPaymentAt.toISOString() : 'none'}`);
        
        // Let's manually show the calculation
        let payments = 0;
        let charges = 0;
        let refunds = 0;
        
        const PAYMENT_TYPES = new Set(['payment', 'credit']);
        const REFUND_TYPES = new Set(['package_refund', 'refund', 'booking_deleted_refund']);
        const CHARGE_TYPES = new Set([
            'package_purchase',
            'booking_charge',
            'charge',
            'debit',
            'service_payment',
            'rental_payment',
            'rental_charge',
            'booking_restore_adjustment'
        ]);
        
        transactions.forEach((transaction) => {
            const amount = transaction.amount;
            if (!Number.isFinite(amount) || amount === 0) return;

            const type = (transaction.type || '').toLowerCase();

            if (PAYMENT_TYPES.has(type) && amount > 0) {
                payments += amount;
            } else if (REFUND_TYPES.has(type) && amount > 0) {
                refunds += amount;
            } else if (amount < 0 || CHARGE_TYPES.has(type)) {
                charges += Math.abs(amount);
            }
        });
        
        console.log('\n🔍 STEP-BY-STEP CALCULATION:');
        console.log(`1. Total Payments: €${payments.toFixed(2)}`);
        console.log(`2. Total Charges: €${charges.toFixed(2)}`);
        console.log(`3. Total Refunds: €${refunds.toFixed(2)}`);
        
        const maxAllowableRefunds = Math.min(payments, refunds);
        console.log(`4. Max Allowable Refunds (min of payments, refunds): €${maxAllowableRefunds.toFixed(2)}`);
        
        const effectiveRefunds = Math.min(maxAllowableRefunds, charges);
        console.log(`5. Effective Refunds (min of max allowable, charges): €${effectiveRefunds.toFixed(2)}`);
        
        const netCharges = Math.max(0, charges - effectiveRefunds);
        console.log(`6. Net Charges (charges - effective refunds): €${netCharges.toFixed(2)}`);
        
        const balance = payments - netCharges;
        console.log(`7. Final Balance (payments - net charges): €${balance.toFixed(2)}`);
        
        console.log('\n✅ VALIDATION:');
        if (balance <= payments) {
            console.log('✅ Balance does not exceed payments');
        } else {
            console.log('❌ Balance exceeds payments - logic error!');
        }
        
        if (netCharges >= 0) {
            console.log('✅ Net charges is non-negative');
        } else {
            console.log('❌ Net charges is negative - logic error!');
        }
        
        if (balance < 0) {
            console.log('✅ Customer has negative balance - they owe money (realistic for heavy usage)');
        } else if (balance === payments) {
            console.log('⚠️ Customer balance equals payments - they have used nothing');
        } else {
            console.log('✅ Customer has positive balance - they have credit remaining');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testNewLogic().then(() => {
    console.log('\n🎯 Test completed!');
}).catch(error => {
    console.error('💥 Test failed:', error);
    throw error;
});