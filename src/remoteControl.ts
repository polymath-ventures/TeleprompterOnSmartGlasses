/**
 * Remote Control API for Teleprompter
 *
 * Enables external devices (like Bluetooth presentation remotes via iOS companion app)
 * to control the teleprompter scrolling.
 *
 * Security:
 * - API key authentication via Bearer token
 * - Rate limiting per IP address
 * - Input validation on all parameters
 */

import { Request, Response, NextFunction, Router } from 'express';

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface RemoteControlConfig {
  apiKey: string | undefined;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface ScrollRequest {
  direction: 'forward' | 'back';
  lines?: number;
}

export interface GotoRequest {
  position: number; // Line number to go to
}

export interface SessionInfo {
  userId: string;
  currentLine: number;
  totalLines: number;
  isAtEnd: boolean;
  speechScrollEnabled: boolean;
}

export interface ControlResponse {
  success: boolean;
  message?: string;
  position?: number;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
}

// Interface for TeleprompterManager methods we need access to
export interface TeleprompterManagerInterface {
  getCurrentPosition(): number;
  getTotalLines(): number;
  isAtEnd(): boolean;
  isSpeechScrollEnabled(): boolean;
  resetPosition(): void;
  scrollForward(lines: number): void;
  scrollBack(lines: number): void;
  goToLine(line: number): void;
}

// Interface for accessing app state
export interface TeleprompterAppInterface {
  getUserTeleprompterManagers(): Map<string, TeleprompterManagerInterface>;
}

// =============================================================================
// Rate Limiting (In-memory token bucket)
// =============================================================================

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

class RateLimiter {
  private buckets = new Map<string, RateLimitEntry>();
  private maxTokens: number;
  private refillRateMs: number;
  private tokensPerRefill: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.refillRateMs = windowMs / maxRequests;
    this.tokensPerRefill = 1;

    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  isAllowed(ip: string): boolean {
    const now = Date.now();
    let entry = this.buckets.get(ip);

    if (!entry) {
      entry = { tokens: this.maxTokens - 1, lastRefill: now };
      this.buckets.set(ip, entry);
      return true;
    }

    // Refill tokens based on time elapsed
    const elapsed = now - entry.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillRateMs) * this.tokensPerRefill;

    if (tokensToAdd > 0) {
      entry.tokens = Math.min(this.maxTokens, entry.tokens + tokensToAdd);
      entry.lastRefill = now;
    }

    if (entry.tokens > 0) {
      entry.tokens--;
      return true;
    }

    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [ip, entry] of this.buckets) {
      if (now - entry.lastRefill > maxAge) {
        this.buckets.delete(ip);
      }
    }
  }
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * API Key authentication middleware
 * Validates Bearer token against configured API key
 */
export function createAuthMiddleware(config: RemoteControlConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Reject if no API key configured (defense in depth - API shouldn't be mounted without key)
    if (!config.apiKey) {
      res.status(503).json({ success: false, message: 'Remote control API not configured' });
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ success: false, message: 'Missing Authorization header' });
      return;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ success: false, message: 'Invalid Authorization format. Use: Bearer <token>' });
      return;
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(token, config.apiKey)) {
      res.status(403).json({ success: false, message: 'Invalid API key' });
      return;
    }

    next();
  };
}

/**
 * Rate limiting middleware
 */
export function createRateLimitMiddleware(config: RemoteControlConfig) {
  const limiter = new RateLimiter(config.rateLimitMaxRequests, config.rateLimitWindowMs);

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (!limiter.isAllowed(ip)) {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down.'
      });
      return;
    }

    next();
  };
}

/**
 * Validate userId parameter
 */
