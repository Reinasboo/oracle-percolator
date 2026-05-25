// Cross-Protocol Comparison: Compare prices across different oracle protocols
import { CrossProtocolComparison } from '../types';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

/**
 * Per-feed price snapshot from all protocols
 */
export interface ProtocolPriceSnapshot {
  timestamp: Date;
  pyth?: number;
  switchboard?: number;
  orca?: number;
  coingecko?: number;
}

/**
 * Cross-protocol analysis
 */
export class CrossProtocolAnalyzer {
  /**
   * Calculate consensus price (median of available sources)
   */
  static calculateConsensusPrice(snapshot: ProtocolPriceSnapshot): number {
    const prices = [
      snapshot.pyth,
      snapshot.switchboard,
      snapshot.orca,
      snapshot.coingecko,
    ].filter((p) => p !== undefined) as number[];

    if (prices.length === 0) return 0;

    const sorted = prices.sort((a, b) => a - b);
    return sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  }

  /**
   * Analyze protocol consistency
   * Returns score 0-1 where 1.0 = perfect agreement
   */
  static analyzeConsistency(
    snapshot: ProtocolPriceSnapshot,
    tolerance_pct: number = 2.0
  ): {
    consistency_score: number;
    deviation_report: Record<string, number>;
    most_deviant: string | null;
  } {
    const consensusPrice = this.calculateConsensusPrice(snapshot);
    if (consensusPrice === 0) {
      return {
        consistency_score: 0,
        deviation_report: {},
        most_deviant: null,
      };
    }

    const deviations: Record<string, number> = {};
    let maxDeviation = 0;
    let mostDeviant: string | null = null;

    // Check each protocol
    const protocols = [
      { name: 'pyth', price: snapshot.pyth },
      { name: 'switchboard', price: snapshot.switchboard },
      { name: 'orca', price: snapshot.orca },
      { name: 'coingecko', price: snapshot.coingecko },
    ];

    for (const { name, price } of protocols) {
      if (price === undefined) continue;

      const deviation = Math.abs((price - consensusPrice) / consensusPrice) * 100;
      deviations[name] = deviation;

      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        mostDeviant = name;
      }
    }

    // Score: 1.0 if all within tolerance, decreases with deviation
    const agreeing = Object.values(deviations).filter((d) => d <= tolerance_pct).length;
    const total = Object.keys(deviations).length;
    const agreementRatio = total > 0 ? agreeing / total : 0;

    const deviationFactor = Math.min(1.0, maxDeviation / 10.0); // Normalize to 10%
    const consistencyScore = Math.max(0.1, agreementRatio * (1 - deviationFactor * 0.5));

