// Formal Verification: Validate prices against Percolator spec invariants
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';
import { PercolatorSpecValidation } from '../types';

/**
 * Percolator Spec Constraints (from spec.md)
 * 
 * These are the invariants that all oracle prices must satisfy
 */
export interface PercolatorSpecConstraints {
  // Price bounds (per asset, from market config)
  min_price: number;        // Minimum realistic price
  max_price: number;        // Maximum realistic price
  
  // Continuity bounds (prevent discontinuous jumps)
  max_price_jump_pct: number;  // Max jump between consecutive prices (e.g., 5%)
  
  // Staleness bounds
  max_age_seconds: number;  // Max age for price to be valid
  
  // Oracle-specific constraints
  oracle_source: 'pyth' | 'switchboard' | 'dex' | 'coingecko';
  
  // Composite price constraints (for 3-leg STOXX50/SOL)
  is_composite: boolean;
  composite_legs?: {
    leg1_min: number;
    leg1_max: number;
    leg2_min: number;
    leg2_max: number;
    leg3_min: number;
    leg3_max: number;
  };
}

/**
 * Default Percolator Spec Constraints
 * Based on percolator/spec.md normative requirements
 */
export const DEFAULT_PERCOLATOR_CONSTRAINTS: PercolatorSpecConstraints = {
  // STOXX50_ETF/EUR: realistic range 5000-6000
  min_price: 4000,
  max_price: 7000,
  
  // Price discontinuity: max 10% jump (circuit breaker)
  max_price_jump_pct: 10,
  
  // Staleness: 25 seconds max (Pyth default)
  max_age_seconds: 25,
  
  oracle_source: 'pyth',
  
  is_composite: false,
  composite_legs: {
    leg1_min: 1,
    leg1_max: 200,
    leg2_min: 0.1,
    leg2_max: 10,
    leg3_min: 50,
    leg3_max: 200,
  },
};

export class FormalVerifier {
  /**
   * Validate price satisfies all Percolator spec invariants
   */
  static validatePrice(
    price: number,
    previousPrice: number | undefined,
    age_seconds: number,
    constraints: PercolatorSpecConstraints = DEFAULT_PERCOLATOR_CONSTRAINTS
  ): PercolatorSpecValidation {
    const validation_id = uuidv4();
    const violations: string[] = [];

    // Invariant 1: Bounds check
    const satisfies_bounds = price >= constraints.min_price && price <= constraints.max_price;
    if (!satisfies_bounds) {
      violations.push(
        `Price ${price} outside bounds [${constraints.min_price}, ${constraints.max_price}]`
      );
    }

    // Invariant 2: Continuity check
    let satisfies_continuity = true;
    if (previousPrice !== undefined) {
      const jump_pct = Math.abs((price - previousPrice) / previousPrice) * 100;
      // Treat equality as a violation (strict threshold)
      satisfies_continuity = jump_pct < constraints.max_price_jump_pct;
      
      if (!satisfies_continuity) {
        violations.push(
          `Price jump ${jump_pct.toFixed(2)}% exceeds limit ${constraints.max_price_jump_pct}%`
        );
      }
    }

    // Invariant 3: Staleness check
    const satisfies_staleness = age_seconds <= constraints.max_age_seconds;
    if (!satisfies_staleness) {
      violations.push(
        `Price age ${age_seconds.toFixed(1)}s exceeds max ${constraints.max_age_seconds}s`
      );
    }

    // Overall spec compliance
    const spec_compliant = violations.length === 0;

    return {
      validation_id,
      feed_id: 'unknown',
      price,
      satisfies_bounds,
      satisfies_continuity,
      satisfies_staleness,
      spec_compliant,
      spec_violations: violations,
      validated_at: new Date(),
    };
  }

