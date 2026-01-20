import { pool } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Read and execute the services schema file
    const servicesSchemaPath = path.join(__dirname, 'db', 'schemas', 'services-schema.sql');
    const servicesSchema = fs.readFileSync(servicesSchemaPath, 'utf8');
    await client.query(servicesSchema);
    
    // Read and execute the financial tables schema file
    const financialTablesSchemaPath = path.join(__dirname, 'db', 'schemas', 'financial-tables.sql');
    const financialTablesSchema = fs.readFileSync(financialTablesSchemaPath, 'utf8');
    await client.query(financialTablesSchema);
    
    // Read and execute the enhanced schema file
    const enhancedSchemaPath = path.join(__dirname, 'db', 'schemas', 'enhanced-schema.sql');
    const enhancedSchema = fs.readFileSync(enhancedSchemaPath, 'utf8');
    await client.query(enhancedSchema);
      // Read and execute the consolidated schema file
    const consolidatedSchemaPath = path.join(__dirname, 'db', 'schemas', 'consolidated-schema.sql');
    const consolidatedSchema = fs.readFileSync(consolidatedSchemaPath, 'utf8');
    await client.query(consolidatedSchema);
      // The schema files now handle creating tables and inserting test data
    console.log('Applied all schemas');
    
    await client.query('COMMIT');
    console.log('Database initialized successfully with mock data!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

initializeDatabase().catch(console.error);
