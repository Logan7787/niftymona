// ==============================================================================
// Realistic High-Fidelity Mock Market Data Provider
// Used for sandbox development, unit testing, and offline demonstration
// ==============================================================================

import { BrokerProvider, ConnectionStatus, NormalizedMarketTick } from '../../types/market.js';
import { IBrokerAdapter, StatusCallback, TickCallback } from '../BaseAdapter.js';
import { ListedInstrument } from '../../services/InstrumentService.js';

export class MockMarketAdapter implements IBrokerAdapter {
  public readonly provider: BrokerProvider = 'mock';
  private status: ConnectionStatus = 'disconnected';
  private tickCallbacks: TickCallback[] = [];
  private statusCallbacks: StatusCallback[] = [];
  private intervalTimer: NodeJS.Timeout | null = null;
  private spotPrice: number = 24425.50;
  private dayOpen: number = 24380.00;
  private dayHigh: number = 24470.20;
  private dayLow: number = 24340.50;
  private prevClose: number = 24360.00;
  private subscribedTokens: Set<string> = new Set();
  private mockInstruments: ListedInstrument[] = [];

  constructor() {
    this.generateMockInstruments();
  }

  private generateMockInstruments(): void {
    const today = new Date();
    // Next Thursday expiry
    const dayOfWeek = today.getDay();
    const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
    const expiryDate = new Date(today);
    expiryDate.setDate(today.getDate() + daysUntilThursday);
    const expiryStr = expiryDate.toISOString().split('T')[0];

    this.mockInstruments = [
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

    // Strikes from 24000 to 24800 in steps of 50
    for (let strike = 24000; strike <= 24800; strike += 50) {
      this.mockInstruments.push({
        token: `NIFTY_${strike}_CE`,
        symbol: `NIFTY ${strike} CE`,
        name: 'NIFTY',
        expiry: expiryStr,
        strike,
        lotSize: 25,
        instrumentType: 'CE',
        exchange: 'NFO',
        tickSize: 0.05,
      });

      this.mockInstruments.push({
        token: `NIFTY_${strike}_PE`,
        symbol: `NIFTY ${strike} PE`,
        name: 'NIFTY',
        expiry: expiryStr,
        strike,
        lotSize: 25,
        instrumentType: 'PE',
        exchange: 'NFO',
        tickSize: 0.05,
      });
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public async connect(_credentials?: any): Promise<boolean> {
    this.status = 'authenticating';
    this.notifyStatus('authenticating', 'Initializing simulated feed engine...');

    await new Promise(r => setTimeout(r, 600));

    this.status = 'connected';
    this.notifyStatus('connected', 'Simulated Live Feed Active');

    this.startStreaming();
    return true;
  }

  public async disconnect(): Promise<void> {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.status = 'disconnected';
    this.notifyStatus('disconnected', 'Simulated feed stopped.');
  }

  public async subscribe(tokens: string[]): Promise<void> {
    for (const t of tokens) this.subscribedTokens.add(t);
  }

  public async unsubscribe(tokens: string[]): Promise<void> {
    for (const t of tokens) this.subscribedTokens.delete(t);
  }

  public onTick(callback: TickCallback): void {
    this.tickCallbacks.push(callback);
  }

  public onStatusChange(callback: StatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  public async fetchInstruments(): Promise<ListedInstrument[]> {
    return this.mockInstruments;
  }

  public async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    return {
      success: true,
      message: 'Simulated connection test passed successfully.',
      details: {
        latencyMs: 12,
        activeInstruments: this.mockInstruments.length,
      }
    };
  }

  private notifyStatus(status: ConnectionStatus, message?: string): void {
    for (const cb of this.statusCallbacks) cb(status, message);
  }

  private startStreaming(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer);

    this.intervalTimer = setInterval(() => {
      if (this.status !== 'connected') return;

      // Realistic random walk for spot (-3 to +3 points)
      const delta = (Math.random() - 0.49) * 4.5;
      this.spotPrice = Number(Math.max(24200, Math.min(24700, this.spotPrice + delta)).toFixed(2));
      this.dayHigh = Math.max(this.dayHigh, this.spotPrice);
      this.dayLow = Math.min(this.dayLow, this.spotPrice);

      const now = new Date().toISOString();

      // Emit spot tick
      const spotTick: NormalizedMarketTick = {
        provider: 'mock',
        exchange: 'NSE',
        instrumentKey: '99926000',
        tradingSymbol: 'NIFTY 50',
        instrumentType: 'INDEX',
        ltp: this.spotPrice,
        open: this.dayOpen,
        high: this.dayHigh,
        low: this.dayLow,
        close: this.spotPrice,
        prevClose: this.prevClose,
        priceChange: Number((this.spotPrice - this.prevClose).toFixed(2)),
        changePercent: Number((((this.spotPrice - this.prevClose) / this.prevClose) * 100).toFixed(2)),
        volume: Math.floor(4500000 + Math.random() * 50000),
        exchangeTimestamp: now,
        receivedTimestamp: now,
        isStale: false,
      };

      for (const cb of this.tickCallbacks) cb(spotTick);

      // Emit option ticks for all listed strikes
      for (const inst of this.mockInstruments) {
        if (inst.instrumentType === 'INDEX') continue;

        const intrinsic = inst.instrumentType === 'CE'
          ? Math.max(0, this.spotPrice - inst.strike)
          : Math.max(0, inst.strike - this.spotPrice);

        // Approximate Black-Scholes premium
        const timeValue = Math.max(8, 120 - Math.abs(this.spotPrice - inst.strike) * 0.28);
        const ltp = Number(Math.max(0.5, intrinsic + timeValue + (Math.random() - 0.5) * 3).toFixed(2));

        const baseOi = Math.floor(65000 + (1000 - Math.abs(this.spotPrice - inst.strike)) * 80);
        const oi = Math.max(1000, baseOi + Math.floor((Math.random() - 0.5) * 2000));
        const oiChange = Math.floor((Math.random() - 0.48) * 4500);

        const tick: NormalizedMarketTick = {
          provider: 'mock',
          exchange: 'NFO',
          instrumentKey: inst.token,
          tradingSymbol: inst.symbol,
          instrumentType: inst.instrumentType,
          strike: inst.strike,
          expiry: inst.expiry,
          optionType: inst.instrumentType as any,
          ltp,
          open: Number((ltp * 0.96).toFixed(2)),
          high: Number((ltp * 1.08).toFixed(2)),
          low: Number((ltp * 0.92).toFixed(2)),
          close: ltp,
          prevClose: Number((ltp * 0.97).toFixed(2)),
          priceChange: Number(((Math.random() - 0.5) * 6).toFixed(2)),
          changePercent: Number(((Math.random() - 0.5) * 5).toFixed(2)),
          volume: Math.floor(120000 + Math.random() * 8000),
          oi,
          prevOi: oi - oiChange,
          oiChange,
          oiChangePercent: Number(((oiChange / (oi || 1)) * 100).toFixed(2)),
          bidPrice: Number((ltp - 0.15).toFixed(2)),
          bidQty: 1800,
          askPrice: Number((ltp + 0.15).toFixed(2)),
          askQty: 2250,
          iv: Number((13.5 + Math.random() * 1.5).toFixed(1)),
          delta: inst.instrumentType === 'CE' ? 0.52 : -0.48,
          theta: -12.4,
          gamma: 0.002,
          vega: 18.2,
          exchangeTimestamp: now,
          receivedTimestamp: now,
          isStale: false,
        };

        for (const cb of this.tickCallbacks) cb(tick);
      }
    }, 1000);
  }
}
