#!/usr/bin/env node
// psa-snapshot-select.js(공유 날짜 선택기) + 두 적재기(psa-edition-weekly-ingest · appendVerifiedWeeks) + import f 규칙 + 가드 D3 — 2026-11-20.
// 픽스처는 실제 덤프(box-sold-cdp/runs/g1119/psa-trend.json) 모양을 흉내 낸다: 41계열(일본판 22 + 영문판 19), 10/27 까지 매일,
// 10/28 은 35/41 이 10/27 복사, 10/29 는 41/41 복사, 그 뒤 11/06(금) 4 · 11/13(금) 41 · 11/14(토) 17 · 11/16(월) 4, 수집 11/19.
const assert = require("node:assert/strict");
const { frozenOn, isoWeek, snapshotTargets, rowsByKeyFromDump, selectionBasis, selectSnapshots } = require("./psa-snapshot-select");
const { ingestEditionWeekly } = require("./psa-edition-weekly-ingest");
const { appendVerifiedWeeks } = require("./collect-gemrate-psa-history");
const { applyGemRateHistory } = require("./import-gemrate-psa-history");
const { psaWeeklyPoints } = require("./guard/ledgers");

const DAY = 864e5;
const ms = (date) => Date.parse(`${date}T00:00:00Z`);
const ymd = (time) => new Date(time).toISOString().slice(0, 10);
const plus = (date, n) => ymd(ms(date) + n * DAY);
const between = (from, to) => { const out = []; for (let t = ms(from); t <= ms(to); t += DAY) out.push(ymd(t)); return out; };
const wednesdays = (from, to) => between(from, to).filter((d) => new Date(ms(d)).getUTCDay() === 3);

// ── isoWeek · snapshotTargets ────────────────────────────────────────────────
assert.equal(isoWeek("2026-10-27"), "2026-W44");
assert.equal(isoWeek("2026-11-01"), "2026-W44", "일요일은 그 주 끝");
assert.equal(isoWeek("2026-11-02"), "2026-W45");
assert.equal(isoWeek("2026-11-19"), "2026-W47");
assert.equal(isoWeek("2025-12-29"), "2026-W01", "목요일이 든 해가 주의 해");
assert.equal(isoWeek("2027-01-01"), "2026-W53");
assert.equal(isoWeek("2021-01-03"), "2020-W53");
assert.deepEqual(
  snapshotTargets({ sets: { "OP-01": {}, "OP-14": {} } }, { sets: { "OP-01": { url: "u" }, "OP-14": null, "OP-15": { totalGrades: 5 } } }),
  ["OP-01|jp", "OP-14|jp", "OP-01|en"],
  "영문판 미발매(null)·url 없는 세트는 대상이 아니다",
);
assert.deepEqual(Object.keys(rowsByKeyFromDump({ jp: { "OP-01": [] }, en: {} }, ["OP-01|jp", "OP-01|en"])), ["OP-01|jp"], "덤프에 없는 대상은 빠진다");