    return {
      consistency_score: consistencyScore,
      deviation_report: deviations,
      most_deviant: mostDeviant,
    };
  }

  /**
   * Detect when a protocol is an outlier
   */
  static detectOutliers(
    snapshot: ProtocolPriceSnapshot,
    deviation_threshold_pct: number = 3.0
  ): {
    has_outliers: boolean;
    outlier_protocols: string[];
    trustworthy_protocols: string[];
  } {
    const analysis = this.analyzeConsistency(snapshot, deviation_threshold_pct);

    const outlier_protocols = Object.entries(analysis.deviation_report)
      .filter(([_, deviation]) => deviation > deviation_threshold_pct)
      .map(([name, _]) => name);

    const trustworthy_protocols = Object.entries(analysis.deviation_report)
      .filter(([_, deviation]) => deviation <= deviation_threshold_pct)
      .map(([name, _]) => name);

    return {
      has_outliers: outlier_protocols.length > 0,
      outlier_protocols,
      trustworthy_protocols,
    };
  }

  /**
   * Identify stable vs. volatile protocols
   * By comparing standard deviation of recent prices
   */
  static analyzeVolatility(
    snapshots: ProtocolPriceSnapshot[]
  ): {
    pyth_volatility: number;
    switchboard_volatility: number;
    orca_volatility: number;
    coingecko_volatility: number;
    most_stable_protocol: string;
    most_volatile_protocol: string;
  } {
    const protocols = ['pyth', 'switchboard', 'orca', 'coingecko'] as const;
    const volatilities: Record<string, number> = {};

    for (const protocol of protocols) {
      const prices = snapshots
        .map((s) => s[protocol])
        .filter((p) => p !== undefined) as number[];

      if (prices.length < 2) {
        volatilities[protocol] = 0;
        continue;
      }

      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance =
        prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = (stdDev / mean) * 100; // As percentage

      volatilities[protocol] = coefficientOfVariation;
    }

    const sorted = Object.entries(volatilities).sort((a, b) => a[1] - b[1]);

    return {
      pyth_volatility: volatilities.pyth || 0,
      switchboard_volatility: volatilities.switchboard || 0,
      orca_volatility: volatilities.orca || 0,
      coingecko_volatility: volatilities.coingecko || 0,
      most_stable_protocol: sorted[0]?.[0] || 'unknown',
      most_volatile_protocol: sorted[sorted.length - 1]?.[0] || 'unknown',
    };
  }

  /**
   * Generate cross-protocol health report
   */
  static generateHealthReport(
    snapshot: ProtocolPriceSnapshot
  ): {
    overall_health: 'excellent' | 'good' | 'warning' | 'critical';
    consensus_price: number;
    recommendation: string;
    status_per_protocol: Record<
      string,
      { online: boolean; deviation_pct: number; status: string }
    >;
  } {
    const consensus = this.calculateConsensusPrice(snapshot);
    const consistency = this.analyzeConsistency(snapshot);
    const outliers = this.detectOutliers(snapshot);

    const statusPerProtocol: Record<
      string,
      { online: boolean; deviation_pct: number; status: string }
    > = {};

    const protocols = [
      { name: 'pyth', price: snapshot.pyth },
      { name: 'switchboard', price: snapshot.switchboard },
      { name: 'orca', price: snapshot.orca },
      { name: 'coingecko', price: snapshot.coingecko },
    ];

    for (const { name, price } of protocols) {
      const online = price !== undefined;
      const deviation = online
        ? Math.abs((price! - consensus) / consensus) * 100
        : 0;
      const isOutlier = outliers.outlier_protocols.includes(name);

      statusPerProtocol[name] = {
        online,
        deviation_pct: deviation,
        status: !online ? 'offline' : isOutlier ? 'outlier' : 'healthy',
      };
    }

    let overall_health: 'excellent' | 'good' | 'warning' | 'critical';
    let recommendation = '';

    if (consistency.consistency_score >= 0.9) {
      overall_health = 'excellent';
      recommendation = 'All protocols in agreement; price is highly reliable';
    } else if (consistency.consistency_score >= 0.75) {
      overall_health = 'good';
      recommendation = 'Most protocols agree; price is reliable';
    } else if (consistency.consistency_score >= 0.5) {
      overall_health = 'warning';
      recommendation = `Protocol disagreement detected (${consistency.most_deviant} is deviating); use caution`;
    } else {
      overall_health = 'critical';
      recommendation = 'Major protocol disagreement; do not use price until resolved';
    }

    return {
      overall_health,
      consensus_price: consensus,
      recommendation,
      status_per_protocol: statusPerProtocol,
    };
  }
}

/**
 * Create a cross-protocol comparison record
 */
export function createCrossProtocolComparison(
  feedId: string,
  snapshot: ProtocolPriceSnapshot
): CrossProtocolComparison {
  const health = CrossProtocolAnalyzer.generateHealthReport(snapshot);
  const consistency = CrossProtocolAnalyzer.analyzeConsistency(snapshot);

  // Map to CrossProtocolComparison schema
  return {
    feed_id: feedId,
    asset_pair: 'unknown',
    pyth_price: snapshot.pyth,
    pyth_confidence: undefined,
    switchboard_price: snapshot.switchboard,
    switchboard_confidence: undefined,
    orca_price: snapshot.orca,
    orca_liquidity: undefined,
    coingecko_price: snapshot.coingecko,
    consensus_price: health.consensus_price,
    max_deviation_pct: Math.max(...Object.values(consistency.deviation_report || {0:0})),
    agreement_level:
      consistency.consistency_score >= 0.9
        ? 'excellent'
        : consistency.consistency_score >= 0.75
        ? 'good'
        : consistency.consistency_score >= 0.5
        ? 'fair'
        : 'poor',
    last_updated: new Date(),
  };
}

export default CrossProtocolAnalyzer;
