import { handle } from "../../_lib.js";

// 루트 저장 (공유 링크 만들기)
export const onRequestPost = handle(async (request, m) => {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const { status, body: out } = await m.trips.saveTrip(body, m.limit.clientIp(request.headers));
  return Response.json(out, { status });
});
