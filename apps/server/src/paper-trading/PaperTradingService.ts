// ==============================================================================
// Isolated Paper Trading Engine
// STAGE-GATED: Cannot connect to live broker order routing.
// Enforces dynamic lot-size validation, fee models, SL/TP and P&L tracking.
// ==============================================================================

import { OptionType, PaperAccountSummary, PaperTradeOrder } from '../types/market.js';

export interface PlacePaperOrderParams {
  userId: string;
  tradingSymbol: string;
  instrumentKey: string;
  strikePrice: number;
  optionType: OptionType;
  expiry: string;
  lotSize: number;
  numLots: number;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss?: number;
  target?: number;
  notes?: string;
}

export class PaperTradingService {
  private accounts: Map<string, PaperAccountSummary> = new Map();

  constructor() {
    // Default account instance initialized on start
  }

  /**
   * Retrieves or initializes a paper trading portfolio for user
   */
  public getOrCreateAccount(userId: string, startingCapital: number = 100000): PaperAccountSummary {
    if (!this.accounts.has(userId)) {
      this.accounts.set(userId, {
        startingCapital,
        currentCash: startingCapital,
        totalInvested: 0,
        currentPortfolioValue: startingCapital,
        totalRealizedPnl: 0,
        totalUnrealizedPnl: 0,
        netPnl: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRatePercent: 0,
        maxDrawdownPercent: 0,
        brokeragePerOrder: 20.0,
        openPositions: [],
        tradeHistory: [],
      });
    }
    return this.accounts.get(userId)!;
  }

  /**
   * Resets account back to initial capital
   */
  public resetAccount(userId: string, startingCapital: number = 100000): PaperAccountSummary {
    this.accounts.delete(userId);
    return this.getOrCreateAccount(userId, startingCapital);
  }

  /**
   * Places a simulated order. Strictly validates lot size and cash balance.
   */
  public placeOrder(params: PlacePaperOrderParams): { success: boolean; message: string; order?: PaperTradeOrder } {
    const account = this.getOrCreateAccount(params.userId);

    // Lot size validation
    if (params.lotSize <= 0 || params.numLots <= 0) {
      return { success: false, message: 'Invalid lot size or quantity count.' };
    }

    const totalQuantity = params.lotSize * params.numLots;
    const requiredCapital = params.action === 'BUY' ? params.entryPrice * totalQuantity : 0;
    const estimatedBrokerage = account.brokeragePerOrder;

    if (params.action === 'BUY' && account.currentCash < (requiredCapital + estimatedBrokerage)) {
      return {
        success: false,
        message: `Insufficient virtual cash. Required: ₹${(requiredCapital + estimatedBrokerage).toFixed(2)}, Available: ₹${account.currentCash.toFixed(2)}`,
      };
    }

    const order: PaperTradeOrder = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: params.userId,
      tradingSymbol: params.tradingSymbol,
      instrumentKey: params.instrumentKey,
      strikePrice: params.strikePrice,
      optionType: params.optionType,
      expiry: params.expiry,
      lotSize: params.lotSize,
      numLots: params.numLots,
      totalQuantity,
      action: params.action,
      orderStatus: 'FILLED',
      entryPrice: params.entryPrice,
      currentLtp: params.entryPrice,
      stopLoss: params.stopLoss,
      target: params.target,
      realizedPnl: 0,
      unrealizedPnl: 0,
      brokeragePaid: estimatedBrokerage,
      entryTime: new Date().toISOString(),
      notes: params.notes,
    };

    if (params.action === 'BUY') {
      account.currentCash -= (requiredCapital + estimatedBrokerage);
    } else {
      account.currentCash -= estimatedBrokerage;
    }

    account.openPositions.push(order);
    this.recalculateAccount(account);

