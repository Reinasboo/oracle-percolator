// InfluxDB Time-Series Storage Layer
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { OraclePrice, Anomaly, Alert, ConfidenceScore } from '../types';

export class InfluxdbStorage {
  private influxDB: InfluxDB;
  private writeApi: any;
  private queryApi: any;

  constructor(
    private url: string,
    private token: string,
    private org: string,
    private bucket: string,
  ) {
    this.influxDB = new InfluxDB({ url, token });
    this.writeApi = this.influxDB.getWriteApi(org, bucket, 'ns');
    this.queryApi = this.influxDB.getQueryApi(org);
  }

  /**
   * Store oracle price
   */
  async storePrice(price: OraclePrice): Promise<void> {
    const point = new Point('oracle_price')
      .tag('feed_id', price.feed_id)
      .tag('feed_name', price.feed_name)
      .tag('source', price.source)
      .floatField('price', price.price)
      .intField('price_e6', Number(price.price_e6))
      .floatField('confidence', price.confidence)
      .intField('is_stale', price.is_stale ? 1 : 0)
      .intField('max_age_seconds', Math.floor(price.max_age_seconds || 0))
      .timestamp(price.timestamp);

    this.writeApi.writePoint(point);
    await this.writeApi.flush();
  }

  /**
   * Store multiple prices
   */
  async storePrices(prices: OraclePrice[]): Promise<void> {
    for (const price of prices) {
      const point = new Point('oracle_price')
        .tag('feed_id', price.feed_id)
        .tag('feed_name', price.feed_name)
        .tag('source', price.source)
        .floatField('price', price.price)
        .intField('price_e6', Number(price.price_e6))
        .floatField('confidence', price.confidence)
        .intField('is_stale', price.is_stale ? 1 : 0)
        .intField('max_age_seconds', Math.floor(price.max_age_seconds || 0))
        .timestamp(price.timestamp);

      this.writeApi.writePoint(point);
    }

    await this.writeApi.flush();
  }

  /**
   * Store anomaly detection result
   */
  async storeAnomaly(anomaly: Anomaly): Promise<void> {
    const point = new Point('anomaly_detected')
      .tag('anomaly_id', anomaly.anomaly_id)
      .tag('feed_id', anomaly.feed_id)
      .tag('feed_name', anomaly.feed_name)
      .tag('method', anomaly.method)
      .tag('severity', anomaly.severity)
      .tag('is_manipulation', anomaly.is_manipulation ? 'true' : 'false')
      .floatField('expected_price', anomaly.expected_price)
      .floatField('actual_price', anomaly.actual_price)
      .floatField('deviation_pct', anomaly.deviation_pct)
      .floatField('deviation_sigma', anomaly.deviation_sigma)
      .timestamp(anomaly.detected_at);

    this.writeApi.writePoint(point);
    await this.writeApi.flush();
  }

  /**
   * Store confidence score
   */
  async storeConfidenceScore(score: ConfidenceScore): Promise<void> {
    const feedName = (score as any).feed_name || score.feed_id;
    const pythConf = (score as any).pyth_confidence ?? score.components.source_agreement;
    const sbConf = (score as any).switchboard_confidence ?? score.components.spec_compliance;
    const dexConsistency = (score as any).dex_consistency ?? score.components.data_freshness;
    const crossProtocol = (score as any).cross_protocol_agreement ?? score.components.validator_health;
    const numAlerts = (score as any).alerts ? (score as any).alerts.length : 0;
    const lastUpdated = (score as any).last_updated || score.created_at;

    const point = new Point('confidence_score')
      .tag('feed_id', score.feed_id)
      .tag('feed_name', feedName)
      .floatField('overall_confidence', score.overall_confidence)
      .floatField('pyth_confidence', pythConf)
      .floatField('switchboard_confidence', sbConf)
      .floatField('dex_consistency', dexConsistency)
      .floatField('cross_protocol_agreement', crossProtocol)
      .intField('num_alerts', numAlerts)
      .timestamp(lastUpdated);

    this.writeApi.writePoint(point);
    await this.writeApi.flush();
  }

