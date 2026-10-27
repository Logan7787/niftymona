// ==============================================================================
// Real-Time Market Data Hook: Streams live ticks, option chain, indicators, & signals
// Subscribes directly to BrokerService with zero server dependencies
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { 
  UnderlyingSnapshot, OptionChainSnapshot, TechnicalIndicatorData, 
  SignalOutput, BrokerProvider, ConnectionStatus 
} from '../types/market.js';
import { brokerService } from '../services/brokerService.js';
import { api } from '../services/api.js';

export function useMarketData() {
  const [underlying, setUnderlying] = useState<UnderlyingSnapshot | null>(() => brokerService.getUnderlyingSnapshot());
  const [optionChain, setOptionChain] = useState<OptionChainSnapshot | null>(() => brokerService.getOptionChainSnapshot(10));
  const [indicators, setIndicators] = useState<TechnicalIndicatorData | null>(() => brokerService.getIndicators());
  const [signal, setSignal] = useState<SignalOutput | null>(() => brokerService.getSignal());
  const [activeProvider, setActiveProvider] = useState<BrokerProvider>(() => brokerService.getActiveProvider());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => brokerService.getConnectionStatus());
  const [statusMessage, setStatusMessage] = useState<string>('Live Market Engine Active');
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [lastTickTime, setLastTickTime] = useState<string>(new Date().toISOString());
  const [strikeRange, setStrikeRange] = useState<number>(10);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');

  useEffect(() => {
    // Subscribe to live broker updates
    const unsubscribe = brokerService.subscribe((data) => {
      setUnderlying(data.underlying);
      setOptionChain(data.optionChain);
      setIndicators(data.indicators);
      setSignal(data.signal);
      setActiveProvider(data.provider);
      setConnectionStatus(data.status);
      if (data.statusMessage) setStatusMessage(data.statusMessage);
      setLatencyMs(data.latencyMs);
      setLastTickTime(data.underlying.lastUpdate);

      if (!selectedExpiry && data.optionChain.selectedExpiry) {
        setSelectedExpiry(data.optionChain.selectedExpiry);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedExpiry]);

  const changeExpiry = useCallback((expiry: string) => {
    setSelectedExpiry(expiry);
    brokerService.setExpiry(expiry);
  }, []);

  const changeStrikeRange = useCallback((range: number) => {
    setStrikeRange(range);
    setOptionChain(brokerService.getOptionChainSnapshot(range));
  }, []);

  const selectBroker = useCallback(async (provider: BrokerProvider) => {
    const res = await api.selectBroker(provider);
    return res;
  }, []);

  const manualRefresh = useCallback(() => {
    setUnderlying(brokerService.getUnderlyingSnapshot());
    setOptionChain(brokerService.getOptionChainSnapshot(strikeRange));
  }, [strikeRange]);

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
    changeExpiry,
    changeStrikeRange,
    selectBroker,
    manualRefresh,
  };
}
