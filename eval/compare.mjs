// 모델 비교 실험: 같은 입력을 여러 모델에 보내 품질·속도·비용·형식 오류·장소 실재율을 비교합니다.
//
//   npm run compare                       → 실행 계획과 예상 비용만 출력 (API 호출 없음)
//   npm run compare -- --yes              → 실제 실행
//   npm run compare -- --yes --models haiku,deepseek --features place
//   npm run compare -- --report eval/results/2026-11-14T10-00-00   → 저장된 결과로 리포트만 다시 생성
//   npm run compare -- --yes --models deepseek --into eval/results/2026-11-14T10-00-00   → 특정 모델만 다시 돌려 기존 리포트에 합치기
//
// 결과: eval/results/<시각>/results.json, report.html
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, runOnce } from "./providers.mjs";
import { validate } from "./validate.mjs";
import { TASKS } from "../lib/planner.mjs";
import { enrichPlace, placesStatus } from "../lib/places.mjs";
import { buildReport } from "./report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]] : null)).filter(Boolean),
);

// ---------- 리포트만 다시 만들기 ----------
if (args.report) {
  const dir = String(args.report);
  const results = JSON.parse(await readFile(join(dir, "results.json"), "utf8"));
  await writeFile(join(dir, "report.html"), buildReport(results));
  console.log(`리포트 생성: ${join(dir, "report.html")}`);
  process.exit(0);
}

// ---------- 실행 계획 ----------
const inputs = JSON.parse(await readFile(join(here, "inputs.json"), "utf8"));
const features = String(args.features || "recommend,route,place").split(",").filter((f) => TASKS[f] && inputs[f]);
let models = String(args.models || "opus,sonnet,haiku,deepseek").split(",").filter((m) => MODELS[m]);
const limit = Number(args.limit) || Infinity;
const concurrency = Math.max(1, Number(args.concurrency) || 4);

const missing = [];
if (!process.env.ANTHROPIC_API_KEY) { models = models.filter((m) => MODELS[m].provider !== "claude"); missing.push("ANTHROPIC_API_KEY (Claude 모델 제외됨)"); }
if (!process.env.DEEPSEEK_API_KEY) { models = models.filter((m) => MODELS[m].provider !== "deepseek"); missing.push("DEEPSEEK_API_KEY (DeepSeek 제외됨)"); }

const jobs = [];
for (const f of features) for (const input of inputs[f].slice(0, limit)) for (const m of models) jobs.push({ feature: f, input, model: m });

// 예상 비용: 앱에서 실제 측정한 평균 토큰 수 기준 (DeepSeek는 스키마가 프롬프트에 들어가 입력이 더 큼)
const TYPICAL = { recommend: [1700, 2100], route: [1600, 2700], place: [2400, 1550] };
const estimate = jobs.reduce((sum, j) => {
  const [pin, pout] = MODELS[j.model].price;
  const [tin, tout] = TYPICAL[j.feature];
  return sum + ((MODELS[j.model].provider === "deepseek" ? tin + 1200 : tin) * pin + tout * pout) / 1e6;
}, 0);

console.log("\n모델 비교 실험");
console.log(`  모델:   ${models.map((m) => MODELS[m].label).join(", ") || "(없음)"}`);
console.log(`  기능:   ${features.map((f) => `${f} ${Math.min(inputs[f].length, limit)}개`).join(", ")}`);
console.log(`  호출:   총 ${jobs.length}회 (동시 ${concurrency}개)`);
console.log(`  장소 확인: 카카오 ${placesStatus.kakao ? "켜짐" : "꺼짐"}, 구글 ${placesStatus.google ? "켜짐" : "꺼짐"}`);
console.log(`  예상 비용: 약 $${estimate.toFixed(2)} (약 ${Math.round(estimate * 1400).toLocaleString()}원)`);
if (missing.length) console.log(`  ⚠ 키 없음: ${missing.join(", ")}`);
if (!jobs.length) process.exit(1);
if (!args.yes) {
  console.log("\n실제로 실행하려면 --yes 를 붙이세요:  npm run compare -- --yes\n");
  process.exit(0);
}

// ---------- 실행 ----------
// --into <폴더>: 이전 결과에 합치기 (이번에 돌린 모델의 이전 결과는 교체, 리포트 별점 유지)
const previous = args.into ? JSON.parse(await readFile(join(String(args.into), "results.json"), "utf8")) : null;
const startedAt = previous ? new Date(previous.startedAt) : new Date();
const outDir = previous ? String(args.into) : join(here, "results", startedAt.toISOString().slice(0, 19).replace(/:/g, "-"));
await mkdir(outDir, { recursive: true });

let done = 0;
const results = [];
async function work(job) {
  const r = await runOnce(job.model, job.feature, job.input);
  const errors = r.error ? [r.error] : r.parseError ? [r.parseError] : validate(r.data, TASKS[job.feature].schema);
  if (!r.error && r.stop && !["end_turn", "stop"].includes(r.stop)) errors.unshift(`종료 사유: ${r.stop}`);
  let verified = null;
  // 지역 가이드: 추천 장소가 지도에 실제로 있는지 확인 (환각 비율)
  if (job.feature === "place" && r.data && errors.length === 0) {
    const enriched = await enrichPlace(r.data);
    if (enriched.mapEnabled) {
      r.data = enriched;
      const spots = ["stays", "restaurants", "attractions"].flatMap((k) => enriched[k]);
      verified = { found: spots.filter((s) => s.verified).length, total: spots.length };
    }
  }
  results.push({ ...job, ...r, errors, valid: errors.length === 0, verified });
  done++;
  const tag = errors.length ? `✗ ${errors[0].slice(0, 60)}` : "✓";
  console.log(`[${String(done).padStart(3)}/${jobs.length}] ${MODELS[job.model].label.padEnd(26)} ${job.input.id.padEnd(20)} ${(r.ms / 1000).toFixed(1).padStart(5)}s  $${(r.cost || 0).toFixed(4)}  ${tag}`);
}

const queue = [...jobs];
await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length) await work(queue.shift()); }));

const runCost = results.reduce((s, r) => s + (r.cost || 0), 0);
const payload = previous
  ? {
      ...previous,
      models: { ...previous.models, ...Object.fromEntries(models.map((m) => [m, MODELS[m]])) },
      results: [
        ...previous.results.filter((r) => !(models.includes(r.model) && features.includes(r.feature))),
        ...results,
      ],
    }
  : {
      startedAt: startedAt.toISOString(),
      models: Object.fromEntries(models.map((m) => [m, MODELS[m]])),
      features,
      inputs: Object.fromEntries(features.map((f) => [f, inputs[f].slice(0, limit)])),
      placesStatus,
      results,
    };
await writeFile(join(outDir, "results.json"), JSON.stringify(payload, null, 1));
await writeFile(join(outDir, "report.html"), buildReport(payload));

console.log(`\n완료: 이번 실행 비용 $${runCost.toFixed(3)} (약 ${Math.round(runCost * 1400).toLocaleString()}원)${previous ? " · 이전 결과에 합침" : ""}`);
console.log(`리포트: ${join(outDir, "report.html")}\n`);
