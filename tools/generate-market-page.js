#!/usr/bin/env node
"use strict";
// 2026 시장 추이 — market-2026.html 한 장(제자리 갱신). 2026-10-19 신설.
//
// 왜: 'one piece card market trend 2026' 질문은 ChatGPT·Bing AI·Brave·Perplexity 모두 우리 인용 0 이었다(10/19 실측). 이긴 곳은 시장 리포트형
//     페이지(월별 표)였고, 우리 weekly.html 은 주간 변화뿐이라 받을 페이지가 없었다. 필요한 원장(박스 sold 시계열·PSA 주간 증가·경매 월간)은 이미 있다.
// 규칙
//  · 숫자는 전부 사실 파일 market(tools/build-site-facts.js) — 여기서는 그리기만 한다. 칸마다 그 값의 마지막 관측일·표본 n.
//  · 표·라벨만(데이터 페이지 규칙). 값이 없으면 "—". 박스 중앙값은 세트 5개 이상일 때만(그 미만은 n 만).
// Run: node tools/generate-market-page.js
const fs = require("node:fs");
const path = require("node:path");
const { navHtml } = require("./site-nav");
const { kfTableAny, KF_CSS_ANY } = require("./set-page-shared");

const ROOT = path.join(__dirname, "..");
const SITE = "https://opboxindex.com";
const FILE = "market-2026.html";
const CACHE = (fs.readFileSync(path.join(ROOT, "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";
const F = require("./build-site-facts").load();
const M = F.market;
if (!M || !M.rows.length) { console.log(JSON.stringify({ status: "skip", reason: "market facts 없음" })); process.exit(0); }

const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const intl = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym) => `${MON[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const time = (iso) => (iso ? `<time datetime="${esc(iso)}">${esc(iso)}</time>` : "—");
const year = M.year;
// 머리 사실·설명문은 다 끝난 달 기준 — 2026-11-02. 진행 중인 달(partial: 판매 기준일의 달)을 쓰면 11/02 에 '11월' 박스 중앙값·
// 경매 '602 · 2 days' 가 10월 $417·11,799 옆에서 급락처럼 읽혔다. 진행 중인 달은 표의 마지막 줄에만, '진행 중' 꼬리표로.
// 칸마다 그 값이 있는 마지막 완료 달을 따로 찾는다(PSA 주간 증가는 월초엔 아직 없다 — 종전엔 last.psa 만 봐서 월초마다 줄이 사라졌다).
const done = M.rows.filter((r) => !r.partial);
const lastWith = (pick) => [...done].reverse().find((r) => pick(r)) || null;
const lastBox = lastWith((r) => r.jp && r.jp.usd != null);
const lastEn = lastWith((r) => r.en && r.en.usd != null);
const lastPsa = lastWith((r) => r.psa);
const lastAuc = lastWith((r) => r.auction);

const boxCell = (b) => (b ? `${usd(b.usd)}<small>n=${b.n}</small>` : "—");
const chgCell = (c) => (c ? `<span class="up">▲ ${c.up}</span> · <span class="down">▼ ${c.down}</span><small>n=${c.n}</small>` : "—");
const psaCell = (p) => (p ? `${intl(p.added)}<small>${p.n} wk</small>` : "—");
const aucCell = (a) => (a ? `${intl(a.sold)}<small>${a.n} d</small>` : "—");
const rowAsOf = (r) => [r.jp && r.jp.asOf, r.en && r.en.asOf, r.chg && r.chg.asOf, r.psa && r.psa.asOf, r.auction && r.auction.asOf].filter(Boolean).sort().pop() || null;
const partWord = (r) => (r.partial ? ` <small data-ko="진행 중 · 현재가">in progress · current prices</small>` : "");
const trs = M.rows.map((r) => `          <tr><th scope="row">${esc(monthLabel(r.month))}${partWord(r)}</th><td class="num">${boxCell(r.jp)}</td><td class="num">${boxCell(r.en)}</td><td class="num">${chgCell(r.chg)}</td><td class="num">${psaCell(r.psa)}</td><td class="num">${aucCell(r.auction)}</td><td class="num">${time(rowAsOf(r))}</td></tr>`).join("\n");

const kf = kfTableAny([
  lastBox ? ["jp", `JP box median (${monthLabel(lastBox.month)})`, `일본판 박스 중앙값 (${lastBox.month})`, `<b>${usd(lastBox.jp.usd)}</b> <small>${lastBox.jp.n} <span data-ko="세트">sets</span> · ${time(lastBox.jp.asOf)}</small>`] : null,
  lastEn ? ["en", `EN box median (${monthLabel(lastEn.month)})`, `영문판 박스 중앙값 (${lastEn.month})`, `<b>${usd(lastEn.en.usd)}</b> <small>${lastEn.en.n} <span data-ko="세트">sets</span> · ${time(lastEn.en.asOf)}</small>`] : null,
  lastPsa ? ["psa", `PSA grades added (${monthLabel(lastPsa.month)})`, `PSA 등급 증가 (${lastPsa.month})`, `<b>${intl(lastPsa.psa.added)}</b> <small>${lastPsa.psa.n} <span data-ko="주">weeks</span> · ${time(lastPsa.psa.asOf)}</small>`] : null,
  lastAuc ? ["auction", `eBay auctions sold (${monthLabel(lastAuc.month)})`, `이베이 경매 낙찰 (${lastAuc.month})`, `<b>${intl(lastAuc.auction.sold)}</b> <small>${lastAuc.auction.n} <span data-ko="일">days</span> · ${time(lastAuc.auction.asOf)}</small>`] : null,
], { id: "key-facts-table", label: "Market 2026 key facts", caption: `<span data-ko="원피스 카드 시장 ${year} · 기준일">One Piece TCG market ${year} · as of</span> ${time(M.asOf)}` });

const title = `One Piece TCG Market ${year} — Monthly Box Prices & Sales`;
const desc = `One Piece TCG market ${year} by month: Japanese box median ${lastBox ? usd(lastBox.jp.usd) : "—"}, English ${lastEn ? usd(lastEn.en.usd) : "—"}, 4-week movers, PSA grades added, eBay auctions sold · as of ${M.asOf}.`;
const ld = JSON.stringify({
  "@context": "https://schema.org", "@type": "Dataset",
  name: `One Piece TCG market ${year} — monthly booster box prices, PSA grading and eBay auctions`,
  description: `Monthly ${year} One Piece Card Game market table: cross-set median of Japanese and English sealed booster box completed-sale medians, count of sets up and down over 4 weeks, PSA grades added, and completed eBay auctions sold.`,
  url: `${SITE}/${FILE}`, dateModified: M.asOf, temporalCoverage: `${M.rows[0].month}/${M.rows[M.rows.length - 1].month}`,
  creator: { "@type": "Organization", name: "OP Box Index", url: `${SITE}/` }, license: "https://creativecommons.org/licenses/by/4.0/", isAccessibleForFree: true,
  variableMeasured: ["Japanese booster box median (USD)", "English booster box median (USD)", "Sets up / down over 4 weeks", "PSA grades added", "eBay auctions sold"],
});
const crumb = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: `Market ${year}`, item: `${SITE}/${FILE}` }] });

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${SITE}/${FILE}" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${SITE}/${FILE}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${ld}</script>
    <script type="application/ld+json">${crumb}</script>
    <link rel="stylesheet" href="styles.css?v=${CACHE}" />
    <script defer src="lang-toggle.js?v=${CACHE}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
${KF_CSS_ANY}
      .mkPage { max-width: 980px; margin: 0 auto; padding: 20px clamp(14px,3vw,28px) 44px; }
      .mkPage h1 { margin: 6px 0; font-size: clamp(23px,4vw,32px); line-height: 1.2; }
      .mkPage h2 { font-size: 19px; margin: 26px 0 4px; }
      .mkWrap { overflow-x: auto; }
      .mkTable { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 8px 0 6px; }
      .mkTable th, .mkTable td { padding: 7px 9px; border-bottom: 1px solid var(--line); white-space: nowrap; }
      .mkTable thead th { color: var(--muted); font-size: 12.5px; font-weight: 600; text-align: right; }
      .mkTable thead th:first-child, .mkTable tbody th { text-align: left; }
      .mkTable td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .mkTable td small { display: block; color: var(--muted); font-size: 11.5px; }
      .mkTable .up { color: var(--accent); } .mkTable .down { color: var(--red); }
      .mkNote { color: var(--muted); font-size: 12.5px; line-height: 1.6; margin: 6px 0 0; }
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="./"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("")}
    </header>
    <main id="main-content" class="mkPage">
      <p class="eyebrow" data-ko="시장 · ${esc(year)} · 기준일 ${esc(M.asOf)} · 매일 갱신">Market · ${esc(year)} · as of ${esc(M.asOf)} · refreshed daily</p>
      <h1 data-ko="원피스 카드 시장 ${esc(year)} — 월별">One Piece card market ${esc(year)} — by month</h1>
      ${kf}
      <h2 id="by-month" data-ko="${esc(year)} 월별">${esc(year)} by month</h2>
      <div class="mkWrap"><table class="mkTable">
        <thead><tr><th data-ko="월">Month</th><th data-ko="일본판 박스 중앙값">JP box median</th><th data-ko="영문판 박스 중앙값">EN box median</th><th data-ko="4주 등락 (일본판)">4-wk ▲ / ▼ (JP)</th><th data-ko="PSA 등급 증가">PSA grades added</th><th data-ko="이베이 경매 낙찰">eBay auctions sold</th><th data-ko="기준일">As of</th></tr></thead>
        <tbody>
${trs}
        </tbody>
      </table></div>
      <p class="mkNote" data-ko-html="박스 중앙값 = 세트마다 그 달 말일 기준 주간 판매 중앙값의 세트 간 중앙값(진행 중인 달은 세트별 현재가)(n = 세트 수, ${M.minSets}세트 미만 — ) · 4주 등락 = 그 말일 점 대비 전달 말일 점(진행 중인 달은 세트 페이지·홈과 같은 현재가 기준) · PSA = 주간 등급 증가의 합(wk = 주 수) · 경매 = 이베이 완료 경매 낙찰 수(d = 관측일 수) · <a href=&quot;methodology.html#box-median&quot;>규칙</a>">Box median = median across sets of each set's weekly completed-sale median as of the month's last day; the month in progress uses each set's current price (n = sets; under ${M.minSets} sets —) · 4-wk = month-end point vs the previous month-end point; the month in progress uses current prices, as on each set page · PSA = sum of weekly grades added (wk = weeks) · auctions = completed eBay auctions sold (d = days observed) · <a href="methodology.html#box-median">Rules</a></p>
      <p class="mkNote"><a href="weekly.html" data-ko="이번 주">This week</a> · <a href="box-prices.html" data-ko="전체 박스 시세">All box prices</a> · <a href="compare.html" data-ko="세트 비교">Compare sets</a> · <a href="psa-grading.html" data-ko="그레이딩 통계">Grading population</a> · <a href="auction.html" data-ko="경매">Auctions</a> · <a href="free-data.html" data-ko="무료 데이터">Free data (CSV / JSON)</a></p>
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation"><a href="about.html">About</a><a href="methodology.html">Methodology</a><a href="free-data.html">Free data (CSV)</a><a href="privacy.html">Privacy</a><a href="disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
fs.writeFileSync(path.join(ROOT, FILE), html, "utf8");

// 사이트맵 — 없을 때만 추가(기존 항목은 건드리지 않는다). lastmod 는 sync-sitemap-lastmod 가 본문 해시로 정한다.
const smPath = path.join(ROOT, "sitemap.xml");
let sm = fs.readFileSync(smPath, "utf8");
const loc = `${SITE}/${FILE}`;
let added = 0;
if (!sm.includes(`<loc>${loc}</loc>`)) {
  sm = sm.replace("</urlset>", `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${M.asOf}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`);
  fs.writeFileSync(smPath, sm, "utf8");
  added = 1;
}
console.log(JSON.stringify({ wrote: FILE, months: M.rows.length, asOf: M.asOf, sitemapAdded: added }));
