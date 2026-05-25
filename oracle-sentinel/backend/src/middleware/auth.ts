import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

/**
 * JWT Authentication Middleware
 * Handles token validation, refresh, and user context
 */

export const JWTPayloadSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  permissions: z.array(z.string()).optional(),
  iat: z.number(),
  exp: z.number(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      token?: string;
    }
  }
}

export class JWTAuthMiddleware {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor(config: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiry?: string;
    refreshTokenExpiry?: string;
  }) {
    this.accessTokenSecret = config.accessTokenSecret;
    this.refreshTokenSecret = config.refreshTokenSecret;
    this.accessTokenExpiry = config.accessTokenExpiry || '1h';
    this.refreshTokenExpiry = config.refreshTokenExpiry || '7d';
  }

  /**
   * Generate access token
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return (jwt as any).sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      algorithm: 'HS256',
    } as any);
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload: { userId: string }): string {
    return (jwt as any).sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      algorithm: 'HS256',
    } as any);
  }

  /**
   * Generate token pair
   */
  generateTokenPair(userId: string, email: string, permissions: string[] = []): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = this.generateAccessToken({
      userId,
      email,
      permissions,
    });

    const refreshToken = this.generateRefreshToken({ userId });

    return { accessToken, refreshToken };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256'],
      }) as any;

      return JWTPayloadSchema.parse(decoded);
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): { userId: string } | null {
    try {
      return jwt.verify(token, this.refreshTokenSecret, {
        algorithms: ['HS256'],
      }) as any;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract token from request header
   */
  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Middleware: Verify token and attach to request
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const token = this.extractToken(req);

      if (!token) {
        return res.status(401).json({
          error: 'Missing authorization token',
        });
      }

      const payload = this.verifyAccessToken(token);

      if (!payload) {
        return res.status(401).json({
          error: 'Invalid or expired token',
        });
      }

      req.user = payload;
      req.token = token;
      next();
    };
  }

  /**
   * Middleware: Optional authentication (doesn't fail if missing)
   */
  optionalMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const token = this.extractToken(req);

      if (token) {
        const payload = this.verifyAccessToken(token);
        if (payload) {
          req.user = payload;
          req.token = token;
        }
      }

      next();
    };
  }

  /**
   * Middleware: Check specific permission
   */
  requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
        });
      }

      if (!req.user.permissions?.includes(permission)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: permission,
        });
      }

      next();
    };
  }

  /**
   * Middleware: Refresh token endpoint
   */
  refreshTokenMiddleware() {
    return (req: Request, res: Response) => {
      const refreshToken = req.body.refreshToken;

      if (!refreshToken) {
        return res.status(400).json({
          error: 'Refresh token required',
        });
      }

      const payload = this.verifyRefreshToken(refreshToken);

      if (!payload) {
        return res.status(401).json({
          error: 'Invalid or expired refresh token',
        });
      }

      // In real implementation, verify user still exists and is active
      const newAccessToken = (jwt as any).sign(
        { userId: payload.userId },
        this.accessTokenSecret,
        {
          expiresIn: this.accessTokenExpiry,
          algorithm: 'HS256',
        } as any
      );

      res.json({
        accessToken: newAccessToken,
        expiresIn: this.accessTokenExpiry,
      });
    };
  }
}

/**
 * Factory: Create JWT middleware with environment variables
 */
export function createJWTMiddleware(): JWTAuthMiddleware {
  const accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'your-secret-key';
  const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';

  if (accessTokenSecret === 'your-secret-key' || refreshTokenSecret === 'your-refresh-secret') {
    console.warn(
      '[JWTAuth] WARNING: Using default secrets. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables.'
    );
  }

  return new JWTAuthMiddleware({
    accessTokenSecret,
    refreshTokenSecret,
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '1h',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  });
}

/**
 * API Key authentication (simpler alternative for service-to-service)
 */
export class APIKeyAuth {
  private validKeys: Set<string> = new Set();

  constructor(keys: string[]) {
    this.validKeys = new Set(keys);
  }

  /**
   * Middleware: Validate API key
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey || !this.validKeys.has(apiKey)) {
        return res.status(401).json({
          error: 'Invalid API key',
        });
      }

      (req as any).apiKey = apiKey;
      next();
    };
  }
}

/**
 * Factory: Create API key auth from environment
 */
export function createAPIKeyAuth(): APIKeyAuth {
  const keys = (process.env.API_KEYS || '').split(',').filter(Boolean);

  if (keys.length === 0) {
    console.warn('[APIKeyAuth] WARNING: No API keys configured. Set API_KEYS environment variable.');
  }

  return new APIKeyAuth(keys);
}
