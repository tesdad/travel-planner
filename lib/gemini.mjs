// Google Gemini 사용 (AI_PROVIDER=gemini + GEMINI_API_KEY)
// - responseJsonSchema로 스키마를 강제하므로 형식 오류는 드물지만, 앱 공통 검사(lib/checks.mjs)는 그대로 거칩니다.
// - 오류·검사 실패 시 planner가 Claude로 다시 요청합니다.
// - 유료 등급 키를 쓰세요 (무료 등급은 입력이 Google 제품 개선에 쓰일 수 있음).
import { recordUsageRaw } from "./usage.mjs";

const KEY = process.env.GEMINI_API_KEY;
export const geminiReady = Boolean(KEY);
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

// 100만 토큰당 달러 [입력, 출력(thinking 포함), 캐시 입력]. 환경변수로 덮어쓰기 가능.
// gemini-3.8-flash 공식 요금: 2026-12-31까지 $0.75 / $3.75, 2027-01-01부터 $1.50 / $7.50
function price() {
  const intro = Date.now() < Date.UTC(2027, 0, 1);
  return [
    Number(process.env.GEMINI_PRICE_IN) || (intro ? 0.75 : 1.5),
    Number(process.env.GEMINI_PRICE_OUT) || (intro ? 3.75 : 7.5),
    intro ? 0.075 : 0.15,
  ];
}


export async function askGemini(feature, system, userText, schema, effort = "medium", timeoutMs = 45_000) {
  const started = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        maxOutputTokens: 16000,
        thinkingConfig: { thinkingLevel: effort }, // 앱의 effort(low/medium)를 그대로 사용
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const u = data.usageMetadata || {};
  const [pin, pout, pcached] = price();
  const cached = u.cachedContentTokenCount || 0;
  const output = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0); // thinking 토큰도 출력 요금
  const cost = (((u.promptTokenCount || 0) - cached) * pin + cached * pcached + output * pout) / 1e6;
  await recordUsageRaw(feature, { model: data.modelVersion || MODEL, input: u.promptTokenCount, output, cost, ms: Date.now() - started, alt: true });

  const cand = data.candidates?.[0];
  if (cand?.finishReason !== "STOP") throw new Error(`Gemini 종료 사유: ${cand?.finishReason || data.promptFeedback?.blockReason}`);
  const text = (cand.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini JSON 파싱 실패");
  }
}
