// Confidence Scoring: Combine all oracle sources into final confidence metric
import { ConfidenceScore } from '../types';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

/**
 * Confidence component breakdown
 * Each component (0-1) contributes to overall confidence
 */
export interface ConfidenceComponents {
  // Source agreement (0-1): how well all sources agree
  source_agreement: number;

  // Spec compliance (0-1): from Phase 2 formal verification
  spec_compliance: number;

  // Manipulation safety (0-1): inverse of manipulation probability
  manipulation_safety: number;

  // Outage resilience (0-1): inverse of outage probability
  outage_resilience: number;

  // Data freshness (0-1): based on update frequency and staleness
  data_freshness: number;

  // Validator health (0-1): from validator uptime tracking
  validator_health: number;
}

/**
 * Weighting for different oracle sources
 * Adjustable based on historical accuracy
 */
export const DEFAULT_SOURCE_WEIGHTS = {
  pyth: 0.35,        // Primary oracle (trusted, most data)
  switchboard: 0.25, // Secondary oracle (fallback)
  dex: 0.20,        // On-chain reference (high confidence when liquid)
  coingecko: 0.20,  // Off-chain reference (most available)
};

/**
 * Confidence scoring algorithm
 * Produces 0-1 score combining multiple factors
 */
export class ConfidenceScorer {
  /**
   * Calculate source agreement (consensus check)
   * Returns 1.0 if all sources agree, lower if they deviate
   */
  static calculateSourceAgreement(
    pythPrice: number | undefined,
    switchboardPrice: number | undefined,
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined,
    deviation_tolerance_pct: number = 2.0
  ): number {
    const prices: number[] = [];
    if (pythPrice !== undefined) prices.push(pythPrice);
    if (switchboardPrice !== undefined) prices.push(switchboardPrice);
    if (dexPrice !== undefined) prices.push(dexPrice);
    if (coingeckoPrice !== undefined) prices.push(coingeckoPrice);

    if (prices.length < 2) {
      return 1.0; // Only one source = perfect agreement by definition
    }

    // Calculate median as consensus
    const sorted = [...prices].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    // Calculate deviation for each price
    let maxDeviation = 0;
    let agreingCount = 0;

    for (const price of prices) {
      const deviation = Math.abs((price - median) / median) * 100;
      maxDeviation = Math.max(maxDeviation, deviation);

      if (deviation <= deviation_tolerance_pct) {
        agreingCount++;
      }
    }

    // Score: 1.0 if all within tolerance, decreases with deviation
    // agreement = (agreeing_count / total) × (1 - deviation_factor)
    const agreementRatio = agreingCount / prices.length;
    const deviationFactor = Math.min(1.0, maxDeviation / 10.0); // Normalize to 10%

    return Math.max(0.1, agreementRatio * (1 - deviationFactor * 0.5));
  }

  /**
   * Weighted average of multiple oracle prices
   */
  static calculateWeightedPrice(
    pythPrice: number | undefined,
    switchboardPrice: number | undefined,
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined,
    weights = DEFAULT_SOURCE_WEIGHTS
  ): number {
    let totalPrice = 0;
    let totalWeight = 0;

    if (pythPrice !== undefined) {
      totalPrice += pythPrice * weights.pyth;
      totalWeight += weights.pyth;
    }

    if (switchboardPrice !== undefined) {
      totalPrice += switchboardPrice * weights.switchboard;
      totalWeight += weights.switchboard;
    }

    if (dexPrice !== undefined) {
      totalPrice += dexPrice * weights.dex;
      totalWeight += weights.dex;
    }

    if (coingeckoPrice !== undefined) {
      totalPrice += coingeckoPrice * weights.coingecko;
      totalWeight += weights.coingecko;
    }

    if (totalWeight === 0) return 0;

    return totalPrice / totalWeight;
  }

