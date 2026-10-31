// ==============================================================================
// NIFTY 50 Option Real-Time Strike Prediction Page
// Quantitative Buy/Sell Signals, Targets, Stop Losses, Entry/Exit Timing Predictions,
// and Live Real-Time Audio & Desktop Push Alerts
// ==============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import { 
  OptionChainSnapshot, UnderlyingSnapshot, TechnicalIndicatorData 
} from '../types/market';
import { 
  PredictionEngine, StrikePrediction, MarketPredictionSummary 
} from '../services/predictionEngine';
import { 
  alertManager, LiveAlert 
} from '../services/alertManager';
import { 
  Sparkles, TrendingUp, TrendingDown, Target, ShieldAlert, 
  Zap, Award, Compass, BarChart2, CheckCircle2, AlertTriangle, 
  Filter, Search, Layers, ShieldCheck, ArrowRight, Activity,
  Bell, BellRing, Volume2, VolumeX, Clock, Trash2, Play, Check, X
} from 'lucide-react';

interface OptionPredictionProps {
  optionChain: OptionChainSnapshot | null;
  underlying: UnderlyingSnapshot | null;
  indicators: TechnicalIndicatorData | null;
  onTradeClick: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
  onNavigateToChain?: () => void;
}

export const OptionPrediction: React.FC<OptionPredictionProps> = ({
  optionChain,
  underlying,
  indicators,
  onTradeClick,
  onNavigateToChain,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'BUY_CE' | 'BUY_PE' | 'NEAR_ATM' | 'HIGH_CONFIDENCE' | 'WRITERS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPrediction, setSelectedPrediction] = useState<StrikePrediction | null>(null);
  const [showAlertsModal, setShowAlertsModal] = useState<boolean>(false);
  const [activeAlerts, setActiveAlerts] = useState<LiveAlert[]>(() => alertManager.getAllAlerts());
  const [lastToast, setLastToast] = useState<{ title: string; message: string; type: 'success' | 'warning' | 'info' } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });

  // Subscribe to alertManager updates
  useEffect(() => {
    return alertManager.subscribe((alerts, notif) => {
      setActiveAlerts([...alerts]);
      if (notif) {
        setLastToast(notif);
        const timer = setTimeout(() => {
          setLastToast(null);
        }, 6500);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  // Real-time tick evaluation across all active alerts
  useEffect(() => {
    if (!optionChain?.rows) return;
    for (const row of optionChain.rows) {
      if (row.ce?.ltp) {
        alertManager.evaluateTick(row.strike, 'CE', row.ce.ltp);
      }
      if (row.pe?.ltp) {
        alertManager.evaluateTick(row.strike, 'PE', row.pe.ltp);
      }
    }
  }, [optionChain]);

  // Generate predictions dynamically from real-time option chain & indicators
  const { predictions, summary } = useMemo(() => {
    if (!optionChain || !underlying) {
      return { predictions: [], summary: null };
    }
    return PredictionEngine.generateMarketPredictions(optionChain, underlying, indicators);
  }, [optionChain, underlying, indicators]);

  const atmStrike = underlying?.atmStrike || 23050;

  // Filter predictions
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
        list = list.filter(p => Math.abs(p.strike - atmStrike) <= 150);
        break;
      case 'HIGH_CONFIDENCE':
        list = list.filter(p => p.confidenceScore >= 70);
        break;
      case 'WRITERS':
        list = list.filter(p => p.action === 'SELL_WRITE');
        break;
      default:
        break;
    }

    return list.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, [predictions, selectedFilter, searchQuery, atmStrike]);

  const handleToggleAlert = (pred: StrikePrediction) => {
    const isExisting = alertManager.getAlert(pred.strike, pred.optionType);
    if (isExisting) {
      alertManager.removeAlert(isExisting.id);
    } else {
      alertManager.setAlert({
        strike: pred.strike,
        optionType: pred.optionType,
        symbol: pred.symbol,
        action: pred.action,
        entryPrice: pred.entryPrice,
        target1: pred.target1,
        target2: pred.target2,
        stopLoss: pred.stopLoss,
        maxHoldMinutes: pred.maxHoldingMinutes,
      });
    }
  };

  const isAlertActive = (strike: number, optionType: 'CE' | 'PE') => {
    return Boolean(alertManager.getAlert(strike, optionType));
  };

  const handleRequestNotification = async () => {
    const perm = await alertManager.requestNotificationPermission();
    setNotificationPermission(perm);
  };

  if (!optionChain || !underlying || !summary) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-mono">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-3"></div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
          Generating real-time NIFTY option strike predictions...
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Evaluating OI build-ups, Greeks, VWAP momentum, and target projections
        </div>
      </div>
    );
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'STRONG_BUY':
        return (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shadow-sm flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> STRONG BUY
          </span>
        );
      case 'BUY':
        return (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
            BUY
          </span>
        );
      case 'SELL_WRITE':
        return (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
            WRITE (SELL)
          </span>
        );
      case 'AVOID':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            AVOID
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-200 dark:bg-terminal-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-terminal-700">
            WAIT / NEUTRAL
          </span>
        );
    }
  };

  const getOiBadge = (type: string, label: string) => {
    switch (type) {
      case 'LONG_BUILDUP':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">Long Build-up</span>;
      case 'SHORT_COVERING':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold">Short Covering</span>;
      case 'SHORT_BUILDUP':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">Short Build-up</span>;
      case 'LONG_UNWINDING':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold">Long Unwinding</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-terminal-800 text-slate-500 dark:text-slate-400">Neutral</span>;
    }
  };

  return (
    <div className="p-2 sm:p-4 space-y-4 font-mono max-w-7xl mx-auto relative">
      {/* ========================================================================= */}
      {/* FLOATING REAL-TIME ALERT TOAST NOTIFICATION                               */}
      {/* ========================================================================= */}
      {lastToast && (
        <div className="fixed top-16 right-4 z-50 max-w-md w-full animate-bounce shadow-2xl">
          <div className={`p-4 rounded-xl border backdrop-blur-md flex items-start gap-3 ${
            lastToast.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500 text-white shadow-emerald-900/40' 
              : lastToast.type === 'warning'
              ? 'bg-rose-950/90 border-rose-500 text-white shadow-rose-900/40'
              : 'bg-blue-950/90 border-blue-500 text-white shadow-blue-900/40'
          }`}>
            <div className="p-2 rounded-lg bg-white/10 shrink-0">
              <BellRing className="h-5 w-5 text-amber-400 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="font-extrabold text-sm">{lastToast.title}</div>
              <div className="text-xs text-slate-200 mt-0.5 leading-relaxed">{lastToast.message}</div>
            </div>
            <button 
              onClick={() => setLastToast(null)} 
              className="text-slate-400 hover:text-white p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. MARKET PREDICTION HERO RADAR                                           */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-200 dark:border-terminal-800 bg-white dark:bg-gradient-to-r dark:from-terminal-900 dark:via-terminal-900/95 dark:to-terminal-950 p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-terminal-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>NIFTY 50 Real-Time Option Predictions</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold">LIVE AI</span>
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Algorithmic buy/sell targets, win probabilities, entry/exit timing predictions, and real-time alerts
                </p>
              </div>
            </div>
          </div>

          {/* Alert Watcher & Bias Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Live Alerts Watcher Pill */}
            <button
              onClick={() => setShowAlertsModal(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                activeAlerts.length > 0 
                  ? 'bg-amber-500/15 text-amber-500 border-amber-500/40 shadow-sm shadow-amber-500/20' 
                  : 'bg-slate-100 dark:bg-terminal-850 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-terminal-700'
              }`}
            >
              <BellRing className={`h-4 w-4 ${activeAlerts.length > 0 ? 'text-amber-500 animate-pulse' : 'text-slate-400'}`} />
              <span>Live Alerts ({activeAlerts.length})</span>
            </button>

            {/* Current Market Bias Badge */}
            <div className="text-right pl-2 border-l border-slate-200 dark:border-terminal-800">
              <span className="text-[10px] text-slate-400 block uppercase">SESSION BIAS</span>
              <span className={`text-sm sm:text-base font-extrabold ${
                summary.bias.includes('BULLISH') ? 'text-emerald-600 dark:text-emerald-400' :
                summary.bias.includes('BEARISH') ? 'text-rose-600 dark:text-rose-400' : 'text-amber-500'
              }`}>
                {summary.bias.replace('_', ' ')}
              </span>
            </div>
            <div className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
              summary.bias.includes('BULLISH') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
              summary.bias.includes('BEARISH') ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {summary.confidence}% Conf.
            </div>
          </div>
        </div>

        {/* Buying Power Meter & Intraday Projected Range */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Buying Power Bar */}
          <div className="rounded-xl border border-slate-200 dark:border-terminal-800 bg-slate-50 dark:bg-terminal-850 p-3.5 space-y-2">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span className="font-bold flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" /> Call Buyers: {summary.callBuyingPower}%
              </span>
              <span className="font-bold flex items-center gap-1 text-rose-600 dark:text-rose-400">
                Put Buyers: {summary.putBuyingPower}% <TrendingDown className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="h-2.5 w-full bg-rose-500/30 rounded-full overflow-hidden flex">
              <div 
                className="bg-emerald-500 transition-all duration-500" 
                style={{ width: `${summary.callBuyingPower}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-slate-400 block">
              Calculated from PCR ({optionChain.oiPcr}), Intraday VWAP & Volume Accumulation
            </span>
          </div>

          {/* Intraday Predicted Range */}
          <div className="rounded-xl border border-slate-200 dark:border-terminal-800 bg-slate-50 dark:bg-terminal-850 p-3.5">
            <span className="text-[10px] text-slate-400 uppercase block">PROJECTED INTRADAY STRIKE RANGE</span>
            <div className="flex items-center justify-between mt-1">
              <div>
                <span className="text-[10px] text-emerald-500 block">SUPPORT (FLOOR)</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white">{summary.keySupport}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
              <div className="text-center">
                <span className="text-[10px] text-slate-400 block">CURRENT ATM</span>
                <span className="text-base font-extrabold text-blue-500">{atmStrike}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
              <div className="text-right">
                <span className="text-[10px] text-rose-500 block">RESISTANCE (ROOF)</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white">{summary.keyResistance}</span>
              </div>
            </div>
          </div>

          {/* AI Rationale Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-terminal-800 bg-slate-50 dark:bg-terminal-850 p-3.5 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase block">QUANTITATIVE RATIONALE</span>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mt-0.5">
              {summary.summaryRationale}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TOP AUTOMATED PICKS (WITH ENTRY & EXIT PREDICTED TIMINGS)               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* TOP CALL PICK */}
        {summary.topCallPick && (
          <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-transparent p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Award className="h-4 w-4" /> TOP CALL BUY RECOMMENDATION
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                {summary.topCallPick.confidenceScore}% Win Prob
              </span>
            </div>

            <div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {summary.topCallPick.symbol}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Entry: <strong className="text-slate-900 dark:text-white">₹{summary.topCallPick.entryPrice.toFixed(2)}</strong></span>
                <span>•</span>
                <span>{summary.topCallPick.moneyness}</span>
                <span>•</span>
                <span>Delta: {summary.topCallPick.delta}</span>
              </div>
            </div>

            {/* Target & SL Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-terminal-850 p-2.5 rounded-lg text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">₹{summary.topCallPick.target1.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">₹{summary.topCallPick.target2.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                <span className="font-extrabold text-rose-600 dark:text-rose-400">₹{summary.topCallPick.stopLoss.toFixed(1)}</span>
              </div>
            </div>

            {/* Predicted Entry & Exit Timing Card */}
            <div className="p-2.5 rounded-lg bg-slate-100/70 dark:bg-terminal-850/80 border border-slate-200 dark:border-terminal-750 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1 font-bold text-blue-500">
                  <Clock className="h-3 w-3" /> Entry Timing:
                </span>
                <span className="font-semibold">{summary.topCallPick.entryTimeWindow}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1 font-bold text-emerald-500">
                  <Target className="h-3 w-3" /> Exit Timing:
                </span>
                <span className="font-semibold">{summary.topCallPick.targetExitTime}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1 font-bold text-amber-500">
                  <ShieldAlert className="h-3 w-3" /> Hard Cut-off:
                </span>
                <span className="font-semibold">{summary.topCallPick.mandatoryExitTime}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleToggleAlert(summary.topCallPick!)}
                className={`w-1/2 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  isAlertActive(summary.topCallPick!.strike, 'CE')
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 shadow-sm'
                    : 'bg-white dark:bg-terminal-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-terminal-700 hover:border-amber-500'
                }`}
              >
                <Bell className={`h-3.5 w-3.5 ${isAlertActive(summary.topCallPick!.strike, 'CE') ? 'text-amber-500 fill-amber-500' : ''}`} />
                <span>{isAlertActive(summary.topCallPick!.strike, 'CE') ? 'Alert Armed' : 'Set Live Alert'}</span>
              </button>

              <button
                onClick={() => onTradeClick(
                  summary.topCallPick!.symbol,
                  summary.topCallPick!.strike,
                  'CE',
                  summary.topCallPick!.entryPrice
                )}
                className="w-1/2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Trade Call</span>
              </button>
            </div>
          </div>
        )}

        {/* TOP PUT PICK */}
        {summary.topPutPick && (
          <div className="rounded-xl border border-rose-500/40 bg-gradient-to-b from-rose-500/10 to-transparent p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Award className="h-4 w-4" /> TOP PUT BUY RECOMMENDATION
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">
                {summary.topPutPick.confidenceScore}% Win Prob
              </span>
            </div>

            <div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {summary.topPutPick.symbol}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Entry: <strong className="text-slate-900 dark:text-white">₹{summary.topPutPick.entryPrice.toFixed(2)}</strong></span>
                <span>•</span>
                <span>{summary.topPutPick.moneyness}</span>
                <span>•</span>
                <span>Delta: {summary.topPutPick.delta}</span>
              </div>
            </div>

            {/* Target & SL Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-terminal-850 p-2.5 rounded-lg text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">₹{summary.topPutPick.target1.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">₹{summary.topPutPick.target2.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                <span className="font-extrabold text-rose-600 dark:text-rose-400">₹{summary.topPutPick.stopLoss.toFixed(1)}</span>
              </div>
            </div>

            {/* Predicted Entry & Exit Timing Card */}
            <div className="p-2.5 rounded-lg bg-slate-100/70 dark:bg-terminal-850/80 border border-slate-200 dark:border-terminal-750 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1 font-bold text-blue-500">
                  <Clock className="h-3 w-3" /> Entry Timing:
                </span>
                <span className="font-semibold">{summary.topPutPick.entryTimeWindow}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1 font-bold text-emerald-500">
                  <Target className="h-3 w-3" /> Exit Timing:
                </span>
                <span className="font-semibold">{summary.topPutPick.targetExitTime}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1 font-bold text-amber-500">
                  <ShieldAlert className="h-3 w-3" /> Hard Cut-off:
                </span>
                <span className="font-semibold">{summary.topPutPick.mandatoryExitTime}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleToggleAlert(summary.topPutPick!)}
                className={`w-1/2 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  isAlertActive(summary.topPutPick!.strike, 'PE')
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 shadow-sm'
                    : 'bg-white dark:bg-terminal-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-terminal-700 hover:border-amber-500'
                }`}
              >
                <Bell className={`h-3.5 w-3.5 ${isAlertActive(summary.topPutPick!.strike, 'PE') ? 'text-amber-500 fill-amber-500' : ''}`} />
                <span>{isAlertActive(summary.topPutPick!.strike, 'PE') ? 'Alert Armed' : 'Set Live Alert'}</span>
              </button>

              <button
                onClick={() => onTradeClick(
                  summary.topPutPick!.symbol,
                  summary.topPutPick!.strike,
                  'PE',
                  summary.topPutPick!.entryPrice
                )}
                className="w-1/2 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-rose-900/30 transition-all cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Trade Put</span>
              </button>
            </div>
          </div>
        )}

        {/* TOP SELLER / THETA PICK */}
        {summary.topSellerPick ? (
          <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-b from-indigo-500/10 to-transparent p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider uppercase text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> BEST STRIKE FOR OPTION WRITERS
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold">
                {summary.topSellerPick.winProbability}% Decay Win
              </span>
            </div>

            <div>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {summary.topSellerPick.symbol}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Credit Premium: <strong className="text-indigo-400">₹{summary.topSellerPick.entryPrice.toFixed(2)}</strong></span>
                <span>•</span>
                <span>Safe OTM Distance</span>
              </div>
            </div>

            {/* Target & SL Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-terminal-850 p-2.5 rounded-lg text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">50% DECAY</span>
                <span className="font-extrabold text-indigo-400">₹{summary.topSellerPick.target1.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">MAX PROFIT</span>
                <span className="font-extrabold text-indigo-400">₹{summary.topSellerPick.target2.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                <span className="font-extrabold text-rose-500">₹{summary.topSellerPick.stopLoss.toFixed(1)}</span>
              </div>
            </div>

            {/* Timing Card */}
            <div className="p-2.5 rounded-lg bg-slate-100/70 dark:bg-terminal-850/80 border border-slate-200 dark:border-terminal-750 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="font-bold text-indigo-400">Theta Strategy:</span>
                <span className="font-semibold">Hold until 3:10 PM</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="font-bold text-indigo-400">Decay Target:</span>
                <span className="font-semibold">₹{summary.topSellerPick.target1.toFixed(1)}</span>
              </div>
            </div>

            <button
              onClick={() => onTradeClick(
                summary.topSellerPick!.symbol,
                summary.topSellerPick!.strike,
                summary.topSellerPick!.optionType,
                summary.topSellerPick!.entryPrice
              )}
              className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-900/30 transition-all cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Paper Write Option (1 Lot)</span>
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-terminal-800 bg-slate-50 dark:bg-terminal-900 p-4 flex flex-col justify-center text-center space-y-2">
            <ShieldCheck className="h-6 w-6 text-slate-400 mx-auto" />
            <span className="text-xs font-bold text-slate-400">Option Writer Opportunities</span>
            <p className="text-[11px] text-slate-500">
              High volatility detected. Currently favoring buyers rather than premium sellers.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. FILTER TOOLBAR & REALTIME PREDICTIONS TABLE                             */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-200 dark:border-terminal-800 bg-white dark:bg-terminal-900 shadow-xl overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-terminal-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 dark:bg-terminal-950/60">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Strikes' },
              { id: 'BUY_CE', label: 'Buy Calls Only (CE)' },
              { id: 'BUY_PE', label: 'Buy Puts Only (PE)' },
              { id: 'NEAR_ATM', label: 'ATM & Near (±150)' },
              { id: 'HIGH_CONFIDENCE', label: 'High Win Rate (≥70%)' },
              { id: 'WRITERS', label: 'Option Writers' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedFilter === f.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-terminal-850 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-terminal-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter strike..."
                className="w-32 sm:w-40 rounded-lg border border-slate-300 dark:border-terminal-700 bg-white dark:bg-terminal-850 py-1.5 pl-8 pr-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            {onNavigateToChain && (
              <button
                onClick={onNavigateToChain}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-terminal-700 bg-white dark:bg-terminal-850 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Option Chain</span>
              </button>
            )}
          </div>
        </div>

        {/* Predictions Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-terminal-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-terminal-950/80">
                <th className="py-2.5 px-3">Contract & Strike</th>
                <th className="py-2.5 px-3">Prediction</th>
                <th className="py-2.5 px-3">Win Probability</th>
                <th className="py-2.5 px-3 text-right">LTP (Live)</th>
                <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">Target 1</th>
                <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">Target 2</th>
                <th className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400">Stop Loss</th>
                <th className="py-2.5 px-3">Predicted Exit Time</th>
                <th className="py-2.5 px-2.5 text-center">R : R</th>
                <th className="py-2.5 px-3">OI Build-up</th>
                <th className="py-2.5 px-3 text-right">Action & Alert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-terminal-800/40">
              {filteredPredictions.map((pred) => {
                const isCall = pred.optionType === 'CE';
                const isAtm = pred.strike === atmStrike;
                const hasAlert = isAlertActive(pred.strike, pred.optionType);

                return (
                  <tr
                    key={`${pred.strike}_${pred.optionType}`}
                    onClick={() => setSelectedPrediction(pred)}
                    className={`transition-colors cursor-pointer ${
                      hasAlert
                        ? 'bg-amber-500/[0.07] dark:bg-amber-500/10 ring-1 ring-inset ring-amber-500/40'
                        : isAtm 
                        ? 'bg-blue-600/[0.08] dark:bg-blue-600/10 font-medium' 
                        : 'hover:bg-slate-50 dark:hover:bg-terminal-800/40'
                    }`}
                  >
                    {/* Contract Symbol */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                          isCall 
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}>
                          {pred.optionType}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {pred.strike}
                        </span>
                        {isAtm && (
                          <span className="px-1 py-0.2 rounded bg-amber-400 text-black text-[9px] font-extrabold uppercase">
                            ATM
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">({pred.moneyness})</span>
                      </div>
                    </td>

                    {/* Prediction Badge */}
                    <td className="py-2.5 px-3">
                      {getActionBadge(pred.action)}
                    </td>

                    {/* Win Probability Bar */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 dark:bg-terminal-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              pred.confidenceScore >= 75 ? 'bg-emerald-500' :
                              pred.confidenceScore >= 55 ? 'bg-blue-500' : 'bg-slate-400'
                            }`}
                            style={{ width: `${pred.confidenceScore}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {pred.confidenceScore}%
                        </span>
                      </div>
                    </td>

                    {/* LTP */}
                    <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 dark:text-white">
                      ₹{pred.ltp.toFixed(2)}
                    </td>

                    {/* Target 1 */}
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{pred.target1.toFixed(1)}
                    </td>

                    {/* Target 2 */}
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{pred.target2.toFixed(1)}
                    </td>

                    {/* Stop Loss */}
                    <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{pred.stopLoss.toFixed(1)}
                    </td>

                    {/* Predicted Exit Time Window */}
                    <td className="py-2.5 px-3 text-[11px]">
                      <div className="text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1">
                        <Clock className="h-3 w-3 text-blue-400" />
                        <span>{pred.targetExitTime}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">Cut-off: {pred.mandatoryExitTime}</span>
                    </td>

                    {/* Risk Reward */}
                    <td className="py-2.5 px-2.5 text-center text-slate-500 dark:text-slate-400 font-semibold">
                      {pred.riskReward}
                    </td>

                    {/* OI Build-up */}
                    <td className="py-2.5 px-3">
                      {getOiBadge(pred.oiBuildUp, pred.oiBuildUpLabel)}
                    </td>

                    {/* Action & Alert Buttons */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleAlert(pred)}
                          title={hasAlert ? "Remove Live Alert" : "Set Live Audio Alert"}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            hasAlert
                              ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 shadow-sm'
                              : 'bg-slate-100 dark:bg-terminal-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-terminal-700 hover:text-amber-500'
                          }`}
                        >
                          <Bell className={`h-3.5 w-3.5 ${hasAlert ? 'fill-amber-500' : ''}`} />
                        </button>

                        <button
                          onClick={() => onTradeClick(pred.symbol, pred.strike, pred.optionType, pred.entryPrice)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            isCall 
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                              : 'bg-rose-600 hover:bg-rose-500 text-white'
                          }`}
                        >
                          <Zap className="h-3 w-3" />
                          <span>Trade</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ACTIVE LIVE ALERTS WATCHER MODAL                                       */}
      {/* ========================================================================= */}
      {showAlertsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-terminal-700 bg-white dark:bg-terminal-900 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-terminal-800">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    Live Real-Time Alerts Watcher ({activeAlerts.length})
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Continuously tracking entry triggers, target fulfillments, stop-losses, and time decay
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowAlertsModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Notification Permission & Audio Testing Controls */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Audio Chimes:</span>
                <span className="text-emerald-500 font-bold flex items-center gap-1">
                  <Volume2 className="h-3.5 w-3.5" /> Synthesizer Active
                </span>
                <span className="text-slate-400">•</span>
                <button
                  onClick={() => alertManager.testSound('TARGET')}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-bold cursor-pointer"
                >
                  Test Target Chime
                </button>
                <button
                  onClick={() => alertManager.testSound('STOPLOSS')}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold cursor-pointer"
                >
                  Test SL Alert
                </button>
              </div>

              {notificationPermission !== 'granted' ? (
                <button
                  onClick={handleRequestNotification}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
                >
                  Enable Desktop Push
                </button>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Desktop Push Enabled
                </span>
              )}
            </div>

            {/* Active Alerts List */}
            {activeAlerts.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Bell className="h-8 w-8 mx-auto text-slate-500" />
                <div className="text-sm font-bold text-slate-200">No active alerts armed yet</div>
                <div className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click the 🔔 icon next to any predicted strike to start listening for live entry triggers, target reaches, and stop losses.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAlerts.map((alert) => {
                  const isCall = alert.optionType === 'CE';
                  const distToT1 = alert.target1 - alert.currentLtp;
                  const distToSL = alert.currentLtp - alert.stopLoss;

                  return (
                    <div
                      key={alert.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-terminal-750 bg-slate-50 dark:bg-terminal-850 space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCall ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {alert.optionType}
                          </span>
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            {alert.symbol}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">
                            {alert.status.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => alertManager.toggleSound(alert.id)}
                            className="p-1 rounded text-slate-400 hover:text-white"
                            title={alert.soundEnabled ? 'Mute Chime' : 'Unmute Chime'}
                          >
                            {alert.soundEnabled ? <Volume2 className="h-4 w-4 text-emerald-400" /> : <VolumeX className="h-4 w-4 text-rose-400" />}
                          </button>
                          <button
                            onClick={() => alertManager.removeAlert(alert.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-300"
                            title="Delete Alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Live Price Targets vs Current LTP */}
                      <div className="grid grid-cols-4 gap-2 bg-white dark:bg-terminal-900 p-2.5 rounded-lg text-center text-[11px]">
                        <div>
                          <span className="text-[10px] text-slate-400 block">ENTRY</span>
                          <span className="font-bold text-slate-900 dark:text-white">₹{alert.entryPrice.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-blue-400 block">CURRENT LTP</span>
                          <span className="font-extrabold text-blue-400">₹{alert.currentLtp.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-500 block">TARGET 1</span>
                          <span className="font-extrabold text-emerald-500">₹{alert.target1.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-rose-500 block">STOP LOSS</span>
                          <span className="font-extrabold text-rose-500">₹{alert.stopLoss.toFixed(1)}</span>
                        </div>
                      </div>

                      {/* Distance & Advice */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Distance to Target 1: <strong className="text-emerald-400">{distToT1 > 0 ? `+₹${distToT1.toFixed(1)}` : 'REACHED!'}</strong>
                        </span>
                        <span>
                          Distance to Stop Loss: <strong className="text-rose-400">₹{Math.abs(distToSL).toFixed(1)}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => alertManager.clearAllAlerts()}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear All Alerts</span>
                  </button>

                  <button
                    onClick={() => setShowAlertsModal(false)}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DEEP-DIVE PREDICTION MODAL                                             */}
      {/* ========================================================================= */}
      {selectedPrediction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-terminal-700 bg-white dark:bg-terminal-900 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-terminal-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    selectedPrediction.optionType === 'CE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {selectedPrediction.optionType}
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {selectedPrediction.symbol}
                  </h3>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Detailed Quantitative Prediction & Trade Breakdown
                </span>
              </div>
              <button
                onClick={() => setSelectedPrediction(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800">
                <span className="text-[10px] text-slate-400 block">RECOMMENDATION</span>
                <span className="font-bold text-slate-900 dark:text-white block mt-0.5">{selectedPrediction.action.replace('_', ' ')}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800">
                <span className="text-[10px] text-slate-400 block">WIN CONFIDENCE</span>
                <span className="font-bold text-emerald-500 block mt-0.5">{selectedPrediction.confidenceScore}%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800">
                <span className="text-[10px] text-slate-400 block">DELTA / IV</span>
                <span className="font-bold text-blue-400 block mt-0.5">{selectedPrediction.delta} / {selectedPrediction.iv}%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800">
                <span className="text-[10px] text-slate-400 block">RISK : REWARD</span>
                <span className="font-bold text-slate-900 dark:text-white block mt-0.5">{selectedPrediction.riskReward}</span>
              </div>
            </div>

            {/* Predicted Entry & Exit Timing Forecast */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800 space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">ENTRY & EXIT TIMING FORECAST</span>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-terminal-800">
                  <span className="text-blue-500 font-semibold flex items-center gap-1"><Clock className="h-3 w-3" /> Optimal Entry Timing:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedPrediction.entryTimeWindow}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-terminal-800">
                  <span className="text-emerald-500 font-semibold flex items-center gap-1"><Target className="h-3 w-3" /> Target Exit Expected:</span>
                  <span className="font-bold text-emerald-500">{selectedPrediction.targetExitTime}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-terminal-800">
                  <span className="text-amber-500 font-semibold flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Hard Square-Off:</span>
                  <span className="font-bold text-amber-500">{selectedPrediction.mandatoryExitTime}</span>
                </div>
                <div className="text-[11px] text-slate-400 pt-1">
                  💡 <strong>Exit Strategy:</strong> {selectedPrediction.exitStrategyReason}
                </div>
              </div>
            </div>

            {/* Target and Stoploss Levels */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-800 space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">PREDICTED PRICE LEVELS</span>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-terminal-800">
                <span className="text-slate-500">Current Entry Price:</span>
                <span className="font-bold text-slate-900 dark:text-white">₹{selectedPrediction.entryPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-terminal-800">
                <span className="text-emerald-500">Target 1 (+30%):</span>
                <span className="font-bold text-emerald-500">₹{selectedPrediction.target1.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-terminal-800">
                <span className="text-emerald-500">Target 2 (+65%):</span>
                <span className="font-bold text-emerald-500">₹{selectedPrediction.target2.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-rose-500">Stop Loss (-20%):</span>
                <span className="font-bold text-rose-500">₹{selectedPrediction.stopLoss.toFixed(2)}</span>
              </div>
            </div>

            {/* AI Reasoning Points */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">KEY PREDICTION DRIVERS</span>
              {selectedPrediction.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                onClick={() => handleToggleAlert(selectedPrediction)}
                className={`w-1/2 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  isAlertActive(selectedPrediction.strike, selectedPrediction.optionType)
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 shadow-sm'
                    : 'border-slate-300 dark:border-terminal-700 text-slate-700 dark:text-slate-300 hover:border-amber-500'
                }`}
              >
                <Bell className={`h-4 w-4 ${isAlertActive(selectedPrediction.strike, selectedPrediction.optionType) ? 'fill-amber-500' : ''}`} />
                <span>{isAlertActive(selectedPrediction.strike, selectedPrediction.optionType) ? 'Remove Alert' : 'Arm Live Alert'}</span>
              </button>

              <button
                onClick={() => {
                  onTradeClick(
                    selectedPrediction.symbol,
                    selectedPrediction.strike,
                    selectedPrediction.optionType,
                    selectedPrediction.entryPrice
                  );
                  setSelectedPrediction(null);
                }}
                className="w-1/2 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-900/30 cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                <span>Paper Trade</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
