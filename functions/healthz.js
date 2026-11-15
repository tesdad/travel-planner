import { handle } from "./_lib.js";

export const onRequestGet = handle(async (request, m) =>
  Response.json({
    ok: true,
    rateLimit: m.limit.limitBackend,
    storage: m.redis.redisReady ? "redis" : "memory",
    ai: m.planner.AI_PROVIDER,
    fallback: m.planner.AI_FALLBACK,
  }),
);
