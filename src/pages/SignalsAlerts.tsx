// ==============================================================================
// Signals and Alerts Engine Page
// Transparent rule checklists, invalidation criteria, and alert rules manager
// ==============================================================================

import React, { useState } from 'react';
import { SignalOutput, OptionChainSnapshot } from '../types/market';
import { 
  Bell, BellRing, Compass, CheckCircle2, XCircle, AlertTriangle, 
  ShieldCheck, Zap, Plus, Trash2, Sliders 
} from 'lucide-react';

interface SignalsAlertsProps {
  signal: SignalOutput | null;
  optionChain: OptionChainSnapshot | null;
  onQuickTrade: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
}

interface AlertItem {
  id: string;
  name: string;
  condition: string;
  target: number;
  isActive: boolean;
}

export const SignalsAlerts: React.FC<SignalsAlertsProps> = ({ signal, optionChain, onQuickTrade }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([
    { id: '1', name: 'NIFTY Spot Breakout', condition: 'Crosses Above', target: 24500, isActive: true },
    { id: '2', name: 'ATM Strike Shift Alert', condition: 'Strike changes', target: 24500, isActive: true },
    { id: '3', name: 'Heavy Call Writing Barrier', condition: 'OI PCR drops below', target: 0.85, isActive: true },
  ]);

  const [newAlertName, setNewAlertName] = useState('');
  const [newAlertTarget, setNewAlertTarget] = useState('24500');

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlertName.trim()) return;
    setAlerts([
      ...alerts,
      {
        id: String(Date.now()),
        name: newAlertName,
        condition: 'Price Crosses Above',
        target: Number(newAlertTarget) || 24500,
        isActive: true,
      }
    ]);
    setNewAlertName('');
  };

  const toggleAlert = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
  };

  const deleteAlert = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Active Quantitative Signal Card */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900/95 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-terminal-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-blue-400" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Current Rule-Based Market Signal
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Evaluated strictly from verified indicators, spot VWAP, and active option chain metrics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${
              signal?.direction === 'BULLISH_BIAS'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : signal?.direction === 'BEARISH_BIAS'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {signal?.direction?.replace('_', ' ') || 'NEUTRAL'}
            </span>
            <span className="text-[11px] text-slate-400">
              {signal?.timestamp ? new Date(signal.timestamp).toLocaleTimeString() : '--:--:--'}
            </span>
          </div>
        </div>

        {/* Signal Key Parameters */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-terminal-850 p-3 rounded-lg border border-terminal-700/80">
            <span className="text-slate-400 block text-[10px]">SUGGESTED INSTRUMENT</span>
            <span className="text-sm font-bold text-white mt-0.5 block">{signal?.suggestedContract || 'N/A'}</span>
            <span className="text-emerald-400 text-[11px]">LTP: ₹{signal?.contractLtp?.toFixed(2) || '0.00'}</span>
          </div>

          <div className="bg-terminal-850 p-3 rounded-lg border border-terminal-700/80">
            <span className="text-slate-400 block text-[10px]">TARGET & STOP-LOSS</span>
            <span className="text-sm font-bold text-emerald-400 mt-0.5 block">Target: ₹{signal?.targetPrice?.toFixed(2) || '0.00'}</span>
            <span className="text-rose-400 text-[11px]">SL: ₹{signal?.stopLossPrice?.toFixed(2) || '0.00'}</span>
          </div>

          <div className="bg-terminal-850 p-3 rounded-lg border border-terminal-700/80">
            <span className="text-slate-400 block text-[10px]">RISK / REWARD RATIO</span>
            <span className="text-sm font-bold text-blue-400 mt-0.5 block">{signal?.riskRewardRatio || '1:1.75'}</span>
            <span className="text-slate-400 text-[11px]">Calculated offset</span>
          </div>

          <div className="bg-terminal-850 p-3 rounded-lg border border-terminal-700/80 flex flex-col justify-center">
            <button
              onClick={() => onQuickTrade(
                signal?.suggestedContract || 'NIFTY 24450 CE',
                signal?.atmStrike || 24450,
                signal?.direction === 'BEARISH_BIAS' ? 'PE' : 'CE',
                signal?.contractLtp || 100
              )}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold text-white text-xs shadow-md transition-colors cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Paper Trade Signal</span>
            </button>
          </div>
        </div>

        {/* Primary Rationale & Invalidating Conditions */}
        <div className="mt-4 space-y-3">
          <div className="p-3.5 rounded-lg bg-terminal-850/70 border border-terminal-700">
            <div className="text-xs font-bold text-slate-300">PRIMARY ANALYTICAL RATIONALE:</div>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              {signal?.primaryReason || 'Spot holding above VWAP with positive Call/Put open interest balance.'}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-rose-950/15 border border-rose-500/30">
            <div className="text-xs font-bold text-rose-300">INVALIDATING CONDITIONS:</div>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              {signal?.invalidatingConditions || 'Invalidated if spot closes below intraday VWAP.'}
            </p>
          </div>
        </div>

        {/* Rules Passed & Failed Checklist */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rules Passed */}
          <div className="p-3 rounded-lg bg-emerald-950/10 border border-emerald-500/30">
            <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>RULES PASSED ({signal?.rulesPassed?.length || 0})</span>
            </div>
            <div className="space-y-2">
              {signal?.rulesPassed?.map((rule, idx) => (
                <div key={idx} className="text-xs border-b border-terminal-800/80 pb-1.5 last:border-0">
                  <div className="font-semibold text-white">{rule.name}</div>
                  <div className="text-[11px] text-slate-400">{rule.actualValue}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rules Failed */}
          <div className="p-3 rounded-lg bg-rose-950/10 border border-rose-500/30">
            <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 mb-2">
              <XCircle className="h-4 w-4" />
              <span>RULES FAILED / INHIBITED ({signal?.rulesFailed?.length || 0})</span>
            </div>
            <div className="space-y-2">
              {signal?.rulesFailed?.map((rule, idx) => (
                <div key={idx} className="text-xs border-b border-terminal-800/80 pb-1.5 last:border-0">
                  <div className="font-semibold text-slate-300">{rule.name}</div>
                  <div className="text-[11px] text-slate-400">{rule.actualValue}</div>
                </div>
              ))}
              {(!signal?.rulesFailed || signal.rulesFailed.length === 0) && (
                <div className="text-xs text-slate-500 italic">No rules failed. Confluence satisfied.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Configurable Alerts Manager */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              In-App Threshold & Strike Alerts
            </h3>
          </div>
          <span className="text-xs text-slate-400">{alerts.filter(a => a.isActive).length} Active</span>
        </div>

        {/* Add alert form */}
        <form onSubmit={handleAddAlert} className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={newAlertName}
            onChange={(e) => setNewAlertName(e.target.value)}
            placeholder="Alert name (e.g., NIFTY Breakout)"
            className="flex-1 min-w-[200px] rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="number"
            value={newAlertTarget}
            onChange={(e) => setNewAlertTarget(e.target.value)}
            placeholder="Target price / PCR"
            className="w-32 rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Alert</span>
          </button>
        </form>

        {/* Active Alerts List */}
        <div className="mt-4 space-y-2">
          {alerts.map((alert) => (
            <div 
              key={alert.id}
              className="flex items-center justify-between p-3 rounded-lg bg-terminal-850 border border-terminal-700/80 text-xs"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={alert.isActive}
                  onChange={() => toggleAlert(alert.id)}
                  className="rounded border-terminal-700 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                />
                <div>
                  <span className={`font-semibold ${alert.isActive ? 'text-white' : 'text-slate-500 line-through'}`}>
                    {alert.name}
                  </span>
                  <div className="text-[11px] text-slate-400">
                    {alert.condition}: {alert.target}
                  </div>
                </div>
              </div>

              <button
                onClick={() => deleteAlert(alert.id)}
                className="text-slate-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
