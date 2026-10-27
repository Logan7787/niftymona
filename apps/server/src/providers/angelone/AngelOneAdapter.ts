// ==============================================================================
// Angel One SmartAPI Official Adapter
// Documentation: https://smartapi.angelone.in/docs
// ==============================================================================

import axios from 'axios';
import WebSocket from 'ws';
import { BrokerProvider, ConnectionStatus, NormalizedMarketTick } from '../../types/market.js';
import { IBrokerAdapter, StatusCallback, TickCallback } from '../BaseAdapter.js';
import { ListedInstrument } from '../../services/InstrumentService.js';
import { redactSecrets } from '../../security/vault.js';

export interface AngelOneCredentials {
  apiKey: string;
  clientCode: string;
  password?: string;
  totp?: string;
  jwtToken?: string;
  feedToken?: string;
  refreshToken?: string;
}

export class AngelOneAdapter implements IBrokerAdapter {
  public readonly provider: BrokerProvider = 'angelone';
  private status: ConnectionStatus = 'disconnected';
  private credentials: AngelOneCredentials | null = null;
  private ws: WebSocket | null = null;
  private tickCallbacks: TickCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 6;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribedTokens: Set<string> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  private readonly BASE_URL = 'https://apiconnect.angelbroking.com';
  private readonly INSTRUMENTS_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
  private readonly SMART_STREAM_WS = 'wss://smartapisocket.angelone.in/smart-stream';

