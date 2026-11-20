// 주간 시장 표 — weekly.html 한 장을 제자리에서 갱신한다(페이지가 쌓이지 않는다). 2026-09-24.
//
// 왜 한 장인가: 2026-07 에 만든 자동 주간 리포트(articles/weekly-market-report-*.html)는 얇은 자동 페이지가
// 쌓인다는 이유로 noindex 로 묶였고 한 번 만들고 멈췄다. 애드센스 심사 중이기도 하다(얇은 페이지 금지).
// 주소 하나가 매주 새 표로 바뀌는 쪽이 낫다 — 단골이 "이번 주엔 뭐가 움직였나"를 보러 올 자리가 생기고
// 색인 대상은 한 장뿐이다.
//
// 숫자는 전부 사실 파일(data/derived/site-facts.json — tools/build-site-facts.js 가 box-sold-series 의 주간 실거래 중앙값·그 주 판매수·매물 수와
// onepiece-packs 의 이름·psaWeekly 에서 센다: sets[code].weekly[ed] · psaWeekly · weekly.weekEnd)에서 온다. 4주 변화는 market-data-normalizers.boxChange28
// (홈·세트 페이지와 같은 함수 — 2026-10-15 5차 전엔 여기만 따로 계산해 OP-04·EB-01 이 갈렸다). 추정 없음, 문단 없음(표·라벨만).
// WoW = 이번 주 점 ÷ 정확히 7일 전 점. 그 점이 없으면(창 미달로 빠짐) "—".
// Run: node tools/generate-weekly.js
const fs = require("node:fs");
const path = require("node:path");
const { navHtml } = require("./site-nav");

