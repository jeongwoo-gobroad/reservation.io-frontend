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
| `RATE_LIMIT_COUNTER` | Sliding Window Counter 기준 1초당 허용할 요청 수. 예: `8` |
| `REDIS_URL` | Vercel Redis 연결 후 자동 주입된 값 |
| `UPSTASH_REDIS_REST_URL` | Upstash REST 방식일 때만 필요 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST 방식일 때만 필요 |

기존 `NEXT_PUBLIC_API_BASE_URL`이 Cloud Run 주소로 직접 들어가 있으면 Vercel Proxy를 우회합니다. 반드시 `/api/backend`로 바꾸십시오.

## 3. Rewrite와 Proxy 동작

코드에서 이미 설정되어 있습니다.

- `src/proxy.ts`: `/api/backend/:path*` 요청을 대상으로 `(사용자, IP, API)` 트리플을 Redis Sliding Window Counter로 카운트합니다.
- `next.config.ts`: `/api/backend/:path*` 요청을 `API_REWRITE_ORIGIN/:path*`로 전달합니다.

사용자 식별자는 브라우저가 보내는 `Authorization: Bearer ...` 토큰을 해시한 값입니다. 로그인 전 요청은 `anon`으로 묶이며, IP와 API 경로가 함께 들어가므로 로그인/공개 API에도 최소 방어가 적용됩니다.

알고리즘:

- 윈도우 크기: 1초
- Redis 키: 현재 1초 버킷과 직전 1초 버킷을 저장합니다.
- 계산식: `현재 버킷 요청 수 + 직전 버킷 요청 수 * 직전 버킷 가중치`
- 직전 버킷 가중치: 현재 1초 윈도우에서 남은 비율입니다.
- 응답 헤더: `x-ratelimit-algorithm: sliding-window-counter`
- 연결 확인 헤더: `x-ratelimit-store: redis-url` 또는 `x-ratelimit-store: upstash-rest`

이 방식은 단순 고정 윈도우보다 경계 시점의 순간 버스트를 줄이면서, Vercel Proxy와 Redis 환경에서 Lua 스크립트 없이 안정적으로 동작합니다.

## 4. 배포

1. GitHub에 변경 사항을 push합니다.
2. Vercel 프로젝트가 GitHub 저장소와 연결되어 있는지 확인합니다.
3. Production 배포를 실행합니다.
4. 배포 로그에서 `npm install`, `next build`가 통과하는지 확인합니다.
5. 로컬과 Vercel 모두 Node.js 20.19 이상을 사용하도록 맞춥니다.

## 5. 검증

1. 배포된 사이트에서 개발자 도구 Network 탭을 엽니다.
2. 예약 목록, 내 예약, 방문 확인증 요청 URL이 `/api/backend/...`로 나가는지 확인합니다.
3. 응답 헤더에 `x-ratelimit-algorithm: sliding-window-counter`가 있는지 확인합니다.
4. `x-ratelimit-store: redis-url`이면 Vercel Redis의 `REDIS_URL` 연결이 적용된 상태입니다.
5. 같은 API를 Sliding Window Counter 기준 1초 안에 `RATE_LIMIT_COUNTER`보다 많이 호출하면 HTTP `429`와 `rate_limited` 응답이 나와야 합니다.
6. 정상 사용 중 429가 잦으면 `RATE_LIMIT_COUNTER`를 올리고 재배포합니다.

## 6. 운영 메모

- Vercel Redis가 연결되지 않은 Preview 환경에서는 Rate Limit이 자동으로 통과됩니다.
- 수동 코드 발급은 `/users/me/visit-manual-code`를 누를 때만 호출되므로 Firestore 읽기/쓰기 부담이 줄어듭니다.
- Cloud Run 백엔드는 더 이상 브라우저 Origin을 직접 받지 않아도 되지만, 운영 중 직접 호출 경로를 남길 경우 CORS 허용 Origin을 별도로 관리해야 합니다.
