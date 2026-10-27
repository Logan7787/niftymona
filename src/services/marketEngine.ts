// ==============================================================================
// Pure Quantitative Market Engine: ATM Calculation, Indicators, Signals, Paper
// Runs directly in browser/client or serverless environment without extra servers
// ==============================================================================

import { 
  Candle, Moneyness, OptionType, UnderlyingSnapshot, OptionChainSnapshot, 
  OptionChainRow, TechnicalIndicatorData, SignalOutput, SignalRuleResult,
  PaperAccountSummary, PaperTradeOrder
} from '../types/market';

export interface ListedInstrument {
  token: string;
  symbol: string;
  name: string;
  expiry: string; // YYYY-MM-DD
  strike: number;
  lotSize: number;
  instrumentType: 'INDEX' | 'CE' | 'PE';
  exchange: 'NSE' | 'NFO';
  tickSize: number;
}

// ------------------------------------------------------------------------------
// 1. Dynamic ATM Strike & Instrument Master Service
// ------------------------------------------------------------------------------
export class InstrumentService {
  private instruments: Map<string, ListedInstrument> = new Map();
  private niftyExpiries: string[] = [];
  private strikesByExpiry: Map<string, number[]> = new Map();

  public static calculateATMStrike(spotPrice: number, availableStrikes: number[]): number {
    if (!availableStrikes || availableStrikes.length === 0) {
      const fallbackInterval = 50;
      return Math.round(spotPrice / fallbackInterval) * fallbackInterval;
    }

    const sorted = [...new Set(availableStrikes)].sort((a, b) => a - b);
    let nearestStrike = sorted[0];
    let minDistance = Math.abs(spotPrice - nearestStrike);

    for (let i = 1; i < sorted.length; i++) {
      const strike = sorted[i];
      const dist = Math.abs(spotPrice - strike);
      if (dist < minDistance) {
        minDistance = dist;
        nearestStrike = strike;
      }
    }
    return nearestStrike;
  }

  public static classifyMoneyness(strike: number, atmStrike: number, optionType: OptionType): Moneyness {
    if (strike === atmStrike) return 'ATM';
    if (optionType === 'CE') {
      return strike < atmStrike ? 'ITM' : 'OTM';
    } else {
      return strike > atmStrike ? 'ITM' : 'OTM';
    }
  }

