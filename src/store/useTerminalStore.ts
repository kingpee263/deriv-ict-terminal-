import { create } from 'zustand';
import {
  Candle,
  IctAnalysisSnapshot,
  LearningLogEntry,
  PairModelWeights,
  RiskSettings,
  TradePosition,
  VolatilitySymbol,
} from '../types/ict';
import { VOLATILITY_PAIRS } from '../constants/pairs';
import { analyzeIctMarket } from '../engine/ictEngine';
import {
  createDefaultPairWeights,
  importPairWeightsJson,
  loadAllPairWeights,
  resetAllPairWeights,
  savePairWeights,
} from '../services/pairMemoryDb';
import { updatePairModelWeightsSGD } from '../engine/mlEngine';
import { ConnectionState, derivSocket } from '../services/derivWs';

interface OverlayToggles {
  showFvg: boolean;
  showOb: boolean;
  showMssBos: boolean;
  showLiquiditySweeps: boolean;
  showDealingRangeOte: boolean;
}

interface TerminalState {
  symbol: VolatilitySymbol;
  granularity: number; // 60 = 1m, 180 = 3m, 300 = 5m
  connectionState: ConnectionState;
  apiToken: string;
  appId: string;
  accountLoginId: string;
  balance: number;
  dailyPnl: number;
  consecutiveLosses: number;
  riskShieldTripped: string | null;
  turboTraining: boolean;

  candles: Candle[];
  ictSnapshot: IctAnalysisSnapshot;
  pairModels: Record<VolatilitySymbol, PairModelWeights>;
  positions: TradePosition[];
  learningLogs: LearningLogEntry[];
  risk: RiskSettings;
  overlays: OverlayToggles;

  // Actions
  initializeTerminal: () => Promise<void>;
  setSymbol: (symbol: VolatilitySymbol) => void;
  setGranularity: (granularity: number) => void;
  setTurboTraining: (enabled: boolean) => void;
  updateRiskSettings: (partial: Partial<RiskSettings>) => void;
  toggleOverlay: (key: keyof OverlayToggles) => void;
  saveApiCredentials: (token: string, appId: string) => void;
  executeManualTrade: (direction: 'CALL' | 'PUT') => void;
  resetRiskShield: () => void;
  exportBrainJson: () => string;
  importBrainJson: (jsonText: string) => Promise<void>;
  resetAllModels: () => Promise<void>;
}

const initialSymbol: VolatilitySymbol = 'R_100';
const defaultModels = {
  R_10: createDefaultPairWeights('R_10'),
  '1HZ10V': createDefaultPairWeights('1HZ10V'),
  '1HZ15V': createDefaultPairWeights('1HZ15V'),
  R_25: createDefaultPairWeights('R_25'),
  R_50: createDefaultPairWeights('R_50'),
  R_75: createDefaultPairWeights('R_75'),
  R_100: createDefaultPairWeights('R_100'),
  '1HZ100V': createDefaultPairWeights('1HZ100V'),
};

const initialLogs: LearningLogEntry[] = [
  {
    id: 'seed-log-1',
    timestamp: Date.now() - 180000,
    symbol: 'R_10',
    type: 'TRADE_EXEC',
    title: '#1044: Swept SSL on Vol 10 -> Bullish MSS -> Won +$9.50',
    detail: 'Retested 50% BISI FVG in Discount (OTE 0.618). SGD updated +0.032 to OTE-discount/prem.',
    confidence: 84,
    weightDelta: '+0.032 to OTE-discount/prem',
    positive: true,
  },
  {
    id: 'seed-log-2',
    timestamp: Date.now() - 75000,
    symbol: 'R_100',
    type: 'SGD_UPDATE',
    title: '#1045: Active Bearish FVG (SIBI) on Vol 100 -> AI Scored: 82%',
    detail: 'BSL liquidity sweep rejected 2.3x ATR above Equal Highs. Model updated Vol 100 weights: +0.041 to BSL/SSL-sweep.',
    confidence: 82,
    weightDelta: '+0.041 to BSL/SSL-sweep',
    positive: true,
  },
];

let lastAutoTradeTime = 0;
let lastShadowTradeTime = 0;
let lastLoggedSweepId = '';
let lastLoggedBreakId = '';

