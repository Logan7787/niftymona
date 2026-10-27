// ==============================================================================
// Dashboard Page Component
// Main trading terminal hub: ATM Analysis, PCR, Signal, and Quick Chain
// ==============================================================================

import React from 'react';
import { 
  UnderlyingSnapshot, OptionChainSnapshot, TechnicalIndicatorData, 
  SignalOutput 
} from '../types/market';
import { 
  Zap, ArrowUpRight, ArrowDownRight, ShieldCheck, Target, 
  BarChart2, Compass, AlertCircle, CheckCircle2, XCircle, TrendingUp 
} from 'lucide-react';

interface DashboardProps {
  underlying: UnderlyingSnapshot | null;
  optionChain: OptionChainSnapshot | null;
  indicators: TechnicalIndicatorData | null;
  signal: SignalOutput | null;
  onNavigateToChain: () => void;
  onNavigateToSignals: () => void;
  onQuickTrade: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  underlying,
  optionChain,
  indicators,
  signal,
  onNavigateToChain,
  onNavigateToSignals,
  onQuickTrade,
}) => {
  if (!underlying || !optionChain) {
    return (
      <div className="p-6 text-center text-slate-400 font-mono">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-3"></div>
        <div>Loading live market snapshot and option chain...</div>
      </div>
    );
  }

  const atmRow = optionChain.rows.find(r => r.strike === optionChain.atmStrike);
  const cePrice = atmRow?.ce.ltp || 0;
  const pePrice = atmRow?.pe.ltp || 0;
  const straddlePrice = Number((cePrice + pePrice).toFixed(2));

  return (
    <div className="p-4 space-y-4">
      {/* Top Section: Analytical Signal Banner & ATM Straddle Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Signal Engine Highlights Card */}
        <div className="lg:col-span-2 rounded-xl border border-terminal-800 bg-terminal-900/90 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-400" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                Rule-Based ATM Signal Engine
              </span>
            </div>
            <button
              onClick={onNavigateToSignals}
              className="text-xs text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 cursor-pointer"
            >
              Full Details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider ${
                  signal?.direction === 'BULLISH_BIAS'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : signal?.direction === 'BEARISH_BIAS'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {signal?.direction?.replace('_', ' ') || 'NEUTRAL'}
                </span>
                <span className="font-mono text-sm font-semibold text-white">
                  {signal?.suggestedContract || `NIFTY ${underlying.atmStrike} CE/PE`}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-xl">
                {signal?.primaryReason || 'Market in consolidation mode near key VWAP pivot.'}
              </p>
            </div>

            <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-terminal-800 gap-2">
              <div className="text-right">
                <div className="text-[11px] text-slate-400 font-mono">Suggested Entry</div>
                <div className="text-base font-mono font-bold text-white">
                  ₹{signal?.contractLtp?.toFixed(2) || '0.00'}
                </div>
              </div>
              <button
                onClick={() => onQuickTrade(
                  signal?.suggestedContract || `NIFTY ${underlying.atmStrike} CE`,
                  underlying.atmStrike,
                  signal?.direction === 'BEARISH_BIAS' ? 'PE' : 'CE',
                  signal?.contractLtp || 100
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Simulate Paper Order</span>
              </button>
            </div>
          </div>
        </div>

        {/* ATM Straddle & Max Pain Card */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-terminal-800 text-xs font-mono text-slate-200">
              <span className="flex items-center gap-1.5">
                <Target className="h-4 w-4 text-blue-400" />
                ATM STRADDLE PREMIUM
              </span>
              <span className="text-blue-400 font-bold">{underlying.atmStrike}</span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-mono font-bold text-white">₹{straddlePrice}</span>
                <span className="text-[11px] text-slate-400 ml-1.5 font-mono">(CE + PE)</span>
              </div>
              <div className="text-right text-xs font-mono">
                <div className="text-emerald-400">CE: ₹{cePrice}</div>
                <div className="text-rose-400">PE: ₹{pePrice}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-terminal-800 grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">MAX PAIN</span>
              <span className="text-purple-300 font-bold text-sm">{optionChain.maxPainStrike}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">OI PCR</span>
              <span className={`font-bold text-sm ${optionChain.oiPcr >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {optionChain.oiPcr}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section: PCR & Support/Resistance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* OI PCR */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/70 p-3.5">
          <div className="text-xs text-slate-400 font-mono">OPEN INTEREST PCR</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-white">{optionChain.oiPcr}</span>
            <span className="text-[11px] font-mono text-slate-400">
              {optionChain.oiPcr >= 1.2 ? 'Bullish' : optionChain.oiPcr <= 0.8 ? 'Bearish' : 'Neutral'}
            </span>
          </div>
          <div className="mt-2 w-full bg-terminal-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(10, optionChain.oiPcr * 50))}%` }}
            ></div>
          </div>
        </div>

        {/* Volume PCR */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/70 p-3.5">
          <div className="text-xs text-slate-400 font-mono">VOLUME PCR</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-white">{optionChain.volumePcr}</span>
            <span className="text-[11px] font-mono text-slate-400">Put/Call Vol</span>
          </div>
          <div className="mt-2 w-full bg-terminal-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(10, optionChain.volumePcr * 50))}%` }}
            ></div>
          </div>
        </div>

        {/* Major Support */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/70 p-3.5">
          <div className="text-xs text-emerald-400 font-mono">ESTIMATED SUPPORT (PUT WALL)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-emerald-300">{optionChain.supportStrike}</span>
            <span className="text-[11px] font-mono text-slate-400">Heavy Put OI</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 font-mono">
            Downside cushion for index
          </div>
        </div>

        {/* Major Resistance */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/70 p-3.5">
          <div className="text-xs text-rose-400 font-mono">ESTIMATED RESISTANCE (CALL WALL)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-rose-300">{optionChain.resistanceStrike}</span>
            <span className="text-[11px] font-mono text-slate-400">Heavy Call OI</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 font-mono">
            Upside supply barrier
          </div>
        </div>
      </div>

      {/* Snapshot of Nearby Strikes (5 strikes ITM/OTM) */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-800 bg-terminal-850">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-400" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              Nearby Strike Option Snapshot (±3 Strikes)
            </span>
          </div>
          <button
            onClick={onNavigateToChain}
            className="text-xs text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 cursor-pointer"
          >
            Open Full Option Chain <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-terminal-800 text-[11px] text-slate-400 bg-terminal-950/50">
                <th className="py-2.5 px-3 text-right">Call OI</th>
                <th className="py-2.5 px-3 text-right">Call LTP</th>
                <th className="py-2.5 px-3 text-center bg-terminal-850 text-slate-800 dark:text-white font-bold">STRIKE</th>
                <th className="py-2.5 px-3 text-left">Put LTP</th>
                <th className="py-2.5 px-3 text-left">Put OI</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-800/60">
              {optionChain.rows.slice(Math.max(0, Math.floor(optionChain.rows.length / 2) - 3), Math.floor(optionChain.rows.length / 2) + 4).map((row) => (
                <tr 
                  key={row.strike} 
                  className={`hover:bg-terminal-800/40 transition-colors ${
                    row.isAtm ? 'bg-blue-600/10 font-semibold' : ''
                  }`}
                >
                  <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                    {(row.ce.oi || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                    ₹{row.ce.ltp?.toFixed(2) || 'N/A'}
                  </td>
                  <td className={`py-2 px-3 text-center font-bold ${
                    row.isAtm ? 'bg-blue-600/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/50' : 'bg-terminal-850/60 text-slate-900 dark:text-white'
                  }`}>
                    {row.strike}
                    {row.isAtm && <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-blue-600 text-white">ATM</span>}
                  </td>
                  <td className="py-2 px-3 text-left text-rose-600 dark:text-rose-400 font-semibold">
                    ₹{row.pe.ltp?.toFixed(2) || 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-left text-slate-600 dark:text-slate-300">
                    {(row.pe.oi || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onQuickTrade(row.ce.symbol, row.strike, 'CE', row.ce.ltp || 100)}
                        className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                      >
                        Buy CE
                      </button>
                      <button
                        onClick={() => onQuickTrade(row.pe.symbol, row.strike, 'PE', row.pe.ltp || 100)}
                        className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer"
                      >
                        Buy PE
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
