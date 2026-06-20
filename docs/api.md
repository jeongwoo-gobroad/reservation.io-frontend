# Reservation API 명세

백엔드 앱은 `reservation_api.main:app`에 있는 FastAPI 앱입니다.

- 개발 모드: `IS_DEV_MODE=True`일 때 `/swagger`, `/redoc`, `/openapi.json` 활성화
- 운영 모드: `IS_DEV_MODE=False`일 때 Swagger/OpenAPI 경로 비활성화
- 인증 방식: `Authorization: Bearer <access_token>`
- 날짜 판단 기준: `APP_TIMEZONE`, 기본 `Asia/Seoul`
- 화면 하단 시간 기준 문구: `DISPLAY_TIMEZONE_LABEL`

## 공통 응답

오류는 FastAPI 기본 형식입니다.

```json
{
  "detail": "예약 가능한 재고가 부족합니다."
}
```

## System

### GET `/health`

서비스 상태 확인용입니다.

```json
{
  "status": "ok",
  "service": "reservation-api",
  "environment": "production"
}
```

## 인증

### POST `/admin/login`

관리자 토큰을 발급합니다. ID/PW는 Cloud Run 환경변수로 주입되며, 운영에서는 Secret Manager 값을 사용합니다.

요청:

```json
{
  "admin_id": "admin",
  "password": "change-me"
}
```

응답:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in_seconds": 43200
}
```

중요 규칙:

- 틀린 ID/PW는 401
- 같은 IP에서 `ADMIN_LOGIN_FAIL_LIMIT`회 이상 실패하면 `ip_bans`에 자동 등록
- 밴 IP는 로그인뿐 아니라 관리자 API 전체가 403으로 차단됨

### POST `/auth/kakao/exchange`

프론트엔드가 카카오 OAuth callback에서 받은 `code`와 동일한 `redirect_uri`를 백엔드에 전달합니다.

백엔드는 카카오 token API와 userinfo API를 호출하고, 최소 식별값인 `kakao_id`만 저장합니다.

요청:

```json
{
  "code": "kakao-oauth-authorization-code",
  "redirect_uri": "https://frontend.example.com/oauth/kakao/callback"
}
```

응답:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in_seconds": 43200,
  "user_uuid": "7f3b7e0a-9f3f-4fa7-94c7-0f49a623e990",
  "kakao_id": "1234567890",
  "nickname": ""
}
```

## 이용자

### GET `/users/me`

현재 로그인한 이용자 정보를 조회합니다.

### PATCH `/users/me/nickname`

닉네임을 저장합니다.

요청:

```json
{
  "nickname": "피카츄트레이너"
}
```

## 판매 일정

### GET `/schedules/open`

이용자 화면에 보여줄 예약 가능 일정 목록입니다.

응답 구조:

```json
[
  {
    "uuid": "schedule-set-uuid",
    "sale_date": "2026-07-01",
    "title": "1차 예약",
    "can_bundle": true,
    "has_time_slots": true,
    "reservation_open": true,
    "products": [
      {
        "uuid": "product-uuid",
        "group_uuid": "group-uuid",
        "group_name": "박스 상품",
        "group_purchase_limit": 1,
        "name": "확장팩 1박스",
        "stock_quantity": 48,
        "stock_remaining": 31,
        "per_user_limit": 1
      }
    ],
    "time_slots": [
      {
        "uuid": "slot-uuid",
        "code": 0,
        "label": "14:00",
        "capacity": 10,
        "remaining_customers": 7
      }
    ]
  }
]
```

중요 규칙:

- 같은 `sale_date`에 여러 `schedule_set`이 존재할 수 있습니다.
- `can_bundle`은 날짜 속성이 아니라 일정별 속성입니다.
- 이용자가 같은 날짜의 여러 일정을 한 번에 예약하려면 선택된 모든 일정의 `can_bundle`이 `true`여야 합니다.
- 프론트엔드는 먼저 안내할 수 있지만, 최종 검증은 `POST /reservations`가 수행합니다.

## 관리자 판매 일정

### GET `/admin/schedules`

