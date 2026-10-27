// ==============================================================================
// Central Real-Time Market Data Engine & Streaming Hub
// Normalizes feeds, builds Option Chain, drives indicators and broadcasts to WS
// ==============================================================================

import WebSocket from 'ws';
import { 
  BrokerProvider, ConnectionStatus, NormalizedMarketTick, 
  OptionChainRow, OptionChainSnapshot, UnderlyingSnapshot, 
  TechnicalIndicatorData, SignalOutput, Candle, MarketStatus 
} from '../types/market.js';
import { IBrokerAdapter } from '../providers/BaseAdapter.js';
import { MockMarketAdapter } from '../providers/mock/MockMarketAdapter.js';
import { AngelOneAdapter, AngelOneCredentials } from '../providers/angelone/AngelOneAdapter.js';
import { UpstoxAdapter, UpstoxCredentials } from '../providers/upstox/UpstoxAdapter.js';
import { InstrumentService } from './InstrumentService.js';
import { IndicatorService } from '../indicators/IndicatorService.js';
import { SignalService } from '../signals/SignalService.js';
import { PaperTradingService } from '../paper-trading/PaperTradingService.js';

export class MarketDataService {
  private activeProvider: BrokerProvider = 'mock';
  private adapter: IBrokerAdapter;
  private instrumentService: InstrumentService = new InstrumentService();
  private paperTradingService: PaperTradingService;
  private wsClients: Set<WebSocket> = new Set();

  // In-memory bounded market caches
  private currentSpotPrice: number = 24425.50;
  private spotOpen: number = 24380.00;
  private spotHigh: number = 24470.20;
  private spotLow: number = 24340.50;
  private spotPrevClose: number = 24360.00;
  private spotVolume: number = 4500000;
  private selectedExpiry: string = '';
  private currentAtmStrike: number = 24450;
  private lastTickTime: string = new Date().toISOString();
  private tickCount: number = 0;
  private ticksMap: Map<string, NormalizedMarketTick> = new Map();
  private spotCandles: Candle[] = [];
  private indicators: TechnicalIndicatorData | null = null;
  private latestSignal: SignalOutput | null = null;

  constructor(paperTradingService: PaperTradingService) {
    this.paperTradingService = paperTradingService;
    // Default to high-fidelity mock adapter so app is instantly usable out-of-the-box
    this.adapter = new MockMarketAdapter();
    this.initAdapter();
    this.initSeedCandles();
  }

