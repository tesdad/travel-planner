import { getTrip, deleteTrip } from "../../lib/trips.mjs";

export async function GET(request) {
  const id = new URL(request.url).pathname.split("/").pop();
  const { status, body } = await getTrip(id);
  return Response.json(body, { status });
}

export async function DELETE(request) {
  const id = new URL(request.url).pathname.split("/").pop();
  const { status, body } = await deleteTrip(id, request.headers.get("x-delete-key"));
  return Response.json(body, { status });
}
