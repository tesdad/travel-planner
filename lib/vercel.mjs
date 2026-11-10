// Vercel 서버리스 함수용 공통 처리 (api/*.js 에서 사용)
import { runPlanner } from "./planner.mjs";
import { checkLimit, clientIp } from "./limit.mjs";

export function plannerFunction(name) {
  return async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
    const ip = clientIp(request.headers);
    const { status, body: out } = await runPlanner(name, body, { checkLimit: () => checkLimit(ip) });
    return Response.json(out, { status });
  };
}
