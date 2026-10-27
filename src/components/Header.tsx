// ==============================================================================
// Terminal Header Component
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { 
  Activity, RefreshCw, Settings, Shield, User, LogOut, 
  Wifi, WifiOff, Clock, Sun, Moon 
} from 'lucide-react';
import { BrokerProvider, ConnectionStatus, MarketStatus } from '../types/market';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  marketStatus?: MarketStatus;
  selectedBroker: BrokerProvider;
  connectionStatus: ConnectionStatus;
  lastUpdate: string;
  onRefresh: () => void;
  onOpenSettings: () => void;
  latencyMs?: number;
}

export const Header: React.FC<HeaderProps> = ({
  marketStatus = 'OPEN',
  selectedBroker,
  connectionStatus,
  lastUpdate,
  onRefresh,
  onOpenSettings,
  latencyMs = 12,
}) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [istTime, setIstTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      };
      setIstTime(now.toLocaleTimeString('en-IN', options));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const getStatusBadge = () => {
    switch (marketStatus) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">OPEN</span>;
      case 'PRE-OPEN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">PRE-OPEN</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">CLOSED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-slate-500/15 text-slate-400 border border-slate-500/30">UNKNOWN</span>;
    }
  };

  const getConnBadge = () => {
    if (connectionStatus === 'connected') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="hidden sm:inline">LIVE</span>
          <span className="text-[10px] text-slate-400 font-mono">({latencyMs}ms)</span>
        </div>
      );
    } else if (connectionStatus === 'authenticating') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono">
          <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
          <span>CONNECTING</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1.5 text-xs text-rose-400 font-mono">
          <WifiOff className="h-3 w-3 text-rose-400" />
          <span>DISCONNECTED</span>
        </div>
      );
    }
  };

  return (
    <header className="border-b border-terminal-800 bg-terminal-900/90 backdrop-blur-md px-4 py-2.5 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-4">
        {/* Brand & Market Status */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold tracking-tight text-white">
                NIFTY ATM ANALYZER
              </span>
              {getStatusBadge()}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-400" />
                {istTime || 'Loading IST...'} (IST)
              </span>
            </div>
          </div>
        </div>

        {/* Center / Stats info */}
        <div className="hidden lg:flex items-center gap-4 bg-terminal-850 px-3 py-1.5 rounded-lg border border-terminal-700/60 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">DATA FEED:</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {selectedBroker.toUpperCase()}
            </span>
          </div>
          <div className="h-3 w-px bg-terminal-700"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">STATUS:</span>
            {getConnBadge()}
          </div>
          <div className="h-3 w-px bg-terminal-700"></div>
          <div className="text-slate-400">
            UPDATED: <span className="text-slate-300">{lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--:--:--'}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Day / Dark Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Day Theme (Light Mode)' : 'Switch to Dark Theme'}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-terminal-700 bg-terminal-850 text-xs font-mono font-medium text-slate-700 dark:text-slate-300 hover:border-terminal-600 transition-colors cursor-pointer shadow-sm"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden sm:inline text-amber-300 text-[11px] font-semibold">Day</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-600" />
                <span className="hidden sm:inline text-indigo-700 text-[11px] font-semibold">Dark</span>
              </>
            )}
          </button>

          <button
            onClick={onRefresh}
            title="Manual Feed Refresh"
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-terminal-700 bg-terminal-850 text-slate-700 dark:text-slate-300 hover:text-blue-500 dark:hover:text-white hover:border-terminal-600 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onOpenSettings}
            title="Configure Broker APIs"
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-terminal-700 bg-terminal-850 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-blue-500 dark:hover:text-white hover:border-blue-500/50 transition-colors cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* User Profile Pill */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-terminal-700">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-terminal-850 border border-terminal-700 text-xs font-mono text-slate-300">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-white">{user?.username || 'Trader'}</span>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-terminal-700 bg-terminal-850 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
