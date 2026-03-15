import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Base path: '/' for local dev, '/urwort/' for GitHub Pages
  // Set via VITE_BASE_PATH env var in the Actions workflow
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
