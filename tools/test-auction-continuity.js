#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { previousDayAssessment } = require("./collection-continuity");

const audit = path.join(__dirname, "audit-series-gaps.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "opbox-continuity-"));
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir);

const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value), "utf8");
const activeGames = ["pokemonjp", "pokemon", "magic", "yugioh", "onepiece", "lorcana", "weiss", "digimon", "riftbound", "unionarena", "gundam", "dragonball", "palworld"];
const tcgDay = (d, missingKey = null) => ({
  d,
  games: activeGames.map((k) => ({
    k,
    live: k === missingKey ? null : 100,
    endingToday: 20,
  })),
});
const tcgSeriesDay = (d, thinKey = null) => ({
  d,
  games: Object.fromEntries(activeGames.map((key) => [key, { ended: key === thinKey ? 1 : 100 }])),
});

function runAudit(days = "2") {
  const result = spawnSync(process.execPath, [audit, "--root", root, "--today", "2026-09-03", "--days", days, "--daily-only", "--json"], {
    encoding: "utf8",
  });
  return { result, report: JSON.parse(result.stdout) };
}

try {
  write("known-gaps.json", { gaps: [] });
  write("auction-watch.json", { pending: [] });
  write("tcg-watch.json", { pending: [] });
  write("auction-series.json", { daily: [
    { d: "2026-09-01", partial: false, hourGapHours: 0, ended: 900 },
    { d: "2026-09-02", partial: true, hourGapHours: 6, ended: 979 },
  ] });
  write("tcg-snapshot.json", { points: [tcgDay("2026-09-01"), tcgDay("2026-09-02")] });
  write("tcg-series.json", { daily: [tcgSeriesDay("2026-09-01"), tcgSeriesDay("2026-09-02")] });
  // 팰월드 전용 관측·낙찰 파일은 일부러 두지 않는다 — 2026-11-05 수집 중단·동결(가드 PW1) 뒤로는 일일 감사가
  // 그 파일을 요구하면 안 된다(종전엔 없으면 "팰월드 경매 관측 파일을 못 읽었다"로 FAIL 했다).

  let out = runAudit();
  assert.ok(!out.report.problems.some((p) => /팰월드/.test(p)), `동결된 팰월드 전용 계열을 일일 감사가 요구하면 안 된다: ${out.result.stdout}`);
  assert.equal(out.result.status, 1, "the exact previous-day partial collection must fail the audit");
  assert.ok(out.report.problems.some((p) => /원피스 경매 일별.*2026-09-02.*부분수집.*6시간/.test(p)), out.result.stdout);

  write("auction-series.json", { daily: [
    { d: "2026-09-01", partial: false, hourGapHours: 0, ended: 900 },
    { d: "2026-09-02", partial: false, hourGapHours: 0, ended: 950 },
  ] });
  write("tcg-snapshot.json", { points: [tcgDay("2026-09-01"), tcgDay("2026-09-02", "onepiece")] });
  out = runAudit();
  assert.equal(out.result.status, 1, "a missing required TCG field on the previous day must fail the audit");
  assert.ok(out.report.problems.some((p) => /TCG 시장 스냅샷.*2026-09-02.*onepiece.*live/.test(p)), out.result.stdout);

  write("tcg-snapshot.json", { points: [tcgDay("2026-09-01"), tcgDay("2026-09-02")] });
  write("tcg-series.json", { daily: [tcgSeriesDay("2026-09-01"), tcgSeriesDay("2026-09-02", "onepiece")] });
  out = runAudit();
  assert.equal(out.result.status, 1, "abnormally thin previous-day settlement must fail even when the workflow reported success");
  assert.ok(out.report.problems.some((p) => /TCG 정산 일별.*2026-09-02.*onepiece.*1\/10/.test(p)), out.result.stdout);

  // 조사가 끝난 영구 공백은 known-gaps.json 에 사유·확인일과 함께 등록되면 경고가 아니라 메모다.
  // 2026-09-03: 이 필터가 없어서 복구 불가한 9/2 공백이 2시간마다 재실행+실패 메일을 냈다.
  write("tcg-series.json", { daily: [tcgSeriesDay("2026-09-01"), tcgSeriesDay("2026-09-02")] });
  write("auction-series.json", { daily: [
    { d: "2026-09-01", partial: false, hourGapHours: 0, ended: 900 },
    { d: "2026-09-02", partial: true, hourGapHours: 6, ended: 979 },
  ] });
  write("known-gaps.json", { gaps: [{ series: "원피스 경매 일별", dates: ["2026-09-02"], reason: "테스트용 영구 공백", confirmed: "2026-09-03" }] });
  out = runAudit();
  assert.equal(out.result.status, 0, `a confirmed permanent gap must be a note, not a repeating failure: ${out.result.stdout}`);
  assert.deepEqual(out.report.problems, []);
  assert.ok(out.report.notes.some((n) => /원피스 경매 일별.*2026-09-02.*부분수집.*known-gaps/.test(n)), out.result.stdout);

  // 사유나 확인일이 빠진 등록은 인정하지 않는다 — 새 공백을 조용히 덮는 데 못 쓰게.
  write("known-gaps.json", { gaps: [{ series: "원피스 경매 일별", dates: ["2026-09-02"], reason: "테스트용 영구 공백" }] });
  out = runAudit();
  assert.equal(out.result.status, 1, "an unconfirmed known-gap entry must not silence the audit");

  // 자가치유 쪽 — 등록된 공백은 재실행(dispatch) 대상에서도 빠진다.
  const direct = previousDayAssessment({
    auctionSeries: { daily: [{ d: "2026-09-02", partial: true, hourGapHours: 6, ended: 979 }] },
    tcgSnapshot: { points: [tcgDay("2026-09-02")] },
    tcgSeries: { daily: [tcgSeriesDay("2026-09-02", "onepiece")] },
    day: "2026-09-02",
    knownGaps: new Set(["원피스 경매 일별|2026-09-02", "TCG 정산 일별|2026-09-02"]),
  });
  assert.deepEqual(direct.problems, []);
  assert.equal(direct.known.length, 2, JSON.stringify(direct));
  assert.deepEqual(direct.recovery, { auction: false, tcg: false });

  write("known-gaps.json", { gaps: [] });
  write("auction-series.json", { daily: [
    { d: "2026-09-01", partial: false, hourGapHours: 0, ended: 900 },
    { d: "2026-09-02", partial: false, hourGapHours: 0, ended: 950 },
  ] });
  out = runAudit();
  assert.equal(out.result.status, 0, out.result.stdout);
  assert.deepEqual(out.report.problems, []);

  // 지난 날(직전 완료일보다 앞) — 2026-09-30. 직전 하루만 보면 부분일이 하루 지나 보고에서 사라졌다(점검 비평 C3).
  // 창 3일이면 9/01 이 지난 날이다. 그날 부분수집·정산 부족은 감시목록에서 빠진 뒤라면 확정 손실로 FAIL.
  write("auction-series.json", { daily: [
    { d: "2026-09-01", partial: true, hourGapHours: 5, ended: 400 },
    { d: "2026-09-02", partial: false, hourGapHours: 0, ended: 950 },
  ] });
  write("tcg-series.json", { daily: [tcgSeriesDay("2026-09-01", "magic"), tcgSeriesDay("2026-09-02")] });
  out = runAudit("3");
  assert.equal(out.result.status, 1, "a past partial day must stay visible after it stops being the previous day");
  assert.ok(out.report.problems.some((p) => /원피스 경매 일별 — 지난 날 2026-09-01 부분수집 \(5시간/.test(p)), out.result.stdout);
  assert.ok(out.report.problems.some((p) => /TCG 정산 일별 — 지난 날 2026-09-01 .*magic 1\/10/.test(p)), out.result.stdout);

  // 그날 종료분이 감시목록에 남아 있으면 아직 회수 중이다 — 손실로 치지 않는다(오탐 금지).
  write("auction-watch.json", { pending: [{ id: "a", endsAt: "2026-09-01T23:00:00.000Z" }] });
  write("tcg-watch.json", { pending: [{ g: "magic", id: "t", end: "2026-09-01T23:00:00.000Z" }] });
  out = runAudit("3");
  assert.equal(out.result.status, 0, `a day still being settled is not a loss yet: ${out.result.stdout}`);

  // 스냅샷이 없는 지난 날은 감시 하한(125)의 절반으로 본다 — 스냅샷 실행이 감시 표본을 넣으므로 그날 표본이 안 들어갔다(9/26 실제).
  write("auction-watch.json", { pending: [] });
  write("tcg-watch.json", { pending: [] });
  write("auction-series.json", { daily: [
    { d: "2026-09-01", partial: false, hourGapHours: 0, ended: 900 },
    { d: "2026-09-02", partial: false, hourGapHours: 0, ended: 950 },
  ] });
  write("tcg-snapshot.json", { points: [tcgDay("2026-09-02")] });
  write("tcg-series.json", { daily: [tcgSeriesDay("2026-09-01", "onepiece"), tcgSeriesDay("2026-09-02")] });
  out = runAudit("3");
  assert.ok(out.report.problems.some((p) => /TCG 정산 일별 — 지난 날 2026-09-01 .*스냅샷 없어 감시 하한 기준.*onepiece 1\/62/.test(p)), out.result.stdout);

  // 조사가 끝나 등록된 지난 날은 메모다.
  write("known-gaps.json", { gaps: [{ series: "TCG 정산 일별", dates: ["2026-09-01"], reason: "테스트용 영구 공백", confirmed: "2026-09-03" }] });
  out = runAudit("3");
  assert.equal(out.result.status, 0, out.result.stdout);
  assert.ok(out.report.notes.some((n) => /TCG 정산 일별 — 지난 날 2026-09-01 .*known-gaps/.test(n)), out.result.stdout);
  console.log("auction continuity tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
