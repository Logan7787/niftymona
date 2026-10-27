// ==============================================================================
// Instrument Master & Dynamic ATM Strike Analysis Service
// ==============================================================================

import { Moneyness, OptionType } from '../types/market.js';

export interface ListedInstrument {
  token: string;
  symbol: string;
  name: string;
  expiry: string; // YYYY-MM-DD
  strike: number;
  lotSize: number;
  instrumentType: 'INDEX' | 'CE' | 'PE';
  exchange: 'NSE' | 'NFO';
  tickSize: number;
}

export class InstrumentService {
  private instruments: Map<string, ListedInstrument> = new Map();
  private niftyExpiries: string[] = [];
  private strikesByExpiry: Map<string, number[]> = new Map();

  /**
   * Dynamically calculates the At-The-Money (ATM) strike price:
   * Finds the nearest listed strike from the actual instruments set.
   * Does NOT rely on hardcoded strike intervals.
   */
  public static calculateATMStrike(spotPrice: number, availableStrikes: number[]): number {
    if (!availableStrikes || availableStrikes.length === 0) {
      // Validated fallback if strikes list is not yet populated
      const fallbackInterval = 50;
      return Math.round(spotPrice / fallbackInterval) * fallbackInterval;
    }

    // Sort unique strikes ascending
    const sorted = [...new Set(availableStrikes)].sort((a, b) => a - b);

    let nearestStrike = sorted[0];
    let minDistance = Math.abs(spotPrice - nearestStrike);

    for (let i = 1; i < sorted.length; i++) {
      const strike = sorted[i];
      const dist = Math.abs(spotPrice - strike);
      if (dist < minDistance) {
        minDistance = dist;
        nearestStrike = strike;
      }
    }

    return nearestStrike;
  }

  /**
   * Determines moneyness for a given option contract:
   * For CE: lower strike = ITM, higher strike = OTM
   * For PE: higher strike = ITM, lower strike = OTM
   */
  public static classifyMoneyness(strike: number, atmStrike: number, optionType: OptionType): Moneyness {
    if (strike === atmStrike) {
      return 'ATM';
    }

    if (optionType === 'CE') {
      return strike < atmStrike ? 'ITM' : 'OTM';
    } else {
      return strike > atmStrike ? 'ITM' : 'OTM';
    }
  }

