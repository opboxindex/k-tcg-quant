"use strict";
// 세트 페이지 생성기들이 함께 쓰는 "페이지 껍데기" — 2026-09-08 신설.
//
//   generate-set-pages.js         → 일본판 세트 페이지(sets/op-13.html …) + 허브 + PSA10 랭킹
//   generate-english-set-pages.js → 영문판 박스 페이지(sets/op-13-english.html …)
//
// 두 생성기가 <head>·푸터·제휴 고지·사이트맵 갱신을 각자 복사해 갖고 있으면 한쪽만 고쳐지는
// 사고가 난다(캐시 버전, EPN 고지 문구, 푸터 링크가 어긋난다). 그래서 겉껍데기는 여기 한 곳에만 둔다.
// 본문(표·차트·문장)은 각 생성기가 만든다.
//
// 읽는 순서: 상수 → 짧은 포맷 함수 → pageHead / FOOT → upsertSitemap.
const fs = require("fs");
const path = require("path");
const { navHtml } = require("./site-nav");

const ROOT = path.join(__dirname, "..");
const SITE = "https://opboxindex.com";

// eBay 파트너 네트워크(EPN) 추적 파라미터·링크 검증(epnUrl)은 market-data-normalizers.js 한 곳 — 2026-10-15: 사실 빌더(build-site-facts)도
// 최저 실매물 판정에 쓴다. 여기서는 가져와 다시 내보낸다(경매·예정 세트 페이지가 이 파일에서 epnUrl 을 받는다).
const { EPN, epnUrl } = require("./market-data-normalizers");