const ROOT = path.join(__dirname, "..");
const SITE = "https://opboxindex.com";
const CACHE = (fs.readFileSync(path.join(ROOT, "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";

const F = require("./build-site-facts").load();
const DATA_DATE = F.weekly.dataDate;   // 시리즈 갱신일(box-sold-series.updated)
const ORDER = F.order.all;

const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const pctCell = (v) => v == null ? `<td class="num">—</td>`
  : `<td class="num ${v > 0 ? "up" : v < 0 ? "down" : "flat"}">${v > 0 ? "+" : ""}${v.toFixed(1)}%</td>`;

// 이번 주 = 시리즈 전체에서 가장 늦은 주간 점 날짜. 세트마다 마지막 점이 다를 수 있으니 "그 주"를 기준으로 맞춘다(사실 파일 weekly.weekEnd).
const weekEnd = F.weekly.weekEnd;
const weekStart = F.weekly.weekStart;

function rowsFor(ed) {
  const rows = [];
  for (const code of ORDER) {
    const w = F.sets[code].weekly[ed];   // 마지막 점·7일 전 점·WoW·4주·이번 주 여부·매물 수(Δ 7일)
    if (!w) continue;
    rows.push({ code, name: F.sets[code].nameEn || code, last: w.last, prev: w.prev, wow: w.wow, c4: w.c4, isThisWeek: w.isThisWeek, listed: w.listed, listedPrev: w.listedPrev });
  }
  // 이번 주 점이 있는 세트를 WoW 순으로, 그 뒤에 이번 주 점이 없는 세트(마지막 판매 주 표기)
  rows.sort((a, b) => (b.isThisWeek ? 1 : 0) - (a.isThisWeek ? 1 : 0) || (b.wow ?? -Infinity) - (a.wow ?? -Infinity));
  return rows;
}

function table(ed, rows) {
  const href = (r) => ed === "jp" ? `sets/${r.code.toLowerCase()}.html` : `sets/${r.code.toLowerCase()}-english.html`;
  const tr = rows.map((r) => `<tr${r.isThisWeek ? "" : ' class="stale"'}><td><a href="${href(r)}">${esc(r.code)}</a></td><td>${esc(r.name)}</td><td class="num">${r.prev ? usd(r.prev.median) : "—"}</td><td class="num"><b>${usd(r.last.median)}</b>${r.isThisWeek ? "" : `<small class="when"> wk ${esc(r.last.d.slice(5))}</small>`}</td>${pctCell(r.wow)}${pctCell(r.c4)}<td class="num">${r.last.vol != null ? r.last.vol : "—"}<small> / n=${r.last.n}</small></td><td class="num">${r.listed != null ? r.listed : "—"}${r.listed != null && r.listedPrev != null && r.listed !== r.listedPrev ? `<small class="${r.listed > r.listedPrev ? "up" : "down"}"> ${r.listed > r.listedPrev ? "+" : ""}${r.listed - r.listedPrev}</small>` : ""}</td></tr>`).join("\n");
  return `<div style="overflow-x:auto"><table class="wkTable">
        <thead><tr><th>Set</th><th>Name</th><th>Last week</th><th>This week</th><th>WoW</th><th>4-wk</th><th>Sales · n</th><th>Listed (Δ wk)</th></tr></thead>
        <tbody>
${tr}
        </tbody></table></div>`;
}

const jpRows = rowsFor("jp");
const enRows = rowsFor("en");
const jpThis = jpRows.filter((r) => r.isThisWeek && r.wow != null);
const up = jpThis.filter((r) => r.wow > 0.5).length, down = jpThis.filter((r) => r.wow < -0.5).length;
const volJp = jpRows.filter((r) => r.isThisWeek).reduce((a, r) => a + (r.last.vol || 0), 0);
const volEn = enRows.filter((r) => r.isThisWeek).reduce((a, r) => a + (r.last.vol || 0), 0);

// 일본판 PSA 등급 증가 — 세트별 마지막 구간(psaWeekly.last = 원장 스냅샷 f → d). 10일 넘게 낡았으면 표를 내지 않는다(옛 값을 최신으로 읽히지 않게).
// 2026-11-20: 구간이 GemRate 갱신일을 따라 늘 7일이 아니다(10-27 → 11-13 = 17일) — "this week · Prev week · WoW" 대신 제목에 시작 → 끝(날짜 수),
//   직전 열 제목 밑에 직전 구간의 시작 → 끝(MM-DD — 390px 한 화면 표 .tblFit 에 들어가게)을 쓴다.
//   직전 값은 바로 앞 구간(prev.d = 이번 구간 시작)일 때만, % 는 두 구간 날짜 수가 같을 때만 — 아니면 "—".
//   출처 이름은 쓰지 않는다(weekly.html 은 외부 업체명 금지 — 가드 VN1).
let gradeTable = "", gradeTo = null;
{
  const rows = [];
  for (const code of ORDER) {
    const w = F.sets[code].psaWeekly;   // 사실 파일: last·prev — 점마다 {d, v, f, days}
    if (!w) continue;
    rows.push({ code, name: F.sets[code].nameEn || code, last: w.last, prev: w.prev && w.prev.d === w.last.f ? w.prev : null });
  }
  const latest = F.psaWeekly.gradeTo;   // 가장 늦은 구간 끝 — 시리즈 갱신일 기준 10일 넘게 낡았으면 null(빌더)
  const cur = rows.filter((r) => r.last.d === latest).sort((a, b) => b.last.v - a.last.v);
  if (cur.length) {
    gradeTo = latest;
    const win = cur[0].last;   // 같은 끝 날짜 = 같은 구간(빌더가 확인)
    const pw = (cur.find((r) => r.prev) || {}).prev || null;
    const total = cur.reduce((a, r) => a + r.last.v, 0);
    const pctOf = (r) => (r.prev && r.prev.v > 0 && r.prev.days === r.last.days ? (r.last.v / r.prev.v - 1) * 100 : null);
    // 2026-10-15: 외부 업체명(가드 S4 원칙)과 해석 문장("Grades measure submission activity, not boxes opened.")을 뺐다 — 라벨만.
    gradeTable = `<h2 id="grading" data-ko="세트별 PSA 등급 증가 — 집계 스냅샷 ${esc(win.f)} → ${esc(win.d)} (${win.days}일)">PSA grades added by set — population snapshots ${esc(win.f)} → ${esc(win.d)} (${win.days} day${win.days === 1 ? "" : "s"})</h2>
      <p class="note" data-ko="일본판 · 합계 ${total.toLocaleString("en-US")}장 · % = 두 구간 날짜 수가 같을 때만">Japanese · total ${total.toLocaleString("en-US")} · % only when both intervals have the same number of days</p>
      <div style="overflow-x:auto"><table class="wkTable tblFit">
        <thead><tr><th>Set</th><th>Name</th><th>New grades</th><th>Previous interval${pw ? `<br /><small>${esc(pw.f.slice(5))} → ${esc(pw.d.slice(5))}</small>` : ""}</th><th>Change %</th></tr></thead>
        <tbody>
${cur.map((r) => `<tr><td><a href="sets/${r.code.toLowerCase()}.html">${esc(r.code)}</a></td><td>${esc(r.name)}</td><td class="num"><b>${r.last.v.toLocaleString("en-US")}</b></td><td class="num">${r.prev ? r.prev.v.toLocaleString("en-US") : "—"}</td>${pctCell(pctOf(r))}</tr>`).join("\n")}
        </tbody></table></div>`;
  }
}

const title = `One Piece Box Prices This Week — week ending ${weekEnd}`;
// 설명문 = 표에 보이는 값만(2026-10-15 소유자 결정). "Tables from our eBay sold ledger, dated per row." 같은 사이트 설명을 빼고(162자 → 160자 초과였다)
// 표 1행(WoW 가장 큰 일본판 세트)을 넣는다. 값·표기는 표 WoW 칸(pctCell)과 같다.
const topJp = jpThis.slice().sort((a, b) => b.wow - a.wow)[0] || null;
const desc = `Week ending ${weekEnd}: ${up} Japanese boxes up, ${down} down week over week${topJp ? ` · top ${topJp.code} ${topJp.wow > 0 ? "+" : ""}${topJp.wow.toFixed(1)}%` : ""} · ${volJp} JP and ${volEn} EN completed eBay box sales.`;
const ld = JSON.stringify({
  "@context": "https://schema.org", "@type": "Dataset",
  name: "One Piece booster box prices — weekly table", description: desc, url: `${SITE}/weekly.html`,
  // 수정일 ≥ 기간 끝(weekEnd) — 2026-10-15 감사(#4): 기간 …/10-15 인데 dateModified 10-14 였다.
  temporalCoverage: `${weekStart}/${weekEnd}`, dateModified: [DATA_DATE, weekEnd].filter(Boolean).sort().pop(), license: "https://creativecommons.org/licenses/by/4.0/",
  creator: { "@type": "Organization", name: "OP Box Index", url: SITE },
  // 내려받기 파일을 걸지 않는다 — opbox-set-prices.csv 는 이 주간 표가 아니라 세트별 현재 시세 스냅샷이다(기간이 다르다, 2026-10-14 QA).
});

// 2026-10-15 소유자 결정: 정의 줄은 라벨 토막만 — "(same figure as the home page)" 같은 설명과 "Sets without a point … are dimmed" 문장을 범례 라벨로 바꿨다.
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <!-- 광고 없음: 표 페이지는 애드센스 허용 목록 밖(audit-adsense-readiness), 심사 중 광고 코드 변경 금지 -->
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${SITE}/weekly.html" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${SITE}/weekly.html" />
    <meta property="og:image" content="${SITE}/og/og-compare.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${ld}</script>
    <link rel="stylesheet" href="styles.css?v=${CACHE}" />
    <script defer src="lang-toggle.js?v=${CACHE}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .wkTable { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 10px 0 4px; }
      .wkTable th { text-align: right; padding: 8px 9px; border-bottom: 1px solid #2a3140; color: #9aa4b6; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
      .wkTable th:nth-child(1), .wkTable th:nth-child(2) { text-align: left; }
      .wkTable td { padding: 7px 9px; border-bottom: 1px solid rgba(255,255,255,.05); font-variant-numeric: tabular-nums; }
      .wkTable td.num { text-align: right; white-space: nowrap; }
      .wkTable td.up, .wkTable small.up { color: var(--accent); } .wkTable td.down, .wkTable small.down { color: var(--red); } .wkTable td.flat { color: #9aa4b6; }
      .wkTable small { font-size: 11.5px; color: var(--muted); }
      /* 낡은 행 — 투명도 대신 색으로 흐린다(2026-11-18, 대비 미달 27건). 등락 색은 한 단계 어둡게, 날짜 꼬리표(.when)는 노랑 그대로. */
      .wkTable tr.stale td { color: var(--muted); } .wkTable tr.stale td b { color: #c3cad8; }
      .wkTable tr.stale :is(td.up, small.up) { color: #2fa3b6; } .wkTable tr.stale :is(td.down, small.down) { color: #e0596a; }
      .wkTable tr.stale td .when { color: #f5c842; }
      .wkSummary { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 6px; }
      .wkSummary span { padding: 5px 11px; border: 1px solid #2a3140; border-radius: 999px; font-size: 12.5px; color: #cfd6e4; font-variant-numeric: tabular-nums; }
      .wkSummary b { color: #eef2ff; }
      h2 { margin-top: 30px; }
      .note { color: #9aa4b6; font-size: 12.5px; line-height: 1.6; }
      /* 세트 코드 한 줄('OP-'/'10' 두 줄로 행이 두 배였다), 이름 열은 왼쪽(공용 규칙이 오른쪽으로 덮었다) — 2026-11-18 */
      .wkTable td:first-child { white-space: nowrap; }
      .bodyPage table.wkTable :is(th, td):nth-child(2) { text-align: left; }
      @media (max-width: 640px) { .wkTable td:nth-child(2) { display: none; } .wkTable th:nth-child(2) { display: none; }
        .wkTable th, .wkTable td { padding: 7px 6px; }
        .wkTable :is(th, td):first-child { position: sticky; left: 0; z-index: 1; background: var(--bg); } }
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="./"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("")}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow" data-ko="이번 주 · 주 ${esc(weekStart)} – ${esc(weekEnd)} · 데이터 ${esc(DATA_DATE)} · 매주 갱신">This week · ${esc(weekStart)} – ${esc(weekEnd)} · data ${esc(DATA_DATE)} · refreshed weekly</p>
      <h1 data-ko="원피스 박스 시세 — 이번 주">One Piece booster box prices — this week</h1>
      <div class="wkSummary" aria-label="Week summary">
        <span data-ko-html="일본판 주간 <b>▲ ${up}</b> · <b>▼ ${down}</b>">JP week over week <b>▲ ${up}</b> · <b>▼ ${down}</b></span>
        <span data-ko-html="이번 주 실거래 <b>${volJp}</b> JP · <b>${volEn}</b> EN">Completed sales this week <b>${volJp}</b> JP · <b>${volEn}</b> EN</span>
        <span data-ko-html="세트 <b>${ORDER.length}</b> · USD · 이베이 즉시구매 실거래">Sets <b>${ORDER.length}</b> · USD · eBay Buy-It-Now sales</span>
      </div>
      <p class="note" data-ko-html="이번 주 = 주간 점 ${esc(weekEnd)} · &quot;Last week&quot; = 정확히 7일 전 점(없으면 —) · 4-wk = 28일 이상 전 마지막 점 대비 · Sales = 그 주 실거래 건수, n = 중앙값이 딛고 선 표본 · Listed = 지금 올라와 있는 검수 통과 매물 수(Δ = 7일 전 대비) · 흐린 행 = 이번 주 점 없음(wk = 마지막 판매 주) · <a href=&quot;methodology.html#box-median&quot;>규칙</a>">This week = the weekly point dated ${esc(weekEnd)} · "Last week" = the point exactly 7 days earlier (— if missing) · 4-wk = vs the last point 28+ days earlier · Sales = completed sales that week; n = the sample under the median · Listed = verified listings on sale now (Δ vs 7 days earlier) · dimmed row = no point this week (wk = last sale week) · <a href="methodology.html#box-median">Rules</a></p>

      <h2 id="jp" data-ko="일본판 박스 — 주간 변화">Japanese boxes — week over week</h2>
      ${table("jp", jpRows)}

      <h2 id="en" data-ko="영문판 박스 — 주간 변화">English boxes — week over week</h2>
      ${table("en", enRows)}

      ${gradeTable}

      <p class="note" style="margin-top:22px" data-ko-html="같은 숫자의 다른 화면: <a href=&quot;./&quot;>홈(4주 등락·그래프)</a> · <a href=&quot;box-prices.html&quot;>전체 박스 시세</a> · <a href=&quot;sets/index.html&quot;>세트 가이드</a> · <a href=&quot;market-2026.html&quot;>2026 월별</a> · <a href=&quot;free-data.html&quot;>CSV/JSON</a>">Same numbers, other views: <a href="./">home (4-week movers, charts)</a> · <a href="box-prices.html">all box prices</a> · <a href="sets/index.html">set guides</a> · <a href="market-2026.html">2026 by month</a> · <a href="free-data.html">CSV / JSON</a></p>
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation"><a href="sets/index.html">Set Guides</a><a href="psa-grading.html">Grading Population</a><a href="ko/">한국어 시세</a><a href="about.html">About</a><a href="methodology.html">Methodology</a><a href="changelog.html">Changelog</a><a href="privacy.html">Privacy</a><a href="disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "weekly.html"), html, "utf8");

// 사이트맵 idempotent 등재 + lastmod 갱신
{
  const smPath = path.join(ROOT, "sitemap.xml");
  let sm = fs.readFileSync(smPath, "utf8");
  const loc = `${SITE}/weekly.html`;
  let added = 0;
  if (!sm.includes(`<loc>${loc}</loc>`)) {
    sm = sm.replace("</urlset>", `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${DATA_DATE}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`);
    added = 1;
  } else {
    sm = sm.replace(new RegExp(`(<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>\\s*<lastmod>)[^<]*`), `$1${DATA_DATE}`);
  }
  fs.writeFileSync(smPath, sm, "utf8");
  console.log(JSON.stringify({ wrote: "weekly.html", weekEnd, jpRows: jpRows.length, enRows: enRows.length, up, down, volJp, volEn, gradeTo, sitemapAdded: added }));
}
