// ==============================================================================
// Live Real-Time Option Strike Alert & Notification Engine
// Real-time audio chimes, browser desktop notifications, and SL/Target tracking
// ==============================================================================

import { PredictionAction } from './predictionEngine';

export type AlertStatus = 
  | 'ARMED' 
  | 'ENTRY_TRIGGERED' 
  | 'TARGET1_HIT' 
  | 'TARGET2_HIT' 
  | 'STOPLOSS_HIT' 
  | 'TIME_EXPIRED';

export interface LiveAlert {
  id: string;
  strike: number;
  optionType: 'CE' | 'PE';
  symbol: string;
  action: PredictionAction;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  maxHoldMinutes: number;
  createdAt: number;
  currentLtp: number;
  status: AlertStatus;
  lastTriggeredEvent?: string;
  lastTriggeredTime?: string;
  soundEnabled: boolean;
  notifiedEvents: { [key: string]: boolean };
}

export type AlertListener = (alerts: LiveAlert[], lastNotification?: { title: string; message: string; type: 'success' | 'warning' | 'info' }) => void;

class SoundSynthesizer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Play sweet, clean melodic chimes using pure Web Audio API synthesis
   */
  public play(type: 'ENTRY' | 'TARGET' | 'STOPLOSS' | 'TIME' | 'CHIME'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'TARGET') {
        // Joyful Major Arpeggio: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz) -> C6 (1046Hz)
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);

        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.12);
        osc.frequency.setValueAtTime(783.99, now + 0.24);
        osc.frequency.setValueAtTime(1046.50, now + 0.36);

        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        osc.start(now);
        osc.stop(now + 0.85);
      } else if (type === 'ENTRY') {
        // Upward energetic two-tone chime: A4 (440Hz) -> C#5 (554Hz)
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.04);

        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.15);

        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.55);
      } else if (type === 'STOPLOSS') {
        // Warning downward caution buzz: 440Hz -> 311Hz
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.05);

        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(311.13, now + 0.18);

        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      } else if (type === 'TIME') {
        // Dual gentle blips: 600Hz double beep
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.setValueAtTime(0.001, now + 0.1);
        gain.gain.setValueAtTime(0.2, now + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.frequency.setValueAtTime(650, now);
        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // Generic chime
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, now);
        osc.frequency.setValueAtTime(880, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      console.warn('[Audio] Failed to synthesize chime:', e);
    }
  }
}

class AlertManager {
  private alerts: Map<string, LiveAlert> = new Map();
  private listeners: Set<AlertListener> = new Set();
  private sound = new SoundSynthesizer();
  private STORAGE_KEY = 'nifty_live_option_alerts_v1';

  constructor() {
    this.restoreFromStorage();
  }

