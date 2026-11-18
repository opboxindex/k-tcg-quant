// 무료 데이터셋 생성 — /free-data.html + CSV 3종
// 목적: 피인용(백링크)으로 도메인 신뢰도를 올리는 자산. 색인 병목의 실제 원인이 외부링크 부족이라 이걸 겨냥.
//
// 2026-07-29 개편: 박스 시세 21줄만 내주던 걸 바꿨다. 그 표는 홈에도 그대로 있어서
// 굳이 받을 이유가 없었고(소유자 지적), 정가 대비 배수·재판 횟수는 각각 쓸모없다고 판단되었거나
// 세트 페이지로 옮겨갔다. 대신 우리만 가진 두 가지를 낸다:
//   ① 등급 인구 — PSA/CGC/TAG 3사를 세트별·판별로 쪼갠 것. 이렇게 나눠 내는 곳이 없다.
//   ② 경매 실거래 — 일별 낙찰가 중앙값·낙찰률·입찰경쟁. eBay 도 무료로는 안 준다.
//
// ⚠️ 원시 리스팅 덤프 금지 — "파생 집계"만 낸다. 외부 소스명 표기 금지(가드 S1).
// ⚠️ 판별·등급사 합산 금지. 합치면 젬률도 낙찰률도 아무것도 설명하지 못하는 값이 된다.
// Run: node tools/generate-free-data.js
const fs = require("fs");
const { navHtml } = require("./site-nav");
const path = require("path");
const {
  AUCTION_HEAD, BOX_HEAD, GRADE_HEAD,
  buildAuctionRecords, buildBoxRecords, buildGradeRecords,
} = require("./free-data-records");
const ROOT = path.join(__dirname, "..");
const SITE = "https://opboxindex.com";
const CACHE = (require("fs").readFileSync(require("path").join(__dirname, "..", "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";  // 하드코딩 금지 — 범프 때 가드 V1 이 배포를 막는다(2026-07-27)

// 사실(데이터일·환율·Dataset 기간/수정일·카드리스트 목록)은 사실 파일에서 — 2026-10-15(F4). packs 는 CSV 행 생성(free-data-records.js — 행 생성기는 packs 를 받는다)에만 쓴다.
const F = require("./build-site-facts").load();
const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "onepiece-packs.json"), "utf8"));
const fx = F.fx;
const DATA_DATE = F.dataDate || "";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// CSV 셀: 쉼표/따옴표/개행 있으면 인용부호 처리
const cell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const maxDate = (dates) => dates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")).sort().at(-1) || "";
const temporalCoverage = (dates) => {
  const valid = dates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")).sort();
  return valid.length ? `${valid[0]}/${valid.at(-1)}` : null;
};

const writeCsv = (name, head, records) => {
  const lines = records.map((record) => head.map((key) => cell(record[key])).join(","));
  fs.writeFileSync(path.join(ROOT, name), [head.join(","), ...lines].join("\n") + "\n", "utf8");
  return lines.length;
};

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", p), "utf8")); } catch { return null; } };
const { records: priceRecords, dates: priceDates } = buildBoxRecords(d);
const { records: gradeRecords, dates: gradeDates } = buildGradeRecords(d, readJson("cgc-grading-history.json"), readJson("tag-grading-history.json"));
const { records: auctionRecords, dates: auctionDates } = buildAuctionRecords(readJson("auction-sold.json"), readJson("auction-series.json"));
// Dataset 기간·수정일은 사실 파일 coverage(aiData·grading·boxCsv·cardLists — tools/dataset-coverage.js 와 같은 값)에서. span → dataset() 인수(modified·dates) 꼴로.
//   aiData.modified = datasetUpdatedOn 이상(파일에 실린 관측일 중 가장 늦은 날) · CSV = 행 관측일의 첫날/마지막 날(없으면 데이터일).
const fromSpan = (sp, fallback) => (sp ? { modified: sp.modified || sp.to, dates: [sp.from, sp.to] } : { modified: fallback, dates: [] });
// AI 확장 파일(카드·등급·경매) Dataset 의 수정일·기간 = 그 파일 자체 — 2026-10-15(3차).
//   수정일 = 파일 datasetUpdatedOn, 기간 = 파일 안 관측 행 날짜의 처음~끝(tools/dataset-coverage.extraSpan — psa-grading 의 같은 파일과 한 함수).
//   종전엔 CSV·핵심 피드 날짜로 셈해 #ai-grading-json·#ai-auctions-json 이 dateModified 10-14, 파일 datasetUpdatedOn 은 10-15 였다(가드 DS1).
const extraDates = (file) => { const sp = require("./dataset-coverage").extraSpan(file); return sp ? { modified: sp.modified, dates: [sp.from, sp.to] } : { modified: DATA_DATE, dates: [] }; };
const nPrices = writeCsv("opbox-set-prices.csv", BOX_HEAD, priceRecords);
const nGrades = writeCsv("opbox-grading-population.csv", GRADE_HEAD, gradeRecords);
const nAuctions = writeCsv("opbox-auction-daily.csv", AUCTION_HEAD, auctionRecords);