// ── 실제 덤프 모양 픽스처 ─────────────────────────────────────────────────────
const JP = Array.from({ length: 22 }, (_, i) => `OP-${String(i + 1).padStart(2, "0")}`);
const EN = JP.slice(0, 19);
const KEYS = [...JP.map((c) => `${c}|jp`), ...EN.map((c) => `${c}|en`)];
// 계열마다 매일 다른 폭으로 느는 누적 — 복사(직전 행과 같음)는 일부러 넣은 날에만 생긴다.
const real = (key, date) => {
  const i = KEYS.indexOf(key) >= 0 ? KEYS.indexOf(key) : 50;
  const g = 1000 * (i + 1) + ((ms(date) - ms("2026-01-01")) / DAY) * (i + 3);
  return { date, total_grades: g, total_gems: Math.floor(g * 0.9) };
};
const copyOf = (row, date) => ({ ...row, date });
function realDump({ copy1113 = false } = {}) {
  const series = {};
  KEYS.forEach((key, i) => {
    const rows = between("2026-07-01", "2026-10-27").map((d) => real(key, d));
    rows.push(i < 35 ? copyOf(rows.at(-1), "2026-10-28") : real(key, "2026-10-28"));   // 35/41 복사
    rows.push(copyOf(rows.at(-1), "2026-10-29"));                                       // 41/41 복사
    if (i >= 18 && i < 22) rows.push(real(key, "2026-11-06"));                           // 4계열
    rows.push(copy1113 && i < 35 ? copyOf(rows.at(-1), "2026-11-13") : real(key, "2026-11-13"));
    if (i < 17) rows.push(real(key, "2026-11-14"));                                      // 17계열
    if (i >= 30 && i < 34) rows.push(real(key, "2026-11-16"));                           // 4계열
    series[key] = rows;
  });
  const dump = { collectedAt: "2026-11-19T10:12:00.000Z", jp: {}, en: {} };
  for (const [key, rows] of Object.entries(series)) { const [code, ed] = key.split("|"); dump[ed][code] = rows; }
  return dump;
}
const jpHist = () => ({ sets: Object.fromEntries(JP.map((c) => [c, {}])) });
const enTotals = { sets: { ...Object.fromEntries(EN.map((c) => [c, { url: `https://www.gemrate.com/set-population-trend?set_name=${c}` }])), "OP-20": null, "OP-21": null, "OP-22": null } };
const TARGETS = snapshotTargets(jpHist(), enTotals);
assert.equal(TARGETS.length, 41);
// 통합 담당 정정 뒤의 판별 원장: 07-15 ~ 10-21 수요일 15주, 점 = 덤프 행.
function editionLedger(weeks = wednesdays("2026-07-15", "2026-10-21")) {
  const src = realDump();
  const sets = {};
  for (const key of KEYS) {
    const [code, ed] = key.split("|");
    (sets[code] ||= {})[ed] = weeks.map((d) => { const r = src[ed][code].find((row) => row.date === d); return { d, g: r.total_grades, m: r.total_gems }; });
  }
  return { version: 1, basis: "fixture", note: "fixture", sets, weeks: [...weeks], problems: [], updated: weeks.at(-1) };
}
const select = (dump, lastDate, required = KEYS) => selectSnapshots({ rowsByKey: rowsByKeyFromDump(dump, KEYS), required, lastDate, collectedOn: dump.collectedAt.slice(0, 10) });

// ── 선택기: 실제 덤프 모양 ────────────────────────────────────────────────────
const dump = realDump();
const live = select(dump, "2026-10-21");
// 수요일 10/28 은 35/41 복사, 목 10/29 는 41/41 복사 → 같은 주 화 10/27(수요일에 가장 가까운 완전·비복사 날).
// W45 는 11/06 4/41 뿐 → 빈 주. W46 은 41/41 금 11/13(17/41 토 11/14 는 안 씀). W47 은 아직 안 끝났고 수요일 행 없음 → pending.
assert.deepEqual(live.chosen, [{ week: "2026-W44", date: "2026-10-27" }, { week: "2026-W46", date: "2026-11-13" }]);
assert.deepEqual(live.pending, ["2026-W47"]);
assert.equal(live.gaps.length, 1);
assert.equal(live.gaps[0].week, "2026-W45");
assert.deepEqual(live.gaps[0].days.map(({ date, have, of, copy }) => ({ date, have, of, copy })), [{ date: "2026-11-06", have: 4, of: 41, copy: false }]);
assert.equal(live.gaps[0].days[0].missing.length, 37);
assert.equal(frozenOn(rowsByKeyFromDump(dump, KEYS), "2026-10-28").size, 35, "10/28 복사 계열만 고른다");
assert.equal(frozenOn(rowsByKeyFromDump(dump, KEYS), "2026-10-29").size, 41);

