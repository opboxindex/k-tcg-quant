// 한국어 정적 페이지 생성 — /ko/index.html (원피스 부스터박스 시세 허브).
// 네이버 Yeti·구글이 크롤 가능한 "구운" 한국어 HTML(JS 스왑 아님). 검증된 onepiece-packs.json에서 생성 → 야간 재생성으로 영문판과 동일 데이터 유지.
// Run: node tools/generate-ko-pages.js
const CSS_VER = (require("fs").readFileSync(require("path").join(__dirname, "..", "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";  // 하드코딩 금지 — 범프 때 가드 V1 이 배포를 막는다(2026-07-27)
const fs = require("fs");
const { variant } = require("./image-variants");
const { detailRobotsMeta } = require("./adsense-review-gate");
const { syncDetailUrls } = require("./sitemap-detail-urls");
// 세트별 공식 카드리스트(ko/<code>-card-list.html — generate-card-list-pages.js). 링크는 공식 목록 데이터(사실 파일 cardLists)로 정한다(2026-10-14, W7).
// 상단 Key facts 표 — 영문 세트 페이지와 같은 값(사실 파일 keyFacts.jp)을 한국어로 그린다(2026-10-14, W5a).
const { keyFactsHtml, KF_CSS, usd } = require("./set-page-shared");
const path = require("path");
const ROOT = path.join(__dirname, "..");
// 사실 한 벌(data/derived/site-facts.json, tools/build-site-facts.js) — 2026-10-15. 시세판(board)·재판 분류·경매 요약·NM 사용 술어·PSA 10 원화·
// 가장 비싼 카드·레어도·Key facts·수정일·최신 세트가 전부 여기서 온다. 원장은 주간 점(box-sold-series — 시세 흐름)만 직접 읽는다.
const F = require("./build-site-facts").load();
const CARD_LISTS = Object.fromEntries(F.cardLists.map((p) => [p.code, p]));
const { navHtmlKo } = require("./site-nav");
const NAV_KO = navHtmlKo();
const SITE = "https://opboxindex.com";
const CACHE = CSS_VER;  // packs.js DATA_VERSION 를 읽는다 — 하드코딩하면 범프 때 가드 V1 이 막는다(2026-07-27)

// 세트별 시세판(board) — 사실 파일 board(= packs.marketIndex.board 와 같은 값). 지수/개봉미터 표시는 2026-07-29 소유자 지시로 전부 삭제됨.
// 재판 기록 분류도 사실 파일 sets[code].reprint — 영문 세트 페이지·홈 배지와 같은 값(종전엔 marketIndex.reprints 사본이라 순서가 어긋나면 한국어만 옛 분류로 나갔다).
const fx = F.fx;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const won = (n) => (n == null ? "—" : Math.round(n).toLocaleString("ko-KR") + "원");
const pct = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(1) + "%");
const DATA_DATE = F.dataDate;
// 허브 "기준일"·"마지막 갱신" = 허브 표에 보이는 가장 늦은 중앙값 날짜(사실 파일 koHub.date) — 2026-10-15(5차): 표의 OP-07 행은 10-15 인데 둘 다 10-14(데이터 갱신일)였다.
// <title>·og:title 의 날짜는 그대로 둔다(SEO 민감 요소).
const HUB_DATE = F.dataDate;   // 2026-10-19 — 제목(DATA_DATE)과 같은 값 하나(사실 파일 dataDate)
// 발매 예정 세트 표(한국어 허브) — 2026-10-16. ko/op-18·ko/eb-05 로 가는 한국어 내부 링크가 0 이었다(푸터 제외). 값은 사실 파일 upcoming[code]
//   (공식 발매일·이베이 최저 호가·호가 기준일) — ko/<slug>.html 과 같은 칸. 발매된 세트는 표에서 빠지지 않고 '발매됨' 으로 남는다(행 수 고정).
const UPCOMING_ROWS = Object.entries(F.upcoming || {})
  .sort((a, b) => (a[1].release.en || "").localeCompare(b[1].release.en || ""))
  .map(([code, u]) => {
    const usd = (n) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
    const ask = [["일본판", u.ask && u.ask.jp], ["영문판", u.ask && u.ask.en]].filter(([, a]) => a && a.best).map(([ed, a]) => `${ed} ${usd(a.best.total)}`).join(" · ");
    const t = (iso) => `<time datetime="${esc(iso)}">${esc(iso)}</time>`;
    return `            <tr><td class="l"><a href="${esc(u.slug)}.html"><strong>${esc(code)}</strong></a></td><td>${t(u.release.en)}${u.released.en ? " · 발매됨" : ""}</td><td>${t(u.release.jp)}${u.released.jp ? " · 발매됨" : ""}</td><td>${ask || "—"}${ask && u.askAsOf ? ` <small>(${esc(u.askAsOf)})</small>` : ""}</td></tr>`;
  }).join("\n");

// 세트번호 자연정렬(OP-01..OP-16, EB-01..EB-03, PRB-01..PRB-02) — 사실 파일 order.board.
const BOARD = Object.fromEntries(F.board.map((b) => [b.code, b]));
const rows = F.order.board.map((code) => BOARD[code]);
// 최신 세트(계열별 가장 늦은 발매·120일 이내·공식 카드 리스트 있음) — 영문 생성기와 같은 목록(사실 파일 latestSets).
const LATEST_KO = new Set(F.latestSets);

// 박스 시세(원): board.nowUsd(우리 실판매 중앙값)×환율 — 사실 파일 sets[code].priceKrw.
// 종전엔 sets.boxSeries KRW 를 우선했는데 그 외부 시세가 07-12 에 멈춘 것을 아무도 몰랐다 — 2026-08-21 제거.
function boxKrw(code) {
  return F.sets[code] ? F.sets[code].priceKrw : null;
}
// 산문용 시세 시리즈 — 히어로(boxKrw)와 **같은 소스**를 쓴다. 2026-08-25.
// 종전엔 이 아래 산문만 sets.boxSeries(외부 KRW 시세)를 계속 썼는데 그게 2026-07-12 에 멈춰 있었다.
// 그래서 21개 ko 페이지 전부가 한 페이지 안에서 서로 다른 "현재 시세"를 말했다
// (예: op-01 히어로 422,190원 vs 본문 484,721원). OP-02 는 값을 비워 둔 세트인데 본문만 값을 제시했다.
let SOLD_SERIES = { sets: {} };
try { SOLD_SERIES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "box-sold-series.json"), "utf8")); } catch (e) {}
// USD 주간 중앙값 → 원화. 환율은 히어로와 같은 fx 를 쓴다.
function soldKrwPts(code) {
  const arr = ((SOLD_SERIES.sets || {})[code] || {}).jp || [];
  if (!fx.usdKrw) return [];
  return arr.filter((p) => p && p.median != null).map((p) => ({ d: p.d, p: Math.round(p.median * fx.usdKrw) }));
}

// PSA 10 실거래 중앙값(원화) = 사실 파일 cards[i].psa10.krw — 표본 3건 이상, 영문 페이지가 내는 달러 값(psa10Usd) × 다른 원화 환산과 같은 fx.usdKrw(2026-10-15, 5차).
// 통화를 모르면 null — 그 문장 자체를 싣지 않는다(빈칸 > 틀린값). 2026-09-16: 확인 없이 원화로 찍어 "921원 … 약 0.0배"가 나갔다.

