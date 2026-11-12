"use strict";
// opbox-ai-data.json 확장 섹션 — 2026-09-08. 답변 AI(ChatGPT·Perplexity·Google AI)가 우리 데이터로 답하게
// 세트 박스 시세·Top 7 외에 (1) 원피스 경매 낙찰 통계 (2) TCG 13종 경매 통계 (3) 세트별 등급 인구(PSA·CGC·TAG)
// (4) 카드 페이지 전체(108장) 색인을 한 파일에 싣는다. 값은 전부 우리 원장에서 그대로 옮기고, 없는 값은 null 이다.
//
// 규칙: 추정 금지 · 라벨 보존(sold/ask/NM/PSA) · 날짜 동반 · 내부 필드(검색어·매물 id·판매자) 비공개.
// 2026-10-15: 카드 페이지 블록(buildCardPages)은 사실 파일(data/derived/site-facts.json — cardPages 색인 + cards[i].ai)에서 조립한다.
//   등급 인구(buildGrading)·경매(buildAuctions·buildTcgAuctions)는 원장 시계열을 그대로 옮기는 순수 함수로 남긴다 — 사실 빌더가 데이터 기준일을
//   셀 때와 generate-ai-extras 가 파일을 쓸 때 같은 함수를 부른다. 이 파일은 build-site-facts 를 require 하지 않는다(순환 방지).
const fs = require("node:fs");
const path = require("node:path");
const { SITE, isDate, isPositive } = require("./market-data-normalizers");

const ROOT = path.resolve(__dirname, "..");
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return null; } };
const num = (v) => (Number.isFinite(v) ? v : null);
const pct = (sold, ended, min) => (Number.isFinite(sold) && Number.isFinite(ended) && ended >= min ? Math.round((sold / ended) * 1000) / 10 : null);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Reads every auxiliary ledger the extended sections need. Missing files yield null sections, never invented ones. */
function loadExtraSources() {
  return {
    auctionSeries: readJson("data/auction-series.json"),
    tcgSeries: readJson("data/tcg-series.json"),
    setAuctionStats: readJson("data/set-auction-stats.json"),
    gradingSeries: readJson("data/grading-series.json"),
    cardMap: readJson("cards/card-map.json"),
  };
}

function catBlock(byCat) {
  const out = {};
  for (const [cat, v] of Object.entries(byCat || {})) {
    out[cat] = { ended: num(v.ended), sold: num(v.sold), sellThroughPct: pct(v.sold, v.ended, 20), amountUsd: num(v.amount) };
  }
  return out;
}

