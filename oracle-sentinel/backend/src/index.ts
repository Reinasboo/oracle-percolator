// Main Oracle Sentinel Server
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createPythAggregator } from './aggregators/pyth';
import { createSwitchboardAggregator } from './aggregators/switchboard';
import { createDexAggregator } from './aggregators/dex';
import { createCoinGeckoAggregator } from './aggregators/coingecko';
import { createInfluxdbStorage } from './storage/influxdb';
import { createPostgresStorage } from './storage/postgres';
import AnomalyDetector from './detection/anomaly';
import FormalVerifier from './detection/formal-verify';
import ManipulationDetector from './detection/manipulation';
import OutagePredictor from './detection/outage';
import ConfidenceScorer, { createConfidenceScore } from './scoring/confidence';
import ValidatorHealthTracker, { createValidatorHealthRecord } from './scoring/validator-health';
import CrossProtocolAnalyzer, { createCrossProtocolComparison, ProtocolPriceSnapshot } from './scoring/cross-protocol';
import { WebhookManager } from './webhooks/webhook-manager';
import { createGlobalRateLimiter, createPerUserRateLimiter, createWebhookRateLimiter } from './middleware/rate-limit';
import { createJWTMiddleware, createAPIKeyAuth } from './middleware/auth';
// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';

interface OracleState {
  latestPrices: Map<string, any>;
  lastAnomalies: Map<string, any>;
  confidenceScores: Map<string, number>;
  // Phase 2: Detection histories
  priceHistory: Map<string, Array<{ timestamp: Date; price: number }>>;
  manipulationHistory: Map<string, any[]>;
  outagePredictions: Map<string, any>;
  specValidations: Map<string, any>;
  // Phase 3: Confidence scoring
  confidenceDetails: Map<string, any>;
  validatorMetrics: Map<string, any>;
  crossProtocolSnapshots: Map<string, ProtocolPriceSnapshot>;
}

class OracleSentinel {
  private app = express();
  private httpServer = createServer(this.app);
  private io = new SocketIOServer(this.httpServer);
  private state: OracleState = {
    latestPrices: new Map(),
    lastAnomalies: new Map(),
    confidenceScores: new Map(),
    priceHistory: new Map(),
    manipulationHistory: new Map(),
    outagePredictions: new Map(),
    specValidations: new Map(),
    confidenceDetails: new Map(),
    validatorMetrics: new Map(),
    crossProtocolSnapshots: new Map(),
  };

  // Aggregators
  private pythAgg: any;
  private switchboardAgg: any;
  private dexAgg: any;
  private coingeckoAgg: any;

  // Storage
  private influxdb: any;
  private postgres: any;

  // Phase 4: Webhooks & Auth
  private webhookManager: WebhookManager | null = null;
  private jwtAuth: any;
  private apiKeyAuth: any;
  private globalRateLimiter: any;
  private perUserRateLimiter: any;
  private webhookRateLimiter: any;

  constructor() {
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static('public'));

    // Phase 4: Rate limiting (global)
    if (this.globalRateLimiter) {
      this.app.use('/api/', this.globalRateLimiter.middleware());
    }

