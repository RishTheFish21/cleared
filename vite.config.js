import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  // Pre-bundle Bryntum at startup. Otherwise the lazy timeline makes Vite re-bundle
  // mid-session and the page ends up with two copies of React.
  optimizeDeps: { include: ['@bryntum/scheduler', '@bryntum/scheduler-react', 'react', 'react-dom', 'react-router-dom'] },
});
