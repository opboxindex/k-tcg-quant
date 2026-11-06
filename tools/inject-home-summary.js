// 홈 정적 시세 요약 주입 — index.html / packs.html 의 마커 구간을 매일 갱신.
// 왜: 홈의 시세표는 packs.js가 JS로 렌더링해서, JS를 실행하지 않는 AI 크롤러·검색봇은 홈에서 가격을 하나도 못 읽었음
//     (홈은 현재 유일하게 색인된 페이지라 손실이 큼). 같은 데이터를 정적 HTML로도 굽는다.
// 표는 <details> 로 접어 둔다 — 이 표의 독자는 사람이 아니라 봇이고, 위쪽 JS 시세판과 같은 상품을
// 두 번 보여주면 화면만 길어진다. display:none 으로 숨기지 않는 이유는 그게 클로킹이기 때문이고,
// <details> 안의 내용은 구글이 정상 색인한다.
// ⚠️ head/canonical/hreflang 은 절대 건드리지 않는다(2026-07 홈 노출 0 사고).
// Run: node tools/inject-home-summary.js
const fs = require("fs");
const { navHtml } = require("./site-nav");
const { buyLink, AFF_TOP } = require("./set-page-shared");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const START = "<!-- HOME_SUMMARY:START -->";
const END = "<!-- HOME_SUMMARY:END -->";

const CACHE = (fs.readFileSync(path.join(ROOT, "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";
// 사실 한 벌(data/derived/site-facts.json, tools/build-site-facts.js) — 2026-10-15. 시세판(board)·최저/최고 박스(동가 전부)·4주 등락 집계·Dataset 기간이 여기서 온다.
const F = require("./build-site-facts").load();
// 홈에서 영문판 세트 페이지·상위 카드 페이지로 가는 링크가 0 이었다(2026-09-09 SEO 감사: 신규 154 URL 의 내부링크가 얕아 크롤 우선순위가 낮다).
// 시세표 행마다 영문판 페이지(있을 때)와 1위 카드 페이지(있을 때) 링크를 단다. 카드 슬러그는 generate-card-pages 산출물(card-map.json)에서 온다.
const CARD_MAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "cards", "card-map.json"), "utf8")); } catch { return {}; } })();
const cardSlug = (c) => (c && c.number ? CARD_MAP[c.number + "|" + String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")] : null);
// 공식 카드리스트가 있는 세트(사실 파일 cardLists ← data/official-cardlist.json) — generate-card-list-pages 와 같은 기준.
const CARD_LISTS = new Set(F.cardLists.map((p) => p.code));
// board 는 세트별 시세판 공급원으로만 쓴다 — 지수 숫자·개봉미터 표시는
// 2026-07-29 소유자 지시로 전부 삭제됨(값이 실제와 안 맞았음).
const DATA_DATE = F.dataDate;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));

// 세트번호 자연정렬(OP → EB → PRB) — 사실 파일 order.board.
const BOARD = Object.fromEntries(F.board.map((b) => [b.code, b]));
const rows = F.order.board.map((code) => BOARD[code]);

