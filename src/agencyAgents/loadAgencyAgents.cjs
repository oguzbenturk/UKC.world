const fs = require('fs');
const path = require('path');

const specializedPath = path.resolve(__dirname, '../../agency-agents/specialized');
const outPath = path.resolve(__dirname, 'agencyAgents.json');

const files = fs.readdirSync(specializedPath).filter(f => f.endsWith('.md'));

function parseFrontMatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: text };
  const fmText = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  const data = {};
  fmText.split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > -1) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      data[key] = value;
    }
  });
  return { data, body };
}

const agents = files.map(file => {
  const full = path.join(specializedPath, file);
  const content = fs.readFileSync(full, 'utf8');
  const { data, body } = parseFrontMatter(content);

  return {
    id: path.basename(file, '.md'),
    name: data.name || path.basename(file, '.md'),
    description: data.description || '',
    color: data.color || 'grey',
    emoji: data.emoji || '',
    vibe: data.vibe || '',
    body: body.trim(),
  };
});

fs.writeFileSync(outPath, JSON.stringify(agents, null, 2), 'utf8');
console.log(`Generated ${agents.length} agents at ${outPath}`);
