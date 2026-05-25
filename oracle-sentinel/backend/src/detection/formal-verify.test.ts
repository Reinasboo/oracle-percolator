// Unit tests for Formal Verification module
import FormalVerifier, { DEFAULT_PERCOLATOR_CONSTRAINTS } from './formal-verify';

describe('FormalVerifier', () => {
  describe('validatePrice', () => {
    test('should pass bounds check for valid price', () => {
      const result = FormalVerifier.validatePrice(
        5000, // Within [4000, 7000]
        5100,
        10
      );
      expect(result.satisfies_bounds).toBe(true);
      expect(result.spec_compliant).toBe(true);
    });

    test('should fail bounds check for price too low', () => {
      const result = FormalVerifier.validatePrice(
        3500, // Below 4000
        5000,
        10
      );
      expect(result.satisfies_bounds).toBe(false);
      expect(result.spec_compliant).toBe(false);
    });

    test('should fail bounds check for price too high', () => {
      const result = FormalVerifier.validatePrice(
        7500, // Above 7000
        5000,
        10
      );
      expect(result.satisfies_bounds).toBe(false);
      expect(result.spec_compliant).toBe(false);
    });

    test('should fail continuity check for large jump', () => {
      const result = FormalVerifier.validatePrice(
        5500, // 10% jump from 5000
        5000,
        10
      );
      expect(result.satisfies_continuity).toBe(false);
      expect(result.spec_compliant).toBe(false);
    });

    test('should pass continuity check for small jump', () => {
      const result = FormalVerifier.validatePrice(
        5100, // 2% jump from 5000
        5000,
        10
      );
      expect(result.satisfies_continuity).toBe(true);
    });

    test('should fail staleness check for old price', () => {
      const result = FormalVerifier.validatePrice(
        5000,
        5100,
        30 // 30 seconds > 25s limit
      );
      expect(result.satisfies_staleness).toBe(false);
      expect(result.spec_compliant).toBe(false);
    });

    test('should pass staleness check for recent price', () => {
      const result = FormalVerifier.validatePrice(
        5000,
        5100,
        10 // 10 seconds < 25s limit
      );
      expect(result.satisfies_staleness).toBe(true);
    });
  });

  describe('getComplianceScore', () => {
    test('should return 1.0 for fully compliant price', () => {
      const validation = FormalVerifier.validatePrice(5000, 5100, 10);
      const score = FormalVerifier.getComplianceScore(validation);
      expect(score).toBe(1.0);
    });

    test('should return partial score for partial compliance', () => {
      const validation = FormalVerifier.validatePrice(
        5500, // Bounds and staleness pass, continuity fails
        5000,
        10
      );
      const score = FormalVerifier.getComplianceScore(validation);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    test('should apply additional penalty for jump violations', () => {
      const jumpValidation = FormalVerifier.validatePrice(5550, 5000, 10);
      const jumpScore = FormalVerifier.getComplianceScore(jumpValidation);

      const staleneValidation = FormalVerifier.validatePrice(5000, 5100, 30);
      const staleScore = FormalVerifier.getComplianceScore(staleneValidation);

      // Jump penalty (50%) should be more severe than staleness
      expect(jumpScore).toBeLessThan(staleScore);
    });
  });

  describe('getRecommendation', () => {
    test('should return success message for compliant price', () => {
      const validation = FormalVerifier.validatePrice(5000, 5100, 10);
      const rec = FormalVerifier.getRecommendation(validation);
      expect(rec).toContain('satisfies all');
    });

    test('should recommend bounds verification for out-of-range price', () => {
      const validation = FormalVerifier.validatePrice(3500, 5000, 10);
      const rec = FormalVerifier.getRecommendation(validation);
      expect(rec).toContain('bounds');
    });

    test('should recommend manipulation check for large jump', () => {
      const validation = FormalVerifier.validatePrice(5550, 5000, 10);
      const rec = FormalVerifier.getRecommendation(validation);
      expect(rec).toContain('jump');
    });

    test('should recommend oracle check for stale price', () => {
      const validation = FormalVerifier.validatePrice(5000, 5100, 30);
      const rec = FormalVerifier.getRecommendation(validation);
      expect(rec).toContain('stale');
    });
  });

  describe('validateCompositePrice', () => {
    test('should validate 3-leg composite correctly', () => {
      // leg1 * leg2 / leg3 = 100 * 1.2 / 120 = 1.0
      const result = FormalVerifier.validateCompositePrice(
        100, 100, 10,    // leg1
        1.2, 1.2, 10,    // leg2
        120, 120, 10,    // leg3
        DEFAULT_PERCOLATOR_CONSTRAINTS
      );

      expect(result.composite_valid).toBe(true);
      expect(result.overall_valid).toBe(true);
    });

    test('should detect invalid leg in composite', () => {
      const result = FormalVerifier.validateCompositePrice(
        3500, 3500, 10,  // leg1 out of bounds
        1.2, 1.2, 10,    // leg2
        120, 120, 10,    // leg3
        DEFAULT_PERCOLATOR_CONSTRAINTS
      );

      expect(result.composite_valid).toBe(false);
      expect(result.leg1_valid.satisfies_bounds).toBe(false);
    });
  });
});
