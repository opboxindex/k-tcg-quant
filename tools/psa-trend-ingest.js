#!/usr/bin/env node
// 실브라우저 GemRate 세트 추이 덤프 → 일본판 주간 원장(gemrate-psa-history.json) + 영문판 총량(gemrate-psa-en-totals.json).
// GemRate 가 헤드리스를 봇으로 막아(2026-09-02·09-07 실측 "잠시만 기다리십시오") collect-gemrate-psa-history.js /
// collect-gemrate-en-totals.js 의 수집부만 실브라우저 덤프로 대체한다. 검증 규칙은 그 두 파일 것을 그대로 쓴다.
// 덤프 형식: {collectedAt, jp:{"OP-01":[{date,total_grades,total_gems},…]}, en:{…}} — 세트 페이지 RowData 그대로.
// 둘째 인자는 같은 주 카드별 팝 리포트 덤프(box-sold-cdp/psa-nav-run.js 출력 — sets·updated). 추이가 멈췄으면
// 세트 누적(일본판 latest·영문판 총량)을 그 카드 합계로 대신한다(규칙: collect-gemrate-psa-history.js popReportLatest, 2026-11-12).
// 두 원장은 모든 검사가 끝난 뒤에만 쓴다 — 영문판에서 멈추면 일본판도 안 바뀐다.
// 일본판 주간 이력 날짜는 판별 누적 원장과 같은 선택기(psa-snapshot-select.js)·같은 필수 계열(판별 원장에 점이 있는 대상)로 고른다
// (2026-11-20). 그래서 영문판 덤프 세트 = 영문판 총량 원장의 url 세트인지를 일본판 적재 전에 확인한다(41계열 목록이 같아야 한다).
// 빈 주(gaps)·끝나지 않은 주(pending)는 출력에 남긴다 — 빈 주는 known-gaps.json 에 등록할 몫(psa-edition-weekly-ingest 도 같은 주를 낸다).
// Run: node tools/psa-trend-ingest.js <추이 덤프.json> <카드별 팝 덤프.json>   → 이어서 node tools/psa-edition-weekly-ingest.js <추이 덤프>
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const { appendVerifiedWeeks, lastLiveRow, popReportTotals, popReportLatest } = require("./collect-gemrate-psa-history.js");
const { snapshotTargets, selectionBasis } = require("./psa-snapshot-select.js");
if (process.argv.length < 4) throw new Error("사용법: node tools/psa-trend-ingest.js <추이 덤프.json> <카드별 팝 덤프.json>");
const dump = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const pop = popReportTotals(JSON.parse(fs.readFileSync(process.argv[3], "utf8")));
const popProblems = [];
const popMissing = [];

