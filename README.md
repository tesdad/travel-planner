# 여행 플래너

Claude(claude-opus-5-5)를 이용한 여행 계획 웹앱.

1. **여행지 추천** — 여행 스타일 + 기간 → 국내 3곳 / 해외 3곳 추천 (카드의 "이 여행지로 루트 짜기"로 ②에 바로 연결)
2. **상세 루트** — 대략적인 루트 + 기간 + 이동 수단 → 일자별·시간대별 상세 일정
3. **지역 상세** — 루트 결과의 📍지역 버튼 클릭 → 추천 숙소·맛집·관광 스팟 (한 번 불러온 지역은 캐시)

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

## 사용량 제한

API 크레딧 보호를 위해 환경변수로 제한합니다.

| 변수 | 기본값 | 의미 |
|---|---|---|
| `RATE_LIMIT_PER_HOUR` | 20 | IP당 시간당 요청 수 |
| `DAILY_LIMIT` | 300 | 전체 하루 요청 수 |

Claude Console의 **Limits** 메뉴에서 월 지출 한도도 함께 설정해 두는 것을 권장합니다.

## 구조

- `server.mjs` — Node 내장 http 서버 + API 3개(`/api/recommend`, `/api/route`, `/api/place`). 구조화 출력(JSON 스키마)으로 응답 형식을 고정.
- `public/index.html` — 프론트엔드(바닐라 JS, 빌드 없음).
