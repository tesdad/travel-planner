// Cloudflare Pages Functions 공통 처리 (파일명이 _ 로 시작해 주소로 노출되지 않음)
// - lib/ 코드는 처음 불러올 때 process.env 를 읽음 → Cloudflare 환경 변수를 process.env 에 먼저 채운 뒤 불러옴
// - 실제 로직은 lib/ 한 곳에만 있고, Render(server.mjs)·Vercel(api/)·Cloudflare(functions/)가 함께 씀
let modules;

function load(env) {
  globalThis.process ??= {};
  globalThis.process.env ??= {};
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === "string") globalThis.process.env[k] = v;
  }
  modules ??= Promise.all([
    import("../lib/vercel.mjs"),
    import("../lib/planner.mjs"),
    import("../lib/trips.mjs"),
    import("../lib/admin.mjs"),
    import("../lib/limit.mjs"),
    import("../lib/redis.mjs"),
  ]).then(([vercel, planner, trips, admin, limit, redis]) => ({ vercel, planner, trips, admin, limit, redis }));
  return modules;
}

// Cloudflare가 알려 주는 실제 접속자 IP를 x-forwarded-for 로 넘김 (사용량 제한용, 위조 불가)
function withClientIp(request) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return request;
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-for", ip);
  return new Request(request, { headers });
}

/** (request, modules, params) => Response 형태의 함수를 Pages Functions 핸들러로 */
export function handle(fn) {
  return async (context) => {
    try {
      const m = await load(context.env);
      return await fn(withClientIp(context.request), m, context.params || {});
    } catch (err) {
      console.error(err);
      return Response.json({ error: "서버 오류" }, { status: 500 });
    }
  };
}
