// ==============================================================================
// Broker API Settings Page
// Independent provider cards for Angel One & Upstox with AES-256-GCM vault security
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { BrokerProvider } from '../types/market';
import { api } from '../services/api';
import { brokerService } from '../services/brokerService';
import {
  KeyRound, ShieldCheck, Check, AlertCircle, RefreshCw,
  Trash2, ExternalLink, Zap, Lock, Eye, EyeOff, Copy
} from 'lucide-react';

interface BrokerSettingsProps {
  activeProvider: BrokerProvider;
  onSelectBroker: (provider: BrokerProvider) => void;
}

export const BrokerSettings: React.FC<BrokerSettingsProps> = ({ activeProvider, onSelectBroker }) => {
  const [brokerData, setBrokerData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Angel One form
  const [angelApiKey, setAngelApiKey] = useState('');
  const [angelClientCode, setAngelClientCode] = useState('');
  const [angelPassword, setAngelPassword] = useState('');
  const [angelTotp, setAngelTotp] = useState('');
  const [angelJwtToken, setAngelJwtToken] = useState('');
  const [showAngelSecret, setShowAngelSecret] = useState(false);
  const [generatingJwt, setGeneratingJwt] = useState(false);
  const [copiedJwt, setCopiedJwt] = useState(false);
  const [generatedJwtInfo, setGeneratedJwtInfo] = useState<{ jwt: string; feedToken?: string; time: string } | null>(null);

  // Upstox form
  const [upstoxApiKey, setUpstoxApiKey] = useState('');
  const [upstoxApiSecret, setUpstoxApiSecret] = useState('');
  const [upstoxAccessToken, setUpstoxAccessToken] = useState('');
  const [showUpstoxSecret, setShowUpstoxSecret] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await api.getBrokersStatus();
      setBrokerData(data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    const savedAngel = brokerService.getAngelOneCredentials();
    if (savedAngel) {
      if (savedAngel.clientCode && !savedAngel.clientCode.includes('*')) {
        setAngelClientCode(savedAngel.clientCode);
      } else {
        setAngelClientCode('AAAF337345');
      }

      if (savedAngel.apiKey && !savedAngel.apiKey.includes('*')) {
        setAngelApiKey(savedAngel.apiKey);
      } else {
        setAngelApiKey('FegEW9WP');
      }

      if (savedAngel.password) {
        setAngelPassword(savedAngel.password);
      } else {
        setAngelPassword('7787');
      }

      // Pre-fill TOTP only if it's a permanent base32 secret key (not a transient 6-digit OTP)
      if (savedAngel.totp && !/^\d{6}$/.test(savedAngel.totp.trim())) {
        setAngelTotp(savedAngel.totp);
      }
      if (savedAngel.jwtToken) setAngelJwtToken(savedAngel.jwtToken);
    } else {
      setAngelApiKey('FegEW9WP');
      setAngelClientCode('AAAF337345');
      setAngelPassword('7787');
    }
    const savedUpstox = brokerService.getUpstoxCredentials();
    if (savedUpstox) {
      if (savedUpstox.apiKey && savedUpstox.apiKey !== 'upstox_client') setUpstoxApiKey(savedUpstox.apiKey);
      if (savedUpstox.apiSecret) setUpstoxApiSecret(savedUpstox.apiSecret);
      if (savedUpstox.accessToken) setUpstoxAccessToken(savedUpstox.accessToken);
    }
  }, []);

  const handleSaveAngelOne = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const stored = brokerService.getAngelOneCredentials();
      const apiKey = angelApiKey.trim() || stored?.apiKey || '';
      const clientCode = angelClientCode.trim() || stored?.clientCode || '';

      if (!apiKey || !clientCode) {
        setLoading(false);
        setMsg({ type: 'error', text: 'Both SmartAPI Key and Client Code are required.' });
        return;
      }

      const directToken = angelJwtToken.trim();
      const pwd = angelPassword.trim() || stored?.password;
      const totp = angelTotp.trim() || (stored?.totp && !/^\d{6}$/.test(stored.totp.trim()) ? stored.totp : undefined);

      // Validate that the user has provided either direct JWT, or PIN + TOTP, or an active session token
      if (!directToken && (!pwd || !totp) && !stored?.jwtToken) {
        setLoading(false);
        setMsg({
          type: 'error',
          text: 'Please enter your Demat PIN and TOTP (or paste a direct JWT session token) to connect to Angel One.'
        });
        return;
      }

      const res = await api.saveAngelOneCredentials({
        apiKey,
        clientCode,
        password: pwd,
        totp,
        jwtToken: directToken || stored?.jwtToken,
      });
      setLoading(false);
      if (res.success) {
        setMsg({ type: 'success', text: res.message || 'Connected to Angel One SmartAPI Live Feed!' });
        onSelectBroker('angelone');
        fetchStatus();
      } else {
        setMsg({ type: 'error', text: res.message || 'Failed to connect with Angel One credentials' });
        fetchStatus();
      }
    } catch (err: any) {
      setLoading(false);
      setMsg({ type: 'error', text: err.message || 'Server error' });
      fetchStatus();
    }
  };

  const handleGenerateJwtToken = async () => {
    const stored = brokerService.getAngelOneCredentials();
    const key = (angelApiKey.trim() && !angelApiKey.includes('*'))
      ? angelApiKey.trim()
      : (stored?.apiKey && !stored.apiKey.includes('*') ? stored.apiKey : 'FegEW9WP');
    const client = (angelClientCode.trim() && !angelClientCode.includes('*'))
      ? angelClientCode.trim().toUpperCase()
      : (stored?.clientCode && !stored.clientCode.includes('*') ? stored.clientCode.toUpperCase() : 'AAAF337345');
    const pwd = angelPassword.trim() || stored?.password || '7787';
    const totp = angelTotp.trim() || (stored?.totp && !/^\d{6}$/.test(stored.totp.trim()) ? stored.totp : '');

    if (!key || key.includes('*')) {
      setMsg({ type: 'error', text: 'Please enter your full SmartAPI Key (e.g. FegEW9WP).' });
      return;
    }
    if (!client || client.includes('*')) {
      setMsg({ type: 'error', text: 'Please enter your full Client Code (e.g. AAAF337345).' });
      return;
    }
    if (!pwd) {
      setMsg({ type: 'error', text: 'Please enter your 4-digit Account PIN.' });
      return;
    }
    if (!totp) {
      setMsg({ type: 'error', text: 'Please enter your TOTP Key or current 6-digit Authenticator OTP from your phone.' });
      return;
    }

    setGeneratingJwt(true);
    setMsg(null);
    try {
      const res = await api.generateAngelOneJwt({
        apiKey: key,
        clientCode: client,
        password: pwd,
        totp,
      });
      setGeneratingJwt(false);
      if (res.success && res.jwtToken) {
        setAngelJwtToken(res.jwtToken);
        setGeneratedJwtInfo({
          jwt: res.jwtToken,
          feedToken: res.feedToken,
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        });
        setMsg({
          type: 'success',
          text: '✓ Fresh Angel One JWT Session Token generated! Connecting live feed...',
        });

        // Automatically save credentials and connect immediately
        const connectRes = await api.saveAngelOneCredentials({
          apiKey: key,
          clientCode: client,
          password: pwd,
          totp: /^\d{6}$/.test(totp) ? undefined : totp,
          jwtToken: res.jwtToken,
        });

        if (connectRes.success) {
          setMsg({
            type: 'success',
            text: '✓ Connected to Angel One Live Feed with fresh session token!',
          });
          onSelectBroker('angelone');
        } else {
          setMsg({
            type: 'error',
            text: connectRes.message || 'Token generated, but connection probe failed.',
          });
        }
        fetchStatus();
      } else {
        setMsg({
          type: 'error',
          text: res.message || 'Failed to generate JWT token from Angel One. Please check your PIN and OTP.',
        });
      }
    } catch (e: any) {
      setGeneratingJwt(false);
      setMsg({ type: 'error', text: e.message || 'Network error while generating JWT token.' });
    }
  };

  const copyJwtToClipboard = () => {
    if (!angelJwtToken) return;
    navigator.clipboard.writeText(angelJwtToken);
    setCopiedJwt(true);
    setTimeout(() => setCopiedJwt(false), 2000);
  };

  const handleSaveUpstox = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await api.saveUpstoxCredentials({
        apiKey: upstoxApiKey.trim() || 'upstox_client',
        apiSecret: upstoxApiSecret.trim(),
        accessToken: upstoxAccessToken.trim(),
      });
      setLoading(false);
      if (res.success) {
        setMsg({ type: 'success', text: res.message });
        setUpstoxAccessToken('');
        onSelectBroker('upstox');
        fetchStatus();
      } else {
        setMsg({ type: 'error', text: res.message || 'Failed to connect with Upstox credentials' });
      }
    } catch (err: any) {
      setLoading(false);
      setMsg({ type: 'error', text: err.message || 'Server error' });
    }
  };

  const handleDeleteCredentials = async (provider: BrokerProvider) => {
    if (!window.confirm(`Delete encrypted ${provider} credentials from the vault?`)) return;
    await api.deleteBrokerCredentials(provider);
    if (provider === 'angelone') {
      setAngelApiKey('');
      setAngelClientCode('');
      setAngelPassword('');
      setAngelTotp('');
      setAngelJwtToken('');
    }
    fetchStatus();
  };

  const handleSwitchProvider = async (provider: BrokerProvider) => {
    setLoading(true);
    setMsg(null);
    const res = await api.selectBroker(provider);
    if (res && !res.success) {
      setMsg({ type: 'error', text: res.message || `Failed to activate ${provider}` });
    } else if (res && res.success) {
      setMsg({ type: 'success', text: res.message || `Switched to ${provider} market feed.` });
      onSelectBroker(provider);
    }
    setLoading(false);
    fetchStatus();
  };

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Security Vault Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 text-xs text-blue-200">
        <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white block text-sm">Server-Side AES-256-GCM Encrypted Vault</strong>
          <span className="text-slate-300 leading-relaxed mt-0.5 block">
            Broker API credentials, secrets, and session tokens are strictly encrypted at rest before storing. They are never sent back to the frontend in plaintext and are masked in the UI and server log files.
          </span>
        </div>
      </div>

      {/* Global Provider Switcher */}
      <div className="p-4 rounded-xl border border-terminal-800 bg-terminal-900 shadow-md">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 pb-3 border-b border-terminal-800">
          Active Market Data Feed Provider
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {(['mock', 'angelone', 'upstox'] as const).map((prov) => {
            const isActive = activeProvider === prov;
            return (
              <button
                key={prov}
                onClick={() => handleSwitchProvider(prov)}
                disabled={loading}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400'
                    : 'bg-terminal-850 text-slate-300 hover:text-white border border-terminal-700'
                  }`}
              >
                <span>{prov === 'mock' ? 'Simulated Sandbox (Offline Demo)' : prov === 'angelone' ? 'Angel One SmartAPI' : 'Upstox API V3'}</span>
                {isActive && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
          }`}>
          {msg.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Two Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Angel One SmartAPI Card */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Angel One SmartAPI</h3>
              </div>
              <a
                href="https://smartapi.angelone.in/docs"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                Docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Current Vault Status */}
            <div className="mt-3 p-3 rounded-lg bg-terminal-850 border border-terminal-700 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Client Code:</span>
                <span className="text-white font-bold">{brokerData?.providers?.angelone?.clientCode || 'Not configured'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">API Key:</span>
                <span className="text-white font-bold">{brokerData?.providers?.angelone?.apiKey || 'Not configured'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Status:</span>
                <span className={`font-bold uppercase ${brokerData?.providers?.angelone?.status === 'connected'
                    ? 'text-emerald-400'
                    : brokerData?.providers?.angelone?.status === 'authenticating'
                      ? 'text-amber-400'
                      : brokerData?.providers?.angelone?.status === 'token_expired'
                        ? 'text-rose-400 animate-pulse'
                        : brokerData?.providers?.angelone?.status === 'error'
                          ? 'text-rose-400'
                          : 'text-blue-300'
                  }`}>
                  {brokerData?.providers?.angelone?.status === 'token_expired' ? 'SESSION EXPIRED' : (brokerData?.providers?.angelone?.status || 'disconnected')}
                </span>
              </div>
              {brokerData?.providers?.angelone?.errorMessage && (
                <div className="mt-2 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/40 p-2 rounded">
                  ⚠️ {brokerData.providers.angelone.errorMessage}
                </div>
              )}
            </div>

            {/* Quick guidance box */}
            <div className="mt-3 p-2.5 rounded-lg bg-blue-950/30 border border-blue-500/20 text-[11px] text-blue-200 leading-relaxed">
              <strong>Connection Checklist:</strong>
              <div className="mt-1 text-slate-300 space-y-0.5">
                <div>• <strong>SmartAPI Key</strong> &amp; <strong>Client Code</strong></div>
                <div>• <strong>Trading PIN</strong> (e.g. 4-digit PIN)</div>
                <div>• <strong>TOTP Secret Key</strong> from <a href="https://smartapi.angelone.in/enable-totp" target="_blank" rel="noreferrer" className="text-blue-400 underline">enable-totp</a> (for 24/7 auto login) or a current 6-digit OTP</div>
              </div>
            </div>

            {/* Credentials Input Form */}
            <form onSubmit={handleSaveAngelOne} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-300 font-semibold block mb-1">SMARTAPI KEY</label>
                <input
                  type="text"
                  value={angelApiKey}
                  onChange={(e) => setAngelApiKey(e.target.value)}
                  placeholder="e.g. kE3jK8bL9..."
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required={!brokerData?.providers?.angelone?.apiKey || brokerData?.providers?.angelone?.apiKey === 'Not configured'}
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-300 font-semibold block mb-1">CLIENT CODE</label>
                <input
                  type="text"
                  value={angelClientCode}
                  onChange={(e) => setAngelClientCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AAAF337345"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required={!brokerData?.providers?.angelone?.clientCode || brokerData?.providers?.angelone?.clientCode === 'Not configured'}
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-300 font-semibold block mb-1">
                  ACCOUNT PASSWORD / PIN <span className="text-amber-400 font-normal">(Required for Auto-Login)</span>
                </label>
                <input
                  type={showAngelSecret ? 'text' : 'password'}
                  value={angelPassword}
                  onChange={(e) => setAngelPassword(e.target.value)}
                  placeholder="Enter 4-digit demat trading PIN"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-300 font-semibold block mb-1">
                  TOTP SECRET KEY / 6-DIGIT CODE <span className="text-amber-400 font-normal">(Required for Auto-Login)</span>
                </label>
                <input
                  type={showAngelSecret ? 'text' : 'password'}
                  value={angelTotp}
                  onChange={(e) => setAngelTotp(e.target.value)}
                  placeholder="Paste permanent TOTP Secret Key (recommended) or 6-digit OTP"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 <strong>Tip:</strong> Paste your permanent <strong>TOTP Secret Key</strong> from{' '}
                  <a href="https://smartapi.angelone.in/enable-totp" target="_blank" rel="noreferrer" className="text-blue-400 underline">
                    smartapi.angelone.in/enable-totp
                  </a>{' '}
                  so the app auto-generates OTPs and you never have to re-enter codes. If using a 6-digit code, submit before it expires.
                </p>
              </div>

              <div className="pt-2 border-t border-terminal-800">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-slate-300 font-semibold block">
                    DIRECT JWT SESSION TOKEN
                  </label>
                  <button
                    type="button"
                    disabled={generatingJwt}
                    onClick={handleGenerateJwtToken}
                    className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 hover:border-blue-400 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    title="Generate a fresh JWT token directly using the PIN and TOTP above"
                  >
                    {generatingJwt ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                        <span>Generating JWT...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3 text-amber-400 fill-amber-400" />
                        <span>⚡ Generate JWT Token</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    rows={2}
                    value={angelJwtToken}
                    onChange={(e) => setAngelJwtToken(e.target.value)}
                    placeholder="Click '⚡ Generate JWT Token' above, or paste an existing Angel One JWT token"
                    className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 pr-16 text-white font-mono text-[11px] focus:border-blue-500 focus:outline-none"
                  />
                  {angelJwtToken && (
                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAngelJwtToken('');
                          setGeneratedJwtInfo(null);
                        }}
                        className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-[10px] cursor-pointer transition-colors border border-rose-800"
                        title="Clear expired/stale JWT Token"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={copyJwtToClipboard}
                        className="px-2 py-1 rounded bg-terminal-700/90 hover:bg-terminal-600 text-slate-200 hover:text-white text-[10px] flex items-center gap-1 cursor-pointer transition-colors border border-terminal-600 shadow-sm"
                        title="Copy JWT Token to clipboard"
                      >
                        {copiedJwt ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedJwt ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {generatedJwtInfo && (
                  <div className="mt-1.5 p-2 rounded bg-emerald-950/30 border border-emerald-500/30 text-[10px] text-emerald-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-emerald-400" />
                      Fresh Session Token Active ({generatedJwtInfo.time})
                    </span>
                    <span className="font-mono text-[9px] text-slate-400">{generatedJwtInfo.jwt.length} characters</span>
                  </div>
                )}

                <p className="text-[10px] text-slate-400 mt-1">
                  💡 <strong>One-Click Generation:</strong> Fill your PIN &amp; TOTP above, then click <strong>⚡ Generate JWT Token</strong> to fetch and populate your session token instantly without leaving this page.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowAngelSecret(!showAngelSecret)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {showAngelSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showAngelSecret ? 'Hide Secrets' : 'Reveal Input'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold text-white text-xs transition-colors cursor-pointer"
              >
                Save & Connect Angel One SmartAPI
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t border-terminal-800 flex justify-between">
            <button
              onClick={() => handleDeleteCredentials('angelone')}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>

        {/* 2. Upstox API V3 Card */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Upstox API V3</h3>
              </div>
              <a
                href="https://upstox.com/developer/api-documentation/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                Docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Current Vault Status */}
            <div className="mt-3 p-3 rounded-lg bg-terminal-850 border border-terminal-700 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">API Key / Client ID:</span>
                <span className="text-white font-bold">{brokerData?.providers?.upstox?.apiKey || 'Not configured'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Status:</span>
                <span className="text-purple-300 font-bold uppercase">{brokerData?.providers?.upstox?.status || 'disconnected'}</span>
              </div>
            </div>

            {/* Credentials Input Form */}
            <form onSubmit={handleSaveUpstox} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">UPSTOX API KEY / CLIENT ID (OPTIONAL)</label>
                <input
                  type="text"
                  value={upstoxApiKey}
                  onChange={(e) => setUpstoxApiKey(e.target.value)}
                  placeholder="e.g. 5d8e7...-4b2a... (optional)"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">API SECRET (OPTIONAL)</label>
                <input
                  type={showUpstoxSecret ? 'text' : 'password'}
                  value={upstoxApiSecret}
                  onChange={(e) => setUpstoxApiSecret(e.target.value)}
                  placeholder="OAuth Secret"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">V3 FEED ACCESS TOKEN</label>
                <textarea
                  rows={2}
                  value={upstoxAccessToken}
                  onChange={(e) => setUpstoxAccessToken(e.target.value)}
                  placeholder="Paste OAuth access token"
                  className="w-full rounded-lg border border-terminal-700 bg-terminal-850 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowUpstoxSecret(!showUpstoxSecret)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {showUpstoxSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showUpstoxSecret ? 'Hide Secret' : 'Reveal Secret'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 font-bold text-white text-xs transition-colors cursor-pointer"
              >
                Save & Encrypt Upstox Credentials
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t border-terminal-800 flex justify-between">
            <button
              onClick={() => handleDeleteCredentials('upstox')}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
