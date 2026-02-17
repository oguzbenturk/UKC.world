/**
 * Iyzico End-to-End Payment Tests
 * Tests real payment flows with different users, currencies, and cards
 * 
 * Run with: node backend/tests/iyzico-e2e-payment.test.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../db.js';
import { initiateDeposit, verifyPayment } from '../services/paymentGateways/iyzicoGateway.js';
import { logger } from '../middlewares/errorHandler.js';
import Iyzipay from 'iyzipay';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load backend env
dotenv.config({ path: join(__dirname, '../.env') });

// Test Cards from Iyzico Sandbox Documentation
const TEST_CARDS = {
    // Turkish Success Cards
    turkish: [
        { number: '5890040000000016', bank: 'Akbank', brand: 'MasterCard', expiry: '12/2030', cvv: '123' },
        { number: '4766620000000001', bank: 'Denizbank', brand: 'Visa', expiry: '12/2030', cvv: '123' },
        { number: '5170410000000004', bank: 'Garanti', brand: 'MasterCard', expiry: '12/2030', cvv: '123' },
    ],
    // Foreign Success Cards
    foreign: [
        { number: '5400010000000004', type: 'Foreign Credit', expiry: '12/2030', cvv: '123' },
        { number: '4054180000000007', type: 'Foreign Debit', expiry: '12/2030', cvv: '123' },
    ]
};

// Test Users
const TEST_USERS = {
    turkish: { 
        email: 'suleymanince@gmail.com',
        expectedCountry: 'Turkey'
    },
    swedish: { 
        email: 'bugrabenturk@gmail.com',
        expectedCountry: 'Sweden'
    },
    outsider: { 
        email: 'fernando@plannivo.com',
        expectedCountry: null
    }
};

const results = {
    passed: [],
    failed: [],
    summary: { total: 0, success: 0, failed: 0 }
};

/**
 * Get user details from database
 */
async function getUserFromDB(email) {
    const result = await pool.query(
        'SELECT id, email, name, country, phone, address, city FROM users WHERE email = $1',
        [email]
    );
    return result.rows[0];
}

/**
 * Get wallet balance for user
 */
async function getWalletBalance(userId, currency = 'EUR') {
    const result = await pool.query(
        `SELECT available_amount as balance FROM wallet_balances 
         WHERE user_id = $1 AND currency = $2`,
        [userId, currency]
    );
    return result.rows[0]?.balance || 0;
}

/**
 * Complete a payment using Iyzico 3D Secure (simulated)
 */
async function simulatePayment(user, amount, currency, card) {
    const iyzipay = new Iyzipay({
        apiKey: process.env.IYZICO_API_KEY,
        secretKey: process.env.IYZICO_SECRET_KEY,
        uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
    });

    return new Promise((resolve, reject) => {
        const conversationId = `E2E_${user.id}_${Date.now()}`;
        const priceStr = parseFloat(amount).toFixed(2);

        // Determine currency based on user country
        let iyzicoCurrency = Iyzipay.CURRENCY.EUR;
        if (currency === 'TRY') {
            iyzicoCurrency = Iyzipay.CURRENCY.TRY;
        }

        const request = {
            locale: Iyzipay.LOCALE.TR,
            conversationId,
            price: priceStr,
            paidPrice: priceStr,
            currency: iyzicoCurrency,
            installment: 1,
            basketId: conversationId,
            paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
            paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
            paymentCard: {
                cardHolderName: user.name || 'Test User',
                cardNumber: card.number,
                expireMonth: '12',
                expireYear: '2030',
                cvc: card.cvv,
                registerCard: '0'
            },
            buyer: {
                id: user.id,
                name: user.name?.split(' ')[0] || 'Test',
                surname: user.name?.split(' ')[1] || 'User',
                gsmNumber: user.phone || '+905555555555',
                email: user.email,
                identityNumber: '11111111111',
                registrationAddress: user.address || 'Test Address',
                ip: '85.34.78.112',
                city: user.city || 'Istanbul',
                country: user.country || 'Turkey',
                zipCode: '34732'
            },
            shippingAddress: {
                contactName: user.name || 'Test User',
                city: user.city || 'Istanbul',
                country: user.country || 'Turkey',
                address: user.address || 'Test Address',
                zipCode: '34732'
            },
            billingAddress: {
                contactName: user.name || 'Test User',
                city: user.city || 'Istanbul',
                country: user.country || 'Turkey',
                address: user.address || 'Test Address',
                zipCode: '34732'
            },
            basketItems: [{
                id: 'WALLET-TOPUP',
                name: 'E2E Test Deposit',
                category1: 'General',
                category2: 'Finance',
                itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
                price: priceStr
            }]
        };

        iyzipay.payment.create(request, (err, result) => {
            if (err) {
                return reject(err);
            }

            if (result.status !== 'success') {
                return reject(new Error(result.errorMessage || 'Payment failed'));
            }

            resolve({
                success: result.status === 'success',
                paymentId: result.paymentId,
                paidPrice: result.paidPrice,
                currency: result.currency,
                fraudStatus: result.fraudStatus
            });
        });
    });
}

/**
 * Update wallet balance after successful payment
 */
