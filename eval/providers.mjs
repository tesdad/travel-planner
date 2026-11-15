// 비교 실험용 모델 호출기 — 모든 모델에 앱과 똑같은 프롬프트·스키마를 보냅니다.
import Anthropic from "@anthropic-ai/sdk";
import { TASKS, SYSTEM_BASE } from "../lib/planner.mjs";
import { costOf } from "../lib/usage.mjs";

// DeepSeek 가격(100만 토큰당 달러). 바뀌었으면 .env 의 DEEPSEEK_PRICE_IN / DEEPSEEK_PRICE_OUT 로 덮어쓰세요.
// 기준: deepseek-chat 공식 가격표 (입력은 캐시 미적용 가격) — 실행 전 https://api-docs.deepseek.com 에서 확인 권장
const DS_PRICE_IN = Number(process.env.DEEPSEEK_PRICE_IN) || 0.28;
const DS_PRICE_IN_CACHED = Number(process.env.DEEPSEEK_PRICE_IN_CACHED) || 0.028;
const DS_PRICE_OUT = Number(process.env.DEEPSEEK_PRICE_OUT) || 0.42;

// Upstage Solar Pro 4 가격(100만 토큰당 달러) — 공식 모델 페이지 기준 $0.30 / $1.20 (캐시 입력 $0.06)
const SOLAR_PRICE_IN = Number(process.env.SOLAR_PRICE_IN) || 0.3;
const SOLAR_PRICE_IN_CACHED = Number(process.env.SOLAR_PRICE_IN_CACHED) || 0.06;
const SOLAR_PRICE_OUT = Number(process.env.SOLAR_PRICE_OUT) || 1.2;

// HyperCLOVA X(HCX-007) 가격은 1,000토큰당 원화로 매겨집니다. 공식 요금표에서 확인 후 .env로 덮어쓰세요.
// 기본값(입력 1.25원, 출력 5원 / 1K 토큰)은 추정치입니다. 달러 환산은 KRW_PER_USD(기본 1400).
const KRW_PER_USD = Number(process.env.KRW_PER_USD) || 1400;
const HCX_PRICE_IN = ((Number(process.env.HCX_PRICE_IN_KRW_PER_1K) || 1.25) * 1000) / KRW_PER_USD;
const HCX_PRICE_OUT = ((Number(process.env.HCX_PRICE_OUT_KRW_PER_1K) || 5) * 1000) / KRW_PER_USD;

// Gemini 가격(100만 토큰당 달러, 유료 등급 · 출력에 thinking 포함) — 공식 요금표 2026-11 기준
// gemini-3.8-flash: $0.75 / $3.75 (2026-12-31까지, 2027-01-01부터 $1.50 / $7.50)
// gemini-3.5-flash-lite: $0.30 / $2.50
const GEMINI_PRICES = {
  flash: [Number(process.env.GEMINI_FLASH_PRICE_IN) || 0.75, Number(process.env.GEMINI_FLASH_PRICE_OUT) || 3.75, 0.075],
  lite: [Number(process.env.GEMINI_LITE_PRICE_IN) || 0.3, Number(process.env.GEMINI_LITE_PRICE_OUT) || 2.5, 0.03],
};