// 매일 행 → 주마다 수요일 하나. 끝나지 않은 주도 수요일이 되면 고른다. 밀린 주는 한 번에 채운다.
const daily = { ...dump, collectedAt: "2026-07-30" };
assert.deepEqual(select(daily, "2026-07-08").chosen.map((c) => c.date), ["2026-07-15", "2026-07-22", "2026-07-29"]);
const backfill = select({ ...dump, collectedAt: "2026-07-20" }, "2026-07-01");
assert.deepEqual(backfill.chosen.map((c) => c.date), ["2026-07-08", "2026-07-15"], "두 주 밀려도 한 실행에서 채운다");
assert.deepEqual(backfill.pending, ["2026-W30"]);
// 수집일 당일·이후 행은 안 쓴다(수집 중간의 부분 행일 수 있다).
const today = select({ ...dump, collectedAt: "2026-07-22" }, "2026-07-15");
assert.deepEqual(today.chosen, []);
assert.deepEqual(today.pending, ["2026-W30"], "수요일 = 수집일이면 기다린다 — 빈 주가 아니다");
assert.deepEqual(today.gaps, []);
// 끝나지 않은 주의 수요일이 복사일이면 pending(빈 주 아님).
const midWeek = select({ ...dump, collectedAt: "2026-10-30" }, "2026-10-21");
assert.deepEqual(midWeek.chosen, []);
assert.deepEqual(midWeek.pending, ["2026-W44"]);
assert.deepEqual(midWeek.gaps, []);
// 여러 날 쉬었다 온 복사본도 잡는다: 11/13 이 35/41 계열에서 10/29 와 같으면 복사일 → W46 도 빈 주.
const lateCopy = select(realDump({ copy1113: true }), "2026-10-21");
assert.deepEqual(lateCopy.chosen.map((c) => c.date), ["2026-10-27"]);
assert.deepEqual(lateCopy.gaps.map((g) => g.week), ["2026-W45", "2026-W46"]);
assert.deepEqual(lateCopy.gaps[1].days.map(({ date, have, copy }) => ({ date, have, copy })), [{ date: "2026-11-13", have: 41, copy: true }, { date: "2026-11-14", have: 17, copy: false }]);
assert.throws(() => selectSnapshots({ rowsByKey: {}, required: [], lastDate: "2026-10-21", collectedOn: "2026-11-19" }), /required 가 비었다/);

// 같은 거리면 뒤 날: 수요일이 안 되면 목(화보다 먼저), 수·목·화가 안 되면 금(월보다 먼저).
const small = (skip) => {
  const keys = ["A|jp", "B|jp", "C|jp"];
  return Object.fromEntries(keys.map((key, i) => [key, between("2026-07-13", "2026-07-26").filter((d) => !(key === "C|jp" && skip.includes(d))).map((d) => ({ date: d, total_grades: 100 * (i + 1) + ms(d) / DAY, total_gems: 1 }))]));
};
const pickIn = (skip) => selectSnapshots({ rowsByKey: small(skip), required: ["A|jp", "B|jp", "C|jp"], lastDate: "2026-07-15", collectedOn: "2026-07-27" }).chosen;
assert.deepEqual(pickIn(["2026-07-22"]), [{ week: "2026-W30", date: "2026-07-23" }], "목 > 화");
assert.deepEqual(pickIn(["2026-07-22", "2026-07-23", "2026-07-21"]), [{ week: "2026-W30", date: "2026-07-24" }], "금 > 월");
assert.deepEqual(pickIn(["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"]), [{ week: "2026-W30", date: "2026-07-25" }], "토 > 일");

