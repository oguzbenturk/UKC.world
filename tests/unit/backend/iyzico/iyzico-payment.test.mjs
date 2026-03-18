/**
 * Iyzico Payment Gateway Integration Tests
 * Tests all sandbox cards and validates payment flow
 * 
 * Run with: node backend/tests/iyzico-payment.test.mjs
 */

import Iyzipay from 'iyzipay';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load backend env
dotenv.config({ path: join(__dirname, '../../../../backend/.env') });

// Initialize Iyzipay
const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
});

// Test cards from Iyzico documentation
const TEST_CARDS = {
    // Successful Turkish Cards
    turkish_success: [
        { number: '5890040000000016', bank: 'Akbank', brand: 'MasterCard', type: 'Debit' },
        { number: '5526080000000006', bank: 'Akbank', brand: 'MasterCard', type: 'Credit' },
        { number: '4766620000000001', bank: 'Denizbank', brand: 'Visa', type: 'Debit' },
        { number: '4603450000000000', bank: 'Denizbank', brand: 'Visa', type: 'Credit' },
        { number: '5311570000000005', bank: 'QNB', brand: 'MasterCard', type: 'Credit' },
        { number: '5170410000000004', bank: 'Garanti', brand: 'MasterCard', type: 'Debit' },
        { number: '5400360000000003', bank: 'Garanti', brand: 'MasterCard', type: 'Credit' },
        { number: '4475050000000003', bank: 'Halkbank', brand: 'Visa', type: 'Debit' },
        { number: '5528790000000008', bank: 'Halkbank', brand: 'MasterCard', type: 'Credit' },
        { number: '4059030000000009', bank: 'HSBC', brand: 'Visa', type: 'Debit' },
        { number: '5504720000000003', bank: 'HSBC', brand: 'MasterCard', type: 'Credit' },
        { number: '5892830000000000', bank: 'İş Bankası', brand: 'MasterCard', type: 'Debit' },
        { number: '4543590000000006', bank: 'İş Bankası', brand: 'Visa', type: 'Credit' },
        { number: '4910050000000006', bank: 'Vakıfbank', brand: 'Visa', type: 'Debit' },
        { number: '4157920000000002', bank: 'Vakıfbank', brand: 'Visa', type: 'Credit' },
        { number: '5168880000000002', bank: 'Yapı Kredi', brand: 'MasterCard', type: 'Debit' },
        { number: '5451030000000000', bank: 'Yapı Kredi', brand: 'MasterCard', type: 'Credit' },
    ],
    // Foreign Cards
    foreign: [
        { number: '5400010000000004', country: 'Non-Turkish', type: 'Credit' },
        { number: '4054180000000007', country: 'Non-Turkish', type: 'Debit' },
    ],
    // Error Cards
    error: [
        { number: '5406670000000009', error: 'Cannot be cancelled/refunded' },
        { number: '4111111111111129', error: 'Not sufficient funds' },
        { number: '4129111111111111', error: 'Do not honour' },
        { number: '4128111111111112', error: 'Invalid transaction' },
        { number: '4127111111111113', error: 'Lost card' },
        { number: '4126111111111114', error: 'Stolen card' },
        { number: '4125111111111115', error: 'Expired card' },
        { number: '4124111111111116', error: 'Invalid CVV' },
        { number: '4123111111111117', error: 'Not permitted to cardholder' },
        { number: '4122111111111118', error: 'Not permitted to terminal' },
        { number: '4121111111111119', error: 'Fraud suspect' },
        { number: '4120111111111110', error: 'Pickup card' },
        { number: '4130111111111118', error: 'General error' },
    ],
};

// Test currencies
const CURRENCIES = ['TRY', 'EUR', 'USD'];

// Results storage
const results = {
    passed: [],
    failed: [],
    errors: []
};

/**
 * Create a checkout form initialization request
 */
