import { NextResponse } from 'next/server';

function backendOrigin() {
  return (process.env.BACKEND_API_BASE_URL || process.env.API_REWRITE_ORIGIN || '').replace(/\/$/, '');
}

export async function GET() {
  const origin = backendOrigin();
  if (!origin) {
    return NextResponse.json(
      { detail: { code: 'backend_origin_missing', message: '개인정보 처리방침 원문 서버가 설정되지 않았습니다.' } },
      { status: 500 },
    );
  }

  const response = await fetch(`${origin}/static/personal.md`, {
    cache: 'no-store',
  });
  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      'cache-control': 'no-store',
      'content-type': response.headers.get('content-type') || 'text/markdown; charset=utf-8',
    },
  });
}
