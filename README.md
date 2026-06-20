# reservation.io 프론트엔드

예약 시스템 **reservation.io**의 Vercel 배포용 프론트엔드입니다. 이 워크스페이스 자체를 GitHub 저장소로 사용하고, GitHub Actions로 검증한 뒤 Vercel Git 연동으로 Production/Preview 배포를 수행합니다.

## 기술 스택

- Next.js 16.2.9 App Router
- React 19, TypeScript
- Vanilla CSS 디자인 시스템
- `qrcode` 방문 확인 QR 생성
- `html5-qrcode` 관리자 QR 스캔
- `react-markdown` + `remark-gfm` 운영 문구 렌더링
- GitHub Actions + Vercel

## 로컬 개발

필수 버전:

- Node.js 20.19 이상 또는 Node.js 22 LTS 권장
- npm 10 이상

```bash
npm ci
cp .env.example .env.local
npm run dev
```

개발 서버: `http://localhost:3000`

`.env.local`에는 아래 값을 넣습니다.

```text
NEXT_PUBLIC_API_BASE_URL=https://reservation-api-xxxx.a.run.app
NEXT_PUBLIC_KAKAO_REST_API_KEY=your-kakao-rest-api-key
NEXT_PUBLIC_KAKAO_REDIRECT_URI=http://localhost:3000/oauth/kakao/callback
NEXT_PUBLIC_COMPANY_URL=https://your-company.example
NEXT_PUBLIC_DISPLAY_TIMEZONE_LABEL=Seoul, KR
```

`NEXT_PUBLIC_*` 값은 브라우저 번들에 포함되는 공개 값이며, Vercel 빌드 시점 값으로 고정됩니다.

## 주요 경로

이용자:

- `/`: 카카오 로그인
- `/oauth/kakao/callback`: 카카오 OAuth 콜백
- `/nickname`: 최초 닉네임 설정
- `/disclaimer`: 로그인 안내문 확인
- `/schedules`: 예약 가능한 일정
- `/reservations`: 내 예약 및 취소
- `/visit`: 방문 확인증

관리자:

- `/admin/login`: 관리자 로그인
- `/admin`: 관리자 메인, 미마감 영업일, 당일 마감
- `/admin/visits`: QR 스캔, 수동 코드 확인, 최근 확인 내역
- `/admin/schedules`: 판매 일정 생성 및 관리
- `/admin/reservations`: 현재 예약 현황
- `/admin/banned-users`: 노쇼/예약 제한
- `/admin/ip-bans`: IP 제한 관리
- `/admin/settings`: 안내문과 예약 동의 메시지 관리

## 검증 명령

```bash
npm run lint
npm run typecheck
npm run build
```

GitHub Actions도 동일한 흐름으로 `lint -> typecheck -> build`를 실행합니다.

## GitHub 저장소 준비

이 폴더를 그대로 GitHub 저장소로 사용합니다.

```bash
git init
git branch -M main
git add .
git commit -m "Initial reservation.io frontend"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

`.env.local`, `.vercel`, `.next`, `node_modules`는 커밋하지 않습니다.

## Vercel 배포 요약

1. Vercel에서 **Add New... > Project**를 선택합니다.
2. GitHub 저장소를 연결합니다.
3. Framework Preset은 **Next.js**를 사용합니다.
4. Build Command는 `npm run build`, Install Command는 `npm ci`를 사용합니다.
5. Environment Variables에 `.env.example`의 값을 Production/Preview 환경별로 등록합니다.
6. `main` 브랜치 push는 Production 배포, Pull Request는 Preview 배포로 동작합니다.

배포 후 백엔드 Cloud Run CORS에 Vercel 도메인을 추가하고, 카카오 Developers 콘솔에 아래 Redirect URI를 등록합니다.

```text
https://your-domain.vercel.app/oauth/kakao/callback
```

자세한 배포 절차는 [docs/vercel-manual.md](docs/vercel-manual.md)를 참고하십시오.

## 백엔드 연동 체크리스트

- `NEXT_PUBLIC_API_BASE_URL`이 Cloud Run HTTPS URL인지 확인합니다.
- 백엔드 `_CORS_ALLOWED_ORIGINS`에 Vercel Production 도메인 `https://reservation-io.vercel.app`을 추가합니다.
- Preview 배포에서 API 테스트가 필요하면 해당 Preview URL도 CORS 허용 목록에 추가합니다.
- 운영 백엔드는 `IS_DEV_MODE=false`로 Swagger/OpenAPI 경로가 닫혀 있어야 합니다.
- 카카오 Redirect URI는 Vercel 도메인과 정확히 일치해야 합니다.

## 라이선스

Powered by DataMax, © 2026 실용주의 컴퓨팅 연구소.
