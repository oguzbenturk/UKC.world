# Notification Queue Load Testing Baseline

## Overview
To validate the "unlimited" scaling scenario on the notification pipeline, we added a synthetic load test harness at `backend/scripts/load-test-notification-dispatcher.js`. The script floods the in-process dispatcher with simulated completion jobs and records queue wait times, runtime durations, throughput, and overall counters using the existing `notificationMetrics` module.

## Running the Test
```powershell
cd backend
node scripts/load-test-notification-dispatcher.js --jobs 12000 --concurrency 64 --perTenant 6 --tenantCount 600 --minWorkMs 1 --maxWorkMs 4
```

Key arguments:
- `--jobs`: Total notifications to enqueue (default 12,000).
- `--concurrency`: Global worker pool size to emulate.
- `--perTenant`: Per-tenant concurrency cap (mirrors production safeguards).
- `--tenantCount`: Unique tenant keys to spread the workload across.
- `--minWorkMs` / `--maxWorkMs`: Randomized per-job execution window to simulate downstream processing time.
- `--silent`: Suppress progress logs while retaining the JSON summary (optional).

The script outputs a structured JSON report capturing queue/worker peaks and latency percentiles, making it easy to diff subsequent runs.

## October 5, 2025 Baseline Results
Command executed:
```text
node scripts/load-test-notification-dispatcher.js --jobs 12000 --concurrency 64 --perTenant 6 --tenantCount 600 --minWorkMs 1 --maxWorkMs 4
```

Summary:

| Metric | Value |
| --- | --- |
| Jobs processed | 12,000 |
| Total duration | 2.95 s |
| Throughput | 4,070 notifications/sec |
| Peak queue depth | 12,000 |
| Peak active jobs | 64 |
| Wait time p50 / p95 / p99 | 1.43 s / 2.66 s / 2.76 s |
| Runtime p50 / p95 / p99 | 14.9 ms / 16.7 ms / 18.5 ms |
| Failures / drops | 0 |

Interpretation:
- With 64 concurrent workers and realistic per-tenant throttles, the dispatcher cleared 12k completion events in under 3 seconds.
- Queue wait dominates latency under extreme burst loads; the 99th percentile stayed below 2.8 seconds while jobs executed in ~17 ms.
- No retries or drops were observed, confirming headroom for continued scaling once horizontal worker counts increase.

## Follow-Up Ideas
- Repeat the run with higher concurrency (e.g., 96 workers) to measure latency improvements vs. CPU usage.
- Add a mode that pipes results directly into Prometheus PushGateway for dashboard comparisons.
- Extend the harness to call the real `bookingNotificationService` via a test database snapshot to include database overhead once fixtures are available.
