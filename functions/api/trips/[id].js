import { handle } from "../../_lib.js";

// 저장된 루트 불러오기 / 공유 중지(삭제)
export const onRequestGet = handle(async (request, m, params) => {
  const { status, body } = await m.trips.getTrip(params.id);
  return Response.json(body, { status });
});

export const onRequestDelete = handle(async (request, m, params) => {
  const { status, body } = await m.trips.deleteTrip(params.id, request.headers.get("x-delete-key"));
  return Response.json(body, { status });
});
