import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
try {
  dotenv.config({ path: path.join(__dirname, '../../backend', '.env.test') });
} catch (e) {
  // .env.test might not exist - that's okay
}

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.EMAIL_TRANSPORT = process.env.EMAIL_TRANSPORT || 'stream';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
