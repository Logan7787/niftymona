// ==============================================================================
// Unified Broker Adapter Interface
// ==============================================================================

import { BrokerProvider, ConnectionStatus, NormalizedMarketTick } from '../types/market.js';
import { ListedInstrument } from '../services/InstrumentService.js';

export interface TickCallback {
  (tick: NormalizedMarketTick): void;
}

export interface StatusCallback {
  (status: ConnectionStatus, message?: string): void;
}

export interface IBrokerAdapter {
  readonly provider: BrokerProvider;
  getStatus(): ConnectionStatus;
  connect(credentials?: any): Promise<boolean>;
  disconnect(): Promise<void>;
  subscribe(tokens: string[]): Promise<void>;
  unsubscribe(tokens: string[]): Promise<void>;
  onTick(callback: TickCallback): void;
  onStatusChange(callback: StatusCallback): void;
  fetchInstruments(): Promise<ListedInstrument[]>;
  testConnection(): Promise<{ success: boolean; message: string; details?: any }>;
}
