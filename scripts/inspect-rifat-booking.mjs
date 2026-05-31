import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));

const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });

const BOOKING_ID = '54f7447b-8f55-4c15-aaa4-4658697fe171';
const USER_ID = '44435ecc-1809-48d1-ba4b-c355be99016b';

async function sql(q, label) {
  const cmd = `docker exec plannivo_db_1 psql -U plannivo -d plannivo -P pager=off -c "${q.replace(/"/g, '\\"')}"`;
  const r = await ssh.execCommand(cmd);
  console.log(`\n========== ${label} ==========`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('NOTICE')) console.error('[stderr]', r.stderr);
}

await sql(
  `SELECT id, date, duration, amount, discount_percent, discount_amount, final_amount, payment_status, status, custom_price, deleted_at FROM bookings WHERE id = '${BOOKING_ID}';`,
  'booking row'
);

await sql(
  `SELECT * FROM discounts WHERE entity_id = '${BOOKING_ID}' OR customer_id = '${USER_ID}';`,
  'discounts for booking/customer'
);

await sql(
  `SELECT column_name FROM information_schema.columns WHERE table_name='discounts' ORDER BY ordinal_position;`,
  'discounts columns'
);

ssh.dispose();
process.exit(0);