function validateUserId(userId: string): boolean {
  // Allow alphanumeric, hyphens, underscores, max 128 chars
  return /^[a-zA-Z0-9_-]{1,128}$/.test(userId);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// =============================================================================
// Route Handlers
// =============================================================================

export function createRemoteControlRouter(
  app: TeleprompterAppInterface,
  config: RemoteControlConfig
): Router {
  const router = Router();

  // Apply middleware
  router.use(createAuthMiddleware(config));
  router.use(createRateLimitMiddleware(config));

  /**
   * GET /api/remote/sessions
   * List all active teleprompter sessions
   */
  router.get('/sessions', (req: Request, res: Response) => {
    const managers = app.getUserTeleprompterManagers();
    const sessions: SessionInfo[] = [];

    for (const [userId, manager] of managers) {
      sessions.push({
        userId,
        currentLine: manager.getCurrentPosition(),
        totalLines: manager.getTotalLines(),
        isAtEnd: manager.isAtEnd(),
        speechScrollEnabled: manager.isSpeechScrollEnabled(),
      });
    }

    res.json({ sessions } as SessionsResponse);
  });

  /**
   * POST /api/remote/control/:userId/scroll
   * Scroll forward or backward
   */
  router.post('/control/:userId/scroll', (req: Request, res: Response) => {
    const { userId } = req.params;
    const { direction, lines = 1 } = req.body as ScrollRequest;

    // Validate userId
    if (!validateUserId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid userId format' });
      return;
    }

    // Validate direction
    if (direction !== 'forward' && direction !== 'back') {
      res.status(400).json({
        success: false,
        message: 'Invalid direction. Use "forward" or "back"'
      });
      return;
    }

    // Validate lines
    const lineCount = Math.min(Math.max(1, Math.floor(Number(lines) || 1)), 50);

    const managers = app.getUserTeleprompterManagers();
    const manager = managers.get(userId);

    if (!manager) {
      res.status(404).json({ success: false, message: 'No active session for this user' });
      return;
    }

    if (direction === 'forward') {
      manager.scrollForward(lineCount);
    } else {
      manager.scrollBack(lineCount);
    }

    res.json({
      success: true,
      position: manager.getCurrentPosition()
    } as ControlResponse);
  });

  /**
   * POST /api/remote/control/:userId/reset
   * Reset to the beginning of the script
   */
  router.post('/control/:userId/reset', (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!validateUserId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid userId format' });
      return;
    }

    const managers = app.getUserTeleprompterManagers();
    const manager = managers.get(userId);

    if (!manager) {
      res.status(404).json({ success: false, message: 'No active session for this user' });
      return;
    }

    manager.resetPosition();

    res.json({
      success: true,
      position: 0
    } as ControlResponse);
  });

  /**
   * POST /api/remote/control/:userId/goto
   * Jump to a specific line
   */
  router.post('/control/:userId/goto', (req: Request, res: Response) => {
    const { userId } = req.params;
    const { position } = req.body as GotoRequest;

    if (!validateUserId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid userId format' });
      return;
    }

    if (typeof position !== 'number' || position < 0) {
      res.status(400).json({ success: false, message: 'Invalid position. Must be a non-negative number' });
      return;
    }

    const managers = app.getUserTeleprompterManagers();
    const manager = managers.get(userId);

    if (!manager) {
      res.status(404).json({ success: false, message: 'No active session for this user' });
      return;
    }

    manager.goToLine(Math.floor(position));

    res.json({
      success: true,
      position: manager.getCurrentPosition()
    } as ControlResponse);
  });

  /**
   * GET /api/remote/control/:userId/status
   * Get current status for a specific user
   */
  router.get('/control/:userId/status', (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!validateUserId(userId)) {
      res.status(400).json({ success: false, message: 'Invalid userId format' });
      return;
    }

    const managers = app.getUserTeleprompterManagers();
    const manager = managers.get(userId);

    if (!manager) {
      res.status(404).json({ success: false, message: 'No active session for this user' });
      return;
    }

    res.json({
      userId,
      currentLine: manager.getCurrentPosition(),
      totalLines: manager.getTotalLines(),
      isAtEnd: manager.isAtEnd(),
      speechScrollEnabled: manager.isSpeechScrollEnabled(),
    } as SessionInfo);
  });

  return router;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_REMOTE_CONTROL_CONFIG: RemoteControlConfig = {
  apiKey: process.env.REMOTE_CONTROL_API_KEY,
  rateLimitWindowMs: 60 * 1000, // 1 minute
  rateLimitMaxRequests: 120,    // 120 requests per minute (2 per second)
};
