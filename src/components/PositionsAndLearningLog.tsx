import React, { useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { VOLATILITY_PAIRS } from '../constants/pairs';
import { Terminal, Cpu, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

export const PositionsAndLearningLog: React.FC = () => {
  const { positions, learningLogs } = useTerminalStore();
  const [activeTab, setActiveTab] = useState<'LOG' | 'POSITIONS'>('LOG');

  const openCount = positions.filter((p) => p.status === 'OPEN').length;

  return (
    <div className="flex flex-col bg-[#0b111d] border border-slate-800/80 rounded-lg p-3.5 h-full">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-slate-200">
            LIVE POSITIONS & ICT LEARNING LOG
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-[#070b12] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
          <button
            onClick={() => setActiveTab('LOG')}
            className={`px-2.5 py-0.5 rounded transition ${
              activeTab === 'LOG'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ICT & SGD Stream ({learningLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('POSITIONS')}
            className={`px-2.5 py-0.5 rounded transition flex items-center gap-1 ${
              activeTab === 'POSITIONS'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Positions ({positions.length})
            {openCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>
        </div>
      </div>

      {activeTab === 'LOG' ? (
        <div className="flex-1 overflow-y-auto max-h-[210px] space-y-1.5 pr-1 font-mono text-xs">
          {learningLogs.map((entry) => {
            const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const isSgd = entry.type === 'SGD_UPDATE' || entry.type === 'SHADOW_LEARN';
            return (
              <div
                key={entry.id}
                className="bg-[#070b12] border border-slate-800/70 rounded px-2.5 py-1.5 flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[10px] text-slate-500">{timeStr}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      {VOLATILITY_PAIRS[entry.symbol].shortName}
                    </span>
                    <span
                      className={`font-semibold truncate ${
                        entry.positive === false ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {entry.title}
                    </span>
                  </div>
                  {entry.confidence && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                      AI: {entry.confidence}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  {isSgd && <Cpu className="w-3 h-3 text-purple-400 shrink-0" />}
                  <span className="truncate">{entry.detail}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[210px] space-y-1.5 pr-1 font-mono text-xs">
          {positions.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-slate-500 text-xs">
              No trades yet. Enable Auto-Trade, 10x AI Turbo, or click Buy/Sell to execute.
            </div>
          ) : (
            positions.map((pos) => {
              const decimals = VOLATILITY_PAIRS[pos.symbol].decimals;
              return (
                <div
                  key={pos.id}
                  className="bg-[#070b12] border border-slate-800/80 rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {pos.status === 'OPEN' ? (
                      <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                    ) : pos.status === 'WON' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200">{pos.id}</span>
                        <span
                          className={`text-[10px] px-1.5 rounded ${
                            pos.direction === 'CALL'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {pos.direction}
                        </span>
                        {pos.isShadowPaper && (
                          <span className="text-[10px] px-1.5 rounded bg-purple-500/20 text-purple-300">
                            SHADOW ML
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {VOLATILITY_PAIRS[pos.symbol].shortName} @{' '}
                        {pos.entryPrice.toFixed(decimals)} → {pos.currentPrice.toFixed(decimals)} |{' '}
                        {pos.setupSummary}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`font-bold ${
                        pos.isShadowPaper
                          ? 'text-purple-300'
                          : pos.pnl >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {pos.isShadowPaper
                        ? pos.status
                        : `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)}`}
                    </div>
                    <div className="text-[10px] text-slate-500">AI: {pos.aiConfidence}%</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
