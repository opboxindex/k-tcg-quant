#!/usr/bin/env node
"use strict";
// PSA 10 최저 매물 판본 판정 — 2026-11-05 실사고 5건(한 매물이 두 판본 카드에 붙음)을 재현하고 막는다.
//   tools/ebay-psa10-listing-filter.js(editionVerdict·acceptListingEdition·psa10ListingRejections) — 수집기·자체 감사·사실 빌더가 같은 함수를 쓴다.
//   tools/market-data-normalizers.js psa10AskRejections — 사실 빌더(표시)의 입구.
//   tools/guard/psa10-listings.js violations — 가드 PSA10-SHARE·PSA10-AUDIT.
// 매물 제목은 실제 매물 제목(2026-11-04 data/onepiece-packs.json · data/psa10-mismatch-audit.json)을 그대로 옮겼다. 세트 이름·발매일 색인은 고정 입력(아래 PACKS·SET_FACTS·OFFICIAL)이라
// 데이터가 바뀌어도 이 테스트는 흔들리지 않는다.
const assert = require("node:assert/strict");
const ED = require("./ebay-psa10-listing-filter");
const N = require("./market-data-normalizers");
const G = require("./guard/psa10-listings");

const SET_FACTS = { sets: Object.fromEntries(Object.entries({
  "OP-01": "2022-07-22", "OP-02": "2022-11-04", "OP-03": "2023-02-11", "OP-04": "2023-05-27", "OP-05": "2023-08-26", "OP-06": "2023-11-25", "OP-07": "2024-02-24",
  "OP-09": "2024-08-31", "OP-11": "2025-03-01", "OP-14": "2025-11-22", "OP-15": "2026-02-28", "EB-02": "2025-01-25", "EB-04": "2026-01-31", "EB-05": "2026-10-31",
  "PRB-01": "2024-07-27", "PRB-02": "2025-07-26",
}).map(([k, d]) => [k, { jpRelease: { date: d } }])) };
const OFFICIAL = { jp: { products: {
  "OP-02": { name: "ブースターパック 頂上決戦" }, "EB-04": { name: "エクストラブースター EGGHEAD CRISIS" },
  "PRB-01": { name: "プレミアムブースター ONE PIECE CARD THE BEST" }, "PRB-02": { name: "プレミアムブースター ONE PIECE CARD THE BEST vol.2" },
} }, en: { products: {
  "OP-01": { name: "BOOSTER PACK -ROMANCE DAWN-" }, "OP-02": { name: "BOOSTER PACK -PARAMOUNT WAR-" }, "OP-07": { name: "BOOSTER PACK -500 YEARS IN THE FUTURE-" },
  "OP15-EB04": { name: "BOOSTER PACK -ADVENTURE ON KAMI’S ISLAND-" },
  "PRB-01": { name: "PREMIUM BOOSTER -ONE PIECE CARD THE BEST-" }, "PRB-02": { name: "PREMIUM BOOSTER -ONE PIECE CARD THE BEST vol.2-" },
} } };

