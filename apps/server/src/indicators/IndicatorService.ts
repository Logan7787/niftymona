// ==============================================================================
// Quantitative Technical Analysis Indicator Service
// Computes EMA, VWAP, RSI, MACD, ATR, Opening Range & Pivot S/R
// ==============================================================================

import { Candle, TechnicalIndicatorData } from '../types/market.js';

export class IndicatorService {
  /**
   * Exponential Moving Average (EMA):
   * Multiplier: 2 / (period + 1)
   * EMA_today = (Price_today * Multiplier) + (EMA_yesterday * (1 - Multiplier))
   */
  public static calculateEMA(values: number[], period: number): number | null {
    if (!values || values.length < period) return null;

    const multiplier = 2 / (period + 1);

    // Seed with Simple Moving Average of initial period
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] * multiplier) + (ema * (1 - multiplier));
    }

    return Number(ema.toFixed(2));
  }

  /**
   * Volume-Weighted Average Price (VWAP):
   * VWAP = Sum(Typical Price * Volume) / Sum(Volume)
   * Typical Price = (High + Low + Close) / 3
   */
  public static calculateVWAP(candles: Candle[]): number | null {
    if (!candles || candles.length === 0) return null;

    let totalTypicalVolume = 0;
    let totalVolume = 0;

    for (const c of candles) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      const vol = Math.max(1, c.volume);
      totalTypicalVolume += typicalPrice * vol;
      totalVolume += vol;
    }

    if (totalVolume === 0) return null;
    return Number((totalTypicalVolume / totalVolume).toFixed(2));
  }

  /**
   * Relative Strength Index (RSI 14) using Wilder's Smoothing:
   * RS = Average Gain / Average Loss
   * RSI = 100 - (100 / (1 + RS))
   */
  public static calculateRSI(closes: number[], period: number = 14): number | null {
    if (!closes || closes.length <= period) return null;

    let gains = 0;
    let losses = 0;

    // Initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Wilder's smoothing
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return Number(rsi.toFixed(2));
  }

  /**
   * Moving Average Convergence Divergence (MACD 12, 26, 9):
   * MACD Line = EMA(12) - EMA(26)
   * Signal Line = EMA(9) of MACD Line
   * Histogram = MACD Line - Signal Line
   */
  public static calculateMACD(
    closes: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { macdLine: number | null; signalLine: number | null; histogram: number | null } {
    if (!closes || closes.length < slowPeriod + signalPeriod) {
      return { macdLine: null, signalLine: null, histogram: null };
    }

    // Build series of MACD line values
    const macdSeries: number[] = [];
    const multiplierFast = 2 / (fastPeriod + 1);
    const multiplierSlow = 2 / (slowPeriod + 1);

    // Initial seeds
    let emaFast = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
    for (let i = fastPeriod; i < slowPeriod; i++) {
      emaFast = (closes[i] * multiplierFast) + (emaFast * (1 - multiplierFast));
    }

    let emaSlow = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;

    macdSeries.push(emaFast - emaSlow);

    for (let i = slowPeriod; i < closes.length; i++) {
      emaFast = (closes[i] * multiplierFast) + (emaFast * (1 - multiplierFast));
      emaSlow = (closes[i] * multiplierSlow) + (emaSlow * (1 - multiplierSlow));
      macdSeries.push(emaFast - emaSlow);
    }

    const currentMacd = macdSeries[macdSeries.length - 1];
    const signalLine = this.calculateEMA(macdSeries, signalPeriod);

    if (signalLine === null) {
      return { macdLine: Number(currentMacd.toFixed(2)), signalLine: null, histogram: null };
    }

    const histogram = currentMacd - signalLine;

    return {
      macdLine: Number(currentMacd.toFixed(2)),
      signalLine: Number(signalLine.toFixed(2)),
      histogram: Number(histogram.toFixed(2)),
    };
  }

  /**
   * Average True Range (ATR 14):
   * True Range (TR) = Max(High - Low, |High - Close_prev|, |Low - Close_prev|)
   * ATR = Wilder's smoothing of TR
   */
  public static calculateATR(candles: Candle[], period: number = 14): number | null {
    if (!candles || candles.length <= period) return null;

    const trValues: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i];
      const prev = candles[i - 1];
      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prev.close),
        Math.abs(cur.low - prev.close)
      );
      trValues.push(tr);
    }

    if (trValues.length < period) return null;

    let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trValues.length; i++) {
      atr = (atr * (period - 1) + trValues[i]) / period;
    }

    return Number(atr.toFixed(2));
  }

  /**
   * Derives Classical Pivot Points for Support and Resistance:
   * Pivot (P) = (High + Low + Close) / 3
   * Resistance 1 (R1) = (2 * P) - Low
   * Support 1 (S1) = (2 * P) - High
   */
  public static calculatePivotLevels(high: number, low: number, close: number): {
    pivot: number;
    r1: number;
    r2: number;
    s1: number;
    s2: number;
  } {
    const pivot = (high + low + close) / 3;
    const r1 = (2 * pivot) - low;
    const s1 = (2 * pivot) - high;
    const r2 = pivot + (high - low);
    const s2 = pivot - (high - low);

    return {
      pivot: Number(pivot.toFixed(2)),
      r1: Number(r1.toFixed(2)),
      r2: Number(r2.toFixed(2)),
      s1: Number(s1.toFixed(2)),
      s2: Number(s2.toFixed(2)),
    };
  }

  /**
   * Computes full indicator snapshot from a list of candles
   */
  public static computeIndicatorSnapshot(
    candles: Candle[],
    timeframe: '1m' | '3m' | '5m' | '15m',
    prevClose: number,
    sourceInstrument: string = 'NIFTY 50'
  ): TechnicalIndicatorData {
    const closes = candles.map(c => c.close);
    const dayHigh = candles.length > 0 ? Math.max(...candles.map(c => c.high)) : prevClose;
    const dayLow = candles.length > 0 ? Math.min(...candles.map(c => c.low)) : prevClose;

    // First 3 candles define opening range
    const openingCandles = candles.slice(0, 3);
    const openingRange = {
      high: openingCandles.length > 0 ? Math.max(...openingCandles.map(c => c.high)) : dayHigh,
      low: openingCandles.length > 0 ? Math.min(...openingCandles.map(c => c.low)) : dayLow,
    };

    const pivots = this.calculatePivotLevels(dayHigh, dayLow, closes[closes.length - 1] || prevClose);

    return {
      timeframe,
      candles,
      ema9: this.calculateEMA(closes, 9),
      ema20: this.calculateEMA(closes, 20),
      ema50: this.calculateEMA(closes, 50),
      vwap: this.calculateVWAP(candles),
      rsi14: this.calculateRSI(closes, 14),
      macd: this.calculateMACD(closes, 12, 26, 9),
      atr14: this.calculateATR(candles, 14),
      dayHigh: Number(dayHigh.toFixed(2)),
      dayLow: Number(dayLow.toFixed(2)),
      prevClose,
      openingRange: {
        high: Number(openingRange.high.toFixed(2)),
        low: Number(openingRange.low.toFixed(2)),
      },
      support: pivots.s1,
      resistance: pivots.r1,
      sourceInstrument,
      lastUpdate: new Date().toISOString(),
    };
  }
}
