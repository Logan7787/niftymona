# NIFTY 50 ATM Strike Analysis & Live Market Monitoring Web Application

A production-minded, high-frequency quantitative options terminal and market monitoring platform for the **NIFTY 50** index. Dynamically identifies at-the-money (ATM) strikes, synchronizes Call and Put option chains, calculates quantitative technical indicators, evaluates rule-based trading signals, and provides an isolated virtual paper-trading engine.

---

## Key Features

1. **Mandatory Username Login on Startup**: Interactive login dialog prompting user credentials or instant one-click demo trader access.
2. **Dynamic ATM Strike Calculation**: Evaluates the nearest valid listed strike dynamically without hardcoded strike intervals.
3. **Synchronized Option Chain Table**: Call and Put metrics aligned side-by-side with ATM highlight, ITM/OTM color differentiation, Greeks/IV toggles, sortable columns, and horizontal scroll.
4. **Dual Broker API Integrations**:
   - **Angel One SmartAPI**: Smart Stream WebSocket + Scrip Master parsing.
   - **Upstox API V3**: Market Data Feed V3 Protobuf WebSocket + OAuth authorization.
   - **Simulated Demo Sandbox**: Continuous high-fidelity ticks for offline testing.
5. **API Key Security Vault**: AES-256-GCM encryption at rest; raw keys are never exposed in frontend bundles, logs, or API responses.
6. **Technical Analysis Engine**: EMA 9, EMA 20, EMA 50, intraday VWAP, Wilder's smoothed RSI 14, MACD (12, 26, 9), ATR 14, opening range breakout, and pivot support/resistance.
7. **Rule-Based ATM Signal Engine**: Transparent evaluation of multi-factor rules with explicit checklist of passed/failed criteria, primary rationale, and invalidating conditions.
8. **Isolated Paper Trading Module**: Simulated virtual buy/sell execution with contract lot size validation, mark-to-market live P&L, stop-loss/target triggers, and fee models (Zero live order placement).
9. **10 Complete Terminal Modules**:
   - Dashboard
   - Live Option Chain
   - ATM Strike Analysis
   - Technical Charts (TradingView Lightweight Charts)
   - Signals & Alerts
   - Paper Trading
   - Historical Analysis
   - Broker API Settings
   - General Settings
   - Connection Diagnostics

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests
```bash
npm run test
```

### 3. Start Development Servers
Run both backend and frontend concurrently:
```bash
# Terminal 1: Backend Server (Port 4000)
npm run dev:server

# Terminal 2: Frontend Web App (Port 5173)
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Project Structure

```
niftymona/
├── apps/
│   ├── web/                     # React + Vite + TypeScript + Tailwind CSS
│   │   ├── src/
│   │   │   ├── components/      # Header, TopCards, Navbar, LoginModal
│   │   │   ├── pages/           # 10 Terminal Views
│   │   │   ├── hooks/           # useMarketData persistent WS hook
│   │   │   ├── context/         # AuthContext
│   │   │   └── types/           # Market data models
│   └── server/                  # Node.js + Express + TypeScript + WebSockets
│       ├── src/
│       │   ├── providers/       # Angel One, Upstox, and Mock Adapters
│       │   ├── services/        # MarketDataService, InstrumentService
│       │   ├── indicators/      # EMA, VWAP, RSI, MACD, ATR
│       │   ├── signals/         # Rule-based Signal Engine
│       │   ├── paper-trading/   # Virtual order execution & P&L
│       │   ├── security/        # AES-256-GCM Vault
│       │   └── __tests__/       # Quantitative engine test suite
├── supabase/
│   ├── migrations/              # 001_initial_schema.sql (10 tables with RLS)
│   └── seed.sql                 # Development seed data
├── docs/                        # Complete architecture & API docs
├── .env.example                 # Environment configuration template
└── README.md
```

---

## License
MIT License
