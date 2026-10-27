// ==============================================================================
// Strike Quote & Live Market Monitor Page
// Displays live contract quotes matching broker UI (Open, High, Low, Prev. Close)
// with horizontal strike scrolling and Call/Put switcher
// ==============================================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  OptionChainSnapshot, UnderlyingSnapshot, OptionContractData 
} from '../types/market';
import { 
  ChevronLeft, ChevronRight, Target, ArrowDownRight, ArrowUpRight, 
  TrendingUp, TrendingDown, Layers, BarChart3, Activity, ShieldCheck, 
  Zap, Clock, Compass, Filter, Sparkles 
} from 'lucide-react';

interface StrikeMonitorProps {
  optionChain: OptionChainSnapshot | null;
  underlying: UnderlyingSnapshot | null;
  onTradeClick: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
  onSelectExpiry?: (exp: string) => void;
  onNavigateToPage?: (page: any) => void;
}

export const StrikeMonitor: React.FC<StrikeMonitorProps> = ({
  optionChain,
  underlying,
  onTradeClick,
  onSelectExpiry,
  onNavigateToPage,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeStrikeRef = useRef<HTMLButtonElement>(null);

  // Selection states
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [selectedStrike, setSelectedStrike] = useState<number>(() => {
    return underlying?.atmStrike || 22700;
  });

  // Keep selected strike updated to ATM when underlying loads initially
  useEffect(() => {
    if (underlying?.atmStrike && (!selectedStrike || selectedStrike === 22700)) {
      setSelectedStrike(underlying.atmStrike);
    }
  }, [underlying?.atmStrike]);

  // All strikes from option chain
  const allRows = optionChain?.rows || [];
  const strikes = useMemo(() => {
    if (allRows.length > 0) {
      return allRows.map(r => r.strike).sort((a, b) => a - b);
    }
    // Fallback strikes around spot
    const base = underlying?.spotPrice ? Math.round(underlying.spotPrice / 50) * 50 : 22700;
    const list: number[] = [];
    for (let s = base - 500; s <= base + 500; s += 50) {
      list.push(s);
    }
    return list;
  }, [allRows, underlying?.spotPrice]);

  // Find active contract data
  const activeRow = allRows.find(r => r.strike === selectedStrike);
  const contract: OptionContractData | null = useMemo(() => {
    if (!activeRow) {
      // Fallback synthetic contract if not in chain window
      const isCall = optionType === 'CE';
      const spot = underlying?.spotPrice || 22700;
      const intrinsic = isCall ? Math.max(0, spot - selectedStrike) : Math.max(0, selectedStrike - spot);
      const timeVal = Math.max(20, 100 - Math.abs(spot - selectedStrike) * 0.2);
      const ltp = Number((intrinsic + timeVal).toFixed(2));
      const prevClose = Number((ltp * 1.15).toFixed(2));
      const change = Number((ltp - prevClose).toFixed(2));
      const changePercent = Number(((change / prevClose) * 100).toFixed(2));
      return {
        instrumentKey: `NIFTY_${selectedStrike}_${optionType}`,
        symbol: `NIFTY ${selectedStrike} ${optionType}`,
        strike: selectedStrike,
        expiry: underlying?.nearestExpiry || '2026-10-27',
        optionType,
        moneyness: isCall 
          ? (selectedStrike < spot ? 'ITM' : selectedStrike === spot ? 'ATM' : 'OTM')
          : (selectedStrike > spot ? 'ITM' : selectedStrike === spot ? 'ATM' : 'OTM'),
        ltp,
        change,
        changePercent,
        open: Number((ltp * 1.10).toFixed(2)),
        high: Number((ltp * 1.25).toFixed(2)),
        low: Number((ltp * 0.85).toFixed(2)),
        prevClose,
        bid: Number((ltp - 0.25).toFixed(2)),
        ask: Number((ltp + 0.25).toFixed(2)),
        volume: 75400,
        oi: 125000,
        oiChange: -4500,
        iv: 13.2,
        delta: isCall ? 0.52 : -0.48,
        theta: -8.4,
        gamma: 0.002,
        vega: 11.5,
        lastUpdate: new Date().toISOString(),
        isStale: false,
      };
    }
    return optionType === 'CE' ? activeRow.ce : activeRow.pe;
  }, [activeRow, optionType, selectedStrike, underlying]);

  // Scroll active strike into center view
  const centerActiveStrike = () => {
    if (activeStrikeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeStrikeRef.current;
      const left = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    centerActiveStrike();
  }, [selectedStrike]);

  const handleScrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -220, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 220, behavior: 'smooth' });
    }
  };

  // Live price metrics
  const ltp = contract?.ltp ?? 0;
  const change = contract?.change ?? 0;
  const changePercent = contract?.changePercent ?? 0;
  const isPositive = change >= 0;

  // Format expiry display like "27-Oct-26"
  const formattedExpiry = useMemo(() => {
    const raw = underlying?.nearestExpiry || contract?.expiry || '2026-10-27';
    try {
      const parts = raw.split('-');
      if (parts.length === 3) {
        const year = parts[0].slice(-2);
        const monthNum = parseInt(parts[1], 10);
        const day = parts[2];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[monthNum - 1] || 'Oct';
        return `${day}-${month}-${year}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }, [underlying?.nearestExpiry, contract?.expiry]);

  const atmStrike = underlying?.atmStrike || 22700;

  return (
    <div className="p-4 space-y-5 max-w-4xl mx-auto font-mono">
      {/* Page Title & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-terminal-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-400" />
            <span>NIFTY Strike Quote & Live Monitor</span>
          </h2>
          <span className="text-xs text-slate-400">
            Real-time OHLC, live market color updates, and contract details
          </span>
        </div>

        {/* Expiry Selector */}
        {underlying?.availableExpiries && underlying.availableExpiries.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 uppercase">Expiry:</span>
            <select
              value={underlying.nearestExpiry}
              onChange={(e) => onSelectExpiry && onSelectExpiry(e.target.value)}
              className="rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-1.5 text-xs text-white cursor-pointer"
            >
              {underlying.availableExpiries.map((exp) => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. SELECTION CONTROLS: CALL / PUT SWITCHER + STRIKE SCROLL BAR            */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-terminal-800 bg-terminal-900/90 p-4 space-y-4 shadow-xl">
        {/* Call / Put Toggle Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-terminal-950 border border-terminal-800">
            <button
              onClick={() => setOptionType('CE')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                optionType === 'CE'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-terminal-850'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>CALL (CE)</span>
            </button>
            <button
              onClick={() => setOptionType('PE')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                optionType === 'PE'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                  : 'text-slate-400 hover:text-rose-300 hover:bg-terminal-850'
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              <span>PUT (PE)</span>
            </button>
          </div>

          {/* Quick ATM Jump & Spot Reference */}
          <div className="flex items-center gap-3 text-xs">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase">NIFTY SPOT</span>
              <span className="font-bold text-white">
                ₹{underlying?.spotPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '22,705.00'}
              </span>
            </div>
            <button
              onClick={() => setSelectedStrike(atmStrike)}
              className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>ATM ({atmStrike})</span>
            </button>
          </div>
        </div>

        {/* Horizontal Strike Scroll Option */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-300">
              Select Strike Price (Scrollable)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleScrollLeft}
                className="p-1 rounded bg-terminal-800 hover:bg-terminal-750 text-slate-300 cursor-pointer"
                title="Scroll Left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={handleScrollRight}
                className="p-1 rounded bg-terminal-800 hover:bg-terminal-750 text-slate-300 cursor-pointer"
                title="Scroll Right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Strike Chips Carousel */}
          <div 
            ref={scrollRef}
            className="flex items-center gap-2 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-terminal-700 scrollbar-track-terminal-950"
            style={{ scrollbarWidth: 'thin' }}
          >
            {strikes.map((s) => {
              const isSelected = s === selectedStrike;
              const isAtm = s === atmStrike;
              const isItm = optionType === 'CE' 
                ? (underlying?.spotPrice ? s < underlying.spotPrice : false)
                : (underlying?.spotPrice ? s > underlying.spotPrice : false);

              // Find contract row to get quick price preview
              const row = allRows.find(r => r.strike === s);
              const previewLtp = optionType === 'CE' ? row?.ce.ltp : row?.pe.ltp;

              return (
                <button
                  key={s}
                  ref={isSelected ? activeStrikeRef : null}
                  onClick={() => setSelectedStrike(s)}
                  className={`flex-shrink-0 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center min-w-[90px] ${
                    isSelected
                      ? optionType === 'CE'
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-md shadow-emerald-950'
                        : 'bg-rose-500/20 border-rose-400 text-white shadow-md shadow-rose-950'
                      : 'bg-terminal-850/80 border-terminal-700/80 text-slate-300 hover:bg-terminal-800 hover:border-terminal-600'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{s}</span>
                    {isAtm && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-400 text-black font-extrabold">
                        ATM
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-slate-400 mt-0.5 flex items-center justify-center gap-1">
                    <span>{isAtm ? 'ATM' : isItm ? 'ITM' : 'OTM'}</span>
                    {previewLtp != null && (
                      <span className="text-slate-200 font-bold">₹{previewLtp.toFixed(1)}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. EXACT MOBILE QUOTE CARD (MATCHING THE ATTACHED SCREENSHOT)            */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-[#1b2230] to-[#121722] p-6 shadow-2xl space-y-5">
        {/* Header Bar matching image */}
        <div className="flex items-start justify-between">
          {/* Left Title & Instrument Description */}
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-wide">
              NIFTY
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 tracking-wide">
              {formattedExpiry} {selectedStrike} {optionType} • NSE FO
            </p>
          </div>

          {/* Right Price & Net Change with Live Market Color */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-1">
              <span className={`text-2xl font-bold tracking-tight ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                ₹{ltp.toFixed(2)}
              </span>
              {isPositive ? (
                <span className="text-emerald-400 text-lg">▲</span>
              ) : (
                <span className="text-rose-400 text-lg">▼</span>
              )}
            </div>
            <p className={`text-xs font-semibold mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
            </p>
          </div>
        </div>

        {/* OHLC STATS BOX (MATCHING EXACT TABLE FROM ATTACHED SCREENSHOT) */}
        <div className="rounded-xl border border-slate-700/50 bg-[#161c28]/90 p-4">
          <div className="grid grid-cols-4 divide-x divide-slate-700/60 text-center">
            {/* Open */}
            <div className="px-2">
              <span className="text-xs text-slate-400 block mb-1">Open</span>
              <span className="text-base font-bold text-white block">
                {contract?.open != null ? contract.open.toFixed(2) : (ltp * 1.05).toFixed(2)}
              </span>
            </div>

            {/* High */}
            <div className="px-2">
              <span className="text-xs text-slate-400 block mb-1">High</span>
              <span className="text-base font-bold text-emerald-400 block">
                {contract?.high != null ? contract.high.toFixed(2) : (ltp * 1.25).toFixed(2)}
              </span>
            </div>

            {/* Low */}
            <div className="px-2">
              <span className="text-xs text-slate-400 block mb-1">Low</span>
              <span className="text-base font-bold text-rose-400 block">
                {contract?.low != null ? contract.low.toFixed(2) : (ltp * 0.85).toFixed(2)}
              </span>
            </div>

            {/* Prev. Close */}
            <div className="px-2">
              <span className="text-xs text-slate-400 block mb-1">Prev. Close</span>
              <span className="text-base font-bold text-slate-200 block">
                {contract?.prevClose != null ? contract.prevClose.toFixed(2) : (ltp * 1.15).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Market Cards (Volume, OI, Greeks & Depth) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {/* Volume */}
          <div className="rounded-xl border border-terminal-800 bg-terminal-900/60 p-3">
            <span className="text-[10px] text-slate-400 uppercase block">VOLUME</span>
            <span className="text-sm font-bold text-white mt-0.5 block">
              {contract?.volume ? contract.volume.toLocaleString('en-IN') : '1,42,850'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Contracts</span>
          </div>

          {/* Open Interest */}
          <div className="rounded-xl border border-terminal-800 bg-terminal-900/60 p-3">
            <span className="text-[10px] text-slate-400 uppercase block">OPEN INTEREST</span>
            <span className="text-sm font-bold text-white mt-0.5 block">
              {contract?.oi ? contract.oi.toLocaleString('en-IN') : '2,10,000'}
            </span>
            <span className={`text-[10px] block mt-0.5 ${(contract?.oiChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              Chg: {(contract?.oiChange || 0) >= 0 ? '+' : ''}{(contract?.oiChange || -4500).toLocaleString('en-IN')}
            </span>
          </div>

          {/* Bid / Ask */}
          <div className="rounded-xl border border-terminal-800 bg-terminal-900/60 p-3">
            <span className="text-[10px] text-slate-400 uppercase block">BEST BID / ASK</span>
            <div className="text-xs font-bold mt-0.5 space-x-1">
              <span className="text-emerald-400">₹{(contract?.bid ?? (ltp - 0.25)).toFixed(2)}</span>
              <span className="text-slate-500">/</span>
              <span className="text-rose-400">₹{(contract?.ask ?? (ltp + 0.25)).toFixed(2)}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Lot: 65 nos</span>
          </div>

          {/* Implied Volatility & Delta */}
          <div className="rounded-xl border border-terminal-800 bg-terminal-900/60 p-3">
            <span className="text-[10px] text-slate-400 uppercase block">IV / DELTA</span>
            <span className="text-sm font-bold text-blue-400 mt-0.5 block">
              {contract?.iv || 13.5}% / {contract?.delta || 0.50}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Moneyness: {contract?.moneyness || 'ATM'}
            </span>
          </div>
        </div>

        {/* Quick Execution Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-700/40">
          {onNavigateToPage && (
            <button
              onClick={() => onNavigateToPage('option-chain')}
              className="px-4 py-2 rounded-xl bg-terminal-800 hover:bg-terminal-750 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Layers className="h-4 w-4" />
              <span>View Full Chain</span>
            </button>
          )}

          <button
            onClick={() => {
              onTradeClick(
                `NIFTY ${selectedStrike} ${optionType}`,
                selectedStrike,
                optionType,
                ltp
              );
            }}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-900/40 transition-all cursor-pointer"
          >
            <Zap className="h-4 w-4" />
            <span>Paper Trade (1 Lot = 65 Nos)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