// ---- 랜딩 페이지
// 미리보기 — 등급 인구를 앞세운다. 이게 이 페이지에서 유일하게 다른 데 없는 표다.
// 미리보기 표에는 날짜 칸이 없다 — Pristine 10 은 CGC 총량과 같은 관측일 때만 싣는다(2026-09-30:
// 9/29 총량 옆에 8/3 Pristine 10 이 '현재'처럼 붙어 있었다). CSV 는 *_as_of 로 날짜를 따로 싣는다.
const gradePreview = gradeRecords.slice(0, 8).map((record) => {
  const td = (v) => `<td class="num">${v === "" ? "—" : esc(v)}</td>`;
  const pristine = record.cgc_grade_split_as_of && record.cgc_grade_split_as_of === record.cgc_total_as_of ? record.cgc_pristine10 : "";
  return `<tr><td>${esc(record.set_code)}</td><td>${record.edition === "japanese" ? "Japanese" : "English"}</td>${td(record.psa_total)}${td(record.psa10_rate_pct === "" ? "" : record.psa10_rate_pct + "%")}${td(record.cgc_total)}${td(pristine)}${td(record.tag_total)}</tr>`;
}).join("\n");

const publisher = { "@type": "Organization", name: "OP Box Index", url: `${SITE}/` };
const dataset = ({ id, name, description, modified, dates, variables, format, contentUrl }) => ({
  "@type": "Dataset", "@id": `${SITE}/free-data.html#${id}`, name, description,
  url: `${SITE}/free-data.html#${id}`,
  license: "https://creativecommons.org/licenses/by/4.0/",
  isAccessibleForFree: true,
  // 수정일은 기간 끝보다 이를 수 없다 — 2026-10-15 감사(#4): ai-json 등이 dateModified 10-14 · 기간 …/10-15 였다.
  dateModified: maxDate([modified, ...dates]),
  ...(temporalCoverage(dates) ? { temporalCoverage: temporalCoverage(dates) } : {}),
  creator: publisher,
  variableMeasured: variables,
  distribution: { "@type": "DataDownload", encodingFormat: format, contentUrl },
});
const datasets = [
  dataset({ id: "ai-json", name: "One Piece TCG box markets and Top 7 hits", description: `Compact AI-ready JSON for ${nPrices} tracked sets, with completed sales and active asking prices separated and field-level freshness and sample sizes.`, ...fromSpan(F.coverage.aiData, F.ai.datasetUpdatedOn), variables: ["setCode", "boxMarket", "topHits", "rawNmAsk", "psa10Sold", "psaPopulation", "citationUrl"], format: "application/json", contentUrl: `${SITE}/opbox-ai-data.json` }),
  // 확장 AI 파일 3개 — 2026-09-08. 핵심 JSON 은 200KB 규칙이라 카드 전체·등급·경매는 따로 낸다(답변 엔진·Dataset 검색용).
  dataset({ id: "ai-cards-json", name: "Every tracked One Piece card variant with raw NM and PSA 10 prices", description: "One entry per published card price page: card number, variant name, container set, Japanese retail NM asking price, verified PSA 10 sold median with sample size, PSA population and the citation URL.", ...extraDates("opbox-ai-cards.json"), variables: ["cardNumber", "name", "containerSetCode", "rawNmAsk", "psa10Sold", "psaPopulation", "url"], format: "application/json", contentUrl: `${SITE}/opbox-ai-cards.json` }),
  dataset({ id: "ai-grading-json", name: "Graded population per set (PSA, CGC, TAG) as JSON", description: "Latest graded counts and gem rates per set and printing for PSA, CGC and TAG, each with its own observation date; PSA, CGC and TAG counted separately.", ...extraDates("opbox-ai-grading.json"), variables: ["setCode", "japanese", "english", "psa", "cgc", "tag", "gemRatePct", "observedOn"], format: "application/json", contentUrl: `${SITE}/opbox-ai-grading.json` }),
  dataset({ id: "ai-auctions-json", name: "Settled eBay auction results as JSON — One Piece and 13 trading card games", description: "Settled One Piece auctions (daily, weekly, by set: ended, sold, sell-through, winning-bid totals and medians) plus daily sell-through and winning-bid medians for 13 trading card games.", ...extraDates("opbox-ai-auctions.json"), variables: ["date", "ended", "sold", "sellThroughPct", "amountUsd", "medianWinningBidUsd", "byCategory", "games"], format: "application/json", contentUrl: `${SITE}/opbox-ai-auctions.json` }),
  dataset({ id: "grading-csv", name: "Grading population by set, printing and grader", description: `${nGrades} set-edition rows. PSA, CGC and TAG counts remain separate and each grader keeps its own observation date.`, ...fromSpan(F.coverage.grading, DATA_DATE), variables: GRADE_HEAD, format: "text/csv", contentUrl: `${SITE}/opbox-grading-population.csv` }),
  dataset({ id: "auction-csv", name: "Completed auction results by day", description: "Settled auction counts, sold counts, sell-through, median winning bids and bid counts by product type.", modified: maxDate(auctionDates) || DATA_DATE, dates: auctionDates, variables: AUCTION_HEAD, format: "text/csv", contentUrl: `${SITE}/opbox-auction-daily.csv` }),
  dataset({ id: "box-csv", name: "Japanese and English booster box market snapshots", description: `${nPrices} sets with completed-sale medians and active asking-price medians kept separate, including sample sizes and observation dates.`, ...fromSpan(F.coverage.boxCsv, DATA_DATE), variables: BOX_HEAD, format: "text/csv", contentUrl: `${SITE}/opbox-set-prices.csv` }),
];
// 세트별 공식 카드리스트 CSV·JSON(generate-card-list-pages.js 산출) — 2026-10-14(W7). 카드 사실은 반다이 공식 목록이라
// CC BY 를 붙이지 않는다(우리 숫자 열만 CC BY — 파일 안 notes 에 적혀 있다). 그래서 dataset() 헬퍼를 쓰지 않는다.
const CARD_LISTS = F.cardLists;
// 카드리스트 기간 = 공식 목록 확인일과 우리 숫자 관측일(NM·경매 through·PSA 10)의 범위, 수정일 = 세트 페이지 날짜(= JSON "updated")의 최댓값 —
// 사실 파일 coverage.cardLists(카드리스트 페이지·JSON 과 같은 값, 2026-10-15). 종전엔 세트 JSON 을 다시 읽어 셌다.
const CARD_LIST_SPAN = F.coverage.cardLists ? F.coverage.cardLists.coverage : null;
const CARD_LIST_UPDATED = F.coverage.cardLists ? F.coverage.cardLists.modified : "";
if (CARD_LISTS.length) {
  datasets.push({
    "@type": "Dataset", "@id": `${SITE}/free-data.html#card-lists`,
    name: "One Piece Card Game official card lists by set (Japanese edition) with matched prices",
    description: `${CARD_LISTS.length} sets, one row per official card ID (${CARD_LISTS.reduce((s, p) => s + p.counts.cards, 0)} cards): number, English and Japanese names, rarity, type, color, cost or life, power and counter from Bandai's official card lists, plus OP Box Index raw NM, auction and PSA 10 prices where the card ID matches by rule.`,
    url: `${SITE}/free-data.html#card-lists`, isAccessibleForFree: true, dateModified: CARD_LIST_UPDATED || maxDate([DATA_DATE, ...String(CARD_LIST_SPAN || "").split("/")]), creator: publisher,
    // 라이선스는 둘로 나뉜다 — 우리 숫자 열(nm·auction·psa10)은 CC BY 4.0, 카드 사실 열은 반다이 공식 목록(출처 링크) — 2026-10-14 QA.
    license: { "@type": "CreativeWork", name: "OP Box Index numbers (nm, auction, psa10 columns): CC BY 4.0. Card facts: Bandai official card list (see isBasedOn), not relicensed.", url: `${SITE}/free-data.html#card-lists` },
    ...(CARD_LIST_SPAN ? { temporalCoverage: CARD_LIST_SPAN } : {}),
    isBasedOn: "https://www.onepiece-cardgame.com/cardlist/",
    variableMeasured: ["id", "number", "print", "rarity", "type", "name_en", "name_ja", "color", "cost", "power", "counter", "nm_usd", "auction_jp_median_usd", "auction_en_median_usd", "psa10_usd"],
    distribution: CARD_LISTS.flatMap((p) => [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/sets/${p.slug}-card-list.csv`, name: `${p.code} card list (CSV)` },
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE}/sets/${p.slug}-card-list.json`, name: `${p.code} card list (JSON)` },
    ]),
  });
}
// 카탈로그 수정일 — 화면 "Page regenerated" 와 같은 값(2026-10-15, 4차: 화면 10-14 · DataCatalog 10-15 였다).
const CATALOG_DATE = maxDate([DATA_DATE, ...datasets.map((item) => item.dateModified)]);
const datasetLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "DataCatalog", "@id": `${SITE}/free-data.html#catalog`, name: "OP Box Index free One Piece TCG datasets", description: "Citable box-market, Top 7 card, grading-population and completed-auction aggregates.", url: `${SITE}/free-data.html`, dateModified: CATALOG_DATE, publisher, dataset: datasets.map((item) => ({ "@id": item["@id"] })) },
    ...datasets,
  ],
});

