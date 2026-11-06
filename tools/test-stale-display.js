#!/usr/bin/env node
"use strict";
// 낡은 값 표시(날짜 + 흐림) 역시험 — 2026-11-05 신설. 가드 STALE-DISPLAY(tools/guard/stale-display.js, DSP1~DSP5)가
//   ① 세트 Top 10 NM 칸의 관측일 누락 ② 대표 PSA 10 칸(118일 된 표본)의 흐림 누락 ③ 체크포인트 이월 칸 표시 누락 ④ 한국어 같은 칸을
//   실제로 잡는지 가짜 사실·가짜 페이지로 본다(생성물에 기대지 않는다 — check.js --pre 에서도 돈다).
//   덧붙여 사실 파일(build-site-facts)의 nm.stale·shown.nmDate·checkpoints[].nmAsOf/psaAsOf 정의가 지켜지는지 본다.
// Run: node tools/test-stale-display.js  (tools/check.js 가 test-*.js 로 자동 실행)
const { scan } = require("./guard/stale-display");

const fails = [];
const expect = (cond, msg) => { if (!cond) fails.push(msg); };

// ── 가짜 사실 한 벌(OP13-118 사고 꼴: PSA 10 07-10 표본 3건 · NM 10-21 · 데이터 11-05)
const baseFacts = () => {
  const card = {
    number: "OP13-118", name: "Monkey D. Luffy",
    nm: { usd: 8090, date: "2026-10-21", stale: false },
    psa10: { date: "2026-07-10", stale: true },
    shown: { nm: 8090, nmSrc: "jp", nmDate: "2026-10-21", nmStale: false, psa: 14134, psaKind: "sold", psaDate: "2026-07-10", psaStale: true },
    checkpoints: [
      { d: "2026-10-21", nm: 8000, psa: 14134, nmAsOf: null, psaAsOf: "2026-07-10" },
      { d: "2026-10-28", nm: 8031, psa: 14134, nmAsOf: "2026-10-21", psaAsOf: "2026-07-10" },
    ],
  };
  return {
    dataDate: "2026-11-05", staleDays: { nm: 28, psa10: 35 },
    cardPages: [{ file: "op13-118.html", code: "OP-13", i: 0 }],
    order: { setPages: ["OP-13"] },
    sets: { "OP-13": { slug: "op-13", top10: { priciest: { i: 0 } }, cards: [card] } },
  };
};
// 생성기 출력과 같은 꼴의 가짜 페이지(정상)
const highest = (cls, d) => `<tr data-k="highest"><th scope="row"><span data-ko="최고 PSA 10 (판매 중앙값)">Highest PSA 10 (sold median)</span></th><td><b${cls ? ` class="stale" title="Observed ${d} — older than 35 days"` : ""}>$14,134</b> <small>Monkey D. Luffy · OP13-118 · 3 <span data-ko="건">sales</span> · <time datetime="${d}">${d}</time></small></td></tr>`;
const basePages = () => ({
  "psa10-ranking.html": `${highest(true, "2026-07-10")}\n<div class="stat hi stale" title="x"><b>$14,134</b><span>highest PSA 10 · Monkey D. Luffy · sold as of 2026-07-10</span></div>`,
  "cards/index.html": highest(true, "2026-07-10"),
  "cards/op13-118.html": `<div class="pc hl"><span>Japanese NM (raw)</span><b>$8,090</b><small>Japanese retail · as of 2026-10-21</small></div>
    <div class="pc stale" title="x"><span>PSA 10 (sold median)</span><b>$14,134</b><small>3 sales · 2026-07-10</small></div>
    <h2>Recent price checkpoints</h2>
    <table class="dataTable"><thead><tr><th>Date</th><th>NM (raw)</th><th>PSA 10</th></tr></thead><tbody><tr><td>2026-10-21</td><td class="num">$8,000</td><td class="num carried" title="x">$14,134 <small>as of 07-10</small></td></tr><tr><td>2026-10-28</td><td class="num carried" title="x">$8,031 <small>as of 10-21</small></td><td class="num carried" title="x">$14,134 <small>as of 07-10</small></td></tr></tbody></table>`,
  "sets/op-13.html": `<table class="chaseTable"><thead><tr><th>#</th><th class="cn">Card</th><th>NM (raw)</th><th>PSA 10</th></tr></thead><tbody><tr><td>1</td><td class="cn"><strong>Monkey D. Luffy</strong><span class="cNum">OP13-118</span></td><td class="num">$8,090 <span class="psaKind">as of 10-21</span></td><td class="num psaStale" title="x">$14,134 <span class="psaKind">sold · 07-10</span></td><td class="num gCol">—</td></tr></tbody></table>`,
  "ko/op-13.html": `<ul class="koFacts"><li class="stale">PSA 10 실거래 중앙값 (Monkey D. Luffy) <strong>18,919,395원</strong>(2026-07-10, 표본 3건)</li></ul>
    <section aria-label="인기 카드 시세"><table class="koBoard"><tr><td class="nm">Monkey D. Luffy</td><td class="code">OP13-118</td><td>SEC</td><td class="num">11,021,000원</td></tr></table></section>`,
});
const run = (mutate = {}, factsMut = null) => {
  const F = baseFacts();
  if (factsMut) factsMut(F);
  const pages = { ...basePages(), ...mutate };
  return scan({ F, read: (f) => pages[f], exists: (f) => pages[f] != null });
};
const ids = (r) => r.map((x) => x.id);

