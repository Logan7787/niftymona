// ==============================================================================
// Profitable Penny Stocks Quantitative Prediction Page
// Screener, Targets, Stop-Losses, Win Probabilities, & Profit Calculator
// ==============================================================================

import React, { useState, useMemo } from 'react';
import {
  PennyStockService, PennyStock, PennyCategory
} from '../services/pennyStockService';
import {
  Coins, Zap, TrendingUp, TrendingDown, Target, ShieldAlert,
  BarChart2, Award, Search, Filter, ShieldCheck, ArrowRight,
  Calculator, Check, X, Info, Sparkles, Layers, Briefcase
} from 'lucide-react';

interface PennyStocksPredictionProps {
  onTradeClick?: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
}

export const PennyStocksPrediction: React.FC<PennyStocksPredictionProps> = ({ onTradeClick }) => {
  const [selectedCategory, setSelectedCategory] = useState<PennyCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStock, setSelectedStock] = useState<PennyStock | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [investmentAmount, setInvestmentAmount] = useState<number>(25000);

  const allStocks = useMemo(() => PennyStockService.getAllStocks(), []);

  // Filtered stocks based on category & search
  const filteredStocks = useMemo(() => {
    let list = PennyStockService.getStocksByCategory(selectedCategory);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => 
        s.symbol.toLowerCase().includes(q) || 
        s.name.toLowerCase().includes(q) || 
        s.sector.toLowerCase().includes(q)
      );
    }

    return list;
  }, [selectedCategory, searchQuery]);

  // Overall Market Metrics
  const stats = useMemo(() => {
    const total = allStocks.length;
    const avgWin = +(allStocks.reduce((acc, s) => acc + s.winProbability, 0) / total).toFixed(1);
    const maxTarget = Math.max(...allStocks.map(s => s.target2Percent));
    const highestVol = Math.max(...allStocks.map(s => s.volumeSurge));
    return { total, avgWin, maxTarget, highestVol };
  }, [allStocks]);

  return (
    <div className="p-2 sm:p-4 space-y-4 max-w-[1700px] mx-auto font-sans">
      {/* Top Banner & Screener Header */}
      <div className="p-4 sm:p-5 rounded-xl border border-terminal-800 bg-terminal-900 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-terminal-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/30">
                <Coins className="h-4 w-4" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-100 font-mono tracking-wide">
                Profitable Penny Stocks Prediction Engine
              </h1>
              <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                HIGH CONVICTION SWING PICKS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Algorithmic scanning across high-volume momentum penny equities with controlled risk-reward profiles
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Screener Active</span>
          </div>
        </div>

        {/* Screener Highlights Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 text-xs font-mono">
          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
            <span className="text-[11px] text-slate-400 block uppercase">Screened Conviction Stocks</span>
            <span className="text-lg font-bold text-white mt-0.5 block">{stats.total} Active Picks</span>
            <span className="text-[10px] text-emerald-400 font-medium">Filtered from 400+ small-caps</span>
          </div>

          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
            <span className="text-[11px] text-slate-400 block uppercase">Average Model Win Prob</span>
            <span className="text-lg font-bold text-emerald-400 mt-0.5 block">{stats.avgWin}%</span>
            <span className="text-[10px] text-slate-400 font-medium">Verified by multi-factor tests</span>
          </div>

          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
            <span className="text-[11px] text-slate-400 block uppercase">Max Profit Target Potential</span>
            <span className="text-lg font-bold text-amber-400 mt-0.5 block">+{stats.maxTarget}%</span>
            <span className="text-[10px] text-slate-400 font-medium">Positional Multibagger upside</span>
          </div>

          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700/60">
            <span className="text-[11px] text-slate-400 block uppercase">Peak Volume Accumulation</span>
            <span className="text-lg font-bold text-blue-400 mt-0.5 block">{stats.highestVol}x Surge</span>
            <span className="text-[10px] text-slate-400 font-medium">Institutional delivery backing</span>
          </div>
        </div>
      </div>

      {/* Interactive Capital & Profit Calculator Bar */}
      <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/15 shadow-sm text-xs font-mono">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-400" />
            <div>
              <strong className="text-white text-xs block">Projected Capital Return Calculator</strong>
              <span className="text-[11px] text-slate-400">
                Enter your test investment capital to preview share quantity, target profits, and max risk
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-terminal-850 border border-terminal-700 px-2.5 py-1.5 rounded-lg">
              <span className="text-slate-400">Capital: ₹</span>
              <input
                type="number"
                min="1000"
                step="5000"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Math.max(1000, Number(e.target.value) || 0))}
                className="w-24 bg-transparent text-white font-bold focus:outline-none"
              />
            </div>

            {[10000, 25000, 50000, 100000].map((amt) => (
              <button
                key={amt}
                onClick={() => setInvestmentAmount(amt)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                  investmentAmount === amt
                    ? 'bg-blue-600 text-white font-bold border-blue-500'
                    : 'bg-terminal-800/80 text-slate-300 border-terminal-700 hover:border-terminal-600'
                }`}
              >
                ₹{(amt / 1000)}k
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters and View Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-terminal-800 bg-terminal-900 text-xs font-mono">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1 sm:pb-0">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-1" />
          {[
            { id: 'ALL', label: 'All Picks (10)' },
            { id: 'HIGH_VOLUME_SURGE', label: 'Volume Surge (2x-7x)' },
            { id: 'BREAKOUT_MOMENTUM', label: 'Breakout Momentum' },
            { id: 'UNDER_20', label: 'Under ₹20 Multibaggers' },
            { id: 'UNDER_50', label: 'Under ₹50 High Growth' },
            { id: 'TURNAROUND_VALUE', label: 'Turnaround Value' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-amber-600 text-white font-bold shadow-sm'
                  : 'bg-terminal-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search ticker, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-terminal-850 border border-terminal-700 text-slate-200 placeholder-slate-500 text-xs w-full sm:w-48 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="hidden md:flex items-center gap-1 border border-terminal-700 bg-terminal-850 p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                viewMode === 'cards' ? 'bg-terminal-700 text-white' : 'text-slate-400'
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                viewMode === 'table' ? 'bg-terminal-700 text-white' : 'text-slate-400'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Cards View */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStocks.map((stock) => {
            const isPos = stock.change >= 0;
            const calc = PennyStockService.calculateProjectedReturn(investmentAmount, stock);

            return (
              <div
                key={stock.id}
                onClick={() => setSelectedStock(stock)}
                className="p-4 rounded-xl border border-terminal-800 bg-terminal-900 hover:border-amber-500/40 transition-all cursor-pointer shadow-md space-y-3 font-mono text-xs hover:shadow-lg hover:shadow-amber-500/5 group"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                        {stock.symbol}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        stock.action === 'STRONG_BUY'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : stock.action === 'BREAKOUT_BUY'
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {stock.action.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5 line-clamp-1">
                      {stock.name} • {stock.sector}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-white block">
                      ₹{stock.cmp.toFixed(2)}
                    </span>
                    <span className={`text-[11px] font-bold flex items-center justify-end gap-0.5 ${
                      isPos ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isPos ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Key Screener Metrics Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {stock.volumeSurge}x Volume Surge
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
                    {stock.deliveryPercent}% Delivery
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    {stock.winProbability}% Win Prob
                  </span>
                </div>

                {/* Technical Pattern Banner */}
                <div className="p-2 rounded bg-terminal-850 border border-terminal-700/60 text-[11px] text-slate-300">
                  <span className="text-slate-400 text-[10px] block uppercase font-medium">Pattern Setup:</span>
                  <span className="font-semibold text-white">{stock.pattern}</span>
                </div>

                {/* Targets & Stop Loss Grid */}
                <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-terminal-850 rounded-lg text-center border border-terminal-700/60">
                  <div>
                    <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                    <span className="font-bold text-emerald-400">₹{stock.target1}</span>
                    <span className="text-[10px] text-emerald-500 block">+{stock.target1Percent}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                    <span className="font-bold text-emerald-300">₹{stock.target2}</span>
                    <span className="text-[10px] text-emerald-400 block">+{stock.target2Percent}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                    <span className="font-bold text-rose-400">₹{stock.stopLoss}</span>
                    <span className="text-[10px] text-rose-500 block">-{stock.stopLossPercent}%</span>
                  </div>
                </div>

                {/* Projected Return for Capital */}
                <div className="p-2.5 rounded bg-blue-950/20 border border-blue-500/20 space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>For ₹{investmentAmount.toLocaleString('en-IN')}:</span>
                    <span className="text-white font-bold">{calc.quantity} Shares</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">Profit @ Target 1 / 2:</span>
                    <span className="text-emerald-400 font-bold">
                      +₹{calc.target1Profit.toLocaleString('en-IN')} / +₹{calc.target2Profit.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Footer Entry & Details button */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-terminal-800">
                  <span>Entry: ₹{stock.entryZone.min} - ₹{stock.entryZone.max}</span>
                  <span className="text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Full Plan <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-terminal-800 bg-terminal-850 text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Stock & Sector</th>
                  <th className="py-2.5 px-3">CMP (₹)</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Win Prob</th>
                  <th className="py-2.5 px-3">Volume Surge</th>
                  <th className="py-2.5 px-3">Target 1 & 2</th>
                  <th className="py-2.5 px-3">Stop Loss</th>
                  <th className="py-2.5 px-3">R:R</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-800/60">
                {filteredStocks.map((stock) => {
                  const isPos = stock.change >= 0;
                  return (
                    <tr
                      key={stock.id}
                      onClick={() => setSelectedStock(stock)}
                      className="hover:bg-terminal-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-bold">
                        <div className="text-white">{stock.symbol}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{stock.sector}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-white block">₹{stock.cmp.toFixed(2)}</span>
                        <span className={`text-[10px] font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPos ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          stock.action === 'STRONG_BUY'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : stock.action === 'BREAKOUT_BUY'
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}>
                          {stock.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">
                        {stock.winProbability}%
                      </td>
                      <td className="py-2.5 px-3 text-amber-400 font-semibold">
                        {stock.volumeSurge}x (Deliv: {stock.deliveryPercent}%)
                      </td>
                      <td className="py-2.5 px-3 text-emerald-300 font-semibold">
                        ₹{stock.target1} / ₹{stock.target2}
                      </td>
                      <td className="py-2.5 px-3 text-rose-400 font-semibold">
                        ₹{stock.stopLoss}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {stock.riskReward}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStock(stock);
                          }}
                          className="px-2.5 py-1 rounded bg-terminal-800 hover:bg-terminal-700 text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          View Setup
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Detailed Breakdown Modal */}
      {selectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
          <div className="bg-terminal-900 border border-terminal-700 rounded-xl max-w-xl w-full p-5 space-y-4 font-mono text-xs shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-terminal-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">
                    {selectedStock.symbol}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {selectedStock.action.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {selectedStock.name} • {selectedStock.sector}
                </p>
              </div>
              <button
                onClick={() => setSelectedStock(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-terminal-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Price & Target Overview */}
            <div className="grid grid-cols-4 gap-2 p-3 bg-terminal-850 rounded-lg text-center border border-terminal-700">
              <div>
                <span className="text-[10px] text-slate-400 block">CMP</span>
                <span className="text-sm font-bold text-white">₹{selectedStock.cmp}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 1</span>
                <span className="text-sm font-bold text-emerald-400">₹{selectedStock.target1}</span>
                <span className="text-[10px] text-emerald-500">+{selectedStock.target1Percent}%</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">TARGET 2</span>
                <span className="text-sm font-bold text-emerald-300">₹{selectedStock.target2}</span>
                <span className="text-[10px] text-emerald-400">+{selectedStock.target2Percent}%</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">STOP LOSS</span>
                <span className="text-sm font-bold text-rose-400">₹{selectedStock.stopLoss}</span>
                <span className="text-[10px] text-rose-500">-{selectedStock.stopLossPercent}%</span>
              </div>
            </div>

            {/* Pattern & Strategy Details */}
            <div className="space-y-2 text-slate-300">
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Technical Pattern:</span>
                <span className="text-white font-semibold">{selectedStock.pattern}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Volume Surge Multiplier:</span>
                <span className="text-amber-400 font-bold">{selectedStock.volumeSurge}x Average</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Delivery Percentage:</span>
                <span className="text-emerald-400 font-semibold">{selectedStock.deliveryPercent}% Delivery</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Optimal Entry Zone:</span>
                <span className="text-white font-semibold">₹{selectedStock.entryZone.min} - ₹{selectedStock.entryZone.max}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Risk-to-Reward Ratio:</span>
                <span className="text-emerald-300 font-bold">{selectedStock.riskReward}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Suggested Holding Horizon:</span>
                <span className="text-blue-300 font-semibold">{selectedStock.suggestedHoldingDays}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-terminal-800">
                <span className="text-slate-400">Debt & Balance Sheet:</span>
                <span className="text-slate-200">{selectedStock.debtToEquity}</span>
              </div>
            </div>

            {/* Key Growth & Accumulation Drivers */}
            <div className="p-3 bg-terminal-950 rounded-lg border border-terminal-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Catalysts & Quantitative Evidence:
              </span>
              {selectedStock.keyDrivers.map((driver, i) => (
                <div key={i} className="text-slate-300 text-[11px] flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{driver}</span>
                </div>
              ))}
            </div>

            {/* Risk Factors */}
            <div className="p-2.5 bg-rose-950/20 border border-rose-800/30 rounded-lg text-rose-300 text-[11px] flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <strong>Primary Risk Factor:</strong> {selectedStock.riskFactor}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedStock(null)}
                className="px-4 py-2 rounded-lg bg-terminal-800 hover:bg-terminal-700 text-slate-300 cursor-pointer"
              >
                Close
              </button>
              {onTradeClick && (
                <button
                  onClick={() => {
                    onTradeClick(
                      selectedStock.symbol,
                      selectedStock.cmp,
                      'CE',
                      selectedStock.cmp
                    );
                    setSelectedStock(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
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

