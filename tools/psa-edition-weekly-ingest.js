#!/usr/bin/env node
// 실브라우저 GemRate 세트 추이 덤프 → 판별 누적 원장(psa-edition-weekly.json). 2026-11-20 다시 씀.
//
// 날짜는 psa-snapshot-select.js 가 고른다 — ISO 주마다 한 점: 수요일에 모든 계열이 실제 값이면 수요일, 아니면 주가 끝난 뒤
// 수요일에 가장 가까운 완전·비복사 날. 일본판 주간 이력(psa-trend-ingest → appendVerifiedWeeks)도 같은 선택기·같은 필수 계열·
// 같은 41계열 덤프를 써서 두 원장 날짜가 늘 같다. 덤프 하나로 밀린 주를 전부 채운다.
// 왜 바꿨나: 옛 적재기는 덤프의 마지막 수요일 한 주만 넣었다. GemRate 가 10/28 뒤로 수요일 행을 안 내자(10/28 은 35/41 이 10/27 복사,
// 그 뒤 11/06·11/13·11/14·11/16 만) 원장이 10/28 에 멈췄는데도 status 'ok'(frozen 35·dup 6)로 조용히 넘어갔다.
//
// 규칙(append-only):
//  - 먼저 검사하고 하나라도 걸리면 아무것도 쓰지 않고 exit 1: (a) 덤프에 같은 날짜 행이 있는 원장 점은 g·m 이 덤프와 같다
//    (b) 원장 날짜가 덤프에서 복사일(frozenOn)이 아니다 — 통합 담당의 10/28 정정 전에는 여기서 멈춘다 (c) 대상 계열이 전부 덤프에 있다.
//  - 고른 날짜마다 그날 행이 있는 대상 전부를 한꺼번에 넣는다({d, g, m}). 누적 역행·같은 날 값 충돌·행 값 이상이면 전체 중단.
//  - 빈 주(gaps)는 원장에 아무것도 쓰지 않는다(problems[] 도 안 씀) → known-gaps.json 에 등록할 몫.
//    끝나지 않은 주의 수요일이 안 되면 pending — 다음 실행이 다시 본다.
//  - 출력은 JSON 한 줄 {status:'ok'|'nothing-new', added, gaps, pending}. 둘 다 exit 0, 넣은 게 없으면 'ok' 라고 하지 않는다.
//
// 원장 basis·note 문구(data/*.json 은 통합 담당이 고친다 — 아래를 그대로 복사):
//   basis: "GemRate full-set PSA cumulative population by edition; one shared snapshot per ISO week (Wednesday when every series has a real row, else the complete real day nearest Wednesday once the week ends)"
//   note 에 덧붙임: "intervals follow GemRate's update days and are not always 7 days; append-only except the logged 2026-10-28 correction"
//
// Run: node tools/psa-edition-weekly-ingest.js <추이 덤프.json>   (psa-trend-ingest.js 다음에)
const fs = require("node:fs");
const path = require("node:path");
const { frozenOn, snapshotTargets, rowsByKeyFromDump, selectionBasis, selectSnapshots, validRow } = require("./psa-snapshot-select.js");