// 현재가 = board(= box-sold-series current.jp) — 2026-10-14 QA. 마지막 중앙값 점이 asOf 로부터 28일 밖이면 board 가 값·날짜·등락을
// 비워 둔다(build-market-index). 그 행은 "—" 로 남긴다 — 모든 표가 같은 규칙(값+그 날짜 / "—"). 날짜 칸은 그 중앙값 점의 날짜이고,
// n 은 그 점의 평균 창(windowDays, 28~56일) 안 판매 건수다(그 주 건수가 아니다).
const STALE_DAYS = 28;
const mmdd = (iso) => (iso ? iso.slice(5) : "—");
const NO_MEDIAN = `No sold median dated within ${STALE_DAYS} days (a median needs at least 6 sales in its window)`;
const nCell = (b) => (b.n != null ? `<small> n=${b.n}${b.windowDays ? `/${b.windowDays}d` : ""}</small>` : "");
// box-prices 표만 × MSRP 두 칸을 더 단다(2026-10-19) — 값은 사실 파일 board 의 msrpYen·msrpUsd·vsMsrp 그대로(일본판 박스 정가, 재계산 없음).
const yen = (v) => "¥" + Math.round(v).toLocaleString("en-US");
// 한 칸 두 줄(× MSRP / 정가 ¥) — 390px 한 화면 표(tblFit)에 두 칸을 더하면 82px 넘쳤다(audit-mobile-tables 실측).
const msrpTds = (b) => `<td class="num msrpCol">${b.vsMsrp != null ? b.vsMsrp.toFixed(1) + "×" : "—"}${b.msrpYen ? `<small style="display:block;color:var(--muted);font-size:11.5px">${yen(b.msrpYen)}</small>` : ""}</td>`;
const rowHtml = (withMsrp) => rows.map((b) => {
  const s = F.sets[b.code] || { cards: [] };
  const none = b.nowUsd == null;
  const chg = none ? null : b.changePct;
  const slug = b.code.toLowerCase();
  const enLink = fs.existsSync(path.join(ROOT, "sets", `${slug}-english.html`)) ? `<a href="sets/${slug}-english.html" title="English ${esc(b.code)} box price">EN box</a>` : "";
  const top = (s.cards || [])[0];
  const topSlug = cardSlug(top);
  const topLink = topSlug ? `<a href="cards/${topSlug}" title="${esc(top.name)} price">${esc(top.name)}</a>` : "";
  // 공식 카드리스트(sets/<code>-card-list.html) — 2026-10-16. 46장이 10-14 에 새로 났는데 홈에서 가는 링크가 0 이라 GSC 가 '알려지지 않은 URL' 로 봤다.
  const clLink = CARD_LISTS.has(b.code) ? `<a href="sets/${slug}-card-list.html" title="${esc(b.code)} official card list">Card list</a>` : "";
  // box-prices 표만 행마다 일본판 최저 실매물 링크(세트 페이지 구매 버튼과 같은 값 — 사실 파일 ask.jp) — 2026-11-02. 이 페이지는 유입이 많은데
  // 구매 링크가 0개였다. 이름 칸 아래 링크 줄에 넣어 표 폭(390px 한 화면)은 그대로 둔다. 홈 요약표(봇용 접힘)는 그대로.
  const ask = withMsrp && s.ask && s.ask.jp;
  const buy = ask ? buyLink({ url: ask.url, price: ask.total, spot: `bp-${slug}`, label: "eBay from" }) : "";
  // 구매 링크는 링크 줄(rowLinks)과 따로 한 줄 — 모바일(720px 이하)은 styles.css 가 rowLinks 를 통째로 숨겨 처음 단 23개가 폰에서 안 보였다(2026-11-02).
  const links = [enLink, clLink, topLink].filter(Boolean).join(" · ");
  const when = b.nowDate
    ? `<td class="num when" title="Median point ${esc(b.nowDate)}${b.n != null ? ` · ${b.n} sales in its ${b.windowDays ? `${b.windowDays}-day ` : ""}window` : ""}">${esc(mmdd(b.nowDate))}${nCell(b)}</td>`
    : `<td class="num when" title="${esc(NO_MEDIAN)}">—</td>`;
  return `<tr${none ? ' class="stale"' : ""}><td class="code"><a href="sets/${slug}.html">${esc(b.code)}</a></td><td class="name">${esc(s.nameFull || s.nameEn || "")}${buy ? `<small class="rowBuyLine" style="display:block;margin-top:2px;font-size:12px">${buy}</small>` : ""}${links ? `<small class="rowLinks">${links}</small>` : ""}</td><td class="num">${usd(b.nowUsd)}${withMsrp && b.vsMsrp != null ? `<small class="msrpSub">${b.vsMsrp.toFixed(1)}× MSRP</small>` : ""}</td>${when}<td class="num ${chg == null ? "" : chg > 0 ? "up" : chg < 0 ? "down" : "flat"}">${chg != null ? (chg > 0 ? "+" : "") + chg + "%" : "—"}</td>${withMsrp ? msrpTds(b) : ""}</tr>`;
}).join("\n");
const tr = rowHtml(false);
const trBox = rowHtml(true);


