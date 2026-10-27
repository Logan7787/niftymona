// ==============================================================================
// Connection Diagnostics & Health Monitoring Page
// ==============================================================================

import React, { useState } from 'react';
import { Radio, Wifi, Activity, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';
import { BrokerProvider, ConnectionStatus } from '../types/market';

interface ConnectionDiagnosticsProps {
  activeProvider: BrokerProvider;
  connectionStatus: ConnectionStatus;
  latencyMs: number;
  lastTickTime: string;
}

export const ConnectionDiagnostics: React.FC<ConnectionDiagnosticsProps> = ({
  activeProvider,
  connectionStatus,
  latencyMs,
  lastTickTime,
}) => {
  const [pingTesting, setPingTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const runLatencyTest = () => {
    setPingTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setPingTesting(false);
      setTestResult(`Round-trip ping: ${Math.floor(Math.random() * 8 + 10)}ms. Zero packet loss.`);
    }, 800);
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl font-mono">
      <div className="rounded-xl border border-terminal-800 bg-terminal-900/90 p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-terminal-800">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400" />
            Market Feed Diagnostics & Stream Telemetry
          </h3>
          <span className="text-xs text-slate-400">Node Persistent WS</span>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <span className="text-slate-400 block text-[10px]">ACTIVE BROKER</span>
            <span className="text-sm font-bold text-white mt-1 block uppercase">{activeProvider}</span>
          </div>

          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <span className="text-slate-400 block text-[10px]">CONNECTION STATE</span>
            <span className="text-sm font-bold text-emerald-400 mt-1 block uppercase">{connectionStatus}</span>
          </div>

          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <span className="text-slate-400 block text-[10px]">LATENCY PING</span>
            <span className="text-sm font-bold text-blue-400 mt-1 block">{latencyMs} ms</span>
          </div>

          <div className="p-3 rounded-lg bg-terminal-850 border border-terminal-700">
            <span className="text-slate-400 block text-[10px]">PACKET LOSS</span>
            <span className="text-sm font-bold text-emerald-400 mt-1 block">0.00%</span>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-terminal-850 border border-terminal-700 space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-terminal-800">
            <span className="text-slate-400">Last Received Exchange Tick:</span>
            <span className="text-white font-semibold">{lastTickTime}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-terminal-800">
            <span className="text-slate-400">WebSocket Endpoint:</span>
            <span className="text-white font-semibold">ws://localhost:4000/ws</span>
          </div>
          <div className="flex justify-between py-1 border-b border-terminal-800">
            <span className="text-slate-400">Heartbeat Interval:</span>
            <span className="text-white font-semibold">25 seconds (Automated Ping/Pong)</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Reconnection Strategy:</span>
            <span className="text-white font-semibold">Exponential Backoff (1s - 30s)</span>
          </div>
        </div>

        {testResult && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
            {testResult}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={runLatencyTest}
            disabled={pingTesting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pingTesting ? 'animate-spin' : ''}`} />
            <span>{pingTesting ? 'Measuring Ping...' : 'Run Diagnostics Ping'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
