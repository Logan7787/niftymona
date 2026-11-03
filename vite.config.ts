import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function serverlessApiPlugin(): Plugin {
  return {
    name: 'serverless-api-plugin',
    configureServer(server) {
      const handleServerless = (endpoint: string, modulePath: string) => {
        server.middlewares.use(endpoint, async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
            res.statusCode = 200;
            return res.end();
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const handler = (await import(modulePath)).default;
                (req as any).body = body;
                (res as any).status = function(code: number) { this.statusCode = code; return this; };
                (res as any).json = function(data: any) {
                  this.setHeader('Content-Type', 'application/json');
                  this.end(JSON.stringify(data));
                  return this;
                };
                await handler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: err.message }));
              }
            });
          } else {
            res.statusCode = 405;
            res.end();
          }
        });
      };

      handleServerless('/api/generate-jwt', './api/generate-jwt.js');
      handleServerless('/api/angelone-quote', './api/angelone-quote.js');
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), serverlessApiPlugin()],
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
