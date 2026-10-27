// ==============================================================================
// Live Option Chain Table Component
// Full synchronized calls, strikes, and puts with ITM/ATM/OTM classification
// ==============================================================================

import React, { useState } from 'react';
import { 
  OptionChainSnapshot, OptionChainRow, OptionContractData 
} from '../types/market.js';
import { 
  ArrowUpDown, Filter, Eye, Zap, Clock, ShieldCheck, 
  HelpCircle, ChevronDown, Check, TrendingUp, TrendingDown 
} from 'lucide-react';

interface LiveOptionChainProps {
  optionChain: OptionChainSnapshot | null;
  selectedExpiry: string;
  strikeRange: number;
  onSelectExpiry: (exp: string) => void;
  onSelectStrikeRange: (range: number) => void;
  onTradeClick: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
}

export const LiveOptionChain: React.FC<LiveOptionChainProps> = ({
  optionChain,
  selectedExpiry,
  strikeRange,
  onSelectExpiry,
  onSelectStrikeRange,
  onTradeClick,
}) => {
  const [showGreeks, setShowGreeks] = useState(false);
  const [sortField, setSortField] = useState<string>('strike');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  if (!optionChain) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-3"></div>
        <div>Loading synchronized live option chain...</div>
      </div>
    );
  }

  const { underlying, rows, atmStrike, oiPcr, volumePcr, totalCeOi, totalPeOi, totalCeVolume, totalPeVolume } = optionChain;

  // Sorting
  const sortedRows = [...rows].sort((a, b) => {
    if (sortField === 'strike') {
      return sortAsc ? a.strike - b.strike : b.strike - a.strike;
    }
    if (sortField === 'ceOi') {
      return sortAsc ? (a.ce.oi || 0) - (b.ce.oi || 0) : (b.ce.oi || 0) - (a.ce.oi || 0);
    }
    if (sortField === 'peOi') {
      return sortAsc ? (a.pe.oi || 0) - (b.pe.oi || 0) : (b.pe.oi || 0) - (a.pe.oi || 0);
    }
    if (sortField === 'ceLtp') {
      return sortAsc ? (a.ce.ltp || 0) - (b.ce.ltp || 0) : (b.ce.ltp || 0) - (a.ce.ltp || 0);
    }
    if (sortField === 'peLtp') {
      return sortAsc ? (a.pe.ltp || 0) - (b.pe.ltp || 0) : (b.pe.ltp || 0) - (a.pe.ltp || 0);
    }
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      {/* Controls Bar: Expiry, Strike Range, Greeks Toggle, and PCR metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-terminal-800 bg-terminal-900/90 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Expiry Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">EXPIRY:</span>
            <select
              value={selectedExpiry || underlying.nearestExpiry}
              onChange={(e) => onSelectExpiry(e.target.value)}
              className="rounded-lg border border-terminal-700 bg-terminal-850 px-2.5 py-1.5 text-xs font-mono font-semibold text-white focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              {underlying.availableExpiries.map((exp) => (
                <option key={exp} value={exp}>
                  {exp} {exp === underlying.nearestExpiry ? '(Near Weekly)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Strike Range Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">RANGE:</span>
            <div className="flex items-center rounded-lg border border-terminal-700 bg-terminal-850 p-0.5 text-xs font-mono">
              {[3, 5, 10, 20].map((r) => (
                <button
                  key={r}
                  onClick={() => onSelectStrikeRange(r)}
                  className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                    strikeRange === r
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ±{r}
                </button>
              ))}
            </div>
          </div>

          {/* Greeks Toggle */}
          <button
            onClick={() => setShowGreeks(!showGreeks)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
              showGreeks
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 font-semibold'
                : 'border-terminal-700 bg-terminal-850 text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{showGreeks ? 'Hide Greeks' : 'Show Greeks & IV'}</span>
          </button>
        </div>

        {/* PCR & Total Summary Pills */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-terminal-850 px-2.5 py-1 rounded border border-terminal-700">
            <span className="text-slate-400">OI PCR:</span>
            <span className={`font-bold ${oiPcr >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {oiPcr}
            </span>
            <span className="text-[10px] text-slate-400">({totalPeOi.toLocaleString('en-IN')} / {totalCeOi.toLocaleString('en-IN')})</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 bg-terminal-850 px-2.5 py-1 rounded border border-terminal-700">
            <span className="text-slate-400">VOL PCR:</span>
            <span className="text-blue-400 font-bold">{volumePcr}</span>
          </div>
        </div>
      </div>

      {/* Main Option Chain Table */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              {/* Top Group Header */}
              <tr className="border-b border-terminal-800 text-xs font-bold text-center">
                <th colSpan={showGreeks ? 9 : 5} className="py-2 px-3 bg-emerald-950/25 text-emerald-400 border-r border-terminal-800 tracking-wider uppercase">
                  CALL OPTIONS (CE)
                </th>
                <th className="py-2 px-4 bg-terminal-800 text-white border-r border-terminal-800 tracking-wider uppercase">
                  STRIKE
                </th>
                <th colSpan={showGreeks ? 9 : 5} className="py-2 px-3 bg-rose-950/25 text-rose-400 tracking-wider uppercase">
                  PUT OPTIONS (PE)
                </th>
              </tr>
              {/* Column Headers */}
              <tr className="border-b border-terminal-800 text-[11px] text-slate-400 bg-terminal-950/70">
                {/* CE Columns */}
                <th onClick={() => handleSort('ceOi')} className="py-2 px-2 text-right cursor-pointer hover:text-white">
                  OI {sortField === 'ceOi' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="py-2 px-2 text-right">Chg OI</th>
                <th className="py-2 px-2 text-right">Volume</th>
                {showGreeks && <th className="py-2 px-1 text-right text-purple-400">IV</th>}
                {showGreeks && <th className="py-2 px-1 text-right text-purple-400">Delta</th>}
                {showGreeks && <th className="py-2 px-1 text-right text-purple-400">Theta</th>}
                <th className="py-2 px-2 text-right text-slate-300">Bid / Ask</th>
                <th onClick={() => handleSort('ceLtp')} className="py-2 px-2.5 text-right font-bold text-emerald-400 border-r border-terminal-800 cursor-pointer">
                  LTP {sortField === 'ceLtp' && (sortAsc ? '▲' : '▼')}
                </th>

                {/* Strike Center Header */}
                <th onClick={() => handleSort('strike')} className="py-2 px-3 text-center bg-terminal-850 text-white font-bold border-r border-terminal-800 cursor-pointer">
                  STRIKE {sortField === 'strike' && (sortAsc ? '▲' : '▼')}
                </th>

                {/* PE Columns */}
                <th onClick={() => handleSort('peLtp')} className="py-2 px-2.5 text-left font-bold text-rose-400 border-r border-terminal-800/40 cursor-pointer">
                  LTP {sortField === 'peLtp' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="py-2 px-2 text-left text-slate-300">Bid / Ask</th>
                {showGreeks && <th className="py-2 px-1 text-left text-purple-400">IV</th>}
                {showGreeks && <th className="py-2 px-1 text-left text-purple-400">Delta</th>}
                {showGreeks && <th className="py-2 px-1 text-left text-purple-400">Theta</th>}
                <th className="py-2 px-2 text-left">Volume</th>
                <th className="py-2 px-2 text-left">Chg OI</th>
                <th onClick={() => handleSort('peOi')} className="py-2 px-2 text-left cursor-pointer hover:text-white">
                  OI {sortField === 'peOi' && (sortAsc ? '▲' : '▼')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-800/40">
              {sortedRows.map((row) => {
                const isAtm = row.isAtm;
                const isCeItm = row.ce.moneyness === 'ITM';
                const isPeItm = row.pe.moneyness === 'ITM';

                return (
                  <tr
                    key={row.strike}
                    className={`transition-colors hover:bg-terminal-800/50 ${
                      isAtm 
                        ? 'bg-blue-600/15 font-semibold ring-1 ring-blue-500/50' 
                        : ''
                    }`}
                  >
                    {/* CE Side */}
                    <td className={`py-2 px-2 text-right ${isCeItm ? 'bg-amber-500/[0.04]' : ''} text-slate-300`}>
                      {row.ce.oi ? row.ce.oi.toLocaleString('en-IN') : 'N/A'}
                    </td>
                    <td className={`py-2 px-2 text-right ${isCeItm ? 'bg-amber-500/[0.04]' : ''} ${(row.ce.oiChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.ce.oiChange !== null ? `${row.ce.oiChange >= 0 ? '+' : ''}${row.ce.oiChange.toLocaleString('en-IN')}` : 'N/A'}
                    </td>
                    <td className={`py-2 px-2 text-right ${isCeItm ? 'bg-amber-500/[0.04]' : ''} text-slate-400`}>
                      {row.ce.volume ? row.ce.volume.toLocaleString('en-IN') : 'N/A'}
                    </td>
                    {showGreeks && (
                      <td className={`py-2 px-1 text-right text-purple-300 ${isCeItm ? 'bg-amber-500/[0.04]' : ''}`}>
                        {row.ce.iv ? `${row.ce.iv.toFixed(1)}%` : 'N/A'}
                      </td>
                    )}
                    {showGreeks && (
                      <td className={`py-2 px-1 text-right text-purple-300 ${isCeItm ? 'bg-amber-500/[0.04]' : ''}`}>
                        {row.ce.delta ? row.ce.delta.toFixed(2) : 'N/A'}
                      </td>
                    )}
                    {showGreeks && (
                      <td className={`py-2 px-1 text-right text-purple-300 ${isCeItm ? 'bg-amber-500/[0.04]' : ''}`}>
                        {row.ce.theta ? row.ce.theta.toFixed(1) : 'N/A'}
                      </td>
                    )}
                    <td className={`py-2 px-2 text-right text-[10px] text-slate-400 ${isCeItm ? 'bg-amber-500/[0.04]' : ''}`}>
                      {row.ce.bid !== null ? `${row.ce.bid} / ${row.ce.ask}` : 'N/A'}
                    </td>
                    <td 
                      onClick={() => onTradeClick(row.ce.symbol, row.strike, 'CE', row.ce.ltp || 100)}
                      title="Click to simulate paper order"
                      className={`py-2 px-2.5 text-right font-bold text-emerald-400 border-r border-terminal-800 cursor-pointer hover:bg-emerald-500/20 transition-colors ${
                        isCeItm ? 'bg-amber-500/[0.08]' : ''
                      }`}
                    >
                      ₹{row.ce.ltp !== null ? row.ce.ltp.toFixed(2) : 'N/A'}
                    </td>

                    {/* STRIKE (Center) */}
                    <td className={`py-2 px-3 text-center font-bold border-r border-terminal-800 ${
                      isAtm 
                        ? 'bg-blue-600/30 text-blue-200 ring-2 ring-blue-500' 
                        : 'bg-terminal-850 text-white'
                    }`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{row.strike}</span>
                        {isAtm && (
                          <span className="px-1 py-0.2 rounded text-[9px] bg-blue-500 text-white font-bold tracking-wider">
                            ATM
                          </span>
                        )}
                      </div>
                    </td>

                    {/* PE Side */}
                    <td 
                      onClick={() => onTradeClick(row.pe.symbol, row.strike, 'PE', row.pe.ltp || 100)}
                      title="Click to simulate paper order"
                      className={`py-2 px-2.5 text-left font-bold text-rose-400 border-r border-terminal-800/40 cursor-pointer hover:bg-rose-500/20 transition-colors ${
                        isPeItm ? 'bg-purple-500/[0.08]' : ''
                      }`}
                    >
                      ₹{row.pe.ltp !== null ? row.pe.ltp.toFixed(2) : 'N/A'}
                    </td>
                    <td className={`py-2 px-2 text-left text-[10px] text-slate-400 ${isPeItm ? 'bg-purple-500/[0.04]' : ''}`}>
                      {row.pe.bid !== null ? `${row.pe.bid} / ${row.pe.ask}` : 'N/A'}
                    </td>
                    {showGreeks && (
                      <td className={`py-2 px-1 text-left text-purple-300 ${isPeItm ? 'bg-purple-500/[0.04]' : ''}`}>
                        {row.pe.iv ? `${row.pe.iv.toFixed(1)}%` : 'N/A'}
                      </td>
                    )}
                    {showGreeks && (
                      <td className={`py-2 px-1 text-left text-purple-300 ${isPeItm ? 'bg-purple-500/[0.04]' : ''}`}>
                        {row.pe.delta ? row.pe.delta.toFixed(2) : 'N/A'}
                      </td>
                    )}
                    {showGreeks && (
                      <td className={`py-2 px-1 text-left text-purple-300 ${isPeItm ? 'bg-purple-500/[0.04]' : ''}`}>
                        {row.pe.theta ? row.pe.theta.toFixed(1) : 'N/A'}
                      </td>
                    )}
                    <td className={`py-2 px-2 text-left text-slate-400 ${isPeItm ? 'bg-purple-500/[0.04]' : ''}`}>
                      {row.pe.volume ? row.pe.volume.toLocaleString('en-IN') : 'N/A'}
                    </td>
                    <td className={`py-2 px-2 text-left ${isPeItm ? 'bg-purple-500/[0.04]' : ''} ${(row.pe.oiChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.pe.oiChange !== null ? `${row.pe.oiChange >= 0 ? '+' : ''}${row.pe.oiChange.toLocaleString('en-IN')}` : 'N/A'}
                    </td>
                    <td className={`py-2 px-2 text-left ${isPeItm ? 'bg-purple-500/[0.04]' : ''} text-slate-300`}>
                      {row.pe.oi ? row.pe.oi.toLocaleString('en-IN') : 'N/A'}
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
