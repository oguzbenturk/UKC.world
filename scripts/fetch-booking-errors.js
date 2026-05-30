// Inspect the failing booking + constraint definition.
import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({
  host: secrets.host,
  username: secrets.user,
  password: secrets.password,
  readyTimeout: 30000,
});

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n========== ${label} ==========`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('NOTICE')) console.error('[stderr]', r.stderr);
}

const sql = (q, label) => run(
  `docker exec plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -c "${q.replace(/"/g, '\\"')}"`,
  label
);

await sql(
  `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'customer_packages' AND c.conname = 'check_status_valid';`,
  'check_status_valid definition'
);

await sql(
  `SELECT id, package_name, package_hours, used_hours, remaining_hours, status, customer_id FROM customer_packages WHERE id = '37ffb299-625b-44c4-8146-8e8572b498d6';`,
  'Failing customer_package current state'
);

await sql(
  `SELECT id, student_user_id, instructor_user_id, date, start_hour, duration, status, customer_package_id FROM bookings WHERE id = '35bd5841-22c5-42e6-93ee-7fa8f0aed7b1';`,
  'Failing booking current state'
);

await sql(
  `SELECT id, first_name, last_name, email FROM users WHERE id IN ('c6aa03b6-df3b-440f-a648-4e4658b7d316', (SELECT student_user_id FROM bookings WHERE id = '35bd5841-22c5-42e6-93ee-7fa8f0aed7b1'), (SELECT instructor_user_id FROM bookings WHERE id = '35bd5841-22c5-42e6-93ee-7fa8f0aed7b1'));`,
  'Customer + instructor of failing booking'
);

ssh.dispose();
process.exit(0);
