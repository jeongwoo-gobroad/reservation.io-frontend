import { type NextRequest } from 'next/server';
import { enterWaitingRoom, forwardToBackend, resolveReservationSaleDate } from '@/lib/server/reservationGateway';

interface ReservationRouteContext {
  params: Promise<{
    reservation_uuid: string;
  }>;
}

export async function PATCH(request: NextRequest, context: ReservationRouteContext) {
  const { reservation_uuid: rawReservationUuid } = await context.params;
  const reservationUuid = decodeURIComponent(rawReservationUuid);
  const body = await request.json().catch(() => null);
  const saleDate = await resolveReservationSaleDate(request, reservationUuid);
  const gate = await enterWaitingRoom(request, saleDate);
  if (!gate.allowed) return gate.response;

  return forwardToBackend(request, `/reservations/${encodeURIComponent(reservationUuid)}`, {
    method: 'PATCH',
    body,
  });
}

export async function DELETE(request: NextRequest, context: ReservationRouteContext) {
  const { reservation_uuid: rawReservationUuid } = await context.params;
  const reservationUuid = decodeURIComponent(rawReservationUuid);
  const saleDate = await resolveReservationSaleDate(request, reservationUuid);
  const gate = await enterWaitingRoom(request, saleDate);
  if (!gate.allowed) return gate.response;

  return forwardToBackend(request, `/reservations/${encodeURIComponent(reservationUuid)}`, {
    method: 'DELETE',
  });
}
