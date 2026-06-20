export function formatSaleDate(value?: string): string {
  if (!value) return '-';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${year}.${month}.${day}`;
}

export function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').replace('Z', '');

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function compactNumber(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function toQueryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export function reservationKey(reservation: { uuid?: string; reservation_uuid?: string }): string {
  return reservation.reservation_uuid || reservation.uuid || '';
}