function nameKo(code) { const s = F.sets[code]; return (s && s.nameKo) || code; }
// 재판 기록 분류 = 사실 파일 sets[code].reprint(market-data-normalizers.splitReprints) — 영문 세트 페이지·홈 배지와 같은 값(2026-10-15, 4차).
//   restock = 재판 횟수(리테일러·유통사 재입고 + "再販"이라 적힌 추첨 — OP-09 반다이남코샵 2024-10) · lottery = 再販 표기 없는 발매 후 추첨(재판 아님)
//   · unverified = 발매 전후 미확인 추첨. 발매 전 추첨(pre-release-lottery)은 초판 배정이라 어디에도 싣지 않는다.
// 3차는 반다이 추첨을 전부 빼서 OP-09 가 허브에서 "재판 1회" → "재판 기록 없음"이 됐다(원장 메모는 再販).
function reprintSplit(code) {
  const r = F.sets[code] ? F.sets[code].reprint : { restock: [], lottery: [], unverified: [] };
  return { restock: r.restock, lottery: r.lottery, unverified: r.unverified };
}
// 툴팁·본문에 note 원문(영어 내부 검증 메모)을 넣지 않는다 — 2026-08-26. 시기 + 유형(한국어)만.
const RESTOCK_KO = { retailer: "리테일러 재입고", distributor: "유통사 재입고", "official-reprint-lottery": "반다이남코샵 재판(再販) 추첨판매" };
// 재입고(리테일러·유통사)만 있는 기록인가 — "반다이 공식 발표가 아닌 유통 기록" 문장은 그때만 맞다(再販 추첨은 반다이남코샵 기록).
const storeOnly = (rr) => rr.every((r) => r.kind === "retailer" || r.kind === "distributor");
const restockLabel = (r) => [r.date, RESTOCK_KO[r.kind] || "재입고"].filter(Boolean).join(" · ");
// 추첨판매 한 줄 라벨 — 허브 표·세트 페이지 팩트·FAQ 가 같은 문구를 쓴다.
const drawText = ({ lottery, unverified }) => [
  lottery.length ? `발매 후 반다이 공식 추첨판매 ${lottery.length}회(${lottery.map((r) => r.date).filter(Boolean).join(", ")})` : "",
  unverified.length ? `반다이 추첨판매 ${unverified.length}회(${unverified.map((r) => r.date).filter(Boolean).join(", ")}, 발매 전후 미확인)` : "",
].filter(Boolean).join(" · ");

/** Return a Korean noun phrase with the correct 은/는 topic particle. */
function topic(value) {
  const text = String(value || "");
  const last = [...text].pop() || "";
  const codePoint = last.charCodeAt(0);
  const hangulBatchim = codePoint >= 0xAC00 && codePoint <= 0xD7A3
    ? (codePoint - 0xAC00) % 28 !== 0
    : false;
  // Korean readings of 0/1/3/6/7/8 end in a consonant (영/일/삼/육/칠/팔).
  const hasBatchim = hangulBatchim || /[013678]$/.test(last);
  return `${text}${hasBatchim ? "은" : "는"}`;
}

// 급등/급락 — 사실 파일 koHub.topUp·topDn(board 순서 = 등락 내림차순, 값 없는 세트는 맨 뒤)
const topUp = F.koHub.topUp.map((c) => BOARD[c]);
const topDn = F.koHub.topDn.map((c) => BOARD[c]);

// 허브 해설 산문("지금 일본판 박스 시장 읽는 법" 3문단)은 2026-10-15 소유자 결정으로 지웠다 — 데이터 페이지엔 숫자·표·라벨만.
// 상승·하락 세트 수, 최고·최저 박스, 1위 등락은 위 시세표·급등락 표가 그대로 보여 주는 값의 되풀이였고,
// "시세를 움직이는 힘은 셋"·"추정치가 아니라 …"·"읽으면 안 됩니다" 는 해석·방법 설명이었다.
// 설명문(meta·og) = 같은 페이지 표에 보이는 값만 — 최고·최저 박스(화면 원화 반올림 기준, 같은 금액이면 모두 — 2026-10-15 5차 규칙)와 급등락 1위.
const hubDesc = (() => {
  const pick = (x) => `${x.codes.join("·")} ${won(x.krw)}`;   // 사실 파일 koHub.max·min(화면 원화 반올림 기준, 같은 금액이면 모두)
  const u0 = topUp[0], d0 = topDn[0];
  return [
    `일판 원피스 부스터박스 ${rows.length}세트 원화 시세`,
    `기준일 ${HUB_DATE}`,
    F.koHub.max ? `최고 ${pick(F.koHub.max)}` : "",
    F.koHub.min ? `최저 ${pick(F.koHub.min)}` : "",
    u0 && u0.changePct > 0 ? `4주 급등 ${u0.code} ${pct(u0.changePct)}` : "",
    d0 && d0.changePct < 0 ? `급락 ${d0.code} ${pct(d0.changePct)}` : "",
  ].filter(Boolean).join(" · ");
})();

