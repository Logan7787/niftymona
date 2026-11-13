// ==============================================================================
// Angel One Scrip Service: Resolves real NFO & BFO option tokens & trading symbols
// Pre-indexed for sub-millisecond lookups across all active expiries for:
// - NIFTY 50
// - BANK NIFTY
// - BSE SENSEX
// - NIFTY MIDCAP SELECT (MIDCPNIFTY)
// ==============================================================================

import rawContracts from '../data/angelMultiIndexContracts.json';
import { ListedInstrument } from './marketEngine';

export interface AngelContract {
  token: string;
  symbol: string;
  index: string; // 'NIFTY' | 'BANKNIFTY' | 'SENSEX' | 'MIDCPNIFTY'
  exchange: 'NFO' | 'BFO';
  expiry: string; // e.g. "23NOV2026"
  isoExpiry: string; // e.g. "2026-11-23"
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
  // Key format: `${index}_${strike}_${type}_${isoExpiry}` and `${strike}_${type}_${isoExpiry}`
  private strikeMap: Map<string, AngelContract> = new Map();
  private expiriesByIndex: Map<string, string[]> = new Map();

  constructor() {
    this.init();
  }

  private init(): void {
    const rawList = Array.isArray(rawContracts) ? rawContracts : [];
    const expirySetByIndex = new Map<string, Set<string>>();

    for (const c of rawList) {
      const isoExp = angelToIsoExpiry(c.expiry);
      const contract: AngelContract = {
        token: String(c.token),
        symbol: String(c.symbol),
        index: (c as any).index || 'NIFTY',
        exchange: ((c as any).exchange === 'BFO' ? 'BFO' : 'NFO'),
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

      const idxKey = contract.index;
      // Index-prefixed keys
      this.strikeMap.set(`${idxKey}_${contract.strike}_${contract.type}_${contract.isoExpiry}`, contract);
      this.strikeMap.set(`${idxKey}_${contract.strike}_${contract.type}_${contract.expiry}`, contract);
      this.strikeMap.set(`${idxKey}_${contract.strike}_${contract.type}`, contract);

      // Default fallback keys (for NIFTY backward compatibility)
      if (idxKey === 'NIFTY') {
        this.strikeMap.set(`${contract.strike}_${contract.type}_${contract.isoExpiry}`, contract);
        this.strikeMap.set(`${contract.strike}_${contract.type}_${contract.expiry}`, contract);
      }

      if (isoExp) {
        if (!expirySetByIndex.has(idxKey)) {
          expirySetByIndex.set(idxKey, new Set<string>());
        }
        expirySetByIndex.get(idxKey)!.add(isoExp);
      }
    }

    for (const [idx, set] of expirySetByIndex.entries()) {
      this.expiriesByIndex.set(idx, Array.from(set).sort());
    }
  }

  public getAvailableExpiries(index = 'NIFTY'): string[] {
    return this.expiriesByIndex.get(index) || this.expiriesByIndex.get('NIFTY') || [];
  }

  public getNearestExpiry(index = 'NIFTY'): string {
    const list = this.getAvailableExpiries(index);
    const today = new Date().toISOString().split('T')[0];
    const upcoming = list.find(e => e >= today);
    return upcoming || list[0] || (index === 'SENSEX' ? '2026-11-19' : '2026-11-23');
  }

  public getStrikesForExpiry(isoExpiry: string, index = 'NIFTY'): number[] {
    const exp = isoExpiry.includes('-') ? isoExpiry : angelToIsoExpiry(isoExpiry);
    const strikes = new Set<number>();
    for (const c of this.contracts) {
      if (c.index === index && (c.isoExpiry === exp || c.expiry === isoExpiry)) {
        strikes.add(c.strike);
      }
    }
    return Array.from(strikes).sort((a, b) => a - b);
  }

  public getContract(strike: number, type: 'CE' | 'PE', isoExpiry?: string, index?: string): AngelContract | undefined {
    const idx = index || 'NIFTY';
    const exp = isoExpiry || this.getNearestExpiry(idx);
    const isoExp = exp.includes('-') ? exp : angelToIsoExpiry(exp);

    return (
      this.strikeMap.get(`${idx}_${strike}_${type}_${isoExp}`) ||
      this.strikeMap.get(`${idx}_${strike}_${type}_${exp}`) ||
      this.strikeMap.get(`${idx}_${strike}_${type}`) ||
      this.strikeMap.get(`${strike}_${type}_${isoExp}`) ||
      this.strikeMap.get(`${strike}_${type}_${exp}`)
    );
  }

  public getContractByToken(token: string): AngelContract | undefined {
    return this.tokenMap.get(token);
  }

  public getContractBySymbol(symbol: string): AngelContract | undefined {
    return this.symbolMap.get(symbol);
  }

  /**
   * Retrieves ATM window contract tokens for a specific index
   */
  public getAtmTokensForIndex(
    index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX' | 'MIDCPNIFTY',
    atm: number,
    isoExpiry?: string,
    windowCount = 3
  ): { exchange: 'NFO' | 'BFO'; tokens: string[] } {
    const exp = isoExpiry || this.getNearestExpiry(index);
    const exch: 'NFO' | 'BFO' = index === 'SENSEX' ? 'BFO' : 'NFO';
    const strikes = this.getStrikesForExpiry(exp, index);
    if (strikes.length === 0) return { exchange: exch, tokens: [] };

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
      const ce = this.getContract(s, 'CE', exp, index);
      const pe = this.getContract(s, 'PE', exp, index);
      if (ce?.token) tokens.push(ce.token);
      if (pe?.token) tokens.push(pe.token);
    }

    return { exchange: exch, tokens };
  }

  public getAtmTokens(atm: number, isoExpiry?: string, windowCount = 10): string[] {
    return this.getAtmTokensForIndex('NIFTY', atm, isoExpiry, windowCount).tokens;
  }

  public getListedInstruments(isoExpiry?: string, index = 'NIFTY'): ListedInstrument[] {
    const exp = isoExpiry || this.getNearestExpiry(index);
    const isoExp = exp.includes('-') ? exp : angelToIsoExpiry(exp);

    const indexToken =
      index === 'BANKNIFTY' ? '99926009' :
      index === 'SENSEX' ? '99919000' :
      index === 'MIDCPNIFTY' ? '99926074' : '99926000';

    const indexExchange = index === 'SENSEX' ? 'BSE' : 'NSE';

    const result: ListedInstrument[] = [
      {
        token: indexToken,
        symbol: index,
        name: index,
        expiry: '',
        strike: 0,
        lotSize: index === 'BANKNIFTY' ? 15 : index === 'SENSEX' ? 10 : index === 'MIDCPNIFTY' ? 75 : 65,
        instrumentType: 'INDEX',
        exchange: indexExchange,
        tickSize: 0.05,
      }
    ];

    for (const c of this.contracts) {
      if (c.index === index && (c.isoExpiry === isoExp || c.expiry === exp)) {
        result.push({
          token: c.token,
          symbol: c.symbol,
          name: index,
          expiry: c.isoExpiry,
          strike: c.strike,
          lotSize: c.lotSize,
          instrumentType: c.type,
          exchange: c.exchange,
          tickSize: c.tickSize,
        });
      }
    }

    return result;
  }
}

export const angelScripService = new AngelScripService();