// 실사고 카드·매물(제목·itm id 는 실제 값)
const T = {
  shanks: ["406364249542", "MANGA ALT ART SHANKS One Piece 2022 Romance Dawn Japanese OP01-120 SEC PSA 10"],
  ace: ["377597466513", "2023 Japanese One Piece Perforated Manga Ace OP02-013 Alt Art PSA 10 Gem Mint"],
  law: ["405915728451", "MANGA ALT ART TRAFALGAR LAW One Piece 2023 Japanese OP05-069 SR PSA 10"],
  nami: ["117286621362", "2023 One Piece OP05 Nami OP01-016 Alt Art SP Japanese PSA 10 Gem"],
  buggy: ["168805851944", "Buggy OP09-051 One Piece SP Parallel PSA 10 Collectible 13+"],
  prbNami: ["111111111111", "PSA 10 Nami OP01-016 Manga Alt Art PRB01 The Best Japanese ONE PIECE 2024"],
  zoroOp06: ["222222222222", "PSA 10 Roronoa Zoro OP06-118 Manga Alternate Art Japanese One Piece Card"],
  kid: ["333333333333", "Eustass Kid SR-P OP01-051 PSA 10 Romance Dawn One Piece Card Japanese"],
};
const active = ([id, title], extra = {}) => ({ psa10Active: { updated: "2026-11-04", currency: "USD", sampleSize: 3, bestId: `v1|${id}|0`, bestListing: { title, url: `https://www.ebay.com/itm/${id}`, total: 100, currency: "USD" }, ...extra } });
const PACKS = { sets: {
  "OP-01": { nameEn: "Romance Dawn", cards: [{ number: "OP01-120", name: "Shanks Parallel Manga Alternate Art", rarity: "SEC", ...active(T.shanks) }] },
  "OP-02": { nameEn: "Paramount War", cards: [{ number: "OP02-013", name: "Portgas D. Ace Parallel Manga Alternate Art", rarity: "SR", ...active(T.ace) }] },
  "OP-03": { nameEn: "Pillars of Strength", cards: [{ number: "OP01-051", name: "EustassCaptainKid Wanted Poster", rarity: "SR", ...active(T.kid) }] },
  "OP-05": { nameEn: "Awakening of the New Era", cards: [
    { number: "OP05-069", name: "Trafalgar Law 069 Alternate Art Manga", rarity: "SR", ...active(T.law) },
    { number: "OP01-016", name: "Nami SP", rarity: "R", ...active(T.nami) },
  ] },
  "OP-06": { nameEn: "Wings of the Captain", cards: [{ number: "OP06-118", name: "Roronoa Zoro Alternate Art Manga", rarity: "SEC", ...active(T.zoroOp06) }] },
  "OP-14": { nameEn: "The Azure Sea's Seven", cards: [
    { number: "OP09-051", name: "Buggy OP09 051 SP Gold", rarity: "R", ...active(T.buggy) },
    { number: "OP09-051", name: "Buggy OP09 051 SP Silver", rarity: "R", ...active(T.buggy) },
  ] },
  "PRB-01": { nameEn: "Premium Booster", cards: [
    { number: "OP01-120", name: "Shanks Manga", rarity: "SEC", ...active(T.shanks) },
    { number: "OP02-013", name: "Portgas D. Ace Manga", rarity: "SR", ...active(T.ace) },
    { number: "OP05-069", name: "Trafalgar Law OP05 069 Manga", rarity: "SR", ...active(T.law) },
    { number: "OP01-016", name: "Nami OP01 016 Manga", rarity: "R", ...active(T.prbNami) },
    { number: "OP06-118", name: "Roronoa Zoro Manga", rarity: "SEC" },
  ] },
  "PRB-02": { nameEn: "Premium Booster", cards: [] },
  "EB-05": { nameEn: "Heroines Edition vol.2", cards: [{ number: "OP01-016", name: "Nami OP01 016 SP", rarity: "R", ...active(T.nami) }] },
} };
const index = ED.buildEditionIndex({ packs: PACKS, setFacts: SET_FACTS, officialCardlist: OFFICIAL });
const card = (code, i) => PACKS.sets[code].cards[i];
const verdict = (title, setAspect, code, i) => ED.editionVerdict({ title, setAspect }, code, card(code, i), index);

// ── 색인: 세트 이름은 데이터에서(손으로 쓴 표 없음). 'Premium Booster' 는 두 PRB 세트 묶음, vol.2 는 PRB-02 하나.
const nameCodes = (k) => (index.names.find((n) => n.key === k) || {}).codes;
assert.deepEqual(nameCodes("romance dawn"), ["OP-01"]);
assert.deepEqual(nameCodes("頂上決戦"), ["OP-02"]);
assert.deepEqual(nameCodes("premium booster"), ["PRB-01", "PRB-02"], "nameEn 이 같은 두 세트 → 묶음 신호");
assert.deepEqual(nameCodes("one piece card the best vol 2"), ["PRB-02"]);
assert.deepEqual(nameCodes("adventure on kamis island"), ["OP-15"], "영문 상품 키 OP15-EB04 는 OP-15 로 읽는다");
assert.equal(index.release["PRB-01"], "2024-07-27");

