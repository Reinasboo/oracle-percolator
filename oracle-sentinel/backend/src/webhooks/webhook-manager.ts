// @ts-ignore - uuid module has implicit any type
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { z } from 'zod';

/**
 * Webhook Manager
 * Centralized management of webhook subscriptions, delivery, and retry logic
 * Supports multiple destinations: Discord, Telegram, Slack, custom HTTP
 * Tracks delivery status and maintains audit trail
 */

// Webhook schemas
export const WebhookSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  destination: z.enum(['discord', 'telegram', 'slack', 'http']),
  webhook_url: z.string().url(),
  events: z.array(z.enum([
    'price_updated',
    'anomaly_detected',
    'spec_violation',
    'manipulation_detected',
    'outage_warning',
    'confidence_updated',
    'validator_health_updated',
    'cross_protocol_alert',
    'alert_acknowledged'
  ])),
  filters: z.object({
    feed_ids: z.array(z.string()).optional(),
    min_confidence: z.number().min(0).max(1).optional(),
    severity_levels: z.array(z.enum(['info', 'warning', 'alert', 'critical'])).optional(),
  }).optional(),
  active: z.boolean().default(true),
  rate_limit: z.object({
    max_per_minute: z.number().int().positive().default(60),
    max_per_hour: z.number().int().positive().default(1000),
  }).optional(),
  retry_policy: z.object({
    max_retries: z.number().int().min(0).max(10).default(3),
    backoff_ms: z.number().int().positive().default(1000),
    backoff_multiplier: z.number().positive().default(2),
  }).optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Webhook = z.infer<typeof WebhookSchema>;

