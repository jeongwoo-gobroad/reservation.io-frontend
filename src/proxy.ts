import { Redis } from '@upstash/redis';
import { createClient, type RedisClientType } from 'redis';
import { NextResponse, type NextRequest } from 'next/server';

interface RateLimitRedisClient {
  provider: 'upstash-rest' | 'redis-url';
  get: (key: string) => Promise<unknown>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
}

let redisClient: Promise<RateLimitRedisClient | null> | undefined;
let nodeRedisClient: RedisClientType | undefined;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_KEY_TTL_SECONDS = 3;

async function getRedisClient() {
  if (redisClient !== undefined) return redisClient;

  redisClient = createRedisClient();
  return redisClient;
}

async function createRedisClient(): Promise<RateLimitRedisClient | null> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (restUrl && restToken) {
    const restRedis = new Redis({ url: restUrl, token: restToken });
    return {
      provider: 'upstash-rest',
      get: (key) => restRedis.get(key),
      incr: (key) => restRedis.incr(key),
      expire: (key, seconds) => restRedis.expire(key, seconds),
    };
  }

  if (process.env.REDIS_URL) {
    nodeRedisClient = createClient({ url: process.env.REDIS_URL });
    nodeRedisClient.on('error', () => undefined);
    await nodeRedisClient.connect();
    return {
      provider: 'redis-url',
      get: (key) => nodeRedisClient?.get(key) ?? Promise.resolve(null),
      incr: (key) => nodeRedisClient?.incr(key) ?? Promise.resolve(0),
      expire: (key, seconds) => nodeRedisClient?.expire(key, seconds) ?? Promise.resolve(false),
    };
  }

  return null;
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
}

function getRateLimitCounter() {
  const parsed = Number(process.env.RATE_LIMIT_COUNTER || '8');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 8;
}

function getRateLimitIpCounter(baseLimit: number) {
  const parsed = Number(process.env.RATE_LIMIT_IP_COUNTER || '');
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return Math.max(baseLimit * 5, baseLimit);
}

function getApiKey(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/api\/backend\/?/, '/');
  return `${request.method}:${path || '/'}`;
}

async function digest(value: string) {
  const encoded = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

async function actorKey(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization) return 'anon';
  return `auth:${await digest(authorization.replace(/^Bearer\s+/i, ''))}`;
}

async function estimateSlidingWindow(
  redis: RateLimitRedisClient,
  keyBase: string,
  bucket: number,
  previousWeight: number,
) {
  const currentKey = `${keyBase}:${bucket}`;
  const previousKey = `${keyBase}:${bucket - 1}`;
  const currentCount = await redis.incr(currentKey);
  const [previousRaw] = await Promise.all([
    redis.get(previousKey),
    currentCount === 1 ? redis.expire(currentKey, RATE_LIMIT_KEY_TTL_SECONDS) : Promise.resolve(0),
  ]);
  const previousCount = Number(previousRaw || 0);
  return currentCount + previousCount * previousWeight;
}

export async function proxy(request: NextRequest) {
  const redis = await getRedisClient().catch(() => null);
  if (!redis) return NextResponse.next();

  const limit = getRateLimitCounter();
  const ipLimit = getRateLimitIpCounter(limit);
  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / RATE_LIMIT_WINDOW_MS);
  const elapsedMs = nowMs % RATE_LIMIT_WINDOW_MS;
  const previousWeight = (RATE_LIMIT_WINDOW_MS - elapsedMs) / RATE_LIMIT_WINDOW_MS;
  const [ipHash, actor, apiHash] = await Promise.all([
    digest(getClientIp(request)),
    actorKey(request),
    digest(getApiKey(request)),
  ]);
  const tripleKeyBase = `reservation-io:rl:triple:${ipHash}:${actor}:${apiHash}`;
  const ipApiKeyBase = `reservation-io:rl:ip-api:${ipHash}:${apiHash}`;

  try {
    const [estimatedCount, estimatedIpApiCount] = await Promise.all([
      estimateSlidingWindow(redis, tripleKeyBase, bucket, previousWeight),
      estimateSlidingWindow(redis, ipApiKeyBase, bucket, previousWeight),
    ]);
    const resetAtMs = (bucket + 1) * RATE_LIMIT_WINDOW_MS;

    const headers = new Headers({
      'x-ratelimit-limit': String(limit),
      'x-ratelimit-remaining': String(Math.max(0, Math.floor(limit - estimatedCount))),
      'x-ratelimit-ip-limit': String(ipLimit),
      'x-ratelimit-ip-remaining': String(Math.max(0, Math.floor(ipLimit - estimatedIpApiCount))),
      'x-ratelimit-reset': String(Math.ceil(resetAtMs / 1000)),
      'x-ratelimit-algorithm': 'sliding-window-counter',
      'x-ratelimit-store': redis.provider,
    });

    if (estimatedCount > limit || estimatedIpApiCount > ipLimit) {
      headers.set('retry-after', '1');
      return NextResponse.json(
        {
          detail: {
            code: 'rate_limited',
            message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          },
        },
        { status: 429, headers },
      );
    }

    const response = NextResponse.next();
    headers.forEach((value, name) => response.headers.set(name, value));
    return response;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/api/backend/:path*',
    '/api/reservation-requests/:path*',
    '/api/reservations/:path*',
    '/api/waiting-room/:path*',
    '/api/admin/schedule-dates/:path*',
    '/static/personal.md',
  ],
};
