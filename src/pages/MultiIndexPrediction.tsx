// ==============================================================================
// Multi-Index Real-Time Strike Prediction Page
// Quantitative Buy/Sell Signals, Targets, Stop Losses, & Win Probabilities for:
// - NIFTY 50
// - BANK NIFTY
// - BSE SENSEX
// - NIFTY MIDCAP SELECT (MIDCPNIFTY)
// ==============================================================================

import React, { useState, useMemo } from 'react';
import {
  UnderlyingSnapshot, OptionChainSnapshot, TechnicalIndicatorData
} from '../types/market';
import {
  MultiIndexService, SupportedIndex, INDEX_CONFIGS
} from '../services/multiIndexService';
import {
  StrikePrediction
} from '../services/predictionEngine';
import {
  Sparkles, TrendingUp, TrendingDown, Target, ShieldAlert,
  Zap, Award, Compass, BarChart2, CheckCircle2, AlertTriangle,
  Filter, Search, Layers, ShieldCheck, ArrowRight, Activity,
  Clock, Check, X, Shield, ArrowUpDown
} from 'lucide-react';

const ACTION_PRIORITY: Record<string, number> = {
  'STRONG_BUY': 1,
  'BUY': 2,
  'SELL_WRITE': 3,
  'NEUTRAL': 4,
  'AVOID': 5,
};

type SortField = 'action' | 'strike' | 'winProb' | 'ltp';
type SortOrder = 'asc' | 'desc';

interface MultiIndexPredictionProps {
  liveNiftyUnderlying: UnderlyingSnapshot | null;
  liveNiftyOptionChain: OptionChainSnapshot | null;
  liveNiftyIndicators: TechnicalIndicatorData | null;
  onTradeClick?: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
  onNavigateToChain?: () => void;
}