// ── 홈은 현재 사실상 유일하게 색인된 페이지 → 검색어 표면적을 최대한 넓힌다.
// 답변은 전부 검증된 데이터에서 파생(추정 금지, 사실 파일 home). 값이 없으면 그 항목을 만들지 않는다.
const H = F.home;
const cheapest = H.cheapest ? { nowUsd: H.cheapest.usd } : null;
// 최저가가 같은(화면 금액 기준) 세트는 표 순서대로 모두 적는다 — 2026-10-15(5차): OP-07·OP-08 이 둘 다 $80 인데 FAQ 는 OP-08 하나,
// 한국어 허브는 OP-07 하나였다. 한국어 허브(generate-ko-pages)와 같은 규칙(사실 파일 home.cheapest.codes).
const cheapAll = H.cheapest ? H.cheapest.codes.map((c) => BOARD[c]) : [];
const andList = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);
const priciest = H.priciest ? { code: H.priciest.code, nowUsd: H.priciest.usd } : null;
const byPrice = [priciest, H.runnerUp ? { code: H.runnerUp.code, nowUsd: H.runnerUp.usd } : null];
const nameOf = (c) => (F.sets[c] || {}).nameEn || c;

// 상승/하락은 세트별로만 말한다 — 시장 전체를 숫자 하나로 요약하던 지수는 삭제됨(2026-07-29).
// 28일 넘게 거래 없는 세트는 4주 등락 집계에서도 뺀다 — 표에서 "—" 로 비운 값을 문장에서 세면 안 된다.
const withChg = { length: H.withChg };
const nUp = H.nUp;
const nDn = H.nDn;
const topUp = H.topUp ? { code: H.topUp.code, changePct: H.topUp.pct } : null;
const topDn = H.topDn ? { code: H.topDn.code, changePct: H.topDn.pct } : null;

