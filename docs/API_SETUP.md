# Broker API Setup Guide

This guide details how to configure both supported broker integrations: **Angel One SmartAPI** and **Upstox API V3**.

---

## 1. Angel One SmartAPI

### Prerequisites:
1. Angel One Demat / Trading Account.
2. Register an app on the [Angel One SmartAPI Developer Portal](https://smartapi.angelone.in/).
3. Set app redirect URL to `http://localhost:4000/api/brokers/angelone/callback`.

### Required Configuration Fields:
- **API Key**: The API Key generated from SmartAPI developer console.
- **Client Code**: Your 6-character Angel One Client ID (e.g., `A123456`).
- **Account Password**: Used for session generation.
- **TOTP Secret / Code**: Enabled via Google Authenticator or manual QR key.

### Authentication Flow:
1. Application sends `POST /rest/auth/angelbroking/user/v1/loginByPassword` with client code, password, and TOTP.
2. SmartAPI responds with `jwtToken`, `feedToken`, and `refreshToken`.
3. Application establishes Smart Stream WebSocket connection using `feedToken` and `apiKey`.
4. The Scrip Master (`OpenAPIScripMaster.json`) is retrieved to obtain token mappings for `NIFTY 50` spot and weekly options contracts.

---

## 2. Upstox API V3

### Prerequisites:
1. Upstox Trading Account.
2. Create an App on [Upstox Developer Console](https://upstox.com/developer/).
3. Note your **API Key** (Client ID) and **API Secret**.

### Required Configuration Fields:
- **API Key / Client ID**: From Upstox developer console.
- **API Secret**: Client secret.
- **Access Token**: OAuth access token.

### Authentication & WebSocket V3 Feed:
1. Make a request to `GET https://api.upstox.com/v3/feed/market-data-feed/authorize` with `Bearer <accessToken>`.
2. Upstox returns a signed, authorized WebSocket redirect URI.
3. The server connects to the WebSocket stream and sends the subscription payload:
```json
{
  "guid": "sub_1",
  "method": "sub",
  "data": {
    "mode": "full",
    "instrumentKeys": ["NSE_INDEX|Nifty 50", "NSE_FO|..."]
  }
}
```

---

## 3. High-Fidelity Simulated Sandbox Mode

When live credentials are not provided, the terminal automatically runs the **Mock Market Adapter**:
- Continuous live NIFTY 50 ticks with random walk and volume fluctuations.
- Complete option chain with realistic Black-Scholes premium estimation and Greeks.
- Banner visibly alerts users: `SIMULATED DEMO FEED ACTIVE (PAPER TRADING ONLY)`.
