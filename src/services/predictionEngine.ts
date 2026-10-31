// ==============================================================================
// Quantitative Real-Time Option Strike Prediction Engine
// Evaluates individual strikes for Buy/Sell signals, targets, stop-losses,
// OI build-up classifications, and win probabilities
// ==============================================================================

import { 
  OptionChainSnapshot, UnderlyingSnapshot, TechnicalIndicatorData, 
  OptionContractData, OptionChainRow 
} from '../types/market';

export type PredictionAction = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL_WRITE' | 'AVOID';
export type OIBuildUp = 'LONG_BUILDUP' | 'SHORT_COVERING' | 'SHORT_BUILDUP' | 'LONG_UNWINDING' | 'NEUTRAL';

export interface StrikePrediction {
  strike: number;
  optionType: 'CE' | 'PE';
  symbol: string;
  ltp: number;
  action: PredictionAction;
  confidenceScore: number; // 0 - 100%
  expectedMove: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  entryPrice: number;
  entryTimeWindow: string;
  entryCondition: string;
  target1: number;
  target2: number;
  stopLoss: number;
  targetExitTime: string;
  mandatoryExitTime: string;
  maxHoldingMinutes: number;
  trailingSlRule: string;
  exitStrategyReason: string;
  riskReward: string;
  oiBuildUp: OIBuildUp;
  oiBuildUpLabel: string;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  reasons: string[];
  thetaRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  winProbability: number;
  iv: number;
  delta: number;
}

export interface MarketPredictionSummary {
  bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
  confidence: number;
  predictedRange: {
    min: number;
    max: number;
    center: number;
  };
  topCallPick: StrikePrediction | null;
  topPutPick: StrikePrediction | null;
  topSellerPick: StrikePrediction | null;
  callBuyingPower: number; // 0 - 100
  putBuyingPower: number; // 0 - 100
  keySupport: number;
  keyResistance: number;
  summaryRationale: string;
}

export class PredictionEngine {
  /**
   * Determine Open Interest Build-Up Phase from Price change & OI change
   */
  public static classifyOI(priceChange: number, oiChange: number): { type: OIBuildUp; label: string } {
    if (priceChange > 0 && oiChange > 0) {
      return { type: 'LONG_BUILDUP', label: 'Long Build-up (Bullish Accumulation)' };
    }
    if (priceChange > 0 && oiChange < 0) {
      return { type: 'SHORT_COVERING', label: 'Short Covering (Bullish Squeeze)' };
    }
    if (priceChange < 0 && oiChange > 0) {
      return { type: 'SHORT_BUILDUP', label: 'Short Build-up (Bearish Writing)' };
    }
    if (priceChange < 0 && oiChange < 0) {
      return { type: 'LONG_UNWINDING', label: 'Long Unwinding (Profit Booking)' };
    }
    return { type: 'NEUTRAL', label: 'Neutral / Range Bound' };
  }

