import React, { useEffect, useState } from 'react';
import { useTerminalStore } from './store/useTerminalStore';
import { PAIR_LIST, VOLATILITY_PAIRS } from './constants/pairs';
import { getPairAccuracyPct } from './engine/mlEngine';
import { IctRadarPanel } from './components/IctRadarPanel';
import { IctChart } from './components/IctChart';
import { OrderRiskPanel } from './components/OrderRiskPanel';
import { PositionsAndLearningLog } from './components/PositionsAndLearningLog';
import { Modals } from './components/Modals';
import { VolatilitySymbol } from './types/ict';
import {
  Cpu,
  Wifi,
  Wallet,
  Key,
  Brain,
  Globe,
  Activity,
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    symbol,
    connectionState,
    balance,
    accountLoginId,
    pairModels,
    initializeTerminal,
    setSymbol,
  } = useTerminalStore();

  const [activeModal, setActiveModal] = useState<'API' | 'BRAIN' | 'DEPLOY' | null>(null);

  useEffect(() => {
    initializeTerminal();
  }, []);

  const currentModel = pairModels[symbol];
  const accuracy = getPairAccuracyPct(currentModel);
  const pairMeta = VOLATILITY_PAIRS[symbol];

  return (
    <div className="min-h-screen flex flex-col bg-[#070b12] text-slate-100 select-none">
      {/* Top Institutional Navigation Bar matching user ASCII layout */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#0b111d] border-b border-slate-800/90">
        {/* Left: Brand + Pair Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="font-mono font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                DERIV ICT AI TERMINAL
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  PRO
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 hidden sm:block">
                Institutional Liquidity, FVG & Online Adaptive SGD Engine
              </div>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Volatility Index Pair Selector */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400 text-[11px]">Pair:</span>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as VolatilitySymbol)}
              className="bg-[#070b12] text-emerald-300 font-bold px-2.5 py-1.5 rounded-md border border-slate-700/90 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {PAIR_LIST.map((p) => (
                <option key={p.symbol} value={p.symbol} className="bg-[#0b111d] text-slate-100">
                  {p.name} ({p.shortName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Balance, Model Accuracy, Connection Status & Action Modals */}
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          {/* WebSocket Feed Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#070b12] border border-slate-800">
            <Wifi
              className={`w-3.5 h-3.5 ${
                connectionState === 'LIVE_WS' || connectionState === 'AUTHENTICATED'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            />
            <span className="text-[11px] text-slate-300">
              {connectionState === 'AUTHENTICATED'
                ? `LIVE API (${accountLoginId})`
                : connectionState === 'LIVE_WS'
                ? 'DERIV WS LIVE'
                : 'SYNTHETIC FEED'}
            </span>
          </div>

          {/* Account Balance */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#070b12] border border-slate-800">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 text-[11px]">Bal:</span>
            <span className="font-bold text-emerald-300">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>

          {/* Pair Model Accuracy & Version */}
          <button
            onClick={() => setActiveModal('BRAIN')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition"
            title="Click to inspect or export/import IndexedDB Pair Memory weights"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-300 text-[11px]">Model Acc:</span>
            <span className="font-bold text-purple-300">
              {accuracy}% (v{currentModel.version.toFixed(1)})
            </span>
          </button>

          {/* API Token Button */}
          <button
            onClick={() => setActiveModal('API')}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1 text-[11px] transition"
          >
            <Key className="w-3 h-3 text-emerald-400" />
            <span>API Token</span>
          </button>

          {/* Deployment Guide Button */}
          <button
            onClick={() => setActiveModal('DEPLOY')}
            className="px-2.5 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 flex items-center gap-1 text-[11px] transition"
          >
            <Globe className="w-3 h-3 text-sky-400" />
            <span className="hidden md:inline">Deploy (.site)</span>
          </button>
        </div>
      </header>

      {/* Pair Behavioral Profile Sub-bar */}
      <div className="px-4 py-1 bg-[#080d16] border-b border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2 truncate">
          <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-slate-300 font-semibold">{pairMeta.shortName} Profile:</span>
          <span className="truncate">{pairMeta.description}</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500 shrink-0">
          <span>Displacement Gate: &gt;{pairMeta.defaultDisplacementMultiplier}x ATR</span>
          <span>Rule: Never Buy Premium (&gt;50%) | Never Sell Discount (&lt;50%)</span>
        </div>
      </div>

      {/* Main Institutional Grid Layout matching user blueprint */}
      <main className="flex-1 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Top-Left: ICT & AI Radar (3 columns on large screens) */}
        <div className="lg:col-span-3 flex flex-col">
          <IctRadarPanel />
        </div>

        {/* Top-Right: TradingView Lightweight Chart + ICT Overlays (9 columns on large screens) */}
        <div className="lg:col-span-9 flex flex-col min-h-[410px]">
          <IctChart />
        </div>

        {/* Bottom-Left: Order & Risk Guard Shield Panel (5 columns) */}
        <div className="lg:col-span-5 flex flex-col">
          <OrderRiskPanel />
        </div>

        {/* Bottom-Right: Live Positions & ICT Learning Log (7 columns) */}
        <div className="lg:col-span-7 flex flex-col">
          <PositionsAndLearningLog />
        </div>
      </main>

      {/* Modals for API Token, Brain Export/Import, and Vercel + Namecheap .site Deployment */}
      <Modals activeModal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
};
