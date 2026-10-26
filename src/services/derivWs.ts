import { Candle, ContractCategory, VolatilitySymbol } from '../types/ict';
import { VOLATILITY_PAIRS } from '../constants/pairs';

export type ConnectionState = 'CONNECTING' | 'LIVE_WS' | 'SIMULATED_FEED' | 'AUTHENTICATED';

interface DerivCallbacks {
  onStatusChange: (status: ConnectionState, accountInfo?: { balance: number; currency: string; loginid: string }) => void;
  onInitialCandles: (candles: Candle[]) => void;
  onCandleUpdate: (candle: Candle) => void;
  onContractResult?: (contractId: number, status: 'WON' | 'LOST', profit: number, exitSpot: number) => void;
}

/**
 * Generates realistic fractal synthetic candles exhibiting ICT mechanics
 * (swing highs/lows, BSL/SSL sweeps, displacement MSS candles, and 3-candle FVGs)
 * tailored to the specific Volatility Index profile.
 */
export function generateInstitutionalCandles(
  symbol: VolatilitySymbol,
  count: number = 140,
  granularitySec: number = 60
): Candle[] {
  const meta = VOLATILITY_PAIRS[symbol];
  const candles: Candle[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const alignedNow = nowSec - (nowSec % granularitySec);

  let price = meta.basePrice;
  const vol = meta.baseVolatility;
  let phase: 'ACCUMULATION' | 'SWEEP_LOW' | 'DISPLACE_UP' | 'RETRACE_FVG_BULL' | 'SWEEP_HIGH' | 'DISPLACE_DOWN' =
    'ACCUMULATION';
  let phaseStep = 0;

  for (let i = count - 1; i >= 0; i--) {
    const time = alignedNow - i * granularitySec;
    phaseStep++;

    // Cycle through realistic ICT institutional order flow phases
    if (phaseStep > 14) {
      phaseStep = 0;
      const phases: typeof phase[] = [
        'SWEEP_LOW',
        'DISPLACE_UP',
        'RETRACE_FVG_BULL',
        'ACCUMULATION',
        'SWEEP_HIGH',
        'DISPLACE_DOWN',
      ];
      phase = phases[Math.floor(((count - i) / 14) % phases.length)];
    }

    let drift = (Math.random() - 0.5) * vol * 1.2;
    let wickUp = Math.random() * vol * 0.7;
    let wickDown = Math.random() * vol * 0.7;

    if (phase === 'SWEEP_LOW' && phaseStep === 3) {
      // Engineer an SSL sweep: deep lower wick that closes back up
      drift = vol * 0.35;
      wickDown = vol * 2.4 * (meta.sweepOvershootStd / 1.5);
    } else if (phase === 'DISPLACE_UP' && phaseStep <= 4) {
      // Strong bullish displacement creating MSS + Bullish FVG (BISI)
      drift = vol * (1.65 + Math.random() * 0.8);
      wickDown = vol * 0.12;
      wickUp = vol * 0.25;
    } else if (phase === 'RETRACE_FVG_BULL' && phaseStep <= 6) {
      // Controlled pullback into Discount / OTE 0.618-0.705 zone
      drift = -vol * 0.58;
    } else if (phase === 'SWEEP_HIGH' && phaseStep === 3) {
      // Engineer a BSL sweep: deep upper wick that rejects down
      drift = -vol * 0.35;
      wickUp = vol * 2.4 * (meta.sweepOvershootStd / 1.5);
    } else if (phase === 'DISPLACE_DOWN' && phaseStep <= 4) {
      // Strong bearish displacement creating MSS + Bearish FVG (SIBI)
      drift = -vol * (1.6 + Math.random() * 0.75);
      wickUp = vol * 0.12;
      wickDown = vol * 0.25;
    }

    const open = Number(price.toFixed(meta.decimals));
    const close = Number(Math.max(vol * 5, open + drift).toFixed(meta.decimals));
    const high = Number((Math.max(open, close) + wickUp).toFixed(meta.decimals));
    const low = Number(Math.max(vol * 2, Math.min(open, close) - wickDown).toFixed(meta.decimals));

    candles.push({ time, open, high, low, close });
    price = close;
  }

  return candles;
}

class DerivWebSocketManager {
  private ws: WebSocket | null = null;
  private pingTimer: number | null = null;
  private simTimer: number | null = null;
  private appId: string = '1089';
  private apiToken: string = '';
  private currentSymbol: VolatilitySymbol = 'R_100';
  private granularity: number = 60;
  private callbacks: DerivCallbacks | null = null;
  private currentCandles: Candle[] = [];
  private turboMode: boolean = false;
  private forceSimulation: boolean = false;

  public init(
    symbol: VolatilitySymbol,
    granularity: number,
    apiToken: string,
    appId: string,
    callbacks: DerivCallbacks
  ) {
    this.currentSymbol = symbol;
    this.granularity = granularity;
    this.apiToken = apiToken.trim();
    this.appId = appId.trim() || '1089';
    this.callbacks = callbacks;

    // Immediately seed institutional candles so chart renders at 60fps with 0ms blank state
    this.currentCandles = generateInstitutionalCandles(symbol, 140, granularity);
    this.callbacks.onInitialCandles([...this.currentCandles]);

    this.connectSocket();
    this.startFallbackOrTurboLoop();
  }

  public setTurboMode(enabled: boolean) {
    this.turboMode = enabled;
    this.startFallbackOrTurboLoop();
  }

  public switchPairOrTimeframe(symbol: VolatilitySymbol, granularity: number) {
    this.currentSymbol = symbol;
    this.granularity = granularity;
    this.currentCandles = generateInstitutionalCandles(symbol, 140, granularity);
    this.callbacks?.onInitialCandles([...this.currentCandles]);

    if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.forceSimulation) {
      this.send({ forget_all: 'candles' });
      this.subscribeCandles();
    }
  }

  public updateCredentials(apiToken: string, appId: string) {
    this.apiToken = apiToken.trim();
    this.appId = appId.trim() || '1089';
    this.connectSocket();
  }

  private connectSocket() {
    this.cleanupSocket();

    try {
      this.callbacks?.onStatusChange('CONNECTING');
      const endpoint = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;
      this.ws = new WebSocket(endpoint);

      this.ws.onopen = () => {
        this.forceSimulation = false;
        this.callbacks?.onStatusChange('LIVE_WS');

        if (this.apiToken) {
          this.send({ authorize: this.apiToken });
        }

        this.subscribeCandles();

        this.pingTimer = window.setInterval(() => {
          this.send({ ping: 1 });
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch {
          // Ignore malformed frame
        }
      };

      this.ws.onerror = () => {
        this.forceSimulation = true;
        this.callbacks?.onStatusChange('SIMULATED_FEED');
      };

      this.ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.forceSimulation = true;
        this.callbacks?.onStatusChange('SIMULATED_FEED');
      };
    } catch {
      this.forceSimulation = true;
      this.callbacks?.onStatusChange('SIMULATED_FEED');
    }
  }

  private subscribeCandles() {
    this.send({
      ticks_history: this.currentSymbol,
      adjust_start_time: 1,
      count: 140,
      end: 'latest',
      start: 1,
      style: 'candles',
      granularity: this.granularity,
      subscribe: 1,
    });
  }

  private handleMessage(data: Record<string, any>) {
    if (data.msg_type === 'authorize' && data.authorize) {
      const auth = data.authorize;
      this.callbacks?.onStatusChange('AUTHENTICATED', {
        balance: Number(auth.balance || 0),
        currency: auth.currency || 'USD',
        loginid: auth.loginid || 'CR-DERIV',
      });
      this.send({ balance: 1, subscribe: 1 });
    } else if (data.msg_type === 'balance' && data.balance) {
      this.callbacks?.onStatusChange('AUTHENTICATED', {
        balance: Number(data.balance.balance || 0),
        currency: data.balance.currency || 'USD',
        loginid: data.balance.loginid || 'DERIV',
      });
    } else if (data.msg_type === 'candles' && Array.isArray(data.candles)) {
      const parsed: Candle[] = data.candles.map((c: any) => ({
        time: Number(c.epoch),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));
      if (parsed.length > 20) {
        this.currentCandles = parsed;
        this.callbacks?.onInitialCandles([...this.currentCandles]);
      }
    } else if (data.msg_type === 'ohlc' && data.ohlc && !this.turboMode) {
      const o = data.ohlc;
      const candle: Candle = {
        time: Number(o.open_time),
        open: Number(o.open),
        high: Number(o.high),
        low: Number(o.low),
        close: Number(o.close),
      };
      this.mergeLiveCandle(candle);
    } else if (data.msg_type === 'buy' && data.buy) {
      const contractId = data.buy.contract_id;
      if (contractId) {
        this.send({
          proposal_open_contract: 1,
          contract_id: contractId,
          subscribe: 1,
        });
      }
    } else if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
      const poc = data.proposal_open_contract;
      if (poc.is_sold) {
        const profit = Number(poc.profit || 0);
        const status = profit >= 0 ? 'WON' : 'LOST';
        this.callbacks?.onContractResult?.(
          Number(poc.contract_id),
          status,
          profit,
          Number(poc.exit_tick || poc.current_spot || 0)
        );
      }
    }
  }

  private mergeLiveCandle(candle: Candle) {
    const last = this.currentCandles[this.currentCandles.length - 1];
    if (last && last.time === candle.time) {
      this.currentCandles[this.currentCandles.length - 1] = candle;
    } else if (!last || candle.time > last.time) {
      this.currentCandles.push(candle);
      if (this.currentCandles.length > 220) {
        this.currentCandles.shift();
      }
    }
    this.callbacks?.onCandleUpdate(candle);
  }

  /**
   * Dispatches a live order on Deriv WebSocket if authenticated with an API Token.
   */
  public placeLiveDerivOrder(params: {
    symbol: VolatilitySymbol;
    direction: 'CALL' | 'PUT';
    category: ContractCategory;
    stake: number;
    duration: number;
    durationUnit: 't' | 'm';
    multiplier?: number;
  }): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.apiToken) {
      return false;
    }

    if (params.category === 'RISE_FALL') {
      this.send({
        buy: 1,
        price: params.stake,
        parameters: {
          amount: params.stake,
          basis: 'stake',
          contract_type: params.direction,
          currency: 'USD',
          duration: params.duration,
          duration_unit: params.durationUnit,
          symbol: params.symbol,
        },
      });
    } else {
      this.send({
        buy: 1,
        price: params.stake,
        parameters: {
          amount: params.stake,
          basis: 'stake',
          contract_type: params.direction === 'CALL' ? 'MULTUP' : 'MULTDOWN',
          currency: 'USD',
          multiplier: params.multiplier || 100,
          symbol: params.symbol,
        },
      });
    }
    return true;
  }

  private startFallbackOrTurboLoop() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }

    const meta = VOLATILITY_PAIRS[this.currentSymbol];
    const intervalMs = this.turboMode ? 380 : Math.min(1200, meta.tickIntervalMs);

    this.simTimer = window.setInterval(() => {
      // Run tick updates if in simulated feed OR if Turbo AI Training mode is active
      if (!this.forceSimulation && !this.turboMode && this.ws?.readyState === WebSocket.OPEN) {
        return;
      }

      if (this.currentCandles.length === 0) return;
      const last = { ...this.currentCandles[this.currentCandles.length - 1] };
      const vol = meta.baseVolatility;
      const nowSec = Math.floor(Date.now() / 1000);
      const bucketTime = this.turboMode
        ? last.time + (Math.random() < 0.35 ? this.granularity : 0)
        : nowSec - (nowSec % this.granularity);

      // Generate organic tick impulse with periodic displacement bursts
      const isBurst = Math.random() < 0.16;
      const delta = (Math.random() - 0.495) * vol * (isBurst ? 1.45 : 0.48);
      const nextClose = Number(Math.max(vol * 3, last.close + delta).toFixed(meta.decimals));

      if (bucketTime > last.time) {
        const nextCandle: Candle = {
          time: bucketTime,
          open: last.close,
          high: Math.max(last.close, nextClose),
          low: Math.min(last.close, nextClose),
          close: nextClose,
        };
        this.mergeLiveCandle(nextCandle);
      } else {
        last.close = nextClose;
        if (nextClose > last.high) last.high = nextClose;
        if (nextClose < last.low) last.low = nextClose;
        this.mergeLiveCandle(last);
      }
    }, intervalMs);
  }

  private send(payload: Record<string, any>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private cleanupSocket() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}

export const derivSocket = new DerivWebSocketManager();
