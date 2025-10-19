import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build in library mode; entry is src/index.ts
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ObsUi',
      formats: ['es'],
      // Ensure output filename matches exports (dist/index.js)
      fileName: 'index'
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-router-dom', '@agyn/ui']
    },
    // Keep type declarations emitted by tsc (do not wipe dist)
    emptyOutDir: false
  },
  server: {
    port: 5175,
    host: '0.0.0.0'
  }
});
