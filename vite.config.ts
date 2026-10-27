import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/upstox': {
        target: 'https://api.upstox.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/upstox/, ''),
        headers: {
          'Origin': 'https://api.upstox.com',
        }
      },
      '/api/angelone': {
        target: 'https://apiconnect.angelone.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/angelone/, ''),
        headers: {
          'Origin': 'https://apiconnect.angelone.in',
        }
      }
    }
  }
});
