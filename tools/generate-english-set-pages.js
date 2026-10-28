#!/usr/bin/env node
"use strict";
// 영문판 박스 시세 페이지 — sets/<code>-english.html (2026-09-08 신설).
//
// ── 왜 따로 만드나
// 일본판 세트 페이지(sets/op-13.html)는 제목·본문·구조화데이터가 전부 "Japanese" 로 잡혀 있어
// "OP-13 english booster box price" 같은 검색에는 안 잡힌다. 영문판 시세·호가·주간 실거래·PSA 인구·
// 경매 낙찰률은 이미 원장에 있는데 페이지가 없어서 노출이 0 이었다(소유자 지시 2026-09-08).
//
// ── 무엇을 읽나(전부 기존 원장, 이 파일은 아무것도 수집하지 않는다)
//   data/derived/site-facts.json          (2026-10-15) 세트별 사실 — current·4주 변동·최저 실매물·호가·지표·기준선·경매 요약·발매일·Key facts·수정일.
//                                 규칙은 tools/build-site-facts.js(한 곳)에서 센다. 이 파일은 그 값을 그리기만 한다.
//   data/box-sold-series.json     sets[code].en 주간 실거래 시계열(+ enBlue 초판, supply 매물 수) — 그래프·주간 표의 점(사실이 아닌 원장 값)
//
// ── 규칙
//   · 값이 없으면 칸을 비운다. 추정·보간 금지("빈 값이 틀린 값보다 낫다").
//   · 표·차트 위주. 문장은 날짜가 박힌 사실문(접힌 Key facts·FAQ)만 — 소유자 규칙.
//     2026-10-15 소유자 결정: 지표 정의는 식 한 조각, 표 아래 방법 설명("so thin weeks borrow neighbours" · "Printings are never averaged
//     together")·해석("Fewer days means stock is clearing faster" · "The ratio describes the gap; it does not explain it")은 뺐다.
//     설명문(meta·og)은 Key facts 표 값으로만(set-page-shared.dataDesc, 일본판 생성기와 같은 함수).
//   · 일본판 페이지와 <head>·푸터·고지·사이트맵 갱신을 공유한다(set-page-shared.js).
//   · 박스 그림은 싣지 않는다 — 가진 이미지는 반다이 일본판 공식 사진이라 영문판 페이지에 맞지 않는다.
//
// Run: node tools/generate-english-set-pages.js   (generate-set-pages.js 보다 먼저 — 허브·일본판 페이지가 이 파일 존재를 보고 링크를 건다)
const fs = require("fs");
const path = require("path");
const { ROOT, SITE, EPN, BoxChart, esc, usd, intl, AFF_TOP, FOOT, pageHead, upsertSitemap, buyCta, BUY_CTA_CSS, keyFactsHtml, KF_CSS, withChartCss, dataDesc } = require("./set-page-shared");

const readJson = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return fallback; }
};
// 사실 한 벌(data/derived/site-facts.json) — 세트별 값은 F.sets[code]. 원장은 그래프·주간 표의 점(box-sold-series)만 직접 읽는다.
const F = require("./build-site-facts").load();
const SOLD = readJson("data/box-sold-series.json", { sets: {} });
const DATA_DATE = F.dataDate;

// 검색 제목·설명 길이 규칙(2026-09-17) — 구글은 제목 60자·설명 155자를 넘기면 잘라내거나 다시 쓴다.
// 후보를 우선순위대로 주면 처음 들어맞는 것을 쓰고, 전부 넘치면 생성을 멈춘다(카드 생성기와 같은 방식).
const TITLE_MAX = 60, DESC_MAX = 155;
const fit = (cands, max, what) => {
  const hit = cands.find((c) => c.length <= max);
  if (!hit) throw new Error(`SEO 길이 초과: ${what} — ${cands[cands.length - 1].length}자 > ${max}자 "${cands[cands.length - 1]}"`);
  return hit;
};
const seenTitles = new Set();
const uniqueTitle = (t) => { if (seenTitles.has(t)) throw new Error(`타이틀 중복: ${t}`); seenTitles.add(t); return t; };

const slug = (code) => code.toLowerCase();
const fileOf = (code) => `${slug(code)}-english.html`;

// ── 세트별 영문판 지표 한 묶음 = 사실 파일 metrics.en(build-site-facts) + 호가 관측(ebayActive.en). 페이지 본문과 기준선(중앙값)이 같은 숫자를 쓴다.
//   현재가·배수·설명문 모두 current(28일 규칙)가 있을 때만. 배수는 JP·EN current 가 둘 다 있을 때만. 4주 변동률 = boxChange28(세트 페이지·비교표와 같은 함수).
//   판매 중앙값 문장(접힌 Key facts·FAQ·비교표)도 current 에서(2026-10-15 감사 #0). 영문판이 재판(White)만일 때(OP-01) reprint 가 선다.
const englishMetrics = (code) => ({ ...F.sets[code].metrics.en, ask: F.sets[code].ebayActive.en });

