#!/usr/bin/env node
// 예산 모듈의 창(window) 규칙이 워크플로 크론과 어긋나지 않는지 — 2026-09-03 리셋 창(07:00 UTC) 기준으로 재작성.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SCHEDULE, PER_RUN, reserveLeft, isLastRunBeforeReset, nextReset, runsBeforeReset, auctionNeed, activeListingsFresh, RESET_UTC_HOUR } = require("./ebay-budget");

const cronHours = (file) => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", file), "utf8");
  return [...workflow.matchAll(/cron:\s*["']\d+\s+([\d,]+)\s+\*\s+\*\s+\*["']/g)]
    .flatMap((match) => match[1].split(",").map(Number))
    .sort((a, b) => a - b);
};

assert.equal(RESET_UTC_HOUR, 7, "eBay Browse quota resets at 07:00 UTC (measured 2026-09-03)");
assert.deepEqual([...SCHEDULE.tcg], cronHours("collect-tcg.yml"), "TCG reservation schedule must match every collect-tcg cron hour");
assert.deepEqual([...SCHEDULE.search], cronHours("collect-auction-market.yml"), "search reservation schedule must match every collect-auction-market cron hour");

const at = (iso) => Date.parse(iso);
// 리셋 계산: 07:00 UTC 전이면 오늘, 지났으면 내일.
assert.equal(nextReset(at("2026-09-03T06:30:00Z")), at("2026-09-03T07:00:00Z"));
assert.equal(nextReset(at("2026-09-03T07:00:01Z")), at("2026-09-04T07:00:00Z"));
assert.equal(nextReset(at("2026-09-03T22:10:00Z")), at("2026-09-04T07:00:00Z"));

// 예약은 "리셋 전에 그 워크플로가 더 도는가"로만 결정된다 — 자정 기준이 아니다.
const reset = at("2026-09-04T07:00:00Z");
assert.equal(runsBeforeReset([1, 4, 7], at("2026-09-03T22:10:00Z"), reset), true, "01:30/04:30 UTC runs are still inside the window");
assert.equal(runsBeforeReset([7, 10], at("2026-09-03T22:10:00Z"), reset), false, "the 07:30 run belongs to the next window");
assert.equal(reserveLeft("tcg", at("2026-09-03T22:10:00Z"), reset), PER_RUN.tcg);
assert.equal(reserveLeft("tcg", at("2026-09-04T05:00:00Z"), reset), PER_RUN.tcg, "the 06:45 drain run is still ahead at 05:00");
assert.equal(reserveLeft("tcg", at("2026-09-04T06:50:00Z"), reset), 0, "after the last in-window TCG run nothing is reserved");
assert.equal(reserveLeft("search", at("2026-09-04T03:00:00Z"), reset), PER_RUN.search, "the 04:20 top-up is still ahead");
assert.equal(reserveLeft("search", at("2026-09-04T06:50:00Z"), reset), 0);
assert.equal(reserveLeft("safety", at("2026-09-04T06:50:00Z"), reset), PER_RUN.safety, "safety is never released");
// 창 마지막 회차는 남김 없이 쓴다(소유자: 남으면 포켓몬). 06:45 TCG 회차 뒤엔 리셋까지 TCG 실행이 없다.
assert.equal(isLastRunBeforeReset("tcg", at("2026-09-04T06:46:00Z"), reset), true, "the 06:45 UTC TCG run is the last before the 07:00 reset");
assert.equal(isLastRunBeforeReset("tcg", at("2026-09-04T04:31:00Z"), reset), false, "04:30 still has the 06:45 run ahead");
assert.equal(isLastRunBeforeReset("safety", at("2026-09-04T06:46:00Z"), reset), false, "unscheduled keys never drain");
// 종전 버그 재현 방지: 06:30 UTC 에 "오늘" 남은 실행을 자정 기준으로 세면 예약이 잔여를 넘는다.
assert.equal(reserveLeft("tcg", at("2026-09-03T06:30:00Z")), 0, "06:30 UTC: the next TCG run (07:30) is past the 07:00 reset");

// 원피스가 이 창에서 끝나는 건수 = 감시목록의 실제 개수(추정 아님). 리셋 뒤 종료분은 다음 창 몫.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "opbox-budget-"));
fs.mkdirSync(path.join(root, "data"));
fs.writeFileSync(path.join(root, "data", "auction-watch.json"), JSON.stringify({ pending: [
  { id: "a", endsAt: "2026-09-04T03:00:00Z" },
  { id: "b", endsAt: "2026-09-04T06:59:00Z" },
  { id: "c", endsAt: "2026-09-04T07:30:00Z" },
] }));
// 팰월드 전용 감시목록은 2026-11-05 수집 중단으로 동결됐다(가드 PW1). 대기가 남아 있어도 아무도 정산하지 않으니
// 몫을 잡으면 그만큼 TCG 13종이 영구히 굶는다 — 세면 안 된다.
fs.writeFileSync(path.join(root, "data", "palworld-auction-watch.json"), JSON.stringify({ pending: [{ id: "p", endsAt: "2026-09-04T01:00:00Z" }] }));
try {
  assert.equal(auctionNeed(reset, root), 2, "원피스 감시목록 중 리셋 전 종료분만 센다(동결된 팰월드 감시목록·리셋 뒤 종료분 제외)");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log("eBay budget schedule tests passed");

// 여유분 배분(topup-tcg-watch): 가용 − 못 읽은 대기 − 여유를 게임 수로 나눈다. 못 읽은 여유분이 많은 게임은 쉰다.
{
  const { planTopup, MAX_DUE_PER_GAME, PAGE, MARGIN } = require("./topup-tcg-watch");
  const games = ["a", "b", "c", "d"];
  assert.deepEqual(planTopup({ usable: 1000, owed: 150, games }), { room: 1000 - 150 - MARGIN, perGame: Math.floor((1000 - 150 - MARGIN) / 4), eligible: games });
  assert.equal(planTopup({ usable: 100, owed: 90, games }).perGame, 0, "남는 게 없으면 넣지 않는다");
  assert.equal(planTopup({ usable: 5000, owed: 0, games }).perGame, PAGE, "게임당 한 페이지를 넘지 않는다");
  const skewed = planTopup({ usable: 1000, owed: 0, games, dueByGame: { a: MAX_DUE_PER_GAME } });
  assert.deepEqual(skewed.eligible, ["b", "c", "d"], "못 읽은 여유분이 상한 이상인 게임은 쉰다");
}

// 진행 매물 갱신 예약(active) — 이 쿼터 창에서 아직 안 돌았을 때만 1회분을 남긴다(2026-09-08).
// 2026-09-07 20:51 UTC: 예약이 없어 TCG 보충이 잔여를 다 쓴 뒤 update-active-listings 가 429 로 죽었다.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opbox-active-"));
  fs.mkdirSync(path.join(root, "data"));
  const write = (updated) => fs.writeFileSync(path.join(root, "data", "active-listing-audit.json"), JSON.stringify({ updated }));
  const reset = at("2026-09-09T07:00:00Z");
  write("2026-09-08T20:22:08.133Z");
  assert.equal(activeListingsFresh(reset, root), true, "이 창(리셋 24시간 전 이후)에 갱신됐으면 예약을 풀어 준다");
  write("2026-09-07T20:22:08.133Z");
  assert.equal(activeListingsFresh(reset, root), false, "지난 창의 갱신은 이 창의 예약을 풀지 못한다");
  assert.equal(activeListingsFresh(reset, path.join(root, "missing")), false, "감사 파일이 없으면 예약을 유지한다");
  assert.ok(PER_RUN.active >= 650, "카드 207장 PSA10 링크(≈500) + 박스 호가·매물 수·특가(≈150)를 덮어야 한다");
  // 예약은 22 UTC(창 시작 + 15h)까지만 — 그 뒤엔 실패한 갱신 때문에 정산이 굶지 않게 푼다(2026-09-08 밤 실제).
  const { reserveFor } = require("./ebay-budget");
  write("2026-09-07T20:22:08.133Z");
  assert.equal(reserveFor("active", at("2026-09-08T10:00:00Z"), reset, root), PER_RUN.active, "18 UTC 실행 전에는 1회분을 지킨다");
  assert.equal(reserveFor("active", at("2026-09-08T21:59:00Z"), reset, root), PER_RUN.active, "지연 실행(20~21 UTC)까지는 지킨다");
  assert.equal(reserveFor("active", at("2026-09-08T22:00:00Z"), reset, root), 0, "22 UTC 를 넘기면 이 창에서는 포기하고 정산에 돌린다");
  write("2026-09-08T20:22:08.133Z");
  assert.equal(reserveFor("active", at("2026-09-08T10:00:00Z"), reset, root), 0, "이미 돌았으면 시각과 무관하게 0");
}

// 원피스 유입 예약 — auctionNeed(지금 아는 대기)에 리셋까지 남은 시간 × 시간당 유입(≈70)을 더한다(2026-09-09).
// 2026-09-08: 창 앞에서 TCG 보충이 원피스의 뒷시간 몫까지 가져가 TCG 대기 3,284 중 ≈2,000 이 시한을 넘겨 버려졌다.
{
  const { auctionInflow, OP_INFLOW_PER_HOUR, reserveFor } = require("./ebay-budget");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opbox-inflow-"));
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "auction-watch.json"), JSON.stringify({ pending: [{ id: "a", endsAt: "2026-09-09T03:00:00Z" }] }));
  const reset = at("2026-09-09T07:00:00Z");
  assert.equal(auctionInflow(at("2026-09-08T07:30:00Z"), reset), Math.round(OP_INFLOW_PER_HOUR * 23.5), "창 시작엔 거의 하루치 유입을 남긴다");
  assert.equal(auctionInflow(at("2026-09-09T06:45:00Z"), reset), Math.round(OP_INFLOW_PER_HOUR * 0.25), "드레인 회차엔 15분치만 남는다");
  assert.equal(auctionInflow(at("2026-09-09T07:30:00Z"), reset), 0, "리셋이 지났으면 0");
  assert.equal(reserveFor("auction", at("2026-09-09T06:45:00Z"), reset, root), 1 + Math.round(OP_INFLOW_PER_HOUR * 0.25), "auction 예약 = 아는 대기 + 유입 추정");
}

