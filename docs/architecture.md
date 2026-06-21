# 서비스 아키텍처

이 문서는 기존 PC 단독 실행형 예약 시스템을 Cloud Run, Cloud SQL, Secret Manager, Vercel 기반 구조로 옮겼을 때의 전체 그림을 설명합니다.

## 목표 구조

```mermaid
flowchart LR
    U["이용자 모바일 브라우저"] --> FE["Vercel 정적 프론트엔드"]
    A["어드민 모바일/PC 브라우저"] --> FE
    FE --> API["Cloud Run: reservation-api"]
    API --> SQL["Cloud SQL for PostgreSQL"]
    API --> SM["Secret Manager"]
    API -. "향후 방문/OTP 이벤트" .-> BUS["Pub/Sub 또는 Redis 계열 MQ"]
    CB["Cloud Build"] --> AR["Artifact Registry"]
    AR --> API
    CB --> JOB["Cloud Run Job: Alembic migration"]
    JOB --> SQL
```

## 구성 요소

### Vercel 프론트엔드

- Next.js App Router 기반 HTML, CSS, JavaScript를 Vercel로 배포합니다.
- 화면 구성은 `/docs/frontend.md`와 `/docs/api.md`를 기준으로 이 저장소에서 구현합니다.
- API 주소는 Vercel 환경변수 `NEXT_PUBLIC_API_BASE_URL` 또는 정적 JS 설정값으로 관리합니다.

### Cloud Run 백엔드

- Python FastAPI 기반입니다.
- 모든 기능은 API 엔드포인트로 노출됩니다.
- `IS_DEV_MODE=True`일 때만 `/swagger`, `/redoc`, `/openapi.json`이 열립니다.
- 운영에서는 Swagger를 닫아 두고, 문서화된 API 명세를 기준으로 프론트엔드가 연동합니다.

### Cloud SQL for PostgreSQL

- 기존 Excel 파일 DB 역할을 대체합니다.
- Alembic으로 스키마 버전을 관리합니다.
- 이용자 테이블에는 내부 순번 `id`, 카카오 식별자 `kakao_id`, 닉네임 `nickname`, TOTP용 별도 UUID `uuid`가 모두 들어갑니다.

### Secret Manager

다음 값은 Secret Manager에서 Cloud Run 환경변수로 주입합니다.

- `DATABASE_URL`
- `SECRET_KEY`
- `OTP_SECRET_KEY`
- `ADMIN_ID`
- `ADMIN_PASSWORD`
- `KAKAO_REST_API_KEY`
- `KAKAO_CLIENT_SECRET`

### OTP와 메시지 버스

- 현재 OTP는 서버 시간 기반 TOTP counter를 사용합니다.
- QR 값은 `{유저 UUID}:{예약 UUID}:{counter}`를 HMAC 해시한 값입니다.
- 기본 QR 해시는 `md5`, 수동 코드는 `sha1` 앞 12자리입니다.
- `OTP_QR_HASH_ALGORITHM`, `OTP_MANUAL_HASH_ALGORITHM`, `OTP_MANUAL_CODE_LENGTH`로 교체 가능합니다.
- 메시지 버스는 현재 `none` 기본값입니다.
- 향후 `MESSAGE_BUS_BACKEND=pubsub`, `VISIT_EVENT_TOPIC=projects/.../topics/...`를 주면 방문 완료/하루 종료 이벤트를 Pub/Sub로 흘릴 수 있습니다.

## 데이터 흐름

### 예약

```mermaid
sequenceDiagram
    participant User as 이용자
    participant Front as Vercel Frontend
    participant Gateway as Vercel Function
    participant Api as Cloud Run API
    participant Db as Cloud SQL

    User->>Front: 일정/상품 선택
    Front->>Gateway: POST /api/reservation-requests
    Gateway->>Api: POST /reservation-requests
    Api->>Db: 일정, 재고, 시간대, 유저 제한 검증
    Db-->>Api: 현재 예약 현황
    Api->>Db: 예약 요청 큐 처리
    Api-->>Gateway: request_uuid
    Gateway-->>Front: request_uuid
    Front->>Api: GET /reservation-requests/{request_uuid}
    Api-->>Front: 요청 상태와 예약 결과
```

### 방문 확인

```mermaid
sequenceDiagram
    participant User as 이용자
    participant Admin as 어드민
    participant Api as Cloud Run API
    participant Db as Cloud SQL

    User->>Api: GET /users/me/visit-tokens
    Api-->>User: 예약별 QR 해시, 수동 코드
    Admin->>Api: POST /admin/visits/scan
    Api->>Db: 오늘 예약 중 해시 대조
    Api-->>Admin: 예약 상세
    Admin->>Api: POST /admin/visits/complete
    Api->>Db: 방문 완료 기록
```

### 하루 일정 종료

```mermaid
sequenceDiagram
    participant Admin as 어드민
    participant Api as Cloud Run API
    participant Db as Cloud SQL

    Admin->>Api: POST /admin/day-close
    Api->>Db: 해당 일자의 active 예약 조회
    Api->>Db: 미방문 예약은 no_show 처리
    Api->>Db: 유저별 일자당 노쇼 1회 증가
    Api->>Db: 기준 이상 유저 자동 제한
    Api->>Db: business_day_closes에 마감 기록 저장
    Api-->>Admin: 처리 결과
```

서버리스 운영에서는 서버 시작 시 지난 날짜를 자동 마감하지 않습니다. 어드민 메인 화면은 `GET /admin/day-close/pending`으로 마감 기록이 없는 지난 영업일을 보여주고, 관리자가 날짜별로 확인한 뒤 `POST /admin/day-close`를 호출합니다.

## 동시성 기준

- Cloud Run은 요청을 동시에 처리할 수 있으므로 Excel 파일 잠금 방식은 사용하지 않습니다.
- 예약 생성 API는 DB transaction과 row lock을 전제로 설계했습니다.
- PostgreSQL에서는 `SELECT ... FOR UPDATE`가 사용자 중복 예약, 재고, 시간대 정원, 일정 상태를 동시에 수정하는 경쟁 상황을 막습니다.
- 같은 사용자가 같은 날짜 예약 버튼을 동시에 여러 번 눌러도 사용자 행을 먼저 잠그고 기존 예약을 재확인합니다.
- 같은 상품이나 같은 방문 시간대에 여러 사용자가 동시에 예약해도 상품 행과 시간대 행을 잠근 뒤 남은 수량을 다시 계산합니다.
- 방문 완료와 하루 일정 종료도 예약 행을 잠근 뒤 상태를 바꾸므로 같은 예약이 방문 완료와 노쇼로 동시에 처리되지 않도록 설계했습니다.
- 영업일 마감은 `business_day_closes.sale_date` unique 제약으로 중복 마감을 막습니다.
- 프론트엔드 검증은 사용자 편의용이고, 최종 판단은 항상 API와 DB transaction에서 수행합니다.