// 페이지를 만들 세트 = 영문판 실거래 중앙값이 있는 세트(원장 기준, 손목록 없음) — 사실 파일 order.englishPages.
const ORDER = F.order.englishPages;
const METRICS = Object.fromEntries(ORDER.map((code) => [code, englishMetrics(code)]));
// 최신 세트 — 제목·H1 에 Release Date 를 넣는다(일본판·한국어 생성기와 같은 목록, 사실 파일 latestSets).
const LATEST = new Set(F.latestSets);

// 기준선 = 영문판 페이지가 있는 세트들의 중앙값(사실 파일 baselines.en). 라벨의 "N-set" 은 실제 모수로 쓴다.
const BASE = F.baselines.en;
const baseLabel = (key) => (BASE[key]?.n ? `${BASE[key].n}-set median` : "median");

// ── 화면 조각들 --------------------------------------------------------------------

// 기준선 대비 방향 표시. higherIsBetter=false 면 낮을수록 초록(재고일수).
function cmp(v, b, higherIsBetter = true) {
  if (v == null || b == null || !b) return "";
  const p = Math.round((v / b - 1) * 100);
  if (p === 0) return `<span class="statFlat">= median</span>`;
  const cls = (p > 0) === higherIsBetter ? "statUp" : "statDown";
  return `<span class="${cls}">${p > 0 ? "▲" : "▼"} ${p > 0 ? "+" : ""}${p}%</span>`;
}

function statGrid(code, m) {
  const cells = [], hints = [];
  const card = (label, value, base, hint) => {
    if (hint) hints.push([label, hint]);
    cells.push(`<div class="statCard"${hint ? ` title="${esc(hint)}"` : ""}><div class="statLabel">${label}</div><div class="statValue">${value}</div>${base ? `<div class="statBase">${base}</div>` : ""}</div>`);
  };
  if (m.price != null) card("Box price (EN)", usd(m.price), `${m.reprint ? "reprint (White) · " : ""}${m.priceD ? `as of ${esc(m.priceD)} · ` : ""}${baseLabel("price")} ${usd(BASE.price.v)} ${cmp(m.price, BASE.price.v)}`);
  if (m.chg != null) {
    const cls = m.chg > 0 ? "statUp" : m.chg < 0 ? "statDown" : "statFlat";
    card("4-week change", `<span class="${cls}">${m.chg > 0 ? "+" : ""}${m.chg}%</span>`, `${baseLabel("chg")} ${BASE.chg.v > 0 ? "+" : ""}${BASE.chg.v}%`);
  }
  // 2026-09-29(감사 SD4): Product 스키마의 AggregateOffer lowPrice·highPrice 가 화면에 없었다(highPrice 22/22 숨김).
  // 구조화 데이터는 화면 내용을 반영해야 하므로, 일본판 세트 페이지처럼 호가 범위를 같은 칸에 보여 준다.
  if (m.ask && m.ask.middle != null && (m.ask.sampleSize || 0) >= 3) {
    const rng = m.ask.low != null && m.ask.high != null && m.ask.high >= m.ask.low ? ` · Range ${usd(m.ask.low)} – ${usd(m.ask.high)}` : "";
    card("Asking price (mid)", usd(m.ask.middle), `${m.ask.sampleSize} active listings${rng} · ${esc(m.ask.updated || DATA_DATE)}`, "Median ask of verified active eBay listings (not sales)");
  }
  if (m.days != null) card("Days of inventory", `${m.days}d`, `${m.stock} listed · ${baseLabel("days")} ${BASE.days.v}d ${cmp(m.days, BASE.days.v, false)}`, "Listings on sale ÷ sales per day (sold-median window)");
  if (m.multiple != null) card("vs Japanese box", `${m.multiple}x`, `${m.reprint ? "EN reprint vs " : ""}JP ${usd(m.jpPrice)} as of ${esc(m.jpPriceD)} · ${baseLabel("multiple")} ${BASE.multiple.v}x`, "English sold median ÷ Japanese sold median");
  if (m.psa != null) card("PSA graded (EN)", intl(m.psa), `${baseLabel("psa")} ${intl(BASE.psa.v)} ${cmp(m.psa, BASE.psa.v)}`);
  if (m.gem != null) card("PSA 10 rate (EN)", `${m.gem}%`, `${baseLabel("gem")} ${BASE.gem.v}% ${cmp(m.gem, BASE.gem.v)}`, "PSA 10 grades ÷ all PSA grades, English printing");
  if (cells.length < 3) return "";
  const gloss = hints.length ? `<details class="statGloss"><summary>Definitions</summary><dl>${hints.map(([l, t]) => `<dt>${l}</dt><dd>${t}</dd>`).join("")}</dl></details>` : "";
  return `<section aria-label="English box metrics"><div class="statGrid">${cells.join("")}</div>${gloss}</section>`;
}

