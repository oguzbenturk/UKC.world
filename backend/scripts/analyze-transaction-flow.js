#!/usr/bin/env node

import { pool } from '../db.js';

const BUGRA_USER_ID = '00ce21b8-d345-43ac-9ae8-215e0755e15b';

async function analyzeTransactionFlow() {
    console.log('🔍 DETAILED TRANSACTION FLOW ANALYSIS');
    console.log('=' .repeat(60));
    
    try {
        const result = await pool.query(`
            SELECT 
                id,
                amount,
                type,
                description,
                reference_number,
                created_at
            FROM transactions 
            WHERE user_id = $1 
            ORDER BY created_at ASC
        `, [BUGRA_USER_ID]);
        
        const transactions = result.rows;
        console.log(`Found ${transactions.length} transactions\n`);
        
        // Let's categorize using the same logic as computeTransactionAggregates
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
        
        let payments = 0;
        let charges = 0;
        let refunds = 0;
        
        console.log('📊 TRANSACTION CATEGORIZATION:');
        console.log('Type'.padEnd(25) + 'Amount'.padEnd(12) + 'Category'.padEnd(15) + 'Description');
        console.log('-'.repeat(90));
        
        transactions.forEach((tx) => {
            const amount = parseFloat(tx.amount);
            const type = (tx.type || '').toLowerCase();
            
            let category = 'OTHER';
            
            if (PAYMENT_TYPES.has(type) && amount > 0) {
                payments += amount;
                category = 'PAYMENT';
            } else if (REFUND_TYPES.has(type) && amount > 0) {
                refunds += amount;
                category = 'REFUND';
            } else if (amount < 0 || CHARGE_TYPES.has(type)) {
                charges += Math.abs(amount);
                category = 'CHARGE';
            }
            
            console.log(
                `${tx.type}`.padEnd(25) + 
                `€${amount}`.padEnd(12) + 
                `${category}`.padEnd(15) + 
                `${(tx.description || '').substring(0, 50)}`
            );
        });
        
        console.log('\n📈 AGGREGATION TOTALS:');
        console.log(`Total Payments: €${payments.toFixed(2)}`);
        console.log(`Total Charges: €${charges.toFixed(2)}`);
        console.log(`Total Refunds: €${refunds.toFixed(2)}`);
        
        console.log('\n🧮 CURRENT PORTAL LOGIC:');
        const effectiveRefunds = Math.min(refunds, charges);
        const netCharges = Math.max(0, charges - effectiveRefunds);
        const balance = payments - netCharges;
        
        console.log(`Effective Refunds (capped at charges): €${effectiveRefunds.toFixed(2)}`);
        console.log(`Net Charges (charges - effective refunds): €${netCharges.toFixed(2)}`);
        console.log(`Balance (payments - net charges): €${balance.toFixed(2)}`);
        
        console.log('\n🤔 ANALYSIS:');
        if (netCharges === 0) {
            console.log('⚠️ Net charges is 0, meaning all charges were refunded');
            console.log('   This suggests either:');
            console.log('   1. Customer got full refunds for everything they bought');
            console.log('   2. Refunds are incorrectly exceeding actual usage');
        }
        
        if (refunds > charges) {
            console.log('❌ Refunds exceed charges - this should not be possible');
            console.log(`   Excess refunds: €${(refunds - charges).toFixed(2)}`);
        }
        
        if (balance === payments) {
            console.log('⚠️ Balance equals payments, meaning totalSpent is 0');
            console.log('   This suggests customer has used nothing, which seems incorrect');
        }
        
        // Let's look at what should have been consumed
        console.log('\n📦 PACKAGE USAGE ANALYSIS:');
        const packagePurchases = transactions.filter(tx => tx.type === 'package_purchase');
        const packageRefunds = transactions.filter(tx => tx.type === 'package_refund');
        const bookingCharges = transactions.filter(tx => tx.type === 'booking_charge');
        
        console.log(`Package purchases: ${packagePurchases.length} totaling €${packagePurchases.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0).toFixed(2)}`);
        console.log(`Package refunds: ${packageRefunds.length} totaling €${packageRefunds.reduce((sum, tx) => sum + parseFloat(tx.amount), 0).toFixed(2)}`);
        console.log(`Booking charges: ${bookingCharges.length} totaling €${bookingCharges.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0).toFixed(2)}`);
        
        // Expected net consumption
        const totalPurchased = packagePurchases.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0) + 
                              bookingCharges.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);
        const totalRefunded = packageRefunds.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) +
                             transactions.filter(tx => tx.type === 'booking_deleted_refund').reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        
        const expectedNetConsumption = totalPurchased - totalRefunded;
        
        console.log(`\nExpected net consumption: €${expectedNetConsumption.toFixed(2)}`);
        console.log(`Expected balance: €${(payments - expectedNetConsumption).toFixed(2)}`);
        
        if (expectedNetConsumption > 0 && balance > (payments - expectedNetConsumption)) {
            console.log('❌ Current balance is higher than expected - refunds may be over-credited');
        }
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
    }
}

analyzeTransactionFlow().then(() => {
    console.log('\n🎯 Analysis completed!');
}).catch(error => {
    console.error('💥 Analysis failed:', error);
    throw error;
});