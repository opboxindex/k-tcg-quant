#!/usr/bin/env node
// 박스 sold 적재 판정 회귀 테스트 — 2026-09-30. 가드(guard-invariants.js Q1)가 이 파일을 실행한다.
//
// 1) "case" 가 붙은 단품 박스는 살리고, 진짜 케이스(12박스)·불명·액세서리는 계속 버린다(box-case-words.js).
// 2) PRB-02 이름 속 권 번호("Vol. 2", "The Best 2")를 수량 2로 읽지 않는다(lot-quantity.js VOLUME_STRIP).
// 3) (삭제 2026-11-05) 팰월드 원장 중복 키 검사 — 팰월드 전용 수집 중단으로 palworld-sold-ingest.js 를 지웠다.
// 4) 합본 제품코드 OP14-EB04·OP15-EB04 는 영문 OP-14·OP-15 박스다(combined-set-codes.js).
// 5) 판매일은 eBay 표시일 그대로, 실행 머신 TZ 와 무관(box-sold-ingest.js soldDateOf, 2026-10-01).
// 6) 시계열 이상치 판정 — OP-07 일본판 9/17·9/24 $134 사고, 발매 주·수준 이동은 남긴다(build-box-sold-series.js, 2026-10-15).
//
// 제목·가격·날짜는 C:/Users/kimtt/opbox-heartbeat/box-sold-cdp/box-2026-09-18~30.json 덤프 원문이다.
// "(합성)" 표시가 붙은 것만 위험 경계를 막으려고 만든 제목이다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { judgeItem } = require("./box-sold-ingest");
const { boxQuantity } = require("./box-case-words");
const { parseLotQuantity } = require("./lot-quantity");

const R = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "onepiece-packs.json"), "utf8")).fx.usdKrw;
const item = (t, k, d) => ({ id: "1", t, k, cur: "KRW", d: d || "Sold  Sep 21, 2026" });

// ── 1-a. 살려야 하는 단품 박스 [세트, 신고 판본, 제목, 원화]
const KEEP = [
  ["EB-01", "en", "One Piece Memorial Collection Booster Box EB-01 English w/ Acrylic Case", 1145829],
  ["EB-01", "en", "One Piece Card Game🏴‍☠️EB-01 BOOSTER BOX (MEMORIAL COLLECTION) F-SEALED W/CASE", 1101120],
  ["OP-02", "en", "Bandai One Piece TCG Paramount War OP-02 English Booster Box Sealed with case", 851874],
  ["OP-02", "en", "One Piece TCG: OP-02 Paramount War Booster Box, Sealed,English.FROM A FRESH CASE", 865087],
  ["OP-09", "en", "ONE PIECE EMPERORS IN THE NEW WORLD ENGLISH BOOSTER BOX OP-09 SEALED w/ Case!!", 915453],
  ["OP-09", "en", "One Piece OP-09 Booster Box English Sealed OP09 w/ Acrylic Protective Case", 1035870],
  ["OP-10", "en", "One Piece TCG OP10 Royal Blood Eng Booster Box | 1 Sealed Box From Fresh Case🔥", 386770],
  ["OP-11", "en", "One Piece Card Game OP-11 A Fist of Divine Speed English Booster Box Fresh Case", 825840],
  ["OP-12", "en", "ONE PIECE ENGLISH  LEGACY OF THE MASTER BOOSTER BOX OP12 fresh from open case", 340281],
  ["OP-13", "en", "One Piece TCG OP13 Booster Box MINT English - New & Sealed CASE FRESH 🚀✅", 594499],
  ["OP-13", "en", "One Piece TCG: Carrying On His Will Booster Box (OP-13) SEALED comes with case!", 665969],
  ["OP-13", "en", "NEW One Piece Card Game OP13 (Carrying on His Will) Booster Box in Acrylic Case", 720515],
  ["OP-14", "en", "One Piece Card Game OP-14 The Azure Sea's Seven Booster Box English Sealed +Case", 439017],
  ["OP-16", "en", "One Piece - The Time of Battle Booster Box - English - OP16 - FRESH CASE OPENING", 378636],
  ["OP-16", "en", "One Piece Booster Box OP16 The Time of Battle English Pulled From Sealed Case!!!", 305802],
  ["OP-17", "en", "One Piece - OP17 The World's Strongest Warriors Booster Box SEALED! - Case Fresh", 499638],
  ["OP-01", "jp", "One Piece OP-01 Romance Dawn Booster Box  w/ Hard Acrylic Case - Japanese Sealed", 475692],
  ["OP-01", "en", "OP-01 Romance Dawn Blue Bottom Booster Box Sealed w/Acrylic Case (Slight damage)", 5365758],
  ["PRB-02", "en", "One Piece The Best Vol 2 Premium Booster Box PRB-02 English Sealed Case Fresh", 573794],
];
for (const [code, ed, t, k] of KEEP) {
  const r = judgeItem(item(t, k), code, R, null, ed, "bin");
  assert.ok(r.rec, `살려야 할 단품이 버려짐(${r.drop}): ${t}`);
  assert.equal(r.ed, ed, t);
  assert.equal(r.rec.qty, 1, t);
  assert.ok(Math.abs(r.rec.unit - k / R) < 0.01, `개당가가 총액과 달라짐: ${t}`);
  assert.equal(r.rec.title, t.slice(0, 140), "원장에는 원 제목을 남긴다");
}

