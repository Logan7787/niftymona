// ==============================================================================
// Unified Broker Data Service: Upstox V2, Angel One & Realistic Mock Sandbox
// Directly talks to broker APIs via Vite proxy (dev) / Vercel rewrites (prod)
// No separate Node.js server required!
// ==============================================================================

import axios from 'axios';
import {
  BrokerProvider, ConnectionStatus, NormalizedMarketTick,
  UnderlyingSnapshot, OptionChainSnapshot, TechnicalIndicatorData,
  SignalOutput, OptionChainRow, Candle
} from '../types/market';
import {
  InstrumentService, IndicatorService, SignalService,
  PaperTradingService, ListedInstrument
} from './marketEngine';
import { generateTOTP } from './totp';
import { angelScripService, angelToIsoExpiry, isoToAngelExpiry } from './angelScripService';

export interface UpstoxStoredCreds {
  apiKey: string;
  apiSecret?: string;
  accessToken: string;
}

export interface AngelOneStoredCreds {
  apiKey: string;
  clientCode: string;
  password?: string;
  totp?: string;
  jwtToken?: string;
  feedToken?: string;
}

export type MarketDataListener = (data: {
  underlying: UnderlyingSnapshot;
  optionChain: OptionChainSnapshot;
  indicators: TechnicalIndicatorData | null;
  signal: SignalOutput | null;
  provider: BrokerProvider;
  status: ConnectionStatus;
  statusMessage?: string;
  latencyMs: number;
}) => void;

// Helper to sanitize direct or received Angel One JWT session tokens
export function cleanAngelJwt(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n\s]/g, '');
}

// Checks if an Angel One JWT token is expired
export function isJwtExpired(token: string): boolean {
  if (!token || typeof token !== 'string') return true;
  try {
    const clean = cleanAngelJwt(token);
    const parts = clean.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);
    if (!payload.exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec >= (payload.exp - 30);
  } catch {
    return false;
  }
}

export interface JwtExpiryInfo {
  valid: boolean;
  isExpired: boolean;
  expiresAtFormatted?: string;
  minutesLeft?: number;
  clientCode?: string;
}

export function getJwtExpiryInfo(token: string): JwtExpiryInfo {
  if (!token || typeof token !== 'string') return { valid: false, isExpired: false };
  try {
    const clean = cleanAngelJwt(token);
    const parts = clean.split('.');
    if (parts.length !== 3) return { valid: false, isExpired: false };
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);
    const clientCode = payload.username || payload.clientcode;
    if (!payload.exp) return { valid: true, isExpired: false, clientCode };

    const expDate = new Date(payload.exp * 1000);
    const nowMs = Date.now();
    const diffMs = expDate.getTime() - nowMs;
    const minutesLeft = Math.floor(diffMs / 60000);
    const isExpired = diffMs <= 0;

    return {
      valid: !isExpired,
      isExpired,
      expiresAtFormatted: expDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      minutesLeft: Math.max(0, minutesLeft),
      clientCode,
    };
  } catch {
    return { valid: false, isExpired: false };
  }
}

// Strictly identifies the NIFTY 50 Index record and prevents option contracts or dummy scrips from being treated as index
function isNiftyIndex(q: any): boolean {
  if (!q) return false;
  const token = String(q.symbolToken || q.token || '').trim();
  const exchange = String(q.exchange || '').toUpperCase().trim();
  const sym = String(q.tradingSymbol || q.tradingsymbol || q.symbol || '').toUpperCase().trim();

  // 1. Explicit Index Token match (99926000 is official Angel One NIFTY 50 AMXIDX token)
  if (token === '99926000') {
    return true;
  }

  // Reject dummy token 26000 which returns erroneous LTP
  if (token === '26000') {
    return false;
  }

  // 2. Options are always on NFO and end with CE or PE -> strictly NEVER the index
  if (exchange === 'NFO' || sym.endsWith('CE') || sym.endsWith('PE')) {
    return false;
  }

  // 3. Exact symbol match on NSE cash/index segment
  if (sym === 'NIFTY 50' || sym === 'NIFTY-I' || sym === 'NIFTY INDEX') {
    return true;
  }

  // 4. Any item from NSE exchange that does not look like an equity stock or option
  if (exchange === 'NSE' && sym === 'NIFTY' && !/\d{4,}/.test(sym)) {
    return true;
  }

  return false;
}

class BrokerService {
  private activeProvider: BrokerProvider = 'mock';
  private connectionStatus: ConnectionStatus = 'connected';
  private statusMessage: string = 'Demo Sandbox Active';

  // Services
  public instrumentService = new InstrumentService();
  public paperTradingService = new PaperTradingService();

  // Market state (initialized with official prior settlement)
  private spotPrice: number = 23440.80;
  private spotOpen: number = 23222.30;
  private spotHigh: number = 23440.80;
  private spotLow: number = 23207.05;
  private spotPrevClose: number = 23053.10;
  private spotChange: number = 387.70;
  private spotChangePercent: number = 1.68;
  private spotVolume: number = 5500000;
  private selectedExpiry: string = '';
  private currentAtmStrike: number = 23450;
  private lastUpdate: string = new Date().toISOString();
  private spotCandles: Candle[] = [];
  private indicators: TechnicalIndicatorData | null = null;
  private signal: SignalOutput | null = null;
  private ticksMap: Map<string, NormalizedMarketTick> = new Map();
  private instrumentMetaMap: Map<string, ListedInstrument> = new Map();

  // Polling & Subscriptions
  private pollingTimer: any = null;
  private isRequestInFlight = false;
  private pollIntervalMs = 2500;
  private listeners: Set<MarketDataListener> = new Set();
  private subscribedTokens: Set<string> = new Set();

  constructor() {
    this.initMockCandles();
    this.restoreSavedSession();
  }

  private initMockCandles(): void {
    const nowSec = Math.floor(Date.now() / 1000);
    const currentBucket = Math.floor(nowSec / 300) * 300;
    const intervalSec = 300;
    let price = this.spotPrice || 22749.75;
    this.spotCandles = [];
    for (let i = 40; i >= 1; i--) {
      const time = currentBucket - (i * intervalSec);
      const delta = (Math.random() - 0.49) * 12;
      const open = price;
      const close = price + delta;
      const high = Math.max(open, close) + Math.random() * 8;
      const low = Math.min(open, close) - Math.random() * 8;
      price = close;
      this.spotCandles.push({
        timestamp: new Date(time * 1000).toISOString(),
        time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Math.floor(120000 + Math.random() * 50000),
      });
    }
    this.spotCandles.push({
      timestamp: new Date(currentBucket * 1000).toISOString(),
      time: currentBucket,
      open: this.spotOpen || price,
      high: Math.max(this.spotHigh || price, price),
      low: Math.min(this.spotLow || price, price),
      close: this.spotPrice || price,
      volume: 15000,
    });
    this.recalculateIndicators();
  }

