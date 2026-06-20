# 프론트엔드 구현 지침

이 저장소는 Vercel 배포용 프론트엔드 저장소입니다. GitHub Actions로 검증하고, Vercel Git 연동으로 Production/Preview 배포를 운영합니다.

프론트엔드 구현자는 이 문서와 `docs/api.md`를 기준으로 화면을 작성하십시오.

## 공통 원칙

- 이용자 화면은 모바일 우선입니다.
- 관리자 화면은 PC와 모바일을 모두 고려합니다.
- 방문 확인 화면은 관리자 모바일 접근성이 가장 중요합니다.
- 본문 화면에는 `Seoul, KR` 같은 장소로 오해될 수 있는 표현을 넣지 않습니다.
- 시간 기준 표시는 모든 화면 최하단 footer에만 `시간 표시 기준: Seoul, KR` 형태로 둡니다.
- 화면 하단에는 `Powered by DataMax, (c) 2026 실용주의 컴퓨팅 연구소`를 표시합니다.
- `실용주의 컴퓨팅 연구소` 는 환경변수 중 COMPANY_URL을 참고하여 하이퍼링크로 표시합니다.
- 전문용어를 피합니다. `enum`, `record`, `DB`, `GMT` 같은 단어를 관리자 화면에 노출하지 않습니다.
- 화투, 플레잉 카드 등 도박성으로 보이기 쉬운 이모지는 사용을 자제하십시오.
- 삭제, 예약 리셋, 영업 마감처럼 되돌리기 어려운 작업은 확인창을 둡니다.

## 인증과 토큰 보관

- 관리자와 이용자 토큰은 모두 Bearer token입니다.
- 운영 화면에서는 개발용 로그인, 디버그 식별 코드, 카카오 오류 디버그 안내를 표시하지 않습니다.
- 카카오 로그인 완료 후 `POST /auth/kakao/exchange`를 호출합니다.
- 최초 로그인 후 닉네임이 비어 있으면 닉네임 설정 화면으로 보냅니다.

## 이용자 화면

### 1. 로그인

목적:

- 카카오 로그인을 통해 최소 식별값으로 이용자를 식별합니다.

구성:

- 서비스명
- 카카오 로그인 버튼
- footer

API:

- `POST /auth/kakao/exchange`

### 2. 닉네임 설정

목적:

- 최초 로그인 이용자가 닉네임을 정합니다.

API:

- `PATCH /users/me/nickname`

### 3. 로그인 안내문 팝업

목적:

- 관리자가 작성한 안내문을 매 로그인마다 확인시킵니다.

API:

- `GET /settings/disclaimer_markdown`

구성:

- Markdown 렌더링 영역
- “확인했습니다” 체크 또는 버튼

### 4. 예약 가능한 일정

목적:

- 이용자가 날짜, 판매 일정, 상품, 방문 시간을 선택해 예약합니다.

API:

- `GET /schedules/open`
- `POST /reservations`
- `GET /settings/reservation_agreement_markdown`

표시 규칙:

- 같은 날짜 안에 여러 일정이 있을 수 있습니다.
- 일정 제목을 사용자에게 명확히 보여줍니다. 예: `1차 예약`, `박스 예약`
- 방문 시간은 `14:00`처럼 실제 시간만 보여줍니다.
- `code`, `enum`, `schedule_set_uuid` 같은 내부 값은 표시하지 않습니다.
- 재고가 0이면 예약 버튼을 비활성화하고 “재고가 모두 소진되었습니다”를 표시합니다.
- 시간대 정원이 0이면 “이 시간은 예약이 모두 찼습니다”를 표시합니다.

묶음 예약 규칙:

- `can_bundle`은 일정별 속성입니다.
- 같은 날짜의 여러 일정을 함께 예약하려면 선택한 모든 일정의 `can_bundle`이 `true`여야 합니다.
- 하나라도 `false`이면 프론트엔드에서 먼저 안내하고, 최종적으로 API 오류도 그대로 보여줍니다.

예약 전 확인:

- `reservation_agreement_markdown`을 팝업으로 보여줍니다.
- 이용자가 확인한 뒤에만 `POST /reservations`를 호출합니다.

### 5. 내 예약

목적:

- 현재 예약을 확인하고 취소합니다.

API:

- `GET /users/me/reservations`
- `DELETE /reservations/{reservation_uuid}`

표시 규칙:

- 예약 일시는 `예약 일시: 2026-06-06 13:59:08`처럼 표시합니다.
- `예약 일시(Seoul, KR)`처럼 본문에 장소명을 넣지 않습니다.
- 방문 시간은 `방문 시간 14:00`처럼 실제 시간만 표시합니다.

### 6. 방문 확인증

목적:

- 이용자가 현장에서 QR을 관리자에게 보여줍니다.
- QR 인식이 어려울 때만 별도 API로 수동 코드를 발급합니다.

API:

- `GET /users/me/visit-tokens`
- `POST /users/me/visit-manual-code`

구성:

- 예약별 QR과 상품명
- “QR코드 인식이 어려워요(수동 코드 생성)” 헬퍼 버튼
- 버튼 클릭 후 표시되는 수동 코드 12자리
- 다음 코드 갱신까지 남은 시간을 보여주는 하단 게이지

주의:

- QR은 서버 시간 기준 TOTP입니다.
- 기본 갱신 주기는 30초입니다.
- 프론트엔드는 `expires_in_seconds`를 이용해 게이지를 갱신합니다.
- 방문 확인증 화면에 있을 때만 QR 갱신 API를 호출합니다.

## 관리자 화면

### 1. 관리자 로그인

API:

- `POST /admin/login`

UX:

