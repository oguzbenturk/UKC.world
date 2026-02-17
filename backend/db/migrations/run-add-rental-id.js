import { pool } from '../../db.js';

async function addRentalIdToTransactions() {
  const client = await pool.connect();
  
  try {
    console.log('Adding rental_id column to transactions table...');
    
    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' AND column_name = 'rental_id'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ rental_id column already exists');
      return;
    }
    
    // Add rental_id column
    await client.query('ALTER TABLE transactions ADD COLUMN rental_id uuid');
    console.log('✅ Added rental_id column');
    
    // Add foreign key constraint
    await client.query(`
      ALTER TABLE transactions 
      ADD CONSTRAINT transactions_rental_id_fkey 
      FOREIGN KEY (rental_id) REFERENCES rentals(id)
    `);
    console.log('✅ Added foreign key constraint');
    
    // Create index
    await client.query('CREATE INDEX idx_transactions_rental ON transactions USING btree (rental_id)');
    console.log('✅ Created index');
    
    console.log('🎉 Successfully added rental_id to transactions table');
    
  } catch (error) {
    console.error('❌ Error adding rental_id to transactions:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
addRentalIdToTransactions()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
