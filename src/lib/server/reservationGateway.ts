import { createHash } from 'crypto';
import { createClient, type RedisClientType } from 'redis';
import { NextResponse, type NextRequest } from 'next/server';
import type { UserReservation, WaitingRoomSync } from '@/lib/types';

let redisClient: Promise<RedisClientType | null> | undefined;

function backendOrigin() {
  return (process.env.BACKEND_API_BASE_URL || process.env.API_REWRITE_ORIGIN || '').replace(/\/$/, '');
}

function isWaitingRoomEnabled() {
  return process.env.WAITING_ROOM_ENABLED === 'true';
}

function waitingRoomMaxActive() {
  const parsed = Number(process.env.WAITING_ROOM_MAX_ACTIVE || '80');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 80;
}

function waitingRoomLeaseSeconds() {
  const parsed = Number(process.env.WAITING_ROOM_LEASE_SECONDS || '45');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 45;
}

function waitingRoomPollSeconds() {
  const parsed = Number(process.env.WAITING_ROOM_POLL_SECONDS || '3');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

async function getRedisClient() {
  if (redisClient !== undefined) return redisClient;
  redisClient = createRedisClient();
  return redisClient;
}

async function createRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) return null;

  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', () => undefined);
  await client.connect();
  return client as RedisClientType;
}

async function digest(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function decodeJwtUserUuid(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, '');
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return '';

  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as Record<string, unknown>;
    const candidate = payload.user_uuid || payload.sub || payload.uid;
    return typeof candidate === 'string' ? candidate : '';
  } catch {
    return '';
  }
}

async function waitingRoomUserKey(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  if (authorization) {
    const userUuid = decodeJwtUserUuid(authorization);
    if (userUuid) return `user:${await digest(userUuid)}`;
    return `auth:${await digest(authorization.replace(/^Bearer\s+/i, ''))}`;
  }

  const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anon';
  return `anon:${await digest(forwardedFor)}`;
}

async function redisCommand(redis: RedisClientType, command: string[]) {
  return redis.sendCommand(command);
}

function toLuaString(value: unknown) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return String(value ?? '');
}