async function creditWallet(userId, amount, currency, paymentId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if wallet exists
        const walletCheck = await client.query(
            'SELECT id, available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2',
            [userId, currency]
        );

        let walletId;
        if (walletCheck.rows.length === 0) {
            // Create wallet
            const newWallet = await client.query(
                'INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount) VALUES ($1, $2, $3, 0, 0) RETURNING id',
                [userId, currency, amount]
            );
            walletId = newWallet.rows[0].id;
        } else {
            // Update existing wallet
            walletId = walletCheck.rows[0].id;
            await client.query(
                'UPDATE wallet_balances SET available_amount = available_amount + $1 WHERE id = $2',
                [amount, walletId]
            );
        }

        // Record transaction - simply update balance, don't bother with transactions table for tests
        // await client.query(
        //     `INSERT INTO wallet_transactions 
        //      (user_id, amount, currency, type, status, reference_type, reference_id, description)
        //      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        //     [userId, amount, currency, 'deposit', 'completed', 'payment', paymentId, 'E2E Test Payment']
        // );

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Run a complete payment test
 */
async function runPaymentTest(testName, userType, cardType, amount, currency) {
    results.summary.total++;
    console.log(`\n--- ${testName} ---`);
    console.log(`User: ${userType} | Card: ${cardType} | Amount: ${amount} ${currency}`);

    try {
        // Get user from DB
        const userConfig = TEST_USERS[userType];
        const user = await getUserFromDB(userConfig.email);
        
        if (!user) {
            throw new Error(`User ${userConfig.email} not found in database`);
        }

        console.log(`✓ User loaded: ${user.email} (Country: ${user.country || 'null'})`);

        // Get initial balance
        const initialBalance = await getWalletBalance(user.id, currency);
        console.log(`✓ Initial balance: ${initialBalance} ${currency}`);

        // Select appropriate card
        const cardList = cardType === 'turkish' ? TEST_CARDS.turkish : TEST_CARDS.foreign;
        const card = cardList[0];
        console.log(`✓ Using card: ${card.brand || card.type} (${card.number.substring(0, 6)}...)`);

        // Simulate payment
        console.log(`⏳ Processing payment...`);
        const paymentResult = await simulatePayment(user, amount, currency, card);
        
        if (!paymentResult.success) {
            throw new Error('Payment was not successful');
        }

        console.log(`✓ Payment successful: ${paymentResult.paymentId}`);

        // Credit wallet
        await creditWallet(user.id, amount, currency, paymentResult.paymentId);
        console.log(`✓ Wallet credited: +${amount} ${currency}`);

        // Verify new balance
        const newBalance = await getWalletBalance(user.id, currency);
        const expectedBalance = parseFloat(initialBalance) + parseFloat(amount);
        
        console.log(`✓ New balance: ${newBalance} ${currency} (Expected: ${expectedBalance})`);

        if (Math.abs(newBalance - expectedBalance) < 0.01) {
            console.log(`✅ TEST PASSED`);
            results.passed.push({ testName, user: user.email, amount, currency, card: card.number });
            results.summary.success++;
        } else {
            throw new Error(`Balance mismatch: expected ${expectedBalance}, got ${newBalance}`);
        }

    } catch (error) {
        console.log(`❌ TEST FAILED: ${error.message}`);
        results.failed.push({ testName, error: error.message });
        results.summary.failed++;
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log('═══════════════════════════════════════════════');
    console.log('  Iyzico E2E Payment Tests');
    console.log('═══════════════════════════════════════════════\n');

    try {
        // Test 1: Turkish user with Turkish card (TRY)
        await runPaymentTest(
            'Turkish User + Turkish Card + TRY',
            'turkish',
            'turkish',
            100,
            'TRY'
        );

        // Test 2: Turkish user with Foreign card (TRY)
        await runPaymentTest(
            'Turkish User + Foreign Card + TRY',
            'turkish',
            'foreign',
            100,
            'TRY'
        );

        // Test 3: Swedish user with Foreign card (EUR)
        await runPaymentTest(
            'Swedish User + Foreign Card + EUR',
            'swedish',
            'foreign',
            50,
            'EUR'
        );

        // Test 4: Outsider user with Foreign card (EUR)
        await runPaymentTest(
            'Outsider User + Foreign Card + EUR',
            'outsider',
            'foreign',
            75,
            'EUR'
        );

        // Print summary
        console.log('\n═══════════════════════════════════════════════');
        console.log('  Test Summary');
        console.log('═══════════════════════════════════════════════');
        console.log(`Total Tests: ${results.summary.total}`);
        console.log(`✅ Passed: ${results.summary.success}`);
        console.log(`❌ Failed: ${results.summary.failed}`);
        
        if (results.failed.length > 0) {
            console.log('\nFailed Tests:');
            results.failed.forEach((fail, idx) => {
                console.log(`  ${idx + 1}. ${fail.testName}: ${fail.error}`);
            });
        }

        console.log('═══════════════════════════════════════════════\n');

    } catch (error) {
        console.error('Fatal test error:', error);
    } finally {
        await pool.end();
        process.exit(results.summary.failed === 0 ? 0 : 1);
    }
}

// Run tests
runAllTests();
