#!/usr/bin/env node
"use strict";
// 유유테이 판매 목록 파서 회귀 테스트(가드 NMP1) — 2026-11-05. 네트워크 없이 실제 쪽 구조를 본뜬 조각으로 돌린다.
// 왜: 종전 파서는 페이지 첫 <img alt>(메뉴 아이콘)에서 시작해 <span>MENU</span>·<h4>収録弾</h4> 와 첫 상품의 값·재고를
//     한 덩어리로 묶었다. 23쪽 전부에서 첫 상품이 사라져 OP06-118 조로·OP10-118 루피·EB01-061 봉쿠레·OP06-119 상디(PRB-02)
//     4장이 NM 을 한 번도 못 받았다(2026-11-04 감사). seed-set-top-cards.js 도 같은 파서다.
// 지키는 것: ① 첫 결과가 쪽의 첫 상품이다(MENU·収録弾 같은 메뉴 글자가 결과에 없다) ② 상품 칸 수 = 읽은 상품 수
// ③ 품절(×)·재고 수 그대로 ④ alt 는 카드 이미지의 것(별 아이콘 아님) ⑤ 칸 밖(추천 캐러셀)의 값이 상품으로 들어오지 않는다
// ⑥ 칸 안 필드가 빠지면 그 상품을 버린다(이웃 값과 섞지 않는다) — 칸 수와 어긋나 수집기가 [파서 확인] 을 낸다.
// Run: node tools/test-yuyutei-parser.js
const assert = require("node:assert/strict");
const { parseYuyuteiProducts, countProductBlocks } = require("./update-yuyutei-nm-prices");

// 실측(2026-11-05 op10·op06) 마크업의 뼈대 — 메뉴 머리 → 상품 칸들(섹션 머리 사이사이) → 추천 캐러셀.
const menu = `<div class="col"><a href="/sell/opc/s/search"><img src="https://cdn.yuyu-tei.jp/images/common/icon.svg" alt="Icon"/>
<span class="d-block text-primary fs-9 mt-1">MENU</span> </a></div></div></div></div><div class="side">
<h3 class="fs-6">収録弾</h3><div class="modal"><h4 class="col-6 modal-title" id="myModalLabelPhone">収録弾</h4></div>`;
const section = (rarity) => `<div class="py-4 cards-list" id="card-list3"><h3 class="text-primary fs-4 shadow fw-bold">
<span class="py-2 d-inline-block px-2 me-2 text-white fw-bold">${rarity}</span> Card List</h3><div class="row mt-2" id="card-lits">`;
const product = ({ id, num, rarity, name, price, stock, drop = "" }) => `<div class="col-md"><div
class="card-product position-relative mt-4  "><div class="starbtn" onclick="location.href='https://yuyu-tei.jp/member/login'">
<em class="d-block position-absolute z-index top-0 start-0"></em>
<img src="https://cdn.yuyu-tei.jp/images/common/btn-icon/star.svg" alt="Star" class="star star1 position-absolute z-index"/></div>
<a href="https://yuyu-tei.jp/sell/opc/card/op10/${id}"><div class="position-relative product-img">
<img src="https://card.yuyu-tei.jp/opc/100_140/op10/${id}.jpg" alt="${num} ${rarity} ${name}" class="card img-fluid"/></div></a>
<span class="d-block border border-dark p-1 w-100 text-center my-2">${num}</span>
<a href="https://yuyu-tei.jp/sell/opc/card/op10/${id}"><h4 class="text-primary fw-bold">${name}</h4></a>
<strong class="d-block text-end ">
${price} 円
</strong><div class="form-check p-0">
${drop === "stock" ? "" : `<label class="form-check-label fw-bold float-start cart_sell_zaiko" for="flexRadioDefault1">
在庫 :
${stock}
</label>`}</div><a href="javascript:;" class="btn btn-primary cart_sell_in w-100 main-btn fw-bold mt-2">
カートへ
</a></div></div>`;
const carousel = `</div></div><div class="carousel-item"><div class="row"><div class="col-md-4" style="height: 240px">  <a
href="https://yuyu-tei.jp/sell/opc/card/op17/10157">  <img
src="https://card.yuyu-tei.jp/opc/100_140/op17/10157.jpg" alt=" OP17-119 SEC ロキ " class="img-fluid" loading="lazy"/><p
class="pt-1">ロキ</p> </a> <b>  <strong
class="d-block text-end "> 1,980 円 </strong>  </b></div></div></div>`;

