// Outage Prediction: Predict when oracle feeds might fail
import { OutagePrediction } from '../types';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

interface ValidatorHealthHistory {
  timestamp: Date;
  is_active: boolean;
  uptime_pct: number;
}

interface UpdateEvent {
  timestamp: Date;
  successful: boolean;
  latency_ms: number;
}

/**
 * Outage prediction using historical patterns
 */
export class OutagePredictor {
  /**
   * Analyze validator health trends
   */
  static analyzeValidatorHealthTrend(
    healthHistory: ValidatorHealthHistory[]
  ): {
    trend: 'stable' | 'declining' | 'improving';
    recentUptimePct: number;
    velocityPctPerDay: number;
  } {
    if (healthHistory.length < 7) {
      return {
        trend: 'stable',
        recentUptimePct: healthHistory[healthHistory.length - 1]?.uptime_pct || 100,
        velocityPctPerDay: 0,
      };
    }

    const sorted = [...healthHistory].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Recent average (last 3 data points)
    const recentUptimePct =
      sorted
        .slice(-3)
        .reduce((sum, h) => sum + h.uptime_pct, 0) / Math.min(3, sorted.length);

    // Older average (3-7 days ago)
    const olderUptimePct =
      sorted
        .slice(Math.max(0, sorted.length - 7), Math.max(0, sorted.length - 4))
        .reduce((sum, h) => sum + h.uptime_pct, 0) /
      Math.min(3, sorted.length - 4 > 0 ? sorted.length - 4 : 1);

    const uptime_change = recentUptimePct - olderUptimePct;

    let trend: 'stable' | 'declining' | 'improving' = 'stable';
    if (uptime_change < -2) trend = 'declining';
    if (uptime_change > 2) trend = 'improving';

    // Velocity: % change per day
    const velocityPctPerDay = uptime_change / 3; // Assume 3 day span

    return {
      trend,
      recentUptimePct,
      velocityPctPerDay,
    };
  }

  /**
   * Detect validator churn (validators joining/leaving)
   */
  static detectValidatorChurn(
    previousValidators: Set<string>,
    currentValidators: Set<string>
  ): {
    validatorsLeft: string[];
    validatorsJoined: string[];
    churnPct: number;
  } {
    const validatorsLeft = Array.from(previousValidators).filter(
      (v) => !currentValidators.has(v)
    );

    const validatorsJoined = Array.from(currentValidators).filter(
      (v) => !previousValidators.has(v)
    );

    const avgSize = (previousValidators.size + currentValidators.size) / 2;
    const churnPct = ((validatorsLeft.length + validatorsJoined.length) / avgSize) * 100;

    return {
      validatorsLeft,
      validatorsJoined,
      churnPct,
    };
  }

  /**
   * Predict update failure rate based on recent history
   */
  static predictUpdateFailureRate(
    updateHistory: UpdateEvent[],
    lookbackMinutes: number = 60
  ): {
    failureRate: number;
    trend: 'improving' | 'stable' | 'degrading';
    averageLatency: number;
  } {
    const now = Date.now();
    const cutoff = now - lookbackMinutes * 60000;

    const recent = updateHistory.filter((e) => e.timestamp.getTime() >= cutoff);

    if (recent.length === 0) {
      return {
        failureRate: 0,
        trend: 'stable',
        averageLatency: 0,
      };
    }

    const failures = recent.filter((e) => !e.successful).length;
    const failureRate = failures / recent.length;

    // Calculate latency trend
    const sorted = recent.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

    const avgLatencyFirst =
      firstHalf.reduce((sum, e) => sum + e.latency_ms, 0) / firstHalf.length;
    const avgLatencySecond =
      secondHalf.reduce((sum, e) => sum + e.latency_ms, 0) / secondHalf.length;

    const averageLatency = (avgLatencyFirst + avgLatencySecond) / 2;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (avgLatencySecond > avgLatencyFirst * 1.2) trend = 'degrading';
    if (avgLatencySecond < avgLatencyFirst * 0.8) trend = 'improving';

    return {
      failureRate,
      trend,
      averageLatency,
    };
  }

