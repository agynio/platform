const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../apps/server/__tests__/__tests__');
if (!fs.existsSync(dir)) {
  console.log('No nested __tests__ directory found, nothing to do.');
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
const patterns = [
  [/\.\.\/services\//g, '../src/services/'],
  [/\.\.\/tools\//g, '../src/tools/'],
  [/\.\.\/templates\b/g, '../src/templates'],
  [/\.\.\/graph\//g, '../src/graph/'],
  [/\.\.\/agents\//g, '../src/agents/'],
  [/\.\.\/lgnodes\//g, '../src/lgnodes/'],
  [/\.\.\/nodes\//g, '../src/nodes/'],
  [/\.\.\/prompts\//g, '../src/prompts/'],
  [/\.\.\/types\b/g, '../src/types'],
  [/require\('\.\.\/services\//g, "require('../src/services/"],
];

for (const file of files) {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  for (const [re, rep] of patterns) {
    content = content.replace(re, rep);
  }
  fs.writeFileSync(p, content, 'utf8');
  console.log('Updated imports in', p);
}

// Move files up one level
const parent = path.resolve(dir, '..');
for (const file of files) {
  const src = path.join(dir, file);
  const dst = path.join(parent, file);
  fs.renameSync(src, dst);
  console.log('Moved', src, '->', dst);
}

// Remove nested directory if empty
const remaining = fs.readdirSync(dir);
if (remaining.length === 0) {
  fs.rmdirSync(dir);
  console.log('Removed empty', dir);
} else {
  console.log('Directory not empty after move:', dir, remaining);
}
