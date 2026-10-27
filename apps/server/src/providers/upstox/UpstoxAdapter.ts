// ==============================================================================
// Upstox Official Market Data Feed V3 Adapter with Real-Time Quote Streaming
// Documentation: https://upstox.com/developer/api-documentation/
// ==============================================================================

import axios from 'axios';
import WebSocket from 'ws';
import { BrokerProvider, ConnectionStatus, NormalizedMarketTick } from '../../types/market.js';
import { IBrokerAdapter, StatusCallback, TickCallback } from '../BaseAdapter.js';
import { ListedInstrument } from '../../services/InstrumentService.js';
import { redactSecrets } from '../../security/vault.js';

export interface UpstoxCredentials {
  apiKey: string;          // Client ID / API Key
  apiSecret?: string;      // Client Secret
  redirectUri?: string;
  accessToken: string;
}

export class UpstoxAdapter implements IBrokerAdapter {
  public readonly provider: BrokerProvider = 'upstox';
  private status: ConnectionStatus = 'disconnected';
  private credentials: UpstoxCredentials | null = null;
  private ws: WebSocket | null = null;
  private tickCallbacks: TickCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 6;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribedTokens: Set<string> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;
  private quotePollingTimer: NodeJS.Timeout | null = null;
  private instrumentMetaMap: Map<string, ListedInstrument> = new Map();
  private isPollingActive = false;

  private readonly API_BASE = 'https://api.upstox.com/v2';
  private readonly V3_FEED_AUTH = 'https://api.upstox.com/v3/feed/market-data-feed/authorize';

  constructor(credentials?: UpstoxCredentials) {
    if (credentials) this.credentials = credentials;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public onTick(callback: TickCallback): void {
    this.tickCallbacks.push(callback);
  }

  public onStatusChange(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  public async connect(creds?: UpstoxCredentials): Promise<boolean> {
    if (creds) this.credentials = creds;
    if (!this.credentials || !this.credentials.accessToken) {
      this.status = 'error';
      this.notifyStatus('error', 'Upstox Access Token is required.');
      return false;
    }

    try {
      this.status = 'authenticating';
      this.notifyStatus('authenticating', 'Authorizing Upstox V3 Market Data Feed...');

      // Authorize and obtain authenticated WebSocket URI
      let wsAuthorized = false;
      try {
        const authRes = await axios.get(this.V3_FEED_AUTH, {
          headers: {
            'Authorization': `Bearer ${this.credentials.accessToken}`,
            'Accept': 'application/json',
          },
          timeout: 10000,
        });

        if (authRes.data?.status === 'success' && authRes.data?.data?.authorizedRedirectUri) {
          const wsUrl = authRes.data.data.authorizedRedirectUri;
          this.initWebSocket(wsUrl);
          wsAuthorized = true;
        }
      } catch (authErr: any) {
        console.warn('[Upstox] WebSocket authorization note:', authErr.response?.data?.message || authErr.message);
      }

      this.status = 'connected';
      this.notifyStatus('connected', 'Connected to Upstox Live Feed.');

      // Start quote polling immediately
      this.startQuotePolling();
      await this.pollQuotes();

      return true;
    } catch (error: any) {
      this.status = 'error';
      const msg = error.response?.data?.message || error.message || 'Upstox Authentication Failed';
      this.notifyStatus('error', msg);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.stopQuotePolling();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    this.notifyStatus('disconnected', 'Upstox feed disconnected.');
  }

  public async subscribe(tokens: string[]): Promise<void> {
    for (const t of tokens) {
      if (t) this.subscribedTokens.add(t);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        guid: `sub_${Date.now()}`,
        method: 'sub',
        data: {
          mode: 'full',
          instrumentKeys: Array.from(this.subscribedTokens),
        }
      };
      this.ws.send(Buffer.from(JSON.stringify(payload)));
    }

    // Trigger immediate quotes poll for newly subscribed contracts
    this.pollQuotes().catch(() => {});
  }

  public async unsubscribe(tokens: string[]): Promise<void> {
    for (const t of tokens) this.subscribedTokens.delete(t);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        guid: `unsub_${Date.now()}`,
        method: 'unsub',
        data: {
          instrumentKeys: tokens,
        }
      };
      this.ws.send(Buffer.from(JSON.stringify(payload)));
    }
  }

