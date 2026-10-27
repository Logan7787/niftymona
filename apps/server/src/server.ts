// ==============================================================================
// Server Entry Point: HTTP + Persistent WebSockets
// ==============================================================================

import http from 'http';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { MarketDataService } from './services/MarketDataService.js';
import { PaperTradingService } from './paper-trading/PaperTradingService.js';

dotenv.config();

const PORT = Number(process.env.SERVER_PORT) || 4000;

async function bootstrap() {
  const paperTradingService = new PaperTradingService();
  const marketDataService = new MarketDataService(paperTradingService);

  const app = createApp(marketDataService, paperTradingService);
  const server = http.createServer(app);

  // Persistent WebSocket Server for real-time market stream
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WebSocket] Client connected from ${ip}`);
    marketDataService.registerClient(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'SET_EXPIRY' && data.expiry) {
          marketDataService.setExpiry(data.expiry);
        }
      } catch {
        // Silently ignore ping/pong or non-json frames
      }
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Client error:', err.message);
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected (${ip})`);
    });
  });

  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` NIFTY ATM ANALYZER - Market Server Running`);
    console.log(` HTTP REST API: http://localhost:${PORT}/api`);
    console.log(` WebSocket Feed: ws://localhost:${PORT}/ws`);
    console.log(` Active Feed:   ${marketDataService.getActiveProvider().toUpperCase()}`);
    console.log(` Mode:          ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
