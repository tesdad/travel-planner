import { handle } from "../_lib.js";

// 관리자: AI 사용량·비용 리포트 (Authorization: Bearer ADMIN_TOKEN)
export const onRequestGet = handle(async (request, m) => {
  const days = new URL(request.url).searchParams.get("days");
  const { status, body } = await m.admin.usageEndpoint(request.headers.get("authorization"), days);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
});
