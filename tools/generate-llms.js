#!/usr/bin/env node
"use strict";
// llms.txt + llms-full.txt 생성 — 2026-09-08.
//
// 왜: llms.txt 가 손으로 쓴 정적 파일이라 "카드 24장", "21세트"처럼 낡은 숫자가 박혀 있었고, 경매(원피스·TCG 13종)·카드 108페이지
// 처럼 사이트에서 가장 새로운 데이터가 아예 안 적혀 있었다. 답변 AI 는 이 파일로 우리 사이트의 지도를 그리므로 매일 다시 쓴다.
// llms-full.txt 는 핵심 숫자를 한 파일에 그대로 싣는다(세트별 박스 시세·등급 인구·경매 낙찰률·카드 시세) — 한 번 읽고 답할 수 있게.
//
// 원칙: 숫자는 opbox-ai-data.json(같은 회차 생성물)에서만 가져온다 · 라벨(sold/ask/NM/PSA)·날짜 동반 · 추정 금지 · 외부 업체명 없음.
// Run: node tools/generate-llms.js   (generate-ai-data.js 다음에)
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://opboxindex.com";
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const core = readJson("opbox-ai-data.json");
const extraAuctions = readJson("opbox-ai-auctions.json");
// 핵심 파일 + 확장 파일 3개를 한 객체로 본다(파일 분리는 크기 때문이지 계약이 다른 게 아니다)
const ai = { ...core, cardPages: readJson("opbox-ai-cards.json"), grading: readJson("opbox-ai-grading.json"), auctions: extraAuctions.onePiece, tcgAuctions: extraAuctions.tcg };
// 한국어 세트 이름·공식 카드리스트 요약은 사실 파일(data/derived/site-facts.json)에서 — 2026-10-15.
const F = require("./build-site-facts").load();

