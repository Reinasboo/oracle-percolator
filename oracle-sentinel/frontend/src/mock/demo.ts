// Demo data generator for Oracle Sentinel frontend
// Emits realistic, coherent price and confidence updates for multiple assets.

type Feed = {
  feed_id: string;
  feed_name: string;
  price: number;
  base_volatility: number; // percentage fraction example 0.02 = 2%
  last_updated: number;
  confidence: number; // 0..1
  source_count: number;
  venue: string;
};

function seedFeeds(): Feed[] {
  const now = Date.now();
  return [
    { feed_id: 'SOL/USD', feed_name: 'SOL / USDC', price: 152.3, base_volatility: 0.02, last_updated: now, confidence: 0.92, source_count: 7, venue: 'Pyth + Chainlink' },
    { feed_id: 'BTC/USD', feed_name: 'BTC / USD', price: 67600, base_volatility: 0.01, last_updated: now, confidence: 0.95, source_count: 9, venue: 'Coinbase + Kraken' },
    { feed_id: 'ETH/USD', feed_name: 'ETH / USD', price: 3200.5, base_volatility: 0.015, last_updated: now, confidence: 0.94, source_count: 8, venue: 'CEX composite' },
    { feed_id: 'USDC/USD', feed_name: 'USDC / USD', price: 1.0002, base_volatility: 0.0001, last_updated: now, confidence: 0.99, source_count: 5, venue: 'Stablecoin peg basket' },
    { feed_id: 'RAY/USD', feed_name: 'RAY / USD', price: 7.45, base_volatility: 0.035, last_updated: now, confidence: 0.85, source_count: 6, venue: 'DEX composite' },
    { feed_id: 'JUP/USD', feed_name: 'JUP / USD', price: 1.42, base_volatility: 0.04, last_updated: now, confidence: 0.83, source_count: 5, venue: 'Liquid routing venues' },
    { feed_id: 'mSOL/SOL', feed_name: 'mSOL / SOL', price: 1.027, base_volatility: 0.004, last_updated: now, confidence: 0.97, source_count: 4, venue: 'LST basket' },
    { feed_id: 'PYUSD/USD', feed_name: 'PYUSD / USD', price: 0.9998, base_volatility: 0.00015, last_updated: now, confidence: 0.98, source_count: 4, venue: 'Peg monitor' },
    { feed_id: 'STOXX50/EUR', feed_name: 'STOXX50 ETF / EUR', price: 5432.1, base_volatility: 0.008, last_updated: now, confidence: 0.9, source_count: 6, venue: 'EU index basket' },
    { feed_id: 'SOL_STABLE/USD', feed_name: 'SOL (synthetic) / USD', price: 152.0, base_volatility: 0.03, last_updated: now, confidence: 0.7, source_count: 4, venue: 'Synthetic monitor' },
  ];
}

