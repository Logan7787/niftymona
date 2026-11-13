// ==============================================================================
// Multi-Index Market & Prediction Service
// Generates and manages real-time quantitative predictions for:
// - NIFTY 50
// - BANK NIFTY
// - BSE SENSEX
// - NIFTY MIDCAP SELECT (MIDCPNIFTY)
// ==============================================================================

import {
  UnderlyingSnapshot, OptionChainSnapshot, TechnicalIndicatorData,
  OptionChainRow, OptionContractData, Moneyness
} from '../types/market';
import { PredictionEngine, MarketPredictionSummary, StrikePrediction } from './predictionEngine';
import { brokerService } from './brokerService';

export type SupportedIndex = 'NIFTY' | 'BANKNIFTY' | 'SENSEX' | 'MIDCPNIFTY';

export interface IndexConfig {
  id: SupportedIndex;
  name: string;
  exchange: 'NSE' | 'BSE';
  symbol: string;
  strikeStep: number;
  lotSize: number;
  defaultSpot: number;
  strikesCount: number;
  description: string;
  nearestExpiry: string;
  availableExpiries: string[];
}

export const INDEX_CONFIGS: Record<SupportedIndex, IndexConfig> = {
  NIFTY: {
    id: 'NIFTY',
    name: 'NIFTY 50',
    exchange: 'NSE',
    symbol: 'NIFTY',
    strikeStep: 50,
    lotSize: 65,
    defaultSpot: 25299.35,
    strikesCount: 16,
    description: 'National Stock Exchange Benchmark 50 Large-Cap Index',
    nearestExpiry: '2026-11-17',
    availableExpiries: ['2026-11-17', '2026-11-23', '2026-12-01', '2026-12-29'],
  },
  BANKNIFTY: {
    id: 'BANKNIFTY',
    name: 'BANK NIFTY',
    exchange: 'NSE',
    symbol: 'BANKNIFTY',
    strikeStep: 100,
    lotSize: 15,
    defaultSpot: 61518.50,
    strikesCount: 16,
    description: 'NSE Banking Sector Index (12 Liquid Banking Equities)',
    nearestExpiry: '2026-11-23',
    availableExpiries: ['2026-11-23', '2026-12-29', '2027-01-25'],
  },
  SENSEX: {
    id: 'SENSEX',
    name: 'BSE SENSEX',
    exchange: 'BSE',
    symbol: 'SENSEX',
    strikeStep: 100,
    lotSize: 10,
    defaultSpot: 81911.01,
    strikesCount: 16,
    description: 'Bombay Stock Exchange Benchmark 30 Blue-Chip Index',
    nearestExpiry: '2026-11-19',
    availableExpiries: ['2026-11-19', '2026-11-26', '2026-12-03', '2026-12-31'],
  },
  MIDCPNIFTY: {
    id: 'MIDCPNIFTY',
    name: 'NIFTY MIDCAP SELECT',
    exchange: 'NSE',
    symbol: 'MIDCPNIFTY',
    strikeStep: 25,
    lotSize: 75,
    defaultSpot: 14251.85,
    strikesCount: 16,
    description: 'NSE Midcap Select Index (Top 25 Liquid Mid-Cap Stocks)',
    nearestExpiry: '2026-11-23',
    availableExpiries: ['2026-11-23', '2026-12-29', '2027-01-25'],
  },
};

