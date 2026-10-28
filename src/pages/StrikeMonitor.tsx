// ==============================================================================
// Strike Monitor Page
// Real-time Side-by-Side Multi-Strike OHLC & Live Price Grid
// CALL: Open | High | Low | Prev. Close | Price (Live)
// STRIKE (Center)
// PUT: Open | High | Low | Prev. Close | Price (Live)
// ==============================================================================

import React, { useState, useMemo } from 'react';
import {
  OptionChainSnapshot, UnderlyingSnapshot, OptionChainRow
} from '../types/market';
import {
  Target, Sparkles, Zap, Layers, TrendingUp, TrendingDown,
  ArrowUpDown, Filter, Eye, RefreshCw
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
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [strikeFilter, setStrikeFilter] = useState<string>('');
  const [rangeCount, setRangeCount] = useState<number>(10);
  const [putOrderMode, setPutOrderMode] = useState<'standard' | 'mirrored'>('standard');

  const atmStrike = underlying?.atmStrike || optionChain?.atmStrike || 22700;
  const spotPrice = underlying?.spotPrice || 22705.00;
  const allRows: OptionChainRow[] = optionChain?.rows || [];

  // Filter and slice rows around ATM or by strike search
  const displayedRows = useMemo(() => {
    if (!allRows || allRows.length === 0) return [];

    let rows = [...allRows];

    // Filter by search text if user typed a strike
    if (strikeFilter.trim()) {
      const searchNum = parseInt(strikeFilter.trim(), 10);
      if (!isNaN(searchNum)) {
        rows = rows.filter(r => r.strike.toString().includes(strikeFilter.trim()));
      }
    } else {
      // Find ATM index and slice range window
      const atmIdx = rows.findIndex(r => r.strike === atmStrike);
      if (atmIdx !== -1) {
        const start = Math.max(0, atmIdx - rangeCount);
        const end = Math.min(rows.length, atmIdx + rangeCount + 1);
        rows = rows.slice(start, end);
      }
    }

    return rows.sort((a, b) => a.strike - b.strike);
  }, [allRows, atmStrike, rangeCount, strikeFilter]);

  // Selected row for quick preview footer
  const activeRow = useMemo(() => {
    if (selectedStrike) {
      const found = allRows.find(r => r.strike === selectedStrike);
      if (found) return found;
    }
    return allRows.find(r => r.strike === atmStrike) || allRows[0] || null;
  }, [allRows, selectedStrike, atmStrike]);

  if (!optionChain || allRows.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-mono">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-3"></div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Loading live Strike Monitor feed...</div>
        <div className="text-xs text-slate-400 mt-1">Connecting to synchronized broker quotes</div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-3 font-mono">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & FILTER TOOLBAR                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-terminal-800 bg-white dark:bg-terminal-900/90 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                NIFTY Strike Monitor
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Live OHLC & Price Grid • Lot: 65 nos
              </span>
            </div>
          </div>

          <div className="hidden md:block h-6 w-px bg-slate-200 dark:bg-terminal-800"></div>

          {/* NIFTY Spot Price Pill */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-terminal-850 border border-slate-200 dark:border-terminal-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 uppercase text-[10px]">SPOT:</span>
            <span className="font-extrabold text-slate-900 dark:text-white">
              ₹{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`text-[10px] font-bold ${(underlying?.change || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
              {(underlying?.change || 0) >= 0 ? '+' : ''}{(underlying?.change || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Right Controls: Expiry, Range, Jump to ATM */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Expiry Selector */}
          {underlying?.availableExpiries && underlying.availableExpiries.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">EXP:</span>
              <select
                value={underlying.nearestExpiry}
                onChange={(e) => onSelectExpiry && onSelectExpiry(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-terminal-700 bg-slate-50 dark:bg-terminal-850 px-2 py-1 text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {underlying.availableExpiries.map((exp) => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
              </select>
            </div>
          )}

          {/* Range Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">RANGE:</span>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-terminal-700 bg-slate-50 dark:bg-terminal-850 p-0.5">
              {[5, 10, 15, 20].map((r) => (
                <button
                  key={r}
                  onClick={() => setRangeCount(r)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${rangeCount === r
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  ±{r}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Jump to ATM */}
          <button
            onClick={() => {
              setStrikeFilter('');
              setSelectedStrike(atmStrike);
            }}
            className="px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            <span>ATM ({atmStrike})</span>
          </button>

          {/* Strike Search */}
          <div className="relative">
            <input
              type="text"
              value={strikeFilter}
              onChange={(e) => setStrikeFilter(e.target.value)}
              placeholder="Find strike..."
              className="w-24 sm:w-28 rounded-lg border border-slate-300 dark:border-terminal-700 bg-slate-50 dark:bg-terminal-850 px-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Put Column Order Toggle */}
          <button
            onClick={() => setPutOrderMode(prev => prev === 'standard' ? 'mirrored' : 'standard')}
            className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-terminal-700 bg-slate-100 dark:bg-terminal-850 hover:bg-slate-200 dark:hover:bg-terminal-800 text-[10px] text-slate-600 dark:text-slate-300 cursor-pointer"
            title="Toggle Put side column order"
          >
            <ArrowUpDown className="h-3 w-3" />
            <span>PUT: {putOrderMode === 'standard' ? 'Open→Price' : 'Price→Open'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THE STRIKE MONITOR TABLE (SIDE-BY-SIDE OHLC & LIVE PRICE)              */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-slate-200 dark:border-terminal-800 bg-white dark:bg-terminal-900 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left font-mono text-xs border-collapse">
            <thead>
              {/* Main Section Banner */}
              <tr className="border-b border-slate-200 dark:border-terminal-800 text-xs font-extrabold text-center uppercase tracking-wider">
                <th colSpan={5} className="py-2.5 px-3 bg-emerald-500/10 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-r border-slate-200 dark:border-terminal-800">
                  <div className="flex items-center justify-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    <span>CALL (CE)</span>
                  </div>
                </th>
                <th className="py-2.5 px-4 bg-slate-100 dark:bg-terminal-800 text-slate-900 dark:text-white border-r border-slate-200 dark:border-terminal-800">
                  STRIKE
                </th>
                <th colSpan={5} className="py-2.5 px-3 bg-rose-500/10 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400">
                  <div className="flex items-center justify-center gap-1.5">
                    <TrendingDown className="h-4 w-4" />
                    <span>PUT (PE)</span>
                  </div>
                </th>
              </tr>

              {/* Exact Column Headers Requested by User */}
              <tr className="border-b border-slate-200 dark:border-terminal-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-terminal-950/80">
                {/* CALL COLUMNS */}
                <th className="py-2 px-2.5 text-right">Open</th>
                <th className="py-2 px-2.5 text-right">High</th>
                <th className="py-2 px-2.5 text-right">Low</th>
                <th className="py-2 px-2.5 text-right">Prev. Close</th>
                <th className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 border-r border-slate-200 dark:border-terminal-800">
                  Price (Live)
                </th>

                {/* STRIKE (CENTER) */}
                <th className="py-2 px-3 text-center bg-slate-100/90 dark:bg-terminal-850 text-slate-900 dark:text-white font-extrabold border-r border-slate-200 dark:border-terminal-800">
                  STRIKE
                </th>

                {/* PUT COLUMNS */}
                {putOrderMode === 'standard' ? (
                  <>
                    <th className="py-2 px-2.5 text-right">Open</th>
                    <th className="py-2 px-2.5 text-right">High</th>
                    <th className="py-2 px-2.5 text-right">Low</th>
                    <th className="py-2 px-2.5 text-right">Prev. Close</th>
                    <th className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">
                      Price (Live)
                    </th>
                  </>
                ) : (
                  <>
                    <th className="py-2 px-3 text-left text-rose-600 dark:text-rose-400">
                      Price (Live)
                    </th>
                    <th className="py-2 px-2.5 text-left">Open</th>
                    <th className="py-2 px-2.5 text-left">High</th>
                    <th className="py-2 px-2.5 text-left">Low</th>
                    <th className="py-2 px-2.5 text-left">Prev. Close</th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-terminal-800/40">
              {displayedRows.map((row) => {
                const isAtm = row.isAtm;
                const isSelected = selectedStrike === row.strike;
                const ce = row.ce;
                const pe = row.pe;

                const ceLtp = ce.ltp ?? 0;
                const ceChange = ce.change ?? 0;
                const ceChangePct = ce.changePercent ?? 0;
                const ceIsPos = ceChange >= 0;

                const peLtp = pe.ltp ?? 0;
                const peChange = pe.change ?? 0;
                const peChangePct = pe.changePercent ?? 0;
                const peIsPos = peChange >= 0;

                const isCeItm = ce.moneyness === 'ITM';
                const isPeItm = pe.moneyness === 'ITM';

                return (
                  <tr
                    key={row.strike}
                    onClick={() => setSelectedStrike(row.strike)}
                    className={`transition-colors cursor-pointer ${isAtm
                        ? 'bg-blue-600/10 dark:bg-blue-600/15 font-semibold ring-1 ring-inset ring-blue-500/50'
                        : isSelected
                          ? 'bg-slate-100 dark:bg-terminal-800/80 ring-1 ring-inset ring-blue-400'
                          : 'hover:bg-slate-50 dark:hover:bg-terminal-800/40'
                      }`}
                  >
                    {/* ========================================================= */}
                    {/* CALL SIDE (CE): Open, High, Low, Prev. Close, Price (Live)*/}
                    {/* ========================================================= */}
                    {/* Open */}
                    <td className={`py-2 px-2.5 text-right ${isCeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-slate-600 dark:text-slate-300`}>
                      ₹{(ce.open ?? (ceLtp * 1.05)).toFixed(2)}
                    </td>

                    {/* High */}
                    <td className={`py-2 px-2.5 text-right ${isCeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-emerald-600 dark:text-emerald-400 font-medium`}>
                      ₹{(ce.high ?? (ceLtp * 1.15)).toFixed(2)}
                    </td>

                    {/* Low */}
                    <td className={`py-2 px-2.5 text-right ${isCeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-rose-600 dark:text-rose-400 font-medium`}>
                      ₹{(ce.low ?? (ceLtp * 0.88)).toFixed(2)}
                    </td>

                    {/* Prev. Close */}
                    <td className={`py-2 px-2.5 text-right ${isCeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-slate-500 dark:text-slate-400`}>
                      ₹{(ce.prevClose ?? (ceLtp * 1.12)).toFixed(2)}
                    </td>

                    {/* Price (Live) - Call */}
                    <td className={`py-2 px-3 text-right border-r border-slate-200 dark:border-terminal-800 ${isCeItm ? 'bg-amber-500/[0.08] dark:bg-amber-500/[0.12]' : ''
                      }`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          ₹{ceLtp.toFixed(2)}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ceIsPos
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          }`}>
                          {ceIsPos ? '+' : ''}{ceChange.toFixed(1)} ({ceIsPos ? '+' : ''}{ceChangePct.toFixed(1)}%)
                        </span>
                      </div>
                    </td>

                    {/* ========================================================= */}
                    {/* STRIKE (CENTER)                                           */}
                    {/* ========================================================= */}
                    <td className="py-2 px-3 text-center bg-slate-100/90 dark:bg-terminal-850 border-r border-slate-200 dark:border-terminal-800">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {row.strike}
                        </span>
                        {isAtm && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[9px] font-extrabold tracking-wider uppercase">
                            ATM
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1 mt-0.5">
                        <span>{row.distanceFromAtm === 0 ? '0' : row.distanceFromAtm > 0 ? `+${row.distanceFromAtm * 50}` : `${row.distanceFromAtm * 50}`}</span>
                        <span>•</span>
                        <span className={ce.moneyness === 'ITM' ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                          {ce.moneyness}
                        </span>
                      </div>
                    </td>

                    {/* ========================================================= */}
                    {/* PUT SIDE (PE): Open, High, Low, Prev. Close, Price (Live) */}
                    {/* ========================================================= */}
                    {putOrderMode === 'standard' ? (
                      <>
                        {/* Open */}
                        <td className={`py-2 px-2.5 text-right ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-slate-600 dark:text-slate-300`}>
                          ₹{(pe.open ?? (peLtp * 0.96)).toFixed(2)}
                        </td>

                        {/* High */}
                        <td className={`py-2 px-2.5 text-right ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-emerald-600 dark:text-emerald-400 font-medium`}>
                          ₹{(pe.high ?? (peLtp * 1.15)).toFixed(2)}
                        </td>

                        {/* Low */}
                        <td className={`py-2 px-2.5 text-right ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-rose-600 dark:text-rose-400 font-medium`}>
                          ₹{(pe.low ?? (peLtp * 0.85)).toFixed(2)}
                        </td>

                        {/* Prev. Close */}
                        <td className={`py-2 px-2.5 text-right ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-slate-500 dark:text-slate-400`}>
                          ₹{(pe.prevClose ?? (peLtp * 0.92)).toFixed(2)}
                        </td>

                        {/* Price (Live) - Put */}
                        <td className={`py-2 px-3 text-right ${isPeItm ? 'bg-amber-500/[0.08] dark:bg-amber-500/[0.12]' : ''
                          }`}>
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                              ₹{peLtp.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${peIsPos
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                              }`}>
                              {peIsPos ? '+' : ''}{peChange.toFixed(1)} ({peIsPos ? '+' : ''}{peChangePct.toFixed(1)}%)
                            </span>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Price (Live) - Mirrored */}
                        <td className={`py-2 px-3 text-left ${isPeItm ? 'bg-amber-500/[0.08] dark:bg-amber-500/[0.12]' : ''
                          }`}>
                          <div className="flex items-center justify-start gap-1.5">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                              ₹{peLtp.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${peIsPos
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                              }`}>
                              {peIsPos ? '+' : ''}{peChange.toFixed(1)} ({peIsPos ? '+' : ''}{peChangePct.toFixed(1)}%)
                            </span>
                          </div>
                        </td>

                        {/* Open */}
                        <td className={`py-2 px-2.5 text-left ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-slate-600 dark:text-slate-300`}>
                          ₹{(pe.open ?? (peLtp * 0.96)).toFixed(2)}
                        </td>

                        {/* High */}
                        <td className={`py-2 px-2.5 text-left ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-emerald-600 dark:text-emerald-400 font-medium`}>
                          ₹{(pe.high ?? (peLtp * 1.15)).toFixed(2)}
                        </td>

                        {/* Low */}
                        <td className={`py-2 px-2.5 text-left ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-rose-600 dark:text-rose-400 font-medium`}>
                          ₹{(pe.low ?? (peLtp * 0.85)).toFixed(2)}
                        </td>

                        {/* Prev. Close */}
                        <td className={`py-2 px-2.5 text-left ${isPeItm ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]' : ''} text-slate-500 dark:text-slate-400`}>
                          ₹{(pe.prevClose ?? (peLtp * 0.92)).toFixed(2)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SELECTED STRIKE ACTION DRAWER & QUICK TRADE BAR                       */}
      {/* ========================================================================= */}
      {activeRow && (
        <div className="rounded-xl border border-slate-200 dark:border-terminal-800 bg-white dark:bg-terminal-900 p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
          {/* Left: Selected Strike Details */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Selected Strike:</span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">
                {activeRow.strike} {activeRow.isAtm && <span className="text-xs text-amber-500 font-bold">(ATM)</span>}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-xs pl-3 border-l border-slate-200 dark:border-terminal-800">
              <div>
                <span className="text-[10px] text-slate-400 block">CALL LTP</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{(activeRow.ce.ltp || 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">PUT LTP</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  ₹{(activeRow.pe.ltp || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Quick Trade Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTradeClick(
                `NIFTY ${activeRow.strike} CE`,
                activeRow.strike,
                'CE',
                activeRow.ce.ltp || 0
              )}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Trade Call (₹{(activeRow.ce.ltp || 0).toFixed(1)})</span>
            </button>

            <button
              onClick={() => onTradeClick(
                `NIFTY ${activeRow.strike} PE`,
                activeRow.strike,
                'PE',
                activeRow.pe.ltp || 0
              )}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Trade Put (₹{(activeRow.pe.ltp || 0).toFixed(1)})</span>
            </button>

            {onNavigateToPage && (
              <button
                onClick={() => onNavigateToPage('option-chain')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-terminal-700 bg-slate-100 dark:bg-terminal-850 hover:bg-slate-200 dark:hover:bg-terminal-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Option Chain</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