// ── 1-b. 계속 버려야 하는 것 [세트, 신고 판본, 제목, 원화, 기대 drop]
const DROP = [
  // 12박스 케이스 — 원장 중앙값의 10~28배. 1박스로 들어가면 시세가 무너진다.
  ["OP-16", "en", "One Piece TCG OP-16 The Time Of Battle Booster Box Case SEALED ENGLISH", 3125962, "bad-word"],
  ["OP-17", "en", "ONE PIECE CARD GAME - OP17 STRONGEST WARRIORS BOOSTER BOX CASE (ENGLISH, SEALED)", 5044238, "bad-word"],
  ["OP-17", "en", "One Piece OP-17 Sealed Case of 12 Booster Boxes Brand New Factory Sealed English", 5101292, "bad-word"],
  ["OP-17", "en", "ONE PIECE OP-17 BOOSTER BOX SEALED CASE of 12.  In Hand.", 5728291, "bad-word"],
  ["OP-17", "en", "One Piece OP-17 Worlds Strongest Warriors Sealed Case 12x Booster Box ENGLISH 📦", 6221059, "bad-word"],
  ["OP-17", "en", "NEW! ONE PIECE OP-17 BOOSTER BOX SEALED CASE - WAVE 2 (OCT 26) PRE ORDER", 6305279, "bad-word"],
  ["OP-11", "jp", "One Piece TCG OP-11 A Fist Of Divine Speed Booster Box Case Japanese Sealed", 1697541, "bad-word"],
  ["OP-11", "en", "One Piece OP-11 A Fist of Divine Speed – English Booster Box Sealed Case", 9814247, "bad-word"],
  ["OP-16", "en", "One Piece OP-16 The Time of Battle Sealed Booster Box Case (12) English", 3245568, "bad-word"],
  ["PRB-02", "en", "One Piece PRB-02 Premium The Best Sealed Case (10 Booster Boxes)", 5404523, "bad-word"],
  ["PRB-02", "jp", "Japanese The Best Vol. 2 PRB-02 Booster Box Case Sealed One Piece US SELLER", 2990050, "bad-word"],
  ["OP-14", "jp", "One Piece CARD GAME OP-14 BOOSTER BOX OP-14 japanese SEALED CASE US SELLER", 2242534, "bad-word"],
  // 불명 — 1박스 가격대($107~122)지만 "factory sealed case + promo pack" 이 무엇인지 모른다. 추측하지 않는다.
  ["OP-17", "jp", "ONE PIECE OP-17 Card Game Booster box (JP VER) factory sealed case + promo pack", 144685, "bad-word"],
  // 케이스(액세서리)만 판 것
  ["OP-07", "en", "One Piece TCG 500 Years in the Future OP-07 Booster Box Acrylic Case Only No BB*", 30214, "accessory-only"],
  ["OP-09", "en", "One Piece Emperors In The New World Booster Box *Acrylic Case Only NO Booster", 30200, "accessory-only"],
  ["OP-13", "en", "One Piece Booster Box Acrylic Display Case OP04-17 Magnetic Lid 99% UVR", 18788, "bad-word"],
  // 다른 게임은 case 문구와 무관하게 버린다
  ["EB-01", "en", "Eternal Nexus Booster Box EB01 Gundam Card Game New Sealed English Case Fresh", 189778, "other-game"],
];
for (const [code, ed, t, k, want] of DROP) {
  const r = judgeItem(item(t, k), code, R, null, ed, "bin");
  assert.equal(r.drop, want, `버려야 할 것이 ${r.drop ? r.drop : "통과"}: ${t}`);
}

