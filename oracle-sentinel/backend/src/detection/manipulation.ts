// Manipulation Detection: Identify coordinated price movements and attack patterns
import { Manipulation } from '../types';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

interface PricePoint {
  timestamp: Date;
  price: number;
  source: 'pyth' | 'switchboard' | 'dex' | 'coingecko';
}

/**
 * Manipulation detection algorithms
 * Identifies patterns consistent with oracle attacks
 */
export class ManipulationDetector {
  /**
   * Detect flash crash pattern:
   * Price drops suddenly, then recovers within short window
   */
  static detectFlashCrash(
    priceHistory: PricePoint[],
    window_seconds: number = 60,
    recovery_threshold_pct: number = 3.0
  ): {
    isFlashCrash: boolean;
    minPrice: number;
    maxPrice: number;
    dropPct: number;
    recoveryPct: number;
  } {
    if (priceHistory.length < 3) {
      return {
        isFlashCrash: false,
        minPrice: 0,
        maxPrice: 0,
        dropPct: 0,
        recoveryPct: 0,
      };
    }

    // Sort by timestamp
    const sorted = [...priceHistory].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const now = sorted[sorted.length - 1].timestamp.getTime();
    const windowStart = now - window_seconds * 1000;

    // Filter to window
    const window = sorted.filter((p) => p.timestamp.getTime() >= windowStart);

    if (window.length < 3) {
      return {
        isFlashCrash: false,
        minPrice: 0,
        maxPrice: 0,
        dropPct: 0,
        recoveryPct: 0,
      };
    }

    const prices = window.map((p) => p.price);
    const startPrice = prices[0];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const endPrice = prices[prices.length - 1];

    const dropPct = ((startPrice - minPrice) / startPrice) * 100;
    const recoveryPct = ((endPrice - minPrice) / minPrice) * 100;

    // Flash crash: drop > recovery_threshold, and price recovered
    const isFlashCrash = dropPct > recovery_threshold_pct && recoveryPct > 1;

    return {
      isFlashCrash,
      minPrice,
      maxPrice,
      dropPct,
      recoveryPct,
    };
  }

  /**
   * Detect cross-oracle manipulation:
   * One oracle deviates while others agree
   */
  static detectCrossOracleDeviation(
    pythPrice: number | undefined,
    switchboardPrice: number | undefined,
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined,
    deviation_threshold_pct: number = 3.0
  ): {
    hasDeviation: boolean;
    deviatingOracles: string[];
    consensusPrice: number;
    maxDeviation: number;
  } {
    const prices: Array<{ source: string; price: number }> = [];

    if (pythPrice !== undefined) prices.push({ source: 'pyth', price: pythPrice });
    if (switchboardPrice !== undefined)
      prices.push({ source: 'switchboard', price: switchboardPrice });
    if (dexPrice !== undefined) prices.push({ source: 'dex', price: dexPrice });
    if (coingeckoPrice !== undefined)
      prices.push({ source: 'coingecko', price: coingeckoPrice });

    if (prices.length < 2) {
      return {
        hasDeviation: false,
        deviatingOracles: [],
        consensusPrice: prices[0]?.price || 0,
        maxDeviation: 0,
      };
    }

    // Calculate consensus (median)
    const sorted = prices.map((p) => p.price).sort((a, b) => a - b);
    const consensusPrice =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    // Find deviating oracles
    const deviatingOracles: string[] = [];
    let maxDeviation = 0;

    for (const { source, price } of prices) {
      const deviation = Math.abs((price - consensusPrice) / consensusPrice) * 100;
      if (deviation > deviation_threshold_pct) {
        deviatingOracles.push(source);
      }
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    return {
      hasDeviation: deviatingOracles.length > 0,
      deviatingOracles,
      consensusPrice,
      maxDeviation,
    };
  }

  /**
   * Detect coordinated attacks:
   * Multiple oracles move in same direction simultaneously
   */
  static detectCoordinatedMovement(
    pythHistory: PricePoint[],
    switchboardHistory: PricePoint[],
    window_seconds: number = 30
  ): {
    isCoordinated: boolean;
    movementDirection: 'up' | 'down' | 'none';
    sourcesMoving: string[];
    correlationScore: number;
  } {
    if (pythHistory.length < 2 || switchboardHistory.length < 2) {
      return {
        isCoordinated: false,
        movementDirection: 'none',
        sourcesMoving: [],
        correlationScore: 0,
      };
    }

    // Get recent prices
    const pythRecent = pythHistory.slice(-3);
    const sbRecent = switchboardHistory.slice(-3);

    const pythFirst = pythRecent[0].price;
    const pythLast = pythRecent[pythRecent.length - 1].price;
    const sbFirst = sbRecent[0].price;
    const sbLast = sbRecent[sbRecent.length - 1].price;

    const pythChange = pythLast - pythFirst;
    const sbChange = sbLast - sbFirst;

    // Both moving in same direction?
    const sameDirection =
      (pythChange > 0 && sbChange > 0) || (pythChange < 0 && sbChange < 0);

    if (!sameDirection) {
      return {
        isCoordinated: false,
        movementDirection: 'none',
        sourcesMoving: [],
        correlationScore: 0,
      };
    }

    // Correlation score (0-1)
    const pythPct = Math.abs(pythChange / pythFirst);
    const sbPct = Math.abs(sbChange / sbFirst);
    const correlationScore = 1 - Math.abs(pythPct - sbPct) / Math.max(pythPct, sbPct);

    // Threshold: > 0.7 correlation = coordinated
    const isCoordinated = correlationScore > 0.7;

    const sourcesMoving = ['pyth', 'switchboard'];
    const movementDirection = pythChange > 0 ? 'up' : 'down';

    return {
      isCoordinated,
      movementDirection,
      sourcesMoving,
      correlationScore,
    };
  }

  /**
   * Detect validator attacks:
   * Specific validator nodes start returning bad prices
   */
  static detectValidatorAnomaly(
    validatorResponses: Array<{
      validatorId: string;
      price: number;
      timestamp: Date;
    }>,
    anomaly_threshold_pct: number = 5.0
  ): {
    hasAnomalousValidators: boolean;
    anomalousValidators: string[];
    healthyValidators: string[];
    consensusPrice: number;
  } {
    if (validatorResponses.length < 3) {
      return {
        hasAnomalousValidators: false,
        anomalousValidators: [],
        healthyValidators: validatorResponses.map((v) => v.validatorId),
        consensusPrice: validatorResponses[0]?.price || 0,
      };
    }

    // Calculate median consensus
    const prices = validatorResponses.map((v) => v.price).sort((a, b) => a - b);
    const consensusPrice =
      prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)];

