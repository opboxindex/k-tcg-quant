#!/usr/bin/env node

const assert = require("node:assert/strict");
const { appendVerifiedWeeks, correctionReason, frozenOn, lastRealRow, lastLiveRow, popReportTotals, popReportLatest } = require("./collect-gemrate-psa-history");

const day = (date, g, m) => ({ date, total_grades: g, total_gems: m });
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// appendVerifiedWeeks(source, dump, required) — dump 는 추이 덤프 통째(2026-11-20, 날짜는 psa-snapshot-select.js 가 고른다)
const dumpOf = (collectedAt, jp) => ({ collectedAt, jp, en: {} });

assert.equal(correctionReason("OP-01", "2026-07-22", 25, 20, [10, 12, 14]), null);
assert.match(correctionReason("OP-01", "2026-07-22", 25000, 20000, [10, 12, 14]), /implausible/);

// 매일 행 → 다음 ISO 주의 수요일 한 점, 증가분 = 직전 보관 날짜(07-15) 누적과의 차.
const rows = [day("2026-07-15", 100, 90), day("2026-07-21", 120, 106), day("2026-07-22", 125, 110), day("2026-07-23", 130, 114)];
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
const required = ["OP-01|jp", "OP-02|jp"];
const result = appendVerifiedWeeks(source, dumpOf("2026-07-24", { "OP-01": rows, "OP-02": rows }), required);
assert.deepEqual(result.added, ["2026-07-22"]);
assert.deepEqual(source.sets["OP-01"].weekly.at(-1), { d: "2026-07-22", grades: 25, gems: 20, totalGrades: 125, totalGems: 110 });
assert.deepEqual(source.retainedWeeklyDates, ["2026-07-15", "2026-07-22"]);
assert.equal(source.weeklyThrough, "2026-07-22");
assert.equal(appendVerifiedWeeks(source, dumpOf("2026-07-24", { "OP-01": rows, "OP-02": rows }), required).changed, false);

// 상류 복사본(직전 행과 같은 행) 거르기 — 2026-11-12 실측(10/28: 41계열 중 35계열이 10/27 과 같았다).
const fresh = (a) => [day("2026-07-21", 100 + a, 90 + a), day("2026-07-22", 110 + a, 99 + a)];
const copied = (a) => [day("2026-07-21", 100 + a, 90 + a), day("2026-07-22", 100 + a, 90 + a)];
// 절반 이상 복사 → 복사된 계열만 고른다
assert.deepEqual([...frozenOn({ A: copied(0), B: copied(1), C: fresh(2) }, "2026-07-22")].sort(), ["A", "B"]);
// 작은 세트 하나만 하루 0건 → 상류 정지가 아니다
assert.equal(frozenOn({ A: copied(0), B: fresh(1), C: fresh(2) }, "2026-07-22").size, 0);
// 전날 행이 없으면 비교하지 않는다
assert.equal(frozenOn({ A: [day("2026-07-22", 5, 4)] }, "2026-07-22").size, 0);
// 직전 행이 며칠 앞이어도 그 행과 비교한다(2026-11-20 — 10/29 다음 행이 11/13 처럼 띄엄띄엄 와도 복사본을 잡는다).
const gapCopy = (a) => [day("2026-10-29", 100 + a, 90 + a), day("2026-11-13", 100 + a, 90 + a)];
const gapReal = (a) => [day("2026-10-29", 100 + a, 90 + a), day("2026-11-13", 150 + a, 130 + a)];
assert.deepEqual([...frozenOn({ A: gapCopy(0), B: gapCopy(1), C: gapReal(2) }, "2026-11-13")].sort(), ["A", "B"]);
assert.equal(frozenOn({ A: gapReal(0), B: gapReal(1), C: gapCopy(2) }, "2026-11-13").size, 0);

// 수요일이 복사일이면 그 주가 끝난 뒤 수요일에 가장 가까운 실제 날(목)을 쓴다 — 복사 행으로 증가분을 만들지 않는다.
const withCopy = (base) => [day("2026-07-15", base, base - 10), day("2026-07-21", base + 20, base + 8), day("2026-07-22", base + 20, base + 8), day("2026-07-23", base + 30, base + 16)];
const frozenSource = () => ({
  collectedAt: "2026-07-20", weeklyThrough: "2026-07-15", retainedWeeklyDates: ["2026-07-15"], corrections: {},
  sets: { "OP-01": { weekly: [{ d: "2026-07-15", grades: 10, gems: 9 }], latest: {} }, "OP-02": { weekly: [{ d: "2026-07-15", grades: 12, gems: 10 }], latest: {} } },
});
const frozenJp = { "OP-01": withCopy(100), "OP-02": withCopy(200) };
const unfinished = frozenSource();
const unfinishedResult = appendVerifiedWeeks(unfinished, dumpOf("2026-07-24", frozenJp), required);
assert.equal(unfinishedResult.changed, false, "끝나지 않은 주의 수요일이 복사일이면 기다린다");
assert.deepEqual(unfinishedResult.pending, ["2026-W30"]);
const finished = frozenSource();
const finishedResult = appendVerifiedWeeks(finished, dumpOf("2026-07-27", frozenJp), required);
assert.deepEqual(finishedResult.added, ["2026-07-23"]);
assert.deepEqual(finished.sets["OP-01"].weekly.at(-1), { d: "2026-07-23", grades: 30, gems: 26, totalGrades: 130, totalGems: 116 });
assert.deepEqual(finished.corrections, {});

