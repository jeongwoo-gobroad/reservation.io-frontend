import { NextResponse } from 'next/server';

function backendOrigin() {
  return (process.env.BACKEND_API_BASE_URL || process.env.API_REWRITE_ORIGIN || '').replace(/\/$/, '');
}

function backendFetchTimeoutMs() {
  const parsed = Number(process.env.BACKEND_FETCH_TIMEOUT_MS || '15000');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 15000;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backendFetchTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const origin = backendOrigin();
  if (!origin) {
    return NextResponse.json(
      { detail: { code: 'backend_origin_missing', message: '개인정보 처리방침 원문 서버가 설정되지 않았습니다.' } },
      { status: 500 },
    );
  }

  const response = await fetchWithTimeout(`${origin}/static/personal.md`, {
    cache: 'no-store',
  }).catch(() => null);
  if (!response) {
    return NextResponse.json(
      { detail: { code: 'backend_timeout', message: '개인정보 처리방침 원문 응답 시간이 초과되었습니다.' } },
      { status: 504, headers: { 'cache-control': 'no-store' } },
    );
  }
  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      'cache-control': 'no-store',
      'content-type': response.headers.get('content-type') || 'text/markdown; charset=utf-8',
    },
  });
}
