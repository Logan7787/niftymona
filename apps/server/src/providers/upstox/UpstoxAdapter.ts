// ==============================================================================
// Upstox Official Market Data Feed V3 Adapter
// Documentation: https://upstox.com/developer/api-documentation/
// ==============================================================================

import axios from 'axios';
import WebSocket from 'ws';
import { BrokerProvider, ConnectionStatus, NormalizedMarketTick } from '../../types/market.js';
import { IBrokerAdapter, StatusCallback, TickCallback } from '../BaseAdapter.js';
import { ListedInstrument } from '../../services/InstrumentService.js';
import { redactSecrets } from '../../security/vault.js';

export interface UpstoxCredentials {
  apiKey: string;          // Client ID
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
        await this.fetchSpotQuote();
        return true;
      } else {
        throw new Error(authRes.data?.message || 'Failed to authorize Upstox V3 feed.');
      }
    } catch (error: any) {
      this.status = 'error';
      const msg = error.response?.data?.message || error.message || 'Upstox Authentication Failed';
      this.notifyStatus('error', msg);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
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
    for (const t of tokens) this.subscribedTokens.add(t);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        guid: `sub_${Date.now()}`,
        method: 'sub',
        data: {
          mode: 'full', // Full snap quote with market depth & OI
          instrumentKeys: Array.from(this.subscribedTokens),
        }
      };
      this.ws.send(Buffer.from(JSON.stringify(payload)));
    }
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
      const res = await axios.get(`${this.API_BASE}/option/contract?instrument_key=NSE_INDEX|Nifty 50`, {
        headers: {
          'Authorization': `Bearer ${this.credentials?.accessToken || ''}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (res.data?.data && Array.isArray(res.data.data)) {
        for (const c of res.data.data) {
          instruments.push({
            token: c.instrument_key,
            symbol: c.trading_symbol,
            name: 'NIFTY',
            expiry: c.expiry,
            strike: c.strike_price,
            lotSize: c.lot_size || 25,
            instrumentType: c.instrument_type as any,
            exchange: 'NFO',
            tickSize: 0.05,
          });
        }
      }
    } catch (err: any) {
      console.warn('[Upstox] Option contracts fetch warning:', err.message);
    }
    return instruments;
  }

  public async fetchSpotQuote(): Promise<void> {
    if (!this.credentials?.accessToken) return;
    try {
      const res = await axios.get(`${this.API_BASE}/market-quote/quotes?instrument_key=NSE_INDEX|Nifty 50`, {
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 8000,
      });

      const quote = res.data?.data?.['NSE_INDEX:Nifty 50'];
      if (quote) {
        const now = new Date().toISOString();
        const tick: NormalizedMarketTick = {
          provider: 'upstox',
          exchange: 'NSE',
          instrumentKey: 'NSE_INDEX|Nifty 50',
          tradingSymbol: 'NIFTY 50',
          instrumentType: 'INDEX',
          ltp: quote.last_price || 0,
          open: quote.ohlc?.open || 0,
          high: quote.ohlc?.high || 0,
          low: quote.ohlc?.low || 0,
          close: quote.ohlc?.close || quote.last_price || 0,
          prevClose: quote.ohlc?.close || 0,
          priceChange: quote.net_change || 0,
          changePercent: quote.ohlc?.close ? Number(((quote.net_change / quote.ohlc.close) * 100).toFixed(2)) : 0,
          volume: quote.volume || 0,
          exchangeTimestamp: quote.timestamp ? new Date(Number(quote.timestamp)).toISOString() : now,
          receivedTimestamp: now,
          isStale: false,
        };
        for (const cb of this.tickCallbacks) cb(tick);
      }
    } catch (err: any) {
      console.warn('[Upstox] Initial spot quote error:', err.message);
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
      console.error('[Upstox] WebSocket error:', err.message);
      this.notifyStatus('error', `WebSocket error: ${err.message}`);
    });

    this.ws.on('close', (code, reason) => {
      this.status = 'disconnected';
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.notifyStatus('disconnected', `Socket closed (${code}: ${reason.toString() || 'connection dropped'})`);
      this.attemptReconnect();
    });
  }

  private handleSocketMessage(data: WebSocket.Data): void {
    try {
      // Upstox V3 can emit JSON or Protobuf feed packets
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
              const tick: NormalizedMarketTick = {
                provider: 'upstox',
                exchange: key.includes('NSE_INDEX') ? 'NSE' : 'NFO',
                instrumentKey: key,
                tradingSymbol: key,
                instrumentType: key.endsWith('CE') ? 'CE' : key.endsWith('PE') ? 'PE' : 'INDEX',
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
      this.status = 'error';
      this.notifyStatus('error', 'Exceeded maximum reconnect attempts to Upstox.');
      return;
    }

    const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.notifyStatus('authenticating', `Reconnecting to Upstox in ${backoffMs / 1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private notifyStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    for (const cb of this.statusCallbacks) cb(status, message);
  }
}
