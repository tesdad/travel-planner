// 루트 저장 · 불러오기 (공유 링크용)
// - Upstash Redis가 있으면 Redis에 1년간 보관
// - 없으면 서버 메모리에 임시 보관 (서버가 재시작되면 사라짐 → 응답에 temporary: true)
import { randomBytes } from "node:crypto";
import { redis, redisReady } from "./redis.mjs";
import { checkLimit } from "./limit.mjs";

const TTL_SECONDS = 60 * 60 * 24 * 365; // 1년
const MAX_ROUTE_JSON = 40000;
const MAX_TEXT = 500;
const ID_RE = /^[A-Za-z0-9]{10}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // 헷갈리는 문자 제외

const memory = new Map(); // id -> { json, expires }

function newId() {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function validateTrip(body) {
  if (!body || typeof body !== "object") return "잘못된 요청입니다.";
  const { route, input } = body;
  if (!route || typeof route !== "object" || !Array.isArray(route.days) || typeof route.title !== "string") {
    return "저장할 루트 정보가 올바르지 않습니다.";
  }
  if (JSON.stringify(route).length > MAX_ROUTE_JSON) return "루트가 너무 깁니다.";
  if (input != null) {
    if (typeof input !== "object") return "잘못된 요청입니다.";
    for (const k of ["route", "duration", "transport", "extra"]) {
      if (input[k] != null && (typeof input[k] !== "string" || input[k].length > MAX_TEXT)) return "잘못된 요청입니다.";
    }
  }
  return null;
}

/** { status, body } 반환 */
export async function saveTrip(body, ip) {
  const invalid = validateTrip(body);
  if (invalid) return { status: 400, body: { error: invalid } };
  const limited = await checkLimit(ip, "save");
  if (limited) return { status: 429, body: { error: limited } };

  const { route, input = {} } = body;
  const record = {
    v: 1,
    savedAt: new Date().toISOString(),
    input: { route: input.route || "", duration: input.duration || "", transport: input.transport || "", extra: input.extra || "" },
    route,
  };
  const json = JSON.stringify(record);
  const id = newId();
  try {
    if (redisReady) {
      const [ok] = await redis([["SET", `trip:${id}`, json, "EX", String(TTL_SECONDS), "NX"]]);
      if (ok !== "OK") throw new Error("id collision");
    } else {
      memory.set(id, { json, expires: Date.now() + TTL_SECONDS * 1000 });
    }
  } catch (err) {
    console.error("trip save failed:", err.message);
    return { status: 500, body: { error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." } };
  }
  return { status: 200, body: { id, temporary: !redisReady } };
}

export async function getTrip(id) {
  if (!ID_RE.test(id || "")) return { status: 404, body: { error: "여행을 찾을 수 없습니다." } };
  try {
    let json = null;
    if (redisReady) {
      [json] = await redis([["GET", `trip:${id}`]]);
    } else {
      const hit = memory.get(id);
      if (hit && hit.expires > Date.now()) json = hit.json;
    }
    if (!json) return { status: 404, body: { error: "여행을 찾을 수 없습니다. 링크가 만료되었거나 잘못된 주소예요." } };
    return { status: 200, body: { id, ...JSON.parse(json) } };
  } catch (err) {
    console.error("trip load failed:", err.message);
    return { status: 500, body: { error: "불러오기에 실패했습니다. 잠시 후 다시 시도해 주세요." } };
  }
}