  /**
   * Evaluates a single contract (Call or Put) and generates actionable predictions
   */
  public static predictContract(
    contract: OptionContractData,
    strike: number,
    optionType: 'CE' | 'PE',
    underlying: UnderlyingSnapshot,
    indicators: TechnicalIndicatorData | null,
    pcr: number
  ): StrikePrediction {
    const ltp = contract.ltp || 1.0;
    const priceChange = contract.change || 0;
    const oiChange = contract.oiChange || 0;
    const isCall = optionType === 'CE';
    const spot = underlying.spotPrice;
    const atm = underlying.atmStrike;
    const distFromAtm = Math.abs(strike - atm);

    // 1. OI Build Up classification
    const oiAnalysis = this.classifyOI(priceChange, oiChange);

    // 2. Underlying Technical Momentum
    const rsi = indicators?.rsi14 ?? 52;
    const ema9 = indicators?.ema9 ?? spot;
    const ema20 = indicators?.ema20 ?? spot;
    const vwap = indicators?.vwap ?? spot;

    const isTrendBullish = ema9 > ema20 && spot >= vwap && rsi >= 50;
    const isTrendBearish = ema9 < ema20 && spot <= vwap && rsi <= 50;

    // 3. Greeks & Moneyness
    const moneyness = contract.moneyness || (isCall ? (strike < atm ? 'ITM' : strike === atm ? 'ATM' : 'OTM') : (strike > atm ? 'ITM' : strike === atm ? 'ATM' : 'OTM'));
    const iv = contract.iv || 13.5;
    const delta = Math.abs(contract.delta || (moneyness === 'ATM' ? 0.50 : moneyness === 'ITM' ? 0.65 : 0.35));

    // Theta Risk: OTM with low delta has rapid time decay risk
    const thetaRisk: 'LOW' | 'MEDIUM' | 'HIGH' = moneyness === 'ITM' ? 'LOW' : moneyness === 'ATM' ? 'MEDIUM' : 'HIGH';

    // 4. Multi-Factor Scoring
    let score = 50;
    const reasons: string[] = [];

    if (isCall) {
      // Call Option Analysis
      if (isTrendBullish) {
        score += 20;
        reasons.push('NIFTY Spot trading above VWAP & EMA 9 > 20');
      } else if (isTrendBearish) {
        score -= 22;
      }

      if (oiAnalysis.type === 'LONG_BUILDUP') {
        score += 15;
        reasons.push('Fresh Call Long Build-up with aggressive buying');
      } else if (oiAnalysis.type === 'SHORT_COVERING') {
        score += 18;
        reasons.push('Call writers covering positions (Short Squeeze)');
      } else if (oiAnalysis.type === 'SHORT_BUILDUP') {
        score -= 20;
        reasons.push('Heavy Call Writing acting as ceiling resistance');
      }

      if (pcr >= 1.05) {
        score += 10;
        reasons.push(`Bullish OI PCR (${pcr.toFixed(2)}) supports upside`);
      } else if (pcr <= 0.85) {
        score -= 10;
      }

      if (moneyness === 'ATM' || (moneyness === 'ITM' && distFromAtm <= 150)) {
        score += 10;
        reasons.push('Optimal Delta & high liquidity strike');
      } else if (moneyness === 'OTM' && distFromAtm > 300) {
        score -= 15;
        reasons.push('High OTM distance prone to Theta decay');
      }
    } else {
      // Put Option Analysis
      if (isTrendBearish) {
        score += 20;
        reasons.push('NIFTY Spot trading below VWAP & EMA 9 < 20');
      } else if (isTrendBullish) {
        score -= 22;
      }

      if (oiAnalysis.type === 'LONG_BUILDUP') {
        score += 15;
        reasons.push('Fresh Put Long Build-up indicating strong downside conviction');
      } else if (oiAnalysis.type === 'SHORT_COVERING') {
        score += 18;
        reasons.push('Put writers scrambling to cover as market drops');
      } else if (oiAnalysis.type === 'SHORT_BUILDUP') {
        score -= 20;
        reasons.push('Heavy Put Writing establishing solid floor support');
      }

      if (pcr <= 0.80) {
        score += 10;
        reasons.push(`Bearish OI PCR (${pcr.toFixed(2)}) favors Put buying`);
      } else if (pcr >= 1.15) {
        score -= 10;
      }

      if (moneyness === 'ATM' || (moneyness === 'ITM' && distFromAtm <= 150)) {
        score += 10;
        reasons.push('Optimal Delta & immediate price sensitivity');
      } else if (moneyness === 'OTM' && distFromAtm > 300) {
        score -= 15;
        reasons.push('Far OTM strike prone to severe Theta decay');
      }
    }

    // Clamp score
    const confidenceScore = Math.min(96, Math.max(25, score));
    const winProbability = Math.min(94, Math.max(30, Math.round(confidenceScore * 0.95)));

    // Determine Action
    let action: PredictionAction = 'NEUTRAL';
    let expectedMove: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' = 'SIDEWAYS';

    if (confidenceScore >= 78) {
      action = 'STRONG_BUY';
      expectedMove = isCall ? 'BULLISH' : 'BEARISH';
    } else if (confidenceScore >= 62) {
      action = 'BUY';
      expectedMove = isCall ? 'BULLISH' : 'BEARISH';
    } else if (confidenceScore <= 35) {
      if (moneyness === 'OTM' && distFromAtm >= 150 && thetaRisk === 'HIGH') {
        action = 'SELL_WRITE';
        expectedMove = isCall ? 'BEARISH' : 'BULLISH';
        reasons.push('Ideal candidate for option writers (High Decay probability)');
      } else {
        action = 'AVOID';
        expectedMove = isCall ? 'BEARISH' : 'BULLISH';
      }
    } else {
      action = 'NEUTRAL';
      expectedMove = 'SIDEWAYS';
      reasons.push('Consolidation phase; wait for clear momentum confirmation');
    }

    // Dynamic Target and Stop Loss Calculation
    // For Buy options: Risk 18-22%, Target 1 = +28-35%, Target 2 = +60-80%
    const slPct = action === 'SELL_WRITE' ? 0.35 : 0.20;
    const t1Pct = action === 'SELL_WRITE' ? 0.50 : 0.30;
    const t2Pct = action === 'SELL_WRITE' ? 0.80 : 0.65;

    const entryPrice = ltp;
    let stopLoss: number;
    let target1: number;
    let target2: number;

    if (action === 'SELL_WRITE') {
      // For sellers: profit when price drops to near 0, loss when price spikes
      target1 = Number(Math.max(0.5, entryPrice * (1 - t1Pct)).toFixed(2));
      target2 = Number(Math.max(0.05, entryPrice * (1 - t2Pct)).toFixed(2));
      stopLoss = Number((entryPrice * (1 + slPct)).toFixed(2));
    } else {
      // For buyers: profit when price rises, loss when price falls
      target1 = Number((entryPrice * (1 + t1Pct)).toFixed(2));
      target2 = Number((entryPrice * (1 + t2Pct)).toFixed(2));
      stopLoss = Number(Math.max(0.5, entryPrice * (1 - slPct)).toFixed(2));
    }

    const potentialGain = Math.abs(target1 - entryPrice);
    const potentialLoss = Math.max(1, Math.abs(entryPrice - stopLoss));
    const rrRatio = (potentialGain / potentialLoss).toFixed(1);
    const riskReward = `1 : ${rrRatio}`;

    const nowHour = new Date().getHours();
    const nowMin = new Date().getMinutes();
    const totalMins = nowHour * 60 + nowMin;

    let entryTimeWindow = "09:20 AM - 10:45 AM (Morning Momentum)";
    if (totalMins >= 13 * 60 + 15) {
      entryTimeWindow = "01:15 PM - 02:45 PM (Afternoon Trend)";
    } else if (totalMins >= 11 * 60 + 15) {
      entryTimeWindow = "11:30 AM - 01:15 PM (Mid-day Decay: Trade Small)";
    }

    const maxHoldingMinutes = moneyness === 'ITM' ? 75 : moneyness === 'ATM' ? 50 : 35;
    const targetExitTime = `Expected Target in ~${moneyness === 'ITM' ? '45-60' : '30-45'} mins`;
    const mandatoryExitTime = "03:15 PM (Intraday Cut-off)";
    const trailingSlRule = `Move SL to cost (₹${entryPrice.toFixed(1)}) once Target 1 is hit`;
    const entryCondition = action === 'SELL_WRITE'
      ? `Sell/Write on resistance retest near ₹${(entryPrice * 1.05).toFixed(1)}`
      : `Enter on pullback near ₹${(entryPrice * 0.98).toFixed(1)} - ₹${entryPrice.toFixed(1)} or VWAP hold`;
    const exitStrategyReason = `Book 70% at Target 1 (₹${target1.toFixed(1)}), trail rest to Target 2 (₹${target2.toFixed(1)}). Cut loss if 5m candle breaks ₹${stopLoss.toFixed(1)}.`;

    return {
      strike,
      optionType,
      symbol: `NIFTY ${strike} ${optionType}`,
      ltp,
      action,
      confidenceScore,
      expectedMove,
      entryPrice,
      entryTimeWindow,
      entryCondition,
      target1,
      target2,
      stopLoss,
      targetExitTime,
      mandatoryExitTime,
      maxHoldingMinutes,
      trailingSlRule,
      exitStrategyReason,
      riskReward,
      oiBuildUp: oiAnalysis.type,
      oiBuildUpLabel: oiAnalysis.label,
      moneyness,
      reasons: reasons.slice(0, 3),
      thetaRisk,
      winProbability,
      iv: Number(iv.toFixed(1)),
      delta: Number(delta.toFixed(2)),
    };
  }

