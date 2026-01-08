import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { Request, Response } from 'express';
import {
  createAuthMiddleware,
  createRateLimitMiddleware,
  createRemoteControlRouter,
  resetRateLimiter,
  type RemoteControlConfig,
  type TeleprompterAppInterface,
  type TeleprompterManagerInterface,
} from '../remoteControl';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { statusCode: number; jsonData: unknown } {
  const res = {
    statusCode: 200,
    jsonData: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this;
    },
  };
  return res as Response & { statusCode: number; jsonData: unknown };
}

function createMockTeleprompterManager(overrides: Partial<TeleprompterManagerInterface> = {}): TeleprompterManagerInterface {
  return {
    getCurrentPosition: () => 5,
    getTotalLines: () => 100,
    isAtEnd: () => false,
    isSpeechScrollEnabled: () => true,
    resetPosition: mock(() => {}),
    scrollForward: mock(() => {}),
    scrollBack: mock(() => {}),
    goToLine: mock(() => {}),
    ...overrides,
  };
}

function createMockApp(managers: Map<string, TeleprompterManagerInterface>): TeleprompterAppInterface {
  return {
    getUserTeleprompterManagers: () => managers,
  };
}

// =============================================================================
// Authentication Middleware Tests
// =============================================================================

describe('createAuthMiddleware', () => {
  const config: RemoteControlConfig = {
    apiKey: 'test-secret-key',
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 60,
  };

  test('allows request with valid Bearer token', () => {
    const middleware = createAuthMiddleware(config);
    const req = createMockRequest({
      headers: { authorization: 'Bearer test-secret-key' },
    });
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  test('rejects request without Authorization header', () => {
    const middleware = createAuthMiddleware(config);
    const req = createMockRequest();
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ success: false, message: 'Missing Authorization header' });
  });

  test('rejects request with wrong token', () => {
    const middleware = createAuthMiddleware(config);
    const req = createMockRequest({
      headers: { authorization: 'Bearer wrong-key' },
    });
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ success: false, message: 'Invalid API key' });
  });

  test('rejects request with invalid format (no Bearer)', () => {
    const middleware = createAuthMiddleware(config);
    const req = createMockRequest({
      headers: { authorization: 'Basic test-secret-key' },
    });
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  test('rejects all requests when no API key configured (defense in depth)', () => {
    const devConfig: RemoteControlConfig = {
      apiKey: undefined,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 60,
    };
    const middleware = createAuthMiddleware(devConfig);
    const req = createMockRequest();
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res.jsonData).toEqual({ success: false, message: 'Remote control API not configured' });
  });
});

// =============================================================================
// Rate Limiting Middleware Tests
// =============================================================================

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  test('allows requests within rate limit', () => {
    const config: RemoteControlConfig = {
      apiKey: 'test',
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 10,
    };
    const middleware = createRateLimitMiddleware(config);
    const req = createMockRequest({ ip: '192.168.1.1' });
    const res = createMockResponse();
    let nextCallCount = 0;

    // Should allow first 10 requests
    for (let i = 0; i < 10; i++) {
      middleware(req, res, () => { nextCallCount++; });
    }

    expect(nextCallCount).toBe(10);
  });

  test('blocks requests exceeding rate limit', () => {
    const config: RemoteControlConfig = {
      apiKey: 'test',
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 5,
    };
    const middleware = createRateLimitMiddleware(config);
    const req = createMockRequest({ ip: '192.168.1.2' });
    const res = createMockResponse();
    let nextCallCount = 0;

    // Use up all tokens
    for (let i = 0; i < 5; i++) {
      middleware(req, res, () => { nextCallCount++; });
    }

    // This one should be blocked
    middleware(req, res, () => { nextCallCount++; });

    expect(nextCallCount).toBe(5);
    expect(res.statusCode).toBe(429);
    expect(res.jsonData).toEqual({
      success: false,
      message: 'Too many requests. Please slow down.',
    });
  });

  test('tracks different IPs separately', () => {
    const config: RemoteControlConfig = {
      apiKey: 'test',
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 3,
    };
    const middleware = createRateLimitMiddleware(config);

    const req1 = createMockRequest({ ip: '10.0.0.1' });
    const req2 = createMockRequest({ ip: '10.0.0.2' });
    const res = createMockResponse();
    let nextCallCount = 0;

    // Use up all tokens for IP1
    for (let i = 0; i < 3; i++) {
      middleware(req1, res, () => { nextCallCount++; });
    }

    // IP2 should still have tokens
    middleware(req2, res, () => { nextCallCount++; });

    expect(nextCallCount).toBe(4);
  });
});

