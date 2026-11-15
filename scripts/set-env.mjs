// .env 에 비밀 값을 화면에 보이지 않게 입력해 저장합니다.
//   npm run set-env -- CLOVASTUDIO_API_KEY UPSTAGE_API_KEY
// - 입력한 글자는 화면에 표시되지 않습니다 (붙여넣기 가능)
// - 엔터만 누르면 그 항목은 건너뜁니다 (기존 값 유지)
// - 이미 있는 항목은 교체, 없으면 끝에 추가합니다
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const names = process.argv.slice(2).filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n));
if (!names.length) {
  console.log("사용법: npm run set-env -- 변수이름 [변수이름 ...]");
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.log("터미널에서 직접 실행해 주세요.");
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value.trim());
        }
        if (ch === "\u0003") { process.stdout.write("\n취소했습니다.\n"); process.exit(130); } // Ctrl+C
        if (ch === "\u007f" || ch === "\b") { value = value.slice(0, -1); continue; }
        if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const path = new URL("../.env", import.meta.url);
let text = existsSync(path) ? readFileSync(path, "utf8") : "";
let changed = 0;

for (const name of names) {
  const has = new RegExp(`^${name}=.+$`, "m").test(text);
  const value = await askHidden(`${name} ${has ? "(이미 있음, 엔터=유지)" : "(엔터=건너뛰기)"}: `);
  if (!value) { console.log("  → 건너뜀"); continue; }
  if (/[\r\n]/.test(value)) { console.log("  → 줄바꿈이 들어 있어 건너뜀"); continue; }
  const line = `${name}=${value}`;
  const re = new RegExp(`^#?\\s*${name}=.*$`, "m");
  text = re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  changed++;
  console.log(`  → 저장됨 (${value.length}자)`);
}

if (changed) writeFileSync(path, text, { mode: 0o600 });
console.log(changed ? `\n.env 에 ${changed}개 저장했습니다.` : "\n변경 없음.");