const jpPath = path.join(ROOT, "data/gemrate-psa-history.json");
const jp = JSON.parse(fs.readFileSync(jpPath, "utf8"));
const enPath = path.join(ROOT, "data/gemrate-psa-en-totals.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const jpMissing = Object.keys(jp.sets).filter((c) => !dump.jp[c]);
if (jpMissing.length) throw new Error("JP 덤프에 없는 세트: " + jpMissing.join(","));
const enUnknown = Object.keys(dump.en).filter((c) => !en.sets[c]?.url);
if (enUnknown.length) throw new Error("EN 원장에 없는 세트: " + enUnknown.join(","));
const enExpected = Object.entries(en.sets).filter(([, s]) => s?.url).map(([c]) => c).filter((c) => !dump.en[c]);
if (enExpected.length) throw new Error("EN 덤프에 없는 세트: " + enExpected.join(","));

// JP — 주간 원장. 필수 계열 = 판별 누적 원장에 점이 하나라도 있는 대상(새 대상은 날짜 선택을 막지 않는다).
const edition = JSON.parse(fs.readFileSync(path.join(ROOT, "data/psa-edition-weekly.json"), "utf8"));
// 바닥값(판별 원장 마지막 누적)도 같이 넘긴다 — 판별 적재기와 같은 입력이어야 값 이상·리셋 날을 두 원장이 똑같이 건너뛴다.
const { required, floors } = selectionBasis(edition, snapshotTargets(jp, en));
const before = jp.weeklyThrough;
const r = appendVerifiedWeeks(jp, dump, required, floors);
const jpPop = [];
for (const [code, set] of Object.entries(jp.sets)) {
  if (!pop[`${code}|jp`]) { popMissing.push(`${code}/jp`); continue; }
  const p = popReportLatest(set.latest, dump.jp[code], pop[`${code}|jp`]);
  if (p.problem) popProblems.push(`${code}/jp ${p.problem}`);
  if (p.use) { set.latest = p.latest; jpPop.push(code); }
}
if (jpPop.length) jp.collectedAt = Object.values(jp.sets).map((set) => set.latest.date).sort().at(0);

// EN — 현재 총량 (collect-gemrate-en-totals.js 와 동일 규칙: 추이끼리 누적이 줄면 중단)
// asOf = 그 값의 기준일. 추이는 끝에 붙은 상류 정지일 복사본을 걷어낸 마지막 행만 본다(lastLiveRow).
// 지금 값(asOf)이 추이보다 새것이면 추이로 덮지 않는다. 지금 값이 팝 리포트 대체값인데 그보다 새 추이가 더 작으면
// 중단하지 않고 팝 리포트 값을 둔 채 사유를 남긴다 — 두 페이지 집계가 어긋난 것이지 누적이 준 게 아니다.
const dates = []; let updated = 0; const regressed = []; const enPop = [];
for (const [code, rows] of Object.entries(dump.en)) {
  const cur = en.sets[code];
  const last = lastLiveRow(dump.en, code);
  if (!last || !Number.isInteger(last.total_grades) || last.total_grades <= 0) continue;
  if (!(cur.asOf && cur.asOf >= last.date)) {
    if (last.total_grades < cur.totalGrades || last.total_gems < cur.totalGems) {
      if (cur.source === "pop-report") popProblems.push(`${code}/en 추이 ${last.date} ${last.total_grades}/${last.total_gems} < 팝 리포트 ${cur.asOf} ${cur.totalGrades}/${cur.totalGems} — 팝 리포트 값 유지`);
      else { regressed.push(`${code} ${cur.totalGrades} → ${last.total_grades}`); continue; }
    } else {
      cur.totalGrades = last.total_grades; cur.totalGems = last.total_gems;
      cur.gemRate = Math.round((last.total_gems / last.total_grades) * 1000) / 10;
      cur.asOf = last.date; delete cur.source;
    }
  }
  if (!pop[`${code}|en`]) popMissing.push(`${code}/en`);
  const p = popReportLatest({ date: cur.asOf, totalGrades: cur.totalGrades, totalGems: cur.totalGems }, rows, pop[`${code}|en`]);
  if (p.problem) popProblems.push(`${code}/en ${p.problem}`);
  if (p.use) {
    cur.totalGrades = p.latest.totalGrades; cur.totalGems = p.latest.totalGems; cur.gemRate = p.latest.gemRate;
    cur.asOf = p.latest.date; cur.source = p.latest.source; enPop.push(code);
  }
  dates.push(cur.asOf); updated += 1;
}
if (regressed.length) { console.error(JSON.stringify({ status: "regression", regressed })); process.exit(1); }
en.collectedAt = dates.sort().at(-1);

if (r.changed || jpPop.length) fs.writeFileSync(jpPath, `${JSON.stringify(jp, null, 2)}\n`, "utf8");
fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ jp: r.changed ? "updated" : "current", before, ...r, popReport: jpPop.length, corrections: Object.fromEntries(Object.entries(jp.corrections || {}).map(([c, l]) => [c, l.filter((x) => r.added.includes(x.date)).length]).filter(([, n]) => n)) }));
console.log(JSON.stringify({ en: "ok", updated, popReport: enPop.length, collectedAt: en.collectedAt }));
// 조용히 넘기지 않는다 — 팝 리포트를 못 쓴 계열·추이를 안 받은 계열과 그 사유를 남긴다(지금 값은 그대로 둠).
if (popMissing.length || popProblems.length || r.kept?.length) console.error(JSON.stringify({ popReport: "skipped", missing: popMissing, problems: popProblems, keptLatest: r.kept || [] }));