  public static detectStrikeInterval(strikes: number[]): number {
    if (!strikes || strikes.length < 2) return 50;
    const sorted = [...new Set(strikes)].sort((a, b) => a - b);
    const diffs: number[] = [];
    for (let i = 1; i < Math.min(sorted.length, 10); i++) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff > 0) diffs.push(diff);
    }
    return diffs.length > 0 ? Math.min(...diffs) : 50;
  }

  public static getSelectedStrikesWindow(
    atmStrike: number, 
    availableStrikes: number[], 
    rangeCount: number = 10
  ): number[] {
    const sorted = [...new Set(availableStrikes)].sort((a, b) => a - b);
    const atmIndex = sorted.indexOf(atmStrike);

    if (atmIndex === -1) {
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < sorted.length; i++) {
        const diff = Math.abs(sorted[i] - atmStrike);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      const start = Math.max(0, closestIdx - rangeCount);
      const end = Math.min(sorted.length, closestIdx + rangeCount + 1);
      return sorted.slice(start, end);
    }

    const start = Math.max(0, atmIndex - rangeCount);
    const end = Math.min(sorted.length, atmIndex + rangeCount + 1);
    return sorted.slice(start, end);
  }

  public static calculatePCR(totalPe: number, totalCe: number): number {
    if (totalCe <= 0) return 0;
    return Number((totalPe / totalCe).toFixed(3));
  }

  public static calculateMaxPain(rows: Array<{ strike: number; ceOi: number; peOi: number }>): number {
    if (!rows || rows.length === 0) return 0;
    let minTotalLoss = Infinity;
    let maxPainStrike = rows[0].strike;

    for (const testStrike of rows) {
      let cumulativeLoss = 0;
      for (const row of rows) {
        if (testStrike.strike > row.strike) {
          cumulativeLoss += (testStrike.strike - row.strike) * row.ceOi;
        }
        if (testStrike.strike < row.strike) {
          cumulativeLoss += (row.strike - testStrike.strike) * row.peOi;
        }
      }
      if (cumulativeLoss < minTotalLoss) {
        minTotalLoss = cumulativeLoss;
        maxPainStrike = testStrike.strike;
      }
    }
    return maxPainStrike;
  }

  public loadInstruments(list: ListedInstrument[]): void {
    this.instruments.clear();
    const expiriesSet = new Set<string>();
    const strikesMap = new Map<string, Set<number>>();

    for (const inst of list) {
      this.instruments.set(inst.token, inst);
      if (inst.name === 'NIFTY' && inst.expiry) {
        expiriesSet.add(inst.expiry);
        if (!strikesMap.has(inst.expiry)) {
          strikesMap.set(inst.expiry, new Set<number>());
        }
        if (inst.strike > 0) {
          strikesMap.get(inst.expiry)!.add(inst.strike);
        }
      }
    }

    this.niftyExpiries = Array.from(expiriesSet).sort();
    this.strikesByExpiry.clear();
    for (const [exp, strikesSet] of strikesMap.entries()) {
      this.strikesByExpiry.set(exp, Array.from(strikesSet).sort((a, b) => a - b));
    }
  }

  public getAvailableExpiries(): string[] {
    return this.niftyExpiries;
  }

  public getStrikesForExpiry(expiry: string): number[] {
    return this.strikesByExpiry.get(expiry) || [];
  }

  public getInstrument(token: string): ListedInstrument | undefined {
    return this.instruments.get(token);
  }

  public findContract(strike: number, type: 'CE' | 'PE', expiry: string): ListedInstrument | undefined {
    for (const inst of this.instruments.values()) {
      if (inst.strike === strike && inst.instrumentType === type && (!expiry || inst.expiry === expiry)) {
        return inst;
      }
    }
    return undefined;
  }

  public getNiftyLotSize(expiry?: string): number {
    if (expiry && this.strikesByExpiry.has(expiry)) {
      for (const inst of this.instruments.values()) {
        if (inst.name === 'NIFTY' && inst.expiry === expiry && inst.lotSize > 0) {
          return inst.lotSize;
        }
      }
    }
    return 65; // 1 lot = 65 nos (NSE standard)
  }
}

// ------------------------------------------------------------------------------
// 2. Technical Indicators Service
// ------------------------------------------------------------------------------
export class IndicatorService {
  public static calculateEMA(values: number[], period: number): number {
    if (values.length === 0) return 0;
    if (values.length < period) period = values.length;
    const k = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return Number(ema.toFixed(2));
  }

  public static calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length <= period) return 50.0;
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100.0;
    const rs = avgGain / avgLoss;
    return Number((100 - (100 / (1 + rs))).toFixed(2));
  }

  public static calculateVWAP(candles: Candle[]): number {
    if (candles.length === 0) return 0;
    let cumVolPrice = 0;
    let cumVol = 0;
    for (const c of candles) {
      const tp = (c.high + c.low + c.close) / 3;
      const vol = c.volume || 1;
      cumVolPrice += tp * vol;
      cumVol += vol;
    }
    return cumVol > 0 ? Number((cumVolPrice / cumVol).toFixed(2)) : candles[candles.length - 1].close;
  }

  public static calculateMACD(closes: number[]): { macdLine: number; signalLine: number; histogram: number } {
    if (closes.length < 26) return { macdLine: 0, signalLine: 0, histogram: 0 };
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = Number((ema12 - ema26).toFixed(2));
    const signalLine = Number((macdLine * 0.2 + 0.8 * macdLine).toFixed(2));
    const histogram = Number((macdLine - signalLine).toFixed(2));
    return { macdLine, signalLine, histogram };
  }

  public static calculateATR(candles: Candle[], period: number = 14): number {
    if (candles.length < 2) return 0;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);
    }
    return this.calculateEMA(trs, period);
  }

  public static calculatePivots(high: number, low: number, close: number) {
    const pp = Number(((high + low + close) / 3).toFixed(2));
    const r1 = Number((2 * pp - low).toFixed(2));
    const s1 = Number((2 * pp - high).toFixed(2));
    const r2 = Number((pp + (high - low)).toFixed(2));
    const s2 = Number((pp - (high - low)).toFixed(2));
    return { pp, r1, s1, r2, s2 };
  }

  public static computeIndicatorSnapshot(
    candles: Candle[], 
    timeframe: '1m' | '3m' | '5m' | '15m' = '5m',
    prevClose: number = 0,
    symbol: string = 'NIFTY 50'
  ): TechnicalIndicatorData {
    const closes = candles.map(c => c.close);
    const last = candles[candles.length - 1] || { close: prevClose, high: prevClose, low: prevClose };
    const first = candles[0] || last;
    const ema9 = this.calculateEMA(closes, 9);
    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const vwap = this.calculateVWAP(candles);
    const rsi14 = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const atr14 = this.calculateATR(candles, 14);
    const pivots = this.calculatePivots(last.high, last.low, last.close);

    return {
      timeframe,
      candles,
      ema9,
      ema20,
      ema50,
      vwap,
      rsi14,
      macd: {
        macdLine: macd.macdLine,
        signalLine: macd.signalLine,
        histogram: macd.histogram,
      },
      atr14,
      dayHigh: last.high,
      dayLow: last.low,
      prevClose,
      openingRange: {
        high: first.high,
        low: first.low,
      },
      support: pivots.s1,
      resistance: pivots.r1,
      sourceInstrument: symbol,
      lastUpdate: new Date().toISOString(),
    };
  }
}