const P1 = { id: "10141", num: "OP10-118", rarity: "P-SEC", name: "モンキー・D・ルフィ(パラレル)", price: "3,480", stock: "1 点" };
const P2 = { id: "10144", num: "OP10-119", rarity: "P-SEC", name: "トラファルガー・ロー(パラレル)(スーパーパラレル)", price: "79,800", stock: "×" };
const P3 = { id: "10140", num: "OP10-118", rarity: "SEC", name: "モンキー・D・ルフィ", price: "980", stock: "12 点" };
const page = `<html><body>${menu}${section("P-SEC")}${product(P1)}${product(P2)}</div></div>${section("SEC")}${product(P3)}${carousel}</body></html>`;

const got = parseYuyuteiProducts(page);
// ① 첫 결과 = 쪽의 첫 상품. 메뉴 글자가 번호·이름으로 나오면 그 칸의 값이 메뉴에 붙어 첫 상품이 사라진 것이다.
assert.equal(got[0] && got[0].number, "OP10-118", `NMP1: 첫 결과가 첫 상품이 아니다 — ${JSON.stringify(got[0])}`);
for (const p of got) {
  assert.match(p.number, /^(?:[A-Z]+\d{2}-\d{3}|P-\d{3}|-)$/, `NMP1: 카드번호가 아닌 번호 "${p.number}"(${p.name}) — 메뉴·머리 글자가 상품으로 읽혔다`);
  assert.ok(!/収録弾|MENU|Card List/.test(p.name), `NMP1: 상품 이름에 메뉴·머리 글자 "${p.name}"`);
}
// ② 칸 수 = 상품 수, ③ 값·재고, ④ alt
assert.equal(countProductBlocks(page), 3, "NMP1: 상품 칸 수");
assert.deepEqual(got, [
  { alt: "OP10-118 P-SEC モンキー・D・ルフィ(パラレル)", number: "OP10-118", name: "モンキー・D・ルフィ(パラレル)", priceJpy: 3480, stockText: "1 点" },
  { alt: "OP10-119 P-SEC トラファルガー・ロー(パラレル)(スーパーパラレル)", number: "OP10-119", name: "トラファルガー・ロー(パラレル)(スーパーパラレル)", priceJpy: 79800, stockText: "×" },
  { alt: "OP10-118 SEC モンキー・D・ルフィ", number: "OP10-118", name: "モンキー・D・ルフィ", priceJpy: 980, stockText: "12 点" },
], "NMP1: 상품 필드");
// ⑤ 캐러셀(¥1,980 ロキ)은 상품 칸이 아니다
assert.ok(!got.some((p) => p.priceJpy === 1980), "NMP1: 칸 밖 캐러셀 값이 상품으로 들어왔다");

// ⑥ 마지막 칸의 재고 줄이 빠지면 버린다 — 캐러셀·이웃 칸 값과 묶지 않는다. 칸 수(3)와 상품 수(2)가 어긋나 수집기가 알린다.
const broken = `<html><body>${menu}${section("P-SEC")}${product(P1)}${product(P2)}</div></div>${section("SEC")}${product({ ...P3, drop: "stock" })}${carousel}</body></html>`;
const got2 = parseYuyuteiProducts(broken);
assert.deepEqual(got2.map((p) => `${p.number}|${p.priceJpy}`), ["OP10-118|3480", "OP10-119|79800"], "NMP1: 재고 줄이 빠진 칸을 버리지 않았다");
assert.equal(countProductBlocks(broken), 3, "NMP1: 칸 수는 그대로 3 — 상품 수와 달라야 [파서 확인] 이 뜬다");

// 상품 칸이 없는 쪽(점검 화면 등) → 빈 목록(메뉴를 상품으로 만들지 않는다)
assert.deepEqual(parseYuyuteiProducts(`<html>${menu}${carousel}</html>`), [], "NMP1: 상품 칸이 없는 쪽에서 상품을 만들었다");

console.log(JSON.stringify({ test: "OK", products: got.length }));