function toLuaNumber(value: unknown) {
  const parsed = Number(toLuaString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function approximateAheadCount(count: number) {
  if (count < 10) return count;
  if (count < 100) return Math.round(count / 10) * 10;
  return Math.round(count / 50) * 50;
}

const WAITING_ROOM_ENTER_SCRIPT = `
local open_value = redis.call("GET", KEYS[1])
if not open_value or not (open_value == "1" or open_value == "true" or open_value == "open" or open_value == "enabled") then
  return {"pass"}
end

local user_key = ARGV[1]
local now = tonumber(ARGV[2])
local max_active = tonumber(ARGV[3])
local lease_ms = tonumber(ARGV[4])
local lease_seconds = tonumber(ARGV[5])
local poll_seconds = tonumber(ARGV[6])

redis.call("ZREMRANGEBYSCORE", KEYS[3], "-inf", now)

local lease_exists = redis.call("GET", KEYS[4])
local active_score = redis.call("ZSCORE", KEYS[3], user_key)
if lease_exists and active_score and tonumber(active_score) > now then
  redis.call("SET", KEYS[4], "1", "EX", lease_seconds)
  return {"admitted", lease_seconds}
end

if active_score and tonumber(active_score) > now then
  redis.call("SET", KEYS[4], "1", "EX", lease_seconds)
  return {"admitted", lease_seconds}
end

local rank = redis.call("ZRANK", KEYS[2], user_key)
if not rank then
  redis.call("ZADD", KEYS[2], "NX", now, user_key)
  rank = redis.call("ZRANK", KEYS[2], user_key)
end

local active_count = redis.call("ZCARD", KEYS[3])
local available = max_active - active_count
if available > 0 and rank < available then
  redis.call("ZADD", KEYS[3], now + lease_ms, user_key)
  redis.call("ZREM", KEYS[2], user_key)
  redis.call("SET", KEYS[4], "1", "EX", lease_seconds)
  return {"admitted", lease_seconds}
end

return {"waiting", rank + 1, rank, poll_seconds}
`;

export async function enterWaitingRoom(request: NextRequest, saleDate?: string | null) {
  if (!saleDate || !isWaitingRoomEnabled()) return { allowed: true as const };

  const redis = await getRedisClient().catch(() => null);
  if (!redis) return { allowed: true as const };

  const openKey = `wr:open:${saleDate}`;
  const userKey = await waitingRoomUserKey(request);
  const now = Date.now();
  const leaseSeconds = waitingRoomLeaseSeconds();
  const leaseMs = leaseSeconds * 1000;
  const pollSeconds = waitingRoomPollSeconds();
  const activeKey = `wr:active:${saleDate}`;
  const queueKey = `wr:queue:${saleDate}`;
  const leaseKey = `wr:lease:${saleDate}:${userKey}`;

  const result = await redisCommand(redis, [
    'EVAL',
    WAITING_ROOM_ENTER_SCRIPT,
    '4',
    openKey,
    queueKey,
    activeKey,
    leaseKey,
    userKey,
    String(now),
    String(waitingRoomMaxActive()),
    String(leaseMs),
    String(leaseSeconds),
    String(pollSeconds),
  ]).catch(() => null);

  if (Array.isArray(result)) {
    const status = toLuaString(result[0]);
    if (status === 'pass' || status === 'admitted') {
      return { allowed: true as const };
    }

    if (status === 'waiting') {
      const position = toLuaNumber(result[1]);
      const aheadCount = toLuaNumber(result[2]);
      const nextPollSeconds = toLuaNumber(result[3]) || pollSeconds;
      const approxAhead = approximateAheadCount(aheadCount || 0);

      return {
        allowed: false as const,
        response: NextResponse.json(
          {
            waiting_room: true,
            status: 'waiting',
            sale_date: saleDate,
            position,
            ahead_count: aheadCount,
            poll_after_seconds: nextPollSeconds,
            retry_after_seconds: nextPollSeconds,
            message:
              aheadCount && aheadCount > 0
                ? `앞에 약 ${approxAhead.toLocaleString('ko-KR')}명이 대기 중입니다. 예상보다 빨라지거나 늦어질 수 있습니다.`
                : '곧 예약 접수 순서입니다. 잠시만 기다려 주세요.',
          },
          {
            status: 202,
            headers: {
              'cache-control': 'no-store',
              'retry-after': String(nextPollSeconds),
            },
          },
        ),
      };
    }
  }

  return {
    allowed: false as const,
    response: NextResponse.json(
      {
        waiting_room: true,
        status: 'waiting',
        sale_date: saleDate,
        poll_after_seconds: pollSeconds,
        retry_after_seconds: pollSeconds,
        message: '예약 요청이 몰려 잠시 대기 중입니다.',
      },
      {
        status: 202,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(pollSeconds),
        },
      },
    ),
  };
}

export async function releaseWaitingRoomLease(request: NextRequest, saleDate?: string | null) {
  if (!saleDate || !isWaitingRoomEnabled()) return { released: false };

  const redis = await getRedisClient().catch(() => null);
  if (!redis) return { released: false };

  const userKey = await waitingRoomUserKey(request);
  const activeKey = `wr:active:${saleDate}`;
  const queueKey = `wr:queue:${saleDate}`;
  const leaseKey = `wr:lease:${saleDate}:${userKey}`;

  await Promise.allSettled([
    redisCommand(redis, ['DEL', leaseKey]),
    redisCommand(redis, ['ZREM', activeKey, userKey]),
    redisCommand(redis, ['ZREM', queueKey, userKey]),
  ]);

  return { released: true };
}

function passthroughHeaders(request: NextRequest) {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const idempotencyKey = request.headers.get('idempotency-key');
  const gatewaySecret = process.env.RESERVATION_GATEWAY_SECRET;

  headers.set('content-type', 'application/json');
  if (authorization) headers.set('authorization', authorization);
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
  if (gatewaySecret) headers.set('x-reservation-gateway-secret', gatewaySecret);
  return headers;
}

export async function forwardToBackend(request: NextRequest, path: string, init: { method: string; body?: unknown }) {
  const origin = backendOrigin();
  if (!origin) {
    return NextResponse.json(
      { detail: { code: 'backend_origin_missing', message: '백엔드 API 주소가 설정되지 않았습니다.' } },
      { status: 500 },
    );
  }

  const response = await fetch(`${origin}${path.startsWith('/') ? path : `/${path}`}`, {
    method: init.method,
    headers: passthroughHeaders(request),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const text = await response.text();
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': response.headers.get('content-type') || 'application/json',
  });

  return new NextResponse(text, { status: response.status, headers });
}

export async function fetchBackendJson(request: NextRequest, path: string, init: { method: string; body?: unknown }) {
  const origin = backendOrigin();
  if (!origin) {
    return NextResponse.json(
      { detail: { code: 'backend_origin_missing', message: '백엔드 API 주소가 설정되지 않았습니다.' } },
      { status: 500 },
    );
  }

  const response = await fetch(`${origin}${path.startsWith('/') ? path : `/${path}`}`, {
    method: init.method,
    headers: passthroughHeaders(request),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const text = await response.text();
  const json = text ? await Promise.resolve().then(() => JSON.parse(text)).catch(() => null) : null;
  return { response, json, text };
}

export async function syncWaitingRoomOpenKey(sync?: WaitingRoomSync) {
  if (!sync?.redis_key) return { synced: true };

  const redis = await getRedisClient().catch(() => null);
  if (!redis) return { synced: false, error: 'Vercel Redis 연결을 찾을 수 없습니다.' };

  try {
    if (sync.delete_key) {
      await redisCommand(redis, ['DEL', sync.redis_key]);
      return { synced: true };
    }

    if (sync.desired_open) {
      await redisCommand(redis, ['SET', sync.redis_key, sync.redis_value || '1']);
      return { synced: true };
    }

    await redisCommand(redis, ['DEL', sync.redis_key]);
    return { synced: true };
  } catch (error) {
    return {
      synced: false,
      error: error instanceof Error ? error.message : 'Vercel Redis 대기실 상태 동기화에 실패했습니다.',
    };
  }
}

export async function resolveReservationSaleDate(request: NextRequest, reservationUuid: string) {
  const origin = backendOrigin();
  const authorization = request.headers.get('authorization');
  if (!origin || !authorization) return null;

  const response = await fetch(`${origin}/users/me/reservations`, {
    headers: { authorization },
    cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return null;

  const reservations = (await response.json().catch(() => [])) as UserReservation[];
  const found = reservations.find((reservation) => {
    return reservation.uuid === reservationUuid || reservation.reservation_uuid === reservationUuid;
  });

  return found?.sale_date || null;
}