// 팝 리포트 대체(2026-11-12): 추이가 10/27 뒤로 복사본(10/28·10/29)만 남고, 팝 리포트가 11/07 로 새것일 때만 쓴다.
const trend = [];
for (let i = 0; i <= 28; i += 1) trend.push(day(plus("2026-09-29", i), 1000 + 10 * i, 900 + 9 * i));
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
// latest 는 뒤로 가지 않는다: 팝 리포트로 바꿔 둔 11/07 값이 있는데 추이가 복사 행을 11/15 까지 붙여도
// (검증 에이전트 b1 시나리오) latest 는 11/07 팝 리포트 값 그대로다. 복사 수요일 대신 W44 는 10/27, 복사뿐인 W45·W46 은 빈 주.
const tail = [...trend];
for (let i = 3; i <= 19; i += 1) tail.push(day(plus("2026-10-27", i), 1280, 1152));
const popLatest = { date: "2026-11-07", totalGrades: 1390, totalGems: 1250, gemRate: 89.9, source: "pop-report" };
const kept = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-21", retainedWeeklyDates: ["2026-10-21"], corrections: {},
  sets: { "OP-01": { weekly: [{ d: "2026-10-21", grades: 70, gems: 63, totalGrades: 1220, totalGems: 1098 }], latest: { ...popLatest } } } };
const keptResult = appendVerifiedWeeks(kept, dumpOf("2026-11-19", { "OP-01": tail }), ["OP-01|jp"]);
assert.deepEqual(keptResult.added, ["2026-10-27"]);
assert.deepEqual(keptResult.gaps.map((g) => g.week), ["2026-W45", "2026-W46"]);
assert.deepEqual(keptResult.pending, ["2026-W47"]);
assert.deepEqual(kept.sets["OP-01"].latest, popLatest, "옛 누적에 새 날짜를 붙여 되돌리지 않는다");
assert.deepEqual(kept.sets["OP-01"].weekly.at(-1), { d: "2026-10-27", grades: 60, gems: 54, totalGrades: 1280, totalGems: 1152 }, "복사 수요일로 증가분을 만들지 않는다");
// 날짜는 새것인데 누적이 작으면 지금 값을 두고 kept 에 남긴다.
const lower = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-21", retainedWeeklyDates: ["2026-10-21"], corrections: {},
  sets: { "OP-01": { weekly: [], latest: { date: "2026-11-07", totalGrades: 99999, totalGems: 90000, gemRate: 90, source: "pop-report" } } } };
const fresher = [...trend, day("2026-10-30", 1300, 1170), day("2026-11-04", 1350, 1215), day("2026-11-10", 1400, 1260), day("2026-11-11", 1410, 1269)];
const lowerResult = appendVerifiedWeeks(lower, dumpOf("2026-11-19", { "OP-01": fresher }), ["OP-01|jp"]);
assert.deepEqual(lowerResult.added, ["2026-10-27", "2026-11-04", "2026-11-11"]);
assert.equal(lower.sets["OP-01"].latest.totalGrades, 99999);
assert.match(lowerResult.kept[0], /지금 값 유지/);
// 새것이고 크면 추이로 바꾼다.
const ok2 = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-21", retainedWeeklyDates: ["2026-10-21"], corrections: {},
  sets: { "OP-01": { weekly: [], latest: { ...popLatest } } } };
appendVerifiedWeeks(ok2, dumpOf("2026-11-19", { "OP-01": fresher }), ["OP-01|jp"]);
assert.deepEqual(ok2.sets["OP-01"].latest, { date: "2026-11-11", totalGrades: 1410, totalGems: 1269, gemRate: 90 });
// 보관 날짜가 덤프에서 복사일이면(정정 전 10/28) 적재하지 않는다.
const stale = { collectedAt: "2026-11-07", weeklyThrough: "2026-10-28", retainedWeeklyDates: ["2026-10-21", "2026-10-28"], corrections: {}, sets: { "OP-01": { weekly: [], latest: {} } } };
assert.throws(() => appendVerifiedWeeks(stale, dumpOf("2026-11-19", { "OP-01": fresher }), ["OP-01|jp"]), /2026-10-28 가 덤프에서 복사일/);

// 정상 주에 작은 세트 하나만 마지막 이틀 감정 0건이면 진짜 값이다 — 날짜를 앞당기지 않는다(상류 정지일만 걷음, 재검증 지적).
const normal = (base, zeroTail) => [day("2026-11-20", base, base - 5), day("2026-11-21", zeroTail ? base : base + 3, zeroTail ? base - 5 : base - 3), day("2026-11-22", zeroTail ? base : base + 6, zeroTail ? base - 5 : base - 1)];
const normalRows = { A: normal(100, true), B: normal(200, false), C: normal(300, false) };
assert.equal(lastLiveRow(normalRows, "A").date, "2026-11-22", "다른 계열이 움직인 날의 0 변동은 걷지 않는다");
assert.equal(lastRealRow(normalRows.A).date, "2026-11-20");
const frozenRows = { A: normal(100, true), B: normal(200, true), C: normal(300, false) };
assert.equal(lastLiveRow(frozenRows, "A").date, "2026-11-20", "다수 계열이 같은 날(상류 정지)이면 걷는다");

console.log("GemRate PSA collector tests passed");