// 목요일만·금요일만 내는 상류 → 그 요일로 7일 간격.
const weekdayOnly = (weekday) => {
  const rows = (i) => between("2026-07-01", "2026-08-09").filter((d) => new Date(ms(d)).getUTCDay() === weekday).map((d) => ({ date: d, total_grades: 1000 * (i + 1) + ms(d) / DAY, total_gems: 10 }));
  return { "A|jp": rows(0), "B|en": rows(1) };
};
const thursdays = selectSnapshots({ rowsByKey: weekdayOnly(4), required: ["A|jp", "B|en"], lastDate: "2026-07-09", collectedOn: "2026-08-03" });
assert.deepEqual(thursdays.chosen.map((c) => c.date), ["2026-07-16", "2026-07-23", "2026-07-30"]);
assert.deepEqual(thursdays.pending, ["2026-W32"]);
const fridays = selectSnapshots({ rowsByKey: weekdayOnly(5), required: ["A|jp", "B|en"], lastDate: "2026-07-10", collectedOn: "2026-08-03" });
assert.deepEqual(fridays.chosen.map((c) => c.date), ["2026-07-17", "2026-07-24", "2026-07-31"]);

// frozenOn 일반화(직전 행)는 매일 행에서 옛 규칙(달력 전날 행)과 같다.
const oldFrozenOn = (rowsByKey, date) => {
  const prevDate = plus(date, -1); const same = []; let comparable = 0;
  for (const [key, rows] of Object.entries(rowsByKey)) {
    const current = rows.find((r) => r.date === date); const previous = rows.find((r) => r.date === prevDate);
    if (!current || !previous) continue;
    comparable += 1;
    if (current.total_grades === previous.total_grades && current.total_gems === previous.total_gems) same.push(key);
  }
  return comparable && same.length * 2 >= comparable ? new Set(same) : new Set();
};
const dailyRows = rowsByKeyFromDump(dump, KEYS);
for (const date of between("2026-07-02", "2026-10-29")) assert.deepEqual([...frozenOn(dailyRows, date)].sort(), [...oldFrozenOn(dailyRows, date)].sort(), date);

// ── 판별 누적 적재기(psa-edition-weekly-ingest) ────────────────────────────────
const ledger = editionLedger();
const before = structuredClone(ledger);
const ok = ingestEditionWeekly(ledger, dump, TARGETS);
assert.deepEqual(ledger, before, "입력 원장은 고치지 않는다");
assert.equal(ok.status, "ok");
assert.deepEqual(ok.added, [{ week: "2026-W44", date: "2026-10-27", series: 41 }, { week: "2026-W46", date: "2026-11-13", series: 41 }]);
assert.deepEqual(ok.gaps.map((g) => g.week), ["2026-W45"]);
assert.deepEqual(ok.pending, ["2026-W47"]);
assert.deepEqual(ok.ledger.weeks.slice(-3), ["2026-10-21", "2026-10-27", "2026-11-13"], "빈 주는 원장에 아무것도 안 남긴다");
assert.equal(ok.ledger.updated, "2026-11-13");
assert.deepEqual(ok.ledger.problems, [], "빈 주는 problems 도 안 쓴다");
const r1113 = real("OP-01|jp", "2026-11-13");
assert.deepEqual(ok.ledger.sets["OP-01"].jp.slice(-2), [{ d: "2026-10-27", ...(({ total_grades: g, total_gems: m }) => ({ g, m }))(real("OP-01|jp", "2026-10-27")) }, { d: "2026-11-13", g: r1113.total_grades, m: r1113.total_gems }]);
// 같은 덤프를 다시 넣으면 'nothing-new' — 넣은 게 없으면 'ok' 라고 하지 않는다.
const again = ingestEditionWeekly(ok.ledger, dump, TARGETS);
assert.equal(again.status, "nothing-new");
assert.deepEqual(again.added, []);
assert.deepEqual(again.pending, ["2026-W47"]);
// 사전 검사 (a) 원장 점 ≠ 덤프 · (b) 원장 날짜가 복사일 · (c) 대상이 덤프에 없음 → 아무것도 안 쓰고 중단.
const badA = editionLedger(); badA.sets["OP-05"].en[3].g += 1;
const abortA = ingestEditionWeekly(badA, dump, TARGETS);
assert.equal(abortA.status, "abort");
assert.equal(abortA.ledger, undefined);
assert.match(abortA.offenders.join("\n"), /\(a\) OP-05\/en 2026-08-05/);
const abortB = ingestEditionWeekly(editionLedger(wednesdays("2026-07-15", "2026-10-28")), dump, TARGETS);
assert.equal(abortB.status, "abort");
assert.deepEqual(abortB.offenders, ["(b) 2026-10-28: 덤프에서 복사일 — 35계열이 직전 행과 같다(원장 점이 상류 복사본)"]);
const noC = realDump(); delete noC.en["OP-19"];
const abortC = ingestEditionWeekly(editionLedger(), noC, TARGETS);
assert.equal(abortC.status, "abort");
assert.match(abortC.offenders.join("\n"), /\(c\) OP-19\|en: 덤프에 없음/);
// 필수 계열 하나가 누적 역행한 날은 선택기가 못 쓰는 날로 본다 — 그 주에 다른 완전한 날이 없으면 빈 주(멈추지 않는다).
// 2026-11-20 검토 지적: 전엔 판별 적재기만 역행으로 멈추고 일본판 이력은 정정으로 넘어가 두 원장 날짜가 영영 갈라졌다.
const regress = realDump();
const op07 = regress.jp["OP-07"].find((r) => r.date === "2026-11-13"); op07.total_grades = real("OP-07|jp", "2026-10-26").total_grades;
const regEdition = ingestEditionWeekly(editionLedger(), regress, TARGETS);
assert.equal(regEdition.status, "ok");
assert.deepEqual(regEdition.added.map((x) => x.date), ["2026-10-27"]);
assert.deepEqual(regEdition.gaps.map((g) => g.week), ["2026-W45", "2026-W46"]);
assert.deepEqual(regEdition.gaps[1].days.find((d) => d.date === "2026-11-13").invalid, ["OP-07|jp"]);