function createCheckoutRequest(currency, amount = 100.00) {
    const conversationId = `TEST-${Date.now()}`;
    
    return {
        locale: Iyzipay.LOCALE.TR,
        conversationId,
        price: amount.toFixed(2),
        paidPrice: amount.toFixed(2),
        currency: Iyzipay.CURRENCY[currency],
        basketId: conversationId,
        paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
        callbackUrl: 'https://example.com/callback', // Dummy for testing
        enabledInstallments: [1],
        buyer: {
            id: 'TEST-USER-001',
            name: 'Test',
            surname: 'User',
            gsmNumber: '+905555555555',
            email: 'test@example.com',
            identityNumber: '11111111111',
            lastLoginDate: '2025-01-01 12:00:00',
            registrationDate: '2025-01-01 12:00:00',
            registrationAddress: 'Test Address',
            ip: '85.34.78.112',
            city: 'Istanbul',
            country: 'Turkey',
            zipCode: '34732'
        },
        shippingAddress: {
            contactName: 'Test User',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Test Address',
            zipCode: '34732'
        },
        billingAddress: {
            contactName: 'Test User',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Test Address',
            zipCode: '34732'
        },
        basketItems: [{
            id: 'TEST-ITEM',
            name: 'Test Wallet Deposit',
            category1: 'General',
            category2: 'Finance',
            itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
            price: amount.toFixed(2)
        }]
    };
}

/**
 * Test checkout form initialization with a specific currency
 */
async function testCheckoutFormInit(currency) {
    return new Promise((resolve) => {
        const request = createCheckoutRequest(currency);
        
        iyzipay.checkoutFormInitialize.create(request, (err, result) => {
            if (err) {
                resolve({ success: false, error: err.message, currency });
            } else if (result.status !== 'success') {
                resolve({ 
                    success: false, 
                    error: result.errorMessage || 'Init failed',
                    errorCode: result.errorCode,
                    currency 
                });
            } else {
                resolve({ 
                    success: true, 
                    token: result.token,
                    hasPaymentPage: !!result.paymentPageUrl,
                    hasCheckoutForm: !!result.checkoutFormContent,
                    currency
                });
            }
        });
    });
}

/**
 * Test a direct payment with a specific card (3D secure disabled for testing)
 */
async function testDirectPayment(card, currency, amount = 10.00) {
    return new Promise((resolve) => {
        const conversationId = `DIRECT-${Date.now()}`;
        
        const request = {
            locale: Iyzipay.LOCALE.TR,
            conversationId,
            price: amount.toFixed(2),
            paidPrice: amount.toFixed(2),
            currency: Iyzipay.CURRENCY[currency],
            installment: 1,
            basketId: conversationId,
            paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
            paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
            paymentCard: {
                cardHolderName: 'Test User',
                cardNumber: card.number,
                expireMonth: '12',
                expireYear: '2030',
                cvc: '123',
                registerCard: '0'
            },
            buyer: {
                id: 'TEST-USER-001',
                name: 'Test',
                surname: 'User',
                gsmNumber: '+905555555555',
                email: 'test@example.com',
                identityNumber: '11111111111',
                lastLoginDate: '2025-01-01 12:00:00',
                registrationDate: '2025-01-01 12:00:00',
                registrationAddress: 'Test Address',
                ip: '85.34.78.112',
                city: 'Istanbul',
                country: 'Turkey',
                zipCode: '34732'
            },
            shippingAddress: {
                contactName: 'Test User',
                city: 'Istanbul',
                country: 'Turkey',
                address: 'Test Address',
                zipCode: '34732'
            },
            billingAddress: {
                contactName: 'Test User',
                city: 'Istanbul',
                country: 'Turkey',
                address: 'Test Address',
                zipCode: '34732'
            },
            basketItems: [{
                id: 'TEST-ITEM',
                name: 'Test Payment',
                category1: 'General',
                itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
                price: amount.toFixed(2)
            }]
        };

        iyzipay.payment.create(request, (err, result) => {
            if (err) {
                resolve({ 
                    success: false, 
                    card: card.number.slice(-4),
                    currency,
                    error: err.message 
                });
            } else {
                resolve({
                    success: result.status === 'success',
                    card: card.number.slice(-4),
                    currency,
                    status: result.status,
                    paymentStatus: result.paymentStatus,
                    paymentId: result.paymentId,
                    paidPrice: result.paidPrice,
                    errorCode: result.errorCode,
                    errorMessage: result.errorMessage
                });
            }
        });
    });
}

