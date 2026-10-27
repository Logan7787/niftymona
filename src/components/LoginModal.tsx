// ==============================================================================
// Terminal Login Modal
// Shown on startup to authenticate quantitative traders
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, User as UserIcon, ArrowRight, Zap, AlertCircle } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('trader_pro');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await login(username, password);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Authentication error.');
    }
  };

  const handleInstantDemo = async () => {
    setError(null);
    setLoading(true);
    await login('demo_trader', 'demo123', true);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-terminal-700 bg-terminal-900/95 p-8 shadow-2xl shadow-blue-500/10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40 mb-4">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white font-mono">
            NIFTY ATM ANALYZER
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Professional Options Market Terminal & Quantitative Engine
          </p>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 font-mono">
              Username
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter trader username"
                className="w-full rounded-lg border border-terminal-700 bg-terminal-850 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 font-mono">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-terminal-700 bg-terminal-850 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 mt-2 cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In to Terminal'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-terminal-700"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-terminal-900 px-2 text-slate-400 font-mono">Or quick access</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleInstantDemo}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-terminal-600 bg-terminal-800/80 hover:bg-terminal-700 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer"
        >
          <Zap className="h-4 w-4 text-emerald-400" />
          <span>Instant Demo Trader (One-Click)</span>
        </button>

        <div className="mt-5 text-center text-[11px] text-slate-500">
          Paper trading mode enabled. Live automated order routing is disabled.
        </div>
      </div>
    </div>
  );
};