관리자용 전체 일정 목록입니다. 닫힌 일정도 포함합니다.

### POST `/admin/schedules`

판매 일정 하나를 생성합니다. 같은 날짜에 여러 일정을 만들 수 있습니다.

```json
{
  "sale_date": "2026-07-01",
  "title": "1차 예약",
  "can_bundle": true,
  "has_time_slots": true,
  "reservation_open": false,
  "time_slots": [
    { "label": "14:00", "capacity": 10 },
    { "label": "14:30", "capacity": 10 }
  ],
  "groups": [
    {
      "name": "박스 상품",
      "purchase_limit": 1,
      "products": [
        {
          "name": "확장팩 1박스",
          "stock_quantity": 48,
          "per_user_limit": 1
        }
      ]
    }
  ]
}
```

### PATCH `/admin/schedules/{schedule_set_uuid}`

일정 이름, 같은 날짜 내 묶음 예약 가능 여부, 예약 오픈 여부를 수정합니다.

### DELETE `/admin/schedules/{schedule_set_uuid}`

일정 하나를 삭제합니다. 프론트엔드는 삭제 전 강한 확인창을 표시해야 합니다.

### POST `/admin/schedule-dates/{sale_date}/open`

같은 날짜에 속한 모든 일정을 예약 가능 상태로 바꿉니다.

### POST `/admin/schedule-dates/{sale_date}/close`

같은 날짜에 속한 모든 일정을 예약 마감 상태로 바꿉니다.

### POST `/admin/schedule-dates/{sale_date}/reset-reservations`

같은 날짜의 현재 예약(`reserved`)을 모두 취소(`cancelled`)합니다.

## 예약

### POST `/reservations`

이용자가 예약을 생성합니다.

요청:

```json
{
  "sale_date": "2026-07-01",
  "items": [
    {
      "schedule_set_uuid": "schedule-set-uuid",
      "product_uuid": "product-uuid",
      "quantity": 1,
      "time_slot_uuid": "slot-uuid"
    }
  ]
}
```

검증:

- 열린 일정인지 확인
- 밴 유저인지 확인
- 같은 날짜에 이미 예약이 있는지 확인
- 여러 일정 묶음 예약 시 모든 일정의 `can_bundle=true` 확인
- 상품별 재고 초과 방지
- 방문 시간대별 최대 고객 수 초과 방지
- 상품별 1인 제한, 상품 그룹 제한 확인
- DB transaction과 row lock으로 동시 예약 경쟁 방어

### GET `/users/me/reservations`

이용자의 현재 예약 목록입니다.

### DELETE `/reservations/{reservation_uuid}`

예약 하나를 취소합니다.

## 방문 확인 OTP

### GET `/users/me/visit-tokens`

오늘 예약에 대한 방문 확인 QR 해시와 수동 코드를 발급합니다.

응답:

```json
[
  {
    "reservation_uuid": "reservation-uuid",
    "qr_hash": "b6fc4c620b67d95f953a5c1c1230aaab",
    "manual_code": "a1b2c3d4e5f6",
    "expires_in_seconds": 18,
    "hash_window": "t-1,t,t+1"
  }
]
```

알고리즘:

- material: `{user_uuid}:{reservation_uuid}:{counter}`
- counter: `floor(server_epoch_seconds / OTP_TIMEOUT_SECOND)`
- QR 기본값: `HMAC-MD5(material, OTP_SECRET_KEY)`
- 수동 코드 기본값: `HMAC-SHA1(material, OTP_SECRET_KEY)` 앞 12자리
- 허용 오차: `OTP_DELTA=1`이면 `t-1`, `t`, `t+1`

## 관리자 방문 확인

### POST `/admin/visits/scan`

QR 해시 또는 수동 코드를 검증합니다.

```json
{
  "token": "b6fc4c620b67d95f953a5c1c1230aaab",
  "token_type": "auto"
}
```

`token_type`:

- `auto`: QR/수동 코드 모두 대조
- `qr`: QR 해시만 대조
- `manual`: 수동 코드만 대조

### POST `/admin/visits/complete`

스캔된 예약을 방문 완료 처리합니다.

