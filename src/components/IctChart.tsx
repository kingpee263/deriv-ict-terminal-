import React, { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
} from 'lightweight-charts';
import { useTerminalStore } from '../store/useTerminalStore';
import { VOLATILITY_PAIRS } from '../constants/pairs';
import { Zap, Eye, Layers, Sparkles } from 'lucide-react';

export const IctChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const {
    symbol,
    granularity,
    candles,
    ictSnapshot,
    overlays,
    positions,
    turboTraining,
    setGranularity,
    setTurboTraining,
    toggleOverlay,
  } = useTerminalStore();

  const meta = VOLATILITY_PAIRS[symbol];

  // Draw custom ICT institutional annotations on the synchronized HTML5 Canvas overlay
  const drawIctOverlays = () => {
    const canvas = canvasRef.current;
    const chart = chartApiRef.current;
    const series = candleSeriesRef.current;
    if (!canvas || !chart || !series || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const timeScale = chart.timeScale();
    const chartRightX = rect.width - 68; // Leave room for right price axis

    const timeToX = (t: number): number => {
      const coord = timeScale.timeToCoordinate(t as UTCTimestamp);
      if (coord !== null) return coord;
      const firstTime = candles[0]?.time || 0;
      const lastTime = candles[candles.length - 1]?.time || 1;
      if (t <= firstTime) return 12;
      if (t >= lastTime) return chartRightX - 18;
      return chartRightX / 2;
    };

    const priceToY = (p: number): number | null => {
      return series.priceToCoordinate(p);
    };

    ctx.font = '600 10px "JetBrains Mono", monospace';

    // 1. Dealing Range Equilibrium (50%) + OTE (0.618 - 0.786) Zone
    if (overlays.showDealingRangeOte) {
      const dr = ictSnapshot.dealingRange;
      const yHigh = priceToY(dr.high);
      const yLow = priceToY(dr.low);
      const yEq = priceToY(dr.equilibrium);

      if (yHigh !== null && yLow !== null && yEq !== null) {
        // Subtle tint for Premium (top half) and Discount (bottom half)
        ctx.fillStyle = 'rgba(244, 63, 94, 0.035)';
        ctx.fillRect(0, yHigh, chartRightX, Math.max(0, yEq - yHigh));

        ctx.fillStyle = 'rgba(16, 185, 129, 0.035)';
        ctx.fillRect(0, yEq, chartRightX, Math.max(0, yLow - yEq));

        // 50% Equilibrium Dashed Line
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(20, yEq);
        ctx.lineTo(chartRightX, yEq);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(chartRightX - 185, yEq - 9, 180, 17);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(
          `EQ 50% (${dr.equilibrium.toFixed(meta.decimals)}) | ${dr.currentZone}`,
          chartRightX - 180,
          yEq + 3
        );

        // Draw active OTE (0.618 - 0.786) Golden Band
        const ote = ictSnapshot.bias === 'BEARISH' ? dr.oteBearish : dr.oteBullish;
        const y618 = priceToY(ote.fib618);
        const y786 = priceToY(ote.fib786);
        if (y618 !== null && y786 !== null) {
          const topY = Math.min(y618, y786);
          const heightY = Math.max(4, Math.abs(y786 - y618));
          ctx.fillStyle = 'rgba(245, 158, 11, 0.09)';
          ctx.fillRect(chartRightX * 0.35, topY, chartRightX * 0.65, heightY);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.strokeRect(chartRightX * 0.35, topY, chartRightX * 0.65, heightY);
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(
            `OTE 0.618-0.786 (${ote.fib618.toFixed(meta.decimals)})`,
            chartRightX * 0.35 + 6,
            topY + 11
          );
        }
      }
    }

    // 2. Order Blocks (OB)
    if (overlays.showOb) {
      for (const ob of ictSnapshot.orderBlocks) {
        const x1 = Math.max(10, timeToX(ob.startTime));
        const x2 = chartRightX;
        const yTop = priceToY(ob.top);
        const yBot = priceToY(ob.bottom);
        if (yTop === null || yBot === null || x2 <= x1) continue;

        const boxTop = Math.min(yTop, yBot);
        const boxHeight = Math.max(6, Math.abs(yBot - yTop));
        const isBull = ob.type === 'BULLISH';

        ctx.fillStyle = isBull ? 'rgba(56, 189, 248, 0.12)' : 'rgba(251, 146, 60, 0.12)';
        ctx.strokeStyle = isBull ? 'rgba(56, 189, 248, 0.55)' : 'rgba(251, 146, 60, 0.55)';
        ctx.lineWidth = 1;
        ctx.fillRect(x1, boxTop, x2 - x1, boxHeight);
        ctx.strokeRect(x1, boxTop, x2 - x1, boxHeight);

        ctx.fillStyle = isBull ? '#38bdf8' : '#fb923c';
        ctx.fillText(
          `${isBull ? '+OB' : '-OB'} ${ob.causedMss ? '(MSS Origin)' : ''}`,
          x1 + 5,
          boxTop + 11
        );
      }
    }

    // 3. Fair Value Gaps (FVG - BISI & SIBI)
    if (overlays.showFvg) {
      for (const fvg of ictSnapshot.fvgs) {
        const x1 = Math.max(10, timeToX(fvg.startTime));
        const x2 = chartRightX;
        const yTop = priceToY(fvg.top);
        const yBot = priceToY(fvg.bottom);
        const yCe = priceToY(fvg.ce);
        if (yTop === null || yBot === null || x2 <= x1) continue;

        const boxTop = Math.min(yTop, yBot);
        const boxHeight = Math.max(8, Math.abs(yBot - yTop));
        const isBull = fvg.type === 'BISI';

        ctx.fillStyle = isBull ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)';
        ctx.strokeStyle = isBull ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.fillRect(x1, boxTop, x2 - x1, boxHeight);
        ctx.strokeRect(x1, boxTop, x2 - x1, boxHeight);

        // 50% Consequent Encroachment (CE) midline
        if (yCe !== null) {
          ctx.strokeStyle = isBull ? 'rgba(52, 211, 153, 0.5)' : 'rgba(251, 113, 133, 0.5)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, yCe);
          ctx.lineTo(x2, yCe);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = isBull ? '#34d399' : '#fb7185';
        ctx.fillText(
          `[=== ${isBull ? 'Bullish FVG (BISI)' : 'Bearish FVG (SIBI)'} | Fill: ${
            fvg.mitigatedPct
          }% ===]`,
          x1 + 6,
          boxTop + 12
        );
      }
    }

    // 4. Market Structure Shifts (MSS) & Break of Structure (BOS)
    if (overlays.showMssBos) {
      for (const sb of ictSnapshot.structureBreaks) {
        const x1 = Math.max(10, timeToX(sb.startTime));
        const x2 = Math.min(chartRightX, timeToX(sb.time));
        const y = priceToY(sb.brokenLevel);
        if (y === null || x2 < x1) continue;

        const isBull = sb.direction === 'BULLISH';
        ctx.strokeStyle = isBull ? '#22c55e' : '#ef4444';
        ctx.lineWidth = sb.type === 'MSS' ? 1.8 : 1.2;
        ctx.setLineDash(sb.type === 'MSS' ? [] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (x1 + x2) / 2;
        const label = `${sb.type} (${sb.displacementRatio}x ATR)`;
        ctx.fillStyle = 'rgba(7, 11, 18, 0.88)';
        ctx.fillRect(midX - 42, y - 10, 92, 16);
        ctx.fillStyle = isBull ? '#4ade80' : '#f87171';
        ctx.fillText(label, midX - 38, y + 2);
      }
    }

    // 5. Liquidity Sweeps (BSL / SSL)
    if (overlays.showLiquiditySweeps) {
      for (const sw of ictSnapshot.sweeps) {
        const x = timeToX(sw.time);
        const y = priceToY(sw.sweepExtreme);
        if (y === null || x < 10 || x > chartRightX) continue;

        const isBsl = sw.type === 'BSL';
        const tagY = isBsl ? y - 14 : y + 16;

        ctx.fillStyle = isBsl ? 'rgba(244, 63, 94, 0.9)' : 'rgba(16, 185, 129, 0.9)';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        const badgeText = `${sw.type} Sweep${sw.isEqualHighLow ? ' (EQ)' : ''}`;
        ctx.fillStyle = 'rgba(7, 11, 18, 0.9)';
        ctx.fillRect(x - 36, tagY - 10, 78, 15);
        ctx.strokeStyle = isBsl ? '#fb7185' : '#34d399';
        ctx.strokeRect(x - 36, tagY - 10, 78, 15);
        ctx.fillStyle = isBsl ? '#fda4af' : '#6ee7b7';
        ctx.fillText(badgeText, x - 32, tagY + 1);
      }
    }

    // 6. Active Open Position Entry line
    const openReal = positions.find((p) => p.status === 'OPEN' && !p.isShadowPaper && p.symbol === symbol);
    if (openReal) {
      const yEntry = priceToY(openReal.entryPrice);
      if (yEntry !== null) {
        ctx.strokeStyle = openReal.direction === 'CALL' ? '#10b981' : '#f43f5e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, yEntry);
        ctx.lineTo(chartRightX, yEntry);
        ctx.stroke();

        ctx.fillStyle = openReal.direction === 'CALL' ? '#065f46' : '#881337';
        ctx.fillRect(14, yEntry - 10, 185, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(
          `OPEN ${openReal.direction} @ ${openReal.entryPrice.toFixed(meta.decimals)} (${
            openReal.pnl >= 0 ? '+' : ''
          }$${openReal.pnl.toFixed(2)})`,
          20,
          yEntry + 3
        );
      }
    }

    ctx.restore();
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#070b12' },
        textColor: '#94a3b8',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.35)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.35)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(drawIctOverlays);
    });

    const handleResize = () => {
      if (!chartContainerRef.current || !chartApiRef.current) return;
      const { clientWidth, clientHeight } = chartContainerRef.current;
      chartApiRef.current.applyOptions({ width: clientWidth, height: clientHeight });
      requestAnimationFrame(drawIctOverlays);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision: meta.decimals,
        minMove: Number(Math.pow(10, -meta.decimals).toFixed(meta.decimals)),
      },
    });

    const formatted = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(formatted);
    requestAnimationFrame(drawIctOverlays);
  }, [candles, ictSnapshot, overlays, positions, symbol]);

  const lastPrice = candles[candles.length - 1]?.close || meta.basePrice;
  const setup = ictSnapshot.activeSetup;

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-[#070b12] border border-slate-800/80 rounded-lg overflow-hidden">
      {/* Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#0b111d] border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-200 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            {meta.name}
          </span>
          <span className="font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
            {lastPrice.toFixed(meta.decimals)}
          </span>

          {/* Timeframe Switcher */}
          <div className="flex items-center bg-slate-900/90 rounded p-0.5 border border-slate-800 ml-1">
            {[
              { label: '1m', val: 60 },
              { label: '3m', val: 180 },
              { label: '5m', val: 300 },
            ].map((tf) => (
              <button
                key={tf.val}
                onClick={() => setGranularity(tf.val)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] transition ${
                  granularity === tf.val
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* ICT Overlay Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
            <Eye className="w-3 h-3" /> Overlays:
          </span>
          {[
            { key: 'showFvg' as const, label: 'FVG (BISI/SIBI)', color: 'emerald' },
            { key: 'showOb' as const, label: 'Order Blocks', color: 'sky' },
            { key: 'showMssBos' as const, label: 'MSS / BOS', color: 'amber' },
            { key: 'showLiquiditySweeps' as const, label: 'BSL/SSL Sweeps', color: 'rose' },
            { key: 'showDealingRangeOte' as const, label: 'EQ 50% & OTE', color: 'purple' },
          ].map((item) => {
            const active = overlays[item.key];
            return (
              <button
                key={item.key}
                onClick={() => toggleOverlay(item.key)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                  active
                    ? 'bg-slate-800/90 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-900/40 text-slate-500 border-slate-800'
                }`}
              >
                {item.label}
              </button>
            );
          })}

          {/* Turbo AI Training Mode Toggle */}
          <button
            onClick={() => setTurboTraining(!turboTraining)}
            title="Accelerate synthetic tick stream 10x to watch the Online SGD Model learn setups faster"
            className={`ml-1 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold flex items-center gap-1 border transition ${
              turboTraining
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3 h-3" />
            {turboTraining ? '10x AI TURBO: ON' : '10x Turbo Sim'}
          </button>
        </div>
      </div>

      {/* Main Chart + Synchronized ICT Canvas Overlay */}
      <div className="relative flex-1 min-h-[340px] w-full">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-10 w-full h-full"
        />

        {/* Floating Pending Setup & AI Confidence HUD Badge */}
        {setup && (
          <div className="absolute top-2.5 left-3 z-20 pointer-events-none flex flex-wrap items-center gap-2 bg-[#0b111d]/90 backdrop-blur-md border border-slate-800/90 px-3 py-1.5 rounded-md text-xs shadow-lg">
            <span className="flex items-center gap-1 font-mono font-semibold text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Active ICT Setup:
            </span>
            <span
              className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                setup.direction === 'BULLISH'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {setup.direction} ({setup.direction === 'BULLISH' ? 'RISE / CALL' : 'FALL / PUT'})
            </span>
            <span className="text-slate-400 font-mono">{setup.summary}</span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded ${
                setup.aiConfidence >= 75
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              AI Confidence: {setup.aiConfidence}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