// =============================================================================
// Router Integration Tests
// =============================================================================

describe('Remote Control Router', () => {
  const config: RemoteControlConfig = {
    apiKey: undefined, // Disable auth for testing
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 1000,
  };

  describe('GET /sessions', () => {
    test('returns empty array when no sessions', () => {
      const managers = new Map<string, TeleprompterManagerInterface>();
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      // Get the route handler
      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { get?: boolean } } }) =>
          layer.route?.path === '/sessions' && layer.route?.methods.get
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest();
      const res = createMockResponse();

      handler(req, res);

      expect(res.jsonData).toEqual({ sessions: [] });
    });

    test('returns session info for active sessions', () => {
      const manager = createMockTeleprompterManager({
        getCurrentPosition: () => 10,
        getTotalLines: () => 50,
        isAtEnd: () => false,
        isSpeechScrollEnabled: () => true,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { get?: boolean } } }) =>
          layer.route?.path === '/sessions' && layer.route?.methods.get
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest();
      const res = createMockResponse();

      handler(req, res);

      expect(res.jsonData).toEqual({
        sessions: [{
          userId: 'user123',
          currentLine: 10,
          totalLines: 50,
          isAtEnd: false,
          speechScrollEnabled: true,
        }],
      });
    });
  });

  describe('POST /control/:userId/scroll', () => {
    test('scrolls forward', () => {
      const scrollForwardMock = mock(() => {});
      const manager = createMockTeleprompterManager({
        scrollForward: scrollForwardMock,
        getCurrentPosition: () => 6,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { direction: 'forward', lines: 2 },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(scrollForwardMock).toHaveBeenCalledWith(2);
      expect(res.jsonData).toEqual({ success: true, position: 6 });
    });

    test('scrolls backward', () => {
      const scrollBackMock = mock(() => {});
      const manager = createMockTeleprompterManager({
        scrollBack: scrollBackMock,
        getCurrentPosition: () => 3,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { direction: 'back', lines: 2 },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(scrollBackMock).toHaveBeenCalledWith(2);
      expect(res.jsonData).toEqual({ success: true, position: 3 });
    });

    test('defaults to 1 line when lines not specified', () => {
      const scrollForwardMock = mock(() => {});
      const manager = createMockTeleprompterManager({
        scrollForward: scrollForwardMock,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { direction: 'forward' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(scrollForwardMock).toHaveBeenCalledWith(1);
    });

    test('returns 404 for unknown user', () => {
      const managers = new Map<string, TeleprompterManagerInterface>();
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'unknown' },
        body: { direction: 'forward' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toEqual({ success: false, message: 'No active session for this user' });
    });

    test('returns 400 for invalid direction', () => {
      const manager = createMockTeleprompterManager();
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { direction: 'sideways' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        success: false,
        message: 'Invalid direction. Use "forward" or "back"',
      });
    });

    test('returns 400 for invalid userId format', () => {
      const managers = new Map<string, TeleprompterManagerInterface>();
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user<script>alert(1)</script>' },
        body: { direction: 'forward' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({ success: false, message: 'Invalid userId format' });
    });

    test('caps lines at maximum of 50', () => {
      const scrollForwardMock = mock(() => {});
      const manager = createMockTeleprompterManager({
        scrollForward: scrollForwardMock,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/scroll' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { direction: 'forward', lines: 1000 },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(scrollForwardMock).toHaveBeenCalledWith(50);
    });
  });

  describe('POST /control/:userId/reset', () => {
    test('resets position to beginning', () => {
      const resetMock = mock(() => {});
      const manager = createMockTeleprompterManager({
        resetPosition: resetMock,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/reset' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(resetMock).toHaveBeenCalled();
      expect(res.jsonData).toEqual({ success: true, position: 0 });
    });

    test('returns 404 for unknown user', () => {
      const managers = new Map<string, TeleprompterManagerInterface>();
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/reset' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'unknown' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /control/:userId/goto', () => {
    test('jumps to specific line', () => {
      const goToLineMock = mock(() => {});
      const manager = createMockTeleprompterManager({
        goToLine: goToLineMock,
        getCurrentPosition: () => 25,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/goto' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { position: 25 },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(goToLineMock).toHaveBeenCalledWith(25);
      expect(res.jsonData).toEqual({ success: true, position: 25 });
    });

    test('returns 400 for negative position', () => {
      const manager = createMockTeleprompterManager();
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/goto' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { position: -5 },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        success: false,
        message: 'Invalid position. Must be a non-negative number',
      });
    });

    test('returns 400 for non-numeric position', () => {
      const manager = createMockTeleprompterManager();
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { post?: boolean } } }) =>
          layer.route?.path === '/control/:userId/goto' && layer.route?.methods.post
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
        body: { position: 'middle' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /control/:userId/status', () => {
    test('returns status for active session', () => {
      const manager = createMockTeleprompterManager({
        getCurrentPosition: () => 15,
        getTotalLines: () => 80,
        isAtEnd: () => false,
        isSpeechScrollEnabled: () => false,
      });
      const managers = new Map<string, TeleprompterManagerInterface>([['user123', manager]]);
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { get?: boolean } } }) =>
          layer.route?.path === '/control/:userId/status' && layer.route?.methods.get
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'user123' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.jsonData).toEqual({
        userId: 'user123',
        currentLine: 15,
        totalLines: 80,
        isAtEnd: false,
        speechScrollEnabled: false,
      });
    });

    test('returns 404 for unknown user', () => {
      const managers = new Map<string, TeleprompterManagerInterface>();
      const app = createMockApp(managers);
      const router = createRemoteControlRouter(app, config);

      const handler = (router.stack.find(
        (layer: { route?: { path: string; methods: { get?: boolean } } }) =>
          layer.route?.path === '/control/:userId/status' && layer.route?.methods.get
      )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

      const req = createMockRequest({
        params: { userId: 'unknown' },
      });
      const res = createMockResponse();

      handler(req, res);

      expect(res.statusCode).toBe(404);
    });
  });
});

// =============================================================================
// UserId Validation Tests
// =============================================================================

describe('userId validation', () => {
  const config: RemoteControlConfig = {
    apiKey: undefined,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 1000,
  };

  const validUserIds = [
    'user123',
    'USER-456',
    'user_name',
    'a',
    '1234567890',
    'user-with-hyphen_and_underscore',
  ];

  const invalidUserIds = [
    'user<script>',
    'user@domain.com',
    'user with spaces',
    '../../../etc/passwd',
    'user;drop table users',
    '',
    'a'.repeat(129), // Too long
  ];

  test.each(validUserIds)('accepts valid userId: %s', (userId) => {
    const manager = createMockTeleprompterManager();
    const managers = new Map<string, TeleprompterManagerInterface>([[userId, manager]]);
    const app = createMockApp(managers);
    const router = createRemoteControlRouter(app, config);

    const handler = (router.stack.find(
      (layer: { route?: { path: string; methods: { get?: boolean } } }) =>
        layer.route?.path === '/control/:userId/status' && layer.route?.methods.get
    )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

    const req = createMockRequest({ params: { userId } });
    const res = createMockResponse();

    handler(req, res);

    // Should not return 400 for valid userId
    expect(res.statusCode).not.toBe(400);
  });

  test.each(invalidUserIds)('rejects invalid userId: %s', (userId) => {
    const managers = new Map<string, TeleprompterManagerInterface>();
    const app = createMockApp(managers);
    const router = createRemoteControlRouter(app, config);

    const handler = (router.stack.find(
      (layer: { route?: { path: string; methods: { get?: boolean } } }) =>
        layer.route?.path === '/control/:userId/status' && layer.route?.methods.get
    )?.route?.stack[0].handle) as (req: Request, res: Response) => void;

    const req = createMockRequest({ params: { userId } });
    const res = createMockResponse();

    handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData).toEqual({ success: false, message: 'Invalid userId format' });
  });
});
