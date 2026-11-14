// AI 결과 캐시 — 같은 질문에는 Claude를 다시 부르지 않습니다.
// Redis가 있으면 Redis에(모든 서버 공유), 없으면 서버 메모리에(최대 500개) 저장합니다.
import { redis, redisReady } from "./redis.mjs";

const MAX_MEMORY_ITEMS = 500;
const memory = new Map(); // key -> { json, expires }

export async function getCached(key) {
  try {
    if (redisReady) {
      const [json] = await redis([["GET", `cache:${key}`]]);
      return json ? JSON.parse(json) : null;
    }
    const hit = memory.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) { memory.delete(key); return null; }
    return JSON.parse(hit.json);
  } catch (err) {
    console.error("cache read error:", err.message);
    return null; // 캐시 장애 시 그냥 AI 호출
  }
}

export async function setCached(key, value, ttlSeconds) {
  const json = JSON.stringify(value);
  try {
    if (redisReady) {
      await redis([["SET", `cache:${key}`, json, "EX", String(ttlSeconds)]]);
      return;
    }
    memory.set(key, { json, expires: Date.now() + ttlSeconds * 1000 });
    if (memory.size > MAX_MEMORY_ITEMS) memory.delete(memory.keys().next().value);
  } catch (err) {
    console.error("cache write error:", err.message);
  }
}

/** 캐시 키용 정규화: 공백·대소문자·쉼표 순서 차이를 없앰 */
export const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
export const normList = (s) =>
  String(s || "").split(/[,·/]/).map(norm).filter(Boolean).sort().join(",");
