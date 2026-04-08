#!/usr/bin/env node
/**
 * Syncs the local plannivo-assistant-n8n-workflow.json to the n8n instance.
 *
 * Usage:
 *   node scripts/sync-n8n-workflow.js          # update existing workflow
 *   node scripts/sync-n8n-workflow.js --create  # create new workflow (first time)
 *
 * Prerequisites:
 *   1. Generate an API key in n8n: Settings → API → Create API Key
 *   2. Add to .deploy.secrets.json:  "n8nApiKey": "your-api-key"
 *   3. Optionally add:               "n8nWorkflowId": "workflow-id"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const secrets = JSON.parse(fs.readFileSync(path.join(root, '.deploy.secrets.json'), 'utf8'));
const N8N_BASE = 'https://n8n.plannivo.com/api/v1';
const API_KEY = secrets.n8nApiKey;

if (!API_KEY) {
  console.error('❌ Missing n8nApiKey in .deploy.secrets.json');
  console.log('\nTo set up:');
  console.log('  1. Go to https://n8n.plannivo.com/settings/api');
  console.log('  2. Create an API key');
  console.log('  3. Add "n8nApiKey": "your-key" to .deploy.secrets.json');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': API_KEY,
};

const workflowFile = path.join(root, 'plannivo-assistant-n8n-workflow.json');
const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));

async function listWorkflows() {
  const res = await fetch(`${N8N_BASE}/workflows`, { headers });
  if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data;
}

async function createWorkflow() {
  const body = { ...workflow, active: false };
  const res = await fetch(`${N8N_BASE}/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`);
  const created = await res.json();
  console.log(`✅ Created workflow: ${created.id} — "${created.name}"`);

  // Save the ID for future syncs
  secrets.n8nWorkflowId = created.id;
  fs.writeFileSync(path.join(root, '.deploy.secrets.json'), JSON.stringify(secrets, null, 2));
  console.log(`   Saved n8nWorkflowId to .deploy.secrets.json`);
  return created;
}

async function updateWorkflow(id) {
  const body = { ...workflow };
  const res = await fetch(`${N8N_BASE}/workflows/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
  const updated = await res.json();
  console.log(`✅ Updated workflow: ${updated.id} — "${updated.name}"`);
  return updated;
}

async function main() {
  const isCreate = process.argv.includes('--create');

  if (isCreate) {
    await createWorkflow();
    return;
  }

  let workflowId = secrets.n8nWorkflowId;

  // Auto-find by name if no ID saved
  if (!workflowId) {
    console.log('🔍 No n8nWorkflowId saved, searching by name...');
    const workflows = await listWorkflows();
    const match = workflows.find(w => w.name === workflow.name);
    if (match) {
      workflowId = match.id;
      secrets.n8nWorkflowId = workflowId;
      fs.writeFileSync(path.join(root, '.deploy.secrets.json'), JSON.stringify(secrets, null, 2));
      console.log(`   Found: ${workflowId} — saved to .deploy.secrets.json`);
    } else {
      console.log('   Not found. Creating new workflow...');
      await createWorkflow();
      return;
    }
  }

  await updateWorkflow(workflowId);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
