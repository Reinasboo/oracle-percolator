// Validator Health Tracking: Monitor individual validator performance
import { ValidatorHealth } from '../types';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

/**
 * Per-validator metrics tracked over time
 */
export interface ValidatorMetrics {
  validator_id: string;
  uptime_pct: number;        // Percentage of time operational
  accuracy_pct: number;      // Accuracy vs. consensus
  latency_ms: number;        // Average response time
  updates_count: number;     // Number of price updates
  error_count: number;       // Number of failed updates
  blacklist_strikes: number; // Strikes toward blacklisting
}

/**
 * Validator health tracking and scoring
 */
export class ValidatorHealthTracker {
  /**
   * Calculate validator uptime from update history
   */
  static calculateUptime(
    totalUpdates: number,
    successfulUpdates: number
  ): number {
    if (totalUpdates === 0) return 100;
    return (successfulUpdates / totalUpdates) * 100;
  }

  /**
   * Calculate accuracy vs. consensus
   * How often this validator matches the consensus price
   */
  static calculateAccuracy(
    consensusPrices: number[],
    validatorPrices: number[],
    deviation_tolerance_pct: number = 2.0
  ): number {
    if (consensusPrices.length === 0 || validatorPrices.length === 0) {
      return 100;
    }

    const matchCount = consensusPrices.filter((consensus, idx) => {
      const validatorPrice = validatorPrices[idx];
      if (validatorPrice === undefined) return false;

      const deviation = Math.abs((validatorPrice - consensus) / consensus) * 100;
      return deviation <= deviation_tolerance_pct;
    }).length;

    return (matchCount / consensusPrices.length) * 100;
  }

  /**
   * Calculate average latency
   */
  static calculateLatency(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  /**
   * Determine if validator should be blacklisted
   */
  static shouldBlacklist(
    metrics: ValidatorMetrics,
    uptime_threshold_pct: number = 90,
    accuracy_threshold_pct: number = 85,
    max_strikes: number = 3
  ): boolean {
    // Blacklist if metrics are too poor
    if (metrics.uptime_pct < uptime_threshold_pct) {
      return true;
    }

    if (metrics.accuracy_pct < accuracy_threshold_pct) {
      return true;
    }

    if (metrics.blacklist_strikes >= max_strikes) {
      return true;
    }

    return false;
  }

  /**
   * Calculate overall validator health score (0-1)
   */
  static calculateHealthScore(
    metrics: ValidatorMetrics,
    is_blacklisted: boolean = false
  ): number {
    if (is_blacklisted) return 0;

    const uptimeScore = Math.max(0, metrics.uptime_pct - 70) / 30; // 70-100% → 0-1
    const accuracyScore = Math.max(0, metrics.accuracy_pct - 70) / 30; // 70-100% → 0-1
    const latencyScore = Math.max(0, 1 - metrics.latency_ms / 200); // 0-200ms → 1-0

    // Average with weights
    return (
      uptimeScore * 0.4 +
      accuracyScore * 0.4 +
      latencyScore * 0.2
    );
  }

  /**
   * Generate health recommendation
   */
  static getHealthRecommendation(
    healthScore: number,
    metrics: ValidatorMetrics
  ): {
    status: 'healthy' | 'degraded' | 'critical' | 'blacklisted';
    actions: string[];
  } {
    if (healthScore < 0.1) {
      return {
        status: 'blacklisted',
        actions: ['Remove from validator set', 'Investigate root cause'],
      };
    }

    if (healthScore < 0.5) {
      return {
        status: 'critical',
        actions: [
          'Reduce weight of this validator',
          'Monitor closely',
          'Prepare to downweight further if degradation continues',
        ],
      };
    }

    if (healthScore < 0.75) {
      return {
        status: 'degraded',
        actions: [
          'Monitor uptime and accuracy trends',
          'Reduce weight slightly if degradation persists',
        ],
      };
    }

    return {
      status: 'healthy',
      actions: ['No action required'],
    };
  }

  /**
   * Trend analysis: is validator getting better or worse?
   */
  static analyzeTrend(
    recentMetrics: ValidatorMetrics,
    historicalMetrics: ValidatorMetrics
  ): {
    trend: 'improving' | 'stable' | 'degrading';
    recommendation: string;
  } {
    const uptimeDelta = recentMetrics.uptime_pct - historicalMetrics.uptime_pct;
    const accuracyDelta = recentMetrics.accuracy_pct - historicalMetrics.accuracy_pct;
    const latencyDelta = recentMetrics.latency_ms - historicalMetrics.latency_ms;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    const changes = [uptimeDelta, accuracyDelta, -latencyDelta]; // Negative latency delta = good
    const improving = changes.filter((c) => c > 1).length;
    const degrading = changes.filter((c) => c < -1).length;

    if (improving > degrading) {
      trend = 'improving';
    } else if (degrading > improving) {
      trend = 'degrading';
    }

    let recommendation = '';
    if (trend === 'improving') {
      recommendation = 'Validator recovering; continue monitoring';
    } else if (trend === 'degrading') {
      recommendation =
        'Validator degrading; prepare to reduce weight or blacklist';
    } else {
      recommendation = 'Validator stable; continue normal monitoring';
    }

    return { trend, recommendation };
  }

  /**
   * Calculate validator weight (0-1) for weighted pricing
   * Combines health score with accuracy
   */
  static calculateWeight(
    healthScore: number,
    accuracy_pct: number
  ): number {
    // Both metrics must be good
    const scaledAccuracy = Math.max(0, accuracy_pct - 70) / 30; // 70-100% → 0-1
    return (healthScore * 0.6 + scaledAccuracy * 0.4);
  }
}

/**
 * Create a validator health record
 */
export function createValidatorHealthRecord(
  validator_id: string,
  uptime_pct: number,
  accuracy_pct: number,
  latency_ms: number,
  updates_count: number,
  error_count: number,
  is_blacklisted: boolean = false
): ValidatorHealth {
  const metrics: ValidatorMetrics = {
    validator_id,
    uptime_pct,
    accuracy_pct,
    latency_ms,
    updates_count,
    error_count,
    blacklist_strikes: 0,
  };

  const healthScore = ValidatorHealthTracker.calculateHealthScore(
    metrics,
    is_blacklisted
  );
  const recommendation = ValidatorHealthTracker.getHealthRecommendation(
    healthScore,
    metrics
  );

  return {
    validator_id,
    validator_name: 'unknown',
    oracle_source: 'pyth',
    uptime_pct,
    price_accuracy: accuracy_pct / 100,
    update_frequency: updates_count,
    last_update: new Date(),
    is_active: !is_blacklisted,
    is_blacklisted,
    last_alert: undefined,
    feeds_supported: ['unknown'],
  };
}

export default ValidatorHealthTracker;
