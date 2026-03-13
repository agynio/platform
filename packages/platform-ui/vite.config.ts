import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://platform-server:3010',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_PROXY_TARGET || 'http://platform-server:3010',
        changeOrigin: true,
        ws: true,
      },
      '/llm': {
        target: process.env.VITE_PROXY_TARGET || 'http://platform-server:3010',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@agyn/ui-new': path.resolve(__dirname, '../ui-new/src'),
      // Ensure React JSX runtime resolves when importing TSX from workspace packages
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(
        __dirname,
        './node_modules/react/jsx-dev-runtime.js'
      ),
      react: path.resolve(__dirname, './node_modules/react/index.js'),
    },
  },
});