// ── 1-c. 경계: case 문구를 지운 뒤 다수량이 보이면 모름(null). 케이스를 개당가로 나눠 넣지 않는다.
assert.equal(boxQuantity("One Piece OP-13 Booster Box English Fresh Case 12x Booster Boxes"), null);      // (합성)
for (const [t, want] of [
  ["One Piece OP-13 Booster Box English Fresh Case 12x Booster Boxes", "uncountable-lot"],                // (합성)
  ["One Piece OP-13 Booster Box English Sealed with case of 12 boxes", "bad-word"],                       // (합성) with case 뒤 of
  ["One Piece OP-13 Booster Box Case Fresh English", "bad-word"],                                         // (합성) box case fresh 는 케이스로도 읽힌다
]) assert.equal(judgeItem(item(t, 3000000), "OP-13", R, null, "en", "bin").drop, want, t);
assert.equal(boxQuantity("One Piece Memorial Collection Booster Box EB-01 English w/ Acrylic Case"), 1); // 수리 도구도 같은 판정
assert.equal(boxQuantity("One Piece OP-13 Booster Box Japanese Sealed"), 1);

// ── 2. PRB-02 권 번호는 수량이 아니다
for (const t of [
  "Sealed Japanese The Best Vol. 2 PRB-02 Booster Box US SELLER One Piece Card Game",
  "One Piece Card Game - PRB-02 Premium Booster The Best 2 - Booster Box (English)",
  "One Piece TCG PRB-02 Premium Booster 2 Booster Box (FREE SHIPPING✔️)",
  "Sealed Premium Booster Vol 2 Booster Box PRB-02 One Piece Card Game",
  "One Piece The Best Vol 2 PRB-02 Booster Box Japanese",
  "One Piece TCG: The Best 2 Premium Booster Box [PRB-02] - 20 Packs (FACTORY SEAL)",
]) assert.equal(parseLotQuantity(t, "box"), 1, t);
assert.equal(parseLotQuantity("PRB-02 Premium Booster 2 Booster Box 20 Packs English", "box"), 1);          // (합성) 20팩=프리미엄 1박스
assert.equal(parseLotQuantity("One Piece TCG - PRB-02 The Best Vol. 2 - Booster Box Packs - Lots Of 5 - English", "box"), null);
assert.equal(parseLotQuantity("3 Booster Boxes One Piece OP-08 Sealed", "box"), 3);                      // 진짜 수량은 그대로
// 반값이 9만원 하한에 걸려 버려지던 일본판 낱박스(168561495720, Sold Sep 16, 2026, 144,522원)
{
  const t = "Japanese The Best Vol. 2 PRB-02 Booster Box US SELLER One Piece Card Game";
  const r = judgeItem(item(t, 144522, "Sold  Sep 16, 2026"), "PRB-02", R, null, "jp", "bin");
  assert.ok(r.rec, `PRB-02 일본판 낱박스가 버려짐(${r.drop})`);
  assert.equal(r.rec.qty, 1);
}

