"use strict";
// PSA 10 최저 매물 판본 — 화면에 다른 판의 매물이 나오지 않는다. 2026-11-05 신설.
//  PSA10-SHARE 다른 카드 둘 이상이 같은 PSA 10 매물(eBay itm id)을 화면에 낸다 [2026-11-05 OP-01/PRB-01 샹크스 망가 $1,756 · OP-02/PRB-01 에이스 망가 $850 ·
//              OP-05/EB-05 나미 SP $295 · OP-05/PRB-01 로 망가 · OP-14 버기 금/은 — 한 매물이 두 판본 카드에 붙었다]
//              사실 파일(cards[].psa10Ask — 세트 표 ask 값·카드 상세 버튼·랭킹이 읽는 값)과 페이지(카드 상세 cards/*.html · 세트 카드리스트 sets/*-card-list.html) 둘 다 본다.
//  PSA10-AUDIT 자체 감사(data/psa10-mismatch-audit.json)가 SET 불일치로 표시한 매물이 그 카드 자리에 나온다 [2026-11-05 EB-05 나미 SP: 감사가 잡고도 화면에 남음]
//              감사의 SET 사유는 감사 증거(제목·Set 속성)로 카드 세트와 다시 대조한다(editionVerdict) — 옛 감사는 카드 "번호"의 세트와 비교해 맞는 SP 매물도 찍었다.
//  PSA10-HOOK  사실 빌더(build-site-facts.js)가 판본 규칙(N.psa10AskRejections)을 부르고 buildCard 의 psa10Ask 를 그 결과로 거른다 [2026-11-05 통합:
//              규칙을 만들고도 빌더 호출이 빠져 화면에 안 닿을 뻔했다. 데이터가 정리된 날엔 위 두 검사가 0건이라 훅이 빠져도 모른다 — 코드로 본다]
// 값 대조라 sink — 페이지를 굽지 않은 실행(수집·환율)에서는 경고, 굽는 실행에서는 FAIL. PSA10-HOOK 은 코드 검사라 항상 FAIL.
const { packs, json, read, list, facts, sink, fail } = require("./lib");
const ED = require("../ebay-psa10-listing-filter");

const checks = ["PSA10-SHARE", "PSA10-AUDIT", "PSA10-HOOK"];

