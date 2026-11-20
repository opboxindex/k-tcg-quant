// 주간 마켓 리포트 자동생성 — boxSeries(주간 시세)와 psaWeekly(일본판 등급 증가 구간)에서
// WoW 상승/하락·등급량을 계산해 articles/weekly-market-report-YYYY-MM-DD.html 생성.
// 사이트맵에 idempotent 추가. RSS는 tools/generate-feed.js 재실행으로 반영.
// Run: node tools/generate-weekly-report.js
const CSS_VER = (require("fs").readFileSync(require("path").join(__dirname, "..", "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";  // 하드코딩하면 범프 때 가드 V1 이 배포를 막는다(2026-07-27)
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SITE = "https://opboxindex.com";
const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "onepiece-packs.json"), "utf8"));
const USD = (krw) => Math.round(krw / (d.fx?.usdKrw || 1548.63));

// 세트별 WoW: boxSeries 마지막 두 포인트(주간 시리즈)
const rows = [];
for (const [code, s] of Object.entries(d.sets || {})) {
  const pts = s.boxSeries?.points || [];
  if (pts.length < 2) continue;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const chg = (last.p / prev.p - 1) * 100;
  const wk = s.psaWeekly?.points || [];
  rows.push({
    code, name: s.nameEn || code,
    now: USD(last.p), prevUsd: USD(prev.p), chg: Math.round(chg * 10) / 10,
    asOf: last.d,
    grades: wk.length ? wk[wk.length - 1].v : null,
    gradesFrom: wk.length ? wk[wk.length - 1].f : null,
    gradesTo: wk.length ? wk[wk.length - 1].d : null,
  });
}
if (!rows.length) { console.error("시리즈 데이터 없음"); process.exit(1); }
rows.sort((a, b) => b.chg - a.chg);
const asOf = rows.map((r) => r.asOf).sort().pop();
const gainers = rows.filter((r) => r.chg >= 1).slice(0, 5);
const losers = rows.filter((r) => r.chg <= -1).sort((a, b) => a.chg - b.chg).slice(0, 5);
// 등급 증가 = 원장 스냅샷 f → d 구간(2026-11-20 — GemRate 갱신일을 따라 늘 7일이 아니다). 가장 늦은 구간이 끝나는 세트만 더한다 —
// 세트마다 마지막 점을 그냥 더하면 서로 다른 구간이 한 합에 섞인다. 문장은 "latest recorded week" 대신 시작 → 끝(날짜 수).
const gradesTo = rows.map((r) => r.gradesTo).filter(Boolean).sort().pop() || "";
const gradeRows = rows.filter((r) => r.grades != null && r.gradesTo === gradesTo).sort((a, b) => b.grades - a.grades);
const totalGrades = gradeRows.reduce((a, b) => a + b.grades, 0);
const gradesFrom = gradeRows[0]?.gradesFrom || "";
const gradesDays = gradesFrom && gradesTo ? Math.round((Date.parse(`${gradesTo}T00:00:00Z`) - Date.parse(`${gradesFrom}T00:00:00Z`)) / 864e5) : null;

