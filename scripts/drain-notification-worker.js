#!/usr/bin/env node
/* eslint-disable no-console */
import fetch from 'node-fetch';

const endpoint = process.env.NOTIFICATION_WORKER_ENDPOINT || 'http://localhost:4000';
const timeoutMs = Number.parseInt(process.env.NOTIFICATION_WORKER_DRAIN_TIMEOUT_MS || '', 10) || undefined;
const secret = process.env.NOTIFICATION_WORKER_DRAIN_SECRET || null;
const token = process.env.NOTIFICATION_WORKER_TOKEN || null;

async function main() {
  const url = `${endpoint.replace(/\/$/, '')}/api/notification-workers/drain`;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (secret) {
    headers['x-worker-drain-secret'] = secret;
  }

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ timeoutMs })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drain request failed (${res.status}): ${text}`);
  }

  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