  /**
   * Validate composite price (3-leg: leg1 × leg2 ÷ leg3)
   */
  static validateCompositePrice(
    leg1_price: number,
    leg1_previous: number | undefined,
    leg1_age: number,
    
    leg2_price: number,
    leg2_previous: number | undefined,
    leg2_age: number,
    
    leg3_price: number,
    leg3_previous: number | undefined,
    leg3_age: number,
    
    compositeConstraints: PercolatorSpecConstraints
  ): {
    leg1_valid: PercolatorSpecValidation;
    leg2_valid: PercolatorSpecValidation;
    leg3_valid: PercolatorSpecValidation;
    composite_valid: boolean;
    overall_valid: boolean;
  } {
    // Validate each leg independently
    const leg1_valid = this.validatePrice(leg1_price, leg1_previous, leg1_age, {
      ...compositeConstraints,
      min_price: compositeConstraints.composite_legs?.leg1_min ?? compositeConstraints.min_price,
      max_price: compositeConstraints.composite_legs?.leg1_max ?? compositeConstraints.max_price,
    });

    const leg2_valid = this.validatePrice(leg2_price, leg2_previous, leg2_age, {
      ...compositeConstraints,
      min_price: compositeConstraints.composite_legs?.leg2_min ?? compositeConstraints.min_price,
      max_price: compositeConstraints.composite_legs?.leg2_max ?? compositeConstraints.max_price,
    });

    const leg3_valid = this.validatePrice(leg3_price, leg3_previous, leg3_age, {
      ...compositeConstraints,
      min_price: compositeConstraints.composite_legs?.leg3_min ?? compositeConstraints.min_price,
      max_price: compositeConstraints.composite_legs?.leg3_max ?? compositeConstraints.max_price,
    });

    // Compute composite: (leg1 × leg2) ÷ leg3
    const composite_price = (leg1_price * leg2_price) / leg3_price;
    const composite_valid =
      leg1_valid.spec_compliant &&
      leg2_valid.spec_compliant &&
      leg3_valid.spec_compliant &&
      composite_price > 0 &&
      !isNaN(composite_price);

    const overall_valid = composite_valid;

    return {
      leg1_valid,
      leg2_valid,
      leg3_valid,
      composite_valid,
      overall_valid,
    };
  }

  /**
   * Get spec compliance score (for confidence penalty)
   * Returns 0-1, where 1.0 = perfect compliance
   */
  static getComplianceScore(validation: PercolatorSpecValidation): number {
    if (validation.spec_compliant) {
      return 1.0;
    }

    // Partial credit for partial compliance
    let score = 0;
    const checks = [
      validation.satisfies_bounds,
      validation.satisfies_continuity,
      validation.satisfies_staleness,
    ];

    const passing = checks.filter((c) => c).length;
    score = passing / checks.length;

    // Additional penalty based on violation severity
    if (validation.spec_violations.some((v) => v.includes('jump'))) {
      score *= 0.5; // 50% penalty for jump violations
    }
    if (validation.spec_violations.some((v) => v.includes('bounds'))) {
      score *= 0.3; // 70% penalty for bounds violations
    }
    if (validation.spec_violations.some((v) => v.includes('age'))) {
      score *= 0.7; // 30% penalty for staleness violations
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate recommendation based on spec violations
   */
  static getRecommendation(validation: PercolatorSpecValidation): string {
    if (validation.spec_compliant) {
      return 'Price satisfies all Percolator spec invariants';
    }

    const recommendations: string[] = [];

    if (!validation.satisfies_bounds) {
      recommendations.push(
        'Price outside realistic bounds—verify oracle data source'
      );
    }

    if (!validation.satisfies_continuity) {
      recommendations.push(
        'Discontinuous jump detected—possible manipulation or data error'
      );
    }

    if (!validation.satisfies_staleness) {
      recommendations.push(
        'Price feed stale—oracle may be offline or lagging'
      );
    }

    return (
      recommendations.join('; ') ||
      'Spec validation failed—review violations'
    );
  }
}

export default FormalVerifier;
