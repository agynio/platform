import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/tailwind-preset.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  outDir: 'dist',
});