// 2026-10-15 소유자 결정(데이터 페이지 = 숫자·표·라벨만): 답이 데이터 사실인 문항만 남긴다.
//   "worth buying sealed?"(해석)·"Where can I check … for free?"(사이트 소개) 문항과, 답 안의 사이트 설명
//   ("we collect ourselves"·"The table above lists …"·"They move set by set …"·"See the change column …")을 뺐다.
//   "median of completed eBay sales" 는 숫자의 뜻이라 라벨 토막으로 남긴다. 화면 FAQ 와 FAQPage 는 같은 배열이다(L2).
//   CH1 가드가 첫 답의 "range from about $X (…)" 구절을 읽는다 — 그 꼴은 그대로 둔다.
const faqs = [
  {
    q: "How much is a One Piece booster box?",
    a: `Sealed Japanese One Piece booster boxes currently range from about ${usd(cheapest.nowUsd)} (${andList(cheapAll.map((b) => `${b.code} ${nameOf(b.code)}`))}) to ${usd(priciest.nowUsd)} (${priciest.code} ${nameOf(priciest.code)}) — median of completed eBay sales, as of ${DATA_DATE}.`,
  },
  {
    q: "Which One Piece booster box is the most valuable?",
    a: `${priciest.code} ${nameOf(priciest.code)} is the most expensive sealed Japanese box we track at about ${usd(priciest.nowUsd)}, ahead of ${byPrice[1].code} ${nameOf(byPrice[1].code)} at ${usd(byPrice[1].nowUsd)}.`,
  },
  {
    q: "Are One Piece booster boxes going up or down in price?",
    a: `Of the ${withChg.length} Japanese sets with a 4-week reference point, ${nUp} are up and ${nDn} are down over the last 4 weeks (latest weekly sold median vs 4 weeks earlier)${topUp ? `; the largest gain is ${topUp.code} at ${topUp.changePct >= 0 ? "+" : ""}${topUp.changePct}%` : ""}${topDn && topDn.changePct < 0 ? ` and the largest fall is ${topDn.code} at ${topDn.changePct}%` : ""}.`,
  },
];
const faqLd = JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
// temporalCoverage = 배포 파일(opbox-ai-data.json)에 실린 관측일 범위 — free-data 의 같은 Dataset 과 같은 값(사실 파일 coverage.aiData).
// 2026-10-14 QA: 홈은 표의 날짜로, free-data 는 파일의 날짜로 따로 세서 같은 파일의 기간이 페이지마다 달랐다.
const AI_SPAN = F.coverage.aiData;
const dsLd = JSON.stringify({
  "@context": "https://schema.org", "@type": "Dataset",
  name: "One Piece TCG box markets and Top 7 card data",
  description: `Citable data for ${rows.length} tracked One Piece Card Game products: Japanese and English completed-sale and active-ask box markets, Top 7 exact card variants, and field-level observation dates and sample sizes.`,
  url: "https://opboxindex.com/free-data.html",
  license: "https://creativecommons.org/licenses/by/4.0/",
  // 수정일 = 그 파일(opbox-ai-data.json)의 기준일 — 기간 끝(10-15)보다 이른 DATA_DATE(10-14)를 내던 것(2026-10-15 감사 #4).
  isAccessibleForFree: true, dateModified: AI_SPAN ? AI_SPAN.modified : DATA_DATE,
  ...(AI_SPAN ? { temporalCoverage: AI_SPAN.coverage } : {}),
  creator: { "@type": "Organization", name: "OP Box Index", url: "https://opboxindex.com/" },
  // 배포 파일은 하나(opbox-ai-data.json) — 기간이 그 파일 기준이라 CSV(기간이 다르다)는 free-data 의 자기 Dataset 이 맡는다.
  distribution: [
    { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://opboxindex.com/opbox-ai-data.json" },
  ],
});
const faqHtml = faqs.map((f) => `<details class="homeFaq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n          ");

// ── 2026-08-28 구조 변경(소유자 지시): 보고서식 설명·FAQ 전부 삭제, TCG 퀀트처럼 표만.
//    사람용 전체 표는 전용 페이지 box-prices.html(홈에서 1클릭, 색인 O, 매일 재생성)로.
//    홈 마커 구간: 한 줄 + 링크 + **접힌 정적 표** — 표를 아예 빼면 R1(봇용 정적 시세)이
//    무너져 노출 불가침 위반이다. 접힌 표는 화면 ~40px 이고 봇은 정상 색인한다(7월 원설계).
// 한국어 토글(packs.js 가 data-ko·data-ko-html 을 바꾼다) — 2026-10-13 QA: 한국어로 바꿔도 이 블록이 통째로 영어로 남았다.
const summaryKo = `${usd(cheapest.nowUsd)} (${cheapAll.map((b) => esc(b.code)).join(", ")}) – ${usd(priciest.nowUsd)} (${esc(priciest.code)}), eBay 실거래 중앙값, 매일 갱신. 4주간 <strong>${nUp}</strong> 상승 · <strong>${nDn}</strong> 하락. <a href="box-prices.html"><strong>전체 표 — ${rows.length}개 세트 →</strong></a>`;
const block = `${START}
        <section class="homeSummary" aria-label="Current Japanese booster box prices">
          <h2><span data-ko="일본판 부스터 박스 시세 — 전체 ${rows.length}개 세트">Japanese booster box prices — all ${rows.length} sets</span> <small data-ko="데이터 ${esc(DATA_DATE)} · 행마다 그 중앙값의 날짜">data ${esc(DATA_DATE)} · each row dated by its median point</small></h2>
          <p data-ko-html="${esc(summaryKo)}">${usd(cheapest.nowUsd)} (${cheapAll.map((b) => esc(b.code)).join(", ")}) – ${usd(priciest.nowUsd)} (${esc(priciest.code)}), median of completed eBay sales, updated daily. <strong>${nUp}</strong> up · <strong>${nDn}</strong> down over 4 weeks. <a href="box-prices.html"><strong>Full table — all ${rows.length} sets →</strong></a></p>
          <details class="homeCollapse">
          <summary data-ko="빠른 표(전체 페이지와 같은 데이터)">Quick table (same data as the full page)</summary>
          <div style="overflow-x:auto">
          <table class="homeSummaryTable">
            <thead><tr><th data-ko="세트">Set</th><th class="name" data-ko="이름">Name</th><th data-ko="박스 시세">Box price</th><th><span data-ko="기준일">As of</span> <small data-ko="n / 창">n / window</small></th><th><span data-ko="4주">4-wk</span> <small data-ko="등락">change</small></th></tr></thead>
            <tbody>
${tr}
            </tbody>
          </table>
          </div>
          </details>
          <p class="note"><a href="free-data.html" data-ko="인용용 데이터(JSON/CSV)">Citable data (JSON/CSV)</a> · <a href="psa-grading.html" data-ko="그레이딩 통계">Grading population</a> · <a href="auction.html" data-ko="경매">Auctions</a> · <a href="ko/">한국어 시세</a></p>
        </section>
        ${/* 홈은 사이트에서 가장 많이 색인되는 페이지다. 화면은 짧게(접힘) 두되 본문은 실어야
             검색이 읽을 게 있다 — 2026-08-28 "표만" 정리로 본문이 7,861→4,425자로 줄어
             GSC 가 홈 노출 급감을 경고했다. 접힌 콘텐츠도 구글은 정상 색인한다. */ ""}
        <section class="homeFaqWrap" aria-label="Frequently asked questions">
          <details class="homeCollapse">
          <summary><h2>One Piece booster box prices — common questions</h2></summary>
          ${faqHtml}
          </details>
        </section>
        <script type="application/ld+json">${faqLd}</script>
        <script type="application/ld+json">${dsLd}</script>
        ${END}`;

// ── 가장 싼 일본판 박스 5개 — 2026-10-14(W6a). "cheapest one piece booster box" 질의는 AI 인용 70건인데 일반검색은 10위 밖이었다.
//    같은 board 값(= current)을 가격 오름차순으로 다섯 줄. 정렬 라벨일 뿐 결론 문장은 없다. current 가 없는 세트는 넣지 않는다.
//    n 칸은 그 점의 평균 창 안 판매 건수(창 길이 함께) — 2026-10-14 QA: "n (week)" 라벨이 창 전체 건수를 주간 건수처럼 보이게 했다.
const cheapRows = H.cheapRows.map((c) => BOARD[c]);   // 가격 오름차순 5개(사실 파일 home.cheapRows)
const cheapTr = cheapRows.map((b) => {
  const s = F.sets[b.code] || {};
  const slug = b.code.toLowerCase();
  return `<tr><td><a href="sets/${slug}.html">${esc(b.code)}</a><br><small>${esc(s.nameFull || s.nameEn || "")}</small></td><td class="num">${usd(b.nowUsd)}</td><td class="num when">${esc(b.nowDate || "—")}</td><td class="num">${b.n != null ? b.n : "—"}${b.windowDays ? `<small> / ${b.windowDays}d</small>` : ""}</td></tr>`;
}).join("\n");
const cheapSection = cheapRows.length ? `<h2 id="cheapest" data-ko="가장 싼 일본판 부스터 박스">Cheapest Japanese booster boxes</h2>
      <div style="overflow-x:auto">
      <table class="homeSummaryTable tblFit" data-cheapest>
        <thead><tr><th data-ko="세트">Set</th><th data-ko="박스 시세">Box price</th><th data-ko="기준일">As of</th><th data-ko="창 안 판매 수 / 창">n / window</th></tr></thead>
        <tbody>
${cheapTr}
        </tbody>
      </table>
      </div>` : "";

const NAV = `<header class="topbar">
      <a class="brand" href="./"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("")}
    </header>`;

// box-prices Key facts 표 — 2026-10-19. 이 페이지는 H1 뒤 202자 안에 $·날짜가 없었다(lit/08 실측: 칩 줄 → 정의 줄). 값은 홈 Key facts 와 같은 사실 home·dataDate.
const boxKf = (() => {
  const { kfTableAny } = require("./set-page-shared");
  return kfTableAny([
    H.cheapest && H.priciest ? ["range", "Japanese box price range", "일본판 박스 시세 범위", `<b>${usd(H.cheapest.usd)}–${usd(H.priciest.usd)}</b> <small>${esc(H.cheapest.codes.join(", "))} · ${esc(H.priciest.code)}</small>`] : null,
    ["sets", "Sets", "세트", `<b>${rows.length}</b> <small><span data-ko="일본판 박스">Japanese boxes</span></small>`],
    ["change", "4-week change", "4주 등락", `<b>${H.nUp} <span data-ko="상승">up</span> · ${H.nDn} <span data-ko="하락">down</span></b> <small><span data-ko="28일 전 중앙값이 있는 세트">of ${H.withChg} sets with a median 28 days earlier</span></small>`],
  ], { label: "Booster box prices key facts", caption: `<span data-ko="원피스 일본판 부스터 박스 시세">One Piece Japanese booster box prices</span> · <time datetime="${esc(DATA_DATE)}">${esc(DATA_DATE)}</time>` });
})();
const { KF_CSS: KF_CSS_BODY } = require("./set-page-shared");
const pricesPage = `<!doctype html>
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
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="https://opboxindex.com/box-prices.html" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <title>One Piece Booster Box Prices — All ${rows.length} Sets | OP Box Index</title>
    <meta name="description" content="Sealed Japanese One Piece booster box prices for all ${rows.length} sets, ${usd(cheapest.nowUsd)}–${usd(priciest.nowUsd)}: completed eBay sale medians, cheapest first, with each median's date and 4-week change." />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="One Piece Booster Box Prices — All ${rows.length} Sets, Updated Daily" />
    <meta property="og:description" content="Sealed Japanese box prices ${usd(cheapest.nowUsd)}–${usd(priciest.nowUsd)}, median of completed eBay sales, with 4-week change per set." />
    <meta property="og:url" content="https://opboxindex.com/box-prices.html" />
    <meta property="og:image" content="https://opboxindex.com/og-image.png" />
    <link rel="stylesheet" href="styles.css?v=${CACHE}" />
    <meta name="theme-color" content="#0a0c10" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <style>.homeSummaryTable .msrpSub{display:none}@media (max-width:720px){.homeSummaryTable .msrpCol{display:none}.homeSummaryTable .msrpSub{display:block;font-size:11.5px;color:var(--muted);font-weight:400}}
${KF_CSS_BODY}
    </style>
    <script type="application/ld+json">${dsLd}</script>
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://opboxindex.com/" }, { "@type": "ListItem", position: 2, name: "Booster box prices", item: "https://opboxindex.com/box-prices.html" }] })}</script>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    ${NAV}
    <main id="main-content" class="bodyPage">
      <p class="eyebrow">Prices · Updated ${esc(DATA_DATE)} · refreshed daily</p>
      <h1>Japanese One Piece booster box prices — all ${rows.length} sets</h1>
      ${boxKf}
      ${AFF_TOP}
      <p class="note"><span data-ko="이베이 실거래 중앙값 · 기준일 = 그 중앙값 점의 날짜 · n = 그 점의 평균 창(28~56일, 세트별) 안 판매 건수 · 4주 등락 = 28일 전 중앙값 대비 · — = 28일 안에 날짜가 찍힌 중앙값 없음(중앙값은 창 안 판매 6건 이상) · × 정가 = 박스 시세 ÷ 일본판 박스 정가">Median of completed eBay sales · "As of" = date of that median point · n = sales inside its rolling window (28–56 days, set per series) · "4-wk change" = vs the median 28 days earlier · — = no median dated within ${STALE_DAYS} days (a median needs at least 6 sales in its window) · × MSRP = box price ÷ JP box MSRP</span> · ${nUp} up, ${nDn} down</p>
      ${cheapSection}
      <h2 id="all-sets" data-ko="전체 ${rows.length}개 세트">All ${rows.length} sets</h2>
      <div style="overflow-x:auto">
      <table class="homeSummaryTable tblFit" data-all-sets>
        <thead><tr><th data-ko="세트">Set</th><th class="name" data-ko="이름">Name</th><th data-ko="박스 시세">Box price</th><th><span data-ko="기준일">As of</span> <small data-ko="n / 창">n / window</small></th><th><span data-ko="4주">4-wk</span> <small data-ko="등락">change</small></th><th class="msrpCol" data-ko="× 정가">× MSRP</th></tr></thead>
        <tbody>
${trBox}
        </tbody>
      </table>
      </div>
      <p class="note">Updated ${esc(DATA_DATE)} · <a href="free-data.html">Data (JSON/CSV)</a> · <a href="psa-grading.html">Grading population</a> · <a href="auction.html">Auctions</a> · <a href="ko/">한국어</a></p>
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation">
        <a href="./">Home</a>
        <a href="sets/index.html">Set Guides</a>
        <a href="about.html">About</a>
        <a href="methodology.html">Methodology</a>
        <a href="changelog.html">Corrections</a>
        <a href="free-data.html">Free data (CSV)</a>
      </nav>
    </footer>
  </body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "box-prices.html"), pricesPage);