// 2026-10-15 소유자 결정(데이터 페이지 = 숫자·표·라벨만): 소개·방법 문단("One compact JSON feed …", "How it's built",
// "Update frequency", 각 파일의 설명 문단)을 지우고, 뜻이 필요한 것은 필드 정의 라벨(행 = … · 열 = …)로 옮겼다.
// "Page regenerated" 날짜는 CL3 가드가 DataCatalog dateModified 와 대조한다 — 꼴을 바꾸지 말 것.
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${SITE}/free-data.html" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <title>Free One Piece TCG Data — Box Prices, Cards, Grading</title>
    <meta name="description" content="Free CC BY 4.0 One Piece TCG data in JSON and CSV: box sold prices vs active asks, chase cards, grading population and completed auctions, with dates." />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Free One Piece TCG Data — Box Prices, Cards, Grading" />
    <meta property="og:description" content="AI-ready JSON plus CSV downloads with explicit sold/ask labels, samples and observation dates. Free under CC BY 4.0." />
    <meta property="og:url" content="${SITE}/free-data.html" />
    <meta property="og:image" content="${SITE}/og/og-set-list.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${datasetLd}</script>
    <link rel="stylesheet" href="styles.css?v=${CACHE}" />
    <script defer src="lang-toggle.js?v=${CACHE}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .dlRow { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
      .dlRow a { display: inline-block; padding: 12px 20px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px; }
      .dlRow .primary { background: var(--accent); color: #08131a; }
      .dlRow .ghost { border: 1px solid #2a3140; color: #cfd6e4; }
      .dTable { width: 100%; max-width: 760px; border-collapse: collapse; font-size: 13.5px; margin: 10px 0; }
      .dTable th { text-align: right; padding: 8px 10px; border-bottom: 1px solid #2a3140; color: #9aa4b6; font-size: 12.5px; font-weight: 600; }
      .dTable th:nth-child(1), .dTable th:nth-child(2) { text-align: left; }
      .dTable td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); font-variant-numeric: tabular-nums; }
      .dTable td.num { text-align: right; }
      .dTable td:first-child { white-space: nowrap; }
      .bodyPage table.dTable :is(th, td):nth-child(2) { text-align: left; }
      .fields { font-size: 13.5px; color: #9aa4b6; line-height: 1.9; max-width: 760px; }
      .fields code { color: var(--accent); background: rgba(var(--accent-rgb), .08); padding: 1px 6px; border-radius: 5px; }
      .attrBox { margin: 16px 0; padding: 12px 16px; border: 1px solid rgba(var(--accent-rgb), .28); background: rgba(var(--accent-rgb), .05); border-radius: 12px; max-width: 760px; font-size: 13.5px; line-height: 1.7; }
      .attrBox code { display: block; margin-top: 6px; color: #cfd6e4; background: rgba(255,255,255,.04); padding: 8px 10px; border-radius: 8px; font-size: 12.5px; }
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="./"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("")}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow" data-ko="무료 데이터 · CC BY 4.0">Free data · CC BY 4.0</p>
      <h1 data-ko="원피스 TCG 무료 데이터 — 박스 시장·상위 7개 카드·그레이딩">Free One Piece TCG data — box markets, Top 7 cards and grading</h1>

      <div class="dlRow">
        <a class="primary" href="opbox-ai-data.json" download>AI-ready market data (JSON)</a>
        <a class="primary" href="opbox-grading-population.csv" download>Grading population (${nGrades} rows)</a>
        <a class="primary" href="opbox-auction-daily.csv" download>Auction results by day (${nAuctions} rows)</a>
        <a class="ghost" href="opbox-set-prices.csv" download>Box market snapshots (${nPrices} sets)</a>
      </div>
      <p class="note">For answer engines and crawlers: <a href="llms.txt">llms.txt</a> · <a href="llms-full.txt">llms-full.txt</a> · <a href="opbox-ai-cards.json">opbox-ai-cards.json</a> · <a href="opbox-ai-grading.json">opbox-ai-grading.json</a> · <a href="opbox-ai-auctions.json">opbox-ai-auctions.json</a> · <a href="feed.xml">RSS</a></p>
      <p class="note">Page regenerated ${esc(CATALOG_DATE)} · FX ₩${fx.usdKrw}/$ (${esc(fx.date)})</p>

      <h2 id="ai-json">1. AI-ready box and Top 7 data — <code>opbox-ai-data.json</code></h2>
      <div class="fields">
        <span data-ko="상품 ${nPrices}종 · 세트별 상위 7개 카드 변형">${nPrices} tracked products · Top 7 exact card variants per set</span><br />
        <code>schemaVersion</code> · <code>datasetUpdatedOn</code> · <code>license</code> — schema version · dataset date · license<br />
        <code>boxMarket.japanese</code> · <code>boxMarket.english</code> — <code>sold</code> = completed-sale sample · <code>activeAsk</code> = listings for sale (separate fields)<br />
        <code>topHits</code> — rank, card number, variant name, raw NM ask, verified PSA 10 sold sample, PSA population<br />
        <code>sampleSize</code> · <code>observedOn</code> · <code>ageDaysAtDatasetUpdate</code> — sample size · observation date · age in days at dataset date<br />
        <code>citationUrl</code> — OP Box Index page for the product
      </div>

      <h2 id="grading-csv">2. Grading population — <code>opbox-grading-population.csv</code></h2>
      <div class="fields">
        <span data-ko="행 = 세트 × 판(일본판·영문판) · 감정사별 열">Row = set × printing (Japanese / English) · one column group per grader</span><br />
        <code>set_code</code> · <code>edition</code> — <code>japanese</code> or <code>english</code><br />
        <code>psa_total</code> · <code>psa10_rate_pct</code> · <code>psa_weekly_add</code> — cumulative PSA count · PSA 10 share · added in the latest recorded week<br />
        <code>cgc_total</code> · <code>cgc_pristine10</code> · <code>cgc_gem_mint10</code> — CGC total · Pristine 10 (above Gem Mint 10) · Gem Mint 10<br />
        <code>tag_total</code> · <code>tag_10</code> · <code>tag_10p</code> — TAG total · 10 · 10P (above 10)<br />
        <code>*_as_of</code> — source date per value · blank = unverified (not 0)
      </div>

      <h2 id="grading-preview" data-ko="미리보기 — 그레이딩 인구">Preview — grading population</h2>
      <div style="overflow-x:auto">
      <table class="dTable" tabindex="0" aria-labelledby="grading-preview">
        <thead><tr><th>Set</th><th>Printing</th><th>PSA</th><th>PSA 10 rate</th><th>CGC</th><th>Pristine 10</th><th>TAG</th></tr></thead>
        <tbody>
${gradePreview}
        </tbody>
      </table>
      </div>

      <h2 id="auction-csv">3. Auction results by day — <code>opbox-auction-daily.csv</code></h2>
      <div class="fields">
        <span data-ko="행 = 날짜 × 상품 종류">Row = day × product type</span> · <a href="auction.html" data-ko="경매 결과 페이지">auction results page</a><br />
        <code>date</code> · <code>kind</code> — <code>all</code>, <code>box</code>, <code>card</code> or <code>pack</code><br />
        <code>auctions</code> · <code>sold</code> · <code>sell_through_pct</code> — auctions closed (unsold included) · sold · sold ÷ closed<br />
        <code>median_price_usd</code> — median final winning bid (read after close), per item for multi-item lots<br />
        <code>median_bids</code> — median bid count
      </div>

      <h2 id="box-csv">4. Japanese and English booster box markets — <code>opbox-set-prices.csv</code></h2>
      <div class="fields">
        <span data-ko="행 = 추적 상품 · 일본판·영문판 열 분리">Row = tracked product · Japanese and English columns separate</span><br />
        <code>jp_sold_*</code> · <code>en_sold_*</code> — completed-sale median · P25 / P75 · sample size · sample date<br />
        <code>jp_active_*</code> · <code>en_active_*</code> — active-ask median · P15 / P85 · verified listing count · observation date
      </div>

${CARD_LISTS.length ? `      <h2 id="card-lists" data-ko="5. 세트별 공식 카드 리스트">5. Official card lists by set — <code>sets/&lt;code&gt;-card-list.csv</code> · <code>.json</code></h2>
      <div class="fields">
        <span data-ko="행 = 공식 카드 ID(일본판)">Row = official card ID (Japanese edition)</span> · card facts: Bandai official card list (URL and checked date in each file)<br />
        <code>nm_usd</code> · <code>auction_jp_median_usd</code> · <code>auction_en_median_usd</code> · <code>psa10_usd</code> — matched card ID only, blank otherwise
      </div>
      <ul class="note">
        ${CARD_LISTS.map((p) => `<li><b>${esc(p.code)}</b> <a href="sets/${p.slug}-card-list.html">page</a> · <a href="sets/${p.slug}-card-list.csv">CSV</a> · <a href="sets/${p.slug}-card-list.json">JSON</a> · ${p.counts.cards} cards</li>`).join("\n        ")}
      </ul>

` : ""}      <div class="attrBox" id="terms">
        <strong>Attribution (CC BY 4.0)</strong> · <span data-ko="출처 표기">credit line</span>:
        <code>Data: OP Box Index — https://opboxindex.com/free-data.html</code>
      </div>
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation"><a href="sets/index.html">Set Guides</a><a href="psa-grading.html">Grading Population</a><a href="ko/">한국어 시세</a><a href="about.html">About</a><a href="methodology.html">Methodology</a><a href="privacy.html">Privacy</a><a href="disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "free-data.html"), html, "utf8");

// 사이트맵 idempotent 등재
{
  const smPath = path.join(ROOT, "sitemap.xml");
  let sm = fs.readFileSync(smPath, "utf8");
  const loc = `${SITE}/free-data.html`;
  let added = 0;
  if (!sm.includes(`<loc>${loc}</loc>`)) {
    sm = sm.replace("</urlset>", `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${DATA_DATE}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n</urlset>`);
    fs.writeFileSync(smPath, sm, "utf8");
    added = 1;
  }
  console.log(JSON.stringify({
    wrote: ["free-data.html", "opbox-grading-population.csv", "opbox-auction-daily.csv", "opbox-set-prices.csv"],
    gradingRows: nGrades, auctionRows: nAuctions, priceRows: nPrices, sitemapAdded: added,
  }));
}