// 0) 정상 — 아무것도 잡지 않는다
const ok = run();
expect(ok.length === 0, `정상 페이지를 잡았다: ${ok.map((x) => `${x.id} ${x.msg}`).join(" / ")}`);

// 1) DSP1 — 118일 된 대표 PSA 10 칸에서 흐림을 빼면(사고 당시 꼴) 잡는다 · 최근 표본을 흐리면 잡는다 · stat 칸도
const P = basePages();
expect(ids(run({ "psa10-ranking.html": P["psa10-ranking.html"].replace('<b class="stale" title="Observed 2026-07-10 — older than 35 days">', "<b>") })).includes("DSP1"), "랭킹 Key facts 'highest' 흐림 누락을 못 잡았다");
expect(ids(run({ "cards/index.html": highest(false, "2026-07-10") })).includes("DSP1"), "cards/ Key facts 'highest' 흐림 누락을 못 잡았다");
expect(ids(run({ "cards/index.html": highest(true, "2026-10-29") })).includes("DSP1"), "7일 된 표본을 흐린 것을 못 잡았다");
expect(run({ "cards/index.html": highest(false, "2026-10-29") }).length === 0, "7일 된 표본(흐림 없음)을 잘못 잡았다");
expect(ids(run({ "psa10-ranking.html": P["psa10-ranking.html"].replace('class="stat hi stale"', 'class="stat hi"') })).includes("DSP1"), "랭킹 stat 칸 흐림 누락을 못 잡았다");

// 2) DSP2 — 카드 상세 머리 칸
const card = P["cards/op13-118.html"];
expect(ids(run({ "cards/op13-118.html": card.replace('<div class="pc stale" title="x">', '<div class="pc">') })).includes("DSP2"), "카드 상세 PSA 10 머리 칸 흐림 누락을 못 잡았다");
expect(ids(run({ "cards/op13-118.html": card.replace('<div class="pc hl">', '<div class="pc hl stale">') })).includes("DSP2"), "신선한 NM 머리 칸을 흐린 것을 못 잡았다");
expect(ids(run({}, (F) => { F.sets["OP-13"].cards[0].nm.stale = true; })).includes("DSP2"), "29일 넘은 NM 머리 칸 흐림 누락을 못 잡았다");

// 3) DSP4 — 체크포인트: 이월 칸을 보통 칸처럼 내면(사고 당시 꼴) 잡는다 · 관측일 라벨 누락 · 그날 기록을 이월로 표시
const plain = card.replace(/<td class="num carried" title="x">(\$[\d,]+) <small>as of \d\d-\d\d<\/small><\/td>/g, '<td class="num">$1</td>');
expect(ids(run({ "cards/op13-118.html": plain })).includes("DSP4"), "이월 칸을 새 행처럼 낸 체크포인트를 못 잡았다");
expect(ids(run({ "cards/op13-118.html": card.replace("$8,031 <small>as of 10-21</small>", "$8,031") })).includes("DSP4"), "이월 칸 관측일 라벨 누락을 못 잡았다");
expect(ids(run({ "cards/op13-118.html": card.replace('<td class="num">$8,000</td>', '<td class="num carried">$8,000 <small>as of 10-21</small></td>') })).includes("DSP4"), "그날 기록을 이월로 표시한 것을 못 잡았다");
expect(ids(run({ "cards/op13-118.html": card.replace(/<tr><td>2026-10-28<\/td>[\s\S]*?<\/tr>/, "") })).includes("DSP4"), "체크포인트 행 수 어긋남을 못 잡았다");

