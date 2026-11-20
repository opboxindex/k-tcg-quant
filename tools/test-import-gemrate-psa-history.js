#!/usr/bin/env node

const assert = require("node:assert/strict");
const { applyGemRateHistory } = require("./import-gemrate-psa-history");

function sourceSet(totalGrades, totalGems) {
  return {
    url: "https://www.gemrate.com/set-population-trend?grader=psa&year=2026&category=tcg-cards&set_name=fixture",
    latest: { date: "2026-07-20", totalGrades, totalGems },
    weekly: [
      { d: "2026-06-03", grades: 4, gems: 3 },
      { d: "2026-06-10", grades: 6, gems: 5 },
      { d: "2026-06-17", grades: 8, gems: 6 },
      { d: "2026-06-24", grades: 10, gems: 8 },
      { d: "2026-07-01", grades: 12, gems: 10 },
      { d: "2026-07-08", grades: 14, gems: 11 },
      { d: "2026-07-15", grades: 16, gems: 13 },
    ],
  };
}

const data = {
  jp: { list: ["OP-01"] },
  extra: { list: ["EB-01"] },
  sets: { "OP-01": {}, "EB-01": {} },
};
const source = {
  collectedAt: "2026-07-20",
  historyStart: "2026-06-03",
  weeklyThrough: "2026-07-15",
  retainedWeeklyDates: ["2026-06-03", "2026-06-10", "2026-06-17", "2026-06-24", "2026-07-01", "2026-07-08", "2026-07-15"],
  sets: {
    "OP-01": sourceSet(100, 90),
    "EB-01": sourceSet(50, 40),
  },
};

const snapshot = applyGemRateHistory(data, source);
assert.equal(snapshot.total, 150);
assert.equal(data.sets["OP-01"].psaFull.total, 100);
assert.equal(data.sets["OP-01"].psaFull.gems, 90);
assert.equal(data.sets["OP-01"].psaFull.gemRate, 90);
assert.equal(data.sets["OP-01"].psaFull.opAvg, 86.7);
// 점마다 증가분이 시작한 날 f(직전 보관 날짜, 첫 보관 날짜는 d − 7일)를 같이 싣는다 — 2026-11-20.
assert.deepEqual(data.sets["OP-01"].psaWeekly.points.at(-1), { d: "2026-07-15", v: 16, f: "2026-07-08" });
assert.deepEqual(data.sets["OP-01"].psaWeekly.points[0], { d: "2026-06-03", v: 4, f: "2026-05-27" });
assert.equal(data.sets["OP-01"].psaWeekly.points.length, 7);
assert.equal(data.sets["OP-01"].psaWeekly.source, "GemRate full-set PSA population change between ledger snapshots");
assert.throws(
  () => applyGemRateHistory({ ...data, jp: { list: ["OP-01", "OP-02"] } }, source),
  /coverage mismatch/,
);
const truncated = structuredClone(source);
truncated.sets["OP-01"].weekly.splice(1, 1);
assert.throws(() => applyGemRateHistory(structuredClone(data), truncated), /retained weekly date|not consecutive/);

const trailingCorrection = structuredClone(source);
trailingCorrection.sets["OP-01"].weekly.pop();
trailingCorrection.corrections = { "OP-01": [{ date: "2026-07-15", reason: "upstream reset" }] };
assert.doesNotThrow(() => applyGemRateHistory(structuredClone(data), trailingCorrection));

console.log("GemRate PSA history import tests passed");