  /**
   * Calculate composite confidence score
   * Combines all components into 0-1 overall confidence
   */
  static calculateCompositeConfidence(
    components: ConfidenceComponents,
    weights: {
      source_agreement: number;
      spec_compliance: number;
      manipulation_safety: number;
      outage_resilience: number;
      data_freshness: number;
      validator_health: number;
    } = {
      source_agreement: 0.25,
      spec_compliance: 0.20,
      manipulation_safety: 0.15,
      outage_resilience: 0.15,
      data_freshness: 0.15,
      validator_health: 0.10,
    }
  ): number {
    const confidence =
      components.source_agreement * weights.source_agreement +
      components.spec_compliance * weights.spec_compliance +
      components.manipulation_safety * weights.manipulation_safety +
      components.outage_resilience * weights.outage_resilience +
      components.data_freshness * weights.data_freshness +
      components.validator_health * weights.validator_health;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate human-readable confidence interpretation
   */
  static interpretConfidence(
    confidence: number
  ): {
    level: 'critical' | 'warning' | 'caution' | 'good' | 'excellent';
    recommendation: string;
  } {
    if (confidence >= 0.95) {
      return {
        level: 'excellent',
        recommendation: 'Safe to use for high-value transactions',
      };
    }

    if (confidence >= 0.85) {
      return {
        level: 'good',
        recommendation: 'Safe to use for normal transactions',
      };
    }

    if (confidence >= 0.70) {
      return {
        level: 'caution',
        recommendation:
          'Use with increased slippage tolerance; monitor closely',
      };
    }

    if (confidence >= 0.50) {
      return {
        level: 'warning',
        recommendation:
          'Avoid large transactions; wait for oracle recovery',
      };
    }

    return {
      level: 'critical',
      recommendation: 'Do not use; wait for oracle recovery',
    };
  }

  /**
   * Generate reasoning explanation (for debugging)
   */
  static generateReasoning(components: ConfidenceComponents): string[] {
    const reasons: string[] = [];

    if (components.source_agreement < 0.8) {
      reasons.push(
        `⚠️ Source disagreement (${(components.source_agreement * 100).toFixed(0)}%): Oracles not in consensus`
      );
    } else {
      reasons.push(
        `✓ Source agreement (${(components.source_agreement * 100).toFixed(0)}%): All sources aligned`
      );
    }

    if (components.spec_compliance < 0.9) {
      reasons.push(
        `⚠️ Spec non-compliance (${(components.spec_compliance * 100).toFixed(0)}%): Price violates bounds/continuity`
      );
    } else {
      reasons.push(
        `✓ Spec compliant: Price within valid ranges`
      );
    }

    if (components.manipulation_safety < 0.85) {
      reasons.push(
        `⚠️ Manipulation detected (confidence: ${((1 - components.manipulation_safety) * 100).toFixed(0)}%)`
      );
    } else {
      reasons.push(
        `✓ No manipulation detected`
      );
    }

    if (components.outage_resilience < 0.85) {
      reasons.push(
        `⚠️ Outage risk (${((1 - components.outage_resilience) * 100).toFixed(0)}% probability)`
      );
    } else {
      reasons.push(
        `✓ Oracle resilient`
      );
    }

    if (components.data_freshness < 0.9) {
      reasons.push(
        `⚠️ Data staleness: Updates are infrequent`
      );
    } else {
      reasons.push(
        `✓ Data fresh`
      );
    }

    if (components.validator_health < 0.85) {
      reasons.push(
        `⚠️ Validator health concerns (${(components.validator_health * 100).toFixed(0)}% healthy)`
      );
    } else {
      reasons.push(
        `✓ Validators healthy`
      );
    }

    return reasons;
  }
}

/**
 * Create a confidence score record for storage
 */
export function createConfidenceScore(
  feedId: string,
  pythPrice: number | undefined,
  switchboardPrice: number | undefined,
  dexPrice: number | undefined,
  coingeckoPrice: number | undefined,
  components: ConfidenceComponents,
  specCompliance: number,
  manipulationConfidence: number,
  outageProbability: number,
  validatorHealthScore: number
): ConfidenceScore {
  const confidence = ConfidenceScorer.calculateCompositeConfidence(components);
  const interpretation = ConfidenceScorer.interpretConfidence(confidence);
  const reasoning = ConfidenceScorer.generateReasoning(components);
  const weightedPrice = ConfidenceScorer.calculateWeightedPrice(
    pythPrice,
    switchboardPrice,
    dexPrice,
    coingeckoPrice
  );

  return {
    confidence_id: uuidv4(),
    feed_id: feedId,
    overall_confidence: confidence,
    components: components,
    weighted_price: weightedPrice,
    confidence_interpretation: interpretation.level,
    recommendation: interpretation.recommendation,
    reasoning: reasoning,
    source_prices: {
      pyth: pythPrice,
      switchboard: switchboardPrice,
      dex: dexPrice,
      coingecko: coingeckoPrice,
    },
    created_at: new Date(),
  };
}

export default ConfidenceScorer;
