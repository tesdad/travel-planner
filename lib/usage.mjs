// AI 사용량 · 비용 기록
// - 요청마다 서버 로그에 한 줄: [usage] route model=... in=... out=... $0.0123 21.3s
// - 하루 단위 합계를 Redis(없으면 메모리)에 기능별로 누적 → /api/usage 에서 조회
import { redis, redisReady } from "./redis.mjs";

// 100만 토큰당 달러 [입력, 출력, 캐시 읽기]. 캐시 쓰기는 입력의 1.25배로 계산.
// 가격이 바뀌면 여기만 고치면 됩니다. https://www.anthropic.com/pricing
const PRICES = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.1],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
  "claude-opus-5": [5, 25, 0.5],
  "claude-opus-4-8": [5, 25, 0.5],
  "claude-sonnet-5": [2, 10, 0.2],
};
const DEFAULT_PRICE = PRICES["claude-opus-5-5"];
const KEEP_DAYS = 90;

export function costOf(model, usage) {
  const [pin, pout, pread] = PRICES[model] || DEFAULT_PRICE;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  return (input * pin + output * pout + cacheRead * pread + cacheWrite * pin * 1.25) / 1e6;
}

const today = () => new Date().toISOString().slice(0, 10); // UTC 기준 날짜
const memory = new Map(); // day -> { field: number }

async function add(fields) {
  const day = today();
  if (redisReady) {
    try {
      const key = `usage:${day}`;
      await redis([...Object.entries(fields).map(([f, n]) => ["HINCRBY", key, f, String(Math.round(n))]), ["EXPIRE", key, String(KEEP_DAYS * 86400)]]);
      return;
    } catch (err) {
      console.error("usage store error:", err.message);
    }
  }
  const d = memory.get(day) || {};
  for (const [f, n] of Object.entries(fields)) d[f] = (d[f] || 0) + Math.round(n);
  memory.set(day, d);
  if (memory.size > KEEP_DAYS) memory.delete(memory.keys().next().value);
}

/** Claude 응답 1건 기록 */
export async function recordUsage(feature, response, ms) {
  const u = response.usage || {};
  const model = response.model;
  const cost = costOf(model, u);
  console.log(
    `[usage] ${feature} model=${model} in=${u.input_tokens} out=${u.output_tokens}` +
      (u.cache_read_input_tokens ? ` cache_read=${u.cache_read_input_tokens}` : "") +
      ` $${cost.toFixed(4)} ${(ms / 1000).toFixed(1)}s`,
  );
  await add({
    [`${feature}:calls`]: 1,
    [`${feature}:in`]: u.input_tokens || 0,
    [`${feature}:out`]: u.output_tokens || 0,
    [`${feature}:cost_micro`]: cost * 1e6, // 백만분의 1달러 단위 정수
    [`${feature}:ms`]: ms,
  });
}

/** 캐시로 응답한 경우 (AI 호출 없음) */
export async function recordCacheHit(feature) {
  console.log(`[usage] ${feature} cache hit $0`);
  await add({ [`${feature}:cache_hits`]: 1 });
}

/** 최근 N일 사용량 요약 */
export async function usageReport(days = 7) {
  const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  let raw;
  if (redisReady) {
    const res = await redis(dates.map((d) => ["HGETALL", `usage:${d}`]));
    raw = res.map((flat) => {
      const o = {};
      for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = Number(flat[i + 1]);
      return o;
    });
  } else {
    raw = dates.map((d) => memory.get(d) || {});
  }

  const summarize = (fields) => {
    const byFeature = {};
    for (const [k, v] of Object.entries(fields)) {
      const [feature, metric] = k.split(":");
      (byFeature[feature] ||= { calls: 0, cache_hits: 0, in: 0, out: 0, cost_micro: 0, ms: 0 })[metric] = v;
    }
    const out = {};
    let total = 0;
    for (const [f, s] of Object.entries(byFeature)) {
      const cost = s.cost_micro / 1e6;
      total += cost;
      out[f] = {
        calls: s.calls,
        cacheHits: s.cache_hits,
        cacheHitRate: s.calls + s.cache_hits ? Math.round((s.cache_hits / (s.calls + s.cache_hits)) * 100) + "%" : "-",
        inputTokens: s.in,
        outputTokens: s.out,
        costUSD: +cost.toFixed(4),
        avgCostUSD: s.calls ? +(cost / s.calls).toFixed(4) : 0,
        avgOutputTokens: s.calls ? Math.round(s.out / s.calls) : 0,
        avgSeconds: s.calls ? +(s.ms / s.calls / 1000).toFixed(1) : 0,
      };
    }
    return { totalUSD: +total.toFixed(4), features: out };
  };

  const merged = {};
  for (const r of raw) for (const [k, v] of Object.entries(r)) merged[k] = (merged[k] || 0) + v;
  return {
    storage: redisReady ? "redis" : "memory (서버 재시작 시 초기화)",
    period: `${dates.at(-1)} ~ ${dates[0]} (UTC)`,
    total: summarize(merged),
    daily: Object.fromEntries(dates.map((d, i) => [d, summarize(raw[i])]).filter(([, s]) => Object.keys(s.features).length)),
  };
}
