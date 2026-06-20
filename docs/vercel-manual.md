# Vercel 프론트엔드 배포 가이드

이 문서는 이 워크스페이스를 GitHub 저장소로 만들고, Vercel에 연결해 프론트엔드 CI/CD를 운영하는 절차입니다.

## 1. 저장소 기준

현재 폴더가 프론트엔드 저장소입니다.

- Next.js 16 App Router 프로젝트입니다.
- GitHub Actions는 코드 검증용입니다.
- 실제 배포는 Vercel의 Git 연동이 담당합니다.
- `main` 브랜치 push는 Production 배포가 됩니다.
- Pull Request는 Preview 배포가 됩니다.

권장 브랜치 흐름:

1. 작업 브랜치 생성
2. Pull Request 생성
3. GitHub Actions 검증 통과
4. Vercel Preview URL 확인
5. `main` 병합
6. Vercel Production 자동 배포 확인

## 2. 로컬 준비

Node.js는 20.19 이상 또는 22 LTS를 사용하십시오. 이 저장소에는 `.nvmrc`가 있으므로 nvm을 쓰면 다음처럼 맞출 수 있습니다.

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

로컬 카카오 로그인을 테스트하려면 카카오 Developers 콘솔에 아래 URI도 등록합니다.

```text
http://localhost:3000/oauth/kakao/callback
```

## 3. GitHub 저장소 만들기

```bash
git init
git branch -M main
git add .
git commit -m "Initial reservation.io frontend"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

커밋하지 말아야 할 항목:

- `.env.local`
- `.env.production.local`
- `.vercel`
- `.next`
- `node_modules`

## 4. GitHub Actions

워크플로 파일은 `.github/workflows/ci.yml`입니다.

검증 항목:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Next.js CI 캐시는 `.next/cache`를 사용합니다. Vercel 배포 캐시는 Vercel이 별도로 관리하므로 추가 설정이 필요 없습니다.

## 5. Vercel 프로젝트 연결

1. [Vercel](https://vercel.com)에 로그인합니다.
2. **Add New... > Project**를 선택합니다.
3. GitHub 저장소를 선택합니다.
4. Framework Preset은 **Next.js**로 둡니다.
5. Install Command: `npm ci`
6. Build Command: `npm run build`
7. Output Directory는 비워둡니다. Next.js preset이 자동 처리합니다.
8. 환경변수를 등록합니다.

필수 환경변수:

| 변수명 | 설명 | 예시 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | 브라우저 API 진입점 | `/api/backend` |
| `API_REWRITE_ORIGIN` | Cloud Run 백엔드 주소 | `https://reservation-api-xxxx.a.run.app` |
| `RATE_LIMIT_COUNTER` | Sliding Window Counter 기준 1초당 사용자/IP/API 조합 요청 제한 수 | `8` |
| `UPSTASH_REDIS_REST_URL` | Vercel Redis 연결 URL | Vercel Redis 연결 후 자동 주입 |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel Redis 연결 토큰 | Vercel Redis 연결 후 자동 주입 |
| `NEXT_PUBLIC_KAKAO_REST_API_KEY` | 카카오 REST API 키 | `abc123...` |
| `NEXT_PUBLIC_KAKAO_REDIRECT_URI` | 카카오 OAuth 콜백 | `https://your-domain.vercel.app/oauth/kakao/callback` |
| `NEXT_PUBLIC_COMPANY_URL` | 푸터 회사 링크 | `https://your-company.example` |
| `NEXT_PUBLIC_DISPLAY_TIMEZONE_LABEL` | 푸터 시간 기준 라벨 | `Seoul, KR` |

주의:

- `NEXT_PUBLIC_*` 값은 빌드 시점에 브라우저 번들에 포함됩니다.
- `NEXT_PUBLIC_API_BASE_URL`이 Cloud Run 주소를 직접 가리키면 Vercel Proxy Rate Limit을 우회합니다.
- Production과 Preview 환경변수를 각각 확인하십시오.
- 백엔드 비밀값은 이 프론트엔드 저장소나 Vercel 공개 환경변수에 넣지 않습니다.
- Redis와 Rate Limit 설정의 자세한 절차는 `docs/do_vercel.md`를 따르십시오.

## 6. 백엔드 CORS 설정

Vercel Production 배포가 끝나면 도메인이 생깁니다.

```text
https://your-domain.vercel.app
```

이 값을 백엔드 Cloud Build substitution 또는 Cloud Run 환경설정의 CORS 허용 목록에 추가합니다.

```text
_CORS_ALLOWED_ORIGINS=https://your-domain.vercel.app
```

Preview URL에서 백엔드를 직접 테스트할 경우 해당 Preview URL도 허용 목록에 넣어야 합니다. 쿠키나 인증 헤더를 쓰는 요청에서는 임의 와일드카드보다 정확한 Origin 목록을 권장합니다.

현재 Production 도메인을 쓰는 경우 백엔드에는 최소한 아래 Origin이 들어가야 합니다.

```text
_CORS_ALLOWED_ORIGINS=https://reservation-io.vercel.app
```

관리자 로그인에서 `Failed to fetch`가 보이면 브라우저가 백엔드 응답을 받기 전에 CORS preflight에서 막힌 것입니다. Cloud Run 백엔드가 `Disallowed CORS origin`을 반환하는지 먼저 확인하십시오.

## 7. 카카오 Redirect URI

카카오 Developers 콘솔에서 운영 콜백 URI를 등록합니다.

```text
https://your-domain.vercel.app/oauth/kakao/callback
```

프론트엔드는 이 URI에서 받은 `code`와 같은 `redirect_uri`를 백엔드 `POST /auth/kakao/exchange`로 보냅니다. Vercel 환경변수 `NEXT_PUBLIC_KAKAO_REDIRECT_URI`와 카카오 콘솔 값이 정확히 같아야 합니다.

## 8. 배포 후 점검

1. Vercel Production URL을 엽니다.
2. 카카오 로그인 버튼이 보이는지 확인합니다.
3. 관리자 로그인 화면 `/admin/login`에 접근되는지 확인합니다.
4. 브라우저 Network 탭에서 API 요청이 Cloud Run URL로 가는지 확인합니다.
5. CORS 오류가 있으면 백엔드 허용 Origin을 확인합니다.
6. `/admin/visits`에서 QR 스캔을 쓸 경우 브라우저 카메라 권한을 허용합니다.
7. 운영 백엔드는 `IS_DEV_MODE=false`로 둡니다.

## 9. 운영 롤백

Vercel Dashboard의 Deployments에서 직전 정상 배포를 선택해 **Promote to Production**을 실행하면 빠르게 되돌릴 수 있습니다. 코드상 되돌림이 필요하면 GitHub에서 revert commit을 만들고 `main`에 병합합니다.
