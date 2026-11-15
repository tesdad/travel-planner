# 여행 플래너

Claude(기본 claude-sonnet-5-5)를 이용한 여행 계획 웹앱.

1. **여행지 추천** — 국내 / 해외 선택 + 여행 스타일 + 기간 (+ 추가 요청, 예: "북유럽을 중심으로") → 선택한 범위에서 3곳 추천 (카드의 "이 여행지로 루트 짜기"로 ②에 바로 연결)
2. **상세 루트** — 대략적인 루트 + 기간 + 이동 수단 → 일자별·시간대별 상세 일정
   - 결과 아래 입력창으로 **수정·추가 요청** (예: "둘째 날 오후에 카페 추가") → 전체 루트를 다시 맞춰 주고 바뀐 점을 요약, 이전 버전으로 되돌리기 가능
   - **링크로 저장**: 짧은 공유 주소(`/t/xxxxxxxxxx`) 생성, 90일 보관, 저장한 기기에서 **공유 중지**(삭제) 가능 · **내 여행** 목록(이 기기) · **PDF로 저장**(인쇄용 화면)
   - **한글(HWPX)로 저장**: 일자별 일정을 표로 정리한 `.hwpx` 문서를 브라우저에서 바로 만들어 내려받기
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

## 저장소 (공유 링크 · 사용량 제한)

공유 링크 저장과 서버리스 환경의 사용량 제한에 **Upstash Redis**(무료 플랜 가능)를 사용합니다. Render와 Vercel에 **같은 값**을 넣으면 어느 주소에서 저장해도 양쪽에서 링크가 열립니다.

| 환경변수 | 값 |
|---|---|
| `KV_REST_API_URL` (또는 `UPSTASH_REDIS_REST_URL`) | Upstash 데이터베이스의 REST URL |
| `KV_REST_API_TOKEN` (또는 `UPSTASH_REDIS_REST_TOKEN`) | Upstash 데이터베이스의 REST Token |

연결하지 않으면 서버 메모리에 **임시 저장**되며(서버 재시작 시 사라짐), 화면에 경고가 표시됩니다. `/healthz`의 `storage` 값으로 확인할 수 있습니다.

## 개인정보 최소화

- **IP**: 사용량 제한에만 쓰고, 원본 대신 날짜별 HMAC 해시로 1시간만 보관합니다(복원 불가). 비밀값은 `IP_HASH_SECRET` → Redis 토큰 → 서버 시작 시 무작위 값 순으로 사용합니다.
- **공유 링크**: 루트와 기본 입력(루트·기간·이동 수단)만 저장하고, 자유 입력(추가 요청)과 저장한 사람의 IP는 저장하지 않습니다. 저장할 때 발급된 삭제 키(서버에는 해시만 보관)로 `DELETE /api/trips/:id` (`X-Delete-Key` 헤더) 요청 시 삭제됩니다.
- **캐시**: 자유 입력이 들어가는 추천 캐시 키는 해시로 저장합니다.
- **입력 안내**: 추가 요청 입력란에 개인정보를 적지 말라는 안내를 표시합니다.

## AI 비용 관리

