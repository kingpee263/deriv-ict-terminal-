import React from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { VOLATILITY_PAIRS } from '../constants/pairs';
import {
  Radar,
  Brain,
  CheckCircle2,
  Circle,
  Power,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
} from 'lucide-react';

export const IctRadarPanel: React.FC = () => {
  const { symbol, ictSnapshot, pairModels, risk, updateRiskSettings } = useTerminalStore();
  const meta = VOLATILITY_PAIRS[symbol];
  const model = pairModels[symbol];
  const setup = ictSnapshot.activeSetup;
  const dr = ictSnapshot.dealingRange;

  const activeOte =
    ictSnapshot.bias === 'BEARISH' ? dr.oteBearish : dr.oteBullish;

  const aiConfidence = setup?.aiConfidence || 74;
  const threshold = Math.max(risk.minAiConfidence, model.dynamicThreshold);

  return (
    <div className="flex flex-col gap-3 bg-[#0b111d] border border-slate-800/80 rounded-lg p-3.5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-slate-200">
            ICT & AI RADAR
          </h2>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
          ATR: {ictSnapshot.atr.toFixed(meta.decimals)}
        </span>
      </div>

      {/* Core ICT Telemetry Grid matching user blueprint */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="bg-[#070b12] border border-slate-800/70 rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase">Bias</div>
          <div
            className={`font-bold flex items-center gap-1 mt-0.5 ${
              ictSnapshot.bias === 'BULLISH'
                ? 'text-emerald-400'
                : ictSnapshot.bias === 'BEARISH'
                ? 'text-rose-400'
                : 'text-amber-300'
            }`}
          >
            {ictSnapshot.bias === 'BULLISH' ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {ictSnapshot.bias}
          </div>
        </div>

        <div className="bg-[#070b12] border border-slate-800/70 rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase">Dealing Range</div>
          <div
            className={`font-bold mt-0.5 ${
              dr.currentZone === 'DISCOUNT'
                ? 'text-emerald-400'
                : dr.currentZone === 'PREMIUM'
                ? 'text-rose-400'
                : 'text-slate-300'
            }`}
          >
            {dr.currentZone} ({dr.rangePct.toFixed(0)}%)
          </div>
        </div>

        <div className="bg-[#070b12] border border-slate-800/70 rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase">MSS Status</div>
          <div className="font-bold text-amber-300 mt-0.5 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            {ictSnapshot.mssStatus === 'CONFIRMED_BULL'
              ? 'BULL MSS'
              : ictSnapshot.mssStatus === 'CONFIRMED_BEAR'
              ? 'BEAR MSS'
              : ictSnapshot.mssStatus}
          </div>
        </div>

        <div className="bg-[#070b12] border border-slate-800/70 rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase">Nearest POI</div>
          <div className="font-bold text-sky-300 mt-0.5 truncate" title={ictSnapshot.nearestPoiLabel}>
            {ictSnapshot.nearestPoiLabel}
          </div>
        </div>

        <div className="bg-[#070b12] border border-slate-800/70 rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase">OTE (0.618 - 0.786)</div>
          <div className="font-bold text-amber-300 mt-0.5 flex items-center gap-1">
            <Target className="w-3 h-3" />
            {activeOte.fib618.toFixed(meta.decimals)}
          </div>
        </div>

        <div className="bg-[#070b12] border border-slate-800/70 rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase">Learned Fill Depth</div>
          <div className="font-bold text-emerald-300 mt-0.5">
            {model.learnedAvgMitigationDepth.toFixed(1)}% (CE)
          </div>
        </div>
      </div>

      {/* AI Confidence Meter */}
      <div className="bg-[#070b12] border border-slate-800/80 rounded-md p-2.5">
        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
          <span className="text-slate-400 flex items-center gap-1">
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            AI Confidence:
          </span>
          <span
            className={`font-bold ${
              aiConfidence >= threshold ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {aiConfidence}% <span className="text-[10px] text-slate-500">(Gate: {threshold}%)</span>
          </span>
        </div>
        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              aiConfidence >= threshold
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : 'bg-gradient-to-r from-amber-500 to-orange-400'
            }`}
            style={{ width: `${aiConfidence}%` }}
          />
        </div>
      </div>

      {/* 4-Step ICT Confluence Checklist */}
      <div className="bg-[#070b12] border border-slate-800/80 rounded-md p-2.5 flex flex-col gap-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5">
          4-Step ICT Confluence Validator
        </div>
        {[
          {
            label: '1. Liquidity Sweep (BSL / SSL)',
            passed: Boolean(setup?.step1LiquiditySweep),
            sub: setup?.step1LiquiditySweep
              ? `${setup.step1LiquiditySweep.type} (${setup.step1LiquiditySweep.aggressionRatio}x ATR)`
              : 'Scanning swings',
          },
          {
            label: '2. Structure Shift (MSS / BOS)',
            passed: Boolean(setup?.step2StructureShift),
            sub: setup?.step2StructureShift
              ? `${setup.step2StructureShift.type} (${setup.step2StructureShift.displacementRatio}x ATR)`
              : 'Awaiting break',
          },
          {
            label: '3. FVG / OB in Valid Zone',
            passed: Boolean((setup?.step3Poi.fvg || setup?.step3Poi.ob) && setup?.inCorrectDealingZone),
            sub: setup?.inCorrectDealingZone ? dr.currentZone : 'Wrong side of 50% EQ',
          },
          {
            label: '4. Mitigation / OTE Trigger',
            passed: Boolean(setup?.step4InTriggerZone),
            sub: setup?.inOteZone ? 'Inside OTE 0.618-0.786' : setup?.step4InTriggerZone ? 'Retesting POI' : 'Waiting pullback',
          },
        ].map((step, i) => (
          <div key={i} className="flex items-center justify-between text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              {step.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              )}
              {step.label}
            </span>
            <span className={step.passed ? 'text-emerald-400' : 'text-slate-500'}>
              {step.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Pair Online SGD Learned Weights Mini-Inspector */}
      <div className="bg-[#070b12] border border-slate-800/80 rounded-md p-2.5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400 mb-1.5">
            <span>{meta.shortName} Learned Weights (SGD)</span>
            <span className="text-purple-400">v{model.version.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Sweep:</span>
              <span className="text-slate-200">{model.weights.sweepAggression.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Displace:</span>
              <span className="text-slate-200">{model.weights.displacementForce.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">EQ/OTE:</span>
              <span className="text-slate-200">{model.weights.equilibriumPosition.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">FVG Size:</span>
              <span className="text-slate-200">{model.weights.fvgSizeRatio.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Auto-Trade Master Toggle Button matching UI Diagram */}
        <button
          onClick={() => updateRiskSettings({ autoTradeEnabled: !risk.autoTradeEnabled })}
          className={`mt-3 w-full py-2 px-3 rounded-md font-mono text-xs font-bold flex items-center justify-center gap-2 border transition ${
            risk.autoTradeEnabled
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.18)]'
              : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          [ AUTO-TRADE: {risk.autoTradeEnabled ? 'ON' : 'OFF'} ]
        </button>
      </div>
    </div>
  );
};