// 카드 썸네일 — 자체 호스팅 이미지만 쓴다(외부 CDN 직링크는 가드 I1 이 막는다).
// ko/ 깊이라 출력할 때 "../" 를 붙인다(안 붙이면 /ko/img/... 로 해석돼 404).
const IMG_MAP_CARDS = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "img", "cards", "map.json"), "utf8")); } catch { return {}; } })();
const cardSlugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
function ownCardImage(c) {
  const mapped = IMG_MAP_CARDS[cardSlugify(c.number + "-" + c.name)];
  if (mapped) return mapped;
  const u = c.image || c.img || "";
  if (/^https:\/\/opboxindex\.com\//.test(u)) return u.replace(/^https:\/\/opboxindex\.com\//, "").replace(/^\/+/, "");
  return null;
}

// 시세표 행 — 변동률 = 그 중앙값(nowDate) 대 28일 전 중앙값(changeBasis). 기준일이 세트마다 달라 행마다 명시한다.
// (종전 주석의 "2026-01-07 대비·OP-16 발매추적"은 옛 정의다 — 2026-10-14 부터 build-market-index 가 4주 기준으로 낸다.)
const koSlug = (code) => code.toLowerCase();
const tableRows = rows.map((b) => {
  const krw = boxKrw(b.code);
  const rs = reprintSplit(b.code);
  // 재판 칸 = 재입고 횟수. 반다이 추첨판매는 재판으로 세지 않고 아래 작은 글씨로 따로(영문 세트 페이지와 같은 분류, 2026-10-15).
  // 칸이 좁아(390px) 작은 글씨는 짧게, 시기·유형은 툴팁에.
  const drawShort = [rs.lottery.length ? `발매 후 추첨 ${rs.lottery.length}회` : "", rs.unverified.length ? `추첨 ${rs.unverified.length}회(발매 전후 미확인)` : ""].filter(Boolean).join(" · ");
  const rpCell = (rs.restock.length
    ? `<span class="rpDot" title="${esc(rs.restock.map(restockLabel).join(" / "))}">재판 ${rs.restock.length}회</span>`
    : `<span class="rpNone">재판 기록 없음</span>`) + (drawShort ? `<small class="fromDate" title="${esc(drawText(rs))}">${esc(drawShort)}</small>` : "");
  const chgCls = b.changePct >= 0 ? "up" : "down";
  return `<tr>
    <td class="code"><a href="${koSlug(b.code)}.html">${esc(b.code)}</a></td>
    <td class="nm">${esc(nameKo(b.code))}</td>
    <td class="num">${won(krw)}${b.nowDate ? `<small class="fromDate">${esc(b.nowDate)}</small>` : ""}</td>
    <td class="num ${chgCls}">${pct(b.changePct)}${b.changeBasis ? `<small class="fromDate">${esc(b.changeBasis)} 대비</small>` : ""}</td>
    <td class="rp">${rpCell}</td>
  </tr>`;
}).join("\n");

// FAQ (한국어) — 스키마 + 본문 동일 소스. 답이 데이터 사실(출처·환율·변동률 정의)인 문답만 둔다 — 2026-10-15 소유자 결정.
// 지운 문답: "재판 정보는 공식인가요?"(무엇을 세는지·'기록 없음'의 뜻풀이 → 시세표 범례의 "재판 =" 라벨로),
// "아마존 응모는 어떻게?"(안내 문장 — 아래 버튼 링크가 같은 일을 한다), "일판과 정발은 시세가 같나요?"(근거 없는 단정 + 집계 범위 설명 → 첫 줄 "일본판" 라벨로).
const faqs = [
  {
    q: "원피스 부스터박스 시세는 어디 기준인가요?",
    a: `이베이 실거래 중앙값의 원화 환산값입니다(환율 ₩${fx.usdKrw}/$, ${fx.date}).`,
  },
  // 2026-10-15 QA: 이 답은 "2026년 1월 대비·OP-16만 발매 시점부터" 라는 옛 정의를 고정 문구로 들고 있어, 같은 페이지 범례
  // ("28일 전 중앙값 대비")·행 표기("2026-09-15 대비")와 FAQPage 구조화데이터가 엇갈렸다. 범례와 같은 정의로 쓴다(가드 KO1).
  {
    q: "변동률은 발매일 대비인가요?",
    a: "아니요. 각 세트 판매 중앙값을 그 28일 전 중앙값과 비교한 값입니다.",
  },
];
const faqLd = JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
const datasetLd = JSON.stringify({
  "@context": "https://schema.org", "@type": "Dataset",
  name: "원피스 부스터박스 시세 (일본판)",
  description: "일본판 원피스 카드게임 부스터박스 전 세트의 원화 시세, 4주 변동률(28일 전 중앙값 대비), 재판 기록. 매일 갱신.",   // "1월 대비"는 옛 정의(2026-10-15)
  inLanguage: "ko", isAccessibleForFree: true,
  // 표에 실린 값의 마지막 판매일 범위·라이선스·내려받기 — 비어 있었다(2026-10-14 W6b). 영문 홈 Dataset 과 같은 기준.
  // 기간 = 배포 파일(opbox-set-prices.csv)의 관측일 범위 — free-data 의 같은 Dataset 과 한 함수(2026-10-14 QA).
  // 수정일 ≥ 기간 끝 — 2026-10-15 감사(#4): dateModified 10-14(DATA_DATE) · 기간 …/10-15 였다.
  ...(() => { const sp = F.coverage.boxCsv; return sp ? { temporalCoverage: sp.coverage, dateModified: [DATA_DATE, sp.to].filter(Boolean).sort().pop() } : { dateModified: DATA_DATE }; })(),
  url: `${SITE}/ko/`,
  license: "https://creativecommons.org/licenses/by/4.0/",
  distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/opbox-set-prices.csv` }],
  creator: { "@type": "Organization", name: "OP Box Index", url: `${SITE}/` },
});

const faqHtml = faqs.map((f) => `<details class="faqItem"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n");

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <!-- Korean data pages remain ad-free during AdSense site approval. -->
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${SITE}/ko/" />
    <link rel="alternate" hreflang="ko" href="${SITE}/ko/" />
    <link rel="alternate" hreflang="en" href="${SITE}/" />
    <link rel="alternate" hreflang="x-default" href="${SITE}/" />
    <link rel="alternate" type="application/rss+xml" title="OP Box Index 한국어" href="${SITE}/ko/feed.xml" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>원피스 카드 시세 — 일판 부스터박스 ${rows.length}세트 원화 (${DATA_DATE} 기준) | opboxindex</title>
    <meta name="description" content="${esc(hubDesc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:title" content="원피스 부스터박스 시세 (일판) — ${rows.length}세트 원화, ${DATA_DATE} 기준" />
    <meta property="og:description" content="${esc(hubDesc)}" />
    <meta property="og:url" content="${SITE}/ko/" />
    <meta property="og:image" content="${SITE}/og/og-set-list.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${faqLd}</script>
    <script type="application/ld+json">${datasetLd}</script>
    <link rel="stylesheet" href="../styles.css?v=${CACHE}" />
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .ixHero { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin: 6px 0 2px; }
      .ixHero .big { font-size: 46px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
      .ixChg { font-size: 14px; font-weight: 800; padding: 3px 11px; border-radius: 8px; }
      .up { color: var(--accent); } .down { color: var(--red); }
      .ixChg.up { background: rgba(var(--accent-rgb), .12); } .ixChg.down { background: rgba(255,125,125,.12); }
      .koBoard { width: 100%; max-width: 760px; border-collapse: collapse; font-size: 14px; margin: 10px 0; }
      .koBoard th { text-align: right; padding: 8px 10px; border-bottom: 1px solid #2a3140; color: #9aa4b6; font-size: 11.5px; }
      .koBoard th.l, .koBoard td.nm, .koBoard td.code, .koBoard td.rp { text-align: left; }
      .koBoard td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); font-variant-numeric: tabular-nums; }
      @media (max-width: 640px) { .koBoard th, .koBoard td { padding: 8px 6px; } }   /* 390px 에서 표가 2px 넘쳐 가로 스크롤됐다(2026-10-13 QA) */
      .koBoard td.num { text-align: right; white-space: nowrap; }
      .koBoard td.code { font-weight: 700; color: #cfd6e4; }
      .koBoard td.nm { color: #9aa4b6; }
      .rpDot { display: inline-block; background: rgba(255,125,60,.15); color: #ff9d6c; border-radius: 6px; padding: 1px 7px; font-weight: 700; font-size: 12px; }
      .rpNone { color: #6a7182; font-size: 12px; }
      .koLinks { list-style: none; padding: 0; margin: 8px 0; max-width: 760px; color: #9aa4b6; font-size: 14px; line-height: 1.9; }
      .fromDate { display: block; font-size: 11.5px; color: var(--muted); font-weight: 400; }
      .koBoard td.code a { color: var(--accent); text-decoration: none; font-weight: 700; }
      .owMeter { display: flex; gap: 8px; align-items: flex-end; height: 120px; max-width: 520px; margin: 12px 0; }
      .owBar { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; gap: 4px; }
      .owBar span { width: 100%; background: #ff7d3c; opacity: .6; border-radius: 4px 4px 0 0; min-height: 6px; }
      .owBar:last-child span { opacity: 1; }
      .owBar small { font-size: 11.5px; color: var(--muted); }
      .koFacts { margin: 14px 0; padding: 12px 16px; border: 1px solid rgba(var(--accent-rgb), .28); background: rgba(var(--accent-rgb), .05); border-radius: 12px; max-width: 760px; font-size: 14px; line-height: 1.7; }
      .koFacts strong { color: var(--accent); }
      .koNote { color: var(--muted); font-size: 12.5px; max-width: 760px; margin: 8px 0 14px; line-height: 1.6; }
      main h2 { font-size: 18px; margin: 24px 0 6px; }
      .moverGrid { display: flex; gap: 14px; flex-wrap: wrap; margin: 10px 0; }
      .moverCol { flex: 1; min-width: 200px; }
      .moverCol h3 { font-size: 13px; color: #9aa4b6; margin: 0 0 6px; }
      .moverCol ul { list-style: none; padding: 0; margin: 0; font-size: 13.5px; }
      .moverCol li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
      .faqItem { max-width: 760px; border-bottom: 1px solid rgba(255,255,255,.08); padding: 4px 0; }
      .faqItem summary { cursor: pointer; font-weight: 700; padding: 8px 0; font-size: 14.5px; }
      .faqItem p { color: #9aa4b6; font-size: 13.5px; line-height: 1.65; margin: 4px 0 10px; }
      .koCta { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
      .koCta a { display: inline-block; padding: 11px 18px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px; }
      .koCta .primary { background: var(--accent); color: #08131a; }
      .koCta .ghost { border: 1px solid #2a3140; color: #cfd6e4; }
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">본문으로 건너뛰기</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>부스터박스 리서치</small></span></a>
      ${NAV_KO}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow">한국어 · 원피스카드 일판 시세</p>
      <h1>원피스 부스터박스 시세 (일판) — 전 세트 원화 시세</h1>
      ${/* 사이트 소개 문장("…기반 원화 시세입니다. 기준과 출처가 확인된 값만 표시하며 매일 갱신합니다")은 지웠다 — 라벨·기준일만(2026-10-15 소유자 결정). "기준일 X." 는 가드 KD1 이 읽는다 */ ""}
      <p class="koNote">일본판 · 원화 환산 · 기준일 ${esc(HUB_DATE)}</p>

      <section aria-label="전 세트 시세표">
        <h2>전 세트 박스 시세표 (원화)</h2>
        ${/* 범례 = 라벨·한 조각 정의만. "세트 코드를 누르면 …갑니다" 안내 문장은 지웠고, 허브 FAQ "재판 정보는 공식인가요?"의 뜻은 "재판 =" 라벨로 옮겼다(2026-10-15) */ ""}
        <p class="koNote">시세 = 이베이 실거래 중앙값(원화 환산) · 아래 날짜 = 그 중앙값의 날짜 · 변동률 = <strong>28일 전 중앙값 대비</strong>(기준일 행마다, 발매일 대비 아님) · — = 28일 안에 날짜가 찍힌 중앙값 없음(중앙값 = 판매 6건 이상) · 재판 = 유통사·리테일러 재입고 + 반다이남코샵 재판(再販) 추첨판매</p>
        <div style="overflow-x:auto">
        <table class="koBoard">
          <thead><tr><th class="l">세트</th><th class="l">이름</th><th>일판 박스 시세 (기준일)</th><th>4주 등락</th><th class="l">재판</th></tr></thead>
          <tbody>
${tableRows}
          </tbody>
        </table>
        </div>
      </section>

      <section aria-label="급등 급락">
        <h2>급등·급락 TOP 3 (4주)</h2>
        <div class="moverGrid">
          <div class="moverCol"><h3>▲ 급등</h3><ul>${topUp.map((b) => `<li><span>${esc(b.code)} ${esc(nameKo(b.code))}</span><span class="up">${pct(b.changePct)}</span></li>`).join("")}</ul></div>
          <div class="moverCol"><h3>▼ 급락</h3><ul>${topDn.map((b) => `<li><span>${esc(b.code)} ${esc(nameKo(b.code))}</span><span class="down">${pct(b.changePct)}</span></li>`).join("")}</ul></div>
        </div>
      </section>

${UPCOMING_ROWS ? `      <section aria-label="발매 예정 세트">
        <h2>발매 예정 세트 · 발매일</h2>
        <div style="overflow-x:auto">
        <table class="koBoard">
          <thead><tr><th class="l">세트</th><th>영문판 발매일</th><th>일본판 발매일</th><th>최저 호가 (이베이 · 배송비 포함)</th></tr></thead>
          <tbody>
${UPCOMING_ROWS}
          </tbody>
        </table>
        </div>
      </section>
` : ""}
      <section aria-label="주제별 데이터">
        <h2>주제별 데이터</h2>
        ${/* 링크 + 라벨만 — "셋 다 자체 수집 데이터로 매일 갱신됩니다"·"호가가 아닌 실제 …" 설명 문장은 지웠다(2026-10-15 소유자 결정) */ ""}
        <ul class="koLinks">
          <li><a href="cards.html"><strong>원피스카드 일판 시세</strong></a> — 인기 카드 NM·PSA 10 실거래가 (원화)</li>
          <li><a href="grading.html"><strong>그레이딩 인구</strong></a> — PSA·CGC·TAG 세트별 누적·젬률</li>
          <li><a href="auction.html"><strong>이베이 경매 낙찰 데이터</strong></a> — 낙찰가·낙찰률</li>
        </ul>
      </section>

      ${/* 공식 카드 리스트 한국어판(ko/<code>-card-list.html) — 2026-10-16. 허브에서 가는 링크가 0 이라 EB-04 판은 들어오는 링크가 없는 고아였다. 라벨·수치만. */ ""}
      <section aria-label="공식 카드 리스트">
        <h2 id="card-lists">세트별 공식 카드 리스트 (일본판)</h2>
        <ul class="koLinks">
          ${F.cardLists.map((p) => `<li><a href="${p.slug}-card-list.html"><strong>${esc(p.code)}</strong> ${esc((F.sets[p.code] && F.sets[p.code].nameKo) || p.name || "")}</a> — 카드 ${p.counts.cards}장 · 번호 ${p.counts.numbers}종</li>`).join("\n          ")}
        </ul>
      </section>

      <div class="koCta">
        <a class="primary" href="amazon-lottery.html">아마존 응모 안내 →</a>
        <a class="ghost" href="../psa-grading.html">그레이딩 인구 데이터 →</a>
        <a class="ghost" href="../sets/index.html">세트별 가이드 →</a>
      </div>

      <section aria-label="자주 묻는 질문">
        <h2>자주 묻는 질문</h2>
        ${faqHtml}
      </section>

      ${/* 출처·환율·갱신일만. 본문의 투자 면책 문장은 지웠다 — 면책은 아래 footer 한 줄(2026-10-15 소유자 결정). "마지막 갱신 X." 는 가드 KD1 이 읽는다.
            허브엔 PSA 값이 더는 없어(해설 산문 삭제) 출처에서 PSA 인구 리포트를 뺐다 */ ""}
      <p class="koNote">데이터: 이베이 실거래 · 유통사·리테일러·반다이남코샵 재판 기록 · 환율 ₩${fx.usdKrw}/$ (${esc(fx.date)}) · 마지막 갱신 ${esc(HUB_DATE)}.</p>
    </main>
    <footer class="footer">
      <p>OP Box Index는 투자 권유가 아닌 데이터 기반 리서치 사이트입니다.</p>
      <nav aria-label="정책 안내"><a href="../about.html">About</a><a href="../methodology.html">Methodology</a><a href="../privacy.html">Privacy</a><a href="../disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;

fs.mkdirSync(path.join(ROOT, "ko"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "ko", "index.html"), html, "utf8");

// ─────────────────────────────────────────────────────────────
// 세트별 한국어 페이지 /ko/{code}.html — 한국어 롱테일("op-16 시세", "결전의 시간 박스 가격") 공략.
// 값은 전부 검증된 데이터에서만 파생하고, 없으면 표시하지 않음(빈칸 > 틀린값).

function setPageKo(b) {
  const code = b.code;
  const s = F.sets[code];   // 세트 사실(cards·grading·auction·keyFacts·pageDate)
  const nKo = nameKo(code);
  const slug = koSlug(code);
  const krw = boxKrw(code);
  const rs = reprintSplit(code);
  const rr = rs.restock;   // 재판 횟수 = 재입고 기록만(반다이 추첨판매 제외 — 2026-10-15)
  const draws = drawText(rs);
  const enHref = fs.existsSync(path.join(ROOT, "sets", `${slug}.html`)) ? `../sets/${slug}.html` : null;
  const canonical = `${SITE}/ko/${slug}.html`;
  const chg = b.changePct;
  const up = chg >= 0;

  // 인기 카드(쓸 수 있는 NM 보유분만, 원화). 값 없으면 섹션 자체를 숨김.
  // 레어도 = 반다이 공식 카드 리스트의 그 인쇄 레어도(CARD_LIST.rarityCode — 영문 세트·카드 상세·AI 피드와 같은 함수·같은 코드, 2026-10-15).
  // 1차 수정은 이 파일에만 함수를 둬서 한국어 SP · 영문 Super Rare 로 갈렸다(72행).
  // 2026-10-15: 읽은 날이 없는 NM·숨김 표시 NM 은 싣지 않는다(nm.usable) — 영문 세트·카드 상세·AI 피드가 비우는 값을 여기만 원화로 보였다.
  const topCards = s.cards.filter((c) => c.nm.usable && c.number).slice(0, 8);
  // 자체 호스팅 이미지가 한 장도 없는 세트는 썸네일 열 자체를 넣지 않는다(빈 열 방지).
  const cardThumbs = topCards.map((c) => ownCardImage(c));
  const hasThumb = cardThumbs.some(Boolean);
  const thumbCell = (i, c) => (hasThumb
    ? `<td class="thumb">${cardThumbs[i] ? `<img src="${esc((variant("../" + cardThumbs[i], "thumb") || { src: "../" + cardThumbs[i] }).src)}" alt="${esc(c.number)} ${esc(c.name)}" width="40" height="56" loading="lazy" decoding="async" />` : ""}</td>`
    : "");
  const cardRows = topCards.map((c, i) => `<tr>${thumbCell(i, c)}<td class="nm">${esc(c.name)}</td><td class="code">${esc(c.number)}</td><td>${esc(c.rarity || "—")}</td>${c.nm.stale ? `<td class="num stale" title="NM 관측일 ${esc(c.nm.date || "")} — ${F.staleDays.nm}일 넘음">` : `<td class="num">`}${won(c.nm.krw)}</td></tr>`).join("\n");
  // 28일 넘게 다시 읽지 못한 NM(사실 nm.stale)은 흐린다 — 영문 세트 Top 10·카드 상세와 같은 기준(2026-11-05). 관측일은 표 위 라벨(관측일 …)에 있다.
  // 경매 실적 — 종료 후 재조회해 쌓은 원장(set-auction-stats)의 숫자. 2026-10-15 소유자 결정: 문장 대신 표·라벨.
  // 지운 문장: "우리가 종료 후 다시 조회해 결과를 확인했습니다"·"호가가 아니라 실제 낙찰 결과입니다"·"낙찰 여부가 확인된 건이 적어 비율은 싣지 않습니다"
  // ·"경매만 집계합니다 — 즉시구매는 따로 셉니다. 유찰된 경매도 분모에 그대로 둡니다"(→ 라벨 "이베이 경매(즉시구매 제외)"·"낙찰률 = 낙찰 ÷ 종료(유찰 포함)").
  // 총계(종료·낙찰·낙찰률)는 유형별 표의 "전체" 행으로 — 유찰률은 100 − 낙찰률이라 따로 싣지 않는다.
  const koAuctionSection = (() => {
    const a = s.auction;
    if (!a || a.ended < 30) return "";
    const w = F.auctionWindow;
    // carton(박스 케이스 묶음) 키가 빠져 영문 내부 키가 한국어 표에 그대로 나갔다(2026-10-15 QA). 분류기(auction-classify.js)의 키와 맞춘다.
    const catKo = { card: "싱글카드", box: "미개봉 박스", pack: "낱개 팩", carton: "카톤(박스 묶음)", graded: "등급카드", lot: "묶음" };
    const cnt = (n) => (n == null ? "—" : Number(n).toLocaleString("ko-KR"));
    const rate = (v) => (v == null ? "—" : `${v}%`);   // 비율이 없으면 "null%" 대신 "—"
    const cats = a.byCat.slice(0, 4);   // 종료 건수 내림차순(사실 파일)
    const tr = (label, e, strong) => `<tr><td class="l">${strong ? `<strong>${esc(label)}</strong>` : esc(label)}</td><td>${cnt(e.ended)}</td><td>${cnt(e.sold)}</td><td>${rate(e.sellThrough)}</td></tr>`;
    const rows = [tr("전체", a, true), ...cats.map((e) => tr(catKo[e.cat] || e.cat, e))].join("");
    // 거래액·중앙 낙찰가는 달러(set-auction-stats amount·medPrice = USD). 2026-10-15 QA: 통화 없이 "182,037" 로 나가
    // 원화 위주 페이지에서 원으로 읽혔다(약 1,340배 차이). 영문 세트 페이지와 같은 값·같은 표기("$" + 원값).
    const money = [
      a.amount ? `<li>거래액 <strong>$${a.amount.toLocaleString("en-US")}</strong></li>` : "",
      a.medPrice ? `<li>중앙 낙찰가 <strong>$${a.medPrice}</strong></li>` : "",
    ].join("");
    return `
      <section aria-label="경매 실적">
        <h2>${esc(code)} 경매는 실제로 어떻게 팔리나</h2>
        <p class="koNote">최근 ${w.days || 30}일 · ${esc(w.updated || "")} 기준 · ${esc(code)} 카드 이베이 경매(즉시구매 제외) · 낙찰률 = 낙찰 ÷ 종료(유찰 포함)</p>
        ${money ? `<ul class="koFacts">${money}</ul>` : ""}
        <div style="overflow-x:auto"><table class="koBoard tblFit"><thead><tr><th class="l">유형</th><th>종료</th><th>낙찰</th><th>낙찰률</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
  })();

  // NM 관측일 = 그 변형을 읽은 날(nmUpdated) — 2026-10-15 감사(#10): 종전엔 "DATA_DATE(10-14) 기준으로 비교합니다"라 10-11 에 읽은 값을
  // 10-14 값처럼 말했다(카드리스트·카드 상세·AI 피드는 10-11). 원화 값은 오늘 환율 환산이라 환율 날짜를 따로 적는다.
  const nmDays = topCards.map((c) => c.nm.date).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "")).sort();
  const nmSpan = nmDays.length ? (nmDays[0] === nmDays.at(-1) ? nmDays[0] : `${nmDays[0]}~${nmDays.at(-1)}`) : "";

  // 2026-10-15 소유자 결정 — 데이터 페이지엔 숫자·표·라벨만. 세트 해설 산문 4절(2026-07-30 애드센스 대응으로 넣은 것)을 지우고
  // 숫자는 라벨 줄·표로 옮겼다. 지운 것: 해석("최근 매수세가 가격을 끌어올리고 있다는 뜻"·"가치를 끌고 가는 카드"·"박스 기대값의 골격"),
  // 방법·범위 설명("…합산하지 않고 각 표본을 따로 표시합니다"·"반다이의 세트별 공식 발표가 아니라 확인 가능한 유통 기록이며 …"),
  // 영문 페이지 안내 문장(아래 버튼 "영문 상세(차트·PSA)"가 같은 링크), 팩트 줄과 같은 재판 횟수를 되풀이하던 "재판(재발매) 이력" 절 전체,
  // 이름 패턴으로 센 "상위 카드 구성(망가 N장·SP N장 …)"(표에 없는 카드까지 센 추정 분류라 라벨로 옮기지 않았다).

  // 가장 비싼 카드 = 사실 파일 top10.priciest(market-data-normalizers.priciest — 검증된 NM 최댓값) — 영문 세트 Key facts·비교표와 같은 카드·같은 값(가드 PC1).
  // 종전엔 1순위 카드(s.cards[0])라 OP-05 가 "Monkey D. Luffy(OP05-119) 약 4,203,120원" 인데 바로 아래 표 2행은 6,735,120원이었다.
  // 모르면(검증 안 된 값이 1위 값 이상 — OP-08·OP-15·PRB-01·PRB-02·EB-02(5차)) 줄을 만들지 않는다. 라벨은 NM 하나(4차부터 TCG 값은 1위가 될 수 없다).
  const pc = s.top10.priciest;
  const cardFacts = [];
  if (pc) {
    const t0 = s.cards[pc.i];
    // 금액 뒤에 NM 관측일 — 영문 세트 Key facts 와 같은 날짜(2026-10-15, 5차: OP-12 09-07 값이 날짜 없이 나갔다).
    const pcWhen = pc.date ? `(${esc(pc.date)})` : "";
    cardFacts.push(pc.ties.length > 1
      ? `최고가 카드 (일본판 NM) <strong>${pc.ties.map((c) => esc(c.name)).join(" · ")}</strong> · 각 <strong>${won(t0.nm.krw)}</strong>${pcWhen}`
      : `최고가 카드 (일본판 NM) <strong>${esc(t0.name)}</strong>(${esc(t0.number)}) · <strong>${won(t0.nm.krw)}</strong>${pcWhen}`);
    // PSA 10 관측일·표본·배수 — 2026-10-15(4차). NM 원본 대비 배수는 카드 상세의 PSA-원본 비교와 같은 신선도 규칙(관측일이 데이터일 기준 35일 이내 — psa10.stale)일 때만.
    // 종전엔 10-11 NM 을 07-09 PSA 표본으로 나눠 ko/eb-02 "약 1.4배"(영문 기준 1.23배)가 나갔다. 통화를 모르는 값이면 줄을 싣지 않는다(psa10 → null).
    // 배수는 원화끼리(psa10.krw ÷ nm.krw) — 달러 기준 배수(psa10.multiple, NM 을 센트로 반올림)와 둘째 자리에서 갈릴 수 있어 종전 표기를 지킨다.
    const sold = t0.psa10;
    const soldKrw = sold ? sold.krw : null;
    const nmKrw = t0.nm.krw;
    const mult = soldKrw != null && nmKrw && sold.ageDays != null && !sold.stale ? soldKrw / nmKrw : null;
    if (soldKrw != null) {
      const soldWhen = [sold.date, `표본 ${sold.n}건`].filter(Boolean).join(", ");
      // 35일 넘은 표본(사실 psa10.stale)은 날짜를 붙인 채 흐린다 — 영문 랭킹·카드 상세 대표 칸과 같은 표시(2026-11-05).
      cardFacts.push({ stale: !!sold.stale, html: `PSA 10 실거래 중앙값 (${esc(t0.name)}) <strong>${won(soldKrw)}</strong>(${esc(soldWhen)})${mult != null ? ` · NM 대비 ×${mult.toFixed(1)}` : ""}` });
    }
  }
  // 설명 문장("…NM 카드 N장을 비교합니다(…)")은 라벨로 — 판·관측일·환율 날짜(2026-10-15).
  const cardsSection = topCards.length ? `
      <section aria-label="인기 카드 시세">
        <h2>${esc(code)} 인기 카드 NM 시세 (원화)</h2>
        <p class="koNote">일본판 NM · ${nmSpan ? `관측일 ${esc(nmSpan)} · ` : ""}환율 ${esc(fx.date)} 기준</p>
        ${cardFacts.length ? `<ul class="koFacts">${cardFacts.map((f) => (typeof f === "string" ? `<li>${f}</li>` : `<li${f.stale ? ' class="stale"' : ""}>${f.html}</li>`)).join("")}</ul>` : ""}
        <div style="overflow-x:auto">
        <table class="koBoard">
          <thead><tr>${hasThumb ? `<th class="l">이미지</th>` : ""}<th class="l">카드</th><th class="l">번호</th><th class="l">레어도</th><th>NM 시세</th></tr></thead>
          <tbody>
${cardRows}
          </tbody>
        </table>
        </div>
      </section>` : "";

  // 시세 흐름 — eBay 실판매 주간 중앙값(원화 환산, 히어로·Key facts 와 같은 환율). 점이 3개 미만이거나 최저 = 최고면 만들지 않는다
  // (2026-10-15 4차: ko/op-02 "최저 196,508원(2026-06-16)에서 최고 196,508원(2026-06-16)"). 마지막 점은 "현재 시세"라 부르지 않는다 —
  // 현재값은 Key facts 판매 중앙값(28일 규칙) 하나다. 마지막 점에 날짜를 붙여 옛 값이 현재값처럼 읽히지 않게 한다.
  const trendSection = (() => {
    const pts = soldKrwPts(code);
    if (pts.length < 3) return "";
    const lo = pts.reduce((m, p) => (p.p < m.p ? p : m));
    const hi = pts.reduce((m, p) => (p.p > m.p ? p : m));
    if (lo.p === hi.p) return "";
    const first = pts[0], last = pts[pts.length - 1];
    // 같은 값끼리의 비교(변동 0.0%)는 뺀다 — 2026-10-15(5차, 가드 EQ1): 마지막 값이 저점·고점과 같은 금액인데 날짜만 달라 "저점 대비 +0.0%"가 나갔다.
    const zero = (x) => Math.abs(x) < 0.05;
    const fromLo = ((last.p - lo.p) / lo.p) * 100, offHi = ((last.p - hi.p) / hi.p) * 100;
    const cmp = [!zero(fromLo) ? `저점 대비 ${pct(fromLo)}` : "", !zero(offHi) ? `고점 대비 ${pct(offHi)}` : ""].filter(Boolean).join(" · ");
    const li = [
      `추적 구간 ${esc(first.d)}~${esc(last.d)}`,
      `최저 <strong>${won(lo.p)}</strong>(${esc(lo.d)})`,
      `최고 <strong>${won(hi.p)}</strong>(${esc(hi.d)})`,
      // current 가 없으면(Key facts "—") 마지막 점이 28일보다 묵었다 — 종전 문장의 "(28일 안에 날짜가 찍힌 중앙값 없음)"을 라벨로 남긴다.
      `마지막 주간 중앙값${krw == null ? " (28일 넘은 값)" : ""} <strong>${won(last.p)}</strong>(${esc(last.d)})${cmp ? ` · ${cmp}` : ""}`,
    ];
    return `
      <section aria-label="시세 흐름">
        <h2>시세 흐름</h2>
        <ul class="koFacts">${li.map((x) => `<li>${x}</li>`).join("")}</ul>
      </section>`;
  })();

  // 그레이딩 인구 — 등급사·판마다 한 행(PSA·CGC·TAG 를 합산하지 않는다는 설명 문장 대신 표의 행 구분으로). 값이 없으면 행을 만들지 않는다.
  // CGC 만점 분리값이 없는 관측이면 "—"(2026-09-30: 없는 값을 0 으로 적어 22개 세트 페이지가 "프리스틴 10 0장"이었다 — 가드 G9).
  // TAG 10P 도 값이 없으면 "—"(종전 문장은 null 을 0 장으로 적었다).
  const gradingSection = (() => {
    const n = (v) => Number(v).toLocaleString("ko-KR");
    const g = [];
    const G = s.grading;   // 사실 파일: psa {jp,en}(total·gemRate·wowAdd) · cgc {jp,en} · tag {jp,en}
    if (G.psa.jp && G.psa.jp.total) g.push(["PSA", "일본판", `${n(G.psa.jp.total)}장${G.psa.jp.wowAdd != null ? `<small>최근 한 주 +${n(G.psa.jp.wowAdd)}장</small>` : ""}`, G.psa.jp.gemRate != null ? `PSA 10 ${G.psa.jp.gemRate}%` : "—"]);
    if (G.psa.en && G.psa.en.total) g.push(["PSA", "영문판", `${n(G.psa.en.total)}장`, G.psa.en.gemRate != null ? `PSA 10 ${G.psa.en.gemRate}%` : "—"]);
    const one = (x) => x && (x.jp ? ["일본판", x.jp] : x.en ? ["영문판", x.en] : null);
    const cgc = one(G.cgc);
    if (cgc && cgc[1].total) {
      const e = cgc[1];
      g.push(["CGC", cgc[0], `${n(e.total)}장`, e.pristine10 != null && e.gemMint10 != null ? `프리스틴 10 ${n(e.pristine10)}장 · 젬 민트 10 ${n(e.gemMint10)}장` : "—"]);
    }
    const tag = one(G.tag);
    if (tag && tag[1].total) {
      const e = tag[1];
      g.push(["TAG", tag[0], `${n(e.total)}장`, e.g10 != null ? `10 ${n(e.g10)}장 · 10P ${e.g10p != null ? n(e.g10p) + "장" : "—"}` : "—"]);
    }
    if (!g.length) return "";
    return `
      <section aria-label="그레이딩 인구 (PSA · CGC · TAG)">
        <h2>그레이딩 인구 (PSA · CGC · TAG)</h2>
        <div style="overflow-x:auto">
        <table class="koBoard tblFit">
          <thead><tr><th class="l">등급사 · 판</th><th>누적</th><th class="l">만점 등급</th></tr></thead>
          ${/* 등급사·판을 한 칸(줄바꿈 없음)으로 — 2026-10-15 390px 실측: 판 칸을 따로 두니 "일본판"이 한 글자씩 세로로 끊겼다 */ ""}
          <tbody>${g.map((r) => `<tr><td class="l" style="white-space:nowrap">${r[0]} ${r[1]}</td><td class="num">${r[2]}</td><td class="l">${r[3]}</td></tr>`).join("")}</tbody>
        </table>
        </div>
      </section>`;
  })();

  // 팩트 리스트 — 검증된 값만.
  // 2026-10-14(W5a): 현재 시세·발매 정가·영문판 발매일은 H1 아래 Key facts 표로 옮겼다(영문 페이지와 같은 함수·같은 값).
  // 종전 "현재 박스 시세 (기준일 데이터 갱신일)" 은 관측일이 아니라 갱신일을 적어, 7/7 값(OP-02)이 10/13 값처럼 나갔다.
  const facts = [];
  if (chg != null) facts.push(`${esc(b.changeBasis || "추적 시작일")} 대비 <strong>${pct(chg)}</strong> — 발매일 대비가 아님`);
  // 재판 기록 줄 = 날짜 · 유형 라벨(2026-10-15, 4차) — 再販 추첨(OP-09)은 "유통사·리테일러 재입고 기준"이 아니라서 꼬리 대신 기록마다 유형을 단다.
  facts.push(rr.length ? `재판 기록 <strong>${rr.length}회</strong> (${rr.map(restockLabel).map(esc).join(", ")})` : `<strong>재판 기록 없음</strong>`);   // 뜻풀이 꼬리(" — 확인된 재입고 기록이 없다는 뜻")는 뺐다 — 라벨·값만(2026-10-15, 3차)
  if (draws) facts.push(`${esc(draws)} — 재판 아님`);
  // "PSA 누적 감정" 줄(s.psaTotal)은 지웠다 — 데이터에 그 키가 없어 한 번도 나간 적 없는 죽은 경로이고, PSA 값은 아래 그레이딩 표(psaFull) 한 곳만(2026-10-15).

  // Key facts 표와 같은 모델(상단 표) — 사실 파일 keyFacts.jp.
  const kf = s.keyFacts.jp;
  // 시세 문답의 날짜 = 그 중앙값의 날짜(b.nowDate — Key facts 기준일·설명문과 같은 값). 2026-10-15 QA: 데이터 갱신일(DATA_DATE)을 적어
  // 09-23 값(OP-06)이 "2026-10-14 기준"으로 FAQPage 에 나갔고, 값이 없는 세트(OP-02·OP-04·EB-01)는 "추적가는 약 —이며"가 됐다.
  const priceQ = `${code} ${nKo} 박스 시세는 지금 얼마인가요?`;
  // 현재 값이 없으면 문답을 싣지 않는다 — 값이 없다는 사유 문장("…현재 시세를 표시하지 않습니다")은 2026-10-15(4차)에 뺐다. Key facts 표의 "—" 가 그 사실이다.
  const priceFaq = krw != null
    // "판매처와 밀봉 상태에 따라 실제 총구매가는 달라질 수 있습니다" 꼬리는 지웠다 — 값 문장 하나만(2026-10-15 소유자 결정).
    ? { q: priceQ, a: `${b.nowDate} 기준 ${code} ${nKo} 일본판 부스터박스 판매 중앙값은 약 ${won(krw)}입니다.` }
    : null;
  // 변동률 문답 = 팩트 줄("기준일 대비 — 발매일 대비가 아님")·허브 범례("28일 전 중앙값 대비")와 같은 정의.
  // 2026-10-15 QA: launchTracked 분기가 4주 비교 기준일(changeBasis)을 "발매 시점(2026-09-15)"으로 적어, OP-17(발매 08-22)·OP-16(05-30)
  // 페이지 안에서 발매일이 둘이 됐다. 비교 기준일은 발매와 무관하므로 분기를 없앴다. 간격은 날짜에서 계산한다(지금은 늘 28일).
  // 2026-10-15: 문장 주어를 "변동률" 하나로 — 종전 "…변동률을 표시하며, 발매일 대비가 아닙니다" 는 뒷절 주어가 바뀌었다.
  // 기준일(changeBasis)이나 값 날짜(nowDate)가 없으면 "그 N일 전 중앙값(…)" 절을 빼고 말한다 — "NaN일"·"undefined" 가 나갈 길을 막는다.
  const isDay = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
  const gapDays = chg != null && isDay(b.nowDate) && isDay(b.changeBasis) ? Math.round((Date.parse(b.nowDate) - Date.parse(b.changeBasis)) / 864e5) : null;
  // 변동률이 없으면 문답을 싣지 않는다. "발매일 대비가 아닙니다" 꼬리·"…변동률을 표시하지 않습니다" 사유 문장은 뺐다(2026-10-15, 4차) — 정의 문장 하나만.
  const chgA = chg == null ? null
    : gapDays != null
      ? `변동률(${pct(chg)})은 ${b.nowDate} 판매 중앙값을 ${gapDays}일 전(${b.changeBasis}) 중앙값과 비교한 값입니다.`
      : `변동률(${pct(chg)})은 판매 중앙값을 이전 판매 중앙값과 비교한 값입니다.`;
  // 재판 문답 — 재판 횟수(재입고 + 再販 추첨)만 답한다. 再販 표기 없는 추첨을 왜 빼는지 설명하던 꼬리("…반다이가 재판이라 부르지 않아 재판 횟수에 포함하지 않습니다")는 뺐다(2026-10-15, 4차).
  // "반다이 공식 발표가 아닌 유통 기록입니다" 꼬리도 지웠다 — 출처는 앞 절의 라벨("유통사·리테일러 재입고 기준")이 이미 말한다(2026-10-15 소유자 결정).
  const setFaqs = [
    priceFaq,
    { q: `${code} ${nKo} 재판 기록이 있나요?`, a: rr.length ? `${topic(nKo)} ${storeOnly(rr) ? "유통사·리테일러 재입고 기준 " : ""}재판 ${rr.length}회가 확인됐습니다(${rr.map(restockLabel).join(", ")}).` : `${topic(nKo)} 현재 확인된 유통 재입고 기록이 없습니다.` },
    chgA ? { q: `${code} ${nKo} 변동률은 어느 시점 대비인가요?`, a: chgA } : null,
  ].filter(Boolean);
  const setFaqLd = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: setFaqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  const crumbLd = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: "한국어 시세", item: `${SITE}/ko/` },
    { "@type": "ListItem", position: 3, name: `${code} ${nKo}`, item: canonical },
  ] });

  // 네이버 간단체크: 제목 40자 초과는 사이트 카드에서 잘린다(2026-09-16).
  // 세트명 길이가 제각각이라(EB-02·PRB 는 14자) 넘치면 브랜드를 떼서 맞춘다 — 자르는 것보다 낫다.
  // 최신 세트(영문 생성기와 같은 규칙 — set-page-shared.latestSets)는 발매일·카드 리스트를 제목·H1 에 넣는다(2026-10-14, W5a).
  const rel = LATEST_KO.has(code);
  const titleCands = rel
    ? [`${code} ${nKo} 박스 시세·발매일`, `${code} 박스 시세·발매일 | opboxindex`, `${code} 박스 시세·발매일`]
    : [`${code} ${nKo} 일판 박스 시세 | opboxindex`, `${code} ${nKo} 일판 박스 시세`];
  const title = titleCands.find((x) => x.length <= 40) || titleCands[titleCands.length - 1];
  // 설명문(meta·og) = 같은 페이지 Key facts 표의 값만 — 2026-10-15 소유자 결정("재판 기록·인기 카드 NM 시세, 매일 갱신" 같은 소개 문구 삭제).
  // 판매 중앙값은 Key facts sold 와 같은 current(28일 규칙)·같은 원화 반올림·같은 날짜·건수, 없으면 빼고(묵은 값을 현재처럼 쓰지 않는다 — 2026-10-14 QA OP-02),
  // 최저 매물은 Key facts ask 와 같은 달러 표기. 세트 코드·이름이 들어가 페이지마다 다르다. 사실만 남겨 80자 후보 고르기(소개 문구 줄이기용)는 없앴다.
  const kfSold = kf.sold && fx.usdKrw ? `판매 중앙값 ${Math.round(kf.sold.median * fx.usdKrw).toLocaleString("ko-KR")}원(${kf.sold.d}${kf.sold.n != null ? `, ${kf.sold.n}건` : ""})` : "";
  const desc = `일본판 ${code} ${nKo} 부스터박스 ` + [
    kfSold,
    kf.ask ? `최저 매물 ${usd(kf.ask.total)}` : "",
    kf.jpRelease ? `발매 ${kf.jpRelease}` : "",
    kf.packsPerBox ? `박스당 ${kf.packsPerBox}팩` : "",
  ].filter(Boolean).join(" · ");

  return { slug, html: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <!-- No AdSense on noindex Korean set detail pages. -->
    <!-- Korean set details remain noindex and ad-free through the AdSense review window.
         Reconsider indexing separately after the review; the Korean hub remains indexed. -->
    ${detailRobotsMeta()}
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="ko" href="${canonical}" />
    ${enHref ? `<link rel="alternate" hreflang="en" href="${SITE}/sets/${slug}.html" />\n    <link rel="alternate" hreflang="x-default" href="${SITE}/sets/${slug}.html" />` : ""}
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE}/og/og-set-list.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${setFaqLd}</script>
    <script type="application/ld+json">${crumbLd}</script>
    ${/* 수정일 = 영문·일본판 세트 페이지와 같은 값(사실 파일 pageDate) — 2026-10-15 감사(#4): DATA_DATE(10-14)라 같은 세트의 영문판(10-15)과 하루 어긋났다 */ ""}
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: title, url: canonical, inLanguage: "ko", dateModified: s.pageDate })}</script>
    <link rel="stylesheet" href="../styles.css?v=${CACHE}" />
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .ixHero { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin: 6px 0 2px; }
      .ixHero .big { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
      .ixChg { font-size: 14px; font-weight: 800; padding: 3px 11px; border-radius: 8px; }
      .up { color: var(--accent); } .down { color: var(--red); }
      .ixChg.up { background: rgba(var(--accent-rgb), .12); } .ixChg.down { background: rgba(255,125,125,.12); }
      .koBoard { width: 100%; max-width: 760px; border-collapse: collapse; font-size: 14px; margin: 10px 0; }
      .koBoard th { text-align: right; padding: 8px 10px; border-bottom: 1px solid #2a3140; color: #9aa4b6; font-size: 11.5px; }
      .koBoard th.l, .koBoard td.nm, .koBoard td.code { text-align: left; }
      .koBoard td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); font-variant-numeric: tabular-nums; }
      @media (max-width: 640px) { .koBoard th, .koBoard td { padding: 8px 6px; } }   /* 390px 에서 표가 2px 넘쳐 가로 스크롤됐다(2026-10-13 QA) */
      .koBoard td.num { text-align: right; white-space: nowrap; }
      .koBoard td.code { color: #9aa4b6; font-size: 12.5px; }
      .koBoard td small { display: block; font-size: 11.5px; color: var(--muted); font-weight: 400; }
      .koBoard td.thumb { width: 52px; padding: 6px 8px; }
      .koBoard td.thumb img { width: 40px; height: 56px; object-fit: cover; border-radius: 4px; display: block; background: #12161d; }
      .koFacts { margin: 14px 0; padding: 12px 16px; border: 1px solid rgba(var(--accent-rgb), .28); background: rgba(var(--accent-rgb), .05); border-radius: 12px; max-width: 760px; font-size: 14px; line-height: 1.8; }
      .koFacts strong { color: var(--accent); }
      .koFacts li.stale strong, .koBoard td.stale { opacity: .62; }   /* 낡은 값(NM 28일·PSA 10 35일) — 날짜는 두고 흐리게(2026-11-05) */
      .koNote { color: var(--muted); font-size: 12.5px; max-width: 760px; margin: 8px 0 14px; line-height: 1.6; }
      .faqItem { max-width: 760px; border-bottom: 1px solid rgba(255,255,255,.08); padding: 4px 0; }
      .faqItem summary { cursor: pointer; font-weight: 700; padding: 8px 0; font-size: 14.5px; }
      .faqItem p { color: #9aa4b6; font-size: 13.5px; line-height: 1.65; margin: 4px 0 10px; }
      .koCta { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
      .koCta a { display: inline-block; padding: 11px 18px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px; }
      .koCta .primary { background: var(--accent); color: #08131a; }
      .koCta .ghost { border: 1px solid #2a3140; color: #cfd6e4; }
${KF_CSS}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">본문으로 건너뛰기</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>부스터박스 리서치</small></span></a>
      ${NAV_KO}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow"><a href="./" style="color:var(--muted);text-decoration:none">한국어 시세</a> · 일본판</p>
      <h1>${esc(code)} ${esc(nKo)} 부스터박스 시세${rel ? " · 발매일" : ""} (일본판)</h1>
      ${keyFactsHtml(kf, { lang: "ko", usdKrw: fx.usdKrw })}
      <div class="ixHero">
        <span class="big">${won(krw)}</span>
        ${chg != null ? `<span class="ixChg ${up ? "up" : "down"}">${pct(chg)}</span>` : ""}
      </div>
      <ul class="koFacts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
${trendSection}
${gradingSection}
${cardsSection}
      ${koAuctionSection}
      <div class="koCta">
        <a class="primary" href="./">전 세트 시세표 →</a>
        ${enHref ? `<a class="ghost" href="${enHref}">영문 상세(차트·PSA) →</a>` : ""}
        ${CARD_LISTS[code] ? `<a class="ghost" href="${slug}-card-list.html">카드 리스트 ${CARD_LISTS[code].counts.cards}장 →</a>` : ""}
        <a class="ghost" href="amazon-lottery.html">아마존 응모 안내 →</a>
      </div>
      <section aria-label="자주 묻는 질문">
        <h2>${esc(code)} 자주 묻는 질문</h2>
        ${setFaqs.map((f) => `<details class="faqItem"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}
      </section>
      <p class="koNote">${esc(code)} ${esc(nKo)} 데이터 기준: 검증된 이베이 시장 관측, PSA 인구 리포트, 반다이 발매 정보 · 환율 ₩${fx.usdKrw}/$ (${esc(fx.date)}) · 갱신 ${esc(s.pageDate)}.</p>
    </main>
    <footer class="footer">
      <p>OP Box Index는 투자 권유가 아닌 데이터 기반 리서치 사이트입니다.</p>
      <nav aria-label="정책 안내"><a href="../about.html">About</a><a href="../methodology.html">Methodology</a><a href="../privacy.html">Privacy</a><a href="../disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
` };
}

const written = [];
for (const b of rows) {
  const { slug, html: page } = setPageKo(b);
  fs.writeFileSync(path.join(ROOT, "ko", `${slug}.html`), page, "utf8");
  written.push(`ko/${slug}.html`);
}

// 사이트맵: 한국어 세트 상세는 noindex(2026-07-24 임시) → 사이트맵에서 제거하고 허브(/ko/)만 유지.
//      noindex 페이지를 사이트맵에 두면 GSC 가 "제출됨+색인안됨" 모순으로 계속 표시한다.
{
  const smPath = path.join(ROOT, "sitemap.xml");
  // 심사 게이트 상태에 따라 상세 URL 을 빼거나 되돌린다(tools/sitemap-detail-urls.js).
  const { removed, added } = syncDetailUrls(smPath, written.map((rel) => SITE + "/" + rel));
  // 이미 등재된 URL 은 빼지도 더하지도 않고 lastmod 만 올린다(upsert). 종전엔 읽어서 그대로 다시 쓰기만 했다.
  const today = new Date().toISOString().slice(0, 10);
  const managed = new Set([`${SITE}/ko/`, ...written.map((rel) => SITE + "/" + rel)]);
  let sm = fs.readFileSync(smPath, "utf8");
  let touched = 0;
  sm = sm.replace(/[ \t]*<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!loc || !managed.has(loc)) return block;
    const eol = block.includes("\r\n") ? "\r\n" : "\n";
    const next = /<lastmod>[^<]*<\/lastmod>/.test(block)
      ? block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`)
      : block.replace(/(<loc>[^<]*<\/loc>)/, `$1${eol}    <lastmod>${today}</lastmod>`);
    if (next !== block) touched++;
    return next;
  });
  fs.writeFileSync(smPath, sm, "utf8");
  console.log(JSON.stringify({ wrote: "ko/index.html", setPages: written.length, sitemapRemoved: removed, sitemapAdded: added, sitemapLastmod: touched }));
}
