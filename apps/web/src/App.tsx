// ==============================================================================
// NIFTY ATM ANALYZER - Main Terminal Root Application
// Enforces username login on application open
// ==============================================================================

import React, { useState } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext.js';
import { useMarketData } from './hooks/useMarketData.js';
import { Header } from './components/Header.js';
import { TopMarketCards } from './components/TopMarketCards.js';
import { Navbar, PageId } from './components/Navbar.js';
import { LoginModal } from './components/LoginModal.js';

// Pages
import { Dashboard } from './pages/Dashboard.js';
import { LiveOptionChain } from './pages/LiveOptionChain.js';
import { ATMStrikeAnalysis } from './pages/ATMStrikeAnalysis.js';
import { TechnicalCharts } from './pages/TechnicalCharts.js';
import { SignalsAlerts } from './pages/SignalsAlerts.js';
import { PaperTrading } from './pages/PaperTrading.js';
import { HistoricalAnalysis } from './pages/HistoricalAnalysis.js';
import { BrokerSettings } from './pages/BrokerSettings.js';
import { GeneralSettings } from './pages/GeneralSettings.js';
import { ConnectionDiagnostics } from './pages/ConnectionDiagnostics.js';

function MainTerminal() {
  const { isAuthenticated, isLoading } = useAuth();
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [quickTradeTarget, setQuickTradeTarget] = useState<{
    symbol: string;
    strike: number;
    type: 'CE' | 'PE';
    price: number;
  } | null>(null);

  const market = useMarketData();

  const handleQuickTrade = (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => {
    setQuickTradeTarget({ symbol, strike, type, price });
    setActivePage('paper-trading');
  };

  return (
    <div className="min-h-screen bg-terminal-950 text-slate-100 flex flex-col font-sans">
      {/* 
        Mandatory Username Login Dialog
        Enforces login when opening the application
      */}
      {!isAuthenticated && !isLoading && <LoginModal />}

      {/* Terminal Header */}
      <Header
        marketStatus={market.underlying?.marketStatus}
        selectedBroker={market.activeProvider}
        connectionStatus={market.connectionStatus}
        lastUpdate={market.lastTickTime}
        onRefresh={market.manualRefresh}
        onOpenSettings={() => setActivePage('broker-settings')}
        latencyMs={market.latencyMs}
      />

      {/* Top Spot Overview & ATM Cards */}
      <TopMarketCards
        underlying={market.underlying}
        onSelectExpiry={market.changeExpiry}
      />

      {/* Module Navigation Tabs */}
      <Navbar
        activePage={activePage}
        onSelectPage={setActivePage}
      />

      {/* Active Page View */}
      <main className="flex-1 pb-12">
        {activePage === 'dashboard' && (
          <Dashboard
            underlying={market.underlying}
            optionChain={market.optionChain}
            indicators={market.indicators}
            signal={market.signal}
            onNavigateToChain={() => setActivePage('option-chain')}
            onNavigateToSignals={() => setActivePage('signals')}
            onQuickTrade={handleQuickTrade}
          />
        )}

        {activePage === 'option-chain' && (
          <LiveOptionChain
            optionChain={market.optionChain}
            selectedExpiry={market.selectedExpiry}
            strikeRange={market.strikeRange}
            onSelectExpiry={market.changeExpiry}
            onSelectStrikeRange={market.changeStrikeRange}
            onTradeClick={handleQuickTrade}
          />
        )}

        {activePage === 'atm-analysis' && (
          <ATMStrikeAnalysis
            underlying={market.underlying}
            optionChain={market.optionChain}
            onTradeClick={handleQuickTrade}
          />
        )}

        {activePage === 'charts' && (
          <TechnicalCharts
            indicators={market.indicators}
            underlying={market.underlying}
          />
        )}

        {activePage === 'signals' && (
          <SignalsAlerts
            signal={market.signal}
            optionChain={market.optionChain}
            onQuickTrade={handleQuickTrade}
          />
        )}

        {activePage === 'paper-trading' && (
          <PaperTrading
            initialTradeTarget={quickTradeTarget}
            onClearTradeTarget={() => setQuickTradeTarget(null)}
          />
        )}

        {activePage === 'historical' && (
          <HistoricalAnalysis
            underlying={market.underlying}
            indicators={market.indicators}
          />
        )}

        {activePage === 'broker-settings' && (
          <BrokerSettings
            activeProvider={market.activeProvider}
            onSelectBroker={(p) => market.activeProvider}
          />
        )}

        {activePage === 'general-settings' && (
          <GeneralSettings />
        )}

        {activePage === 'diagnostics' && (
          <ConnectionDiagnostics
            activeProvider={market.activeProvider}
            connectionStatus={market.connectionStatus}
            latencyMs={market.latencyMs}
            lastTickTime={market.lastTickTime}
          />
        )}
      </main>

      {/* Bottom Global Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-6 border-t border-terminal-800 bg-terminal-900/95 px-4 flex items-center justify-between text-[11px] font-mono text-slate-400 z-30">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            FEED: {market.activeProvider.toUpperCase()}
          </span>
          <span>|</span>
          <span>ATM: {market.underlying?.atmStrike || '24,450'}</span>
          <span>|</span>
          <span>EXPIRY: {market.underlying?.nearestExpiry || '2026-10-29'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">PAPER TRADING ONLY - AUTOMATIC LIVE ORDER PLACEMENT DISABLED</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainTerminal />
    </AuthProvider>
  );
}