// 날짜 박힌 사실문 — 답변 AI 가 그대로 인용할 수 있는 형태. 화면에서는 접어 둔다.
function keyFacts(code, nameEn, m, s) {
  const facts = [];
  const rp = m.reprint ? " reprint (White)" : "";
  if (m.sold && m.sold.median != null) facts.push(`As of ${esc(m.sold.updated)}, a sealed English ${code} ${esc(nameEn)}${rp} booster box has a completed-sale median of about <strong>${usd(m.sold.median)}</strong> (${m.sold.sampleSize} eBay sales in the trailing ${m.sold.windowDays || 28} days).`);
  if (m.ask && m.ask.middle != null && (m.ask.sampleSize || 0) >= 3) facts.push(`Current eBay asking prices run around <strong>${usd(m.ask.middle)}</strong> (${m.ask.sampleSize} active listings, ${esc(m.ask.updated || DATA_DATE)}).`);
  if (m.multiple != null) facts.push(`The English ${code}${rp} box trades at about <strong>${m.multiple}x</strong> the Japanese box (${usd(m.jpPrice)} as of ${esc(m.jpPriceD)}).`);
  if (m.psa != null && m.gem != null) facts.push(`PSA has graded <strong>${intl(m.psa)}</strong> English ${code} cards with a <strong>${m.gem}%</strong> PSA 10 rate (as of ${esc(m.psaD || DATA_DATE)}).`);
  if (s.release) facts.push(`The English edition of ${code} released ${esc(s.release)}.`);   // 일 단위(2026-10-14, 종전 "Dec 2022")
  if (facts.length < 2) return "";
  return `
      <section id="key-facts" aria-label="Key facts">
        <details class="keyFactsBox"><summary>Key facts in one paragraph</summary>
        <ul class="keyFacts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul></details>
      </section>`;
}

// 차트 — 영문판(+초판 Blue)만 넘긴다. 일본판 선은 일본판 페이지에 있다.
function chartBlock(code) {
  const ser = SOLD.sets?.[code];
  if (!ser) return "";
  const enOnly = {
    en: ser.en, enBlue: ser.enBlue,
    windowDays: ser.windowDays,
    monthly: { en: ser.monthly?.en, enBlue: ser.monthly?.enBlue },
    daily: { en: ser.daily?.en, enBlue: ser.daily?.enBlue },
    // 판매일별 건수 — 거래량 막대(달력 칸)의 원천. 없으면 막대가 통째로 빠진다.
    counts: { through: ser.counts?.through, en: ser.counts?.en, enBlue: ser.counts?.enBlue },
    supply: (ser.supply || []).map((p) => ({ d: p.d, en: p.en })),
    reprintPct: ser.reprintPct,
  };
  if (!BoxChart.hasChart(enOnly)) return "";
  return BoxChart.chartHTML(enOnly, { lang: "en", title: `${code} English sealed booster box — median completed eBay sale` });
}

// 지금 걸린 최저가 매물(가격+배송비). "New" 이고 제목이 개봉·빈 박스를 말하지 않을 때만 싣는다 —
// 검색어에 sealed 가 있어도 "Unsealed"·"Open Box" 매물이 최저가로 잡힌다(OP-13 실측).
// 최저 실매물 버튼 — cheapestBox 와 같은 검수 조건(미개봉 새 제품, 개봉/손상 문구 제외)을 쓴다.
// 값이 찍힌 버튼이 검색 링크보다 훨씬 많이 눌린다(2026-09-16 실측).
// 값은 Key facts 표의 "Lowest live ask" 와 같은 값(사실 파일 sets[code].ask.en — build-site-facts.lowestAsk)에서 — 표와 버튼이 늘 같은 숫자다(2026-10-14).
function cheapestBoxCta(code) {
  const a = F.sets[code].ask.en;
  return a ? buyCta({ url: a.url, price: a.total, mid: a.mid, updated: a.updated, label: `sealed English ${code} box` }) : "";
}

