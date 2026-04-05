# Notification Worker Blue/Green Deployment Playbook

This guide outlines the zero-downtime process for rolling out new notification worker builds while an older version is still handling backlog jobs.

## Environments & Terminology

- **Blue** – currently serving production traffic (`NOTIFICATION_WORKER_COLOR=blue`).
- **Green** – next release to be promoted (`NOTIFICATION_WORKER_COLOR=green`).
- **Worker Drain Secret** – optional shared secret used to authenticate drain/resume API calls (`NOTIFICATION_WORKER_DRAIN_SECRET`).

## Prerequisites

1. **Health checks** – The standard backend health probe (`/api/health`) must return 200.
2. **Reachable metrics** – `/api/metrics/prometheus` should be scrapeable to confirm queue depth before switching.
3. **Routing control** – Ensure the load balancer (or nginx upstream) can remove the blue backend from HTTP rotation before draining.
4. **Secrets** – If using the shared secret, export `NOTIFICATION_WORKER_DRAIN_SECRET` for both the server and CLI.

## Deployment Flow

1. **Launch the green stack**
   - Deploy the new container/VM with `NOTIFICATION_WORKER_COLOR=green`.
   - Verify `GET /api/notification-workers/state` reports `color: "green"` and queue depth stays near zero.
2. **Switch traffic to green**
   - Update the load balancer (or nginx config) so that new HTTP requests reach the green backend.
   - Confirm green instance is processing notifications via Prometheus panels.
3. **Drain the blue worker**
   - Run the helper script:

     ```powershell
     node scripts/drain-notification-worker.js
     ```

     Environment variables:

     | Variable | Purpose |
     | --- | --- |
     | `NOTIFICATION_WORKER_ENDPOINT` | Base URL (e.g. `https://blue.backend.internal`) |
     | `NOTIFICATION_WORKER_DRAIN_SECRET` | Shared secret for drain API |
     | `NOTIFICATION_WORKER_TOKEN` | Optional JWT if secret is not provided |
     | `NOTIFICATION_WORKER_DRAIN_TIMEOUT_MS` | Override drain timeout (default 45s) |

   - The script calls `POST /api/notification-workers/drain` and waits for queue + active jobs to reach zero.
4. **Validate drain**
   - `GET /api/notification-workers/state` should show `lastDrainResult: "success"` and `queueDepth: 0` for the blue instance.
   - Review Grafana panel “Queue depth vs active workers” to ensure no unexpected spikes.
5. **Retire the blue stack**
   - Stop or destroy the blue container/VM once the drain completes.
   - Optionally redeploy blue as the next staging candidate.

## API Reference

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/notification-workers/state` | `GET` | Returns worker metadata, queue depth, counters, and drain history. |
| `/api/notification-workers/drain` | `POST` | Initiates an idle wait on the dispatcher. Accepts `{ timeoutMs }`. |
| `/api/notification-workers/cancel` | `POST` | Cancels an in-progress drain (for manual recovery). |

### Authentication

- If `NOTIFICATION_WORKER_DRAIN_SECRET` is set, include header `x-worker-drain-secret: <secret>`.
- Otherwise authenticate as an `admin`, `manager`, or `developer` user (standard JWT).

## Validation Checklist

- [ ] Green worker passes `/api/health` and `/api/notification-workers/state` checks.
- [ ] Traffic is routed exclusively to green before draining blue.
- [ ] Blue drain completes successfully (`lastDrainResult: success`).
- [ ] Grafana shows queue depth returning to steady state after the switchover.
- [ ] Post-cutover Slack alerts remain quiet (no failure/backlog spikes).

Following this play keeps notification delivery online while rolling out new worker versions.