/** One Piece auctions settled after close: last 30 days, last 8 weeks, and 30-day totals per set. */
// releaseFacts = ai-data-model buildReleaseFacts() — 세트별 행을 발매된 세트로 거르는 데 쓴다(아래).
function buildAuctions(series, setStats, releaseFacts) {
  if (!series || !Array.isArray(series.daily)) return null;
  const daily = series.daily.slice(-30).map((d) => ({
    date: d.d,
    partialDay: !!d.partial,
    ended: num(d.ended), sold: num(d.sold), unsold: num(d.unsold),
    sellThroughPct: num(d.sellThrough),
    amountUsd: num(d.amount),
    byCategory: catBlock(d.byCat),
    byPrinting: catBlock(d.byEd),
  }));
  const weekly = (series.weekly || []).slice(-8).map((w) => ({
    weekStart: w.d, days: num(w.days), partialDays: num(w.partialDays),
    ended: num(w.ended), sold: num(w.sold), sellThroughPct: num(w.sellThrough), amountUsd: num(w.amount),
    byCategory: catBlock(w.byCat),
  }));
  const bySet = [];
  // 인용 주소는 실제로 있는 페이지만 — 2026-10-14 QA: sets/eb-04.html·sets/st-01.html 등 49개가 404 였다.
  //   세트 페이지 → 없으면 공식 카드리스트 페이지(EB-04) → 없으면 경매 페이지(스타트 덱 등). 파일 존재가 기준.
  const pageFor = (code) => {
    const slug = code.toLowerCase();
    for (const rel of [`sets/${slug}.html`, `sets/${slug}-card-list.html`]) if (fs.existsSync(path.join(ROOT, rel))) return `${SITE}/${rel}`;
    return `${SITE}/auction.html`;
  };
  // 싣는 세트 = 경매 페이지 세트 표(auction-page-model)와 같은 행 — 2026-10-15 QA. 종전엔 set-auction-stats 의 코드 72개를 전부 실어
  // 제목 파싱이 만든 없는 코드 12개(OP-22·OP-53·EB-09·PRB-06 …)와 발매 전 OP-18(낙찰 2건 $18)이 AI 피드·llms-full 에 세트로 나갔다.
  //   · 종료 건수가 경매 페이지 기준(window.minDecided, 30) 이상
  //   · OP/EB/PRB 는 반다이 공식 사실(releaseFacts — set-facts·공식 카드리스트)에 있고 일본 발매일이 집계 창 끝(to) 이전인 세트만 —
  //     발매 전 세트(OP-18·EB-05)의 낙찰 건수·금액은 싣지 않는다. ST(스타트 덱)는 목록 원천이 따로 없어 경매 페이지 기준만 본다.
  const minEnded = Number(setStats?.window?.minDecided) || 30;
  const windowEnd = setStats?.window?.to || null;
  const jpRelease = new Map((releaseFacts || []).map((r) => [r.setCode, r.japanese.releaseDate || r.english.releaseDate]));
  const released = (code) => /^ST-\d{2}$/.test(code) || (isDate(jpRelease.get(code)) && isDate(windowEnd) && jpRelease.get(code) <= windowEnd);
  for (const [code, s] of Object.entries(setStats?.sets || {})) {
    if (!(Number(s.ended) >= minEnded && released(code))) continue;
    bySet.push({
      setCode: code, canonicalUrl: pageFor(code),
      ended: num(s.ended), sold: num(s.sold), sellThroughPct: num(s.sellThrough),
      amountUsd: num(s.amount), medianWinningBidUsd: num(s.medPrice), medianBidders: num(s.medBidders),
      thinSample: !!s.thin,
      byCategory: Object.fromEntries(Object.entries(s.byCat || {}).map(([cat, v]) => [cat, { ended: num(v.ended), sold: num(v.sold), sellThroughPct: num(v.sellThrough) }])),
      // 판본(일본판/영문판)별 — 제목으로 판을 못 가린 건은 어느 쪽에도 없다. 영문판 페이지가 같은 숫자를 보여준다.
      byPrinting: Object.fromEntries(Object.entries(s.byEd || {}).map(([ed, v]) => [ed === "jp" ? "japanese" : "english", {
        ended: num(v.ended), sold: num(v.sold), sellThroughPct: num(v.sellThrough), medianWinningBidUsd: num(v.medPrice),
        byCategory: Object.fromEntries(Object.entries(v.byCat || {}).map(([cat, c]) => [cat, { ended: num(c.ended), sold: num(c.sold), sellThroughPct: num(c.sellThrough) }])),
      }])),
    });
  }
  return {
    basis: series.basis || null,
    definitions: {
      sellThroughPct: "sold ÷ ended among auctions re-read after they closed; null when the sample is below the minimum",
      amountUsd: "sum of winning bids in USD for auctions that sold",
      partialDay: "true when part of that day's auctions could not be read back (a gap, not zero activity)",
      byCategory: "box = sealed booster boxes, graded = PSA/CGC/TAG slabs, raw = ungraded singles, pack = booster packs, lot = multi-card lots",
      byPrinting: "jp = Japanese, en = English, other = unidentified or other languages; per set, byPrinting.japanese / byPrinting.english split that set's auctions and leave unidentified printings out",
      bySet: "sets with at least minEnded ended auctions in the window (the canonical page's set-table minimum); OP/EB/PRB sets only when their Japanese release date is on or before the window end",
    },
    canonicalPage: `${SITE}/auction.html`,
    daily, weekly,
    bySet: { windowDays: num(setStats?.window?.days), from: setStats?.window?.from || null, to: windowEnd, observedOn: setStats?.updated || null, minEnded, sets: bySet },
  };
}

