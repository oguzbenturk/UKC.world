import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// Global test timeout
jest.setTimeout(10000);

// Global setup
beforeAll(async () => {
    console.log('🧪 Setting up test environment...');
});

// Global teardown
afterAll(async () => {
    console.log('🧹 Cleaning up test environment...');
});
