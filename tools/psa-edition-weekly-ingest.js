#!/usr/bin/env node
// 실브라우저 GemRate 덤프 → 판별 주간 누적 원장(psa-edition-weekly.json). collect-psa-edition-weekly.js 의
// 적재 규칙(append-only·정정 충돌 중단·누적 역행 거부)을 그대로 두고 수집만 덤프로 대체한다(헤드리스 차단 대응).
// Run: node tools/psa-edition-weekly-ingest.js <덤프.json>   (psa-trend-ingest.js 다음에)
const fs = require("node:fs"); const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const { frozenOn } = require("./collect-gemrate-psa-history.js");
const LEDGER = path.join(ROOT, "data/psa-edition-weekly.json");
const dump = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const jpHist = JSON.parse(fs.readFileSync(path.join(ROOT, "data/gemrate-psa-history.json"), "utf8"));
const enTotals = JSON.parse(fs.readFileSync(path.join(ROOT, "data/gemrate-psa-en-totals.json"), "utf8"));
const isWed = (d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 3;
const lastWed = (rows) => [...rows].reverse().find((r) => isWed(r.date))?.date || null;
const targets = {};
for (const code of Object.keys(jpHist.sets)) targets[`${code}|jp`] = { code, ed: "jp" };
for (const [code, s] of Object.entries(enTotals.sets)) if (s) targets[`${code}|en`] = { code, ed: "en" };
const rows = {};
for (const k of Object.keys(targets)) { const [code, ed] = k.split("|"); if (dump[ed]?.[code]) rows[k] = dump[ed][code]; }
const missingSrc = Object.keys(targets).filter((k) => !rows[k]);
if (missingSrc.length) throw new Error("덤프에 없음: " + missingSrc.join(","));
function appendPoint(store, code, ed, point, problems) {
  const arr = ((store.sets[code] ||= {})[ed] ||= []);
  const existing = arr.find((p) => p.d === point.d);
  if (existing) { if (existing.g !== point.g || existing.m !== point.m) problems.push(`${code}/${ed} ${point.d}: 보관 ${existing.g}/${existing.m} → 현재 ${point.g}/${point.m}`); return "dup"; }
  const prev = arr.filter((p) => p.d < point.d).at(-1);
  if (prev && point.g < prev.g) { problems.push(`${code}/${ed} ${point.d}: 누적 역행 ${prev.g} → ${point.g}`); return "reject"; }
  arr.push(point); arr.sort((a, b) => a.d.localeCompare(b.d)); return "added";
}
const store = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
const wed = Object.values(rows).map((r) => lastWed(r)).filter(Boolean).sort()[0];
if (!wed || !isWed(wed)) throw new Error(`기준 수요일을 못 정함(${wed})`);
const problems = []; const tally = { added: 0, dup: 0, reject: 0, missing: 0, frozen: 0 };
// 상류가 그날 갱신하지 않고 전날 누적을 복사한 계열은 그 수요일 점을 넣지 않는다(collect-gemrate-psa-history.js frozenOn, 2026-11-12) —
// 복사본을 누적으로 받으면 앞 주 증가분은 하루치 적고 다음 주는 그만큼 많아진다.
const frozen = frozenOn(rows, wed);
for (const [key, meta] of Object.entries(targets)) {
  const row = rows[key].find((x) => x.date === wed);
  if (!row) { tally.missing += 1; problems.push(`${meta.code}/${meta.ed} ${wed}: 상류에 해당일 행 없음`); continue; }
  if (frozen.has(key)) { tally.frozen += 1; problems.push(`${meta.code}/${meta.ed} ${wed}: 상류가 전날 누적을 그대로 복사(갱신 멈춤) — 버림`); continue; }
  tally[appendPoint(store, meta.code, meta.ed, { d: wed, g: row.total_grades, m: row.total_gems }, problems)] += 1;
}
const conflicts = problems.filter((p) => /보관 .* → 현재/.test(p));
if (conflicts.length) { console.error(JSON.stringify({ status: "conflict", wed, conflicts })); process.exit(1); }
if (!tally.added && !tally.dup) { console.error(`${wed}: 적재된 점이 하나도 없음`); process.exit(1); }
if (!store.weeks.includes(wed)) store.weeks.push(wed);
store.weeks.sort(); store.updated = wed;
if (problems.length) store.problems = [...(store.problems || []), ...problems.map((p) => ({ at: wed, note: p }))];
fs.writeFileSync(LEDGER, `${JSON.stringify(store, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ status: "ok", wed, ...tally, weeks: store.weeks.length, problems }));
