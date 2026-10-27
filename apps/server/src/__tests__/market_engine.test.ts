// ==============================================================================
// Unit & Integration Test Suite for Quantitative Engine
// Tests ATM strike, moneyness, PCR, indicators, signals, paper trading & vault
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { InstrumentService } from '../services/InstrumentService.js';
import { IndicatorService } from '../indicators/IndicatorService.js';
import { SignalService } from '../signals/SignalService.js';
import { PaperTradingService } from '../paper-trading/PaperTradingService.js';
import { encryptCredentials, decryptCredentials, maskString } from '../security/vault.js';
import { Candle, OptionChainSnapshot } from '../types/market.js';

describe('1. Dynamic ATM Strike & Option Moneyness Calculations', () => {
  it('accurately identifies ATM strike as nearest valid listed strike', () => {
    const validStrikes = [24300, 24350, 24400, 24450, 24500];

    // Case 1: Spot closer to 24400
    expect(InstrumentService.calculateATMStrike(24386, validStrikes)).toBe(24400);

    // Case 2: Spot closer to 24350
    expect(InstrumentService.calculateATMStrike(24360, validStrikes)).toBe(24350);

    // Case 3: Exact strike match
    expect(InstrumentService.calculateATMStrike(24450, validStrikes)).toBe(24450);

    // Case 4: Spot higher than all strikes selects highest listed strike
    expect(InstrumentService.calculateATMStrike(24600, validStrikes)).toBe(24500);
  });

  it('correctly classifies Call and Put moneyness (ITM, ATM, OTM)', () => {
    const atm = 24400;

    // CE: lower strike = ITM, higher strike = OTM
    expect(InstrumentService.classifyMoneyness(24350, atm, 'CE')).toBe('ITM');
    expect(InstrumentService.classifyMoneyness(24400, atm, 'CE')).toBe('ATM');
    expect(InstrumentService.classifyMoneyness(24450, atm, 'CE')).toBe('OTM');

    // PE: higher strike = ITM, lower strike = OTM
    expect(InstrumentService.classifyMoneyness(24450, atm, 'PE')).toBe('ITM');
    expect(InstrumentService.classifyMoneyness(24400, atm, 'PE')).toBe('ATM');
    expect(InstrumentService.classifyMoneyness(24350, atm, 'PE')).toBe('OTM');
  });

  it('computes Put-Call Ratio (PCR) accurately', () => {
    expect(InstrumentService.calculatePCR(150000, 100000)).toBe(1.500);
    expect(InstrumentService.calculatePCR(85000, 100000)).toBe(0.850);
    expect(InstrumentService.calculatePCR(50000, 0)).toBe(0);
  });

  it('calculates Max Pain strike based on OI distribution', () => {
    const mockRows = [
      { strike: 24300, ceOi: 1000, peOi: 5000 },
      { strike: 24350, ceOi: 2000, peOi: 4000 },
      { strike: 24400, ceOi: 6000, peOi: 6000 },
      { strike: 24450, ceOi: 4000, peOi: 2000 },
      { strike: 24500, ceOi: 5000, peOi: 1000 },
    ];
    const maxPain = InstrumentService.calculateMaxPain(mockRows);
    expect(maxPain).toBe(24400);
  });
});

describe('2. Quantitative Technical Analysis Indicators', () => {
  it('calculates EMA with proper smoothing multiplier', () => {
    const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const ema9 = IndicatorService.calculateEMA(prices, 9);
    expect(ema9).not.toBeNull();
    expect(ema9).toBeGreaterThanOrEqual(16);
    expect(ema9).toBeLessThan(20);
  });

  it('calculates Volume Weighted Average Price (VWAP)', () => {
    const candles: Candle[] = [
      { timestamp: '', time: 1, open: 100, high: 105, low: 95, close: 100, volume: 1000 }, // TP = 100
      { timestamp: '', time: 2, open: 100, high: 110, low: 100, close: 105, volume: 2000 }, // TP = 105
    ];
    // (100 * 1000 + 105 * 2000) / 3000 = (100000 + 210000) / 3000 = 310000 / 3000 = 103.33
    const vwap = IndicatorService.calculateVWAP(candles);
    expect(vwap).toBe(103.33);
  });

  it('calculates RSI 14 in valid bounds (0 to 100)', () => {
    const series = [
      44, 44.5, 45, 43.5, 44, 44.2, 45.1, 46, 45.8, 46.5, 
      47, 47.5, 48, 48.5, 49, 49.5, 50, 50.5
    ];
    const rsi = IndicatorService.calculateRSI(series, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);
  });

  it('calculates MACD line, signal line, and histogram', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 24000 + Math.sin(i / 3) * 50);
    const macd = IndicatorService.calculateMACD(prices, 12, 26, 9);
    expect(macd.macdLine).not.toBeNull();
    expect(macd.signalLine).not.toBeNull();
    expect(macd.histogram).not.toBeNull();
  });
});