export const WebhookEventSchema = z.object({
  id: z.string().uuid(),
  webhook_id: z.string().uuid(),
  event_type: z.string(),
  payload: z.record(z.any()),
  status: z.enum(['pending', 'delivered', 'failed', 'retrying']),
  delivery_attempts: z.number().int().min(0),
  last_error: z.string().optional(),
  delivered_at: z.date().optional(),
  created_at: z.date(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookDeliveryLogSchema = z.object({
  id: z.string().uuid(),
  webhook_id: z.string().uuid(),
  event_id: z.string().uuid(),
  attempt_number: z.number().int().positive(),
  status_code: z.number().int().optional(),
  response_body: z.string().optional(),
  error_message: z.string().optional(),
  delivery_time_ms: z.number().int().min(0),
  delivered_at: z.date(),
});

export type WebhookDeliveryLog = z.infer<typeof WebhookDeliveryLogSchema>;

/**
 * WebhookManager
 * Manages webhook lifecycle, filtering, delivery, and persistence
 */
export class WebhookManager extends EventEmitter {
  private db: Pool;
  private webhooks: Map<string, Webhook> = new Map();
  private deliveryQueue: Map<string, WebhookEvent> = new Map();
  private rateLimitTracking: Map<string, { minute: number; hour: number }> = new Map();

  constructor(db: Pool) {
    super();
    this.db = db;
    this.initializeSchema();
    this.loadWebhooks();
    this.startDeliveryWorker();
  }

  /**
   * Initialize PostgreSQL schema for webhooks
   */
  private async initializeSchema(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id UUID PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          destination VARCHAR(50) NOT NULL,
          webhook_url TEXT NOT NULL,
          events TEXT[] NOT NULL,
          filters JSONB,
          active BOOLEAN DEFAULT true,
          rate_limit JSONB,
          retry_policy JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_active (active)
        );

        CREATE TABLE IF NOT EXISTS webhook_events (
          id UUID PRIMARY KEY,
          webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
          event_type VARCHAR(100) NOT NULL,
          payload JSONB NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          delivery_attempts INT DEFAULT 0,
          last_error TEXT,
          delivered_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
          id UUID PRIMARY KEY,
          webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
          event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
          attempt_number INT NOT NULL,
          status_code INT,
          response_body TEXT,
          error_message TEXT,
          delivery_time_ms INT,
          delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook ON webhook_delivery_logs(webhook_id);
      `);

      console.log('[WebhookManager] Schema initialized');
    } catch (error) {
      console.error('[WebhookManager] Schema initialization failed:', error);
    }
  }

  /**
   * Load all active webhooks from database
   */
  private async loadWebhooks(): Promise<void> {
    try {
      const result = await this.db.query(
        'SELECT * FROM webhooks WHERE active = true'
      );

      for (const row of result.rows) {
        const webhook = WebhookSchema.parse({
          ...row,
          events: Array.isArray(row.events) ? row.events : JSON.parse(row.events || '[]'),
          filters: row.filters ? JSON.parse(row.filters) : undefined,
          rate_limit: row.rate_limit ? JSON.parse(row.rate_limit) : undefined,
          retry_policy: row.retry_policy ? JSON.parse(row.retry_policy) : undefined,
        });
        this.webhooks.set(webhook.id, webhook);
      }

      console.log(`[WebhookManager] Loaded ${this.webhooks.size} active webhooks`);
    } catch (error) {
      console.error('[WebhookManager] Failed to load webhooks:', error);
    }
  }

  /**
   * Create a new webhook subscription
   */
  async createWebhook(params: {
    user_id: string;
    name: string;
    destination: Webhook['destination'];
    webhook_url: string;
    events: Webhook['events'];
    filters?: Webhook['filters'];
    rate_limit?: Webhook['rate_limit'];
    retry_policy?: Webhook['retry_policy'];
  }): Promise<Webhook> {
    const id = uuidv4();
    const now = new Date();

    const webhook: Webhook = {
      id,
      user_id: params.user_id,
      name: params.name,
      destination: params.destination,
      webhook_url: params.webhook_url,
      events: params.events,
      filters: params.filters,
      active: true,
      rate_limit: params.rate_limit || { max_per_minute: 60, max_per_hour: 1000 },
      retry_policy: params.retry_policy || { max_retries: 3, backoff_ms: 1000, backoff_multiplier: 2 },
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db.query(
        `INSERT INTO webhooks (id, user_id, name, destination, webhook_url, events, filters, rate_limit, retry_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          webhook.id,
          webhook.user_id,
          webhook.name,
          webhook.destination,
          webhook.webhook_url,
          webhook.events,
          webhook.filters ? JSON.stringify(webhook.filters) : null,
          JSON.stringify(webhook.rate_limit),
          JSON.stringify(webhook.retry_policy),
        ]
      );

      this.webhooks.set(webhook.id, webhook);
      this.emit('webhook_created', webhook);
      console.log(`[WebhookManager] Created webhook: ${webhook.id}`);

      return webhook;
    } catch (error) {
      console.error('[WebhookManager] Failed to create webhook:', error);
      throw error;
    }
  }

  /**
   * Delete a webhook subscription
   */
  async deleteWebhook(webhook_id: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM webhooks WHERE id = $1', [webhook_id]);
      this.webhooks.delete(webhook_id);
      this.emit('webhook_deleted', webhook_id);
      console.log(`[WebhookManager] Deleted webhook: ${webhook_id}`);
    } catch (error) {
      console.error('[WebhookManager] Failed to delete webhook:', error);
      throw error;
    }
  }

  /**
   * Dispatch event to matching webhooks
   */
  async dispatchEvent(eventType: string, payload: any): Promise<void> {
    const matchingWebhooks = Array.from(this.webhooks.values()).filter(
      (webhook) =>
        webhook.active &&
        webhook.events.includes(eventType as any) &&
        this.matchesFilters(webhook, payload)
    );

    if (matchingWebhooks.length === 0) {
      return;
    }

    for (const webhook of matchingWebhooks) {
      if (!this.checkRateLimit(webhook.id, webhook.rate_limit!)) {
        console.warn(`[WebhookManager] Rate limit exceeded for webhook: ${webhook.id}`);
        continue;
      }

      const event: WebhookEvent = {
        id: uuidv4(),
        webhook_id: webhook.id,
        event_type: eventType,
        payload,
        status: 'pending',
        delivery_attempts: 0,
        created_at: new Date(),
      };

      try {
        await this.db.query(
          `INSERT INTO webhook_events (id, webhook_id, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.id, event.webhook_id, event.event_type, JSON.stringify(event.payload), event.status]
        );

        this.deliveryQueue.set(event.id, event);
        this.emit('event_queued', event);
      } catch (error) {
        console.error('[WebhookManager] Failed to queue event:', error);
      }
    }
  }

  /**
   * Check if event matches webhook filters
   */
  private matchesFilters(webhook: Webhook, payload: any): boolean {
    if (!webhook.filters) return true;

    const { feed_ids, min_confidence, severity_levels } = webhook.filters;

    if (feed_ids && payload.feed_id && !feed_ids.includes(payload.feed_id)) {
      return false;
    }

    if (min_confidence !== undefined && payload.confidence !== undefined) {
      if (payload.confidence < min_confidence) return false;
    }

    if (severity_levels && payload.severity && !severity_levels.includes(payload.severity)) {
      return false;
    }

    return true;
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(webhook_id: string, rate_limit: Webhook['rate_limit']): boolean {
    if (!rate_limit) return true;

    const now = Date.now();
    let tracking = this.rateLimitTracking.get(webhook_id);

    if (!tracking) {
      tracking = { minute: 0, hour: 0 };
      this.rateLimitTracking.set(webhook_id, tracking);
    }

    if (tracking.minute >= rate_limit.max_per_minute) return false;
    if (tracking.hour >= rate_limit.max_per_hour) return false;

    tracking.minute++;
    tracking.hour++;

    // Reset minute counter every 60 seconds
    setTimeout(() => {
      const t = this.rateLimitTracking.get(webhook_id);
      if (t) t.minute = 0;
    }, 60000);

    // Reset hour counter every 3600 seconds
    setTimeout(() => {
      const t = this.rateLimitTracking.get(webhook_id);
      if (t) t.hour = 0;
    }, 3600000);

    return true;
  }

  /**
   * Start delivery worker (processes queue every 100ms)
   */
  private startDeliveryWorker(): void {
    setInterval(() => {
      this.processDeliveryQueue();
    }, 100);
  }

  /**
   * Process pending deliveries from queue
   */
  private async processDeliveryQueue(): Promise<void> {
    const pending = Array.from(this.deliveryQueue.values()).filter(
      (event) => event.status === 'pending' || event.status === 'retrying'
    );

    for (const event of pending) {
      const webhook = this.webhooks.get(event.webhook_id);
      if (!webhook) {
        this.deliveryQueue.delete(event.id);
        continue;
      }

      await this.deliverEvent(webhook, event);
    }
  }

  /**
   * Deliver webhook event with retry logic
   */
  private async deliverEvent(webhook: Webhook, event: WebhookEvent): Promise<void> {
    const retryPolicy = webhook.retry_policy!;
    const maxRetries = retryPolicy.max_retries;

    if (event.delivery_attempts >= maxRetries) {
      await this.markEventFailed(event, 'Max retries exceeded');
      return;
    }

    const backoffMs =
      retryPolicy.backoff_ms * Math.pow(retryPolicy.backoff_multiplier, event.delivery_attempts);

    if (event.delivery_attempts > 0 && event.created_at.getTime() + backoffMs > Date.now()) {
      return; // Wait for backoff period
    }

    try {
      const startTime = Date.now();
      const response = await this.sendWebhook(webhook, event);
      const duration = Date.now() - startTime;

      await this.logDelivery(webhook.id, event.id, event.delivery_attempts + 1, {
        status_code: response.status,
        response_body: response.body,
        delivery_time_ms: duration,
      });

      if (response.status >= 200 && response.status < 300) {
        await this.markEventDelivered(event);
      } else {
        await this.markEventForRetry(event);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.logDelivery(webhook.id, event.id, event.delivery_attempts + 1, {
        error_message: errorMsg,
        delivery_time_ms: 0,
      });

      await this.markEventForRetry(event);
    }
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhook(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<{ status: number; body: string }> {
    const payload = this.formatPayload(webhook.destination, event);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const response = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OracleSentinel/1.0',
          'X-Webhook-ID': webhook.id,
          'X-Event-ID': event.id,
          'X-Event-Type': event.event_type,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = await response.text();
      return { status: response.status, body };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Format payload based on destination (Discord, Telegram, Slack, etc)
   */
  private formatPayload(destination: Webhook['destination'], event: WebhookEvent): any {
    switch (destination) {
      case 'discord':
        return this.formatDiscordPayload(event);
      case 'telegram':
        return this.formatTelegramPayload(event);
      case 'slack':
        return this.formatSlackPayload(event);
      case 'http':
      default:
        return {
          event_id: event.id,
          event_type: event.event_type,
          timestamp: new Date().toISOString(),
          data: event.payload,
        };
    }
  }

  private formatDiscordPayload(event: WebhookEvent): any {
    const { event_type, payload } = event;
    const color = this.getColorForEventType(event_type);

    return {
      embeds: [
        {
          title: event_type.replace(/_/g, ' ').toUpperCase(),
          color,
          fields: [
            ...(payload.feed_id ? [{ name: 'Feed', value: payload.feed_id, inline: true }] : []),
            ...(payload.confidence !== undefined
              ? [{ name: 'Confidence', value: payload.confidence.toFixed(2), inline: true }]
              : []),
            ...(payload.severity
              ? [{ name: 'Severity', value: payload.severity.toUpperCase(), inline: true }]
              : []),
          ],
          description: payload.message || JSON.stringify(payload, null, 2).substring(0, 2000),
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private formatTelegramPayload(event: WebhookEvent): any {
    const { event_type, payload } = event;
    const text = `*${event_type.replace(/_/g, ' ').toUpperCase()}*\n\n${
      payload.message || JSON.stringify(payload, null, 2)
    }`;

    return { text, parse_mode: 'Markdown' };
  }

  private formatSlackPayload(event: WebhookEvent): any {
    const { event_type, payload } = event;
    const color = this.getColorForEventType(event_type);

    return {
      attachments: [
        {
          color,
          title: event_type.replace(/_/g, ' ').toUpperCase(),
          fields: [
            ...(payload.feed_id ? [{ title: 'Feed', value: payload.feed_id, short: true }] : []),
            ...(payload.confidence !== undefined
              ? [{ title: 'Confidence', value: payload.confidence.toFixed(2), short: true }]
              : []),
            ...(payload.severity
              ? [{ title: 'Severity', value: payload.severity.toUpperCase(), short: true }]
              : []),
          ],
          text: payload.message || JSON.stringify(payload, null, 2).substring(0, 2000),
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  private getColorForEventType(eventType: string): number {
    switch (eventType) {
      case 'anomaly_detected':
      case 'spec_violation':
        return 16776960; // Yellow
      case 'manipulation_detected':
      case 'outage_warning':
        return 16711680; // Red
      case 'confidence_updated':
      case 'price_updated':
        return 65280; // Green
      default:
        return 9437184; // Gray
    }
  }

  /**
   * Mark event as delivered
   */
  private async markEventDelivered(event: WebhookEvent): Promise<void> {
    try {
      await this.db.query(
        `UPDATE webhook_events SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id]
      );
      this.deliveryQueue.delete(event.id);
      this.emit('event_delivered', event.id);
    } catch (error) {
      console.error('[WebhookManager] Failed to mark event delivered:', error);
    }
  }

  /**
   * Mark event for retry
   */
  private async markEventForRetry(event: WebhookEvent): Promise<void> {
    try {
      const newAttempt = event.delivery_attempts + 1;
      await this.db.query(
        `UPDATE webhook_events SET status = 'retrying', delivery_attempts = $1
         WHERE id = $2`,
        [newAttempt, event.id]
      );
      event.delivery_attempts = newAttempt;
      event.status = 'retrying';
    } catch (error) {
      console.error('[WebhookManager] Failed to mark event for retry:', error);
    }
  }

  /**
   * Mark event as failed
   */
  private async markEventFailed(event: WebhookEvent, error: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE webhook_events SET status = 'failed', last_error = $1
         WHERE id = $2`,
        [error, event.id]
      );
      this.deliveryQueue.delete(event.id);
      this.emit('event_failed', { id: event.id, error });
    } catch (error) {
      console.error('[WebhookManager] Failed to mark event as failed:', error);
    }
  }

  /**
   * Log delivery attempt
   */
  private async logDelivery(
    webhook_id: string,
    event_id: string,
    attempt: number,
    result: {
      status_code?: number;
      response_body?: string;
      error_message?: string;
      delivery_time_ms: number;
    }
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO webhook_delivery_logs
         (id, webhook_id, event_id, attempt_number, status_code, response_body, error_message, delivery_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          webhook_id,
          event_id,
          attempt,
          result.status_code || null,
          result.response_body || null,
          result.error_message || null,
          result.delivery_time_ms,
        ]
      );
    } catch (error) {
      console.error('[WebhookManager] Failed to log delivery:', error);
    }
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(webhook_id: string): Promise<Webhook | undefined> {
    return this.webhooks.get(webhook_id);
  }

  /**
   * Get all webhooks for a user
   */
  async getUserWebhooks(user_id: string): Promise<Webhook[]> {
    try {
      const result = await this.db.query('SELECT * FROM webhooks WHERE user_id = $1', [user_id]);
      return result.rows.map((row) =>
        WebhookSchema.parse({
          ...row,
          events: Array.isArray(row.events) ? row.events : JSON.parse(row.events || '[]'),
          filters: row.filters ? JSON.parse(row.filters) : undefined,
          rate_limit: row.rate_limit ? JSON.parse(row.rate_limit) : undefined,
          retry_policy: row.retry_policy ? JSON.parse(row.retry_policy) : undefined,
        })
      );
    } catch (error) {
      console.error('[WebhookManager] Failed to get user webhooks:', error);
      return [];
    }
  }

  /**
   * Get delivery history for webhook
   */
  async getDeliveryHistory(
    webhook_id: string,
    limit: number = 50
  ): Promise<WebhookDeliveryLog[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM webhook_delivery_logs WHERE webhook_id = $1 ORDER BY delivered_at DESC LIMIT $2`,
        [webhook_id, limit]
      );
      return result.rows.map((row) => WebhookDeliveryLogSchema.parse(row));
    } catch (error) {
      console.error('[WebhookManager] Failed to get delivery history:', error);
      return [];
    }
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhook_id: string): Promise<{
    total_events: number;
    delivered: number;
    failed: number;
    pending: number;
    success_rate: number;
  }> {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status IN ('pending', 'retrying') THEN 1 ELSE 0 END) as pending
         FROM webhook_events WHERE webhook_id = $1`,
        [webhook_id]
      );

      const row = result.rows[0];
      const total = parseInt(row.total) || 0;
      const delivered = parseInt(row.delivered) || 0;

      return {
        total_events: total,
        delivered,
        failed: parseInt(row.failed) || 0,
        pending: parseInt(row.pending) || 0,
        success_rate: total > 0 ? (delivered / total) * 100 : 0,
      };
    } catch (error) {
      console.error('[WebhookManager] Failed to get webhook stats:', error);
      return { total_events: 0, delivered: 0, failed: 0, pending: 0, success_rate: 0 };
    }
  }
}
