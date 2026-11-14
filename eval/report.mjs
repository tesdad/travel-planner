// 비교 결과를 혼자 열어볼 수 있는 HTML 리포트로 만듭니다 (외부 서버 필요 없음).
export function buildReport(payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>모델 비교 리포트</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<style>
  :root { --bg:#fff; --surface:#f6f7f9; --card:#fff; --ink:#0f1115; --ink2:#3d4350; --muted:#7a808c; --line:#e7e9ee; --accent:#2f6bff; --ok:#0f9d6b; --bad:#d23f31; --star:#f5a524; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d0f13; --surface:#151820; --card:#151820; --ink:#f2f4f7; --ink2:#c4c9d3; --muted:#8b919d; --line:#252a34; --accent:#5b8cff; --ok:#34d399; --bad:#f87171; } }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif; background:var(--bg); color:var(--ink); letter-spacing:-0.01em; line-height:1.55; word-break:keep-all; }
  main { max-width:1400px; margin:0 auto; padding:28px 16px 80px; }
  h1 { font-size:26px; letter-spacing:-0.03em; margin:0 0 4px; }
  h2 { font-size:19px; margin:40px 0 12px; letter-spacing:-0.02em; }
  h3 { font-size:15px; margin:0; }
  .sub { color:var(--muted); font-size:14px; }
  .bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:18px 0; }
  .bar button, .bar label { font:inherit; font-size:14px; height:38px; padding:0 14px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
  .bar button.on { background:var(--ink); color:var(--bg); border-color:var(--ink); }
  .table-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:12px; }
  table { width:100%; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums; }
  th, td { padding:10px 12px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
  th:first-child, td:first-child { text-align:left; }
  th { font-size:12.5px; color:var(--muted); font-weight:600; background:var(--surface); }
  tr:last-child td { border-bottom:0; }
  .best { color:var(--ok); font-weight:700; }
  .note { font-size:13px; color:var(--muted); margin-top:8px; }
  .input-head { background:var(--surface); border-radius:12px; padding:12px 16px; margin:28px 0 12px; }
  .input-head .id { font-size:12px; color:var(--muted); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; }
  .cell { border:1px solid var(--line); border-radius:14px; background:var(--card); padding:14px; display:flex; flex-direction:column; min-width:0; }
  .cell-top { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; }
  .who { font-weight:800; font-size:15px; }
  .metrics { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .ok { color:var(--ok); } .bad { color:var(--bad); }
  .errs { font-size:12.5px; color:var(--bad); background:color-mix(in srgb,var(--bad) 8%,transparent); border-radius:8px; padding:8px 10px; margin-bottom:8px; }
  .content { font-size:13.5px; color:var(--ink2); max-height:520px; overflow:auto; flex:1; }
  .content b { color:var(--ink); }
  .content .item { padding:6px 0; border-bottom:1px dashed var(--line); }
  .content .item:last-child { border-bottom:0; }
  .content .day { font-weight:700; color:var(--ink); margin:10px 0 4px; }
  .content .sched { font-size:12.5px; padding-left:4px; }
  .content .sec { font-weight:700; color:var(--ink); margin:10px 0 2px; font-size:13px; }
  .v-ok { color:var(--ok); font-size:12px; } .v-no { color:var(--bad); font-size:12px; }
  .stars { display:flex; gap:2px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line); align-items:center; }
  .stars button { border:0; background:none; font-size:22px; line-height:1; cursor:pointer; color:var(--line); padding:0 1px; }
  .stars button.on { color:var(--star); }
  .stars span { font-size:12px; color:var(--muted); margin-left:6px; }
  details { margin-top:8px; font-size:12px; }
  details pre { white-space:pre-wrap; word-break:break-all; max-height:300px; overflow:auto; background:var(--surface); padding:8px; border-radius:8px; }
</style>
</head>
<body>
<main>
  <h1>모델 비교 리포트</h1>
  <div class="sub" id="meta"></div>
  <div class="bar">
    <button id="blind" class="on">블라인드 모드 (모델 이름 숨김)</button>
    <button id="export">평가 내보내기 (JSON)</button>
    <button id="reset">평가 초기화</button>
  </div>

  <h2>요약</h2>
  <div class="table-wrap"><table id="summary"></table></div>
  <div class="note">
    · <b>여행 1건 비용</b> = 여행지 추천 1회 + 상세 루트 1회 + 지역 가이드 3회 기준 (환율 1,400원 가정)<br>
    · <b>형식 통과</b> = 앱 화면에 그대로 표시할 수 있는 결과 비율 (JSON 스키마 검사)<br>
    · <b>장소 실재율</b> = 지역 가이드가 추천한 장소 중 카카오(국내)·구글(해외)에서 실제로 찾은 비율<br>
    · <b>내 평가</b> = 아래에서 매긴 별점 평균 (이 브라우저에 저장)
  </div>

  <div id="sections"></div>
</main>
<script>
const P = ${json};
const KRW = 1400;
const NAMES = { recommend: "여행지 추천", route: "상세 루트", place: "지역 가이드" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const models = Object.keys(P.models);
const RKEY = "cmp-ratings:" + P.startedAt;
let ratings = {}; try { ratings = JSON.parse(localStorage.getItem(RKEY)) || {}; } catch {}
let blind = true;
const saveRatings = () => { try { localStorage.setItem(RKEY, JSON.stringify(ratings)); } catch {} };

document.getElementById("meta").textContent =
  new Date(P.startedAt).toLocaleString("ko-KR") + " 실행 · 호출 " + P.results.length + "회 · 실제 비용 $" +
  P.results.reduce((s, r) => s + (r.cost || 0), 0).toFixed(3) +
  " · 장소 확인: 카카오 " + (P.placesStatus.kakao ? "켜짐" : "꺼짐") + ", 구글 " + (P.placesStatus.google ? "켜짐" : "꺼짐");

// 입력마다 모델 순서를 섞어 A/B/C/D로 표시 (같은 입력이면 항상 같은 순서)
function order(inputId) {
  let h = 0; for (const c of inputId + P.startedAt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const arr = [...models];
  for (let i = arr.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
const find = (feature, id, m) => P.results.find((r) => r.feature === feature && r.input.id === id && r.model === m);

// ---------- 요약 ----------
function avg(list, f) { const v = list.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function renderSummary() {
  const rows = models.map((m) => {
    const rs = P.results.filter((r) => r.model === m);
    const ok = rs.filter((r) => r.valid);
    const fcost = (f) => avg(rs.filter((r) => r.feature === f && !r.error), (r) => r.cost);
    const trip = ["recommend", "route", "place"].every((f) => fcost(f) != null) ? fcost("recommend") + fcost("route") + 3 * fcost("place") : null;
    const ver = (kr) => {
      const v = rs.filter((r) => r.verified && (r.data?.isKorea !== false) === kr);
      const found = v.reduce((s, r) => s + r.verified.found, 0), total = v.reduce((s, r) => s + r.verified.total, 0);
      return total ? found / total : null;
    };
    const myStars = Object.entries(ratings).filter(([k]) => k.endsWith("|" + m)).map(([, v]) => v);
    return {
      m, label: P.models[m].label, n: rs.length, pass: rs.length ? ok.length / rs.length : null,
      sec: avg(rs.filter((r) => !r.error), (r) => r.ms / 1000), out: avg(rs.filter((r) => !r.error), (r) => r.outTokens),
      rec: fcost("recommend"), route: fcost("route"), place: fcost("place"), trip,
      verKr: ver(true), verIntl: ver(false),
      stars: myStars.length ? myStars.reduce((a, b) => a + b, 0) / myStars.length : null, starsN: myStars.length,
    };
  });
  const cols = [
    ["label", "모델", null], ["pass", "형식 통과", "max", (v) => Math.round(v * 100) + "%"],
    ["sec", "평균 시간", "min", (v) => v.toFixed(1) + "s"], ["out", "평균 출력 토큰", null, (v) => Math.round(v).toLocaleString()],
    ["rec", "추천 1회", "min", (v) => "$" + v.toFixed(4)], ["route", "루트 1회", "min", (v) => "$" + v.toFixed(4)], ["place", "지역 1회", "min", (v) => "$" + v.toFixed(4)],
    ["trip", "여행 1건 비용", "min", (v) => "₩" + Math.round(v * KRW).toLocaleString()],
    ["verKr", "장소 실재율 (국내)", "max", (v) => Math.round(v * 100) + "%"], ["verIntl", "장소 실재율 (해외)", "max", (v) => Math.round(v * 100) + "%"],
    ["stars", "내 평가", "max", (v, r) => "★ " + v.toFixed(2) + " (" + r.starsN + ")"],
  ];
  const best = {};
  for (const [k, , dir] of cols) {
    if (!dir) continue;
    const vals = rows.map((r) => r[k]).filter((v) => v != null);
    if (vals.length > 1) best[k] = dir === "max" ? Math.max(...vals) : Math.min(...vals);
  }
  document.getElementById("summary").innerHTML =
    "<tr>" + cols.map(([, h]) => "<th>" + h + "</th>").join("") + "</tr>" +
    rows.map((r) => "<tr>" + cols.map(([k, , , fmt]) => {
      const v = r[k];
      if (k === "label") return "<td><b>" + esc(v) + "</b></td>";
      return "<td class='" + (best[k] != null && v === best[k] ? "best" : "") + "'>" + (v == null ? "-" : fmt(v, r)) + "</td>";
    }).join("") + "</tr>").join("");
}

// ---------- 결과 내용 표시 ----------
const R = {
  recommend: (d) => (d.destinations || []).map((x) => \`<div class="item"><b>\${esc(x.name)}</b> · \${esc(x.region)}<br>\${esc(x.summary)}<br><span class="metrics">\${esc((x.highlights || []).join(" · "))}</span><br><span class="metrics">시기 \${esc(x.bestSeason)} · 경비 \${esc(x.estimatedBudget)}</span><br><i>\${esc(x.whyFit)}</i></div>\`).join(""),
  route: (d) => \`<b>\${esc(d.title)}</b><br>\${esc(d.overview)}<br><span class="metrics">지역: \${esc((d.regions || []).join(" → "))}</span>\` +
    (d.days || []).map((day) => \`<div class="day">DAY \${day.day} · \${esc(day.theme)}</div>\` +
      (day.schedule || []).map((s) => \`<div class="sched"><b>\${esc(s.time)}</b> \${esc(s.place)} — \${esc(s.activity)}\${s.transport ? \` <span class="metrics">(\${esc(s.transport)})</span>\` : ""}</div>\`).join("") +
      \`<div class="sched metrics">숙박: \${esc(day.accommodation)}</div>\`).join("") +
    ((d.tips || []).length ? \`<div class="sec">팁</div>\` + d.tips.map((t) => \`<div class="sched">· \${esc(t)}</div>\`).join("") : ""),
  place: (d) => \`\${esc(d.intro)}\` + [["stays", "숙소"], ["restaurants", "맛집"], ["attractions", "관광"]].map(([k, t]) =>
    \`<div class="sec">\${t}</div>\` + (d[k] || []).map((s) => \`<div class="item"><b>\${esc(s.name)}</b> <span class="metrics">\${esc(s.category)} · \${esc(s.priceRange)}</span>
      \${d.mapEnabled ? (s.verified ? \`<div class="v-ok">✓ 지도에서 확인: \${esc(s.verified.address)}</div>\` : \`<div class="v-no">✗ 지도에서 찾지 못함</div>\`) : ""}
      <div>\${esc(s.description)}</div></div>\`).join("")).join(""),
};

function inputText(f, i) {
  if (f === "recommend") return \`\${i.scope === "domestic" ? "국내" : "해외"} · \${i.style} · \${i.duration}\${i.extra ? " · 추가: " + i.extra : ""}\`;
  if (f === "route") return \`\${i.route} · \${i.duration} · \${i.transport}\${i.extra ? " · 추가: " + i.extra : ""}\`;
  return \`지역: \${i.region}\`;
}

function cell(f, input, m, idx) {
  const r = find(f, input.id, m);
  const who = blind ? "모델 " + "ABCDEFG"[idx] : P.models[m].label;
  const key = input.id + "|" + m;
  if (!r) return "";
  const metrics = r.error ? "" : \`\${(r.ms / 1000).toFixed(1)}s · $\${(r.cost || 0).toFixed(4)} · 출력 \${r.outTokens.toLocaleString()} 토큰\` +
    (r.verified ? \` · 장소 \${r.verified.found}/\${r.verified.total}\` : "") + (r.servedBy && !blind && r.servedBy !== P.models[m].id ? \` · 실제 응답: \${esc(r.servedBy)}\` : "");
  const stars = [1, 2, 3, 4, 5].map((n) => \`<button data-k="\${esc(key)}" data-n="\${n}" class="\${(ratings[key] || 0) >= n ? "on" : ""}" aria-label="\${n}점">★</button>\`).join("");
  return \`<div class="cell">
    <div class="cell-top"><span class="who">\${esc(who)}</span><span class="\${r.valid ? "ok" : "bad"}">\${r.valid ? "✓ 형식 통과" : "✗ 실패"}</span></div>
    <div class="metrics" style="margin-bottom:8px">\${metrics}</div>
    \${r.errors.length ? \`<div class="errs">\${r.errors.map(esc).join("<br>")}</div>\` : ""}
    <div class="content">\${r.data ? R[f](r.data) : ""}</div>
    <div class="stars">\${stars}<span>\${ratings[key] ? ratings[key] + "점" : "평가하기"}</span></div>
    <details><summary>원본 응답</summary><pre>\${esc(r.data ? JSON.stringify(r.data, null, 1) : r.raw || r.error || "")}</pre></details>
  </div>\`;
}

function renderSections() {
  document.getElementById("sections").innerHTML = P.features.map((f) =>
    \`<h2>\${NAMES[f] || f}</h2>\` + P.inputs[f].map((input) =>
      \`<div class="input-head"><div class="id">\${esc(input.id)}</div><h3>\${esc(inputText(f, input))}</h3></div>
       <div class="grid">\${order(input.id).map((m, i) => cell(f, input, m, i)).join("")}</div>\`).join("")).join("");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest(".stars button");
  if (b) { ratings[b.dataset.k] = Number(b.dataset.n); saveRatings(); renderSections(); renderSummary(); }
});
document.getElementById("blind").onclick = (e) => { blind = !blind; e.target.classList.toggle("on", blind); renderSections(); };
document.getElementById("reset").onclick = () => { if (confirm("이 리포트의 별점을 모두 지울까요?")) { ratings = {}; saveRatings(); renderSections(); renderSummary(); } };
document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify({ startedAt: P.startedAt, ratings }, null, 1)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "ratings.json" });
  a.click();
};
renderSummary(); renderSections();
</script>
</body>
</html>`;
}