// TCG 스냅샷 몫(tcgSnapshot) — 2026-10-14. 이 창 안의 UTC 자정(리셋 날짜) 점이 아직 없을 때만 남긴다.
// 9/5~9/8·10/8~10/10: 아무도 이 몫을 남기지 않았고 스냅샷 문턱(400)이 실제 필요(104)보다 높아 00~07 UTC 실행이 전부
// 건너뛰고 07:18(표준 시각 밖)에 찍혔다.
{
  const { reserveFor, snapshotDayFor, RESERVE_KEYS } = require("./ebay-budget");
  const { TCG_SNAPSHOT_CALLS, TCG_SNAPSHOT_RESERVE, TCGS } = require("./tcg-config");
  assert.equal(TCG_SNAPSHOT_CALLS, TCGS.length * 8, "스냅샷 = 게임당 총계·즉시구매·24시간 종료 3콜 + 표본 5페이지");
  assert.equal(PER_RUN.tcgSnapshot, TCG_SNAPSHOT_RESERVE);
  assert.ok(TCG_SNAPSHOT_RESERVE < 400, "몫은 실제 필요에 맞춘다(종전 문턱 400 은 17게임 시절 값)");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opbox-snapkeep-"));
  fs.mkdirSync(path.join(root, "data"));
  const writeSnap = (days) => fs.writeFileSync(path.join(root, "data", "tcg-snapshot.json"), JSON.stringify({ points: days.map((d) => ({ d })) }));
  const reset = at("2026-10-15T07:00:00Z");
  assert.equal(snapshotDayFor(reset), "2026-10-15", "10/14 07:00~10/15 07:00 창이 찍을 점은 10/15 00:18 점");
  try {
    writeSnap(["2026-10-14"]);
    assert.equal(reserveFor("tcgSnapshot", at("2026-10-14T15:00:00Z"), reset, root), TCG_SNAPSHOT_RESERVE, "15:00 UTC: 오늘 점이 있어도 다음 자정 점 몫은 남긴다");
    assert.equal(reserveFor("tcgSnapshot", at("2026-10-15T00:10:00Z"), reset, root), TCG_SNAPSHOT_RESERVE, "00:10 UTC: 아직 안 찍었으면 남긴다");
    writeSnap(["2026-10-14", "2026-10-15"]);
    assert.equal(reserveFor("tcgSnapshot", at("2026-10-15T00:30:00Z"), reset, root), 0, "찍고 나면 바로 푼다");
    assert.equal(reserveFor("tcgSnapshot", at("2026-10-15T07:30:00Z"), at("2026-10-16T07:00:00Z"), root), TCG_SNAPSHOT_RESERVE, "리셋 뒤 새 창은 다음 자정 점 몫을 다시 남긴다");
    assert.equal(reserveFor("tcgSnapshot", at("2026-10-15T00:30:00Z"), reset, path.join(root, "missing")), TCG_SNAPSHOT_RESERVE, "파일을 못 읽으면 남긴다");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // 그 몫은 순서상 뒤인 TCG 쪽(정산·여유분·드레인)만 남긴다. 원피스 검색(①)·정산(②)은 앞 순서라 남기지 않는다 —
  // 남기면 00:05 UTC 원피스 정산이 '잔여 480 · 예약 580 → 가용 0'(9/4)이 되고, 보충 검색이 잔여 200~324 에서 0 이 된다.
  assert.ok(!RESERVE_KEYS.OP_SETTLE.includes("tcgSnapshot"), "원피스 정산은 TCG 스냅샷 몫을 남기지 않는다(순서 ②가 ③보다 앞)");
  assert.ok(RESERVE_KEYS.TCG.includes("tcgSnapshot") && RESERVE_KEYS.TCG.includes("auction"), "TCG 는 원피스 정산 몫까지 남긴다");
  assert.ok(!RESERVE_KEYS.TCG_SNAPSHOT_SIZE.includes("tcgSnapshot"), "스냅샷은 자기 몫을 watchPerGameFor 에서 뺀다");
  for (const [file, re] of [
    ["settle-tcg.js", /reserveFor:\s*RESERVE_KEYS\.TCG\b/],
    ["topup-tcg-watch.js", /reserveFor:\s*RESERVE_KEYS\.TCG\b/],
    ["collect-tcg-snapshot.js", /left < TCG_SNAPSHOT_RESERVE/],
  ]) assert.match(fs.readFileSync(path.join(__dirname, file), "utf8"), re, `${file} 가 스냅샷 몫을 지켜야 한다`);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "collect-auction-market.js"), "utf8"), /reserveFor\(\s*["']tcgSnapshot/, "원피스 검색은 TCG 스냅샷 몫을 남기지 않는다(순서 ①)");
  // 진행 매물 갱신 게이트에 이 몫을 둘지는 소유자 결정 대기(2026-10-14 QA) — 지금은 둔다.
  assert.match(fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-active-listings.yml"), "utf8"), /check-ebay-quota\.js --min \d+ --reserve tcgSnapshot/, "진행 매물 갱신 게이트도 스냅샷 몫을 남긴다");
}

// TCG 정산 순서 — 마감(종료 + 30h) 8시간 안 표본(base)을 먼저, 나머지는 게임별로 돌아가며(2026-10-14).
{
  const { pickDue, GIVE_UP_HOURS, URGENT_HOURS } = require("./settle-tcg");
  const now = at("2026-10-14T12:00:00Z");
  const ago = (h) => new Date(now - h * 3600000).toISOString();
  const pending = [
    { id: "a-new", g: "a", end: ago(1) },
    { id: "a-new2", g: "a", end: ago(2) },
    { id: "b-new", g: "b", end: ago(3) },
    { id: "c-urg1", g: "c", end: ago(25) },
    { id: "c-urg2", g: "c", end: ago(24) },
    { id: "c-urg3", g: "c", end: ago(23) },
    { id: "a-xurg", g: "a", end: ago(26), extra: true },   // 여유분은 마감이 임박해도 앞당기지 않는다
    { id: "b-dead", g: "b", end: ago(31) },                 // 시한 지남
    { id: "b-live", g: "b", end: ago(-1) },                 // 아직 안 끝남
  ];
  assert.equal(GIVE_UP_HOURS - URGENT_HOURS, 22);
  assert.deepEqual(pickDue(pending, now, 3).map((p) => p.id), ["c-urg1", "c-urg2", "c-urg3"], "마감 8시간 안 표본이 다른 게임보다 먼저");
  assert.deepEqual(pickDue(pending, now, 7).map((p) => p.id), ["c-urg1", "c-urg2", "c-urg3", "b-new", "a-new2", "a-new", "a-xurg"], "그 뒤는 종전 규칙(게임별 순환, 표본 먼저·여유분 뒤, 오래된 것부터)");
  assert.equal(pickDue(pending, now, 100).length, 7, "시한 지난 것·안 끝난 것은 빼고 전부");
}
console.log("eBay budget snapshot-reserve / settle order tests passed");
