// 사용량 제한 (API 크레딧 보호)
// - Upstash Redis 환경변수가 있으면 Redis에 기록 (Vercel처럼 서버가 여러 개로 나뉘는 환경용)
// - 없으면 서버 메모리에 기록 (Render처럼 서버 한 대가 계속 켜져 있는 환경용)

const PER_IP_HOURLY = Number(process.env.RATE_LIMIT_PER_HOUR) || 20; // IP당 시간당 요청 수
const GLOBAL_DAILY = Number(process.env.DAILY_LIMIT) || 300; // 전체 하루 요청 수

// Vercel Marketplace(Upstash) 연결 시 KV_REST_API_*, Upstash 직접 가입 시 UPSTASH_REDIS_REST_* 이름으로 들어옴
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const limitBackend = REDIS_URL && REDIS_TOKEN ? "redis" : "memory";

const hourMsg = (min) => `요청 한도(시간당 ${PER_IP_HOURLY}회)를 초과했습니다. 약 ${min}분 후 다시 시도해 주세요.`;
const dayMsg = "오늘 서비스 사용량이 모두 소진되었습니다. 내일 다시 이용해 주세요.";

export function clientIp(headers, fallback = "") {
  const get = (k) => (typeof headers.get === "function" ? headers.get(k) : headers[k]);
  const fwd = get("x-forwarded-for");
  return (fwd ? String(fwd).split(",")[0] : get("x-real-ip") || fallback || "unknown").trim();
}

/** 한도 초과면 안내 문구, 아니면 null */
export async function checkLimit(ip) {
  return limitBackend === "redis" ? checkRedis(ip) : checkMemory(ip);
}

// ---------- Redis (고정 시간 창) ----------
async function checkRedis(ip) {
  const now = new Date();
  const hourKey = `rl:ip:${ip}:${now.toISOString().slice(0, 13)}`; // 예: 2026-11-10T08
  const dayKey = `rl:day:${now.toISOString().slice(0, 10)}`;
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", hourKey], ["EXPIRE", hourKey, "3600"],
        ["INCR", dayKey], ["EXPIRE", dayKey, "86400"],
      ]),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const [[, hourCount], , [, dayCount]] = (await res.json()).map((r) => [r.error, r.result]);
    if (dayCount > GLOBAL_DAILY) return dayMsg;
    if (hourCount > PER_IP_HOURLY) return hourMsg(60 - now.getUTCMinutes());
    return null;
  } catch (err) {
    console.error("rate limit store error:", err.message);
    return checkMemory(ip); // Redis 장애 시에도 최소한의 보호
  }
}

// ---------- 메모리 (슬라이딩 창) ----------
const ipHits = new Map(); // ip -> [timestamp, ...]
let daily = { day: new Date().toDateString(), count: 0 };

function checkMemory(ip) {
  const now = Date.now();
  const today = new Date().toDateString();
  if (daily.day !== today) daily = { day: today, count: 0 };
  if (daily.count >= GLOBAL_DAILY) return dayMsg;

  const recent = (ipHits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_IP_HOURLY) return hourMsg(Math.ceil((3600_000 - (now - recent[0])) / 60_000));
  recent.push(now);
  ipHits.set(ip, recent);
  daily.count++;
  if (ipHits.size > 5000) for (const [k, v] of ipHits) if (v.every((t) => now - t >= 3600_000)) ipHits.delete(k);
  return null;
}
