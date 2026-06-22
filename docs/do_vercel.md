# Vercel 운영 설정 가이드

이 프론트엔드는 브라우저의 API 요청을 `/api/backend/*`로 받습니다. Vercel의 Proxy가 먼저 Redis 기반 Sliding Window Counter Rate Limit을 검사하고, 통과한 요청만 Rewrite를 통해 실제 Cloud Run API로 전달합니다.

참고 문서:

- Vercel Redis: https://vercel.com/docs/redis
- Vercel Marketplace Storage: https://vercel.com/docs/marketplace-storage
- Vercel Upstash Redis Rate Limit 예시: https://vercel.com/templates/next.js/ratelimit-with-upstash-redis
- Next.js Proxy: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`

## 1. Redis 연결

1. Vercel Dashboard에서 프로젝트를 엽니다.
2. 상단 팀/계정이 올바른지 확인합니다.
3. `Storage` 또는 `Marketplace`에서 Redis를 생성합니다.
4. 제공자로는 Vercel Marketplace의 Upstash Redis를 선택합니다.
5. 생성한 Redis를 이 프로젝트에 연결합니다.
6. 연결 후 Vercel이 주입한 환경변수에 `REDIS_URL`이 있는지 확인합니다.

현재 Vercel Redis 가이드는 `REDIS_URL`과 `redis` 패키지를 안내합니다. 예전 Vercel KV/Upstash REST 이름으로 연결된 프로젝트라면 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 또는 `KV_REST_API_URL`, `KV_REST_API_TOKEN`만 있을 수 있습니다. 현재 코드는 두 방식을 모두 지원합니다.

## 2. 환경변수 설정

Vercel Dashboard의 `Settings` > `Environment Variables`에서 아래 값을 설정합니다.

| 이름 | 값 |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/backend` |
| `API_REWRITE_ORIGIN` | 실제 API 서버 주소. 예: `https://reservation-api-881902730598.asia-northeast3.run.app` |
| `BACKEND_API_BASE_URL` | 예약 변이 Vercel 함수가 호출할 실제 API 서버 주소. 보통 `API_REWRITE_ORIGIN`과 같은 값 |
| `RESERVATION_GATEWAY_SECRET` | Cloud Run 백엔드가 예약 변이 요청의 Vercel 경유 여부를 검증할 서버 전용 비밀값 |
| `BACKEND_FETCH_TIMEOUT_MS` | Vercel Function이 Cloud Run 응답을 기다리는 최대 시간. 기본 `15000` |
| `WAITING_ROOM_ENABLED` | 대기실을 켜려면 `true` |
| `WAITING_ROOM_MAX_ACTIVE` | 판매일별 동시에 Cloud Run으로 통과시킬 예약 변이 요청 수. 예: `80` |
| `WAITING_ROOM_LEASE_SECONDS` | 통과권 TTL. 예: `45` |
| `WAITING_ROOM_POLL_SECONDS` | 대기 중 브라우저 재시도 간격. 예: `3` |
| `RATE_LIMIT_COUNTER` | Sliding Window Counter 기준 1초당 허용할 요청 수. 예: `8` |
| `RATE_LIMIT_IP_COUNTER` | Authorization 값 회전 우회를 막기 위한 IP/API 보조 제한. 기본은 `RATE_LIMIT_COUNTER * 5` |
| `REDIS_URL` | Vercel Redis 연결 후 자동 주입된 값 |
| `UPSTASH_REDIS_REST_URL` | Upstash REST 방식일 때만 필요 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST 방식일 때만 필요 |

기존 `NEXT_PUBLIC_API_BASE_URL`이 Cloud Run 주소로 직접 들어가 있으면 Vercel Proxy를 우회합니다. 반드시 `/api/backend`로 바꾸십시오.

## 3. Rewrite와 Proxy 동작

코드에서 이미 설정되어 있습니다.