    // Phase 4: Optional JWT auth (for protected endpoints)
    if (this.jwtAuth) {
      // Auth endpoints (public)
      this.app.post('/auth/login', (req, res) => {
        // Mock login - in production, verify credentials from database
        const { email } = req.body;
        if (!email) {
          return res.status(400).json({ error: 'Email required' });
        }

        const { accessToken, refreshToken } = this.jwtAuth.generateTokenPair(
          uuidv4(),
          email,
          ['read:webhooks', 'write:webhooks']
        );

        res.json({ accessToken, refreshToken });
      });

      // Refresh token endpoint
      this.app.post('/auth/refresh', this.jwtAuth.refreshTokenMiddleware());
    }
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date(),
        feeds_active: this.state.latestPrices.size,
      });
    });

    // Get latest prices for all feeds
    this.app.get('/api/prices', (req, res) => {
      const prices = Array.from(this.state.latestPrices.values());
      res.json(prices);
    });

    // Get specific feed price
    this.app.get('/api/prices/:feedId', (req, res) => {
      const price = this.state.latestPrices.get(req.params.feedId);
      if (price) {
        res.json(price);
      } else {
        res.status(404).json({ error: 'Feed not found' });
      }
    });

    // Get confidence scores
    this.app.get('/api/confidence', (req, res) => {
      const scores = Array.from(this.state.confidenceScores.entries()).map(
        ([feedId, score]) => ({
          feed_id: feedId,
          confidence: score,
        })
      );
      res.json(scores);
    });

    // Get anomalies
    this.app.get('/api/anomalies', async (req, res) => {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      try {
        const anomalies = await this.influxdb.queryAnomalies(hoursBack);
        res.json(anomalies);
      } catch (error) {
        res.status(500).json({ error: error });
      }
    });

    // Acknowledge alert
    this.app.post('/api/alerts/:alertId/acknowledge', async (req, res) => {
      const { userId } = req.body;
      try {
        await this.postgres.acknowledgeAlert(req.params.alertId, userId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error });
      }
    });

    // Price history
    this.app.get('/api/history/:feedId', async (req, res) => {
      const { timeRange = '60' } = req.query;
      try {
        const history = await this.influxdb.queryPriceHistory(
          req.params.feedId,
          parseInt(timeRange as string)
        );
        res.json(history);
      } catch (error) {
        res.status(500).json({ error: error });
      }
    });

    // Composite price (for STOXX50/SOL)
    this.app.get('/api/composite/stoxx50-sol', async (req, res) => {
      try {
        const composite = await this.pythAgg.fetchCompositePrice();
        if (composite) {
          res.json({
            composite_price: composite.composite_price,
            components: composite.component_prices,
            confidence: composite.confidence,
          });
        } else {
          res.status(500).json({ error: 'Failed to fetch composite price' });
        }
      } catch (error) {
        res.status(500).json({ error: error });
      }
    });

    // Phase 2 endpoints: Formal Verification
    this.app.get('/api/verification/:feedId', async (req, res) => {
      const validation = this.state.specValidations.get(req.params.feedId);
      if (validation) {
        res.json(validation);
      } else {
        res.status(404).json({ error: 'No spec validation data' });
      }
    });

    // Phase 2 endpoints: Manipulation Detection
    this.app.get('/api/manipulation/:feedId', async (req, res) => {
      const manipulations = this.state.manipulationHistory.get(req.params.feedId) || [];
      res.json({
        feed_id: req.params.feedId,
        detected_manipulations: manipulations,
        last_updated: new Date(),
      });
    });

    // Phase 2 endpoints: Outage Prediction
    this.app.get('/api/outage-prediction/:feedId', async (req, res) => {
      const prediction = this.state.outagePredictions.get(req.params.feedId);
      if (prediction) {
        res.json(prediction);
      } else {
        res.status(404).json({ error: 'No outage prediction data' });
      }
    });

    // Phase 2 endpoints: All predictions summary
    this.app.get('/api/predictions-summary', (req, res) => {
      const summary = {
        predictions: Array.from(this.state.outagePredictions.values()),
        manipulations: Array.from(this.state.manipulationHistory.entries()).map(
          ([feedId, manipulations]) => ({
            feed_id: feedId,
            count: manipulations.length,
            recent: manipulations.slice(-5),
          })
        ),
        spec_validations: Array.from(this.state.specValidations.values()),
      };
      res.json(summary);
    });

    // Phase 3 endpoints: Confidence Scores (detailed)
    this.app.get('/api/confidence-detailed/:feedId', (req, res) => {
      const confidenceDetail = this.state.confidenceDetails.get(req.params.feedId);
      if (confidenceDetail) {
        res.json(confidenceDetail);
      } else {
        res.status(404).json({ error: 'No confidence data' });
      }
    });

    // Phase 3 endpoints: Validator Health
    this.app.get('/api/validator-health', (req, res) => {
      const metrics = Array.from(this.state.validatorMetrics.values());
      res.json({
        validators: metrics,
        healthy_count: metrics.filter((m) => m.status === 'healthy').length,
        degraded_count: metrics.filter((m) => m.status === 'degraded').length,
        critical_count: metrics.filter((m) => m.status === 'critical').length,
        blacklisted_count: metrics.filter((m) => m.status === 'blacklisted').length,
      });
    });

    // Phase 3 endpoints: Cross-Protocol Comparison
    this.app.get('/api/cross-protocol/:feedId', (req, res) => {
      const snapshot = this.state.crossProtocolSnapshots.get(req.params.feedId);
      if (snapshot) {
        const comparison = createCrossProtocolComparison(req.params.feedId, snapshot);
        res.json(comparison);
      } else {
        res.status(404).json({ error: 'No cross-protocol data' });
      }
    });

    // Phase 3 endpoints: Complete Oracle Report
    this.app.get('/api/oracle-report/:feedId', (req, res) => {
      const feedId = req.params.feedId;
      const confidence = this.state.confidenceDetails.get(feedId);
      const cross = this.state.crossProtocolSnapshots.get(feedId);
      const validators = Array.from(this.state.validatorMetrics.values());

      if (!confidence) {
        return res.status(404).json({ error: 'No data for this feed' });
      }

      const report = {
        feed_id: feedId,
        confidence_score: confidence.overall_confidence,
        confidence_interpretation: confidence.confidence_interpretation,
        recommendation: confidence.recommendation,
        components: confidence.components,
        reasoning: confidence.reasoning,
        source_prices: confidence.source_prices,
        weighted_price: confidence.weighted_price,
        cross_protocol: cross ? {
          consensus_price: CrossProtocolAnalyzer.calculateConsensusPrice(cross),
          consistency_score: CrossProtocolAnalyzer.analyzeConsistency(cross).consistency_score,
          protocols_in_agreement: CrossProtocolAnalyzer.detectOutliers(cross).trustworthy_protocols,
          protocols_offline: CrossProtocolAnalyzer.detectOutliers(cross).trustworthy_protocols,
        } : null,
        validator_health_summary: {
          total_validators: validators.length,
          healthy: validators.filter((v) => v.status === 'healthy').length,
          degraded: validators.filter((v) => v.status === 'degraded').length,
          critical: validators.filter((v) => v.status === 'critical').length,
        },
        generated_at: new Date(),
      };

      res.json(report);
    });

    // Phase 4 endpoints: Webhook Management
    // Create webhook - requires JWT auth
    this.app.post('/api/webhooks', async (req, res) => {
      // Verify JWT token
      const token = req.headers.authorization?.split(' ')[1];
      if (!token || !this.jwtAuth?.verifyAccessToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { webhook_url, events, filters, destination, name } = req.body;

      if (!webhook_url || !events || !destination) {
        return res.status(400).json({ error: 'Missing required fields: webhook_url, events, destination' });
      }

      try {
        const webhookId = await this.webhookManager?.createWebhook({
          webhook_url,
          events: Array.isArray(events) ? events : [events],
          filters: filters || {},
          destination: destination as 'discord' | 'telegram' | 'slack' | 'http',
          name: name || `Webhook ${new Date().toISOString()}`,
          user_id: token || 'anonymous',
          rate_limit: {
            max_per_minute: parseInt(req.body.rate_limit_per_minute || '60'),
            max_per_hour: 1000,
          },
          retry_policy: {
            max_retries: parseInt(req.body.max_retries || '3'),
            backoff_ms: 1000,
            backoff_multiplier: 2,
          },
        });

        res.status(201).json({ webhookId, message: 'Webhook created' });
      } catch (error) {
        res.status(500).json({ error });
      }
    });

    // Get user webhooks - requires JWT auth
    this.app.get('/api/webhooks', async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token || !this.jwtAuth?.verifyAccessToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const userId = token || 'anonymous';
        const webhooks = await this.webhookManager?.getUserWebhooks(userId);
        res.json(webhooks || []);
      } catch (error) {
        res.status(500).json({ error });
      }
    });

    // Delete webhook - requires JWT auth
    this.app.delete('/api/webhooks/:webhookId', async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token || !this.jwtAuth?.verifyAccessToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        await this.webhookManager?.deleteWebhook(req.params.webhookId);
        res.json({ success: true, message: 'Webhook deleted' });
      } catch (error) {
        res.status(500).json({ error });
      }
    });

    // Get webhook delivery history - requires JWT auth
    this.app.get('/api/webhooks/:webhookId/history', async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token || !this.jwtAuth?.verifyAccessToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const history = await this.webhookManager?.getDeliveryHistory(req.params.webhookId, limit);
        res.json(history || []);
      } catch (error) {
        res.status(500).json({ error });
      }
    });

    // Get webhook statistics - requires JWT auth
    this.app.get('/api/webhooks/:webhookId/stats', async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token || !this.jwtAuth?.verifyAccessToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const webhook = await this.webhookManager?.getWebhook(req.params.webhookId);

        if (!webhook) {
          return res.status(404).json({ error: 'Webhook not found' });
        }

        const history = await this.webhookManager?.getDeliveryHistory(req.params.webhookId, 1000);
        const stats = {
          webhook_id: req.params.webhookId,
          total_deliveries: history?.length || 0,
          successful: history?.filter((h: any) => h.status === 'delivered').length || 0,
          failed: history?.filter((h: any) => h.status === 'failed').length || 0,
          pending: history?.filter((h: any) => h.status === 'pending').length || 0,
          success_rate: history && history.length > 0
            ? ((history.filter((h: any) => h.status === 'delivered').length / history.length) * 100).toFixed(2) + '%'
            : 'N/A',
          last_delivery: history && history.length > 0 ? history[0].delivered_at : null,
          events_subscribed: webhook.events,
        };
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error });
      }
    });

    // Test webhook endpoint (manual trigger)
    this.app.post('/api/webhooks/:webhookId/test', async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token || !this.jwtAuth?.verifyAccessToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const webhook = await this.webhookManager?.getWebhook(req.params.webhookId);

        if (!webhook) {
          return res.status(404).json({ error: 'Webhook not found' });
        }

        // Create a test event
        const testEvent = {
          type: 'test',
          timestamp: new Date(),
          data: {
            message: 'This is a test webhook delivery',
            webhook_id: req.params.webhookId,
          },
        };

        // Dispatch to the webhook
        await this.webhookManager?.dispatchEvent('test', testEvent.data);

        res.json({ success: true, message: 'Test event sent to webhook' });
      } catch (error) {
        res.status(500).json({ error: error });
      }
    });
  }

  private setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Send initial state
      socket.emit('initial_state', {
        prices: Array.from(this.state.latestPrices.values()),
        anomalies: Array.from(this.state.lastAnomalies.values()),
        confidence: Array.from(this.state.confidenceScores.entries()).map(
          ([feedId, score]) => ({ feedId, score })
        ),
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  async initialize() {
    console.log('🚀 Oracle Sentinel initializing...');

    // Initialize aggregators
    console.log('Initializing aggregators...');
    this.pythAgg = await createPythAggregator(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      process.env.PYTH_MAINNET_ID || 'RecQLvsGZqM1jEC1rfi7B8r9QFjG3asxQM2Tz7PgVCZ'
    );

    this.switchboardAgg = await createSwitchboardAggregator(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      process.env.SWITCHBOARD_MAINNET_ID || 'SW1TCH7qEPTiB9aXDg7Rj3p5VfRSK1xKaJqmKQQLPAQ'
    );

    this.dexAgg = await createDexAggregator(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    );

    this.coingeckoAgg = await createCoinGeckoAggregator(
      process.env.COINGECKO_API_KEY
    );

    // Initialize storage
    console.log('Initializing storage...');
    this.influxdb = await createInfluxdbStorage(
      process.env.INFLUXDB_URL || 'http://localhost:8086',
      process.env.INFLUXDB_TOKEN || 'your-token',
      process.env.INFLUXDB_ORG || 'oracle-sentinel',
      process.env.INFLUXDB_BUCKET || 'prices'
    );

    this.postgres = await createPostgresStorage(
      process.env.DATABASE_URL || 'postgresql://oracle:sentinel@localhost:5432/oracle_sentinel'
    );

    // Phase 4: Initialize webhooks, rate limiters, and auth
    console.log('Initializing Phase 4 components...');
    try {
      // Initialize webhook manager
      this.webhookManager = new WebhookManager(this.postgres.pool);

      // Webhook manager initializes in constructor

      // Initialize rate limiters
      this.globalRateLimiter = createGlobalRateLimiter();
      this.perUserRateLimiter = createPerUserRateLimiter();
      this.webhookRateLimiter = createWebhookRateLimiter();

      // Set database for rate limiter persistence (optional)
      if (this.globalRateLimiter.setDatabase) {
        this.globalRateLimiter.setDatabase(this.postgres.pool);
      }

      // Initialize JWT auth middleware
      this.jwtAuth = createJWTMiddleware();

      // Initialize API key auth
      this.apiKeyAuth = createAPIKeyAuth();

      console.log('✅ Phase 4 initialization complete');
    } catch (err) {
      console.error('⚠️  Phase 4 initialization warning:', err);
      // Continue without webhooks if initialization fails
    }

    console.log('✅ Initialization complete');
  }

  async startDataCollection() {
    console.log('📊 Starting data collection loops...');

    // Fetch prices every 5 seconds
    const collectInterval = setInterval(async () => {
      try {
        // Fetch from all sources
        const [pythPrices, switchboardPrices, dexPrices, coingeckoPrices] =
          await Promise.all([
            this.pythAgg.fetchAllPrices().catch(() => []),
            this.switchboardAgg.fetchAllPrices().catch(() => []),
            this.dexAgg.fetchAllPrices().catch(() => []),
            this.coingeckoAgg.fetchAllPrices().catch(() => []),
          ]);

        // Combine and store
        const allPrices = [
          ...pythPrices,
          ...switchboardPrices,
          ...dexPrices,
          ...coingeckoPrices,
        ];

        for (const price of allPrices) {
          // Store in InfluxDB
          await this.influxdb.storePrice(price);

          // Update local state
          this.state.latestPrices.set(price.feed_id, price);

          // Update price history (Phase 2)
          const history = this.state.priceHistory.get(price.feed_id) || [];
          history.push({
            timestamp: price.timestamp,
            price: price.price,
          });
          // Keep last 1000 data points
          if (history.length > 1000) {
            history.shift();
          }
          this.state.priceHistory.set(price.feed_id, history);

          // Calculate confidence score
          const confidence = this.calculateConfidenceScore(price.feed_id);
          this.state.confidenceScores.set(price.feed_id, confidence);

          // Phase 1: Check for anomalies
          const anomaly = await this.detectAnomalies(price);
          if (anomaly) {
            this.state.lastAnomalies.set(anomaly.anomaly_id, anomaly);
            await this.influxdb.storeAnomaly(anomaly);

            // Broadcast to clients
            this.io.emit('anomaly_detected', anomaly);

            // Phase 4: Dispatch to webhooks
            if (this.webhookManager) {
              await this.webhookManager.dispatchEvent('anomaly_detected', {
                feed_id: anomaly.feed_id,
                feed_name: anomaly.feed_name,
                anomaly_id: anomaly.anomaly_id,
                anomaly_type: anomaly.anomaly_type,
                severity: anomaly.severity,
                price: anomaly.price,
                expected_range: anomaly.expected_range,
                timestamp: anomaly.timestamp,
              });
            }
          }

          // Phase 2: Formal Verification
          this.performFormalVerification(price);

          // Phase 2: Manipulation Detection
          this.detectManipulation(price);

          // Phase 2: Outage Prediction (every 30 seconds)
          if (Math.random() > 0.83) { // ~1 in 5 iterations
            this.predictOutage(price.feed_id);
          }

          // Phase 3: Confidence Scoring (comprehensive)
          const latestPrices = Array.from(this.state.latestPrices.values()).filter(
            (p) => p.feed_id === price.feed_id
          );
          if (latestPrices.length >= 2) {
            const pythPrice = latestPrices.find((p) => p.source === 'pyth')?.price;
            const sbPrice = latestPrices.find((p) => p.source === 'switchboard')?.price;
            const dexPrice = latestPrices.find((p) => p.source === 'dex')?.price;
            const cgPrice = latestPrices.find((p) => p.source === 'coingecko')?.price;

            this.calculateConfidenceScoring(price.feed_id, pythPrice, sbPrice, dexPrice, cgPrice);
            this.performCrossProtocolAnalysis(price.feed_id, pythPrice, sbPrice, dexPrice, cgPrice);
          }

          // Phase 3: Validator Health (every ~30 seconds)
          if (Math.random() > 0.83) {
            this.updateValidatorHealth(price.feed_id);
          }

          // Broadcast price update
          this.io.emit('price_update', {
            feed_id: price.feed_id,
            price: price.price,
            confidence: confidence,
            timestamp: price.timestamp,
          });

          // Phase 4: Dispatch price update to webhooks
          if (this.webhookManager) {
            await this.webhookManager.dispatchEvent('price_updated', {
              feed_id: price.feed_id,
              feed_name: price.feed_name,
              price: price.price,
              source: price.source,
              confidence: confidence,
              timestamp: price.timestamp,
            });
          }
        }
      } catch (error) {
        console.error('Error in data collection:', error);
      }
    }, parseInt(process.env.COLLECTION_INTERVAL_MS || '5000'));

    // Store confidence scores periodically
    setInterval(async () => {
      try {
        const scores = await this.influxdb.queryLatestConfidenceScores();
        for (const score of scores) {
          await this.postgres.storeConfidenceScore(score);
        }
      } catch (error) {
        console.error('Error storing confidence scores:', error);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(collectInterval);
  }

  private calculateConfidenceScore(feedId: string): number {
    // Get prices from all sources
    const allPrices = Array.from(this.state.latestPrices.values()).filter(
      (p) => p.feed_id === feedId
    );

    if (allPrices.length === 0) return 0;

    // Average confidence across sources
    const avgConfidence =
      allPrices.reduce((sum, p) => sum + p.confidence, 0) / allPrices.length;

    // Penalize stale prices
    const stalePenalty = allPrices.some((p) => p.is_stale) ? 0.2 : 0;

    return Math.max(0, avgConfidence - stalePenalty);
  }

  private async detectAnomalies(price: any): Promise<any> {
    // Get price history for this feed
    const history = await this.influxdb.queryPriceHistory(price.feed_id, 60);

    if (history.length < 10) {
      return null;
    }

    // Get previous price
    const previousPrice =
      history.length > 1 ? history[history.length - 2].price : price.price;

    // Detect anomalies
    const anomaly = AnomalyDetector.detectCompositeAnomaly(
      price.price,
      history.map((h: any) => ({
        timestamp: new Date(h.timestamp),
        price: h.price,
        confidence: h.confidence || 0,
      })),
      previousPrice,
      price.timestamp,
      {
        pyth: price.source === 'pyth' ? price.price : undefined,
      }
    );

    if (anomaly) {
      anomaly.feed_id = price.feed_id;
      anomaly.feed_name = price.feed_name;
    }

    return anomaly;
  }

  // Phase 2: Formal Verification
  private async performFormalVerification(price: any): Promise<void> {
    try {
      // Get price history
      const history = this.state.priceHistory.get(price.feed_id) || [];
      const previousPrice = history.length > 0 ? history[history.length - 1].price : undefined;
      const age_seconds = (Date.now() - price.timestamp.getTime()) / 1000;

      // Run formal verification
      const validation = FormalVerifier.validatePrice(
        price.price,
        previousPrice,
        age_seconds
      );

      validation.feed_id = price.feed_id;
      this.state.specValidations.set(price.feed_id, validation);

      // Store in PostgreSQL for audit
      this.postgres.storePercolatorValidation(validation).catch((e: any) => {
        console.error('Error storing validation:', e);
      });

      // Broadcast if non-compliant
      if (!validation.spec_compliant) {
        this.io.emit('spec_violation', {
          feed_id: price.feed_id,
          violations: validation.spec_violations,
          severity: validation.satisfies_bounds ? 'warning' : 'critical',
        });

        // Phase 4: Dispatch to webhooks
        if (this.webhookManager) {
          await this.webhookManager.dispatchEvent('spec_violation', {
            feed_id: price.feed_id,
            violations: validation.spec_violations,
            severity: validation.satisfies_bounds ? 'warning' : 'critical',
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('Error in formal verification:', error);
    }
  }

  // Phase 2: Manipulation Detection
  private async detectManipulation(price: any): Promise<void> {
    try {
      const history = (this.state.priceHistory.get(price.feed_id) || []).map((p) => ({
        timestamp: new Date(p.timestamp),
        price: p.price,
        source: 'pyth' as const,
      }));

      if (history.length < 5) return;

      const manipulation = ManipulationDetector.detectManipulation(
        price.price,
        history,
        undefined,
        [],
        undefined,
        undefined
      );

      if (manipulation) {
        manipulation.feed_id = price.feed_id;

        // Add to history
          const manipulations = this.state.manipulationHistory.get(price.feed_id) || [];
        manipulations.push(manipulation);

        // Keep last 100
        if (manipulations.length > 100) {
          manipulations.shift();
        }

        this.state.manipulationHistory.set(price.feed_id, manipulations);

        // Store in PostgreSQL
        this.postgres.logManipulationEvent(manipulation).catch((e: any) => {
          console.error('Error storing manipulation event:', e);
        });

        // Broadcast to clients
        this.io.emit('manipulation_detected', manipulation);

        // Phase 4: Dispatch to webhooks
        if (this.webhookManager) {
          await this.webhookManager.dispatchEvent('manipulation_detected', {
            feed_id: price.feed_id,
            manipulation_id: manipulation.manipulation_id,
            confidence: manipulation.confidence,
            price_before: manipulation.price_before,
            price_after: manipulation.price_after,
            jump_pct: manipulation.jump_pct,
            jump_duration_seconds: manipulation.jump_duration_seconds,
            validators_agreeing: manipulation.validators_agreeing,
            validators_disagreeing: manipulation.validators_disagreeing,
            detected_at: manipulation.detected_at,
          });
        }
      }
    } catch (error) {
      console.error('Error in manipulation detection:', error);
    }
  }

  // Phase 2: Outage Prediction
  private async predictOutage(feedId: string): Promise<void> {
    try {
      const history = this.state.priceHistory.get(feedId) || [];

      if (history.length < 10) return;

      // Convert to UpdateEvent format
      const updateEvents = history.map((h) => ({
        timestamp: new Date(h.timestamp),
        successful: true,
        latency_ms: Math.random() * 100 + 50, // Mock latency
      }));

      // Run prediction
      const prediction = OutagePredictor.predictOutage(
        feedId,
        history.map((h: any) => ({
          timestamp: new Date(h.timestamp),
          is_active: true,
          uptime_pct: 99.5,
        })),
        updateEvents,
        new Set<string>(),
        new Set<string>()
      );

      this.state.outagePredictions.set(feedId, prediction);

      // Store in PostgreSQL
      this.postgres.storeOutagePrediction(prediction).catch((e: any) => {
        console.error('Error storing outage prediction:', e);
      });

      // Alert if high probability
      if (prediction.predicted_outage_probability > 0.5) {
        this.io.emit('outage_warning', {
          feed_id: feedId,
          probability: prediction.predicted_outage_probability,
          window_start: prediction.predicted_outage_window_start,
          window_end: prediction.predicted_outage_window_end,
          recovery_time: prediction.estimated_recovery_time_minutes,
        });

        // Phase 4: Dispatch to webhooks
        if (this.webhookManager) {
          await this.webhookManager.dispatchEvent('outage_warning', {
            feed_id: feedId,
            probability: prediction.predicted_outage_probability,
            window_start: prediction.predicted_outage_window_start,
            window_end: prediction.predicted_outage_window_end,
            recovery_time: prediction.estimated_recovery_time_minutes,
            affected_validators: prediction.recent_incidents,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('Error in outage prediction:', error);
    }
  }

  // Phase 3: Confidence Scoring
  private calculateConfidenceScoring(
    feedId: string,
    pythPrice: number | undefined,
    switchboardPrice: number | undefined,
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined
  ): void {
    try {
      // Gather all component scores
      const specValidation = this.state.specValidations.get(feedId);
      const manipulation = (this.state.manipulationHistory.get(feedId) || []).slice(-1)[0];
      const prediction = this.state.outagePredictions.get(feedId);

      // Calculate component scores
      const sourceAgreement = ConfidenceScorer.calculateSourceAgreement(
        pythPrice,
        switchboardPrice,
        dexPrice,
        coingeckoPrice
      );

      const specCompliance = specValidation
        ? ConfidenceScorer.calculateCompositeConfidence({
            source_agreement: 1,
            spec_compliance: specValidation.spec_compliant ? 1.0 : 0.5,
            manipulation_safety: 1,
            outage_resilience: 1,
            data_freshness: 1,
            validator_health: 1,
          })
        : 1.0;

      const manipulationSafety = manipulation
        ? Math.max(0, 1.0 - manipulation.confidence)
        : 1.0;

      const outageSafety = prediction
        ? Math.max(0, 1.0 - prediction.predicted_outage_probability)
        : 1.0;

      const dataFreshness =
        (pythPrice !== undefined ? 1.0 : 0.7) *
        (switchboardPrice !== undefined ? 1.0 : 0.8) *
        (dexPrice !== undefined ? 1.0 : 0.8) *
        (coingeckoPrice !== undefined ? 1.0 : 0.8);

      // Validator health (default to good if not yet calculated)
      const validatorHealth = 0.9;

      // Build components
      const components = {
        source_agreement: sourceAgreement,
        spec_compliance: specCompliance,
        manipulation_safety: manipulationSafety,
        outage_resilience: outageSafety,
        data_freshness: dataFreshness,
        validator_health: validatorHealth,
      };

      // Create confidence score record
      const confidenceRecord = createConfidenceScore(
        feedId,
        pythPrice,
        switchboardPrice,
        dexPrice,
        coingeckoPrice,
        components,
        specCompliance,
        manipulation ? manipulation.confidence : 0,
        prediction ? prediction.predicted_outage_probability : 0,
        validatorHealth
      );

      this.state.confidenceDetails.set(feedId, confidenceRecord);

      // Update overall confidence
      const overallConfidence =
        ConfidenceScorer.calculateCompositeConfidence(components);
      this.state.confidenceScores.set(feedId, overallConfidence);

      // Store in PostgreSQL
      this.postgres.storeConfidenceScore(confidenceRecord).catch((e: any) => {
        console.error('Error storing confidence score:', e);
      });

      // Broadcast confidence update
      this.io.emit('confidence_updated', {
        feed_id: feedId,
        confidence: overallConfidence,
        interpretation: confidenceRecord.confidence_interpretation,
        recommendation: confidenceRecord.recommendation,
      });
    } catch (error) {
      console.error('Error in confidence scoring:', error);
    }
  }

  // Phase 3: Validator Health Tracking
  private updateValidatorHealth(feedId: string): void {
    try {
      // Collect validator metrics (mock data for now)
      const validatorIds = ['pyth', 'switchboard', 'dex', 'coingecko'];

      for (const validatorId of validatorIds) {
        const metrics = ValidatorHealthTracker.calculateHealthScore({
          validator_id: validatorId,
          uptime_pct: 98.5 + Math.random() * 1.5,
          accuracy_pct: 97 + Math.random() * 3,
          latency_ms: 50 + Math.random() * 50,
          updates_count: 100,
          error_count: 2,
          blacklist_strikes: 0,
        });

        const health = createValidatorHealthRecord(
          validatorId,
          98.5 + Math.random() * 1.5,
          97 + Math.random() * 3,
          50 + Math.random() * 50,
          100,
          2,
          metrics < 0.5
        );

        // health.oracle_name = feedId; // Not a valid property
        this.state.validatorMetrics.set(validatorId, health);
      }

      // Store in PostgreSQL
      Array.from(this.state.validatorMetrics.values()).forEach((health) => {
        this.postgres.updateValidatorHealth(health).catch((e: any) => {
          console.error('Error storing validator health:', e);
        });
      });

      // Broadcast validator health update
      this.io.emit('validator_health_updated', {
        validators: Array.from(this.state.validatorMetrics.values()),
      });
    } catch (error) {
      console.error('Error updating validator health:', error);
    }
  }

  // Phase 3: Cross-Protocol Comparison
  private performCrossProtocolAnalysis(
    feedId: string,
    pythPrice: number | undefined,
    switchboardPrice: number | undefined,
    dexPrice: number | undefined,
    coingeckoPrice: number | undefined
  ): void {
    try {
      const snapshot: ProtocolPriceSnapshot = {
        timestamp: new Date(),
        pyth: pythPrice,
        switchboard: switchboardPrice,
        orca: dexPrice,
        coingecko: coingeckoPrice,
      };

      this.state.crossProtocolSnapshots.set(feedId, snapshot);

      // Analyze consistency
      const analyzer = new CrossProtocolAnalyzer();
      const health = CrossProtocolAnalyzer.generateHealthReport(snapshot);

      // Store in PostgreSQL
      const comparison = createCrossProtocolComparison(feedId, snapshot);
      this.postgres.storeCrossProtocolComparison(comparison).catch((e: any) => {
        console.error('Error storing cross-protocol comparison:', e);
      });

      // Broadcast cross-protocol update
      if (health.overall_health !== 'excellent' && health.overall_health !== 'good') {
        this.io.emit('cross_protocol_alert', {
          feed_id: feedId,
          status: health.overall_health,
          recommendation: health.recommendation,
          consensus_price: health.consensus_price,
        });
      }
    } catch (error) {
      console.error('Error in cross-protocol analysis:', error);
    }
  }

  async start() {
    const PORT = process.env.PORT || 3000;

    await this.initialize();
    const stopCollection = await this.startDataCollection();

    this.httpServer.listen(PORT, () => {
      console.log(`🌐 Oracle Sentinel running on port ${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n⏹️  Shutting down...');
      stopCollection();
      await this.influxdb.close();
      await this.postgres.close();
      process.exit(0);
    });
  }
}

// Start server
const sentinel = new OracleSentinel();
sentinel.start().catch((error) => {
  console.error('Failed to start Oracle Sentinel:', error);
  process.exit(1);
});

export default OracleSentinel;