  /**
   * Derives strike interval from valid sorted listed strikes.
   */
  public static detectStrikeInterval(strikes: number[]): number {
    if (!strikes || strikes.length < 2) return 50;
    const sorted = [...new Set(strikes)].sort((a, b) => a - b);
    
    // Find mode of diffs
    const diffs: number[] = [];
    for (let i = 1; i < Math.min(sorted.length, 10); i++) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff > 0) diffs.push(diff);
    }

    if (diffs.length === 0) return 50;
    // Return minimum positive valid step
    return Math.min(...diffs);
  }

  /**
   * Selects symmetric strikes around ATM based on configured range count.
   * e.g. rangeCount = 5 returns 5 strikes ITM, ATM, and 5 strikes OTM.
   */
  public static getSelectedStrikesWindow(
    atmStrike: number, 
    availableStrikes: number[], 
    rangeCount: number = 10
  ): number[] {
    const sorted = [...new Set(availableStrikes)].sort((a, b) => a - b);
    const atmIndex = sorted.indexOf(atmStrike);

    if (atmIndex === -1) {
      // If exact ATM not in list, find insertion index
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < sorted.length; i++) {
        const diff = Math.abs(sorted[i] - atmStrike);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      const start = Math.max(0, closestIdx - rangeCount);
      const end = Math.min(sorted.length, closestIdx + rangeCount + 1);
      return sorted.slice(start, end);
    }

    const start = Math.max(0, atmIndex - rangeCount);
    const end = Math.min(sorted.length, atmIndex + rangeCount + 1);
    return sorted.slice(start, end);
  }

  /**
   * Calculates Put-Call Ratio (PCR):
   * OI PCR = Total Put OI / Total Call OI
   * Volume PCR = Total Put Volume / Total Call Volume
   */
  public static calculatePCR(totalPe: number, totalCe: number): number {
    if (totalCe <= 0) return 0;
    return Number((totalPe / totalCe).toFixed(3));
  }

  /**
   * Computes Max Pain strike based on open interest distribution:
   * The strike where option writers have the least cumulative payout at expiry.
   */
  public static calculateMaxPain(
    rows: Array<{ strike: number; ceOi: number; peOi: number }>
  ): number {
    if (!rows || rows.length === 0) return 0;

    let minTotalLoss = Infinity;
    let maxPainStrike = rows[0].strike;

    for (const testStrike of rows) {
      let cumulativeLoss = 0;

      for (const row of rows) {
        // CE writers pay when spot settles above strike
        if (testStrike.strike > row.strike) {
          cumulativeLoss += (testStrike.strike - row.strike) * row.ceOi;
        }
        // PE writers pay when spot settles below strike
        if (testStrike.strike < row.strike) {
          cumulativeLoss += (row.strike - testStrike.strike) * row.peOi;
        }
      }

      if (cumulativeLoss < minTotalLoss) {
        minTotalLoss = cumulativeLoss;
        maxPainStrike = testStrike.strike;
      }
    }

    return maxPainStrike;
  }

  /**
   * Populates in-memory master instruments cache
   */
  public loadInstruments(list: ListedInstrument[]): void {
    this.instruments.clear();
    const expiriesSet = new Set<string>();
    const strikesMap = new Map<string, Set<number>>();

    for (const inst of list) {
      this.instruments.set(inst.token, inst);
      if (inst.name === 'NIFTY' && inst.expiry) {
        expiriesSet.add(inst.expiry);
        if (!strikesMap.has(inst.expiry)) {
          strikesMap.set(inst.expiry, new Set<number>());
        }
        if (inst.strike > 0) {
          strikesMap.get(inst.expiry)!.add(inst.strike);
        }
      }
    }

    // Sort expiries chronologically
    this.niftyExpiries = Array.from(expiriesSet).sort();
    this.strikesByExpiry.clear();

    for (const [exp, strikesSet] of strikesMap.entries()) {
      this.strikesByExpiry.set(exp, Array.from(strikesSet).sort((a, b) => a - b));
    }
  }

  public getAvailableExpiries(): string[] {
    return this.niftyExpiries;
  }

  public getStrikesForExpiry(expiry: string): number[] {
    return this.strikesByExpiry.get(expiry) || [];
  }

  public getInstrument(token: string): ListedInstrument | undefined {
    return this.instruments.get(token);
  }

  public findContract(strike: number, type: 'CE' | 'PE', expiry: string): ListedInstrument | undefined {
    for (const inst of this.instruments.values()) {
      if (inst.strike === strike && inst.instrumentType === type && (!expiry || inst.expiry === expiry)) {
        return inst;
      }
    }
    return undefined;
  }

  public getAllContractsForExpiry(expiry: string): ListedInstrument[] {
    const list: ListedInstrument[] = [];
    for (const inst of this.instruments.values()) {
      if (inst.expiry === expiry) {
        list.push(inst);
      }
    }
    return list;
  }

  /**
   * Returns current lot size for NIFTY contracts. Reads from metadata,
   * with current exchange default fallback (25 / 75 as per regulatory changes).
   */
  public getNiftyLotSize(expiry?: string): number {
    if (expiry && this.strikesByExpiry.has(expiry)) {
      for (const inst of this.instruments.values()) {
        if (inst.name === 'NIFTY' && inst.expiry === expiry && inst.lotSize > 0) {
          return inst.lotSize;
        }
      }
    }
    return 25; // Standard NSE NIFTY lot size
  }
}