export class MultiIndexService {
  /**
   * Generates a fully calibrated UnderlyingSnapshot for a given index
   */
  public static getUnderlying(
    indexId: SupportedIndex,
    liveNiftyUnderlying?: UnderlyingSnapshot | null,
    multiIndexSnapshots?: Record<string, UnderlyingSnapshot> | null
  ): UnderlyingSnapshot {
    const config = INDEX_CONFIGS[indexId];
    const now = new Date().toISOString();

    // 1. Highest Priority: Live streaming snapshot from broker quote for this specific index
    // Validated against minimum plausible spot index threshold to guard against option premium pollution
    const minThreshold = indexId === 'NIFTY' ? 10000 : indexId === 'BANKNIFTY' ? 25000 : indexId === 'SENSEX' ? 35000 : 5000;
    if (multiIndexSnapshots && multiIndexSnapshots[indexId] && multiIndexSnapshots[indexId].spotPrice > minThreshold) {
      return multiIndexSnapshots[indexId];
    }

    // 2. Fallback for NIFTY if liveNiftyUnderlying was passed directly
    if (indexId === 'NIFTY' && liveNiftyUnderlying && liveNiftyUnderlying.spotPrice > 10000) {
      return liveNiftyUnderlying;
    }

    // 3. Fallback to calibrated benchmark reference snapshot
    const spot = config.defaultSpot;
    const atm = Math.round(spot / config.strikeStep) * config.strikeStep;
    const change = +(spot * 0.0042).toFixed(2);
    const changePercent = +((change / (spot - change)) * 100).toFixed(2);

    return {
      symbol: config.symbol,
      spotPrice: spot,
      change,
      changePercent,
      open: +(spot - change * 0.4).toFixed(2),
      high: +(spot + spot * 0.0055).toFixed(2),
      low: +(spot - spot * 0.0035).toFixed(2),
      dayHigh: +(spot + spot * 0.0055).toFixed(2),
      dayLow: +(spot - spot * 0.0035).toFixed(2),
      prevClose: +(spot - change).toFixed(2),
      atmStrike: atm,
      nearestExpiry: config.nearestExpiry,
      availableExpiries: config.availableExpiries,
      indiaVix: 13.82,
      marketStatus: 'OPEN',
      lastUpdate: now,
      isSimulated: true,
    };
  }

  /**
   * Generates Technical Indicators for an index
   */
  public static getIndicators(indexId: SupportedIndex): TechnicalIndicatorData {
    const config = INDEX_CONFIGS[indexId];
    const spot = config.defaultSpot;
    return {
      timeframe: '5m',
      candles: [],
      ema9: +(spot + spot * 0.0012).toFixed(2),
      ema20: +(spot - spot * 0.0008).toFixed(2),
      ema50: +(spot - spot * 0.0025).toFixed(2),
      vwap: +(spot - spot * 0.0015).toFixed(2),
      rsi14: indexId === 'BANKNIFTY' ? 58.4 : indexId === 'SENSEX' ? 52.8 : indexId === 'MIDCPNIFTY' ? 62.1 : 54.2,
      macd: {
        macdLine: 24.5,
        signalLine: 18.2,
        histogram: 6.3,
      },
      atr14: +(spot * 0.004).toFixed(2),
      dayHigh: +(spot + spot * 0.0055).toFixed(2),
      dayLow: +(spot - spot * 0.0035).toFixed(2),
      prevClose: +(spot - spot * 0.0042).toFixed(2),
      openingRange: {
        high: +(spot + spot * 0.003).toFixed(2),
        low: +(spot - spot * 0.002).toFixed(2),
      },
      support: Math.round(spot / config.strikeStep) * config.strikeStep - config.strikeStep * 2,
      resistance: Math.round(spot / config.strikeStep) * config.strikeStep + config.strikeStep * 2,
      sourceInstrument: config.symbol,
      lastUpdate: new Date().toISOString(),
    };
  }