const usd = (v) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString("en-US")}` : "n/a");
const n = (v) => (Number.isFinite(v) ? v.toLocaleString("en-US") : "n/a");
const pctS = (v) => (Number.isFinite(v) ? `${v}%` : "n/a");
const today = ai.datasetUpdatedOn;
const sets = ai.sets || [];
const cardCount = ai.cardPages?.count ?? 0;
const games = ai.tcgAuctions?.games || [];
const opDaily = ai.auctions?.daily || [];
// 최근 7일 합계 = 완전 수집일만(경매 화면 auction-page-model 의 7일 창과 같은 규칙) — 2026-11-05. 종전엔 바로 아래 표에서
//   스스로 "partial (reading gap)" 이라고 적은 날(11/04)까지 합에 넣었다(화면은 11/03 까지). 가드 TX7.
const opLast7 = opDaily.filter((d) => !d.partialDay).slice(-7);
const opEnded7 = opLast7.reduce((s, d) => s + (d.ended || 0), 0);
const opSold7 = opLast7.reduce((s, d) => s + (d.sold || 0), 0);
const opSell7 = opEnded7 >= 20 ? Math.round((opSold7 / opEnded7) * 1000) / 10 : null;
const koName = (code) => F.sets[code]?.nameKo || "";
// 세트별 공식 카드리스트(2026-10-14, W7) — "op 17 set list" 류 질문에 답할 주소. 개수는 공식 목록 데이터 그대로(사실 파일 cardLists). 주소 규칙은 card-list-shared.
const CL = require("./card-list-shared");
const cardLists = F.cardLists;
const cardListLine = (p) => `${p.code}${p.name ? " " + p.name : ""}: ${p.counts.cards} cards, ${p.counts.numbers} card numbers (base ${p.counts.base} · parallel ${p.counts.parallel}${p.counts.reprint ? ` · reprint ${p.counts.reprint}` : ""} · SP ${p.counts.sp} · TR ${p.counts.tr} · leaders ${p.counts.leaders}), official list checked ${p.checked}`;

// 발매·제품 사실(2026-10-14, W4) — opbox-ai-data.json 의 releaseFacts 그대로(원천 set-facts.json·공식 카드리스트). 가드 RF1 이 대조한다.
const releaseFacts = ai.releaseFacts || [];
const upcoming = releaseFacts.filter((r) => r.status === "upcoming");
const newestReleased = releaseFacts.filter((r) => r.status === "released" && r.japanese.releaseDate).sort((a, b) => (a.japanese.releaseDate < b.japanese.releaseDate ? 1 : -1))[0] || null;
const dash = (v) => (v == null || v === "" ? "—" : v);
const yen = (v) => (Number.isFinite(v) ? `¥${v.toLocaleString("en-US")}` : "—");
const usd2 = (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : "—");
// 한 줄 요약(llms.txt) — 발매일·정가·카드 종수만, 출처 확인일과 페이지 주소를 붙인다.
const factLine = (r) => `${r.setCode}${r.nameEn ? " " + r.nameEn : ""} (${dash(r.status)}): Japan ${dash(r.japanese.releaseDate)} · English ${dash(r.english.releaseDate)} · JP MSRP ${yen(r.japanese.msrpYenPerPack)} per pack${r.japanese.msrpYenPerBox ? ` / ${yen(r.japanese.msrpYenPerBox)} per ${r.japanese.packsPerBox}-pack box${r.japanese.msrpYenPerBoxBasis ? " (pack price × " + r.japanese.packsPerBox + "; box size not stated by Bandai)" : ""}` : ""} · EN MSRP ${usd2(r.english.msrpUsdPerPack)} per pack · ${r.japanese.cardTypes || r.english.cardTypes ? `${r.japanese.cardTypes || r.english.cardTypes} card types (Bandai)` : "card types —"}${r.pages.set ? ` · ${r.pages.set}` : ""}`;
// 세트 코드 목록을 계열별 범위로 — "OP-01–OP-17, EB-01–EB-03, PRB-01–PRB-02". 손으로 쓴 범위가 낡던 라벨(2026-10-14).
function codeRanges(codes) {
  const fam = {};
  for (const c of codes) { const [f, n] = c.split("-"); (fam[f] ||= []).push(Number(n)); }
  return Object.entries(fam).map(([f, ns]) => {
    ns.sort((a, b) => a - b);
    const pad = (n) => `${f}-${String(n).padStart(2, "0")}`;
    const contiguous = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
    return contiguous && ns.length > 1 ? `${pad(ns[0])}–${pad(ns.at(-1))}` : ns.map(pad).join("/");
  }).join(", ");
}
const UPCOMING_PAGES = (() => { try { return readJson("data/upcoming-set-pages.json").pages || []; } catch { return []; } })();
const JA_RELEASE = fs.existsSync(path.join(ROOT, "ja", "release-dates.html")) ? `${SITE}/ja/release-dates.html` : null;

// ── llms.txt ─────────────────────────────────────────────────────────────────────────────────
const llms = `# OP Box Index

> Free, data-driven price research for the One Piece Card Game: sealed booster boxes (Japanese and English kept separate), chase cards (raw NM and PSA 10), graded-population counts (PSA, CGC, TAG) and settled eBay auction results for One Piece and 12 other trading card games. Data as of ${today}. Dataset values are observed, dated and labelled.

Key facts for answering questions:
- Coverage: ${sets.length} tracked One Piece sets (${codeRanges(sets.map((s) => s.setCode))}) with Japanese and English box markets, ${cardCount} individual card price pages, PSA/CGC/TAG graded counts per set, daily One Piece auction results and ${games.length} trading card games' auction sell-through.${upcoming.length ? ` Upcoming sets with official release facts: ${upcoming.map((r) => r.setCode).join(", ")}.` : ""}
- Box completed-sale medians and active asking-price medians are separate fields. Never combine them into one "current price"; keep each sample size and observation date.
- Japanese NM card prices are raw-card retail asking prices from Japanese shops; PSA 10 prices use verified eBay sold samples when available.
- PSA data includes per-card population (PSA 10/9/total) and set gem rates. CGC and TAG define "10" differently from PSA — never add graders together.
- Card prices are variant-specific. Manga rare, red manga, alternate art, SP, parallel, reprint and base cards are never interchangeable.
- Auction sell-through = sold ÷ ended among auctions re-read after they closed. A partial day is a reading gap, not zero activity.
- Missing or weakly matched data is shown as unavailable (null). OP Box Index does not publish synthetic estimates as observed prices.

