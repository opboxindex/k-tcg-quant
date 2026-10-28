// Generate static SEO landing pages per set: sets/<code>.html + sets/index.html
// - Static text contains only stable facts (set name, release, chase-card list).
// - Volatile prices are loaded client-side from /data/onepiece-packs.json (always fresh).
// - Idempotently inserts new URLs into sitemap.xml.
// 2026-10-15: 파생 사실(현재가·4주 변동·최저 실매물·가장 비싼 카드·지표·기준선·레어도·PSA 10 달러값·등급 현황·재판 분류·수정일·최신 세트)은
//   전부 data/derived/site-facts.json(tools/build-site-facts.js — 규칙은 market-data-normalizers.js 한 곳)에서 읽는다. 이 파일은 그 값을 그리기만 한다.
//   원장을 직접 읽는 것은 그래프 점(box-sold-series)·카드 페이지 슬러그(card-map)·이미지 맵·예정 세트 목록·SEO 제목 파일뿐이다.
// Run: node tools/generate-set-pages.js
const fs = require("fs");
const path = require("path");
// <head>·푸터·제휴 고지·사이트맵 갱신은 set-page-shared.js 한 곳에서 온다(영문판 생성기와 공유).
const { SITE, EPN, CSS_VER, esc, usd, intl, AFF_TOP, FOOT, pageHead, upsertSitemap, buyCta, BUY_CTA_CSS, keyFactsHtml, KF_CSS, KF_CSS_ANY, kfTableAny, withChartCss, dataDesc } = require("./set-page-shared");
// 화면 크기에 맞는 이미지 파생본(2026-10-08): 머리 박스 사진 670px→264px, 랭킹 썸네일 100KB→5KB. 없으면 원본.
const { variant } = require("./image-variants");