console.error("wrote box-prices.html");

// 사이트맵에 box-prices.html 이 없으면 추가(추가만 — 기존 항목은 절대 안 건드림).
{
  const smPath = path.join(ROOT, "sitemap.xml");
  let sm = fs.readFileSync(smPath, "utf8");
  if (!sm.includes("https://opboxindex.com/box-prices.html")) {
    const entry = `  <url>\n    <loc>https://opboxindex.com/box-prices.html</loc>\n    <lastmod>${DATA_DATE}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    sm = sm.replace("</urlset>", entry + "</urlset>");
    fs.writeFileSync(smPath, sm);
    console.error("sitemap: box-prices.html added");
  }
}

// 홈 H1 바로 아래 Key facts 표 — 2026-10-16. ChatGPT 착지 1위가 홈(28일 19세션)인데 첫 화면엔 라벨 칩뿐이고 숫자·날짜는 JS 시세판 뒤에 있었다.
//   값은 사실 파일 home(최저·최고 박스, 4주 등락 집계)·order.board·dataDate 그대로 — 아래 HOME_SUMMARY 문답·box-prices 와 같은 값.
{
  const { KF_CSS_ANY, kfTableAny } = require("./set-page-shared");
  const H = F.home;
  const kf = kfTableAny([
    H.cheapest && H.priciest ? ["range", "Japanese box price range", "일본판 박스 시세 범위", `<b>${usd(H.cheapest.usd)}–${usd(H.priciest.usd)}</b> <small>${esc(H.cheapest.codes.join(", "))} · ${esc(H.priciest.code)}</small>`] : null,
    ["sets", "Sets tracked", "추적 세트", `<b>${rows.length}</b> <small><span data-ko="일본판 박스 · 영문판 박스 페이지 · 공식 카드 리스트">Japanese boxes · English box pages · official card lists</span></small>`],
    ["change", "4-week change", "4주 등락", `<b>${H.nUp} <span data-ko="상승">up</span> · ${H.nDn} <span data-ko="하락">down</span></b> <small><span data-ko="28일 전 중앙값이 있는 세트">of ${H.withChg} sets with a median 28 days earlier</span></small>`],
    ["asof", "Data", "기준일", `<time datetime="${esc(DATA_DATE)}">${esc(DATA_DATE)}</time> <small><span data-ko="이베이 완료 거래 중앙값 · 매일">eBay completed-sale medians · daily</span></small>`],
  ], { id: "home-key-facts", label: "Home key facts", caption: `<span data-ko="원피스 일본판 부스터 박스 시세">One Piece Japanese booster box prices</span> · <time datetime="${esc(DATA_DATE)}">${esc(DATA_DATE)}</time>` });
  const KF_START = "<!-- HOME_KEY_FACTS:START -->", KF_END = "<!-- HOME_KEY_FACTS:END -->";
  const fp = path.join(ROOT, "index.html");
  let h = fs.readFileSync(fp, "utf8");
  if (!h.includes(KF_START) || !h.includes(KF_END)) throw new Error("index.html: HOME_KEY_FACTS 마커가 없다");
  h = h.replace(new RegExp(`${KF_START}[\\s\\S]*?${KF_END}`), () => `${KF_START}<style>\n${KF_CSS_ANY}\n        .packHero table.kfTable { margin: 10px 0 2px; }\n        </style>\n        ${kf}\n        ${KF_END}`);
  // 첫 화면 칩·세트 가이드 제목의 세트 수·글 수 — 2026-11-05. 손으로 쓴 "22 sets"·"14 articles" 가 Key facts 의 23·글 목록 16 과 어긋나 있었다.
  //   세트 수 = 위 Key facts "Sets tracked"(order.board), 글 수 = 글 목록(articles/index.html)의 글 카드 수 — 가드 TX1.
  const nSets = rows.length;
  const nArticles = (fs.readFileSync(path.join(ROOT, "articles", "index.html"), "utf8").match(/<li class="artCard">/g) || []).length;
  const CHIP = /<span data-ko="\d+세트 · 일본판 \/ 영문판">\d+ sets · JP \/ EN<\/span>/;
  const GUIDES = /<h2 data-ko="세트 가격 가이드 — \d+개 세트 · 기사 \d+개">Set price guides — all \d+ sets &amp; \d+ articles<\/h2>/;
  if (!CHIP.test(h) || !GUIDES.test(h)) throw new Error("index.html: 세트 수 칩 또는 세트 가이드 제목을 못 찾음");
  h = h.replace(CHIP, `<span data-ko="${nSets}세트 · 일본판 / 영문판">${nSets} sets · JP / EN</span>`);
  h = h.replace(GUIDES, `<h2 data-ko="세트 가격 가이드 — ${nSets}개 세트 · 기사 ${nArticles}개">Set price guides — all ${nSets} sets &amp; ${nArticles} articles</h2>`);
  fs.writeFileSync(fp, h, "utf8");
}

let touched = 0;
for (const f of ["index.html", "packs.html"]) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  let h = fs.readFileSync(fp, "utf8");
  if (h.includes(START) && h.includes(END)) {
    h = h.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  } else {
    // 최초 삽입: 상세 영역 뒤(본문 안)에 붙인다. head 는 건드리지 않음.
    const anchor = `<div id="detail"></div>`;
    if (!h.includes(anchor)) { console.error(`SKIP ${f}: anchor not found`); continue; }
    h = h.replace(anchor, `${anchor}\n        ${block}`);
  }
  fs.writeFileSync(fp, h, "utf8");
  touched++;
}
console.log(JSON.stringify({ touched, sets: rows.length }));
