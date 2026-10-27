// ==============================================================================
// ATM Strike Analysis Page
// Detailed breakdown of the at-the-money strike, straddle premium & Greeks
// ==============================================================================

import React from 'react';
import { OptionChainSnapshot, UnderlyingSnapshot } from '../types/market.js';
import { Target, TrendingUp, TrendingDown, Layers, Activity, ShieldCheck, Zap } from 'lucide-react';

interface ATMStrikeAnalysisProps {
  underlying: UnderlyingSnapshot | null;
  optionChain: OptionChainSnapshot | null;
  onTradeClick: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
}

export const ATMStrikeAnalysis: React.FC<ATMStrikeAnalysisProps> = ({
  underlying,
  optionChain,
  onTradeClick,
}) => {
  if (!underlying || !optionChain) {
    return <div className="p-8 text-center text-slate-400 font-mono">Loading ATM Strike Analysis...</div>;
  }

  const atmStrike = optionChain.atmStrike;
  const atmRow = optionChain.rows.find(r => r.strike === atmStrike);
  const ce = atmRow?.ce;
  const pe = atmRow?.pe;

  const cePrice = ce?.ltp || 0;
  const pePrice = pe?.ltp || 0;
  const straddlePrice = Number((cePrice + pePrice).toFixed(2));
  const upperBreakeven = Number((atmStrike + straddlePrice).toFixed(2));
  const lowerBreakeven = Number((atmStrike - straddlePrice).toFixed(2));

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Top ATM Summary Banner */}
      <div className="rounded-xl border border-blue-500/30 bg-terminal-900/90 p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-blue-400 font-bold uppercase tracking-wider">
              <Target className="h-4 w-4" />
              Dynamic At-The-Money Analysis
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-3xl font-bold text-white">{atmStrike}</span>
              <span className="text-sm text-slate-400">
                (NIFTY Spot: ₹{underlying.spotPrice.toFixed(2)})
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              ATM Strike calculated dynamically from the selected broker's active instrument master without hardcoded strike intervals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-terminal-850 border border-terminal-700 px-3 py-2 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 block">DISTANCE FROM SPOT</span>
              <span className="text-sm font-bold text-white">
                {Math.abs(underlying.spotPrice - atmStrike).toFixed(2)} pts
              </span>
            </div>
            <div className="bg-terminal-850 border border-terminal-700 px-3 py-2 rounded-lg text-center">
              <span className="text-[10px] text-slate-400 block">STRADDLE PREMIUM</span>
              <span className="text-sm font-bold text-blue-400">₹{straddlePrice}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-side CE vs PE Comparison Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CE Contract Card */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
              <span className="font-bold text-emerald-400 text-sm">
                NIFTY {atmStrike} CE (Call Option)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                ATM CALL
              </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-bold text-white">₹{cePrice.toFixed(2)}</span>
                <span className="ml-2 text-xs text-emerald-400 font-semibold">
                  {ce?.change !== null && ce?.change !== undefined ? `${ce.change >= 0 ? '+' : ''}${ce.change.toFixed(2)}` : 'N/A'}
                </span>
              </div>
              <div className="text-right text-xs text-slate-400">
                Bid: ₹{ce?.bid || 'N/A'} | Ask: ₹{ce?.ask || 'N/A'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-terminal-800/80 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">OPEN INTEREST</span>
                <span className="font-bold text-white">{ce?.oi?.toLocaleString('en-IN') || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">OI CHANGE</span>
                <span className={`font-bold ${(ce?.oiChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ce?.oiChange !== null && ce?.oiChange !== undefined ? `${ce.oiChange >= 0 ? '+' : ''}${ce.oiChange.toLocaleString('en-IN')}` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">VOLUME</span>
                <span className="font-bold text-white">{ce?.volume?.toLocaleString('en-IN') || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <button
              onClick={() => onTradeClick(`NIFTY ${atmStrike} CE`, atmStrike, 'CE', cePrice)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Simulate Paper Buy CE</span>
            </button>
          </div>
        </div>

        {/* PE Contract Card */}
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
              <span className="font-bold text-rose-400 text-sm">
                NIFTY {atmStrike} PE (Put Option)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold">
                ATM PUT
              </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-bold text-white">₹{pePrice.toFixed(2)}</span>
                <span className="ml-2 text-xs text-rose-400 font-semibold">
                  {pe?.change !== null && pe?.change !== undefined ? `${pe.change >= 0 ? '+' : ''}${pe.change.toFixed(2)}` : 'N/A'}
                </span>
              </div>
              <div className="text-right text-xs text-slate-400">
                Bid: ₹{pe?.bid || 'N/A'} | Ask: ₹{pe?.ask || 'N/A'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-terminal-800/80 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">OPEN INTEREST</span>
                <span className="font-bold text-white">{pe?.oi?.toLocaleString('en-IN') || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">OI CHANGE</span>
                <span className={`font-bold ${(pe?.oiChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pe?.oiChange !== null && pe?.oiChange !== undefined ? `${pe.oiChange >= 0 ? '+' : ''}${pe.oiChange.toLocaleString('en-IN')}` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">VOLUME</span>
                <span className="font-bold text-white">{pe?.volume?.toLocaleString('en-IN') || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <button
              onClick={() => onTradeClick(`NIFTY ${atmStrike} PE`, atmStrike, 'PE', pePrice)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-colors cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Simulate Paper Buy PE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Straddle Breakevens & Market Range Projection */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 pb-2 border-b border-terminal-800">
          Synthetic ATM Straddle Breakeven Levels
        </h4>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <span className="text-slate-400 text-xs block">LOWER BREAKEVEN</span>
            <span className="text-lg font-bold text-rose-400">₹{lowerBreakeven}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">(ATM - Straddle Premium)</span>
          </div>
          <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/30">
            <span className="text-blue-300 text-xs block">CURRENT ATM</span>
            <span className="text-xl font-bold text-white">₹{atmStrike}</span>
            <span className="text-[10px] text-blue-400 block mt-0.5">Anchor Strike</span>
          </div>
          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <span className="text-slate-400 text-xs block">UPPER BREAKEVEN</span>
            <span className="text-lg font-bold text-emerald-400">₹{upperBreakeven}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">(ATM + Straddle Premium)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