/**
 * Test BIN lookup for a card
 */
async function testBinLookup(cardNumber) {
    return new Promise((resolve) => {
        iyzipay.binNumber.retrieve({
            locale: Iyzipay.LOCALE.TR,
            binNumber: cardNumber.substring(0, 6)
        }, (err, result) => {
            if (err) {
                resolve({ success: false, error: err.message });
            } else {
                resolve({
                    success: result.status === 'success',
                    cardType: result.cardType,
                    cardAssociation: result.cardAssociation,
                    cardFamily: result.cardFamily,
                    bankName: result.bankName,
                    bankCode: result.bankCode,
                    commercial: result.commercial
                });
            }
        });
    });
}

// Main test runner
async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           IYZICO PAYMENT GATEWAY TEST SUITE                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Check credentials
    if (!process.env.IYZICO_API_KEY || !process.env.IYZICO_SECRET_KEY) {
        console.error('❌ ERROR: Iyzico credentials not found in environment!');
        console.error('   Set IYZICO_API_KEY and IYZICO_SECRET_KEY in backend/.env');
        process.exit(1);
    }

    console.log('🔑 Credentials found, starting tests...\n');

    // Test 1: Checkout Form Initialization with different currencies
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Checkout Form Initialization (Currency Support)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const currency of CURRENCIES) {
        const result = await testCheckoutFormInit(currency);
        if (result.success) {
            console.log(`  ✅ ${currency}: Form initialized successfully`);
            console.log(`     Token: ${result.token?.substring(0, 20)}...`);
            results.passed.push({ test: 'checkout_init', currency });
        } else {
            console.log(`  ❌ ${currency}: ${result.error} (${result.errorCode || 'N/A'})`);
            results.failed.push({ test: 'checkout_init', currency, error: result.error });
        }
    }

    // Test 2: BIN Lookup for all cards
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: BIN Lookup (Card Type Detection)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test a few representative cards
    const sampleCards = [
        TEST_CARDS.turkish_success[0],  // Turkish
        TEST_CARDS.foreign[0],          // Foreign
    ];

    for (const card of sampleCards) {
        const result = await testBinLookup(card.number);
        if (result.success) {
            console.log(`  ✅ Card ***${card.number.slice(-4)}:`);
            console.log(`     Bank: ${result.bankName || 'N/A'}`);
            console.log(`     Type: ${result.cardType} | Brand: ${result.cardAssociation}`);
            console.log(`     Commercial: ${result.commercial ? 'Yes' : 'No'}`);
        } else {
            console.log(`  ⚠️  Card ***${card.number.slice(-4)}: BIN lookup failed - ${result.error}`);
        }
    }

    // Test 3: Direct Payment with Turkish Cards (TRY)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Direct Payment - Turkish Cards with TRY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test first 3 Turkish cards with TRY
    for (const card of TEST_CARDS.turkish_success.slice(0, 3)) {
        const result = await testDirectPayment(card, 'TRY', 10.00);
        if (result.success) {
            console.log(`  ✅ ${card.bank} (***${result.card}): SUCCESS`);
            console.log(`     Payment ID: ${result.paymentId}`);
            console.log(`     Paid: ${result.paidPrice} TRY`);
            results.passed.push({ test: 'direct_payment', card: card.bank, currency: 'TRY' });
        } else {
            console.log(`  ❌ ${card.bank} (***${result.card}): ${result.errorMessage || result.error}`);
            results.failed.push({ test: 'direct_payment', card: card.bank, currency: 'TRY', error: result.errorMessage });
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
    }

    // Test 4: Direct Payment with Turkish Cards (EUR)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Direct Payment - Turkish Cards with EUR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const card of TEST_CARDS.turkish_success.slice(0, 3)) {
        const result = await testDirectPayment(card, 'EUR', 10.00);
        if (result.success) {
            console.log(`  ✅ ${card.bank} (***${result.card}): SUCCESS`);
            console.log(`     Payment ID: ${result.paymentId}`);
            console.log(`     Paid: ${result.paidPrice} EUR`);
            results.passed.push({ test: 'direct_payment', card: card.bank, currency: 'EUR' });
        } else {
            console.log(`  ❌ ${card.bank} (***${result.card}): ${result.errorMessage || result.error}`);
            results.failed.push({ test: 'direct_payment', card: card.bank, currency: 'EUR', error: result.errorMessage });
        }
        await new Promise(r => setTimeout(r, 500));
    }

    // Test 5: Direct Payment with Foreign Cards (EUR)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Direct Payment - Foreign Cards with EUR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const card of TEST_CARDS.foreign) {
        const result = await testDirectPayment(card, 'EUR', 10.00);
        if (result.success) {
            console.log(`  ✅ Foreign ${card.type} (***${result.card}): SUCCESS`);
            console.log(`     Payment ID: ${result.paymentId}`);
            console.log(`     Paid: ${result.paidPrice} EUR`);
            results.passed.push({ test: 'direct_payment', card: 'Foreign', currency: 'EUR' });
        } else {
            console.log(`  ❌ Foreign ${card.type} (***${result.card}): ${result.errorMessage || result.error}`);
            results.failed.push({ test: 'direct_payment', card: 'Foreign', currency: 'EUR', error: result.errorMessage });
        }
        await new Promise(r => setTimeout(r, 500));
    }

    // Test 6: Direct Payment with Foreign Cards (TRY)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Direct Payment - Foreign Cards with TRY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const card of TEST_CARDS.foreign) {
        const result = await testDirectPayment(card, 'TRY', 100.00);
        if (result.success) {
            console.log(`  ✅ Foreign ${card.type} (***${result.card}): SUCCESS`);
            console.log(`     Payment ID: ${result.paymentId}`);
            console.log(`     Paid: ${result.paidPrice} TRY`);
            results.passed.push({ test: 'direct_payment', card: 'Foreign', currency: 'TRY' });
        } else {
            console.log(`  ❌ Foreign ${card.type} (***${result.card}): ${result.errorMessage || result.error}`);
            results.failed.push({ test: 'direct_payment', card: 'Foreign', currency: 'TRY', error: result.errorMessage });
        }
        await new Promise(r => setTimeout(r, 500));
    }

    // Test 7: Error Cards (should fail)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: Error Cards (Expected Failures)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const card of TEST_CARDS.error.slice(0, 5)) {
        const result = await testDirectPayment(card, 'TRY', 10.00);
        if (!result.success) {
            console.log(`  ✅ ***${result.card}: Correctly failed - ${card.error}`);
            console.log(`     Error: ${result.errorMessage}`);
            results.passed.push({ test: 'error_card', expected: card.error });
        } else {
            console.log(`  ⚠️  ***${result.card}: Unexpectedly succeeded (expected: ${card.error})`);
            results.errors.push({ test: 'error_card', expected: card.error, got: 'success' });
        }
        await new Promise(r => setTimeout(r, 500));
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST SUMMARY                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`  ✅ Passed:  ${results.passed.length}`);
    console.log(`  ❌ Failed:  ${results.failed.length}`);
    console.log(`  ⚠️  Errors:  ${results.errors.length}`);
    
    if (results.failed.length > 0) {
        console.log('\n  Failed Tests:');
        results.failed.forEach(f => {
            console.log(`    - ${f.test}: ${f.card || f.currency} - ${f.error}`);
        });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('RECOMMENDATIONS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Analyze results and provide recommendations
    const trySuccess = results.passed.filter(p => p.currency === 'TRY').length;
    const eurSuccess = results.passed.filter(p => p.currency === 'EUR').length;
    
    if (trySuccess > eurSuccess) {
        console.log('  💡 TRY currency has better success rate for this merchant account.');
        console.log('     Consider using TRY as default and converting on callback.');
    } else if (eurSuccess > trySuccess) {
        console.log('  💡 EUR currency works well! Foreign cards will work directly.');
    }
    
    console.log('\n  📝 For production:');
    console.log('     1. Test with real sandbox credentials from your Iyzico panel');
    console.log('     2. Verify merchant account currency settings');
    console.log('     3. Consider implementing currency detection based on BIN');
    console.log('\n');
}

// Run the tests
runTests().catch(console.error);
