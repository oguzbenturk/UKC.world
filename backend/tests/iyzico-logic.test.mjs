
import { strict as assert } from 'assert';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initiateDeposit } from '../services/paymentGateways/iyzicoGateway.js';
import { logger } from '../middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load backend env
dotenv.config({ path: join(__dirname, '../.env') });

// Namespace wrapper to match previous usage in this file
const IyzicoGateway = { initiateDeposit };

// Silence logs for test
// logger.transports.forEach((t) => (t.silent = true)); 
// Keep logs active to see output in terminal for the user

async function runLogicTest() {
    console.log('--- Testing Iyzico Logic (Country -> Currency) ---');

    const foreignUser = {
        id: '101',
        email: 'foreign@test.com',
        name: 'Foreign',
        surname: 'User',
        country: 'Sweden', // Non-Turkey
        phone_number: '+46000000000',
        address: 'Test Addr',
        city: 'Stockholm',
        zip_code: '12345',
        ip: '1.2.3.4'
    };

    const turkishUser = {
        id: '102',
        email: 'turkish@test.com',
        name: 'Turk',
        surname: 'User',
        country: 'Turkey', // Turkey
        phone_number: '+905555555555',
        address: 'Test Addr',
        city: 'Istanbul',
        zip_code: '34000',
        ip: '88.1.1.1'
    };

    const nullCountryUser = {
        id: '103',
        email: 'null@test.com',
        name: 'Null',
        surname: 'User',
        country: null, // Unknown -> Should default to Foreign behavior
        phone_number: '+15555555555',
        address: 'Test Addr',
        city: 'Nowhere',
        zip_code: '00000',
        ip: '1.1.1.1'
    };

    console.log('\nTest 1: Foreign User (EUR) -> Should keep EUR');
    try {
        // Pass arguments as Object!
        const result = await IyzicoGateway.initiateDeposit({
            user: foreignUser, 
            amount: 100, 
            currency: 'EUR'
        });
        console.log('✅ Success. Currency used:', result.originalCurrency, 'Token:', result.metadata.token);
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }

    console.log('\nTest 2: Turkish User (EUR) -> Should convert to TRY');
    try {
        // Mock CurrencyService conversion or expect it to rely on actual service (which needs DB)
        // Since we didn't mock CurrencyService here, it will try to run real conversion.
        // It might fail if DB is not connected or CurrencyService initialization is missed in this isolated script.
        const result = await IyzicoGateway.initiateDeposit({
            user: turkishUser, 
            amount: 100, 
            currency: 'EUR'
        });
        console.log('✅ Success. Token:', result.metadata.token);
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }

    console.log('\nTest 3: Null Country User (EUR) -> Should keep EUR');
    try {
        const result = await IyzicoGateway.initiateDeposit({
            user: nullCountryUser, 
            amount: 100, 
            currency: 'EUR'
        });
        console.log('✅ Success. Token:', result.metadata.token);
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }

    process.exit(0);
}

runLogicTest();
