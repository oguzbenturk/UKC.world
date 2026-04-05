# Notification Observability & Alerting

This guide documents how to monitor and alert on the booking notification pipeline in production.

## Prometheus Metrics

The backend now exposes Prometheus metrics at `GET /api/metrics/prometheus`. Metrics are registered under the `plannivo_` prefix.

| Name | Type | Labels | Description |
| ---- | ---- | ------ | ----------- |
| `notification_queue_depth` | Gauge | — | Current size of the dispatcher backlog. |
| `notification_active_jobs` | Gauge | — | Number of jobs executing right now. |
| `notification_jobs_total` | Counter | `result`, `job_type` | Total jobs by outcome (`queued`, `processed`, `failed`, `deduplicated`, `dropped`). |
| `notification_job_wait_duration_ms` | Histogram | `job_type` | Time spent waiting in the queue before execution. |
| `notification_job_duration_ms` | Histogram | `job_type` | Processing time (excluding queue wait). |
| `notification_job_failures_total` | Counter | `reason`, `job_type` | Permanent job failures grouped by root cause. |
| `notification_jobs_dropped_total` | Counter | `reason` | Jobs discarded before execution (capacity, invalid payload, etc.). |

> **Note**: Default runtime and resource metrics (CPU, memory, event loop lag) are also available via the `plannivo_*` prefixed samples emitted by `prom-client`.

### Scraping configuration example

```yaml
- job_name: plannivo-backend
  metrics_path: /api/metrics/prometheus
  static_configs:
    - targets:
        - backend.internal:4000
```

## Grafana Dashboard

Import `notification-dashboard.json` from this folder to get:

- Dispatcher backlog & active workers timeline.
- Job result split (processed vs failed vs dropped).
- Wait vs processing latency heatmap per job type.
- Failure rate & drop alerts overlay.

The dashboard expects the metrics above and uses the `job_type` label to break down performance by workload (booking-created, lesson-completed, instructor-rated, etc.).

## Slack Alerts

Real-time alerts are dispatched through the existing notification metrics emitter. Configure an incoming webhook and set the following environment variables on the backend service:

- `SLACK_ALERT_WEBHOOK_URL` – primary webhook URL (falls back to `SLACK_WEBHOOK_URL`).
- `NOTIFICATION_ALERT_FAILURE_THRESHOLD` (default `20`) – number of failures within a sliding window before alerting.
- `NOTIFICATION_ALERT_FAILURE_WINDOW_MS` (default `300000`) – window length in milliseconds.
- `NOTIFICATION_ALERT_BACKLOG_THRESHOLD` (default `500`) – backlog size that triggers queue alerts.
- `NOTIFICATION_ALERT_LATENCY_THRESHOLD_MS` (default `5000`) – duration or wait time threshold in milliseconds.
- `NOTIFICATION_ALERT_COOLDOWN_MS` (default `300000`) – suppress duplicate alerts within this cooldown.

Alerts shipped today:

- **Failure Spike** – fires when failures exceed the sliding-window threshold.
- **Backlog Growth** – fires when queue depth crosses the configured backlog threshold.
- **High Wait / Duration** – fires when either queue wait or processing duration breaches the latency threshold.
- **Capacity Drops** – fires when the dispatcher starts evicting jobs because the backlog is full.

Each alert includes the latest queue depth and job metadata so responders can triage quickly.

## Operations Checklist

1. **Prometheus** – Add `/api/metrics/prometheus` to the scrape config and verify samples flow in.
2. **Grafana** – Import the dashboard JSON and wire panels to the Prometheus data source.
3. **Slack** – Provide the webhook URL via environment variables; confirm a test alert via the `/api/notifications` bulk endpoint or by temporarily lowering thresholds.
4. **Runbooks** – Update incident response docs to reference the Grafana dashboard and alert payloads.

With metrics + alerts in place, we now have visibility into queue depth, latency, and failure rates for the notification pipeline.
