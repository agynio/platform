#!/usr/bin/env node

import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

const RELATIVE_PREFIXES = ['./', '../'];
const KNOWN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json']);

async function collectJsFiles(rootDir) {
  const result = [];

  async function walk(currentDir) {
    const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.js')) {
        result.push(absolutePath);
      }
    }
  }

  await walk(rootDir);
  return result;
}

function isRelativeSpecifier(specifier) {
  return RELATIVE_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}

function resolveSpecifier(specifier, fileDir) {
  if (!isRelativeSpecifier(specifier)) {
    return null;
  }

  if (KNOWN_EXTENSIONS.has(path.extname(specifier))) {
    return null;
  }

  const basePath = path.resolve(fileDir, specifier);
  const candidateFile = `${basePath}.js`;
  if (fs.existsSync(candidateFile)) {
    return `${specifier}.js`;
  }

  const candidateIndex = path.join(basePath, 'index.js');
  if (fs.existsSync(candidateIndex)) {
    return specifier.endsWith('/') ? `${specifier}index.js` : `${specifier}/index.js`;
  }

  return null;
}

function updateLiteral(node, fileDir) {
  if (!node || node.type !== 'StringLiteral') {
    return false;
  }

  const replacement = resolveSpecifier(node.value, fileDir);
  if (!replacement || replacement === node.value) {
    return false;
  }

  node.value = replacement;
  if (node.extra) {
    node.extra.raw = JSON.stringify(replacement);
    node.extra.rawValue = replacement;
  }

  return true;
}

async function processFile(filePath) {
  const code = await fsPromises.readFile(filePath, 'utf8');
  const fileDir = path.dirname(filePath);

  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['importMeta', 'dynamicImport']
  });

  let hasChanges = false;

  traverse(ast, {
    ImportDeclaration(pathRef) {
      if (updateLiteral(pathRef.node.source, fileDir)) {
        hasChanges = true;
      }
    },
    ExportNamedDeclaration(pathRef) {
      if (pathRef.node.source && updateLiteral(pathRef.node.source, fileDir)) {
        hasChanges = true;
      }
    },
    ExportAllDeclaration(pathRef) {
      if (pathRef.node.source && updateLiteral(pathRef.node.source, fileDir)) {
        hasChanges = true;
      }
    },
    CallExpression(pathRef) {
      if (
        pathRef.node.callee.type === 'Import' &&
        pathRef.node.arguments.length === 1 &&
        updateLiteral(pathRef.node.arguments[0], fileDir)
      ) {
        hasChanges = true;
      }
    },
    ImportExpression(pathRef) {
      if (updateLiteral(pathRef.node.source, fileDir)) {
        hasChanges = true;
      }
    }
  });

  if (!hasChanges) {
    return false;
  }

  const { code: output } = generate(ast, {
    retainLines: true,
    decoratorsBeforeExport: true
  });

  await fsPromises.writeFile(filePath, output, 'utf8');
  return true;
}

async function main() {
  const targetDir = process.argv[2];

  if (!targetDir) {
    console.error('Usage: node tools/fix-esm-extensions.mjs <dist-dir>');
    process.exit(1);
  }

  const absoluteTarget = path.resolve(process.cwd(), targetDir);

  if (!fs.existsSync(absoluteTarget)) {
    console.error(`Directory does not exist: ${absoluteTarget}`);
    process.exit(1);
  }

  const files = await collectJsFiles(absoluteTarget);

  let updatedCount = 0;
  for (const filePath of files) {
    const updated = await processFile(filePath);
    if (updated) {
      updatedCount += 1;
    }
  }

  console.log(`fix-esm-extensions: processed ${files.length} files, updated ${updatedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
