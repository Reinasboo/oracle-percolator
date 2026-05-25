import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

/**
 * Rate Limiting Middleware
 * Implements token bucket algorithm with per-endpoint and per-user limits
 * Supports both authenticated and unauthenticated users
 */

interface RateLimitConfig {
  windowMs: number; // Time window in ms (e.g., 60000 for 1 minute)
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
  requests: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, BucketState> = new Map();
  private db?: Pool;

  constructor(config: RateLimitConfig) {
    this.config = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config,
    };
  }

  /**
   * Optional: Store rate limit data in PostgreSQL for persistence across restarts
   */
  setDatabase(db: Pool): void {
    this.db = db;
    this.loadPersistedLimits();
  }

  /**
   * Load persisted rate limits from database
   */
  private async loadPersistedLimits(): Promise<void> {
    if (!this.db) return;

    try {
      const result = await this.db.query(
        `SELECT key, tokens, last_refill, requests FROM rate_limits`
      );

      for (const row of result.rows) {
        this.buckets.set(row.key, {
          tokens: row.tokens,
          lastRefill: row.last_refill,
          requests: row.requests,
        });
      }

      console.log('[RateLimiter] Loaded persisted rate limits');
    } catch (error) {
      console.warn('[RateLimiter] Failed to load persisted rate limits:', error);
    }
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = this.config.keyGenerator?.(req) || this.defaultKeyGenerator(req);

      const allowed = this.checkLimit(key);

      // Set rate limit headers
      const bucket = this.buckets.get(key) || { tokens: this.config.maxRequests, lastRefill: Date.now(), requests: 0 };
      res.set('RateLimit-Limit', String(this.config.maxRequests));
      res.set('RateLimit-Remaining', String(Math.floor(bucket.tokens)));
      res.set('RateLimit-Reset', String(Math.ceil((bucket.lastRefill + this.config.windowMs) / 1000)));

      if (!allowed) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((bucket.lastRefill + this.config.windowMs - Date.now()) / 1000),
        });
        return;
      }

      // Hook into response to conditionally skip successful/failed requests
      const originalSend = res.send;
      res.send = function (this: any, data: any) {
        const statusCode = res.statusCode;

        if (
          (this.config.skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) ||
          (this.config.skipFailedRequests && statusCode >= 400)
        ) {
          // Refund the token
          const bucket = this.buckets.get(key);
          if (bucket) {
            bucket.tokens = Math.min(bucket.tokens + 1, this.config.maxRequests);
          }
        }

        return originalSend.call(this, data);
      }.bind(this);

      next();
    };
  }

  /**
   * Check rate limit using token bucket algorithm
   */
  private checkLimit(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxRequests,
        lastRefill: now,
        requests: 0,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / this.config.windowMs) * this.config.maxRequests;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.config.maxRequests);
      bucket.lastRefill = now;
    }

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.requests += 1;

      // Persist to database if available
      if (this.db) {
        this.persistLimit(key, bucket);
      }

      return true;
    }

    return false;
  }

  /**
   * Persist rate limit state to database
   */
  private async persistLimit(key: string, bucket: BucketState): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO rate_limits (key, tokens, last_refill, requests)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
         tokens = $2, last_refill = $3, requests = $4`,
        [key, bucket.tokens, bucket.lastRefill, bucket.requests]
      );
    } catch (error) {
      console.error('[RateLimiter] Failed to persist rate limit:', error);
    }
  }

  /**
   * Default key generator: uses IP + endpoint
   */
  private defaultKeyGenerator(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const endpoint = `${req.method}:${req.path}`;
    return `${ip}:${endpoint}`;
  }

  /**
   * Reset rate limit for specific key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Get current limit state for key
   */
  getState(key: string): BucketState | undefined {
    return this.buckets.get(key);
  }
}

/**
 * Pre-configured rate limiters for common scenarios
 */

export const createGlobalRateLimiter = (db?: Pool) => {
  const limiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute per IP
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
  });

  if (db) limiter.setDatabase(db);
  return limiter;
};

export const createPerUserRateLimiter = (db?: Pool) => {
  const limiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute per user
    keyGenerator: (req) => {
      const userId = (req as any).user?.id || 'anonymous';
      return userId;
    },
  });

  if (db) limiter.setDatabase(db);
  return limiter;
};

export const createWebhookRateLimiter = (db?: Pool) => {
  const limiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 webhook requests per minute
    keyGenerator: (req) => {
      const webhookId = (req as any).webhook?.id || (req as any).params.webhookId || 'unknown';
      return `webhook:${webhookId}`;
    },
  });

  if (db) limiter.setDatabase(db);
  return limiter;
};

export const createAPIRateLimiter = (db?: Pool) => {
  const limiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 API requests per minute
    keyGenerator: (req) => {
      const apiKey = req.headers['x-api-key'] as string || req.ip || 'anonymous';
      return `api:${apiKey}`;
    },
  });

  if (db) limiter.setDatabase(db);
  return limiter;
};