  public async fetchInstruments(): Promise<ListedInstrument[]> {
    const instruments: ListedInstrument[] = [
      {
        token: 'NSE_INDEX|Nifty 50',
        symbol: 'NIFTY 50',
        name: 'NIFTY',
        expiry: '',
        strike: 0,
        lotSize: 25,
        instrumentType: 'INDEX',
        exchange: 'NSE',
        tickSize: 0.05,
      }
    ];

    try {
      const url = `${this.API_BASE}/option/contract?instrument_key=${encodeURIComponent('NSE_INDEX|Nifty 50')}`;
      const res = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.credentials?.accessToken || ''}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (res.data?.data && Array.isArray(res.data.data)) {
        for (const c of res.data.data) {
          const inst: ListedInstrument = {
            token: c.instrument_key,
            symbol: c.trading_symbol,
            name: 'NIFTY',
            expiry: c.expiry,
            strike: Number(c.strike_price),
            lotSize: c.lot_size || 25,
            instrumentType: c.instrument_type as any,
            exchange: 'NFO',
            tickSize: 0.05,
          };
          instruments.push(inst);
          this.instrumentMetaMap.set(inst.token, inst);
          this.instrumentMetaMap.set(inst.symbol, inst);
          // Also map alternate key format with colon
          const colonKey = inst.token.replace('|', ':');
          this.instrumentMetaMap.set(colonKey, inst);
        }
      }
    } catch (err: any) {
      console.warn('[Upstox] Option contracts fetch warning:', err.message);
    }

