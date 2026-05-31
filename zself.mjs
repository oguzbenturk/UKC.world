import fs from 'node:fs';
import path from 'node:path';
import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, '.deploy.secrets.json'), 'utf8'));
const psql = 'docker exec -i plannivo_db_1 psql -U plannivo -d plannivo -t -A -F"|" -P pager=off -v ON_ERROR_STOP=1';
const ZID = '51181e9d-09d8-45a1-924b-f3b82820f132';
const ssh = new NodeSSH();
await ssh.connect({ host: secrets.host, username: secrets.user, password: secrets.password, readyTimeout: 30000 });
// Simulate the EXACT earnings commission resolution from instructorFinanceService, ignoring status filter,
// to show what payroll WILL display once the lesson is completed.
const sql = `
SELECT
  'EARN' AS tag,
  substring(b.id::text,1,8) AS bid,
  b.status,
  b.payment_status,
  b.duration,
  GREATEST(COALESCE(b.final_amount, b.amount, 0),0) AS base_amount,
  (su.self_student_of_instructor_id = b.instructor_user_id) AS is_self_student,
  COALESCE(
    CASE WHEN su.self_student_of_instructor_id = b.instructor_user_id
         THEN COALESCE(idc.self_student_commission_rate, 45) END,
    isc.commission_value, icr.rate_value, idc.commission_value, 0
  ) AS resolved_rate,
  COALESCE(
    CASE WHEN su.self_student_of_instructor_id = b.instructor_user_id
         THEN 'percentage' END,
    isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
  ) AS resolved_type
FROM bookings b
LEFT JOIN users su ON su.id = b.student_user_id
LEFT JOIN services srv ON srv.id = b.service_id
LEFT JOIN instructor_service_commissions isc ON isc.instructor_id = b.instructor_user_id AND isc.service_id = b.service_id
LEFT JOIN instructor_category_rates icr ON icr.instructor_id = b.instructor_user_id
LEFT JOIN instructor_default_commissions idc ON idc.instructor_id = b.instructor_user_id
WHERE b.instructor_user_id = '${ZID}' AND b.deleted_at IS NULL;
`;
const r = await ssh.execCommand(psql, { stdin: sql });
fs.writeFileSync(path.join(__dirname, 'zself_out.txt'), 'cols: tag|bid|status|pay|dur|base|is_self|rate|type\n' + (r.stdout || '(empty)') + (r.stderr ? '\n--STDERR--\n' + r.stderr : ''));
ssh.dispose();
process.exit(r.code === 0 ? 0 : 1);
