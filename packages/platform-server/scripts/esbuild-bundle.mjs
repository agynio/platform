import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

const tsconfigRaw = {
  ...tsconfig,
  compilerOptions: {
    ...tsconfig.compilerOptions,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    useDefineForClassFields: false,
  },
};

const dependencyNames = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);

const external = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...dependencyNames,
]);

const entryPoint = path.join(projectRoot, 'src/index.ts');
const outFile = path.join(projectRoot, 'dist/index.js');

fs.mkdirSync(path.dirname(outFile), { recursive: true });

await build({
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: Array.from(external),
  logLevel: 'info',
  tsconfigRaw,
});