```json
{
  "reservation_uuids": ["reservation-uuid"]
}
```

### GET `/admin/visits/recent?offset=0&limit=10`

최근 방문 확인 내역입니다.

`limit` 허용값:

- 5
- 10
- 20
- 30
- 50

## 관리자 예약 조회

### GET `/admin/reservations`

현재 예약(`reserved`) 목록을 조회합니다.

쿼리:

- `sale_date`: 선택
- `nickname`: 선택

예:

```http
GET /admin/reservations?sale_date=2026-07-01&nickname=피카
```

## 영업 마감

서버리스 구조에서는 서버 시작 시 자동 마감을 수행하지 않습니다. 관리자 화면에서 미마감 일자를 확인하고, 날짜별로 수동 마감해야 합니다.

### GET `/admin/day-close/pending`

오늘보다 이전 날짜 중, 일정 또는 예약이 존재하지만 아직 마감 기록이 없는 영업일 목록입니다.

응답:

```json
[
  {
    "sale_date": "2026-07-01",
    "schedule_count": 3,
    "reserved_reservations": 4,
    "visited_reservations": 16,
    "no_show_reservations": 0,
    "cancelled_reservations": 2,
    "expected_no_show_users": 3
  }
]
```

프론트엔드 표시:

- 어드민 메인 화면 상단에 “마감이 필요한 지난 영업일” 영역을 둡니다.
- 각 날짜마다 `마감 처리` 버튼을 둡니다.
- 버튼을 누르면 “미방문 고객은 노쇼 처리됩니다. 정말 마감하시겠습니까?” 확인창을 반드시 표시합니다.

### POST `/admin/day-close`

특정 판매 일자 또는 오늘을 마감합니다.

요청:

```json
{
  "sale_date": "2026-07-01",
  "confirm_no_show": true
}
```

규칙:

- `sale_date`를 비우면 `APP_TIMEZONE` 기준 오늘을 마감합니다.
- 미래 날짜는 마감할 수 없습니다.
- `confirm_no_show=true`가 없으면 400을 반환합니다.
- 이미 마감된 날짜는 409를 반환합니다.
- 아직 `reserved` 상태인 예약은 `no_show`로 바뀝니다.
- 노쇼 횟수는 예약 건당이 아니라 사용자별 판매 일자당 1회만 증가합니다.

응답:

```json
{
  "sale_date": "2026-07-01",
  "closed_at": "2026-07-01T12:10:00Z",
  "processed_reservations": 20,
  "visited_reservations": 16,
  "no_show_users": 3,
  "no_show_reservations": 4,
  "auto_banned_users": 1
}
```

## 유저 제한

### GET `/admin/banned-users`

예약 제한 사용자 목록입니다.

### POST `/admin/banned-users`

수동 제한 추가 또는 수정입니다.

```json
{
  "user_uuid": "7f3b7e0a-9f3f-4fa7-94c7-0f49a623e990",
  "nickname": "피카츄트레이너",
  "reason": "운영자 수동 등록",
  "active": true
}
```

### DELETE `/admin/banned-users/{user_uuid}`

사용자 제한을 비활성화합니다.

## IP 밴

### GET `/admin/ip-bans`

IP 밴 목록입니다.

### POST `/admin/ip-bans`

IP 밴을 추가 또는 수정합니다.

```json
{
  "ip_address": "203.0.113.10",
  "reason": "관리자 로그인 실패 누적",
  "active": true
}
```

### DELETE `/admin/ip-bans/{ip_address}`

IP 밴을 삭제합니다.

## 설정

### GET `/admin/settings/{key}`

관리자 설정 조회입니다.

주요 key:

- `disclaimer_markdown`
- `reservation_agreement_markdown`
- `noshow_ban_threshold`

### PUT `/admin/settings/{key}`

관리자 설정 저장입니다.

```json
{
  "value": "# 안내문\n- 예약 전 확인해 주세요."
}
```

### GET `/settings/{key}`

이용자 화면에서 읽을 수 있는 공개 설정입니다.

허용 key:

- `disclaimer_markdown`
- `reservation_agreement_markdown`
