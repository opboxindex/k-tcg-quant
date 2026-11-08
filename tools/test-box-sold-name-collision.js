#!/usr/bin/env node
// 박스 sold 원장 — 시리즈 이름 충돌 회귀 테스트. 2026-09-30.
//
// EB-03 "Heroine's Edition" 과 EB-05 "Heroines Edition vol.2" 는 이름이 겹친다(normName: "heroines edition" ⊂ "heroines edition vol 2").
// 종전 ingest 는 (1) 이름표를 packs.json 에서만 만들어 수집 중인 UPCOMING 세트 이름을 몰랐고
// (2) 이름을 includes 로 찾아 긴 이름 안의 짧은 이름도 같이 걸었다. 그 결과:
//   · EB-05 제목이 EB-03 이름에도 걸려 cross-set 으로 버려진다
//   · 코드 없는 EB-05 제목("Heroines Edition Vol.2 Booster Box")이 EB-03 으로 들어간다
// 아래 제목 중 앞의 넷은 러너 덤프에 실제로 있던 것이다(C:/Users/kimtt/opbox-heartbeat/box-sold-cdp/box-2026-09-*.json).
// Run: node tools/test-box-sold-name-collision.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { judgeItem, buildNameMap, codesFromName, ingestNameMap } = require("./box-sold-ingest");
const { UPCOMING } = require("./box-sold-urls");

const packs = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "onepiece-packs.json"), "utf8"));
const fx = packs.fx.usdKrw;
// EB-05·OP-18 을 수집 목록에 넣었을 때의 이름표(공식 영문명: Bandai "HEROINES EDITION vol.2" · "THE DOMINANCE OF GOD").
const NEXT = [{ code: "EB-05", nameEn: "Heroines Edition vol.2" }, { code: "OP-18", nameEn: "The Dominance of God" }];
const withNext = buildNameMap(packs, NEXT);
const today = buildNameMap(packs);

const it = (t, k, d) => ({ id: "1", t, k, cur: "KRW", d: d || "Sold  Sep 28, 2026" });
const judge = (t, k, code, ed, map) => judgeItem(it(t, k), code, fx, map, ed, "bin");
const ok = (r, ed, qty) => { assert.ok(!r.drop, "버려졌다: " + r.drop); assert.equal(r.ed, ed); assert.equal(r.rec.qty, qty); };

// ── 실제 덤프 제목 — EB-05 로 수집하면 EB-05 로 들어가야 한다(종전: 앞의 둘은 cross-set)
ok(judge("One Piece : EB-05: Heroines Edition Vol.2 | EB-05 BOOSTER BOX ENG *PRESALE Ebay*", 435436.25, "EB-05", "en", withNext), "en", 1);   // box-2026-09-25 · Sold Sep 15
ok(judge("ONE PIECE Heroines Edition Vol.2 EB-05 Japanese Booster Box PRE-ORDER", 345287.85, "EB-05", "jp", withNext), "jp", 1);           // box-2026-09-29 · Sold Sep 28
ok(judge("One Piece Card Game EB-05 Heroines Vol.2 English Booster Box Sealed ✅ PRESALE ✅", 447038.37, "EB-05", "en", withNext), "en", 1);  // box-2026-09-29 · Sold Sep 28
ok(judge("PRESALE Bandai TCG One Piece Card Game Original Booster box Vol.18 OP-18 JP", 148934.16, "OP-18", "jp", withNext), "jp", 1);    // box-2026-09-27 · Sold Sep 26

