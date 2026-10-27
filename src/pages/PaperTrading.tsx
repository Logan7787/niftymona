// ==============================================================================
// Isolated Paper Trading Terminal
// Real-time simulated order execution, lot validation, and P&L tracking
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { PaperAccountSummary, PaperTradeOrder } from '../types/market';
import { api } from '../services/api';
import { 
  Briefcase, TrendingUp, TrendingDown, DollarSign, RotateCcw, 
  ShieldAlert, CheckCircle2, Clock, X, Zap, Edit3, Coins, Check 
} from 'lucide-react';

interface PaperTradingProps {
  initialTradeTarget?: { symbol: string; strike: number; type: 'CE' | 'PE'; price: number } | null;
  onClearTradeTarget?: () => void;
}

export const PaperTrading: React.FC<PaperTradingProps> = ({
  initialTradeTarget,
  onClearTradeTarget,
}) => {
  const [account, setAccount] = useState<PaperAccountSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Capital manual update modal state
  const [showCapitalModal, setShowCapitalModal] = useState(false);
  const [manualCapitalInput, setManualCapitalInput] = useState('100000');
  const [capitalUpdateMode, setCapitalUpdateMode] = useState<'adjust' | 'reset'>('adjust');

  // Order form state (1 lot = 65 nos standard NSE NIFTY contract)
  const [symbol, setSymbol] = useState('NIFTY 24450 CE');
  const [strike, setStrike] = useState(24450);
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [lotSize, setLotSize] = useState(65); // 1 lot = 65 nos
  const [numLots, setNumLots] = useState(1);
  const [entryPrice, setEntryPrice] = useState(110);
  const [stopLoss, setStopLoss] = useState(85);
  const [target, setTarget] = useState(150);

  const fetchAccount = async () => {
    try {
      const data = await api.getPaperAccount();
      setAccount(data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchAccount();
    const interval = setInterval(fetchAccount, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (initialTradeTarget) {
      setSymbol(initialTradeTarget.symbol);
      setStrike(initialTradeTarget.strike);
      setOptionType(initialTradeTarget.type);
      setEntryPrice(initialTradeTarget.price);
      setStopLoss(Math.max(1, Math.round(initialTradeTarget.price * 0.75)));
      setTarget(Math.round(initialTradeTarget.price * 1.35));
    }
  }, [initialTradeTarget]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await api.placePaperOrder({
        tradingSymbol: symbol,
        instrumentKey: `NIFTY_${strike}_${optionType}`,
        strikePrice: strike,
        optionType,
        expiry: '2026-10-29',
        lotSize,
        numLots,
        action,
        entryPrice,
        stopLoss,
        target,
        notes: 'Simulated quantitative terminal order',
      });

      setLoading(false);
      if (res.success) {
        setSuccessMsg(res.message);
        fetchAccount();
        if (onClearTradeTarget) onClearTradeTarget();
      } else {
        setErrorMsg((res as any).error || res.message || 'Failed to place paper order');
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Server error placing order');
    }
  };

  const handleClosePosition = async (positionId: string, currentLtp: number) => {
    try {
      const res = await api.closePaperPosition(positionId, currentLtp);
      if (res.success) {
        setSuccessMsg(res.message);
        fetchAccount();
      } else {
        setErrorMsg((res as any).error || res.message || 'Failed to close position');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Server error closing position');
    }
  };

  const handleUpdateCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(manualCapitalInput);
    if (!amount || isNaN(amount) || amount <= 0) {
      setErrorMsg('Please enter a valid capital amount greater than 0');
      return;
    }

    try {
      if (capitalUpdateMode === 'reset') {
        await api.resetPaperAccount(amount);
        setSuccessMsg(`Virtual portfolio reset to ₹${amount.toLocaleString('en-IN')}`);
      } else {
        const res = await api.updatePaperCapital(amount);
        if (res.success) {
          setSuccessMsg(res.message);
        } else {
          setErrorMsg(res.message);
        }
      }
      setShowCapitalModal(false);
      fetchAccount();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update capital');
    }
  };

  const handleReset = async () => {
    const currentCap = account?.startingCapital || 100000;
    if (!window.confirm(`Reset virtual paper trading capital to ₹${currentCap.toLocaleString('en-IN')}? All trade history will be cleared.`)) return;
    await api.resetPaperAccount(currentCap);
    fetchAccount();
  };

  const totalQuantity = lotSize * numLots;
  const estimatedCapital = action === 'BUY' ? entryPrice * totalQuantity : 0;

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Disclaimer Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-blue-500/30 bg-blue-950/20 text-xs text-blue-200">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-blue-400 shrink-0" />
          <span>
            <strong>PAPER TRADING ENGINE ACTIVE:</strong> 1 Lot = 65 Nos. Orders are simulated in an isolated virtual execution sandbox.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setManualCapitalInput(String(account?.startingCapital || 100000));
              setShowCapitalModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/40 border border-blue-500/50 text-[11px] text-blue-200 transition-colors cursor-pointer"
          >
            <Coins className="h-3 w-3 text-emerald-400" />
            <span>Update Capital</span>
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-terminal-850 hover:bg-terminal-800 border border-terminal-700 text-[11px] text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Portfolio</span>
          </button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Virtual Capital */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5 relative">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 block uppercase">STARTING CAPITAL</span>
            <button
              onClick={() => {
                setManualCapitalInput(String(account?.startingCapital || 100000));
                setShowCapitalModal(true);
              }}
              title="Edit Capital Amount"
              className="px-1.5 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 text-[10px] text-blue-300 border border-blue-700/50 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Edit3 className="h-2.5 w-2.5" />
              <span>Edit</span>
            </button>
          </div>
          <span className="text-base font-bold text-white mt-1 block">
            ₹{account?.startingCapital.toLocaleString('en-IN') || '1,00,000'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Virtual Funds</span>
        </div>

        {/* Current Cash */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <span className="text-[10px] text-slate-400 block uppercase">AVAILABLE CASH</span>
          <span className="text-base font-bold text-emerald-400 mt-1 block">
            ₹{account?.currentCash.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '1,00,000'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Unallocated Margin</span>
        </div>

        {/* Portfolio Value */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <span className="text-[10px] text-slate-400 block uppercase">PORTFOLIO VALUE</span>
          <span className="text-base font-bold text-white mt-1 block">
            ₹{account?.currentPortfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '1,00,000'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Cash + Unrealized</span>
        </div>

        {/* Realized P&L */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <span className="text-[10px] text-slate-400 block uppercase">REALIZED P&L</span>
          <span className={`text-base font-bold mt-1 block ${(account?.totalRealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {(account?.totalRealizedPnl || 0) >= 0 ? '+' : ''}₹{account?.totalRealizedPnl.toFixed(2) || '0.00'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Closed Trades</span>
        </div>

        {/* Unrealized P&L */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <span className="text-[10px] text-slate-400 block uppercase">UNREALIZED P&L</span>
          <span className={`text-base font-bold mt-1 block ${(account?.totalUnrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {(account?.totalUnrealizedPnl || 0) >= 0 ? '+' : ''}₹{account?.totalUnrealizedPnl.toFixed(2) || '0.00'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Live Mark-to-Market</span>
        </div>

        {/* Win Rate */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <span className="text-[10px] text-slate-400 block uppercase">WIN RATE / DRAWDOWN</span>
          <span className="text-base font-bold text-blue-400 mt-1 block">
            {account?.winRatePercent.toFixed(1) || '0.0'}%
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Max DD: {account?.maxDrawdownPercent || 0}%
          </span>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-300 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)}><X className="h-4 w-4" /></button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Order Entry Form & Open Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Order Entry Card */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white pb-3 border-b border-terminal-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            Simulate Options Order
          </h3>

          <form onSubmit={handlePlaceOrder} className="mt-4 space-y-3 text-xs">
            {/* Action buttons (Buy/Sell) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction('BUY')}
                className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                  action === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-terminal-850 text-slate-400 border border-terminal-700'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setAction('SELL')}
                className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                  action === 'SELL' ? 'bg-rose-600 text-white' : 'bg-terminal-850 text-slate-400 border border-terminal-700'
                }`}
              >
                SELL
              </button>
            </div>

            {/* Contract Symbol */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">CONTRACT SYMBOL</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white font-bold"
                required
              />
            </div>

            {/* Strike & Option Type */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">STRIKE</label>
                <input
                  type="number"
                  step="50"
                  value={strike}
                  onChange={(e) => setStrike(Number(e.target.value))}
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">TYPE</label>
                <select
                  value={optionType}
                  onChange={(e) => setOptionType(e.target.value as any)}
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
                >
                  <option value="CE">Call (CE)</option>
                  <option value="PE">Put (PE)</option>
                </select>
              </div>
            </div>

            {/* Lots & Lot Size */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">LOTS (COUNT)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={numLots}
                  onChange={(e) => setNumLots(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">LOT SIZE (1 LOT = 65 NOS)</label>
                <input
                  type="number"
                  min="1"
                  value={lotSize}
                  onChange={(e) => setLotSize(Math.max(1, parseInt(e.target.value) || 65))}
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white font-bold"
                  title="NSE NIFTY Lot Size (Default: 65 nos)"
                />
              </div>
            </div>

            {/* Total Qty & Required Capital Info */}
            <div className="p-2.5 rounded-lg bg-terminal-850 border border-terminal-700/80 text-[11px] text-slate-300 flex justify-between items-center">
              <span>Total Qty: <strong className="text-white">{totalQuantity} nos</strong> ({numLots} {numLots === 1 ? 'lot' : 'lots'} × {lotSize})</span>
              <span>Req Margin: <strong className="text-emerald-400">₹{estimatedCapital.toLocaleString('en-IN')}</strong></span>
            </div>

            {/* Entry Premium, Stop Loss & Target */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">ENTRY PREMIUM (₹)</label>
              <input
                type="number"
                step="0.05"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">STOP-LOSS (₹)</label>
                <input
                  type="number"
                  step="0.05"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">TARGET (₹)</label>
                <input
                  type="number"
                  step="0.05"
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg font-bold text-white shadow-md transition-all cursor-pointer ${
                action === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              {loading ? 'Submitting...' : `Execute Simulated ${action} Order`}
            </button>
          </form>
        </div>

        {/* Open Positions Table */}
        <div className="lg:col-span-2 rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                Active Open Positions ({account?.openPositions?.length || 0})
              </h3>
              <span className="text-[11px] text-slate-400">Live MTM Updating</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-terminal-800 text-[11px] text-slate-400 bg-terminal-850/60">
                    <th className="py-2 px-2">Instrument</th>
                    <th className="py-2 px-2 text-center">Side</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Avg Entry</th>
                    <th className="py-2 px-2 text-right">LTP</th>
                    <th className="py-2 px-2 text-right">Unrealized P&L</th>
                    <th className="py-2 px-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-terminal-800/50">
                  {account?.openPositions?.map((pos) => (
                    <tr key={pos.id} className="hover:bg-terminal-800/40">
                      <td className="py-2.5 px-2 font-bold text-white">{pos.tradingSymbol}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          pos.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {pos.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-300">{pos.totalQuantity}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300">₹{pos.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-white">₹{pos.currentLtp.toFixed(2)}</td>
                      <td className={`py-2.5 px-2 text-right font-bold ${
                        pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}₹{pos.unrealizedPnl.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => handleClosePosition(pos.id, pos.currentLtp)}
                          className="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          Exit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!account?.openPositions || account.openPositions.length === 0) && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        No active open positions. Execute a trade or click any option in the Option Chain table.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trade History Preview */}
          <div className="mt-6 pt-4 border-t border-terminal-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Recent Trade History ({account?.tradeHistory?.length || 0})
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-1.5 text-[11px]">
              {account?.tradeHistory?.slice(0, 5).map((th) => (
                <div key={th.id} className="flex items-center justify-between p-2 rounded bg-terminal-850/60 border border-terminal-800">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{th.tradingSymbol}</span>
                    <span className="text-slate-500">({th.totalQuantity} qty)</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-400">Exit: ₹{th.exitPrice?.toFixed(2)}</span>
                    <span className={`font-bold ${th.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {th.realizedPnl >= 0 ? '+' : ''}₹{th.realizedPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Capital Entry & Update Modal */}
      {showCapitalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-terminal-700 bg-terminal-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Coins className="h-5 w-5 text-emerald-400" />
                <span>Manual Capital Entry & Update</span>
              </div>
              <button 
                onClick={() => setShowCapitalModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCapital} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">ENTER CAPITAL AMOUNT (₹)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={manualCapitalInput}
                  onChange={(e) => setManualCapitalInput(e.target.value)}
                  placeholder="e.g. 50000, 100000, 200000, 500000"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3.5 py-2.5 text-base text-white font-bold"
                  required
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Type any custom capital amount you want to simulate
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <span className="text-[10px] text-slate-400 block mb-1.5 uppercase font-semibold">Quick Presets</span>
                <div className="grid grid-cols-4 gap-2">
                  {[50000, 100000, 200000, 500000].map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setManualCapitalInput(String(preset))}
                      className={`px-2 py-1.5 rounded border text-[11px] font-semibold transition-all cursor-pointer ${
                        manualCapitalInput === String(preset)
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-terminal-850 border-terminal-700 text-slate-300 hover:bg-terminal-800'
                      }`}
                    >
                      ₹{(preset / 1000)}k
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-2 pt-2 border-t border-terminal-800/80">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="capitalMode"
                    checked={capitalUpdateMode === 'adjust'}
                    onChange={() => setCapitalUpdateMode('adjust')}
                    className="text-blue-500"
                  />
                  <span>Adjust Capital Balance (Keep current open positions)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="capitalMode"
                    checked={capitalUpdateMode === 'reset'}
                    onChange={() => setCapitalUpdateMode('reset')}
                    className="text-blue-500"
                  />
                  <span className="text-rose-300">Reset Entire Account to this Capital (Clear history)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-terminal-800">
                <button
                  type="button"
                  onClick={() => setShowCapitalModal(false)}
                  className="px-4 py-2 rounded-lg bg-terminal-800 hover:bg-terminal-750 text-slate-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-900/30"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save & Update Capital</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