// 리셋 행(2026-06-10 OP-05 일판 64,755 → 73 → 65,081 같은)이 수요일에 오면 두 원장 모두 목요일로 비켜 간다.
const dailyKeysDump = (from, to, collectedAt) => {
  const out = { collectedAt, jp: {}, en: {} };
  for (const key of KEYS) { const [code, ed] = key.split("|"); out[ed][code] = between(from, to).map((d) => real(key, d)); }
  return out;
};
const ledgerOn = (src, weeks) => {
  const sets = {};
  for (const key of KEYS) { const [code, ed] = key.split("|"); (sets[code] ||= {})[ed] = weeks.map((d) => { const r = src[ed][code].find((row) => row.date === d); return { d, g: r.total_grades, m: r.total_gems }; }); }
  return { version: 1, basis: "fixture", note: "fixture", sets, weeks: [...weeks], problems: [], updated: weeks.at(-1) };
};
const histOn = (weeks) => {
  const h = { collectedAt: weeks.at(-1), weeklyThrough: weeks.at(-1), retainedWeeklyDates: [...weeks], corrections: {}, sets: {} };
  for (const code of JP) {
    const key = `${code}|jp`;
    const last = real(key, weeks.at(-1));
    h.sets[code] = { url: "u", latest: { date: weeks.at(-1), totalGrades: last.total_grades, totalGems: last.total_gems },
      weekly: weeks.map((d) => ({ d, grades: 7, gems: 6, totalGrades: real(key, d).total_grades, totalGems: real(key, d).total_gems })) };
  }
  return h;
};
const resetDump = dailyKeysDump("2026-11-20", "2026-12-13", "2026-12-14T01:00:00.000Z");
Object.assign(resetDump.jp["OP-05"].find((r) => r.date === "2026-12-09"), { total_grades: 73, total_gems: 47 });
const resetLedger = ledgerOn(resetDump, ["2026-11-25", "2026-12-02"]);
const resetEdition = ingestEditionWeekly(resetLedger, resetDump, TARGETS);
assert.equal(resetEdition.status, "ok");
assert.deepEqual(resetEdition.added.map((x) => x.date), ["2026-12-10"], "리셋 수요일(12/09) 대신 목요일");
const resetBasis = selectionBasis(resetLedger, TARGETS);
const resetHist = histOn(["2026-11-25", "2026-12-02"]);
const resetJp = appendVerifiedWeeks(resetHist, resetDump, resetBasis.required, resetBasis.floors);
assert.deepEqual(resetJp.added, ["2026-12-10"], "일본판 이력도 같은 목요일");
assert.deepEqual(resetHist.corrections, {}, "정정 없이 넘어간다");
// 리셋이 며칠 이어져 그 주에 바닥값(원장 마지막 누적) 이상인 완전한 날이 없으면 두 원장 모두 같은 빈 주.
const longReset = dailyKeysDump("2026-11-20", "2026-12-13", "2026-12-14T01:00:00.000Z");
for (const r of longReset.jp["OP-05"]) if (r.date >= "2026-12-07") Object.assign(r, { total_grades: 73 + Number(r.date.slice(8)), total_gems: 40 });
const longEdition = ingestEditionWeekly(ledgerOn(longReset, ["2026-11-25", "2026-12-02"]), longReset, TARGETS);
assert.equal(longEdition.status, "nothing-new");
assert.deepEqual(longEdition.gaps.map((g) => g.week), ["2026-W50"]);
const longJp = appendVerifiedWeeks(histOn(["2026-11-25", "2026-12-02"]), longReset, resetBasis.required, resetBasis.floors);
assert.equal(longJp.changed, false);
assert.deepEqual(longJp.gaps.map((g) => g.week), ["2026-W50"]);