- `src/proxy.ts`: `/api/backend/:path*`, `/api/reservation-requests/:path*`, `/api/reservations/:path*`, `/api/waiting-room/:path*`, `/api/admin/schedule-dates/:path*`, `/static/personal.md` 요청을 대상으로 Redis Sliding Window Counter를 적용합니다.
- 기본 제한은 `(Authorization 토큰 해시, IP, API)` 트리플이고, Authorization 값 회전 우회를 줄이기 위해 `(IP, API)` 보조 제한도 함께 적용합니다.
- `next.config.ts`: `/api/backend/:path*` 요청을 `API_REWRITE_ORIGIN/:path*`로 전달합니다.
- `src/app/api/admin/schedule-dates/[sale_date]/[action]/route.ts`: 어드민 판매 일자 오픈/마감 후 Cloud Run 응답의 `waiting_room_sync`를 읽어 Redis `wr:open:{sale_date}`를 자동 동기화합니다.
- `src/app/api/reservation-requests/route.ts`: 예약 생성 요청을 대기실 검사 후 Cloud Run `POST /reservation-requests`로 전달합니다.
- `src/app/api/reservations/[reservation_uuid]/route.ts`: 예약 수정/취소 요청을 대기실 검사 후 Cloud Run `PATCH/DELETE /reservations/{reservation_uuid}`로 전달합니다.

사용자 식별자는 브라우저가 보내는 `Authorization: Bearer ...` 토큰을 해시한 값입니다. 로그인 전 요청은 `anon`으로 묶이며, IP와 API 경로가 함께 들어가므로 로그인/공개 API에도 최소 방어가 적용됩니다.

알고리즘:

- 윈도우 크기: 1초
- Redis 키: 현재 1초 버킷과 직전 1초 버킷을 저장합니다.
- 계산식: `현재 버킷 요청 수 + 직전 버킷 요청 수 * 직전 버킷 가중치`
- 직전 버킷 가중치: 현재 1초 윈도우에서 남은 비율입니다.
- 응답 헤더: `x-ratelimit-algorithm: sliding-window-counter`
- 연결 확인 헤더: `x-ratelimit-store: redis-url` 또는 `x-ratelimit-store: upstash-rest`

이 방식은 단순 고정 윈도우보다 경계 시점의 순간 버스트를 줄이면서, Vercel Proxy와 Redis 환경에서 Lua 스크립트 없이 안정적으로 동작합니다.

## 4. 판매 일자 오픈/마감과 대기실 동기화

어드민 화면의 판매 일자 열기/닫기 버튼은 Cloud Run을 직접 호출하지 않고 Vercel Function을 거칩니다.

- 열기: `POST /api/admin/schedule-dates/{sale_date}/open`
- 닫기: `POST /api/admin/schedule-dates/{sale_date}/close`

Vercel Function은 다음 순서로 동작합니다.

1. 어드민 `Authorization` 헤더를 Cloud Run으로 전달합니다.
2. Cloud Run `/admin/schedule-dates/{sale_date}/open` 또는 `/close`를 호출합니다.
3. Cloud Run 응답이 실패하면 Redis를 건드리지 않고 오류를 그대로 반환합니다.
4. 성공 응답의 `waiting_room_sync`를 읽습니다.
5. `desired_open=true`이면 `SET wr:open:{sale_date} 1`을 실행합니다.
6. `delete_key=true`이면 `DEL wr:open:{sale_date}`를 실행합니다.
7. Redis 동기화 결과를 `waiting_room_synced`, `waiting_room_sync_error`로 어드민 화면에 함께 반환합니다.

따라서 운영자가 Vercel Redis 콘솔에서 `wr:open:{sale_date}`를 수동으로 만들 필요는 없습니다. Redis 장애 등으로 동기화가 실패한 경우에는 어드민 화면에 부분 성공 안내가 표시되며, 같은 판매 일자 열기/닫기 버튼을 다시 눌러 재동기화할 수 있습니다.

## 5. 예약 대기실 설정

예약 생성, 수정, 취소는 브라우저가 Cloud Run을 직접 호출하지 않고 Vercel 함수로 들어옵니다.

- 생성: `POST /api/reservation-requests`
- 수정: `PATCH /api/reservations/{reservation_uuid}`
- 취소: `DELETE /api/reservations/{reservation_uuid}`

Vercel 함수는 다음 순서로 동작합니다.

1. `WAITING_ROOM_ENABLED=true`인지 확인합니다.
2. Redis에서 `wr:open:{sale_date}` 값이 `1`, `true`, `open`, `enabled` 중 하나인지 확인합니다.
3. 이미 `wr:lease:{sale_date}:{user}`가 있으면 바로 통과합니다.
4. 없으면 `wr:queue:{sale_date}`에 사용자를 넣고, `wr:active:{sale_date}`의 활성 사용자 수가 `WAITING_ROOM_MAX_ACTIVE`보다 작으면 통과권을 발급합니다.
5. 통과하지 못하면 HTTP 202와 대기 순번, 재시도 초를 반환합니다.

