# Architecture & System Design: NIFTY 50 ATM Analyzer

## 1. High-Level System Architecture

```
[ NSE / NFO Exchange ]
          ▲
          │ Live Market Feeds (WebSockets & REST)
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend Node.js Service                   │
│                                                             │
│   ┌───────────────────────────────────────────────────────┐ │
│   │                 Broker Adapter Layer                  │ │
│   │  - Angel One SmartAPI (Smart Stream WS + ScripMaster) │ │
│   │  - Upstox API V3 (Market Data Feed V3 Protobuf WS)    │ │
│   │  - Mock Realistic Provider (Offline / Development)    │ │
│   └───────────────────────────┬───────────────────────────┘ │
│                               │                             │
│   ┌───────────────────────────▼───────────────────────────┐ │
│   │              MarketDataService (Hub)                  │ │
│   │  - Normalization to NormalizedMarketTick              │ │
│   │  - Dynamic ATM Strike Calculation                     │ │
│   │  - Synchronized Option Chain Aggregator (CE & PE)     │ │
│   │  - Bounded In-Memory Ring Buffer Caching              │ │
│   └───────────────┬───────────────────────┬───────────────┘ │
│                   │                       │                 │
│   ┌───────────────▼───────────┐   ┌───────▼───────────────┐ │
│   │     IndicatorService      │   │  PaperTradingService  │ │
│   │  - EMA 9 / 20 / 50        │   │  - Simulated Orders   │ │
│   │  - Intraday VWAP          │   │  - Lot Size Validation│ │
│   │  - Wilder's RSI 14        │   │  - Real-time MTM P&L  │ │
│   │  - MACD (12, 26, 9)       │   │  - SL/Target Triggers │ │
│   │  - ATR 14 & Classic S&R   │   │  - Zero Live Orders   │ │
│   └───────────────┬───────────┘   └───────────────────────┘ │
│                   │                                         │
│   ┌───────────────▼───────────┐   ┌───────────────────────┐ │
│   │       SignalService       │   │ AES-256-GCM Vault     │ │
│   │  - Multi-Factor Rules     │   │ - Server Encryption   │ │
│   │  - Clear Rationale        │   │ - Redacted In Logs    │ │
│   │  - Invalidation Criteria  │   │ - Masked In UI        │ │
│   └───────────────┬───────────┘   └───────────────────────┘ │
│                   │                                         │
│   ┌───────────────▼───────────────────────────────────────┐ │
│   │           Persistent WebSocket Hub (/ws)              │ │
│   │  - Broadcasts ticks & option chains to browsers       │ │
│   └───────────────────────────┬───────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────┘
                                │ JSON Over Persistent WS
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                 Frontend React + Vite App                   │
│                                                             │
│  - Mandatory Username Login Dialog on Startup               │
│  - 10 Dedicated Pages (Dashboard, Option Chain, Charts...)  │
│  - High-Contrast Terminal Dark Theme                        │
│  - Dynamic ATM Strike & Moneyness Visual Styling            │
│  - TradingView Lightweight Candlestick Charts               │
└─────────────────────────────────────────────────────────────┘
```

## 2. Dynamic ATM Strike Calculation

The ATM strike is calculated dynamically from the selected broker's current instrument master:
```typescript
public static calculateATMStrike(spotPrice: number, availableStrikes: number[]): number {
  const sorted = [...new Set(availableStrikes)].sort((a, b) => a - b);
  let nearestStrike = sorted[0];
  let minDistance = Math.abs(spotPrice - nearestStrike);
  for (let i = 1; i < sorted.length; i++) {
    const dist = Math.abs(spotPrice - sorted[i]);
    if (dist < minDistance) {
      minDistance = dist;
      nearestStrike = sorted[i];
    }
  }
  return nearestStrike;
}
```

## 3. Option Chain Normalization & Greeks

Every row synchronizes Call (CE) and Put (PE) for the same listed strike:
- **CE Moneyness**: `strike < ATM` is ITM, `strike == ATM` is ATM, `strike > ATM` is OTM
- **PE Moneyness**: `strike > ATM` is ITM, `strike == ATM` is ATM, `strike < ATM` is OTM
- **OI PCR**: Total Put OI / Total Call OI
- **Volume PCR**: Total Put Volume / Total Call Volume
- **Max Pain**: The strike where cumulative option writer payout is minimized.

## 4. API Key Security & Credential Vault

Credentials are encrypted server-side with AES-256-GCM using `BROKER_ENCRYPTION_KEY`. Raw tokens never leave the server or appear in frontend state or network responses.
