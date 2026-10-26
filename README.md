# Deriv Volatility ICT AI Trading Terminal

An institutional-grade automated and semi-automated web trading terminal specialized for **Deriv Volatility Indices** (`Volatility 10`, `Volatility 10 (1s)`, `Volatility 15 (1s)`, `Volatility 25`, `Volatility 50`, `Volatility 75`, `Volatility 100`, `Volatility 100 (1s)`) powered by **Inner Circle Trader (ICT)** algorithmic order-flow concepts and an **Online Adaptive Machine Learning Engine (Incremental SGD + IndexedDB Pair Memory)**.

## Core Features

1. **Deterministic ICT Quantitative Engine ([`src/engine/ictEngine.ts`](./src/engine/ictEngine.ts))**:
   - **Dealing Range & Equilibrium**: Tracks the 50% Fibonacci Equilibrium level dividing **Premium ($>50\%$)** and **Discount ($<50\%$)** plus the **Optimal Trade Entry (OTE `0.618 - 0.786`)** zone.
   - **Liquidity Sweeps (`BSL` / `SSL` & `EQH` / `EQL`)**: Detects stop raids beyond prior swing highs and swing lows with wick rejection aggression ratios.
   - **Market Structure Shift (`MSS`) & Break of Structure (`BOS`)**: Confirms trend shifts with ATR-normalized displacement candles.
   - **Fair Value Gaps (`BISI` / `SIBI`) & Order Blocks (`OB`)**: Detects 3-candle price imbalances, tracks 50% Consequent Encroachment (`CE`) mitigation depth, and highlights unmitigated institutional Order Blocks.

2. **Adaptive Machine Learning & Pair Memory ([`src/engine/mlEngine.ts`](./src/engine/mlEngine.ts), [`src/services/pairMemoryDb.ts`](./src/services/pairMemoryDb.ts))**:
   - Extracts a 6-dimensional normalized feature vector for every setup (`displacementForce`, `sweepAggression`, `mitigationSpeed`, `equilibriumPosition`, `fvgSizeRatio`, `regimeAlignment`).
   - Runs **Online Stochastic Gradient Descent (SGD)** updates after every live trade and background **Shadow Paper Trade**.
   - Persists pair-specific weights and learned mitigation depths in browser **IndexedDB** with 1-click `.json` Brain Export/Import.

3. **TradingView Lightweight Charts + Synchronized ICT Canvas Overlay ([`src/components/IctChart.tsx`](./src/components/IctChart.tsx))**:
   - Real-time 60fps candlesticks with interactive toggles for `FVG (BISI/SIBI)`, `Order Blocks`, `MSS / BOS`, `BSL/SSL Sweeps`, and `EQ 50% & OTE`.
   - Includes a **10x AI Turbo Simulation** toggle to accelerate synthetic tick flow and watch the model learn in real time.

## Local Development

```bash
npm install
npm run dev
```

## Production Build & Deployment (Vercel / GitHub Pages + Namecheap `.site` Domain)

```bash
npm run build
```

- **Vercel**: Pre-configured via [`vercel.json`](./vercel.json). Point your Namecheap `.site` domain `@` A-record to `76.76.21.21` and `www` CNAME to `cname.vercel-dns.com`.
- **GitHub Pages**: Pre-configured via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).
