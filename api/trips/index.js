import { saveTrip } from "../../lib/trips.mjs";
import { clientIp } from "../../lib/limit.mjs";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const { status, body: out } = await saveTrip(body, clientIp(request.headers));
  return Response.json(out, { status });
}
