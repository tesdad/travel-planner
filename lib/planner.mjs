import Anthropic from "@anthropic-ai/sdk";
import { enrichPlace } from "./places.mjs";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

// ---------- JSON 스키마 ----------
const destinationItem = {
  type: "object",
  additionalProperties: false,
  required: ["name", "region", "summary", "highlights", "bestSeason", "estimatedBudget", "whyFit"],
  properties: {
    name: { type: "string", description: "여행지 이름" },
    region: { type: "string", description: "국내면 도/시, 해외면 국가" },
    summary: { type: "string", description: "한두 문장 소개" },
    highlights: { type: "array", items: { type: "string" }, description: "대표 볼거리/할거리 3~5개" },
    bestSeason: { type: "string" },
    estimatedBudget: { type: "string", description: "1인 기준 대략 예산 (원화)" },
    whyFit: { type: "string", description: "사용자의 스타일·기간에 왜 맞는지" },
  },
};

const recommendSchema = {
  type: "object",
  additionalProperties: false,
  required: ["domestic", "international"],
  properties: {
    domestic: { type: "array", items: destinationItem, description: "국내 추천지 정확히 3개" },
    international: { type: "array", items: destinationItem, description: "해외 추천지 정확히 3개" },
  },
};

const routeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "overview", "regions", "days", "tips"],
  properties: {
    title: { type: "string" },
    overview: { type: "string" },
    regions: {
      type: "array",
      items: { type: "string" },
      description: "루트상 주요 지역(도시/동네) 이름을 방문 순서대로. 예: ['강릉', '속초', '양양']",
    },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "theme", "areas", "schedule", "accommodation"],
        properties: {
          day: { type: "integer" },
          areas: { type: "array", items: { type: "string" }, description: "그날 방문하는 주요 지역 이름 (regions 목록의 표기와 동일하게)" },
          theme: { type: "string", description: "그날의 이동 구간/테마, 예: '서울 → 강릉'" },
          schedule: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["time", "place", "activity", "transport"],
              properties: {
                time: { type: "string", description: "예: 09:00" },
                place: { type: "string" },
                activity: { type: "string" },
                transport: { type: "string", description: "이 장소로 오는 이동 방법과 소요시간. 첫 일정이면 빈 문자열 가능" },
              },
            },
          },
          accommodation: { type: "string", description: "숙박 지역 추천. 마지막 날이면 '귀가' 등" },
        },
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
};

const spotItem = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "description", "priceRange", "tip"],
  properties: {
    name: { type: "string", description: "지도에서 검색되는 정확한 상호/명칭 (지점명 포함)" },
    category: { type: "string", description: "예: 호텔/게스트하우스, 한식/카페, 해변/박물관" },
    description: { type: "string" },
    priceRange: { type: "string", description: "대략 가격대 (원화). 무료면 '무료'" },
    tip: { type: "string", description: "방문 팁 (예약, 대표 메뉴, 추천 시간대 등)" },
  },
};

const placeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["region", "isKorea", "intro", "stays", "restaurants", "attractions"],
  properties: {
    region: { type: "string", description: "지도 검색에 쓸 수 있는 정확한 지역명" },
    isKorea: { type: "boolean", description: "대한민국 안의 지역이면 true" },
    intro: { type: "string", description: "지역 한두 문장 소개" },
    stays: { type: "array", items: spotItem, description: "추천 숙소 3곳" },
    restaurants: { type: "array", items: spotItem, description: "추천 맛집 3~4곳" },
    attractions: { type: "array", items: spotItem, description: "추천 관광 스팟 3~4곳" },
  },
};

// ---------- Claude 호출 ----------
async function askClaude(system, userText, schema) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: userText }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("요청을 처리할 수 없습니다. 입력을 바꿔 다시 시도해 주세요.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("응답이 너무 길어 잘렸습니다. 기간을 줄이거나 다시 시도해 주세요.");
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

const SYSTEM_BASE =
  "당신은 한국인 여행자를 돕는 경험 많은 여행 플래너입니다. 모든 답변은 한국어로, 구체적이고 현실적으로 작성하세요. 실존하는 장소만 사용하세요.";

export async function recommend({ style, duration }) {
  const prompt = `여행 스타일: ${style}\n여행 기간: ${duration}\n\n이 조건에 맞는 여행지를 국내 3곳, 해외 3곳 추천해 주세요. 해외는 기간 안에 무리 없이 다녀올 수 있는 거리여야 합니다.`;
  return askClaude(SYSTEM_BASE, prompt, recommendSchema);
}

export async function route({ route, duration, transport, extra }) {
  const prompt = `대략적인 여행 루트: ${route}\n여행 기간: ${duration}\n이동 수단: ${transport}\n${extra ? `추가 요청: ${extra}\n` : ""}
위 정보를 바탕으로 일자별 상세 여행 루트를 짜 주세요.
- 각 날짜마다 시간대별 일정(장소, 할 일, 해당 이동 수단 기준 이동 방법과 소요시간)을 넣어 주세요.
- 선택한 이동 수단으로 현실적으로 가능한 동선이어야 합니다.
- 식사 장소/메뉴 추천도 일정에 포함해 주세요.
- 각 날짜의 숙박 지역을 추천해 주세요.`;
  return askClaude(SYSTEM_BASE, prompt, routeSchema);
}

export async function place({ region, context, transport }) {
  const prompt = `지역: ${region}\n${context ? `전체 여행 루트 맥락: ${context}\n` : ""}${transport ? `이동 수단: ${transport}\n` : ""}
이 지역에서 머무를 여행자를 위해 추천 숙소, 맛집, 관광 스팟을 알려 주세요. 가능하면 서로 동선이 가까운 곳 위주로, 실제로 존재하는 유명한 곳을 추천해 주세요.`;
  return enrichPlace(await askClaude(SYSTEM_BASE, prompt, placeSchema));
}


// ---------- 공통 요청 처리 (Render 서버 · Vercel 함수 공용) ----------
export const HANDLERS = {
  recommend: [recommend, ["style", "duration"]],
  route: [route, ["route", "duration", "transport"]],
  place: [place, ["region"]],
};

/** 입력 검증 → 실행. { status, body } 반환 */
export async function runPlanner(name, body, { checkLimit } = {}) {
  const [handler, required] = HANDLERS[name];
  for (const k of required) {
    if (!body?.[k] || !String(body[k]).trim()) return { status: 400, body: { error: `'${k}' 값을 입력해 주세요.` } };
    if (String(body[k]).length > 500) return { status: 400, body: { error: "입력이 너무 깁니다 (500자 이하)." } };
  }
  if (checkLimit) {
    const limited = await checkLimit();
    if (limited) return { status: 429, body: { error: limited } };
  }
  try {
    return { status: 200, body: await handler(body) };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: friendlyError(err) } };
  }
}

export function friendlyError(err) {
  const message = err?.message || "서버 오류";
  if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다. ANTHROPIC_API_KEY를 확인해 주세요.";
  if (err instanceof Anthropic.RateLimitError) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (err instanceof Anthropic.APIConnectionError) return "Claude API에 연결할 수 없습니다.";
  if (/authentication method/i.test(message)) return "API 키가 설정되지 않았습니다. ANTHROPIC_API_KEY 환경변수를 설정해 주세요.";
  return message;
}
