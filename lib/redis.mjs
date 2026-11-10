// Upstash Redis (REST) 공용 클라이언트
// Vercel Marketplace 연결 시 KV_REST_API_*, Upstash 직접 가입 시 UPSTASH_REDIS_REST_* 이름으로 들어옵니다.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisReady = Boolean(URL_ && TOKEN);

/** 여러 명령을 한 번에 실행. 각 명령의 result 배열 반환 */
export async function redis(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Upstash: ${failed.error}`);
  return out.map((r) => r.result);
}
