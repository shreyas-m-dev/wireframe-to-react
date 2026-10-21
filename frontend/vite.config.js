import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import previewFramePlugin from './preview/vite-plugin-preview-frame.js';

export default defineConfig({
  plugins: [react(), previewFramePlugin()],
  envDir: '..', // read VITE_* from the repo-root .env; only VITE_-prefixed values reach the bundle
  server: {
    port: 5173,
    host: 'localhost',
    // Same-origin API in development: no CORS, and the app CSP can stay 'self'.
    proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3000', changeOrigin: false } },
  },
  build: { sourcemap: false, target: 'es2020' },
});
