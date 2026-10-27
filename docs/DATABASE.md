# Database Schema & Security Design: Supabase PostgreSQL

All migrations are located in `supabase/migrations/001_initial_schema.sql`.

## 1. Tables Overview

| Table | Description | RLS Policy |
| :--- | :--- | :--- |
| `profiles` | User profile linked to `auth.users` | Owner select/update |
| `application_settings` | User UI preferences, default range, timeframe | Owner all |
| `broker_connections` | Encrypted AES-256-GCM broker vault payload | Owner all |
| `market_snapshots` | Historical snapshots of spot, ATM strike, PCR | Authenticated read |
| `historical_candles` | Intraday OHLCV bars for technical indicators | Authenticated read |
| `signal_history` | Quantitative rule-based signals and explanations | Authenticated read |
| `alert_settings` | Configurable user price and PCR threshold alerts | Owner all |
| `alert_history` | Notification logs and triggered alerts | Owner all |
| `paper_accounts` | Virtual portfolio balance, capital, and P&L metrics | Owner all |
| `paper_trades` | Simulated buy/sell positions, entry/exit prices, fees | Owner all |

## 2. Row Level Security (RLS)

Strict ownership checks ensure users can never access or modify another trader's positions or broker keys:
```sql
CREATE POLICY "Users manage own broker connections" 
    ON public.broker_connections FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);
```

## 3. High-Volume Tick Data Strategy

Tick-by-tick market data is **not** written directly to PostgreSQL to prevent excessive database I/O and storage costs. Instead, incoming ticks are aggregated in the server's in-memory ring buffer into 1m/3m/5m/15m candlestick bars, and written in periodic batches.
