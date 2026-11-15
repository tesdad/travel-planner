// AI 결과 검사 — 스키마 강제 기능이 없는 모델(DeepSeek)의 응답이 화면에 내보낼 만한지 판단합니다.
// 문제 목록을 반환하고, 비어 있으면 통과입니다.
import { validate } from "./schema.mjs";

/** "2박 3일" → 3, "3일" → 3, "당일" → 1, 알 수 없으면 null */
export function expectedDays(duration) {
  const s = String(duration || "").replace(/\s+/g, "");
  let m = s.match(/(\d+)박(\d+)일/);
  if (m) return Number(m[2]);
  m = s.match(/(\d+)박/);
  if (m) return Number(m[1]) + 1;
  m = s.match(/(\d+)일/);
  if (m) return Number(m[1]);
  if (/당일/.test(s)) return 1;
  return null;
}

const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

function checkDays(days, problems) {
  days.forEach((d, i) => {
    if (d.day !== i + 1) problems.push(`날짜 번호가 순서대로가 아님 (${i + 1}번째가 Day ${d.day})`);
    if (!d.schedule.length) problems.push(`Day ${d.day} 일정이 비어 있음`);
  });
  const repeated = dupes(days.map((d) => JSON.stringify(d.schedule.map((s) => [s.time, s.place]))));
  if (repeated.length) problems.push("같은 날 일정이 반복됨");
}

export function checkResult(feature, data, schema, body = {}) {
  const schemaErrors = validate(data, schema);
  if (schemaErrors.length) return schemaErrors.slice(0, 3);
  const problems = [];

  if (feature === "recommend") {
    if (data.destinations.length !== 3) problems.push(`추천 수가 ${data.destinations.length}곳`);
    if (dupes(data.destinations.map((d) => d.name)).length) problems.push("추천 여행지 중복");
  }

  if (feature === "route" || feature === "refine") {
    if (!data.days.length) problems.push("일정 없음");
    checkDays(data.days, problems);
    const want = feature === "route" ? expectedDays(body.duration) : null;
    if (want && data.days.length !== want) problems.push(`요청 ${want}일인데 ${data.days.length}일 일정`);
    if (feature === "refine" && body.current?.days?.length && Math.abs(data.days.length - body.current.days.length) > 1) {
      problems.push(`수정 전 ${body.current.days.length}일 → ${data.days.length}일로 크게 바뀜`);
    }
  }

  if (feature === "place") {
    for (const k of ["stays", "restaurants", "attractions"]) {
      if (data[k].length < 2) problems.push(`${k} ${data[k].length}곳뿐`);
    }
    const names = ["stays", "restaurants", "attractions"].flatMap((k) => data[k].map((s) => s.name));
    if (dupes(names).length) problems.push("장소 중복");
  }
  return problems;
}
