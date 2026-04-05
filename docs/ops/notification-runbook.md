# Notification System Runbook

_Last updated: October 5, 2025_

This runbook covers the primary failure modes for the notification pipeline and the corresponding remediation steps. The flow consists of:

1. API triggers (booking lifecycle, ratings, etc.) enqueuing jobs via `bookingNotificationService`.
2. The in-process dispatcher (`notificationDispatcher`) draining queued jobs.
3. Downstream persistence through `insertNotification` (Postgres) and delivery via real-time channels.

## Quick Triage Checklist

1. **Confirm alerts:** Check the `#alerts-notifications` Slack channel for the most recent alert payload.
2. **Review dashboards:** Open Grafana → _Notification Dispatch_ dashboard to inspect queue depth, processing throughput, and failure counters.
3. **Inspect service logs:** Tail the backend logs.
   ```powershell
   cd backend
   npm run logs:tail
   ```
4. **Check dispatcher state:** Use the worker state endpoint with Ops token.
   ```powershell
   curl -H "Authorization: Bearer $env:OPS_API_TOKEN" https://api.plannivo.com/api/notification-workers/state
   ```
5. **Assess job backlog:** Run the CLI drain script to confirm whether workers can become idle.
   ```powershell
   cd backend
   node scripts\drain-notification-worker.js --endpoint https://api.plannivo.com/api/notification-workers/drain --timeout 60000
   ```

If the drain script times out or queue depth remains elevated for >5 minutes, escalate to the detailed sections below.

## Scenario: Notification Failures

### Symptoms
- Grafana `notification_failed_total` spikes
- Slack alert mentioning repeated job failures
- `notificationDispatcher` logs show `Notification job reached max retries`

### Diagnosis Steps
1. **Sample failed job:** Search backend logs for the latest failure entry (look for `notification job failed`).
2. **Determine root cause:**
   - **Bad payload / schema:** Validate against `docs/notification-payload-contracts.md`.
   - **Downstream service error:** Reproduce API call from the job payload (e.g., content service) to verify availability.
3. **Inspect retries:** Use the Prometheus metric `notification_retry_scheduled_total` to see if jobs are retrying at elevated rates.

### Remediation
- Fix the underlying payload issue or downstream outage.
- When safe, run the drain script with `--timeout 120000` to ensure the queue clears.
- Confirm counters reset (failed jobs stop increasing) and remove the service from incident status.

## Scenario: Queue Jam / Backlog

### Symptoms
- `notification_queue_depth` remains above 1,000 for more than 5 minutes.
- Wait time percentile (p95) in Grafana jumps above 10 seconds.
- Worker drain endpoint times out.

### Diagnosis Steps
1. **Worker concurrency:** Verify `notificationDispatcher` configuration (`backend/services/notificationDispatcher.js`); ensure environment overrides (e.g., `NOTIFICATION_QUEUE_CONCURRENCY`) are loaded.
2. **Tenant hot-spot:** Use the dispatcher debug log (`service=plannivo-backend meta.retryAttempt`) to identify any tenant hogging the queue.
3. **Load test sanity check:** If in a sandbox, replay the load harness to compare throughput:
   ```powershell
   cd backend
   node scripts\load-test-notification-dispatcher.js --jobs 5000 --concurrency 64 --perTenant 6 --silent true
   ```
4. **Worker availability:** Confirm the backing process count (systemd or PM2) matches expected scaling profile.

### Remediation
- Increase worker concurrency temporarily by bumping `NOTIFICATION_QUEUE_CONCURRENCY` and redeploying with blue/green procedure (`docs/ops/notification-bluegreen.md`).
- For tenant hot-spots, apply a manual throttle by pausing upstream triggers or adjusting per-tenant limit (`NOTIFICATION_PER_TENANT_CONCURRENCY`).
- Once backlog drains (queue depth < 100, drain script succeeds), return configs to normal and note the incident.

## Scenario: Database Saturation

### Symptoms
- Postgres connections near pool limit, long-running notification queries.
- Alerts on slow insert durations or elevated `notification_db_retry_total`.
- Backend logs: `Failed to send booking notifications` with `timeout` or `connection` errors.

### Diagnosis Steps
1. **Check DB metrics:** Use pgBouncer dashboard to confirm connection usage and wait times.
2. **Log sampling:** Search for `notification_db_retry` in logs to quantify retries.
3. **Query inspection:** Run the finance/check scripts or `scripts/check-db-columns.js` to ensure migrations are current.
4. **Job replay:** Disable queue intake temporarily by setting `NOTIFICATION_QUEUE_DISABLED=true` and redeploy; then re-enable.

### Remediation
- Scale Postgres read replicas or increase pool size (`PGPOOLSIZE`) temporarily.
- Apply exponential backoff overrides via `bookingNotificationService.configureQueue({ retryDelayMs, maxRetryDelayMs })` if needed.
- For persistent load, plan indexes or schema optimization—coordinate with DB team.

## Post-Incident Review

1. Document the incident in Notion (template: _Notification Outage_).
2. Update `docs/ops/notification-load-testing.md` if new throughput numbers were observed.
3. Add automated alert rules for any new failure mode discovered.

## Reference Material
- `docs/notification-payload-contracts.md`
- `docs/ops/notification-bluegreen.md`
- `backend/scripts/load-test-notification-dispatcher.js`
- Grafana Dashboards → _Notification Dispatch_
- Slack channel `#alerts-notifications`
