// 사용량 제한 (API 크레딧 · 저장소 보호)
// - Upstash Redis가 연결돼 있으면 Redis에 기록 (Vercel처럼 서버가 여러 개로 나뉘는 환경용)
// - 없으면 서버 메모리에 기록 (Render처럼 서버 한 대가 계속 켜져 있는 환경용)
import { redis, redisReady } from "./redis.mjs";

const SCOPES = {
  // AI 호출 (추천·루트·지역·수정)
  ai: { perHour: Number(process.env.RATE_LIMIT_PER_HOUR) || 20, perDay: Number(process.env.DAILY_LIMIT) || 300 },
  // 루트 저장 (AI 호출 없음)
  save: { perHour: 30, perDay: 2000 },
};

export const limitBackend = redisReady ? "redis" : "memory";

const hourMsg = (n, min) => `요청 한도(시간당 ${n}회)를 초과했습니다. 약 ${min}분 후 다시 시도해 주세요.`;
const dayMsg = "오늘 서비스 사용량이 모두 소진되었습니다. 내일 다시 이용해 주세요.";

export function clientIp(headers, fallback = "") {
  const get = (k) => (typeof headers.get === "function" ? headers.get(k) : headers[k]);
  const fwd = get("x-forwarded-for");
  return (fwd ? String(fwd).split(",")[0] : get("x-real-ip") || fallback || "unknown").trim();
}

/** 한도 초과면 안내 문구, 아니면 null */
export async function checkLimit(ip, scope = "ai") {
  const cfg = SCOPES[scope];
  return redisReady ? checkRedis(ip, scope, cfg) : checkMemory(ip, scope, cfg);
}

// ---------- Redis (고정 시간 창) ----------
async function checkRedis(ip, scope, cfg) {
  const now = new Date();
  const hourKey = `rl:${scope}:ip:${ip}:${now.toISOString().slice(0, 13)}`;
  const dayKey = `rl:${scope}:day:${now.toISOString().slice(0, 10)}`;
  try {
    const [hourCount, , dayCount] = await redis([
      ["INCR", hourKey], ["EXPIRE", hourKey, "3600"],
      ["INCR", dayKey], ["EXPIRE", dayKey, "86400"],
    ]);
    if (dayCount > cfg.perDay) return dayMsg;
    if (hourCount > cfg.perHour) return hourMsg(cfg.perHour, 60 - now.getUTCMinutes());
    return null;
  } catch (err) {
    console.error("rate limit store error:", err.message);
    return checkMemory(ip, scope, cfg); // Redis 장애 시에도 최소한의 보호
  }
}

// ---------- 메모리 (슬라이딩 창) ----------
const hits = new Map(); // `${scope}:${ip}` -> [timestamp, ...]
const daily = new Map(); // scope -> { day, count }

function checkMemory(ip, scope, cfg) {
  const now = Date.now();
  const today = new Date().toDateString();
  let d = daily.get(scope);
  if (!d || d.day !== today) daily.set(scope, (d = { day: today, count: 0 }));
  if (d.count >= cfg.perDay) return dayMsg;

  const key = `${scope}:${ip}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= cfg.perHour) return hourMsg(cfg.perHour, Math.ceil((3600_000 - (now - recent[0])) / 60_000));
  recent.push(now);
  hits.set(key, recent);
  d.count++;
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= 3600_000)) hits.delete(k);
  return null;
}
