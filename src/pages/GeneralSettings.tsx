// ==============================================================================
// General Settings Page
// ==============================================================================

import React, { useState } from 'react';
import { Sliders, Volume2, Monitor, RefreshCw, Check, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const GeneralSettings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [defaultRange, setDefaultRange] = useState(10);
  const [defaultTimeframe, setDefaultTimeframe] = useState('5m');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefreshSecs, setAutoRefreshSecs] = useState(2);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl font-mono">
      <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-xl">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white pb-3 border-b border-terminal-800 flex items-center gap-2">
          <Sliders className="h-4 w-4 text-blue-400" />
          Terminal Preferences & Display Settings
        </h3>

        {saved && (
          <div className="mt-4 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span>Preferences saved successfully.</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="text-slate-300 block mb-1.5 font-semibold uppercase">TERMINAL THEME (APPEARANCE)</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border cursor-pointer transition-all ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-600/20 text-white font-bold ring-1 ring-blue-500/50 shadow-md'
                    : 'border-terminal-700 bg-terminal-850 text-slate-400 hover:text-white'
                }`}
              >
                <Moon className="h-4 w-4 text-indigo-400" />
                <span>Dark Theme (Night)</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border cursor-pointer transition-all ${
                  theme === 'light'
                    ? 'border-blue-500 bg-blue-600/20 text-blue-600 dark:text-white font-bold ring-1 ring-blue-500/50 shadow-md'
                    : 'border-terminal-700 bg-terminal-850 text-slate-400 hover:text-slate-700 dark:hover:text-white'
                }`}
              >
                <Sun className="h-4 w-4 text-amber-500" />
                <span>Day Theme (Light)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-300 block mb-1 font-semibold">DEFAULT STRIKE RANGE (WINDOW)</label>
            <select
              value={defaultRange}
              onChange={(e) => setDefaultRange(Number(e.target.value))}
              className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
            >
              <option value="3">±3 Strikes (Compact)</option>
              <option value="5">±5 Strikes (Standard)</option>
              <option value="10">±10 Strikes (Wide)</option>
              <option value="20">±20 Strikes (Full Horizon)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-300 block mb-1 font-semibold">DEFAULT CANDLE TIMEFRAME</label>
            <select
              value={defaultTimeframe}
              onChange={(e) => setDefaultTimeframe(e.target.value)}
              className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
            >
              <option value="1m">1 Minute</option>
              <option value="3m">3 Minutes</option>
              <option value="5m">5 Minutes (Recommended)</option>
              <option value="15m">15 Minutes</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <div>
              <span className="text-white font-semibold block">Audible Sound Alerts</span>
              <span className="text-slate-400 text-[11px]">Play audio ping on signal trigger or strike breakout</span>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-terminal-700 text-blue-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="text-slate-300 block mb-1 font-semibold">POLLING / RECONNECT INTERVAL (SECONDS)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={autoRefreshSecs}
              onChange={(e) => setAutoRefreshSecs(Number(e.target.value))}
              className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold text-white transition-colors cursor-pointer"
          >
            Save Preferences
          </button>
        </form>
      </div>
    </div>
  );
};
