import { pool } from './db.js';

// 1. Get all tables with row counts
const tables = await pool.query(`
  SELECT 
    t.table_name,
    (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count,
    pg_stat_user_tables.n_live_tup as row_count
  FROM information_schema.tables t
  LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name
`);

console.log('\n=== ALL TABLES ===');
console.table(tables.rows);

// 2. Check users table columns and role breakdown
const userCols = await pool.query(`
  SELECT column_name, data_type FROM information_schema.columns 
  WHERE table_name = 'users' AND table_schema = 'public'
  AND column_name LIKE '%role%'
  ORDER BY ordinal_position
`);
console.log('\n=== USER ROLE COLUMNS ===');
console.table(userCols.rows);

const roleCol = userCols.rows[0]?.column_name || 'user_role';
const roles = await pool.query(`
  SELECT ${roleCol} as role, count(*) as count 
  FROM users 
  WHERE deleted_at IS NULL 
  GROUP BY ${roleCol}
  ORDER BY count DESC
`);
console.log('\n=== USER ROLES ===');
console.table(roles.rows);

// 3. Check admin/manager users specifically
const admins = await pool.query(`
  SELECT u.id, u.name, u.email, r.name as role, u.created_at 
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE r.name IN ('admin', 'super_admin', 'manager', 'owner') AND u.deleted_at IS NULL
  ORDER BY r.name, u.name
`);
console.log('\n=== ADMIN/MANAGER USERS ===');
console.table(admins.rows);

// 4. Check settings/config tables
const settings = await pool.query(`
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND (table_name LIKE '%setting%' OR table_name LIKE '%config%' OR table_name LIKE '%migration%' OR table_name LIKE '%currency%')
  ORDER BY table_name
`);
console.log('\n=== SETTINGS/CONFIG TABLES ===');
console.table(settings.rows);

// 5. Check foreign key dependencies on users table
const fks = await pool.query(`
  SELECT
    tc.table_name as child_table,
    kcu.column_name as fk_column,
    ccu.table_name as parent_table,
    ccu.column_name as parent_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'
  ORDER BY tc.table_name
`);
console.log('\n=== TABLES WITH FK TO USERS ===');
console.table(fks.rows);

// 6. Currency settings
try {
  const currencies = await pool.query(`SELECT * FROM currency_settings ORDER BY currency_code`);
  console.log('\n=== CURRENCY SETTINGS ===');
  console.table(currencies.rows.map(r => ({ code: r.currency_code, rate: r.exchange_rate, symbol: r.symbol })));
} catch(e) { console.log('No currency_settings table'); }

// 7. Check if there are any enum types
const enums = await pool.query(`
  SELECT t.typname as enum_name, 
         string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
  FROM pg_type t 
  JOIN pg_enum e ON t.oid = e.enumtypid  
  GROUP BY t.typname
  ORDER BY t.typname
`);
console.log('\n=== ENUM TYPES ===');
console.table(enums.rows);

process.exit(0);
