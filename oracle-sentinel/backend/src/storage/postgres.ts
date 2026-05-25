// PostgreSQL Persistent Storage Layer
import { Pool } from 'pg';
import {
  ConfidenceScore,
  Alert,
  AuditEntry,
  PercolatorSpecValidation,
} from '../types';

export class PostgresStorage {
  private pool: Pool;

  constructor(connectionString: string, poolSize: number = 10) {
    this.pool = new Pool({
      connectionString,
      max: poolSize,
    });
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS confidence_scores (
          id SERIAL PRIMARY KEY,
          feed_id VARCHAR(255) NOT NULL,
          feed_name VARCHAR(255) NOT NULL,
          overall_confidence FLOAT NOT NULL,
          pyth_confidence FLOAT,
          switchboard_confidence FLOAT,
          dex_consistency FLOAT,
          cross_protocol_agreement FLOAT,
          reasoning TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          alert_id VARCHAR(255) UNIQUE NOT NULL,
          feed_id VARCHAR(255) NOT NULL,
          alert_type VARCHAR(100) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          message TEXT NOT NULL,
          acknowledged BOOLEAN DEFAULT FALSE,
          acknowledged_by VARCHAR(255),
          acknowledged_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          audit_id VARCHAR(255) UNIQUE NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          feed_id VARCHAR(255),
          before_state JSONB,
          after_state JSONB,
          triggered_by VARCHAR(50),
          user_id VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS percolator_validations (
          id SERIAL PRIMARY KEY,
          validation_id VARCHAR(255) UNIQUE NOT NULL,
          feed_id VARCHAR(255) NOT NULL,
          price FLOAT NOT NULL,
          satisfies_bounds BOOLEAN,
          satisfies_continuity BOOLEAN,
          satisfies_staleness BOOLEAN,
          spec_compliant BOOLEAN,
          violations TEXT[],
          validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS validator_health (
          id SERIAL PRIMARY KEY,
          validator_id VARCHAR(255) NOT NULL,
          validator_name VARCHAR(255),
          oracle_source VARCHAR(50),
          uptime_pct FLOAT,
          price_accuracy FLOAT,
          update_frequency FLOAT,
          last_update TIMESTAMP,
          is_active BOOLEAN,
          is_blacklisted BOOLEAN,
          last_alert TIMESTAMP,
          feeds_supported TEXT[],
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cross_protocol_prices (
          id SERIAL PRIMARY KEY,
          feed_id VARCHAR(255) NOT NULL,
          asset_pair VARCHAR(100),
          pyth_price FLOAT,
          switchboard_price FLOAT,
          orca_price FLOAT,
          coingecko_price FLOAT,
          consensus_price FLOAT,
          max_deviation_pct FLOAT,
          agreement_level VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Indices for performance
        CREATE INDEX IF NOT EXISTS idx_confidence_feed ON confidence_scores(feed_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_feed ON alerts(feed_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_feed ON audit_log(feed_id);
        CREATE INDEX IF NOT EXISTS idx_validator_oracle ON validator_health(oracle_source);
      `);

      console.log('Database schema initialized successfully');
    } finally {
      client.release();
    }
  }

  /**
   * Store confidence score
   */
  async storeConfidenceScore(score: ConfidenceScore): Promise<void> {
    const query = `
      INSERT INTO confidence_scores (
        feed_id, feed_name, overall_confidence,
        pyth_confidence, switchboard_confidence,
        dex_consistency, cross_protocol_agreement,
        reasoning
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const feedName = (score as any).feed_name || score.feed_id;
    const pythConf = (score as any).pyth_confidence ?? score.components.source_agreement;
    const sbConf = (score as any).switchboard_confidence ?? score.components.spec_compliance;
    const dexConsistency = (score as any).dex_consistency ?? score.components.data_freshness;
    const crossProtocol = (score as any).cross_protocol_agreement ?? score.components.validator_health;
    const reasoning = (score as any).reasoning || [];

    await this.pool.query(query, [
      score.feed_id,
      feedName,
      score.overall_confidence,
      pythConf,
      sbConf,
      dexConsistency,
      crossProtocol,
      reasoning,
    ]);
  }

  /**
   * Get latest confidence score for feed
   */
  async getLatestConfidenceScore(feedId: string): Promise<ConfidenceScore | null> {
    const query = `
      SELECT * FROM confidence_scores
      WHERE feed_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [feedId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      feed_id: row.feed_id,
      feed_name: row.feed_name,
      overall_confidence: row.overall_confidence,
      pyth_confidence: row.pyth_confidence,
      switchboard_confidence: row.switchboard_confidence,
      dex_consistency: row.dex_consistency,
      cross_protocol_agreement: row.cross_protocol_agreement,
      reasoning: row.reasoning,
      alerts: [],
      last_updated: row.last_updated,
      previous_confidence: undefined,
    } as any;
  }

  /**
   * Store alert
   */
  async storeAlert(alert: Alert): Promise<void> {
    const query = `
      INSERT INTO alerts (
        alert_id, feed_id, alert_type, severity, message
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (alert_id) DO NOTHING
    `;

    await this.pool.query(query, [
      alert.alert_id,
      alert.feed_id,
      alert.alert_type,
      alert.severity,
      alert.message,
    ]);
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const query = `
      UPDATE alerts
      SET acknowledged = TRUE, acknowledged_by = $2, acknowledged_at = CURRENT_TIMESTAMP
      WHERE alert_id = $1
    `;

    await this.pool.query(query, [alertId, userId]);
  }

  /**
   * Get recent unacknowledged alerts
   */
  async getUnacknowledgedAlerts(hoursBack: number = 24): Promise<Alert[]> {
    const query = `
      SELECT * FROM alerts
      WHERE acknowledged = FALSE
      AND created_at > NOW() - INTERVAL '${hoursBack} hours'
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const result = await this.pool.query(query);

    return result.rows.map((row) => ({
      alert_id: row.alert_id,
      feed_id: row.feed_id,
      alert_type: row.alert_type,
      severity: row.severity,
      message: row.message,
      acknowledged: row.acknowledged,
      acknowledged_by: row.acknowledged_by,
      acknowledged_at: row.acknowledged_at,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    }));
  }

  /**
   * Log audit entry
   */
  async logAuditEntry(entry: AuditEntry): Promise<void> {
    const query = `
      INSERT INTO audit_log (
        audit_id, event_type, feed_id, before_state, after_state,
        triggered_by, user_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      entry.audit_id,
      entry.event_type,
      entry.feed_id,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      entry.triggered_by,
      entry.user_id,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]);
  }

  /**
   * Store Percolator spec validation
   */
  async storeSpecValidation(validation: PercolatorSpecValidation): Promise<void> {
    const query = `
      INSERT INTO percolator_validations (
        validation_id, feed_id, price,
        satisfies_bounds, satisfies_continuity, satisfies_staleness,
        spec_compliant, violations
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      validation.validation_id,
      validation.feed_id,
      validation.price,
      validation.satisfies_bounds,
      validation.satisfies_continuity,
      validation.satisfies_staleness,
      validation.spec_compliant,
      validation.spec_violations,
    ]);
  }

  /**
   * Update validator health
   */
  async updateValidatorHealth(validatorId: string, data: any): Promise<void> {
    const query = `
      INSERT INTO validator_health (
        validator_id, validator_name, oracle_source,
        uptime_pct, price_accuracy, update_frequency,
        is_active, is_blacklisted, feeds_supported
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (validator_id) DO UPDATE SET
        uptime_pct = EXCLUDED.uptime_pct,
        price_accuracy = EXCLUDED.price_accuracy,
        update_frequency = EXCLUDED.update_frequency,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.pool.query(query, [
      validatorId,
      data.validator_name,
      data.oracle_source,
      data.uptime_pct,
      data.price_accuracy,
      data.update_frequency,
      data.is_active,
      data.is_blacklisted,
      data.feeds_supported,
    ]);
  }

  /**
   * Get validator health for oracle
   */
  async getValidatorHealth(oracleSource: string): Promise<any[]> {
    const query = `
      SELECT * FROM validator_health
      WHERE oracle_source = $1
      ORDER BY uptime_pct DESC
    `;

    const result = await this.pool.query(query, [oracleSource]);
    return result.rows;
  }

  /**
   * Store cross-protocol comparison
   */
  async storeCrossProtocolComparison(comparison: any): Promise<void> {
    const query = `
      INSERT INTO cross_protocol_prices (
        feed_id, asset_pair, pyth_price, switchboard_price,
        orca_price, coingecko_price, consensus_price,
        max_deviation_pct, agreement_level
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.pool.query(query, [
      comparison.feed_id,
      comparison.asset_pair,
      comparison.pyth_price,
      comparison.switchboard_price,
      comparison.orca_price,
      comparison.coingecko_price,
      comparison.consensus_price,
      comparison.max_deviation_pct,
      comparison.agreement_level,
    ]);
  }

  /**
   * Get price history for research
   */
  async getPriceHistory(feedId: string, hoursBack: number = 24): Promise<any[]> {
    const query = `
      SELECT * FROM cross_protocol_prices
      WHERE feed_id = $1
      AND created_at > NOW() - INTERVAL '${hoursBack} hours'
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [feedId]);
    return result.rows;
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Factory function
export async function createPostgresStorage(connectionString: string): Promise<PostgresStorage> {
  const storage = new PostgresStorage(connectionString);
  await storage.initialize();
  return storage;
}
