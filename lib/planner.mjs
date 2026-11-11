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

const RECOMMEND_COUNT = 3;

const recommendSchema = {
  type: "object",
  additionalProperties: false,
  required: ["destinations"],
  properties: {
    destinations: { type: "array", items: destinationItem, description: `추천 여행지 정확히 ${RECOMMEND_COUNT}개, 추천 순서대로` },
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

const refineSchema = {
  ...routeSchema,
  required: [...routeSchema.required, "changes"],
  properties: {
    ...routeSchema.properties,
    changes: {
      type: "array",
      items: { type: "string" },
      description: "이번 수정 요청으로 실제로 바뀐 점 1~4개를 짧게. 요청을 그대로 들어줄 수 없었다면 그 이유와 대신 적용한 내용",
    },
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

// 여행지 추천 범위: 국내 / 해외
export const SCOPES = {
  domestic: "대한민국 국내 여행지만 추천하세요. region에는 도/시를 적으세요.",
  international: "대한민국 밖의 해외 여행지만 추천하세요. 여행 기간은 현지 도착 기준(한국과 현지 사이 항공 이동 시간 제외)이므로 한국에서의 거리나 비행 시간으로 후보를 제한하지 말고, 현지에 도착한 뒤 그 기간 동안 충분히 즐길 수 있는 곳을 고르세요. region에는 국가를 적으세요.",
};

export async function recommend({ style, duration, scope, extra }) {
  const prompt = `여행 스타일: ${style}\n여행 기간: ${duration}\n${extra ? `추가 요청: ${extra}\n` : ""}
이 조건에 맞는 여행지를 ${RECOMMEND_COUNT}곳 추천해 주세요.
- ${SCOPES[scope]}
- 추가 요청이 있으면 그 지역·조건을 최우선으로 반영하세요. 추가 요청이 여행 기간과 맞지 않으면(예: 기간에 비해 볼 곳이 너무 넓은 지역) 그래도 요청을 따르되 whyFit에 일정상 주의점을 적어 주세요.
- 서로 겹치지 않게 다양한 곳을 고르세요.`;
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

export async function refine({ current, request, route, duration, transport }) {
  const prompt = `아래는 사용자에게 이미 보여준 여행 루트입니다.
<current_route>
${JSON.stringify(current)}
</current_route>
${route ? `처음 입력한 루트: ${route}\n` : ""}${duration ? `여행 기간: ${duration}\n` : ""}${transport ? `이동 수단: ${transport}\n` : ""}
사용자의 수정/추가 요청: ${request}

요청을 반영해 수정한 **전체** 루트를 반환해 주세요.
- 요청과 관계없는 날짜와 일정은 최대한 그대로 유지하세요.
- 시간 순서, 이동 시간, 식사 시간이 현실적으로 맞도록 앞뒤 일정을 함께 조정하세요.
- regions와 각 날짜의 areas도 바뀐 동선에 맞게 갱신하세요.
- 요청이 비현실적이거나 모호하면 가장 합리적인 방향으로 적용하고, changes에 그 이유를 적어 주세요.`;
  const { changes, ...updated } = await askClaude(SYSTEM_BASE, prompt, refineSchema);
  return { route: updated, changes };
}

// ---------- 공통 요청 처리 (Render 서버 · Vercel 함수 공용) ----------
export const HANDLERS = {
  recommend: [recommend, ["style", "duration", "scope"]],
  route: [route, ["route", "duration", "transport"]],
  place: [place, ["region"]],
  refine: [refine, ["current", "request"]],
};

const MAX_TEXT = 500;
const MAX_ROUTE_JSON = 40000;

function validate(body, required) {
  if (!body || typeof body !== "object") return "잘못된 요청입니다.";
  if ((required.includes("scope") || "scope" in body) && !Object.hasOwn(SCOPES, body.scope)) return "국내 또는 해외를 선택해 주세요.";
  for (const k of required) {
    const v = body[k];
    if (v == null || (typeof v === "string" && !v.trim())) return `'${k}' 값을 입력해 주세요.`;
  }
  for (const [k, v] of Object.entries(body)) {
    if (k === "current") {
      if (typeof v !== "object" || !Array.isArray(v?.days)) return "수정할 루트 정보가 올바르지 않습니다.";
      if (JSON.stringify(v).length > MAX_ROUTE_JSON) return "루트가 너무 깁니다.";
    } else if (typeof v === "string" && v.length > MAX_TEXT) {
      return `입력이 너무 깁니다 (${MAX_TEXT}자 이하).`;
    } else if (v != null && typeof v !== "string") {
      return "잘못된 요청입니다.";
    }
  }
  return null;
}

/** 입력 검증 → 실행. { status, body } 반환 */
export async function runPlanner(name, body, { checkLimit } = {}) {
  const [handler, required] = HANDLERS[name];
  const invalid = validate(body, required);
  if (invalid) return { status: 400, body: { error: invalid } };
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
