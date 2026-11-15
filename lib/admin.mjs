// 관리자 전용 기능 인증: 환경변수 ADMIN_TOKEN 과 Authorization: Bearer <토큰> 비교
import { timingSafeEqual } from "node:crypto";
import { usageReport } from "./usage.mjs";
import { redis, redisReady } from "./redis.mjs";

export function isAdmin(authHeader) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 12) return false; // 미설정·너무 짧은 토큰이면 항상 거부
  const given = String(authHeader || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** { status, body } 반환 */
export async function usageEndpoint(authHeader, daysParam) {
  if (!isAdmin(authHeader)) return { status: 401, body: { error: "관리자 토큰이 필요합니다." } };
  const days = Math.min(90, Math.max(1, Number(daysParam) || 7));
  try {
    return { status: 200, body: await usageReport(days) };
  } catch (err) {
    console.error("usage report failed:", err.message);
    return { status: 500, body: { error: "사용량을 불러오지 못했습니다." } };
  }
}

// ---------- 관리자 문서 (비용 관리 가이드 등) ----------
// 내용은 공개 저장소에 두지 않고 Redis에만 보관합니다. 읽기·쓰기 모두 ADMIN_TOKEN 필요.
// 올리기: npm run upload-doc -- cost-guide private/cost-guide.html
const DOC_NAMES = /^[a-z0-9-]{1,40}$/;
const MAX_DOC = 90_000;

/** method: GET | PUT. { status, body } 반환 */
export async function docEndpoint(method, authHeader, name, payload) {
  if (!isAdmin(authHeader)) return { status: 401, body: { error: "관리자 토큰이 필요합니다." } };
  if (!DOC_NAMES.test(name || "")) return { status: 400, body: { error: "잘못된 문서 이름입니다." } };
  if (!redisReady) return { status: 503, body: { error: "저장소(Redis)가 설정되지 않았습니다." } };
  const key = `admin:doc:${name}`;
  try {
    if (method === "PUT") {
      const html = payload?.html;
      if (typeof html !== "string" || !html.trim()) return { status: 400, body: { error: "html 값이 필요합니다." } };
      if (html.length > MAX_DOC) return { status: 413, body: { error: "문서가 너무 큽니다." } };
      await redis([["SET", key, html]]);
      return { status: 200, body: { saved: true, length: html.length } };
    }
    const [html] = await redis([["GET", key]]);
    if (!html) return { status: 404, body: { error: "문서가 아직 올라가지 않았습니다." } };
    return { status: 200, body: { html } };
  } catch (err) {
    console.error("admin doc failed:", err.message);
    return { status: 500, body: { error: "문서를 처리하지 못했습니다." } };
  }
}
