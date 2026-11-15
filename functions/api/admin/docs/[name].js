import { handle } from "../../../_lib.js";

// 관리자 문서 읽기·올리기 (Authorization: Bearer ADMIN_TOKEN). 내용은 Redis에만 보관
const run = (method) =>
  handle(async (request, m, params) => {
    const payload = method === "PUT" ? await request.json().catch(() => null) : null;
    const { status, body } = await m.admin.docEndpoint(method, request.headers.get("authorization"), params.name, payload);
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  });

export const onRequestGet = run("GET");
export const onRequestPut = run("PUT");