// ── 판정: 실사고 ①~③
assert.equal(verdict(T.shanks[1], null, "PRB-01", 0).verdict, "conflict", "① 'Romance Dawn'·2022 매물은 PRB-01 판이 아니다");
assert.equal(verdict(T.shanks[1], null, "OP-01", 0).verdict, "match", "① 같은 매물은 OP-01 판으로 확인된다");
assert.equal(verdict(T.nami[1], null, "EB-05", 0).verdict, "conflict", "② 'OP05' 매물은 EB-05 판이 아니다");
assert.equal(verdict(T.nami[1], null, "OP-05", 1).verdict, "match", "② 'OP05' 매물은 OP-05 나미 SP 의 판");
assert.equal(verdict(T.ace[1], "Paramount War", "PRB-01", 1).verdict, "conflict", "③ 실사고 매물(2023·Set 속성 'Paramount War')은 PRB-01 판이 아니다");
assert.equal(verdict(T.ace[1], "Paramount War", "OP-02", 0).verdict, "match", "③ 같은 매물은 OP-02 판");
assert.equal(verdict(T.ace[1], null, "PRB-01", 1).verdict, "conflict", "③ Set 속성이 없어도 제목 연도 2023 < PRB-01 발매 2024");
// 신호 읽기
assert.equal(verdict("PSA 10 Nami OP01-016 SP Japanese", "2024 ONE PIECE JAPANESE OP07-500 YEARS IN THE FUTURE", "OP-05", 1).verdict, "conflict",
  "Set 속성 'OP07-500 YEARS…' 의 'OP07-500' 을 카드 번호로 지우지 않고 세트명으로 읽는다(OP-07)");
assert.equal(verdict("ONE PIECE Shanks OP01-120 PSA 10 Japanese", "ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-", "PRB-01", 0).verdict, "match", "PSA 라벨 꼴 PRB-01 Set 속성 → PRB-01 확인");
assert.equal(verdict("ONE PIECE Shanks OP01-120 PSA 10 Japanese", "ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-", "OP-01", 0).verdict, "conflict", "PRB 재수록 매물은 원판 카드의 판이 아니다");
assert.equal(verdict("PSA 10 Shanks OP01-120 Romance Dawn PRB01 Japanese", null, "OP-01", 0).verdict, "conflict", "원판 세트명 + PRB 표시 → 재수록본(PRB 신호가 이긴다)");
assert.equal(verdict("PSA 10 Shanks OP01-120 Premium Booster Japanese 2025", null, "PRB-01", 0).verdict, "unknown", "묶음 신호(Premium Booster)뿐이고 2025 년이면 PRB-01·02 둘 다 가능 → 확인 안 됨");
assert.equal(verdict("PSA 10 Shanks OP01-120 Premium Booster Japanese 2024", null, "PRB-01", 0).verdict, "match", "묶음 신호 + 2024 → PRB-02(2025) 제외, PRB-01 확인");
assert.equal(verdict("PSA 10 Nami OP01-016 OP01 SP Japanese", null, "EB-05", 0).verdict, "unknown", "카드 번호의 세트(OP01)를 다시 적은 것은 판 증거가 아니다");
assert.equal(verdict(T.kid[1], null, "OP-03", 0).verdict, "unknown", "OP-03 수배서 키드(OP01-051) 매물의 'Romance Dawn' 은 번호 세트 이름이라 증거 아님");
assert.equal(verdict("PSA 10 Shanks OP01-120 OP01 Manga Japanese", null, "OP-01", 0).verdict, "match", "번호 세트 = 카드 세트면 코드도 증거");