export const MultiIndexPrediction: React.FC<MultiIndexPredictionProps> = ({
  liveNiftyUnderlying,
  liveNiftyOptionChain,
  onTradeClick,
  onNavigateToChain,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<SupportedIndex>('BANKNIFTY');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'BUY_CE' | 'BUY_PE' | 'NEAR_ATM' | 'HIGH_CONFIDENCE' | 'WRITERS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPrediction, setSelectedPrediction] = useState<StrikePrediction | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('action');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Compute underlying, option chain, and predictions for the selected index
  const { underlying, predictions, summary } = useMemo(() => {
    const under = MultiIndexService.getUnderlying(selectedIndex, liveNiftyUnderlying);
    const { predictions: preds, summary: summ } = MultiIndexService.getPredictions(
      selectedIndex,
      liveNiftyUnderlying,
      liveNiftyOptionChain
    );
    return { underlying: under, predictions: preds, summary: summ };
  }, [selectedIndex, liveNiftyUnderlying, liveNiftyOptionChain]);

  const atmStrike = underlying.atmStrike;
  const config = INDEX_CONFIGS[selectedIndex];

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      // For action, 'asc' starts with STRONG_BUY (Priority 1)
      // For winProb and ltp, default to 'desc' (highest first)
      // For strike, default to 'asc'
      setSortOrder(field === 'winProb' || field === 'ltp' ? 'desc' : 'asc');
    }
  };

  // Filter and sort predictions
  const filteredPredictions = useMemo(() => {
    let list = [...predictions];

    if (searchQuery.trim()) {
      list = list.filter(p => p.strike.toString().includes(searchQuery.trim()));
    }

    switch (selectedFilter) {
      case 'BUY_CE':
        list = list.filter(p => p.optionType === 'CE' && (p.action === 'STRONG_BUY' || p.action === 'BUY'));
        break;
      case 'BUY_PE':
        list = list.filter(p => p.optionType === 'PE' && (p.action === 'STRONG_BUY' || p.action === 'BUY'));
        break;
      case 'NEAR_ATM':
        list = list.filter(p => Math.abs(p.strike - atmStrike) <= config.strikeStep * 2);
        break;
      case 'HIGH_CONFIDENCE':
        list = list.filter(p => p.confidenceScore >= 75);
        break;
      case 'WRITERS':
        list = list.filter(p => p.action === 'SELL_WRITE');
        break;
    }

    // Sort predictions (Default: Action -> Strong Buy, Buy, Sell Write, Neutral, Avoid)
    list.sort((a, b) => {
      if (sortBy === 'action') {
        const pA = ACTION_PRIORITY[a.action] || 99;
        const pB = ACTION_PRIORITY[b.action] || 99;
        if (pA !== pB) {
          return sortOrder === 'asc' ? pA - pB : pB - pA;
        }
        // Secondary sort: highest winProbability first
        return b.winProbability - a.winProbability;
      }
      if (sortBy === 'winProb') {
        return sortOrder === 'asc'
          ? a.winProbability - b.winProbability
          : b.winProbability - a.winProbability;
      }
      if (sortBy === 'ltp') {
        return sortOrder === 'asc' ? a.ltp - b.ltp : b.ltp - a.ltp;
      }
      if (sortBy === 'strike') {
        return sortOrder === 'asc' ? a.strike - b.strike : b.strike - a.strike;
      }
      return 0;
    });

    return list;
  }, [predictions, searchQuery, selectedFilter, atmStrike, config.strikeStep, sortBy, sortOrder]);

  const getBiasBadge = () => {
    if (!summary) return null;
    const isBull = summary.bias.includes('BULLISH');
    const isBear = summary.bias.includes('BEARISH');
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 ${
        isBull
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
          : isBear
          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
      }`}>
        {isBull ? <TrendingUp className="h-3.5 w-3.5" /> : isBear ? <TrendingDown className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
        {summary.bias.replace('_', ' ')}
        <span className="text-[10px] opacity-80">({summary.confidence}% Conf.)</span>
      </span>
    );
  };

  return (
    <div className="p-2 sm:p-4 space-y-4 max-w-[1700px] mx-auto font-sans">
      {/* Index Selector Bar */}
      <div className="p-3 sm:p-4 rounded-xl border border-terminal-800 bg-terminal-900 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-terminal-800">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm sm:text-base font-bold text-slate-100 uppercase tracking-wider font-mono">
                Multi-Index Real-Time Option Predictions
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Select an index to evaluate algorithmic strike targets, win probabilities, and entry/exit timing
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Real-Time Model Active</span>
          </div>
        </div>

        {/* Index Switcher Tabs */}
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {(['NIFTY', 'BANKNIFTY', 'SENSEX', 'MIDCPNIFTY'] as SupportedIndex[]).map((idx) => {
            const cfg = INDEX_CONFIGS[idx];
            const isSelected = selectedIndex === idx;
            const spotData = MultiIndexService.getUnderlying(idx, liveNiftyUnderlying);
            const isPos = spotData.change >= 0;

            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedIndex(idx);
                  setSelectedPrediction(null);
                }}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40 shadow-sm'
                    : 'border-terminal-700/60 bg-terminal-850 hover:bg-terminal-800/80 hover:border-terminal-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold font-mono tracking-wider ${isSelected ? 'text-blue-400' : 'text-slate-200'}`}>
                    {cfg.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-terminal-800 text-slate-400 border border-terminal-700">
                    {cfg.exchange}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-sm sm:text-base font-bold font-mono text-slate-100">
                    ₹{spotData.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[11px] font-mono font-semibold flex items-center gap-0.5 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPos ? '+' : ''}{spotData.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-slate-400 flex justify-between items-center">
                  <span>ATM: ₹{spotData.atmStrike}</span>
                  <span className="text-slate-400">Lot: {cfg.lotSize}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Quantitative Summary Header */}
      {summary && (
        <div className="p-4 sm:p-5 rounded-xl border border-terminal-800 bg-terminal-900 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-terminal-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-mono tracking-wide">
                  {config.name} Strike Predictions & Signals
                </h1>
                <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-blue-500/10 text-blue-500 font-semibold border border-blue-500/20">
                  EXPIRY: {underlying.nearestExpiry}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                {config.description} • Real-time strike probabilities & targets
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400 hidden sm:inline">SESSION BIAS:</span>
              {getBiasBadge()}
            </div>
          </div>

          {/* Intraday Range, Call vs Put, & Quantitative Rationale */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs font-mono">
            {/* Call Buyers vs Put Buyers Ratio */}
            <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
              <div className="flex justify-between items-center text-slate-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  Call Buyers: {summary.callBuyingPower}%
                </span>
                <span className="flex items-center gap-1">
                  Put Buyers: {summary.putBuyingPower}%
                  <TrendingDown className="h-3 w-3 text-rose-400" />
                </span>
              </div>
              <div className="h-2 w-full bg-rose-500/30 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${summary.callBuyingPower}%` }}
                />
                <div
                  className="bg-rose-500 h-full transition-all duration-500"
                  style={{ width: `${summary.putBuyingPower}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                Calculated from Option Chain PCR, Volume build-up & Intraday VWAP
              </span>
            </div>

            {/* Projected Strike Range */}
            <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
              <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-1">
                Projected Intraday Strike Range
              </div>
              <div className="flex items-center justify-between font-bold text-slate-200">
                <div>
                  <span className="text-[10px] text-emerald-400 block">SUPPORT (FLOOR)</span>
                  <span className="text-sm font-mono text-emerald-400">₹{summary.keySupport}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <div className="text-center">
                  <span className="text-[10px] text-blue-400 block">CURRENT ATM</span>
                  <span className="text-sm font-mono text-blue-400">₹{atmStrike}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <div className="text-right">
                  <span className="text-[10px] text-rose-400 block">RESISTANCE (ROOF)</span>
                  <span className="text-sm font-mono text-rose-400">₹{summary.keyResistance}</span>
                </div>
              </div>
            </div>

            {/* Model Summary Rationale */}
            <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
              <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-1">
                Quantitative Rationale
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                {summary.summaryRationale}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Recommendations Cards (Top Call & Top Put) */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Top Call Pick */}
          {summary.topCallPick ? (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" />
                  TOP CALL BUY RECOMMENDATION
                </span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {summary.topCallPick.winProbability}% Win Prob
                </span>
              </div>
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {config.symbol} {summary.topCallPick.strike} CE
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Entry: ₹{summary.topCallPick.entryPrice} • Delta: {summary.topCallPick.delta.toFixed(2)} • {summary.topCallPick.moneyness}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-terminal-850 rounded-lg text-center font-mono text-xs border border-terminal-700/60">
                <div>
                  <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                  <span className="font-bold text-emerald-400">₹{summary.topCallPick.target1}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                  <span className="font-bold text-emerald-300">₹{summary.topCallPick.target2}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                  <span className="font-bold text-rose-400">₹{summary.topCallPick.stopLoss}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-400" />
                  Entry Timing: {summary.topCallPick.entryTimeWindow}
                </span>
                {onTradeClick && (
                  <button
                    onClick={() => onTradeClick(
                      summary.topCallPick!.symbol,
                      summary.topCallPick!.strike,
                      'CE',
                      summary.topCallPick!.ltp
                    )}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Simulate Call
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-terminal-800 bg-terminal-900 text-center text-xs text-slate-400 flex items-center justify-center font-mono">
              No High-Conviction Call Buy Setup Currently
            </div>
          )}

          {/* Top Put Pick */}
          {summary.topPutPick ? (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" />
                  TOP PUT BUY RECOMMENDATION
                </span>
                <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                  {summary.topPutPick.winProbability}% Win Prob
                </span>
              </div>
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {config.symbol} {summary.topPutPick.strike} PE
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Entry: ₹{summary.topPutPick.entryPrice} • Delta: {summary.topPutPick.delta.toFixed(2)} • {summary.topPutPick.moneyness}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-terminal-850 rounded-lg text-center font-mono text-xs border border-terminal-700/60">
                <div>
                  <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                  <span className="font-bold text-emerald-400">₹{summary.topPutPick.target1}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                  <span className="font-bold text-emerald-300">₹{summary.topPutPick.target2}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                  <span className="font-bold text-rose-400">₹{summary.topPutPick.stopLoss}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-400" />
                  Entry Timing: {summary.topPutPick.entryTimeWindow}
                </span>
                {onTradeClick && (
                  <button
                    onClick={() => onTradeClick(
                      summary.topPutPick!.symbol,
                      summary.topPutPick!.strike,
                      'PE',
                      summary.topPutPick!.ltp
                    )}
                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Simulate Put
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-terminal-800 bg-terminal-900 text-center text-xs text-slate-400 flex items-center justify-center font-mono">
              No High-Conviction Put Buy Setup Currently
            </div>
          )}

          {/* Option Writer Pick */}
          {summary.topSellerPick ? (
            <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  OPTION WRITER PICK (SELLER)
                </span>
                <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                  {summary.topSellerPick.winProbability}% Decay Prob
                </span>
              </div>
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {summary.topSellerPick.symbol}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Premium: ₹{summary.topSellerPick.ltp} • Theta Decay: ₹8.4/day
                </div>
              </div>
              <div className="p-3 bg-terminal-850 rounded-lg text-xs font-mono border border-terminal-700/60 text-slate-300 leading-relaxed">
                High OTM resistance wall. Heavy call writing accumulation favors credit spread sellers for complete premium erosion by expiry.
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-terminal-800 bg-terminal-900 text-center text-xs text-slate-400 flex items-center justify-center font-mono">
              High volatility detected. Currently favoring buyers rather than premium sellers.
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-terminal-800 bg-terminal-900 text-xs font-mono">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1 sm:pb-0">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-1" />
          {[
            { id: 'ALL', label: 'All Strikes' },
            { id: 'BUY_CE', label: 'Buy Calls (CE)' },
            { id: 'BUY_PE', label: 'Buy Puts (PE)' },
            { id: 'NEAR_ATM', label: 'Near ATM (±2)' },
            { id: 'HIGH_CONFIDENCE', label: 'High Confidence (≥75%)' },
            { id: 'WRITERS', label: 'Option Writers' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id as any)}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                selectedFilter === tab.id
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'bg-terminal-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Sort Selector */}
          <div className="flex items-center gap-1.5 text-xs bg-terminal-850 border border-terminal-700 px-2.5 py-1.5 rounded-lg text-slate-300">
            <ArrowUpDown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">Sort:</span>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split('-') as [SortField, SortOrder];
                setSortBy(f);
                setSortOrder(o);
              }}
              aria-label="Sort strikes by action, win probability, price or strike"
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="action-asc" className="bg-terminal-900 text-emerald-400 font-bold">Model Action (Strong Buy First)</option>
              <option value="winProb-desc" className="bg-terminal-900 text-white">Win Prob (High to Low)</option>
              <option value="strike-asc" className="bg-terminal-900 text-white">Strike (Low to High)</option>
              <option value="strike-desc" className="bg-terminal-900 text-white">Strike (High to Low)</option>
              <option value="ltp-desc" className="bg-terminal-900 text-white">LTP (High to Low)</option>
              <option value="action-desc" className="bg-terminal-900 text-slate-400">Model Action (Avoid / Neutral First)</option>
            </select>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search Strike..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-terminal-850 border border-terminal-700 text-slate-200 placeholder-slate-500 text-xs w-full sm:w-40 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Strike Prediction Table */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900 overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-terminal-800 bg-terminal-850 text-slate-400 text-[11px] uppercase tracking-wider select-none">
                <th
                  onClick={() => handleSort('strike')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                  title="Click to sort by strike"
                >
                  <div className="flex items-center gap-1">
                    <span>Strike & Type</span>
                    <span className="text-[10px] text-slate-500">
                      {sortBy === 'strike' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ltp')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                  title="Click to sort by price"
                >
                  <div className="flex items-center gap-1">
                    <span>LTP (₹)</span>
                    <span className="text-[10px] text-slate-500">
                      {sortBy === 'ltp' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('action')}
                  className={`py-2.5 px-3 cursor-pointer transition-colors ${
                    sortBy === 'action'
                      ? 'bg-amber-500/15 text-amber-300 font-bold'
                      : 'hover:text-white'
                  }`}
                  title="Click to sort by Model Action (Strong Buy first)"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Model Action</span>
                    <span className="text-xs text-amber-400 font-bold">
                      {sortBy === 'action' ? (sortOrder === 'asc' ? '▼ (Strong Buy First)' : '▲') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('winProb')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                  title="Click to sort by win probability"
                >
                  <div className="flex items-center gap-1">
                    <span>Win Prob</span>
                    <span className="text-[10px] text-slate-500">
                      {sortBy === 'winProb' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th className="py-2.5 px-3">Target 1 & 2</th>
                <th className="py-2.5 px-3">Stop Loss</th>
                <th className="py-2.5 px-3">OI Build-up Phase</th>
                <th className="py-2.5 px-3">Entry Timing</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-800/60">
              {filteredPredictions.map((pred) => {
                const isCe = pred.optionType === 'CE';
                const isBuy = pred.action === 'STRONG_BUY' || pred.action === 'BUY';
                const isAtm = pred.strike === atmStrike;

                return (
                  <tr
                    key={`${pred.strike}_${pred.optionType}`}
                    onClick={() => setSelectedPrediction(pred)}
                    className={`hover:bg-terminal-800/40 transition-colors cursor-pointer ${
                      isAtm ? 'bg-blue-500/5' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold">
                      <div className="flex items-center gap-1.5">
                        <span className={isCe ? 'text-emerald-400' : 'text-rose-400'}>
                          ₹{pred.strike} {pred.optionType}
                        </span>
                        {isAtm && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">
                            ATM
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">({pred.moneyness})</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-200">
                      ₹{pred.ltp.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        pred.action === 'STRONG_BUY'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : pred.action === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : pred.action === 'SELL_WRITE'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-terminal-800 text-slate-400'
                      }`}>
                        {pred.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold ${pred.winProbability >= 75 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {pred.winProbability}%
                        </span>
                        <div className="w-12 h-1.5 bg-terminal-800 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full ${pred.winProbability >= 75 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                            style={{ width: `${pred.winProbability}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">
                      ₹{pred.target1} / ₹{pred.target2}
                    </td>
                    <td className="py-2.5 px-3 text-rose-400 font-semibold">
                      ₹{pred.stopLoss}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <span className="text-[11px] block text-slate-300">{pred.oiBuildUp.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-400">R:R {pred.riskReward}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {pred.entryTimeWindow}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isBuy && onTradeClick && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTradeClick(pred.symbol, pred.strike, pred.optionType, pred.ltp);
                          }}
                          className={`px-2.5 py-1 rounded text-white font-bold text-[11px] transition-colors cursor-pointer ${
                            isCe ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                          }`}
                        >
                          Simulate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strike Details Modal */}
      {selectedPrediction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-terminal-900 border border-terminal-700 rounded-xl max-w-lg w-full p-5 space-y-4 font-mono text-xs shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-terminal-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-bold ${
                    selectedPrediction.optionType === 'CE' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {config.symbol} {selectedPrediction.strike} {selectedPrediction.optionType}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                    {selectedPrediction.moneyness}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  LTP: ₹{selectedPrediction.ltp} • Win Probability: {selectedPrediction.winProbability}%
                </p>
              </div>
              <button
                onClick={() => setSelectedPrediction(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-terminal-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-terminal-850 rounded-lg text-center border border-terminal-700">
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                <span className="text-sm font-bold text-emerald-400">₹{selectedPrediction.target1}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                <span className="text-sm font-bold text-emerald-300">₹{selectedPrediction.target2}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                <span className="text-sm font-bold text-rose-400">₹{selectedPrediction.stopLoss}</span>
              </div>
            </div>

            <div className="space-y-2 text-slate-300">
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Optimal Entry Window:</span>
                <span className="text-white font-semibold">{selectedPrediction.entryTimeWindow}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Trailing SL Rule:</span>
                <span className="text-emerald-300">{selectedPrediction.trailingSlRule}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Mandatory Exit Time:</span>
                <span className="text-amber-300">{selectedPrediction.mandatoryExitTime}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Risk-to-Reward:</span>
                <span className="text-white font-bold">{selectedPrediction.riskReward}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Delta / IV:</span>
                <span className="text-slate-200">{selectedPrediction.delta.toFixed(2)} / {selectedPrediction.iv}%</span>
              </div>
            </div>

            {selectedPrediction.reasons.length > 0 && (
              <div className="p-3 bg-terminal-950 rounded-lg border border-terminal-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Model Rationale & Evidence:
                </span>
                {selectedPrediction.reasons.map((r, i) => (
                  <div key={i} className="text-slate-300 text-[11px] flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedPrediction(null)}
                className="px-4 py-2 rounded-lg bg-terminal-800 hover:bg-terminal-700 text-slate-300 cursor-pointer"
              >
                Close
              </button>
              {onTradeClick && (
                <button
                  onClick={() => {
                    onTradeClick(
                      selectedPrediction.symbol,
                      selectedPrediction.strike,
                      selectedPrediction.optionType,
                      selectedPrediction.ltp
                    );
                    setSelectedPrediction(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
                >
                  Simulate Paper Trade
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