function cheapestBox(code, m) {
  const bl = m.ask?.bestListing;
  if (!bl || bl.total == null || !/new/i.test(bl.condition || "")) return "";
  if (/unseal|open|empty|no packs|reseal|damaged/i.test(bl.title || "")) return "";
  const id = (String(bl.url || "").match(/\/itm\/(\d+)/) || [])[1];
  if (!id) return "";
  const link = `https://www.ebay.com/itm/${id}?${EPN}`;
  const ship = bl.shipping ? ` (item ${usd(bl.price)} + shipping ${usd(bl.shipping)})` : " (free shipping)";
  return `
      <div class="liveBox">
        <span>Lowest total-cost English ${code} box listed now</span><br />
        <b>${usd(bl.total)}</b>
        <small>${esc(ship.trim())} · ${esc(bl.condition)} · ships from ${esc(bl.country || "—")} · as of ${esc(m.ask.updated || DATA_DATE)} · <a href="${link}" target="_blank" rel="noopener noreferrer sponsored">View listing</a></small>
      </div>`;
}

function weeklyTable(code) {
  const pts = (SOLD.sets?.[code]?.en || []).filter((p) => p && p.median != null);
  if (pts.length < 3) return "";
  const rows = [...pts].reverse().map((p) => `<tr><td>${esc(p.d)}</td><td class="num">${usd(p.median)}</td><td class="num">${usd(p.low)}</td><td class="num">${usd(p.high)}</td><td class="num">${intl(p.n)}</td><td class="num">${p.vol != null ? intl(p.vol) : "—"}</td></tr>`).join("\n            ");
  return `
      <h2>English ${code}${METRICS[code]?.reprint ? " reprint (White)" : ""} box — weekly completed-sale median</h2>
      <div class="chaseTableWrap">
        <table class="chaseTable">
          <thead><tr><th>Week ending</th><th>Median</th><th>Low (P25)</th><th>High (P75)</th><th>Sales in window</th><th>Sales that week</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <p class="priceNote">Completed eBay sales, sealed English boxes · dated by sale date · median window ${METRICS[code]?.windowDays || 28}+ days · <a href="../methodology.html">Source rules</a> · ${esc(F.dataDate)}</p>`;   // 표의 첫 행은 판매 원장 기준일(asOf)까지 간다 — 그보다 이른 날짜를 찍지 않는다(2026-10-15). 문장("…so thin weeks borrow neighbours")은 라벨 조각으로(2026-10-15)
}

function compareTable(code, m, s) {
  // 일본판 판매 칸도 current(28일 규칙) — 2026-10-14 QA: 98일 전 값이 날짜와 함께 비교표에 남아 다른 표("—")와 엇갈렸다.
  const jpCur = s.current.jp;
  const jpSold = jpCur ? { median: jpCur.median, updated: jpCur.d, sampleSize: jpCur.n } : null, jpAsk = s.ebayActive.jp;
  const jpRel = s.jpRelease;
  const psaJp = s.grading.psa.jp;
  const row = (label, en, jp) => (en == null && jp == null ? "" : `<tr><td>${label}</td><td class="num">${en ?? "—"}</td><td class="num">${jp ?? "—"}</td></tr>`);
  const rows = [
    row("Completed-sale median", m.sold?.median != null ? `${usd(m.sold.median)} <span class="psaKind">${m.reprint ? "reprint · " : ""}${esc(m.sold.updated)}</span>` : null, jpSold?.median != null ? `${usd(jpSold.median)} <span class="psaKind">${esc(jpSold.updated)}</span>` : null),
    row("Sales in window", m.sold?.sampleSize ?? null, jpSold?.sampleSize ?? null),
    row("Asking median (active)", m.ask?.middle != null && (m.ask.sampleSize || 0) >= 3 ? `${usd(m.ask.middle)} <span class="psaKind">${m.ask.sampleSize} listings</span>` : null, jpAsk?.middle != null && (jpAsk.sampleSize || 0) >= 3 ? `${usd(jpAsk.currency === "USD" ? jpAsk.middle : jpAsk.middle / (F.fx.usdKrw || 1))} <span class="psaKind">${jpAsk.sampleSize} listings</span>` : null),
    row("Listings on sale now", m.stock ?? null, m.stockJp ?? null),
    row("PSA graded (full set)", m.psa != null ? `${intl(m.psa)}${m.gem != null ? ` <span class="psaKind">${m.gem}% PSA 10</span>` : ""}` : null, psaJp && psaJp.total != null ? `${intl(psaJp.total)}${psaJp.gemRate != null ? ` <span class="psaKind">${psaJp.gemRate}% PSA 10</span>` : ""}` : null),
    row("Release date", s.release ? esc(s.release) : null, jpRel ? esc(jpRel) : null),
    m.multiple != null ? `<tr><td>English ÷ Japanese (completed-sale medians)</td><td class="num" colspan="2"><strong>${m.multiple}x</strong></td></tr>` : "",
  ].filter(Boolean).join("\n            ");
  if (!rows) return "";
  return `
      <h2>English vs Japanese ${code} box</h2>
      <div class="chaseTableWrap">
        <table class="chaseTable">
          <thead><tr><th>Metric</th><th>English</th><th>Japanese</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <p class="priceNote">Japanese column: <a href="${slug(code)}.html">${code} Japanese box guide</a></p>`;   // 출처 라벨만 — "Printings are never averaged together."(방법 설명)는 뺐다(2026-10-15)
}

