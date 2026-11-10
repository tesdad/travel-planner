import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const client = new Anthropic();

const key = process.env.ANTHROPIC_API_KEY || "";
if (!key || !key.startsWith("sk-ant-") || key.includes("여기에")) {
  console.warn("⚠️  ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일에 실제 API 키를 넣고 서버를 다시 시작하세요.");
}

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
    name: { type: "string" },
    category: { type: "string", description: "예: 호텔/게스트하우스, 한식/카페, 해변/박물관" },
    description: { type: "string" },
    priceRange: { type: "string", description: "대략 가격대 (원화). 무료면 '무료'" },
    tip: { type: "string", description: "방문 팁 (예약, 대표 메뉴, 추천 시간대 등)" },
  },
};

const placeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["region", "intro", "stays", "restaurants", "attractions"],
  properties: {
    region: { type: "string" },
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

async function recommend({ style, duration }) {
  const prompt = `여행 스타일: ${style}\n여행 기간: ${duration}\n\n이 조건에 맞는 여행지를 국내 3곳, 해외 3곳 추천해 주세요. 해외는 기간 안에 무리 없이 다녀올 수 있는 거리여야 합니다.`;
  return askClaude(SYSTEM_BASE, prompt, recommendSchema);
}

async function route({ route, duration, transport, extra }) {
  const prompt = `대략적인 여행 루트: ${route}\n여행 기간: ${duration}\n이동 수단: ${transport}\n${extra ? `추가 요청: ${extra}\n` : ""}
위 정보를 바탕으로 일자별 상세 여행 루트를 짜 주세요.
- 각 날짜마다 시간대별 일정(장소, 할 일, 해당 이동 수단 기준 이동 방법과 소요시간)을 넣어 주세요.
- 선택한 이동 수단으로 현실적으로 가능한 동선이어야 합니다.
- 식사 장소/메뉴 추천도 일정에 포함해 주세요.
- 각 날짜의 숙박 지역을 추천해 주세요.`;
  return askClaude(SYSTEM_BASE, prompt, routeSchema);
}

async function place({ region, context, transport }) {
  const prompt = `지역: ${region}\n${context ? `전체 여행 루트 맥락: ${context}\n` : ""}${transport ? `이동 수단: ${transport}\n` : ""}
이 지역에서 머무를 여행자를 위해 추천 숙소, 맛집, 관광 스팟을 알려 주세요. 가능하면 서로 동선이 가까운 곳 위주로, 실제로 존재하는 유명한 곳을 추천해 주세요.`;
  return askClaude(SYSTEM_BASE, prompt, placeSchema);
}

// ---------- 사용량 제한 (API 크레딧 보호) ----------
const PER_IP_HOURLY = Number(process.env.RATE_LIMIT_PER_HOUR) || 20; // IP당 시간당 요청 수
const GLOBAL_DAILY = Number(process.env.DAILY_LIMIT) || 300; // 전체 하루 요청 수
const ipHits = new Map(); // ip -> [timestamp, ...]
let daily = { day: new Date().toDateString(), count: 0 };

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? String(fwd).split(",")[0] : req.socket.remoteAddress || "").trim();
}

function checkLimit(ip) {
  const now = Date.now();
  const today = new Date().toDateString();
  if (daily.day !== today) daily = { day: today, count: 0 };
  if (daily.count >= GLOBAL_DAILY) return "오늘 서비스 사용량이 모두 소진되었습니다. 내일 다시 이용해 주세요.";

  const recent = (ipHits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_IP_HOURLY) {
    const waitMin = Math.ceil((3600_000 - (now - recent[0])) / 60_000);
    return `요청 한도(시간당 ${PER_IP_HOURLY}회)를 초과했습니다. 약 ${waitMin}분 후 다시 시도해 주세요.`;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  daily.count++;
  return null;
}

// 오래된 기록 정리
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of ipHits) if (hits.every((t) => now - t >= 3600_000)) ipHits.delete(ip);
}, 600_000).unref();

// ---------- HTTP 서버 ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e5) reject(new Error("too large"));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); }
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    const api = {
      "/api/recommend": [recommend, ["style", "duration"]],
      "/api/route": [route, ["route", "duration", "transport"]],
      "/api/place": [place, ["region"]],
    }[req.url];
    if (req.method === "POST" && api) {
      const [handler, required] = api;
      const body = await readBody(req);
      for (const k of required) {
        if (!body[k] || !String(body[k]).trim()) return sendJson(res, 400, { error: `'${k}' 값을 입력해 주세요.` });
        if (String(body[k]).length > 500) return sendJson(res, 400, { error: "입력이 너무 깁니다 (500자 이하)." });
      }
      const limited = checkLimit(clientIp(req));
      if (limited) return sendJson(res, 429, { error: limited });
      return sendJson(res, 200, await handler(body));
    }

    if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 200, { ok: true });

    if (req.method === "GET") {
      const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      if (path.includes("..")) return sendJson(res, 400, { error: "bad path" });
      const file = await readFile(join(__dirname, "public", path)).catch(() => null);
      if (!file) return sendJson(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
      return res.end(file);
    }

    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    console.error(err);
    let message = err.message || "서버 오류";
    if (err instanceof Anthropic.AuthenticationError) message = "API 키가 올바르지 않습니다. ANTHROPIC_API_KEY를 확인해 주세요.";
    else if (err instanceof Anthropic.RateLimitError) message = "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
    else if (err instanceof Anthropic.APIConnectionError) message = "Claude API에 연결할 수 없습니다.";
    else if (/authentication method/i.test(message)) message = "API 키가 설정되지 않았습니다. ANTHROPIC_API_KEY 환경변수를 설정한 뒤 서버를 다시 실행해 주세요.";
    sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => console.log(`여행 플래너 실행 중: http://localhost:${PORT}`));
