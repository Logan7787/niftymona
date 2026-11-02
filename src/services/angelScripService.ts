// ==============================================================================
// Angel One Scrip Service: Resolves real NFO option tokens & trading symbols
// Pre-indexed for sub-millisecond lookups across all active expiries
// ==============================================================================

import rawContracts from '../data/angelNfoContracts.json';
import { ListedInstrument } from './marketEngine';

export interface AngelContract {
  token: string;
  symbol: string;
  expiry: string; // e.g. "03NOV2026"
  isoExpiry: string; // e.g. "2026-11-03"
  strike: number;
  type: 'CE' | 'PE';
  instrumentType: 'CE' | 'PE';
  lotSize: number;
  tickSize: number;
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const REV_MONTH_MAP: Record<string, string> = {
  '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR', '05': 'MAY', '06': 'JUN',
  '07': 'JUL', '08': 'AUG', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC'
};

export function angelToIsoExpiry(angelExp: string): string {
  if (!angelExp) return '';
  const m = angelExp.toUpperCase().match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!m) return angelExp;
  const day = m[1];
  const mon = MONTH_MAP[m[2]] || '01';
  const year = m[3];
  return `${year}-${mon}-${day}`;
}

export function isoToAngelExpiry(isoExp: string): string {
  if (!isoExp) return '';
  const parts = isoExp.split('-');
  if (parts.length !== 3) return isoExp;
  const [year, month, day] = parts;
  const monStr = REV_MONTH_MAP[month] || 'NOV';
  return `${day}${monStr}${year}`;
}

class AngelScripService {
  private contracts: AngelContract[] = [];
  private tokenMap: Map<string, AngelContract> = new Map();
  private symbolMap: Map<string, AngelContract> = new Map();
  // Key format: `${strike}_${type}_${isoExpiry}`
  private strikeMap: Map<string, AngelContract> = new Map();
  private expiries: string[] = [];

  constructor() {
    this.init();
  }

  private init(): void {
    const rawList = Array.isArray(rawContracts) ? rawContracts : [];
    const expirySet = new Set<string>();

    for (const c of rawList) {
      const isoExp = angelToIsoExpiry(c.expiry);
      const contract: AngelContract = {
        token: String(c.token),
        symbol: String(c.symbol),
        expiry: String(c.expiry),
        isoExpiry: isoExp,
        strike: Number(c.strike),
        type: c.type as 'CE' | 'PE',
        instrumentType: c.type as 'CE' | 'PE',
        lotSize: Number(c.lotSize || 65),
        tickSize: Number(c.tickSize || 0.05),
      };

      this.contracts.push(contract);
      this.tokenMap.set(contract.token, contract);
      this.symbolMap.set(contract.symbol, contract);
      this.strikeMap.set(`${contract.strike}_${contract.type}_${contract.isoExpiry}`, contract);
      this.strikeMap.set(`${contract.strike}_${contract.type}_${contract.expiry}`, contract);

      if (isoExp) {
        expirySet.add(isoExp);
      }
    }

    this.expiries = Array.from(expirySet).sort();
  }

  public getAvailableExpiries(): string[] {
    return this.expiries;
  }

  public getNearestExpiry(): string {
    const today = new Date().toISOString().split('T')[0];
    const upcoming = this.expiries.find(e => e >= today);
    return upcoming || this.expiries[0] || '2026-11-03';
  }

  public getStrikesForExpiry(isoExpiry: string): number[] {
    const exp = isoExpiry.includes('-') ? isoExpiry : angelToIsoExpiry(isoExpiry);
    const strikes = new Set<number>();
    for (const c of this.contracts) {
      if (c.isoExpiry === exp || c.expiry === isoExpiry) {
        strikes.add(c.strike);
      }
    }
    return Array.from(strikes).sort((a, b) => a - b);
  }

  public getContract(strike: number, type: 'CE' | 'PE', isoExpiry?: string): AngelContract | undefined {
    const exp = isoExpiry || this.getNearestExpiry();
    const isoExp = exp.includes('-') ? exp : angelToIsoExpiry(exp);
    return this.strikeMap.get(`${strike}_${type}_${isoExp}`) || this.strikeMap.get(`${strike}_${type}_${exp}`);
  }

  public getContractByToken(token: string): AngelContract | undefined {
    return this.tokenMap.get(token);
  }

  public getContractBySymbol(symbol: string): AngelContract | undefined {
    return this.symbolMap.get(symbol);
  }

  public getAtmTokens(atm: number, isoExpiry?: string, windowCount = 10): string[] {
    const exp = isoExpiry || this.getNearestExpiry();
    const strikes = this.getStrikesForExpiry(exp);
    if (strikes.length === 0) return [];

    // Find closest strike
    let closestStrike = strikes[0];
    let minDiff = Infinity;
    for (const s of strikes) {
      const diff = Math.abs(s - atm);
      if (diff < minDiff) {
        minDiff = diff;
        closestStrike = s;
      }
    }

    const idx = strikes.indexOf(closestStrike);
    const start = Math.max(0, idx - windowCount);
    const end = Math.min(strikes.length, idx + windowCount + 1);
    const selected = strikes.slice(start, end);

    const tokens: string[] = [];
    for (const s of selected) {
      const ce = this.getContract(s, 'CE', exp);
      const pe = this.getContract(s, 'PE', exp);
      if (ce?.token) tokens.push(ce.token);
      if (pe?.token) tokens.push(pe.token);
    }
    return tokens;
  }

  public getListedInstruments(isoExpiry?: string): ListedInstrument[] {
    const exp = isoExpiry || this.getNearestExpiry();
    const isoExp = exp.includes('-') ? exp : angelToIsoExpiry(exp);

    const result: ListedInstrument[] = [
      {
        token: '99926000',
        symbol: 'NIFTY 50',
        name: 'NIFTY',
        expiry: '',
        strike: 0,
        lotSize: 65,
        instrumentType: 'INDEX',
        exchange: 'NSE',
        tickSize: 0.05,
      }
    ];

    for (const c of this.contracts) {
      if (c.isoExpiry === isoExp || c.expiry === exp) {
        result.push({
          token: c.token,
          symbol: c.symbol,
          name: 'NIFTY',
          expiry: c.isoExpiry,
          strike: c.strike,
          lotSize: c.lotSize,
          instrumentType: c.type,
          exchange: 'NFO',
          tickSize: c.tickSize,
        });
      }
    }

    return result;
  }
}

export const angelScripService = new AngelScripService();
