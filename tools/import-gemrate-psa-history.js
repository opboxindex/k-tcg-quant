#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(projectRoot, "data", "onepiece-packs.json");
const sourcePath = path.join(projectRoot, "data", "gemrate-psa-history.json");
const snapshotPath = path.join(projectRoot, "data", "psa-population-snapshots.json");
const minimumWeeklyPoints = 4;

function parseDate(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new Error(`Invalid date: ${value}`);
  return time;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function validateSet(code, source, history) {
  if (!source || !/^https:\/\/www\.gemrate\.com\/set-population-trend\?/.test(source.url || "")) {
    throw new Error(`${code}: GemRate source URL is missing`);
  }

  const latest = source.latest || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(latest.date || "")) throw new Error(`${code}: latest date is invalid`);
  if (!Number.isInteger(latest.totalGrades) || latest.totalGrades <= 0) throw new Error(`${code}: totalGrades is invalid`);
  if (!Number.isInteger(latest.totalGems) || latest.totalGems <= 0 || latest.totalGems > latest.totalGrades) {
    throw new Error(`${code}: totalGems is invalid`);
  }

  const weekly = Array.isArray(source.weekly) ? source.weekly : [];
  const dates = weekly.map((point) => point.d);
  const correctionDates = new Set((history.corrections?.[code] || []).map((entry) => entry.date));
  if (weekly.length < minimumWeeklyPoints) throw new Error(`${code}: fewer than ${minimumWeeklyPoints} verified weekly points`);
  if (new Set(dates).size !== dates.length) throw new Error(`${code}: duplicate weekly dates`);
  for (let index = 1; index < dates.length; index += 1) {
    const intervalWeeks = (parseDate(dates[index]) - parseDate(dates[index - 1])) / (7 * 864e5);
    const skippedDates = (history.retainedWeeklyDates || []).filter((date) => date > dates[index - 1] && date < dates[index]);
    if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || skippedDates.some((date) => !correctionDates.has(date))) {
      throw new Error(`${code}: weekly dates are not consecutive at ${dates[index]}`);
    }
  }
  const lastDate = dates.at(-1);
  const trailingDates = (history.retainedWeeklyDates || []).filter((date) => date > lastDate && date <= history.weeklyThrough);
  if (lastDate !== history.weeklyThrough && trailingDates.some((date) => !correctionDates.has(date))) {
    throw new Error(`${code}: weekly graph does not reach ${history.weeklyThrough} and missing dates are not declared corrections`);
  }
  if (history.historyStart && dates[0] < history.historyStart) throw new Error(`${code}: weekly history predates verified start`);

  const firstDate = dates[0];
  for (const retainedDate of history.retainedWeeklyDates || []) {
    if (retainedDate >= firstDate && !dates.includes(retainedDate) && !correctionDates.has(retainedDate)) {
      throw new Error(`${code}: retained weekly date ${retainedDate} was deleted without a correction`);
    }
  }
  for (const point of weekly) {
    if (!Number.isInteger(point.grades) || point.grades < 0) throw new Error(`${code} ${point.d}: weekly grades are invalid`);
    if (!Number.isInteger(point.gems) || point.gems < 0 || point.gems > point.grades) {
      throw new Error(`${code} ${point.d}: weekly gems are invalid`);
    }
  }
}

// 갓 나온 세트는 주간 점이 아직 4개가 안 된다. 그 하나 때문에 전체 적재를 막으면
// **성숙한 21개 세트의 PSA 데이터까지 같이 멈춘다** — 2026-08-31 실사고: OP-17(8/22 발매)이
// 목록에 들어오면서 import 가 죽었고 PSA 판본별 주간이 12일간 공백이 됐다.
// 그래서 "아직 이른 세트"는 이번 회차에서 건너뛰고(로그로 남김), 데이터가 쌓이면 자동 편입된다.
// ⚠️ 조용히 건너뛰지 않는다 — 건너뛴 세트는 stderr 에 찍고 결과 JSON 에도 담는다.
const skipped = [];
function isTooNew(code, set, history) {
  const weekly = Array.isArray(set?.weekly) ? set.weekly : [];
  const grades = set?.latest?.totalGrades;
  return weekly.length < minimumWeeklyPoints || !Number.isInteger(grades) || grades <= 0;
}

