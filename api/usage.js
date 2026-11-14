import { usageEndpoint } from "../lib/admin.mjs";

export async function GET(request) {
  const days = new URL(request.url).searchParams.get("days");
  const { status, body } = await usageEndpoint(request.headers.get("authorization"), days);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
