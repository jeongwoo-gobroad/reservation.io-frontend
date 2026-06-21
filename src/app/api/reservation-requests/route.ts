import { NextResponse, type NextRequest } from 'next/server';
import { enterWaitingRoom, forwardToBackend } from '@/lib/server/reservationGateway';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || !('sale_date' in body)) {
    return NextResponse.json(
      { detail: { code: 'invalid_payload', message: '판매 일자가 포함된 예약 요청이 필요합니다.' } },
      { status: 400 },
    );
  }

  const saleDate = String((body as { sale_date?: unknown }).sale_date || '');
  const gate = await enterWaitingRoom(request, saleDate);
  if (!gate.allowed) return gate.response;

  return forwardToBackend(request, '/reservation-requests', {
    method: 'POST',
    body,
  });
}