// 정적 자산(styles.css 등)의 캐시 버전. packs.js 의 DATA_VERSION 과 같아야 한다(가드 V1).
// 값을 하드코딩하면 범프할 때마다 어긋난다(2026-07-27 실사고: 가드 V1 21건).
const CSS_VER = (fs.readFileSync(path.join(ROOT, "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";

// 박스 시세 차트 — 그림과 CSS 는 box-chart.js 한 곳에서만 나온다(홈·세트·영문판 페이지 공통).
const BoxChart = require(path.join(ROOT, "box-chart.js"));

// ── 짧은 포맷 함수
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => (n == null ? null : "$" + Math.round(n).toLocaleString("en-US"));
const intl = (n) => (n == null ? "" : Number(n).toLocaleString("en-US"));
const monthYear = (iso) => {
  if (!iso) return "";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${m[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// 재판 기록 분류(splitReprints)·영문판 재판 판정(enIsReprint)은 2026-10-15 에 market-data-normalizers.js 로 옮겼다 — 부르는 곳은 사실 빌더
// (tools/build-site-facts.js) 하나이고, 생성기는 data/derived/site-facts.json sets[code].reprint(restock·lottery·unverified·count·enIsReprint)를 읽는다.

// EPN 규정(Participation Requirements I.G.) — 제휴 고지는 "명확하고 눈에 띄게" 있어야 한다.
// 2026-08-10 EPN 위반 통지: 문구는 적절하나 푸터에 있어 잘 보이지 않는다. 그래서 본문 상단에도 넣는다.
// 푸터의 affNote 는 그대로 두고 이걸 추가하는 것이다 — 둘 중 하나를 지우지 말 것(가드 E1 이 순서를 검사한다).
const AFF_TOP = `<p class="affTop"><b>Paid Link:</b> As an eBay Partner Network affiliate, we earn from qualifying purchases.</p>`;

// 페이지 머리. sets/ 아래 한 단계 깊이의 페이지 전용이라 자산 경로가 "../" 로 고정돼 있다.
//   title / desc / canonical : 필수
//   ogType   : "article"(기본) 또는 "website"(허브)
//   extraLd  : 구조화데이터 <script type="application/ld+json"> 문자열들
//   koHref   : 한국어 짝 페이지 URL. 있을 때만 hreflang 을 낸다.
//   extraCss : 그 페이지에만 쓰는 스타일(선택). <style> 안에 그대로 들어간다.
//   chart    : false 면 머리에 박스 차트 CSS(7.8KB)를 싣지 않는다 — 차트가 없는 페이지(카드리스트·허브, 2026-10-14),
//              또는 차트 바로 앞에 withChartCss() 로 CSS 를 두는 세트 페이지(2026-10-14, W5a: 머리가 25KB 라 H1 아래 Key facts 표가
//              HTML 의 25% 지점을 넘었다. 차트 CSS 는 .opbc* 전용이라 차트 앞에만 있으면 된다 — box-chart.js 는 id 로 찾는다).
function pageHead({ title, desc, canonical, ogType = "article", extraLd = "", koHref = "", extraCss = "", chart = true }) {
  // hreflang 은 반드시 양방향이어야 구글이 인정한다. ko 짝이 있을 때만, en(자기)·ko·x-default 를 함께 선언.
  // (ko 페이지는 이미 en 을 가리키는데 en 쪽이 침묵해서 단방향으로 무시되던 문제 — 2026-07-21 감사)
  const hreflang = koHref
    ? `\n    <link rel="alternate" hreflang="en" href="${canonical}" />\n    <link rel="alternate" hreflang="ko" href="${koHref}" />\n    <link rel="alternate" hreflang="x-default" href="${canonical}" />`
    : "";
  const style = extraCss ? `    <style>\n${extraCss}\n    </style>\n` : "";
  // 한국어판이 있으면 언어 버튼이 그 페이지로 보낸다(lang-toggle.js data-ko-page) — 2026-10-13 QA: 제자리 번역은 메뉴·칩만
  // 바뀌고 본문 약 190곳이 영어로 남았다. 주소는 hreflang ko 와 같은 곳(사이트 절대경로).
  const koPage = koHref ? ` data-ko-page="${esc(koHref.replace(SITE, ""))}"` : "";
  return `<!doctype html>
<html lang="en"${koPage}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Google Analytics 4 (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-P73SE1WVD0');
    </script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${canonical}" />${hreflang}
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#0a0c10" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="https://opboxindex.com/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    ${extraLd}
    <link rel="stylesheet" href="../styles.css?v=${CSS_VER}" />
    <script defer src="../lang-toggle.js?v=${CSS_VER}"></script>
${style}${chart ? `    <style id="opBoxChartCss">${BoxChart.CSS}</style>\n` : ""}  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("../")}
    </header>
    <main id="main-content" class="bodyPage">`;
}

// 페이지 꼬리. 푸터 고지(affNote)와 About/Methodology 링크는 애드센스·EPN 심사 항목이라 빼면 안 된다.
// foot({ chart:false, affiliate:false }) — 차트도 eBay 링크도 없는 페이지(카드리스트)용. 푸터 메뉴는 같은 글자다.
const foot = ({ chart = true, affiliate = true } = {}) => `${chart ? `
      <script src="../box-chart.js?v=${CSS_VER}" defer></script>` : ""}${affiliate ? `
      <p class="affNote">As an eBay Partner, we may earn a commission from qualifying purchases made through eBay links on this page — at no extra cost to you.</p>` : ""}
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation"><a href="../about.html">About</a><a href="../methodology.html">Methodology</a><a href="../free-data.html">Free data (CSV)</a><a href="../privacy.html">Privacy</a><a href="../disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
const FOOT = foot();

// 차트 블록 앞에 차트 CSS 를 붙인다(차트가 없으면 둘 다 없다). pageHead({ chart: false }) 와 짝으로 쓴다.
const withChartCss = (chartHtml) => (chartHtml ? `<style id="opBoxChartCss">${BoxChart.CSS}</style>\n      ${chartHtml}` : "");

// 사이트맵 갱신 — 같은 URL 은 lastmod 만 오늘로 바꾸고, 없는 URL 만 새로 넣는다(몇 번 돌려도 결과가 같다).
// 홈(/)은 매일 데이터가 바뀌므로 함께 lastmod 를 올린다. 반환값: { added: 새로 넣은 개수 }.
function upsertSitemap(urls, { priority = "0.8", changefreq = "weekly" } = {}) {
  const smPath = path.join(ROOT, "sitemap.xml");
  let sm = fs.readFileSync(smPath, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  const bumpLastmod = (u) => {
    const quoted = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(<loc>${quoted}</loc>[\\s\\S]*?<lastmod>)[^<]*(</lastmod>)`);
    if (re.test(sm)) { sm = sm.replace(re, `$1${today}$2`); return true; }
    return false;
  };
  let added = 0;
  for (const u of urls) {
    if (bumpLastmod(u)) continue;
    const entry = `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>\n`;
    sm = sm.replace("</urlset>", entry + "</urlset>");
    added++;
  }
  bumpLastmod(`${SITE}/`);
  fs.writeFileSync(smPath, sm, "utf8");
  return { added };
}

// ── 최저 실매물 버튼(buyCta) ─────────────────────────────────────────────
// 값이 찍힌 버튼이 값 없는 글자 링크보다 훨씬 많이 눌린다. 2026-09-16 실측: 이베이 클릭 53건 중
// 47건이 값이 찍힌 홈 버튼에서 났고, 나머지 영어 페이지(세트 22·카드 223)는 값 없는 회색 링크뿐이었다.
// 값이나 URL 이 없으면 빈 문자열을 돌려준다 — 호출부는 기존 검색 링크만 남기면 된다(빈 값 > 틀린 값).

// label   : 무엇의 최저가인지 (예: "sealed OP-01 box", "PSA 10 copy")
// price   : 배송비 포함 총액(USD)
// mid     : 같은 물건의 중간 호가(USD). 있으면 몇 % 싼지 배지를 붙인다(3% 미만 차이는 생략).
// updated : 매물 수집일. 싼 매물은 빨리 나가므로 기준일을 반드시 같이 보여준다.
// spot    : EPN customid — EPN 보고서에서 자리별 클릭·거래를 가르는 꼬리표(경매의 auc-*, 발매 예정의 rel-*·preorder-* 와 같은 방식). 없으면 안 붙인다.
const withSpot = (url, spot) => (url && spot ? `${url}${url.includes("?") ? "&" : "?"}customid=${encodeURIComponent(spot)}` : url);
function buyCta({ url, price, mid, updated, label, spot }) {
  const href = epnUrl(withSpot(url, spot));
  if (!href || price == null) return "";
  const off = mid != null && mid > 0 && price < mid * 0.97 ? Math.round((1 - price / mid) * 100) : null;
  const chip = off ? `<em class="buyOff">${off}% under mid ask</em>` : "";
  const asOf = updated ? `<em class="buyAsOf">as of ${esc(updated)}</em>` : "";
  return `<a class="buyNow" href="${esc(href)}" target="_blank" rel="noopener noreferrer sponsored">`
    + `<span class="buyLine">Cheapest ${esc(label)} <b>${usd(price)}</b><span class="buyArrow">&#8599;</span></span>`
    + `${chip}${asOf}</a>`;
}

// 표 안 작은 가격 링크(buyLink) — 2026-11-02. 검색·AI 유입이 많은 표 페이지(box-prices·compare·psa10-ranking·발매일 글)에 구매 링크가
// 0개였다(EPN 10월 클릭 94·거래 0 — 7월 312의 30%). buyCta 와 같은 값(최저 실매물, 배송비 포함)을 표 폭을 늘리지 않는 한 줄로 단다.
// 값·URL 이 없으면 빈 문자열 — 호출부는 그 칸을 그냥 둔다(빈 값 > 틀린 값). 링크가 생긴 페이지는 첫 링크 앞에 AFF_TOP 이 있어야 한다(가드 E1).
function buyLink({ url, price, spot, label = "Buy" }) {
  const href = epnUrl(withSpot(url, spot));
  if (!href || price == null) return "";
  return `<a class="rowBuy" href="${esc(href)}" target="_blank" rel="noopener noreferrer sponsored">${esc(label)} <b>${usd(price)}</b>&#8599;</a>`;
}

// ── 상단 Key facts 표 — 2026-10-14(W5a) ─────────────────────────────────────────
// ChatGPT 가 보내던 세트 페이지에서 발매일·정가·팩 수 같은 핵심 사실이 HTML 97% 지점(접힌 재판 이력 안)에 있었고,
// 머리의 카드 수는 낡은 값(OP-01 "106 cards" — 공식 목록 121종·154장)이었다. 일본판·영문판·한국어 페이지가
// **같은 함수**에서 사실을 읽어 H1 바로 아래 라벨:값 표로 낸다(각자 세면 한쪽만 어긋난다). 값이 없으면 "—".
//   가격  : box-sold-series 의 그 판 current(마지막 중앙값 점이 asOf 로부터 28일 이내일 때만, 아니면 "—" — 모든 표와 같은 규칙, 가드 D17)
//           · 최저 실매물(구매 버튼과 같은 값, 매물 수 표시)
//   사실  : data/set-facts.json(반다이 공식 — 발매일·정가·팩 수·카드 종류, 확인일 포함) · data/official-cardlist.json(공식 카드 리스트)
// 문장·해설 없이 라벨과 값만 쓴다. 표 안의 링크는 첫 칸(카드 리스트)뿐이다 — 출처 링크는 표 아래 한 줄로.
// 모델(keyFactsModel)·최저 실매물(lowestAsk)·페이지 수정일(setPageDate)·최신 세트(latestSets)는 2026-10-15 에 사실 빌더
// (tools/build-site-facts.js)로 옮겼다 — 값은 data/derived/site-facts.json sets[code].keyFacts[ed] · ask[ed] · pageDate · latestSets.
// 여기는 그 모델(m)을 그리기만 한다(keyFactsHtml · dataDesc).

// ── 검색 설명(meta description · og:description) — 2026-10-15 소유자 결정: 데이터 페이지엔 숫자·표·라벨만.
// 종전 일본판 설명은 수기 해설(set-commentary desc · priority-set-seo description)이나 "…and a buy-or-skip verdict" 같은 사이트 소개 문장,
// 영문판은 "Weekly price history and auction results, updated daily" 꼬리였다. 이제 Key facts 표(keyFactsModel)와 같은 값·같은 표기(usd)만 잇는다.
// 판매 중앙값은 current(28일 규칙)일 때만 — 없으면 조각을 빼고 최저 매물가가 앞에 선다(묵은 중앙값을 현재가로 내지 않는다).
// 조각은 우선순위 순서: 판매 중앙값 · 최저 매물가 · 그 판 발매일 · 팩 수(일본판) → 들어가는 만큼 extras(페이지 지표 칸에 있는 값)·정가.
// max 를 넘으면 뒤 조각부터 뺀다. 세트 코드가 들어가므로 페이지마다 다르다.
// 그래도 min(가드 MD1 하한 120자)보다 짧으면 Key facts 표의 다른 행 값(그 판 팩 정가 → 최고가 카드 → 카드 종류)을 하한에 닿을 때까지 잇는다 —
// 2026-11-02(EB-05 승격): 갓 발매된 세트는 판매 중앙값·매물·팩 수·박스 정가가 없어 일본판 설명이 "JP release …" 하나(73자)였다.
function dataDesc(m, nameEn, extras = [], max = 155, min = 120) {
  const head = `${m.code} ${nameEn} ${m.ed === "en" ? "English" : "Japanese"} booster box: `;
  const core = [];
  if (m.sold) core.push(`${m.sold.reprint ? "reprint (White) " : ""}sold median ${usd(m.sold.median)} (${m.sold.d}${m.sold.n != null ? `, n=${m.sold.n}` : ""})`);
  if (m.ask) core.push(`lowest live ask ${usd(m.ask.total)}`);
  const rel = m.ed === "en" ? m.enRelease : m.jpRelease;
  if (rel) core.push(`${m.ed === "en" ? "EN" : "JP"} release ${rel}`);
  if (m.ed !== "en" && m.packsPerBox) core.push(`${m.packsPerBox} packs`);   // 팩 수는 일본판 박스 값(Key facts "JP box")이라 영문판 설명엔 싣지 않는다
  const more = [...extras.filter(Boolean)];
  if (m.ed !== "en" && m.msrp && m.msrp.jpBox) more.push(`MSRP ¥${Number(m.msrp.jpBox).toLocaleString("en-US")}`);
  const text = (parts) => `${head}${parts.join(" · ")}.`;
  const parts = core.slice();
  while (parts.length > 1 && text(parts).length > max) parts.pop();
  for (const x of more) if (text([...parts, x]).length <= max) parts.push(x);
  const ms = m.msrp || {}, ch = m.chase, ct = m.cardTypes;
  const fill = [
    m.ed === "en" ? (ms.enPack != null ? [`MSRP $${Number(ms.enPack).toFixed(2)} / pack`] : []) : (!ms.jpBox && ms.jpPack ? [`MSRP ¥${Number(ms.jpPack).toLocaleString("en-US")} / pack`] : []),
    ch && ch.usd != null ? [ch.name && ch.number ? `top chase ${ch.name} (${ch.number}) ${usd(ch.usd)} raw NM` : null, ch.name ? `top chase ${ch.name} ${usd(ch.usd)} raw NM` : null, ch.number ? `top chase ${ch.number} ${usd(ch.usd)} raw NM` : null].filter(Boolean) : [],
    ct && ct.official ? [`${ct.value} card types`] : [],
  ];
  for (const cands of fill) {
    if (text(parts).length >= min) break;
    const hit = cands.find((x) => text([...parts, x]).length <= max);
    if (hit) parts.push(hit);
  }
  return text(parts);
}

// 표 그리기. lang = "en"(영어 페이지 — data-ko 로 제자리 번역) | "ko"(정적 한국어 페이지).
// 행마다 data-k 를 단다 — 가드 KF1 이 행을 집어 원천과 대조한다.
function keyFactsHtml(m, { lang = "en", usdKrw = null } = {}) {
  const ko = lang === "ko";
  const t = (enText, koText) => (ko ? esc(koText) : `<span data-ko="${esc(koText)}">${esc(enText)}</span>`);
  const time = (iso) => `<time datetime="${esc(iso)}">${esc(iso)}</time>`;
  const yen = (n) => "¥" + Number(n).toLocaleString("en-US");
  const edEn = m.ed === "en" ? "English" : "Japanese", edKo = m.ed === "en" ? "영문판" : "일본판";
  const dash = "—";
  const rows = [];
  const row = (k, labelEn, labelKo, value, labelHtml) => rows.push(`<tr data-k="${k}"><th scope="row">${labelHtml || t(labelEn, labelKo)}</th><td>${value}</td></tr>`);

  const sd = m.sold;
  row("sold", `Sold median (${edEn} box)`, `판매 중앙값 (${edKo} 박스)`, sd
    ? `<b>${usd(sd.median)}</b> <small>${ko && usdKrw ? `${esc(Math.round(sd.median * usdKrw).toLocaleString("ko-KR"))}원 · ` : ""}${sd.reprint ? t("reprint (White)", "재판(화이트)") + " · " : ""}${sd.n != null ? `${t(`${sd.n} sales`, `${sd.n}건`)} · ` : ""}${t(sd.windowDays ? `${sd.windowDays} days to` : "to", sd.windowDays ? `${sd.windowDays}일 · 기준일` : "기준일")} ${time(sd.d)}</small>`
    : m.soldReleased ? `${dash} <small>${t("no median dated within 28 days", "28일 안에 날짜가 찍힌 중앙값 없음")}</small>` : dash);
  row("ask", `Lowest live ask (${edEn} box)`, `최저 매물가 (${edKo} 박스)`, m.ask
    ? `<b>${usd(m.ask.total)}</b> <small>${t("eBay, incl. shipping", "이베이 · 배송비 포함")}${m.ask.listings != null ? ` · ${t(`${m.ask.listings} listings`, `매물 ${m.ask.listings}건`)}` : ""}${m.ask.updated ? ` · ${time(m.ask.updated)}` : ""}</small>`
    : dash);
  row("release", "Release date", "발매일", m.jpRelease || m.enRelease
    ? [m.jpRelease ? `${t("JP", "일본판")} ${time(m.jpRelease)}` : `${t("JP", "일본판")} ${dash}`, m.enRelease ? `${t("EN", "영문판")} ${time(m.enRelease)}` : `${t("EN", "영문판")} ${dash}`].join(" · ")
    : dash);
  const ms = m.msrp;
  // 박스 구성이 공식 페이지에 없는 세트(OP-17: 팩 가격만 있음)는 박스 값에 "24 × 팩 가격" 라벨을 붙인다 — 2026-10-14 QA.
  const boxBasis = m.boxConfigStated === false && ms.jpPack && m.packsPerBox ? ` <small>(${m.packsPerBox} × ${yen(ms.jpPack)} · ${t("box size not stated by Bandai", "박스 구성 공식 미기재")})</small>` : "";
  row("msrp", "MSRP", "정가", ms.jpBox || ms.jpPack || ms.enPack != null
    ? [`${t("JP", "일본판")} ${ms.jpBox ? `${yen(ms.jpBox)} ${t("/ box", "/ 박스")}${boxBasis}` : dash}${ms.jpPack ? ` · ${yen(ms.jpPack)} ${t("/ pack", "/ 팩")}` : ""}`,
       `${t("EN", "영문판")} ${ms.enPack != null ? `$${Number(ms.enPack).toFixed(2)} ${t("/ pack", "/ 팩")}` : dash}`].join(" · ")
    : dash);
  row("packs", "Packs per box", "박스당 팩 수", m.packsPerBox
    ? `<b>${m.packsPerBox}</b> <small>${t("JP box", "일본판 박스")}${m.boxConfigStated === false ? ` · ${t("standard box, not stated by Bandai", "표준 구성 · 공식 미기재")}` : ""}${m.cardsPerPack ? ` · ${t(`${m.cardsPerPack} cards per pack`, `팩당 ${m.cardsPerPack}장`)}` : ""}</small>`
    : dash);
  // 카드 수 두 줄은 출처가 다르다 — "Card types" = 반다이 상품 페이지의 종류 수(예: 131+4), "Card list" = 반다이 카드 리스트의 장·번호 수.
  // 둘 다 "(official)" 로 쓰면 131 과 130 이 같은 사실의 다른 값처럼 보였다(2026-10-14 QA). 상품 페이지 값이 없으면 카드 리스트 줄 하나만.
  const ct = m.cardTypes;
  if (ct && ct.official) row("types", "Card types", "카드 종류", `<b>${esc(ct.value)}</b> <small>${t("types (Bandai product page)", "종 (반다이 상품 페이지)")}</small>`);
  else if (!m.cardList) row("types", "Card types", "카드 종류", dash);
  const cl = m.cardList;
  row("cardlist", "Card list", "카드 리스트", cl
    ? `<b>${cl.cards}</b> <small>${t(`cards · ${cl.numbers} card numbers (Bandai card list)`, `장 · 카드 번호 ${cl.numbers}종 (반다이 카드 리스트)`)}</small>`
    : dash, cl ? `<a href="${esc(cl.href)}">${t("Card list", "카드 리스트")}</a>` : "");
  // 'Top chase (raw NM)' 행 — 2026-10-16. 구글 질의 'op09 chase cards'(12위)·'op15 price guide'(15.5위)가 세트 페이지에 닿는데 Key facts 에 체이스 카드 값이 없었다.
  //   값은 사실 파일 keyFacts.chase(= top10.priciest — 비교표 'Priciest card (raw)'·가장 비싼 카드 문장과 같은 값, tools/build-site-facts.js). 없으면 행을 그리지 않는다.
  const ch = m.chase;
  if (ch && ch.usd != null) row("chase", "Top chase (raw NM)", "최고가 카드 (NM)", `<b>${usd(ch.usd)}</b> <small>${esc(ch.name || "")}${ch.number ? ` · ${esc(ch.number)}` : ""}${ch.date ? ` · ${time(ch.date)}` : ""}</small>`);

  const src = m.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener nofollow">${t(x.en + (x.archived ? " (archived)" : ""), x.ko + (x.archived ? " (보관본)" : ""))}</a>${x.checked ? ` ${t("checked", "확인")} ${time(x.checked)}` : ""}`);
  const srcLine = src.length ? `<p class="kfSrc">${t("Bandai official", "반다이 공식")}: ${src.join(" · ")}</p>` : "";
  // 표 제목(caption) — 2026-10-19. 표만 떼어 인용될 때도 무엇의 값·언제 값인지 붙어 가게: "<세트> Japanese booster box price · <판매 중앙값 날짜>".
  //   날짜는 판매 중앙값 점의 날짜(없으면 매물 갱신일, 그것도 없으면 날짜 없이).
  const capDate = (sd && sd.d) || (m.ask && m.ask.updated) || null;
  const caption = `<caption>${ko ? esc(`${m.code} ${edKo} 부스터 박스 시세`) : `<span data-ko="${esc(`${m.code} ${edKo} 부스터 박스 시세`)}">${esc(`${m.code} ${edEn} booster box price`)}</span>`}${capDate ? ` · ${time(capDate)}` : ""}</caption>`;
  return `<table class="kfTable text" id="key-facts-table" aria-label="${esc(ko ? `${m.code} 핵심 정보` : `${m.code} key facts`)}">${caption}<tbody>
            ${rows.join("\n            ")}
          </tbody></table>
          ${srcLine}`;
}

// 세트·영문세트·한국어 생성기가 각자 인라인 <style> 에 넣는다. 색은 styles.css 토큰만.
// styles.css 의 기사 표 규칙(≤720px 가로 스크롤+오른쪽 흐림, 2열부터 오른쪽 정렬)을 이 표에서만 되돌린다 — 2열이라 폭 안에 들어온다.
const KF_CSS = `      .bodyPage table.kfTable { width: 100%; max-width: 640px; min-width: 0; margin: 12px 0 4px; font-size: 14px; }
      .bodyPage .kfTable th, .bodyPage .kfTable td { padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; line-height: 1.45; word-break: keep-all; overflow-wrap: break-word; }
      .kfTable time, .kfSrc time { white-space: nowrap; }
      .kfTable caption { caption-side: top; text-align: left; padding: 0 0 4px; color: var(--muted); font-size: 12.5px; font-weight: 600; }
      .bodyPage .kfTable th { width: 40%; color: var(--muted); font-size: 13px; font-weight: 600; }
      .bodyPage .kfTable th a { color: var(--accent); font-weight: 700; }
      .bodyPage .kfTable td b { color: var(--ink); font-weight: 700; }
      .bodyPage .kfTable td small { color: var(--muted); font-size: 12px; }
      .kfSrc { margin: 4px 0 0; max-width: 640px; color: var(--muted); font-size: 12px; line-height: 1.55; }
      .kfSrc a { color: var(--muted); text-decoration: underline; text-underline-offset: 2px; }
      @media (max-width: 720px) { .bodyPage table.kfTable { display: table; overflow: visible; -webkit-mask-image: none; mask-image: none; } }
      @media (max-width: 640px) { .bodyPage .kfTable th { width: 36%; } .bodyPage .kfTable td small { display: block; } }`;

// 세트 페이지 밖(.bodyPage 가 아닌 main)의 같은 표 — 2026-10-16. rankWrap(psa10-ranking)·pgWrap(psa-grading)·comparePage·홈 hero 는 .bodyPage 가 아니라 KF_CSS 가 안 먹는다.
const KF_CSS_ANY = KF_CSS.replace(/\.bodyPage /g, "");

// 범용 Key facts 표(세트 페이지 밖) — 2026-10-16. ChatGPT 인용 18장 가운데 Key facts 표는 세트 페이지뿐이었고(10/14 추가), 빙 스니펫은 발매일
//   ('May 30, 2026' 등)을 집어 와 갱신일이 묻혔다. 인용 페이지(psa10-ranking·cards/·psa-grading·japan-vs-english·compare·sets/·홈)에
//   같은 꼴(값·기준일·표본만)을 H1 바로 아래 둔다. rows = [[k, labelEn, labelKo, valueHtml]] — 값은 호출한 생성기가 사실 파일에서 그대로 꺼낸 것.
//   표 안에 eBay 링크를 두지 않는다(제휴 고지보다 앞). 날짜는 ISO <time>.
// caption = 이미 만든 HTML 조각(표 제목, 2026-10-19 — 표만 떼어 인용될 때 무엇·언제 값인지 붙어 가게). 없으면 생략. cls = 추가 class.
function kfTableAny(rows, { id = "key-facts-table", label = "Key facts", lang = "en", caption = "", cls = "" } = {}) {
  const ko = lang === "ko";
  const t = (en, k) => (ko ? esc(k) : `<span data-ko="${esc(k)}">${esc(en)}</span>`);
  const body = rows.filter(Boolean).map(([k, en, k2, v]) => `<tr data-k="${k}"><th scope="row">${t(en, k2)}</th><td>${v}</td></tr>`);
  return `<table class="kfTable text${cls ? " " + esc(cls) : ""}" id="${esc(id)}" aria-label="${esc(label)}">${caption ? `<caption>${caption}</caption>` : ""}<tbody>
            ${body.join("\n            ")}
          </tbody></table>`;
}

// 세트·영문세트·카드 생성기가 각자 인라인 <style> 에 넣는다(세 곳 모두 styles.css 를 따로 안 쓴다).
const BUY_CTA_CSS = `      .ctaRow a.buyNow { flex-direction: column; align-items: flex-start; gap: 2px; min-height: 52px; padding: 7px 16px;
        background: rgba(16,215,160,.16); border-color: rgba(16,215,160,.55); color: #10d7a0; }
      .ctaRow a.buyNow .buyLine { display: inline-flex; align-items: center; gap: 7px; font-weight: 650; }
      .ctaRow a.buyNow b { font-size: 16px; letter-spacing: .01em; }
      .ctaRow a.buyNow .buyArrow { opacity: .75; font-size: 12px; }
      .ctaRow a.buyNow .buyOff { font-style: normal; font-size: 11.5px; font-weight: 600; color: #ffd166; }
      .ctaRow a.buyNow .buyAsOf { font-style: normal; font-size: 11.5px; color: rgba(255,255,255,.55); }
      .ctaRow a.buyNow .buyOff + .buyAsOf { margin-left: 8px; }`;

// 영문판 페이지 차트에 넘기는 계열 — 영문판(+초판 Blue)만. 일본판 선은 일본판 페이지에 있다.
// 생성기(generate-english-set-pages)와 가드 KF4(차트가 있어야 할 페이지인가)가 같은 판정을 쓰게 여기 한 곳에 둔다.
function enOnlySeries(ser) {
  return {
    en: ser.en, enBlue: ser.enBlue,
    windowDays: ser.windowDays,
    monthly: { en: ser.monthly?.en, enBlue: ser.monthly?.enBlue },
    daily: { en: ser.daily?.en, enBlue: ser.daily?.enBlue },
    // 판매일별 건수 — 거래량 막대(달력 칸)의 원천. 없으면 막대가 통째로 빠진다.
    counts: { through: ser.counts?.through, en: ser.counts?.en, enBlue: ser.counts?.enBlue },
    supply: (ser.supply || []).map((p) => ({ d: p.d, en: p.en })),
    reprintPct: ser.reprintPct,
  };
}

module.exports = { ROOT, SITE, EPN, CSS_VER, BoxChart, enOnlySeries, esc, usd, intl, monthYear, AFF_TOP, FOOT, foot, pageHead, upsertSitemap, epnUrl, buyCta, buyLink, BUY_CTA_CSS, keyFactsHtml, KF_CSS, KF_CSS_ANY, kfTableAny, withChartCss, dataDesc };
