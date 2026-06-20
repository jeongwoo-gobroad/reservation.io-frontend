export interface Product {
  uuid: string;
  group_uuid?: string;
  group_name?: string;
  group_purchase_limit?: number;
  name: string;
  stock_quantity?: number;
  stock_remaining: number;
  per_user_limit?: number;
}

export interface TimeSlot {
  uuid: string;
  code?: number;
  label: string;
  capacity?: number;
  remaining_customers: number;
}

export interface Schedule {
  uuid: string;
  sale_date: string;
  title: string;
  can_bundle: boolean;
  has_time_slots: boolean;
  reservation_open: boolean;
  products: Product[];
  time_slots: TimeSlot[];
}

export interface ReservationItem {
  schedule_set_uuid?: string;
  schedule_title?: string;
  product_uuid?: string;
  product_name?: string;
  group_name?: string;
  quantity?: number;
  time_slot_uuid?: string;
  time_slot_label?: string;
}

export interface UserReservation {
  uuid?: string;
  reservation_uuid?: string;
  sale_date?: string;
  schedule_title?: string;
  product_name?: string;
  group_name?: string;
  quantity?: number;
  time_slot_label?: string;
  created_at?: string;
  reserved_at?: string;
  status?: string;
  items?: ReservationItem[];
}

export interface VisitToken {
  reservation_uuid: string;
  qr_hash: string;
  manual_code: string;
  expires_in_seconds: number;
  hash_window?: string;
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
}

export interface PendingDayClose {
  sale_date: string;
  schedule_count: number;
  reserved_reservations: number;
  visited_reservations: number;
  no_show_reservations: number;
  cancelled_reservations: number;
  expected_no_show_users: number;
}

export interface DayCloseResult {
  sale_date: string;
  closed_at?: string;
  processed_reservations?: number;
  visited_reservations?: number;
  no_show_users?: number;
  no_show_reservations?: number;
  auto_banned_users?: number;
}

export interface AdminReservation {
  uuid?: string;
  reservation_uuid?: string;
  sale_date?: string;
  nickname?: string;
  user_uuid?: string;
  schedule_title?: string;
  product_name?: string;
  group_name?: string;
  quantity?: number;
  time_slot_label?: string;
  status?: string;
  created_at?: string;
  reserved_at?: string;
  visited_at?: string;
  items?: ReservationItem[];
}

export interface VisitScanResult {
  nickname?: string;
  user_uuid?: string;
  reservations?: AdminReservation[];
  reservation?: AdminReservation;
  items?: AdminReservation[];
  detail?: string;
}

export interface RecentVisit {
  reservation_uuid?: string;
  sale_date?: string;
  nickname?: string;
  product_name?: string;
  schedule_title?: string;
  time_slot_label?: string;
  visited_at?: string;
  completed_at?: string;
  items?: ReservationItem[];
}

export interface BannedUser {
  user_uuid: string;
  nickname?: string;
  reason?: string;
  active?: boolean;
  no_show_count?: number;
  created_at?: string;
}

export interface IpBan {
  ip_address: string;
  reason?: string;
  active?: boolean;
  created_at?: string;
}

export interface SettingValue {
  value: string;
}

export interface ScheduleDraftProduct {
  name: string;
  stock_quantity: number;
  per_user_limit: number;
}

export interface ScheduleDraftGroup {
  name: string;
  purchase_limit: number;
  products: ScheduleDraftProduct[];
}

export interface ScheduleDraftTimeSlot {
  label: string;
  capacity: number;
}

export interface ScheduleDraft {
  sale_date: string;
  title: string;
  can_bundle: boolean;
  has_time_slots: boolean;
  reservation_open: boolean;
  time_slots: ScheduleDraftTimeSlot[];
  groups: ScheduleDraftGroup[];
}
