// ==============================================================================
// Persistent WebSocket Market Data Hook
// Streams real-time ticks, option chain, indicators & signals
// ==============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  UnderlyingSnapshot, OptionChainSnapshot, TechnicalIndicatorData, 
  SignalOutput, BrokerProvider, ConnectionStatus, NormalizedMarketTick 
} from '../types/market.js';
import { api } from '../services/api.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';

export function useMarketData() {
  const [underlying, setUnderlying] = useState<UnderlyingSnapshot | null>(null);
  const [optionChain, setOptionChain] = useState<OptionChainSnapshot | null>(null);
  const [indicators, setIndicators] = useState<TechnicalIndicatorData | null>(null);
  const [signal, setSignal] = useState<SignalOutput | null>(null);
  const [activeProvider, setActiveProvider] = useState<BrokerProvider>('mock');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [lastTickTime, setLastTickTime] = useState<string>(new Date().toISOString());
  const [strikeRange, setStrikeRange] = useState<number>(10);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial fetch via REST to ensure instant paint
  const loadInitialRestData = useCallback(async () => {
    try {
      const [snap, chain, ind, sig] = await Promise.allSettled([
        api.getSnapshot(),
        api.getOptionChain(strikeRange, selectedExpiry),
        api.getIndicators(),
        api.getSignals(),
      ]);

      if (snap.status === 'fulfilled') setUnderlying(snap.value);
      if (chain.status === 'fulfilled') {
        setOptionChain(chain.value);
        if (!selectedExpiry && chain.value.selectedExpiry) {
          setSelectedExpiry(chain.value.selectedExpiry);
        }
      }
      if (ind.status === 'fulfilled') setIndicators(ind.value);
      if (sig.status === 'fulfilled') setSignal(sig.value);
    } catch {
      // Continue to WebSocket
    }
  }, [strikeRange, selectedExpiry]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        setStatusMessage('Real-time feed connected.');
        if (selectedExpiry) {
          ws.send(JSON.stringify({ type: 'SET_EXPIRY', expiry: selectedExpiry }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const now = Date.now();

          if (data.type === 'INIT_STATE') {
            if (data.provider) setActiveProvider(data.provider);
            if (data.status) setConnectionStatus(data.status);
            if (data.underlying) setUnderlying(data.underlying);
            if (data.optionChain) setOptionChain(data.optionChain);
            if (data.indicators) setIndicators(data.indicators);
            if (data.signal) setSignal(data.signal);
          } else if (data.type === 'TICK') {
            setLastTickTime(data.tick?.receivedTimestamp || new Date().toISOString());
            if (data.underlying) setUnderlying(data.underlying);
            if (data.signal) setSignal(data.signal);

            // Update tick in existing option chain without full re-render
            setOptionChain(prev => {
              if (!prev || !data.tick) return prev;
              const tick: NormalizedMarketTick = data.tick;
              if (tick.instrumentType === 'INDEX') return prev;

              const updatedRows = prev.rows.map(row => {
                if (row.strike === tick.strike) {
                  if (tick.optionType === 'CE') {
                    return {
                      ...row,
                      ce: {
                        ...row.ce,
                        ltp: tick.ltp,
                        change: tick.priceChange ?? row.ce.change,
                        changePercent: tick.changePercent ?? row.ce.changePercent,
                        volume: tick.volume ?? row.ce.volume,
                        oi: tick.oi ?? row.ce.oi,
                        oiChange: tick.oiChange ?? row.ce.oiChange,
                        bid: tick.bidPrice ?? row.ce.bid,
                        ask: tick.askPrice ?? row.ce.ask,
                        lastUpdate: tick.receivedTimestamp,
                      }
                    };
                  } else if (tick.optionType === 'PE') {
                    return {
                      ...row,
                      pe: {
                        ...row.pe,
                        ltp: tick.ltp,
                        change: tick.priceChange ?? row.pe.change,
                        changePercent: tick.changePercent ?? row.pe.changePercent,
                        volume: tick.volume ?? row.pe.volume,
                        oi: tick.oi ?? row.pe.oi,
                        oiChange: tick.oiChange ?? row.pe.oiChange,
                        bid: tick.bidPrice ?? row.pe.bid,
                        ask: tick.askPrice ?? row.pe.ask,
                        lastUpdate: tick.receivedTimestamp,
                      }
                    };
                  }
                }
                return row;
              });

              return { ...prev, rows: updatedRows, timestamp: tick.receivedTimestamp };
            });
          } else if (data.type === 'OPTION_CHAIN_UPDATE') {
            if (data.chain) setOptionChain(data.chain);
          } else if (data.type === 'BROKER_STATUS') {
            if (data.provider) setActiveProvider(data.provider);
            if (data.status) setConnectionStatus(data.status);
            if (data.message) setStatusMessage(data.message);
          }

          setLatencyMs(Math.max(8, Math.round(Date.now() - now + 12)));
        } catch {
          // Ignore
        }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
        setStatusMessage('WebSocket connection error.');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        setStatusMessage('Market feed disconnected. Reconnecting...');
        // Auto-reconnect with 3-second delay
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };
    } catch {
      // WS error
    }
  }, [selectedExpiry]);

  useEffect(() => {
    loadInitialRestData();
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWebSocket, loadInitialRestData]);

  const manualRefresh = useCallback(() => {
    loadInitialRestData();
  }, [loadInitialRestData]);

  const changeExpiry = useCallback((expiry: string) => {
    setSelectedExpiry(expiry);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_EXPIRY', expiry }));
    }
    api.getOptionChain(strikeRange, expiry).then(setOptionChain);
  }, [strikeRange]);

  const changeStrikeRange = useCallback((range: number) => {
    setStrikeRange(range);
    api.getOptionChain(range, selectedExpiry).then(setOptionChain);
  }, [selectedExpiry]);

  return {
    underlying,
    optionChain,
    indicators,
    signal,
    activeProvider,
    connectionStatus,
    statusMessage,
    latencyMs,
    lastTickTime,
    strikeRange,
    selectedExpiry,
    manualRefresh,
    changeExpiry,
    changeStrikeRange,
  };
}
