// ==============================================================================
// Frontend API Client
// Connects to Node.js backend REST services
// ==============================================================================

import { BrokerProvider, OptionChainSnapshot, UnderlyingSnapshot, TechnicalIndicatorData, SignalOutput, PaperAccountSummary } from '../types/market.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('nifty_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const api = {
  // Auth
  async login(username: string, password: string, isDemo = false) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, isDemo }),
    });
    return res.json();
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  // Market
  async getSnapshot(): Promise<UnderlyingSnapshot> {
    const res = await fetch(`${API_BASE}/market/snapshot`);
    return res.json();
  },

  async getOptionChain(range = 10, expiry?: string): Promise<OptionChainSnapshot> {
    const url = new URL(`${API_BASE}/market/option-chain`);
    url.searchParams.set('range', String(range));
    if (expiry) url.searchParams.set('expiry', expiry);
    const res = await fetch(url.toString());
    return res.json();
  },

  async getIndicators(): Promise<TechnicalIndicatorData> {
    const res = await fetch(`${API_BASE}/market/indicators`);
    return res.json();
  },

  async getSignals(): Promise<SignalOutput> {
    const res = await fetch(`${API_BASE}/market/signals`);
    return res.json();
  },

  // Brokers
  async getBrokersStatus() {
    const res = await fetch(`${API_BASE}/brokers/status`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async selectBroker(provider: BrokerProvider) {
    const res = await fetch(`${API_BASE}/brokers/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ provider }),
    });
    return res.json();
  },

  async saveAngelOneCredentials(creds: { apiKey: string; clientCode: string; password?: string; totp?: string; jwtToken?: string; feedToken?: string }) {
    const res = await fetch(`${API_BASE}/brokers/angelone/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(creds),
    });
    return res.json();
  },

  async saveUpstoxCredentials(creds: { apiKey: string; apiSecret?: string; accessToken: string }) {
    const res = await fetch(`${API_BASE}/brokers/upstox/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(creds),
    });
    return res.json();
  },

  async deleteBrokerCredentials(provider: BrokerProvider) {
    const res = await fetch(`${API_BASE}/brokers/${provider}/credentials`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.json();
  },

  // Paper Trading
  async getPaperAccount(): Promise<PaperAccountSummary> {
    const res = await fetch(`${API_BASE}/paper/account`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async placePaperOrder(order: any) {
    const res = await fetch(`${API_BASE}/paper/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(order),
    });
    return res.json();
  },

  async closePaperPosition(positionId: string, exitPrice: number) {
    const res = await fetch(`${API_BASE}/paper/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ positionId, exitPrice }),
    });
    return res.json();
  },

  async resetPaperAccount(startingCapital = 100000) {
    const res = await fetch(`${API_BASE}/paper/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ startingCapital }),
    });
    return res.json();
  },
};