const slugDate = asOf;
const fname = `weekly-market-report-${slugDate}.html`;
const canonical = `${SITE}/articles/${fname}`;
const title = `One Piece Box Market Weekly: ${asOf} | OP Box Index`;
const desc = `Week of ${asOf}: ${gainers[0] ? `${gainers[0].code} led Japanese boxes at +${gainers[0].chg}%` : "quiet week for Japanese boxes"}; ${totalGrades.toLocaleString("en-US")} new PSA grades (${gradesFrom} → ${gradesTo}). Auto-generated from our weekly tracking data.`;
const publishedDate = new Date().toISOString().slice(0, 10);
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (v) => `<span style="color:${v >= 0 ? "#26d07c" : "#ff7a7a"}">${v >= 0 ? "+" : ""}${v}%</span>`;
const tr = (r) => `<tr><td><a href="../sets/${r.code.toLowerCase()}.html">${r.code} ${esc(r.name)}</a></td><td class="num">$${r.prevUsd}</td><td class="num">$${r.now}</td><td class="num">${pct(r.chg)}</td></tr>`;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-P73SE1WVD0');
    </script>
    <script defer src="/track.js"></script>
    <!-- Short automated weekly reports remain noindex and ad-free until expanded editorially. -->
    <meta name="robots" content="noindex,follow" />
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:image" content="${SITE}/og/og-compare.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${canonical}" />
    <script type="application/ld+json">{"@context": "https://schema.org", "@type": "Article", "headline": "One Piece box market weekly: ${asOf}", "description": ${JSON.stringify(desc)}, "image": "${SITE}/og/og-compare.png", "datePublished": "${publishedDate}", "dateModified": "${publishedDate}", "inLanguage": "en-US", "mainEntityOfPage": {"@type": "WebPage", "@id": "${canonical}"}, "author": {"@type": "Organization", "name": "OP Box Index", "url": "${SITE}/"}, "publisher": {"@type": "Organization", "name": "OP Box Index", "url": "${SITE}/"}, "isAccessibleForFree": true}</script>
    <link rel="stylesheet" href="../styles.css?v=${CSS_VER}" />
    <script defer src="../lang-toggle.js?v=${CSS_VER}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .dataTable { width: 100%; border-collapse: collapse; margin: 14px 0 6px; font-size: 14px; }
      .dataTable th { text-align: right; padding: 6px 8px; border-bottom: 1px solid #2a3140; color: #9aa4b6; font-weight: 600; }
      .dataTable th:first-child, .dataTable td:first-child { text-align: left; }
      .dataTable td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.06); }
      .dataTable td.num { text-align: right; white-space: nowrap; }
      .tblWrap { overflow-x: auto; }
      .srcNoteA { color: var(--muted); font-size: 12.5px; margin: 4px 0 18px; }
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      <nav class="nav" aria-label="Primary navigation"><a href="../" data-ko="부스터 박스">Booster Boxes</a><a href="../compare.html" data-ko="비교">Compare</a><a href="../psa10-ranking.html" data-ko="PSA10 랭킹">Top PSA 10</a><a href="../psa-grading.html" data-ko="PSA 인구">PSA Population</a><a href="../sets/index.html" data-ko="세트 가이드">Set Guides</a><a href="../amazon-lottery.html" data-ko="아마존 응모">Amazon Raffle</a></nav>
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow">Weekly Report · data through ${asOf}</p>
      <h1>One Piece box market weekly</h1>
      <p class="articleMeta">Research and data: <a href="../about.html">OP Box Index</a> · Published <time datetime="${publishedDate}">${publishedDate}</time> · <a href="../methodology.html">Data sources &amp; methodology</a></p>
      <p>The numbers below are generated directly from our weekly tracking series — Japanese sealed box market values and PSA population deltas — for the week ending ${asOf}. Every figure links to the live set page where you can inspect the full chart.</p>

      <h2>Japanese boxes: week-over-week movers</h2>
      ${gainers.length ? `<p><strong>Up:</strong></p><div class="tblWrap"><table class="dataTable tblFit"><thead><tr><th>Set</th><th>Last wk</th><th>This wk</th><th>WoW</th></tr></thead><tbody>${gainers.map(tr).join("")}</tbody></table></div>` : "<p>No Japanese box moved up more than 1% this week.</p>"}
      ${losers.length ? `<p><strong>Down:</strong></p><div class="tblWrap"><table class="dataTable tblFit"><thead><tr><th>Set</th><th>Last wk</th><th>This wk</th><th>WoW</th></tr></thead><tbody>${losers.map(tr).join("")}</tbody></table></div>` : "<p>No Japanese box fell more than 1% this week.</p>"}
      <p class="srcNoteA">Weekly ungraded market values, USD-converted. Boxes within ±1% are treated as flat and omitted.</p>

      <h2>Grading activity${gradesTo ? ` (${gradesFrom} → ${gradesTo})` : ""}</h2>
      <p>Collectors added <strong>${totalGrades.toLocaleString("en-US")}</strong> new PSA grades between GemRate snapshots ${gradesFrom} → ${gradesTo} (${gradesDays} day${gradesDays === 1 ? "" : "s"}) across tracked sets. Leaders: ${gradeRows.slice(0, 3).map((r) => `<a href="../sets/${r.code.toLowerCase()}.html">${r.code}</a> (${r.grades.toLocaleString("en-US")})`).join(", ")}. Each set page shows its total since the first snapshot, the busiest interval and the latest interval, and the background is covered in <a href="psa-grading-vs-sealed-supply-2026.html">our grading-vs-supply report</a>.</p>

      <h2>How to use this</h2>
      <p>One week is noise; direction over months is signal. Use the movers table to spot boxes worth a closer look, then open the set page and check the six-month trajectory, the top-10 chase cards and the grading momentum before drawing conclusions. The <a href="../compare.html">comparison table</a> ranks all boxes side by side.</p>
    </main>
    <footer class="articleFooter">
      <p class="relatedHead">Related reading</p>
      <nav class="relatedLinks">
        <a href="japanese-vs-english-box-price-data-2026.html">JP vs EN: 6 months of data</a>
        <a href="psa-grading-vs-sealed-supply-2026.html">PSA grading vs sealed supply</a>
        <a href="../compare.html">Compare all boxes</a>
      </nav>
      <p class="affNote">OP Box Index is a data-driven research site, not investment advice. As an eBay Partner we may earn a commission from qualifying purchases through eBay links, at no extra cost to you.</p>
    </footer>
  </body>
</html>
`;
// 자동 생성 리포트의 새 공개 발행은 승인 기간에 멈춘다. 데이터 계산은 계속 검증하되,
// 사람이 편집 품질을 확인하고 명시적으로 환경변수를 준 경우에만 파일을 쓴다.
const publishReport = process.env.PUBLISH_WEEKLY_REPORT === "1";
if (publishReport) fs.writeFileSync(path.join(ROOT, "articles", fname), html);

// 주간 자동 리포트는 noindex이므로 sitemap에도 넣지 않는다. 과거 생성기 버전이
// 추가한 항목이 있으면 함께 제거해 robots와 sitemap 신호를 일치시킨다.
const smPath = path.join(ROOT, "sitemap.xml");
let sm = fs.readFileSync(smPath, "utf8");
const cleanedSitemap = sm.replace(
  /\s*<url>\s*<loc>https:\/\/opboxindex\.com\/articles\/weekly-market-report-[^<]+<\/loc>[\s\S]*?<\/url>/g,
  "",
);
if (cleanedSitemap !== sm) {
  sm = cleanedSitemap.replace("</urlset>", "\n</urlset>");
  fs.writeFileSync(smPath, sm);
}
console.log(JSON.stringify({
  file: fname,
  published: publishReport,
  asOf,
  gainers: gainers.length,
  losers: losers.length,
  totalGrades,
}));
