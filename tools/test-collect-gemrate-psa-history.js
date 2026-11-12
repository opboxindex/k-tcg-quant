#!/usr/bin/env node

const assert = require("node:assert/strict");
const { appendVerifiedWeeks, correctionReason, latestWednesday, frozenOn, lastRealRow, lastLiveRow, popReportTotals, popReportLatest } = require("./collect-gemrate-psa-history");

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

// 팝 리포트 대체(2026-11-12): 추이가 10/27 뒤로 복사본(10/28·10/29)만 남고, 팝 리포트가 11/07 로 새것일 때만 쓴다.
const trend = [];
for (let i = 0; i <= 28; i += 1) trend.push(day(new Date(Date.parse("2026-09-29T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), 1000 + 10 * i, 900 + 9 * i));
trend.push(day("2026-10-28", 1280, 1152), day("2026-10-29", 1280, 1152));   // 10/27 = 1280/1152 복사본 두 줄
const now = { date: "2026-10-29", totalGrades: 1280, totalGems: 1152 };
const pops = popReportTotals({ sets: { "OP-01|jp": [{ total: 300, g10: 270 }, { total: 1090, g10: 980 }], "OP-02|jp": [{ total: 5, g10: 4 }] }, updated: { "OP-01|jp": "2026-11-07" } });
assert.deepEqual(pops, { "OP-01|jp": { date: "2026-11-07", totalGrades: 1390, totalGems: 1250, cards: 2 } }, "기준일 없는 세트는 합계를 만들지 않는다");
const used = popReportLatest(now, trend, pops["OP-01|jp"]);
assert.equal(used.use, true);
assert.deepEqual(used.latest, { date: "2026-11-07", totalGrades: 1390, totalGems: 1250, gemRate: 89.9, source: "pop-report" });
assert.equal(popReportLatest({ ...now, date: "2026-11-07" }, trend, pops["OP-01|jp"]).use, false, "기준일이 같거나 옛것이면 안 바꾼다");
assert.match(popReportLatest(now, trend, { date: "2026-11-07", totalGrades: 1270, totalGems: 1140 }).problem, /보다 작음/, "누적이 줄면 안 바꾼다");
assert.match(popReportLatest(now, trend, { date: "2026-11-07", totalGrades: 1280 + 3 * 10 * 11 + 101, totalGems: 1200 }).problem, /상한/, "최근 속도의 3배+100 을 넘으면 안 바꾼다");
assert.equal(popReportLatest(now, trend, { date: "2026-11-07", totalGrades: 1280 + 3 * 10 * 11 + 100, totalGems: 1200 }).use, true);
assert.equal(popReportLatest(now, trend, undefined).use, false);

// 끝의 복사 행은 새 값이 아니다 — 마지막 실제 변동 행(10/27)을 돌려준다.
assert.equal(lastRealRow(trend).date, "2026-10-27");
assert.equal(lastRealRow([day("2026-10-27", 5, 4)]).date, "2026-10-27");
assert.equal(lastRealRow([]), null);
// latest 는 뒤로 가지 않는다: 팝 리포트로 바꿔 둔 11/07 값이 있는데 추이가 복사 행을 11/15 까지 붙이며 새 수요일을 내도
// (검증 에이전트 b1 시나리오) latest 는 11/07 팝 리포트 값 그대로다.
const tail = [...trend];
for (let i = 1; i <= 19; i += 1) tail.push(day(new Date(Date.parse("2026-10-27T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), 1280, 1152));
const kept = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-28", retainedWeeklyDates: ["2026-10-28"], corrections: {},
  sets: { "OP-01": { weekly: [{ d: "2026-10-28", grades: 70, gems: 63 }], latest: { date: "2026-11-07", totalGrades: 1390, totalGems: 1250, gemRate: 89.9, source: "pop-report" } } } };
const keptResult = appendVerifiedWeeks(kept, { "OP-01": tail });
assert.deepEqual(keptResult.added, ["2026-11-04", "2026-11-11"]);
assert.deepEqual(kept.sets["OP-01"].latest, { date: "2026-11-07", totalGrades: 1390, totalGems: 1250, gemRate: 89.9, source: "pop-report" }, "옛 누적에 새 날짜를 붙여 되돌리지 않는다");
assert.equal(kept.sets["OP-01"].weekly.length, 1, "복사 수요일로 주간 증가분을 만들지 않는다");
// 날짜는 새것인데 누적이 작으면 지금 값을 두고 kept 에 남긴다.
const lower = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-28", retainedWeeklyDates: ["2026-10-28"], corrections: {},
  sets: { "OP-01": { weekly: [], latest: { date: "2026-11-07", totalGrades: 99999, totalGems: 90000, gemRate: 90, source: "pop-report" } } } };
const fresher = [...trend, day("2026-10-30", 1300, 1170), day("2026-11-04", 1350, 1215), day("2026-11-10", 1400, 1260), day("2026-11-11", 1410, 1269)];
const lowerResult = appendVerifiedWeeks(lower, { "OP-01": fresher });
assert.equal(lower.sets["OP-01"].latest.totalGrades, 99999);
assert.match(lowerResult.kept[0], /지금 값 유지/);
// 새것이고 크면 추이로 바꾼다.
const ok2 = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-28", retainedWeeklyDates: ["2026-10-28"], corrections: {},
  sets: { "OP-01": { weekly: [], latest: { date: "2026-11-07", totalGrades: 1390, totalGems: 1250, gemRate: 89.9, source: "pop-report" } } } };
appendVerifiedWeeks(ok2, { "OP-01": fresher });
assert.deepEqual(ok2.sets["OP-01"].latest, { date: "2026-11-11", totalGrades: 1410, totalGems: 1269, gemRate: 90 });

// 정상 주에 작은 세트 하나만 마지막 이틀 감정 0건이면 진짜 값이다 — 날짜를 앞당기지 않는다(상류 정지일만 걷음, 재검증 지적).
const normal = (base, zeroTail) => [day("2026-11-20", base, base - 5), day("2026-11-21", zeroTail ? base : base + 3, zeroTail ? base - 5 : base - 3), day("2026-11-22", zeroTail ? base : base + 6, zeroTail ? base - 5 : base - 1)];
const normalRows = { A: normal(100, true), B: normal(200, false), C: normal(300, false) };
assert.equal(lastLiveRow(normalRows, "A").date, "2026-11-22", "다른 계열이 움직인 날의 0 변동은 걷지 않는다");
assert.equal(lastRealRow(normalRows.A).date, "2026-11-20");
const frozenRows = { A: normal(100, true), B: normal(200, true), C: normal(300, false) };
assert.equal(lastLiveRow(frozenRows, "A").date, "2026-11-20", "다수 계열이 같은 날(상류 정지)이면 걷는다");

console.log("GemRate PSA collector tests passed");
