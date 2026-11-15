// DeepSeek 사용 (실험용) — AI_PROVIDER=deepseek 이고 DEEPSEEK_API_KEY가 있을 때만 켜집니다.
// DeepSeek는 스키마 강제 기능이 없어 JSON 모드 + 스키마를 프롬프트로 전달하고,
// 받은 결과는 lib/checks.mjs 로 검사합니다. 실패하면 planner가 Claude로 다시 요청합니다.
import { recordUsageRaw } from "./usage.mjs";

const KEY = process.env.DEEPSEEK_API_KEY;
export const deepseekReady = Boolean(KEY);
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// 100만 토큰당 달러. 가격이 바뀌면 환경변수로 덮어쓰기
const PRICE_IN = Number(process.env.DEEPSEEK_PRICE_IN) || 0.28;
const PRICE_IN_CACHED = Number(process.env.DEEPSEEK_PRICE_IN_CACHED) || 0.028;
const PRICE_OUT = Number(process.env.DEEPSEEK_PRICE_OUT) || 0.42;

// 실패 시 Claude로 다시 요청할 시간을 남겨 두기 위해 짧게 (Vercel 함수 최대 120초)
const TIMEOUT_MS = 45_000;

export async function askDeepSeek(feature, system, userText, schema, _effort) {
  const started = Date.now();
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `${system}\n\n반드시 아래 JSON 스키마를 정확히 따르는 JSON 객체 하나만 출력하세요. 설명 문장이나 코드 블록 없이 JSON만 출력합니다.\n- 모든 객체에서 required에 적힌 필드는 하나도 빠짐없이 넣으세요${schema.properties?.days ? " (특히 days의 각 날짜마다 accommodation 필수)" : ""}.\n- 스키마에 없는 필드는 넣지 마세요.\n<json_schema>\n${JSON.stringify(schema)}\n</json_schema>`,
        },
        { role: "user", content: userText },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = await res.json();
  const u = data.usage || {};
  const cached = u.prompt_cache_hit_tokens || 0;
  const cost = (((u.prompt_tokens || 0) - cached) * PRICE_IN + cached * PRICE_IN_CACHED + (u.completion_tokens || 0) * PRICE_OUT) / 1e6;
  await recordUsageRaw(feature, { model: data.model || MODEL, input: u.prompt_tokens, output: u.completion_tokens, cost, ms: Date.now() - started, alt: true });

  const choice = data.choices?.[0];
  if (choice?.finish_reason !== "stop") throw new Error(`DeepSeek 종료 사유: ${choice?.finish_reason}`);
  const text = choice.message?.content || "";
  try {
    return JSON.parse(text);
  } catch {
    // 코드 블록(```json)이나 앞뒤 문장이 섞인 경우: 첫 { 부터 마지막 } 까지만 다시 시도
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    try {
      if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    } catch {}
    throw new Error(`DeepSeek JSON 파싱 실패 (길이 ${text.length}, 시작 ${JSON.stringify(text.slice(0, 30))})`);
  }
}