// 가장 비싼 카드와 같은 값의 카드들(동가)은 사실 파일 top10.priciest.ties 로 받는다. 2026-09-30: OP-16 망가 3장이 모두 ¥148,000 인데
// 소유자 순서상 1위인 한 장을 "가장 비싸다"고 써서 데이터보다 센 문장이 나갔다.
// 2026-10-15(3차): "가장 비싼 카드"는 소유자 순위 1위가 아니라 market-data-normalizers.priciest(raw 값 최댓값) 하나 — 비교표·한국어 페이지와 같은 값.
const joinNames = (cs) => { const n = cs.map((c) => esc(c.name)); return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`; };

const ROOT = path.join(__dirname, "..");
// 사실 한 벌 — 세트별 값은 F.sets[code], 사이트 값은 F.board·F.baselines·F.latestSets·F.dataDate.
const F = require("./build-site-facts").load();

// 세트 허브의 "Upcoming sets" 목록 — data/upcoming-set-pages.json 에서 만든다.
// 2026-09-29: 종전엔 EB-05 한 줄이 하드코딩돼 있어 OP-18 페이지로 들어오는 내부 링크가 사이트 전체 1개였다.
// 그 줄의 "EB-03's +50% climb predicts" 문구는 EB-05 페이지 본문("선례 하나로 예측 못 한다")과 모순이라 뺐다.
// 발매일은 facts 의 공식 행(일본판 우선, 없으면 영문판)에서 " · " 앞부분만 쓴다 — 값을 만들어내지 않는다.
const UPCOMING_PAGES = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "upcoming-set-pages.json"), "utf8")).pages || []; } catch { return []; }
})();
function upcomingItems() {
  return UPCOMING_PAGES
    .map((p) => {
      const name = String(p.title || "").slice(String(p.code).length + 1).split(/\s+(?:\(|—)/)[0].trim();
      const row = (p.facts || []).find((f) => f[0] === "Japanese release") || (p.facts || []).find((f) => f[0] === "English release");
      const when = row ? String(row[1]).split(" · ")[0].trim() : "";
      if (!p.slug || !p.code) return "";
      return `<li><a href="${esc(p.slug)}.html"><strong>${esc(p.code)}${name ? " " + esc(name) : ""}</strong></a>${when ? " — " + esc(when) : ""}</li>`;
    })
    .filter(Boolean)
    .join("\n        ");
}
// 박스 실거래 시세 그래프 — 그림은 box-chart.js 한 곳에서만 그린다(홈 화면과 같은 파일).
const BoxChart = require(path.join(ROOT, "box-chart.js"));
let SOLD_SERIES = { sets: {} };
try { SOLD_SERIES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "box-sold-series.json"), "utf8")); } catch (e) {}
// 서버에서 SVG 를 다 그려 보낸다 — JS 가 없어도 그래프와 숫자가 그대로 읽힌다.
// 페이지의 box-chart.js 는 마우스로 훑을 때 값을 띄우는 향상 기능만 얹는다.
function boxChartBlock(code) {
  const series = SOLD_SERIES.sets && SOLD_SERIES.sets[code];
  if (!BoxChart.hasChart(series)) return "";
  return BoxChart.chartHTML(series, { lang: "en", title: `${code} sealed booster box — median completed eBay sale` });
}

// 카드 목록이 없어도 **박스 실거래 시세가 있으면** 페이지를 만든다 — 2026-08-26(사실 파일 order.setPages).
// 갓 나온 세트는 top10 카드를 확정하기 전이지만 박스는 이미 팔리고 있다.
// OP-17 은 발매 4일 만에 일본판 25건·영문판 213건이 원장에 쌓였는데, 종전 조건(cards>0)이면
// 카드 목록을 만들 때까지 시세를 아예 못 보여줬다.
const ORDER = F.order.setPages;
const slug = (code) => code.toLowerCase();
// 예정 세트 페이지로 가는 '다음' 링크 — 2026-09-30. OP-17 의 다음 링크가 EB-01 뿐이라 OP-18 페이지로 가는 길이 없었다.
// ORDER 에 예정 세트를 넣으면 아래 쓰기 루프가 sets/op-18.html 을 가격 템플릿으로 덮으므로 ORDER 는 두고,
// 같은 시리즈(OP·EB·PRB)에서 ORDER 의 마지막 세트 페이지에 링크 하나를 더 붙인다(OP-17 → OP-18, EB-03 → EB-05).
const UPCOMING_NEXT = (() => {
  const out = {};
  const pages = UPCOMING_PAGES.filter((p) => p.code && p.slug && !ORDER.includes(p.code))
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  for (const p of pages) {
    const series = p.code.split("-")[0];
    const last = [...ORDER].reverse().find((c) => c.split("-")[0] === series);
    if (last && !out[last]) out[last] = p;
  }
  return out;
})();

// 세트별 공식 카드리스트(sets/<code>-card-list.html — generate-card-list-pages.js) — 2026-10-14(W7).
// 링크는 공식 목록 데이터(사실 파일 cardLists ← data/official-cardlist.json)로 정한다. 생성 순서와 무관하게 같은 회차에 걸린다.
const CARD_LISTS = Object.fromEntries(F.cardLists.map((p) => [p.code, p]));
const cardListLink = (code, cls = "") => {
  const p = CARD_LISTS[code];
  return p ? `<a${cls ? ` class="${cls}"` : ""} href="${slug(code)}-card-list.html" data-ko="${code} 카드 리스트 (${p.counts.cards}장)">${code} card list — ${p.counts.cards} cards</a>` : "";
};
// 개별 카드 페이지 슬러그 맵(있을 때만 링크) — tools/generate-card-pages.js 산출물
let CARD_MAP = {};
try { CARD_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "cards", "card-map.json"), "utf8")); } catch (e) {}
// 검증된 세트 팩트(정가·재판·발매일)는 사실 파일 sets[code](jpRelease·reprint)로 읽는다 — 원천 data/set-facts.json 은 빌더만 읽는다.
// 세트별 수기 해설(data/set-commentary.json)은 더 읽지 않는다 — 2026-10-15 소유자 결정: 데이터 페이지엔 숫자·표·라벨만.
// 해설 본문(접힌 "Set notes")·해설에서 온 설명문·"What makes … stand out" 문답·허브 꼬리표가 모두 빠졌다.
// 파일은 다른 도구(audit-adsense-readiness 의 세트 목록 · collect-status 라벨 · 가드 S3)가 아직 읽어 남겨 둔다.
// 재판 랜딩 제목 — data/priority-set-seo.json 은 title 만 남았다(제목과 H1 의 ", reprints" 가 이 파일의 세트 목록을 따른다).
// 같은 파일의 해설 칸(description·heading·marketContext·reprintContext·sealContext)은 2026-10-15 에 지웠다.
let PRIORITY_SET_SEO = { sets: {} };
try { PRIORITY_SET_SEO = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "priority-set-seo.json"), "utf8")); } catch (e) {}

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


// ---- 실데이터 구워넣기 (가격은 항상 "as of 날짜"로 정직하게, 매일 재생성으로 최신 유지)
const FX = F.fx;
const DATA_DATE = F.dataDate;
// 카드별 표시가 = 사실 파일 cards[i].shown — NM(생: 쓸 수 있는 NM, 아니면 NM 조사 전·숨김 표시 없는 카드의 TCG 값, 세트 안 TCG 스파이크는 "—")
//   + PSA10(sold 우선 — 표본 3건·관측일 환율로 되돌린 달러, 35일 넘으면 stale — 없으면 ask). 불확실하면 null → 표에 "—".
//   레어도(rarityEn)는 반다이 공식 카드 리스트의 그 인쇄 레어도(card-list-shared.rarityCode — 한국어 세트·카드 상세·AI 피드와 같은 코드).
const cardPrices = (c) => c.shown;
// 날짜는 일 단위(ISO)로만 쓴다 — 2026-10-14(W5a). 종전 "Jul 2026" 꼴(monShort·monthYear)은 관측일을 한 달 단위로 뭉갰다(가드 KF1).

// 최신 세트(계열별 가장 늦게 나온 추적 세트, 발매 120일 이내, 공식 카드 리스트 있음) — 제목·H1 에 Release Date·Card List 를 넣는다.
// 규칙은 사실 빌더(build-site-facts.latestSets)에 있고 영문판·한국어 생성기와 같은 목록이다.
const LATEST = new Set(F.latestSets);

// 이 페이지들에만 쓰는 스타일. 공용 껍데기(pageHead)의 <style> 자리에 끼워 넣는다.
const SET_PAGE_CSS = `      /* 제목 블록이 폭을 100% 잡고 있어 박스 이미지가 늘 아래 줄로 밀렸다(2026-08-27).
         min-width:0 + flex:1 로 같은 줄에 세우면 hero 가 한 화면의 1/4을 덜 먹는다. */
      .setHero { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
      .setHero > div { flex: 1 1 320px; min-width: 0; }
      .setHero img { width: 132px; flex: 0 0 auto; border-radius: 10px; border: 1px solid var(--line); }
      /* 모바일 첫 화면: 박스 그림 184px 가 제목·헤더와 함께 첫 숫자를 폴드 밖(y≈858px)으로 밀었다(2026-09-09 실측). 작게 줄인다. */
      @media (max-width: 560px) { .setHero img { width: 72px; height: auto; } }
      .liveBox { margin: 18px 0; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: rgba(var(--accent-rgb), .05); }
      .liveBox b { font-size: 20px; color: var(--accent); }
      .liveBox small { color: var(--muted); display: block; margin-top: 4px; }
      .chaseList li { margin: 6px 0; }
      .hubTable { width: 100%; border-collapse: collapse; font-size: 14px; margin: 12px 0; }
      .hubTable th { text-align: right; padding: 8px 10px; border-bottom: 1px solid #2a3140; color: var(--muted); font-size: 12.5px; font-weight: 600; }
      .hubTable th:nth-child(1), .hubTable th:nth-child(2), .hubTable th:nth-child(6) { text-align: left; }
      .hubTable td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); font-variant-numeric: tabular-nums; vertical-align: top; }
      .hubTable td.num { text-align: right; white-space: nowrap; }
      .hubTable td.up { color: var(--green); } .hubTable td.down { color: var(--red); } .hubTable td.flat, .hubTable td.when { color: #9aa4b6; }
      .hubTable td.when small { font-size: 11.5px; color: var(--muted); }
      .hubTable tr.stale td { opacity: .62; } .hubTable tr.stale td.when { opacity: 1; color: #f5c842; }
      .hubTable td.links { font-size: 12.5px; white-space: nowrap; }
      @media (max-width: 640px) { .hubTable td.links { white-space: normal; } }
      .ctaRow { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0; }
      .ctaRow a { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line); font-weight: 800; }
      .ctaRow a.primary { background: rgba(var(--accent-rgb), .14); border-color: rgba(var(--accent-rgb), .5); color: var(--accent); }
${BUY_CTA_CSS}
${KF_CSS}
      .setNavLinks { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 22px; color: var(--muted); font-size: 14px; }
      .affNote { margin-top: 16px; color: var(--muted); font-size: 11.5px; opacity: .8; }
      /* EPN 제휴 고지 — 접힘선 위. 푸터 고지(11px)만으로는 눈에 안 띈다는 지적을 받았다(2026-08-10).
         작게 줄이거나 opacity 를 낮추지 말 것. */
      .affTop { display: block; margin: 12px 0 0; padding: 0 0 0 10px; border-left: 2px solid var(--line); color: var(--muted); font-size: 14px; line-height: 1.55; max-width: 760px; }
      .affTop b { color: inherit; font-weight: 600; }
      .pageUpdated { margin: 6px 0 0; color: var(--muted); font-size: 12.5px; }
      /* 세트 지표 격자 — 2026-08-20. 숫자 하나만 주면 그게 높은지 낮은지 알 수 없다.
         모든 값 아래에 21세트 중앙값을 기준선으로 붙이고, 그 대비 방향을 화살표로 준다. */
      .statGloss { margin: 8px 0 0; max-width: 760px; font-size: 12.5px; color: var(--muted, #9aa4b6); }
      .statGloss > summary { cursor: pointer; color: var(--muted, #9aa4b6); }
      .statGloss dl { margin: 8px 0 0; display: grid; gap: 6px 14px; grid-template-columns: max-content 1fr; }
      .statGloss dt { font-weight: 700; color: var(--fg, #e8edf6); }
      .statGloss dd { margin: 0; line-height: 1.5; }
      .keyFactsBox > summary { cursor: pointer; color: var(--muted, #9aa4b6); font-size: 13px; }
      @media (max-width: 640px) { .statGloss dl { grid-template-columns: 1fr; } .statGloss dd { margin-bottom: 4px; } }
      .gradeTrio { font-size: 12px; white-space: nowrap; }
      .statGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 10px; margin: 16px 0 6px; max-width: 760px; }
      .statCard { padding: 12px 14px; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; background: rgba(255,255,255,.02); }
      .statLabel { font-size: 12.5px; color: var(--muted, #9aa4b6); font-weight: 600; }
      .statLabel a.statDef { color: inherit; text-decoration: none; border-bottom: 1px dotted rgba(154,164,182,.6); }
      .statLabel a.statDef:hover { color: var(--accent); border-bottom-color: currentColor; }
      /* 숫자가 주인공이다 — 28px/700. 라벨은 10.5px 대문자로 물러난다(TCG 퀀트 실측 규칙).
         tabular-nums 로 자릿수를 고정해야 카드끼리 세로로 줄이 맞는다. */
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
      .chaseTable td:first-child { color: var(--muted); font-variant-numeric: tabular-nums; }
      .chaseTable .cNum { display: block; color: var(--muted); font-size: 11.5px; margin-top: 1px; }
      .chaseTable .psaKind { color: var(--muted); font-size: 11.5px; }
      .chaseTable td.psaStale { opacity: .62; }   /* 35일 넘은 PSA10 sold — 값은 두되 흐리게(2026-09-24) */
      .chaseTable td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      /* 카드명은 왼쪽 — styles.css 기사 표 기본(.bodyPage table 2열부터 오른쪽)보다 구체적으로 이긴다 */
      .bodyPage table.chaseTable :is(th, td).cn:not(:first-child) { text-align: left; }
      .chaseTable .gSub { display: none; }
      /* 모바일: 등급 열을 카드명 아래 줄로 접고, PSA 10 의 sold/ask 꼬리표는 값 아래로 내려 열을 좁힌다(가로 스크롤 0).
         styles.css 가 ≤720px 기사 표를 블록+가로 스크롤+오른쪽 흐림으로 바꾸는데, 이 표는 접어서 폭 안에 들어오므로 표로 되돌린다. */
      @media (max-width: 720px) {
        .bodyPage table.chaseTable { display: table; width: 100%; min-width: 0; overflow: visible; -webkit-mask-image: none; mask-image: none; }
      }
      @media (max-width: 640px) {
        .chaseTable { font-size: 13.5px; }
        .chaseTable th, .chaseTable td { padding: 8px 6px; }
        .chaseTable .gCol { display: none; }
        .chaseTable .gSub { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; }
        .chaseTable .gSub .gradeTrio { white-space: normal; }
        .chaseTable td.num .psaKind { display: block; }
        .chaseTable.aucTable td:first-child { white-space: normal; }
      }
      .priceNote { color: var(--muted); font-size: 12px; margin: 2px 0 0; }
      .gearRec { margin: 12px 0 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: rgba(var(--accent-rgb), .05); font-size: 14px; line-height: 1.55; color: var(--muted); }
      .gearRec strong { color: #eef2ff; }
      .gearRec a { color: var(--accent); font-weight: 800; white-space: nowrap; }`;
// chart:false — 박스 차트 CSS 는 머리가 아니라 차트 바로 앞(withChartCss)에 둔다. 허브는 차트가 없다(2026-10-14, W5a).
const head = (opts) => pageHead({ ...opts, extraCss: SET_PAGE_CSS, chart: false });


// 일본판 호가 위젯에 실리는 값 — 화면(liveWidget)과 Product 구조화데이터(productLd)가 이 함수 하나로 같은 규칙을 쓴다(2026-10-15, 감사 #6).
// 종전엔 위젯은 표본 3건 미만이면 숨는데 productLd 는 표본 수를 안 봐서, OP-07(매물 2건)의 highPrice 157 이 화면 어디에도 없었다
// (영문판은 2026-09-29 감사 SD4 로 같은 결함을 고쳤다). range = 화면에 "Range $lo – $hi" 줄이 실제로 그려지는가.
// 표본 3건 미만은 시장값이 아니라 싣지 않는다(2026-08-26 감사) — 사실 파일 liveAsk.jp(mid·lo·hi·n·updated·range).
const liveAsk = (s) => s.liveAsk.jp;

// 라이브 가격 위젯: 데이터 fetch 실패/부재 시 위젯 자체를 숨김(불확실하면 숨김 원칙)
function liveWidget(code) {
  // 종전엔 브라우저가 data/onepiece-packs.json(원본 830KB, gzip 150KB)을 통째로 받아 숫자 하나를 채웠다(2026-09-10 성능 감사).
  // 페이지는 매일 재생성되므로 생성 시점 값을 박아도 신선도는 같다.
  const s = F.sets[code];
  const live = liveAsk(s);
  if (!live) return "";
  const { mid, lo, hi } = live;
  const meta = [];
  if (live.range) meta.push(`Range ${usd(lo)} – ${usd(hi)}`);
  meta.push(`${live.n} listings`, `Updated ${esc(live.updated || DATA_DATE)}`);
  const psaJp = s.grading.psa.jp;
  if (psaJp && psaJp.gemRate != null) meta.push(`Full-set PSA10 rate ${psaJp.gemRate}%`);
  return `
      <div class="liveBox" id="livePrice">
        <span id="lpLabel">Current eBay listing price (mid)</span><br />
        <b id="lpMid">${usd(mid)}</b>
        <small id="lpMeta">${meta.join(" · ")}</small>
      </div>`;
}

// FAQ Q&A — JSON-LD 와 화면 렌더가 반드시 같은 텍스트를 써야 한다.
// 구글은 본문에 없는 FAQPage 구조화데이터를 스팸으로 취급하고(리치결과는 2023년 폐지),
// 숨긴 FAQ 는 이득 0·리스크만 있다. 그래서 한 소스에서 뽑아 양쪽에 쓴다 — 2026-07-21 감사.
function faqItems(code, nameEn) {
  // 문답은 원장 숫자로 답하는 것만 — 2026-10-15 소유자 결정으로 수기 해설 문답("What makes … stand out …?", set-commentary desc)을 뺐다.
  // 답에 세트 이름을 넣는 이유: 애드센스 감사(A4)는 숫자·세트코드를 지우고 22장에
  // 같은 문장이 반복되는 비율을 재는데, 이름 없는 데이터 문장은 전부 "같은 문장"으로 잡힌다(2026-09-10 실측 31%).
  // 값·날짜·표본은 페이지 재생성 때마다 갱신된다.
  // 현재가 = box-sold-series 의 current(마지막 중앙값 점이 asOf 로부터 28일 이내)만 — Key facts 표·지표 격자·허브 표와 같은 원천(2026-10-15, 감사 #0).
  // 종전엔 boxMarket.ebaySold 를 날짜 검사 없이 써서, Key facts 가 "— no median dated within 28 days" 인 OP-02·OP-04·EB-01 의
  // FAQ(화면·FAQPage JSON-LD)가 "As of 2026-07-07 … about $147" 과 그 값으로 낸 "3.8x" 를 현재가처럼 말했다.
  const fs0 = F.sets[code];
  const jp = fs0.current.jp, en = fs0.current.en;
  // 통화 기호를 붙인다 — 2026-09-30: Math.round 만 써서 22장 전부 "median at about 95" 처럼 $ 없이 나갔다(FAQPage JSON-LD 도 같은 문장).
  const jpU = jp ? jp.median : null;
  const enU = en ? en.median : null;
  const enTag = fs0.reprint.enIsReprint ? " reprint (White)" : "";   // 영문판 값이 재판만일 때(OP-01) — 그래프 배지와 같은 기준
  const enBit = enU != null ? ` The English ${nameEn}${enTag} box runs about ${usd(enU)} (as of ${en.d}).` : "";
  const items = [];
  if (jpU != null) {
    items.push({
      q: `How much is a sealed ${code} ${nameEn} Japanese booster box?`,
      a: `As of ${jp.d}, completed eBay sales of the Japanese ${nameEn} box put the median at about ${usd(jpU)} (${jp.n} sales in the trailing ${jp.windowDays || 28} days).${enBit}`,
    });
  }
  // 일본판에 28일 안 중앙값이 없으면 이 문답을 싣지 않는다 — 2026-10-15(5차): 4차는 영문판 값으로 답해 "일본판 박스 얼마?"에
  // "영문판은 $559"가 나갔다(OP-02·OP-04·EB-01). 묻는 것과 다른 상품의 값으로 답하지 않는다.
  // 배수는 두 판 모두 current 일 때만 — Key facts 문단·영문판 페이지(multiple)와 같은 조건.
  if (jpU != null && enU != null && jpU > 0) {
    items.push({
      q: `How does the English ${code} ${nameEn} box compare with the Japanese box?`,
      a: `English ${nameEn}${enTag} ${usd(enU)} (as of ${en.d}) versus Japanese ${nameEn} ${usd(jpU)} (as of ${jp.d}): the English box trades at about ${(enU / jpU).toFixed(1)}x the Japanese box.`,
    });
  }
  // 일본판 판매 중앙값 문답이 없을 때(28일 안 중앙값 없음 — EB-01·OP-02·OP-04)는 최저 실매물 문답 하나 — 2026-10-15.
  // 해설 문답을 뺀 뒤 이 세 장은 문답이 0개라 FAQPage 가 사라졌다(가드 L3·audit-seo 는 세트 페이지에 FAQPage 를 요구한다).
  // 값은 Key facts 표 "Lowest live ask" 와 같은 값(사실 파일 ask.jp)·같은 표기 — 판매가 아닌 매물가라는 걸 질문이 말한다(가드 FQ1 의 "How much is a sealed" 꼴이 아니다).
  const ask = jpU == null ? fs0.ask.jp : null;
  if (ask) {
    items.push({
      q: `What is the lowest live ask for a sealed ${code} ${nameEn} Japanese booster box?`,
      a: `${ask.updated ? `As of ${ask.updated}, the` : "The"} lowest verified eBay listing for the Japanese ${nameEn} box is ${usd(ask.total)} including shipping${ask.listings != null ? ` (${ask.listings} listings)` : ""}.`,
    });
  }
  return items;
}

// 화면에 보이는 FAQ 섹션 — faqLd 와 동일 Q&A. 구조화데이터와 본문 일치를 보장.
function faqHtml(code, nameEn) {
  const items = faqItems(code, nameEn);
  if (!items.length) return "";   // 문답이 없으면 섹션도 없다(헤더만 남기지 않는다)
  return `
      <section class="setFaq" aria-label="${esc(`${code} ${nameEn} frequently asked questions`)}">
        <h2>${code} ${esc(nameEn)} — frequently asked questions</h2>
        ${items.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("\n        ")}
      </section>`;
}

// pageName = 이 페이지 <title> — WebPage.name 이 비어 있었다(2026-10-14 W6b, 구조화데이터 감사 44장).
// pageDate = set-page-shared.setPageDate(code) — 화면 "Data updated" 와 같은 날(2026-10-15, 감사 #4).
function faqLd(code, nameEn, pageName, pageDate) {
  const q = faqItems(code, nameEn);
  // FAQ 가 없으면 FAQPage 구조화데이터도 내지 않는다 — 빈 mainEntity 는 스팸 신호다.
  return `${q.length ? `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: q.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  })}</script>` : ""}
    <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Set Guides", item: `${SITE}/sets/index.html` },
      { "@type": "ListItem", position: 3, name: `${code} Guide`, item: `${SITE}/sets/${slug(code)}.html` },
    ],
  })}</script>
    <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    ...(pageName ? { name: pageName } : {}),
    url: `${SITE}/sets/${slug(code)}.html`,
    dateModified: pageDate,
  })}</script>`;
}

// 박스 Product 스키마 (리치결과용). 유효한 가격 있을 때만 방출 — 불완전 Product로 서치콘솔 경고 안 나게.
function productLd(code, nameEn, s) {
  const img = s.box ? (String(s.box).startsWith("http") ? s.box : SITE + s.box) : `${SITE}/og-image.png`;
  // 이 Product 는 일본판 박스다 — 발매일도 일본판(set-facts.json, 반다이 공식 출처). 없으면 싣지 않는다.
  // 2026-09-30: 종전엔 s.release(영문판 날짜)가 들어가 op-16 이 2026-06-12(일본판 05-30)로 나갔다.
  const jpRelease = s.jpRelease;
  // lowPrice = 화면 Key facts 의 "Lowest live ask"(검증된 최저 실매물 총액, 구매 버튼과 같은 값) — 2026-10-14(W5a).
  // 종전엔 호가 분포의 하위 15% 값이라 화면의 최저 매물가와 달랐다(OP-01 $292 vs 최저 매물 $200). 실매물이 없을 때만 그 값.
  const ask = s.ask.jp;
  // 구조화데이터의 가격은 전부 화면에 있는 값이어야 한다(2026-10-15, 감사 #6):
  //   Range 줄이 보이면 → AggregateOffer(lowPrice = 최저 실매물 또는 Range 하단, highPrice = Range 상단, offerCount = 위젯의 매물 수)
  //   Range 가 없으면 → 값 하나(lowPrice = highPrice): 최저 실매물(Key facts "Lowest live ask"·구매 버튼) → 없으면 위젯 중간값 → 둘 다 없으면 Product 를 내지 않는다.
  //   값이 하나여도 Offer 가 아니라 AggregateOffer 다(2026-10-28) — 개별 Offer 는 '이 사이트가 판다'는 판매자 등록정보로 읽혀
  //   서치콘솔이 배송·반품 정책 누락을 경고했다. 우리는 판매자가 아니다(남의 매물 값을 모아 보여 준다).
  const live = liveAsk(s);
  const url = `${SITE}/sets/${slug(code)}.html`;
  const lowV = live && live.range ? (ask ? ask.total : live.lo) : null;
  const one = ask ? ask.total : live ? live.mid : null;
  const offers =
    lowV != null && (ask || live.hi >= lowV)
      ? { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: Math.round(lowV), highPrice: Math.round(Math.max(live.hi, lowV)), offerCount: live.n, availability: "https://schema.org/InStock", url }
      : one != null ? { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: Math.round(one), highPrice: Math.round(one), availability: "https://schema.org/InStock", url } : null;
  if (!offers) return "";   // 화면에 박스 가격이 하나도 없으면 Product 도 없다(불완전 Product 는 서치콘솔 경고)
  const prod = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `One Piece Card Game ${code} ${nameEn} Booster Box (Japanese)`,
    image: [img],
    description: `Japanese sealed ${code} ${nameEn} One Piece Card Game booster box — live market price from eBay listings and sold history, top chase cards and PSA 10 population data.`,
    brand: { "@type": "Brand", name: "Bandai" },
    category: "Trading Card Games",
    ...(jpRelease ? { releaseDate: jpRelease } : {}),
    offers,
  };
  return `<script type="application/ld+json">${JSON.stringify(prod)}</script>`;
}

// ── top10 카드의 등급사별 감정 현황 — 2026-08-20.
// TCG 퀀트에는 없는 우리 데이터다. 그쪽은 카드 시세만 주지, "그 카드가 어디에 몇 장 맡겨졌고
// 10 이 몇 %인가"는 없다. 우리는 PSA·CGC·TAG 를 각각 카드 단위로 쌓고 있으므로 그걸 보여준다.
//
// 10 의 정의가 회사마다 달라(CGC 는 Pristine 10 과 Gem Mint 10 이 따로, TAG 는 10 과 10P)
// 회사별로 따로 적고 합계를 만들지 않는다. 합치면 서로 다른 기준을 한 숫자로 뭉개는 셈이다.
// 변형 판별(tier)·등급사별 집계는 사실 빌더(build-site-facts.gradeTrio — 등급 원장 적재기와 같은 ourTier)에서 한다. 키에 변형(tier)을 포함한다
// (2026-09-10 감사: OP13-118 레드망가 행이 슈퍼 변형의 2,443/82% 를 달고 나갔다). 값은 cards[i].grades {psa|cgc|tag: {n, gem}}.

// ── 세트 지표와 그 기준선 — 2026-08-20(값은 사실 파일 metrics.jp · baselines.jp).
// 값 하나만 보여주면 읽는 쪽이 그게 높은지 낮은지 알 수 없다. 전 세트를 한 번 훑어 중앙값을 구해 두고
// 각 페이지에서 "21-set median 대비 ±%"를 같이 낸다.
//
// 중앙값을 쓰는 이유: OP-01(PSA 57,143 · 박스 $305)이 평균을 통째로 끌어올린다. 평균 대비로 보면
// 대부분의 세트가 "평균 이하"로 나와 정보가 안 된다.
//
// 재고일수 = 지금 걸린 매물 ÷ 하루 판매 속도. 시리즈의 n 은 평균 창(windowDays, 28~56일) 안의 판매 건수라
// 창 길이로 나눠야 하루 속도가 된다(종전 ÷7 은 n 을 주간 건수로 잘못 봐 재고일수를 4배 이상 작게 냈다 — 2026-09-08 수정).
// 큰 숫자 "Box price (JP)" 는 current.jp(마지막 중앙값 점이 asOf 로부터 28일 이내)일 때만 — 표·Key facts 와 같은 규칙(2026-10-14 QA).
// 4주 변동률 = market-data-normalizers.boxChange28 — 홈·한국어 board·비교표와 같은 값(2026-10-15, 4차).
const SET_BASELINE = F.baselines.jp;   // { price|chg|days|psa|gem: { v, n } }
// 기준선 라벨은 실제 모수로 만든다 — 2026-08-26 감사.
// "21-set median" 하드코딩은 세트가 늘거나(OP-17) 지표별 모수가 다르면 곧장 틀린 숫자가 된다.
// 표본 수를 명시한 라벨이 틀리면 신뢰 신호가 역효과다.
const baseLabel = (key) => (SET_BASELINE[key] && SET_BASELINE[key].n ? `${SET_BASELINE[key].n}-set median` : "median");

function setPage(code, prev, next) {
  const s = F.sets[code];
  // psaFull 이 세트 단위 PSA 수치의 유일한 출처다 — 2026-08-19(사실 파일 grading.psa.jp).
  // 종전에는 psaGem/psaTotal 로 폴백했는데 그 둘은 2026-07-15 수동 기입 후 갱신하는 코드가 없었다.
  // 폴백이 있으면 psaFull 이 빈 세트에서 한 달 묵은 값이 아무 표시 없이 화면에 나간다.
  // 값이 없으면 비워 두는 편이 낫다 — 빈칸은 눈에 띄지만 낡은 숫자는 안 띈다.
  const psaJp = s.grading.psa.jp;
  const fullPsaRate = psaJp ? psaJp.gemRate : undefined;
  const fullPsaTotal = psaJp ? psaJp.total : undefined;
  const nameEn = s.nameEn || code;
  // 이 페이지의 수정일 — JSON-LD dateModified·화면 "Data updated" 가 같은 날을 쓴다(사실 파일 pageDate, 2026-10-15 감사 #4).
  const pageDate = s.pageDate;
  const cards = s.cards.slice(0, 10);   // 표시가(shown)·레어도·등급 현황은 사실 파일에서 이미 셌다(TCG 스파이크 억제 포함)
  const canonical = `${SITE}/sets/${slug(code)}.html`;
  // 영문판 박스 페이지(generate-english-set-pages.js 산출물)가 있을 때만 링크한다 — 파일 존재가 유일한 기준.
  const englishHref = fs.existsSync(path.join(ROOT, "sets", `${slug(code)}-english.html`)) ? `${slug(code)}-english.html` : "";
  const prioritySeo = PRIORITY_SET_SEO.sets?.[code];
  // 제목 = "<코드> <세트명> Japanese Booster Box Price"(2026-09-17). 종전 "... Box Price & Most Expensive Cards (Japanese) | OP Box Index"
  // 는 22장 전부 60자를 넘어 검색결과에서 잘리거나 다시 쓰였다("most expensive cards" 검색은 본문 Top 10 섹션이 받는다).
  // 브랜드 꼬리는 들어맞을 때만 붙이고, 그래도 넘치면 "Booster" 를 뺀다. priority-set-seo.json 의 title(재판 랜딩)은 그 파일에서 60자 안으로 관리한다.
  // 최신 세트(LATEST)는 "Release Date & Card List" 를 앞세운다 — 2026-10-14(W5a). 'op 17 set list' 상위 10개가 전부 카드리스트
  // 페이지였고 우리 OP-17 제목엔 둘 다 없었다. priority-set-seo.json 에 제목이 있으면(OP-17) 그 파일이 정한다.
  // 2026-10-14 QA: "Card List" 는 빼고 카드리스트 페이지(<code>-card-list.html)로 링크를 모은다 — 두 URL 이 'op 17 card list' 를 두고 경쟁했다.
  const latestCands = LATEST.has(code) ? [`One Piece ${code} Box Price & Release Date | OP Box Index`, `One Piece ${code} Box Price & Release Date`, `${code} Box Price & Release Date`] : [];
  const title = uniqueTitle(prioritySeo?.title
    ? fit([`${prioritySeo.title} | OP Box Index`, prioritySeo.title], TITLE_MAX, code)
    // 2026-09-29: 'One Piece' 를 맨 앞 후보로(GSC 실검색어 5개 중 4개가 'one piece' 를 포함).
    // 다음 후보는 'Booster' 를 빼고 'One Piece' 를 지킨다 — 빙 최고 성과 검색어가 'one piece box prices'(2.1위, CTR 44%)이고
    // 'booster box' 는 H1 에 그대로 남는다. 그래도 60자를 넘으면 종전 제목.
    : fit([...latestCands, `One Piece ${code} ${nameEn} Japanese Booster Box Price`, `One Piece ${code} ${nameEn} Japanese Box Price`, `${code} ${nameEn} Japanese Booster Box Price | OP Box Index`, `${code} ${nameEn} Japanese Booster Box Price`, `${code} ${nameEn} Japanese Box Price`], TITLE_MAX, code));
  // 제목이 발매일·카드리스트를 말하면 H1 도 같은 말을 한다(최신 세트에서 한 번에 바뀐다).
  const relHeading = /release date/i.test(title);
  // 설명 = Key facts 표의 값만(set-page-shared.dataDesc, 영문판과 같은 함수) — 2026-10-15 소유자 결정.
  // 종전엔 priority-set-seo description → 해설 desc → "…and a buy-or-skip verdict." 순이라 22장 중 21장이 사람이 쓴 소개 문장이었다.
  // 뒤 조각 = 지표 칸의 PSA 10 비율(세트 전체) — 들어갈 때만.
  const desc = fit([dataDesc(s.keyFacts.jp, nameEn, [fullPsaRate != null && fullPsaTotal ? `PSA 10 rate ${fullPsaRate}%` : ""], DESC_MAX)], DESC_MAX, code);
  const ebaySearch = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`One Piece Card Game ${code} ${nameEn} Booster Box Japanese sealed`)}&LH_BIN=1&_sop=15&${EPN}`;
  // 최저 실매물 버튼 — 검색 링크는 값이 없어 잘 안 눌린다(2026-09-16 실측). 검증된 최저 매물이 있을 때만 낸다.
  // 값은 Key facts 표의 "Lowest live ask" 와 같은 값(사실 파일 ask.jp — build-site-facts.lowestAsk)에서 — 표와 버튼이 늘 같은 숫자다.
  const jpAsk = s.ask.jp;
  const jpBuy = jpAsk ? buyCta({ url: jpAsk.url, price: jpAsk.total, mid: jpAsk.mid, updated: jpAsk.updated, label: `sealed ${code} Japanese box` }) : "";
  // 일본판 발매일(set-facts.json, 반다이 공식 출처) — 접힌 Key facts 문단·Product 구조화데이터가 쓴다.
  // 화면의 발매일·정가·팩 수·카드 종류는 H1 아래 Key facts 표(keyFactsHtml) 한 곳에 있다(2026-10-14, W5a).
  const jpRelDate = s.jpRelease;

  const enc = encodeURIComponent(code);

  // 실데이터 표(구워넣기): 순위·카드·NM(생)·PSA10(sold 우선). 값 없으면 "—"
  // 개별 카드 페이지가 있으면 이름에 링크 (cards/card-map.json — generate-card-pages.js 산출물)
  // 등급사별 감정 수와 10 비율(사실 파일 cards[i].grades). 회사마다 10 의 정의가 달라 합치지 않고 나란히 적는다.
  const gradeCell = (c) => {
    const g = c.grades;
    if (!g) return "—";
    const bit = (o) => (o ? `${intl(o.n)}${o.gem != null ? ` <span class="psaKind">${o.gem}%</span>` : ""}` : "—");
    return `<span class="gradeTrio">${bit(g.psa)} / ${bit(g.cgc)} / ${bit(g.tag)}</span>`;
  };

  const rows = cards.map((c, i) => {
    const p = cardPrices(c);
    const cardHref = CARD_MAP[(c.number || "") + "|" + String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")];
    const nameCell = cardHref ? `<a href="../cards/${cardHref}"><strong>${esc(c.name)}</strong></a>` : `<strong>${esc(c.name)}</strong>`;
    // 모바일(≤640px)은 등급 열(gCol)을 숨기고 같은 값을 카드명 아래 줄(gSub)로 접는다 — 2026-10-13 QA: 390px 에서 표가 458px 로
    // 가로 스크롤되고 카드명이 4~5줄로 접혔다(경매 페이지 표와 같은 방식).
    const grade = gradeCell(c);
    return `<tr><td>${i + 1}</td><td class="cn">${nameCell}<span class="cNum">${esc(c.number || "")}${c.rarityEn ? ` · ${esc(c.rarityEn)}` : ""}</span>${grade !== "—" ? `<span class="gSub">PSA / CGC / TAG ${grade}</span>` : ""}</td><td class="num">${p.nm != null ? `${usd(p.nm)}${p.nmSrc === "tcg" ? ` <span class="psaKind">TCG</span>` : ""}` : "—"}</td><td class="num${p.psaStale ? " psaStale" : ""}"${p.psaStale ? ` title="Last PSA 10 sales observed ${esc(p.psaDate || "")} (n=${p.psaN || "?"}) — older than 35 days"` : ""}>${p.psa != null ? `${usd(p.psa)} <span class="psaKind">${p.psaKind === "sold" ? `sold${p.psaDate ? " · " + esc(p.psaDate.slice(5)) : ""}` : "ask"}</span>` : "—"}</td><td class="num gCol">${grade}</td></tr>`;
  }).join("\n            ");

  // 세트 요약 줄(dataSummary)은 Key facts 표로 바뀌었다 — 2026-10-14(W5a). 그 줄의 카드 수(s.cardCount)는 공식 목록과 달랐고
  // (OP-01 "106 cards" — 공식 121종·154장), 발매일은 월 단위였다. 카드 수는 이제 공식 값만(set-facts cardTypes · 공식 카드 리스트).

  // 가장 비싼 카드 = 사실 파일 top10.priciest(검증된 NM 최댓값, 4차) — Key facts 문단·한국어 문단·비교표가 같은 카드·같은 값을 쓴다. 모르면(null) 문장 없음.
  // Top 10 표 위의 "The chase in … is led by …" 문단은 뺐다(2026-10-15 소유자 결정: 숫자·표·라벨만) — 표의 행을 문장으로 되풀이했다.
  const pc = s.top10.priciest;
  const allTcg = s.top10.allTcg; // OP-16 등 TCG 폴백 시세만 있는 세트: NM 라벨을 바꾼다
  // 금액 뒤에 NM 관측일(nmUpdated)을 붙인다 — 2026-10-15(5차): OP-12 Teach SP Gold $1,566 은 09-07 에 읽은 값인데(다른 세트 1위는 10-11)
  // 날짜 없이 나가 오늘 값처럼 읽혔다. 카드 상세의 "as of 2026-09-07" 과 같은 날짜.
  const pcDate = pc && pc.date ? ` (${esc(pc.date)})` : "";

  // 2026-10-15 소유자 결정(데이터 페이지엔 숫자·표·라벨만)으로 뺀 블록 — 값은 차트·지표 칸·Key facts 표에 그대로 있다:
  //   박스 시세 궤적("entered our tracking … This ratio does not explain why"), 현재 가격 구간 해설(verdict — "It is a comparison, not a forecast",
  //   "so the visible chase value is highly concentrated", "It is not opening expected value"), 검색 의도 블록(priority-set-seo
  //   marketContext·reprintContext·sealContext), 세트 수기 해설(set-commentary body).

  // 주간 PSA 등급 증가 — psaWeekly. 문장("How fast is … growing?" · "(still running near its peak)" · "Grades are not a box-opening count")을
  // 라벨 줄로 바꿨다(2026-10-15). 세트 누적(psaFull.total)은 지표 칸 "PSA graded" 에 있어 되풀이하지 않는다(한 사실 한 값).
  let momentum = "";
  const wk = s.psaWeekly;   // 사실 파일: n·sum·first·last·prev·peak
  if (wk && wk.n >= 3) {
    const pk = wk.peak, lastW = wk.last;
    momentum = `
      <h2>${code} PSA grades added per week</h2>
      <ul class="keyFacts">
        <li>${esc(wk.first.d)} – ${esc(lastW.d)}: <strong>${intl(wk.sum)}</strong> grades added</li>
        <li>Peak week (${esc(pk.d)}): <strong>${intl(pk.v)}</strong></li>${pk.d === lastW.d && pk.v === lastW.v ? "" : `
        <li>Latest week (${esc(lastW.d)}): <strong>${intl(lastW.v)}</strong></li>`}
      </ul>`;   // 고점 주가 마지막 주면 같은 값을 두 줄로 쓰지 않는다(한 사실 한 값)
  }

  // ── 경매 실적 — 우리가 직접 종료 후 재조회해 쌓은 원장에서만 나오는 축이다.
  //    박스 가격·체이스 카드·PSA 인구는 다른 데도 있지만 이건 없다.
  //    2026-09-01 신설: 애드센스가 '가치가 별로 없는 콘텐츠'로 거절한 뒤,
  //    각 페이지에 우리만 가진 데이터를 실어 고유성을 올리려고 넣었다.
  //    표본이 얇으면(비율 null) 건수만 적고 비율은 쓰지 않는다.
  let auctionSection = "";
  {
    const a = s.auction;
    if (a && a.ended >= 30) {
      const w = F.auctionWindow;
      const catName = { card: "single cards", box: "sealed boxes", pack: "loose packs", graded: "graded slabs", lot: "multi-card lots", carton: "sealed cases" };
      const cats = a.byCat.slice(0, 4);   // 종료 건수 내림차순(사실 파일)
      // 2026-10-13 QA: 서술 문단("we settled … ended eBay auctions …")과 내부 용어(Ended·Sell-through·outcome)를 표로 바꿨다.
      // 열 이름은 경매 페이지와 같다(Closed·Sold·Sell rate). 숫자는 그대로 사실 파일 auction 에서 — 영문판 세트 페이지와 같은 꼴.
      const catRows = cats.map(function (e) {
        return "<tr><td>" + esc(catName[e.cat] || e.cat) + "</td><td class=\"num\">" + intl(e.ended) + "</td><td class=\"num\">" + intl(e.sold) + "</td><td class=\"num\">" + (e.sellThrough != null ? e.sellThrough + "%" : "—") + "</td></tr>";
      }).join("");
      const totalRow = "<tr><td><strong>All " + esc(code) + " auctions</strong></td><td class=\"num\"><strong>" + intl(a.ended) + "</strong></td><td class=\"num\"><strong>" + intl(a.sold) + "</strong></td><td class=\"num\"><strong>" + (a.sellThrough != null ? a.sellThrough + "%" : "—") + "</strong></td></tr>";
      const facts = [
        w.from && w.to ? esc(w.from) + " – " + esc(w.to) : "",
        a.medPrice ? "Median sold price $" + a.medPrice : "",
        a.amount ? "Total sold $" + intl(a.amount) : "",
        a.medBidders ? "Bidders per sold lot (median) " + a.medBidders : "",
        "Sell rate = share of closed auctions that sold",
        "Buy-it-now not included",
      ].filter(Boolean).join(" · ");
      auctionSection = "<h2>" + esc(code) + " cards at eBay auction — last " + (w.days || 30) + " days</h2>"
        + "<div class=\"chaseTableWrap\"><table class=\"chaseTable aucTable\"><thead><tr><th>Listing type</th><th>Closed</th><th>Sold</th><th>Sell rate</th></tr></thead><tbody>" + catRows + totalRow + "</tbody></table></div>"
        + "<p class=\"priceNote\">" + facts + "</p>";
    }
  }

  // 재판 기록 — 검증된 팩트(data/set-facts.json). 반다이는 세트별 재판 미발표.
  // 정가 대비 배수는 2026-07-29 소유자 판단으로 사이트 전체에서 제거했다(쓸모없다고 봄).
  // 2026-10-15: 같은 블록의 "Original Japanese release"·"Original Japanese MSRP … (about $N)" 줄은 H1 아래 Key facts 표의 발매일·정가 행과
  // 같은 사실이라 뺐다(한 사실 한 값). 블록은 접힌 "Set notes" 에서 나와 라벨·날짜 목록으로 보인다.
  let reprintBlock = "";
  {
    const sf = s.hasSetFacts ? s.reprint : null;   // data/set-facts.json 에 그 세트 항목이 있을 때만(기록이 없어도 "none" 줄을 낸다)
    if (sf) {
      // 기록의 성격을 나눈다. 매장 재입고 공지를 "반다이가 재판을 발표했다" 처럼 읽히게 두면 안 된다.
      // 추첨판매는 **발매 전**에도 열린다(초회 물량 선판매). 그건 물량이 다시 풀린 게 아니므로
      // 재공급으로 세면 안 된다 — OP-17 은 발매 2026-08-22 인데 추첨이 7/30·8/7~18 이었다.
      // 분류는 market-data-normalizers.splitReprints 하나(사실 파일 reprint — 한국어 페이지·홈 배지와 같은 값, 2026-10-15 4차) — "再販"이라 적힌 추첨(OP-09)은 재판 줄로.
      const { restock: reprint, lottery: official, unverified: unver } = sf;
      const isShopReprint = (r) => r.kind === "official-reprint-lottery";
      const isDistributor = (r) => /distributor/i.test(r.kind || "");
      // 원장 날짜 그대로(ISO). 월까지만 기록된 건은 "2025-09" 로 남는다 — 일을 지어내지 않는다(2026-10-14, 종전 "Sep 2025").
      // 소스 URL 이 살아있는 http 링크일 때만 클릭 링크. 죽은/빈 소스는 텍스트로(죽은 링크 노출 방지 — 2026-07-21 감사).
      const item = (r) => {
        const live = typeof r.source === "string" && /^https?:\/\//.test(r.source) && !r.sourceDead;
        const when = esc(r.date || "");
        return live ? `<a href="${esc(r.source)}" target="_blank" rel="noopener nofollow">${when}</a>` : when;
      };
      const shopReprint = reprint.filter(isShopReprint), distrib = reprint.filter(isDistributor);
      const retail = reprint.filter((r) => !isShopReprint(r) && !isDistributor(r));
      const lines = [];
      // 사전추첨(발매 전 초회 물량 선배분)은 이 섹션에 싣지 않는다 — 추가 공급이 아니라서
      // "재판·공급" 맥락에 두면 물량이 늘어난 것처럼 읽힌다. 데이터에는 남아 있다(pre-release-lottery).
      // 줄 = 라벨 + 날짜 링크. 날짜가 없는 기록만 있는 줄은 라벨 자체를 출처 링크로 낸다 — 2026-10-15(5차): PRB-01 MediaWorld 기록(date "")이
      // 링크 글자가 빈 "Distributor reprint: ." 로 나갔다. 날짜를 지어 붙이지 않고, 한국어 페이지("유통사 재입고")처럼 라벨만 남긴다.
      // 줄 꼬리 설명("— a Premium Bandai / Bandai Namco shop draw held after release" · "store restock notices, …")은 라벨로 줄였다(2026-10-15).
      // 매장 재입고 줄의 "not a Bandai reprint announcement" 는 그 날짜가 반다이 재판으로 읽히지 않게 하는 라벨이라 남긴다(가드 R2).
      const row = (label, recs, tail = "") => {
        const dated = recs.filter((r) => r.date);
        if (dated.length) return `<li>${label}: ${dated.map(item).join(", ")}${tail}</li>`;
        const src = recs.find((r) => typeof r.source === "string" && /^https?:\/\//.test(r.source) && !r.sourceDead);
        return `<li>${src ? `<a href="${esc(src.source)}" target="_blank" rel="noopener nofollow">${label}</a>` : label}${tail}</li>`;
      };
      if (shopReprint.length) lines.push(row("Bandai Namco shop reprint (再販) lottery", shopReprint));
      if (official.length) lines.push(row("Post-release lottery (Premium Bandai / Bandai Namco shop)", official));
      if (unver.length) lines.push(row("Lottery sale, timing vs the Japanese release unverified", unver));
      if (distrib.length) lines.push(row("Distributor reprint", distrib));
      if (retail.length) lines.push(row("Retailer-reported restocks", retail, " — not a Bandai reprint announcement"));
      if (!lines.length) lines.push("<li>Reprint or restock records: none</li>");
      reprintBlock = `
      <h2>${code} reprint records</h2>
      <ul class="keyFacts">
        ${lines.join("\n        ")}
      </ul>`;
    }
  }

  // OP-05·OP-06 비교 글 링크 — 종전 "Comparing this to a nearby set? See …" 문장을 아래 내비 링크 하나로 바꿨다(2026-10-15).
  const compareLink = code === "OP-05" || code === "OP-06" ? `<a href="../articles/op-05-vs-op-06.html">OP-05 vs OP-06</a>` : "";

  const cardsLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${code} ${nameEn} top chase cards`,
    itemListElement: cards.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `${c.name}${c.number ? ` (${c.number})` : ""}` })),
  })}</script>`;

  // Key facts — AI 답변엔진(ChatGPT/Gemini/Claude/Perplexity)이 그대로 인용할 수 있는
  // 날짜 박힌 선언문. 전부 실데이터, 야간 재생성으로 매일 갱신(신선도 신호).
  // ── 세트 지표 격자 — 2026-08-20.
  // TCG 퀀트가 하는 방식: 값 하나를 던지지 않고 항상 "전체 대비 어디쯤인가"를 같이 준다.
  // 기준선은 21세트 중앙값이다(평균이 아니라 중앙값 — OP-01 같은 극단값이 기준을 끌어올린다).
  let statGrid = "";
  {
    const base = SET_BASELINE;   // 아래에서 전 세트를 한 번 훑어 만들어 둔 값
    const cells = [];
    const cmp = (v, b, higherIsBetter = true, unit = "") => {
      if (v == null || b == null || !b) return "";
      const pct = Math.round((v / b - 1) * 100);
      if (pct === 0) return `<span class="statFlat">= median</span>`;
      const cls = (pct > 0) === higherIsBetter ? "statUp" : "statDown";
      return `<span class="${cls}">${pct > 0 ? "▲" : "▼"} ${pct > 0 ? "+" : ""}${pct}%</span>`;
    };
    // 라벨은 방법론의 정의 행으로 간다(2026-09-24) — 숫자에서 규칙까지 한 번에.
    const DEF = { "Box price (JP)": "box-median", "4-week change": "change-4w", "Days of inventory": "days-of-inventory", "PSA graded": "psa-graded", "PSA 10 rate": "psa10-rate", "Value density": "value-density", "Chase concentration": "chase-concentration" };
    const lab = (label) => { const id = DEF[label] || (label.startsWith("Floor of the top") ? "floor-top10" : null); return id ? `<a class="statDef" href="../methodology.html#${id}" title="How this is calculated">${label}</a>` : label; };
    const cell = (label, value, baseText) => cells.push(
      `<div class="statCard"><div class="statLabel">${lab(label)}</div><div class="statValue">${value}</div><div class="statBase">${baseText}</div></div>`);
    // 지표 정의문은 카드마다 3~4줄을 잡아먹어 격자를 두 배로 늘렸다(2026-08-27 실측 366px).
    // 정의는 한 번만 읽으면 되는 글이라 격자 아래 접힌 용어집으로 모은다 — DOM 에는 그대로 남는다.
    // 2026-10-15 소유자 결정: 정의는 식 한 조각("listings on sale ÷ daily sales")만. 해석 꼬리("Fewer days means stock is clearing",
    // "More means demand spreads beyond one chase", "The higher this runs, the more the set rides on one pull", "value without hitting the big one")는 뺐다.
    const hints = [];
    const hintCell = (label, value, baseText, hint) => {
      hints.push([label, hint]);
      cells.push(`<div class="statCard" title="${hint.replace(/"/g, "&quot;")}"><div class="statLabel">${lab(label)}</div><div class="statValue">${value}</div>${baseText ? `<div class="statBase">${baseText}</div>` : ""}</div>`);
    };

    const m = s.metrics.jp || {};
    if (m.price != null) cell("Box price (JP)", usd(m.price), `${m.priceD ? `as of ${m.priceD} · ` : ""}${baseLabel("price")} ${usd(base.price.v)} ${cmp(m.price, base.price.v)}`);
    else cell("Box price (JP)", "—", "no sold median dated within 28 days");   // current 가 없으면 큰 숫자도 "—"(표와 같은 규칙)
    if (m.chg != null) {
      const cls = m.chg > 0 ? "statUp" : m.chg < 0 ? "statDown" : "statFlat";
      cell("4-week change", `<span class="${cls}">${m.chg > 0 ? "+" : ""}${m.chg}%</span>`, `${baseLabel("chg")} ${base.chg.v > 0 ? "+" : ""}${base.chg.v}%`);
    }
    // 재고일수 = 지금 걸린 매물 ÷ 하루 판매 속도. 낮을수록 물건이 빨리 빠진다는 뜻이라 higherIsBetter=false.
    if (m.days != null) hintCell("Days of inventory", `${m.days}d`, `${m.stock} listed · ${baseLabel("days")} ${base.days.v}d ${cmp(m.days, base.days.v, false)}`, "Listings on sale ÷ sales per day (sold-median window)");
    if (m.psa != null) cell("PSA graded", intl(m.psa), `${baseLabel("psa")} ${intl(base.psa.v)} ${cmp(m.psa, base.psa.v)}`);
    if (m.gem != null) hintCell("PSA 10 rate", `${m.gem}%`, `${baseLabel("gem")} ${base.gem.v}% ${cmp(m.gem, base.gem.v)}`, "PSA 10 grades ÷ all PSA grades, full set");
    // ── 싱글카드 구성 — 2026-08-20. TCG 퀀트의 SINGLES INTEL 을 우리 데이터로 낸다.
    // 박스를 뜯는 사람이 실제로 묻는 것: "대박 하나에 몰려 있나, 아니면 두루 값이 나가나".
    // 그쪽과 대조해 보니 OP-01 chase concentration 이 53% 로 정확히 일치했다.
    {
      const list = cards;
      // 셀 값 = 사실 파일 top10.counted(market-data-normalizers.countedValues) — 검증된 값(쓸 수 있는 NM)만, 검증 안 된 값(못 쓰는 NM·날짜 없는 1회성 TCG·숨김 표시 카드)이
      // 센 값 중 가장 낮은 값 이상이면 null → 세 칸 "—"(2026-10-15, 4차). 가장 비싼 카드(priciest)·홈 "Card support" 와 같은 판정.
      // 3차는 TCG 값을 같이 셌다 — OP-08 Chase concentration 35% 의 #1 이 숨김 표시 Luffy TR TCG $455 였다.
      const top = s.top10.counted;
      const priced = s.top10.pricedCount;   // 칸을 둘지 — raw 값이 있는 카드(검증 안 된 값 포함) 5장 이상
      if (!top && priced >= 5) {
        hintCell("Value density", "—", "", `Cards worth $25+ in the top ${list.length} (raw NM)`);
        hintCell("Chase concentration", "—", "", `#1 card ÷ total raw NM value of the top ${list.length}`);
        hintCell(`Floor of the top ${list.length}`, "—", "", `Lowest raw NM value in the top ${list.length}`);
      } else if (top && top.length >= 5) {
        const total = top.reduce((a, v) => a + v, 0);
        const dense = top.filter((v) => v >= 25).length;
        const conc = Math.round((top[0] / total) * 100);
        hintCell("Value density", `${dense} / ${top.length}`, "", `Cards worth $25+ in the top ${top.length} (raw NM)`);
        hintCell("Chase concentration", `${conc}%`, "", `#1 card ÷ total raw NM value of the top ${top.length}`);
        hintCell(`Floor of the top ${top.length}`, usd(Math.round(top[top.length - 1])), "", `Lowest raw NM value in the top ${top.length}`);
      }
    }

    if (cells.length >= 3) {
      const glossary = hints.length
        ? `<details class="statGloss"><summary>Definitions</summary><dl>${hints.map(([l, t]) => `<dt>${l}</dt><dd>${t}</dd>`).join("")}</dl></details>`
        : "";
      statGrid = `<section aria-label="Set metrics"><div class="statGrid">${cells.join("")}</div>${glossary}</section>`;
    }
  }

  let keyFacts = "";
  {
    const facts = [];
    // 주 팩트는 차트와 같은 sold 시리즈 기준 — Key facts 표·지표 격자와 같은 current 값.
    // 현재가 문장은 current(28일 규칙)일 때만 — 2026-10-14 QA: "As of 2026-07-07 … about $147"·"3.8x the Japanese box" 가 접힌 사실 문단에 남았다.
    const curJ = s.current.jp, curE = s.current.en;
    const serLast = curJ ? { d: curJ.d, p: curJ.median } : null;
    const jpVal = serLast ? serLast.p : null;
    // 라벨은 Key facts 표와 같은 "sold median"(2026-10-15 — 종전 "market value" 는 같은 값의 다른 이름이었다).
    if (jpVal != null) facts.push(`As of ${esc(serLast.d)}, a sealed ${code} Japanese booster box has an eBay sold median of about <strong>${usd(jpVal)}</strong>${curJ.n != null ? ` (${curJ.n} sales)` : ""}.`);
    // 호가 문장은 표본 5건 이상일 때만(위젯·Product 는 3건) — 사실 파일 liveAsk.jp 의 mid·n.
    const live = s.liveAsk.jp;
    if (live && live.n >= 5) facts.push(`Current eBay asking prices run around <strong>${usd(live.mid)}</strong> (${live.n} active listings).`);
    const enLastP = curE ? curE.median : null;
    if (enLastP != null && jpVal != null) facts.push(`The English ${code}${s.reprint.enIsReprint ? " reprint (White)" : ""} box runs about <strong>${usd(enLastP)}</strong> — ${(enLastP / jpVal).toFixed(1)}x the Japanese box${englishHref ? ` (<a href="${englishHref}">English box guide</a>)` : ""}.`);
    // 가장 비싼 카드 = pc(사실 파일 top10.priciest) — 추적 문단·한국어 문단·비교표와 같은 카드·같은 값(2026-10-15, 3차). 모르면(null) 문장 없음.
    if (pc) {
      const tf = cardPrices(s.cards[pc.i]);
      // 가장 비싼 카드는 검증된 NM 만(4차, 2026-10-15) — 라벨은 "raw NM" 하나.
      if (pc.ties.length > 1) facts.push(`The most valuable ${code} cards are <strong>${joinNames(pc.ties)}</strong>, tied at about <strong>${usd(pc.usd)}</strong> raw NM each${pcDate}.`);
      else facts.push(`The most valuable ${code} card is <strong>${esc(pc.name)}</strong>${pc.number ? ` (${esc(pc.number)})` : ""} at about <strong>${usd(pc.usd)}</strong> raw NM${pcDate}${tf.psa != null ? (tf.psaKind === "sold" && tf.psaStale ? `, with PSA 10 copies last selling near ${usd(tf.psa)} (${esc(tf.psaDate || "")}, n=${tf.psaN || "?"})` : `, with PSA 10 copies ${tf.psaKind === "sold" ? "selling" : "listed"} near ${usd(tf.psa)}`) : ""}.`);
    }
    if (fullPsaRate != null && fullPsaTotal) facts.push(`Across the full ${code} set, <strong>${fullPsaRate}%</strong> of PSA-graded cards received PSA 10, across ${intl(fullPsaTotal)} total grades.`);
    if (s.release) facts.push(`The English edition of ${code} released ${esc(s.release)}${jpRelDate ? ` (Japanese edition ${esc(jpRelDate)})` : ""}.`);
    // 이 목록은 날짜 박힌 사실 한 줄씩이다(AI 인용용) — 해석·방법 설명 문장은 넣지 않는다(2026-10-15 소유자 결정).
    // 화면에서는 접어 두고, 본문은 DOM 에 그대로 둔다. 가드 PC1 이 "The most valuable …" 줄을 원장과 대조한다.
    if (facts.length >= 2) keyFacts = `
      <section id="key-facts" aria-label="Key facts">
        <details class="keyFactsBox"><summary>Key facts in one paragraph</summary>
        <ul class="keyFacts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul></details>
      </section>`;
  }

  // ko 짝이 실제로 존재할 때만 hreflang 을 건다(eb-05·op-17 처럼 ko 없는 얼리페이지는 제외).
  const koHref = fs.existsSync(path.join(ROOT, "ko", `${slug(code)}.html`)) ? `${SITE}/ko/${slug(code)}.html` : "";

  return `${head({ title, desc, canonical, koHref, extraLd: faqLd(code, nameEn, title, pageDate) + cardsLd + productLd(code, nameEn, s) })}
      <p class="eyebrow">Set Guide</p>
      <div class="setHero">
        ${s.box ? `<img src="${esc((variant(s.box, "hero") || { src: s.box }).src)}" alt="${esc(`${code} ${nameEn} Japanese booster box`)}" width="132" height="132" loading="eager" fetchpriority="high" decoding="async" />` : ""}
        <div>
          <h1>One Piece ${code} ${esc(nameEn)} — Japanese booster box price${relHeading ? " &amp; release date" : `${prioritySeo ? ", reprints" : ""} &amp; chase cards`}</h1>
          ${/* Key facts 표 — H1 바로 아래(2026-10-14, W5a). 판매 중앙값·최저 매물가·발매일·정가·팩 수·카드 종류·카드 리스트.
              영문판·한국어 페이지와 같은 값(사실 파일 keyFacts.jp — build-site-facts.keyFactsModel)에서 나온다. 가드 KF1 이 원천과 대조한다. */ ""}
          ${keyFactsHtml(s.keyFacts.jp)}
          ${/* 갱신일을 정적 HTML 로 — 기존 "Updated" 는 JS 로만 찍혀서 크롤러에겐 날짜 없는
              페이지였다(2026-08-28 외부감사). 페이지는 매일 재생성되므로 이 날짜는 항상 사실. */ ""}
          <p class="pageUpdated">Data updated <time datetime="${pageDate}">${pageDate}</time> · refreshed daily</p>
        </div>
      </div>
      ${AFF_TOP}
      ${/* 구매 버튼은 박스 시세 바로 아래 — 2026-10-07. 종전엔 차트(약 100KB 인라인 SVG)·라이브 위젯 뒤에 있어
            첫 eBay 링크가 문서 13만 자 지점이었다. ChatGPT 착지 1위(op-16)가 13초 만에 나가는데 가격 옆에 살 길이 없었다.
            2026-10-14(W5a): 박스 시세(판매 중앙값·최저 매물가)가 H1 아래 Key facts 표로 올라와, 버튼도 지표 격자 앞(표·고지 바로 뒤)으로.
            순서: 최저 실매물 → 전체 매물 → 트래커 → 영문판. 검색 링크는 실매물 버튼이 없을 때만 강조(영문판 생성기와 같은 규칙). */ ""}
      <div class="ctaRow">
        ${jpBuy}
        <a class="${jpBuy ? "" : "primary"}" href="${ebaySearch}" target="_blank" rel="noopener noreferrer sponsored">${jpBuy ? `All ${code} box listings` : `Browse ${code} boxes on eBay`}</a>
        <a href="../?set=${enc}" data-ko="${code} 라이브 트래커 — 카드 이미지 · PSA 10 매물 · PSA 표 →">Live ${code} tracker — card images · PSA 10 listings · PSA table →</a>
        ${englishHref ? `<a href="${englishHref}">English ${code} box price</a>` : ""}
        ${cardListLink(code)}
      </div>
      ${statGrid}
      ${keyFacts}
      ${withChartCss(boxChartBlock(code))}
      ${liveWidget(code)}
      ${/* 갓 나온 세트는 박스 시세만 있고 체이스 카드 목록이 아직 없다. 헤더만 있는 빈 표를
            내보내면 "데이터가 있는데 비어 있다"로 읽힌다 — 섹션을 아예 그리지 않고,
            라벨 한 줄(값 "—")만 남긴다. 카드 목록이 생기면 자동으로 다시 나타난다. */""}
      ${cards.length ? `<h2>Top 10 chase cards in ${code}</h2>
      <div class="chaseTableWrap">
        <table class="chaseTable">
          <thead><tr><th>#</th><th class="cn">Card</th><th>NM (raw)</th><th>PSA 10</th><th class="gCol">Graded (PSA / CGC / TAG)</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <p class="priceNote">${allTcg ? `NM (raw) = one-time TCG market snapshot.` :`<a href="../methodology.html#nm-retail">NM</a> = Japanese near-mint retail, ¥ → USD at ¥1 = $${FX.jpyKrw && FX.usdKrw ? (FX.jpyKrw / FX.usdKrw).toFixed(5) : "?"} (${esc(FX.date || DATA_DATE)}). <a href="../methodology.html#psa10-price">PSA 10</a> = sold median where marked, otherwise a verified ask.`} <a href="../methodology.html">Source rules</a> · ${esc(DATA_DATE)}</p>`
      : `<p class="priceNote">Top 10 chase cards (${code}): — · <a href="../methodology.html">Source rules</a> · ${esc(DATA_DATE)}</p>`}
      ${auctionSection}
      ${/* 접힌 "Set notes"(해설·궤적·해석·검색 의도 문단)는 2026-10-15 소유자 결정으로 없앴다. 남은 것은 라벨·날짜 목록인
            재판 기록과 주간 PSA 등급 증가뿐이라 접지 않는다. */""}
      ${reprintBlock}
      ${momentum}
      ${faqHtml(code, nameEn)}
      <div class="setNavLinks">
        ${prev ? `<a href="${slug(prev)}.html">← ${prev} guide</a>` : ""}
        <a href="index.html">All set guides</a>${UPCOMING_NEXT[code] ? `
        <a href="${esc(UPCOMING_NEXT[code].slug)}.html">${esc(UPCOMING_NEXT[code].code)} guide →</a>` : ""}
        ${next ? `<a href="${slug(next)}.html">${next} guide →</a>` : ""}
        ${compareLink}
      </div>${FOOT}`;
}

function hubPage() {
  const canonical = `${SITE}/sets/index.html`;
  // 허브 제목·설명(2026-09-17): 종전 67자 제목은 잘렸고 설명은 "OP-01 through OP-15" 로 굳어 있었다. 세트 수·범위는 ORDER 에서 센다.
  const lastOp = [...ORDER].reverse().find((c) => c.startsWith("OP-")) || ORDER[ORDER.length - 1];
  const englishCount = ORDER.filter((code) => fs.existsSync(path.join(ROOT, "sets", `${slug(code)}-english.html`))).length;
  const title = uniqueTitle(fit([`One Piece Booster Box Price Guides by Set | OP Box Index`, `One Piece Booster Box Price Guides by Set`], TITLE_MAX, "sets/index"));
  const desc = fit([
    `${ORDER.length} Japanese One Piece booster box price guides (OP-01 to ${lastOp}, EB, PRB) and ${englishCount} English-print box pages: eBay sold medians, chase cards and PSA 10 data.`,
    `${ORDER.length} Japanese One Piece booster box price guides (OP-01 to ${lastOp}, EB, PRB) and ${englishCount} English-print box pages with eBay sold medians and PSA 10 data.`,
  ], DESC_MAX, "sets/index");
  // 세트명 아래 수기 해설 꼬리표(set-commentary heading — "The set everything else gets measured against" 등)는 2026-10-15 소유자 결정으로 뺐다.
  // 허브 표(2026-09-24): 홈 요약표와 같은 board 값(사실 파일 board). 가격 없는 이름 목록은 "어느 세트를 볼지" 고르는 데 도움이 안 됐다.
  const board = {};
  for (const b of F.board) board[b.code] = b;
  // 표의 날짜 칸은 판매 원장 기준일(asOf)까지 간다 — "Data" 날짜가 그보다 이르면 안 된다(2026-10-15, OP-07 행 10-15 · Data 10-14). 사실 파일 hubDate.
  const hubDate = F.dataDate;
  const STALE_DAYS = 28;
  const rows = ORDER.map((code) => {
    const s = F.sets[code];
    const b = board[code] || {};
    // board = current(28일 규칙, build-site-facts). 값이 없으면 행은 남기고 "—".
    const stale = b.nowUsd == null;
    const chg = stale ? null : b.changePct;
    const en = fs.existsSync(path.join(ROOT, "sets", `${slug(code)}-english.html`)) ? `<a href="${slug(code)}-english.html">EN box</a>` : "";
    const top = s.cards[0];
    const topHref = top && top.number ? CARD_MAP[top.number + "|" + String(top.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")] : null;
    const topLink = topHref ? `<a href="../cards/${topHref}">${esc(top.name)}</a>` : (top ? esc(top.name) : "");
    const cl = CARD_LISTS[code] ? `<a href="${slug(code)}-card-list.html">Card list</a>` : "";
    return `<tr${stale ? ' class="stale"' : ""}><td><a href="${slug(code)}.html"><strong>${code}</strong></a></td><td><a href="${slug(code)}.html">${esc(s.nameEn || "")}</a></td><td class="num">${b.nowUsd != null ? "$" + intl(b.nowUsd) : "—"}</td><td class="num when">${b.nowDate ? esc(b.nowDate.slice(5)) : "—"}${b.n != null ? `<small> n=${b.n}${b.windowDays ? `/${b.windowDays}d` : ""}</small>` : ""}</td><td class="num ${chg == null ? "" : chg > 0 ? "up" : chg < 0 ? "down" : "flat"}">${chg != null ? (chg > 0 ? "+" : "") + chg + "%" : "—"}</td><td class="links">${[en, cl, topLink].filter(Boolean).join(" · ")}</td></tr>`;
  }).join("\n        ");
  const items = rows;
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "One Piece booster box price guides",
    itemListElement: ORDER.map((code, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${code} ${F.sets[code].nameEn || ""} guide`,
      url: `${SITE}/sets/${slug(code)}.html`,
    })),
  })}</script>`;
  // 영문판 박스 페이지가 있는 세트만 — 파일 존재가 기준(generate-english-set-pages.js 가 먼저 돈다).
  // 줄 꼬리 "— English box: sold median, asking, weekly history, English PSA"(그 페이지에 무엇이 있는지 소개, 22줄 반복)는 뺐다(2026-10-15).
  const englishItems = ORDER.filter((code) => fs.existsSync(path.join(ROOT, "sets", `${slug(code)}-english.html`)))
    .map((code) => `<li><a href="${slug(code)}-english.html"><strong>${code}</strong> ${esc(F.sets[code].nameEn || "")}</a></li>`)
    .join("\n        ");
  return `${head({ title, desc, canonical, ogType: "website", extraLd: ld })}
      <p class="eyebrow">Set Guides</p>
      <h1>One Piece booster box price guides — every Japanese set</h1>
      ${/* Key facts(2026-10-16) — 세트 페이지와 같은 표를 허브에도: 값은 사실 파일 home(최저·최고 박스, 4주 등락 집계)·hubDate·order 그대로. */ ""}
      ${kfTableAny([
        ["sets", "Set guides", "세트 가이드", `<b>${ORDER.length}</b> <small><span data-ko="일본판 박스">Japanese box</span> · ${englishCount} <span data-ko="영문판 박스 페이지">English box pages</span> · ${Object.keys(CARD_LISTS).length} <span data-ko="공식 카드 리스트">official card lists</span></small>`],
        ["range", "Box price range (JP)", "박스 시세 범위 (일본판)", F.home.cheapest && F.home.priciest ? `<b>$${intl(F.home.cheapest.usd)}–$${intl(F.home.priciest.usd)}</b> <small>${esc(F.home.cheapest.codes.join(", "))} · ${esc(F.home.priciest.code)}</small>` : "—"],
        ["change", "4-week change", "4주 등락", `<b>${F.home.nUp} <span data-ko="상승">up</span> · ${F.home.nDn} <span data-ko="하락">down</span></b> <small><span data-ko="28일 전 중앙값이 있는 세트">of ${F.home.withChg} sets with a median 28 days earlier</span></small>`],
        ["movers", "Largest moves", "최대 등락", [F.home.topUp ? `${esc(F.home.topUp.code)} ${F.home.topUp.pct >= 0 ? "+" : ""}${F.home.topUp.pct}%` : null, F.home.topDn ? `${esc(F.home.topDn.code)} ${F.home.topDn.pct >= 0 ? "+" : ""}${F.home.topDn.pct}%` : null].filter(Boolean).join(" · ") || "—"],
        ["asof", "Data", "기준일", `<time datetime="${esc(hubDate)}">${esc(hubDate)}</time> <small><span data-ko="이베이 완료 거래 중앙값">eBay completed-sale medians</span></small>`],
      ], { label: "Set guides key facts", caption: `<span data-ko="원피스 일본판 부스터 박스 시세">One Piece Japanese booster box prices</span> · <time datetime="${esc(hubDate)}">${esc(hubDate)}</time>` })}
      ${/* 표 머리 설명을 라벨 조각으로(2026-10-15 소유자 결정) — 종전 "dated per row by its median point" 같은 방법 설명 문장을 정의 조각만 남겼다. */ ""}
      <p class="priceNote">Japanese sealed booster box · Box price = rolling median of completed eBay sales · n = sales in its 28–56-day window · 4-wk change = vs the median 28 days earlier · — = no median dated within ${STALE_DAYS} days (6+ sales) · Data ${esc(hubDate)} · <a href="../methodology.html#box-median">How these are counted</a></p>
      <div style="overflow-x:auto">
      <table class="homeSummaryTable hubTable">
        <thead><tr><th>Set</th><th>Name</th><th>Box price</th><th>As of (n/window)</th><th>4-wk change</th><th>More</th></tr></thead>
        <tbody>
        ${items}
        </tbody>
      </table>
      </div>
      ${englishItems ? `<h2 id="english">English edition box prices</h2>
      <ul class="chaseList">
        ${englishItems}
      </ul>` : ""}
      ${(() => {
        // 공식 카드리스트(일본판) — 추적 세트 밖(EB-04, 공식 목록이 뜬 예정 세트)도 여기서 들어간다. 2026-10-14(W7). 사실 파일 cardLists.
        const lists = F.cardLists;
        if (!lists.length) return "";
        const li = lists.map((p) => {
          const name = p.name;
          return `<li><a href="${slug(p.code)}-card-list.html"><strong>${p.code}</strong>${name ? " " + esc(name) : ""}</a> — <span data-ko="카드 ${p.counts.cards}장 · 번호 ${p.counts.numbers}종">${p.counts.cards} cards · ${p.counts.numbers} card numbers</span></li>`;
        }).join("\n        ");
        return `<h2 id="card-lists" data-ko="공식 카드 리스트">Official card lists</h2>
      <ul class="chaseList">
        ${li}
      </ul>`;
      })()}
      <h2>Upcoming sets</h2>
      <ul class="chaseList">
        ${upcomingItems()}
      </ul>
      <div class="setNavLinks">
        <a href="../">Open the live price tracker</a>
        <a href="../cards/">Individual card price pages</a>
        <a href="../psa10-ranking.html">Most valuable PSA 10 cards</a>
        <a href="../articles/sealed-box-rules.html">What moves box prices</a>
        <a href="../articles/reseal-checklist.html">Reseal checklist</a>
        <a href="../articles/psa-population-and-prices.html">PSA population &amp; prices</a>
        <a href="../articles/op-05-vs-op-06.html">OP-05 vs OP-06</a>
        <a href="../articles/one-piece-card-price-guide.html">Card price guide</a>
      </div>${FOOT}`;
}

// ---- PSA10 가치 랭킹(루트 페이지) — 실거래 sold 값 기준(신뢰 최우선; 나눗셈 멀티플은 NM 부실로 미사용)
// ── PSA 10 랭킹 페이지 — 2026-09-15 재설계(소유자 지시): 보고서식 산문을 없애고 경매 페이지 문법(숫자 카드·카드 이미지 표·배수 막대·세트별 표)으로.
//    긴 설명문 추가 금지. 용어는 일반인 기준(raw→ungraded, pop→PSA graded). 모바일(≤640px)은 열을 줄여(#·카드·PSA 10·배수) 가로 스크롤 없이 읽힌다.
//    이미지는 자체 호스팅만 쓴다(가드 I1) — 외부 CDN 뿐인 카드는 빈 칸.
const IMG_MAP_CARDS = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "img", "cards", "map.json"), "utf8")); } catch { return {}; } })();
const cardSlugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const cardKey = (num, name) => `${num}|${String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
function ownImage(c) {
  const mapped = IMG_MAP_CARDS[cardSlugify(c.number + "-" + c.name)];
  if (mapped) return mapped;
  const u = c.image || c.img || "";
  if (/^https:\/\/opboxindex\.com\//.test(u)) return u.replace(/^https:\/\/opboxindex\.com\//, "");
  if (u && !/^https?:/.test(u)) return u.replace(/^\.?\//, "");
  return null;
}

function rankingRows() {
  const rows = [];
  for (const code of ORDER) {
    const set = F.sets[code];
    for (const c of set.cards) {
      // PSA 10 실거래(표본 3건 이상, 관측일 환율로 되돌린 달러)·쓸 수 있는 NM·배수·stale(35일) — 전부 사실 파일 cards[i](세트 Top 10·카드 상세와 같은 값).
      const p = c.psa10;
      if (!p) continue;
      rows.push({
        code, setName: set.nameEn || code, name: c.name, number: c.number, rarity: c.rarityEn, psa: p.usd, n: p.n,
        low: p.low, high: p.high, updated: p.date,
        stale: p.stale,   // 관측일이 35일 넘은 sold 중앙값은 "지금 값"이 아니다 — 세트·카드 페이지(psaStale)·홈(PSA10_STALE_DAYS)과 같은 기준. 2026-09-30.
        // 배수 규칙(35일·40배)은 사실 파일 psa10.multiple 한 곳(2026-10-19)
        rawUsd: c.nm.usd, mult: p.multiple, pop: c.pop, img: ownImage(c), slug: CARD_MAP[cardKey(c.number, c.name)] || null,
      });
    }
  }
  rows.sort((a, b) => b.psa - a.psa);
  return rows;
}

function rankingPage() {
  const rows = rankingRows();
  // 기준일은 표에 실린 카드들의 **가장 최근** 관측일 — 1위 카드 하나의 날짜를 쓰면 그 카드만 안 갱신됐을 때 페이지 전체가 두 달 묵어 보인다(2026-09-09 감사).
  const asOf = rows.reduce((m, r) => (r.updated && r.updated > m ? r.updated : m), "") || DATA_DATE;
  const canonical = `${SITE}/psa10-ranking.html`;
  const t1 = rows[0];
  const over1k = rows.filter((r) => r.psa >= 1000).length;
  const mults = rows.filter((r) => r.mult).map((r) => r.mult).sort((a, b) => a - b);
  const medMult = mults.length ? mults[Math.floor(mults.length / 2)] : null;
  const totalPop = rows.reduce((t, r) => t + (r.pop ? r.pop.total : 0), 0);
  const totalG10 = rows.reduce((t, r) => t + (r.pop ? r.pop.g10 : 0), 0);
  const gemPct = totalPop ? Math.round((totalG10 / totalPop) * 100) : null;
  const bySet = {};
  rows.forEach((r) => { (bySet[r.code] = bySet[r.code] || []).push(r); });
  const setRows = Object.entries(bySet).map(([code, rs]) => {
    const ps = rs.map((r) => r.psa).sort((a, b) => a - b);
    return { code, name: rs[0].setName, cards: rs.length, median: ps[Math.floor(ps.length / 2)], top: rs[0],
      pop: rs.reduce((t, r) => t + (r.pop ? r.pop.total : 0), 0), g10: rs.reduce((t, r) => t + (r.pop ? r.pop.g10 : 0), 0) };
  }).sort((a, b) => b.median - a.median);
  const topMult = rows.filter((r) => r.mult).sort((a, b) => b.mult - a.mult).slice(0, 12);
  const maxMult = topMult.length ? topMult[0].mult : 1;

  const cardCell = (r) => {
    const inner = `${r.img ? `<img src="${esc((variant(r.img, "thumb") || { src: r.img }).src)}" alt="" width="40" height="56" loading="lazy" decoding="async" />` : `<span class="noImg" aria-hidden="true"></span>`}<span><b>${esc(r.name)}</b><small>${esc(r.code)}${r.number ? ` · ${esc(r.number)}` : ""}${r.rarity ? ` · ${esc(r.rarity)}` : ""}</small></span>`;
    return `<td class="l cardCell">${r.slug ? `<a href="cards/${esc(r.slug)}">${inner}</a>` : `<span class="cardLink">${inner}</span>`}</td>`;
  };
  const rangeCell = (r) => (r.low != null && r.high != null ? `${usd(r.low)}–${usd(r.high)}` : "—");
  const popCell = (total, g10) => (total ? `${intl(total)} <small>${intl(g10)} × 10</small>` : "—");
  // 관측일 칸 — 행마다 그 sold 중앙값을 본 날. 35일 넘은 행은 흐리게, 날짜는 노랗게(세트 허브 표와 같은 표시).
  const obsCell = (r) => `<td class="obs"${r.stale ? ` title="Observed ${esc(r.updated)} — older than 35 days"` : ""}>${r.updated ? `<time datetime="${esc(r.updated)}">${esc(r.updated.slice(5))}</time>` : "—"}</td>`;
  const tableHead = `<thead><tr><th class="rkH">#</th><th class="l">Card</th><th class="psaH">PSA 10</th><th class="obsH">Sold as of</th><th class="hideM">Sales</th><th class="hideM">Low–high</th><th class="hideM">Ungraded</th><th class="mulH">× ungraded</th><th class="hideM">PSA graded (10s)</th></tr></thead>`;
  const rowHtml = (r, i) => `<tr${r.stale ? ' class="stale"' : ""}><td class="rk">${i + 1}</td>${cardCell(r)}<td class="psa">${usd(r.psa)}</td>${obsCell(r)}<td class="hideM">${r.n}</td><td class="rng hideM">${rangeCell(r)}</td><td class="hideM">${r.rawUsd != null ? usd(r.rawUsd) : "—"}</td><td class="mul">${r.mult ? r.mult.toFixed(1) + "×" : "—"}</td><td class="pop hideM">${r.pop ? popCell(r.pop.total, r.pop.g10) : "—"}</td></tr>`;
  const rankTable = (list, offset) => `<div class="tblWrap"><table class="aTable">
          ${tableHead}
          <tbody>
${list.map((r, i) => rowHtml(r, i + offset)).join("\n")}
          </tbody>
        </table></div>`;
  const barRows = topMult.map((r) => `<div class="kindRow"><span class="kName">${esc(r.name)} <small>${esc(r.number || "")}</small></span><span class="kTrack"><span class="kFill" style="width:${Math.max(6, Math.round((r.mult / maxMult) * 100))}%"></span><span class="kVal">${r.mult.toFixed(1)}×</span></span><span class="kMed"><small>ungraded</small> ${usd(r.rawUsd)} → <small>PSA 10</small> ${usd(r.psa)}</span></div>`).join("\n");
  const setTrs = setRows.map((s, i) => `<tr><td class="rk">${i + 1}</td><td class="l"><a href="sets/${esc(slug(s.code))}.html"><b>${esc(s.code)}</b> <small>${esc(s.name)}</small></a></td><td class="psa">${usd(s.median)}</td><td class="hideM">${s.cards}</td><td class="l hideM">${esc(s.top.name)} <small>${usd(s.top.psa)}</small></td><td class="pop hideM">${popCell(s.pop, s.g10)}</td></tr>`).join("\n");

  const faqQ1 = `What is the most expensive One Piece card in PSA 10${t1.stale ? "" : " right now"}?`;
  // 날짜는 1위 카드 자신의 관측일(asOf 는 표 전체의 최신일이라 1위 값의 날짜가 아닐 수 있다). 35일 넘으면 "recent" 를 쓰지 않는다.
  const faqA1 = `${t1.name} (${t1.code}${t1.number ? ` ${t1.number}` : ""}) — median ${usd(t1.psa)} across ${t1.n} ${t1.stale ? "" : "recent "}completed eBay sales as of ${t1.updated || asOf}.`;
  // 문답은 데이터로 답하는 1번만 — 2026-10-15 소유자 결정. "Are these asking prices?"(방법 설명 — 머리 줄 "Median of completed eBay sales ·
  // at least 3 sales per card" 라벨과 같은 말) · "Why Japanese cards only?"(이유 설명)는 뺐다. 화면 = FAQPage(가드 L2).
  const faqLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: faqQ1, acceptedAnswer: { "@type": "Answer", text: faqA1 } },
    ],
  })}</script>`;
  // 랭킹 제목·설명(2026-09-17): 종전 73자 제목은 잘렸다. 브랜드 꼬리를 붙이면 60자를 넘어 뺀다. 설명은 표의 숫자로 쓴다.
  const title = uniqueTitle(fit([`Top 10 Most Valuable One Piece Cards (PSA 10 Sold Prices)`, `Most Valuable One Piece PSA 10 Cards (Sold Prices)`], TITLE_MAX, "psa10-ranking"));
  // 1위 값에는 그 값의 관측일을 붙인다 — 끝의 asOf 는 표 전체의 최신일이라 1위가 묵은 표본이면 그 날짜의 값처럼 읽혔다(2026-09-30).
  const t1When = t1.updated && t1.updated !== asOf ? ` (${t1.updated})` : "";
  const desc = fit([
    `${rows.length} Japanese One Piece cards ranked by PSA 10 median from completed eBay sales, 3+ sales each. Highest ${usd(t1.psa)}${t1When}, ${over1k} cards above $1,000, as of ${asOf}.`,
    `${rows.length} Japanese One Piece cards ranked by PSA 10 eBay sold median, 3+ sales each. Highest ${usd(t1.psa)}${t1When}, ${over1k} above $1,000, as of ${asOf}.`,
  ], DESC_MAX, "psa10-ranking");
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "ItemList",
    name: "Most valuable One Piece PSA 10 cards",
    dateModified: asOf,   // 2026-10-19 — 화면 "As of" 와 같은 값(표에 실린 카드들의 최신 관측일)
    itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${r.name} (${r.code}${r.number ? " " + r.number : ""}) PSA 10` })),
  })}</script>
    <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "PSA 10 Value Ranking", item: canonical },
    ],
  })}</script>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#0a0c10" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    ${ld}
    ${faqLd}
    <link rel="stylesheet" href="styles.css?v=${CSS_VER}" />
    <style>
      .rankWrap { max-width: 980px; margin: 0 auto; padding: 20px clamp(14px,3vw,28px) 44px; }
      .rankWrap h1 { margin: 6px 0; font-size: clamp(23px,4vw,32px); line-height: 1.2; }
      .rankWrap .lead { color: var(--muted); font-size: 15px; line-height: 1.6; margin: 6px 0 0; }
      .rankWrap h2 { font-size: 19px; margin: 0 0 2px; }
      .statRow { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0 6px; }
      .stat { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.02); }
      .stat b { display: block; font-size: clamp(22px,4vw,30px); font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
      .stat span { display: block; font-size: 11.5px; color: var(--muted); margin-top: 5px; line-height: 1.4; }
      .stat.hi b { color: var(--accent); }
      .chartCard { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 12px; margin: 18px 0; background: rgba(255,255,255,.015); }
      .chartHead { margin-bottom: 8px; }
      .chartHead .sub { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
      .tblWrap { overflow-x: auto; }
      .aTable { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 6px 0; }
      .aTable th { text-align: right; padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 600; font-size: 12.5px; font-weight: 600; letter-spacing: .04em; white-space: nowrap; }
      .aTable th.l, .aTable td.l { text-align: left; }
      .aTable td { padding: 7px 10px; border-bottom: 1px solid rgba(255,255,255,.05); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; vertical-align: middle; }
      .aTable td.rk { color: var(--muted); width: 28px; }
      .aTable td.psa { color: var(--accent); font-weight: 800; font-size: 14.5px; }
      .aTable td.rng { color: var(--muted); }
      .aTable td.obs { color: var(--muted); }
      .aTable tr.stale td { opacity: .62; } .aTable tr.stale td.obs { opacity: 1; color: #f5c842; }
      .aTable td.mul { font-weight: 700; }
      .aTable td.pop small, .aTable td.l small { color: var(--muted); margin-left: 4px; }
      .aTable td.l a { color: inherit; text-decoration: none; }
      .aTable td.l a:hover b { color: var(--accent); }
      .cardCell a, .cardCell .cardLink { display: flex; align-items: center; gap: 10px; min-width: 200px; }
      .cardCell img, .cardCell .noImg { width: 40px; height: 56px; border-radius: 4px; object-fit: cover; background: rgba(255,255,255,.06); flex: 0 0 40px; }
      .cardCell b { display: block; font-size: 13.5px; line-height: 1.25; white-space: normal; }
      .cardCell small { display: block; color: var(--muted); font-size: 11.5px; margin: 2px 0 0; }
      .kindList { margin: 6px 0 2px; }
      .kindRow { display: grid; grid-template-columns: minmax(150px, 1.3fr) 2fr minmax(160px, 0.9fr); gap: 10px; align-items: center; font-size: 13px; padding: 5px 0; }
      .kindHead { color: var(--muted); font-size: 12.5px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,.08); padding-bottom: 6px; margin-bottom: 4px; }
      .kindRow .kName { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kindRow .kName small { color: var(--muted); font-weight: 400; }
      .kindRow .kTrack { position: relative; height: 22px; border-radius: 5px; background: rgba(255,255,255,.05); overflow: hidden; }
      .kindRow .kFill { position: absolute; inset: 0 auto 0 0; border-radius: 5px; background: var(--accent); opacity: .85; }
      .kindRow .kVal { position: absolute; left: 8px; top: 0; line-height: 22px; font-size: 12px; color: #061014; font-weight: 800; }
      .kindRow .kMed { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .kindRow .kMed small { font-size: 11.5px; }
      .rankFaq { max-width: 760px; margin: 22px 0 0; }
      .rankFaq h2 { font-size: 18px; margin: 0 0 6px; }
      .faqItem { border-bottom: 1px solid rgba(255,255,255,.08); padding: 2px 0; }
      .faqItem summary { cursor: pointer; font-weight: 700; padding: 8px 0; font-size: 14px; }
      .faqItem p { font-size: 13.5px; margin: 4px 0 10px; color: var(--muted); line-height: 1.6; }
      .rankWrap .affNote { margin-top: 16px; color: var(--muted); font-size: 11.5px; opacity: .8; }
      @media (max-width: 640px) {
        .statRow { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .stat { padding: 12px; }
        .stat b { font-size: 22px; }
        .stat.hi { grid-column: 1 / -1; }
        .chartCard { padding: 12px 12px 8px; border-radius: 12px; }
        .aTable { font-size: 12.5px; table-layout: fixed; }
        .aTable th, .aTable td { padding: 6px 4px; }
        .aTable th { font-size: 11.5px; letter-spacing: 0; white-space: normal; overflow-wrap: anywhere; }
        .aTable .hideM { display: none; }
        .aTable th.rkH { width: 20px; }
        .aTable th.psaH { width: 72px; }
        .aTable th.obsH { width: 46px; }
        .aTable th.mulH { width: 64px; }
        .aTable td.rk { width: auto; padding-left: 0; }
        .aTable td.l { white-space: normal; overflow-wrap: anywhere; }
        .aTable td.psa { font-size: 13.5px; }
        .cardCell a, .cardCell .cardLink { min-width: 0; gap: 8px; }
        .cardCell img, .cardCell .noImg { width: 34px; height: 48px; flex-basis: 34px; }
        .cardCell span:not(.noImg) { min-width: 0; }
        .cardCell b { font-size: 12.5px; }
        .cardCell small { white-space: normal; }
        .kindRow { grid-template-columns: 1fr; gap: 3px; padding: 7px 0; }
        .kindRow .kName { white-space: normal; }
        .kindRow .kMed { text-align: left; font-size: 12px; }
        .kindHead { display: none; }
      }
${KF_CSS_ANY}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="./"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      <nav class="nav"><a href="./" data-ko="부스터 박스">Booster Boxes</a><a href="/cards/" data-ko="카드">Cards</a><a href="auction.html" data-ko="경매">Auctions</a><a href="compare.html" data-ko="비교">Compare</a><a href="psa10-ranking.html" aria-current="page" data-ko="PSA10 랭킹">Top PSA 10</a><a href="psa-grading.html" data-ko="PSA 등급">PSA Grading</a></nav>
    </header>
    <main id="main-content" class="rankWrap">
      <p class="eyebrow">PSA 10 · Japanese printing · as of ${esc(asOf)}</p>
      <h1>Top 10 most valuable One Piece cards — PSA 10 sold prices</h1>
      ${/* Key facts(2026-10-16) — 아래 statRow 와 같은 값(한 사실 한 값)을 표 꼴로 H1 바로 아래: 최고값·관측일·표본이 첫 화면에 날짜와 함께 보이게. */ ""}
      ${kfTableAny([
        ["highest", "Highest PSA 10 (sold median)", "최고 PSA 10 (판매 중앙값)", `<b>${usd(t1.psa)}</b> <small>${esc(t1.name)}${t1.number ? ` · ${esc(t1.number)}` : ""} · ${t1.n} <span data-ko="건">sales</span>${t1.updated ? ` · <time datetime="${esc(t1.updated)}">${esc(t1.updated)}</time>` : ""}</small>`],
        ["ranked", "Cards ranked", "순위 카드 수", `<b>${rows.length}</b> <small><span data-ko="일본판 · 카드당 판매 3건 이상">Japanese printing · 3+ sales per card</span></small>`],
        ["over1k", "Sold above $1,000", "$1,000 이상", `<b>${over1k}</b>`],
        ["multiple", "PSA 10 ÷ ungraded (median)", "PSA 10 ÷ 미등급 (중앙값)", medMult ? `<b>${medMult.toFixed(1)}×</b>` : "—"],
        ["graded", "PSA-graded copies (ranked cards)", "PSA 등급 수량 (순위 카드)", totalPop ? `<b>${intl(totalPop)}</b> <small>${gemPct}% PSA 10</small>` : "—"],
        ["asof", "As of", "기준일", `<time datetime="${esc(asOf)}">${esc(asOf)}</time>`],   // 기준일은 표 제목(caption)의 <time> 이 첫 날짜다(2026-10-19)
      ], { label: "PSA 10 ranking key facts", caption: `<span data-ko="가장 비싼 원피스 PSA 10 카드">Most valuable One Piece PSA 10 cards</span> · <time datetime="${esc(asOf)}">${esc(asOf)}</time>` })}
      <p class="lead">Median of completed eBay sales · at least 3 sales per card · USD</p>

      <div class="statRow">
        <div class="stat hi"><b>${usd(t1.psa)}</b><span>highest PSA 10 · ${esc(t1.name)}${t1.updated ? ` · sold as of ${esc(t1.updated)}` : ""}</span></div>
        <div class="stat"><b>${rows.length}</b><span>cards ranked</span></div>
        <div class="stat"><b>${over1k}</b><span>sold above $1,000</span></div>
        <div class="stat"><b>${medMult ? medMult.toFixed(1) + "×" : "—"}</b><span>PSA 10 vs ungraded (median)</span></div>
        <div class="stat"><b>${gemPct != null ? gemPct + "%" : "—"}</b><span>of PSA-graded copies are 10s · ${intl(totalPop)} graded</span></div>
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>Top 10 most valuable One Piece cards by PSA 10 sold price</h2><p class="sub">Median sale · date observed (dimmed = older than 35 days) · sales counted · ungraded price · PSA 10 ÷ ungraded · PSA graded copies (10s)</p></div>
        ${rankTable(rows.slice(0, 10), 0)}
        ${rows.length > 10 ? `<h3>Ranks 11–${Math.min(20, rows.length)}</h3>
        ${rankTable(rows.slice(10, 20), 10)}` : ""}
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>Ungraded card → PSA 10: how many times the price grows</h2><p class="sub">PSA 10 sold median ÷ ungraded price · top 12</p></div>
        <div class="kindList">
<div class="kindRow kindHead"><span>Card</span><span>PSA 10 ÷ ungraded</span><span class="kMed">ungraded → PSA 10 (USD)</span></div>
${barRows}
        </div>
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>By set</h2><p class="sub">Median PSA 10 per set · ranked cards · top card · PSA graded copies (10s)</p></div>
        <div class="tblWrap"><table class="aTable">
          <thead><tr><th class="rkH">#</th><th class="l">Set</th><th class="psaH">Median PSA 10</th><th class="hideM">Cards</th><th class="l hideM">Top card</th><th class="hideM">PSA graded (10s)</th></tr></thead>
          <tbody>
${setTrs}
          </tbody>
        </table></div>
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>Ranks 21–${rows.length}</h2><p class="sub">Same columns as the top 20</p></div>
        ${rankTable(rows.slice(20), 20)}
      </div>

      <section class="rankFaq" aria-label="Frequently asked questions">
        <h2>PSA 10 ranking — common questions</h2>
        <details class="faqItem"><summary>${esc(faqQ1)}</summary><p>${esc(faqA1)}</p></details>
      </section>
      <div class="setNavLinks"><a href="./">Live price tracker</a><a href="cards/">Individual card price pages</a><a href="sets/index.html">Set guides</a><a href="psa-grading.html">PSA population</a><a href="compare.html">Compare boxes</a></div>
      ${/* 제휴 고지 문장은 그대로 둔다(EPN 규정 — 지우거나 줄이지 말 것). 뒤에 붙어 있던 "Prices change; always confirm on eBay before buying."(권고)과
            "Not investment advice."(푸터 고지와 같은 말의 본문 반복)만 뺐다 — 2026-10-15 소유자 결정: 면책 고지는 푸터 한 줄. */ ""}
      <p class="affNote">As an eBay Partner, we may earn a commission from qualifying purchases made through eBay links on this site — at no extra cost to you.</p>
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation"><a href="about.html">About</a><a href="methodology.html">Methodology</a><a href="free-data.html">Free data (CSV)</a><a href="privacy.html">Privacy</a><a href="disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
}

// ---- write files
const outDir = path.join(ROOT, "sets");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
let written = 0;
ORDER.forEach((code, i) => {
  const html = setPage(code, ORDER[i - 1], ORDER[i + 1]);
  fs.writeFileSync(path.join(outDir, `${slug(code)}.html`), html, "utf8");
  written++;
});
fs.writeFileSync(path.join(outDir, "index.html"), hubPage(), "utf8");
written++;
fs.writeFileSync(path.join(ROOT, "psa10-ranking.html"), rankingPage(), "utf8");
written++;

// ---- sitemap: 같은 URL 은 lastmod 만 갱신, 새 URL 만 추가(set-page-shared.upsertSitemap)
const urls = [`${SITE}/psa10-ranking.html`, `${SITE}/sets/index.html`, ...ORDER.map((c) => `${SITE}/sets/${slug(c)}.html`)];
const { added } = upsertSitemap(urls);
console.log(JSON.stringify({ pagesWritten: written, sitemapAdded: added }));
