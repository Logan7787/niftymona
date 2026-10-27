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

class BrokerService {
  private activeProvider: BrokerProvider = 'mock';
  private connectionStatus: ConnectionStatus = 'connected';
  private statusMessage: string = 'Demo Sandbox Active';

  // Services
  public instrumentService = new InstrumentService();
  public paperTradingService = new PaperTradingService();

  // Market state
  private spotPrice: number = 22722.55;
  private spotOpen: number = 22708.80;
  private spotHigh: number = 22829.75;
  private spotLow: number = 22636.85;
  private spotPrevClose: number = 22753.20;
  private spotChange: number = -30.65;
  private spotChangePercent: number = -0.13;
  private spotVolume: number = 4500000;
  private selectedExpiry: string = '';
  private currentAtmStrike: number = 22700;
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
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = 300;
    let price = 22700;
    for (let i = 30; i >= 0; i--) {
      const time = now - (i * intervalSec);
      const delta = (Math.random() - 0.48) * 12;
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
    this.recalculateIndicators();
  }

  private restoreSavedSession(): void {
    try {
      const savedProvider = localStorage.getItem('nifty_active_provider') as BrokerProvider;
      const upstoxCreds = this.getUpstoxCredentials();
      if (savedProvider === 'upstox' && upstoxCreds?.accessToken) {
        this.connectUpstox(upstoxCreds);
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
            lotSize: 25,
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
            lotSize: c.lot_size || 25,
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
        lotSize: 25,
        instrumentType: 'INDEX',
        exchange: 'NSE',
        tickSize: 0.05,
      }
    ];

    for (let strike = 22400; strike <= 23100; strike += 50) {
      instruments.push(
        { token: `MOCK_${strike}_CE`, symbol: `NIFTY ${strike} CE`, name: 'NIFTY', expiry: mockExpiry, strike, lotSize: 25, instrumentType: 'CE', exchange: 'NFO', tickSize: 0.05 },
        { token: `MOCK_${strike}_PE`, symbol: `NIFTY ${strike} PE`, name: 'NIFTY', expiry: mockExpiry, strike, lotSize: 25, instrumentType: 'PE', exchange: 'NFO', tickSize: 0.05 }
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
      for (let s = 22400; s <= 23100; s += 50) {
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
    } else {
      this.spotCandles.push({
        timestamp: new Date().toISOString(),
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
    const activeExpiry = expiries.length > 0 
      ? (expiries.includes(this.selectedExpiry) ? this.selectedExpiry : expiries[0]) 
      : (this.selectedExpiry || '2026-10-27');

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
      availableExpiries: expiries.length > 0 ? expiries : [activeExpiry],
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

      if (ceTick?.oi) totalCeOi += ceTick.oi;
      if (peTick?.oi) totalPeOi += peTick.oi;
      if (ceTick?.volume) totalCeVolume += ceTick.volume;
      if (peTick?.volume) totalPeVolume += peTick.volume;

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
          ltp: ceTick?.ltp ?? null,
          change: ceTick?.priceChange ?? null,
          changePercent: ceTick?.changePercent ?? null,
          bid: ceTick?.bidPrice ?? null,
          ask: ceTick?.askPrice ?? null,
          volume: ceTick?.volume ?? null,
          oi: ceTick?.oi ?? null,
          oiChange: ceTick?.oiChange ?? null,
          iv: 13.5,
          delta: 0.5,
          theta: -8,
          gamma: 0.002,
          vega: 12,
          lastUpdate: ceTick?.receivedTimestamp ?? null,
          isStale: false,
        },
        pe: {
          instrumentKey: peTick?.instrumentKey || `NIFTY_${strike}_PE`,
          symbol: `NIFTY ${strike} PE`,
          strike,
          expiry: underlying.nearestExpiry,
          optionType: 'PE',
          moneyness: InstrumentService.classifyMoneyness(strike, atmStrike, 'PE'),
          ltp: peTick?.ltp ?? null,
          change: peTick?.priceChange ?? null,
          changePercent: peTick?.changePercent ?? null,
          bid: peTick?.bidPrice ?? null,
          ask: peTick?.askPrice ?? null,
          volume: peTick?.volume ?? null,
          oi: peTick?.oi ?? null,
          oiChange: peTick?.oiChange ?? null,
          iv: 13.5,
          delta: -0.5,
          theta: -8,
          gamma: 0.002,
          vega: 12,
          lastUpdate: peTick?.receivedTimestamp ?? null,
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
    for (const tick of this.ticksMap.values()) {
      if (tick.strike === strike && tick.optionType === type) {
        if (!tick.expiry || tick.expiry === expiry) return tick;
      }
    }
    const contract = this.instrumentService.findContract(strike, type, expiry);
    if (contract && this.ticksMap.has(contract.token)) {
      return this.ticksMap.get(contract.token);
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
      return s ? JSON.parse(s) : null;
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