// 모델별로 필요한 API 키 (없으면 실험에서 자동 제외)
export const PROVIDER_KEYS = {
  claude: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  clova: "CLOVASTUDIO_API_KEY",
  upstage: "UPSTAGE_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export const MODELS = {
  opus: { label: "Claude Opus 5.5", provider: "claude", id: "claude-opus-5-5", price: [4, 20] },
  sonnet: { label: "Claude Sonnet 5.5", provider: "claude", id: "claude-sonnet-5-5", price: [2, 10] },
  haiku: { label: "Claude Haiku 5.5", provider: "claude", id: "claude-haiku-5-5", price: [0.1, 0.5] },
  deepseek: { label: "DeepSeek (deepseek-chat)", provider: "deepseek", id: "deepseek-chat", price: [DS_PRICE_IN, DS_PRICE_OUT] },
  clova: { label: "HyperCLOVA X (HCX-007)", provider: "clova", id: process.env.CLOVA_MODEL || "HCX-007", price: [HCX_PRICE_IN, HCX_PRICE_OUT] },
  solar: { label: "Upstage Solar Pro 4", provider: "upstage", id: process.env.SOLAR_MODEL || "solar-pro4", price: [SOLAR_PRICE_IN, SOLAR_PRICE_OUT] },
  "gemini-flash": { label: "Gemini 3.8 Flash", provider: "gemini", id: process.env.GEMINI_FLASH_MODEL || "gemini-3.8-flash", price: GEMINI_PRICES.flash },
  "gemini-lite": { label: "Gemini 3.5 Flash-Lite", provider: "gemini", id: process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite", price: GEMINI_PRICES.lite },
};

let anthropic;

async function callClaude(model, feature, body) {
  anthropic ||= new Anthropic();
  const task = TASKS[feature];
  const params = {
    model: model.id,
    max_tokens: 16000,
    output_config: { effort: task.effort, format: { type: "json_schema", schema: task.schema } },
    system: SYSTEM_BASE,
    messages: [{ role: "user", content: task.prompt(body) }],
  };
  // 거절 시 대체 모델 실행: 앱과 같게 Opus·Sonnet에만 (Haiku 5.5는 지원 안 함)
  if (model.id !== "claude-haiku-5-5") Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  const res = await anthropic.beta.messages.create(params);
  const usage = res.usage || {};
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    raw: text,
    stop: res.stop_reason,
    servedBy: res.model,
    inTokens: usage.input_tokens || 0,
    outTokens: usage.output_tokens || 0,
    cost: costOf(res.model, usage),
  };
}

async function callDeepSeek(model, feature, body) {
  const key = process.env.DEEPSEEK_API_KEY;
  const task = TASKS[feature];
  // DeepSeek는 스키마 강제 기능이 없어 JSON 모드 + 스키마를 프롬프트로 전달
  const system = `${SYSTEM_BASE}\n\n반드시 아래 JSON 스키마를 정확히 따르는 JSON 객체 하나만 출력하세요. 설명 문장이나 코드 블록 없이 JSON만 출력합니다.\n<json_schema>\n${JSON.stringify(task.schema)}\n</json_schema>`;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "system", content: system }, { role: "user", content: task.prompt(body) }],
      response_format: { type: "json_object" },
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const u = data.usage || {};
  const cached = u.prompt_cache_hit_tokens || 0;
  const uncached = (u.prompt_tokens || 0) - cached;
  return {
    raw: data.choices?.[0]?.message?.content || "",
    stop: data.choices?.[0]?.finish_reason,
    servedBy: data.model,
    inTokens: u.prompt_tokens || 0,
    outTokens: u.completion_tokens || 0,
    cost: (uncached * DS_PRICE_IN + cached * DS_PRICE_IN_CACHED + (u.completion_tokens || 0) * DS_PRICE_OUT) / 1e6,
  };
}

