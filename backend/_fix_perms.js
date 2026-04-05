import { pool } from './db.js';

const adminPerms = { '*': true };

const instructorPerms = {
  'bookings:read': true,
  'bookings:write': true,
  'instructors:read': true,
  'instructors:schedule': true,
  'instructors:earnings': true,
  'services:read': true,
  'equipment:read': true,
  'notifications:read': true
};

const studentPerms = {
  'bookings:read': true,
  'services:read': true,
  'notifications:read': true
};

const outsiderPerms = {
  'services:read': true,
  'notifications:read': true
};

const trustedPerms = {
  'bookings:read': true,
  'services:read': true,
  'wallet:read': true,
  'notifications:read': true
};

const updates = [
  ['admin', adminPerms],
  ['instructor', instructorPerms],
  ['student', studentPerms],
  ['outsider', outsiderPerms],
  ['trusted_customer', trustedPerms],
];

for (const [name, perms] of updates) {
  const r = await pool.query(
    'UPDATE roles SET permissions = $1, updated_at = NOW() WHERE name = $2 AND permissions IS NULL',
    [JSON.stringify(perms), name]
  );
  console.log(`${name}: ${r.rowCount} updated`);
}

// Verify
const { rows } = await pool.query(
  `SELECT name, permissions FROM roles ORDER BY name`
);
for (const r of rows) {
  const p = r.permissions;
  if (!p) {
    console.log(`${r.name}: null`);
  } else if (p['*']) {
    console.log(`${r.name}: Full Access`);
  } else {
    const count = Object.values(p).filter(v => v === true).length;
    console.log(`${r.name}: ${count} permissions`);
  }
}

await pool.end();