  /**
   * Generates realistic calibrated OptionChainSnapshot for an index
   */
  public static getOptionChain(
    indexId: SupportedIndex,
    underlying: UnderlyingSnapshot,
    liveNiftyChain?: OptionChainSnapshot | null
  ): OptionChainSnapshot {
    if (indexId === 'NIFTY' && liveNiftyChain && liveNiftyChain.rows.length > 0) {
      return liveNiftyChain;
    }

    const config = INDEX_CONFIGS[indexId];
    const spot = underlying.spotPrice;
    const atm = underlying.atmStrike;
    const step = config.strikeStep;
    const expiry = underlying.nearestExpiry;

    const strikes: number[] = [];
    const half = Math.floor(config.strikesCount / 2);
    for (let i = -half; i <= half; i++) {
      strikes.push(atm + i * step);
    }

    let totalCallOi = 0;
    let totalPutOi = 0;
    let totalCallVol = 0;
    let totalPutVol = 0;

    let hasLiveTicks = false;

    const rows: OptionChainRow[] = strikes.map((strike) => {
      const isAtm = strike === atm;
      const distanceFromAtm = strike - atm;
      const ceMoneyness: Moneyness = strike < atm ? 'ITM' : isAtm ? 'ATM' : 'OTM';
      const peMoneyness: Moneyness = strike > atm ? 'ITM' : isAtm ? 'ATM' : 'OTM';

      // 1. Look up live real-time contract ticks from Angel One feed
      const ceTick = brokerService.getContractTick(indexId, strike, 'CE', expiry);
      const peTick = brokerService.getContractTick(indexId, strike, 'PE', expiry);
      if ((ceTick?.ltp && ceTick.ltp > 0) || (peTick?.ltp && peTick.ltp > 0)) {
        hasLiveTicks = true;
      }

      // Fallback model pricing if strike is deep OTM/ITM and has no market ticks
      const distanceAbs = Math.abs(distanceFromAtm);
      const indexScale = spot / 23400; // normalizes volatility scale relative to Nifty
      const baseAtmCePrice = +(145 * indexScale).toFixed(2);
      const baseAtmPePrice = +(138 * indexScale).toFixed(2);

      let calcCeLtp = 0;
      let calcPeLtp = 0;

      if (strike === atm) {
        calcCeLtp = baseAtmCePrice;
        calcPeLtp = baseAtmPePrice;
      } else if (strike < atm) {
        // ITM Call / OTM Put
        calcCeLtp = +(atm - strike + baseAtmCePrice * Math.exp(-distanceAbs / (step * 8))).toFixed(2);
        calcPeLtp = +(baseAtmPePrice * Math.exp(-distanceAbs / (step * 4.5))).toFixed(2);
      } else {
        // OTM Call / ITM Put
        calcCeLtp = +(baseAtmCePrice * Math.exp(-distanceAbs / (step * 4.5))).toFixed(2);
        calcPeLtp = +(strike - atm + baseAtmPePrice * Math.exp(-distanceAbs / (step * 8))).toFixed(2);
      }

      // Prioritize LIVE Angel One LTP over model pricing
      const ceLtp = (ceTick?.ltp && ceTick.ltp > 0) ? ceTick.ltp : Math.max(1.0, calcCeLtp);
      const peLtp = (peTick?.ltp && peTick.ltp > 0) ? peTick.ltp : Math.max(1.0, calcPeLtp);

      const cePrev = ceTick?.prevClose || (ceTick?.priceChange ? +(ceLtp - ceTick.priceChange).toFixed(2) : +(ceLtp * 0.92).toFixed(2));
      const pePrev = peTick?.prevClose || (peTick?.priceChange ? +(peLtp - peTick.priceChange).toFixed(2) : +(peLtp * 1.06).toFixed(2));

      const ceChange = ceTick?.priceChange ?? +(ceLtp - cePrev).toFixed(2);
      const peChange = peTick?.priceChange ?? +(peLtp - pePrev).toFixed(2);

      const ceChangePercent = ceTick?.changePercent ?? (cePrev > 0 ? +((ceChange / cePrev) * 100).toFixed(2) : 8.5);
      const peChangePercent = peTick?.changePercent ?? (pePrev > 0 ? +((peChange / pePrev) * 100).toFixed(2) : -6.2);

      // Open Interest and Volume
      const ceOi = ceTick?.oi ?? Math.round(Math.max(10000, 150000 * Math.exp(-Math.pow(distanceFromAtm / (step * 5), 2)) + Math.random() * 25000));
      const peOi = peTick?.oi ?? Math.round(Math.max(10000, 160000 * Math.exp(-Math.pow(distanceFromAtm / (step * 5), 2)) + Math.random() * 25000));
      const ceVol = ceTick?.volume ?? Math.round(ceOi * 1.8 + Math.random() * 30000);
      const peVol = peTick?.volume ?? Math.round(peOi * 1.7 + Math.random() * 30000);

      totalCallOi += ceOi;
      totalPutOi += peOi;
      totalCallVol += ceVol;
      totalPutVol += peVol;

      const ce: OptionContractData = {
        instrumentKey: ceTick?.instrumentKey || `${config.exchange}_NFO|${config.symbol}_${strike}_CE`,
        symbol: ceTick?.tradingSymbol || `${config.symbol} ${strike} CE`,
        strike,
        expiry,
        optionType: 'CE',
        moneyness: ceMoneyness,
        ltp: ceLtp,
        change: ceChange,
        changePercent: ceChangePercent,
        open: ceTick?.open ?? +(ceLtp * 0.95).toFixed(2),
        high: ceTick?.high ?? +(ceLtp * 1.15).toFixed(2),
        low: ceTick?.low ?? +(ceLtp * 0.92).toFixed(2),
        prevClose: cePrev,
        bid: ceTick?.bidPrice ?? +(ceLtp - 0.5).toFixed(2),
        ask: ceTick?.askPrice ?? +(ceLtp + 0.5).toFixed(2),
        volume: ceVol,
        oi: ceOi,
        oiChange: ceTick?.oiChange ?? Math.round(ceOi * 0.12),
        iv: 14.2,
        delta: ceMoneyness === 'ITM' ? 0.72 : isAtm ? 0.50 : 0.32,
        theta: -8.4,
        gamma: 0.003,
        vega: 12.1,
        lastUpdate: ceTick?.receivedTimestamp || new Date().toISOString(),
        isStale: false,
      };

      const pe: OptionContractData = {
        instrumentKey: peTick?.instrumentKey || `${config.exchange}_NFO|${config.symbol}_${strike}_PE`,
        symbol: peTick?.tradingSymbol || `${config.symbol} ${strike} PE`,
        strike,
        expiry,
        optionType: 'PE',
        moneyness: peMoneyness,
        ltp: peLtp,
        change: peChange,
        changePercent: peChangePercent,
        open: peTick?.open ?? +(peLtp * 1.05).toFixed(2),
        high: peTick?.high ?? +(peLtp * 1.08).toFixed(2),
        low: peTick?.low ?? +(peLtp * 0.88).toFixed(2),
        prevClose: pePrev,
        bid: peTick?.bidPrice ?? +(peLtp - 0.5).toFixed(2),
        ask: peTick?.askPrice ?? +(peLtp + 0.5).toFixed(2),
        volume: peVol,
        oi: peOi,
        oiChange: peTick?.oiChange ?? Math.round(-peOi * 0.05),
        iv: 14.6,
        delta: peMoneyness === 'ITM' ? -0.68 : isAtm ? -0.50 : -0.28,
        theta: -8.1,
        gamma: 0.003,
        vega: 11.9,
        lastUpdate: peTick?.receivedTimestamp || new Date().toISOString(),
        isStale: false,
      };

      return {
        strike,
        isAtm,
        distanceFromAtm,
        ce,
        pe,
      };
    });

    const pcr = +(totalPutOi / (totalCallOi || 1)).toFixed(3);
    const volumePcr = +(totalPutVol / (totalCallVol || 1)).toFixed(3);

    return {
      underlying,
      selectedExpiry: expiry,
      atmStrike: atm,
      strikeInterval: step,
      rows,
      totalCeOi: totalCallOi,
      totalPeOi: totalPutOi,
      totalCeVolume: totalCallVol,
      totalPeVolume: totalPutVol,
      oiPcr: pcr,
      volumePcr,
      maxPainStrike: atm,
      supportStrike: atm - step * 2,
      resistanceStrike: atm + step * 2,
      provider: hasLiveTicks ? 'angelone' : 'mock',
      dataFreshness: (hasLiveTicks || (indexId === 'NIFTY' && liveNiftyChain)) ? 'LIVE' : 'SIMULATED',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generates complete market predictions for any supported index
   */
  public static getPredictions(
    indexId: SupportedIndex,
    liveNiftyUnderlying?: UnderlyingSnapshot | null,
    liveNiftyChain?: OptionChainSnapshot | null,
    multiIndexSnapshots?: Record<string, UnderlyingSnapshot> | null
  ): { predictions: StrikePrediction[]; summary: MarketPredictionSummary | null } {
    const underlying = this.getUnderlying(indexId, liveNiftyUnderlying, multiIndexSnapshots);
    const indicators = this.getIndicators(indexId);
    const optionChain = this.getOptionChain(indexId, underlying, liveNiftyChain);

    return PredictionEngine.generateMarketPredictions(optionChain, underlying, indicators);
  }
}