// 영문판 경매 낙찰 통계 — 종료 후 재조회한 우리 원장에서만 나오는 축. 표본 30건 미만이면 비율을 비운다.
function auctionSection(code) {
  const a = F.sets[code].auction && F.sets[code].auction.en;
  if (!a || a.ended < 30) return "";
  const w = F.auctionWindow;
  const catName = { card: "single cards", box: "sealed boxes", pack: "loose packs", graded: "graded slabs", lot: "multi-card lots", carton: "sealed cases" };
  const cats = a.byCat.slice(0, 5);   // 종료 건수 내림차순(사실 파일)
  const rows = cats.map((v) => `<tr><td>${esc(catName[v.cat] || v.cat)}</td><td class="num">${intl(v.ended)}</td><td class="num">${intl(v.sold)}</td><td class="num">${v.sellThrough}%</td></tr>`).join("\n            ");
  const total = `<tr><td><strong>All English ${code} auctions</strong></td><td class="num"><strong>${intl(a.ended)}</strong></td><td class="num"><strong>${intl(a.sold)}</strong></td><td class="num"><strong>${a.sellThrough != null ? `${a.sellThrough}%` : "—"}</strong></td></tr>`;
  return `
      <h2>English ${code} cards at eBay auction — last ${w.days || 30} days</h2>
      <div class="chaseTableWrap">
        <table class="chaseTable tblFit">
          <thead><tr><th>Listing type</th><th>Closed</th><th>Sold</th><th>Sell rate</th></tr></thead>
          <tbody>
            ${rows}
            ${total}
          </tbody>
        </table>
      </div>
      <p class="priceNote">${[w.from && w.to ? `${esc(w.from)} – ${esc(w.to)}` : "", a.medPrice != null ? `Median sold price ${usd(a.medPrice)}` : "", "Sell rate = share of closed auctions that sold", "Buy-it-now not included"].filter(Boolean).join(" · ")}</p>`;
}

// FAQ — 화면과 JSON-LD 가 같은 문답을 써야 한다(가드 L2). 값은 전부 원장에서, 판단 문장은 없다.
function faqItems(code, nameEn, m) {
  const items = [];
  const rp = m.reprint ? " reprint (White)" : "";
  // 금액 표기는 화면 표·지표 칸과 같은 usd()(천 단위 쉼표) — 2026-10-15: FAQ 만 "$1424" 로 나가 같은 값이 두 꼴이었다(OP-01).
  const askBit = m.ask && m.ask.middle != null && (m.ask.sampleSize || 0) >= 3 ? ` Active asking prices center near ${usd(m.ask.middle)} across ${m.ask.sampleSize} listings.` : "";
  if (m.sold && m.sold.median != null) {
    items.push({
      q: `How much is a sealed ${code} ${nameEn} English booster box?`,
      a: `As of ${m.sold.updated}, completed eBay sales${m.reprint ? " of the reprint (White) box" : ""} put the median at about ${usd(m.sold.median)} (${m.sold.sampleSize} sales in the trailing ${m.sold.windowDays || 28} days, from ${usd(m.sold.low)} to ${usd(m.sold.high)}).${askBit}`,
    });
  }
  // 28일 안의 판매 중앙값이 없으면 이 문답을 싣지 않는다 — 2026-10-15(5차): 일본판 세트 페이지와 같은 규칙. 4차는 호가 중앙값으로 답해
  // "박스 얼마?"에 판매가가 아닌 값이 나갔다.
  if (m.multiple != null) {
    items.push({
      q: `How does the English ${code} box price compare with the Japanese box?`,
      a: `English${rp} ${usd(m.price)} (as of ${m.priceD}) versus Japanese ${usd(m.jpPrice)} (as of ${m.jpPriceD}): the English box trades at about ${m.multiple}x the Japanese box.`,
    });
  }
  if (m.psa != null && m.gem != null) {
    items.push({
      q: `How many English ${code} cards have been graded by PSA?`,
      a: `PSA reports ${intl(m.psa)} graded English ${code} cards as of ${m.psaD || DATA_DATE}, and ${m.gem}% of them received a PSA 10.`,
    });
  }
  return items;
}