/** Thirteen trading card games: settled-auction sell-through and winning-bid medians, last 14 days. */
function buildTcgAuctions(series) {
  if (!series || !Array.isArray(series.daily)) return null;
  const games = Object.entries(series.games || {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([key, g]) => ({ key, name: g.name || key }));
  // offHour — 그날 표본을 표준 시각 밖에서 골랐다는 표시(build-tcg-series). 페이지는 그날 표본을 비교에서 뺀다.
  // 표시 없이 내보내면 10/8~10/10 의 낮은 낙찰률(12.3·20.7·22.9%)이 평범한 날처럼 읽힌다(2026-10-13 QA).
  const daily = series.daily.slice(-14).map((d) => ({
    date: d.d,
    offHour: d.offHour === true,
    games: Object.fromEntries(Object.entries(d.games || {}).map(([k, g]) => [k, {
      ended: num(g.ended), sold: num(g.sold), sellThroughPct: num(g.sellThrough),
      medianWinningBidUsd: num(g.medPrice), priceSample: num(g.priceN), amountUsd: num(g.amount),
      liveAuctions: num(g.live), endingWithin24h: num(g.endingToday), bidRatePct: num(g.bidRate),
    }])),
  }));
  return {
    basis: series.basis || null,
    definitions: {
      // ended·sold·sellThroughPct·amountUsd·medianWinningBidUsd 는 표본만이다(build-tcg-series, 2026-10-14) — 남는 쿼터로
      // 다른 시각에 더 읽은 여유분(extra)은 섞지 않는다. 종전엔 섞인 값이 여기로 그대로 나갔다.
      // 표본에 들었는데 이미 여유분으로 감시 중이던 매물은 표본으로 센다(2026-10-14 QA) — 10/15 전은 감시 이력에서 하한으로 복원.
      ended: "auctions from the daily sample (those ending soonest when that day's snapshot was taken, including ones already being read as extras at that moment -- restored from watch-list history as a lower bound before 2026-10-15) that closed and were re-read -- a sample, not every auction on eBay; other extra auctions read with leftover quota at other hours are not included",
      sellThroughPct: `sold ÷ ended; null when ended is below ${series.minRateSample ?? 20}`,
      liveAuctions: "eBay's own count of running auctions for that game at snapshot time — a real count, not a sample",
      endingWithin24h: "eBay's own count of auctions closing within 24 hours at snapshot time",
      medianWinningBidUsd: "median winning bid among the sold auctions in the sample",
      offHour: "true when that day's sample was picked outside the usual snapshot hour; its sell-through runs low, so the canonical page leaves that day's sample out of week-on-week comparisons",
    },
    canonicalPage: `${SITE}/tcg-auction.html`,
    games, daily,
  };
}

function latestPoint(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const p = arr[arr.length - 1];
  const total = num(p.total);
  const gem = num(p.gem);
  return { observedOn: p.d || null, total, gem10: gem, gemRatePct: total && gem != null ? Math.round((gem / total) * 1000) / 10 : null, addedSinceLastPoint: num(p.add) };
}

/** Per-set graded population: PSA, CGC and TAG kept separate; Japanese and English never summed. */
// PSA 총량은 페이지가 보여주는 것과 **같은 값**(packs 의 psaFull / psaFullEn, GemRate 전체집계)을 쓴다 — 2026-09-10 감사:
// 종전엔 주간 추이 원장(grading-series)의 마지막 점(9/2)을 실어 페이지(9/5, 58,473)와 AI 파일(58,130)이 서로 달랐다.
// CGC·TAG 는 추이 원장이 유일한 출처라 그대로 둔다. psaFull 이 없으면 추이 원장으로 떨어진다.
// addedSinceLastPoint(wowAdd)는 판별 주간 원장의 마지막 두 수요일 차라 총량 날짜(observedOn)와 기간이 다르다 —
// 그 기간을 addedFrom·addedTo 로 같이 싣는다(총량을 팝 리포트로 최신화한 주엔 열흘 넘게 벌어진다, 2026-11-12).
function psaFromPacks(pf, wow) {
  if (!pf || !Number.isFinite(pf.total)) return null;
  const gem = Number.isFinite(pf.gems) ? pf.gems : null;
  return {
    observedOn: pf.updated || null,
    total: pf.total,
    gem10: gem,
    gemRatePct: Number.isFinite(pf.gemRate) ? pf.gemRate : (gem != null && pf.total ? Math.round((gem / pf.total) * 1000) / 10 : null),
    addedSinceLastPoint: Number.isFinite(pf.wowAdd) ? pf.wowAdd : null,
    addedFrom: Number.isFinite(pf.wowAdd) ? (wow?.from || null) : null,
    addedTo: Number.isFinite(pf.wowAdd) ? (wow?.to || null) : null,
  };
}

function buildGrading(series, packs) {
  if (!series?.sets) return null;
  const sets = [];
  for (const [code, eds] of Object.entries(series.sets)) {
    const set = packs?.sets?.[code] || {};
    const edition = (ed, pf) => {
      if (!ed && !pf) return null;
      const fromSeries = ed ? (Array.isArray(ed.psa) ? latestPoint(ed.psa) : (ed.psaLatest ? latestPoint([ed.psaLatest]) : null)) : null;
      const psa = psaFromPacks(pf, set.psaWow) || fromSeries;
      return { psa, cgc: ed ? latestPoint(ed.cgc) : null, tag: ed ? latestPoint(ed.tag) : null };
    };
    sets.push({ setCode: code, canonicalUrl: `${SITE}/psa-grading.html`, japanese: edition(eds.jp, set.psaFull), english: edition(eds.en, set.psaFullEn) });
  }
  return {
    basis: series.basis || series.note || "weekly graded-population counts per set and printing",
    definitions: {
      total: "graded copies the grader reports for that set and printing on observedOn",
      gem10: "PSA 10 / CGC 10 (Pristine + Gem Mint) / TAG 10 + 10 Pristine counts; graders define 10 differently, so never add them across graders",
      gemRatePct: "gem10 ÷ total × 100",
    },
    observedOn: series.updated || null,
    sets,
  };
}

/** Every published card price page, with the same numbers the page shows. */
// 색인(같은 카드가 두 세트에 있으면 번호가 그 세트 것인 쪽)은 사실 빌더(cardPageIndex → facts.cardPages). PSA 10 sold 는 원장 통화 그대로 + 관측일
// 환율의 USD 환산 병기(market-data-normalizers.withUsd → cards[i].ai.psa10SoldUsd) — 답변 AI 가 KRW 를 달러로 읽는 사고(2026-09-08)를 막는다.
function buildCardPages(facts) {
  if (!facts || !facts.cardPages) return null;
  const pages = facts.cardPages.map(({ code, i, file }) => {
    const card = facts.sets[code].cards[i];
    return {
      // 레어도 = 공식 카드 리스트의 그 인쇄 레어도(card-list-shared.rarityCode — 세트·카드 상세와 같은 코드, 2026-10-15).
      cardNumber: card.number, name: card.name || null, rarity: card.rarity || null,
      containerSetCode: code,
      url: `${SITE}/cards/${file}`,
      exactVariantRequired: true,
      rawNmAsk: card.ai.rawNmAsk,
      psa10Sold: card.ai.psa10SoldUsd,
      psaPopulation: card.ai.psaPopulation,
    };
  });
  pages.sort((a, b) => (b.rawNmAsk?.usdEquivalent || 0) - (a.rawNmAsk?.usdEquivalent || 0));
  return {
    note: "One page per tracked card variant. Numbers match the page; rawNmAsk is a Japanese retail asking price, psa10Sold a verified eBay sold median.",
    canonicalPage: `${SITE}/cards/`,
    count: pages.length,
    pages,
  };
}

module.exports = { loadExtraSources, buildAuctions, buildTcgAuctions, buildGrading, buildCardPages, norm, isDate, isPositive };
