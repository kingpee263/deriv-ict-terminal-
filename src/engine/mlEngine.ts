import { IctFeatureVector, PairModelWeights } from '../types/ict';

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, z))));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes the AI Confidence Score (0-100%) for an ICT setup on a specific pair
 * using the pair's online-learned logistic regression weights.
 */
export function scoreSetupWithPairModel(
  features: IctFeatureVector,
  model: PairModelWeights,
  confluenceCount: number,
  inCorrectDealingZone: boolean,
  inOteZone: boolean
): number {
  const { weights, bias } = model;

  const linearCombination =
    weights.displacementForce * features.displacementForce +
    weights.sweepAggression * features.sweepAggression +
    weights.mitigationSpeed * features.mitigationSpeed +
    weights.equilibriumPosition * features.equilibriumPosition +
    weights.fvgSizeRatio * features.fvgSizeRatio +
    weights.regimeAlignment * features.regimeAlignment +
    bias;

  const rawProb = sigmoid(linearCombination); // 0..1

  // Combine learned probability with ICT hard confluence bonuses
  let score = rawProb * 78;
  score += confluenceCount * 4.5;

  if (inOteZone) {
    score += 4.5;
  }

  // Strict ICT Rule: Never buy in Premium (>50%), Never sell in Discount (<50%)
  if (!inCorrectDealingZone) {
    score -= 28;
  }

  return Math.round(clamp(score, 12, 98));
}

/**
 * Online Incremental Stochastic Gradient Descent (SGD) update
 * Updates the pair's weights and institutional memory from a completed trade or shadow trade.
 */
export function updatePairModelWeightsSGD(
  model: PairModelWeights,
  features: IctFeatureVector,
  won: boolean,
  observedMitigationDepthPct?: number,
  isShadowTrade: boolean = false
): { updatedModel: PairModelWeights; deltaSummary: string } {
  const target = won ? 1 : 0;
  const { weights, bias, learningRate } = model;

  const z =
    weights.displacementForce * features.displacementForce +
    weights.sweepAggression * features.sweepAggression +
    weights.mitigationSpeed * features.mitigationSpeed +
    weights.equilibriumPosition * features.equilibriumPosition +
    weights.fvgSizeRatio * features.fvgSizeRatio +
    weights.regimeAlignment * features.regimeAlignment +
    bias;

  const prediction = sigmoid(z);
  // Shadow trades use a slightly gentler learning rate (0.65x) than live capital trades
  const effectiveLr = isShadowTrade ? learningRate * 0.65 : learningRate;
  const error = target - prediction; // Positive if won, negative if lost

  // L2 regularization factor to prevent weight explosion over thousands of ticks
  const l2Decay = 0.002;

  const newWeights = {
    displacementForce: clamp(
      weights.displacementForce + effectiveLr * (error * features.displacementForce - l2Decay * weights.displacementForce),
      0.2,
      3.5
    ),
    sweepAggression: clamp(
      weights.sweepAggression + effectiveLr * (error * features.sweepAggression - l2Decay * weights.sweepAggression),
      0.2,
      3.5
    ),
    mitigationSpeed: clamp(
      weights.mitigationSpeed + effectiveLr * (error * features.mitigationSpeed - l2Decay * weights.mitigationSpeed),
      0.2,
      3.5
    ),
    equilibriumPosition: clamp(
      weights.equilibriumPosition + effectiveLr * (error * features.equilibriumPosition - l2Decay * weights.equilibriumPosition),
      0.2,
      3.5
    ),
    fvgSizeRatio: clamp(
      weights.fvgSizeRatio + effectiveLr * (error * features.fvgSizeRatio - l2Decay * weights.fvgSizeRatio),
      0.2,
      3.5
    ),
    regimeAlignment: clamp(
      weights.regimeAlignment + effectiveLr * (error * features.regimeAlignment - l2Decay * weights.regimeAlignment),
      0.2,
      3.5
    ),
  };

  const newBias = clamp(bias + effectiveLr * error * 0.35, -4.5, 1.5);

  // Find the feature that received the largest weight adjustment for logging
  const featureLabels: Record<keyof IctFeatureVector, string> = {
    displacementForce: 'MSS-displacement',
    sweepAggression: 'BSL/SSL-sweep',
    mitigationSpeed: 'FVG-retest-speed',
    equilibriumPosition: 'OTE-discount/prem',
    fvgSizeRatio: 'FVG-depth',
    regimeAlignment: 'regime-flow',
  };

  let topFeature: keyof IctFeatureVector = 'sweepAggression';
  let maxAbsDelta = 0;
  let signedDelta = 0;

  (Object.keys(newWeights) as Array<keyof IctFeatureVector>).forEach((k) => {
    const d = newWeights[k] - weights[k];
    if (Math.abs(d) > maxAbsDelta) {
      maxAbsDelta = Math.abs(d);
      signedDelta = d;
      topFeature = k;
    }
  });

  // Update EMA of learned FVG mitigation depth if provided
  let learnedAvgMitigationDepth = model.learnedAvgMitigationDepth;
  if (won && observedMitigationDepthPct !== undefined && observedMitigationDepthPct > 10 && observedMitigationDepthPct < 100) {
    learnedAvgMitigationDepth = Number(
      (model.learnedAvgMitigationDepth * 0.88 + observedMitigationDepthPct * 0.12).toFixed(1)
    );
  }

  const totalTrades = isShadowTrade ? model.totalTrades : model.totalTrades + 1;
  const wins = isShadowTrade ? model.wins : model.wins + (won ? 1 : 0);
  const losses = isShadowTrade ? model.losses : model.losses + (won ? 0 : 1);
  const shadowTrades = isShadowTrade ? model.shadowTrades + 1 : model.shadowTrades;
  const shadowWins = isShadowTrade ? model.shadowWins + (won ? 1 : 0) : model.shadowWins;

  // Adapt dynamic threshold slightly based on recent win rate
  const combinedTotal = totalTrades + shadowTrades;
  const combinedWins = wins + shadowWins;
  const winRate = combinedTotal > 0 ? (combinedWins / combinedTotal) * 100 : 75;
  const dynamicThreshold = Math.round(clamp(75 + (75 - winRate) * 0.18, 70, 84));

  const updatedModel: PairModelWeights = {
    ...model,
    version: Number((model.version + 0.01).toFixed(2)),
    weights: newWeights,
    bias: newBias,
    dynamicThreshold,
    totalTrades,
    wins,
    losses,
    shadowTrades,
    shadowWins,
    learnedAvgMitigationDepth,
    lastUpdated: Date.now(),
  };

  const signStr = signedDelta >= 0 ? '+' : '';
  const deltaSummary = `${signStr}${signedDelta.toFixed(3)} to ${featureLabels[topFeature]}`;

  return { updatedModel, deltaSummary };
}

export function getPairAccuracyPct(model: PairModelWeights): number {
  const total = model.totalTrades + model.shadowTrades;
  const wins = model.wins + model.shadowWins;
  if (total === 0) return 75.0;
  return Number(((wins / total) * 100).toFixed(1));
}
