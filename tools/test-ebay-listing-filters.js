#!/usr/bin/env node

const assert = require("node:assert/strict");
const { isExcludedEbaySellerOrLocation, isJapaneseSealedBoosterBoxTitle } = require("./ebay-listing-filters");
const path = require("node:path");
const { isPsa10JapaneseCardListing, setCodeFromText, editionVerdict, loadEditionIndex, characterMatches, colorConflict } = require("./ebay-psa10-listing-filter");

assert.equal(
  isJapaneseSealedBoosterBoxTitle("Sealed Japanese EB-02 Anime 25th Collection Booster Box [US Seller] One Piece", "EB-02"),
  true,
);

assert.equal(
  isExcludedEbaySellerOrLocation({
    itemLocation: { country: "US" },
    seller: { username: "jindoutian" },
  }),
  true,
);

assert.equal(
  isExcludedEbaySellerOrLocation({
    itemLocation: { country: "CN" },
    seller: { username: "example_cards" },
  }),
  true,
);

assert.equal(
  isExcludedEbaySellerOrLocation({
    itemLocation: { country: "US", city: "Shenzhen" },
    seller: { username: "example_cards" },
  }),
  true,
);

assert.equal(
  isExcludedEbaySellerOrLocation({
    itemLocation: { country: "US", city: "Dallas" },
    seller: { username: "trusted_tcg" },
  }),
  false,
);

const treasureRare = { number: "OP07-109", name: "Monkey D. Luffy TR", rarity: "TR" };
assert.equal(
  isPsa10JapaneseCardListing(
    { title: "PSA 10 JAPANESE MONKEY D. LUFFY ONE PIECE OP07-109", country: "US" },
    "OP-08",
    treasureRare,
  ),
  false,
  "Treasure Rare must not match a number-only base-card listing",
);
assert.equal(
  isPsa10JapaneseCardListing(
    { title: "2024 ONE PIECE OP07-109 MONKEY D. LUFFY TREASURE RARE JAPANESE PSA 10", country: "US" },
    "OP-08",
    treasureRare,
  ),
  true,
  "Treasure Rare listing with an explicit variant signal should pass",
);
assert.equal(
  isPsa10JapaneseCardListing(
    { title: "2024 ONE PIECE OP07-109 MONKEY D. LUFFY TR JAPANESE PSA 10", country: "US" },
    "OP-08",
    { number: "OP07-109", name: "Monkey D. Luffy", rarity: "SR" },
  ),
  false,
  "A base card must not match an explicitly named Treasure Rare listing",
);

// 교차세트 오매칭(2026-07-22 실사고): PRB-01 재판 알트아트가 OP-01 원본에 물림.
// Set 속성으로 세트코드를 뽑아 카드 세트와 다르면 걸러야 한다. 판본 판정 전체(세트명·연도·형제 카드)는 test-psa10-edition.js.
assert.equal(setCodeFromText("ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-"), "PRB-01");
assert.equal(setCodeFromText("ONE PIECE OP01-ROMANCE DAWN"), "OP-01");
assert.equal(setCodeFromText("Pokemon nonsense"), null);
const editionIndex = loadEditionIndex(path.join(__dirname, ".."));
const op01Shanks = { number: "OP01-120", name: "Shanks Parallel" };
const plainTitle = "PSA 10 Shanks OP01-120 SEC Parallel Japanese One Piece";
assert.equal(
  editionVerdict({ title: plainTitle, setAspect: "ONE PIECE PRB01-PREMIUM BOOSTER -ONE PIECE CARD THE BEST-" }, "OP-01", op01Shanks, editionIndex).verdict,
  "conflict",
  "PRB-01 reprint listing must be flagged as a set mismatch for an OP-01 card",
);
assert.equal(
  editionVerdict({ title: plainTitle, setAspect: "ONE PIECE OP01-ROMANCE DAWN" }, "OP-01", op01Shanks, editionIndex).verdict,
  "match",
  "A matching OP-01 Set aspect must not be flagged",
);
assert.equal(
  editionVerdict({ title: plainTitle, setAspect: null }, "OP-01", op01Shanks, editionIndex).verdict,
  "unknown",
  "Missing Set aspect is not a conflict (the caller decides by PRB/sibling rules)",
);

// 캐릭터명 불일치(2026-07-22 실사고): Luffy 카드에 Perona 매물이 물림.
assert.equal(characterMatches("PSA 10 Perona Leader Parallel EB02-010 One Piece Anime 25th Gold", { name: "Monkey D. Luffy 010 Alternate Art" }), false, "Luffy 카드에 Perona 매물 → 거부");
assert.equal(characterMatches("PSA 10 Monkey D. Luffy SEC OP05-119 Japanese Gem Mint", { name: "Monkey D. Luffy" }), true, "Luffy 카드에 Luffy 매물 → 통과");
assert.equal(characterMatches("2024 One Piece Rob Lucci OP09-093 Special Alt Art PSA 10", { name: "Marshall D. Teach SP Silver" }), false, "Teach 카드에 Rob Lucci 매물 → 거부");

// 색상 하위변형 충돌: gold↔silver 직접충돌, red/gold-letters(별도 프리미엄) vs 무색 카드.
assert.equal(colorConflict("PSA 10 Luffy Silver OP05-119 SEC", { name: "Monkey D. Luffy 119 SP Gold" }), true, "카드 gold ↔ 매물 silver → 충돌");
assert.equal(colorConflict("PSA 10 Sabo SEC Red Comic Parallel OP13-120", { name: "Sabo 120 Super Alternate Art" }), true, "무색 카드에 Red 매물 → 충돌");
assert.equal(colorConflict("PSA10 Tony Tony Chopper OP08-001 Leader Parallel Gold Letters EB02", { name: "Tony TonyChopper 001 Parallel" }), true, "무색 카드에 Gold Letters 매물 → 충돌");
// 정상(오탐 방지): Gold Stamped Signature 카드에 색 미표기 서명 매물, Silver 포일 SP 는 유지.
assert.equal(colorConflict("PSA 10 Monkey D. Luffy ST01-012 Eiichiro Oda Signature", { name: "Monkey D. Luffy 012 Alternate Art Gold Stamped Signature" }), false, "카드 gold·매물 무색(서명) → 오탐 금지");
assert.equal(colorConflict("PSA 10 Buggy OP09-051 R Silver SP Alt Art", { name: "Buggy OP09 051 SP" }), false, "무색 카드에 Silver 포일 SP → 오탐 금지");

console.log("eBay listing filter tests passed");