  /**
   * Query price history for a feed
   */
  async queryPriceHistory(
    feedId: string,
    timeRangeMinutes: number = 60
  ): Promise<Array<{ timestamp: Date; price: number; confidence: number }>> {
    const fluxQuery = `
      from(bucket: "${this.bucket}")
        |> range(start: -${timeRangeMinutes}m)
        |> filter(fn: (r) => r._measurement == "oracle_price")
        |> filter(fn: (r) => r.feed_id == "${feedId}")
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
    `;

    const result: Array<{ timestamp: Date; price: number; confidence: number }> = [];

    await new Promise((resolve, reject) => {
      this.queryApi.queryRows(fluxQuery, {
        next(row: any, tableMeta: any) {
          const obj = tableMeta.toObject(row);
          result.push({
            timestamp: new Date(obj._time),
            price: obj.price || 0,
            confidence: obj.confidence || 0,
          });
        },
        error(error: any) {
          reject(error);
        },
        complete() {
          resolve(null);
        },
      });
    });

    return result;
  }

  /**
   * Query anomalies in time range
   */
  async queryAnomalies(timeRangeHours: number = 24): Promise<Anomaly[]> {
    const fluxQuery = `
      from(bucket: "${this.bucket}")
        |> range(start: -${timeRangeHours}h)
        |> filter(fn: (r) => r._measurement == "anomaly_detected")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 100)
    `;

    const anomalies: Anomaly[] = [];

    await new Promise((resolve, reject) => {
      this.queryApi.queryRows(fluxQuery, {
        next(row: any, tableMeta: any) {
          const obj = tableMeta.toObject(row);
          anomalies.push({
            anomaly_id: obj.anomaly_id,
            feed_id: obj.feed_id,
            feed_name: obj.feed_name,
            method: obj.method,
            expected_price: obj.expected_price,
            actual_price: obj.actual_price,
            deviation_pct: obj.deviation_pct,
            deviation_sigma: obj.deviation_sigma,
            severity: obj.severity,
            is_manipulation: obj.is_manipulation === 'true',
            detected_at: new Date(obj._time),
            resolved_at: undefined,
            likely_cause: 'Unknown',
            recommendation: 'Monitor',
          });
        },
        error(error: any) {
          reject(error);
        },
        complete() {
          resolve(null);
        },
      });
    });

    return anomalies;
  }

  /**
   * Get latest confidence scores for all feeds
   */
  async queryLatestConfidenceScores(): Promise<ConfidenceScore[]> {
    const fluxQuery = `
      from(bucket: "${this.bucket}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "confidence_score")
        |> sort(columns: ["_time"], desc: true)
        |> group(columns: ["feed_id"])
        |> first()
    `;

    const scores: ConfidenceScore[] = [];

    await new Promise((resolve, reject) => {
      this.queryApi.queryRows(fluxQuery, {
        next(row: any, tableMeta: any) {
          const obj = tableMeta.toObject(row);
          scores.push({
            confidence_id: obj.confidence_id || `${obj.feed_id}-${obj._time}`,
            feed_id: obj.feed_id,
            feed_name: obj.feed_name,
            overall_confidence: obj.overall_confidence,
            components: {
              source_agreement: obj.pyth_confidence ?? obj.source_agreement ?? 0,
              spec_compliance: obj.switchboard_confidence ?? obj.spec_compliance ?? 0,
              manipulation_safety: obj.manipulation_safety ?? 0,
              outage_resilience: obj.outage_resilience ?? 0,
              data_freshness: obj.dex_consistency ?? obj.data_freshness ?? 0,
              validator_health: obj.cross_protocol_agreement ?? obj.validator_health ?? 0,
            },
            weighted_price: obj.weighted_price,
            confidence_interpretation: obj.confidence_interpretation || '',
            recommendation: obj.recommendation || '',
            reasoning: ['See PostgreSQL for details'],
            source_prices: {
              pyth: obj.pyth_price,
              switchboard: obj.switchboard_price,
              dex: obj.orca_price || obj.dex_price,
              coingecko: obj.coingecko_price,
            },
            created_at: new Date(obj._time),
            pyth_confidence: obj.pyth_confidence,
            switchboard_confidence: obj.switchboard_confidence,
            dex_consistency: obj.dex_consistency,
            cross_protocol_agreement: obj.cross_protocol_agreement,
            alerts: [],
            last_updated: new Date(obj._time),
            previous_confidence: undefined,
          });
        },
        error(error: any) {
          reject(error);
        },
        complete() {
          resolve(null);
        },
      });
    });

    return scores;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.writeApi.close();
  }
}

// Factory function
export async function createInfluxdbStorage(
  url: string,
  token: string,
  org: string,
  bucket: string
): Promise<InfluxdbStorage> {
  return new InfluxdbStorage(url, token, org, bucket);
}
