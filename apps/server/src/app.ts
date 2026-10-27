// ==============================================================================
// Express Application & REST API Routing
// ==============================================================================

import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { MarketDataService } from './services/MarketDataService.js';
import { PaperTradingService } from './paper-trading/PaperTradingService.js';
import { encryptCredentials, decryptCredentials, maskString, redactSecrets, saveVaultToDisk, loadVaultFromDisk } from './security/vault.js';
import { BrokerCredentialMasked, BrokerProvider } from './types/market.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nifty-atm-jwt-secret-vault-2026';

export function createApp(
  marketDataService: MarketDataService,
  paperTradingService: PaperTradingService
): express.Express {
  const app = express();

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json());

  // Load persistent encrypted vault from disk so tokens survive server restarts
  const userVault = new Map<string, any>();
  const credentialsVault: Map<string, Map<BrokerProvider, { encrypted: string; masked: BrokerCredentialMasked }>> = loadVaultFromDisk();

  // If Upstox or Angel One credentials were saved previously, attempt automatic reconnection
  for (const [_uid, brokers] of credentialsVault.entries()) {
    if (brokers.has('upstox')) {
      try {
        const creds = decryptCredentials(brokers.get('upstox')!.encrypted);
        if (creds?.accessToken) {
          console.log('[Broker] Auto-connecting saved Upstox session from secure vault...');
          marketDataService.setProvider('upstox', creds);
          break;
        }
      } catch (err: any) {
        console.warn('[Broker] Could not auto-connect Upstox:', err.message);
      }
    }
  }

  // Helper auth middleware
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // In development mode, fallback to demo-trader if not provided
      (req as any).user = { id: 'demo-user-id', username: 'demotrader', role: 'trader' };
      return next();
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
  };

  // ----------------------------------------------------------------------------
  // AUTHENTICATION ROUTES (Supports username login when open)
  // ----------------------------------------------------------------------------
  app.post('/api/auth/login', (req, res) => {
    const schema = z.object({
      username: z.string().min(1, 'Username is required'),
      password: z.string().min(1, 'Password is required'),
      isDemo: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { username, isDemo } = parsed.data;

    // Instant demo authentication or user authentication
    const user = {
      id: isDemo ? 'demo-user-id' : `user_${username.toLowerCase()}`,
      username: username,
      full_name: isDemo ? 'Demo Quantitative Trader' : username,
      role: 'trader',
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user,
      message: isDemo ? 'Logged in as Demo Trader' : 'Successfully authenticated',
    });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ user: (req as any).user });
  });

  // ----------------------------------------------------------------------------
  // LIVE MARKET SNAPSHOT & OPTION CHAIN
  // ----------------------------------------------------------------------------
  app.get('/api/market/snapshot', (_req, res) => {
    const underlying = marketDataService.getUnderlyingSnapshot();
    res.json(underlying);
  });

  app.get('/api/market/option-chain', (req, res) => {
    const range = Number(req.query.range) || 10;
    const expiry = req.query.expiry as string;
    if (expiry) {
      marketDataService.setExpiry(expiry);
    }
    const chain = marketDataService.getOptionChainSnapshot(range);
    res.json(chain);
  });

  app.get('/api/market/indicators', (_req, res) => {
    const indicators = marketDataService.getIndicators();
    res.json(indicators || {});
  });

  app.get('/api/market/signals', (_req, res) => {
    const signal = marketDataService.getLatestSignal();
    res.json(signal || {});
  });

  // ----------------------------------------------------------------------------
  // BROKER MANAGEMENT (Secure Encrypted Vault)
  // ----------------------------------------------------------------------------
  app.get('/api/brokers/status', authMiddleware, (req, res) => {
    const userId = (req as any).user.id;
    const userCreds = credentialsVault.get(userId);

    const angelMasked: BrokerCredentialMasked = userCreds?.get('angelone')?.masked || {
      provider: 'angelone',
      clientCode: 'Not configured',
      apiKey: 'Not configured',
      status: marketDataService.getActiveProvider() === 'angelone' ? marketDataService.getConnectionStatus() : 'disconnected',
      isActive: marketDataService.getActiveProvider() === 'angelone',
    };

    const upstoxMasked: BrokerCredentialMasked = userCreds?.get('upstox')?.masked || {
      provider: 'upstox',
      clientCode: 'Not configured',
      apiKey: 'Not configured',
      status: marketDataService.getActiveProvider() === 'upstox' ? marketDataService.getConnectionStatus() : 'disconnected',
      isActive: marketDataService.getActiveProvider() === 'upstox',
    };

    res.json({
      activeProvider: marketDataService.getActiveProvider(),
      connectionStatus: marketDataService.getConnectionStatus(),
      providers: {
        angelone: angelMasked,
        upstox: upstoxMasked,
        mock: {
          provider: 'mock',
          clientCode: 'DEMO_SANDBOX',
          apiKey: 'SIMULATED_FEED',
          status: marketDataService.getActiveProvider() === 'mock' ? 'connected' : 'disconnected',
          isActive: marketDataService.getActiveProvider() === 'mock',
        }
      }
    });
  });

  app.post('/api/brokers/select', authMiddleware, async (req, res) => {
    const schema = z.object({
      provider: z.enum(['angelone', 'upstox', 'mock']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid broker provider selected' });
    }

    const { provider } = parsed.data;
    const userId = (req as any).user.id;
    let creds: any = undefined;

    if (provider === 'upstox') {
      const vaultEntry = credentialsVault.get(userId)?.get('upstox');
      if (vaultEntry) {
        try {
          creds = decryptCredentials(vaultEntry.encrypted);
        } catch {
          // malformed vault
        }
      } else if (process.env.UPSTOX_ACCESS_TOKEN) {
        creds = {
          apiKey: process.env.UPSTOX_CLIENT_ID || 'client_id',
          accessToken: process.env.UPSTOX_ACCESS_TOKEN,
        };
      }
    } else if (provider === 'angelone') {
      const vaultEntry = credentialsVault.get(userId)?.get('angelone');
      if (vaultEntry) {
        try {
          creds = decryptCredentials(vaultEntry.encrypted);
        } catch {
          // malformed vault
        }
      } else if (process.env.ANGELONE_API_KEY) {
        creds = {
          apiKey: process.env.ANGELONE_API_KEY,
          clientCode: process.env.ANGELONE_CLIENT_CODE,
          password: process.env.ANGELONE_PASSWORD,
          totp: process.env.ANGELONE_TOTP_KEY,
        };
      }
    }

    const success = await marketDataService.setProvider(provider, creds);
    res.json({
      success,
      activeProvider: provider,
      status: marketDataService.getConnectionStatus(),
      message: success 
        ? `Active market data feed switched to ${provider.toUpperCase()}`
        : `Switched to ${provider.toUpperCase()} (Connection status: ${marketDataService.getConnectionStatus()})`,
    });
  });

  app.post('/api/brokers/angelone/credentials', authMiddleware, async (req, res) => {
    const schema = z.object({
      apiKey: z.string().min(1, 'API Key is required'),
      clientCode: z.string().min(1, 'Client Code is required'),
      password: z.string().optional(),
      totp: z.string().optional(),
      jwtToken: z.string().optional(),
      feedToken: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const userId = (req as any).user.id;
    const encrypted = encryptCredentials(parsed.data);

    // Immediately connect to Angel One and switch live provider
    const connected = await marketDataService.setProvider('angelone', parsed.data);

    const masked: BrokerCredentialMasked = {
      provider: 'angelone',
      clientCode: maskString(parsed.data.clientCode, 2, 2),
      apiKey: maskString(parsed.data.apiKey, 3, 3),
      status: connected ? 'connected' : 'error',
      isActive: connected,
    };

    if (!credentialsVault.has(userId)) credentialsVault.set(userId, new Map());
    credentialsVault.get(userId)!.set('angelone', { encrypted, masked });
    saveVaultToDisk(credentialsVault);

    res.json({
      success: connected,
      message: connected 
        ? 'Connected to Angel One SmartAPI live feed!'
        : 'Angel One credentials saved, but authentication failed. Check API key, client code, password and TOTP.',
      credentials: masked,
    });
  });

  app.post('/api/brokers/upstox/credentials', authMiddleware, async (req, res) => {
    const schema = z.object({
      apiKey: z.string().optional().default('upstox_api_client'),
      apiSecret: z.string().optional(),
      accessToken: z.string().min(1, 'Access Token is required'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const userId = (req as any).user.id;
    const credsData = {
      apiKey: parsed.data.apiKey || 'upstox_api_client',
      apiSecret: parsed.data.apiSecret || '',
      accessToken: parsed.data.accessToken.trim(),
    };
    const encrypted = encryptCredentials(credsData);

    // Immediately connect to Upstox and switch live provider
    const connected = await marketDataService.setProvider('upstox', credsData);

    const masked: BrokerCredentialMasked = {
      provider: 'upstox',
      clientCode: maskString(credsData.apiKey, 3, 3),
      apiKey: maskString(credsData.apiKey, 3, 3),
      status: connected ? 'connected' : 'error',
      isActive: connected,
    };

    if (!credentialsVault.has(userId)) credentialsVault.set(userId, new Map());
    credentialsVault.get(userId)!.set('upstox', { encrypted, masked });
    saveVaultToDisk(credentialsVault);

    res.json({
      success: connected,
      message: connected 
        ? 'Connected to Upstox Live Market Feed! Live exchange ticks active.'
        : 'Upstox credentials saved, but connection failed. Please check that your access token is valid and not expired.',
      credentials: masked,
    });
  });

  app.delete('/api/brokers/:provider/credentials', authMiddleware, (req, res) => {
    const userId = (req as any).user.id;
    const provider = req.params.provider as BrokerProvider;
    credentialsVault.get(userId)?.delete(provider);
    saveVaultToDisk(credentialsVault);
    res.json({ success: true, message: `${provider} credentials removed from vault.` });
  });

  // ----------------------------------------------------------------------------
  // PAPER TRADING REST ENDPOINTS
  // ----------------------------------------------------------------------------
  app.get('/api/paper/account', authMiddleware, (req, res) => {
    const userId = (req as any).user.id;
    const account = paperTradingService.getOrCreateAccount(userId);
    res.json(account);
  });

  app.post('/api/paper/order', authMiddleware, (req, res) => {
    const schema = z.object({
      tradingSymbol: z.string(),
      instrumentKey: z.string(),
      strikePrice: z.number(),
      optionType: z.enum(['CE', 'PE']),
      expiry: z.string(),
      lotSize: z.number().int().positive(),
      numLots: z.number().int().positive(),
      action: z.enum(['BUY', 'SELL']),
      entryPrice: z.number().positive(),
      stopLoss: z.number().optional(),
      target: z.number().optional(),
      notes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const userId = (req as any).user.id;
    const result = paperTradingService.placeOrder({
      ...parsed.data,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  });

  app.post('/api/paper/close', authMiddleware, (req, res) => {
    const schema = z.object({
      positionId: z.string(),
      exitPrice: z.number().positive(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const userId = (req as any).user.id;
    const result = paperTradingService.closePosition(userId, parsed.data.positionId, parsed.data.exitPrice);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  });

  app.post('/api/paper/reset', authMiddleware, (req, res) => {
    const userId = (req as any).user.id;
    const startingCapital = req.body.startingCapital || 100000;
    const account = paperTradingService.resetAccount(userId, startingCapital);
    res.json({ success: true, message: 'Paper trading account balance reset.', account });
  });

  return app;
}