    return instruments;
  }

  private isRequestInFlight = false;
  private pollIntervalMs = 2500;

  /**
   * Adaptive quote polling loop (every 2.5 seconds with exponential backoff on 429)
   * Ensures live prices stream smoothly without tripping broker rate limits.
   */
  private startQuotePolling(): void {
    this.stopQuotePolling();
    this.isPollingActive = true;
    this.scheduleNextPoll(500); // Trigger first poll soon after connection
  }

  private stopQuotePolling(): void {
    this.isPollingActive = false;
    this.isRequestInFlight = false;
    if (this.quotePollingTimer) {
      clearTimeout(this.quotePollingTimer);
      this.quotePollingTimer = null;
    }
  }

  private scheduleNextPoll(delayMs?: number): void {
    if (!this.isPollingActive) return;
    if (this.quotePollingTimer) clearTimeout(this.quotePollingTimer);
    const delay = delayMs !== undefined ? delayMs : this.pollIntervalMs;
    this.quotePollingTimer = setTimeout(async () => {
      await this.pollQuotes();
      this.scheduleNextPoll();
    }, delay);
  }

  public async fetchSpotQuote(): Promise<void> {
    await this.pollQuotes();
  }

  /**
   * Fetches real-time quotes for NIFTY 50 Spot Index and all active option contracts.
   */
  private async pollQuotes(): Promise<void> {
    if (!this.credentials?.accessToken || this.isRequestInFlight) return;
    this.isRequestInFlight = true;

    try {
      // Always include Nifty 50 Index + all currently subscribed contracts
      const allTokens = ['NSE_INDEX|Nifty 50', ...Array.from(this.subscribedTokens)];
      const batch = allTokens.slice(0, 50);
      const encodedTokens = batch.map(t => encodeURIComponent(t)).join(',');
      const url = `${this.API_BASE}/market-quote/quotes?instrument_key=${encodedTokens}`;

      const res = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 6000,
      });

      this.pollIntervalMs = 2500; // Reset to standard interval on success
      const dataMap = res.data?.data;
      if (!dataMap || typeof dataMap !== 'object') return;

      const now = new Date().toISOString();

      for (const [key, quote] of Object.entries<any>(dataMap)) {
        if (!quote) continue;

        const isIndex = key.toLowerCase().includes('nifty 50') || key.toLowerCase().includes('index');
        const meta = this.instrumentMetaMap.get(key) || this.instrumentMetaMap.get(key.replace(':', '|'));

        const ltp = Number(quote.last_price || quote.ltp || 0);
        if (ltp <= 0) continue;

        const open = Number(quote.ohlc?.open || ltp);
        const high = Number(quote.ohlc?.high || ltp);
        const low = Number(quote.ohlc?.low || ltp);
        const close = Number(quote.ohlc?.close || ltp);
        const prevClose = Number(quote.ohlc?.close || (ltp - (quote.net_change || 0)));
        const netChange = Number(quote.net_change ?? (ltp - prevClose));
        const changePercent = prevClose > 0 ? Number(((netChange / prevClose) * 100).toFixed(2)) : 0;

        const bestBid = quote.depth?.buy?.[0]?.price ? Number(quote.depth.buy[0].price) : null;
        const bestAsk = quote.depth?.sell?.[0]?.price ? Number(quote.depth.sell[0].price) : null;

        let exchangeTime = now;
        if (quote.timestamp) {
          try {
            const num = Number(quote.timestamp);
            const d = !isNaN(num) ? new Date(num) : new Date(quote.timestamp);
            if (!isNaN(d.getTime())) exchangeTime = d.toISOString();
          } catch {
            exchangeTime = now;
          }
        }

        const tick: NormalizedMarketTick = {
          provider: 'upstox',
          exchange: isIndex ? 'NSE' : 'NFO',
          instrumentKey: key,
          tradingSymbol: isIndex ? 'NIFTY 50' : (meta?.symbol || key),
          instrumentType: isIndex ? 'INDEX' : (meta?.instrumentType || (key.endsWith('CE') ? 'CE' : 'PE')),
          strike: meta?.strike,
          optionType: meta?.instrumentType as any,
          expiry: meta?.expiry,
          ltp,
          open,
          high,
          low,
          close,
          prevClose,
          priceChange: netChange,
          changePercent,
          volume: Number(quote.volume || 0),
          oi: Number(quote.oi || 0),
          bidPrice: bestBid,
          askPrice: bestAsk,
          exchangeTimestamp: exchangeTime,
          receivedTimestamp: now,
          isStale: false,
        };

        for (const cb of this.tickCallbacks) {
          try {
            cb(tick);
          } catch (e: any) {
            console.error('[Upstox] Tick callback error:', e.message);
          }
        }
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        this.pollIntervalMs = Math.min(10000, this.pollIntervalMs * 1.5);
        console.warn(`[Upstox] Rate limit (429) encountered. Backing off polling to ${this.pollIntervalMs / 1000}s.`);
      } else {
        console.warn('[Upstox Poll Error]:', err.response?.data?.message || err.message);
      }
    } finally {
      this.isRequestInFlight = false;
    }
  }

  public async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!this.credentials?.accessToken) {
      return { success: false, message: 'Upstox Access Token is missing.' };
    }
    try {
      const res = await axios.get(`${this.API_BASE}/user/profile`, {
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 8000,
      });

      return {
        success: res.data?.status === 'success',
        message: 'Upstox connection test passed successfully.',
        details: redactSecrets(res.data?.data),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'Upstox connection test failed.',
      };
    }
  }

  private initWebSocket(wsUrl: string): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this.notifyStatus('connected', 'Upstox V3 WebSocket connected.');

      if (this.subscribedTokens.size > 0) {
        this.subscribe(Array.from(this.subscribedTokens));
      }

      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30000);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleSocketMessage(data);
    });

    this.ws.on('error', (err) => {
      console.warn('[Upstox] WebSocket warning:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.isPollingActive) {
        // As long as quotes poller is running, data is uninterrupted
        this.attemptReconnect();
      }
    });
  }

  private handleSocketMessage(data: WebSocket.Data): void {
    try {
      let text = '';
      if (typeof data === 'string') text = data;
      else if (Buffer.isBuffer(data)) text = data.toString('utf8');

      if (text.startsWith('{')) {
        const parsed = JSON.parse(text);
        if (parsed.feeds) {
          const now = new Date().toISOString();
          for (const [key, feed] of Object.entries<any>(parsed.feeds)) {
            const ff = feed.ff?.marketFF || feed.sf;
            if (ff) {
              const meta = this.instrumentMetaMap.get(key);
              const isIndex = key.toLowerCase().includes('nifty 50') || key.toLowerCase().includes('index');
              const tick: NormalizedMarketTick = {
                provider: 'upstox',
                exchange: isIndex ? 'NSE' : 'NFO',
                instrumentKey: key,
                tradingSymbol: isIndex ? 'NIFTY 50' : (meta?.symbol || key),
                instrumentType: isIndex ? 'INDEX' : (meta?.instrumentType || (key.endsWith('CE') ? 'CE' : 'PE')),
                strike: meta?.strike,
                optionType: meta?.instrumentType as any,
                expiry: meta?.expiry,
                ltp: ff.ltpc?.ltp || 0,
                open: ff.marketOHLC?.ohlc?.[0]?.open || 0,
                high: ff.marketOHLC?.ohlc?.[0]?.high || 0,
                low: ff.marketOHLC?.ohlc?.[0]?.low || 0,
                close: ff.ltpc?.ltp || 0,
                volume: ff.v || 0,
                oi: ff.oi || 0,
                exchangeTimestamp: ff.ltpc?.ltt ? new Date(Number(ff.ltpc.ltt)).toISOString() : now,
                receivedTimestamp: now,
                isStale: false,
              };
              for (const cb of this.tickCallbacks) cb(tick);
            }
          }
        }
      }
    } catch {
      // Ignore binary decoding failures gracefully
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private notifyStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    for (const cb of this.statusCallbacks) cb(status, message);
  }
}