  private restoreSavedSession(): void {
    try {
      const savedProvider = localStorage.getItem('nifty_active_provider') as BrokerProvider;
      const upstoxCreds = this.getUpstoxCredentials();
      const angelCreds = this.getAngelOneCredentials();

      if (savedProvider === 'upstox' && upstoxCreds?.accessToken) {
        this.connectUpstox(upstoxCreds);
      } else if (savedProvider === 'angelone' && angelCreds?.apiKey && angelCreds?.clientCode) {
        if (angelCreds.jwtToken || (angelCreds.password && angelCreds.totp)) {
          this.connectAngelOne(angelCreds);
        } else {
          this.activeProvider = 'angelone';
          this.connectionStatus = 'disconnected';
          this.statusMessage = 'Angel One credentials saved. Enter PIN & TOTP in Settings to connect.';
          this.startMockFeed();
        }
      } else {
        this.startMockFeed();
      }
    } catch {
      this.startMockFeed();
    }
  }

  // ----------------------------------------------------------------------------
  // Upstox Live Feed Connection
  // ----------------------------------------------------------------------------
  public async connectUpstox(creds: UpstoxStoredCreds): Promise<{ success: boolean; message: string }> {
    this.stopPolling();
    this.activeProvider = 'upstox';
    this.connectionStatus = 'authenticating';
    this.statusMessage = 'Connecting to Upstox Live Market Feed...';
    this.saveUpstoxCredentials(creds);
    localStorage.setItem('nifty_active_provider', 'upstox');
    this.notifyListeners();

    try {
      // 1. Fetch Option Contracts
      const contractUrl = `/api/upstox/v2/option/contract?instrument_key=${encodeURIComponent('NSE_INDEX|Nifty 50')}`;
      const contractRes = await axios.get(contractUrl, {
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (contractRes.data?.data && Array.isArray(contractRes.data.data)) {
        const instruments: ListedInstrument[] = [
          {
            token: 'NSE_INDEX|Nifty 50',
            symbol: 'NIFTY 50',
            name: 'NIFTY',
            expiry: '',
            strike: 0,
            lotSize: 65,
            instrumentType: 'INDEX',
            exchange: 'NSE',
            tickSize: 0.05,
          }
        ];

        for (const c of contractRes.data.data) {
          const inst: ListedInstrument = {
            token: c.instrument_key,
            symbol: c.trading_symbol,
            name: 'NIFTY',
            expiry: c.expiry,
            strike: Number(c.strike_price),
            lotSize: c.lot_size || 65,
            instrumentType: c.instrument_type as any,
            exchange: 'NFO',
            tickSize: 0.05,
          };
          instruments.push(inst);
          this.instrumentMetaMap.set(inst.token, inst);
          this.instrumentMetaMap.set(inst.symbol, inst);
          this.instrumentMetaMap.set(inst.token.replace('|', ':'), inst);
        }

        this.instrumentService.loadInstruments(instruments);
        const expiries = this.instrumentService.getAvailableExpiries();
        if (expiries.length > 0) {
          this.selectedExpiry = expiries[0];
        }
      }

      this.connectionStatus = 'connected';
      this.statusMessage = 'Live Upstox Market Feed Connected.';
      this.startUpstoxPolling(creds.accessToken);
      return { success: true, message: 'Connected to Upstox Live Market Feed!' };
    } catch (err: any) {
      this.connectionStatus = 'error';
      const msg = err.response?.data?.message || err.message || 'Failed to connect to Upstox';
      this.statusMessage = msg;
      this.notifyListeners();
      return { success: false, message: msg };
    }
  }

  private startUpstoxPolling(token: string): void {
    this.stopPolling();
    this.subscribeActiveStrikes();
    this.pollUpstoxQuotes(token);

    this.pollingTimer = setInterval(() => {
      this.pollUpstoxQuotes(token);
    }, this.pollIntervalMs);
  }

  private async pollUpstoxQuotes(token: string): Promise<void> {
    if (this.isRequestInFlight) return;
    this.isRequestInFlight = true;
    const startMs = performance.now();

    try {
      const tokens = ['NSE_INDEX|Nifty 50', ...Array.from(this.subscribedTokens)];
      const batch = tokens.slice(0, 50);
      const encodedTokens = batch.map(t => encodeURIComponent(t)).join(',');
      const url = `/api/upstox/v2/market-quote/quotes?instrument_key=${encodedTokens}`;

      const res = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        timeout: 8000,
      });

      const dataMap = res.data?.data;
      if (dataMap && typeof dataMap === 'object') {
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
            bidPrice: bestBid || undefined,
            askPrice: bestAsk || undefined,
            exchangeTimestamp: now,
            receivedTimestamp: now,
            isStale: false,
          };

          this.ticksMap.set(key, tick);

          if (isIndex) {
            const prevAtm = this.currentAtmStrike;
            this.spotPrice = ltp;
            this.spotOpen = open;
            this.spotHigh = high;
            this.spotLow = low;
            this.spotPrevClose = prevClose;
            this.spotChange = netChange;
            this.spotChangePercent = changePercent;
            this.lastUpdate = now;

            const exp = this.selectedExpiry || this.instrumentService.getAvailableExpiries()[0];
            const strikes = this.instrumentService.getStrikesForExpiry(exp);
            const newAtm = InstrumentService.calculateATMStrike(ltp, strikes);
            if (newAtm !== prevAtm && newAtm > 0) {
              this.currentAtmStrike = newAtm;
              this.subscribeActiveStrikes();
            }

            this.updateSpotCandle(ltp);
            this.recalculateIndicators();
          }
        }

        // Mark to market paper trading
        const ltpMap = new Map<string, number>();
        for (const [k, t] of this.ticksMap.entries()) {
          ltpMap.set(k, t.ltp);
          ltpMap.set(t.tradingSymbol, t.ltp);
        }
        this.paperTradingService.updateMarkToMarket(ltpMap);
      }

