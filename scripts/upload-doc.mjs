// 관리자 문서를 사이트(Redis)에 올립니다. 원본은 private/ (gitignore)에 둡니다.
// 사용: npm run upload-doc -- cost-guide private/cost-guide.html [https://travelroute-ai.com]
import { readFile } from "node:fs/promises";

const [name, file, base = "https://travelroute-ai.com"] = process.argv.slice(2);
if (!name || !file) {
  console.error("사용법: npm run upload-doc -- <문서이름> <파일> [사이트 주소]");
  process.exit(1);
}
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error(".env에 ADMIN_TOKEN이 없습니다.");
  process.exit(1);
}
const html = await readFile(file, "utf8");
const res = await fetch(`${base}/api/admin/docs/${encodeURIComponent(name)}`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ html }),
});
console.log(res.status, JSON.stringify(await res.json().catch(() => ({}))));
process.exit(res.ok ? 0 : 1);