    // Identify anomalous validators
    const anomalousValidators: string[] = [];
    const healthyValidators: string[] = [];

    for (const { validatorId, price } of validatorResponses) {
      const deviation = Math.abs((price - consensusPrice) / consensusPrice) * 100;
      if (deviation > anomaly_threshold_pct) {
        anomalousValidators.push(validatorId);
      } else {
        healthyValidators.push(validatorId);
      }
    }

    return {
      hasAnomalousValidators: anomalousValidators.length > 0,
      anomalousValidators,
      healthyValidators,
      consensusPrice,
    };
  }

  /**
   * Composite manipulation detection
   */
  static detectManipulation(
    pythPrice: number,
    pythHistory: PricePoint[],
    switchboardPrice: number | undefined,
    switchboardHistory: PricePoint[],
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined
  ): Manipulation | null {
    // Check for flash crash
    const flashCrash = this.detectFlashCrash(pythHistory);

    // Check for cross-oracle deviation
    const crossOracleDeviation = this.detectCrossOracleDeviation(
      pythPrice,
      switchboardPrice,
      dexPrice,
      coingeckoPrice
    );

    // Check for coordinated movement
    const coordinated =
      switchboardHistory.length > 0
        ? this.detectCoordinatedMovement(pythHistory, switchboardHistory)
        : { isCoordinated: false, movementDirection: 'none' as const, sourcesMoving: [], correlationScore: 0 };

    // Compute manipulation score
    let manipulationScore = 0;
    if (flashCrash.isFlashCrash) manipulationScore += 0.3;
    if (crossOracleDeviation.hasDeviation) manipulationScore += 0.4;
    if (coordinated.isCoordinated) manipulationScore += 0.3;

    // Only flag if score > 0.5
    if (manipulationScore < 0.5) {
      return null;
    }

    const manipulation_id = uuidv4();
    const price_before = pythHistory[Math.max(0, pythHistory.length - 2)].price;
    const price_after = pythPrice;
    const jump_pct = ((price_after - price_before) / price_before) * 100;

    return {
      manipulation_id,
      feed_id: 'unknown',
      price_before,
      price_after,
      jump_pct,
      jump_duration_seconds: 5,
      is_manipulation: true,
      confidence: Math.min(1, manipulationScore),
      validators_agreeing: coordinated.sourcesMoving,
      validators_disagreeing: crossOracleDeviation.deviatingOracles,
      cross_protocol_validate: true,
      detected_at: new Date(),
      resolved: false,
    };
  }
}

export default ManipulationDetector;
