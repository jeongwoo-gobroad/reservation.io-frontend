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

async function waitingRoomUserKey(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  if (authorization) return `auth:${await digest(authorization.replace(/^Bearer\s+/i, ''))}`;

  const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anon';
  return `anon:${await digest(forwardedFor)}`;
}

async function redisCommand(redis: RedisClientType, command: string[]) {
  return redis.sendCommand(command);
}

async function sortedScore(redis: RedisClientType, key: string, member: string) {
  const raw = await redisCommand(redis, ['ZSCORE', key, member]);
  return raw === null || raw === undefined ? null : Number(raw);
}

async function sortedRank(redis: RedisClientType, key: string, member: string) {
  const raw = await redisCommand(redis, ['ZRANK', key, member]);
  return raw === null || raw === undefined ? null : Number(raw);
}

async function sortedCount(redis: RedisClientType, key: string) {
  const raw = await redisCommand(redis, ['ZCARD', key]);
  return Number(raw || 0);
}

export async function enterWaitingRoom(request: NextRequest, saleDate?: string | null) {
  if (!saleDate || !isWaitingRoomEnabled()) return { allowed: true as const };

  const redis = await getRedisClient().catch(() => null);
  if (!redis) return { allowed: true as const };

  const openKey = `wr:open:${saleDate}`;
  const openValue = await redis.get(openKey).catch(() => null);
  if (!openValue || !['1', 'true', 'open', 'enabled'].includes(String(openValue))) {
    return { allowed: true as const };
  }

  const userKey = await waitingRoomUserKey(request);
  const now = Date.now();
  const leaseSeconds = waitingRoomLeaseSeconds();
  const leaseMs = leaseSeconds * 1000;
  const activeKey = `wr:active:${saleDate}`;
  const queueKey = `wr:queue:${saleDate}`;
  const leaseKey = `wr:lease:${saleDate}:${userKey}`;

  await redisCommand(redis, ['ZREMRANGEBYSCORE', activeKey, '-inf', String(now)]).catch(() => 0);

  const activeScore = await sortedScore(redis, activeKey, userKey).catch(() => null);
  if (activeScore && activeScore > now) {
    await redisCommand(redis, ['SET', leaseKey, '1', 'EX', String(leaseSeconds)]).catch(() => undefined);
    return { allowed: true as const };
  }

  let rank = await sortedRank(redis, queueKey, userKey).catch(() => null);
  if (rank === null) {
    await redisCommand(redis, ['ZADD', queueKey, String(now), userKey]);
    rank = await sortedRank(redis, queueKey, userKey).catch(() => null);
  }

  const activeCount = await sortedCount(redis, activeKey).catch(() => waitingRoomMaxActive());
  if (activeCount < waitingRoomMaxActive() && rank === 0) {
    await Promise.all([
      redisCommand(redis, ['ZADD', activeKey, String(now + leaseMs), userKey]),
      redisCommand(redis, ['ZREM', queueKey, userKey]),
      redisCommand(redis, ['SET', leaseKey, '1', 'EX', String(leaseSeconds)]),
    ]);
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    response: NextResponse.json(
      {
        waiting_room: true,
        status: 'waiting',
        sale_date: saleDate,
        position: rank === null ? undefined : rank + 1,
        retry_after_seconds: waitingRoomPollSeconds(),
        message: '예약 요청이 몰려 잠시 대기 중입니다.',
      },
      {
        status: 202,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(waitingRoomPollSeconds()),
        },
      },
    ),
  };
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
