# Testing Suite & Verification Guide

This project includes unit and integration tests covering quantitative calculations, ATM strike detection, indicators, signals, paper trading, and AES-256-GCM vault security.

## 1. Running Tests

Run the test suite from the root directory:
```bash
npm run test
```

Or target the server workspace directly:
```bash
npm run test --workspace=@nifty-atm/server
```

## 2. Test Coverage

- **Dynamic ATM Strike**: Verifies nearest listed strike selection across various spot prices.
- **Moneyness Classification**: Tests CE & PE ITM/ATM/OTM classification.
- **PCR Calculations**: Tests Open Interest PCR and Volume PCR formulas.
- **Max Pain**: Validates cumulative writer loss minimization algorithm.
- **Technical Indicators**:
  - Exponential Moving Average (EMA 9, 20, 50) smoothing.
  - Volume-Weighted Average Price (VWAP).
  - Relative Strength Index (RSI 14) with Wilder's smoothing.
  - MACD line, signal line, and histogram.
- **Rule-Based Signal Engine**: Evaluates bullish, bearish, and neutral conditions with transparent rule verification.
- **Paper Trading Engine**: Tests quantity lot-size validation, entry/exit P&L, fee deduction, and win-rate tracking.
- **Security Vault**: Tests AES-256-GCM encryption/decryption at rest and string masking.
