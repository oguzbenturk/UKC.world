// run-sql.js
import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSqlFile(filePath) {
  try {
    console.log(`Running SQL file: ${filePath}`);
    const sql = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
    
    // Split the SQL into statements
    const statements = sql.split(';').filter(statement => statement.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
        console.log(`Executed SQL statement successfully.`);
      }
    }
    
    console.log('SQL file executed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error executing SQL file:', error);
    process.exit(1);
  }
}

// Get the SQL file path from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide an SQL file path');
  process.exit(1);
}

runSqlFile(args[0]);
