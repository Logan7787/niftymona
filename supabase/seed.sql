-- ==============================================================================
-- NIFTY ATM ANALYZER - Development & Testing Seed Data
-- Clearly labeled as SIMULATED / DEMO DATA
-- ==============================================================================

-- Sample mock snapshot
INSERT INTO public.market_snapshots (
    provider, symbol, spot_price, day_open, day_high, day_low, prev_close,
    price_change, change_percent, atm_strike, nearest_expiry, india_vix,
    oi_pcr, volume_pcr, max_pain_strike, exchange_timestamp
) VALUES (
    'SIMULATED_MOCK', 'NIFTY 50', 24425.50, 24350.00, 24480.20, 24320.10, 24380.00,
    45.50, 0.19, 24450.00, CURRENT_DATE + INTERVAL '2 days', 13.45,
    1.125, 0.980, 24400.00, NOW()
);

-- Sample mock analytical signal
INSERT INTO public.signal_history (
    signal_type, timeframe, spot_price, atm_strike, expiry_date,
    recommended_contract, ce_ltp, pe_ltp, ema_fast, ema_slow, vwap, rsi, macd, macd_signal,
    rules_passed, rules_failed, primary_reason, invalidating_conditions, data_freshness
) VALUES (
    'BULLISH_BIAS', '5m', 24425.50, 24450.00, CURRENT_DATE + INTERVAL '2 days',
    'NIFTY 24450 CE', 128.40, 94.20, 24412.30, 24395.10, 24402.50, 58.40, 14.20, 11.50,
    '["Price above VWAP (24425.50 > 24402.50)", "EMA 9 above EMA 20 bullish crossover", "RSI in positive momentum zone (58.40)"]'::jsonb,
    '["CE Volume slightly below 20-period average"]'::jsonb,
    'Sustained hold above VWAP with bullish EMA crossover and positive Call OI build-up at support strikes.',
    'Invalidated if NIFTY spot drops below 24390 or VWAP breaks down.',
    'SIMULATED_TEST_DATA'
);
