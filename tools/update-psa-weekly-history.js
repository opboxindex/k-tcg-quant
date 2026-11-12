#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(projectRoot, "data", "onepiece-packs.json");
const snapshotPath = path.join(projectRoot, "data", "psa-population-snapshots.json");
const minIntervalDays = 6;
const maxIntervalDays = 8;
const historyWeeks = 52;

function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function readCumulativeSnapshot(data) {
  const codes = [...(data.jp?.list || []), ...(data.extra?.list || [])];
  const sets = {};
  const dates = new Set();

  // 갓 나온 세트는 PSA 누적이 아직 없다 — 감정이 시작 전이거나 GemRate 표본이 몇 장뿐이라
  // import-gemrate-psa-history 가 건너뛴다(그쪽도 같은 규칙). 그런 세트 하나 때문에 전체를
  // 막으면 21개 세트의 주간 이력이 통째로 멈춘다 — 2026-08-31 OP-17 로 실제로 그렇게 멈췄다.
  // 빠진 세트는 건너뛰되 사유를 남긴다. 총계는 '누적이 있는 세트의 합'이지 전 세트가 아니다.
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
  if (missing.length) console.error(`[psa-weekly] PSA 누적 없어 제외: ${missing.join(", ")}`);

  // 세트마다 기준일이 다를 수 있다 — 세트 추이가 멈춰 팝 리포트 카드 합계로 바꾸면 페이지마다 Updated 가 하루씩 다르다
  // (2026-11-12 실측 11/06·11/07). date 는 가장 이른 기준일(신선도는 가장 낡은 세트로 잰다), 전체 목록은 dates.
  const sortedDates = [...dates].sort();
  return {
    date: sortedDates[0],
    dates: sortedDates,
    source: "Verified full-set PSA population cumulative totals",
    total: Object.values(sets).reduce((sum, value) => sum + value, 0),
    sets,
  };
}

function applySnapshot(data, archive, current) {
  const snapshots = Array.isArray(archive.snapshots) ? archive.snapshots : [];
  const sameDate = snapshots.find((snapshot) => snapshot.date === current.date);
  if (sameDate) {
    if (JSON.stringify(sameDate.sets) !== JSON.stringify(current.sets)) {
      throw new Error(`${current.date}: stored PSA snapshot differs from the current cumulative source`);
    }
    return { changed: false, status: "duplicate", archive };
  }

  const previous = snapshots.at(-1);
  const nextArchive = {
    version: archive.version || 1,
    basis: archive.basis || "verified-full-set-psa-population",
    note: archive.note || "Verified full-set cumulative PSA population snapshots. Weekly bars are calculated only from consecutive 6-8 day snapshots.",
    snapshots: [...snapshots, current].sort((a, b) => a.date.localeCompare(b.date)).slice(-historyWeeks),
  };

  if (!previous) {
    return { changed: true, status: "baseline", archive: nextArchive };
  }

  const intervalDays = dayDiff(previous.date, current.date);
  if (intervalDays < minIntervalDays || intervalDays > maxIntervalDays) {
    throw new Error(`${current.date}: expected a 7-day PSA snapshot interval, got ${intervalDays} days from ${previous.date}`);
  }

  const removedSets = Object.keys(previous.sets || {}).filter((code) => !Object.hasOwn(current.sets, code));
  if (removedSets.length) throw new Error(`PSA cumulative snapshot dropped tracked sets: ${removedSets.join(", ")}`);

  const newSets = [];
  for (const [code, total] of Object.entries(current.sets)) {
    const previousTotal = Number(previous.sets?.[code]);
    if (!Number.isInteger(previousTotal)) {
      newSets.push(code);
      continue;
    }
    if (total < previousTotal) throw new Error(`${code}: cumulative PSA total regressed ${previousTotal} -> ${total}`);
  }

  let weeklyDelta = 0;
  for (const [code, total] of Object.entries(current.sets)) {
    const set = data.sets[code];
    const previousTotal = Number(previous.sets?.[code]);
    const weekly = set.psaWeekly || {};
    const points = Array.isArray(weekly.points) ? weekly.points : [];

    if (!Number.isInteger(previousTotal)) {
      set.psaWeekly = {
        ...weekly,
        source: "Verified full-set PSA population weekly deltas",
        updated: current.date,
        allTimeTotal: total,
        points,
      };
      continue;
    }

    const delta = total - previousTotal;
    weeklyDelta += delta;

    set.psaWeekly = {
      ...weekly,
      source: "Verified full-set PSA population weekly deltas",
      updated: current.date,
      allTimeTotal: total,
      points: [...points.filter((point) => point.d !== current.date), { d: current.date, v: delta }]
        .sort((a, b) => a.d.localeCompare(b.d))
        .slice(-historyWeeks),
    };
  }

  return {
    changed: true,
    status: "appended",
    intervalDays,
    delta: weeklyDelta,
    newSets,
    archive: nextArchive,
  };
}

function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const archive = fs.existsSync(snapshotPath)
    ? JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
    : { version: 1, snapshots: [] };
  const current = readCumulativeSnapshot(data);
  const sourceAgeDays = dayDiff(current.date, utcToday());
  if (process.argv.includes("--check-freshness")) {
    if (sourceAgeDays > maxIntervalDays) {
      throw new Error(`PSA cumulative source is ${sourceAgeDays} days old (${current.date}); a new verified snapshot is required`);
    }
    console.log(JSON.stringify({ status: "fresh", date: current.date, dates: current.dates, sourceAgeDays }, null, 2));
    return;
  }
  // 주간 막대는 같은 날짜의 스냅샷끼리만 뺀다 — 기준일이 섞인 누적으로는 만들지 않는다(추정 금지).
  if (current.dates.length !== 1) throw new Error(`PSA cumulative source dates disagree: ${current.dates.join(", ")}`);
  const result = applySnapshot(data, archive, current);

  if (result.changed) {
    fs.writeFileSync(snapshotPath, `${JSON.stringify(result.archive, null, 2)}\n`, "utf8");
    if (result.status === "appended") {
      fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 1)}\n`, "utf8");
    }
  }

  console.log(JSON.stringify({
    status: result.status,
    date: current.date,
    cumulativeTotal: current.total,
    intervalDays: result.intervalDays || null,
    weeklyDelta: result.delta ?? null,
    newSets: result.newSets || [],
    sourceAgeDays,
  }, null, 2));
}

if (require.main === module) main();

module.exports = { applySnapshot, dayDiff, readCumulativeSnapshot };
