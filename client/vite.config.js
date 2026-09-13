import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend runs on 5173 and forwards every /api call to the Express
// backend on 4000, so the browser only ever talks to one origin in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
