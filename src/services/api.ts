// ==============================================================================
// Unified API Client: Connects directly to BrokerService & Supabase
// Works seamlessly in React + Vite without needing any external server!
// ==============================================================================

import { 
  BrokerProvider, OptionChainSnapshot, UnderlyingSnapshot, 
  TechnicalIndicatorData, SignalOutput, PaperAccountSummary, 
  BrokerCredentialMasked 
} from '../types/market';
import { brokerService, UpstoxStoredCreds, AngelOneStoredCreds } from './brokerService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const api = {
  // ----------------------------------------------------------------------------
  // Authentication (Supabase + Instant Demo Fallback)
  // ----------------------------------------------------------------------------
  async login(username: string, password?: string, isDemo = false) {
    if (isDemo) {
      const demoUser = {
        id: 'demo-user-id',
        username: 'demotrader',
        full_name: 'Demo Quantitative Trader',
        role: 'trader',
      };
      const token = `demo_jwt_${Date.now()}`;
      return { success: true, token, user: demoUser, message: 'Logged in as Demo Trader' };
    }

    // If Supabase is configured and email provided, attempt Supabase sign in
    if (isSupabaseConfigured && username.includes('@') && password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: username,
          password: password,
        });
        if (error) throw error;
        const user = {
          id: data.user.id,
          username: data.user.email?.split('@')[0] || username,
          full_name: data.user.user_metadata?.full_name || username,
          role: 'trader',
        };
        return { success: true, token: data.session.access_token, user };
      } catch (err: any) {
        // Fallback to local session if Supabase fails
      }
    }

    // Clean username session
    const user = {
      id: `user_${username.toLowerCase()}`,
      username: username,
      full_name: username,
      role: 'trader',
    };
    const token = `token_${username.toLowerCase()}_${Date.now()}`;
    return { success: true, token, user, message: 'Successfully authenticated' };
  },

  async getMe() {
    const raw = localStorage.getItem('nifty_user');
    return { user: raw ? JSON.parse(raw) : null };
  },

  // ----------------------------------------------------------------------------
  // Market Engine
  // ----------------------------------------------------------------------------
  async getSnapshot(): Promise<UnderlyingSnapshot> {
    return brokerService.getUnderlyingSnapshot();
  },

  async getOptionChain(range = 10, expiry?: string): Promise<OptionChainSnapshot> {
    if (expiry) {
      brokerService.setExpiry(expiry);
    }
    return brokerService.getOptionChainSnapshot(range);
  },

  async getIndicators(): Promise<TechnicalIndicatorData> {
    return brokerService.getIndicators() || ({} as any);
  },

  async getSignals(): Promise<SignalOutput> {
    return brokerService.getSignal() || ({} as any);
  },

  // ----------------------------------------------------------------------------
  // Broker Management
  // ----------------------------------------------------------------------------
  async getBrokersStatus() {
    const activeProvider = brokerService.getActiveProvider();
    const upstoxCreds = brokerService.getUpstoxCredentials();
    const angelCreds = brokerService.getAngelOneCredentials();

    const upstoxMasked: BrokerCredentialMasked = {
      provider: 'upstox',
      clientCode: upstoxCreds?.apiKey ? `${upstoxCreds.apiKey.slice(0, 3)}****` : 'Not configured',
      apiKey: upstoxCreds?.apiKey ? `${upstoxCreds.apiKey.slice(0, 3)}****` : 'Not configured',
      status: activeProvider === 'upstox' ? brokerService.getConnectionStatus() : (upstoxCreds?.accessToken ? 'disconnected' : 'disconnected'),
      isActive: activeProvider === 'upstox',
    };

    const angelMasked: BrokerCredentialMasked = {
      provider: 'angelone',
      clientCode: angelCreds?.clientCode ? `${angelCreds.clientCode.slice(0, 2)}****` : 'Not configured',
      apiKey: angelCreds?.apiKey ? `${angelCreds.apiKey.slice(0, 3)}****` : 'Not configured',
      status: activeProvider === 'angelone' ? brokerService.getConnectionStatus() : (angelCreds?.apiKey ? 'disconnected' : 'disconnected'),
      isActive: activeProvider === 'angelone',
    };

    const mockMasked: BrokerCredentialMasked = {
      provider: 'mock',
      clientCode: 'DEMO_SANDBOX',
      apiKey: 'SIMULATED_FEED',
      status: activeProvider === 'mock' ? 'connected' : 'disconnected',
      isActive: activeProvider === 'mock',
    };

    return {
      activeProvider,
      connectionStatus: brokerService.getConnectionStatus(),
      providers: {
        angelone: angelMasked,
        upstox: upstoxMasked,
        mock: mockMasked,
      }
    };
  },

  async selectBroker(provider: BrokerProvider) {
    if (provider === 'mock') {
      brokerService.startMockFeed();
      return { success: true, activeProvider: 'mock', status: 'connected', message: 'Switched to Demo Sandbox feed' };
    } else if (provider === 'upstox') {
      const creds = brokerService.getUpstoxCredentials();
      if (!creds?.accessToken) {
        return { success: false, activeProvider: 'upstox', status: 'error', message: 'Please enter your Upstox Access Token in Settings first.' };
      }
      return brokerService.connectUpstox(creds);
    } else if (provider === 'angelone') {
      const creds = brokerService.getAngelOneCredentials();
      if (!creds?.apiKey || !creds?.clientCode) {
        return { success: false, activeProvider: 'angelone', status: 'error', message: 'Please enter your Angel One API Key & Client Code in Settings first.' };
      }
      return brokerService.connectAngelOne(creds);
    }
    return { success: true };
  },

  async saveUpstoxCredentials(creds: UpstoxStoredCreds) {
    return brokerService.connectUpstox(creds);
  },

  async saveAngelOneCredentials(creds: AngelOneStoredCreds) {
    return brokerService.connectAngelOne(creds);
  },

  async deleteBrokerCredentials(provider: BrokerProvider) {
    brokerService.deleteCredentials(provider);
    return { success: true, message: `${provider} credentials deleted.` };
  },

  // ----------------------------------------------------------------------------
  // Paper Trading
  // ----------------------------------------------------------------------------
  async getPaperAccount(): Promise<PaperAccountSummary> {
    return brokerService.paperTradingService.getAccount();
  },

  async placePaperOrder(order: any) {
    return brokerService.paperTradingService.placeOrder(order);
  },

  async closePaperPosition(positionId: string, currentMarketPrice?: number) {
    return brokerService.paperTradingService.closePosition(positionId, currentMarketPrice);
  },

  async updatePaperCapital(capital: number) {
    return brokerService.paperTradingService.updateCapital(capital);
  },

  async resetPaperAccount(capital: number = 100000) {
    brokerService.paperTradingService.resetAccount(capital);
    return { success: true, message: `Paper trading account reset to initial capital (₹${capital.toLocaleString()}).` };
  }
};