// 4) DSP3 — 세트 Top 10: NM 칸 관측일 누락(사고 당시 꼴 "$8,090</td>") · 흐림 누락
const set = P["sets/op-13.html"];
expect(ids(run({ "sets/op-13.html": set.replace(' <span class="psaKind">as of 10-21</span>', "") })).includes("DSP3"), "세트 Top 10 NM 관측일 누락을 못 잡았다");
expect(ids(run({}, (F) => { const c = F.sets["OP-13"].cards[0]; c.shown.nmStale = true; })).includes("DSP3"), "세트 Top 10 NM 흐림 누락을 못 잡았다");
expect(ids(run({ "sets/op-13.html": set.replace('class="num psaStale" title="x"', 'class="num"') })).includes("DSP3"), "세트 Top 10 PSA 10 흐림 누락을 못 잡았다");
expect(ids(run({ "sets/op-13.html": set.replace(/<tr><td>1<\/td>[\s\S]*?<\/tr>/, "") })).includes("DSP3"), "세트 Top 10 행을 못 읽었는데 통과했다");

// 5) DSP5 — 한국어
const ko = P["ko/op-13.html"];
expect(ids(run({ "ko/op-13.html": ko.replace('<li class="stale">', "<li>") })).includes("DSP5"), "한국어 PSA 10 줄 흐림 누락을 못 잡았다");
expect(ids(run({}, (F) => { F.sets["OP-13"].cards[0].nm.stale = true; })).includes("DSP5"), "한국어 인기 카드 NM 흐림 누락을 못 잡았다");

// 6) 사실 파일에 기준(staleDays)이 없으면 잡는다
expect(ids(run({}, (F) => { delete F.staleDays; })).includes("DSP1"), "staleDays 없는 사실 파일을 통과시켰다");

// ── 실제 사실 파일 — 정의가 지켜지는가(생성물 없이 커밋된 data/ 만으로 굽는다). 가드 공용(lib.facts)으로 읽는다 —
//   빌더를 직접 require 하면 audit-workflows 5번이 이 테스트를 경매 집계 소비자로 오인한다(test-guard-structural 과 같은 방식).
const F = require("./guard/lib").facts();
expect(F.staleDays && F.staleDays.nm > 0 && F.staleDays.psa10 > 0, "사실 파일 staleDays(nm·psa10)가 없다");
let cps = 0, carried = 0;
for (const code of Object.keys(F.sets)) for (const c of F.sets[code].cards || []) {
  const w = `${code} ${c.number} ${c.name}`;
  expect(c.nm.stale === !!(c.nm.usable && !c.nm.fresh), `${w}: nm.stale ≠ (usable && !fresh)`);
  expect(c.shown.nmDate === (c.shown.nmSrc === "jp" ? c.nm.date : null), `${w}: shown.nmDate ≠ NM 관측일`);
  expect(c.shown.nmStale === (c.shown.nmSrc === "jp" && c.nm.stale), `${w}: shown.nmStale ≠ nm.stale`);
  for (const p of c.checkpoints || []) {
    cps++;
    const wantNm = p.nm != null && c.nm.date && p.d > c.nm.date ? c.nm.date : null;
    expect(p.nmAsOf === wantNm, `${w} ${p.d}: nmAsOf ${p.nmAsOf} ≠ ${wantNm}(NM 관측일 뒤의 점만 이월)`);
    expect(p.psaAsOf == null || (p.psa != null && p.d > p.psaAsOf), `${w} ${p.d}: psaAsOf ${p.psaAsOf} 가 그 날짜 이후이거나 값이 없다`);
    if (p.nmAsOf || p.psaAsOf) carried++;
  }
}

if (fails.length) { console.log(JSON.stringify({ test: "FAIL", fails: fails.slice(0, 30), more: Math.max(0, fails.length - 30) }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ test: "OK", cases: 21, checkpoints: cps, carriedCheckpoints: carried }));
