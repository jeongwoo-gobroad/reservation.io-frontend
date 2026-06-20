import { Redis } from '@upstash/redis';
import { NextResponse, type NextRequest } from 'next/server';

let redisClient: Redis | null | undefined;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_KEY_TTL_SECONDS = 3;

function getRedisClient() {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
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

export async function proxy(request: NextRequest) {
  const redis = getRedisClient();
  if (!redis) return NextResponse.next();

  const limit = getRateLimitCounter();
  const nowMs = Date.now();
  const bucket = Math.floor(nowMs / RATE_LIMIT_WINDOW_MS);
  const elapsedMs = nowMs % RATE_LIMIT_WINDOW_MS;
  const previousWeight = (RATE_LIMIT_WINDOW_MS - elapsedMs) / RATE_LIMIT_WINDOW_MS;
  const keyParts = await Promise.all([
    digest(getClientIp(request)),
    actorKey(request),
    digest(getApiKey(request)),
  ]);
  const keyBase = `reservation-io:rl:${keyParts.join(':')}`;
  const currentKey = `${keyBase}:${bucket}`;
  const previousKey = `${keyBase}:${bucket - 1}`;

  try {
    const currentCount = await redis.incr(currentKey);
    const [previousRaw] = await Promise.all([
      redis.get(previousKey),
      currentCount === 1 ? redis.expire(currentKey, RATE_LIMIT_KEY_TTL_SECONDS) : Promise.resolve(0),
    ]);
    const previousCount = Number(previousRaw || 0);
    const estimatedCount = currentCount + previousCount * previousWeight;
    const resetAtMs = (bucket + 1) * RATE_LIMIT_WINDOW_MS;

    const headers = new Headers({
      'x-ratelimit-limit': String(limit),
      'x-ratelimit-remaining': String(Math.max(0, Math.floor(limit - estimatedCount))),
      'x-ratelimit-reset': String(Math.ceil(resetAtMs / 1000)),
      'x-ratelimit-algorithm': 'sliding-window-counter',
    });

    if (estimatedCount > limit) {
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
  matcher: ['/api/backend/:path*'],
};
