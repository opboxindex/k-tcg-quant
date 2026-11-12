#!/usr/bin/env node
// 영문판 PSA 총량을 세트 데이터에 붙인다 (psaFullEn) — 2026-07-27.
// 일본판(psaFull)과 절대 합산하지 않는다. 합치면 젬률이 두 판의 평균도 아닌 값이 되어 뜻을 잃는다.
// 영문판이 아직 없는 세트는 키를 만들지 않는다 → 화면에서 "-" 로 나온다.
// Run: node tools/import-gemrate-en-totals.js
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const dataPath = path.join(ROOT, "data", "onepiece-packs.json");
const enPath = path.join(ROOT, "data", "gemrate-psa-en-totals.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const codes = [...(data.jp?.list || []), ...(data.extra?.list || [])];

let attached = 0, absent = 0;
for (const code of codes) {
  const set = data.sets[code];
  if (!set) continue;
  const e = en.sets?.[code];
  if (!e) { delete set.psaFullEn; absent += 1; continue; }
  const rate = Math.round((e.totalGems / e.totalGrades) * 1000) / 10;
  if (!Number.isInteger(e.totalGrades) || e.totalGrades <= 0 || e.totalGems > e.totalGrades) {
    throw new Error(`${code}: 영문판 총량이 비정상 — 아무것도 쓰지 않음`);
  }
  if (Math.abs(rate - e.gemRate) > 0.05) throw new Error(`${code}: 영문판 젬률 불일치 ${rate} vs ${e.gemRate}`);
  set.psaFullEn = {
    total: e.totalGrades,
    gems: e.totalGems,
    gemRate: rate,
    // asOf = 그 세트 값의 기준일(psa-trend-ingest.js 가 적음). 팝 리포트 카드 합계로 바꾼 값이면 출처도 그렇게 적는다.
    updated: e.asOf || en.collectedAt,
    source: e.source === "pop-report" ? "GemRate PSA population report (English, sum of card rows)" : "GemRate full-set PSA population (English)",
  };
  attached += 1;
}
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ attached, absent, collectedAt: en.collectedAt }));
