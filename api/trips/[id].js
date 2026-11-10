import { getTrip } from "../../lib/trips.mjs";

export async function GET(request) {
  const id = new URL(request.url).pathname.split("/").pop();
  const { status, body } = await getTrip(id);
  return Response.json(body, { status });
}
