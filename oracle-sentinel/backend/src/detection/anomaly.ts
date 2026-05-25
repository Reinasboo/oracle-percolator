// Anomaly Detection Engine
import { Anomaly } from '../types';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

interface PricePoint {
  timestamp: Date;
  price: number;
  confidence: number;
}

export class AnomalyDetector {
  /**
   * Detect anomalies using Z-score method (statistical)
   * Z-score = (value - mean) / stddev
   * |Z-score| > threshold indicates anomaly
   */
  static detectZScoreAnomaly(
    currentPrice: number,
    priceHistory: PricePoint[],
    threshold: number = 3.0
  ): {
    isAnomaly: boolean;
    zScore: number;
    expectedPrice: number;
    deviation: number;
  } {
    if (priceHistory.length < 10) {
      return {
        isAnomaly: false,
        zScore: 0,
        expectedPrice: currentPrice,
        deviation: 0,
      };
    }

    // Calculate mean and standard deviation
    const prices = priceHistory.map((p) => p.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance =
      prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) /
      prices.length;
    const stddev = Math.sqrt(variance);

    // Calculate Z-score
    const zScore = stddev > 0 ? (currentPrice - mean) / stddev : 0;

    return {
      isAnomaly: Math.abs(zScore) > threshold,
      zScore,
      expectedPrice: mean,
      deviation: ((currentPrice - mean) / mean) * 100,
    };
  }

  /**
   * Detect sharp price movements (momentum anomalies)
   */
  static detectSharpMovement(
    currentPrice: number,
    previousPrice: number,
    threshold: number = 5.0
  ): {
    isAnomaly: boolean;
    movementPct: number;
  } {
    const movementPct = ((currentPrice - previousPrice) / previousPrice) * 100;
    const isAnomaly = Math.abs(movementPct) > threshold;

    return {
      isAnomaly,
      movementPct,
    };
  }

  /**
   * Detect stale prices (not updated recently)
   */
  static detectStaleness(
    lastUpdate: Date,
    maxAgeSeconds: number = 25
  ): {
    isStale: boolean;
    ageSeconds: number;
  } {
    const ageSeconds = (Date.now() - lastUpdate.getTime()) / 1000;
    const isStale = ageSeconds > maxAgeSeconds;

    return {
      isStale,
      ageSeconds,
    };
  }

  /**
   * Detect multi-source disagreement
   */
  static detectDisagreement(
    pythPrice: number | undefined,
    switchboardPrice: number | undefined,
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined,
    threshold: number = 2.0 // 2% max deviation
  ): {
    isAnomaly: boolean;
    maxDeviation: number;
    sources: string[];
  } {
    const prices = [];
    const sources = [];

    if (pythPrice !== undefined) {
      prices.push(pythPrice);
      sources.push('pyth');
    }
    if (switchboardPrice !== undefined) {
      prices.push(switchboardPrice);
      sources.push('switchboard');
    }
    if (dexPrice !== undefined) {
      prices.push(dexPrice);
      sources.push('dex');
    }
    if (coingeckoPrice !== undefined) {
      prices.push(coingeckoPrice);
      sources.push('coingecko');
    }

    if (prices.length < 2) {
      return { isAnomaly: false, maxDeviation: 0, sources };
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    const maxDeviation = ((maxPrice - minPrice) / avgPrice) * 100;
    const isAnomaly = maxDeviation > threshold;

    return {
      isAnomaly,
      maxDeviation,
      sources,
    };
  }

  /**
   * Composite anomaly detection (combines multiple methods)
   */
  static detectCompositeAnomaly(
    currentPrice: number,
    priceHistory: PricePoint[],
    previousPrice: number,
    lastUpdate: Date,
    multiSourceData: {
      pyth?: number;
      switchboard?: number;
      dex?: number;
      coingecko?: number;
    }
  ): Anomaly | null {
    const zscoreResult = this.detectZScoreAnomaly(currentPrice, priceHistory);
    const movementResult = this.detectSharpMovement(currentPrice, previousPrice);
    const staleResult = this.detectStaleness(lastUpdate);
    const disagreementResult = this.detectDisagreement(
      multiSourceData.pyth,
      multiSourceData.switchboard,
      multiSourceData.dex,
      multiSourceData.coingecko
    );

    // Determine if this is a real anomaly
    const anomalyScore =
      (zscoreResult.isAnomaly ? 1 : 0) * 0.3 +
      (movementResult.isAnomaly ? 1 : 0) * 0.3 +
      (staleResult.isStale ? 1 : 0) * 0.2 +
      (disagreementResult.isAnomaly ? 1 : 0) * 0.2;

    if (anomalyScore < 0.5) {
      return null; // Not a strong anomaly
    }

    // Determine severity
    let severity: 'info' | 'warning' | 'alert' | 'critical' = 'info';
    if (anomalyScore > 0.7) severity = 'alert';
    if (anomalyScore > 0.85) severity = 'critical';
    if (zscoreResult.isAnomaly && Math.abs(zscoreResult.zScore) > 5) {
      severity = 'critical';
    }

    // Determine likely cause
    let likely_cause = 'Unknown';
    if (staleResult.isStale) {
      likely_cause = `Price feed stale for ${staleResult.ageSeconds.toFixed(1)}s`;
    } else if (Math.abs(zscoreResult.zScore) > 4) {
      likely_cause = `Extreme deviation: ${Math.abs(zscoreResult.zScore).toFixed(2)}σ`;
    } else if (disagreementResult.isAnomaly) {
      likely_cause = `Cross-oracle disagreement: ${disagreementResult.maxDeviation.toFixed(2)}%`;
    } else if (movementResult.movementPct > 5) {
      likely_cause = `Sharp price movement: ${movementResult.movementPct.toFixed(2)}%`;
    }

    // Recommendation
    let recommendation = 'Monitor closely';
    if (severity === 'critical') {
      recommendation = 'PAUSE liquidations until resolved';
    } else if (severity === 'alert') {
      recommendation = 'Reduce leverage, increase monitoring';
    }

    return {
      anomaly_id: uuidv4(),
      feed_id: 'unknown',
      feed_name: 'unknown',
      method: 'zscore',
      expected_price: zscoreResult.expectedPrice,
      actual_price: currentPrice,
      deviation_pct: zscoreResult.deviation,
      deviation_sigma: zscoreResult.zScore,
      severity,
      is_manipulation:
        severity === 'critical' &&
        disagreementResult.isAnomaly &&
        movementResult.movementPct > 10,
      detected_at: new Date(),
      resolved_at: undefined,
      likely_cause,
      recommendation,
    };
  }
}

export default AnomalyDetector;