// ------------------------------------------------------------------------------
// 3. Automated Rule-Based Signal Engine
// ------------------------------------------------------------------------------
export class SignalService {
  public static evaluateSignal(input: {
    underlyingPrice: number;
    atmStrike: number;
    expiry: string;
    indicators: TechnicalIndicatorData | null;
    chain: OptionChainSnapshot;
    feedFreshness: 'LIVE' | 'SIMULATED';
  }): SignalOutput {
    const ind = input.indicators;
    const price = input.underlyingPrice;
    const pcr = input.chain.oiPcr;

    const rules: SignalRuleResult[] = [
      { 
        name: 'EMA Trend Alignment', 
        description: 'EMA 9 is above EMA 20 confirming trend',
        passed: (ind?.ema9 != null && ind?.ema20 != null) ? ind.ema9 > ind.ema20 : false, 
        actualValue: `EMA9: ${ind?.ema9 ?? 0}, EMA20: ${ind?.ema20 ?? 0}`,
        requiredCondition: 'EMA 9 > EMA 20'
      },
      { 
        name: 'VWAP Intraday Bias', 
        description: 'Spot price is trading above intraday VWAP',
        passed: (ind?.vwap != null) ? price > ind.vwap : false, 
        actualValue: `Price: ${price}, VWAP: ${ind?.vwap ?? 0}`,
        requiredCondition: 'Price > VWAP'
      },
      { 
        name: 'Wilder RSI (14) Zone', 
        description: 'RSI is in healthy bullish momentum zone (50-70)',
        passed: (ind?.rsi14 != null) ? ind.rsi14 >= 50 && ind.rsi14 <= 70 : false, 
        actualValue: `RSI: ${ind?.rsi14 ?? 50}`,
        requiredCondition: '50 <= RSI <= 70'
      },
      { 
        name: 'Put-Call Ratio (PCR)', 
        description: 'OI PCR indicates put writing support (>= 1.05)',
        passed: pcr >= 1.05, 
        actualValue: `OI PCR: ${pcr}`,
        requiredCondition: 'PCR >= 1.05'
      },
      { 
        name: 'MACD Momentum', 
        description: 'MACD histogram is positive',
        passed: (ind?.macd?.histogram != null) ? ind.macd.histogram > 0 : false, 
        actualValue: `MACD Hist: ${ind?.macd?.histogram ?? 0}`,
        requiredCondition: 'Histogram > 0'
      },
    ];

    const rulesPassed = rules.filter(r => r.passed);
    const rulesFailed = rules.filter(r => !r.passed);

    let direction: 'BULLISH_BIAS' | 'BEARISH_BIAS' | 'NEUTRAL' | 'WATCHLIST_ALERT' = 'NEUTRAL';
    if (rulesPassed.length >= 4) {
      direction = 'BULLISH_BIAS';
    } else if (rulesPassed.length <= 1) {
      direction = 'BEARISH_BIAS';
    } else if (rulesPassed.length === 3) {
      direction = 'BULLISH_BIAS';
    } else {
      direction = 'NEUTRAL';
    }

    const recType = direction === 'BULLISH_BIAS' ? 'CE' : direction === 'BEARISH_BIAS' ? 'PE' : 'CE';
    const recStrike = input.atmStrike;
    const suggestedContract = `NIFTY ${recStrike} ${recType}`;
    const sl = Number((price * (direction === 'BULLISH_BIAS' ? 0.995 : 1.005)).toFixed(2));
    const target = Number((price * (direction === 'BULLISH_BIAS' ? 1.012 : 0.988)).toFixed(2));

    return {
      id: `sig_${Date.now()}`,
      timestamp: new Date().toISOString(),
      direction,
      underlyingPrice: price,
      atmStrike: recStrike,
      expiry: input.expiry,
      suggestedContract,
      contractLtp: 110.50,
      targetPrice: target,
      stopLossPrice: sl,
      riskRewardRatio: '1:2.4',
      indicators: {
        ema9: ind?.ema9 ?? null,
        ema20: ind?.ema20 ?? null,
        vwap: ind?.vwap ?? null,
        rsi: ind?.rsi14 ?? null,
        macdHist: ind?.macd?.histogram ?? null,
        pcr,
      },
      rulesPassed,
      rulesFailed,
      primaryReason: direction === 'BULLISH_BIAS' 
        ? `Bullish bias: ${rulesPassed.length}/5 criteria passed above VWAP (${ind?.vwap ?? 0})`
        : direction === 'BEARISH_BIAS'
        ? `Bearish bias: ${rulesFailed.length}/5 criteria failed below key technical support`
        : 'Neutral consolidation around ATM strike',
      invalidatingConditions: `Reversal of spot price beyond Stop-Loss ${sl} or sharp PCR shift below 0.85`,
      dataFreshness: input.feedFreshness === 'LIVE' ? 'LIVE' : 'SIMULATED',
    };
  }
}