    return {
      success: true,
      message: `Simulated order filled: ${params.action} ${totalQuantity} qty ${params.tradingSymbol} @ ₹${params.entryPrice.toFixed(2)} (PAPER TRADING)`,
      order,
    };
  }

  /**
   * Closes an active simulated position at market premium
   */
  public closePosition(userId: string, positionId: string, exitPrice: number): { success: boolean; message: string; order?: PaperTradeOrder } {
    const account = this.getOrCreateAccount(userId);
    const posIndex = account.openPositions.findIndex(p => p.id === positionId);

    if (posIndex === -1) {
      return { success: false, message: 'Open paper trade position not found.' };
    }

    const pos = account.openPositions[posIndex];
    const brokerage = account.brokeragePerOrder;

    // Calculate Realized PnL: For BUY -> (exit - entry) * qty - total fees
    let pnl = 0;
    if (pos.action === 'BUY') {
      pnl = (exitPrice - pos.entryPrice) * pos.totalQuantity - (pos.brokeragePaid + brokerage);
      account.currentCash += (exitPrice * pos.totalQuantity) - brokerage;
    } else {
      pnl = (pos.entryPrice - exitPrice) * pos.totalQuantity - (pos.brokeragePaid + brokerage);
      account.currentCash -= brokerage;
    }

    pos.exitPrice = exitPrice;
    pos.exitTime = new Date().toISOString();
    pos.orderStatus = 'CLOSED';
    pos.realizedPnl = Number(pnl.toFixed(2));
    pos.brokeragePaid += brokerage;
    pos.currentLtp = exitPrice;
    pos.unrealizedPnl = 0;

    // Remove from open, push to history
    account.openPositions.splice(posIndex, 1);
    account.tradeHistory.unshift(pos);

    this.recalculateAccount(account);

    return {
      success: true,
      message: `Closed paper position: ${pos.tradingSymbol} @ ₹${exitPrice.toFixed(2)} | Net P&L: ₹${pnl.toFixed(2)}`,
      order: pos,
    };
  }

  /**
   * Updates real-time unrealized PnL for all active positions as live market prices tick
   */
  public updateMarkToMarket(currentLtpMap: Map<string, number>): void {
    for (const account of this.accounts.values()) {
      for (const pos of account.openPositions) {
        const livePrice = currentLtpMap.get(pos.instrumentKey) || currentLtpMap.get(pos.tradingSymbol);
        if (livePrice && livePrice > 0) {
          pos.currentLtp = livePrice;
          if (pos.action === 'BUY') {
            pos.unrealizedPnl = Number(((livePrice - pos.entryPrice) * pos.totalQuantity).toFixed(2));
          } else {
            pos.unrealizedPnl = Number(((pos.entryPrice - livePrice) * pos.totalQuantity).toFixed(2));
          }

          // Automated simulated Stop-Loss & Target trigger checks
          if (pos.stopLoss && livePrice <= pos.stopLoss) {
            this.closePosition(pos.userId, pos.id, livePrice);
          } else if (pos.target && livePrice >= pos.target) {
            this.closePosition(pos.userId, pos.id, livePrice);
          }
        }
      }
      this.recalculateAccount(account);
    }
  }

  private recalculateAccount(account: PaperAccountSummary): void {
    let totalInvested = 0;
    let totalUnrealized = 0;

    for (const pos of account.openPositions) {
      if (pos.action === 'BUY') {
        totalInvested += pos.entryPrice * pos.totalQuantity;
      }
      totalUnrealized += pos.unrealizedPnl;
    }

    let totalRealized = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const trade of account.tradeHistory) {
      totalRealized += trade.realizedPnl;
      if (trade.realizedPnl > 0) winCount++;
      else if (trade.realizedPnl < 0) lossCount++;
    }

    const totalTrades = account.tradeHistory.length;
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    const currentPortfolioValue = account.currentCash + totalInvested + totalUnrealized;
    const netPnl = totalRealized + totalUnrealized;

    // Peak drawdown estimate
    const peak = Math.max(account.startingCapital, currentPortfolioValue);
    const drawdown = peak > 0 ? ((peak - currentPortfolioValue) / peak) * 100 : 0;

    account.totalInvested = Number(totalInvested.toFixed(2));
    account.totalUnrealizedPnl = Number(totalUnrealized.toFixed(2));
    account.totalRealizedPnl = Number(totalRealized.toFixed(2));
    account.netPnl = Number(netPnl.toFixed(2));
    account.currentPortfolioValue = Number(currentPortfolioValue.toFixed(2));
    account.totalTrades = totalTrades;
    account.winningTrades = winCount;
    account.losingTrades = lossCount;
    account.winRatePercent = Number(winRate.toFixed(1));
    account.maxDrawdownPercent = Number(drawdown.toFixed(1));
  }
}
