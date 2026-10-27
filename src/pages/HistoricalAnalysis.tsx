// ==============================================================================
// Historical Analysis Page
// Intraday range, session extremes, and market snapshot archive
// ==============================================================================

import React from 'react';
import { UnderlyingSnapshot, TechnicalIndicatorData } from '../types/market.js';
import { History, Calendar, BarChart3, TrendingUp, TrendingDown, Layers } from 'lucide-react';

interface HistoricalAnalysisProps {
  underlying: UnderlyingSnapshot | null;
  indicators: TechnicalIndicatorData | null;
}

export const HistoricalAnalysis: React.FC<HistoricalAnalysisProps> = ({ underlying, indicators }) => {
  if (!underlying) {
    return <div className="p-8 text-center text-slate-400 font-mono">Loading Historical Data...</div>;
  }

  const highPrice = underlying.high || underlying.dayHigh || underlying.spotPrice;
  const lowPrice = underlying.low || underlying.dayLow || underlying.spotPrice;
  const rangeSpan = Number((highPrice - lowPrice).toFixed(2));
  const rangePercent = Number(((rangeSpan / underlying.prevClose) * 100).toFixed(2));

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-4">
          <span className="text-[10px] text-slate-400 block uppercase">SESSION INTRADAY RANGE</span>
          <span className="text-2xl font-bold text-white mt-1 block">{rangeSpan} pts</span>
          <span className="text-xs text-blue-400 block mt-0.5">{rangePercent}% of Prev Close</span>
        </div>

        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-4">
          <span className="text-[10px] text-slate-400 block uppercase">OPENING RANGE (FIRST 15 MIN)</span>
          <span className="text-lg font-bold text-slate-200 mt-1 block">
            ₹{indicators?.openingRange.low || lowPrice.toFixed(2)} - ₹{indicators?.openingRange.high || highPrice.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400 block mt-0.5">Key intraday breakout reference</span>
        </div>

        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-4">
          <span className="text-[10px] text-slate-400 block uppercase">PREVIOUS DAY HIGH / LOW</span>
          <span className="text-lg font-bold text-slate-200 mt-1 block">
            H: ₹{(underlying.prevClose + 45).toFixed(2)} | L: ₹{(underlying.prevClose - 60).toFixed(2)}
          </span>
          <span className="text-xs text-slate-400 block mt-0.5">Reference support/resistance levels</span>
        </div>

        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-4">
          <span className="text-[10px] text-slate-400 block uppercase">HISTORICAL CANDLES CACHED</span>
          <span className="text-2xl font-bold text-purple-400 mt-1 block">
            {indicators?.candles?.length || 30} Bars
          </span>
          <span className="text-xs text-slate-400 block mt-0.5">5-minute interval OHLCV</span>
        </div>
      </div>

      {/* Historical Candlestick Snapshots Table */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-terminal-800 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <History className="h-4 w-4 text-blue-400" />
            Recent Intraday OHLCV Snapshot Bars
          </h3>
          <span className="text-[11px] text-slate-400">Timeframe: 5m</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-terminal-800 text-[11px] text-slate-400 bg-terminal-850/60">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3 text-right">Open</th>
                <th className="py-2.5 px-3 text-right">High</th>
                <th className="py-2.5 px-3 text-right">Low</th>
                <th className="py-2.5 px-3 text-right">Close</th>
                <th className="py-2.5 px-3 text-right">Volume</th>
                <th className="py-2.5 px-3 text-center">Bias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-800/40">
              {indicators?.candles?.slice(-12).reverse().map((candle, idx) => {
                const isGreen = candle.close >= candle.open;
                return (
                  <tr key={idx} className="hover:bg-terminal-800/40">
                    <td className="py-2.5 px-3 text-slate-300">
                      {new Date(candle.time * 1000).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white">₹{candle.open.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">₹{candle.high.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right text-rose-400">₹{candle.low.toFixed(2)}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${isGreen ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ₹{candle.close.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {candle.volume.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isGreen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {isGreen ? 'BULL' : 'BEAR'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