function randomNormal(mean = 0, std = 1) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function startDemoSocket(mockSocket: any, options: {tickMs?: number, anomalyRate?: number} = {}) {
  const tickMs = options.tickMs ?? 2000;
  const anomalyRate = options.anomalyRate ?? 0.02; // 2% chance per tick per feed

  const feeds = seedFeeds();

  // Helper to compute confidence based on volatility and recent movement
  function computeConfidence(feed: Feed, recentVolatility: number, lastMovePct: number) {
    // Start from base confidence
    let c = feed.confidence;

    // Volatility penalty
    c -= Math.min(0.4, recentVolatility * 2);

    // Sudden large move penalty
    if (Math.abs(lastMovePct) > 0.05) c -= 0.25; // >5% jump
    else if (Math.abs(lastMovePct) > 0.02) c -= 0.1; // >2% jump

    // Price too close to bounds (fake) - for demo just nudge
    if (feed.feed_id.includes('STOXX50') && (feed.price < 4200 || feed.price > 6800)) c -= 0.2;

    // Clamp
    c = Math.max(0.0, Math.min(1.0, c));
    return c;
  }

  function computeLatency(feed: Feed, pctMove: number) {
    const noise = Math.abs(pctMove) * 520;
    return Math.round(55 + feed.base_volatility * 1000 + noise + Math.random() * 35);
  }

  function computeSpread(feed: Feed, pctMove: number) {
    return Number((Math.max(0.01, feed.base_volatility * 28 + Math.abs(pctMove) * 12)).toFixed(2));
  }

  function computeDeviation(feed: Feed, pctMove: number) {
    return Number((Math.abs(pctMove) * 10000 + Math.max(0.5, feed.base_volatility * 180)).toFixed(1));
  }

  function computeAnomalyScore(feed: Feed, confidence: number, pctMove: number) {
    const volatilityPenalty = Math.min(1, Math.abs(pctMove) * 8);
    const confidencePenalty = 1 - confidence;
    const spreadPenalty = Math.min(1, feed.base_volatility * 12);
    return Number(Math.max(0, Math.min(1, volatilityPenalty * 0.5 + confidencePenalty * 0.35 + spreadPenalty * 0.15)).toFixed(2));
  }

  // Emit initial snapshot
  feeds.forEach(f => {
    mockSocket.emit('price_update', {
      feed_id: f.feed_id,
      feed_name: f.feed_name,
      price: f.price,
      confidence: f.confidence,
        source_count: f.source_count,
        venue: f.venue,
        latency_ms: computeLatency(f, 0),
        spread_bps: computeSpread(f, 0),
        deviation_bps: computeDeviation(f, 0),
        anomaly_score: computeAnomalyScore(f, f.confidence, 0),
      timestamp: new Date().toISOString(),
    });

    mockSocket.emit('confidence_updated', {
      feed_id: f.feed_id,
      confidence: f.confidence,
      confidence_interpretation: f.confidence > 0.9 ? 'excellent' : f.confidence > 0.8 ? 'good' : 'caution',
      recommendation: f.confidence > 0.8 ? 'no action' : 'monitor',
        latency_ms: computeLatency(f, 0),
        source_count: f.source_count,
        spread_bps: computeSpread(f, 0),
        deviation_bps: computeDeviation(f, 0),
    });
  });

  // Start tick loop
  const intervals: number[] = [];

  const id = setInterval(() => {
    feeds.forEach((f) => {
      const vol = f.base_volatility;

      // Simulate normal return with occasional spikes
      const shock = Math.random() < anomalyRate ? randomNormal(0, Math.max(0.02, vol*4)) : randomNormal(0, vol);
      const pct = shock; // fraction

      // Ensure some assets get correlated moves occasionally (e.g., BTC/ETH correlation)
      if (f.feed_id === 'ETH/USD') {
        // ETH correlates with BTC some of the time
        const btc = feeds.find(x => x.feed_id === 'BTC/USD');
        if (btc && Math.random() < 0.3) {
          // follow BTC recent movement
          const btcShock = (Math.random() - 0.5) * 0.01;
          f.price = f.price * (1 + btcShock * 0.9 + pct * 0.1);
        } else {
          f.price = f.price * (1 + pct);
        }
      } else {
        f.price = f.price * (1 + pct);
      }

      // small rounding for readability
      if (Math.abs(f.price) > 10) f.price = Math.round(f.price * 100) / 100;
      else f.price = Math.round(f.price * 10000) / 10000;

      const lastMovePct = pct;
      const recentVolatility = Math.abs(pct);
      const newConf = computeConfidence(f, recentVolatility, lastMovePct);
      f.confidence = newConf;
      f.last_updated = Date.now();
      const latencyMs = computeLatency(f, lastMovePct);
      const spreadBps = computeSpread(f, lastMovePct);
      const deviationBps = computeDeviation(f, lastMovePct);
      const anomalyScore = computeAnomalyScore(f, newConf, lastMovePct);

      // Emit price update
      mockSocket.emit('price_update', {
        feed_id: f.feed_id,
        feed_name: f.feed_name,
        price: f.price,
        confidence: f.confidence,
        source_count: f.source_count,
        venue: f.venue,
        latency_ms: latencyMs,
        spread_bps: spreadBps,
        deviation_bps: deviationBps,
        anomaly_score: anomalyScore,
        timestamp: new Date().toISOString(),
      });

      // Occasionally emit confidence_updated (every tick for clarity)
      mockSocket.emit('confidence_updated', {
        feed_id: f.feed_id,
        confidence: f.confidence,
        confidence_interpretation: f.confidence > 0.95 ? 'excellent' : f.confidence > 0.85 ? 'good' : f.confidence > 0.7 ? 'caution' : 'warning',
        recommendation: f.confidence > 0.8 ? 'no action' : 'review sources',
        latency_ms: latencyMs,
        source_count: f.source_count,
        spread_bps: spreadBps,
        deviation_bps: deviationBps,
      });

      // Occasionally emit anomaly/outage
      if (Math.random() < anomalyRate/5) {
        mockSocket.emit('outage_warning', {
          feed_id: f.feed_id,
          predicted_outage_probability: Math.min(1, Math.random()*0.6 + 0.2),
          predicted_outage_window_start: new Date().toISOString(),
          predicted_outage_window_end: new Date(Date.now() + 1000*60*5).toISOString(),
          estimated_recovery_time_minutes: Math.round(Math.random()*60),
          recent_incidents: [],
          latency_ms: latencyMs,
          anomaly_score: anomalyScore,
        });
      }

    });
  }, tickMs);

  // Return a stop function
  return () => clearInterval(id);
}