Redis 키:

- `wr:open:{sale_date}`: 해당 판매일 대기실 활성 플래그. 어드민 열기/닫기 Vercel Function이 자동으로 SET/DEL합니다.
- `wr:queue:{sale_date}`: 대기열 Sorted Set
- `wr:active:{sale_date}`: 활성 통과권 Sorted Set. score는 만료 시각입니다.
- `wr:lease:{sale_date}:{user}`: 통과권 TTL 키

이 값이 없으면 예약 변이 요청은 대기실 없이 바로 Cloud Run으로 전달됩니다. 이는 닫힌 날짜나 동기화되지 않은 날짜에서 대기실을 임의로 열지 않기 위한 기본값입니다.

## 6. 배포

1. GitHub에 변경 사항을 push합니다.
2. Vercel 프로젝트가 GitHub 저장소와 연결되어 있는지 확인합니다.
3. Production 배포를 실행합니다.
4. 배포 로그에서 `npm install`, `next build`가 통과하는지 확인합니다.
5. 로컬과 Vercel 모두 Node.js 20.19 이상을 사용하도록 맞춥니다.

## 7. 검증

1. 배포된 사이트에서 개발자 도구 Network 탭을 엽니다.
2. 예약 목록, 내 예약, 방문 확인증 요청 URL이 `/api/backend/...`로 나가는지 확인합니다.
3. 예약 생성 요청은 `/api/reservation-requests`, 예약 수정/취소 요청은 `/api/reservations/{reservation_uuid}`로 나가는지 확인합니다.
4. 어드민 판매 일정 관리에서 날짜 열기/닫기 요청이 `/api/admin/schedule-dates/{sale_date}/open|close`로 나가는지 확인합니다.
5. 날짜 열기 성공 후 응답에 `waiting_room_synced: true`가 있고 Redis에 `wr:open:{sale_date}` 값이 생기는지 확인합니다.
6. 날짜 닫기 성공 후 응답에 `waiting_room_synced: true`가 있고 Redis에서 `wr:open:{sale_date}`가 삭제되는지 확인합니다.
7. 응답 헤더에 `x-ratelimit-algorithm: sliding-window-counter`가 있는지 확인합니다.
8. `x-ratelimit-store: redis-url`이면 Vercel Redis의 `REDIS_URL` 연결이 적용된 상태입니다.
9. 같은 API를 Sliding Window Counter 기준 1초 안에 `RATE_LIMIT_COUNTER`보다 많이 호출하면 HTTP `429`와 `rate_limited` 응답이 나와야 합니다.
10. Authorization 값을 바꿔 보내더라도 같은 IP/API 요청이 `RATE_LIMIT_IP_COUNTER`를 넘으면 HTTP `429`가 나와야 합니다.
11. `/privacy` 페이지가 내부적으로 `GET /static/personal.md`를 호출하고 Markdown 원문을 표시하는지 확인합니다.
12. `WAITING_ROOM_ENABLED=true`이고 열린 판매일에서 예약 요청이 많으면 HTTP 202 대기실 응답 후 같은 idempotency key로 재시도되는지 확인합니다.
13. 대기실 응답에 `position`이 있으면 이용자 화면에 “현재 대기 순번은 n번입니다”가 표시되어야 합니다.
14. 정상 사용 중 429가 잦으면 `RATE_LIMIT_COUNTER`와 `RATE_LIMIT_IP_COUNTER`를 함께 조정하고 재배포합니다.

## 8. 운영 메모

- Vercel Redis가 연결되지 않은 Preview 환경에서는 Rate Limit이 자동으로 통과됩니다.
- 수동 코드 발급은 `/users/me/visit-manual-code`를 누를 때만 호출되므로 Firestore 읽기/쓰기 부담이 줄어듭니다.
- Cloud Run 백엔드는 더 이상 브라우저 Origin을 직접 받지 않아도 되지만, 운영 중 직접 호출 경로를 남길 경우 CORS 허용 Origin을 별도로 관리해야 합니다.
