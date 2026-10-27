-- ==============================================================================
-- NIFTY ATM ANALYZER - Complete Supabase PostgreSQL Schema & Security Policies
-- Migration: 001_initial_schema.sql
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE (Linked with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'trader' CHECK (role IN ('trader', 'admin', 'analyst')),
    preferred_broker TEXT DEFAULT 'angelone' CHECK (preferred_broker IN ('angelone', 'upstox', 'mock')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. APPLICATION SETTINGS (Per-user UI, charting, indicator defaults)
CREATE TABLE IF NOT EXISTS public.application_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'dim', 'light')),
    default_strike_range INT DEFAULT 10 CHECK (default_strike_range IN (3, 5, 10, 15, 20)),
    default_timeframe TEXT DEFAULT '5m' CHECK (default_timeframe IN ('1m', '3m', '5m', '15m')),
    sound_alerts_enabled BOOLEAN DEFAULT TRUE,
    auto_refresh_seconds INT DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_app_settings UNIQUE (user_id)
);

-- 3. BROKER CONNECTIONS (Encrypted Vault at rest)
-- Note: Raw tokens, API secrets, and passwords MUST BE AES-256-GCM encrypted server-side before storing
CREATE TABLE IF NOT EXISTS public.broker_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('angelone', 'upstox')),
    client_code_masked TEXT NOT NULL,          -- Safe display format: e.g. "ANG***123"
    api_key_masked TEXT NOT NULL,              -- Safe display format: e.g. "key_***98"
    encrypted_payload TEXT NOT NULL,           -- AES-256-GCM cipher payload (IV + ciphertext + authTag)
    is_active BOOLEAN DEFAULT FALSE,
    connection_status TEXT DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'authenticating', 'error', 'token_expired')),
    last_error_message TEXT,
    token_expires_at TIMESTAMPTZ,
    last_connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

-- 4. MARKET SNAPSHOTS (Bounded retention of underlying & option chain metrics)
CREATE TABLE IF NOT EXISTS public.market_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,
    symbol TEXT NOT NULL DEFAULT 'NIFTY 50',
    spot_price NUMERIC(10, 2) NOT NULL,
    day_open NUMERIC(10, 2),
    day_high NUMERIC(10, 2),
    day_low NUMERIC(10, 2),
    prev_close NUMERIC(10, 2),
    price_change NUMERIC(10, 2),
    change_percent NUMERIC(6, 2),
    atm_strike NUMERIC(10, 2) NOT NULL,
    nearest_expiry DATE NOT NULL,
    india_vix NUMERIC(6, 2),
    oi_pcr NUMERIC(6, 3),
    volume_pcr NUMERIC(6, 3),
    max_pain_strike NUMERIC(10, 2),
    exchange_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_time ON public.market_snapshots(symbol, exchange_timestamp DESC);

-- 5. HISTORICAL CANDLES (NIFTY 50 Spot aggregated bars for technical indicators)
CREATE TABLE IF NOT EXISTS public.historical_candles (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL DEFAULT 'NIFTY 50',
    timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '3m', '5m', '15m', '1d')),
    candle_timestamp TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(10, 2) NOT NULL,
    high_price NUMERIC(10, 2) NOT NULL,
    low_price NUMERIC(10, 2) NOT NULL,
    close_price NUMERIC(10, 2) NOT NULL,
    volume BIGINT DEFAULT 0,
    vwap NUMERIC(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_candle_bar UNIQUE (symbol, timeframe, candle_timestamp)
);
CREATE INDEX IF NOT EXISTS idx_historical_candles_query ON public.historical_candles(symbol, timeframe, candle_timestamp DESC);

-- 6. SIGNAL HISTORY (Rule-based analytical ATM signals)
CREATE TABLE IF NOT EXISTS public.signal_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('BULLISH_BIAS', 'BEARISH_BIAS', 'NEUTRAL', 'RANGE_BOUND', 'WATCHLIST_ALERT')),
    timeframe TEXT NOT NULL DEFAULT '5m',
    spot_price NUMERIC(10, 2) NOT NULL,
    atm_strike NUMERIC(10, 2) NOT NULL,
    expiry_date DATE NOT NULL,
    recommended_contract TEXT,
    ce_ltp NUMERIC(10, 2),
    pe_ltp NUMERIC(10, 2),
    ema_fast NUMERIC(10, 2),
    ema_slow NUMERIC(10, 2),
    vwap NUMERIC(10, 2),
    rsi NUMERIC(6, 2),
    macd NUMERIC(8, 2),
    macd_signal NUMERIC(8, 2),
    rules_passed JSONB NOT NULL DEFAULT '[]',
    rules_failed JSONB NOT NULL DEFAULT '[]',
    primary_reason TEXT NOT NULL,
    invalidating_conditions TEXT,
    data_freshness TEXT DEFAULT 'LIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signal_history_created ON public.signal_history(created_at DESC);

