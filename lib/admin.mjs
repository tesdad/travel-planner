// 관리자 전용 기능 인증: 환경변수 ADMIN_TOKEN 과 Authorization: Bearer <토큰> 비교
import { timingSafeEqual } from "node:crypto";
import { usageReport } from "./usage.mjs";

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