// ── EB-05 제목은 EB-03 검색 페이지에 떠도 EB-03 이 되지 않는다(오늘 이름표로도, EB-05 를 넣은 뒤에도)
for (const map of [today, withNext]) {
  assert.ok(judge("ONE PIECE Heroines Edition Vol.2 EB-05 Japanese Booster Box PRE-ORDER", 345287.85, "EB-03", "jp", map).drop);
  assert.equal(judge("One Piece Heroines Edition Vol.2 Booster Box Japanese", 345000, "EB-03", "jp", map).drop, "code-missing");   // 코드 없는 2권
  assert.equal(judge("One Piece Heroines Edition Volume 2 Booster Box English", 447000, "EB-03", "en", map).drop, "code-missing");
}
// "Heroines Edition 2" — 2권 한 박스인지 1권 두 박스인지 모른다. 시리즈가 이름표에 있으면 버린다.
assert.equal(judge("One Piece Heroines Edition 2 Booster Box Japanese", 345000, "EB-03", "jp", withNext).drop, "name-ambiguous");
assert.equal(judge("One Piece EB-05 Heroines Edition 2 Booster Box Japanese", 345000, "EB-05", "jp", withNext).drop, "name-ambiguous");

// ── EB-03 자기 제목은 그대로 들어온다(원장 실제 제목 포함)
ok(judge("PRESALE One Piece HEROINES EDITION [EB-03] Booster Box ENG Ships by 2/28", 640000, "EB-03", "en", withNext), "en", 1);
ok(judge("One Piece Heroines Edition Booster Box Japanese Sealed", 200000, "EB-03", "jp", withNext), "jp", 1);
ok(judge("One Piece EB-03 Heroines Edition Vol.1 Booster Box Japanese", 200000, "EB-03", "jp", withNext), "jp", 1);   // 권수가 붙으면 이름 대신 코드로

// ── 이름만 있는 제목도 제 세트로
ok(judge("One Piece Heroines Edition Vol.2 Booster Box English", 447000, "EB-05", "en", withNext), "en", 1);
ok(judge("One Piece The Dominance of God Booster Box Japanese", 150000, "OP-18", "jp", withNext), "jp", 1);

// ── 이름표 규칙
assert.deepEqual(codesFromName("One Piece Heroines Edition Vol.2 Booster Box", withNext), ["EB-05"]);   // 긴 이름이 먹으면 짧은 이름은 안 걸린다
assert.deepEqual(codesFromName("One Piece Royal Bloodline Booster Box", today), []);                     // 단어 경계
assert.deepEqual(codesFromName("One Piece Royal Blood Booster Box", today), ["OP-10"]);
// packs.json 으로 옮겨진 UPCOMING(OP-17)을 두 번 넣으면 중복 이름으로 지워진다 — 넣지 않아야 한다.
assert.deepEqual(codesFromName("One Piece The World's Strongest Warriors Booster Box", buildNameMap(packs, [{ code: "OP-17", nameEn: "The World's Strongest Warriors" }])), ["OP-17"]);
// ingest 가 쓰는 이름표에는 수집 목록(UPCOMING)의 미등재 세트가 전부 있다.
const live = new Map(ingestNameMap(packs).map(([n, c]) => [c, n]));
for (const u of UPCOMING) if (!packs.sets[u.code]) assert.ok(live.has(u.code), `UPCOMING ${u.code} 가 ingest 이름표에 없다`);

// ── 일본판 제목의 영어 번역(JP_TITLE_EN) — 2026-11-08. 앞의 둘은 덤프·원장 실제 제목이다.
// "Twin Champions" = OP-06 일본판. 이름표에 없어 code-missing 으로 버려졌다(box-2026-09-18~11-08 덤프 49일, Sold Sep 8).
ok(judge("Bandai One Piece CCG Twin Champions Booster Box  Japanese", 137640, "OP-06", "jp", today), "jp", 1);
// "Inherited Will" = OP-13 일본판. OP03 코드와 같이 적힌 제목은 어느 세트인지 모른다 — cross-set(07-22 원장 행 #168518173476 의 제목).
assert.equal(judge("One Piece Card Game Inherited Will OP03 Booster Box Sealed Japan New Bandai", 280054, "OP-03", "jp", today).drop, "cross-set");
assert.deepEqual(codesFromName("One Piece Inherited Will Booster Box Japanese", today), ["OP-13"]);
assert.deepEqual(codesFromName("One Piece Wings of the Captain Booster Box English", today), ["OP-06"]);   // 영문판 이름도 그대로

console.log("test-box-sold-name-collision: OK");
