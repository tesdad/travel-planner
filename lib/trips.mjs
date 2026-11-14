// 루트 저장 · 불러오기 (공유 링크용)
// - Upstash Redis가 있으면 Redis에 90일간 보관
// - 저장할 때 삭제 키를 발급 → 저장한 사람만 공유를 중지(삭제)할 수 있음 (서버에는 키의 해시만 보관)
// - 개인정보 최소화: 자유 입력(추가 요청)은 저장하지 않고, 저장한 사람의 IP도 남기지 않음
// - 없으면 서버 메모리에 임시 보관 (서버가 재시작되면 사라짐 → 응답에 temporary: true)
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redis, redisReady } from "./redis.mjs";
import { checkLimit } from "./limit.mjs";

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90일
const MAX_ROUTE_JSON = 40000;
const MAX_TEXT = 500;
const ID_RE = /^[A-Za-z0-9]{10}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // 헷갈리는 문자 제외

const memory = new Map(); // id -> { json, expires }

function newId(len = 10) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

function validateTrip(body) {
  if (!body || typeof body !== "object") return "잘못된 요청입니다.";
  const { route, input } = body;
  if (!route || typeof route !== "object" || !Array.isArray(route.days) || typeof route.title !== "string") {
    return "저장할 루트 정보가 올바르지 않습니다.";
  }
  if (JSON.stringify(route).length > MAX_ROUTE_JSON) return "루트가 너무 깁니다.";
  if (input != null) {
    if (typeof input !== "object") return "잘못된 요청입니다.";
    for (const k of ["route", "duration", "transport"]) {
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
  const deleteKey = newId(24);
  const record = {
    v: 2,
    savedAt: new Date().toISOString(),
    input: { route: input.route || "", duration: input.duration || "", transport: input.transport || "" },
    route,
    deleteHash: sha256(deleteKey),
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
  return { status: 200, body: { id, deleteKey, temporary: !redisReady, expiresInDays: TTL_SECONDS / 86400 } };
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
    const { deleteHash, ...trip } = JSON.parse(json); // 삭제 키 해시는 내보내지 않음
    return { status: 200, body: { id, ...trip } };
  } catch (err) {
    console.error("trip load failed:", err.message);
    return { status: 500, body: { error: "불러오기에 실패했습니다. 잠시 후 다시 시도해 주세요." } };
  }
}

/** 공유 중지: 저장할 때 받은 삭제 키가 맞으면 삭제 */
export async function deleteTrip(id, key) {
  if (!ID_RE.test(id || "") || typeof key !== "string" || key.length !== 24) {
    return { status: 403, body: { error: "삭제 권한이 없습니다." } };
  }
  try {
    let json = null;
    if (redisReady) [json] = await redis([["GET", `trip:${id}`]]);
    else json = memory.get(id)?.json ?? null;
    if (!json) return { status: 200, body: { deleted: true } }; // 이미 없음
    const { deleteHash } = JSON.parse(json);
    const a = Buffer.from(sha256(key)), b = Buffer.from(String(deleteHash || ""));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 403, body: { error: "삭제 권한이 없습니다." } };
    if (redisReady) await redis([["DEL", `trip:${id}`]]);
    else memory.delete(id);
    return { status: 200, body: { deleted: true } };
  } catch (err) {
    console.error("trip delete failed:", err.message);
    return { status: 500, body: { error: "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요." } };
  }
}
