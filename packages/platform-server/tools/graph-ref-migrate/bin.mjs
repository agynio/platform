#!/usr/bin/env node
import 'tsx/esm';

const { main } = await import('./cli.ts');

const code = await main();

process.exit(code);