export const useTerminalStore = create<TerminalState>((set, get) => ({
  symbol: initialSymbol,
  granularity: 60,
  connectionState: 'CONNECTING',
  apiToken: localStorage.getItem('deriv_ict_api_token') || '',
  appId: localStorage.getItem('deriv_ict_app_id') || '1089',
  accountLoginId: 'PAPER-INSTITUTIONAL',
  balance: 1450.0,
  dailyPnl: 48.5,
  consecutiveLosses: 0,
  riskShieldTripped: null,
  turboTraining: false,

  candles: [],
  ictSnapshot: analyzeIctMarket(initialSymbol, [], defaultModels[initialSymbol]),
  pairModels: defaultModels,
  positions: [],
  learningLogs: initialLogs,

  risk: {
    stake: 10.0,
    contractCategory: 'RISE_FALL',
    multiplier: 100,
    durationValue: 5,
    durationUnit: 't',
    dailyTakeProfit: 100.0,
    maxDailyLoss: 50.0,
    maxConsecutiveLosses: 3,
    minAiConfidence: 76,
    autoTradeEnabled: true,
    shadowLearningEnabled: true,
  },

  overlays: {
    showFvg: true,
    showOb: true,
    showMssBos: true,
    showLiquiditySweeps: true,
    showDealingRangeOte: true,
  },

  initializeTerminal: async () => {
    const loadedModels = await loadAllPairWeights();
    set({ pairModels: loadedModels });

    const state = get();
    derivSocket.init(state.symbol, state.granularity, state.apiToken, state.appId, {
      onStatusChange: (status, accountInfo) => {
        if (accountInfo) {
          set({
            connectionState: status,
            balance: accountInfo.balance,
            accountLoginId: accountInfo.loginid,
          });
        } else {
          set({ connectionState: status });
        }
      },
      onInitialCandles: (candles) => {
        const st = get();
        const model = st.pairModels[st.symbol];
        const snapshot = analyzeIctMarket(st.symbol, candles, model);
        set({ candles, ictSnapshot: snapshot });
      },
      onCandleUpdate: (candle) => {
        const st = get();
        const updatedCandles = [...st.candles];
        const last = updatedCandles[updatedCandles.length - 1];
        if (last && last.time === candle.time) {
          updatedCandles[updatedCandles.length - 1] = candle;
        } else {
          updatedCandles.push(candle);
          if (updatedCandles.length > 220) updatedCandles.shift();
        }

        const currentModel = st.pairModels[st.symbol];
        const snapshot = analyzeIctMarket(st.symbol, updatedCandles, currentModel);

        // Log newly detected sweeps or MSS events
        const latestSweep = snapshot.sweeps[snapshot.sweeps.length - 1];
        const latestBreak = snapshot.structureBreaks[snapshot.structureBreaks.length - 1];
        const newLogs = [...st.learningLogs];

        if (latestSweep && latestSweep.id !== lastLoggedSweepId) {
          lastLoggedSweepId = latestSweep.id;
          newLogs.unshift({
            id: `log-sweep-${Date.now()}`,
            timestamp: Date.now(),
            symbol: st.symbol,
            type: 'SWEEP',
            title: `Liquidity Sweep (${latestSweep.type}) @ ${latestSweep.levelPrice.toFixed(
              VOLATILITY_PAIRS[st.symbol].decimals
            )}`,
            detail: `Wick rejection ${latestSweep.aggressionRatio}x ATR ${
              latestSweep.isEqualHighLow ? '(Swept Equal Highs/Lows Pool)' : ''
            }. Scanning for displacement MSS.`,
            positive: true,
          });
        }

        if (latestBreak && latestBreak.id !== lastLoggedBreakId) {
          lastLoggedBreakId = latestBreak.id;
          newLogs.unshift({
            id: `log-break-${Date.now()}`,
            timestamp: Date.now(),
            symbol: st.symbol,
            type: 'MSS',
            title: `${latestBreak.direction} ${latestBreak.type} Confirmed (${latestBreak.displacementRatio}x ATR)`,
            detail: `Broken swing structure @ ${latestBreak.brokenLevel.toFixed(
              VOLATILITY_PAIRS[st.symbol].decimals
            )}. Dealing Range: ${snapshot.dealingRange.currentZone} (${snapshot.dealingRange.rangePct.toFixed(
              0
            )}%).`,
            positive: latestBreak.direction === 'BULLISH',
          });
        }

        // Update & settle open positions (both Live/Paper and Shadow Learning Trades)
        const nowMs = Date.now();
        let balance = st.balance;
        let dailyPnl = st.dailyPnl;
        let consecutiveLosses = st.consecutiveLosses;
        let riskShieldTripped = st.riskShieldTripped;
        let activeModel = currentModel;

        const updatedPositions = st.positions.map((pos) => {
          if (pos.status !== 'OPEN' || pos.symbol !== st.symbol) return pos;

          const currentPrice = candle.close;
          const priceDiff =
            pos.direction === 'CALL'
              ? currentPrice - pos.entryPrice
              : pos.entryPrice - currentPrice;

          const mfe = Math.max(pos.maxFavorableExcursion, priceDiff);
          const mae = Math.min(pos.maxAdverseExcursion, priceDiff);

          const isExpired = nowMs >= pos.expiryTime;
          if (!isExpired) {
            const floatingPnl =
              pos.category === 'RISE_FALL'
                ? priceDiff >= 0
                  ? Number((pos.stake * 0.92).toFixed(2))
                  : -pos.stake
                : Number(
                    (
                      (priceDiff / Math.max(0.0001, pos.entryPrice)) *
                      pos.stake *
                      (pos.multiplier || 100)
                    ).toFixed(2)
                  );
            return {
              ...pos,
              currentPrice,
              pnl: floatingPnl,
              maxFavorableExcursion: mfe,
              maxAdverseExcursion: mae,
            };
          }

          // Position expired -> Settle & run Online SGD Weight Update!
          const won = priceDiff > 0;
          const finalPnl = pos.isShadowPaper
            ? 0
            : won
            ? Number((pos.stake * 0.95).toFixed(2))
            : -pos.stake;

          if (!pos.isShadowPaper) {
            balance = Number((balance + finalPnl).toFixed(2));
            dailyPnl = Number((dailyPnl + finalPnl).toFixed(2));
            consecutiveLosses = won ? 0 : consecutiveLosses + 1;

            // Check Hard Risk Guards
            if (dailyPnl <= -Math.abs(st.risk.maxDailyLoss)) {
              riskShieldTripped = `Max Daily Loss Reached (-$${Math.abs(dailyPnl).toFixed(2)})`;
            } else if (dailyPnl >= Math.abs(st.risk.dailyTakeProfit)) {
              riskShieldTripped = `Daily Take Profit Target Locked (+$${dailyPnl.toFixed(2)})`;
            } else if (consecutiveLosses >= st.risk.maxConsecutiveLosses) {
              riskShieldTripped = `Max Consecutive Losses Guard (${consecutiveLosses} losses)`;
            }
          }

          // Online Incremental SGD Weight Update for this pair
          const activeFvgDepth = snapshot.fvgs[0]?.mitigatedPct || activeModel.learnedAvgMitigationDepth;
          const sgd = updatePairModelWeightsSGD(
            activeModel,
            pos.features,
            won,
            activeFvgDepth,
            pos.isShadowPaper
          );
          activeModel = sgd.updatedModel;
          savePairWeights(activeModel);

          newLogs.unshift({
            id: `log-sgd-${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            symbol: pos.symbol,
            type: pos.isShadowPaper ? 'SHADOW_LEARN' : 'SGD_UPDATE',
            title: pos.isShadowPaper
              ? `Shadow Trade ${won ? 'Validated (+Win)' : 'Filtered (-Loss)'} on ${
                  VOLATILITY_PAIRS[pos.symbol].shortName
                }`
              : `#${pos.id.slice(-4)}: ${pos.setupSummary} -> ${
                  won ? `Won +$${finalPnl.toFixed(2)}` : `Lost -$${Math.abs(finalPnl).toFixed(2)}`
                }`,
            detail: `[Model v${activeModel.version.toFixed(2)} updated ${
              VOLATILITY_PAIRS[pos.symbol].shortName
            } weights: ${sgd.deltaSummary}]`,
            confidence: pos.aiConfidence,
            weightDelta: sgd.deltaSummary,
            positive: won,
          });

          return {
            ...pos,
            currentPrice,
            exitPrice: currentPrice,
            pnl: finalPnl,
            status: won ? ('WON' as const) : ('LOST' as const),
            maxFavorableExcursion: mfe,
            maxAdverseExcursion: mae,
          };
        });

        const updatedPairModels = {
          ...st.pairModels,
          [st.symbol]: activeModel,
        };

        // Check if Automated AI-Gated Signal Trigger or Shadow Trade should fire
        const setup = snapshot.activeSetup;
        const openForSymbol = updatedPositions.filter(
          (p) => p.status === 'OPEN' && p.symbol === st.symbol
        );
        const hasOpenReal = openForSymbol.some((p) => !p.isShadowPaper);
        const hasOpenShadow = openForSymbol.some((p) => p.isShadowPaper);

        const requiredConfidence = Math.max(
          st.risk.minAiConfidence,
          activeModel.dynamicThreshold
        );

        const cooldownMs = st.turboTraining ? 2500 : 9000;

        if (
          setup &&
          st.risk.autoTradeEnabled &&
          !riskShieldTripped &&
          !hasOpenReal &&
          setup.aiConfidence >= requiredConfidence &&
          setup.inCorrectDealingZone &&
          setup.step4InTriggerZone &&
          nowMs - lastAutoTradeTime > cooldownMs
        ) {
          lastAutoTradeTime = nowMs;
          const direction: 'CALL' | 'PUT' = setup.direction === 'BULLISH' ? 'CALL' : 'PUT';
          const durationMs =
            st.risk.durationUnit === 't'
              ? st.risk.durationValue * (st.turboTraining ? 700 : 2000)
              : st.risk.durationValue * (st.turboTraining ? 3000 : 15000);

          const sentLive = derivSocket.placeLiveDerivOrder({
            symbol: st.symbol,
            direction,
            category: st.risk.contractCategory,
            stake: st.risk.stake,
            duration: st.risk.durationValue,
            durationUnit: st.risk.durationUnit,
            multiplier: st.risk.multiplier,
          });

          const newPos: TradePosition = {
            id: `ICT-${Math.floor(1000 + Math.random() * 9000)}`,
            symbol: st.symbol,
            direction,
            category: st.risk.contractCategory,
            isShadowPaper: false,
            isLiveApi: sentLive,
            entryTime: nowMs,
            expiryTime: nowMs + durationMs,
            durationTicksOrCandles: st.risk.durationValue,
            durationUnit: st.risk.durationUnit,
            entryPrice: candle.close,
            currentPrice: candle.close,
            stopLoss: setup.stopLoss,
            takeProfit: setup.takeProfit,
            stake: st.risk.stake,
            multiplier: st.risk.multiplier,
            pnl: 0,
            status: 'OPEN',
            aiConfidence: setup.aiConfidence,
            setupSummary: setup.summary,
            features: setup.features,
            maxFavorableExcursion: 0,
            maxAdverseExcursion: 0,
          };

          updatedPositions.unshift(newPos);
          newLogs.unshift({
            id: `log-exec-${nowMs}`,
            timestamp: nowMs,
            symbol: st.symbol,
            type: 'TRADE_EXEC',
            title: `AI Auto-Executed ${direction} (${
              direction === 'CALL' ? 'Rise' : 'Fall'
            }) on ${VOLATILITY_PAIRS[st.symbol].shortName} @ ${candle.close}`,
            detail: `${setup.summary} | AI Confidence: ${setup.aiConfidence}% (Threshold: ${requiredConfidence}%)`,
            confidence: setup.aiConfidence,
            positive: true,
          });
        } else if (
          setup &&
          st.risk.shadowLearningEnabled &&
          !hasOpenShadow &&
          setup.confluenceCount >= 2 &&
          nowMs - lastShadowTradeTime > cooldownMs * 1.1
        ) {
          // Spawn a background Shadow Paper Trade to train the model without risking capital
          lastShadowTradeTime = nowMs;
          const direction: 'CALL' | 'PUT' = setup.direction === 'BULLISH' ? 'CALL' : 'PUT';
          const durationMs = st.turboTraining ? 2800 : 8000;

          const shadowPos: TradePosition = {
            id: `SHDW-${Math.floor(1000 + Math.random() * 9000)}`,
            symbol: st.symbol,
            direction,
            category: 'RISE_FALL',
            isShadowPaper: true,
            isLiveApi: false,
            entryTime: nowMs,
            expiryTime: nowMs + durationMs,
            durationTicksOrCandles: 5,
            durationUnit: 't',
            entryPrice: candle.close,
            currentPrice: candle.close,
            stopLoss: setup.stopLoss,
            takeProfit: setup.takeProfit,
            stake: 0,
            pnl: 0,
            status: 'OPEN',
            aiConfidence: setup.aiConfidence,
            setupSummary: `[Shadow] ${setup.summary}`,
            features: setup.features,
            maxFavorableExcursion: 0,
            maxAdverseExcursion: 0,
          };
          updatedPositions.unshift(shadowPos);
        }

        set({
          candles: updatedCandles,
          ictSnapshot: snapshot,
          positions: updatedPositions.slice(0, 40),
          learningLogs: newLogs.slice(0, 60),
          pairModels: updatedPairModels,
          balance,
          dailyPnl,
          consecutiveLosses,
          riskShieldTripped,
        });
      },
    });
  },

  setSymbol: (symbol) => {
    const st = get();
    set({ symbol });
    derivSocket.switchPairOrTimeframe(symbol, st.granularity);
  },

  setGranularity: (granularity) => {
    const st = get();
    set({ granularity });
    derivSocket.switchPairOrTimeframe(st.symbol, granularity);
  },

  setTurboTraining: (enabled) => {
    set({ turboTraining: enabled });
    derivSocket.setTurboMode(enabled);
  },

  updateRiskSettings: (partial) => {
    set((state) => ({
      risk: { ...state.risk, ...partial },
    }));
  },

  toggleOverlay: (key) => {
    set((state) => ({
      overlays: { ...state.overlays, [key]: !state.overlays[key] },
    }));
  },

  saveApiCredentials: (token, appId) => {
    localStorage.setItem('deriv_ict_api_token', token.trim());
    localStorage.setItem('deriv_ict_app_id', appId.trim() || '1089');
    set({ apiToken: token.trim(), appId: appId.trim() || '1089' });
    derivSocket.updateCredentials(token, appId);
  },

  executeManualTrade: (direction) => {
    const st = get();
    if (st.candles.length === 0) return;
    const lastCandle = st.candles[st.candles.length - 1];
    const setup = st.ictSnapshot.activeSetup;
    const nowMs = Date.now();

    const durationMs =
      st.risk.durationUnit === 't'
        ? st.risk.durationValue * (st.turboTraining ? 700 : 2000)
        : st.risk.durationValue * (st.turboTraining ? 3000 : 15000);

    const sentLive = derivSocket.placeLiveDerivOrder({
      symbol: st.symbol,
      direction,
      category: st.risk.contractCategory,
      stake: st.risk.stake,
      duration: st.risk.durationValue,
      durationUnit: st.risk.durationUnit,
      multiplier: st.risk.multiplier,
    });

    const atr = st.ictSnapshot.atr;
    const decimals = VOLATILITY_PAIRS[st.symbol].decimals;
    const stopLoss =
      direction === 'CALL'
        ? Number((lastCandle.close - atr * 1.8).toFixed(decimals))
        : Number((lastCandle.close + atr * 1.8).toFixed(decimals));
    const takeProfit =
      direction === 'CALL'
        ? Number((lastCandle.close + atr * 3.0).toFixed(decimals))
        : Number((lastCandle.close - atr * 3.0).toFixed(decimals));

    const manualPos: TradePosition = {
      id: `MAN-${Math.floor(1000 + Math.random() * 9000)}`,
      symbol: st.symbol,
      direction,
      category: st.risk.contractCategory,
      isShadowPaper: false,
      isLiveApi: sentLive,
      entryTime: nowMs,
      expiryTime: nowMs + durationMs,
      durationTicksOrCandles: st.risk.durationValue,
      durationUnit: st.risk.durationUnit,
      entryPrice: lastCandle.close,
      currentPrice: lastCandle.close,
      stopLoss,
      takeProfit,
      stake: st.risk.stake,
      multiplier: st.risk.multiplier,
      pnl: 0,
      status: 'OPEN',
      aiConfidence: setup?.aiConfidence || 75,
      setupSummary: setup?.summary || `Manual ${direction} in ${st.ictSnapshot.dealingRange.currentZone}`,
      features: setup?.features || {
        displacementForce: 0.65,
        sweepAggression: 0.6,
        mitigationSpeed: 0.7,
        equilibriumPosition: 0.75,
        fvgSizeRatio: 0.6,
        regimeAlignment: 0.7,
      },
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
    };

    set((state) => ({
      positions: [manualPos, ...state.positions].slice(0, 40),
      learningLogs: [
        {
          id: `log-man-${nowMs}`,
          timestamp: nowMs,
          symbol: state.symbol,
          type: 'TRADE_EXEC',
          title: `Manual ${direction === 'CALL' ? 'BUY / RISE' : 'SELL / FALL'} Executed ($${
            state.risk.stake
          })`,
          detail: `Entry @ ${lastCandle.close} | Zone: ${state.ictSnapshot.dealingRange.currentZone} (${state.ictSnapshot.dealingRange.rangePct.toFixed(
            1
          )}%)`,
          confidence: manualPos.aiConfidence,
          positive: direction === 'CALL',
        },
        ...state.learningLogs,
      ].slice(0, 60),
    }));
  },

  resetRiskShield: () => {
    set({ riskShieldTripped: null, consecutiveLosses: 0, dailyPnl: 0 });
  },

  exportBrainJson: () => {
    const st = get();
    return JSON.stringify(st.pairModels, null, 2);
  },

  importBrainJson: async (jsonText: string) => {
    const updated = await importPairWeightsJson(jsonText);
    set({ pairModels: updated });
  },

  resetAllModels: async () => {
    const fresh = await resetAllPairWeights();
    set({ pairModels: fresh });
  },
}));