function faqHtml(code, nameEn, items) {
  if (!items.length) return "";
  return `
      <section class="setFaq" aria-label="${esc(`${code} ${nameEn} English box frequently asked questions`)}">
        <h2>${code} ${esc(nameEn)} English box — frequently asked questions</h2>
        ${items.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("\n        ")}
      </section>`;
}

// pageDate = 사실 파일 sets[code].pageDate(build-site-facts.setPageDate) — 화면 "Data updated" 와 같은 날(2026-10-15, 감사 #4: 종전 packs.updated 10-14 라
// 같은 페이지의 "as of 2026-10-15" 판매 중앙값보다 이른 수정일을 냈다).
function jsonLd(code, nameEn, m, s, items, canonical, pageName, pageDate) {
  const ld = [];
  if (items.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) });
  ld.push({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Set Guides", item: `${SITE}/sets/index.html` },
      { "@type": "ListItem", position: 3, name: `${code} Guide`, item: `${SITE}/sets/${slug(code)}.html` },
      { "@type": "ListItem", position: 4, name: `${code} English box`, item: canonical },
    ],
  });
  // name = 이 페이지 <title> — WebPage.name 이 비어 있었다(2026-10-14 W6b).
  ld.push({ "@context": "https://schema.org", "@type": "WebPage", ...(pageName ? { name: pageName } : {}), url: canonical, dateModified: pageDate });
  // Product 스키마는 유효한 호가 구간이 있을 때만 — 불완전한 Product 는 서치콘솔 경고가 된다.
  const a = m.ask;
  if (a && a.middle != null && (a.sampleSize || 0) >= 3) {
    // lowPrice = 화면 Key facts 의 "Lowest live ask"(검증된 최저 실매물 총액) — 2026-10-14(W5a). 실매물이 없을 때만 호가 하위 15% 값.
    const best = s.ask.en;
    const lowV = best ? best.total : a.low;
    // AggregateOffer 는 지표 칸에 "Range $low – $high" 가 그려질 때만(statGrid 와 같은 조건) — 2026-10-15(감사 #6, 일본판 OP-07 과 같은 결함):
    // 실매물만 있고 a.low 가 비면 Range 는 안 보이는데 highPrice 가 a.high 로 나갈 수 있었다. 그때는 화면의 중간 호가 하나(lowPrice = highPrice).
    // 값이 하나여도 AggregateOffer 다(2026-10-28) — 개별 Offer 는 판매자 등록정보로 읽혀 배송·반품 정책 누락 경고가 난다(우리는 판매자가 아니다).
    const rangeShown = a.low != null && a.high != null && a.high >= a.low;
    const offers = rangeShown && (best || a.high >= lowV)
      ? { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: Math.round(lowV), highPrice: Math.round(Math.max(a.high, lowV)), offerCount: a.sampleSize, availability: "https://schema.org/InStock", url: canonical }
      : { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: Math.round(a.middle), highPrice: Math.round(a.middle), availability: "https://schema.org/InStock", url: canonical };
    ld.push({
      "@context": "https://schema.org", "@type": "Product",
      name: `One Piece Card Game ${code} ${nameEn} Booster Box (English)`,
      // image 는 뺀다(감사 SD4): 사이트 배너(og-image.png)는 이 상품의 사진이 아니다. 영문판 박스 실물 이미지가
      // 생기기 전까지 넣지 않는다 — product snippet 필수 속성이 아니고, 일본판 박스 사진을 대신 쓰지도 않는다.
      description: `English sealed ${code} ${nameEn} One Piece Card Game booster box — completed eBay sale median, active asking prices, weekly price history, English PSA population and settled auction results.`,
      brand: { "@type": "Brand", name: "Bandai" },
      category: "Trading Card Games",
      ...(s.release ? { releaseDate: s.release } : {}),
      offers,
    });
  }
  return ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n    ");
}