// ── 4. 합본 제품코드 OP14-EB04·OP15-EB04 — 영문 OP-14·OP-15 박스다. 짝 코드(EB-04) 때문에 cross-set 으로 버리지 않는다(2026-09-30, 141건 누락).
// [세트, 신고 판본, 제목, 원화, 기대: "en" 이면 통과·그 판본, 아니면 drop 이유]
const COMBINED_CASES = [
  ["OP-14", "en", "One Piece TCG - OP14-EB04 OP14 The Azure Sea's Seven Booster Box English SEALED", 344106, "en"],
  ["OP-14", "en", "One Piece - Azure Sea's Seven Booster Box English OP14-EB04", 380555, "en"],
  ["OP-15", "en", "One Piece: Adventure on Kami's Island (OP15-EB04) Booster Box", 344092, "en"],
  ["OP-15", "en", "One Piece OP15/EB04 Adventure on KAMI'S Island Booster Box ENGLISH Sealed", 344106, "en"],
  ["OP-15", "en", "One Piece TCG OP-15 EB-04 Adventure On Kami's Island Booster Box - NEW - SEALED", 387294, "en"],
  // (합성) 합본은 영문판에만 있다 — 일본판 칸으로 들어오면 버린다.
  ["OP-15", "jp", "One Piece OP15-EB04 Adventure on Kami's Island Booster Box Japanese", 150000, "combined-code-not-en"],
  // (합성) 짝이 아닌 다른 세트가 같이 적히면 종전대로 cross-set.
  ["OP-15", "en", "One Piece OP14 OP15 EB04 Booster Box English Sealed", 700000, "cross-set"],
  // (합성) EB-04 는 합본 짝이지 추적 세트가 아니다 — OP-13 페이지에 EB04 가 붙으면 cross-set.
  ["OP-13", "en", "One Piece OP13 EB04 Booster Box English", 600000, "cross-set"],
];
for (const [code, ed, t, k, want] of COMBINED_CASES) {
  const r = judgeItem(item(t, k), code, R, null, ed, "bin");
  if (want === "en") { assert.ok(r.rec, `합본 영문 박스가 버려짐(${r.drop}): ${t}`); assert.equal(r.ed, "en", t); }
  else assert.equal(r.drop, want, t);
}

// ── 5. 판매일은 eBay 표시일 그대로 — 2026-10-01 교정(하루 이른 날짜 사고). 실행 머신의 TZ 를 바꿔도 같아야 한다.
//    종전 Date.parse→toISOString 은 이 PC(KST)에서 "Sold  Sep 29, 2026" 을 2026-09-28 로 적었다(9/30 덤프 255,760건 전부 -1일).
//    원장은 tools/migrate-box-sold-dates-20261001.js 로 +1일 이관됐고 가드 D15 가 그 마커(dateBasis)를 요구한다.
{
  const { soldDateOf } = require("./box-sold-ingest");
  const DATE_CASES = [
    ["Sold  Sep 29, 2026", "2026-09-29"],     // 덤프 원문(공백 둘)
    ["Sold Sep 29, 2026", "2026-09-29"],
    ["Sold  Dec 31, 2025", "2025-12-31"],     // 연말 경계 — 종전엔 2025-12-30
    ["Sold  Jan 1, 2026", "2026-01-01"],      // 연초 — 종전엔 2025-12-31
    ["Sold  Oct 1, 2026", "2026-10-01"],      // 월초(box-2026-10-01 덤프 원문) — 종전엔 2026-09-30
    ["Sold  Feb 28, 2026", "2026-02-28"],
    ["Sold  Feb 30, 2026", null],             // (합성) 없는 날은 버린다
    ["Sold  Sep 29", null],                   // (합성) 연도 없음
    ["no date here", null],
  ];
  // TZ 별 getTimezoneOffset(2026-09-29 정오) — TZ 가 실제로 바뀌었는지 확인한다. 안 바뀌면 이 검사는 아무것도 증명하지 못한다.
  const ZONES = { "Asia/Seoul": -540, UTC: 0, "America/Los_Angeles": 420, "Pacific/Kiritimati": -840 };
  const origTZ = process.env.TZ;
  for (const [tz, offset] of Object.entries(ZONES)) {
    process.env.TZ = tz;
    assert.equal(new Date(2026, 8, 29, 12).getTimezoneOffset(), offset, `TZ=${tz} 가 적용되지 않았다`);
    for (const [cap, want] of DATE_CASES) assert.equal(soldDateOf(cap), want, `TZ=${tz}: ${cap}`);
  }
  // 사고의 원인 자체도 박제 — KST 에서 Date.parse→toISOString 은 하루 이르다. 파서가 이 방식으로 되돌아가면 위 단언이 깨진다.
  process.env.TZ = "Asia/Seoul";
  assert.equal(new Date(Date.parse("Sep 29, 2026")).toISOString().slice(0, 10), "2026-09-28");
  if (origTZ === undefined) delete process.env.TZ; else process.env.TZ = origTZ;
}