// 새 대상이 여러 주를 한 번에 채우는 실행 중에 합류하면 다음 주부터 필수 — 원장에 구멍이 안 생긴다(검토 지적).
const joinDump = dailyKeysDump("2026-11-20", "2026-12-20", "2026-12-21T01:00:00.000Z");
joinDump.jp["OP-23"] = [real("OP-23|jp", "2026-12-02"), real("OP-23|jp", "2026-12-17")];   // 12/02(수) 있음 · 12/07~13 주 없음 · 12/17(목) 있음
const joinHist = jpHist(); joinHist.sets["OP-23"] = {};
const joinRun = ingestEditionWeekly(ledgerOn(joinDump, ["2026-11-25"]), joinDump, snapshotTargets(joinHist, enTotals));
assert.equal(joinRun.status, "ok");
assert.deepEqual(joinRun.added.map((x) => [x.date, x.series]), [["2026-12-02", 42], ["2026-12-17", 42]]);
assert.deepEqual(joinRun.gaps.map((g) => g.week), ["2026-W50"], "합류 뒤 OP-23 행이 없는 주는 빈 주");
for (const [code, eds] of Object.entries(joinRun.ledger.sets)) for (const [ed, pts] of Object.entries(eds)) {
  assert.deepEqual(pts.map((p) => p.d), joinRun.ledger.weeks.filter((d) => d >= pts[0].d), `${code}/${ed} 구멍 없음`);
}
// 아직 점이 없는 대상의 값 이상 행은 합류시키지 않고 넘긴다(멈추지 않는다).
const badJoin = realDump();
badJoin.jp["OP-23"] = [{ date: "2026-11-13", total_grades: 10, total_gems: 11 }];
const badJoinRun = ingestEditionWeekly(editionLedger(), badJoin, snapshotTargets(joinHist, enTotals));
assert.equal(badJoinRun.status, "ok");
assert.equal(badJoinRun.ledger.sets["OP-23"], undefined);
// 새 대상은 날짜 선택을 막지 않고, 행이 있는 첫 선택일에 합류한다.
const withNew = realDump();
withNew.jp["OP-23"] = [real("OP-23|jp", "2026-11-10"), real("OP-23|jp", "2026-11-13")];
const newHist = jpHist(); newHist.sets["OP-23"] = {};
const joined = ingestEditionWeekly(editionLedger(), withNew, snapshotTargets(newHist, enTotals));
assert.equal(joined.status, "ok");
assert.deepEqual(joined.added.map((a) => [a.date, a.series]), [["2026-10-27", 41], ["2026-11-13", 42]]);
assert.deepEqual(joined.ledger.sets["OP-23"].jp.map((p) => p.d), ["2026-11-13"]);

