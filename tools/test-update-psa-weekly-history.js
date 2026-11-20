#!/usr/bin/env node
// update-psa-weekly-history.js — PSA 세트 누적 신선도 검사만 남았다(2026-11-20, 옛 applySnapshot 적재 경로 삭제).
const assert = require("node:assert/strict");
const { checkFreshness, dayDiff, readCumulativeSnapshot } = require("./update-psa-weekly-history");

assert.equal(dayDiff("2026-07-15", "2026-07-22"), 7);
assert.equal(dayDiff("2026-07-15", "2026-07-21"), 6);

const data = {
  jp: { list: ["OP-01", "OP-02"] },
  extra: { list: ["OP-17"] },
  sets: {
    "OP-01": { psaFull: { total: 100, updated: "2026-11-07" } },
    "OP-02": { psaFull: { total: 200, updated: "2026-11-06" } },
    "OP-17": {},
  },
};
const snapshot = readCumulativeSnapshot(data);
assert.equal(snapshot.date, "2026-11-06", "신선도는 가장 낡은 세트로 잰다");
assert.deepEqual(snapshot.dates, ["2026-11-06", "2026-11-07"]);
assert.equal(snapshot.total, 300);
assert.deepEqual(Object.keys(snapshot.sets), ["OP-01", "OP-02"], "누적이 없는 신생 세트는 건너뛴다");

assert.equal(checkFreshness(data, "2026-11-14").sourceAgeDays, 8);
assert.throws(() => checkFreshness(data, "2026-11-15"), /9 days old/);
assert.throws(() => readCumulativeSnapshot({ jp: { list: ["OP-01", "OP-02", "OP-03"] }, sets: { "OP-01": { psaFull: { total: 1, updated: "2026-11-06" } } } }), /수집 실패/);

console.log("PSA freshness tests passed");