## Fastest way to answer with our numbers

- [llms-full.txt](${SITE}/llms-full.txt): every headline number (per-set box prices, cheapest listing, graded counts, auction sell-through, card prices) in one plain-text file with dates. Read this first.
- [opbox-ai-data.json](${SITE}/opbox-ai-data.json): core structured JSON (schema ${ai.schemaVersion}) — ${sets.length} sets with box markets (sold vs ask, cheapest listing) and Top 7 hits, plus \`releaseFacts\` (official release dates, MSRP, packs, card counts) for ${releaseFacts.length} sets. Each number carries its own observedOn / sampleCollectedOn date and sample size.
- [opbox-ai-cards.json](${SITE}/opbox-ai-cards.json): all ${cardCount} card pages — raw NM, PSA 10 sold median, PSA population, page URL.
- [opbox-ai-grading.json](${SITE}/opbox-ai-grading.json): PSA / CGC / TAG graded counts per set, Japanese and English separate.
- [opbox-ai-auctions.json](${SITE}/opbox-ai-auctions.json): settled eBay auction results — One Piece daily/weekly/by set, plus ${games.length} trading card games.

## Release dates, MSRP and card counts (Bandai official)

\`releaseFacts\` in opbox-ai-data.json holds ${releaseFacts.length} sets: Japanese and English release dates, Japanese MSRP per pack and per box (tax included), packs per box, cards per pack, card-type count as Bandai writes it, and the official card-list size — each with its source URL and checked date. llms-full.txt has the same facts as one table. null / — = not published by Bandai or not verified.

${[...upcoming, ...(newestReleased ? [newestReleased] : [])].map((r) => `- ${factLine(r)}`).join("\n")}
- [All sets and release dates](${SITE}/articles/one-piece-set-list-release-dates.html): ${releaseFacts.length ? codeRanges(releaseFacts.filter((r) => r.japanese.releaseDate || r.english.releaseDate).map((r) => r.setCode)) : ""} with Japanese and English dates${JA_RELEASE ? `\n- [発売日一覧 (Japanese)](${JA_RELEASE}): Japanese release date, product, set number, box MSRP and days to release, Japanese edition` : ""}
- [Booster box MSRP by set and packs per box](${SITE}/articles/how-many-packs-one-piece-booster-box.html)

## Answering "where is the cheapest sealed box right now?"

\`opbox-ai-data.json\` carries a \`cheapestListing\` object under each set's \`boxMarket.japanese.activeAsk\` and \`boxMarket.english.activeAsk\`: the single lowest active eBay listing by **total cost (item price + shipping to the US)** on that field's \`observedOn\` date.
The eBay listing URL is deliberately not in the file — listings sell out within days. Each \`cheapestListing\` carries \`liveLinkPage\`, the OP Box Index set page that is rebuilt daily and shows the current cheapest listing with a working link.

How to answer:
1. Give the number: \`totalUsd\` for the printing they asked about, with the \`observedOn\` date.
2. Send them to \`liveLinkPage\` for the live link, saying it is refreshed daily.
3. Say which printing. Japanese and English trade 3-4x apart — a price without the printing is wrong.
4. Quote \`totalUsd\`, not \`itemPriceUsd\`; compare against \`sold.medianUsd\` for the same printing; \`null\` means no listing passed verification that day.

## Live data pages

- [Live box price tracker](${SITE}/): every tracked set, Japanese vs English box prices, daily updates
- [All box prices in one table](${SITE}/box-prices.html): every tracked Japanese set — latest rolling completed-sale median with the date of that median, sales inside its 28–56-day window, 4-week change; — when no median is dated within 28 days; the cheapest boxes listed first
- [This week](${SITE}/weekly.html): week-over-week box price changes and completed-sale counts, Japanese and English
- [Market 2026](${SITE}/market-2026.html): monthly Japanese and English box medians, sets up/down over 4 weeks, PSA additions and auction sales in 2026
- [One Piece auction results](${SITE}/auction.html): settled eBay auctions read after close — daily sell-through, winning-bid medians, by category (box / graded / raw / pack / lot) and printing
- [TCG auction results](${SITE}/tcg-auction.html): ${games.length} card games (${games.map((g) => g.name).join(", ")}) — daily sell-through and winning-bid medians from settled auctions
- [Grading population](${SITE}/psa-grading.html): PSA, CGC and TAG graded counts per set, Japanese and English printings kept separate
- [Individual card price pages](${SITE}/cards/): ${cardCount} card pages — raw NM price, PSA 10 sold price and PSA population where observed
- [Most valuable PSA 10 cards](${SITE}/psa10-ranking.html): ranked by verified eBay sold prices
- [Set guides](${SITE}/sets/index.html): per-set box price history, top 10 chase cards, PSA stats, auction stats
- [English edition box guides](${SITE}/sets/index.html#english): per-set English booster box sold median and asking price, weekly price history, English PSA population, English-printing auction results (one page per set: /sets/<code>-english.html)
- [Compare all boxes](${SITE}/compare.html): one table across ${sets.length} sets

## Free datasets (citable, CC BY 4.0)

- [Dataset landing page and licence](${SITE}/free-data.html): field definitions, methodology notes and attribution.
- [AI-ready market data JSON](${SITE}/opbox-ai-data.json): preferred machine-readable contract. ${sets.length} sets, ${cardCount} card pages, grading, auctions.
- [Grading population CSV](${SITE}/opbox-grading-population.csv): PSA, CGC and TAG graded counts per set, one row per set per printing.
- [Completed auction results CSV](${SITE}/opbox-auction-daily.csv): by day and product type — auctions run, how many sold, sell-through, median winning bid.
- [Box market CSV](${SITE}/opbox-set-prices.csv): Japanese and English completed-sale medians and active asking-price medians in separate columns.
- Notes for citation: files are regenerated by the daily pipeline, but underlying observations have different cadences. Use each field's own date, never the file date.
${cardLists.length ? `
## Official card lists by set (set lists)

