// ==============================================================================
// Technical Analysis Charts Page
// Uses TradingView Lightweight Charts for Candlesticks, EMAs, VWAP, RSI, MACD
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { TechnicalIndicatorData, UnderlyingSnapshot } from '../types/market.js';
import { Activity, Clock, Compass, Layers, ShieldCheck } from 'lucide-react';

interface TechnicalChartsProps {
  indicators: TechnicalIndicatorData | null;
  underlying: UnderlyingSnapshot | null;
}

export const TechnicalCharts: React.FC<TechnicalChartsProps> = ({ indicators, underlying }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [selectedTf, setSelectedTf] = useState<'1m' | '3m' | '5m' | '15m'>('5m');

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean previous chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { color: '#0b0f17' },
        textColor: '#94a3b8',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: '#172033' },
        horzLines: { color: '#172033' },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: '#23304c',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#23304c',
      },
    });

    chartInstanceRef.current = chart;

    // Add Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00e676',
      downColor: '#ff1744',
      borderVisible: false,
      wickUpColor: '#00e676',
      wickDownColor: '#ff1744',
    });
    candlestickSeriesRef.current = candleSeries;

    // Add VWAP line
    const vwapLine = chart.addLineSeries({
      color: '#38bdf8',
      lineWidth: 2,
      title: 'VWAP',
    });
    vwapSeriesRef.current = vwapLine;

    // Populate data
    if (indicators && indicators.candles && indicators.candles.length > 0) {
      const formattedCandles = indicators.candles.map(c => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(formattedCandles);

      if (indicators.vwap) {
        const vwapData = indicators.candles.map(c => ({
          time: c.time as any,
          value: indicators.vwap || c.close,
        }));
        vwapLine.setData(vwapData);
      }
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [indicators]);

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Chart Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-terminal-800 bg-terminal-900/90">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          <span className="font-bold text-sm text-white">NIFTY 50 Candlestick Terminal</span>
          <span className="text-xs text-slate-400">| Spot: ₹{underlying?.spotPrice.toFixed(2)}</span>
        </div>

        {/* Timeframe switcher */}
        <div className="flex items-center gap-1 bg-terminal-850 p-1 rounded-lg border border-terminal-700 text-xs">
          {(['1m', '3m', '5m', '15m'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTf(tf)}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                selectedTf === tf
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart Canvas Container */}
      <div className="rounded-xl border border-terminal-800 bg-terminal-900 overflow-hidden shadow-2xl p-1">
        <div ref={chartContainerRef} className="w-full" style={{ height: '480px' }} />
      </div>

      {/* Indicator Metrics Panels (EMA, RSI, MACD, S&R) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Moving Averages */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <div className="text-xs text-slate-400">EXPONENTIAL MOVING AVERAGES</div>
          <div className="mt-2 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-emerald-400 font-bold">EMA 9:</span>
              <span className="text-white">₹{indicators?.ema9 || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-400 font-bold">EMA 20:</span>
              <span className="text-white">₹{indicators?.ema20 || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-400 font-bold">EMA 50:</span>
              <span className="text-white">₹{indicators?.ema50 || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* VWAP & ATR */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <div className="text-xs text-slate-400">INTRADAY VWAP & VOLATILITY</div>
          <div className="mt-2 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-cyan-400 font-bold">VWAP:</span>
              <span className="text-white font-bold">₹{indicators?.vwap || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold">ATR 14:</span>
              <span className="text-white">{indicators?.atr14 || '24.50'} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold">Opening Range:</span>
              <span className="text-white">
                {indicators?.openingRange.low} - {indicators?.openingRange.high}
              </span>
            </div>
          </div>
        </div>

        {/* RSI Momentum */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <div className="text-xs text-slate-400">RSI 14 MOMENTUM</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white">{indicators?.rsi14 || '54.20'}</span>
            <span className={`text-xs font-bold ${
              (indicators?.rsi14 || 50) >= 60 ? 'text-emerald-400' : (indicators?.rsi14 || 50) <= 40 ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {(indicators?.rsi14 || 50) >= 60 ? 'Bullish' : (indicators?.rsi14 || 50) <= 40 ? 'Bearish' : 'Neutral Zone'}
            </span>
          </div>
          <div className="mt-2 w-full bg-terminal-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, indicators?.rsi14 || 50))}%` }}
            ></div>
          </div>
        </div>

        {/* MACD Histogram */}
        <div className="rounded-xl border border-terminal-800 bg-terminal-900 p-3.5">
          <div className="text-xs text-slate-400">MACD (12, 26, 9)</div>
          <div className="mt-2 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">MACD Line:</span>
              <span className="text-white">{indicators?.macd.macdLine ?? '+12.40'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Signal Line:</span>
              <span className="text-white">{indicators?.macd.signalLine ?? '+9.80'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Histogram:</span>
              <span className={`font-bold ${(indicators?.macd.histogram ?? 2.6) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(indicators?.macd.histogram ?? 2.6) >= 0 ? '+' : ''}{indicators?.macd.histogram ?? '+2.60'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