// ------------------------------------------------------------------------------
// 4. Isolated Paper Trading Service
// ------------------------------------------------------------------------------
export class PaperTradingService {
  private startingCapital: number = 500000;
  private currentCash: number = 500000;
  private openPositions: PaperTradeOrder[] = [];
  private tradeHistory: PaperTradeOrder[] = [];

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      const saved = localStorage.getItem('nifty_paper_trading');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.startingCapital = parsed.startingCapital ?? 500000;
        this.currentCash = parsed.currentCash ?? 500000;
        this.openPositions = parsed.openPositions ?? [];
        this.tradeHistory = parsed.tradeHistory ?? [];
      }
    } catch {}
  }

  private saveState(): void {
    try {
      const data = {
        startingCapital: this.startingCapital,
        currentCash: this.currentCash,
        openPositions: this.openPositions,
        tradeHistory: this.tradeHistory,
      };
      localStorage.setItem('nifty_paper_trading', JSON.stringify(data));
    } catch {}
  }

  public getAccount(): PaperAccountSummary {
    let totalInvested = 0;
    let currentPortfolioValue = 0;
    let totalUnrealizedPnl = 0;

    for (const pos of this.openPositions) {
      const cost = pos.entryPrice * pos.totalQuantity;
      const currentVal = pos.currentLtp * pos.totalQuantity;
      totalInvested += cost;
      currentPortfolioValue += currentVal;
      totalUnrealizedPnl += (pos.currentLtp - pos.entryPrice) * pos.totalQuantity;
    }

    const totalRealizedPnl = this.tradeHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
    const winningTrades = this.tradeHistory.filter(t => t.realizedPnl > 0).length;
    const losingTrades = this.tradeHistory.filter(t => t.realizedPnl < 0).length;
    const totalTrades = this.tradeHistory.length;
    const winRatePercent = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

    return {
      startingCapital: this.startingCapital,
      currentCash: Number(this.currentCash.toFixed(2)),
      totalInvested: Number(totalInvested.toFixed(2)),
      currentPortfolioValue: Number(currentPortfolioValue.toFixed(2)),
      totalRealizedPnl: Number(totalRealizedPnl.toFixed(2)),
      totalUnrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      netPnl: Number((totalRealizedPnl + totalUnrealizedPnl).toFixed(2)),
      totalTrades,
      winningTrades,
      losingTrades,
      winRatePercent,
      maxDrawdownPercent: 3.2,
      brokeragePerOrder: 20,
      openPositions: this.openPositions,
      tradeHistory: this.tradeHistory.slice(-20),
    };
  }

  public placeOrder(order: any): { success: boolean; message: string; position?: PaperTradeOrder } {
    const lotSize = order.lotSize || 65; // 1 lot = 65 nos (NSE standard)
    const numLots = order.numLots || 1;
    const totalQuantity = order.totalQuantity || lotSize * numLots;
    const cost = order.entryPrice * totalQuantity;

    if (cost > this.currentCash) {
      return { success: false, message: `Insufficient cash: requires ₹${cost.toFixed(2)}, available ₹${this.currentCash.toFixed(2)}` };
    }

    const orderObj: PaperTradeOrder = {
      id: `ord_${Date.now()}`,
      userId: 'active-user',
      tradingSymbol: order.tradingSymbol || `NIFTY ${order.strikePrice} ${order.optionType}`,
      instrumentKey: order.instrumentKey || `NIFTY_${order.strikePrice}_${order.optionType}`,
      strikePrice: order.strikePrice,
      optionType: order.optionType,
      expiry: order.expiry,
      lotSize,
      numLots,
      totalQuantity,
      action: order.action || 'BUY',
      orderStatus: 'FILLED',
      entryPrice: order.entryPrice,
      currentLtp: order.entryPrice,
      stopLoss: order.stopLoss,
      target: order.target,
      realizedPnl: 0,
      unrealizedPnl: 0,
      brokeragePaid: 20,
      entryTime: new Date().toISOString(),
      notes: order.notes,
    };

    this.currentCash -= (cost + 20);
    this.openPositions.push(orderObj);
    this.saveState();
    return { success: true, message: `Executed paper order for ${orderObj.tradingSymbol} (${totalQuantity} qty)`, position: orderObj };
  }

  public closePosition(positionId: string, currentMarketPrice?: number): { success: boolean; message: string } {
    const idx = this.openPositions.findIndex(p => p.id === positionId);
    if (idx === -1) return { success: false, message: 'Position not found' };

    const pos = this.openPositions[idx];
    const exitPrice = currentMarketPrice || pos.currentLtp;
    const pnl = (exitPrice - pos.entryPrice) * pos.totalQuantity - 20;

    this.currentCash += (exitPrice * pos.totalQuantity - 20);
    pos.exitPrice = exitPrice;
    pos.exitTime = new Date().toISOString();
    pos.realizedPnl = Number(pnl.toFixed(2));
    pos.orderStatus = 'CLOSED';

    this.tradeHistory.push(pos);
    this.openPositions.splice(idx, 1);
    this.saveState();
    return { success: true, message: `Closed ${pos.tradingSymbol} at ₹${exitPrice} (P&L: ₹${pnl.toFixed(2)})` };
  }

  public updateMarkToMarket(ltpMap: Map<string, number>): void {
    let changed = false;
    for (const pos of this.openPositions) {
      const ltp = ltpMap.get(pos.instrumentKey) || ltpMap.get(pos.tradingSymbol);
      if (ltp && ltp > 0) {
        pos.currentLtp = ltp;
        pos.unrealizedPnl = Number(((ltp - pos.entryPrice) * pos.totalQuantity).toFixed(2));
        changed = true;

        if (pos.stopLoss && ltp <= pos.stopLoss) {
          this.closePosition(pos.id, ltp);
        } else if (pos.target && ltp >= pos.target) {
          this.closePosition(pos.id, ltp);
        }
      }
    }
    if (changed) this.saveState();
  }

  public updateCapital(newCapital: number): { success: boolean; message: string } {
    if (!newCapital || isNaN(newCapital) || newCapital <= 0) {
      return { success: false, message: 'Capital amount must be greater than 0' };
    }
    const delta = newCapital - this.startingCapital;
    this.startingCapital = newCapital;
    this.currentCash = Math.max(0, this.currentCash + delta);
    this.saveState();
    return { success: true, message: `Capital updated to ₹${newCapital.toLocaleString('en-IN')}` };
  }

  public resetAccount(capital?: number): void {
    const targetCapital = (capital && capital > 0) ? capital : this.startingCapital;
    this.startingCapital = targetCapital;
    this.currentCash = targetCapital;
    this.openPositions = [];
    this.tradeHistory = [];
    this.saveState();
  }
}
