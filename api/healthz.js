import { limitBackend } from "../lib/limit.mjs";
import { redisReady } from "../lib/redis.mjs";
import { AI_PROVIDER, AI_FALLBACK } from "../lib/planner.mjs";

export function GET() {
  return Response.json({ ok: true, rateLimit: limitBackend, storage: redisReady ? "redis" : "memory", ai: AI_PROVIDER, fallback: AI_FALLBACK });
}
