// run-sql-script.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSqlScript(filename) {
  const scriptPath = path.join(__dirname, filename);
  console.log(`Running SQL script: ${scriptPath}`);
  
  try {
    // Read the file
    const sql = fs.readFileSync(scriptPath, 'utf8');
    console.log('SQL loaded successfully');
    
    // Execute the SQL
    const client = await pool.connect();
    try {
      console.log('Running SQL...');
      const result = await client.query(sql);
      
      // If it's a SELECT query, show the results
      if (sql.trim().toLowerCase().startsWith('select')) {
        console.log('Query Results:');
        console.table(result.rows);
        console.log(`\nTotal rows: ${result.rows.length}`);
      } else {
        console.log('SQL executed successfully');
        if (result.rowCount !== undefined) {
          console.log(`Affected rows: ${result.rowCount}`);
        }
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error running SQL script:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

// Script filename from command line argument
const scriptFile = process.argv[2];
if (!scriptFile) {
  console.error('Please provide a script filename as argument');
  process.exit(1);
}

runSqlScript(scriptFile);
