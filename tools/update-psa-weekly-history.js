#!/usr/bin/env node
// PSA 세트 누적(packs 의 psaFull.updated) 신선도 검사 — update-market-data.yml 마지막 단계가 부른다.
// 2026-11-20: 옛 적재 경로(applySnapshot — 6~8일 간격 스냅샷 차로 psaWeekly.points 를 {d, v} 로 다시 쓰던 것)를 지웠다.
// 아무도 부르지 않았고(워크플로는 --check-freshness 만), 돌리면 import-gemrate-psa-history 가 쓰는 점 {d, v, f}
// (스냅샷 사이 증가분)을 7일 가정의 다른 값으로 덮어 가드 D3 를 깨뜨린다. 주간 이력은 psa-trend-ingest → import 한 길뿐이다.
// Run: node tools/update-psa-weekly-history.js
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(projectRoot, "data", "onepiece-packs.json");
const maxAgeDays = 8;

function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

function readCumulativeSnapshot(data) {
  const codes = [...(data.jp?.list || []), ...(data.extra?.list || [])];
  const sets = {};
  const dates = new Set();

  // 갓 나온 세트는 PSA 누적이 아직 없다 — 감정이 시작 전이거나 GemRate 표본이 몇 장뿐이라
  // import-gemrate-psa-history 가 건너뛴다(그쪽도 같은 규칙). 빠진 세트는 건너뛰되 사유를 남긴다(2026-08-31 OP-17).
  const missing = [];
  for (const code of codes) {
    const source = data.sets?.[code]?.psaFull;
    const total = Number(source?.total);
    if (!Number.isInteger(total) || total < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(source?.updated || "")) {
      missing.push(code);
      continue;
    }
    sets[code] = total;
    dates.add(source.updated);
  }
  // 절반 넘게 빠졌으면 신생 세트 문제가 아니라 수집이 통째로 실패한 것이다.
  if (Object.keys(sets).length < codes.length / 2) {
    throw new Error(`PSA 누적이 있는 세트가 ${Object.keys(sets).length}/${codes.length} 뿐 — 수집 실패 의심`);
  }
  if (missing.length) console.error(`[psa-freshness] PSA 누적 없어 제외: ${missing.join(", ")}`);

  // 세트마다 기준일이 다를 수 있다 — 세트 추이가 멈춰 팝 리포트 카드 합계로 바꾸면 페이지마다 Updated 가 하루씩 다르다
  // (2026-11-12 실측 11/06·11/07). date 는 가장 이른 기준일(신선도는 가장 낡은 세트로 잰다), 전체 목록은 dates.
  const sortedDates = [...dates].sort();
  return { date: sortedDates[0], dates: sortedDates, total: Object.values(sets).reduce((sum, value) => sum + value, 0), sets };
}

function checkFreshness(data, today) {
  const current = readCumulativeSnapshot(data);
  const sourceAgeDays = dayDiff(current.date, today);
  if (sourceAgeDays > maxAgeDays) {
    throw new Error(`PSA cumulative source is ${sourceAgeDays} days old (${current.date}); a new verified snapshot is required`);
  }
  return { status: "fresh", date: current.date, dates: current.dates, sourceAgeDays };
}

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  console.log(JSON.stringify(checkFreshness(data, new Date().toISOString().slice(0, 10)), null, 2));
}

module.exports = { checkFreshness, dayDiff, readCumulativeSnapshot };