// 순수 함수 — build-site-facts.js 소스(주석 제외)에 훅 두 곳이 있는지. 테스트가 훅을 뺀 소스를 넣는다.
function hookProblems(src) {
  const code = String(src || "").replace(/^\s*\/\/.*$/gm, "");
  const out = [];
  if (!/src\.psa10Rejected\s*=\s*N\.psa10AskRejections\(/.test(code)) out.push("build() 가 src.psa10Rejected = N.psa10AskRejections(...) 를 만들지 않는다 — 다른 판 매물이 화면에 그대로 나간다");
  if (!/const pa = src\.psa10Rejected && src\.psa10Rejected\.has\(`\$\{code\}\|\$\{i\}`\)/.test(code)) out.push("buildCard() 의 psa10Ask 가 src.psa10Rejected 로 걸러지지 않는다");
  if (!/"data\/psa10-mismatch-audit\.json"/.test((code.match(/const INPUTS = \[([\s\S]*?)\];/) || [])[1] || "")) out.push("INPUTS 에 data/psa10-mismatch-audit.json 이 없다 — 감사 파일만 바뀐 날 사실 캐시가 묵는다");
  return out;
}
const itmId = (url) => (String(url || "").match(/\/itm\/(\d+)/) || [])[1] || null;

// 순수 함수 — 테스트가 가짜 사실·페이지를 넣는다. factsSets = site-facts.sets, pages = [{ path, html }].
function violations({ factsSets, packsData, audit, index, pages = [] }) {
  const share = [], auditOut = [];
  // ① 사실 파일: 같은 매물 id 를 쓰는 서로 다른 카드
  const byId = new Map();
  for (const [code, s] of Object.entries(factsSets || {})) {
    for (const c of (s && s.cards) || []) {
      const id = c && c.psa10Ask && itmId(c.psa10Ask.url);
      if (!id) continue;
      const who = `${code} ${c.number} ${c.name}`;
      if (!byId.has(id)) byId.set(id, new Set());
      byId.get(id).add(who);
    }
  }
  for (const [id, who] of byId) if (who.size > 1) share.push(`사실 파일: 매물 ${id} 을 카드 ${who.size}장이 PSA 10 최저 매물로 낸다 — ${[...who].join(" / ")}`);
  // ② 페이지: PSA 10 매물 id(박스 매물 제외)가 카드 상세 두 장 이상·세트 카드리스트 두 세트 이상에 나온다
  const psaIds = new Set();
  for (const s of Object.values((packsData && packsData.sets) || {})) for (const c of (s && s.cards) || []) { const id = ED.listingItemId(c && c.psa10Active); if (id) psaIds.add(id); }
  const onPages = new Map();
  for (const p of pages) {
    const m = p.path.match(/^sets\/([a-z]+-\d+)-card-list\.html$/);
    const where = /^cards\//.test(p.path) ? p.path : m ? m[1].toUpperCase() : null;
    if (!where) continue;
    for (const x of p.html.matchAll(/ebay\.com\/itm\/(\d+)/g)) {
      if (!psaIds.has(x[1])) continue;
      if (!onPages.has(x[1])) onPages.set(x[1], { cards: new Set(), sets: new Set() });
      onPages.get(x[1])[/^cards\//.test(where) ? "cards" : "sets"].add(where);
    }
  }
  for (const [id, o] of onPages) {
    if (o.cards.size > 1) share.push(`페이지: 매물 ${id} 이 카드 상세 ${o.cards.size}장에 나온다 — ${[...o.cards].join(" ")}`);
    if (o.sets.size > 1) share.push(`페이지: 매물 ${id} 이 세트 ${o.sets.size}곳 카드리스트에 나온다 — ${[...o.sets].join(" ")}`);
  }
  // ③ 자체 감사 SET 불일치 매물이 그 카드 자리(사실 파일 psa10Ask·그 세트 페이지)에 나온다. 감사 줄과 지금 매물의 짝은 수집기·사실 빌더와 같은 함수(auditEntryFor) —
  //    감사 뒤에 매물이 바뀌었으면 짝이 없다(그 표시는 지금 매물 얘기가 아니다).
  for (const [code, s] of Object.entries((packsData && packsData.sets) || {})) {
    ((s && s.cards) || []).forEach((card, i) => {
      const bl = card && card.psa10Active && card.psa10Active.bestListing;
      const f = bl && ED.auditEntryFor(audit, code, card, bl.title);
      if (!f || !(f.reasons || []).some((r) => /^SET:/.test(r))) return;
      const v = ED.editionVerdict({ title: f.listingTitle, setAspect: f.setAspect }, code, card, index);
      if (v.verdict !== "conflict") return;
      const id = ED.listingItemId(card.psa10Active);
      const fc = ((factsSets && factsSets[code] && factsSets[code].cards) || []).find((c) => c && c.i === i);
      if (fc && fc.psa10Ask) auditOut.push(`사실 파일: ${code} ${card.number} ${card.name} 에 자체 감사가 다른 판(${v.reason})으로 표시한 매물 ${id || "?"} 의 값·링크가 나온다`);
      const slug = code.toLowerCase();
      for (const p of pages) {
        if ((p.path === `sets/${slug}.html` || p.path === `sets/${slug}-card-list.html`) && id && p.html.includes(`/itm/${id}`)) {
          auditOut.push(`페이지: ${p.path} 에 자체 감사가 ${code} ${card.number} ${card.name} 의 다른 판(${v.reason})으로 표시한 매물 ${id} 이 나온다`);
        }
      }
    });
  }
  return { share, audit: auditOut };
}

function run() {
  const P = packs();
  const index = ED.buildEditionIndex({ packs: P, setFacts: json("data/set-facts.json", null), officialCardlist: json("data/official-cardlist.json", null) });
  const pages = [...list("cards", /\.html$/).map((f) => `cards/${f}`), ...list("sets", /\.html$/).map((f) => `sets/${f}`)].map((p) => ({ path: p, html: read(p) }));
  const v = violations({ factsSets: facts().sets, packsData: P, audit: json("data/psa10-mismatch-audit.json", null), index, pages });
  v.share.forEach(sink("PSA10-SHARE"));
  v.audit.forEach(sink("PSA10-AUDIT"));
  hookProblems(read("tools/build-site-facts.js")).forEach(fail("PSA10-HOOK"));
}

module.exports = { checks, run, violations, hookProblems };