// 이 페이지들에만 쓰는 스타일(일본판 페이지와 같은 클래스 이름을 쓴다 — 보는 사람에게 같은 화면이어야 한다).
const PAGE_CSS = `      .setHero { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
      .setHero > div { flex: 1 1 320px; min-width: 0; }
      .liveBox { margin: 18px 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: rgba(var(--accent-rgb), .05); }
      .liveBox b { font-size: 20px; color: var(--accent); }
      .liveBox small { color: var(--muted); display: block; margin-top: 4px; }
      .ctaRow { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0; }
      .ctaRow a { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line); font-weight: 800; }
      .ctaRow a.primary { background: rgba(var(--accent-rgb), .14); border-color: rgba(var(--accent-rgb), .5); color: var(--accent); }
${BUY_CTA_CSS}
${KF_CSS}
      .setNavLinks { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 22px; color: var(--muted); font-size: 14px; }
      .affNote { margin-top: 16px; color: var(--muted); font-size: 11.5px; opacity: .8; }
      .affTop { display: block; margin: 12px 0 0; padding: 0 0 0 10px; border-left: 2px solid var(--line); color: var(--muted); font-size: 14px; line-height: 1.55; max-width: 760px; }
      .affTop b { color: inherit; font-weight: 600; }
      .pageUpdated { margin: 6px 0 0; color: var(--muted); font-size: 12.5px; }
      .statGloss { margin: 8px 0 0; max-width: 760px; font-size: 12.5px; color: var(--muted, #9aa4b6); }
      .statGloss > summary { cursor: pointer; color: var(--muted, #9aa4b6); }
      .statGloss dl { margin: 8px 0 0; display: grid; gap: 6px 14px; grid-template-columns: max-content 1fr; }
      .statGloss dt { font-weight: 700; color: var(--fg, #e8edf6); }
      .statGloss dd { margin: 0; line-height: 1.5; }
      .keyFactsBox > summary { cursor: pointer; color: var(--muted, #9aa4b6); font-size: 13px; }
      @media (max-width: 640px) { .statGloss dl { grid-template-columns: 1fr; } .statGloss dd { margin-bottom: 4px; } }
      .statGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 10px; margin: 16px 0 6px; max-width: 760px; }
      .statCard { padding: 12px 14px; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; background: rgba(255,255,255,.02); }
      .statLabel { font-size: 12.5px; color: var(--muted, #9aa4b6); font-weight: 600; }
      .statValue { margin-top: 5px; font-size: 28px; font-weight: 700; line-height: 1.12; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
      .statBase { margin-top: 5px; font-size: 12px; color: var(--muted, #9aa4b6); line-height: 1.45; }
      .statUp { color: #00e5a0; font-weight: 700; }
      .statDown { color: #ff5f6e; font-weight: 700; }
      .statFlat { color: #8090b0; font-weight: 700; }
      .keyFacts { margin: 14px 0 4px; padding: 12px 16px 12px 32px; border: 1px solid rgba(var(--accent-rgb), .28); background: rgba(var(--accent-rgb), .05); border-radius: 12px; max-width: 680px; font-size: 14px; line-height: 1.65; }
      .keyFacts li { margin: 3px 0; }
      .keyFacts strong { color: var(--accent); }
      .chaseTableWrap { overflow-x: auto; margin: 14px 0 6px; }
      .chaseTable { width: 100%; border-collapse: collapse; font-size: 14px; }
      .chaseTable th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
      .chaseTable td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.05); vertical-align: top; }
      .chaseTable .psaKind { color: var(--muted); font-size: 11.5px; }
      .chaseTable td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .priceNote { color: var(--muted); font-size: 12px; margin: 2px 0 0; }`;