// ── 받기(acceptListingEdition): PRB 카드는 PRB 표시가 있어야, 형제(같은 번호·변형의 다른 세트 카드)가 받을 수 있는 무표기 매물은 안 받는다.
const sibs = ED.editionSiblings(PACKS);
const accept = (title, setAspect, code, i) => ED.acceptListingEdition({ title, setAspect }, code, card(code, i), sibs.get(`${code}|${i}`), index);
assert.deepEqual(sibs.get("OP-05|1").map((s) => s.code), ["EB-05"], "OP-05 나미 SP 의 형제 = EB-05 나미 SP");
assert.deepEqual(sibs.get("OP-01|0").map((s) => s.code), ["PRB-01"], "OP-01 샹크스 망가의 형제 = PRB-01 샹크스 망가");
assert.equal(sibs.get("PRB-01|3").length, 0, "PRB-01 나미 망가는 형제가 없다(OP-05 SP·EB-05 SP 는 변형이 다르다)");
assert.equal(sibs.get("OP-14|0").length, 0, "버기 금·은은 서로 형제가 아니다(색이 다르면 다른 카드)");
assert.equal(accept(T.zoroOp06[1], null, "PRB-01", 4).ok, false, "PRB 카드: 판 표시 없는 매물은 안 받는다");
assert.equal(accept("PSA 10 Ace OP02-013 Manga Japanese", "Paramount War", "PRB-01", 1).ok, false, "③ 연도가 없어도 PRB 판 표시가 없으면 PRB 카드는 받지 않는다(종전엔 Set 속성에 세트 코드가 없어 통과)");
assert.equal(accept(T.prbNami[1], null, "PRB-01", 3).ok, true, "PRB 카드: 'PRB01 The Best' 매물은 받는다");
assert.equal(accept(T.zoroOp06[1], null, "OP-06", 0).ok, false, "OP-06 조로 망가: 무표기 매물은 PRB-01 판일 수도 있다 → 안 받는다");
assert.equal(accept("PSA 10 Roronoa Zoro OP06-118 Manga 2023 Japanese", null, "OP-06", 0).ok, true, "OP-06 조로 망가: 2023 → PRB-01(2024) 판일 수 없다 → 받는다");
assert.equal(accept(T.ace[1], null, "OP-02", 0).ok, true, "OP-02 에이스 망가: 2023 매물은 PRB-01 판일 수 없어 받는다");
assert.equal(accept("PSA 10 Nami OP01-016 SP Japanese", null, "OP-05", 1).ok, false, "OP-05 나미 SP: 무표기 SP 매물은 EB-05 판일 수도 있다");
assert.equal(accept(T.kid[1], null, "OP-03", 0).ok, true, "형제 없는 카드의 무표기 매물은 종전처럼 받는다(과잉 제거 금지)");

// ── 저장된 매물 전부(수집기 쓰기 직전·사실 빌더 표시 직전 같은 함수): 실사고 5건 + 맞는 쪽은 남긴다
const rej = ED.psa10ListingRejections({ packs: PACKS, index, audit: null });
for (const k of ["PRB-01|0", "PRB-01|1", "PRB-01|2", "EB-05|0", "OP-14|0", "OP-14|1"]) assert.ok(rej.has(k), `${k} 는 숨긴다 — ${[...rej.keys()].join(",")}`);
for (const k of ["OP-01|0", "OP-02|0", "OP-05|0", "OP-05|1", "OP-03|0", "PRB-01|3"]) assert.ok(!rej.has(k), `${k} 는 남긴다 — ${rej.get(k)}`);
assert.match(rej.get("OP-14|0"), /같은 매물 168805851944/, "④ 금·은이 제목에 없는 공유 매물 → 둘 다 숨김");
// 공유 매물인데 한쪽만 판본·색이 확인되면 그쪽은 남긴다
const P2 = JSON.parse(JSON.stringify(PACKS));
P2.sets["OP-14"].cards[0].psa10Active.bestListing.title = "Buggy OP09-051 One Piece SP Gold OP14 PSA 10 Japanese";
P2.sets["OP-14"].cards[1].psa10Active.bestListing.title = P2.sets["OP-14"].cards[0].psa10Active.bestListing.title;
const rej2 = ED.psa10ListingRejections({ packs: P2, index, audit: null });
assert.ok(!rej2.has("OP-14|0") && rej2.has("OP-14|1"), "제목에 'Gold'·'OP14' → 금 카드만 남고, 제목에 Silver 가 없는 은 카드는 숨김");

