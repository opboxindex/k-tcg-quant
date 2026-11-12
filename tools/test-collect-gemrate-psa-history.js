#!/usr/bin/env node

const assert = require("node:assert/strict");
const { appendVerifiedWeeks, correctionReason, latestWednesday, frozenOn } = require("./collect-gemrate-psa-history");

const rows = [
  { date: "2026-07-15", total_grades: 100, total_gems: 90 },
  { date: "2026-07-22", total_grades: 125, total_gems: 110 },
  { date: "2026-07-23", total_grades: 130, total_gems: 114 },
];
assert.equal(latestWednesday(rows), "2026-07-22");
assert.equal(correctionReason("OP-01", "2026-07-22", 25, 20, [10, 12, 14]), null);
assert.match(correctionReason("OP-01", "2026-07-22", 25000, 20000, [10, 12, 14]), /implausible/);

const source = {
  collectedAt: "2026-07-20",
  weeklyThrough: "2026-07-15",
  retainedWeeklyDates: ["2026-07-15"],
  corrections: {},
  sets: {
    "OP-01": { weekly: [{ d: "2026-07-15", grades: 10, gems: 9 }], latest: {} },
    "OP-02": { weekly: [{ d: "2026-07-15", grades: 12, gems: 10 }], latest: {} },
  },
};
const result = appendVerifiedWeeks(source, { "OP-01": rows, "OP-02": rows });
assert.deepEqual(result.added, ["2026-07-22"]);
assert.equal(source.sets["OP-01"].weekly.at(-1).grades, 25);
assert.deepEqual(source.retainedWeeklyDates, ["2026-07-15", "2026-07-22"]);
assert.equal(appendVerifiedWeeks(source, { "OP-01": rows, "OP-02": rows }).changed, false);

// 상류 복사본(전날과 같은 행) 거르기 — 2026-11-12 실측(10/28: 41계열 중 35계열이 10/27 과 같았다).
const day = (date, g, m) => ({ date, total_grades: g, total_gems: m });
const fresh = (a) => [day("2026-07-21", 100 + a, 90 + a), day("2026-07-22", 110 + a, 99 + a)];
const copied = (a) => [day("2026-07-21", 100 + a, 90 + a), day("2026-07-22", 100 + a, 90 + a)];
// 절반 이상 복사 → 복사된 계열만 고른다
assert.deepEqual([...frozenOn({ A: copied(0), B: copied(1), C: fresh(2) }, "2026-07-22")].sort(), ["A", "B"]);
// 작은 세트 하나만 하루 0건 → 상류 정지가 아니다
assert.equal(frozenOn({ A: copied(0), B: fresh(1), C: fresh(2) }, "2026-07-22").size, 0);
// 전날 행이 없으면 비교하지 않는다
assert.equal(frozenOn({ A: [day("2026-07-22", 5, 4)] }, "2026-07-22").size, 0);

const withCopy = (base) => [
  day("2026-07-15", base, base - 10), day("2026-07-21", base + 20, base + 8), day("2026-07-22", base + 20, base + 8), day("2026-07-23", base + 30, base + 16),
];
const frozenSource = {
  collectedAt: "2026-07-20", weeklyThrough: "2026-07-15", retainedWeeklyDates: ["2026-07-15"], corrections: {},
  sets: { "OP-01": { weekly: [{ d: "2026-07-15", grades: 10, gems: 9 }], latest: {} }, "OP-02": { weekly: [{ d: "2026-07-15", grades: 12, gems: 10 }], latest: {} } },
};
const frozenResult = appendVerifiedWeeks(frozenSource, { "OP-01": withCopy(100), "OP-02": withCopy(200) });
assert.deepEqual(frozenResult.added, ["2026-07-22"]);
assert.equal(frozenSource.sets["OP-01"].weekly.length, 1, "복사된 수요일 행으로 증가분을 만들지 않는다");
assert.match(frozenSource.corrections["OP-01"][0].reason, /repeated the previous day's cumulative row on 2026-07-22/);

console.log("GemRate PSA collector tests passed");
