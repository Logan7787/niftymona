// ==============================================================================
// Common Normalized Market Data Models & Trading Types
// ==============================================================================

export type BrokerProvider = 'angelone' | 'upstox' | 'mock';

export type MarketStatus = 'PRE-OPEN' | 'OPEN' | 'CLOSED' | 'UNKNOWN';

export type ConnectionStatus = 'connected' | 'disconnected' | 'authenticating' | 'error' | 'token_expired';

export type OptionType = 'CE' | 'PE';

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface NormalizedMarketTick {
  provider: BrokerProvider;
  exchange: 'NSE' | 'NFO';
  instrumentKey: string;
  tradingSymbol: string;
  instrumentType: 'INDEX' | 'CE' | 'PE';
  strike?: number;
  expiry?: string; // YYYY-MM-DD
  optionType?: OptionType;
  ltp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prevClose?: number;
  priceChange?: number;
  changePercent?: number;
  volume: number;
  oi?: number;
  prevOi?: number;
  oiChange?: number;
  oiChangePercent?: number;
  bidPrice?: number;
  bidQty?: number;
  askPrice?: number;
  askQty?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  exchangeTimestamp: string;
  receivedTimestamp: string;
  isStale: boolean;
}

export interface UnderlyingSnapshot {
  symbol: string;
  spotPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  atmStrike: number;
  nearestExpiry: string;
  availableExpiries: string[];
  indiaVix?: number;
  marketStatus: MarketStatus;
  lastUpdate: string;
  isSimulated: boolean;
}

export interface OptionContractData {
  instrumentKey: string;
  symbol: string;
  strike: number;
  expiry: string;
  optionType: OptionType;
  moneyness: Moneyness;
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  oi: number | null;
  oiChange: number | null;
  iv: number | null;
  delta: number | null;
  theta: number | null;
  gamma: number | null;
  vega: number | null;
  lastUpdate: string | null;
  isStale: boolean;
}

export interface OptionChainRow {
  strike: number;
  isAtm: boolean;
  distanceFromAtm: number; // 0 for ATM, +1 for 1 strike OTM/ITM etc
  ce: OptionContractData;
  pe: OptionContractData;
}

export interface OptionChainSnapshot {
  underlying: UnderlyingSnapshot;
  selectedExpiry: string;
  atmStrike: number;
  strikeInterval: number;
  rows: OptionChainRow[];
  totalCeOi: number;
  totalPeOi: number;
  totalCeVolume: number;
  totalPeVolume: number;
  oiPcr: number;
  volumePcr: number;
  maxPainStrike: number;
  supportStrike: number;
  resistanceStrike: number;
  provider: BrokerProvider;
  dataFreshness: 'LIVE' | 'DELAYED' | 'STALE' | 'SIMULATED';
  timestamp: string;
}

export interface Candle {
  timestamp: string; // ISO string
  time: number;      // Unix timestamp in seconds for Lightweight Charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicatorData {
  timeframe: '1m' | '3m' | '5m' | '15m';
  candles: Candle[];
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  vwap: number | null;
  rsi14: number | null;
  macd: {
    macdLine: number | null;
    signalLine: number | null;
    histogram: number | null;
  };
  atr14: number | null;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  openingRange: {
    high: number;
    low: number;
  };
  support: number;
  resistance: number;
  sourceInstrument: string;
  lastUpdate: string;
}

export interface SignalRuleResult {
  name: string;
  description: string;
  passed: boolean;
  actualValue: string | number;
  requiredCondition: string;
}

export interface SignalOutput {
  id: string;
  timestamp: string;
  direction: 'BULLISH_BIAS' | 'BEARISH_BIAS' | 'NEUTRAL' | 'WATCHLIST_ALERT';
  underlyingPrice: number;
  atmStrike: number;
  expiry: string;
  suggestedContract: string;
  contractLtp: number;
  targetPrice: number;
  stopLossPrice: number;
  riskRewardRatio: string;
  indicators: {
    ema9: number | null;
    ema20: number | null;
    vwap: number | null;
    rsi: number | null;
    macdHist: number | null;
    pcr: number | null;
  };
  rulesPassed: SignalRuleResult[];
  rulesFailed: SignalRuleResult[];
  primaryReason: string;
  invalidatingConditions: string;
  dataFreshness: 'LIVE' | 'SIMULATED' | 'STALE';
}

export interface AlertRule {
  id: string;
  userId: string;
  name: string;
  type: 'PRICE_CROSS_ABOVE' | 'PRICE_CROSS_BELOW' | 'ATM_STRIKE_CHANGE' | 'PCR_CROSS_ABOVE' | 'PCR_CROSS_BELOW' | 'PREMIUM_SPIKE' | 'FEED_DISCONNECTED';
  targetValue?: number;
  strikePrice?: number;
  optionType?: OptionType;
  isEnabled: boolean;
  cooldownMinutes: number;
  lastTriggeredAt?: string;
}

export interface AlertNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  timestamp: string;
  isRead: boolean;
}

export interface PaperTradeOrder {
  id: string;
  userId: string;
  tradingSymbol: string;
  instrumentKey: string;
  strikePrice: number;
  optionType: OptionType;
  expiry: string;
  lotSize: number;
  numLots: number;
  totalQuantity: number;
  action: 'BUY' | 'SELL';
  orderStatus: 'FILLED' | 'CLOSED';
  entryPrice: number;
  exitPrice?: number;
  currentLtp: number;
  stopLoss?: number;
  target?: number;
  realizedPnl: number;
  unrealizedPnl: number;
  brokeragePaid: number;
  entryTime: string;
  exitTime?: string;
  notes?: string;
}

export interface PaperAccountSummary {
  startingCapital: number;
  currentCash: number;
  totalInvested: number;
  currentPortfolioValue: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  netPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  brokeragePerOrder: number;
  openPositions: PaperTradeOrder[];
  tradeHistory: PaperTradeOrder[];
}

export interface BrokerCredentialMasked {
  provider: BrokerProvider;
  clientCode: string; // e.g. "ANG***456"
  apiKey: string;     // e.g. "api_***abc"
  status: ConnectionStatus;
  lastConnectedAt?: string;
  tokenExpiresAt?: string;
  errorMessage?: string;
  isActive: boolean;
}