function applyGemRateHistory(data, source) {
  const all = [...(data.jp?.list || []), ...(data.extra?.list || [])];
  const extra = Object.keys(source.sets || {}).filter((code) => !all.includes(code));
  if (extra.length) {
    throw new Error(`GemRate set coverage mismatch; extra=${extra.join(",")}`);
  }
  // 목록에는 있는데 packs.json 에 세트 정의조차 없으면 그건 신생 세트가 아니라 설정이 어긋난 것이다.
  // 조용히 넘기면 그 세트는 영영 안 들어온다 — 여기서 멈춘다.
  const undefinedSets = all.filter((code) => !data.sets?.[code]);
  if (undefinedSets.length) {
    throw new Error(`GemRate set coverage mismatch; 목록에만 있고 정의가 없는 세트=${undefinedSets.join(",")}`);
  }
  // 정의는 있는데 수집이 안 됐거나(신생 세트라 GemRate 페이지가 아직 없음) 표본이 얇은 세트는
  // 이번 회차만 건너뛴다. 다만 **이미 한 번이라도 적재된 적 있는 세트**가 빠지는 건 다른 얘기다 —
  // 그건 수집이 깨진 것이므로 멈춘다. 그러지 않으면 한 세트가 조용히 옛 값에 멈춰 있게 된다.
  const codes = [];
  for (const code of all) {
    const set = source.sets?.[code];
    if (!set) {
      if (data.sets[code].psaFull) throw new Error(`${code}: 이미 적재된 세트가 이번 수집에서 빠졌다 — 수집 실패`);
      skipped.push(`${code}(미수집 — 아직 GemRate 에 없음)`);
      continue;
    }
    if (isTooNew(code, set, source)) { skipped.push(`${code}(주간 ${(set.weekly || []).length}점 — 아직 이름)`); continue; }
    codes.push(code);
  }
  if (!codes.length) throw new Error("GemRate: 적재할 세트가 하나도 없다 — 수집이 통째로 실패한 것");
  if (skipped.length) console.error(`[gemrate] 건너뜀: ${skipped.join(", ")}`);

  for (const code of codes) validateSet(code, source.sets[code], source);

  const totalGrades = codes.reduce((sum, code) => sum + source.sets[code].latest.totalGrades, 0);
  const totalGems = codes.reduce((sum, code) => sum + source.sets[code].latest.totalGems, 0);
  const opAverage = round1((totalGems / totalGrades) * 100);

  for (const code of codes) {
    const set = data.sets[code];
    const imported = source.sets[code];
    const latest = imported.latest;
    const gemRate = round1((latest.totalGems / latest.totalGrades) * 100);
    // 세트 추이가 멈춰 팝 리포트 카드 합계로 바꾼 값이면 출처도 그렇게 적는다(psa-trend-ingest.js, 2026-11-12).
    const fromPopReport = latest.source === "pop-report";

    set.psaFull = {
      total: latest.totalGrades,
      gems: latest.totalGems,
      gem10: latest.totalGems,
      gemRate,
      opAvg: opAverage,
      opDiff: round1(gemRate - opAverage),
      updated: latest.date,
      source: fromPopReport ? "GemRate PSA population report (sum of card rows)" : "GemRate full-set PSA population trend",
      sourceUrl: fromPopReport ? imported.url.replace("/set-population-trend?", "/item-details?") : imported.url,
    };
    set.psaWeekly = {
      source: "GemRate full-set weekly PSA population deltas",
      sourceUrl: imported.url,
      updated: source.weeklyThrough,
      allTimeTotal: latest.totalGrades,
      corrections: source.corrections?.[code] || [],
      points: imported.weekly.map((point) => ({ d: point.d, v: point.grades })),
    };
  }

  // 팝 리포트는 세트마다 기준일이 하루씩 다를 수 있다(2026-11-12 실측 11/06·11/07) → 세트별 기준일을 dates 에 남기고,
  // 스냅샷 키(date)는 가장 늦은 기준일로 한다. 가장 이른 날로 잡으면 한 세트만 옛 값에 머물러도 지난 스냅샷을
  // 같은 날짜로 덮어쓰거나 새 값을 옛 날짜에 적게 된다(검증 에이전트 지적).
  const popCodes = codes.filter((code) => source.sets[code].latest.source === "pop-report");
  return {
    date: codes.map((code) => source.sets[code].latest.date).sort().at(-1),
    source: !popCodes.length ? "GemRate public full-set PSA population trend"
      : popCodes.length === codes.length ? "GemRate public PSA population report (sum of card rows; set trend stopped)"
        : `GemRate public full-set PSA population trend; population report card sums for ${popCodes.join(",")}`,
    total: totalGrades,
    sets: Object.fromEntries(codes.map((code) => [code, source.sets[code].latest.totalGrades])),
    dates: Object.fromEntries(codes.map((code) => [code, source.sets[code].latest.date])),
  };
}

function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const snapshot = applyGemRateHistory(data, source);
  const previousArchive = fs.existsSync(snapshotPath)
    ? JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
    : { snapshots: [] };
  const snapshots = (previousArchive.snapshots || []).filter((entry) => entry.date !== snapshot.date);
  const archive = {
    version: 2,
    basis: "gemrate-full-set-psa-population",
    note: "Verified full-set cumulative PSA population snapshots. A new snapshot may be added only after the same GemRate set pages are refreshed and validated.",
    snapshots: [...snapshots, snapshot].sort((a, b) => a.date.localeCompare(b.date)).slice(-52),
  };

  fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 1)}\n`, "utf8");
  fs.writeFileSync(snapshotPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "imported",
    sets: Object.keys(source.sets).length,
    latest: source.collectedAt,
    weeklyThrough: source.weeklyThrough,
    cumulativeTotal: snapshot.total,
  }, null, 2));
}

if (require.main === module) main();

module.exports = { applyGemRateHistory, validateSet };