// ── 6. 시계열 이상치 판정(build-box-sold-series.js markOutliers) — 2026-10-15.
//    OP-07 일본판 4주 변화 -40.3% 사고: 9/17·9/24 점이 $134(n=6)였는데 6건 중 3건이 $162~181, 앞뒤 판매는 ~$80.
//    판매 행은 원장(box-sold-ledger.json) 원문이다. [MM-DD, 개당가, 매물 id]
const { salesOf, seriesFor, monthlyFor, OUTLIER, MIN_N: SERIES_MIN_N } = require("./build-box-sold-series");
let outlierCases = 0;
{
  const rows = (yr, arr) => arr.map(([md, unit, id]) => ({ id: id || `x${md}${unit}`, d: `${yr}-${md}`, unit, fmt: "bin" }));
  // 이상치 판정을 끈 기준값 — 같은 판매에서 out 만 지운다.
  const plain = (rs) => rs.map((r) => ({ ...r, out: false }));
  const byD = (pts) => Object.fromEntries(pts.map((p) => [p.d, p]));
  // 세트 페이지 "4-week change" 정의: 마지막 점 vs 그 날짜에서 28일 이상 앞선 마지막 점(소수 한 자리 %).
  const chg28 = (pts) => {
    const last = pts[pts.length - 1], cut = Date.parse(last.d) - 28 * 86400000;
    const base = pts.filter((p) => Date.parse(p.d) <= cut).pop();
    return base ? Math.round((last.median / base.median - 1) * 1000) / 10 : null;
  };

  // 6-a. OP-07 일본판(2026-05-16 ~ 10-15 즉시구매 전부)
  const OP07 = rows("2026", [
    ["05-16", 135.13, "388112743116"], ["05-18", 113.79, "297999865745"], ["05-20", 78.93, "335926683943"], ["05-22", 80.07, "157902790858"],
    ["05-22", 79.36, "377170420287"], ["05-23", 84.45, "226345934769"], ["05-24", 119.96, "166736027236"], ["05-24", 90.16, "325956118609"],
    ["05-26", 75.06, "135970757205"], ["05-27", 87.03, "358030419934"], ["05-28", 90.04, "406709753799"], ["06-06", 95.65, "398004170256"],
    ["06-17", 97.89, "386831616058"], ["06-18", 80.07, "336426857259"], ["06-19", 99.09, "127899445637"], ["06-21", 65.05, "298117862964"],
    ["06-25", 124.11, "389921404439"], ["06-25", 100.09, "405071464613"], ["06-28", 94.58, "386799840347"], ["07-01", 79.45, "406982231386"],
    ["07-03", 107.09, "147251079351"], ["07-06", 107.05, "377261420117"], ["07-13", 93.72, "287300952098"], ["07-13", 79.57, "377332790782"],
    ["07-21", 98.10, "398187842463"], ["07-22", 70.07, "147450913259"], ["07-25", 78.69, "377341552748"], ["07-26", 80.04, "226028686106"],
    ["07-26", 81.37, "407089894386"], ["07-29", 104.88, "236801283164"], ["07-29", 99.94, "405071464613"], ["07-31", 65.03, "298117862964"],
    ["08-03", 79.90, "377341552748"], ["08-13", 74.50, "398276133345"], ["08-20", 165.69, "147348308001"], ["08-25", 162.52, "168451186418"],
    ["09-03", 104.66, "236801283164"], ["09-06", 79.75, "227506385511"], ["09-17", 181.12, "306678438253"], ["09-18", 78.99, "318870988588"],
    ["10-02", 79.76, "377341552748"], ["10-03", 79.47, "377332790782"], ["10-03", 79.48, "377341552748"], ["10-04", 79.48, "377341552748"],
    ["10-05", 79.48, "377341552748"], ["10-06", 79.79, "377332790782"], ["10-09", 79.87, "377341552748"], ["10-11", 79.88, "377341552748"],
    ["10-12", 79.88, "377341552748"], ["10-13", 80.03, "377341552748"], ["10-13", 112.37, "398451227775"], ["10-13", 80.06, "407128102071"],
    ["10-15", 87.06, "318870989644"],
  ]);
  const s07 = salesOf(OP07);
  // 이상치는 정확히 그 세 건 — $104.66·$112.37 처럼 ±70% 안쪽 판매는 남는다.
  assert.deepEqual(s07.filter((r) => r.out).map((r) => `${r.d} ${r.id}`),
    ["2026-08-20 147348308001", "2026-08-25 168451186418", "2026-09-17 306678438253"], "OP-07 이상치 판정이 바뀌었다");
  const before = seriesFor(plain(s07)), after = seriesFor(s07);
  assert.equal(after.windowDays, 42, "OP-07 계열 창");
  const b07 = byD(before.points), a07 = byD(after.points);
  assert.equal(b07["2026-09-17"].median, 134, "사고 재현(규칙 없이) 9/17");
  assert.equal(b07["2026-09-24"].median, 134, "사고 재현(규칙 없이) 9/24");
  assert.equal(chg28(before.points), -40.3, "사고 재현(규칙 없이) 4주 변화");
  // 9/17·9/24 는 42일 창에 깨끗한 판매가 3건뿐 → 창을 56일까지 늘려 6건 이상을 모은다(점을 지우지 않는다).
  assert.deepEqual(["median", "n", "out", "win"].map((k) => a07["2026-09-17"][k]), [80, 10, 3, 56], "OP-07 9/17");
  assert.deepEqual(["median", "n", "out", "win"].map((k) => a07["2026-09-24"][k]), [79, 6, 3, 56], "OP-07 9/24");
  assert.ok(Math.abs(chg28(after.points)) < 5, `OP-07 4주 변화가 여전히 튄다: ${chg28(after.points)}%`);
  // 점은 하나도 사라지거나 새로 생기지 않는다(새 공백 금지). 모든 점 n ≥ MIN_N, n + out = 그 창의 실제 판매 수.
  assert.deepEqual(after.points.map((p) => p.d), before.points.map((p) => p.d), "이상치 때문에 점 목록이 바뀌었다");
  for (const p of after.points) {
    assert.ok(p.n >= SERIES_MIN_N, `${p.d} n=${p.n}`);
    const t = Date.parse(p.d), w = p.win || after.windowDays;
    const raw = s07.filter((r) => r.t > t - w * 86400000 && r.t <= t).length;
    assert.equal(p.n + (p.out || 0), raw, `${p.d} n+out ≠ 창 안 판매`);
    assert.equal(p.vol, b07[p.d].vol, `${p.d} 거래량 막대는 이상치도 센다`);
  }
  outlierCases++;

  // 6-b. 발매 주 — OP-17 일본판(발매 2026-08-22) 첫 4주 즉시구매 전부. 발매 프리미엄($142~330)은 이상치가 아니다.
  const OP17 = [];
  for (const [md, us] of Object.entries({
    "08-22": [142.16, 200.22], "08-23": [168.19, 170.19, 175.65, 180.2, 221.13, 330.38], "08-24": [152.79, 156.47, 224.95],
    "08-25": [127.43, 134.91, 154.9, 156.47], "08-26": [139.07], "08-27": [135.17], "08-28": [169.22],
    "08-29": [120.16, 130.16, 130.17, 145.18, 177.11], "08-30": [135.17, 161.21], "08-31": [130.16, 135.18, 150.19],
    "09-01": [130.86, 134.88, 134.89, 168.86], "09-02": [134.88, 134.89, 139.87], "09-03": [108.66, 123.56, 123.85], "09-05": [124.85],
    "09-06": [124.85, 134.57, 134.58, 142.71, 149.52], "09-07": [121.17, 168.67], "09-08": [129.73, 134.72, 149.69],
    "09-10": [120.56, 121.26, 136.42, 136.42], "09-11": [151.58], "09-12": [127.91, 129.87, 132.87, 134.87, 149.86],
    "09-13": [114.6, 129.54, 134.52], "09-14": [129.54], "09-16": [129.45, 130.44, 135.84], "09-17": [115.72, 125.79, 130.81],
    "09-18": [161.01], "09-19": [113.8],
  })) us.forEach((u, i) => OP17.push({ id: `op17-${md}-${i}`, d: `2026-${md}`, unit: u, fmt: "bin" }));
  const s17 = salesOf(OP17);
  assert.deepEqual(s17.filter((r) => r.out).map((r) => `${r.d} $${r.unit}`), [], "발매 주 판매가 이상치로 빠졌다");
  const p17 = seriesFor(s17).points, q17 = seriesFor(plain(s17)).points;
  assert.deepEqual(p17, q17, "발매 주 점이 규칙 때문에 바뀌었다");
  assert.ok(p17[0].median >= 150, `발매 주 첫 점이 발매 프리미엄을 잃었다: $${p17[0].median}`);
  outlierCases++;

  // 6-c. 진짜 수준 이동(합성): $80 대 60일 → $160 대 60일. 뒤쪽 시장이 새 값과 맞으므로 아무것도 빼지 않는다.
  const shift = [];
  for (let i = 0; i < 60; i++) shift.push({ id: `s${i}`, d: new Date(Date.UTC(2026, 3, 1) + i * 2 * 86400000).toISOString().slice(0, 10), unit: i < 30 ? 80 + (i % 5) : 160 + (i % 7), fmt: "bin" });
  const sShift = salesOf(shift);
  assert.equal(sShift.filter((r) => r.out).length, 0, "수준 이동이 이상치로 지워졌다");
  const lastShift = seriesFor(sShift).points.pop();
  assert.ok(lastShift.median >= 160, `수준 이동 뒤 마지막 점 $${lastShift.median}`);
  outlierCases++;

  // 6-d. 고립된 튀는 값(합성): $80 대 180일 중 하루 $170 → 이상치. $130(+62%)은 ±70% 하한 안이라 남는다.
  //      마지막 판매 $200 은 뒤쪽 판매가 없어 판정하지 않는다(확인 전에는 빼지 않는다).
  const spike = [];
  for (let i = 0; i < 90; i++) spike.push({ id: `p${i}`, d: new Date(Date.UTC(2026, 3, 1) + i * 2 * 86400000).toISOString().slice(0, 10), unit: i === 45 ? 170 : i === 50 ? 130 : i === 89 ? 200 : 79 + (i % 3), fmt: "bin" });
  const sSpike = salesOf(spike);
  assert.deepEqual(sSpike.filter((r) => r.out).map((r) => r.unit), [170], "고립된 튀는 값 판정");
  outlierCases++;

  // 6-e. 빼면 문턱 아래인데 cap 까지 늘려도 못 채우면 주간 점은 찍지 않는다(빈 칸이 틀린 값보다 낫다 — 소유자 절대 규칙 3).
  //      2026-11-02 전엔 원래 창 그대로(이상치 포함 중앙값 84)였다 — 그 예비 규칙을 타던 점 4개가 전부 오염값이었다(OP-07 9/27 $134 등).
  //      월간은 종전대로 문턱 아래면 그대로 둔다(bucketSample).
  const thin = salesOf(["06-01", "06-04", "06-08", "06-11", "06-15", "06-20"].map((md, i) => ({ id: `t${i}`, d: `2026-${md}`, unit: i === 2 ? 300 : 80 + i, fmt: "bin" })));
  thin[2].out = true;   // 표본이 6건뿐이라 판정 자체는 안 되지만, 문턱 처리만 따로 본다
  assert.deepEqual(seriesFor(thin).points, [], "주간: 이상치를 빼고 cap 까지 늘려도 문턱 아래면 점을 찍지 않는다");
  const tm = monthlyFor(thin).pop();
  assert.deepEqual([tm.n, tm.out, tm.vol], [6, undefined, 6], "월간도 문턱 아래면 그대로 둔다");
  outlierCases++;

  assert.deepEqual(OUTLIER, { k: 3.5, refDays: 90, refMinSales: 8, scaleFloor: 0.2 }, "이상치 기준을 바꾸면 위 사례와 전 계열 시뮬레이션을 다시 볼 것");
}

console.log(JSON.stringify({ ok: true, keep: KEEP.length, drop: DROP.length, combined: COMBINED_CASES.length, dates: 9, outliers: outlierCases }));