// ── 자체 감사 SET 표시: 감사 증거(제목·Set 속성)로 카드 세트와 대조. 다른 판이면 숨기고, 카드 세트와 같은 판이면(옛 감사의 번호 세트 오탐) 남긴다.
const P3 = PACKS;   // OP-03 키드 매물은 제목만으론 판 신호가 없어(번호 세트 이름뿐) 받는 매물 — 감사가 읽어 둔 Set 속성이 PRB-01 이라고 말한다
const audit = { flagged: [
  { code: "OP-03", number: "OP01-051", cardName: "EustassCaptainKid Wanted Poster", listingTitle: T.kid[1].slice(0, 80), setAspect: "ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-", reasons: ["SET: 매물 PRB-01 ≠ 번호세트 OP-01 (ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-)"] },
  { code: "OP-05", number: "OP01-016", cardName: "Nami SP", listingTitle: T.nami[1], reasons: ["SET: 매물 OP-05 ≠ 번호세트 OP-01 (제목)"] },
] };
const rej3 = ED.psa10ListingRejections({ packs: P3, index, audit });
assert.ok(!rej.has("OP-03|0") && rej3.has("OP-03|0"), "감사가 읽어 둔 Set 속성(PRB-01)이 카드 세트 OP-03 과 다른 판 → 숨김");
assert.ok(!rej3.has("OP-05|1"), "옛 감사의 'OP-05 ≠ 번호세트 OP-01' 은 카드 세트(OP-05)와 같은 판 → 남김");

// ── 표시 입구(사실 빌더가 부르는 함수)는 같은 결과
const viaN = N.psa10AskRejections({ packs: PACKS, setFacts: SET_FACTS, officialCardlist: OFFICIAL, audit: null });
assert.deepEqual([...viaN.keys()].sort(), [...rej.keys()].sort(), "market-data-normalizers.psa10AskRejections = 수집기와 같은 규칙");

// ── 가드: 사실 파일·페이지에 같은 매물이 두 카드로 나오면 FAIL, 숨김을 적용하면 깨끗
const factsOf = (packs, hide) => Object.fromEntries(Object.entries(packs.sets).map(([code, s]) => [code, { cards: s.cards.map((c, i) => ({
  i, number: c.number, name: c.name, psa10Ask: c.psa10Active && !(hide && hide.has(`${code}|${i}`)) ? { url: c.psa10Active.bestListing.url } : null,
})) }]));
const pagesOf = (facts) => [
  ...Object.entries(facts).map(([code, s]) => ({ path: `sets/${code.toLowerCase()}-card-list.html`, html: s.cards.map((c) => (c.psa10Ask ? `<a href="${c.psa10Ask.url}">` : "")).join("") })),
  ...Object.entries(facts).flatMap(([code, s]) => s.cards.map((c, i) => ({ path: `cards/${code.toLowerCase()}-${i}.html`, html: c.psa10Ask ? `<a href="${c.psa10Ask.url}">` : "" }))),
];
const raw = factsOf(PACKS, null);
const bad = G.violations({ factsSets: raw, packsData: PACKS, audit: null, index, pages: pagesOf(raw) });
for (const id of [T.shanks[0], T.ace[0], T.law[0], T.nami[0], T.buggy[0]]) {
  assert.ok(bad.share.some((m) => m.startsWith("사실 파일") && m.includes(id)), `가드 PSA10-SHARE(사실 파일)가 매물 ${id} 를 잡는다`);
  assert.ok(bad.share.some((m) => m.startsWith("페이지") && m.includes(id)), `가드 PSA10-SHARE(페이지)가 매물 ${id} 를 잡는다`);
}
const fixed = factsOf(PACKS, rej);
const good = G.violations({ factsSets: fixed, packsData: PACKS, audit: null, index, pages: pagesOf(fixed) });
assert.deepEqual(good.share, [], `숨김 적용 뒤 공유 매물 0 — ${good.share.join(" | ")}`);
const badAudit = G.violations({ factsSets: factsOf(P3, null), packsData: P3, audit, index, pages: pagesOf(factsOf(P3, null)) });
assert.ok(badAudit.audit.some((m) => m.includes("OP-03 OP01-051 EustassCaptainKid Wanted Poster") && m.startsWith("사실 파일")), "가드 PSA10-AUDIT 가 감사 SET 불일치 매물의 표시를 잡는다");
assert.ok(badAudit.audit.some((m) => m.startsWith("페이지: sets/op-03-card-list.html")), "가드 PSA10-AUDIT 가 그 세트 페이지의 링크를 잡는다");
assert.ok(!badAudit.audit.some((m) => m.includes("OP-05 OP01-016 Nami SP")), "옛 감사의 번호 세트 오탐(OP-05 나미 SP)은 가드가 잡지 않는다");
const goodAudit = G.violations({ factsSets: factsOf(P3, rej3), packsData: P3, audit, index, pages: pagesOf(factsOf(P3, rej3)) });
assert.deepEqual(goodAudit.audit, [], "숨김 적용 뒤 감사 SET 불일치 표시 0");

