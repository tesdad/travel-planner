// 비교 실험용 모델 호출기 — 모든 모델에 앱과 똑같은 프롬프트·스키마를 보냅니다.
import Anthropic from "@anthropic-ai/sdk";
import { TASKS, SYSTEM_BASE } from "../lib/planner.mjs";
import { costOf } from "../lib/usage.mjs";

// DeepSeek 가격(100만 토큰당 달러). 바뀌었으면 .env 의 DEEPSEEK_PRICE_IN / DEEPSEEK_PRICE_OUT 로 덮어쓰세요.
// 기준: deepseek-chat 공식 가격표 (입력은 캐시 미적용 가격) — 실행 전 https://api-docs.deepseek.com 에서 확인 권장
const DS_PRICE_IN = Number(process.env.DEEPSEEK_PRICE_IN) || 0.28;
const DS_PRICE_IN_CACHED = Number(process.env.DEEPSEEK_PRICE_IN_CACHED) || 0.028;
const DS_PRICE_OUT = Number(process.env.DEEPSEEK_PRICE_OUT) || 0.42;

export const MODELS = {
  opus: { label: "Claude Opus 5.5", provider: "claude", id: "claude-opus-5-5", price: [4, 20] },
  sonnet: { label: "Claude Sonnet 5.5", provider: "claude", id: "claude-sonnet-5-5", price: [2, 10] },
  haiku: { label: "Claude Haiku 5.5", provider: "claude", id: "claude-haiku-5-5", price: [0.1, 0.5] },
  deepseek: { label: "DeepSeek (deepseek-chat)", provider: "deepseek", id: "deepseek-chat", price: [DS_PRICE_IN, DS_PRICE_OUT] },
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

/** 한 번 호출. 실패해도 throw 하지 않고 error 필드로 반환 */
export async function runOnce(modelKey, feature, body) {
  const model = MODELS[modelKey];
  const started = Date.now();
  try {
    const r = model.provider === "claude" ? await callClaude(model, feature, body) : await callDeepSeek(model, feature, body);
    let data = null, parseError = null;
    try { data = JSON.parse(r.raw); } catch (e) { parseError = "JSON 파싱 실패: " + e.message; }
    return { ...r, data, parseError, ms: Date.now() - started };
  } catch (err) {
    return { error: err.message || String(err), ms: Date.now() - started, cost: 0, inTokens: 0, outTokens: 0 };
  }
}