-- 7. ALERT SETTINGS (User defined price, ATM, OI thresholds)
CREATE TABLE IF NOT EXISTS public.alert_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_name TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'PRICE_CROSS_ABOVE', 'PRICE_CROSS_BELOW', 
        'ATM_STRIKE_CHANGE', 'PCR_CROSS_ABOVE', 'PCR_CROSS_BELOW',
        'PREMIUM_SPIKE', 'SIGNAL_TRIGGERED', 'FEED_DISCONNECTED'
    )),
    target_value NUMERIC(12, 2),
    strike_price NUMERIC(10, 2),
    option_type TEXT CHECK (option_type IN ('CE', 'PE', NULL)),
    is_enabled BOOLEAN DEFAULT TRUE,
    cooldown_minutes INT DEFAULT 5,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ALERT HISTORY
CREATE TABLE IF NOT EXISTS public.alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES public.alert_settings(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_history_user ON public.alert_history(user_id, created_at DESC);

-- 9. PAPER ACCOUNTS (Virtual funds, no live broker order placement)
CREATE TABLE IF NOT EXISTS public.paper_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL DEFAULT 'Default Virtual Account',
    starting_capital NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
    current_cash NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
    brokerage_per_order NUMERIC(8, 2) DEFAULT 20.00,
    stt_and_taxes_percent NUMERIC(6, 4) DEFAULT 0.0500, -- 0.05%
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_paper_account UNIQUE (user_id)
);

-- 10. PAPER TRADES (Virtual simulated orders & positions)
CREATE TABLE IF NOT EXISTS public.paper_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trading_symbol TEXT NOT NULL,
    instrument_key TEXT NOT NULL,
    underlying TEXT NOT NULL DEFAULT 'NIFTY 50',
    strike_price NUMERIC(10, 2) NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('CE', 'PE')),
    expiry_date DATE NOT NULL,
    lot_size INT NOT NULL CHECK (lot_size > 0),
    num_lots INT NOT NULL CHECK (num_lots > 0),
    total_quantity INT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
    order_status TEXT NOT NULL DEFAULT 'FILLED' CHECK (order_status IN ('OPEN', 'FILLED', 'CLOSED', 'CANCELLED')),
    entry_price NUMERIC(10, 2) NOT NULL,
    exit_price NUMERIC(10, 2),
    stop_loss NUMERIC(10, 2),
    target_price NUMERIC(10, 2),
    realized_pnl NUMERIC(12, 2) DEFAULT 0.00,
    brokerage_paid NUMERIC(10, 2) DEFAULT 0.00,
    entry_time TIMESTAMPTZ DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_status ON public.paper_trades(user_id, order_status);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict user ownership isolation. No unrestricted public read/write access.
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_candles ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view & update their own profile
CREATE POLICY "Users can view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- Application Settings: User isolation
CREATE POLICY "Users manage own app settings" 
    ON public.application_settings FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Broker Connections: User isolation (Read/Write only by owner)
CREATE POLICY "Users manage own broker connections" 
    ON public.broker_connections FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Alert Settings: User isolation
CREATE POLICY "Users manage own alerts" 
    ON public.alert_settings FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Alert History: User isolation
CREATE POLICY "Users view own alert history" 
    ON public.alert_history FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Paper Accounts & Trades: User isolation
CREATE POLICY "Users manage own paper account" 
    ON public.paper_accounts FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own paper trades" 
    ON public.paper_trades FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Market data & Historical candles: Authenticated users can read
CREATE POLICY "Authenticated users view market snapshots" 
    ON public.market_snapshots FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Authenticated users view historical candles" 
    ON public.historical_candles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Authenticated users view signals" 
    ON public.signal_history FOR SELECT 
    TO authenticated 
    USING (true);

-- Trigger to create default profile and paper account when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Trader')
    );
    
    INSERT INTO public.application_settings (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.paper_accounts (user_id, account_name, starting_capital, current_cash)
    VALUES (NEW.id, 'My Paper Portfolio', 100000.00, 100000.00);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if already exists and rebind
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
