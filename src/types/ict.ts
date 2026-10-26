export type VolatilitySymbol =
  | 'R_10'
  | '1HZ10V'
  | '1HZ15V'
  | 'R_25'
  | 'R_50'
  | 'R_75'
  | 'R_100'
  | '1HZ100V';

export interface PairMetadata {
  symbol: VolatilitySymbol;
  name: string;
  shortName: string;
  tickIntervalMs: number;
  basePrice: number;
  baseVolatility: number;
  decimals: number;
  defaultDisplacementMultiplier: number;
  typicalFvgMitigationDepth: number;
  sweepOvershootStd: number;
  description: string;
}

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type RangeZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
  isEqualLiquidity?: boolean; // EQH or EQL
  swept?: boolean;
  broken?: boolean;
}

export interface LiquiditySweep {
  id: string;
  time: number;
  candleIndex: number;
  type: 'BSL' | 'SSL'; // Buy-Side Liquidity (Highs) or Sell-Side Liquidity (Lows)
  levelPrice: number;
  sweepExtreme: number;
  aggressionRatio: number; // Wick extension relative to ATR
  isEqualHighLow: boolean;
}

export interface StructureBreak {
  id: string;
  time: number;
  startTime: number;
  candleIndex: number;
  type: 'MSS' | 'BOS';
  direction: 'BULLISH' | 'BEARISH';
  brokenLevel: number;
  displacementRatio: number; // Candle body / ATR
}

export interface FairValueGap {
  id: string;
  type: 'BISI' | 'SIBI'; // BISI = Bullish FVG, SIBI = Bearish FVG
  startTime: number;
  endTime: number;
  candleIndex: number;
  top: number;
  bottom: number;
  ce: number; // 50% Consequent Encroachment
  size: number;
  sizeAtrRatio: number;
  mitigatedPct: number; // 0 to 100+
  isMitigated: boolean;
  inCorrectZone: boolean; // Bullish in Discount (<50%), Bearish in Premium (>50%)
}

export interface OrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  startTime: number;
  endTime: number;
  candleIndex: number;
  top: number;
  bottom: number;
  meanThreshold: number; // 50% of OB body
  mitigated: boolean;
  causedMss: boolean;
}

export interface DealingRange {
  high: number;
  low: number;
  highTime: number;
  lowTime: number;
  equilibrium: number; // 50% level
  currentZone: RangeZone;
  rangePct: number; // 0% = low, 100% = high
  oteBullish: {
    fib618: number;
    fib705: number;
    fib786: number;
  };
  oteBearish: {
    fib618: number;
    fib705: number;
    fib786: number;
  };
}

export interface IctFeatureVector {
  displacementForce: number;   // Normalized [0, 1] from Body/ATR
  sweepAggression: number;     // Normalized [0, 1] from Wick extension/ATR
  mitigationSpeed: number;     // Normalized [0, 1] inverse of candles to retrace
  equilibriumPosition: number; // Normalized [0, 1] depth into Discount (buy) or Premium (sell) + OTE proximity
  fvgSizeRatio: number;        // Normalized [0, 1] FVG gap size / ATR
  regimeAlignment: number;     // Normalized [0, 1] Expansion vs Consolidation quality
}

export interface ConfluenceSetup {
  id: string;
  symbol: VolatilitySymbol;
  time: number;
  direction: 'BULLISH' | 'BEARISH';
  step1LiquiditySweep: LiquiditySweep | null;
  step2StructureShift: StructureBreak | null;
  step3Poi: {
    fvg: FairValueGap | null;
    ob: OrderBlock | null;
  };
  step4InTriggerZone: boolean;
  inCorrectDealingZone: boolean;
  inOteZone: boolean;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  features: IctFeatureVector;
  aiConfidence: number; // 0 - 100%
  confluenceCount: number; // 0 - 4
  summary: string;
}

export interface PairModelWeights {
  symbol: VolatilitySymbol;
  version: number;
  weights: {
    displacementForce: number;
    sweepAggression: number;
    mitigationSpeed: number;
    equilibriumPosition: number;
    fvgSizeRatio: number;
    regimeAlignment: number;
  };
  bias: number;
  learningRate: number;
  dynamicThreshold: number; // Default 75%
  totalTrades: number;
  wins: number;
  losses: number;
  shadowTrades: number;
  shadowWins: number;
  learnedAvgMitigationDepth: number; // e.g., 52.4%
  avgDisplacementAtr: number;
  lastUpdated: number;
}

export type ContractCategory = 'RISE_FALL' | 'MULTIPLIER';

export interface TradePosition {
  id: string;
  derivContractId?: number;
  symbol: VolatilitySymbol;
  direction: 'CALL' | 'PUT'; // CALL = Rise/Bullish, PUT = Fall/Bearish
  category: ContractCategory;
  isShadowPaper: boolean; // True if background ML learning shadow trade
  isLiveApi: boolean;     // True if placed on real/demo Deriv WebSocket API
  entryTime: number;
  expiryTime: number;
  durationTicksOrCandles: number;
  durationUnit: 't' | 'm';
  entryPrice: number;
  currentPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  stake: number;
  multiplier?: number;
  pnl: number;
  status: 'OPEN' | 'WON' | 'LOST';
  aiConfidence: number;
  setupSummary: string;
  features: IctFeatureVector;
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
}

export interface LearningLogEntry {
  id: string;
  timestamp: number;
  symbol: VolatilitySymbol;
  type: 'SWEEP' | 'MSS' | 'FVG_MITIGATION' | 'TRADE_EXEC' | 'SHADOW_LEARN' | 'SGD_UPDATE' | 'RISK_GUARD';
  title: string;
  detail: string;
  confidence?: number;
  weightDelta?: string;
  positive?: boolean;
}

export interface RiskSettings {
  stake: number;
  contractCategory: ContractCategory;
  multiplier: number;
  durationValue: number;
  durationUnit: 't' | 'm';
  dailyTakeProfit: number;
  maxDailyLoss: number;
  maxConsecutiveLosses: number;
  minAiConfidence: number;
  autoTradeEnabled: boolean;
  shadowLearningEnabled: boolean;
}

export interface IctAnalysisSnapshot {
  bias: MarketBias;
  atr: number;
  dealingRange: DealingRange;
  swings: SwingPoint[];
  sweeps: LiquiditySweep[];
  structureBreaks: StructureBreak[];
  fvgs: FairValueGap[];
  orderBlocks: OrderBlock[];
  activeSetup: ConfluenceSetup | null;
  nearestPoiLabel: string;
  nearestPoiPrice: number | null;
  mssStatus: 'ARMED' | 'CONFIRMED_BULL' | 'CONFIRMED_BEAR' | 'SCANNING';
}
