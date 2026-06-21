import { NextResponse, type NextRequest } from 'next/server';
import { releaseWaitingRoomLease } from '@/lib/server/reservationGateway';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const saleDate = body && typeof body === 'object' && 'sale_date' in body
    ? String((body as { sale_date?: unknown }).sale_date || '')
    : '';

  if (!saleDate) {
    return NextResponse.json({ released: false });
  }

  const result = await releaseWaitingRoomLease(request, saleDate);
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