// ── 일본판 주간 이력(appendVerifiedWeeks) — 같은 덤프·같은 필수 계열이면 같은 날짜 ──────────────────
function jpSource() {
  const retained = wednesdays("2026-07-15", "2026-10-21");
  const sets = {};
  for (const code of JP) {
    const key = `${code}|jp`;
    sets[code] = {
      url: `https://www.gemrate.com/set-population-trend?set_name=${code}`,
      latest: (({ date, total_grades: totalGrades, total_gems: totalGems }) => ({ date, totalGrades, totalGems }))(real(key, "2026-10-21")),
      weekly: retained.map((d) => {
        const cur = real(key, d), prev = real(key, plus(d, -7));
        return { d, grades: cur.total_grades - prev.total_grades, gems: cur.total_gems - prev.total_gems, totalGrades: cur.total_grades, totalGems: cur.total_gems };
      }),
    };
  }
  return { collectedAt: "2026-10-21", weeklyThrough: "2026-10-21", retainedWeeklyDates: retained, corrections: {}, sets };
}
const history = jpSource();
const result = appendVerifiedWeeks(history, dump, KEYS);
assert.deepEqual(result.added, ["2026-10-27", "2026-11-13"], "판별 원장과 같은 날짜");
assert.deepEqual(result.gaps.map((g) => g.week), ["2026-W45"]);
assert.deepEqual(result.pending, ["2026-W47"]);
assert.deepEqual(history.retainedWeeklyDates.slice(-3), ["2026-10-21", "2026-10-27", "2026-11-13"]);
assert.equal(history.weeklyThrough, "2026-11-13");
// 증가분 = 직전 보관 날짜 누적과의 차: 10/27 − 10/21(6일), 11/13 − 10/27(17일).
const at = (d) => real("OP-01|jp", d);
assert.deepEqual(history.sets["OP-01"].weekly.slice(-2), [
  { d: "2026-10-27", grades: at("2026-10-27").total_grades - at("2026-10-21").total_grades, gems: at("2026-10-27").total_gems - at("2026-10-21").total_gems, totalGrades: at("2026-10-27").total_grades, totalGems: at("2026-10-27").total_gems },
  { d: "2026-11-13", grades: at("2026-11-13").total_grades - at("2026-10-27").total_grades, gems: at("2026-11-13").total_gems - at("2026-10-27").total_gems, totalGrades: at("2026-11-13").total_grades, totalGems: at("2026-11-13").total_gems },
]);
assert.deepEqual(history.corrections, {});
// 직전 보관 날짜의 점도 덤프 행도 없으면 정정(추정 안 함). 다음 날짜는 덤프의 직전 날짜 행으로 잇는다.
const holey = jpSource();
holey.sets["OP-09"].weekly.pop();
holey.corrections = { "OP-09": [{ date: "2026-10-21", reason: "fixture" }] };
const holeyDump = realDump();
holeyDump.jp["OP-09"] = holeyDump.jp["OP-09"].filter((r) => r.date !== "2026-10-21");
appendVerifiedWeeks(holey, holeyDump, KEYS);
assert.deepEqual(holey.corrections["OP-09"].at(-1), { date: "2026-10-27", reason: "GemRate public source did not expose the previous snapshot row; omitted rather than estimated." });
assert.deepEqual(holey.sets["OP-09"].weekly.at(-1).d, "2026-11-13");
assert.equal(holey.sets["OP-09"].weekly.at(-1).grades, real("OP-09|jp", "2026-11-13").total_grades - real("OP-09|jp", "2026-10-27").total_grades);
// 같은 덤프로 다시 돌리면 그대로(pending 만).
const rerun = appendVerifiedWeeks(history, dump, KEYS);
assert.equal(rerun.changed, false);
assert.deepEqual(rerun.pending, ["2026-W47"]);

