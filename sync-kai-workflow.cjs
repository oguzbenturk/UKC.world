/**
 * Syncs kai-optimized.json to the running n8n instance via API.
 * This is a fast operation that doesn't require Docker rebuild.
 */
const fs = require('fs');
const path = require('path');

const cwd = __dirname;
const secrets = JSON.parse(fs.readFileSync(path.join(cwd, '.deploy.secrets.json'), 'utf8'));
const workflowFile = path.join(cwd, 'kai-optimized.json');

const n8nApiKey = secrets.n8nApiKey;
const N8N_BASE = 'https://n8n.plannivo.com/api/v1';
const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': n8nApiKey };

async function main() {
  if (!n8nApiKey) throw new Error('No n8nApiKey in .deploy.secrets.json');

  const { name, nodes, connections, settings, staticData } = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
  const workflow = { name, nodes, connections, settings, ...(staticData !== undefined && { staticData }) };

  // Wait up to 15s for n8n
  let n8nReady = false;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`${N8N_BASE}/workflows?limit=1`, { headers });
      if (r.ok) { n8nReady = true; break; }
    } catch (e) {}
    console.log(`n8n not ready (${i+1}/5), waiting 3s...`);
    await new Promise(r => setTimeout(r, 3000));
  }
  if (!n8nReady) throw new Error('n8n not ready');
  console.log('n8n is ready.');

  // Find workflow ID
  let workflowId = secrets.n8nWorkflowId;
  if (!workflowId) {
    const listRes = await fetch(`${N8N_BASE}/workflows`, { headers });
    const workflows = (await listRes.json()).data || [];
    const match = workflows.find(w => w.name === workflow.name && w.active);
    if (match) workflowId = match.id;
  }
  if (!workflowId) throw new Error('Could not find n8n workflow ID');
  console.log(`Workflow ID: ${workflowId}`);

  // Push updated workflow
  const putRes = await fetch(`${N8N_BASE}/workflows/${workflowId}`, {
    method: 'PUT', headers, body: JSON.stringify(workflow),
  });
  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`PUT failed: ${putRes.status} ${body}`);
  }
  console.log(`Workflow synced: ${workflowId}`);

  // Deactivate then activate to flush cached state
  await fetch(`${N8N_BASE}/workflows/${workflowId}/deactivate`, { method: 'POST', headers });
  await new Promise(r => setTimeout(r, 1000));
  const activateRes = await fetch(`${N8N_BASE}/workflows/${workflowId}/activate`, { method: 'POST', headers });
  if (activateRes.ok) {
    console.log('Workflow reactivated — Kai is ready.');
  } else {
    console.warn(`Could not reactivate: ${activateRes.status}`);
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