  /**
   * Predict probability of outage in next N hours
   * Based on health trends and historical patterns
   */
  static predictOutageProbability(
    healthTrend: ReturnType<typeof this.analyzeValidatorHealthTrend>,
    failureMetrics: ReturnType<typeof this.predictUpdateFailureRate>,
    recentIncidents: number, // Number of incidents in last 7 days
    validatorChurn: number // Churn % in last 24h
  ): number {
    let probability = 0.05; // Base 5% probability

    // Factor 1: Health trend (-0.2 to +0.3)
    if (healthTrend.trend === 'declining') {
      probability += 0.2;
    } else if (healthTrend.trend === 'improving') {
      probability -= 0.1;
    }

    // Factor 2: Current uptime (-0.15 to +0.3)
    if (healthTrend.recentUptimePct < 95) {
      probability += (1 - healthTrend.recentUptimePct / 100) * 0.3;
    }

    // Factor 3: Update failure rate (0 to +0.2)
    probability += failureMetrics.failureRate * 0.2;

    // Factor 4: Recent incidents (0 to +0.15)
    probability += Math.min(0.15, recentIncidents * 0.05);

    // Factor 5: Validator churn (0 to +0.1)
    probability += Math.min(0.1, (validatorChurn / 100) * 0.1);

    return Math.max(0, Math.min(1, probability));
  }

  /**
   * Estimate recovery time based on historical patterns
   */
  static estimateRecoveryTime(
    previousOutages: Array<{ duration_minutes: number; cause: string }>,
    currentCause: string
  ): number {
    if (previousOutages.length === 0) {
      return 15; // Default 15 minutes
    }

    // Filter by cause if applicable
    const similar = previousOutages.filter(
      (o) =>
        o.cause.toLowerCase().includes(currentCause.toLowerCase()) ||
        currentCause.toLowerCase().includes(o.cause.toLowerCase())
    );

    if (similar.length > 0) {
      // Average duration of similar outages
      const avgDuration =
        similar.reduce((sum, o) => sum + o.duration_minutes, 0) / similar.length;
      return Math.ceil(avgDuration);
    }

    // Average of all outages
    const avgDuration =
      previousOutages.reduce((sum, o) => sum + o.duration_minutes, 0) /
      previousOutages.length;
    return Math.ceil(avgDuration);
  }

  /**
   * Generate comprehensive outage prediction
   */
  static predictOutage(
    feedId: string,
    healthHistory: ValidatorHealthHistory[],
    updateHistory: UpdateEvent[],
    previousValidators: Set<string>,
    currentValidators: Set<string>,
    recentIncidentsCount: number = 0,
    previousOutages: Array<{ duration_minutes: number; cause: string }> = []
  ): OutagePrediction {
    // Analyze trends
    const healthTrend = this.analyzeValidatorHealthTrend(healthHistory);
    const failureMetrics = this.predictUpdateFailureRate(updateHistory);
    const churn = this.detectValidatorChurn(previousValidators, currentValidators);

    // Calculate outage probability
    const probability = this.predictOutageProbability(
      healthTrend,
      failureMetrics,
      recentIncidentsCount,
      churn.churnPct
    );

    // Estimate recovery time (15 min default if no data)
    const recovery_time = this.estimateRecoveryTime(previousOutages, healthTrend.trend);

    // Time windows
    const now = new Date();
    const prediction_window_start = new Date(now.getTime() + 30 * 60000); // Next 30 minutes
    const prediction_window_end = new Date(now.getTime() + 2 * 60 * 60000); // Next 2 hours

    return {
      prediction_id: uuidv4(),
      feed_id: feedId,
      predicted_outage_probability: probability,
      predicted_outage_window_start: prediction_window_start,
      predicted_outage_window_end: prediction_window_end,
      recent_incidents: recentIncidentsCount,
      uptime_trend: healthTrend.trend,
      validator_churn: churn.churnPct,
      confidence_in_prediction: Math.min(
        1,
        (healthHistory.length + updateHistory.length) / 100
      ), // Higher with more data
      estimated_recovery_time_minutes: probability > 0.3 ? recovery_time : undefined,
      created_at: now,
    };
  }
}

export default OutagePredictor;