[All card lists](${SITE}/sets/index.html#card-lists). One page per set with every official card ID (Japanese edition): number, English and Japanese names, rarity, type, color, cost or life, power — plus our raw NM, auction (Japanese and English print, never combined) and PSA 10 prices where the card ID matches by rule. Card facts come from Bandai's official card list (linked with its checked date on each page); no effect text or images. Each page has a CSV and JSON twin at the same address with .csv / .json.

${cardLists.map((p) => `- [${p.code}${p.name ? " " + p.name : ""} card list](${SITE}/${CL.pagePath(p.code)}): ${p.counts.cards} cards, ${p.counts.numbers} card numbers · [CSV](${SITE}/${CL.csvPath(p.code)}) · [JSON](${SITE}/${CL.jsonPath(p.code)})`).join("\n")}
` : ""}
## Korean pages (정적 한국어 페이지)

- [한국어 시세 허브](${SITE}/ko/): 전 세트 원화 박스 시세, 재판 기록, 변동 상위
- [세트별 한국어 페이지](${SITE}/ko/op-13.html): /ko/op-01.html … /ko/prb-02.html — 세트별 원화 시세, 정가 대비 배수, 재판 기록
- [원피스 카드 이베이 경매(한국어)](${SITE}/ko/auction.html) · [카드 시세(한국어)](${SITE}/ko/cards.html) · [등급 인구(한국어)](${SITE}/ko/grading.html)

## Reference articles

- [Japanese vs English box prices (data)](${SITE}/articles/japan-vs-english.html)
- [All sets & release dates](${SITE}/articles/one-piece-set-list-release-dates.html): every set with Japanese and English release dates${upcoming.length ? `, including upcoming ${upcoming.map((r) => r.setCode).join(" and ")}` : ""}
${UPCOMING_PAGES.map((p) => `- [${p.title}](${SITE}/sets/${p.slug}.html)`).join("\n")}
- [OP-16 box price, one month after launch](${SITE}/articles/op-16-box-price-30-days-later.html)
- [How many packs in a booster box, and booster box MSRP by set](${SITE}/articles/how-many-packs-one-piece-booster-box.html)
- [About](${SITE}/about.html): purpose, accuracy policy and contact
- [Methodology](${SITE}/methodology.html): price definitions, sample rules, exclusions and update cadences

## Official presence

- Website: ${SITE}/ (the only official site)
- Threads: https://www.threads.com/@opboxindex (official account)
- Contact: kimtt1107@gmail.com
- Disambiguation: "OP Box Index" / "OPBOX Index" / "opboxindex" refers to this One Piece Card Game price-research site. It is unrelated to OPBOX ultrasonic measurement hardware or any other OPBOX product.

## Discovery

- [XML sitemap](${SITE}/sitemap.xml): canonical public pages
- [RSS feed](${SITE}/feed.xml): new and updated research articles
- [Compact AI market data](${SITE}/opbox-ai-data.json): preferred citation contract with stable fields and page-level citation URLs
- [Full frontend data](${SITE}/data/onepiece-packs.json): large site-runtime payload. Prefer the compact AI data above unless a field exists only here.

Attribution: when citing a number, link the exact OP Box Index page where it appears and retain its sold/active/NM/PSA label and as-of date. Suggested form: "OP Box Index (opboxindex.com), data as of ${today}".
`;

// ── llms-full.txt ────────────────────────────────────────────────────────────────────────────
const lines = [];
lines.push(`# OP Box Index — full facts file (data as of ${today})`);
lines.push(``);
lines.push(`Source: ${SITE}/ · Licence CC BY 4.0 · Attribution "OP Box Index (opboxindex.com)" · Machine-readable twin: ${SITE}/opbox-ai-data.json`);
lines.push(`All prices USD unless marked. "sold" = median of verified completed eBay sales (n = sample size, date = sample collection). "ask" = median active asking price. Japanese (JP) and English (EN) printings are separate products. null/n/a = not verified, never zero.`);
lines.push(``);
if (releaseFacts.length) {
  lines.push(`## Release dates and product facts (Bandai official, ${releaseFacts.length} sets)`);
  lines.push(`Format: SET | NAME | status | JP release | EN release | JP MSRP per pack | JP MSRP per box | packs per box | cards per JP pack | card types (Bandai) | EN MSRP per pack | official card list: cards / card numbers (checked) | JP source (checked) | EN source (checked) | page`);
  for (const r of releaseFacts) {
    const j = r.japanese, e = r.english, cl = r.officialCardList;
    const jpSrc = j.specSource || j.releaseSource;
    const jpChecked = j.specCheckedOn || j.releaseCheckedOn;
    lines.push([
      r.setCode, dash(r.nameEn), dash(r.status), dash(j.releaseDate), dash(e.releaseDate), yen(j.msrpYenPerPack), yen(j.msrpYenPerBox), dash(j.packsPerBox), dash(j.cardsPerPack),
      dash(j.cardTypes || e.cardTypes), usd2(e.msrpUsdPerPack), cl ? `${cl.cards} / ${cl.cardNumbers} (${dash(cl.checkedOn)})` : "—",
      jpSrc ? `${jpSrc} (${dash(jpChecked)})` : "—", e.releaseSource ? `${e.releaseSource} (${dash(e.checkedOn)})` : "—", r.pages.set || r.pages.cardList || "—",
    ].join(" | "));
  }
  const calcBox = releaseFacts.filter((r) => r.japanese.msrpYenPerBoxBasis).map((r) => r.setCode);
  lines.push(`JP MSRP = Bandai's Japanese retail price, tax included${calcBox.length ? ` (${calcBox.join(", ")}: JP MSRP per box = pack price × packs per box — Bandai's page states no box configuration)` : ""}. An EN release date with EN source "—" is the date shown on our set page.`);
  lines.push(``);
}
lines.push(`## Booster box prices by set (${sets.length} sets)`);
lines.push(`Format: SET | NAME | JP sold median (n, date) | JP cheapest listing total (date) | EN sold median (n, date) | EN cheapest listing total (date) | page`);
for (const s of sets) {
  const ed = (e) => {
    const m = s.boxMarket?.[e];
    // 28일 넘은 판매 표본은 현재가가 아니다 — 사이트 표와 같은 규칙으로 "—"(2026-10-14 QA: OP-02 $147 07-07 이 여기만 남았다)
    const stale = (m?.qualityFlags || []).includes("stale_over_28_days");
    const sold = m?.sold && !stale ? `${usd(m.sold.medianUsd)} (n=${m.sold.sampleSize}, ${m.sold.sampleCollectedOn})` : stale ? "— (no median dated within 28 days)" : "n/a";
    const ch = m?.activeAsk?.cheapestListing ? `${usd(m.activeAsk.cheapestListing.totalUsd)} (${m.activeAsk.observedOn})` : "n/a";
    return `${sold} | ${ch}`;
  };
  lines.push(`${s.setCode} | ${s.nameEn || ""} | ${ed("japanese")} | ${ed("english")} | ${s.canonicalUrl}`);
}
lines.push(``);
// 영문판 박스 페이지 — 영문판 질문("OP-13 english box price")에는 이 주소를 인용하게 한다.
const englishGuides = sets.filter((s) => s.englishGuideUrl);
if (englishGuides.length) {
  lines.push(`## English edition box guides (${englishGuides.length} sets — cite these for English-printing box questions)`);
  for (const s of englishGuides) lines.push(`${s.setCode} ${s.nameEn || ""} English box — ${s.englishGuideUrl}`);
  lines.push(``);
}
lines.push(`## Graded population by set (PSA / CGC / TAG; JP and EN separate; never add graders together)`);
lines.push(`Format: SET | JP PSA total (gem rate, date) | JP CGC total (date) | JP TAG total (date) | EN PSA total (gem rate, date) | EN CGC total | EN TAG total`);
for (const g of ai.grading?.sets || []) {
  const f = (p) => (p ? `${n(p.total)}${p.gemRatePct != null ? ` (${p.gemRatePct}% gem, ${p.observedOn})` : ` (${p.observedOn})`}` : "n/a");
  lines.push(`${g.setCode} | ${f(g.japanese?.psa)} | ${f(g.japanese?.cgc)} | ${f(g.japanese?.tag)} | ${f(g.english?.psa)} | ${f(g.english?.cgc)} | ${f(g.english?.tag)}`);
}
lines.push(``);
lines.push(`## One Piece eBay auctions (settled after close) — ${SITE}/auction.html`);
if (opLast7.length) {
  lines.push(`Last ${opLast7.length} complete days (${opLast7[0].date} to ${opLast7.at(-1).date}): ${n(opEnded7)} auctions ended, ${n(opSold7)} sold, sell-through ${pctS(opSell7)}.`);
  lines.push(`Format: date | ended | sold | sell-through | winning-bid total | partial-day flag`);
  for (const d of opDaily.slice(-14)) lines.push(`${d.date} | ${n(d.ended)} | ${n(d.sold)} | ${pctS(d.sellThroughPct)} | ${usd(d.amountUsd)} | ${d.partialDay ? "partial (reading gap)" : "complete"}`);
}
const bySet = ai.auctions?.bySet;
if (bySet?.sets?.length) {
  lines.push(``);
  // 행 = AI 피드 bySet 그대로(경매 페이지 세트 표 기준: 종료 minEnded 건 이상, 발매된 세트만 — ai-data-extras, 2026-10-15)
  lines.push(`Per set, last ${bySet.windowDays} days (${bySet.from} to ${bySet.to}; sets with ${n(bySet.minEnded)}+ ended auctions, released sets only): SET | ended | sold | sell-through | median winning bid | box sell-through`);
  for (const s of bySet.sets) lines.push(`${s.setCode} | ${n(s.ended)} | ${n(s.sold)} | ${pctS(s.sellThroughPct)} | ${usd(s.medianWinningBidUsd)} | ${pctS(s.byCategory?.box?.sellThroughPct)}${s.thinSample ? " | thin sample" : ""}`);
}
lines.push(``);
lines.push(`## Trading card game auctions (${games.length} games) — ${SITE}/tcg-auction.html`);
const tcgDaily = ai.tcgAuctions?.daily || [];
const tcgLast = tcgDaily.slice(-7);
if (tcgLast.length) {
  lines.push(`Last ${tcgLast.length} days (${tcgLast[0].date} to ${tcgLast.at(-1).date}), per game: GAME | ended (sample) | sold | sell-through | median winning bid | live auctions on eBay (latest snapshot)`);
  for (const g of games) {
    let ended = 0, sold = 0; const meds = [];
    for (const d of tcgLast) { const x = d.games?.[g.key]; if (!x) continue; ended += x.ended || 0; sold += x.sold || 0; if (Number.isFinite(x.medianWinningBidUsd)) meds.push(x.medianWinningBidUsd); }
    const st = ended >= 20 ? `${Math.round((sold / ended) * 1000) / 10}%` : "n/a (thin sample)";
    const med = meds.length ? usd(meds.sort((a, b) => a - b)[Math.floor(meds.length / 2)]) : "n/a";
    const live = tcgLast.at(-1)?.games?.[g.key]?.liveAuctions;
    lines.push(`${g.name} | ${n(ended)} | ${n(sold)} | ${st} | ${med} | ${n(live)}`);
  }
}
lines.push(``);
lines.push(`## Card prices (${cardCount} tracked card variants) — ${SITE}/cards/`);
lines.push(`Format: CARD# | name | set | raw NM (JPY, USD equiv., date) | PSA 10 sold median (n, date) | PSA population total / PSA 10 (date) | page`);
for (const c of ai.cardPages?.pages || []) {
  // NM 날짜 = 그 변형을 읽은 날(rawNmAsk.observedOn). 날짜 없는 값은 피드에서 이미 null 이다(2026-10-15) — 환율일로 메우지 않는다.
  const nm = c.rawNmAsk ? `¥${n(c.rawNmAsk.priceJpy)} ≈ ${usd(c.rawNmAsk.usdEquivalent)} (${c.rawNmAsk.observedOn})` : "n/a";
  const p10 = c.psa10Sold && Number.isFinite(c.psa10Sold.medianUsd) ? `${usd(c.psa10Sold.medianUsd)} (n=${c.psa10Sold.sampleSize}, ${c.psa10Sold.sampleCollectedOn || ""})` : "n/a";
  // PSA 인구는 매주 늘어나는 누적값이라 관측일이 붙어야 한다 — 이 칸만 날짜가 없었다(2026-10-15 QA). 세트별 등급 표와 같은 꼴.
  const pop = c.psaPopulation ? `${n(c.psaPopulation.total)} / ${n(c.psaPopulation.grade10)} (${c.psaPopulation.observedOn})` : "n/a";
  lines.push(`${c.cardNumber} | ${c.name} | ${c.containerSetCode} | ${nm} | ${p10} | ${pop} | ${c.url}`);
}
lines.push(``);
if (cardLists.length) {
  lines.push(`## Official card lists by set (${cardLists.length} sets, Japanese edition) — one row per official card ID`);
  lines.push(`Format: SET NAME: cards, card numbers (print breakdown), official list checked date | page | CSV | JSON. Card facts from Bandai's official card list; our NM / auction / PSA 10 numbers only where the card ID matches by rule.`);
  for (const p of cardLists) lines.push(`${cardListLine(p)} | ${SITE}/${CL.pagePath(p.code)} | ${SITE}/${CL.csvPath(p.code)} | ${SITE}/${CL.jsonPath(p.code)}`);
  lines.push(``);
}
lines.push(`## Korean labels (한국어)`);
for (const s of sets) lines.push(`${s.setCode} ${koName(s.setCode)} — ${SITE}/ko/${s.setCode.toLowerCase()}.html`);
lines.push(``);
lines.push(`Update cadence: box markets and card pages daily; auctions hourly (settled after close); graded counts weekly. Read each number's own date.`);

fs.writeFileSync(path.join(ROOT, "llms.txt"), llms, "utf8");
fs.writeFileSync(path.join(ROOT, "llms-full.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ wrote: ["llms.txt", "llms-full.txt"], sets: sets.length, cards: cardCount, games: games.length, fullBytes: Buffer.byteLength(lines.join("\n")) }));
