import React from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { Shield, ArrowUpRight, ArrowDownRight, AlertTriangle, RotateCcw } from 'lucide-react';

export const OrderRiskPanel: React.FC = () => {
  const {
    risk,
    dailyPnl,
    riskShieldTripped,
    ictSnapshot,
    updateRiskSettings,
    executeManualTrade,
    resetRiskShield,
  } = useTerminalStore();

  const dr = ictSnapshot.dealingRange;
  const buyingInPremiumWarning = dr.currentZone === 'PREMIUM';
  const sellingInDiscountWarning = dr.currentZone === 'DISCOUNT';

  return (
    <div className="flex flex-col justify-between gap-3 bg-[#0b111d] border border-slate-800/80 rounded-lg p-3.5 h-full">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-slate-200">
            ORDER & RISK GUARD SHIELD
          </h2>
        </div>

        {/* Contract Type Selector: Rise/Fall vs Multipliers */}
        <div className="flex items-center bg-[#070b12] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
          <button
            onClick={() => updateRiskSettings({ contractCategory: 'RISE_FALL' })}
            className={`px-2 py-0.5 rounded transition ${
              risk.contractCategory === 'RISE_FALL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Rise/Fall
          </button>
          <button
            onClick={() => updateRiskSettings({ contractCategory: 'MULTIPLIER' })}
            className={`px-2 py-0.5 rounded transition ${
              risk.contractCategory === 'MULTIPLIER'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Multipliers
          </button>
        </div>
      </div>

      {/* Risk Shield Alert if Tripped */}
      {riskShieldTripped && (
        <div className="flex items-center justify-between bg-rose-500/15 border border-rose-500/40 rounded px-3 py-2 text-xs font-mono text-rose-200">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            {riskShieldTripped}
          </span>
          <button
            onClick={resetRiskShield}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/30 hover:bg-rose-500/50 text-rose-100 text-[11px]"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      )}

      {/* Inputs Grid matching user ASCII UI diagram */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
        <div className="bg-[#070b12] border border-slate-800/80 rounded p-2">
          <label className="block text-[10px] text-slate-500 uppercase mb-1">
            Stake ($ USD)
          </label>
          <input
            type="number"
            min={0.35}
            step={1}
            value={risk.stake}
            onChange={(e) => updateRiskSettings({ stake: Math.max(0.35, Number(e.target.value)) })}
            className="w-full bg-transparent text-slate-100 font-bold focus:outline-none"
          />
        </div>

        <div className="bg-[#070b12] border border-slate-800/80 rounded p-2">
          <label className="block text-[10px] text-slate-500 uppercase mb-1">
            {risk.contractCategory === 'RISE_FALL' ? 'Duration' : 'Multiplier'}
          </label>
          {risk.contractCategory === 'RISE_FALL' ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                value={risk.durationValue}
                onChange={(e) =>
                  updateRiskSettings({ durationValue: Math.max(1, Number(e.target.value)) })
                }
                className="w-12 bg-transparent text-slate-100 font-bold focus:outline-none"
              />
              <select
                value={risk.durationUnit}
                onChange={(e) =>
                  updateRiskSettings({ durationUnit: e.target.value as 't' | 'm' })
                }
                className="bg-slate-900 text-emerald-300 text-[11px] rounded px-1 py-0.5 border border-slate-800 focus:outline-none"
              >
                <option value="t">Ticks</option>
                <option value="m">Mins</option>
              </select>
            </div>
          ) : (
            <select
              value={risk.multiplier}
              onChange={(e) => updateRiskSettings({ multiplier: Number(e.target.value) })}
              className="w-full bg-transparent text-emerald-300 font-bold focus:outline-none"
            >
              <option value={40} className="bg-slate-900">x40</option>
              <option value={100} className="bg-slate-900">x100</option>
              <option value={200} className="bg-slate-900">x200</option>
              <option value={400} className="bg-slate-900">x400</option>
            </select>
          )}
        </div>

        <div className="bg-[#070b12] border border-slate-800/80 rounded p-2">
          <label className="block text-[10px] text-slate-500 uppercase mb-1">
            Take Profit ($)
          </label>
          <input
            type="number"
            min={5}
            step={10}
            value={risk.dailyTakeProfit}
            onChange={(e) =>
              updateRiskSettings({ dailyTakeProfit: Math.max(5, Number(e.target.value)) })
            }
            className="w-full bg-transparent text-emerald-400 font-bold focus:outline-none"
          />
        </div>

        <div className="bg-[#070b12] border border-slate-800/80 rounded p-2">
          <label className="block text-[10px] text-slate-500 uppercase mb-1">
            Max Daily Loss ($)
          </label>
          <input
            type="number"
            min={5}
            step={5}
            value={risk.maxDailyLoss}
            onChange={(e) =>
              updateRiskSettings({ maxDailyLoss: Math.max(5, Number(e.target.value)) })
            }
            className="w-full bg-transparent text-rose-400 font-bold focus:outline-none"
          />
        </div>
      </div>

      {/* ICT Equilibrium Rule Guard Notice + Shadow Paper Learning Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono bg-[#070b12] px-2.5 py-1.5 rounded border border-slate-800/70">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Session PnL:</span>
          <span className={dailyPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
            {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
          </span>
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={risk.shadowLearningEnabled}
            onChange={(e) => updateRiskSettings({ shadowLearningEnabled: e.target.checked })}
            className="rounded accent-emerald-500"
          />
          <span>Shadow Paper Learning (Background SGD)</span>
        </label>
      </div>

      {/* 1-Click Manual Execution Buttons: [ BUY / CALL ] and [ SELL / PUT ] */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => executeManualTrade('CALL')}
          disabled={Boolean(riskShieldTripped)}
          className="group relative py-2.5 px-4 rounded-md font-mono font-bold text-xs flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 transition disabled:opacity-40"
        >
          <ArrowUpRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
          <span>
            [ BUY / {risk.contractCategory === 'RISE_FALL' ? 'RISE (CALL)' : 'MULT UP'} ]
          </span>
          {buyingInPremiumWarning && (
            <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded">
              In Premium!
            </span>
          )}
        </button>

        <button
          onClick={() => executeManualTrade('PUT')}
          disabled={Boolean(riskShieldTripped)}
          className="group relative py-2.5 px-4 rounded-md font-mono font-bold text-xs flex items-center justify-center gap-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 transition disabled:opacity-40"
        >
          <ArrowDownRight className="w-4 h-4 text-rose-400 group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition" />
          <span>
            [ SELL / {risk.contractCategory === 'RISE_FALL' ? 'FALL (PUT)' : 'MULT DOWN'} ]
          </span>
          {sellingInDiscountWarning && (
            <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded">
              In Discount!
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