  private restoreFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed: LiveAlert[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((a) => this.alerts.set(a.id, a));
        }
      }
    } catch (e) {
      console.warn('[AlertManager] Could not restore alerts from storage:', e);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const arr = Array.from(this.alerts.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[AlertManager] Could not save alerts to storage:', e);
    }
  }

  public subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.alerts.values()));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(lastNotification?: { title: string; message: string; type: 'success' | 'warning' | 'info' }): void {
    const list = Array.from(this.alerts.values());
    this.listeners.forEach((l) => l(list, lastNotification));
    this.saveToStorage();
  }

  public requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.requestPermission();
    }
    return Promise.resolve('denied');
  }

  private triggerDesktopNotification(title: string, body: string): void {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('[AlertManager] Desktop notification error:', e);
      }
    }
  }

  /**
   * Set or toggle an alert for a strike
   */
  public setAlert(params: {
    strike: number;
    optionType: 'CE' | 'PE';
    symbol: string;
    action: PredictionAction;
    entryPrice: number;
    target1: number;
    target2: number;
    stopLoss: number;
    maxHoldMinutes?: number;
    soundEnabled?: boolean;
  }): LiveAlert {
    const id = `alert_${params.strike}_${params.optionType}`;
    const existing = this.alerts.get(id);

    const alert: LiveAlert = {
      id,
      strike: params.strike,
      optionType: params.optionType,
      symbol: params.symbol,
      action: params.action,
      entryPrice: params.entryPrice,
      target1: params.target1,
      target2: params.target2,
      stopLoss: params.stopLoss,
      maxHoldMinutes: params.maxHoldMinutes || 60,
      createdAt: existing ? existing.createdAt : Date.now(),
      currentLtp: existing ? existing.currentLtp : params.entryPrice,
      status: existing ? existing.status : 'ARMED',
      soundEnabled: params.soundEnabled !== undefined ? params.soundEnabled : true,
      notifiedEvents: existing ? existing.notifiedEvents : {},
    };

    this.alerts.set(id, alert);
    this.sound.play('CHIME');
    this.notify({
      title: `Alert Set: ${params.symbol}`,
      message: `Monitoring real-time ticks for Entry ₹${params.entryPrice}, Target ₹${params.target1}, SL ₹${params.stopLoss}`,
      type: 'info',
    });
    return alert;
  }

  public removeAlert(id: string): void {
    if (this.alerts.delete(id)) {
      this.notify();
    }
  }

  public clearAllAlerts(): void {
    this.alerts.clear();
    this.notify();
  }

  public toggleSound(id: string): void {
    const a = this.alerts.get(id);
    if (a) {
      a.soundEnabled = !a.soundEnabled;
      this.notify();
    }
  }

  public testSound(type: 'ENTRY' | 'TARGET' | 'STOPLOSS' | 'TIME'): void {
    this.sound.play(type);
  }

  public getAlert(strike: number, optionType: 'CE' | 'PE'): LiveAlert | undefined {
    return this.alerts.get(`alert_${strike}_${optionType}`);
  }

  public getAllAlerts(): LiveAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Evaluates live prices across all active alerts
   */
  public evaluateTick(strike: number, optionType: 'CE' | 'PE', currentLtp: number): void {
    const id = `alert_${strike}_${optionType}`;
    const alert = this.alerts.get(id);
    if (!alert || currentLtp <= 0) return;

    alert.currentLtp = currentLtp;
    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isSeller = alert.action === 'SELL_WRITE';

    // 1. TARGET 2 HIT
    const isT2Hit = isSeller ? currentLtp <= alert.target2 : currentLtp >= alert.target2;
    if (isT2Hit && !alert.notifiedEvents['TARGET2_HIT']) {
      alert.status = 'TARGET2_HIT';
      alert.lastTriggeredEvent = 'TARGET 2 REACHED';
      alert.lastTriggeredTime = timeStr;
      alert.notifiedEvents['TARGET2_HIT'] = true;

      if (alert.soundEnabled) this.sound.play('TARGET');
      const title = `🎯 Target 2 Reached: ${alert.symbol}`;
      const msg = `Price reached ₹${currentLtp.toFixed(2)} (Target 2: ₹${alert.target2}). Max profits achieved!`;
      this.triggerDesktopNotification(title, msg);
      this.notify({ title, message: msg, type: 'success' });
      return;
    }

    // 2. TARGET 1 HIT
    const isT1Hit = isSeller ? currentLtp <= alert.target1 : currentLtp >= alert.target1;
    if (isT1Hit && !alert.notifiedEvents['TARGET1_HIT']) {
      alert.status = 'TARGET1_HIT';
      alert.lastTriggeredEvent = 'TARGET 1 REACHED';
      alert.lastTriggeredTime = timeStr;
      alert.notifiedEvents['TARGET1_HIT'] = true;

      if (alert.soundEnabled) this.sound.play('TARGET');
      const title = `🎯 Target 1 Reached: ${alert.symbol}`;
      const msg = `Price reached ₹${currentLtp.toFixed(2)} (Target 1: ₹${alert.target1}). Book 70% profit & trail SL!`;
      this.triggerDesktopNotification(title, msg);
      this.notify({ title, message: msg, type: 'success' });
      return;
    }

    // 3. STOP LOSS HIT
    const isSLHit = isSeller ? currentLtp >= alert.stopLoss : currentLtp <= alert.stopLoss;
    if (isSLHit && !alert.notifiedEvents['STOPLOSS_HIT']) {
      alert.status = 'STOPLOSS_HIT';
      alert.lastTriggeredEvent = 'STOP LOSS HIT';
      alert.lastTriggeredTime = timeStr;
      alert.notifiedEvents['STOPLOSS_HIT'] = true;

      if (alert.soundEnabled) this.sound.play('STOPLOSS');
      const title = `🛡️ Stop Loss Triggered: ${alert.symbol}`;
      const msg = `Price breached SL at ₹${currentLtp.toFixed(2)} (SL: ₹${alert.stopLoss}). Exit position to cut loss!`;
      this.triggerDesktopNotification(title, msg);
      this.notify({ title, message: msg, type: 'warning' });
      return;
    }

    // 4. ENTRY TRIGGERED (Price within optimal entry zone)
    if (alert.status === 'ARMED' && !alert.notifiedEvents['ENTRY_TRIGGERED']) {
      const distFromEntry = Math.abs(currentLtp - alert.entryPrice) / alert.entryPrice;
      if (distFromEntry <= 0.02) {
        alert.status = 'ENTRY_TRIGGERED';
        alert.lastTriggeredEvent = 'ENTRY ZONE REACHED';
        alert.lastTriggeredTime = timeStr;
        alert.notifiedEvents['ENTRY_TRIGGERED'] = true;

        if (alert.soundEnabled) this.sound.play('ENTRY');
        const title = `🔔 Entry Price Triggered: ${alert.symbol}`;
        const msg = `Current LTP ₹${currentLtp.toFixed(2)} is in optimal entry zone ₹${alert.entryPrice.toFixed(2)}!`;
        this.triggerDesktopNotification(title, msg);
        this.notify({ title, message: msg, type: 'info' });
        return;
      }
    }

    // 5. TIME-BASED / THETA DECAY EXIT ALERT
    const elapsedMinutes = (now - alert.createdAt) / 60000;
    if (elapsedMinutes >= alert.maxHoldMinutes && !alert.notifiedEvents['TIME_EXPIRED']) {
      alert.status = 'TIME_EXPIRED';
      alert.lastTriggeredEvent = 'MAX HOLD TIME EXCEEDED';
      alert.lastTriggeredTime = timeStr;
      alert.notifiedEvents['TIME_EXPIRED'] = true;

      if (alert.soundEnabled) this.sound.play('TIME');
      const title = `⏰ Max Hold Duration Exceeded: ${alert.symbol}`;
      const msg = `Position held for ${Math.round(elapsedMinutes)} mins. Consider squaring off before time decay accelerates.`;
      this.triggerDesktopNotification(title, msg);
      this.notify({ title, message: msg, type: 'warning' });
      return;
    }

    // Save update without spamming notifications
    this.saveToStorage();
  }
}

export const alertManager = new AlertManager();

