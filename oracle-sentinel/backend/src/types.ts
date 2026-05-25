// Data models and types for Oracle Sentinel

import { z } from 'zod';

// ============ Oracle Prices ============

export const OraclePriceSchema = z.object({
  feed_id: z.string(),
  feed_name: z.string(),
  source: z.enum(['pyth', 'switchboard', 'dex', 'coingecko']),
  price: z.number().positive(),
  price_e6: z.bigint(), // 1.0 = 1e6
  confidence: z.number().min(0).max(1),
  timestamp: z.date(),
  is_stale: z.boolean(),
  max_age_seconds: z.number().optional(),
});

export type OraclePrice = z.infer<typeof OraclePriceSchema>;

// ============ Confidence Scoring ============

export const ConfidenceScoreSchema = z.object({
  confidence_id: z.string(),
  feed_id: z.string(),
  feed_name: z.string().optional(),
  overall_confidence: z.number().min(0).max(1),
  components: z.object({
    source_agreement: z.number(),
    spec_compliance: z.number(),
    manipulation_safety: z.number(),
    outage_resilience: z.number(),
    data_freshness: z.number(),
    validator_health: z.number(),
  }),
  weighted_price: z.number().optional(),
  confidence_interpretation: z.string(),
  recommendation: z.string(),
  reasoning: z.array(z.string()),
  source_prices: z.object({
    pyth: z.number().optional(),
    switchboard: z.number().optional(),
    dex: z.number().optional(),
    coingecko: z.number().optional(),
  }),
  created_at: z.date(),
  // Legacy / compatibility fields
  pyth_confidence: z.number().min(0).max(1).optional(),
  switchboard_confidence: z.number().min(0).max(1).optional(),
  dex_consistency: z.number().min(0).max(1).optional(),
  cross_protocol_agreement: z.number().min(0).max(1).optional(),
  alerts: z.array(z.object({
    type: z.string(),
    severity: z.string(),
    message: z.string(),
  })).optional(),
  last_updated: z.date().optional(),
  previous_confidence: z.number().min(0).max(1).optional(),
});

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

// ============ Anomaly Detection ============

export const AnomalySchema = z.object({
  anomaly_id: z.string(),
  feed_id: z.string(),
  feed_name: z.string(),
  
  // Detection method
  method: z.enum(['zscore', 'isolation_forest', 'autoencoder', 'formal_verify']),
  
  // Anomaly details
  expected_price: z.number().positive(),
  actual_price: z.number().positive(),
  deviation_pct: z.number(),
  deviation_sigma: z.number(), // Z-score
  
  // Severity
  severity: z.enum(['info', 'warning', 'alert', 'critical']),
  is_manipulation: z.boolean(),
  
  detected_at: z.date(),
  resolved_at: z.date().optional(),
  
  // Root cause analysis
  likely_cause: z.string(),
  recommendation: z.string(),
});

export type Anomaly = z.infer<typeof AnomalySchema>;

// ============ Manipulation Detection ============

export const ManipulationSchema = z.object({
  manipulation_id: z.string(),
  feed_id: z.string(),
  
  // Price jump details
  price_before: z.number().positive(),
  price_after: z.number().positive(),
  jump_pct: z.number(),
  jump_duration_seconds: z.number(),
  
  // Confidence
  is_manipulation: z.boolean(),
  confidence: z.number().min(0).max(1),
  
  // Reasoning
  validators_agreeing: z.array(z.string()),
  validators_disagreeing: z.array(z.string()),
  cross_protocol_validate: z.boolean(),
  
  detected_at: z.date(),
  resolved: z.boolean(),
});

export type Manipulation = z.infer<typeof ManipulationSchema>;

// ============ Validator Health ============

export const ValidatorHealthSchema = z.object({
  validator_id: z.string(),
  validator_name: z.string().optional(),
  oracle_source: z.enum(['pyth', 'switchboard']),
  
  // Health metrics
  uptime_pct: z.number().min(0).max(100),
  price_accuracy: z.number().min(0).max(1), // Compared to consensus
  update_frequency: z.number(), // Updates per minute
  last_update: z.date(),
  
  // Status
  is_active: z.boolean(),
  is_blacklisted: z.boolean(),
  last_alert: z.date().optional(),
  
  feeds_supported: z.array(z.string()),
});