      this.connectionStatus = 'connected';
      const latency = Math.round(performance.now() - startMs);
      this.notifyListeners(latency);
    } catch (err: any) {
      if (err.response?.status === 401) {
        this.connectionStatus = 'token_expired';
        this.statusMessage = 'Upstox Access Token has expired. Please update it in Broker Settings.';
      } else if (err.response?.status === 429) {
        console.warn('[Upstox] Rate limit hit. Backing off...');
      }
    } finally {
      this.isRequestInFlight = false;
    }
  }

  // ----------------------------------------------------------------------------
  // Angel One SmartAPI Live Feed Connection
  // ----------------------------------------------------------------------------
  public async connectAngelOne(creds: AngelOneStoredCreds): Promise<{ success: boolean; message: string }> {
    this.stopPolling();
    this.activeProvider = 'angelone';
    this.connectionStatus = 'authenticating';
    this.statusMessage = 'Connecting to Angel One SmartAPI...';
    this.saveAngelOneCredentials(creds);
    localStorage.setItem('nifty_active_provider', 'angelone');
    this.notifyListeners();

    try {
      if (!creds.apiKey || !creds.clientCode) {
        throw new Error('Angel One SmartAPI Key and Client Code are required.');
      }

      // Initialize real instruments for the nearest upcoming expiry
      const nearestExp = angelScripService.getNearestExpiry();
      this.selectedExpiry = nearestExp;
      this.rebuildAngelInstruments(this.currentAtmStrike, nearestExp);

      // 1. If a direct or stored JWT token is provided, verify it first with a live probe
      let isAuthenticated = false;
      if (creds.jwtToken) {
        if (isJwtExpired(creds.jwtToken)) {
          console.warn('[AngelOne] Provided or stored JWT session token has expired, clearing...');
          creds.jwtToken = undefined;
        } else {
          const cleanJwt = cleanAngelJwt(creds.jwtToken);
          creds.jwtToken = cleanJwt;
          try {
          const authHeader = `Bearer ${cleanJwt}`;
          const probeRes = await axios.post(
            '/api/angelone/rest/secure/angelbroking/market/v1/quote',
            {
              mode: 'FULL',
              exchangeTokens: {
                NSE: ['99926000']
              }
            },
            {
              headers: {
                'Authorization': authHeader,
                'X-PrivateKey': creds.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1',
                'X-ClientPublicIP': '106.193.147.98',
                'X-MACAddress': '02:00:00:00:00:00',
                'X-UserType': 'USER',
              },
              timeout: 8000,
            }
          );
          const isProbeSuccess =
            probeRes.data &&
            typeof probeRes.data === 'object' &&
            probeRes.data.status !== false &&
            probeRes.data.success !== false &&
            (probeRes.data.status === true || Array.isArray(probeRes.data.data?.fetched));

          if (isProbeSuccess) {
            isAuthenticated = true;
            this.saveAngelOneCredentials(creds);

            // Immediately parse live index quote from probe response to update spot price instantly
            const probeItems = probeRes.data?.data?.fetched;
            if (Array.isArray(probeItems) && probeItems.length > 0) {
              const idxRec = probeItems.find(q => isNiftyIndex(q));
              if (idxRec) {
                const ltp = Number(idxRec.ltp ?? idxRec.lastPrice ?? idxRec.close ?? 0);
                if (ltp > 10000) {
                  const open = Number(idxRec.open ?? ltp);
                  const high = Number(idxRec.high ?? ltp);
                  const low = Number(idxRec.low ?? ltp);
                  const close = Number(idxRec.close ?? ltp);
                  const netChange = Number(idxRec.netChange ?? (close > 0 ? ltp - close : 0));
                  const prevClose = close > 0 && Math.abs(ltp - close) > 0 ? close : (ltp - netChange);
                  const changePercent = Number(idxRec.percentChange ?? (prevClose > 0 ? (netChange / prevClose) * 100 : 0));

                  this.spotPrice = ltp;
                  this.spotOpen = open;
                  this.spotHigh = high;
                  this.spotLow = low;
                  this.spotPrevClose = prevClose;
                  this.spotChange = netChange;
                  this.spotChangePercent = Number(changePercent.toFixed(2));
                  this.lastUpdate = new Date().toISOString();

                  const strikes = this.instrumentService.getStrikesForExpiry(this.selectedExpiry);
                  const newAtm = InstrumentService.calculateATMStrike(ltp, strikes);
                  if (newAtm > 0) {
                    this.currentAtmStrike = newAtm;
                  }
                  this.updateSpotCandle(ltp);
                  this.recalculateIndicators();
                }
              }
            }
          } else {
            console.warn('[AngelOne] Direct JWT token probe rejected by server:', probeRes.data?.message || probeRes.data);
            creds.jwtToken = undefined;
          }
        } catch (probeErr: any) {
          console.warn('[AngelOne] Direct JWT token probe error:', probeErr?.response?.data || probeErr?.message);
          creds.jwtToken = undefined;
        }
      }
    }

      // 2. If JWT token was not provided or failed verification, try PIN + TOTP login
      if (!isAuthenticated) {
        if (creds.password && creds.totp) {
          const totpCode = await generateTOTP(creds.totp);
          const loginUrl = '/api/angelone/rest/auth/angelbroking/user/v1/loginByPassword';
          const loginRes = await axios.post(
            loginUrl,
            {
              clientcode: creds.clientCode,
              password: creds.password,
              totp: totpCode,
            },
            {
              headers: {
                'X-PrivateKey': creds.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1',
                'X-ClientPublicIP': '106.193.147.98',
                'X-MACAddress': '02:00:00:00:00:00',
                'X-UserType': 'USER',
              },
              timeout: 10000,
            }
          );

          if (loginRes.data?.status === true && loginRes.data?.data) {
            creds.jwtToken = cleanAngelJwt(loginRes.data.data.jwtToken);
            creds.feedToken = loginRes.data.data.feedToken;
            if (creds.totp && /^\d{6}$/.test(creds.totp.trim())) {
              creds.totp = undefined;
            }
            this.saveAngelOneCredentials(creds);
            isAuthenticated = true;
          } else {
            let errMsg = 'Login failed with Angel One credentials.';
            if (typeof loginRes.data === 'string') {
              errMsg = loginRes.data;
            } else if (loginRes.data?.message) {
              errMsg = loginRes.data.errorcode
                ? `${loginRes.data.message} (${loginRes.data.errorcode})`
                : loginRes.data.message;
            }
            throw new Error(errMsg);
          }
        } else {
          throw new Error('Your Angel One session has expired for today. Please enter your 6-digit Authenticator OTP in Broker Settings and click "⚡ Generate JWT Token".');
        }
      }

      this.connectionStatus = 'connected';
      this.statusMessage = 'Angel One SmartAPI Live Market Feed Connected.';
      this.startAngelOnePolling(creds);
      this.notifyListeners();

      return { success: true, message: 'Connected to Angel One SmartAPI Live Feed!' };
    } catch (err: any) {
      this.connectionStatus = 'error';
      const rawData = err.response?.data;
      let msg = err.message || 'Failed to connect to Angel One SmartAPI';
      if (typeof rawData === 'string') {
        msg = rawData;
      } else if (rawData?.message) {
        msg = rawData.errorcode ? `${rawData.message} (${rawData.errorcode})` : rawData.message;
      }
      this.statusMessage = msg;
      this.notifyListeners();
      return { success: false, message: msg };
    }
  }

  /**
   * Directly authenticates with Angel One using PIN and TOTP to generate a fresh JWT session token.
   */
  public async generateAngelOneJwtToken(params: {
    apiKey: string;
    clientCode: string;
    password: string;
    totp: string;
  }): Promise<{
    success: boolean;
    jwtToken?: string;
    feedToken?: string;
    refreshToken?: string;
    message: string;
  }> {
    const { apiKey, clientCode, password, totp } = params;
    if (!apiKey?.trim() || !clientCode?.trim() || !password?.trim() || !totp?.trim()) {
      return {
        success: false,
        message: 'SmartAPI Key, Client Code, PIN, and TOTP are all required to generate a JWT token.',
      };
    }

    const cleanClient = clientCode.trim().toUpperCase();
    const cleanKey = apiKey.trim();
    const cleanPwd = password.trim();
    const cleanTotpInput = totp.trim();

    console.log('[AngelOne SmartAPI] Initiating JWT Token generation for client:', cleanClient);

    try {
      const totpCode = await generateTOTP(cleanTotpInput);
      if (!totpCode || !/^\d{6}$/.test(totpCode)) {
        console.warn('[AngelOne SmartAPI] Invalid TOTP code computed:', totpCode);
        return {
          success: false,
          message: 'Failed to compute a valid 6-digit TOTP code. Verify your TOTP Key or enter a fresh 6-digit OTP from your authenticator app.',
        };
      }

      console.log('[AngelOne SmartAPI] Sending login request to SmartAPI auth endpoint...');
      const loginUrl = '/api/angelone/rest/auth/angelbroking/user/v1/loginByPassword';
      const loginRes = await axios.post(
        loginUrl,
        {
          clientcode: cleanClient,
          password: cleanPwd,
          totp: totpCode,
        },
        {
          headers: {
            'X-PrivateKey': cleanKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': '02:00:00:00:00:00',
            'X-UserType': 'USER',
          },
          timeout: 12000,
        }
      );

      console.log('[AngelOne SmartAPI] Login response status:', loginRes.data?.status, loginRes.data);

      if (loginRes.data?.status === true && loginRes.data?.data) {
        const cleanJwt = cleanAngelJwt(loginRes.data.data.jwtToken);
        const feedToken = loginRes.data.data.feedToken;
        const refreshToken = loginRes.data.data.refreshToken;

        return {
          success: true,
          jwtToken: cleanJwt,
          feedToken,
          refreshToken,
          message: 'Angel One JWT Session Token generated successfully!',
        };
      } else {
        const d = loginRes.data;
        const errCode = d?.errorcode || d?.errorCode || '';
        let errMsg = 'Failed to generate JWT token from Angel One.';

        if (typeof d === 'string') {
          if (d.includes('exceeding access rate') || d.includes('Access denied')) {
            errMsg = 'Angel One rate limit reached (too many rapid requests). Please wait 15 seconds before trying again.';
          } else if (d.includes('Request Rejected') || d.includes('<html')) {
            errMsg = 'Request was rejected by Angel One security firewall. Please wait a moment and try again.';
          } else {
            errMsg = d;
          }
        } else if (errCode === 'AB1050') {
          errMsg = 'Invalid TOTP / Client combination (AB1050). The 6-digit OTP has expired or does not match SmartAPI. Please enter a fresh 6-digit code from Google Authenticator, or paste your permanent TOTP Secret Key from smartapi.angelone.in/enable-totp.';
        } else if (errCode === 'AB1010') {
          errMsg = 'Invalid Account PIN (AB1010). Please verify your 4-digit demat trading PIN.';
        } else if (d?.message) {
          errMsg = errCode ? `${d.message} (${errCode})` : d.message;
        }

        console.error('[AngelOne SmartAPI] Login rejected:', errMsg);
        return {
          success: false,
          message: errMsg,
        };
      }
    } catch (err: any) {
      console.error('[AngelOne SmartAPI] Login network error:', err);
      const raw = err.response?.data;
      let msg = err.message || 'Network error while generating JWT token';
      if (typeof raw === 'string') {
        if (raw.includes('exceeding access rate') || raw.includes('Access denied')) {
          msg = 'Angel One rate limit reached (too many rapid requests). Please wait 15 seconds before trying again.';
        } else if (raw.includes('Request Rejected') || raw.includes('<html')) {
          msg = 'Request was rejected by Angel One security firewall. Please wait a moment and try again.';
        } else {
          msg = raw;
        }
      } else if (raw?.message) {
        msg = raw.errorcode ? `${raw.message} (${raw.errorcode})` : raw.message;
      }
      return {
        success: false,
        message: msg,
      };
    }
  }

  private async reloginAngelOne(creds: AngelOneStoredCreds): Promise<boolean> {
    try {
      if (!creds.apiKey || !creds.clientCode || !creds.password || !creds.totp) return false;
      // 6-digit one-time codes cannot be reused for automatic session renewal
      if (/^\d{6}$/.test(creds.totp.trim())) {
        console.warn('[AngelOne] Cannot auto-renew session with a 6-digit OTP. TOTP Secret Key required.');
        this.connectionStatus = 'token_expired';
        this.statusMessage = 'Angel One session expired. Please re-enter a fresh OTP or TOTP Secret Key in Settings.';
        this.notifyListeners();
        return false;
      }
      const totpCode = await generateTOTP(creds.totp);
      const loginUrl = '/api/angelone/rest/auth/angelbroking/user/v1/loginByPassword';
      const loginRes = await axios.post(
        loginUrl,
        {
          clientcode: creds.clientCode,
          password: creds.password,
          totp: totpCode,
        },
        {
          headers: {
            'X-PrivateKey': creds.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': '02:00:00:00:00:00',
            'X-UserType': 'USER',
          },
          timeout: 10000,
        }
      );

      if (loginRes.data?.status === true && loginRes.data?.data?.jwtToken) {
        creds.jwtToken = loginRes.data.data.jwtToken;
        creds.feedToken = loginRes.data.data.feedToken;
        this.saveAngelOneCredentials(creds);
        this.connectionStatus = 'connected';
        this.statusMessage = 'Angel One session automatically renewed.';
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[AngelOne] Automatic re-login failed:', e);
      return false;
    }
  }

  private rebuildAngelInstruments(atm: number, expiry: string): void {
    const exp = expiry || angelScripService.getNearestExpiry();
    this.selectedExpiry = exp;
    const instruments = angelScripService.getListedInstruments(exp);

    this.instrumentMetaMap.clear();
    for (const inst of instruments) {
      this.instrumentMetaMap.set(inst.token, inst);
      this.instrumentMetaMap.set(inst.symbol, inst);
    }

    this.instrumentService.loadInstruments(instruments);
  }

  private startAngelOnePolling(creds: AngelOneStoredCreds): void {
    this.stopPolling();
    this.pollAngelOneQuotes(creds);

    this.pollingTimer = setInterval(() => {
      this.pollAngelOneQuotes(creds);
    }, this.pollIntervalMs);
  }

  private async pollAngelOneQuotes(creds: AngelOneStoredCreds): Promise<void> {
    if (this.isRequestInFlight) return;
    this.isRequestInFlight = true;
    const startMs = performance.now();

    try {
      const jwt = cleanAngelJwt(creds.jwtToken || '');
      if (!jwt) throw new Error('No JWT token');
      const authHeader = `Bearer ${jwt}`;
      const quoteUrl = '/api/angelone/rest/secure/angelbroking/market/v1/quote';

      const exp = this.selectedExpiry || angelScripService.getNearestExpiry();
      const nfoTokens = angelScripService.getAtmTokens(this.spotPrice || 23450, exp, 8);

      const payload: any = {
        mode: 'FULL',
        exchangeTokens: {
          NSE: ['99926000'],
        }
      };

      if (nfoTokens.length > 0) {
        payload.exchangeTokens.NFO = nfoTokens.slice(0, 24);
      }

      const res = await axios.post(
        quoteUrl,
        payload,
        {
          headers: {
            'Authorization': authHeader,
            'X-PrivateKey': creds.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': '02:00:00:00:00:00',
            'X-UserType': 'USER',
          },
          timeout: 8000,
        }
      );

      // Handle unexpected non-JSON response (e.g. gateway error)
      if (!res.data || typeof res.data !== 'object') {
        console.warn('[AngelOne] Received non-JSON response from quote endpoint:', typeof res.data);
        return;
      }

      // Handle business error responses returned with HTTP 200
      if (res.data?.status === false || res.data?.success === false) {
        const code = res.data?.errorcode || res.data?.errorCode;
        const msg = res.data?.message || 'Quote fetch failed';
        if (code === 'AG8001' || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('session')) {
          if (creds.password && creds.totp) {
            console.log('[AngelOne] Session expired (AG8001), auto-renewing session...');
            const renewed = await this.reloginAngelOne(creds);
            if (renewed) return;
          }
          this.connectionStatus = 'token_expired';
          this.statusMessage = 'Angel One JWT session token expired (AG8001). Please re-authenticate in Broker Settings.';
          this.notifyListeners();
          return;
        }
        console.warn('[AngelOne] Quote API returned error:', msg);
        return;
      }

      const items = res.data?.data?.fetched;
      if (Array.isArray(items) && items.length > 0) {
        const now = new Date().toISOString();

        // 1. Process NIFTY 50 Index record FIRST and EXCLUSIVELY
        const indexRecord = items.find(q => isNiftyIndex(q));
        if (indexRecord) {
          const ltp = Number(indexRecord.ltp ?? indexRecord.lastPrice ?? indexRecord.close ?? 0);
          if (ltp > 10000) {
            const open = Number(indexRecord.open ?? ltp);
            const high = Number(indexRecord.high ?? ltp);
            const low = Number(indexRecord.low ?? ltp);
            const close = Number(indexRecord.close ?? ltp);
            const netChange = Number(indexRecord.netChange ?? (close > 0 ? ltp - close : 0));
            const prevClose = close > 0 && Math.abs(ltp - close) > 0 ? close : (ltp - netChange);
            const changePercent = Number(indexRecord.percentChange ?? (prevClose > 0 ? (netChange / prevClose) * 100 : 0));

            const prevAtm = this.currentAtmStrike;
            this.spotPrice = ltp;
            this.spotOpen = open;
            this.spotHigh = high;
            this.spotLow = low;
            this.spotPrevClose = prevClose;
            this.spotChange = netChange;
            this.spotChangePercent = Number(changePercent.toFixed(2));
            this.lastUpdate = now;

            const strikes = this.instrumentService.getStrikesForExpiry(this.selectedExpiry);
            const newAtm = InstrumentService.calculateATMStrike(ltp, strikes);
            if (newAtm > 0 && newAtm !== prevAtm) {
              this.currentAtmStrike = newAtm;
            }

            this.updateSpotCandle(ltp);
            this.recalculateIndicators();

            const idxTick: NormalizedMarketTick = {
              provider: 'angelone',
              exchange: 'NSE',
              instrumentKey: String(indexRecord.symbolToken || '99926000'),
              tradingSymbol: indexRecord.tradingSymbol || 'Nifty 50',
              instrumentType: 'INDEX',
              strike: 0,
              expiry: '',
              ltp,
              open,
              high,
              low,
              close,
              prevClose,
              priceChange: netChange,
              changePercent,
              volume: Number(indexRecord.totTrdQty || indexRecord.tradeVolume || 0),
              oi: Number(indexRecord.opnInterest || 0),
              exchangeTimestamp: now,
              receivedTimestamp: now,
              isStale: false,
            };
            this.ticksMap.set('99926000', idxTick);
            this.ticksMap.set('NIFTY 50', idxTick);
            this.ticksMap.set('NIFTY', idxTick);
          }
        }

        // 2. Process Option Contracts (strictly excluding index records)
        for (const q of items) {
          if (!q || isNiftyIndex(q)) continue;
          const tokenStr = String(q.symbolToken || q.token || '');
          const symStr = String(q.tradingSymbol || q.tradingsymbol || '').toLowerCase();
          const meta = this.instrumentMetaMap.get(tokenStr) || angelScripService.getContractByToken(tokenStr);

          const ltp = Number(q.ltp ?? q.lastPrice ?? q.close ?? 0);
          if (ltp <= 0) continue;

          const open = Number(q.open ?? ltp);
          const high = Number(q.high ?? ltp);
          const low = Number(q.low ?? ltp);
          const close = Number(q.close ?? ltp);
          const netChange = Number(q.netChange ?? (close > 0 ? ltp - close : 0));
          const prevClose = close > 0 && Math.abs(ltp - close) > 0 ? close : (ltp - netChange);
          const changePercent = Number(q.percentChange ?? (prevClose > 0 ? (netChange / prevClose) * 100 : 0));

          const bestBid = q.depth?.buy?.[0]?.price ? Number(q.depth.buy[0].price) : undefined;
          const bestAsk = q.depth?.sell?.[0]?.price ? Number(q.depth.sell[0].price) : undefined;

          const tick: NormalizedMarketTick = {
            provider: 'angelone',
            exchange: 'NFO',
            instrumentKey: tokenStr,
            tradingSymbol: q.tradingSymbol || meta?.symbol || tokenStr,
            instrumentType: (meta?.instrumentType as any) || (symStr.endsWith('ce') ? 'CE' : 'PE'),
            strike: meta?.strike,
            optionType: (meta?.instrumentType as any) || (symStr.endsWith('ce') ? 'CE' : 'PE'),
            expiry: meta?.expiry || exp,
            ltp,
            open,
            high,
            low,
            close,
            prevClose,
            priceChange: netChange,
            changePercent,
            volume: Number(q.totTrdQty || q.tradeVolume || 0),
            oi: Number(q.opnInterest || 0),
            bidPrice: bestBid,
            askPrice: bestAsk,
            exchangeTimestamp: now,
            receivedTimestamp: now,
            isStale: false,
          };

          this.ticksMap.set(tokenStr, tick);
          if (meta?.symbol) {
            this.ticksMap.set(meta.symbol, tick);
          }
          if (q.tradingSymbol) {
            this.ticksMap.set(q.tradingSymbol, tick);
          }
        }

        // Mark to market paper trading
        const ltpMap = new Map<string, number>();
        for (const [k, t] of this.ticksMap.entries()) {
          ltpMap.set(k, t.ltp);
          ltpMap.set(t.tradingSymbol, t.ltp);
        }
        this.paperTradingService.updateMarkToMarket(ltpMap);

        this.connectionStatus = 'connected';
        this.statusMessage = 'Angel One SmartAPI Live Market Feed Active';
        const latency = Math.round(performance.now() - startMs);
        this.notifyListeners(latency);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        if (creds.password && creds.totp) {
          const renewed = await this.reloginAngelOne(creds);
          if (renewed) return;
        }
        this.connectionStatus = 'token_expired';
        this.statusMessage = 'Angel One JWT session token expired. Please re-authenticate in Broker Settings.';
        this.notifyListeners();
      } else if (err.response?.status === 429) {
        console.warn('[AngelOne] Rate limit hit. Backing off...');
      }
    } finally {
      this.isRequestInFlight = false;
    }
  }

  // ----------------------------------------------------------------------------
  // Mock Demo Sandbox Feed
  // ----------------------------------------------------------------------------
  public startMockFeed(): void {
    this.stopPolling();
    this.activeProvider = 'mock';
    this.connectionStatus = 'connected';
    this.statusMessage = 'High-Fidelity Demo Sandbox Active';
    localStorage.setItem('nifty_active_provider', 'mock');

    // Generate mock instruments
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
    const expiryDate = new Date(today);
    expiryDate.setDate(today.getDate() + daysUntilThursday);
    const mockExpiry = expiryDate.toISOString().split('T')[0];

    const instruments: ListedInstrument[] = [
      {
        token: '99926000',
        symbol: 'NIFTY 50',
        name: 'NIFTY',
        expiry: '',
        strike: 0,
        lotSize: 65,
        instrumentType: 'INDEX',
        exchange: 'NSE',
        tickSize: 0.05,
      }
    ];

    const base = Math.round((this.spotPrice || 23050) / 50) * 50;
    for (let strike = base - 700; strike <= base + 700; strike += 50) {
      instruments.push(
        { token: `MOCK_${strike}_CE`, symbol: `NIFTY ${strike} CE`, name: 'NIFTY', expiry: mockExpiry, strike, lotSize: 65, instrumentType: 'CE', exchange: 'NFO', tickSize: 0.05 },
        { token: `MOCK_${strike}_PE`, symbol: `NIFTY ${strike} PE`, name: 'NIFTY', expiry: mockExpiry, strike, lotSize: 65, instrumentType: 'PE', exchange: 'NFO', tickSize: 0.05 }
      );
    }

    this.instrumentService.loadInstruments(instruments);
    this.selectedExpiry = mockExpiry;

    this.pollingTimer = setInterval(() => {
      // Simulate realistic Brownian motion
      const drift = (Math.random() - 0.49) * 4.5;
      this.spotPrice = Number((this.spotPrice + drift).toFixed(2));
      this.spotHigh = Math.max(this.spotHigh, this.spotPrice);
      this.spotLow = Math.min(this.spotLow, this.spotPrice);
      this.spotChange = Number((this.spotPrice - this.spotPrevClose).toFixed(2));
      this.spotChangePercent = Number(((this.spotChange / this.spotPrevClose) * 100).toFixed(2));
      this.lastUpdate = new Date().toISOString();

      const strikes = this.instrumentService.getStrikesForExpiry(this.selectedExpiry);
      this.currentAtmStrike = InstrumentService.calculateATMStrike(this.spotPrice, strikes);

      // Simulate options prices
      const sBase = Math.round((this.spotPrice || 23050) / 50) * 50;
      for (let s = sBase - 700; s <= sBase + 700; s += 50) {
        const ceIntrinsic = Math.max(0, this.spotPrice - s);
        const peIntrinsic = Math.max(0, s - this.spotPrice);
        const timeVal = Math.max(15, 120 - Math.abs(this.spotPrice - s) * 0.25);

        this.ticksMap.set(`MOCK_${s}_CE`, {
          provider: 'mock', exchange: 'NFO', instrumentKey: `MOCK_${s}_CE`, tradingSymbol: `NIFTY ${s} CE`,
          instrumentType: 'CE', strike: s, expiry: mockExpiry,
          ltp: Number((ceIntrinsic + timeVal + (Math.random() - 0.5) * 2).toFixed(2)),
          volume: Math.floor(50000 + Math.random() * 20000), oi: Math.floor(100000 + (s % 100 === 0 ? 50000 : 20000)),
          exchangeTimestamp: this.lastUpdate, receivedTimestamp: this.lastUpdate, isStale: false,
        });

        this.ticksMap.set(`MOCK_${s}_PE`, {
          provider: 'mock', exchange: 'NFO', instrumentKey: `MOCK_${s}_PE`, tradingSymbol: `NIFTY ${s} PE`,
          instrumentType: 'PE', strike: s, expiry: mockExpiry,
          ltp: Number((peIntrinsic + timeVal + (Math.random() - 0.5) * 2).toFixed(2)),
          volume: Math.floor(45000 + Math.random() * 20000), oi: Math.floor(110000 + (s % 100 === 0 ? 60000 : 25000)),
          exchangeTimestamp: this.lastUpdate, receivedTimestamp: this.lastUpdate, isStale: false,
        });
      }

      this.updateSpotCandle(this.spotPrice);
      this.recalculateIndicators();
      this.notifyListeners(14);
    }, 1500);
  }

  public subscribeActiveStrikes(): void {
    const exp = this.selectedExpiry || this.instrumentService.getAvailableExpiries()[0];
    const availableStrikes = this.instrumentService.getStrikesForExpiry(exp);
    const atm = InstrumentService.calculateATMStrike(this.spotPrice, availableStrikes);
    this.currentAtmStrike = atm;
    const strikesWindow = InstrumentService.getSelectedStrikesWindow(atm, availableStrikes, 10);

    this.subscribedTokens.clear();
    for (const s of strikesWindow) {
      const ce = this.instrumentService.findContract(s, 'CE', exp);
      const pe = this.instrumentService.findContract(s, 'PE', exp);
      if (ce?.token) this.subscribedTokens.add(ce.token);
      if (pe?.token) this.subscribedTokens.add(pe.token);
    }
  }

  public setExpiry(expiry: string): void {
    this.selectedExpiry = expiry;
    if (this.activeProvider === 'angelone') {
      this.rebuildAngelInstruments(this.currentAtmStrike, expiry);
    }
    this.subscribeActiveStrikes();
    this.notifyListeners();
  }

  private updateSpotCandle(spot: number): void {
    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / 300) * 300;
    const last = this.spotCandles[this.spotCandles.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, spot);
      last.low = Math.min(last.low, spot);
      last.close = spot;
    } else if (!last || bucket > last.time) {
      this.spotCandles.push({
        timestamp: new Date(bucket * 1000).toISOString(),
        time: bucket,
        open: spot,
        high: spot,
        low: spot,
        close: spot,
        volume: 15000,
      });
      if (this.spotCandles.length > 100) this.spotCandles.shift();
    }
  }

  private recalculateIndicators(): void {
    this.indicators = IndicatorService.computeIndicatorSnapshot(
      this.spotCandles, '5m', this.spotPrevClose, 'NIFTY 50'
    );
    const chain = this.getOptionChainSnapshot(5);
    this.signal = SignalService.evaluateSignal({
      underlyingPrice: this.spotPrice,
      atmStrike: this.currentAtmStrike,
      expiry: chain.selectedExpiry,
      indicators: this.indicators,
      chain,
      feedFreshness: this.activeProvider === 'mock' ? 'SIMULATED' : 'LIVE',
    });
  }

  public getUnderlyingSnapshot(): UnderlyingSnapshot {
    const expiries = this.instrumentService.getAvailableExpiries();
    const available = expiries.length > 0
      ? expiries
      : (this.activeProvider === 'angelone' ? angelScripService.getAvailableExpiries() : []);
    const activeExpiry = available.length > 0
      ? (available.includes(this.selectedExpiry) ? this.selectedExpiry : available[0])
      : (this.selectedExpiry || '2026-11-03');

    const availableStrikes = this.instrumentService.getStrikesForExpiry(activeExpiry);
    const atmStrike = InstrumentService.calculateATMStrike(this.spotPrice, availableStrikes);
    this.currentAtmStrike = atmStrike;

    return {
      symbol: 'NIFTY 50',
      spotPrice: this.spotPrice,
      change: this.spotChange,
      changePercent: this.spotChangePercent,
      open: this.spotOpen,
      high: this.spotHigh,
      low: this.spotLow,
      prevClose: this.spotPrevClose,
      atmStrike,
      nearestExpiry: activeExpiry,
      availableExpiries: available.length > 0 ? available : [activeExpiry],
      indiaVix: 13.82,
      marketStatus: 'OPEN',
      lastUpdate: this.lastUpdate,
      isSimulated: this.activeProvider === 'mock',
    };
  }

  public getOptionChainSnapshot(rangeCount = 10): OptionChainSnapshot {
    const underlying = this.getUnderlyingSnapshot();
    let availableStrikes = this.instrumentService.getStrikesForExpiry(underlying.nearestExpiry);

    if (availableStrikes.length === 0) {
      availableStrikes = [];
      const base = Math.round(this.spotPrice / 50) * 50;
      for (let s = base - 500; s <= base + 500; s += 50) availableStrikes.push(s);
    }

    const atmStrike = InstrumentService.calculateATMStrike(underlying.spotPrice, availableStrikes);
    const selectedStrikes = InstrumentService.getSelectedStrikesWindow(atmStrike, availableStrikes, rangeCount);
    const strikeInterval = InstrumentService.detectStrikeInterval(availableStrikes);

    let totalCeOi = 0;
    let totalPeOi = 0;
    let totalCeVolume = 0;
    let totalPeVolume = 0;
    const rows: OptionChainRow[] = [];

    for (const strike of selectedStrikes) {
      const isAtm = strike === atmStrike;
      const distanceFromAtm = Math.round((strike - atmStrike) / strikeInterval);

      // Find contract ticks
      const ceTick = this.findContractTick(strike, 'CE', underlying.nearestExpiry);
      const peTick = this.findContractTick(strike, 'PE', underlying.nearestExpiry);

      // Spot-anchored realistic pricing if market quote is in post-market/closed hours
      const spot = underlying.spotPrice || 22749.75;
      const ceIntrinsic = Math.max(0, spot - strike);
      const peIntrinsic = Math.max(0, strike - spot);
      const dist = Math.abs(spot - strike);
      const estTimeVal = Math.max(10, 135 - dist * 0.22);

      const calcCeLtp = Number((ceIntrinsic + estTimeVal).toFixed(2));
      const calcPeLtp = Number((peIntrinsic + estTimeVal).toFixed(2));
      const calcCePrev = Number((calcCeLtp * 1.12).toFixed(2));
      const calcPePrev = Number((calcPeLtp * 0.92).toFixed(2));

      const ceLtp = ceTick?.ltp ?? calcCeLtp;
      const peLtp = peTick?.ltp ?? calcPeLtp;
      const ceChange = ceTick?.priceChange ?? Number((ceLtp - calcCePrev).toFixed(2));
      const peChange = peTick?.priceChange ?? Number((peLtp - calcPePrev).toFixed(2));
      const ceChangePct = ceTick?.changePercent ?? (calcCePrev > 0 ? Number(((ceChange / calcCePrev) * 100).toFixed(2)) : 0);
      const peChangePct = peTick?.changePercent ?? (calcPePrev > 0 ? Number(((peChange / calcPePrev) * 100).toFixed(2)) : 0);
      const ceOi = ceTick?.oi ?? Math.floor(75000 + (strike % 100 === 0 ? 60000 : 25000));
      const peOi = peTick?.oi ?? Math.floor(85000 + (strike % 100 === 0 ? 65000 : 30000));
      const ceVol = ceTick?.volume ?? Math.floor(40000 + Math.random() * 20000);
      const peVol = peTick?.volume ?? Math.floor(38000 + Math.random() * 20000);

      totalCeOi += ceOi;
      totalPeOi += peOi;
      totalCeVolume += ceVol;
      totalPeVolume += peVol;

      rows.push({
        strike,
        isAtm,
        distanceFromAtm,
        ce: {
          instrumentKey: ceTick?.instrumentKey || `NIFTY_${strike}_CE`,
          symbol: `NIFTY ${strike} CE`,
          strike,
          expiry: underlying.nearestExpiry,
          optionType: 'CE',
          moneyness: InstrumentService.classifyMoneyness(strike, atmStrike, 'CE'),
          ltp: ceLtp,
          change: ceChange,
          changePercent: ceChangePct,
          open: ceTick?.open ?? Number((ceLtp * 1.05).toFixed(2)),
          high: ceTick?.high ?? Number((ceLtp * 1.18).toFixed(2)),
          low: ceTick?.low ?? Number((ceLtp * 0.88).toFixed(2)),
          prevClose: ceTick?.prevClose ?? calcCePrev,
          bid: ceTick?.bidPrice ?? Number((ceLtp - 0.25).toFixed(2)),
          ask: ceTick?.askPrice ?? Number((ceLtp + 0.25).toFixed(2)),
          volume: ceVol,
          oi: ceOi,
          oiChange: ceTick?.oiChange ?? -3200,
          iv: 13.5,
          delta: 0.5,
          theta: -8,
          gamma: 0.002,
          vega: 12,
          lastUpdate: ceTick?.receivedTimestamp ?? this.lastUpdate,
          isStale: false,
        },
        pe: {
          instrumentKey: peTick?.instrumentKey || `NIFTY_${strike}_PE`,
          symbol: `NIFTY ${strike} PE`,
          strike,
          expiry: underlying.nearestExpiry,
          optionType: 'PE',
          moneyness: InstrumentService.classifyMoneyness(strike, atmStrike, 'PE'),
          ltp: peLtp,
          change: peChange,
          changePercent: peChangePct,
          open: peTick?.open ?? Number((peLtp * 0.96).toFixed(2)),
          high: peTick?.high ?? Number((peLtp * 1.15).toFixed(2)),
          low: peTick?.low ?? Number((peLtp * 0.85).toFixed(2)),
          prevClose: peTick?.prevClose ?? calcPePrev,
          bid: peTick?.bidPrice ?? Number((peLtp - 0.25).toFixed(2)),
          ask: peTick?.askPrice ?? Number((peLtp + 0.25).toFixed(2)),
          volume: peVol,
          oi: peOi,
          oiChange: peTick?.oiChange ?? 1800,
          iv: 13.5,
          delta: -0.5,
          theta: -8,
          gamma: 0.002,
          vega: 12,
          lastUpdate: peTick?.receivedTimestamp ?? this.lastUpdate,
          isStale: false,
        }
      });
    }

    const oiPcr = InstrumentService.calculatePCR(totalPeOi, totalCeOi);
    const volumePcr = InstrumentService.calculatePCR(totalPeVolume, totalCeVolume);
    const maxPain = InstrumentService.calculateMaxPain(
      rows.map(r => ({ strike: r.strike, ceOi: r.ce.oi || 0, peOi: r.pe.oi || 0 }))
    );

    return {
      underlying,
      selectedExpiry: underlying.nearestExpiry,
      atmStrike,
      strikeInterval,
      rows,
      totalCeOi,
      totalPeOi,
      totalCeVolume,
      totalPeVolume,
      oiPcr,
      volumePcr,
      maxPainStrike: maxPain || atmStrike,
      supportStrike: atmStrike - 100,
      resistanceStrike: atmStrike + 100,
      provider: this.activeProvider,
      dataFreshness: this.activeProvider === 'mock' ? 'SIMULATED' : 'LIVE',
      timestamp: this.lastUpdate,
    };
  }

  private findContractTick(strike: number, type: 'CE' | 'PE', expiry: string): NormalizedMarketTick | undefined {
    const exp = expiry || this.selectedExpiry;
    for (const tick of this.ticksMap.values()) {
      if (tick.strike === strike && tick.optionType === type) {
        if (!tick.expiry || tick.expiry === exp || tick.expiry === angelToIsoExpiry(exp) || tick.expiry === isoToAngelExpiry(exp)) {
          return tick;
        }
      }
    }
    const contract = this.instrumentService.findContract(strike, type, exp);
    if (contract && this.ticksMap.has(contract.token)) {
      return this.ticksMap.get(contract.token);
    }
    const angelContract = angelScripService.getContract(strike, type, exp);
    if (angelContract && this.ticksMap.has(angelContract.token)) {
      return this.ticksMap.get(angelContract.token);
    }
    return undefined;
  }

  public getIndicators(): TechnicalIndicatorData | null {
    return this.indicators;
  }

  public getSignal(): SignalOutput | null {
    return this.signal;
  }

  public getActiveProvider(): BrokerProvider {
    return this.activeProvider;
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  public getStatusMessage(): string {
    return this.statusMessage;
  }

  // ----------------------------------------------------------------------------
  // Stored Credentials
  // ----------------------------------------------------------------------------
  public saveUpstoxCredentials(creds: UpstoxStoredCreds): void {
    localStorage.setItem('nifty_upstox_creds', JSON.stringify(creds));
  }

  public getUpstoxCredentials(): UpstoxStoredCreds | null {
    try {
      const s = localStorage.getItem('nifty_upstox_creds');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  public saveAngelOneCredentials(creds: AngelOneStoredCreds): void {
    localStorage.setItem('nifty_angelone_creds', JSON.stringify(creds));
  }

  public getAngelOneCredentials(): AngelOneStoredCreds | null {
    try {
      const s = localStorage.getItem('nifty_angelone_creds');
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed && (parsed.apiKey || parsed.jwtToken)) return parsed;
      }
      const envKey = (import.meta as any).env?.VITE_ANGELONE_API_KEY;
      const envClient = (import.meta as any).env?.VITE_ANGELONE_CLIENT_CODE;
      const envJwt = (import.meta as any).env?.VITE_ANGELONE_JWT_TOKEN;
      const envPin = (import.meta as any).env?.VITE_ANGELONE_PASSWORD;
      const envTotp = (import.meta as any).env?.VITE_ANGELONE_TOTP_KEY;
      if (envKey || envJwt) {
        return {
          apiKey: envKey || '',
          clientCode: envClient || '',
          password: envPin,
          totp: envTotp,
          jwtToken: envJwt,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  public deleteCredentials(provider: BrokerProvider): void {
    if (provider === 'upstox') localStorage.removeItem('nifty_upstox_creds');
    if (provider === 'angelone') localStorage.removeItem('nifty_angelone_creds');
    if (this.activeProvider === provider) {
      this.startMockFeed();
    }
  }

  public subscribe(listener: MarketDataListener): () => void {
    this.listeners.add(listener);
    listener({
      underlying: this.getUnderlyingSnapshot(),
      optionChain: this.getOptionChainSnapshot(),
      indicators: this.indicators,
      signal: this.signal,
      provider: this.activeProvider,
      status: this.connectionStatus,
      statusMessage: this.statusMessage,
      latencyMs: 14,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(latencyMs = 14): void {
    const payload = {
      underlying: this.getUnderlyingSnapshot(),
      optionChain: this.getOptionChainSnapshot(),
      indicators: this.indicators,
      signal: this.signal,
      provider: this.activeProvider,
      status: this.connectionStatus,
      statusMessage: this.statusMessage,
      latencyMs,
    };
    for (const l of this.listeners) l(payload);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isRequestInFlight = false;
  }
}

export const brokerService = new BrokerService();
