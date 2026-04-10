/**
 * Converts kai-optimized.json from n8n 1.x parameter format to n8n 2.x format.
 *
 * Old format (n8n 1.x):
 *   headerParameters.parameters[{name, value}]
 *   queryParameters.parameters[{name, value: "={{ $fromAI(...) }}"}]
 *   bodyParameters.parameters[{name, value: "={{ $fromAI(...) }}"}]
 *   URL: "={{ $env.X }}/path/{{ $fromAI('id','desc','type') }}"
 *
 * New format (n8n 2.x):
 *   specifyHeaders: "keypair"
 *   parametersHeaders: {values: [{name, valueProvider: "fieldValue", value}]}
 *
 *   specifyQuery: "keypair"
 *   parametersQuery: {values: [{name, valueProvider: "modelRequired"|"modelOptional"}]}
 *   placeholderDefinitions: {values: [{name, description, type}]}
 *
 *   specifyBody: "keypair"
 *   parametersBody: {values: [{name, valueProvider: "modelRequired"|"modelOptional"}]}
 *
 *   URL: "={{ $env.X }}/path/{id}"
 *   placeholderDefinitions includes {name: "id", description: "desc", type: "type"}
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'kai-optimized.json');
const OUTPUT = path.join(__dirname, 'kai-optimized.json');
const BACKUP = path.join(__dirname, 'kai-optimized.backup.json');

// Parse $fromAI("name", "description", "type") from a value string
function parseFromAI(valueStr) {
  // Match $fromAI("name", "description", "type") — quotes may be " or '
  const match = valueStr.match(/\$fromAI\(\s*["']([^"']+)["']\s*,\s*["']([^"']*)["']\s*,\s*["']([^"']*)["']\s*\)/);
  if (!match) return null;
  return { name: match[1], description: match[2], type: match[3] };
}

// Determine if a parameter is optional based on its description
function isOptional(description) {
  const d = description.toLowerCase();
  return d.includes('(optional)') || d.startsWith('optional') || d.includes('leave empty');
}

// Convert URL path $fromAI calls to {name} placeholders
// Returns {newUrl, pathPlaceholders: [{name, description, type}]}
function convertUrlPathParams(url) {
  const pathPlaceholders = [];
  const newUrl = url.replace(/\{\{[^}]*\$fromAI\(([^)]+)\)[^}]*\}\}/g, (match, args) => {
    const parsed = parseFromAI(match);
    if (parsed) {
      pathPlaceholders.push(parsed);
      return `{${parsed.name}}`;
    }
    return match;
  });
  return { newUrl, pathPlaceholders };
}

// Convert a parameters array (old format) to new format entries + placeholders
function convertParams(paramsArray, sendIn) {
  const newValues = [];
  const newPlaceholders = [];

  for (const entry of paramsArray) {
    const { name, value } = entry;
    const fromAI = parseFromAI(value || '');

    if (fromAI) {
      // Model-fillable parameter
      const valueProvider = isOptional(fromAI.description) ? 'modelOptional' : 'modelRequired';
      newValues.push({ name: fromAI.name, valueProvider });
      newPlaceholders.push({
        name: fromAI.name,
        description: fromAI.description,
        type: fromAI.type,
      });
    } else {
      // Static parameter (n8n expression or literal)
      newValues.push({ name, valueProvider: 'fieldValue', value: value || '' });
    }
  }

  return { newValues, newPlaceholders };
}

function convertNode(node) {
  if (node.type !== '@n8n/n8n-nodes-langchain.toolHttpRequest') {
    return node;
  }

  const p = JSON.parse(JSON.stringify(node.parameters)); // deep clone
  const allPlaceholders = [];

  // 1. Convert URL path params
  if (p.url) {
    const { newUrl, pathPlaceholders } = convertUrlPathParams(p.url);
    p.url = newUrl;
    allPlaceholders.push(...pathPlaceholders);
  }

  // 2. Convert header parameters
  if (p.sendHeaders && p.headerParameters && p.headerParameters.parameters) {
    const { newValues } = convertParams(p.headerParameters.parameters, 'header');
    p.specifyHeaders = 'keypair';
    p.parametersHeaders = { values: newValues };
    delete p.headerParameters;
  }

  // 3. Convert query parameters
  if (p.sendQuery && p.queryParameters && p.queryParameters.parameters) {
    const { newValues, newPlaceholders } = convertParams(p.queryParameters.parameters, 'query');
    p.specifyQuery = 'keypair';
    p.parametersQuery = { values: newValues };
    allPlaceholders.push(...newPlaceholders);
    delete p.queryParameters;
  }

  // 4. Convert body parameters
  if (p.sendBody && p.bodyParameters && p.bodyParameters.parameters) {
    const { newValues, newPlaceholders } = convertParams(p.bodyParameters.parameters, 'body');
    p.specifyBody = 'keypair';
    p.parametersBody = { values: newValues };
    allPlaceholders.push(...newPlaceholders);
    delete p.bodyParameters;
  }

  // 5. Set placeholderDefinitions (deduplicate by name)
  if (allPlaceholders.length > 0) {
    const seen = new Set();
    const deduped = allPlaceholders.filter(ph => {
      if (seen.has(ph.name)) return false;
      seen.add(ph.name);
      return true;
    });
    p.placeholderDefinitions = { values: deduped };
  }

  return { ...node, parameters: p };
}

// Main
const workflow = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// Backup
fs.writeFileSync(BACKUP, JSON.stringify(workflow, null, 2), 'utf8');
console.log(`Backup saved to ${BACKUP}`);

let toolCount = 0;
let convertedCount = 0;

const converted = {
  ...workflow,
  nodes: workflow.nodes.map(node => {
    if (node.type === '@n8n/n8n-nodes-langchain.toolHttpRequest') {
      toolCount++;
      const newNode = convertNode(node);
      // Verify conversion happened
      const p = newNode.parameters;
      if (p.headerParameters || p.queryParameters || p.bodyParameters) {
        console.warn(`  WARNING: Node ${node.name} still has old format params!`);
      } else {
        convertedCount++;
      }
      return newNode;
    }
    return node;
  }),
};

fs.writeFileSync(OUTPUT, JSON.stringify(converted, null, 2), 'utf8');
console.log(`\nConverted ${convertedCount}/${toolCount} toolHttpRequest nodes.`);
console.log(`Output saved to ${OUTPUT}`);

// Verify no old-format props remain
const outputStr = JSON.stringify(converted);
const oldProps = ['headerParameters', 'queryParameters', 'bodyParameters'];
for (const prop of oldProps) {
  // Check if any toolHttpRequest node still has old props
  const remainingCount = converted.nodes.filter(
    n => n.type === '@n8n/n8n-nodes-langchain.toolHttpRequest' && n.parameters[prop]
  ).length;
  if (remainingCount > 0) {
    console.error(`ERROR: ${remainingCount} nodes still have ${prop}!`);
  }
}
console.log('Verification: No old-format parameters remain in toolHttpRequest nodes.');
