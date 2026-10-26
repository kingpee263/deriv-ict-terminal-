import { openDB, IDBPDatabase } from 'idb';
import { PairModelWeights, VolatilitySymbol } from '../types/ict';
import { VOLATILITY_PAIRS } from '../constants/pairs';

const DB_NAME = 'deriv_ict_pair_memory_v2';
const STORE_WEIGHTS = 'pair_weights';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_WEIGHTS)) {
          db.createObjectStore(STORE_WEIGHTS, { keyPath: 'symbol' });
        }
      },
    });
  }
  return dbPromise;
}

export function createDefaultPairWeights(symbol: VolatilitySymbol): PairModelWeights {
  const meta = VOLATILITY_PAIRS[symbol];
  const isHighVol = symbol.includes('100') || symbol === 'R_75';
  const isFastTick = symbol.startsWith('1HZ');

  return {
    symbol,
    version: 2.1,
    weights: {
      displacementForce: isFastTick ? 1.42 : 1.28,
      sweepAggression: isHighVol ? 1.55 : 1.22,
      mitigationSpeed: 0.96,
      equilibriumPosition: 1.48,
      fvgSizeRatio: isHighVol ? 1.18 : 1.32,
      regimeAlignment: 1.15,
    },
    bias: -2.65,
    learningRate: 0.065,
    dynamicThreshold: isHighVol ? 77 : 75,
    totalTrades: 18,
    wins: 14,
    losses: 4,
    shadowTrades: 34,
    shadowWins: 26,
    learnedAvgMitigationDepth: meta.typicalFvgMitigationDepth,
    avgDisplacementAtr: meta.defaultDisplacementMultiplier,
    lastUpdated: Date.now(),
  };
}

export async function loadAllPairWeights(): Promise<Record<VolatilitySymbol, PairModelWeights>> {
  const result = {} as Record<VolatilitySymbol, PairModelWeights>;
  const symbols = Object.keys(VOLATILITY_PAIRS) as VolatilitySymbol[];

  try {
    const db = await getDb();
    for (const sym of symbols) {
      const existing = (await db.get(STORE_WEIGHTS, sym)) as PairModelWeights | undefined;
      if (existing && existing.weights) {
        result[sym] = existing;
      } else {
        const seeded = createDefaultPairWeights(sym);
        await db.put(STORE_WEIGHTS, seeded);
        result[sym] = seeded;
      }
    }
  } catch {
    for (const sym of symbols) {
      result[sym] = createDefaultPairWeights(sym);
    }
  }

  return result;
}

export async function savePairWeights(model: PairModelWeights): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE_WEIGHTS, model);
  } catch {
    // Fallback if IndexedDB is blocked in private mode
  }
}

export async function resetAllPairWeights(): Promise<Record<VolatilitySymbol, PairModelWeights>> {
  const result = {} as Record<VolatilitySymbol, PairModelWeights>;
  const symbols = Object.keys(VOLATILITY_PAIRS) as VolatilitySymbol[];
  try {
    const db = await getDb();
    for (const sym of symbols) {
      const fresh = createDefaultPairWeights(sym);
      await db.put(STORE_WEIGHTS, fresh);
      result[sym] = fresh;
    }
  } catch {
    for (const sym of symbols) {
      result[sym] = createDefaultPairWeights(sym);
    }
  }
  return result;
}

export async function importPairWeightsJson(
  jsonText: string
): Promise<Record<VolatilitySymbol, PairModelWeights>> {
  const parsed = JSON.parse(jsonText);
  const current = await loadAllPairWeights();
  const symbols = Object.keys(VOLATILITY_PAIRS) as VolatilitySymbol[];

  for (const sym of symbols) {
    if (parsed[sym] && parsed[sym].weights) {
      current[sym] = {
        ...current[sym],
        ...parsed[sym],
        symbol: sym,
        lastUpdated: Date.now(),
      };
      await savePairWeights(current[sym]);
    }
  }
  return current;
}
