#!/usr/bin/env node
// One-off: scope partial-package bookings in production that are missing wallet charges
import fs from 'fs';
import { NodeSSH } from 'node-ssh';

const secrets = JSON.parse(fs.readFileSync('.deploy.secrets.json', 'utf8'));
const ssh = new NodeSSH();

const sql = `
WITH partial_bookings AS (
  SELECT b.id, b.date, b.start_hour, b.duration, b.final_amount,
         b.customer_user_id, b.student_user_id, b.created_at,
         COALESCE(b.customer_user_id, b.student_user_id) AS billed_user_id,
         u.first_name, u.last_name, u.email
  FROM bookings b
  LEFT JOIN users u ON u.id = COALESCE(b.customer_user_id, b.student_user_id)
  WHERE b.payment_status = 'partial'
    AND b.final_amount > 0
    AND b.deleted_at IS NULL
)
SELECT pb.id AS booking_id,
       pb.date, pb.start_hour, pb.duration, pb.final_amount,
       pb.first_name, pb.last_name, pb.email,
       pb.created_at,
       (SELECT COUNT(*) FROM wallet_transactions wt
         WHERE wt.booking_id = pb.id
           AND wt.transaction_type = 'booking_charge'
           AND wt.direction = 'debit') AS charge_count,
       (SELECT COALESCE(SUM(ABS(wt.amount)),0) FROM wallet_transactions wt
         WHERE wt.booking_id = pb.id
           AND wt.transaction_type = 'booking_charge'
           AND wt.direction = 'debit') AS charged_total
FROM partial_bookings pb
ORDER BY pb.date, pb.start_hour;
`;

await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password });
const cmd = `docker exec plannivo_db_1 psql -U plannivo -d plannivo -A -F '|' -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
const r = await ssh.execCommand(cmd);
if (r.stderr) console.error('STDERR:', r.stderr);
console.log(r.stdout);
ssh.dispose();
