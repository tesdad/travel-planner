// 일반 Node 서버 (로컬 실행 · Render 배포용)
// Vercel에서는 이 파일 대신 api/*.js 함수가 사용됩니다.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlanner } from "./lib/planner.mjs";
import { checkLimit, clientIp, limitBackend } from "./lib/limit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const key = process.env.ANTHROPIC_API_KEY || "";
if (!key || !key.startsWith("sk-ant-") || key.includes("여기에")) {
  console.warn("⚠️  ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일에 실제 API 키를 넣고 서버를 다시 시작하세요.");
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e5) reject(new Error("too large"));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); }
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    const name = req.url.match(/^\/api\/(recommend|route|place)$/)?.[1];
    if (req.method === "POST" && name) {
      const body = await readBody(req);
      const ip = clientIp(req.headers, req.socket.remoteAddress);
      const { status, body: out } = await runPlanner(name, body, { checkLimit: () => checkLimit(ip) });
      return sendJson(res, status, out);
    }

    if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 200, { ok: true });

    if (req.method === "GET") {
      const pathname = req.url.split("?")[0];
      const path = pathname === "/" ? "/index.html" : pathname;
      if (path.includes("..")) return sendJson(res, 400, { error: "bad path" });
      const file = await readFile(join(__dirname, "public", path)).catch(() => null);
      if (!file) return sendJson(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
      return res.end(file);
    }

    sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    console.error(err);
    sendJson(res, 400, { error: "잘못된 요청입니다." });
  }
});

server.listen(PORT, () => console.log(`여행 플래너 실행 중: http://localhost:${PORT} (사용량 제한: ${limitBackend})`));
