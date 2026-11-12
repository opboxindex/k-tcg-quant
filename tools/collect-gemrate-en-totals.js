#!/usr/bin/env node
// 영문판 PSA 총량 주간 갱신 — 2026-07-27.
//
// 시계열이 아니라 "현재 총량" 한 점만 새로 고친다. 세트별 누적 등급 수는 "지금까지 몇 장
// 채점됐나"를 답하는 값이라 과거를 소급할 필요가 없다. 주차별 증감은 psa-edition-weekly.json
// 원장이 담당한다.
//
// 세트명/연도는 추측하지 않는다 — data/gemrate-psa-en-totals.json 에 이미 검증된 url 이 있고
// 그 url 만 다시 읽는다. (2026-07-27: " Japanese" 만 빼면 된다고 가정했다가 OP-06 는 규칙이
// 다르고 OP-02 는 영문판 발매연도가 1년 늦어 실패했다. 확인된 주소를 보관하는 쪽이 맞다.)
// 영문판이 없는 세트는 null 로 두고, null 은 절대 값으로 바꾸지 않는다.
// Run: node tools/collect-gemrate-en-totals.js
const fs = require("node:fs");
const path = require("node:path");
const { collectRows, lastLiveRow } = require("./collect-gemrate-psa-history.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "gemrate-psa-en-totals.json");

(async () => {
  const store = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const sets = {};
  for (const [code, s] of Object.entries(store.sets)) if (s?.url) sets[code] = { url: s.url };
  if (!Object.keys(sets).length) { console.error("영문판 url 이 없음 — 파일 미변경"); process.exit(1); }

  let rows;
  try { rows = await collectRows({ sets }); }
  catch (e) { console.error(`영문판 총량 수집 실패 — 파일 미변경: ${e.message}`); process.exit(1); }

  const dates = [];
  let updated = 0, regressed = [];
  for (const [code, r] of Object.entries(rows)) {
    // psa-trend-ingest.js 와 같은 규칙(2026-11-12): 끝의 상류 정지일 복사 행은 새 값이 아니고(lastLiveRow), 지금 값(asOf)이 더 새것이면
    // 덮지 않는다. 지금 값이 팝 리포트 대체값인데 새 추이가 더 작으면 중단하지 않고 그 값을 둔다(두 페이지 집계 차이).
    const last = Array.isArray(r) ? lastLiveRow(rows, code) : null;
    const cur = store.sets[code];
    if (!last || !Number.isInteger(last.total_grades) || last.total_grades <= 0) continue;
    if (cur.asOf && cur.asOf >= last.date) continue;
    if (last.total_grades < cur.totalGrades || last.total_gems < cur.totalGems) {
      if (cur.source === "pop-report") { console.error(`${code}: 추이 ${last.date} ${last.total_grades} < 팝 리포트 ${cur.asOf} ${cur.totalGrades} — 팝 리포트 값 유지`); continue; }
      regressed.push(`${code} ${cur.totalGrades} → ${last.total_grades}`); continue;
    }
    cur.totalGrades = last.total_grades;
    cur.totalGems = last.total_gems;
    cur.gemRate = Math.round((last.total_gems / last.total_grades) * 1000) / 10;
    cur.asOf = last.date; delete cur.source;
    dates.push(last.date);
    updated += 1;
  }
  if (regressed.length) {   // 누적은 줄 수 없다. 줄었다면 상류 문제이므로 사람이 봐야 한다.
    console.error(JSON.stringify({ status: "regression", regressed }, null, 2));
    process.exit(1);
  }
  if (!updated) { console.error("갱신된 세트가 없음 — 파일 미변경"); process.exit(1); }
  store.collectedAt = dates.sort().at(-1);
  fs.writeFileSync(OUT, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "ok", updated, collectedAt: store.collectedAt }));
})();