- **사용량 기록**: AI 호출마다 실제 토큰 수로 비용을 계산해 서버 로그(`[usage] ...`)에 남기고, 하루 단위 합계를 저장합니다.
- **관리자 페이지**: `/admin.html`에서 `ADMIN_TOKEN`을 입력하면 기능별 호출 수, 캐시 비율, 평균 비용을 볼 수 있습니다.
- **결과 캐시**: 지역 가이드(14일)와 여행지 추천(7일)은 같은 질문이면 저장된 답을 돌려줍니다(비용 0, 사용량 제한에서도 제외).
- **모델**: 기본 `claude-sonnet-5-5` (비교 실험 결과 Opus 대비 비용 58% 절감). 환경변수 `AI_MODEL`로 변경 가능
- **(실험) Gemini 우선 모드**: `AI_PROVIDER=gemini` + `GEMINI_API_KEY`(유료 등급)를 설정하면 Gemini 3.8 Flash(`GEMINI_MODEL`로 변경 가능)로 먼저 요청합니다. 스키마를 강제하므로 형식 오류가 드물고, 오류·검사 실패 시 Claude로 다시 요청합니다. 비교 실험에서 국내 장소 실재율 89%(Sonnet 87%), 여행 1건 약 ₩39(Sonnet ₩159, 2027년부터 Gemini 가격 2배).
- **(실험) DeepSeek 우선 모드**: `AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`를 설정하면 DeepSeek로 먼저 요청합니다. 결과를 검사(`lib/checks.mjs`: 스키마, 요청 일수, 날짜 순서·반복, 추천 수, 장소 중복)해서 실패하거나 오류가 나면 Claude로 다시 요청합니다. 관리자 페이지에 기능별 대체 비율이 표시되고, `/healthz`의 `ai` 값에 따라 개인정보 안내 문구가 바뀝니다. 끄려면 `AI_PROVIDER`를 지우면 됩니다.
- **사고량 조절**: 여행지 추천과 지역 가이드는 `effort: low`, 루트와 수정은 `medium`.
- 모델 가격은 `lib/usage.mjs`의 `PRICES`에서 관리합니다.

## 모델 비교 실험

같은 입력(`eval/inputs.json`)을 Claude Opus·Sonnet·Haiku, DeepSeek, HyperCLOVA X(HCX-007), Upstage Solar Pro 4, Gemini 3.8 Flash · 3.5 Flash-Lite에 보내 품질·속도·비용을 비교합니다. 앱과 **똑같은 프롬프트·스키마**(`lib/planner.mjs`의 `TASKS`)를 사용합니다.

```bash
npm run compare            # 실행 계획과 예상 비용만 출력 (API 호출 없음)
npm run compare -- --yes   # 실제 실행 → eval/results/<시각>/report.html
npm run compare -- --yes --models haiku,deepseek --features place --limit 3
```

- 측정: 형식 통과율(스키마 검사), 평균 시간, 토큰, 기능별 비용, **여행 1건 비용**, **장소 실재율**(카카오·구글로 확인)
- 리포트: 입력별 결과를 나란히 비교, **블라인드 모드**(모델 이름 숨김)로 별점 평가
- Gemini는 `GEMINI_API_KEY` 필요(유료 등급 키). 모델 이름은 `--models gemini-flash,gemini-lite`
- HyperCLOVA X는 `CLOVASTUDIO_API_KEY`, Solar는 `UPSTAGE_API_KEY` 필요(키가 없는 모델은 자동 제외). HCX-007 가격은 원화 기준이라 `HCX_PRICE_IN_KRW_PER_1K` / `HCX_PRICE_OUT_KRW_PER_1K`로 맞춰 주세요.
- DeepSeek는 `.env`의 `DEEPSEEK_API_KEY` 필요. 가격은 `DEEPSEEK_PRICE_IN` / `DEEPSEEK_PRICE_OUT`로 조정

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
- `lib/trips.mjs`, `lib/redis.mjs` — 루트 저장·불러오기 (Upstash Redis)
- `lib/usage.mjs`, `lib/cache.mjs`, `lib/admin.mjs` — 비용 기록, 결과 캐시, 관리자 리포트
- `lib/limit.mjs` — 사용량 제한 (Upstash Redis 있으면 Redis, 없으면 메모리)
- `server.mjs` — 일반 Node 서버 (로컬 · Render)
- `api/*.js`, `lib/vercel.mjs`, `vercel.json` — Vercel 서버리스 함수
- `public/index.html` — 프론트엔드 (바닐라 JS, 빌드 없음)
- `public/hwpx.js`, `public/hwpx/` — 한글(HWPX) 문서 생성기와 고정 템플릿 (출처: `public/hwpx/NOTICE`)