describe('3. ATM CE/PE Analysis & Rule-Based Signal Engine', () => {
  it('correctly tags BULLISH_BIAS when spot > VWAP, EMA bullish, and PCR > 1.05', () => {
    const mockChain: OptionChainSnapshot = {
      underlying: {
        symbol: 'NIFTY 50',
        spotPrice: 24450,
        change: 50,
        changePercent: 0.2,
        open: 24400,
        high: 24460,
        low: 24390,
        prevClose: 24400,
        atmStrike: 24450,
        nearestExpiry: '2026-10-29',
        availableExpiries: ['2026-10-29'],
        marketStatus: 'OPEN',
        lastUpdate: '',
        isSimulated: true,
      },
      selectedExpiry: '2026-10-29',
      atmStrike: 24450,
      strikeInterval: 50,
      rows: [{
        strike: 24450,
        isAtm: true,
        distanceFromAtm: 0,
        ce: { instrumentKey: 'c1', symbol: 'NIFTY 24450 CE', strike: 24450, expiry: '2026-10-29', optionType: 'CE', moneyness: 'ATM', ltp: 110, change: 10, changePercent: 10, bid: 109, ask: 111, volume: 50000, oi: 100000, oiChange: 5000, iv: 13, delta: 0.5, theta: -10, gamma: 0.002, vega: 15, lastUpdate: '', isStale: false },
        pe: { instrumentKey: 'p1', symbol: 'NIFTY 24450 PE', strike: 24450, expiry: '2026-10-29', optionType: 'PE', moneyness: 'ATM', ltp: 90, change: -10, changePercent: -10, bid: 89, ask: 91, volume: 45000, oi: 120000, oiChange: 8000, iv: 13, delta: -0.5, theta: -10, gamma: 0.002, vega: 15, lastUpdate: '', isStale: false },
      }],
      totalCeOi: 100000,
      totalPeOi: 120000,
      totalCeVolume: 50000,
      totalPeVolume: 45000,
      oiPcr: 1.20,
      volumePcr: 0.90,
      maxPainStrike: 24450,
      supportStrike: 24400,
      resistanceStrike: 24500,
      provider: 'mock',
      dataFreshness: 'LIVE',
      timestamp: '',
    };

    const signal = SignalService.evaluateSignal({
      underlyingPrice: 24450,
      atmStrike: 24450,
      expiry: '2026-10-29',
      indicators: {
        timeframe: '5m',
        candles: [],
        ema9: 24430,
        ema20: 24410,
        ema50: 24390,
        vwap: 24420,
        rsi14: 58,
        macd: { macdLine: 12, signalLine: 8, histogram: 4 },
        atr14: 25,
        dayHigh: 24460,
        dayLow: 24390,
        prevClose: 24400,
        openingRange: { high: 24430, low: 24400 },
        support: 24400,
        resistance: 24500,
        sourceInstrument: 'NIFTY 50',
        lastUpdate: '',
      },
      chain: mockChain,
      feedFreshness: 'LIVE',
    });

    expect(signal.direction).toBe('BULLISH_BIAS');
    expect(signal.suggestedContract).toContain('24450 CE');
    expect(signal.rulesPassed.length).toBeGreaterThanOrEqual(4);
  });
});

describe('4. Paper Trading Risk Engine & Lot Validation', () => {
  it('validates contract lot size and rejects invalid quantities', () => {
    const service = new PaperTradingService();
    const result = service.placeOrder({
      userId: 'test_user',
      tradingSymbol: 'NIFTY 24450 CE',
      instrumentKey: 'test_key',
      strikePrice: 24450,
      optionType: 'CE',
      expiry: '2026-10-29',
      lotSize: 25,
      numLots: 0, // Invalid
      action: 'BUY',
      entryPrice: 100,
    });
    expect(result.success).toBe(false);
  });

  it('tracks realized and unrealized P&L on position entry and exit', () => {
    const service = new PaperTradingService();
    const buyResult = service.placeOrder({
      userId: 'test_user_2',
      tradingSymbol: 'NIFTY 24450 CE',
      instrumentKey: 'test_key_2',
      strikePrice: 24450,
      optionType: 'CE',
      expiry: '2026-10-29',
      lotSize: 25,
      numLots: 2, // 50 qty
      action: 'BUY',
      entryPrice: 100, // Invested = 5000 + 20 fee = 5020
    });

    expect(buyResult.success).toBe(true);

    const closeResult = service.closePosition('test_user_2', buyResult.order!.id, 120);
    expect(closeResult.success).toBe(true);

    // Profit = (120 - 100) * 50 - 40 total brokerage = 1000 - 40 = 960
    expect(closeResult.order?.realizedPnl).toBe(960);
    const account = service.getOrCreateAccount('test_user_2');
    expect(account.totalRealizedPnl).toBe(960);
    expect(account.winningTrades).toBe(1);
    expect(account.winRatePercent).toBe(100);
  });
});

describe('5. Credential Security Vault (AES-256-GCM)', () => {
  it('safely encrypts and decrypts broker secrets at rest', () => {
    const secretPayload = {
      apiKey: 'test-api-key-9988',
      clientCode: 'CLI8899',
      password: 'SuperSecretPassword!@#',
    };

    const encrypted = encryptCredentials(secretPayload);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain('SuperSecretPassword');

    const decrypted = decryptCredentials<typeof secretPayload>(encrypted);
    expect(decrypted.apiKey).toBe(secretPayload.apiKey);
    expect(decrypted.clientCode).toBe(secretPayload.clientCode);
    expect(decrypted.password).toBe(secretPayload.password);
  });

  it('properly masks API keys and client codes for safe UI display', () => {
    expect(maskString('AB123456', 2, 2)).toBe('AB****56');
    expect(maskString('APIKEYSECRET99', 3, 3)).toBe('API********T99');
    expect(maskString(null)).toBe('N/A');
  });
});