- ID/PW 입력
- 실패 메시지
- 반복 실패에 대한 IP 차단 안내는 표시하지 않습니다.
- 과도한 반복 요청은 Vercel Proxy + Redis에서 처리합니다.

### 2. 관리자 메인

목적:

- 관리자가 해야 할 일을 한 화면에서 파악합니다.

필수 영역:

- 마감이 필요한 지난 영업일
- 방문 확인
- 판매 일정 만들기
- 현재 예약 현황
- 노쇼/예약 제한
- 안내문 관리
- 예약 동의 메시지 관리
- 당일 영업 마감

미마감 영업일 영역:

- `GET /admin/day-close/pending`을 호출합니다.
- 목록이 비어 있으면 “마감이 필요한 지난 영업일이 없습니다”를 표시합니다.
- 목록이 있으면 날짜별로 아래 정보를 표시합니다.
  - 판매 일자
  - 일정 수
  - 아직 방문 완료되지 않은 예약 수
  - 노쇼 처리 예상 고객 수
  - `마감 처리` 버튼

지난 영업일 마감 버튼:

- 버튼 클릭 시 확인창을 띄웁니다.
- 확인창 문구는 반드시 다음 의미를 포함합니다.
  - “미방문 고객은 노쇼 처리됩니다.”
  - “이 작업은 해당 날짜를 마감 완료로 기록합니다.”
  - “정말 마감하시겠습니까?”
- 확인 후 `POST /admin/day-close`를 호출합니다.

요청 예:

```json
{
  "sale_date": "2026-07-01",
  "confirm_no_show": true
}
```

당일 영업 마감:

- 관리자 메인 하단 또는 별도 메뉴에 유지합니다.
- 같은 확인창을 사용합니다.
- 오늘 날짜를 보내지 않거나, 오늘 날짜를 명시해 `confirm_no_show=true`로 호출합니다.

### 3. 방문 확인

API:

- `POST /admin/visits/scan`
- `POST /admin/visits/complete`
- `GET /admin/visits/recent?offset=0&limit=10`

구성:

- QR 스캔 시작
- 수동 코드 입력
- 스캔 결과 예약 목록
- 제공 완료 버튼
- 최근 확인 내역
- `이전 n개 더 불러오기` 버튼
- n 선택 드롭다운: 5, 10, 20, 30, 50, 기본 10

중요:

- 스캔 직후 바로 다음 스캔 화면으로 돌아가도 최근 확인 내역에서 복구할 수 있어야 합니다.
- 관리자 화면은 스캔 결과를 팝업으로만 보여주지 말고, 예약 상세 화면을 유지해야 합니다.

### 4. 판매 일정 만들기

API:

- `GET /admin/schedules`
- `POST /admin/schedules`
- `PATCH /admin/schedules/{schedule_set_uuid}`
- `DELETE /admin/schedules/{schedule_set_uuid}`
- `POST /admin/schedule-dates/{sale_date}/open`
- `POST /admin/schedule-dates/{sale_date}/close`
- `POST /admin/schedule-dates/{sale_date}/reset-reservations`

구성:

- 판매 날짜
- 판매 일정 이름
- 체크박스 묶음
  - 방문 시간을 나누어 받기
  - 같은 일자 내 다른 일정과 함께 예약 가능
  - 바로 예약 받기
- 방문 시간 추가 UI
  - 시간 선택 input
  - 시간대별 최대 고객 수
- 상품 그룹
  - 그룹 이름
  - 그룹 내 구매 제한
  - 상품 이름
  - 총 재고
  - 1인 제한

표현:

- `enum`, `코드`, `0`, `1` 같은 내부 용어를 표시하지 않습니다.
- 관리자는 시간을 직접 고릅니다.
- 내부 코드는 프론트엔드/백엔드가 알아서 처리합니다.

### 5. 현재 예약 현황

API:

- `GET /admin/reservations`

구성:

- 날짜 필터
- 닉네임 검색
- 날짜별/일정별/상품별 그룹 표시

### 6. 노쇼/예약 제한

API:

- `GET /admin/banned-users`
- `POST /admin/banned-users`
- `DELETE /admin/banned-users/{user_uuid}`
- `GET /admin/settings/noshow_ban_threshold`
- `PUT /admin/settings/noshow_ban_threshold`

규칙:

- 노쇼 횟수는 예약 건당이 아니라 판매 일자당 1회입니다.
- 같은 날짜에 여러 상품을 예약하고 오지 않아도 노쇼는 1회만 증가합니다.

### 7. IP 관리 비활성 안내

상태:

- DB 기반 IP 밴은 사용하지 않습니다.
- `/admin/ip-bans` 화면은 호환용 비활성 안내만 표시합니다.
- 반복 요청 차단은 Vercel Proxy + Redis Sliding Window Counter가 처리합니다.

구성:

- 비활성 안내
- 프록시 기반 방어 설명
- 사용자 기준 예약 제한 메뉴 안내

### 8. 안내문과 예약 동의 메시지 관리

API:

- `GET /admin/settings/disclaimer_markdown`
- `PUT /admin/settings/disclaimer_markdown`
- `GET /admin/settings/reservation_agreement_markdown`
- `PUT /admin/settings/reservation_agreement_markdown`

구성:

- Markdown 입력
- 미리보기
- 저장 버튼

## API 오류 표시 원칙

- 백엔드의 `detail` 메시지를 이용자가 이해할 수 있는 위치에 표시합니다.
- 401이면 로그인 화면으로 보냅니다.
- 403이면 권한 없음, 예약 제한, IP 차단 중 어떤 상황인지 문맥에 맞게 안내합니다.
- 409는 이미 처리된 작업입니다. 예: 이미 마감된 영업일
- 422는 입력 형식 오류입니다. 해당 입력칸 아래에 표시합니다.