// ── 페이지 한 장 ----------------------------------------------------------------
function englishPage(code, prev, next) {
  const s = F.sets[code];   // 세트 사실(release·ask·liveAsk·ebayActive·grading·current·jpRelease·keyFacts·pageDate)
  const m = METRICS[code];
  const nameEn = s.nameEn || code;
  const canonical = `${SITE}/sets/${fileOf(code)}`;
  const items = faqItems(code, nameEn, m);
  // 제목 = "<코드> <세트명> English Booster Box Price"(2026-09-17). 브랜드 꼬리는 60자 안에 들어맞을 때만, 그래도 넘치면 "Booster" 를 뺀다.
  // (2026-09-09 감사 때 60자 "안팎"으로 줄였지만 22장 중 20장이 여전히 60자를 넘어 검색결과에서 잘렸다.)
  const core = `${code} ${nameEn} English Booster Box Price`;
  // 최신 세트(set-page-shared.latestSets — 일본판 생성기와 같은 규칙)는 "Release Date" 를 앞세운다(2026-10-14, W5a).
  // "Card List" 는 넣지 않는다 — 카드 리스트 페이지는 일본판 공식 목록 기준이다.
  const rel = LATEST.has(code);
  const latestCands = rel ? [`One Piece ${code} English Booster Box Price & Release Date`, `One Piece ${code} English Box Price & Release Date`, `${code} English Box Price & Release Date | OP Box Index`] : [];
  // 2026-09-29: 'One Piece' 를 맨 앞 후보로. 다음 후보는 'Booster' 를 빼고 'One Piece' 를 지킨다(일본판 생성기와 같은 규칙).
  const title = uniqueTitle(fit([...latestCands, `One Piece ${core}`, `One Piece ${code} ${nameEn} English Box Price`, `${core} | OP Box Index`, core, `${code} ${nameEn} English Box Price`], TITLE_MAX, code));
  // 설명 = Key facts 표의 값만(set-page-shared.dataDesc — 일본판 생성기와 같은 함수, 2026-10-15 소유자 결정).
  // 종전 꼬리 "Weekly price history and auction results, updated daily."(페이지 소개)는 뺐고, 금액 표기는 표와 같은 usd()("$1,424") 하나.
  // 뒤 조각 = 지표 칸의 배수·영문판 PSA 10 비율 — 들어갈 때만. 배수는 JP·EN current 가 둘 다 있을 때만(m.multiple, 가드 D17 8c).
  const desc = fit([dataDesc(s.keyFacts.en, nameEn, [m.multiple != null ? `${m.multiple}x the JP box` : "", m.gem != null ? `English PSA 10 rate ${m.gem}%` : ""], DESC_MAX)], DESC_MAX, code);
  const ebaySearch = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`One Piece Card Game ${code} ${nameEn} Booster Box English sealed`)}&LH_BIN=1&_sop=15&${EPN}`;
  const enBuy = cheapestBoxCta(code);
  // 수정일 — JSON-LD dateModified·화면 "Data updated" 가 같은 날(일본판·한국어 생성기와 같은 값 sets[code].pageDate, 2026-10-15 감사 #4).
  const pageDate = s.pageDate;

  // 머리 요약 줄(dataSummary)은 H1 아래 Key facts 표로 바뀌었다 — 2026-10-14(W5a). 일본판·한국어 페이지와 같은 함수에서 같은 사실을 읽는다.
  // chart:false — 박스 차트 CSS 는 차트 바로 앞(withChartCss)에 둔다. 머리를 가볍게 해 Key facts 표를 HTML 앞쪽에(2026-10-14, W5a).
  return `${pageHead({ title, desc, canonical, extraLd: jsonLd(code, nameEn, m, s, items, canonical, title, pageDate), extraCss: PAGE_CSS, chart: false })}
      <p class="eyebrow">Set Guide · English edition</p>
      <div class="setHero">
        <div>
          <h1>One Piece ${code} ${esc(nameEn)} — English booster box price${rel ? " &amp; release date" : ""}</h1>
          ${keyFactsHtml(s.keyFacts.en)}
          <p class="eyebrow"><span data-ko="영문판">English edition</span> · <a href="${slug(code)}.html" data-ko="일본판 박스 가이드">Japanese box guide</a></p>
          <p class="pageUpdated">Data updated <time datetime="${pageDate}">${pageDate}</time> · refreshed daily</p>
        </div>
      </div>
      ${AFF_TOP}
      ${/* 구매 버튼은 박스 시세 바로 아래 — 2026-10-07(일본판 생성기와 같은 이유: 차트 뒤에 두면 첫 화면에 살 길이 없다).
            2026-10-14(W5a): 박스 시세가 H1 아래 Key facts 표로 올라와, 버튼도 지표 격자 앞(표·고지 바로 뒤)으로. */ ""}
      <div class="ctaRow">
        ${enBuy}
        <a class="${enBuy ? "" : "primary"}" href="${ebaySearch}" target="_blank" rel="noopener noreferrer sponsored">${enBuy ? `All English ${code} box listings` : `Browse English ${code} boxes on eBay`}</a>
        <a href="../?set=${encodeURIComponent(code)}&amp;hl=en">Open live ${code} tracker</a>
        <a href="${slug(code)}.html">Japanese ${code} box guide</a>
      </div>
      ${statGrid(code, m)}
      ${keyFacts(code, nameEn, m, s)}
      ${withChartCss(chartBlock(code))}
      ${cheapestBox(code, m)}
      ${weeklyTable(code)}
      ${compareTable(code, m, s)}
      ${auctionSection(code)}
      ${faqHtml(code, nameEn, items)}
      <div class="setNavLinks">
        ${prev ? `<a href="${fileOf(prev)}">← ${prev} English box</a>` : ""}
        <a href="index.html">All set guides</a>
        ${next ? `<a href="${fileOf(next)}">${next} English box →</a>` : ""}
      </div>${FOOT}`;
}

// ── 쓰기 + 사이트맵 ---------------------------------------------------------------
const outDir = path.join(ROOT, "sets");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
let written = 0;
ORDER.forEach((code, i) => {
  fs.writeFileSync(path.join(outDir, fileOf(code)), englishPage(code, ORDER[i - 1], ORDER[i + 1]), "utf8");
  written++;
});
const { added } = upsertSitemap(ORDER.map((c) => `${SITE}/sets/${fileOf(c)}`), { priority: "0.7" });
console.log(JSON.stringify({ pagesWritten: written, sets: ORDER.length, sitemapAdded: added }));