// HyperCLOVA X — CLOVA Studio 네이티브 v3 API.
// 스키마 강제(Structured Outputs)는 HCX-007에서만 지원하고, 이때 추론(thinking)은 꺼야 합니다.
// 지원하지 않는 스키마 키워드: pattern (앱 스키마에는 없음)
async function callClova(model, feature, body, attempt = 0) {
  const task = TASKS[feature];
  const res = await fetch(`https://clovastudio.stream.ntruss.com/v3/chat-completions/${encodeURIComponent(model.id)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CLOVASTUDIO_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "system", content: SYSTEM_BASE }, { role: "user", content: task.prompt(body) }],
      thinking: { effort: "none" },
      responseFormat: { type: "json", schema: task.schema },
      maxCompletionTokens: 16000,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const data = await res.json().catch(() => null);
  // 테스트 키는 동시 요청 한도가 낮음 → 429면 잠시 기다렸다 재시도 (최대 5회)
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    return callClova(model, feature, body, attempt + 1);
  }
  if (!res.ok || data?.status?.code !== "20000") {
    throw new Error(`CLOVA ${res.status}: ${JSON.stringify(data?.status || data).slice(0, 200)}`);
  }
  const r = data.result || {};
  const u = r.usage || {};
  return {
    raw: r.message?.content || "",
    stop: r.finishReason,
    servedBy: model.id,
    inTokens: u.promptTokens || 0,
    outTokens: u.completionTokens || 0,
    cost: ((u.promptTokens || 0) * HCX_PRICE_IN + (u.completionTokens || 0) * HCX_PRICE_OUT) / 1e6,
  };
}

// Upstage Solar — OpenAI 호환 API, response_format json_schema(strict)로 스키마 강제
async function callSolar(model, feature, body) {
  const task = TASKS[feature];
  const res = await fetch("https://api.upstage.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "system", content: SYSTEM_BASE }, { role: "user", content: task.prompt(body) }],
      response_format: { type: "json_schema", json_schema: { name: feature, strict: true, schema: task.schema } },
      max_tokens: 16000,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Upstage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const u = data.usage || {};
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  const uncached = (u.prompt_tokens || 0) - cached;
  return {
    raw: data.choices?.[0]?.message?.content || "",
    stop: data.choices?.[0]?.finish_reason,
    servedBy: data.model,
    inTokens: u.prompt_tokens || 0,
    outTokens: u.completion_tokens || 0,
    cost: (uncached * SOLAR_PRICE_IN + cached * SOLAR_PRICE_IN_CACHED + (u.completion_tokens || 0) * SOLAR_PRICE_OUT) / 1e6,
  };
}

// Google Gemini — generateContent, responseJsonSchema로 스키마 강제.
// 사고량은 앱의 effort(low/medium)를 그대로 thinkingLevel로 전달해 Claude와 조건을 맞춤.
// 유료 등급 키를 쓰세요 (무료 등급은 입력이 Google 제품 개선에 쓰일 수 있음).
async function callGemini(model, feature, body) {
  const task = TASKS[feature];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_BASE }] },
      contents: [{ role: "user", parts: [{ text: task.prompt(body) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: task.schema,
        maxOutputTokens: 16000,
        thinkingConfig: { thinkingLevel: task.effort },
      },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const u = data.usageMetadata || {};
  const [pin, pout, pcached] = model.price;
  const cached = u.cachedContentTokenCount || 0;
  const out = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0); // thinking 토큰도 출력 요금
  return {
    raw: (cand?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join(""),
    stop: cand?.finishReason === "STOP" ? "stop" : cand?.finishReason || data.promptFeedback?.blockReason,
    servedBy: data.modelVersion || model.id,
    inTokens: u.promptTokenCount || 0,
    outTokens: out,
    cost: (((u.promptTokenCount || 0) - cached) * pin + cached * pcached + out * pout) / 1e6,
  };
}

const CALLERS = { claude: callClaude, deepseek: callDeepSeek, clova: callClova, upstage: callSolar, gemini: callGemini };

/** 한 번 호출. 실패해도 throw 하지 않고 error 필드로 반환 */
export async function runOnce(modelKey, feature, body) {
  const model = MODELS[modelKey];
  const started = Date.now();
  try {
    const r = await CALLERS[model.provider](model, feature, body);
    let data = null, parseError = null;
    try { data = JSON.parse(r.raw); } catch (e) { parseError = "JSON 파싱 실패: " + e.message; }
    return { ...r, data, parseError, ms: Date.now() - started };
  } catch (err) {
    return { error: err.message || String(err), ms: Date.now() - started, cost: 0, inTokens: 0, outTokens: 0 };
  }
}
