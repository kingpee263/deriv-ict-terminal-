import {
  Candle,
  ConfluenceSetup,
  DealingRange,
  FairValueGap,
  IctAnalysisSnapshot,
  IctFeatureVector,
  LiquiditySweep,
  MarketBias,
  OrderBlock,
  PairModelWeights,
  StructureBreak,
  SwingPoint,
  VolatilitySymbol,
} from '../types/ict';
import { VOLATILITY_PAIRS } from '../constants/pairs';
import { scoreSetupWithPairModel } from './mlEngine';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 1;
  const trs: number[] = [];
  const start = Math.max(1, candles.length - period * 2);
  for (let i = start; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / Math.max(1, slice.length) || 0.01;
}

export function detectSwings(candles: Candle[], atr: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < 7) return swings;

  const eqTolerance = atr * 0.18;

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isSwingHigh =
      c.high >= candles[i - 1].high &&
      c.high >= candles[i - 2].high &&
      c.high >= candles[i + 1].high &&
      c.high >= candles[i + 2].high;

    const isSwingLow =
      c.low <= candles[i - 1].low &&
      c.low <= candles[i - 2].low &&
      c.low <= candles[i + 1].low &&
      c.low <= candles[i + 2].low;

    if (isSwingHigh) {
      const prevHighs = swings.filter((s) => s.type === 'HIGH').slice(-3);
      const isEqh = prevHighs.some((p) => Math.abs(p.price - c.high) <= eqTolerance);
      swings.push({
        index: i,
        time: c.time,
        price: c.high,
        type: 'HIGH',
        isEqualLiquidity: isEqh,
      });
    }

    if (isSwingLow) {
      const prevLows = swings.filter((s) => s.type === 'LOW').slice(-3);
      const isEql = prevLows.some((p) => Math.abs(p.price - c.low) <= eqTolerance);
      swings.push({
        index: i,
        time: c.time,
        price: c.low,
        type: 'LOW',
        isEqualLiquidity: isEql,
      });
    }
  }

  return swings;
}

export function calculateDealingRange(candles: Candle[], lookback: number = 65): DealingRange {
  const recent = candles.slice(-lookback);
  if (recent.length === 0) {
    return {
      high: 100,
      low: 90,
      highTime: 0,
      lowTime: 0,
      equilibrium: 95,
      currentZone: 'EQUILIBRIUM',
      rangePct: 50,
      oteBullish: { fib618: 93.82, fib705: 92.95, fib786: 92.14 },
      oteBearish: { fib618: 96.18, fib705: 97.05, fib786: 97.86 },
    };
  }

  let high = -Infinity;
  let low = Infinity;
  let highTime = recent[0].time;
  let lowTime = recent[0].time;

  for (const c of recent) {
    if (c.high > high) {
      high = c.high;
      highTime = c.time;
    }
    if (c.low < low) {
      low = c.low;
      lowTime = c.time;
    }
  }

  const span = Math.max(0.0001, high - low);
  const equilibrium = low + span * 0.5;
  const lastClose = recent[recent.length - 1].close;
  const rangePct = clamp(((lastClose - low) / span) * 100, 0, 100);

  const currentZone =
    rangePct > 51.5 ? 'PREMIUM' : rangePct < 48.5 ? 'DISCOUNT' : 'EQUILIBRIUM';

  // Bullish OTE is retracement from High down into Discount (0.618 to 0.786 retracement from High)
  const oteBullish = {
    fib618: high - span * 0.618,
    fib705: high - span * 0.705,
    fib786: high - span * 0.786,
  };

  // Bearish OTE is retracement from Low up into Premium (0.618 to 0.786 retracement from Low)
  const oteBearish = {
    fib618: low + span * 0.618,
    fib705: low + span * 0.705,
    fib786: low + span * 0.786,
  };

  return {
    high,
    low,
    highTime,
    lowTime,
    equilibrium,
    currentZone,
    rangePct,
    oteBullish,
    oteBearish,
  };
}