// ── import validateSet(불규칙 날짜 허용 · ISO 주당 하나) + f 규칙 + 가드 D3 ─────────────────────────────
const RETAINED = ["2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-27", "2026-11-13"];
const importSet = (dates) => ({
  url: "https://www.gemrate.com/set-population-trend?grader=psa&set_name=fixture",
  latest: { date: "2026-11-14", totalGrades: 1000, totalGems: 900 },
  weekly: dates.map((d, i) => ({ d, grades: 10 + i, gems: 5 })),
});
const importSource = (retained = RETAINED) => ({
  collectedAt: "2026-11-14", historyStart: "2026-09-30", weeklyThrough: retained.at(-1), retainedWeeklyDates: retained,
  corrections: { "EB-01": [{ date: "2026-10-21", reason: "fixture" }] },
  sets: { "OP-01": importSet(RETAINED), "EB-01": importSet(RETAINED.filter((d) => d !== "2026-10-21")) },
});
const packs = () => ({ jp: { list: ["OP-01"] }, extra: { list: ["EB-01"] }, sets: { "OP-01": {}, "EB-01": {} } });
const imported = packs();
applyGemRateHistory(imported, importSource());
assert.deepEqual(imported.sets["OP-01"].psaWeekly.points.map((p) => [p.f, p.d]), [
  ["2026-09-23", "2026-09-30"], ["2026-09-30", "2026-10-07"], ["2026-10-07", "2026-10-14"], ["2026-10-14", "2026-10-21"], ["2026-10-21", "2026-10-27"], ["2026-10-27", "2026-11-13"],
], "f = 직전 보관 날짜, 첫 보관 날짜는 d − 7일");
assert.deepEqual(imported.sets["EB-01"].psaWeekly.points.find((p) => p.d === "2026-10-27"), { d: "2026-10-27", v: 13, f: "2026-10-21" }, "정정으로 빈 날짜도 직전 보관 날짜다(직전 점이 아니다)");
for (const code of ["OP-01", "EB-01"]) assert.deepEqual(psaWeeklyPoints(importSource(), code), imported.sets[code].psaWeekly.points, `가드 D3 기대 점 = import 결과 (${code})`);
assert.equal(psaWeeklyPoints({ retainedWeeklyDates: ["2026-10-21"], sets: { X: { weekly: [{ d: "2026-10-22", grades: 1 }] } } }, "X")[0].f, null, "보관 날짜에 없는 점은 가드가 불일치로 잡는다");
const twoInWeek = importSource([...RETAINED.slice(0, 4), "2026-10-27", "2026-10-28"]);
twoInWeek.sets["OP-01"] = importSet(twoInWeek.retainedWeeklyDates);
twoInWeek.sets["EB-01"] = importSet(twoInWeek.retainedWeeklyDates.filter((d) => d !== "2026-10-21"));
assert.throws(() => applyGemRateHistory(packs(), twoInWeek), /two dates in 2026-W44/);
const offGrid = importSource();
offGrid.sets["OP-01"].weekly[2].d = "2026-10-15";
assert.throws(() => applyGemRateHistory(packs(), offGrid), /2026-10-15 is not a retained snapshot date/);
const duplicated = importSource();
duplicated.sets["OP-01"].weekly[2].d = duplicated.sets["OP-01"].weekly[1].d;
assert.throws(() => applyGemRateHistory(packs(), duplicated), /weekly dates are not strictly ascending at 2026-10-07/);
const unorderedRetained = importSource(["2026-09-30", "2026-10-14", "2026-10-07", "2026-10-21", "2026-10-27", "2026-11-13"]);
assert.throws(() => applyGemRateHistory(packs(), unorderedRetained), /retainedWeeklyDates are not strictly ascending at 2026-10-07/);
const skipped = importSource();
skipped.sets["OP-01"].weekly.splice(4, 1);
assert.throws(() => applyGemRateHistory(packs(), skipped), /not consecutive at 2026-11-13/, "정정 없이 빠진 보관 날짜는 막는다");

console.log("PSA snapshot selector tests passed");
