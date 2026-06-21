import { NextResponse, type NextRequest } from 'next/server';
import { fetchBackendJson, syncWaitingRoomOpenKey } from '@/lib/server/reservationGateway';
import type { ScheduleDateMutationResponse } from '@/lib/types';

interface ScheduleDateRouteContext {
  params: Promise<{
    sale_date: string;
    action: string;
  }>;
}

export async function POST(request: NextRequest, context: ScheduleDateRouteContext) {
  const { sale_date: rawSaleDate, action } = await context.params;
  const saleDate = decodeURIComponent(rawSaleDate);

  if (action !== 'open' && action !== 'close') {
    return NextResponse.json(
      { detail: { code: 'unsupported_action', message: '지원하지 않는 판매 일자 작업입니다.' } },
      { status: 404 },
    );
  }

  const result = await fetchBackendJson(request, `/admin/schedule-dates/${encodeURIComponent(saleDate)}/${action}`, {
    method: 'POST',
  });

  if (result instanceof NextResponse) return result;

  if (!result.response.ok) {
    return new NextResponse(result.text, {
      status: result.response.status,
      headers: {
        'cache-control': 'no-store',
        'content-type': result.response.headers.get('content-type') || 'application/json',
      },
    });
  }

  const body = result.json as ScheduleDateMutationResponse | null;
  if (!body) {
    return NextResponse.json(
      { detail: { code: 'invalid_backend_response', message: '백엔드 응답을 해석할 수 없습니다.' } },
      { status: 502 },
    );
  }

  const syncResult = await syncWaitingRoomOpenKey(body.waiting_room_sync);

  return NextResponse.json(
    {
      ...body,
      waiting_room_synced: syncResult.synced,
      waiting_room_sync_error: syncResult.error,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