export type ValidatorHealth = z.infer<typeof ValidatorHealthSchema>;

// ============ Cross-Protocol Comparison ============

export const CrossProtocolComparisonSchema = z.object({
  feed_id: z.string(),
  asset_pair: z.string(), // e.g., "STOXX50/EUR"
  
  pyth_price: z.number().positive().optional(),
  pyth_confidence: z.number().min(0).max(1).optional(),
  
  switchboard_price: z.number().positive().optional(),
  switchboard_confidence: z.number().min(0).max(1).optional(),
  
  orca_price: z.number().positive().optional(),
  orca_liquidity: z.bigint().optional(),
  
  coingecko_price: z.number().positive().optional(),
  
  // Analysis
  consensus_price: z.number().positive(),
  max_deviation_pct: z.number(),
  agreement_level: z.enum(['excellent', 'good', 'fair', 'poor', 'disagreement']),
  
  last_updated: z.date(),
});

export type CrossProtocolComparison = z.infer<typeof CrossProtocolComparisonSchema>;

// ============ Outage Prediction ============

export const OutagePredictionSchema = z.object({
  prediction_id: z.string(),
  feed_id: z.string(),
  
  // Prediction
  predicted_outage_probability: z.number().min(0).max(1),
  predicted_outage_window_start: z.date(),
  predicted_outage_window_end: z.date(),
  
  // Supporting data
  recent_incidents: z.number(),
  uptime_trend: z.enum(['stable', 'declining', 'improving']),
  validator_churn: z.number(), // Percent validators leaving
  
  confidence_in_prediction: z.number().min(0).max(1),
  estimated_recovery_time_minutes: z.number().optional(),
  
  created_at: z.date(),
});

export type OutagePrediction = z.infer<typeof OutagePredictionSchema>;

// ============ Alert ============

export const AlertSchema = z.object({
  alert_id: z.string(),
  feed_id: z.string(),
  alert_type: z.enum([
    'manipulation_detected',
    'price_anomaly',
    'validator_issue',
    'outage_predicted',
    'confidence_drop',
    'cross_protocol_disagreement',
  ]),
  severity: z.enum(['info', 'warning', 'alert', 'critical']),
  message: z.string(),
  
  // User actions
  acknowledged: z.boolean(),
  acknowledged_by: z.string().optional(),
  acknowledged_at: z.date().optional(),
  
  created_at: z.date(),
  resolved_at: z.date().optional(),
});

export type Alert = z.infer<typeof AlertSchema>;

// ============ Audit Trail ============

export const AuditEntrySchema = z.object({
  audit_id: z.string(),
  event_type: z.string(),
  feed_id: z.string().optional(),
  
  // What changed
  before: z.record(z.any()).optional(),
  after: z.record(z.any()).optional(),
  
  // Who/what triggered it
  triggered_by: z.enum(['system', 'user', 'api', 'webhook']),
  user_id: z.string().optional(),
  
  timestamp: z.date(),
  
  // For debugging
  metadata: z.record(z.any()).optional(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// ============ Percolator Integration ============

export const PercolatorSpecValidationSchema = z.object({
  validation_id: z.string(),
  feed_id: z.string(),
  price: z.number().positive(),
  
  // Spec checks
  satisfies_bounds: z.boolean(),
  satisfies_continuity: z.boolean(),
  satisfies_staleness: z.boolean(),
  
  // Overall
  spec_compliant: z.boolean(),
  spec_violations: z.array(z.string()),
  
  validated_at: z.date(),
});

export type PercolatorSpecValidation = z.infer<typeof PercolatorSpecValidationSchema>;

// ============ Research Data Export ============

export const ResearchDataSchema = z.object({
  export_id: z.string(),
  query: z.object({
    feed_ids: z.array(z.string()),
    start_date: z.date(),
    end_date: z.date(),
    granularity: z.enum(['1m', '5m', '1h', '1d']),
  }),
  
  record_count: z.number(),
  file_path: z.string(), // S3 URL or local path
  
  created_at: z.date(),
  expires_at: z.date(),
});

export type ResearchData = z.infer<typeof ResearchDataSchema>;