// ── 수집기 고르기(pickEditionListing): 싼 순서로 Set 속성까지 읽어 이 카드 판인 첫 매물. 조회 횟수 상한을 지킨다.
// PSA10-HOOK — 실제 build-site-facts.js 는 훅이 있어 0건, 훅 세 곳을 하나씩 빼면 각각 잡는다(2026-11-05 통합).
{
  const real = require("node:fs").readFileSync(require("node:path").join(__dirname, "build-site-facts.js"), "utf8");
  assert.deepEqual(G.hookProblems(real), [], "지금 사실 빌더에는 판본 훅이 있다");
  const noCall = real.replace(/src\.psa10Rejected\s*=\s*N\.psa10AskRejections\(/, "src.psa10RejectedOff = (");
  const noFilter = real.replace(/const pa = src\.psa10Rejected && src\.psa10Rejected\.has\([^\n]*/, "const pa = c.psa10Active || null;");
  const noInput = real.replace(/^\s*"data\/psa10-mismatch-audit\.json",\s*$/m, "");
  for (const [name, src] of [["호출", noCall], ["걸러내기", noFilter], ["INPUTS", noInput]]) {
    assert.notEqual(src, real, `역시험 소스(${name})가 실제로 바뀌었다`);
    assert.equal(G.hookProblems(src).length, 1, `훅(${name})을 빼면 PSA10-HOOK 이 한 건 잡는다`);
  }
}

(async () => {
  const aspects = { "v1|1|0": "Paramount War", "v1|2|0": null, "v1|3|0": "ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-" };
  const calls = [];
  const fetchAspect = async (id) => { calls.push(id); return aspects[id]; };
  const cands = [
    { title: "PSA 10 Ace OP02-013 Perforated Manga Japanese", raw: { itemId: "v1|1|0" } },   // ③ 실사고 꼴: 제목 무표기 + Set 속성 'Paramount War'
    { title: "PSA 10 Ace OP02-013 Manga Japanese One Piece", raw: { itemId: "v1|2|0" } },     // 무표기
    { title: "PSA 10 Ace OP02-013 Manga Japanese One Piece", raw: { itemId: "v1|3|0" } },     // Set 속성이 PRB-01
  ];
  const prbAce = await ED.pickEditionListing(cands, { code: "PRB-01", card: card("PRB-01", 1), siblings: sibs.get("PRB-01|1"), index, fetchAspect });
  assert.equal(prbAce && prbAce.raw.itemId, "v1|3|0", "PRB-01 에이스: 'Paramount War'·무표기 매물을 건너뛰고 PRB-01 Set 속성 매물을 고른다");
  assert.equal(prbAce.setAspect, aspects["v1|3|0"], "고른 매물의 Set 속성을 함께 돌려준다(저장해 사실 빌더가 같은 증거로 다시 본다)");
  const op02Ace = await ED.pickEditionListing(cands, { code: "OP-02", card: card("OP-02", 0), siblings: sibs.get("OP-02|0"), index, fetchAspect });
  assert.equal(op02Ace && op02Ace.raw.itemId, "v1|1|0", "OP-02 에이스: Set 속성 'Paramount War' 매물 → OP-02 판 확인");
  calls.length = 0;
  const capped = await ED.pickEditionListing(cands, { code: "PRB-01", card: card("PRB-01", 1), siblings: [], index, fetchAspect, maxLookups: 2 });
  assert.equal(capped, null, "조회 상한(2) 안에 PRB 판이 없으면 고르지 않는다(버튼 숨김)");
  assert.equal(calls.length, 2, "Set 속성 조회는 상한까지만");
  console.log("PSA10 edition tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
