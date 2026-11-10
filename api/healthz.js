import { limitBackend } from "../lib/limit.mjs";

export function GET() {
  return Response.json({ ok: true, rateLimit: limitBackend });
}
