# 여행 플래너

Claude(claude-opus-5-5)를 이용한 여행 계획 웹앱.

1. **여행지 추천** — 여행 스타일 + 기간 → 국내 3곳 / 해외 3곳 추천 (카드의 "이 여행지로 루트 짜기"로 ②에 바로 연결)
2. **상세 루트** — 대략적인 루트 + 기간 + 이동 수단 → 일자별·시간대별 상세 일정
   - 결과 아래 입력창으로 **수정·추가 요청** (예: "둘째 날 오후에 카페 추가") → 전체 루트를 다시 맞춰 주고 바뀐 점을 요약, 이전 버전으로 되돌리기 가능
3. **지역 상세** — 루트 결과의 📍지역 버튼 클릭 → 추천 숙소·맛집·관광 스팟 (한 번 불러온 지역은 캐시)

## 지도 · 실제 장소 확인 (선택)

지역 상세에서 AI가 추천한 장소를 실제 지도 데이터로 확인하고, 주소·전화·별점과 함께 지도에 핀으로 표시합니다.

| 환경변수 | 용도 | 발급 |
|---|---|---|
| `KAKAO_REST_API_KEY` | 국내 장소 검색 | [Kakao Developers](https://developers.kakao.com) → 애플리케이션 추가 → **앱 키 → REST API 키**, **카카오맵 사용 설정 ON** |
| `GOOGLE_MAPS_API_KEY` | 해외 장소 검색 (별점 포함) | [Google Cloud Console](https://console.cloud.google.com) → **Places API (New)** 사용 설정 → API 키 (결제 계정 필요, 키는 Places API로 제한 권장) |

키가 없으면 지도 없이 기존처럼 동작합니다. 지도 타일은 OpenStreetMap(키 불필요)을 사용합니다.

## 실행

1. 의존성 설치

   ```bash
   npm install
   ```

2. API 키 설정: `.env.example`을 복사해 `.env`를 만들고, `ANTHROPIC_API_KEY`에 [Claude Console](https://platform.claude.com)에서 발급한 키를 넣습니다.

   ```bash
   cp .env.example .env
   ```

3. 실행 (`.env`를 자동으로 읽습니다, Node.js 22.9 이상 필요)

   ```bash
   npm start
   ```

4. http://localhost:3000 접속

> `.env`는 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다. 키를 절대 커밋하지 마세요.

## 배포 (Render)

1. [Render](https://render.com) 로그인 → **New → Blueprint** → 이 저장소 선택 (`render.yaml`을 자동 인식)
2. `ANTHROPIC_API_KEY` 값을 입력하고 **Apply**
3. 배포가 끝나면 `https://travel-planner-xxxx.onrender.com` 형태의 주소가 생성됩니다.

무료 플랜은 15분간 접속이 없으면 잠들며, 다음 첫 접속 때 깨어나는 데 30~60초가 걸립니다.

## 배포 (Vercel)

1. [Vercel](https://vercel.com/new) 로그인 → **Add New → Project** → 이 저장소 **Import**
2. **Environment Variables**에 `ANTHROPIC_API_KEY` 추가 → **Deploy** (설정은 `vercel.json`이 자동 적용)
3. **사용량 제한용 저장소 연결 (권장)**: 프로젝트 → **Storage** → **Upstash for Redis** 생성·연결 → **Redeploy**

Vercel은 요청마다 서버가 따로 실행되므로, Redis 없이는 사용량 제한이 서버 인스턴스별로만 동작합니다. `/healthz`의 `rateLimit` 값이 `redis`면 정상 연결된 것입니다.

> Vercel 무료(Hobby) 플랜은 비상업적 용도만 허용됩니다.

## 사용량 제한

API 크레딧 보호를 위해 환경변수로 제한합니다.

| 변수 | 기본값 | 의미 |
|---|---|---|
| `RATE_LIMIT_PER_HOUR` | 20 | IP당 시간당 요청 수 |
| `DAILY_LIMIT` | 300 | 전체 하루 요청 수 |

Claude Console의 **Limits** 메뉴에서 월 지출 한도도 함께 설정해 두는 것을 권장합니다.

## 구조

- `lib/planner.mjs` — Claude 호출, JSON 스키마, 입력 검증 (공용)
- `lib/places.mjs` — 카카오/구글 장소 조회로 AI 추천 장소 검증
- `lib/limit.mjs` — 사용량 제한 (Upstash Redis 있으면 Redis, 없으면 메모리)
- `server.mjs` — 일반 Node 서버 (로컬 · Render)
- `api/*.js`, `lib/vercel.mjs`, `vercel.json` — Vercel 서버리스 함수
- `public/index.html` — 프론트엔드 (바닐라 JS, 빌드 없음)