const ROOT = path.resolve(__dirname, "..");
const LEDGER = path.join(ROOT, "data", "psa-edition-weekly.json");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// 순수 함수 — 원장을 고치지 않고 복사본에 적용해 돌려준다. 중단이면 {status:'abort', offenders}.
function ingestEditionWeekly(ledger, dump, targets) {
  const store = structuredClone(ledger);
  const rowsByKey = rowsByKeyFromDump(dump, targets);
  const offenders = [];
  for (const key of targets) if (!rowsByKey[key]) offenders.push(`(c) ${key}: 덤프에 없음`);
  for (const [code, eds] of Object.entries(store.sets || {})) {
    for (const [ed, points] of Object.entries(eds || {})) {
      const byDate = new Map((dump?.[ed]?.[code] || []).map((row) => [row.date, row]));
      for (const point of points || []) {
        const row = byDate.get(point.d);
        if (row && (row.total_grades !== point.g || row.total_gems !== point.m)) offenders.push(`(a) ${code}/${ed} ${point.d}: 원장 ${point.g}/${point.m} ≠ 덤프 ${row.total_grades}/${row.total_gems}`);
      }
    }
  }
  for (const date of store.weeks || []) {
    const frozen = frozenOn(rowsByKey, date);
    if (frozen.size) offenders.push(`(b) ${date}: 덤프에서 복사일 — ${frozen.size}계열이 직전 행과 같다(원장 점이 상류 복사본)`);
  }
  if (offenders.length) return { status: "abort", offenders };

  // 필수 계열·바닥값은 selectionBasis 한 곳에서 — 일본판 이력 적재(psa-trend-ingest)와 같은 입력이라 같은 날짜를 고른다.
  const { required, floors } = selectionBasis(store, targets);
  const { chosen, gaps, pending } = selectSnapshots({
    rowsByKey, required, floors, lastDate: store.weeks.at(-1), collectedOn: String(dump.collectedAt || "").slice(0, 10),
  });
  // 선택기가 필수 계열의 값 이상·역행 날은 이미 걸렀다. 아직 점이 없는 대상의 값 이상 행은 합류시키지 않고 넘긴다
  // (선택기도 그 대상을 합류로 치지 않는다 — 두 원장이 같은 계열 집합으로 다음 주를 고른다).
  const joined = new Set(required);

  const added = [];
  for (const { week, date } of chosen) {
    let series = 0;
    for (const key of targets) {
      const row = rowsByKey[key].find((r) => r.date === date);
      if (!row) continue;
      const [code, ed] = key.split("|");
      const point = { d: date, g: row.total_grades, m: row.total_gems };
      if (!validRow(row)) {
        if (joined.has(key)) offenders.push(`${code}/${ed} ${date}: 행 값 이상 ${point.g}/${point.m}`);
        continue;
      }
      const arr = ((store.sets[code] ||= {})[ed] ||= []);
      const same = arr.find((p) => p.d === date);
      if (same) {
        if (same.g !== point.g || same.m !== point.m) offenders.push(`${code}/${ed} ${date}: 보관 ${same.g}/${same.m} → 현재 ${point.g}/${point.m}`);
        continue;
      }
      const prev = arr.at(-1);
      if (prev && prev.d > date) { offenders.push(`${code}/${ed} ${date}: 원장에 더 늦은 점 ${prev.d} 가 있다`); continue; }
      if (prev && point.g < prev.g) { offenders.push(`${code}/${ed} ${date}: 누적 역행 ${prev.g} → ${point.g}`); continue; }
      arr.push(point);
      joined.add(key);
      series += 1;
    }
    store.weeks.push(date);
    added.push({ week, date, series });
  }
  if (offenders.length) return { status: "abort", offenders };
  store.updated = store.weeks.at(-1);
  return { status: added.length ? "ok" : "nothing-new", added, gaps, pending, ledger: store };
}

function main() {
  if (!process.argv[2]) throw new Error("사용법: node tools/psa-edition-weekly-ingest.js <추이 덤프.json>");
  const dump = readJson(process.argv[2]);
  const targets = snapshotTargets(readJson(path.join(ROOT, "data", "gemrate-psa-history.json")), readJson(path.join(ROOT, "data", "gemrate-psa-en-totals.json")));
  const result = ingestEditionWeekly(readJson(LEDGER), dump, targets);
  if (result.status === "abort") {
    console.error(JSON.stringify({ status: "abort", offenders: result.offenders }));
    process.exit(1);
  }
  if (result.status === "ok") fs.writeFileSync(LEDGER, `${JSON.stringify(result.ledger, null, 1)}\n`, "utf8");
  console.log(JSON.stringify({ status: result.status, added: result.added, gaps: result.gaps, pending: result.pending }));
}

if (require.main === module) main();

module.exports = { ingestEditionWeekly };
