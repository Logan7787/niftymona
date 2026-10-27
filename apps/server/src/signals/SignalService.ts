// ==============================================================================
// Rule-Based ATM CE/PE Quantitative Signal Engine
// Evaluates multi-factor conditions and outputs transparent reasoning
// ==============================================================================

import { OptionChainSnapshot, SignalOutput, SignalRuleResult, TechnicalIndicatorData } from '../types/market.js';

export interface SignalEvaluationParams {
  underlyingPrice: number;
  atmStrike: number;
  expiry: string;
  indicators: TechnicalIndicatorData;
  chain: OptionChainSnapshot;
  feedFreshness: 'LIVE' | 'DELAYED' | 'STALE' | 'SIMULATED';
}

export class SignalService {
  /**
   * Generates analytical signal based on strict verifiable technical & options rules.
   * Rejects stale or incomplete data feeds.
   */
  public static evaluateSignal(params: SignalEvaluationParams): SignalOutput {
    const { underlyingPrice, atmStrike, expiry, indicators, chain, feedFreshness } = params;

    const atmRow = chain.rows.find(r => r.strike === atmStrike);
    const ceLtp = atmRow?.ce.ltp ?? 0;
    const peLtp = atmRow?.pe.ltp ?? 0;

    const rulesPassed: SignalRuleResult[] = [];
    const rulesFailed: SignalRuleResult[] = [];

    // Safety checks: Feed freshness & indicator completeness
    const isFeedHealthy = feedFreshness === 'LIVE' || feedFreshness === 'SIMULATED';
    const hasCoreIndicators = indicators.ema9 !== null && indicators.ema20 !== null && indicators.vwap !== null;

    if (!isFeedHealthy || !hasCoreIndicators) {
      return {
        id: `sig_${Date.now()}`,
        timestamp: new Date().toISOString(),
        direction: 'NEUTRAL',
        underlyingPrice,
        atmStrike,
        expiry,
        suggestedContract: `NIFTY ${atmStrike} CE/PE`,
        contractLtp: 0,
        targetPrice: 0,
        stopLossPrice: 0,
        riskRewardRatio: '1:1.5',
        indicators: {
          ema9: indicators.ema9,
          ema20: indicators.ema20,
          vwap: indicators.vwap,
          rsi: indicators.rsi14,
          macdHist: indicators.macd.histogram,
          pcr: chain.oiPcr,
        },
        rulesPassed: [],
        rulesFailed: [{
          name: 'Feed Health & Indicator Data Verification',
          description: 'Market feed must be healthy and indicators fully formed.',
          passed: false,
          actualValue: `Feed: ${feedFreshness}, Indicators ready: ${hasCoreIndicators}`,
          requiredCondition: 'Feed LIVE/SIMULATED and minimum 20 candle bars available',
        }],
        primaryReason: 'Analytical signal inhibited: Market feed is stale or insufficient historical candles exist.',
        invalidatingConditions: 'Wait for fresh ticks and indicator series stabilization.',
        dataFreshness: feedFreshness === 'STALE' ? 'STALE' : 'SIMULATED',
      };
    }

    // 1. Trend & VWAP condition
    const isPriceAboveVwap = indicators.vwap !== null && underlyingPrice > indicators.vwap;
    const isEmaBullish = indicators.ema9 !== null && indicators.ema20 !== null && indicators.ema9 > indicators.ema20;

    // 2. Momentum condition (RSI & MACD)
    const isRsiBullish = indicators.rsi14 !== null && indicators.rsi14 >= 52;
    const isRsiBearish = indicators.rsi14 !== null && indicators.rsi14 <= 48;
    const isMacdBullish = indicators.macd.histogram !== null && indicators.macd.histogram > 0;
    const isMacdBearish = indicators.macd.histogram !== null && indicators.macd.histogram < 0;

    // 3. Option Chain & PCR condition
    const isPcrBullish = chain.oiPcr >= 1.05;
    const isPcrBearish = chain.oiPcr <= 0.85;

    // 4. ATM CE vs PE Premium momentum
    const isCeStronger = ceLtp > 0 && peLtp > 0 && ceLtp > peLtp * 0.95;

    // Evaluate Bullish Bias
    const bullishCriteria = [
      {
        name: 'Spot Price vs VWAP',
        description: 'Underlying NIFTY spot holding above intraday VWAP',
        passed: isPriceAboveVwap,
        actualValue: `Spot: ${underlyingPrice.toFixed(2)}, VWAP: ${indicators.vwap?.toFixed(2)}`,
        requiredCondition: 'Spot > VWAP',
      },
      {
        name: 'Fast EMA vs Slow EMA (9/20)',
        description: 'Short-term EMA 9 trending above medium-term EMA 20',
        passed: isEmaBullish,
        actualValue: `EMA9: ${indicators.ema9?.toFixed(2)}, EMA20: ${indicators.ema20?.toFixed(2)}`,
        requiredCondition: 'EMA 9 > EMA 20',
      },
      {
        name: 'RSI Momentum Confirmation',
        description: 'RSI above neutral zone (>= 52)',
        passed: isRsiBullish,
        actualValue: `RSI: ${indicators.rsi14?.toFixed(2)}`,
        requiredCondition: 'RSI >= 52',
      },
      {
        name: 'MACD Histogram Expansion',
        description: 'MACD histogram positive indicating upward acceleration',
        passed: isMacdBullish,
        actualValue: `MACD Hist: ${indicators.macd.histogram?.toFixed(2)}`,
        requiredCondition: 'Histogram > 0',
      },
      {
        name: 'Put-Call Ratio (OI PCR)',
        description: 'OI PCR >= 1.05 showing strong put writing support base',
        passed: isPcrBullish,
        actualValue: `PCR: ${chain.oiPcr.toFixed(3)}`,
        requiredCondition: 'PCR >= 1.05',
      },
    ];

    let passedBullishCount = 0;
    for (const crit of bullishCriteria) {
      if (crit.passed) {
        rulesPassed.push(crit);
        passedBullishCount++;
      } else {
        rulesFailed.push(crit);
      }
    }

    // Determine direction
    let direction: 'BULLISH_BIAS' | 'BEARISH_BIAS' | 'NEUTRAL' | 'WATCHLIST_ALERT' = 'NEUTRAL';
    let suggestedContract = `NIFTY ${atmStrike} CE`;
    let contractLtp = ceLtp;
    let primaryReason = '';
    let invalidatingConditions = '';

    if (passedBullishCount >= 4) {
      direction = 'BULLISH_BIAS';
      suggestedContract = `NIFTY ${atmStrike} CE`;
      contractLtp = ceLtp;
      primaryReason = `Strong bullish alignment: Price holding firmly above VWAP (${underlyingPrice.toFixed(2)} > ${indicators.vwap?.toFixed(2)}) with EMA 9/20 bullish alignment and supporting Put OI build-up (PCR ${chain.oiPcr.toFixed(2)}).`;
      invalidatingConditions = `Invalidated if NIFTY spot closes below VWAP (${indicators.vwap?.toFixed(2)}) or RSI falls below 48.`;
    } else if (
      !isPriceAboveVwap && 
      !isEmaBullish && 
      isRsiBearish && 
      isMacdBearish && 
      isPcrBearish
    ) {
      direction = 'BEARISH_BIAS';
      suggestedContract = `NIFTY ${atmStrike} PE`;
      contractLtp = peLtp;
      primaryReason = `Bearish breakdown bias: NIFTY trading under VWAP (${underlyingPrice.toFixed(2)} < ${indicators.vwap?.toFixed(2)}) with negative MACD histogram and heavy Call OI resistance (PCR ${chain.oiPcr.toFixed(2)}).`;
      invalidatingConditions = `Invalidated if NIFTY spot breaks back above VWAP (${indicators.vwap?.toFixed(2)}) or EMA 9 crosses above EMA 20.`;
    } else if (passedBullishCount === 3 || (!isPriceAboveVwap && isRsiBearish)) {
      direction = 'WATCHLIST_ALERT';
      suggestedContract = `NIFTY ${atmStrike} ${isPriceAboveVwap ? 'CE' : 'PE'}`;
      contractLtp = isPriceAboveVwap ? ceLtp : peLtp;
      primaryReason = 'Watchlist Alert: Market exhibiting developing momentum near key inflection levels. Awaiting complete confluence before directional bias confirmation.';
      invalidatingConditions = 'Range breakout or breakdown through opening range levels.';
    } else {
      direction = 'NEUTRAL';
      suggestedContract = `NIFTY ${atmStrike} STRADDLE`;
      contractLtp = Number((ceLtp + peLtp).toFixed(2));
      primaryReason = 'Neutral / Range-Bound: Conflicting indicator readings with no sustained directional dominance. Spot oscillating tightly around VWAP.';
      invalidatingConditions = 'Sustained directional breakout beyond current day high/low.';
    }

    // Risk:Reward calculations for suggested contract
    const stopLossOffset = contractLtp > 0 ? Number((contractLtp * 0.20).toFixed(2)) : 10;
    const targetOffset = contractLtp > 0 ? Number((contractLtp * 0.35).toFixed(2)) : 20;

    return {
      id: `sig_${Date.now()}`,
      timestamp: new Date().toISOString(),
      direction,
      underlyingPrice,
      atmStrike,
      expiry,
      suggestedContract,
      contractLtp,
      targetPrice: Number((contractLtp + targetOffset).toFixed(2)),
      stopLossPrice: Math.max(1, Number((contractLtp - stopLossOffset).toFixed(2))),
      riskRewardRatio: '1:1.75',
      indicators: {
        ema9: indicators.ema9,
        ema20: indicators.ema20,
        vwap: indicators.vwap,
        rsi: indicators.rsi14,
        macdHist: indicators.macd.histogram,
        pcr: chain.oiPcr,
      },
      rulesPassed,
      rulesFailed,
      primaryReason,
      invalidatingConditions,
      dataFreshness: feedFreshness === 'LIVE' ? 'LIVE' : 'SIMULATED',
    };
  }
}