  /**
   * Generates comprehensive predictions for all strikes and overarching market summary
   */
  public static generateMarketPredictions(
    chain: OptionChainSnapshot,
    underlying: UnderlyingSnapshot,
    indicators: TechnicalIndicatorData | null
  ): {
    predictions: StrikePrediction[];
    summary: MarketPredictionSummary;
  } {
    const predictions: StrikePrediction[] = [];
    const pcr = chain.oiPcr || 1.0;

    for (const row of chain.rows) {
      // 1. Call side prediction
      const cePred = this.predictContract(row.ce, row.strike, 'CE', underlying, indicators, pcr);
      predictions.push(cePred);

      // 2. Put side prediction
      const pePred = this.predictContract(row.pe, row.strike, 'PE', underlying, indicators, pcr);
      predictions.push(pePred);
    }

    // Sort predictions
    const callBuys = predictions
      .filter(p => p.optionType === 'CE' && (p.action === 'STRONG_BUY' || p.action === 'BUY'))
      .sort((a, b) => b.confidenceScore - a.confidenceScore);

    const putBuys = predictions
      .filter(p => p.optionType === 'PE' && (p.action === 'STRONG_BUY' || p.action === 'BUY'))
      .sort((a, b) => b.confidenceScore - a.confidenceScore);

    const sellers = predictions
      .filter(p => p.action === 'SELL_WRITE')
      .sort((a, b) => b.winProbability - a.winProbability);

    const topCallPick = callBuys[0] || predictions.filter(p => p.optionType === 'CE').sort((a, b) => b.confidenceScore - a.confidenceScore)[0] || null;
    const topPutPick = putBuys[0] || predictions.filter(p => p.optionType === 'PE').sort((a, b) => b.confidenceScore - a.confidenceScore)[0] || null;
    const topSellerPick = sellers[0] || null;

    // Overall Market Bias & Range
    const spot = underlying.spotPrice;
    const atm = underlying.atmStrike;
    const rsi = indicators?.rsi14 ?? 50;
    const ema9 = indicators?.ema9 ?? spot;
    const ema20 = indicators?.ema20 ?? spot;

    let overallScore = 50;
    if (ema9 > ema20) overallScore += 15; else overallScore -= 15;
    if (rsi > 55) overallScore += 15; else if (rsi < 45) overallScore -= 15;
    if (pcr > 1.1) overallScore += 15; else if (pcr < 0.85) overallScore -= 15;

    let bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH' = 'NEUTRAL';
    if (overallScore >= 75) bias = 'STRONGLY_BULLISH';
    else if (overallScore >= 60) bias = 'BULLISH';
    else if (overallScore <= 25) bias = 'STRONGLY_BEARISH';
    else if (overallScore <= 40) bias = 'BEARISH';

    const callBuyingPower = Math.min(100, Math.max(10, overallScore));
    const putBuyingPower = 100 - callBuyingPower;

    const keySupport = chain.supportStrike || (atm - 150);
    const keyResistance = chain.resistanceStrike || (atm + 150);

    const summaryRationale = bias.includes('BULLISH')
      ? `Strong upward momentum supported by Call buying build-up and positive RSI (${rsi.toFixed(1)}). Key support anchored at ${keySupport}.`
      : bias.includes('BEARISH')
      ? `Downside breakdown pressure active below intraday VWAP. High Call writing barrier at ${keyResistance} with Put buyers in control.`
      : `Market in consolidation range between ${keySupport} and ${keyResistance}. Ideal for premium decay or breakout waiting.`;

    const summary: MarketPredictionSummary = {
      bias,
      confidence: Math.round(Math.abs(overallScore - 50) * 1.5 + 50),
      predictedRange: {
        min: keySupport,
        max: keyResistance,
        center: atm,
      },
      topCallPick,
      topPutPick,
      topSellerPick,
      callBuyingPower,
      putBuyingPower,
      keySupport,
      keyResistance,
      summaryRationale,
    };

    return { predictions, summary };
  }
}