  private initSeedCandles(): void {
    // Generate initial 30 5-minute candles around spot for instant indicator generation
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = 300; // 5m
    let price = 24360;

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

  public async setProvider(
    provider: BrokerProvider, 
    credentials?: AngelOneCredentials | UpstoxCredentials
  ): Promise<boolean> {
    if (this.adapter) {
      await this.adapter.disconnect();
    }

    this.activeProvider = provider;
    if (provider === 'angelone') {
      this.adapter = new AngelOneAdapter(credentials as AngelOneCredentials);
    } else if (provider === 'upstox') {
      this.adapter = new UpstoxAdapter(credentials as UpstoxCredentials);
    } else {
      this.adapter = new MockMarketAdapter();
    }

    this.initAdapter();
    const success = await this.adapter.connect();

    // Refresh instruments
    const insts = await this.adapter.fetchInstruments();
    if (insts && insts.length > 0) {
      this.instrumentService.loadInstruments(insts);
      const expiries = this.instrumentService.getAvailableExpiries();
      if (expiries.length > 0 && !this.selectedExpiry) {
        this.selectedExpiry = expiries[0];
      }
    }

    this.broadcastStatus();
    return success;
  }

  public getActiveProvider(): BrokerProvider {
    return this.activeProvider;
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.adapter.getStatus();
  }

  public registerClient(ws: WebSocket): void {
    this.wsClients.add(ws);
    // Send immediate initial state
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      provider: this.activeProvider,
      status: this.adapter.getStatus(),
      underlying: this.getUnderlyingSnapshot(),
      optionChain: this.getOptionChainSnapshot(),
      indicators: this.indicators,
      signal: this.latestSignal,
    }));

    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  public setExpiry(expiry: string): void {
    this.selectedExpiry = expiry;
    this.broadcastOptionChain();
  }

  public getUnderlyingSnapshot(): UnderlyingSnapshot {
    const change = Number((this.currentSpotPrice - this.spotPrevClose).toFixed(2));
    const changePercent = Number(((change / this.spotPrevClose) * 100).toFixed(2));
    const expiries = this.instrumentService.getAvailableExpiries();
    
    // Determine market status: NSE Trading Hours 09:15 to 15:30 IST
    const now = new Date();
    // Convert to IST
    const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
    const istMinutes = (now.getUTCMinutes() + 30) % 60;
    const istTotalMins = istHours * 60 + istMinutes;

    let marketStatus: MarketStatus = 'OPEN';
    if (istTotalMins >= 540 && istTotalMins < 555) marketStatus = 'PRE-OPEN'; // 9:00 - 9:15
    else if (istTotalMins >= 555 && istTotalMins <= 930) marketStatus = 'OPEN'; // 9:15 - 15:30
    else marketStatus = 'CLOSED';

    if (this.activeProvider === 'mock') {
      marketStatus = 'OPEN'; // Always active in sandbox mode
    }

    return {
      symbol: 'NIFTY 50',
      spotPrice: this.currentSpotPrice,
      change,
      changePercent,
      open: this.spotOpen,
      high: this.spotHigh,
      low: this.spotLow,
      prevClose: this.spotPrevClose,
      atmStrike: this.currentAtmStrike,
      nearestExpiry: this.selectedExpiry || expiries[0] || '2026-10-29',
      availableExpiries: expiries.length > 0 ? expiries : [this.selectedExpiry || '2026-10-29'],
      indiaVix: 13.82,
      marketStatus,
      lastUpdate: this.lastTickTime,
      isSimulated: this.activeProvider === 'mock',
    };
  }

  public getOptionChainSnapshot(rangeCount: number = 10): OptionChainSnapshot {
    const underlying = this.getUnderlyingSnapshot();
    let availableStrikes = this.instrumentService.getStrikesForExpiry(underlying.nearestExpiry);

    // Fallback if strikes not yet loaded
    if (availableStrikes.length === 0) {
      availableStrikes = [];
      for (let s = 24000; s <= 24800; s += 50) availableStrikes.push(s);
    }

    // Dynamic ATM strike calculation: Nearest listed strike to current spot
    const atmStrike = InstrumentService.calculateATMStrike(this.currentSpotPrice, availableStrikes);
    this.currentAtmStrike = atmStrike;

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

      // Find CE tick
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
          iv: ceTick?.iv ?? null,
          delta: ceTick?.delta ?? null,
          theta: ceTick?.theta ?? null,
          gamma: ceTick?.gamma ?? null,
          vega: ceTick?.vega ?? null,
          lastUpdate: ceTick?.receivedTimestamp ?? null,
          isStale: ceTick ? ceTick.isStale : false,
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
          iv: peTick?.iv ?? null,
          delta: peTick?.delta ?? null,
          theta: peTick?.theta ?? null,
          gamma: peTick?.gamma ?? null,
          vega: peTick?.vega ?? null,
          lastUpdate: peTick?.receivedTimestamp ?? null,
          isStale: peTick ? peTick.isStale : false,
        }
      });
    }

    const oiPcr = InstrumentService.calculatePCR(totalPeOi, totalCeOi);
    const volumePcr = InstrumentService.calculatePCR(totalPeVolume, totalCeVolume);

    const maxPain = InstrumentService.calculateMaxPain(
      rows.map(r => ({ strike: r.strike, ceOi: r.ce.oi || 0, peOi: r.pe.oi || 0 }))
    );

    // Support (highest Put OI strike) and Resistance (highest Call OI strike)
    let maxPutOi = -1;
    let supportStrike = atmStrike - 100;
    let maxCallOi = -1;
    let resistanceStrike = atmStrike + 100;

    for (const r of rows) {
      if ((r.pe.oi || 0) > maxPutOi) {
        maxPutOi = r.pe.oi || 0;
        supportStrike = r.strike;
      }
      if ((r.ce.oi || 0) > maxCallOi) {
        maxCallOi = r.ce.oi || 0;
        resistanceStrike = r.strike;
      }
    }

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
      supportStrike,
      resistanceStrike,
      provider: this.activeProvider,
      dataFreshness: this.activeProvider === 'mock' ? 'SIMULATED' : 'LIVE',
      timestamp: this.lastTickTime,
    };
  }

  public getIndicators(): TechnicalIndicatorData | null {
    return this.indicators;
  }

  public getLatestSignal(): SignalOutput | null {
    return this.latestSignal;
  }

  private findContractTick(strike: number, type: 'CE' | 'PE', expiry: string): NormalizedMarketTick | undefined {
    for (const tick of this.ticksMap.values()) {
      if (tick.strike === strike && tick.optionType === type) {
        if (!tick.expiry || tick.expiry === expiry) return tick;
      }
    }
    return undefined;
  }

  private initAdapter(): void {
    this.adapter.onTick((tick: NormalizedMarketTick) => {
      this.handleIncomingTick(tick);
    });

    this.adapter.onStatusChange((status: ConnectionStatus, msg?: string) => {
      this.broadcastStatus(status, msg);
    });
  }

  private handleIncomingTick(tick: NormalizedMarketTick): void {
    this.tickCount++;
    this.lastTickTime = tick.receivedTimestamp;
    this.ticksMap.set(tick.instrumentKey, tick);

    // If spot tick
    if (tick.instrumentType === 'INDEX' || tick.tradingSymbol === 'NIFTY 50') {
      this.currentSpotPrice = tick.ltp;
      if (tick.open) this.spotOpen = tick.open;
      if (tick.high) this.spotHigh = tick.high;
      if (tick.low) this.spotLow = tick.low;
      if (tick.prevClose) this.spotPrevClose = tick.prevClose;
      if (tick.volume) this.spotVolume = tick.volume;

      this.updateSpotCandle(tick.ltp);
      this.recalculateIndicators();
    }

    // Mark to market paper trading portfolio
    const ltpMap = new Map<string, number>();
    ltpMap.set(tick.instrumentKey, tick.ltp);
    ltpMap.set(tick.tradingSymbol, tick.ltp);
    this.paperTradingService.updateMarkToMarket(ltpMap);

    // Throttle broadcasting to web clients (every 500ms or on key spot update)
    if (this.tickCount % 2 === 0 || tick.instrumentType === 'INDEX') {
      this.broadcastTick(tick);
    }
  }

  private updateSpotCandle(spot: number): void {
    const nowSec = Math.floor(Date.now() / 1000);
    const candleDuration = 300; // 5 min
    const currentBucket = Math.floor(nowSec / candleDuration) * candleDuration;

    const lastCandle = this.spotCandles[this.spotCandles.length - 1];
    if (lastCandle && lastCandle.time === currentBucket) {
      lastCandle.high = Math.max(lastCandle.high, spot);
      lastCandle.low = Math.min(lastCandle.low, spot);
      lastCandle.close = spot;
    } else {
      this.spotCandles.push({
        timestamp: new Date().toISOString(),
        time: currentBucket,
        open: spot,
        high: spot,
        low: spot,
        close: spot,
        volume: 15000,
      });
      // Keep bounded last 100 candles
      if (this.spotCandles.length > 100) {
        this.spotCandles.shift();
      }
    }
  }

  private recalculateIndicators(): void {
    this.indicators = IndicatorService.computeIndicatorSnapshot(
      this.spotCandles,
      '5m',
      this.spotPrevClose,
      'NIFTY 50'
    );

    const chain = this.getOptionChainSnapshot(5);
    this.latestSignal = SignalService.evaluateSignal({
      underlyingPrice: this.currentSpotPrice,
      atmStrike: this.currentAtmStrike,
      expiry: chain.selectedExpiry,
      indicators: this.indicators,
      chain,
      feedFreshness: this.activeProvider === 'mock' ? 'SIMULATED' : 'LIVE',
    });
  }

  private broadcastTick(tick: NormalizedMarketTick): void {
    const msg = JSON.stringify({
      type: 'TICK',
      tick,
      underlying: this.getUnderlyingSnapshot(),
      atmStrike: this.currentAtmStrike,
      signal: this.latestSignal,
    });
    this.sendToAllClients(msg);
  }

  private broadcastOptionChain(): void {
    const msg = JSON.stringify({
      type: 'OPTION_CHAIN_UPDATE',
      chain: this.getOptionChainSnapshot(),
    });
    this.sendToAllClients(msg);
  }

  private broadcastStatus(status?: ConnectionStatus, message?: string): void {
    const msg = JSON.stringify({
      type: 'BROKER_STATUS',
      provider: this.activeProvider,
      status: status || this.adapter.getStatus(),
      message,
    });
    this.sendToAllClients(msg);
  }

  private sendToAllClients(data: string): void {
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