  constructor(credentials?: AngelOneCredentials) {
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

  public async connect(creds?: AngelOneCredentials): Promise<boolean> {
    if (creds) this.credentials = creds;
    if (!this.credentials || !this.credentials.apiKey || !this.credentials.clientCode) {
      this.status = 'error';
      this.notifyStatus('error', 'Angel One API Key and Client Code are required.');
      return false;
    }

    try {
      this.status = 'authenticating';
      this.notifyStatus('authenticating', 'Authenticating with Angel One SmartAPI...');

      // If jwtToken or feedToken is missing, perform login session generation
      if (!this.credentials.jwtToken && this.credentials.password && this.credentials.totp) {
        await this.generateSession();
      }

      if (!this.credentials.jwtToken) {
        throw new Error('Valid JWT session token or password+TOTP required for Angel One connection.');
      }

      this.initWebSocket();
      return true;
    } catch (error: any) {
      this.status = 'error';
      const msg = error.response?.data?.message || error.message || 'Angel One Authentication Failed';
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
    this.notifyStatus('disconnected', 'Angel One feed disconnected.');
  }

  public async subscribe(tokens: string[]): Promise<void> {
    for (const t of tokens) this.subscribedTokens.add(t);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const subscribeReq = {
        action: 1, // 1 for subscribe
        params: {
          mode: 3, // 3 for Full snap quote mode
          tokenList: Array.from(this.subscribedTokens).map(t => ({
            exchangeType: t.startsWith('NIFTY') ? 2 : 1, // 1: NSE, 2: NFO
            tokens: [t]
          }))
        }
      };
      this.ws.send(JSON.stringify(subscribeReq));
    }
  }

  public async unsubscribe(tokens: string[]): Promise<void> {
    for (const t of tokens) this.subscribedTokens.delete(t);
  }

  public async fetchInstruments(): Promise<ListedInstrument[]> {
    try {
      const response = await axios.get(this.INSTRUMENTS_URL, { timeout: 15000 });
      const rawData = response.data;
      if (!Array.isArray(rawData)) return [];

      const instruments: ListedInstrument[] = [];
      for (const item of rawData) {
        // Filter strictly for NIFTY index and NIFTY option contracts
        if (item.symbol === 'Nifty 50' && item.exch_seg === 'NSE') {
          instruments.push({
            token: item.token,
            symbol: 'NIFTY 50',
            name: 'NIFTY',
            expiry: '',
            strike: 0,
            lotSize: Number(item.lotsize) || 25,
            instrumentType: 'INDEX',
            exchange: 'NSE',
            tickSize: Number(item.tick_size) / 100 || 0.05,
          });
        } else if (item.name === 'NIFTY' && item.exch_seg === 'NFO' && item.instrumenttype === 'OPTIDX') {
          const optType = item.symbol.endsWith('CE') ? 'CE' : item.symbol.endsWith('PE') ? 'PE' : 'INDEX';
          instruments.push({
            token: item.token,
            symbol: item.symbol,
            name: 'NIFTY',
            expiry: item.expiry,
            strike: Number(item.strike) / 100,
            lotSize: Number(item.lotsize) || 25,
            instrumentType: optType as any,
            exchange: 'NFO',
            tickSize: Number(item.tick_size) / 100 || 0.05,
          });
        }
      }
      return instruments;
    } catch (err: any) {
      console.error('[AngelOne] Failed to fetch scrip master:', err.message);
      return [];
    }
  }

  public async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!this.credentials?.apiKey) {
      return { success: false, message: 'Angel One API Key not configured.' };
    }
    try {
      const res = await axios.get(`${this.BASE_URL}/rest/secure/angelbroking/user/v1/getProfile`, {
        headers: {
          'X-PrivateKey': this.credentials.apiKey,
          'Authorization': `Bearer ${this.credentials.jwtToken || ''}`,
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': 'fe80::1',
          'X-UserType': 'USER',
        },
        timeout: 8000,
      });

      return {
        success: res.data?.status === true,
        message: res.data?.message || 'Angel One connection test passed.',
        details: redactSecrets(res.data?.data),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'Angel One test failed.',
      };
    }
  }

  private async generateSession(): Promise<void> {
    if (!this.credentials) return;
    const res = await axios.post(`${this.BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      clientcode: this.credentials.clientCode,
      password: this.credentials.password,
      totp: this.credentials.totp,
    }, {
      headers: {
        'X-PrivateKey': this.credentials.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': 'fe80::1',
        'X-UserType': 'USER',
      },
      timeout: 10000,
    });

    if (res.data?.status === true && res.data?.data) {
      this.credentials.jwtToken = res.data.data.jwtToken;
      this.credentials.feedToken = res.data.data.feedToken;
      this.credentials.refreshToken = res.data.data.refreshToken;
    } else {
      throw new Error(res.data?.message || 'Login failed with Angel One.');
    }
  }

  private initWebSocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    const wsUrl = `${this.SMART_STREAM_WS}?clientCode=${this.credentials?.clientCode}&feedToken=${this.credentials?.feedToken}&apiKey=${this.credentials?.apiKey}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this.notifyStatus('connected', 'Angel One Smart Stream connected.');

      // Resubscribe active tokens
      if (this.subscribedTokens.size > 0) {
        this.subscribe(Array.from(this.subscribedTokens));
      }

      // Start ping heartbeat
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        }
      }, 25000);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleSocketMessage(data);
    });

    this.ws.on('error', (err) => {
      console.error('[AngelOne] WebSocket error:', err.message);
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
      if (typeof data === 'string' && data === 'pong') return;

      // SmartAPI sends binary packet or JSON depending on mode
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        if (parsed.token) {
          const now = new Date().toISOString();
          const tick: NormalizedMarketTick = {
            provider: 'angelone',
            exchange: parsed.exchange === 2 ? 'NFO' : 'NSE',
            instrumentKey: parsed.token,
            tradingSymbol: parsed.symbol || parsed.token,
            instrumentType: parsed.symbol?.endsWith('CE') ? 'CE' : parsed.symbol?.endsWith('PE') ? 'PE' : 'INDEX',
            ltp: parsed.last_traded_price / 100 || 0,
            open: parsed.open / 100,
            high: parsed.high / 100,
            low: parsed.low / 100,
            close: parsed.close / 100,
            volume: parsed.volume || 0,
            oi: parsed.open_interest || 0,
            exchangeTimestamp: parsed.exchange_timestamp || now,
            receivedTimestamp: now,
            isStale: false,
          };
          for (const cb of this.tickCallbacks) cb(tick);
        }
      }
    } catch {
      // In binary mode or malformed packet, ignore silently
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.status = 'error';
      this.notifyStatus('error', 'Exceeded maximum reconnect attempts to Angel One.');
      return;
    }

    const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.notifyStatus('authenticating', `Reconnecting to Angel One in ${backoffMs / 1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.initWebSocket();
    }, backoffMs);
  }

  private notifyStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    for (const cb of this.statusCallbacks) cb(status, message);
  }
}
