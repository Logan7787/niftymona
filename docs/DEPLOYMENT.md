# Production Deployment Architecture

## 1. Hosting Strategy

- **Frontend (`apps/web`)**: Deployed to **Vercel** or **Cloudflare Pages**.
  - Static Single Page Application (SPA).
  - Fast edge CDN distribution with zero server latency.
- **Backend (`apps/server`)**: Deployed to a **Persistent Node.js Runtime** (e.g., Render, Railway, Fly.io, AWS EC2, DigitalOcean).
  - **Important**: Do not run the market-data streaming service inside serverless functions (like AWS Lambda or Vercel serverless), because broker feeds require permanent, long-lived WebSocket connections with heartbeat ping/pongs.
- **Database & Auth**: **Supabase PostgreSQL**.

---

## 2. Environment Variables Matrix

### Frontend (`apps/web` on Vercel):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_API_URL=https://nifty-api.yourdomain.com/api
VITE_WS_URL=wss://nifty-api.yourdomain.com/ws
```

### Backend (`apps/server` on Node Host):
```env
SERVER_PORT=4000
NODE_ENV=production
FRONTEND_ORIGIN=https://nifty-web.vercel.app
BROKER_ENCRYPTION_KEY=<32-byte-hex-random-key>
JWT_SECRET=<strong-random-jwt-secret>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

---

## 3. Step-by-Step Deployment

### Deploy Database:
1. Create a project at [supabase.com](https://supabase.com).
2. Go to SQL Editor and run `supabase/migrations/001_initial_schema.sql`.

### Deploy Backend:
1. Connect your repository to Render or Railway.
2. Root directory: `apps/server`.
3. Build command: `npm install && npm run build`.
4. Start command: `node dist/server.js`.
5. Configure environment variables in the host dashboard.

### Deploy Frontend:
1. Connect your repository to Vercel.
2. Root directory: `apps/web`.
3. Framework preset: `Vite`.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add `VITE_API_URL` and `VITE_WS_URL` pointing to your deployed backend.