export function analyzeIctMarket(
  symbol: VolatilitySymbol,
  candles: Candle[],
  pairModel: PairModelWeights
): IctAnalysisSnapshot {
  const atr = calculateATR(candles, 14);
  const dealingRange = calculateDealingRange(candles, 65);
  const swings = detectSwings(candles, atr);
  const meta = VOLATILITY_PAIRS[symbol];

  const sweeps: LiquiditySweep[] = [];
  const structureBreaks: StructureBreak[] = [];
  const fvgs: FairValueGap[] = [];
  const orderBlocks: OrderBlock[] = [];

  if (candles.length < 15) {
    return {
      bias: 'NEUTRAL',
      atr,
      dealingRange,
      swings,
      sweeps,
      structureBreaks,
      fvgs,
      orderBlocks,
      activeSetup: null,
      nearestPoiLabel: 'Awaiting Data',
      nearestPoiPrice: null,
      mssStatus: 'SCANNING',
    };
  }

  const startIdx = Math.max(5, candles.length - 95);
  const displacementThreshold = Math.max(1.05, meta.defaultDisplacementMultiplier * 0.82);

  let runningBias: MarketBias = 'NEUTRAL';

  // 1. Scan for Liquidity Sweeps (BSL / SSL) & Structure Breaks (MSS / BOS) + Order Blocks
  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const dispRatio = body / atr;

    const priorHighs = swings.filter((s) => s.type === 'HIGH' && s.index < i - 1 && !s.broken);
    const priorLows = swings.filter((s) => s.type === 'LOW' && s.index < i - 1 && !s.broken);

    const lastSwingHigh = priorHighs[priorHighs.length - 1];
    const lastSwingLow = priorLows[priorLows.length - 1];

    // Check BSL Sweep (Wick above prior swing high, close back below swing high)
    if (lastSwingHigh && !lastSwingHigh.swept) {
      if (c.high > lastSwingHigh.price && c.close < lastSwingHigh.price) {
        lastSwingHigh.swept = true;
        const wickExt = c.high - lastSwingHigh.price;
        sweeps.push({
          id: `sweep-bsl-${c.time}`,
          time: c.time,
          candleIndex: i,
          type: 'BSL',
          levelPrice: lastSwingHigh.price,
          sweepExtreme: c.high,
          aggressionRatio: Number((wickExt / atr).toFixed(2)),
          isEqualHighLow: Boolean(lastSwingHigh.isEqualLiquidity),
        });
      }
    }

    // Check SSL Sweep (Wick below prior swing low, close back above swing low)
    if (lastSwingLow && !lastSwingLow.swept) {
      if (c.low < lastSwingLow.price && c.close > lastSwingLow.price) {
        lastSwingLow.swept = true;
        const wickExt = lastSwingLow.price - c.low;
        sweeps.push({
          id: `sweep-ssl-${c.time}`,
          time: c.time,
          candleIndex: i,
          type: 'SSL',
          levelPrice: lastSwingLow.price,
          sweepExtreme: c.low,
          aggressionRatio: Number((wickExt / atr).toFixed(2)),
          isEqualHighLow: Boolean(lastSwingLow.isEqualLiquidity),
        });
      }
    }

    // Check Bullish Structure Break (Close above prior swing high with displacement)
    if (lastSwingHigh && c.close > lastSwingHigh.price && dispRatio >= displacementThreshold * 0.78) {
      lastSwingHigh.broken = true;
      const isMss = runningBias === 'BEARISH' || runningBias === 'NEUTRAL' || sweeps.some((s) => s.type === 'SSL' && i - s.candleIndex <= 12);
      const breakType: 'MSS' | 'BOS' = isMss ? 'MSS' : 'BOS';
      runningBias = 'BULLISH';

      structureBreaks.push({
        id: `sb-bull-${c.time}`,
        time: c.time,
        startTime: lastSwingHigh.time,
        candleIndex: i,
        type: breakType,
        direction: 'BULLISH',
        brokenLevel: lastSwingHigh.price,
        displacementRatio: Number(dispRatio.toFixed(2)),
      });

      // Locate Bullish Order Block (last bearish candle prior to displacement wave)
      for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
        if (candles[k].close < candles[k].open) {
          const obTop = Math.max(candles[k].open, candles[k].close);
          const obBottom = candles[k].low;
          orderBlocks.push({
            id: `ob-bull-${candles[k].time}`,
            type: 'BULLISH',
            startTime: candles[k].time,
            endTime: candles[candles.length - 1].time,
            candleIndex: k,
            top: obTop,
            bottom: obBottom,
            meanThreshold: (obTop + obBottom) / 2,
            mitigated: false,
            causedMss: isMss,
          });
          break;
        }
      }
    }

    // Check Bearish Structure Break (Close below prior swing low with displacement)
    if (lastSwingLow && c.close < lastSwingLow.price && dispRatio >= displacementThreshold * 0.78) {
      lastSwingLow.broken = true;
      const isMss = runningBias === 'BULLISH' || runningBias === 'NEUTRAL' || sweeps.some((s) => s.type === 'BSL' && i - s.candleIndex <= 12);
      const breakType: 'MSS' | 'BOS' = isMss ? 'MSS' : 'BOS';
      runningBias = 'BEARISH';

      structureBreaks.push({
        id: `sb-bear-${c.time}`,
        time: c.time,
        startTime: lastSwingLow.time,
        candleIndex: i,
        type: breakType,
        direction: 'BEARISH',
        brokenLevel: lastSwingLow.price,
        displacementRatio: Number(dispRatio.toFixed(2)),
      });

      // Locate Bearish Order Block (last bullish candle prior to displacement wave)
      for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
        if (candles[k].close > candles[k].open) {
          const obTop = candles[k].high;
          const obBottom = Math.min(candles[k].open, candles[k].close);
          orderBlocks.push({
            id: `ob-bear-${candles[k].time}`,
            type: 'BEARISH',
            startTime: candles[k].time,
            endTime: candles[candles.length - 1].time,
            candleIndex: k,
            top: obTop,
            bottom: obBottom,
            meanThreshold: (obTop + obBottom) / 2,
            mitigated: false,
            causedMss: isMss,
          });
          break;
        }
      }
    }
  }

  // 2. Scan 3-Candle Imbalances for Fair Value Gaps (BISI & SIBI)
  for (let i = startIdx; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    const minGap = atr * 0.08;

    // Bullish FVG (BISI): Candle[1].High < Candle[3].Low
    if (c3.low - c1.high > minGap && c2.close > c2.open) {
      const top = c3.low;
      const bottom = c1.high;
      const size = top - bottom;
      const ce = (top + bottom) / 2;

      let lowestAfter = Infinity;
      for (let m = i + 1; m < candles.length; m++) {
        if (candles[m].low < lowestAfter) lowestAfter = candles[m].low;
      }

      const mitigatedPct =
        lowestAfter === Infinity
          ? 0
          : clamp(((top - lowestAfter) / size) * 100, 0, 100);

      fvgs.push({
        id: `fvg-bisi-${c2.time}`,
        type: 'BISI',
        startTime: c2.time,
        endTime: candles[candles.length - 1].time,
        candleIndex: i - 1,
        top,
        bottom,
        ce,
        size,
        sizeAtrRatio: Number((size / atr).toFixed(2)),
        mitigatedPct: Math.round(mitigatedPct),
        isMitigated: mitigatedPct >= 95,
        inCorrectZone: ce <= dealingRange.equilibrium, // Discount zone (<50%)
      });
    }

    // Bearish FVG (SIBI): Candle[1].Low > Candle[3].High
    if (c1.low - c3.high > minGap && c2.close < c2.open) {
      const top = c1.low;
      const bottom = c3.high;
      const size = top - bottom;
      const ce = (top + bottom) / 2;

      let highestAfter = -Infinity;
      for (let m = i + 1; m < candles.length; m++) {
        if (candles[m].high > highestAfter) highestAfter = candles[m].high;
      }

      const mitigatedPct =
        highestAfter === -Infinity
          ? 0
          : clamp(((highestAfter - bottom) / size) * 100, 0, 100);

      fvgs.push({
        id: `fvg-sibi-${c2.time}`,
        type: 'SIBI',
        startTime: c2.time,
        endTime: candles[candles.length - 1].time,
        candleIndex: i - 1,
        top,
        bottom,
        ce,
        size,
        sizeAtrRatio: Number((size / atr).toFixed(2)),
        mitigatedPct: Math.round(mitigatedPct),
        isMitigated: mitigatedPct >= 95,
        inCorrectZone: ce >= dealingRange.equilibrium, // Premium zone (>50%)
      });
    }
  }

  // Update Order Block mitigation status
  for (const ob of orderBlocks) {
    for (let m = ob.candleIndex + 2; m < candles.length; m++) {
      if (ob.type === 'BULLISH' && candles[m].close < ob.bottom) {
        ob.mitigated = true;
      } else if (ob.type === 'BEARISH' && candles[m].close > ob.top) {
        ob.mitigated = true;
      }
    }
  }

  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle.close;

  // Keep fresh unmitigated FVGs and recent OBs for clean overlay & confluence analysis
  const activeFvgs = fvgs.filter((f) => !f.isMitigated).slice(-6);
  const activeObs = orderBlocks.filter((o) => !o.mitigated).slice(-4);
  const recentSweeps = sweeps.slice(-6);
  const recentBreaks = structureBreaks.slice(-6);

  // Determine nearest Point of Interest (POI)
  let nearestPoiLabel = 'Scanning Imbalances';
  let nearestPoiPrice: number | null = null;
  let minDistance = Infinity;

  for (const f of activeFvgs) {
    const dist = Math.abs(lastPrice - f.ce);
    if (dist < minDistance) {
      minDistance = dist;
      nearestPoiLabel = `${f.type === 'BISI' ? 'Bullish FVG (BISI)' : 'Bearish FVG (SIBI)'}`;
      nearestPoiPrice = f.ce;
    }
  }
  for (const ob of activeObs) {
    const dist = Math.abs(lastPrice - ob.meanThreshold);
    if (dist < minDistance) {
      minDistance = dist;
      nearestPoiLabel = `${ob.type === 'BULLISH' ? 'Bullish OB' : 'Bearish OB'}`;
      nearestPoiPrice = ob.meanThreshold;
    }
  }

  // Determine MSS status
  const latestBreak = recentBreaks[recentBreaks.length - 1];
  const latestSweep = recentSweeps[recentSweeps.length - 1];
  let mssStatus: IctAnalysisSnapshot['mssStatus'] = 'SCANNING';
  if (latestBreak && candles.length - 1 - latestBreak.candleIndex <= 14) {
    mssStatus = latestBreak.direction === 'BULLISH' ? 'CONFIRMED_BULL' : 'CONFIRMED_BEAR';
  } else if (latestSweep && candles.length - 1 - latestSweep.candleIndex <= 8) {
    mssStatus = 'ARMED';
  }

  // 3. Evaluate 4-Step High-Probability ICT Confluence Setup
  const direction: 'BULLISH' | 'BEARISH' =
    runningBias !== 'NEUTRAL'
      ? runningBias
      : dealingRange.currentZone === 'DISCOUNT'
      ? 'BULLISH'
      : 'BEARISH';

  const matchingSweep =
    [...recentSweeps]
      .reverse()
      .find((s) => (direction === 'BULLISH' ? s.type === 'SSL' : s.type === 'BSL')) || null;

  const matchingBreak =
    [...recentBreaks]
      .reverse()
      .find((b) => b.direction === direction) || null;

  const matchingFvg =
    [...activeFvgs]
      .reverse()
      .find((f) => (direction === 'BULLISH' ? f.type === 'BISI' : f.type === 'SIBI')) || null;

  const matchingOb =
    [...activeObs]
      .reverse()
      .find((o) => o.type === direction) || null;

  // Rule: Never buy in Premium (>50%), Never sell in Discount (<50%)
  const inCorrectDealingZone =
    direction === 'BULLISH'
      ? dealingRange.rangePct <= 52
      : dealingRange.rangePct >= 48;

  // Check if price is inside or near OTE (0.618 - 0.786)
  const inOteZone =
    direction === 'BULLISH'
      ? lastPrice <= dealingRange.oteBullish.fib618 + atr * 0.45 &&
        lastPrice >= dealingRange.oteBullish.fib786 - atr * 0.45
      : lastPrice >= dealingRange.oteBearish.fib618 - atr * 0.45 &&
        lastPrice <= dealingRange.oteBearish.fib786 + atr * 0.45;

  // Check Step 4: Is price touching/mitigating the FVG, OB, or OTE trigger zone?
  const nearFvg =
    matchingFvg !== null &&
    lastPrice <= matchingFvg.top + atr * 0.65 &&
    lastPrice >= matchingFvg.bottom - atr * 0.65;

  const nearOb =
    matchingOb !== null &&
    lastPrice <= matchingOb.top + atr * 0.65 &&
    lastPrice >= matchingOb.bottom - atr * 0.65;

  const step4InTriggerZone = nearFvg || nearOb || inOteZone;

  let confluenceCount = 0;
  if (matchingSweep) confluenceCount++;
  if (matchingBreak) confluenceCount++;
  if (matchingFvg || matchingOb) confluenceCount++;
  if (step4InTriggerZone && inCorrectDealingZone) confluenceCount++;

  // Extract 6 Normalized ICT Features for the Adaptive ML Scorer
  const displacementForce = clamp(
    matchingBreak ? matchingBreak.displacementRatio / 2.2 : 0.48,
    0.15,
    1.0
  );
  const sweepAggression = clamp(
    matchingSweep ? 0.55 + matchingSweep.aggressionRatio * 0.45 : 0.35,
    0.15,
    1.0
  );
  const candlesSinceBreak = matchingBreak
    ? Math.max(1, candles.length - 1 - matchingBreak.candleIndex)
    : 12;
  const mitigationSpeed = clamp(1 - candlesSinceBreak / 24, 0.2, 1.0);

  const eqDepth =
    direction === 'BULLISH'
      ? clamp((55 - dealingRange.rangePct) / 45, 0.1, 1.0)
      : clamp((dealingRange.rangePct - 45) / 45, 0.1, 1.0);
  const equilibriumPosition = clamp(inOteZone ? Math.max(0.85, eqDepth) : eqDepth, 0.1, 1.0);

  const fvgSizeRatio = clamp(
    matchingFvg ? matchingFvg.sizeAtrRatio / 1.4 : matchingOb ? 0.68 : 0.35,
    0.15,
    1.0
  );

  const regimeAlignment = clamp(
    inCorrectDealingZone && (nearFvg || nearOb) ? 0.88 : inCorrectDealingZone ? 0.68 : 0.25,
    0.15,
    1.0
  );

  const features: IctFeatureVector = {
    displacementForce: Number(displacementForce.toFixed(3)),
    sweepAggression: Number(sweepAggression.toFixed(3)),
    mitigationSpeed: Number(mitigationSpeed.toFixed(3)),
    equilibriumPosition: Number(equilibriumPosition.toFixed(3)),
    fvgSizeRatio: Number(fvgSizeRatio.toFixed(3)),
    regimeAlignment: Number(regimeAlignment.toFixed(3)),
  };

  const aiConfidence = scoreSetupWithPairModel(
    features,
    pairModel,
    confluenceCount,
    inCorrectDealingZone,
    inOteZone
  );

  const stopDistance = atr * 1.8;
  const tpDistance = atr * 3.2;

  const stopLoss =
    direction === 'BULLISH'
      ? Number((lastPrice - stopDistance).toFixed(meta.decimals))
      : Number((lastPrice + stopDistance).toFixed(meta.decimals));

  const takeProfit =
    direction === 'BULLISH'
      ? Number((lastPrice + tpDistance).toFixed(meta.decimals))
      : Number((lastPrice - tpDistance).toFixed(meta.decimals));

  const activeSetup: ConfluenceSetup = {
    id: `setup-${symbol}-${lastCandle.time}-${direction}`,
    symbol,
    time: lastCandle.time,
    direction,
    step1LiquiditySweep: matchingSweep,
    step2StructureShift: matchingBreak,
    step3Poi: { fvg: matchingFvg, ob: matchingOb },
    step4InTriggerZone,
    inCorrectDealingZone,
    inOteZone,
    entryPrice: lastPrice,
    stopLoss,
    takeProfit,
    features,
    aiConfidence,
    confluenceCount,
    summary: `${direction === 'BULLISH' ? 'Swept SSL' : 'Swept BSL'} -> ${
      matchingBreak?.type || 'MSS'
    } -> ${matchingFvg ? matchingFvg.type + ' FVG' : 'OB'} in ${
      dealingRange.currentZone
    }`,
  };

  return {
    bias: runningBias === 'NEUTRAL' ? direction : runningBias,
    atr,
    dealingRange,
    swings: swings.slice(-16),
    sweeps: recentSweeps,
    structureBreaks: recentBreaks,
    fvgs: activeFvgs,
    orderBlocks: activeObs,
    activeSetup,
    nearestPoiLabel,
    nearestPoiPrice,
    mssStatus,
  };
}
