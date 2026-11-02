const state = {
  data: null,
  lang: "jp",
  selected: null,
  hasExplicitSet: false,
  renderedLang: null,
  view: "hits", // "hits" | "psa"
  hl: "en", // display language: "ko" | "en"
};

function initDisplayLanguage() {
  const params = new URLSearchParams(location.search);
  const urlLang = params.get("hl");
  // 외국인 무조건 영문 보장: 브라우저 주 언어가 한국어인 경우에만 한글 허용.
  // (hl=ko URL로 잘못 들어와도 브라우저가 한국어가 아니면 영문으로 강제)
  const browserKo =
    (navigator.language || "").toLowerCase().startsWith("ko") ||
    (navigator.languages || []).some((l) => (l || "").toLowerCase().startsWith("ko"));
  // 2026-09-16: 다른 페이지(lang-toggle.js)에서 고른 언어를 홈이 무시하고 늘 영문으로 시작했다 — 저장값을 먼저 본다.
  let saved = null;
  try { saved = localStorage.getItem("opbox_lang") || localStorage.getItem("ktcg_hl"); } catch (e) {}
  if (saved === "ko" || saved === "en") state.hl = saved;
  else state.hl = urlLang === "ko" && browserKo ? "ko" : "en";
}

function t(ko, en) {
  return state.hl === "en" ? en : ko;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeEbayUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (!/(^|\.)ebay\./i.test(url.hostname)) return "";
    return url.href;
  } catch (e) {
    return "";
  }
}

// eBay Partner Network(EPN) 추적 파라미터 부착 — 공개 캠페인 ID(비밀 아님)
const EPN_CAMPID = "5339163744";

// eBay 한시 쿠폰. **기간이 지나면 화면에서 스스로 사라진다** — 끝난 쿠폰을 띄우는 건 틀린 값을 띄우는 것과 같다.
// endsAt 은 eBay 약관 원문 기준(Valid Until: August 10, 2026, 11:59 p.m. GMT-6 → UTC 08-11 05:59).
// 다음 쿠폰이 나오면 이 블록의 code·url·endsAt 세 줄만 갈아끼우면 된다. 값이 없거나 지났으면 렌더 자체를 안 한다.
const EBAY_COUPON = {
  pct: 12,
  code: "HIS12AUG",
  url: "https://www.ebay.com/e/row/his12aug-eng",
  endsAt: "2026-08-11T05:59:00Z",
  endLabel: { ko: "8/10까지", en: "through Aug 10" },
};
const couponLive = () => EBAY_COUPON.code && Date.now() < Date.parse(EBAY_COUPON.endsAt);
const EPN_ROTATION = "711-53200-19255-0"; // ebay.com(US)
// spot = EPN customid(자리 꼬리표) — 2026-11-02. 홈이 이베이 클릭의 70%인데 EPN 클릭 761건 중 735건·거래 23건 전부가 꼬리표 없음이라
// 어느 자리가 파는지 몰랐다. 정적 페이지(set-*·card-*·bp-* 등)와 같은 방식으로 home-* 를 단다.
function epnUrl(value, spot) {
  if (!value) return "";
  try {
    const url = new URL(value);
    // 방어: http(s) 이외 스킴(javascript: 등)은 href 에 절대 넣지 않는다. 예전엔 파싱 실패나
    // 비-eBay 주소를 **원문 그대로** 돌려줘서, 상류(중계기·API)가 오염되면 악성 링크가
    // 그대로 화면에 꽂힐 수 있었다(2026-08-06 보안 점검에서 발견). url.href 로만 반환하면
    // 따옴표 등이 퍼센트 인코딩되어 속성 탈출도 함께 막힌다.
    if (url.protocol !== "https:" && url.protocol !== "http:") return "#";
    if (!/(^|\.)ebay\./i.test(url.hostname)) return url.href;
    if (spot && !url.searchParams.get("customid")) url.searchParams.set("customid", spot);
    if (url.searchParams.get("campid")) return url.href; // 이미 부착됨
    url.searchParams.set("mkcid", "1");
    url.searchParams.set("mkrid", EPN_ROTATION);
    url.searchParams.set("siteid", "0");
    url.searchParams.set("campid", EPN_CAMPID);
    url.searchParams.set("toolid", "10001");
    url.searchParams.set("mkevt", "1");
    return url.href;
  } catch (e) {
    return "#";
  }
}

function setText(selector, ko, en) {
  const node = document.querySelector(selector);
  if (node) node.textContent = t(ko, en);
}

function setHtml(selector, ko, en) {
  const node = document.querySelector(selector);
  if (node) node.innerHTML = t(ko, en);
}

function packName(pack) {
  return state.hl === "en" ? pack.nameEn || pack.nameKo || pack.code : pack.nameKo || pack.nameEn || pack.code;
}

function packSubName(pack) {
  return state.hl === "en" ? pack.nameKo || "" : pack.nameEn || "";
}

const rarityColor = {
  L: "#7db7ff",
  SEC: "#ff6683",
  SR: "#3bc8df",
  R: "#f3c74f",
  P: "#bb86fc",
  UC: "#9aa3b2",
  C: "#9aa3b2",
};

// PSA(GemRate) rarity → 짧은 배지 코드 + 색
const psaRarity = {
  "Special Alternate Art": { s: "SAA", c: "#bb86fc" },
  "Manga Alternate Art": { s: "MAA", c: "#ff8a3d" },
  "Alternate Art": { s: "AA", c: "#7db7ff" },
  "Treasure Rare": { s: "TR", c: "#f3c74f" },
  "Secret Rare": { s: "SEC", c: "#ff6683" },
  SEC: { s: "SEC", c: "#ff6683" },
  Leader: { s: "L", c: "#7db7ff" },
  "Pre-Release": { s: "PR", c: "#9aa3b2" },
  Base: { s: "C", c: "#9aa3b2" },
};
const rb = (r) => psaRarity[r] || { s: (r || "").slice(0, 3).toUpperCase(), c: "#9aa3b2" };
const num = (n) => (n == null ? "-" : new Intl.NumberFormat("ko-KR").format(n));

const fmtKrw = (v) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Math.round(v));

const fmtUsd = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v >= 100 ? 0 : 2 }).format(v);

const fmtJpy = (v) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(v);

function fmtOriginalCurrency(value, currency) {
  if (value == null) return "-";
  if (currency === "KRW") return fmtKrw(value);
  if (currency === "JPY") return fmtJpy(value);
  if (currency === "USD") return fmtUsd(value);
  return `${currency || ""} ${num(value)}`.trim();
}

function marketKrw(value, currency) {
  const fx = (state.data && state.data.fx) || {};
  if (value == null) return null;
  if (currency === "KRW") return value;
  if (currency === "JPY") return value * (fx.jpyKrw || 9.1);
  if (currency === "USD") return value * (fx.usdKrw || 1388.2);
  return null;
}

// 표기는 **달러 하나로** 통일한다 — 2026-08-17. 그전에는 달러 아래에 원화·엔화를 병기했는데,
// 셋을 나란히 두면 한 줄에 숫자가 셋이라 정작 비교해야 할 달러 값이 묻혔다. 그리고 병기된 원화·엔화는
// 우리가 환율로 만든 파생값이지 누가 그 값에 판 게 아니다 — 시세처럼 보이면 안 된다.
// krw/jpy 는 계속 돌려준다(정렬·구간 계산 등 내부 용도). 화면에 쓰는 것은 main 뿐이다.
function triMain(value, currency) {
  const fx = (state.data && state.data.fx) || {};
  if (value == null) return { usd: null, krw: null, jpy: null, main: "-" };
  const krw = marketKrw(value, currency);
  const usd = currency === "USD" ? value : krw / (fx.usdKrw || 1388.2);
  const jpy = currency === "JPY" ? value : krw / (fx.jpyKrw || 9.1);
  return { usd, krw, jpy, main: fmtUsd(usd) };
}

function priceBandRows(market) {
  const rows = [
    ["High", market.high],
    ["Middle", market.middle],
    ["Low", market.low],
  ];

  return rows
    .map(([label, value]) => {
      const t = triMain(value, market.currency);
      return `
        <span class="bandRow">
          <i>${label}</i>
          <b>${t.main}</b>
        </span>`;
    })
    .join("");
}

// ⚠️ encodeURIComponent 는 작은따옴표를 안 바꾼다. 이 값은 onerror="...this.src='...'" 처럼
// 작은따옴표 문자열 안에 끼워지므로, 남은 ' 가 문자열을 끊어 폴백 핸들러 전체가
// SyntaxError 로 죽었다(이미지가 깨질 때만 발동해 여태 숨어 있었다 — 2026-08-28 ui-smoke 적발).
const FALLBACK =
  ("data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='80' height='110'><rect width='100%' height='100%' rx='8' fill='%231a1e28'/><text x='50%' y='52%' fill='%23566' font-size='11' text-anchor='middle' font-family='sans-serif'>이미지</text></svg>",
  )).replace(/'/g, "%27");

const DATA_URLS = [
  "data/onepiece-packs.json",
  "https://opboxindex.com/data/onepiece-packs.json",
];
const SITE_BASE = "https://opboxindex.com";
const DATA_VERSION = "20261102epn";

// 경매 중계기(Cloudflare Worker) 주소. 정적 호스팅이라 실시간 경매는 이 중계기를 통해서만 온다.
// 비어 있으면 경매 섹션은 통째로 숨는다 — 빈 상자를 띄워 레이아웃만 밀어내지 않기 위함.
// 설치는 worker/SETUP.md 참고.
const AUCTION_RELAY = "https://opbox-deals.gsa-834.workers.dev/";
const AUCTION_REFRESH_MS = 90000;   // 재요청 간격. 중계기 캐시(60초)보다 길게 — 더 자주 불러도 같은 값이다.
const AUCTION_TICK_MS = 30000;      // 목록 재정렬·종료건 제거 주기(네트워크 없음)
const AUCTION_SEC_MS = 1000;        // 카운트다운 초 갱신(텍스트만, 네트워크 없음)
const auctionFeed = { data: null, at: 0, timer: null, tick: null, bound: false };

// eBay 썸네일 — 원본은 s-l1600(대형)이라 목록엔 s-l140(소형)로 받아 대역폭 절약. 실패 시 img은 onerror로 제거.
function aucThumbUrl(u) {
  return typeof u === "string" ? u.replace(/\/s-l\d+/, "/s-l200") : u;
}

// 경매 남은시간 — endsAt 으로 매초 재계산. 1시간 이상은 "1시간 23분", 미만은 MM:SS 로 째깍.
function aucTimeLeft(endsAt) {
  const ms = Date.parse(endsAt) - Date.now();
  if (!(ms > 0)) return t("종료", "ended");
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h > 0) return t(`${h}시간 ${m}분`, `${h}h ${m}m`);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

// PSA10 실거래 표본은 드물어 NM(21일)보다 느슨한 35일을 낡음 기준으로 쓴다(audit-price-quality 와 같은 값).
const PSA10_STALE_DAYS = 35;
function psa10Stale(g) {
  if (!g || !g.updated) return true;
  const days = (Date.now() - Date.parse(g.updated)) / 864e5;
  return !(days <= PSA10_STALE_DAYS);
}

// 일본판 NM 을 써도 되는가 — tools/market-data-normalizers.js 의 nmUsable 과 같은 규칙(2026-10-15).
// 값이 있고, 그 변형을 실제로 다시 읽은 날(nmUpdated)이 있고, 가격 감사 숨김 표시(nmHiddenReason)가 없을 때만.
// 세트·카드 상세·AI 피드는 비우는 값(읽은 날 없는 5장·숨김 표시 5장)을 이 화면만 "확인일 미상"으로 보여 한 카드가 두 값이었다.
function nmUsable(c) {
  return !!c && Number.isFinite(c.nmJpy) && c.nmJpy > 0 && /^\d{4}-\d{2}-\d{2}$/.test(c.nmUpdated || "") && !c.nmHiddenReason;
}

// 검수에서 뺀 매물(중국·홍콩 판매자)의 최저가. 링크는 걸지 않는다 — 우리가 위험하다고 판단해 뺀
// 물건으로 제휴 수익을 내지 않기 위해서다. 숫자를 보이는 목적은 "우리 최저가가 시장 최저가가 아니다"를
// 숨기지 않는 것이다(2026-09-23, 스닉덩크 대비 2배 지적에서 시작).
function floorNote(market, best, tag) {
  if (!market || market.excludedLow == null || best?.total == null) return "";
  const lo = marketKrw(market.excludedLow, market.currency);
  const hi = marketKrw(best.total, best.currency);
  if (lo == null || hi == null || !(lo < hi * 0.95)) return "";   // 5% 넘게 쌀 때만
  const off = Math.round((1 - lo / hi) * 100);
  const price = triMain(market.excludedLow, market.currency).main;
  const n = market.excludedSampleSize || 0;
  // 2026-10-15 소유자 결정: 이유를 설명하던 툴팁(재봉·가품 위험 …)을 뺐다. 뜻은 아래 라벨 한 토막("… excluded from price figures")이 맡는다.
  return `<span class="floorNote">
    <em class="floorTag">${tag}</em>${t(`제외 매물 포함 최저 `, `Unverified low `)}<b>${price}</b>
    <em class="floorOff">-${off}%</em>
    <small>${t(`중국·홍콩 판매자 ${n}건 — 시세 계산에서 제외`, `${n} China/HK listings · excluded from price figures`)}</small></span>`;
}

function withVersion(url) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${DATA_VERSION}`;
}

function trackEvent(name, params = {}) {
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
}

function setJsonLd(id, data) {
  let script = document.querySelector(`#${id}`);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

// 화면 상태 파라미터(set·lang·view·hl)만 다시 쓰고, 그 밖의 파라미터(utm_*·gclid 등)는 원래 순서대로 뒤에 남긴다.
// 2026-10-14: 전부 지우던 시절에는 GA(load 뒤 지연 로딩)가 utm 이 지워진 URL 을 읽어 ChatGPT 방문이 (direct)로 잡혔다.
const ROUTE_PARAMS = ["set", "lang", "view", "hl"];
function updateUrl(replace = false) {
  if (!state.selected) return;
  const params = new URLSearchParams();
  if (state.hasExplicitSet) params.set("set", state.selected);
  if (state.lang !== "jp") params.set("lang", state.lang);
  if (state.view !== "hits") params.set("view", state.view);
  if (state.hl === "en") params.set("hl", "en");
  for (const [k, v] of new URLSearchParams(location.search)) if (!ROUTE_PARAMS.includes(k)) params.append(k, v);
  history[replace ? "replaceState" : "pushState"](
    { selected: state.selected, lang: state.lang, view: state.view, hl: state.hl },
    "",
    location.pathname + "?" + params,
  );
}

// hreflang 은 JS 로 바꾸지 않는다(2026-09-29). 정적 HTML 의 en=/ · ko=/ko/ · x-default=/ 를 그대로 둔다.
// 종전 코드는 정적 태그를 지우고 ko 를 /?hl=ko 로, ?set= 일 때는 packs.html 의 set·hl 파라미터 변형으로 다시 만들었다 —
// 7/19 커밋 1090e5da 가 정적 HTML 에서 고친 "?hl= 대상 금지"(가드 H1)를 런타임에서 되돌리고 있었다.
function upsertHreflang() {}

function ebayQueryFor(pack) {
  const parts = ["One Piece Card Game", pack.code, pack.nameEn, "Booster Box", "Japanese", "sealed"];
  return parts.filter(Boolean).join(" ");
}

function ebayLinks(pack) {
  const q = encodeURIComponent(ebayQueryFor(pack));
  const base = `https://www.ebay.com/sch/i.html?_nkw=${q}`;
  const market = pack.set?.boxMarket?.jp?.ebayActive;
  const best = market?.bestListing;
  const bestUrl = epnUrl(safeEbayUrl(best?.url), `home-detail-${String(pack.code).toLowerCase()}-jp`);
  const bestPrice = best?.total != null ? triMain(best.total, best.currency).main : "";
  // 실데이터 기반 할인 배지: 최저 매물이 중간 호가보다 3% 이상 싸면 표시(추정 금지)
  let dealChip = "";
  if (best?.total != null && market?.middle != null) {
    const b = marketKrw(best.total, best.currency);
    const mid = marketKrw(market.middle, market.currency);
    if (b != null && mid != null && b < mid * 0.97) {
      dealChip = `<em class="dealChip">-${Math.round((1 - b / mid) * 100)}% ${t("중간호가 대비", "vs mid ask")}</em>`;
    }
  }
  // 영문판 최저가 버튼 — 표본 3건 이상 + 검수된 최저매물 있을 때만 (JP와 명확히 구분 표기)
  const enMarket = pack.set?.boxMarket?.en?.ebayActive;
  const enBest = enMarket && (enMarket.sampleSize || 0) >= 3 ? enMarket.bestListing : null;
  const enBestUrl = epnUrl(safeEbayUrl(enBest?.url), `home-detail-${String(pack.code).toLowerCase()}-en`);
  const enBestPrice = enBest?.total != null ? triMain(enBest.total, enBest.currency).main : "";
  let enDealChip = "";
  if (enBest?.total != null && enMarket?.middle != null) {
    const b = marketKrw(enBest.total, enBest.currency);
    const mid = marketKrw(enMarket.middle, enMarket.currency);
    if (b != null && mid != null && b < mid * 0.97) {
      enDealChip = `<em class="dealChip">-${Math.round((1 - b / mid) * 100)}% ${t("중간호가 대비", "vs mid ask")}</em>`;
    }
  }
  return `
    <div class="marketLinks" aria-label="eBay market links">
      ${bestUrl ? `<a class="featured" href="${bestUrl}" target="_blank" rel="noopener noreferrer sponsored" title="${t(`${market?.updated || ""} 수집 · 매일 갱신`, `Captured ${market?.updated || ""} · daily refresh`)}"><em class="langTag">JP</em>${t("일본판 최저가 박스", "Lowest JP box")} · <b>${bestPrice}</b><span class="ctaArrow">↗</span>${dealChip}${market?.updated ? `<em class="asOf">${t(`${market.updated.slice(2).replace(/-/g, ".")} 기준`, `as of ${market.updated.slice(2).replace(/-/g, ".")}`)}</em>` : ""}</a>` : ""}
      ${enBestUrl ? `<a class="featured featuredEn" href="${enBestUrl}" target="_blank" rel="noopener noreferrer sponsored" title="${t(`${enMarket?.updated || ""} 수집 · 영문판 미개봉 박스`, `Captured ${enMarket?.updated || ""} · English sealed box`)}"><em class="langTag langTagEn">EN</em>${t("영문판 최저가 박스", "Lowest EN box")} · <b>${enBestPrice}</b><span class="ctaArrow">↗</span>${enDealChip}${enMarket?.updated ? `<em class="asOf">${t(`${enMarket.updated.slice(2).replace(/-/g, ".")} 기준`, `as of ${enMarket.updated.slice(2).replace(/-/g, ".")}`)}</em>` : ""}</a>` : ""}
      ${floorNote(market, best, "JP")}${floorNote(enMarket, enBest, "EN")}
      <a href="${epnUrl(`${base}&LH_Sold=1&LH_Complete=1&_sop=13`, `home-srch-sold-${String(pack.code).toLowerCase()}`)}" target="_blank" rel="noopener noreferrer sponsored">JP Sold</a>
      <a href="${epnUrl(`${base}&LH_BIN=1&_sop=15`, `home-srch-active-${String(pack.code).toLowerCase()}`)}" target="_blank" rel="noopener noreferrer sponsored">JP Active</a>
      <span class="paidLinkTag">Paid Link</span>
    </div>`;
}

function cardPsaSearchUrl(card) {
  const query = ["One Piece Card Game", card.number, card.name, "PSA 10", "Japanese"].filter(Boolean).join(" ");
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_BIN=1&_sop=15`;
}

function cardBuyLinks(card) {
  const best = card.psa10Active?.bestListing;
  const cardSpot = String(card.number || "x").toLowerCase();
  const bestUrl = epnUrl(safeEbayUrl(best?.url), `home-card-${cardSpot}`);
  const searchUrl = epnUrl(cardPsaSearchUrl(card), `home-card-srch-${cardSpot}`);
  if (bestUrl) {
    const price = best.total != null ? triMain(best.total, best.currency).main : "";
    const country = best.country ? ` · ${escapeHtml(best.country)}` : "";
    // 실데이터 기반 배지: 최저 매물이 최근 실거래(Sold) 중간값보다 낮을 때만 표시
    let dealChip = "";
    if (best.total != null && card.psa10Ebay?.soldBased && card.psa10Ebay.middle != null && (card.psa10Ebay.sampleSize || 0) >= 3) {
      const b = marketKrw(best.total, best.currency);
      const sold = marketKrw(card.psa10Ebay.middle, card.psa10Ebay.currency);
      if (b != null && sold != null && b < sold) {
        dealChip = `<em class="dealChip">${t("최근 실거래가 아래", "below recent sold")}</em>`;
      }
    }
    // 가격 분해: 상품가 + 배송비 → "$1,897"이 왜 그 금액인지 투명하게(오해 방지)
    let breakdown = t("검수 완료 · 배송 포함", "verified · incl. shipping");
    if (best.price != null && Number(best.shipping) > 0) {
      const item = triMain(best.price, best.currency).main;
      const ship = triMain(best.shipping, best.currency).main;
      breakdown = t(`검수 완료 · 상품 ${item} + 미국배송 ${ship}`, `verified · item ${item} + US ship ${ship}`);
    } else if (best.price != null) {
      breakdown = t("검수 완료 · 무료배송", "verified · free shipping");
    }
    return `<div class="buyLinks"><a class="buyLink verified" href="${bestUrl}" target="_blank" rel="noopener noreferrer sponsored">${t("PSA10 최저가 구매", "Buy lowest PSA 10")} · <b>${price}</b><span class="ctaArrow">↗</span>${dealChip}</a><small>Paid Link · ${breakdown}${country}${card.psa10Active?.updated ? ` · ${t(`${card.psa10Active.updated.slice(2).replace(/-/g, ".")} 기준`, `as of ${card.psa10Active.updated.slice(2).replace(/-/g, ".")}`)}` : ""}</small></div>`;
  }
  return `<div class="buyLinks"><a class="buyLink" href="${searchUrl}" target="_blank" rel="noopener noreferrer sponsored">${t("PSA10 매물 찾기", "Find PSA 10 listings")}<span class="ctaArrow">↗</span></a><small>Paid Link · ${t("검수 매물 수집 대기", "Verified listing pending")}</small></div>`;
}


function boxMidKrw(set) {
  const active = set.boxMarket?.jp?.ebayActive;
  const activeMid = active?.middle != null ? marketKrw(active.middle, active.currency) : null;
  if (activeMid != null) {
    return {
      value: activeMid,
      source: "eBay Active",
      sampleSize: active.sampleSize || 0,
      soldBased: false,
      updated: active.updated || "",
    };
  }

  const points = set.boxSeries?.points || [];
  const last = points[points.length - 1];
  if (last?.p != null) {
    return {
      value: last.p,
      source: "eBay Sold",
      sampleSize: last.n || 0,
      soldBased: true,
      updated: last.d || "",
    };
  }

  return null;
}

// 2026-10-15: 밸류 구간·투자 매력도·분석 요약 패널(renderSetAnalytics 와 그 계산 함수들)을 지웠다. 어디서도 부르지 않는
// 죽은 경로였고, 내용이 "저평가/고평가"·"수요 강세" 같은 해석 문장이라 소유자 결정(숫자·표·라벨만)과도 맞지 않는다.

// 2026-07-22 결정: 기존 박스 트렌드 차트(주간 시장시리즈 + eBay 매물호가 병합)는 소스 전환 지점에
// 가짜 급등이 생겨 신뢰할 수 없다. 사용자 방침 — "우리 자체 eBay 실거래(sold)만 단일 기준으로 쌓아 보여준다".
// 2026-08-13: 그 sold 시계열이 21세트 × 10점까지 쌓여 실제 그래프로 교체했다.
// 그림은 box-chart.js 한 곳에서만 그린다 — 홈과 정적 세트 페이지가 같은 함수를 쓴다.
//
// 시계열(45KB)은 팩 데이터와 별도 파일이라 **처음 화면에는 안 받는다**. 세트 상세를 열 때
// 그때 한 번만 받아 캐시하고, 도착하면 이미 그려진 자리(.opbcMount)에 끼워 넣는다.
const SOLD_SERIES_URLS = ["data/box-sold-series.json", "https://opboxindex.com/data/box-sold-series.json"];
let soldSeries = null;
let soldSeriesPromise = null;

function loadSoldSeries() {
  if (soldSeries) return Promise.resolve(soldSeries);
  if (soldSeriesPromise) return soldSeriesPromise;
  soldSeriesPromise = (async () => {
    for (const url of SOLD_SERIES_URLS) {
      try {
        const res = await fetch(withVersion(url), { cache: "default" });
        if (!res.ok) continue;
        soldSeries = await res.json();
        return soldSeries;
      } catch { /* 다음 주소로 */ }
    }
    // 못 받아도 화면은 멀쩡해야 한다 — 빈 자리는 그대로 비워 두고 넘어간다.
    soldSeries = { sets: {} };
    return soldSeries;
  })();
  return soldSeriesPromise;
}

function boxChartFor(code) {
  const lib = typeof window !== "undefined" ? window.OPBoxChart : null;
  if (!lib || !soldSeries || !code) return "";
  const series = (soldSeries.sets || {})[code];
  if (!lib.hasChart(series)) return "";
  // ⚠️ 화면 언어는 state.hl 이다. state.lang 은 세트 그룹("jp" | "extra")이라 언어와 무관하다.
  // 예전엔 state.lang 을 보고 판정해서 영문 사용자에게도 차트만 한국어로 나갔다(2026-08-13 수정).
  return lib.chartHTML(series, { lang: state.hl === "en" ? "en" : "ko" });
}

function renderBoxSeries(set, code) {
  const html = boxChartFor(code);
  if (html) return html;
  // 아직 시계열을 안 받았으면 빈 자리만 남긴다. 받은 뒤에도 그릴 게 없으면 이 자리는 계속 비어 있다
  // (0 높이라 레이아웃을 밀지 않는다). 예전처럼 "준비 중" 안내문을 띄워 칸을 잡아먹지 않는다.
  if (!soldSeries && code) loadSoldSeries().then(() => { fillBoxMounts(); fillPackSparks(); });
  return code ? `<div class="opbcMount" data-code="${code}"></div>` : "";
}

// 시계열이 도착한 뒤 빈 자리를 채운다. 이미 채워진 자리는 건드리지 않는다.
function fillBoxMounts() {
  document.querySelectorAll(".opbcMount[data-code]").forEach((mount) => {
    if (mount.dataset.filled) return;
    const html = boxChartFor(mount.dataset.code);
    if (!html) return;
    mount.innerHTML = html;
    mount.dataset.filled = "1";
  });
  if (typeof window.OPBoxChartScrub === "function") window.OPBoxChartScrub();
}

async function fetchPackData() {
  let lastError;

  // 페이지 <head> 의 인라인 스크립트가 이미 요청을 걸어놨으면 그걸 쓴다.
  // 이 스크립트는 defer 라 HTML 파싱이 끝나야 실행되는데, 그때 데이터를 요청하면
  // 스크립트 다운로드 시간만큼 표가 늦게 뜬다(로컬 실측 222ms 에 시작). head 에서 미리 걸면
  // 스크립트 받는 동안 같이 내려온다. rel=preload 대신 인라인 fetch 를 쓰는 이유는
  // preload 는 요청 조건이 조금만 달라도 재사용되지 않고 같은 파일을 두 번 받기 때문이다(실측).
  // 실패하면 아래 기존 경로가 그대로 다시 시도하므로 이 최적화가 깨져도 화면은 멀쩡하다.
  if (typeof window !== "undefined" && window.__opPackData) {
    try {
      const early = await window.__opPackData;
      if (early) return early;
    } catch { /* 아래 기본 경로로 넘어간다 */ }
  }

  for (const url of DATA_URLS) {
    try {
      const res = await fetch(withVersion(url), { cache: "default" });
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

// returns normalized pack list for current language:
// [{key, code, nameKo, nameEn, set}]  (set = the underlying sets[baseCode] record)
function currentPacks() {
  const d = state.data;
  const list = state.lang === "extra" ? d.extra.list : d.jp.list;
  return list.map((code) => {
    const set = d.sets[code] || {};
    return { key: code, code, nameKo: set.nameKo || code, nameEn: set.nameEn || "", set };
  });
}

function selectFirstOfLang() {
  const packs = currentPacks();
  const ready = packs.find((p) => (p.set.cards || []).length > 0);
  state.selected = (ready || packs[0]).key;
}

function bindLangTabs() {
  document.querySelectorAll(".langTab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
    btn.onclick = () => {
      if (state.lang === btn.dataset.lang) return;
      state.lang = btn.dataset.lang;
      state.hasExplicitSet = true;
      document.querySelectorAll(".langTab").forEach((b) => b.classList.toggle("active", b === btn));
      selectFirstOfLang();
      renderPackGrid();
      renderDetail();
      updateUrl();
      trackEvent("select_language", { language: state.lang });
    };
  });
}

function renderHitList(cards) {
  const cells = cards
    .map((c, index) => {
      const color = rarityColor[c.rarity] || "#8d95a7";
      // 그리드·확대 모두 자체호스팅 일본판 webp(c.image, 장당 ~95KB)를 쓴다.
      // 예전엔 확대에 고해상 원본(imageJpSrc = onepiece-cardgame.com)을 먼저 썼는데 그 도메인이
      // 외부 호출을 막아 **확대창 이미지가 늘 깨져 있었다**(2026-08-03 실측: naturalWidth 0).
      // 영문 원본(imageEn)은 그림이 다른 판이라 일본판 썸네일을 눌렀을 때 뜨면 오해를 부른다 — 폴백으로만 둔다.
      const img = c.image || c.img || FALLBACK;
      const zoomImg = c.image || c.imageEn || c.img || FALLBACK;
      const zoomFallback = c.imageEn || c.img || "";
      return `
        <figure class="hitCard" data-card-index="${index}" data-img="${zoomImg}" data-img-fallback="${zoomFallback}" data-name="${(c.name || "").replace(/"/g, "&quot;")}">
          <button type="button" class="hitThumb" aria-label="${escapeHtml(t(`${c.name} 크게 보기 및 등급 통계`, `Enlarge ${c.name} and view grades`))}" aria-haspopup="dialog">
            <span class="hitRank">${c.rank}</span>
            ${c.rarity ? `<span class="hitRar" style="--c:${color}">${c.rarity}</span>` : ""}
            <img src="${img}" alt="${c.name}" loading="lazy" decoding="async" onerror="this.src='${FALLBACK}'" />
          </button>
          <figcaption>
            <span class="hitName">${cardPageHref(c) ? `<a href="${cardPageHref(c)}" title="${t("카드 페이지", "Card page")}">${c.name}</a>` : c.name}</span>
            <span class="hitNo">${c.number || ""}</span>
            ${priceLines(c)}
            ${cardBuyLinks(c)}
          </figcaption>
        </figure>`;
    })
    .join("");
  return `<div class="hitGallery">${cells}</div>`;
}


window.addEventListener("popstate", () => {
  applyRouteState();
  bindLangTabs();
  applyStaticI18n();
  renderPackGrid();
  renderDetail();
});

// Clean display layer override. The dataset is preserved; only UI text/SEO/render labels are normalized.
function applyStaticI18n() {
  document.documentElement.lang = state.hl === "en" ? "en" : "ko";
  document.body?.classList.toggle("hl-en", state.hl === "en");
  setText(".brand small", "부스터박스 리서치", "Booster box research");
  // 메뉴 라벨은 tools/site-nav.js 한 곳에서 정의하고 data-ko 로 전환한다(아래 공통 루프).
  // 여기서 또 박아 두면 site-nav 를 고쳐도 홈만 옛 라벨로 남는다 — 2026-09-16 에 "Amazon Raffle" 로 실제로 어긋났다.
  // 아마존 응모 페이지로 현재 표시 언어 전달
  const amazonLink = document.querySelector('.topbar .nav a[href^="amazon-lottery.html"]');
  if (amazonLink) amazonLink.href = state.hl === "ko" ? "amazon-lottery.html?hl=ko" : "amazon-lottery.html";
  // 홈 제목(2026-09-30 소유자 확정): 박스 시세 + TCG 이베이 경매 데이터. 한국어 화면에서도 제목이 영어로 남지 않게.
  setHtml(".packHero h1", '원피스 박스 시세 <span>· TCG 이베이 경매 데이터</span>', 'One Piece Booster Box Prices <span>&amp; TCG eBay Auction Data</span>');
  // 2026-10-15 소유자 결정: 사이트 소개(.lead)·사이트 안내(.introPanel)를 HTML 에서 지웠다 — 여기서 다시 그리지 않는다.
  const jpTab = document.querySelector('.langTab[data-lang="jp"]');
  if (jpTab) jpTab.innerHTML = `${t("일본판 / 영문판 박스", "JP / EN BOX")} <small id="statJp"></small>`;
  const extraTab = document.querySelector('.langTab[data-lang="extra"]');
  if (extraTab) extraTab.innerHTML = `${t("EB·PRB", "EB / PRB")} <small id="statExtra"></small>`;
  setText(".footer p", "OP Box Index는 투자 권유가 아닌 데이터 기반 리서치 사이트입니다.", "OP Box Index is a data-driven research site, not investment advice.");
  setText(
    ".footer .affDisclosure",
    "Paid Link: eBay 링크를 통한 적격 구매가 발생하면 OP Box Index가 수수료를 받을 수 있습니다. 구매 비용은 추가되지 않습니다.",
    "Paid Link: As an eBay Partner, OP Box Index may earn a commission from qualifying purchases made through eBay links, at no extra cost to you.",
  );
  // 메뉴(data-ko)는 lang-toggle.js 가 번역하는데, 이 페이지들은 packs.js 가 토글을 맡아 그 스크립트가 버튼을 안 만든다.
  // 그래서 본문은 한글인데 메뉴만 영문으로 남았다(2026-09-16 실측). 같은 규칙으로 여기서 바꾼다.
  document.querySelectorAll("[data-ko]").forEach((el) => {
    if (el.dataset.en == null) el.dataset.en = el.textContent;
    el.textContent = state.hl === "ko" ? el.dataset.ko : el.dataset.en;
  });
  // 링크·굵은 글씨가 든 문단(제휴 고지·홈 요약·세트 가이드 목록)은 innerHTML 로 — lang-toggle.js 와 같은 규칙(2026-10-13 QA).
  document.querySelectorAll("[data-ko-html]").forEach((el) => {
    if (el.dataset.enHtml == null) el.dataset.enHtml = el.innerHTML;
    el.innerHTML = state.hl === "ko" ? el.dataset.koHtml : el.dataset.enHtml;
  });
  document.documentElement.lang = state.hl;
  // 라벨은 다른 페이지(lang-toggle.js)와 같다 — 홈만 "EN" 이었다(2026-10-13 QA).
  const btn = document.querySelector("#displayLangToggle");
  if (btn) btn.textContent = state.hl === "en" ? "한국어" : "English";
}

function bindDisplayLanguage() {
  // 이 페이지의 언어 전환은 packs.js 가 맡는다는 표시 — lang-toggle.js 가 보고 버튼을 만들지 않는다.
  // 두 개가 붙으면 어느 것을 눌러야 할지 알 수 없다(2026-09-01 에 실제로 그렇게 됐다).
  window.__opboxPacksLang = true;
  // 버튼은 스크롤되는 .nav 안이 아니라 .topbar 직속(.langBtn) — 메뉴 끝에 붙이면 모바일에서 밀려 안 보인다(2026-09-16).
  const bar = document.querySelector(".topbar") || document.querySelector(".topbar .nav");
  if (!bar) return;
  let btn = document.querySelector("#displayLangToggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "displayLangToggle";
    btn.type = "button";
    btn.className = "navKo langBtn";
    bar.appendChild(btn);
  }
  btn.onclick = () => {
    state.hl = state.hl === "en" ? "ko" : "en";
    try { localStorage.setItem("ktcg_hl", state.hl); localStorage.setItem("opbox_lang", state.hl); } catch (e) {}
    state.renderedLang = null;
    applyStaticI18n();
    // 첫 화면 위쪽(시장 상태·4주 등락·오늘의 딜·보호용품·세트 찾기)도 다시 그린다 — 2026-10-13 QA: 처음 그린 언어로 남아
    // 한국어로 바꿔도 영어였다. 같은 데이터·같은 함수라 값은 그대로고 글자만 바뀐다.
    if (state.data) { renderQuickSet(); renderMarketStatus(); renderTickerBoard(); renderTodayDeals(); }
    renderPackGrid();
    renderDetail();
    updateUrl(true);
    trackEvent("select_hl", { hl: state.hl });
  };
  applyStaticI18n();
}

function priceLines(c) {
  let h = "";
  // 일본 NM 리서치 전 세트(예: OP-16 신작)는 영문 TCG 시장 USD 시세를 폴백 표시.
  // 2026-10-15: 외부 시세 업체명을 화면에 쓰지 않는다(가드 S4 와 같은 원칙) — 라벨은 중립 "TCG", NM 출처는 "일본 소매"(세트 페이지 NM 정의와 같은 말).
  // 숨김 표시(nmHiddenReason — 변형 매칭 불확실) 카드의 TCG 값은 싣지 않는다 — 세트 Top 10 NM 칸(market-data-normalizers.rawPrice)과 같은 규칙(2026-10-15, 4차).
  if (c.nmJpy == null && c.priceUsd != null && !c.nmHiddenReason) {
    const p = triMain(c.priceUsd, "USD");
    // priceUsd 는 일회성 캡처라 관측일 필드가 없다(2026-08-26 확인 — 마지막 갱신 7월 말).
    // 날짜 없이 두면 매일 갱신되는 다른 줄들 틈에서 오늘 값처럼 읽힌다 — 스냅샷임을 밝힌다.
    return `<div class="priceLines"><span class="pl nm"><i>${t("TCG 시세", "TCG market")}</i> <b>${p.main}</b> <small class="plStale">${t("스냅샷 · 일일 갱신 아님", "snapshot · not refreshed daily")}</small></span></div>`;
  }
  if (nmUsable(c)) {
    const p = triMain(c.nmJpy, "JPY");
    // 관측일을 값 옆에 붙인다 — PSA10 줄과 같은 형식. 날짜 없이 보여주면 언제 값인지 알 수 없다.
    // 2026-08-25 실측: 175장 중 80장이 오래된 값이었고 최대 -53% 차이였는데 화면엔 아무 표시가 없었다.
    // 갱신일이 없는 카드는 "확인일 미상"으로 보이던 것을 2026-10-15 부터 싣지 않는다(nmUsable — 세트·카드 상세·AI 피드와 같은 규칙).
    const nmD = c.nmUpdated.slice(2).replace(/-/g, ".");
    const nmStale = (Date.now() - Date.parse(c.nmUpdated)) > 21 * 864e5;
    h += `<span class="pl nm"><i>${t("일본판 NM", "Japanese NM")}</i> <b>${p.main}</b> <small${nmStale ? ' class="plStale"' : ""}>${nmD} <em>${t("일본 소매", "JP retail")}</em></small></span>`;
  }
  if (c.psa10Usd != null) {
    const p = triMain(c.psa10Usd, "USD");
    const d = c.psa10Date ? c.psa10Date.slice(2).replace(/-/g, ".") : "";
    h += `<span class="pl psa"><i>${t("일본어판 PSA10", "Japanese PSA 10")}</i> <b>${p.main}</b> <small>${d ? d + " " : ""}<em>${c.psa10Venue || "PSA/eBay"}</em></small></span>`;
  } else if ((c.psa10Ebay?.sampleSize || 0) >= 3) {
    // 관측일을 반드시 같이 보인다 — 2026-09-22 실측: 18장이 75~85일 묵은 값이었는데 화면엔 표시가 없었다(NM 은 이미 고쳐둔 문제).
    const p10D = c.psa10Ebay.updated ? c.psa10Ebay.updated.slice(2).replace(/-/g, ".") : "";
    const p10Stale = psa10Stale(c.psa10Ebay);
    h += `<span class="pl psaEbay"><i>${t("일본어판 PSA10 eBay", "Japanese PSA 10 eBay")}</i><span class="bandRows">${priceBandRows(c.psa10Ebay)}</span><small${p10Stale ? ' class="plStale"' : ""}>eBay Sold · ${t(`표본 ${c.psa10Ebay.sampleSize}건`, `${c.psa10Ebay.sampleSize} samples`)}${p10D ? ` · ${p10D}` : ""}</small></span>`;
  } else {
    h += `<span class="pl psaNone"><i>${t("일본어판 PSA10", "Japanese PSA 10")}</i> <small>${t("Sold 표본 없음", "No sold sample")}</small></span>`;
  }
  // PSA10 프리미엄: 같은 카드 PSA10 실거래(Sold) ÷ NM 시세. 실측 나눗셈만 — 표본 3건 미만·비정상 배율은 숨김(정확도 원칙).
  // 낡은 PSA10(35일 초과)을 최신 NM 으로 나누면 배율이 거짓이 된다 — 2026-09-22 실측: DON Nami Gold 가 ×0.9 로
  // "감정품이 생카드보다 싸다"처럼 보였는데, PSA10 은 6월 값이고 NM 만 9월 값이었다. 그런 건 아예 안 보인다.
  if (nmUsable(c) && c.psa10Ebay?.soldBased && c.psa10Ebay.middle != null && (c.psa10Ebay.sampleSize || 0) >= 3 && !psa10Stale(c.psa10Ebay)) {
    const nmK = marketKrw(c.nmJpy, "JPY");
    const p10K = marketKrw(c.psa10Ebay.middle, c.psa10Ebay.currency || "KRW");
    if (nmK > 0 && p10K > 0) {
      const prem = p10K / nmK;
      if (prem >= 0.8 && prem <= 30) {
        h += `<span class="pl premium"><i>${t("PSA10 프리미엄", "PSA 10 premium")}</i> <b>×${prem.toFixed(1)}</b> <small>${t(`NM 대비 · Sold ${c.psa10Ebay.sampleSize}건 기준`, `vs NM raw · ${c.psa10Ebay.sampleSize} solds`)}</small></span>`;
      }
    }
  }
  if (c.englishNmEbay?.sampleSize > 0) {
    h += `<span class="pl psaEbay"><i>${t("영문판 NM eBay", "English NM eBay")}</i><span class="bandRows">${priceBandRows(c.englishNmEbay)}</span><small>eBay Active · ${t(`표본 ${c.englishNmEbay.sampleSize}건`, `${c.englishNmEbay.sampleSize} samples`)}</small></span>`;
  }
  return h ? `<div class="priceLines">${h}</div>` : "";
}


const PSA_RAR_SHORT = { "Treasure Rare": "TR", "Secret Rare": "SEC", "Super Rare": "SR", "Alternate Art": "AA", "Manga Alternate Art": "MAA", "Red Manga Alternate Art": "RMA", "Special Alternate Art": "SP", "Wanted Alternate Art": "WAA", "Parallel": "PLL", "Rare": "R", "Leader": "L" };
function psaRarShort(r) { return PSA_RAR_SHORT[r] || String(r || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 4).toUpperCase(); }

// PSA 등급·개봉 패널 — 우리가 수집한 PSA 인구조사(psa/psaGem/psaTotal) 기반. 캡처(TCG Quant)와 유사 레이아웃이지만 숫자는 우리 데이터.
// 주간 PSA 등급 증가 막대차트 (TCG Quant 스타일: y축 눈금선 + hover 툴팁, 청록 그라데이션)
// 판(일본판/영문판)별 누적 등급 + 최근 주간 증감. 세트에 따라 영문판이 일본판의 2배인
// 경우도 있어 한쪽만 보면 시장의 절반을 못 본다. 합산은 하지 않는다 — 젬률이 뜻을 잃는다.
// 영문판 PSA 수치를 못 구한 세트는 행을 만들되 비운다. "미발매"라고 쓰지 말 것 —
// 2026-07-27 실사고: OP-14·OP-15 를 미발매로 표기했으나 CGC·TAG 에는 영문판 기록이 있었다.
function renderEditionTable(set) {
  const jp = set.psaFull, en = set.psaFullEn;
  if (!jp) return "";
  const w = set.psaWow;
  // 12주 궤적(inject-psa-wow.js 의 wowSpark). 세트마다 절대량이 수십~수천으로 갈리므로
  // 각자의 최대값에 맞춰 그린다 — 선은 방향만 말하고, 크기 비교는 옆의 숫자로 한다.
  const spark = (v, cls) => {
    if (!Array.isArray(v) || v.length < 4) return "";
    const W = 58, H = 15, max = Math.max(...v, 1), step = W / (v.length - 1);
    const d = v.map((x, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(H - 1 - (x / max) * (H - 2)).toFixed(1)}`).join(" ");
    return `<svg class="edSpark ${cls}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}"/></svg>`;
  };
  const wk = (d, cls) => (d && d.wowAdd != null
    ? `<td class="edNum edAdd">+${num(d.wowAdd)}${spark(d.wowSpark, cls)}</td><td class="edGem">${d.wowPct >= 0 ? "+" : ""}${d.wowPct}%</td>`
    : `<td class="edNum">&mdash;</td><td class="edGem">&mdash;</td>`);
  const row = (label, d, note, cls) => `<tr><td class="edName">${label}</td><td class="edNum">${d ? num(d.total) : "&mdash;"}</td><td class="edNum">${d ? num(d.gems != null ? d.gems : d.gem10) : "&mdash;"}</td><td class="edGem">${d ? d.gemRate + "%" : `<span class="edNone">${note}</span>`}</td>${wk(d, cls)}</tr>`;
  return `<div class="edWrap" role="region" tabindex="0" aria-label="${t("판본별 그레이딩 비교", "Grading by edition")}"><table class="edTable"><thead><tr><th class="gHead gPsa">${t("PSA 그레이딩", "PSA grading")}</th><th>${t("누적 등급", "Total graded")}</th><th>PSA 10</th><th>${t("젬률", "Gem rate")}</th><th>${t("주간", "This week")}</th><th>%</th></tr></thead><tbody>
    ${row(t("일본판", "Japanese"), jp, "", "edJp")}
    ${row(t("영문판", "English"), en, t("집계중", "collecting"), "edEn")}
  </tbody></table>${w ? `<p class="edFoot">${t(`주간 = ${w.from} 대비 ${w.to} 증가분`, `This week = change from ${w.from} to ${w.to}`)}</p>` : ""}${renderGraderTable(set)}</div>`;
}

// 등급사별로 따로 소개한다 — CGC 와 TAG 를 "타 등급사"로 묶으면 각 등급사의 등급 체계가
// 뭉개진다. CGC 는 만점을 Pristine 10 / Gem Mint 10 둘로 나누고, TAG 는 10 / 10P 로 나눈다.
// 등급사마다 공개 수준과 관측일이 달라 있는 것만, 그 날짜 그대로 적는다.
function renderGraderTable(set) {
  const g = set.graders;
  if (!g) return "";
  const META = {
    cgc: {
      cls: "gCgc",
      name: t("CGC 그레이딩", "CGC grading"),
      cols: [
        { h: t("누적 등급", "Total graded"), get: (e) => num(e.total) },
        { h: t("젬 민트 10", "Gem Mint 10"), get: (e) => (e.gemMint10 != null ? num(e.gemMint10) : "&mdash;") },
        { h: t("프리스틴 10", "Pristine 10"), get: (e) => (e.pristine10 != null ? num(e.pristine10) : "&mdash;") },
      ],
      // 열 제목이 이미 "젬 민트 10 / 프리스틴 10"이라고 말한다. 각주는 순서 라벨 한 토막만(2026-10-15 — 설명 문장 삭제).
      note: t("프리스틴 10 > 젬 민트 10", "Pristine 10 > Gem Mint 10"),
    },
    tag: {
      cls: "gTag",
      name: t("TAG 그레이딩", "TAG grading"),
      cols: [
        { h: t("누적 등급", "Total graded"), get: (e) => num(e.total) },
        { h: "10", get: (e) => (e.g10 != null ? num(e.g10) : "&mdash;") },
        { h: "10P", get: (e) => (e.g10p != null ? num(e.g10p) : "&mdash;") },
      ],
      // "전체 TAG 등급의 3% 남짓"은 데이터에서 계산하지 않은 손글씨 숫자라 뺐다(2026-10-15).
      note: "10P > 10",
    },
  };
  const block = (key) => {
    const v = g[key], m = META[key];
    if (!v || !m) return "";
    // 값이 하나도 없는 판은 대시를 늘어놓는 대신 "집계중" 한 칸으로. 대시는 0 으로 읽히기 쉽다.
    const row = (label, e) => (e
      ? `<tr><td class="edName">${label}</td>${m.cols.map((c) => `<td class="grNum">${c.get(e)}</td>`).join("")}<td class="grNum">${e.add != null ? `<span class="grAdd">+${num(e.add)}</span>` : "&mdash;"}</td></tr>`
      : `<tr><td class="edName">${label}</td><td class="grNum" colspan="${m.cols.length + 1}"><span class="edNone">${t("집계중", "collecting")}</span></td></tr>`);
    // 증감 구간은 판별로 다르다(등급사가 판마다 다른 날 갱신된다). 두 판이 같은 구간이면 한 줄로,
    // 다르면 각각 적는다 — 예전엔 한쪽 날짜가 다른 쪽 라벨까지 덮어써서 5일치 증가를 하루치로 표기했다.
    const wins = [["jp", t("일본판", "Japanese")], ["en", t("영문판", "English")]]
      .map(([k, label]) => (v[k] && v[k].from && v[k].to ? { label, span: `${v[k].from} → ${v[k].to}` } : null))
      .filter(Boolean);
    const uniq = [...new Set(wins.map((w) => w.span))];
    const win = !wins.length ? ""
      : uniq.length === 1 && wins.length > 1
        ? t(`증감 = ${uniq[0]}`, `Change = ${uniq[0]}`)
        : t(`증감 = ${wins.map((w) => `${w.label} ${w.span}`).join(" · ")}`, `Change = ${wins.map((w) => `${w.label} ${w.span}`).join(" · ")}`);
    // Perfect 10 은 초기 4개 세트에만 있고 이후로는 한 장도 없다. 열을 만들면 대부분 빈 칸이 되므로
    // 있는 세트에서만 각주로 덧붙인다. "중단됐다"고 단정하지 않는다 — 우리 데이터가 그렇다는 것뿐.
    const perfect = key === "cgc"
      ? [["jp", v.jp], ["en", v.en]].filter(([, e]) => e && e.perfect10 > 0)
        .map(([ed, e]) => `${ed === "jp" ? t("일본판", "JP") : t("영문판", "EN")} ${num(e.perfect10)}`)
      : [];
    // CGC 가 두 상품을 한 항목으로 세는 판(영문판 OP-14·OP-15 = EB-04 동봉 발매)은 그 사실을 밝힌다.
    // 숫자를 고치는 게 아니라, 무엇을 세었는지 정확히 말하는 것이다. 2026-10-15: 문장 대신 숫자에 붙는 라벨 한 토막으로.
    const combined = [["jp", v.jp], ["en", v.en]]
      .filter(([, e]) => e && e.combinedWith)
      .map(([ed, e]) => (ed === "jp"
        ? t(`일본판 = ${e.combinedWith} 포함`, `JP figure incl. ${e.combinedWith}`)
        : t(`영문판 = ${e.combinedWith} 포함(CGC 한 항목)`, `EN figure incl. ${e.combinedWith} (one CGC entry)`)));
    return `<div class="grWrap"><table class="grTable"><thead><tr><th class="gHead ${m.cls}">${m.name}</th>${m.cols.map((c) => `<th>${c.h}</th>`).join("")}<th>${t("증감", "Change")}</th></tr></thead><tbody>
      ${row(t("일본판", "Japanese"), v.jp)}
      ${row(t("영문판", "English"), v.en)}
    </tbody></table><p class="edFoot">${m.note}${combined.length ? ` · ${combined.join(" · ")}` : ""}${perfect.length ? ` · ${t("퍼펙트 10", "Perfect 10")} ${perfect.join(" · ")}` : ""}${win ? ` · ${win}` : ""}</p></div>`;
  };
  return ["cgc", "tag"].map(block).join("");
}

// 2026-10-15 소유자 결정: 숫자 표를 되풀이하던 문장("Across the full set, N cards …")과 해석 각주("Grade counts measure submission
// activity, not boxes opened …")를 뺐다. ⚠️ 그 대신 "등급이 늘면 박스가 개봉된 것"이라는 뜻의 라벨도 쓰지 않는다 — 머리말을
// "Grading & Destruction"(개봉 현황)에서 "PSA population"(등급 인구)으로 바꾼 이유다(2026-08-12 원칙 그대로). 표의 판은 "카드 JP" 머리가 말한다.
function renderPsaDestruction(set) {
  const rows = set.psa || [];
  if (!rows.length && set.psaTotal == null && !set.psaFull) return "";
  const gem = set.psaGem, total = set.psaTotal, full = set.psaFull, updated = (set.psaFull && set.psaFull.updated) || set.psaUpdated || "";
  const fullGems = full ? (full.gems != null ? full.gems : full.gem10) : null;
  const body = rows.map((r) => `<tr><td class="pdName">${r.name} <em>#${r.number}</em></td><td><span class="pdRar">${psaRarShort(r.rarity)}</span></td><td class="pdNum">${num(r.psa10)}</td><td class="pdNum pdMut">${num(r.psa9)}</td><td class="pdNum">${num(r.total)}</td><td class="pdGem">${r.gem}%</td></tr>`).join("");
  return `<div class="boxChart psaDest"><div class="bcHead"><span class="bmLabel">${t("PSA 등급 인구", "PSA population")}</span><small class="pdSrc">${t("PSA 인구조사 · 세트 전체", "Population via PSA · full set")}${updated ? ` · ${updated}` : ""}</small></div>
    <div class="pdStats"><div class="pdStat"><span>${t("누적 등급 수", "Total Grades")}</span><b>${full ? num(full.total) : (total != null ? num(total) : "-")}</b><small style="display:block;color:#7d8698;font-size:11.5px;margin-top:2px;">${t("세트 전체", "full set")}</small></div><div class="pdStat"><span>${t("전체 PSA 10", "PSA 10 Total")}</span><b class="pdGemBig">${fullGems != null ? num(fullGems) : "-"}</b><small style="display:block;color:#7d8698;font-size:11.5px;margin-top:2px;">${t("세트 전체 젬민트 수", "full-set gem count")}</small></div><div class="pdStat"><span>${t("세트 젬률", "Full-set Gem Rate")}</span><b class="pdGemBig">${full ? full.gemRate + "%" : (gem != null ? gem + "%" : "-")}</b><small style="display:block;color:#7d8698;font-size:11.5px;margin-top:2px;">${t("PSA 10 비율", "PSA 10 share")}${full && full.opAvg != null ? ` · ${t("추적 세트 평균", "tracked-set avg")} ${full.opAvg}%${full.opDiff != null ? ` <em style="font-style:normal;color:${full.opDiff < 0 ? "#ff7a7a" : "#55d8ea"};">${full.opDiff > 0 ? "+" : ""}${full.opDiff}%</em>` : ""}` : ""}</small></div></div>
    ${renderEditionTable(set)}
    ${rows.length ? `<div class="pdTableWrap" role="region" tabindex="0" aria-label="${t("카드별 PSA 등급 수", "PSA population by card")}"><table class="pdTable"><thead><tr><th>${t("카드", "Card")} <em class="pdEd">${t("일본판", "JP")}</em></th><th>${t("등급", "Rarity")}</th><th>PSA10</th><th>PSA9</th><th>${t("총", "Total")}</th><th>Gem</th></tr></thead><tbody>${body}</tbody></table></div>` : ""}
    </div>`;
}

function renderBoxMarket(set) {
  const market = set.boxMarket?.jp?.ebayActive;
  if (!market) return `<div class="boxMarket"><div class="bmHead"><span class="bmLabel">${t("일본판 박스 eBay", "Japanese box · eBay")}</span><strong>${t("가격 수집 대기", "Collecting price")}</strong></div></div>`;
  // 영문판 박스 밴드 — 표본 3건 이상일 때만 표시(정확도 원칙). 일판 대비 배율은 동일 기준(Active mid) 실측 나눗셈.
  const en = set.boxMarket?.en?.ebayActive;
  const enOk = en && en.middle != null && (en.sampleSize || 0) >= 3;
  let enBlock = "";
  if (enOk) {
    const jpMid = marketKrw(market.middle, market.currency);
    const enMid = marketKrw(en.middle, en.currency);
    const ratio = jpMid && enMid ? enMid / jpMid : null;
    enBlock = `<div class="bmHead bmEnHead"><span class="bmLabel">${t("영문판 박스 eBay Active", "English box · eBay Active")}</span><small>${en.updated || ""} · ${t(`표본 ${en.sampleSize}건`, `${en.sampleSize} samples`)}${ratio ? ` · <em class="bmRatio">${t(`일본판의 ×${ratio.toFixed(1)}`, `×${ratio.toFixed(1)} vs Japanese`)}</em>` : ""}</small></div><div class="bmRows">${priceBandRows(en)}</div>`;
  }
  return `<div class="boxMarket"><div class="bmHead"><span class="bmLabel">${t("일본판 박스 eBay Active", "Japanese box · eBay Active")}</span><small>${market.updated || t("업데이트일 미상", "date unknown")} · ${t(`표본 ${market.sampleSize || 0}건`, `${market.sampleSize || 0} samples`)}${market.excludedCount ? t(` · 제외 ${market.excludedCount}건`, ` · ${market.excludedCount} excluded`) : ""}</small></div><div class="bmRows">${priceBandRows(market)}</div>${enBlock}<p>${t("하위 / 중앙 / 상위 · 중국·홍콩 발송 제외 · 영문판 = 제목에 English", "Low / mid / high · excl. China/HK sellers · EN = titled English")}</p></div>`;
}

// 박스 "시세 vs 매물" 두 숫자 모델 — 일판·영문 각 판. 실거래(sold)=대표 시세, 최저매물(active)=지금 사는 값.
// sold와 ask가 둘 다 있는 판만 표시(정확도 원칙). sold는 수동 수집.
function boxTwoRow(m, ed) {
  const sold = m && m.ebaySold, active = m && m.ebayActive;
  const hasSold = sold && sold.median != null && (sold.sampleSize || 0) >= 3;
  const askVal = active ? (active.low != null ? active.low : active.middle) : null;
  const hasAsk = askVal != null && (active.sampleSize || 0) >= 3;
  if (!hasSold || !hasAsk) return "";
  const soldUsd = sold.currency === "USD" ? sold.median : marketKrw(sold.median, sold.currency);
  const askUsd = active.currency === "USD" ? askVal : marketKrw(askVal, active.currency);
  const gap = soldUsd ? Math.round((askUsd / soldUsd - 1) * 100) : null;
  const range = sold.low != null && sold.high != null ? `${triMain(sold.low, sold.currency).main}–${triMain(sold.high, sold.currency).main}` : "";
  return `<div class="emEdition"><div class="emEdHead"><em class="langTag ${ed.tagCls}">${ed.tag}</em><b>${ed.name}</b>${range ? `<small>${t("실거래 범위", "sold range")} ${range}</small>` : ""}</div><div class="emCards">
      <div class="emCard emMarket"><span class="emLabel">${t("실거래", "Sold")} <em class="emKind">eBay sold</em></span><b class="emVal">${triMain(sold.median, sold.currency).main}</b><small>${sold.updated || ""} · ${t(`${sold.sampleSize}건`, `${sold.sampleSize} sales`)} · ${t("시세", "market")}</small></div>
      <div class="emCard emAsk"><span class="emLabel">${t("최저 매물", "Lowest listing")} <em class="emKind">${t("호가", "ask")}</em></span><b class="emVal">${triMain(askVal, active.currency).main}</b><small>${active.updated || ""}${gap != null ? ` · <em class="${gap > 0 ? "emUp" : "emDn"}">${t(`실거래 ${gap >= 0 ? "+" : ""}${gap}%`, `${gap >= 0 ? "+" : ""}${gap}% vs sold`)}</em>` : ""}</small></div>
    </div></div>`;
}
// 2026-10-15 소유자 결정: 아래 각주의 해석("매물이 실거래보다 높으면 대기 신호")·이유 설명 문장을 빼고, 숫자의 뜻(실거래/매물 정의·판매자 제외)만 라벨로 남긴다.
function renderBoxTwoNumber(set) {
  const bm = set.boxMarket || {};
  const rows =
    boxTwoRow(bm.jp, { name: t("일본판", "Japanese"), tag: "JP", tagCls: "" }) +
    boxTwoRow(bm.en, { name: t("영문판", "English"), tag: "EN", tagCls: "langTagEn" });
  if (!rows) return "";
  return `<div class="boxMarket enBoxMarket enTwo"><div class="bmHead"><span class="bmLabel">${t("박스 시세 vs 매물", "Box market vs listing")}</span></div>${rows}<p class="emNote">${t('실거래 = 팔린 값 · 매물 = 지금 최저 호가(중국·홍콩 판매자 제외) · 미개봉 박스 · <a href="/methodology.html#exclusions">기준</a>', 'Sold = completed sales · Listing = lowest ask now (excl. China/HK sellers) · sealed boxes · <a href="/methodology.html#exclusions">Rules</a>')}</p></div>`;
}

function renderSourceLegend(set) {
  const hasPsa10 = (set.cards || []).some((card) => card.psa10Usd != null || card.psa10Ebay?.sampleSize > 0);
  const hasEnglishNmEbay = (set.cards || []).some((card) => card.englishNmEbay?.sampleSize > 0);
  return `<div class="sourceLegend" aria-label="${t("가격 출처 요약", "Price sources")}"><span><b>${t("일본판 NM", "Japanese NM")}</b><small>${t("일본 소매 호가", "JP retail ask")}</small></span><span class="${hasPsa10 ? "" : "muted"}"><b>${t("일본어판 PSA10", "Japanese PSA 10")}</b><small>${hasPsa10 ? t("eBay Sold 기준", "eBay Sold") : t("확인된 가격 없음", "No verified price")}</small></span><span><b>${t("영문판 NM", "English NM")}</b><small>${hasEnglishNmEbay ? "eBay Active" : t("매칭 없음", "No match")}</small></span><span><b>${t("박스가", "Box price")}</b><small>eBay Active / Sold</small></span></div>`;
}

async function load() {
  initDisplayLanguage();
  bindDisplayLanguage();
  // 카드 페이지 링크 지도(8KB). 데이터(926KB)와 나란히 받아 첫 렌더 전에 갖춘다 — 없어도 화면은 멀쩡하다(이름이 링크가 아닐 뿐).
  const cardMapP = fetch(withVersion("cards/card-map.json"), { cache: "default" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  try {
    state.data = await fetchPackData();
    state.cardMap = await cardMapP;
  } catch (err) {
    const target = document.querySelector("#packList");
    if (target) {
      target.hidden = false;
      target.innerHTML = `<div class="loadError" role="alert"><p>${t("시세 데이터를 불러오지 못했습니다.", "Price data could not be loaded.")}</p><button type="button">${t("다시 시도", "Try again")}</button></div>`;
      target.querySelector("button").onclick = () => location.reload();
    }
    document.querySelector("#quickSet")?.removeAttribute("aria-busy");
    return;
  }
  applyRouteState();
  bindLangTabs();
  bindDisplayLanguage();
  renderStats();
  renderMarketStatus();
  renderTickerBoard();
  renderTodayDeals();
  renderLiveAuctions();
  renderSinceLastVisit();
  renderPackGrid();
  updateUrl(true);
  if (state.hasExplicitSet) {
    // Deep links must be positioned after the chart exists, not before a late insertion.
    await loadSoldSeries();
    renderDetail();
    document.querySelector("#detail")?.scrollIntoView({ block: "start", behavior: "instant" });
  } else {
    observeBelowFold();
  }
}

/** Render charts/cards only as their section approaches the viewport. No price is synthesized. */
function observeBelowFold() {
  const detail = document.querySelector("#detail");
  if (!detail) return;
  detail.innerHTML = `<p class="detailLoading">${t("세트 상세 정보를 준비 중입니다…", "Set details will load as you scroll…")}</p>`;
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      observer.unobserve(entry.target);
      loadSoldSeries().then(() => {
        fillPackSparks();
        if (entry.target === detail && detail.querySelector(".detailLoading")) renderDetail();
      });
    });
  }, { rootMargin: "600px 0px" });
  observer.observe(document.querySelector("#packList"));
  observer.observe(detail);
}

function applyRouteState() {
  const params = new URLSearchParams(location.search);
  const requestedHl = params.get("hl");
  if (requestedHl === "en" || requestedHl === "ko") state.hl = requestedHl;
  const requestedLang = params.get("lang");
  if (["jp", "extra"].includes(requestedLang)) state.lang = requestedLang;
  const requestedSet = (params.get("set") || "").toUpperCase();
  const initialLang = state.lang;
  const routable = (p) => p.key === requestedSet && ((p.set.cards || []).length > 0 || hasBoxData(p.set));
  let pack = currentPacks().find(routable);
  if (!pack && requestedSet) {
    for (const lang of ["jp", "extra"]) {
      state.lang = lang;
      pack = currentPacks().find(routable);
      if (pack) break;
    }
  }
  state.hasExplicitSet = Boolean(pack && requestedSet);
  if (pack) state.selected = pack.key;
  else {
    state.lang = initialLang;
    selectFirstOfLang();
  }
  state.view = params.get("view") === "psa" ? "psa" : "hits";
}

// 리텐션: 워치리스트(핀) + "지난 방문 이후 변동" — localStorage 기반, 서버 불필요
const WATCH_KEY = "opbx_watch", SEEN_KEY = "opbx_lastseen";
function watchList() { try { return JSON.parse(localStorage.getItem(WATCH_KEY)) || []; } catch (e) { return []; } }
function watchHas(code) { return watchList().includes(code); }
function watchToggle(code) {
  const w = watchList(); const i = w.indexOf(code);
  if (i >= 0) w.splice(i, 1); else w.push(code);
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(w)); } catch (e) {}
  trackEvent("watch_toggle", { pack_code: code, on: i < 0 });
}
// 핀 버튼 — watchToggle() 은 2026-08 에 만들어졌지만 정작 누를 버튼이 어디에도 없어서
// 죽은 기능이었다(2026-08-27 발견). 상세 패널 제목줄에 단다.
function pinBtnHtml(code) {
  const on = watchHas(code);
  return `<button class="pinToggle${on ? " on" : ""}" data-code="${code}" title="${t("관심 박스로 고정하면 목록 맨 앞 + 재방문 시 변동 우선 표시", "Pin to front of list and highlight changes on your next visit")}">${on ? "📌 " + t("관심 해제", "Unpin") : "📌 " + t("관심 등록", "Watch")}</button>`;
}
function wirePinBtn(el) {
  el.querySelectorAll(".pinToggle").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    watchToggle(b.dataset.code);
    renderPackGrid();
    renderDetail();
  }));
}
function selectPack(code) {
  if (!state.data.sets[code]) return;
  state.lang = (state.data.extra?.list || []).includes(code) ? "extra" : "jp";
  state.selected = code;
  state.hasExplicitSet = true;
  bindLangTabs();
  renderPackGrid();
  renderDetail();
  updateUrl();
  const detail = document.querySelector("#detail");
  detail?.setAttribute("tabindex", "-1");
  detail?.focus({ preventScroll: true });
  detail?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

/** Native quick lookup shares the grid's selection, URL and language state. */
function renderQuickSet() {
  const wrap = document.querySelector("#quickSet");
  if (!wrap) return;
  const codes = [...(state.data.jp?.list || []), ...(state.data.extra?.list || [])];
  const options = codes.map((code) => {
    const set = state.data.sets[code] || {};
    const name = t(set.nameKo || set.nameEn || code, set.nameEn || code);
    const disabled = !(set.cards || []).length && !hasBoxData(set);
    return `<option value="${escapeHtml(code)}" ${disabled ? "disabled" : ""}>${escapeHtml(code + " · " + name)}</option>`;
  }).join("");
  wrap.innerHTML = `<label for="quickSetSelect"><span>${t("찾고 싶은 박스 세트", "Find a booster box")}</span><select id="quickSetSelect" name="set">${options}</select></label><button type="button">${t("시세 · 차트 보기", "View price & chart")}</button>`;
  const select = wrap.querySelector("select");
  select.value = state.selected;
  wrap.querySelector("button").onclick = () => selectPack(select.value);
  wrap.hidden = false;
  wrap.removeAttribute("aria-busy");
}
function renderSinceLastVisit() {
  const anchor = document.querySelector("#todayDeals") || document.querySelector("#packList");
  if (!anchor || !state.data) return;
  const updated = state.data.updated || "";
  const codes = [...(state.data.jp?.list || []), ...(state.data.extra?.list || [])];
  const now = {};
  for (const code of codes) { const m = boxMidKrw(state.data.sets?.[code] || {}); if (m && m.value != null) now[code] = m.value; }
  let prev = null; try { prev = JSON.parse(localStorage.getItem(SEEN_KEY)); } catch (e) {}
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ d: updated, p: now })); } catch (e) {}
  if (!prev || !prev.d || prev.d === updated || !prev.p) return;
  const watch = watchList();
  const moves = [];
  for (const code of Object.keys(now)) {
    const a = prev.p[code], b = now[code];
    if (!a || b == null) continue;
    moves.push({ code, pct: (b / a - 1) * 100, watched: watch.includes(code) });
  }
  if (!moves.length) return;
  const avg = moves.reduce((s, m) => s + m.pct, 0) / moves.length;
  const top = [...moves]
    .sort((x, y) => (y.watched ? 1 : 0) - (x.watched ? 1 : 0) || Math.abs(y.pct) - Math.abs(x.pct))
    .slice(0, 3)
    .filter((m) => m.watched || Math.abs(m.pct) >= 0.5);
  if (!top.length && Math.abs(avg) < 0.5) return;
  const f = (p) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  let el = document.querySelector("#sinceLast");
  if (!el) { el = document.createElement("div"); el.id = "sinceLast"; anchor.parentNode.insertBefore(el, anchor); }
  el.innerHTML = `<span class="slvHead">${t(`지난 방문 이후 (${prev.d})`, `Since your last visit (${prev.d})`)}</span>${top.map((m) => `<button class="slvChip" data-key="${m.code}">${m.watched ? "📌 " : ""}${m.code} <b class="${m.pct >= 0 ? "up" : "down"}">${f(m.pct)}</b></button>`).join("")}<span class="slvAvg">${t("시장 평균", "market avg")} <b class="${avg >= 0 ? "up" : "down"}">${f(avg)}</b></span>`;
  el.querySelectorAll(".slvChip").forEach((btn) => btn.addEventListener("click", () => selectPack(btn.dataset.key)));
  trackEvent("since_last_visit", { prev_date: prev.d, movers: top.length });
}

// 등락 시세판 — 주식 시세판처럼 "지금 뭐가 오르고 내리나"를 첫 화면에서. (2026-08-27)
// marketIndex.board 는 build-market-index.js 가 매일 만들면서 여태 화면에 안 쓰이던 데이터다.
// changePct = 각 세트 4주 전 주간 중앙값 대비 — 시장 전체 수치는 그 중앙값 하나만 싣는다.
function renderTickerBoard() {
  const el = document.querySelector("#tickerBoard");
  const board = state.data?.marketIndex?.board;
  if (!el) return;
  if (!Array.isArray(board)) { el.hidden = true; return; }
  // 28일 넘게 거래 없는 세트는 "4주 등락"의 기준점이 없다 — 값은 보이되 날짜를 붙이고 흐리게, 뒤로 보낸다(2026-09-24).
  const STALE = 28 * 864e5;
  const dataT = Date.parse(state.data.updated || "") || Date.now();
  const isStale = (b) => b.nowDate && dataT - Date.parse(b.nowDate) > STALE;
  const rows = board.filter((b) => b.changePct != null && b.nowUsd != null)
    .sort((x, y) => (isStale(x) ? 1 : 0) - (isStale(y) ? 1 : 0) || y.changePct - x.changePct);
  if (rows.length < 5) { el.hidden = true; return; }
  // 합성 지수(중앙값·평균)는 싣지 않는다 — 지수 화면을 신뢰 문제로 없앤 소유자 결정(2026-08-27).
  // 여기 있는 건 전부 세트별 실판매 원장 수치라 각자 세트 페이지에서 검증된다.
  const f = (p) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  const cls = (p) => (p > 0 ? "up" : p < 0 ? "down" : "flat");
  const chips = rows.map((b) =>
    `<button class="tbChip${isStale(b) ? " stale" : ""}" data-key="${b.code}" title="${t(`일본판 박스 실거래 중앙값 ${b.nowDate || ""} 주${b.n != null ? ` · ${b.n}건` : ""}${isStale(b) ? " · 28일 넘게 거래 없음" : ""}`, `JP box sold median, week of ${b.nowDate || ""}${b.n != null ? ` · n=${b.n}` : ""}${isStale(b) ? " · no sales in 28+ days" : ""}`)}"><span class="tbCode">${b.code}</span><span class="tbPrice">$${b.nowUsd}</span>${isStale(b) ? "" : `<b class="${cls(b.changePct)}">${f(b.changePct)}</b>`}<small class="tbDate">${b.nowDate ? b.nowDate.slice(5) : ""}</small></button>`).join("");
  // 전광판 흐름(2026-10-01). 마우스 환경 + 모션 허용일 때만 같은 줄을 두 벌 이어 붙여 천천히 흐른다(styles.css .tbMarquee —
  // hover/focus 에 멈춤, 두 번째 벌은 보조기술·탭 순서에서 제외). 터치·모션 줄임 설정은 손으로 미는 기존 스크롤 그대로.
  const marquee = matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;
  const dup = marquee ? `<div class="tbTrack" aria-hidden="true">${chips.replace(/<button /g, '<button tabindex="-1" ')}</div>` : "";
  el.innerHTML = `<span class="tbHead">${t("4주 등락", "4-week movers")} <a class="tbWeekly" href="weekly.html">${t("이번 주 →", "This week →")}</a></span><div class="tbScroll${marquee ? " tbMarquee" : ""}" style="--tb-n:${rows.length}"><div class="tbTrack">${chips}</div>${dup}</div>${marquee ? `<button class="tbMotion" type="button" aria-pressed="false">${t("일시정지", "Pause")}</button>` : ""}`;
  el.hidden = false;
  const motion = el.querySelector(".tbMotion");
  if (motion) motion.onclick = () => {
    const paused = el.querySelector(".tbMarquee").classList.toggle("isPaused");
    motion.setAttribute("aria-pressed", String(paused));
    motion.textContent = paused ? t("재생", "Play") : t("일시정지", "Pause");
  };
  el.querySelectorAll(".tbChip").forEach((btn) => btn.addEventListener("click", () => {
    trackEvent("ticker_click", { pack_code: btn.dataset.key });
    selectPack(btn.dataset.key);
  }));
}

function renderMarketStatus() {
  const el = document.querySelector("#marketStatus");
  if (!el || !state.data) return;
  // 2026-09-24: "MARKET LIVE · SETS 21 · CARDS 210 · BOX SAMPLES 147" 은 단위 없는 내부 카운터였고 세트 수도 다른 곳(22)과 달랐다.
  // 방문자가 알아야 할 것은 셋뿐이다 — 무슨 자료인지, 언제 것인지, 범위가 얼마인지.
  const setCount = [...(state.data.jp?.list || []), ...(state.data.extra?.list || [])].length;
  const updated = state.data.updated || t("확인중", "checking");
  el.innerHTML = `<span><i></i>${t("이베이 실거래", "eBay completed sales")}</span><span>${t("매일 갱신", "updated daily")}</span><span>${t("데이터", "data")} ${updated}</span><span>${setCount} ${t("세트", "sets")} · USD</span>`;
}

// 오늘의 박스 딜: 검수된 최저 매물(배송 포함)이 최근 실거래 중앙값보다 싼 박스만(일본판·영문판), 절약액 큰 순 4개.
// 기준은 호가가 아니라 실거래(ebaySold.median) — 표본 3건 미만이거나 45일 넘게 낡으면 기준으로 안 쓴다(정확도 원칙).
// 사진은 매물 사진(bestListing.image). 아직 없으면 세트 그림을 앞면으로 한 입체 박스로 대체한다.
const DEAL_COUNTRY = { US: ["미국", "US"], JP: ["일본", "Japan"], GB: ["영국", "UK"], CA: ["캐나다", "Canada"], AU: ["호주", "Australia"], SG: ["싱가포르", "Singapore"], DE: ["독일", "Germany"], FR: ["프랑스", "France"], HK: ["홍콩", "Hong Kong"], KR: ["한국", "Korea"] };
function countryLabel(c) { return DEAL_COUNTRY[c] ? t(DEAL_COUNTRY[c][0], DEAL_COUNTRY[c][1]) : (c || ""); }
function dealPhotoUrl(u) {
  // 딜 사진 칸은 150×104 CSS px → 2배 해상도 300px 이면 충분하다. s-l400 은 44~109KB 였고 홈 모바일 LCP 였다(2026-10-08 실측).
  return String(u || "").replace(/^http:/, "https:").replace(/\/s-l\d+/, "/s-l300");
}
function renderTodayDeals() {
  const el = document.querySelector("#todayDeals");
  if (!el || !state.data) return;
  const deals = [];
  const codes = [...(state.data.jp?.list || []), ...(state.data.extra?.list || [])];
  const staleBefore = Date.now() - 45 * 86400000;
  for (const code of codes) for (const ed of ["jp", "en"]) {   // 영문판도 딜 후보 — 미국 유저는 영문판을 산다(2026-09-22)
    const set = state.data.sets?.[code];
    const bm = set?.boxMarket?.[ed];
    const m = bm?.ebayActive, so = bm?.ebaySold, b = m?.bestListing;
    if (!b || !b.url || b.total == null) continue;
    if (!/new/i.test(b.condition || "") || /unseal|open box|opened|no packs|missing packs|reseal|damaged/i.test(b.title || "")) continue;   // 개봉 박스는 딜이 아니다(2026-09-22)
    if (!so || so.median == null || (so.sampleSize || 0) < 3 || !so.updated || Date.parse(so.updated) < staleBefore) continue;
    if (!(b.total < so.median)) continue;
    deals.push({ code, ed, name: set.nameEn || set.nameKo || code, total: b.total, sold: so.median, soldN: so.sampleSize, soldTo: String(so.updated).slice(5, 10), mid: m.middle, asks: m.sampleSize || 0, currency: so.currency || m.currency || "USD", url: b.url, image: b.image || "", country: b.country || "", shipping: Number(b.shipping) || 0, save: so.median - b.total });
  }
  renderSuppliesStrip();
  el.classList.toggle("isEmpty", !deals.length);
  if (!deals.length) {
    el.hidden = false;
    el.innerHTML = `<p class="dealsLoading">${t("오늘 최근 실거래가보다 싼 검수 매물: 0", "Verified listings under recent sold today: 0")}</p>`;
    return;
  }
  deals.sort((a, b) => b.save - a.save);
  const fmt = (v, cur) => (cur === "USD" ? `$${Math.round(v).toLocaleString("en-US")}` : `${Math.round(v).toLocaleString()} ${cur}`);
  el.hidden = false;
  el.innerHTML = `
    <div class="dealsHead"><span>${t("오늘의 박스 딜", "Today's box deals")}</span><small>${t("최근 실거래가보다 싼 검수 매물 · 배송 포함 · 일본판·영문판", "Verified listings under recent sold · incl. shipping · Japanese & English")}</small></div>
    <div class="dealsRow">${deals.slice(0, 4).map((d, i) => {
      const pct = Math.round((d.save / d.sold) * 100);
      const vsMid = d.mid ? Math.round((1 - d.total / d.mid) * 100) : 0;
      // 앞 두 장은 첫 화면(LCP 후보)이라 lazy 로 두면 뒤늦게 받는다 — 즉시·우선 로드(2026-10-08 라이트하우스).
      const imgLoad = i < 2 ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
      const art = d.image
        ? `<span class="dealPhoto"><img width="150" height="104" src="${escapeHtml(dealPhotoUrl(d.image))}" alt="" ${imgLoad} decoding="async" onerror="this.hidden=true"><span class="dealLbl">${d.code}${d.ed === "en" ? " EN" : ""}</span></span>`
        : `<span class="dealBox3d" aria-hidden="true"><span class="top"></span><span class="side"></span><span class="front"><img width="150" height="104" src="card-img/box/hero/${d.code}.webp" alt="" loading="lazy" decoding="async" onerror="this.hidden=true"><span class="dealLbl">${d.code}${d.ed === "en" ? " EN" : ""}</span></span></span>`;
      const ship = d.shipping > 0 ? t(`배송 ${fmt(d.shipping, d.currency)} 포함`, `incl. ${fmt(d.shipping, d.currency)} shipping`) : t("무료배송", "free shipping");
      const asks = d.mid ? ` · ${t(`호가 중간 ${fmt(d.mid, d.currency)}, ${d.asks}건`, `asks mid ${fmt(d.mid, d.currency)}, ${d.asks} listings`)}${vsMid > 0 ? ` (−${vsMid}%)` : ""}` : "";
      return `
      <a class="dealCard" href="${epnUrl(d.url, `home-deal-${String(d.code).toLowerCase()}-${d.ed}`)}" target="_blank" rel="noopener noreferrer sponsored">
        ${art}
        <span class="dealBody">
          <span class="dealSet"><b>${d.code}</b> ${escapeHtml(d.name)}<span class="dealEd">${d.ed === "en" ? t("영문판", "English") : t("일본판", "Japanese")}</span></span>
          <span class="dealPriceRow"><span class="dealPrice">${fmt(d.total, d.currency)}</span><span class="dealWas">${t("최근 실거래", "recent sold")} ${fmt(d.sold, d.currency)}</span></span>
          <span class="dealSave">−${fmt(d.save, d.currency)} · ${t(`실거래 대비 ${pct}% 저렴`, `${pct}% under recent sold`)} <small>${t(`(${d.soldTo}까지 ${d.soldN}건)`, `(${d.soldN} sales to ${d.soldTo})`)}</small></span>
          <span class="dealMeta">${t(`${countryLabel(d.country)} 발송`, `Ships from ${countryLabel(d.country)}`)} · ${ship}${asks}</span>
        </span>
        <span class="dealCta"><span class="dealBtn">${t("eBay에서 구매", "Buy on eBay")} <i>↗</i></span><span class="dealPaid">Paid Link</span></span>
      </a>`;
    }).join("")}
    </div>
    ${couponLive() ? `<div class="couponRow">
      <a class="couponChip" href="${epnUrl(EBAY_COUPON.url, "home-coupon")}" target="_blank" rel="noopener noreferrer sponsored">
        <span class="couponPct">${EBAY_COUPON.pct}%</span>
        <span class="couponMeta"><b>${t("eBay 쿠폰 받기", "Get the eBay coupon")}</b>
          <small>${t("결제 시 코드 입력", "Apply the code at checkout")} · ${t(EBAY_COUPON.endLabel.ko, EBAY_COUPON.endLabel.en)}</small></span>
        <span class="couponCode">${EBAY_COUPON.code}</span></a>
      <small class="couponNote">${t("eBay 쿠폰 · 조건은 eBay 페이지", "eBay coupon · terms on eBay's page")} · Paid Link</small>
    </div>` : ""}`;
}

// 카드 보호용품·등급 카드 — 경매 아래 작은 타일(딜 섹션에서 분리, 2026-09-18).
function renderSuppliesStrip() {
  const el = document.querySelector("#suppliesStrip");
  if (!el) return;
  const tile = (url, icon, name, sub) => `<a class="supplyCard" href="${epnUrl(url, "home-supply")}" target="_blank" rel="noopener noreferrer sponsored"><span class="supplyIcon" aria-hidden="true">${icon}</span><span><span class="supplyName">${name}</span><span class="supplySub">${sub}</span></span></a>`;
  el.hidden = false;
  el.innerHTML = `<span class="suppliesLabel">${t("카드 보호", "Protect your cards")}</span>
    ${tile("https://www.ebay.com/sch/i.html?_nkw=card+sleeves&_sop=12", "🛡️", t("플레이 슬리브", "Play sleeves"), t("카드 슬리브 보기", "Browse card sleeves"))}
    ${tile("https://www.ebay.com/sch/i.html?_nkw=card+toploaders&_sop=12", "📦", t("보관 탑로더", "Storage toploaders"), t("탑로더 보기", "Browse toploaders"))}
    ${tile("https://www.ebay.com/sch/i.html?_nkw=one+piece+psa+10+japanese&_sop=12", "💎", t("등급 카드", "Graded cards"), t("PSA 10 매물 보기", "Browse PSA 10 listings"))}
    <small class="suppliesPaid">Paid Link</small>`;
}

// 종료 임박 경매 — 중계기에서 실시간으로 받아온다.
//
// 왜 실시간인가: 경매는 시시각각 끝난다. 하루 한 번 구운 정적 목록은 방문자가 볼 때쯤 이미
// 끝나 있을 확률이 높다. 끝난 경매를 "임박"이라 띄우는 건 틀린 숫자를 띄우는 것과 같다.
// 그래서 중계기가 없거나 실패하면 **섹션을 아예 숨긴다**. 낡은 목록을 보여주느니 안 보여준다.
//
// 남은시간은 서버 값(minutesLeft)을 믿지 않고 endsAt으로 매번 다시 계산한다.
// 중계기 응답이 최대 60초 캐시되므로 그대로 쓰면 최대 1분 어긋난다.
function renderLiveAuctions() {
  const el = document.querySelector("#liveAuctions");
  if (!el) return;
  if (!AUCTION_RELAY) { el.hidden = true; return; }

  const hide = () => { el.hidden = true; el.innerHTML = ""; };

  const paint = (data) => {
    const now = Date.now();
    const items = (data.items || [])
      .map((it) => ({ ...it, mins: Math.round((Date.parse(it.endsAt) - now) / 60000) }))
      .filter((it) => Number.isFinite(it.mins) && it.mins > 0);   // 이미 끝난 건 버린다
    if (!items.length) return hide();

    const money = (v, cur) => (v == null ? "—" : cur === "USD" ? `$${Math.round(v).toLocaleString("en-US")}` : `${Math.round(v).toLocaleString()} ${cur}`);
    const kindLabel = { box: t("박스", "Box"), pack: t("팩", "Pack"), card: t("카드", "Card") };
    const stamp = new Date(data.generatedAt).toLocaleTimeString(state.hl === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" });

    el.hidden = false;
    el.innerHTML = `
      <div class="aucHead">
        <span>${t("종료 임박 경매", "Auctions ending soon")}</span>
        <small>${t("eBay · 3시간 이내 종료 · 현재 입찰가(낙찰가 아님)", "eBay · ending within 3 hours · current bids, not final prices")} · ${stamp}</small>
      </div>
      <ul class="aucList">${items.map((it) => `
        <li class="aucRow${it.mins <= 90 ? " aucSoon" : ""}">
          <a href="${epnUrl(it.url, "home-auc")}" target="_blank" rel="noopener noreferrer sponsored">
            ${it.image ? `<img class="aucThumb" width="64" height="64" src="${escapeHtml(aucThumbUrl(it.image))}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : `<span class="aucThumb"></span>`}
            <span class="aucKind ${escapeHtml(String(it.kind || ""))}">${kindLabel[it.kind] || it.kind}</span>
            <span class="aucMain">
              <span class="aucTitle">${escapeHtml(it.title)}</span>
              <span class="aucSub">${it.contested
                ? t(`입찰 ${it.bidCount}건`, `${it.bidCount} bid${it.bidCount === 1 ? "" : "s"}`)
                : t("입찰 없음", "no bids yet")}${it.country ? ` · ${t(`${countryLabel(it.country)} 발송`, `ships from ${countryLabel(it.country)}`)}` : ""}${it.shipping == null ? "" : ` · ${Number(it.shipping) > 0 ? t(`배송 ${money(it.shipping, it.currency)}`, `${money(it.shipping, it.currency)} shipping`) : t("무료배송", "free shipping")}`}</span>
            </span>
            <span class="aucBid"><b>${money(it.currentBid, it.currency)}</b><small>${t("현재 입찰가", "current bid")}</small></span>
            <span class="aucLeft"><b class="aucTime" data-ends="${escapeHtml(it.endsAt)}">${aucTimeLeft(it.endsAt)}</b><small>${t("남음", "left")}</small></span>
            <span class="aucBtn">${t("입찰", "Bid")} <i>↗</i></span>
          </a>
        </li>`).join("")}</ul>
      <p class="aucNote">${t("정렬: 입찰 수 → 판매자 규모 → 남은 시간", "Order: bids → seller size → time left")}</p>`;
  };

  const load = () => fetch(AUCTION_RELAY, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      if (!data || data.error) return hide();
      auctionFeed.data = data;
      auctionFeed.at = Date.now();
      paint(data);
    })
    .catch(hide);

  load();

  // 열어둔 채로도 살아있게: 30초마다 남은시간만 다시 그리고(네트워크 X),
  // 90초 지나면 새로 받아온다. 중계기 캐시가 60초라 그보다 자주 불러봐야 같은 값이다.
  // 백그라운드 탭에서는 아예 쉰다 — 안 보는 화면 때문에 할당량을 쓸 이유가 없다.
  clearInterval(auctionFeed.timer);
  auctionFeed.timer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - auctionFeed.at >= AUCTION_REFRESH_MS) load();
    else if (auctionFeed.data) paint(auctionFeed.data);   // 종료된 건 여기서 목록에서 빠진다
  }, AUCTION_TICK_MS);

  // 매초 카운트다운 — 남은시간 텍스트만 갱신(재렌더·네트워크 없이 저렴). 1분 미만은 빨갛게 강조.
  clearInterval(auctionFeed.tick);
  auctionFeed.tick = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    el.querySelectorAll(".aucTime[data-ends]").forEach((sp) => {
      const ends = sp.getAttribute("data-ends");
      sp.textContent = aucTimeLeft(ends);
      const ms = Date.parse(ends) - Date.now();
      sp.classList.toggle("aucUrgent", ms > 0 && ms < 60000);
    });
  }, AUCTION_SEC_MS);

  // 다른 탭 갔다 돌아왔을 때 낡은 값을 그대로 보여주지 않도록 즉시 갱신
  if (!auctionFeed.bound) {
    auctionFeed.bound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - auctionFeed.at >= AUCTION_REFRESH_MS) load();
    });
  }
}

// 카드가 아직 없어도 박스 시세(sold/active)가 있으면 "박스 시세만" 페이지로 열 수 있다.
function hasBoxData(set) {
  const bm = (set && set.boxMarket) || {};
  return ["jp", "en"].some((k) => {
    const m = bm[k] || {};
    return (m.ebaySold && m.ebaySold.median != null) || (m.ebayActive && (m.ebayActive.median != null || m.ebayActive.middle != null));
  });
}

function boxThumbnail(src) {
  return typeof src === "string" && src.includes("/card-img/box/")
    ? src.replace("/card-img/box/", "/card-img/box/thumb/")
    : src;
}

function renderPackGrid() {
  const wrap = document.querySelector("#packList");
  renderQuickSet();
  const cacheKey = `${state.lang}:${state.hl}:${watchList().join(",")}`;
  if (state.renderedLang === cacheKey && wrap.children.length) {
    wrap.querySelectorAll(".packChip").forEach((btn) => btn.classList.toggle("active", btn.dataset.key === state.selected));
    return;
  }
  state.renderedLang = cacheKey;
  const ordered = [...currentPacks()].sort((a, b) => (watchHas(b.key) ? 1 : 0) - (watchHas(a.key) ? 1 : 0));
  wrap.innerHTML = ordered.map((p) => {
    const has = (p.set.cards || []).length > 0;
    const boxOnly = !has && hasBoxData(p.set);
    const clickable = has || boxOnly;
    const active = p.key === state.selected ? " active" : "";
    const box = p.set.box || FALLBACK;
    const thumbnail = boxThumbnail(box);
    const tag = has ? "TOP 10" : boxOnly ? t("박스 시세", "Box price") : t("준비중", "Coming soon");
    return `<button class="packChip${active}${clickable ? "" : " pending"}${boxOnly ? " boxOnly" : ""}" data-key="${p.key}" ${clickable ? "" : "disabled"}>${watchHas(p.key) ? `<span class="pinMark" title="${t("관심 박스", "Watching")}">📌</span>` : ""}<img class="packBox" width="46" height="62" src="${thumbnail}" alt="${p.code} ${t("박스", "box")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${box}'" /><span class="packMeta"><span class="packCode">${p.code}</span><span class="packName">${packName(p)}</span><span class="packEn">${packSubName(p)}</span><span class="packTrend" data-code="${p.code}"></span><span class="packTag${clickable ? " ready" : ""}${boxOnly ? " boxonly" : ""}">${tag}</span></span></button>`;
  }).join("");
  fillPackSparks();
  wrap.querySelectorAll(".packChip:not(.pending)").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectPack(btn.dataset.key);
      trackEvent("select_pack", { pack_code: state.selected, language: state.lang });
    });
  });
}

// 세트 칩의 미니 추세선(일본판 주간 실거래 중앙값, 최근 12주) + 현재가 + 4주 등락.
// 숫자는 marketIndex.board 그대로 — 티커와 같은 값·같은 기준(마지막 주간 중앙값, 28일 전 대비).
// 선 색도 4주 등락 부호를 따른다 — 12주 모양과 4주 숫자가 서로 다른 말을 하지 않게.
// 값이 없으면 빈칸으로 둔다. 시계열이 늦게 오면 loadSoldSeries().then 에서 다시 부른다.
function fillPackSparks() {
  if (!soldSeries || !state.data) return;
  const board = {};
  for (const b of state.data.marketIndex?.board || []) board[b.code] = b;
  document.querySelectorAll(".packTrend[data-code]").forEach((el) => {
    if (el.dataset.done) return;
    const code = el.dataset.code;
    const b = board[code];
    const pts = (((soldSeries.sets || {})[code] || {}).jp || []).filter((p) => p && p.median != null).slice(-12);
    const hasNow = b && b.nowUsd != null;
    if (pts.length < 3 && !hasNow) { el.dataset.done = "1"; return; }
    // 마지막 점이 데이터 기준일보다 28일 넘게 묵었으면 흐리게 + 'MM/DD', 등락은 숨긴다 — 4주 등락 띠(renderTickerBoard)와 같은 규칙.
    // 28일 넘게 거래가 없으면 "4주 등락"의 기준점이 없다(2026-10-14, 종전엔 49일 묵은 OP-06 이 +19% 로 칩에 떴다).
    const dataT = Date.parse(state.data.updated || "") || Date.now();
    const lastD = pts.length ? pts[pts.length - 1].d : (b && b.nowDate) || null;
    const stale = !!lastD && dataT - Date.parse(lastD) > 28 * 864e5;
    const sign = !stale && b && b.changePct != null ? Math.sign(b.changePct) : 0;
    const color = sign > 0 ? "#00e5a0" : sign < 0 ? "#ff5f6e" : "#8d95a7";   // --green / --red / --muted (styles.css 와 같은 값)
    let svg = "";
    if (pts.length >= 3) {
      const vs = pts.map((p) => p.median);
      const lo = Math.min(...vs), hi = Math.max(...vs);
      const W = 64, H = 18, PAD = 2.5;
      // 세로 폭은 값의 8% 이상 — 박스 차트(box-chart.js)와 같은 최소 축 폭. 1% 흔들림이 칩 높이를 다 채워 급등락처럼 보이지 않게.
      const mid = (hi + lo) / 2, span = Math.max(hi - lo, mid * 0.08) || 1;
      const y = (v) => PAD + (1 - (v - (mid - span / 2)) / span) * (H - PAD * 2);
      // x 는 날짜 간격대로(종전엔 점 순번이라 빠진 주가 눌려 안 보였다). 7일 격자에서 점이 빠진 곳은 선을 끊는다 — 잇지 않는다.
      const ts = pts.map((p) => Date.parse(p.d)), t0 = ts[0], tSpan = (ts[ts.length - 1] - t0) || 1;
      const xy = vs.map((v, i) => [((ts[i] - t0) / tSpan) * (W - 3) + 1.5, y(v)]);
      const d = xy.map(([x, yy], i) => (i && ts[i] - ts[i - 1] <= 7.5 * 864e5 ? "L" : "M") + x.toFixed(1) + " " + yy.toFixed(1)).join("");
      const [lx, ly] = xy[xy.length - 1];
      // 끊긴 구간은 칩 바닥에 옅은 점선으로 '빈칸'을 드러낸다 — 값을 잇지 않는 바닥 기준선(2026-10-14 QA: OP-03 은 4조각이라
      // 64px 칩에서 깨진 그림처럼 보였다). path 가 아니라 line 이라 첫 화면 추세선 그리기 모션(.packSpark path)과 무관하다.
      const gapLines = xy.slice(1).map(([x], i) => (ts[i + 1] - ts[i] > 7.5 * 864e5
        ? `<line x1="${(xy[i][0] + 1.5).toFixed(1)}" y1="${H - 1}" x2="${(x - 1.5).toFixed(1)}" y2="${H - 1}" style="stroke:var(--muted,#8d95a7)" stroke-width="1" stroke-dasharray="1.5 2" opacity=".7"/>`
        : "")).join("");
      svg = `<svg class="packSpark" viewBox="0 0 ${W} ${H}" aria-hidden="true">${gapLines}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2" fill="${color}"/></svg>`;
    }
    const now = hasNow ? `<span class="packNow"><i class="packEd">JP</i>$${b.nowUsd}</span>` : "";
    const chg = stale ? (lastD ? `<small class="packAsOf">${lastD.slice(5).replace("-", "/")}</small>` : "")
      : b && b.changePct != null
        ? `<b class="packChg ${sign > 0 ? "up" : sign < 0 ? "down" : "flat"}">${b.changePct > 0 ? "+" : ""}${b.changePct.toFixed(1)}%</b>` : "";
    if (hasNow) {
      el.title = t(
        `일본판 박스 실거래 중앙값 $${b.nowUsd} (${b.nowDate} 주)${!stale && b.changePct != null ? ` · 4주 등락 ${b.changePct > 0 ? "+" : ""}${b.changePct}% (${b.changeBasis} 대비)` : ""}${pts.length >= 3 ? ` · 선은 최근 ${pts.length}점` : ""}`,
        `JP box sold median $${b.nowUsd} (week of ${b.nowDate})${!stale && b.changePct != null ? ` · 4-week change ${b.changePct > 0 ? "+" : ""}${b.changePct}% vs ${b.changeBasis}` : ""}${pts.length >= 3 ? ` · line = last ${pts.length} points` : ""}`);
    }
    el.classList.toggle("stale", stale);
    el.innerHTML = svg + now + chg;
    el.dataset.done = "1";
  });
  // 추세선 그려지는 효과(index.html .packSpark 규칙)는 선이 실제로 들어간 첫 번째 때만. 시계열은 그리드보다 늦게 오므로
  // 여기서 표식을 붙인다 — 그 뒤 필터·언어 전환 재렌더는 완성 상태로 바로 보인다. (2026-10-01)
  if (!document.body.classList.contains("sparkDone") && document.querySelector(".packSpark")) {
    setTimeout(() => document.body.classList.add("sparkDone"), 1500);
  }
}

// 카드 페이지 링크. cards/card-map.json(번호|정규화이름 → 파일명)은 load() 에서 한 번 받는다.
// 키 정규화는 tools/inject-home-summary.js cardSlug 와 같아야 한다.
function cardPageHref(c) {
  if (!state.cardMap || !c || !c.number) return null;
  const f = state.cardMap[c.number + "|" + String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")];
  return f ? "cards/" + f : null;
}

// 카드 확대창에 붙는 그 카드의 실측값. 예전엔 japaneseNmEbay 하나만 봤는데 그 매칭이 0건이라
// 어떤 카드를 눌러도 "표본이 아직 없습니다"만 떴다(2026-08-03 발견). 가진 것을 전부 보여준다.
// 원칙은 그대로 — 없는 항목은 줄 자체를 만들지 않고, 하나도 없을 때만 안내 한 줄.
// 그 일본판 NM eBay 칸·6개월 그래프는 2026-09-30 삭제 — 원천(Finding API)이 막혀 한 번도 값이 없었다.
function cardGradePanel(card) {
  const g = card.graderPop;
  if (!g) return "";
  // 채점 수 자체는 사실이라 몇 장이든 싣지만, **비율은 10장 미만이면 비운다**.
  // 2장 중 2장이 만점이면 100% 인데 그 숫자는 아무것도 말해주지 않는다(집계 3건 미만은 숨기는 집안 규칙과 같은 취지).
  const MIN_RATE_N = 10;
  const pct = (part, total) => (total >= MIN_RATE_N ? `${((part / total) * 100).toFixed(1)}%` : "&mdash;");
  const rows = [];
  // PSA 는 판별로 따로 싣는다 — 일본판과 영문판을 절대 합치지 않는다(소유자 지시).
  // 열 구성이 다른 등급사와 다르다: PSA 는 만점이 10 하나뿐이라 '최상위' 칸이 없다.
  for (const [ed, label] of [["jp", t("PSA 일본판", "PSA Japanese")], ["en", t("PSA 영문판", "PSA English")]]) {
    const p = g.psa?.[ed];
    if (!p) continue;
    rows.push(`<tr><td class="edName">${label}</td><td class="grNum">${num(p.total)}</td><td class="grNum">${num(p.g10)}</td><td class="grNum">&mdash;</td><td class="grNum">${pct(p.g10, p.total)}</td></tr>`);
  }
  // CGC 도 판별로 나뉜다(2026-08-03 부터). 옛 데이터는 판 구분이 없어 통짜로 올 수 있으니 둘 다 받는다.
  const cgcRows = g.cgc && (g.cgc.jp || g.cgc.en) ? [["jp", t("CGC 일본판", "CGC Japanese")], ["en", t("CGC 영문판", "CGC English")]] : [[null, "CGC"]];
  for (const [ed, label] of cgcRows) {
    const c = ed ? g.cgc?.[ed] : g.cgc;
    if (!c || c.total == null) continue;
    rows.push(`<tr><td class="edName">${label}</td><td class="grNum">${num(c.total)}</td><td class="grNum">${num(c.gemMint10)}</td><td class="grNum">${num(c.pristine10)}</td><td class="grNum">${pct(c.pristine10 + c.gemMint10, c.total)}</td></tr>`);
  }
  // TAG 도 판별로 나뉜다(2026-08-25 부터 영문판도 수집). 그 전 기록은 판 구분이 없어 통짜로 올 수 있으니 둘 다 받는다.
  const tagRows = g.tag && (g.tag.jp || g.tag.en) ? [["jp", t("TAG 일본판", "TAG Japanese")], ["en", t("TAG 영문판", "TAG English")]] : [[null, t("TAG 일본판", "TAG Japanese")]];
  for (const [ed, label] of tagRows) {
    const x = ed ? g.tag?.[ed] : g.tag;
    if (!x || x.total == null) continue;
    rows.push(`<tr><td class="edName">${label}</td><td class="grNum">${num(x.total)}</td><td class="grNum">${num(x.g10)}</td><td class="grNum">${num(x.g10p)}</td><td class="grNum">${pct(x.g10 + x.g10p, x.total)}</td></tr>`);
  }
  if (!rows.length) return "";
  const asOf = [g.cgc?.d, g.cgc?.jp?.d, g.cgc?.en?.d, g.tag?.d, g.tag?.jp?.d, g.tag?.en?.d, g.psa?.jp?.d, g.psa?.en?.d].filter(Boolean).sort().at(-1);
  return `<div class="cardGradePanel"><h3>${t("이 카드의 등급 인구", "Grades for this card")}</h3>
    <table class="grTable"><thead><tr><th>${t("등급사", "Grader")}</th><th>${t("누적", "Total")}</th><th>${t("만점", "Top")}</th><th>${t("최상위", "Highest")}</th><th>${t("만점 비율", "Top rate")}</th></tr></thead><tbody>${rows.join("")}</tbody></table>
    <p class="edFoot">${t(
      "만점 = PSA 10 · CGC 젬 민트 10 · TAG 10 · 최상위 = CGC 프리스틴 10 · TAG 10P",
      "Top = PSA 10 · CGC Gem Mint 10 · TAG 10 · Highest = CGC Pristine 10 · TAG 10P")}${asOf ? ` · ${t("기준", "as of")} ${asOf}` : ""}</p></div>`;
}

function cardMarketPanel(card) {
  const grades = cardGradePanel(card);
  // 시세줄은 카드 카드(그리드)에 쓰는 것과 같은 함수다 — 확대창에서도 같은 값을 같은 라벨로 보여준다.
  const prices = card.number ? `<div class="cardLbPrices">${priceLines(card)}</div>` : "";
  const body = `${prices}${grades}`;
  return body || `<div class="cardChartEmpty">${t("실측값 없음", "No measured data")}</div>`;
}

function openLightbox(src, name, card, fallback) {
  let lb = document.querySelector("#lightbox");
  if (!lb) {
    lb = document.createElement("dialog");
    lb.id = "lightbox";
    lb.setAttribute("aria-labelledby", "lbCap");
    lb.innerHTML = `<div class="lbInner"><button type="button" id="lbClose" autofocus>×</button><div class="lbGrid"><img id="lbImg" alt=""/><div><p id="lbCap"></p><div id="lbMarket"></div></div></div></div>`;
    document.body.appendChild(lb);
    // Native modal owns Escape, focus containment, background inertness and focus return.
    lb.addEventListener("click", (e) => { if (e.target === lb || e.target.id === "lbClose") lb.close(); });
  }
  const big = src.replace(/_(\d+)w\.jpg/, "_1000x1000.jpg");
  const imgEl = lb.querySelector("#lbImg");
  // 폴백 사슬: 고해상 변형 → 원래 주소 → 다른 판 이미지. 마지막까지 실패하면 이미지 칸을 숨긴다
  // (깨진 아이콘이 남으면 "데이터가 없는 것"처럼 보인다).
  const chain = [big, src, fallback].filter((u, i, a) => u && a.indexOf(u) === i).slice(1);
  imgEl.hidden = false;
  imgEl.onerror = () => {
    const next = chain.shift();
    if (next) { imgEl.src = next; return; }
    imgEl.onerror = null;
    imgEl.hidden = true;
  };
  imgEl.src = big;
  imgEl.alt = name || "";
  lb.querySelector("#lbClose").setAttribute("aria-label", t("닫기", "Close"));
  lb.querySelector("#lbCap").textContent = name || "";
  lb.querySelector("#lbMarket").innerHTML = cardMarketPanel(card || {});
  if (!lb.open) lb.showModal();
}

function renderPsaTable(psa, updated) {
  const rows = psa.map((c) => {
    const b = rb(c.rarity);
    const gem = c.gem == null ? "-" : `${c.gem}%`;
    const gemClass = c.gem >= 90 ? "gemHi" : c.gem >= 80 ? "gemMid" : "gemLo";
    return `<tr><td class="pCard"><span class="pName">${c.name}</span><span class="pNo">#${c.number}</span></td><td class="pRar"><span class="pBadge" style="--c:${b.c}">${b.s}</span></td><td class="pNumv">${num(c.psa10)}</td><td class="pNumv dim">${num(c.psa9)}</td><td class="pNumv">${num(c.total)}</td><td class="pNumv ${gemClass}">${gem}</td></tr>`;
  }).join("");
  return `<div class="psaWrap" role="region" tabindex="0" aria-label="${t("PSA 통계", "PSA statistics")}"><table class="psaTable"><thead><tr><th class="pCard">${t("카드", "Card")}</th><th class="pRar">${t("등급", "Rarity")}</th><th>PSA 10</th><th>PSA 9</th><th>${t("총계", "Total")}</th><th>${t("PSA10 비율", "PSA10 rate")}</th></tr></thead><tbody>${rows}</tbody></table><p class="note">${t("PSA10 비율 = PSA 10 ÷ 감정 수", "PSA10 rate = PSA 10 ÷ graded")}${updated ? ` · ${t("인구 기준일", "population as of")} ${updated}` : ""}</p></div>`;
}

function renderDataNotice() {
  // 2026-10-15 소유자 결정: 설명 문장(수집 방식·구매 전 확인 안내)을 라벨 토막으로 바꿨다. "Paid Link: …" 제휴 고지 문장은 원문 그대로 둔다(EPN 요건).
  return `<div class="dataNotice"><b>${t("데이터 기준", "Data notes")}</b> ${t(
    "eBay Active = 현재 호가(실거래 아님) · 매물 링크 재검수 매일 03:00 KST · PSA 등급 수 = 매주 월요일, 일본판·영문판 따로. Paid Link: eBay 링크를 통해 적격 구매가 발생하면 OP Box Index가 수수료를 받을 수 있습니다.",
    "eBay Active = listing prices (not sold) · listing links rechecked daily 03:00 KST · PSA counts = Mondays, Japanese and English separate. Paid Link: we may earn a commission from qualifying purchases made through eBay links.",
  )}</div>`;
}

// 상세 헤더 배지: 재판(再販) 기록 날짜. 반다이는 세트별 재판을 공식 발표하지 않으므로
// 이는 유통사/리테일러 출하 기록 — "공식"으로 표기하지 않는다(정확도).
function setBadges(code) {
  const mi = state.data && state.data.marketIndex;
  if (!mi || !mi.reprints || !mi.reprints.bySet) return "";
  const bySet = mi.reprints.bySet[code];
  if (!bySet) return ""; // 조사 안 된 세트(예: 신규)는 표시 안 함 — 모르는 걸 아는 척 안 함
  const href = `sets/${code.toLowerCase()}.html${state.hl === "ko" ? "?hl=ko" : ""}`;
  const ym = (d) => (d ? d.slice(0, 7).replace("-", ".") : "");
  const out = [];

  // 1) 일본판 공식 발매일. 이 원장은 일본판 박스가 기준이고, 페이지 상단의 release 는 영문판 날짜라
  //    여기서 쓰면 안 된다. 반다이 공식 페이지(또는 그 웨이백 사본)로 확인한 것만 싣는다.
  const rel = bySet.jpRelease && bySet.jpRelease.date;
  if (rel) {
    const tipRel = t(
      `일본판 발매일 ${rel} · 반다이 공식 제품 페이지`,
      `Japanese release ${rel} · Bandai official product page`
    ).replace(/"/g, "'");
    out.push(`<a class="setBadge relDate" href="${href}" title="${tipRel}">${t("일본판 발매", "JP release")} ${rel}</a>`);
  }

  // 2) **발매 후** 반다이 추첨판매만. 사전추첨(초회 물량 선배분)과 매장 재입고는 뺀다.
  //    "再販"이라 적힌 추첨(official-reprint-lottery — OP-09 반다이남코샵 2024-10)은 재판 배지, 그 말이 없는 추첨(official-lottery)은 추첨 배지 —
  //    세트 페이지(영문·한국어)와 같은 분류(tools/set-page-shared.js splitReprints, 2026-10-15 4차). 툴팁의 방법 설명 문장(반다이가 재판이라 부르지 않는다는 꼬리)은 뺐다.
  const recs = bySet.reprintRecords || [];
  const shopReprint = recs.filter((r) => r.kind === "official-reprint-lottery");
  const post = recs.filter((r) => r.kind === "official-lottery");
  if (shopReprint.length) {
    const dates = shopReprint.map((r) => ym(r.date)).filter(Boolean).join(", ");
    const tipRp = t(`반다이남코샵 재판(再販) 추첨판매 ${shopReprint.length}회: ${dates}`, `Bandai Namco shop reprint (再販) lottery: ${dates}`).replace(/"/g, "'");
    out.push(`<a class="setBadge lottery" href="${href}" title="${tipRp}">${t("재판 추첨", "Reprint draw")} ${dates}</a>`);
  }
  if (post.length) {
    const dates = post.map((r) => ym(r.date)).filter(Boolean).join(", ");
    const tipPost = t(
      `발매 후 반다이 공식 추첨판매 ${post.length}회: ${dates} · 프리미엄 반다이·반다이남코샵`,
      `${post.length} Bandai official lottery sale(s) after release: ${dates} · Premium Bandai / Bandai Namco shop`
    ).replace(/"/g, "'");
    out.push(`<a class="setBadge lottery" href="${href}" title="${tipPost}">${t("공식 추첨", "Official draw")} ${dates}</a>`);
  } else if (rel && !shopReprint.length) {
    // 발매일은 아는데 발매 후 추첨이 없다 — 조사했고 없었다는 뜻이라 빈칸으로 두지 않는다.
    const tipNone = t(
      `발매 후 반다이 공식 추첨판매 0회`,
      `Bandai official lottery sales after release: 0`
    ).replace(/"/g, "'");
    out.push(`<a class="setBadge reprintNone" href="${href}" title="${tipNone}">${t("발매 후 추첨 없음", "No post-release draw")}</a>`);
  }

  return out.length ? `<span class="setBadges">${out.join("")}</span>` : "";
}

function renderDetail() {
  const pack = currentPacks().find((p) => p.key === state.selected);
  const el = document.querySelector("#detail");
  if (!pack) return;
  updateSeo(pack);
  const set = pack.set;
  const cards = set.cards || [];
  if (!cards.length) {
    // 카드 미집계 세트(예: 신규 OP-16)도 박스 시세가 있으면 죽은 페이지가 아니라 박스 시장을 먼저 보여준다.
    const boxBlocks = `${renderBoxSeries(set, pack.code)}${!set.boxSeries ? renderBoxMarket(set) : ""}${renderBoxTwoNumber(set)}`;
    const hasBox = /emVal|bmRows|opbcMount/.test(boxBlocks);
    const soon = hasBox
      ? t("히트카드 TOP 10 · PSA 통계: 집계 중", "Top 10 chase cards · PSA stats: collecting")
      : t("시세 데이터: 수집 중", "Price data: collecting");
    el.innerHTML = `<div class="detailHead"><img class="detailBox" width="82" height="112" src="${set.box || FALLBACK}" alt="${pack.code} ${t("박스", "box")}" loading="lazy" decoding="async" onerror="this.src='${FALLBACK}'" /><div class="detailInfo"><p class="eyebrow">${pack.code} · ${t("부스터 박스", "Booster Box")}${setBadges(pack.code)} ${pinBtnHtml(pack.code)}</p><h2>${packName(pack)} <small>${packSubName(pack)}</small></h2><p class="pendingCards">${soon}</p><p class="setGuideLinks"><a class="setGuideLink" href="sets/${pack.code.toLowerCase()}.html">${t("세트 가이드 →", "Set guide →")}</a><a class="setGuideLink" href="sets/${pack.code.toLowerCase()}-english.html">${t("영문판 박스 →", "English box →")}</a></p>${hasBox ? `${ebayLinks(pack)}${boxBlocks}${renderDataNotice()}` : ""}</div></div>`;
    el.querySelectorAll(".marketLinks a, .buyLink").forEach((a) => a.addEventListener("click", (event) => {
      event.stopPropagation();
      trackEvent("outbound_click", { pack_code: state.selected, label: a.textContent.trim(), url: a.href });
    }));
    wirePinBtn(el);
  fillBoxMounts();
    return;
  }
  const hasPsa = (set.psa || []).length > 0;
  if (state.view === "psa" && !hasPsa) state.view = "hits";
  // 2026-08-17 에 원화·엔화 병기를 없애고 달러 단일 표기가 됐는데 이 안내문만 옛말을 하고 있었다 —
  // "환산값을 함께 표시합니다"라는 없는 기능을 안내하면 사용자가 존재하지 않는 표기를 찾는다(2026-08-26 감사).
  const body = state.view === "psa" ? renderPsaTable(set.psa, set.psaUpdated) : renderSourceLegend(set) + `<p class="srcNote">USD · ${t("참고 환율", "FX reference")} $1 = ₩${state.data.fx.usdKrw} / ¥1 = ₩${state.data.fx.jpyKrw}</p>`
      // 확대창에 등급 인구가 들어갔는데 눌러볼 수 있다는 걸 알 방법이 없었다 — 그리드 바로 위에서 알린다.
      + `<p class="srcNote zoomHint">${t("카드 이미지 → 크게 보기 · PSA·CGC·TAG 등급", "Card image → enlarge · PSA / CGC / TAG grades")}</p>`
      + renderHitList(cards);
  const fullPsaRate = set.psaFull?.gemRate ?? set.psaGem ?? "-";
  const fullPsaTotal = set.psaFull?.total ?? set.psaTotal;
  el.innerHTML = `<div class="detailHead"><img class="detailBox" width="82" height="112" src="${set.box || FALLBACK}" alt="${pack.code} ${t("박스", "box")}" loading="lazy" decoding="async" onerror="this.src='${FALLBACK}'" /><div class="detailInfo"><p class="eyebrow">${pack.code} · ${t("부스터 박스", "Booster Box")}${setBadges(pack.code)} ${pinBtnHtml(pack.code)}</p><h2>${packName(pack)} <small>${packSubName(pack)}</small></h2><div class="viewTabs"><button class="viewTab ${state.view === "hits" ? "active" : ""}" data-view="hits">${t("시세 TOP 10", "Top 10 prices")}</button><button class="viewTab ${state.view === "psa" ? "active" : ""}" data-view="psa" ${hasPsa ? "" : "disabled"}>${t("PSA 통계", "PSA stats")}</button></div><p class="setGuideLinks"><a class="setGuideLink" href="sets/${pack.code.toLowerCase()}.html">${t("세트 가이드 →", "Set guide →")}</a><a class="setGuideLink" href="sets/${pack.code.toLowerCase()}-english.html">${t("영문판 박스 →", "English box →")}</a></p>${ebayLinks(pack)}${renderBoxSeries(set, pack.code)}${!set.boxSeries ? renderBoxMarket(set) : ""}${renderBoxTwoNumber(set)}${renderPsaDestruction(set)}${renderDataNotice()}${hasPsa && state.view === "psa" ? `<p class="note">${t(`전체 세트 PSA10 비율 ${fullPsaRate}% · 누적 ${num(fullPsaTotal)}장`, `Full-set PSA10 rate ${fullPsaRate}% · ${num(fullPsaTotal)} total grades`)}</p>` : ""}</div></div>${body}`;
  el.querySelectorAll(".viewTab:not([disabled])").forEach((b) => b.addEventListener("click", () => { if (state.view === b.dataset.view) return; state.view = b.dataset.view; renderDetail(); updateUrl(); trackEvent("select_view", { pack_code: state.selected, view: state.view }); }));
  el.querySelectorAll(".marketLinks a, .buyLink").forEach((a) => a.addEventListener("click", (event) => {
    event.stopPropagation();
    trackEvent("outbound_click", { pack_code: state.selected, label: a.textContent.trim(), url: a.href });
  }));
  el.querySelectorAll(".hitName a").forEach((a) => a.addEventListener("click", (ev) => ev.stopPropagation()));
  el.querySelectorAll(".hitThumb").forEach((button) => button.addEventListener("click", () => { const f = button.closest(".hitCard"); const card = cards[Number(f.dataset.cardIndex)] || {}; trackEvent("image_zoom", { pack_code: state.selected, card_name: f.dataset.name }); openLightbox(f.dataset.img, f.dataset.name, card, f.dataset.imgFallback); }));
  wirePinBtn(el);
  fillBoxMounts();
}

function renderStats() {
  const d = state.data;
  const readyCount = (codes) => codes.filter((c) => (d.sets[c]?.cards || []).length > 0).length;
  const jpReady = readyCount(d.jp.list);
  const extraReady = readyCount(d.extra.list);
  const jp = document.querySelector("#statJp");
  const extra = document.querySelector("#statExtra");
  // "OP 15/21" 같은 분수가 라벨 없이 떠서 무슨 수인지 알 수 없었다(2026-08-26 감사).
  // 화면은 탭이라 좁다 — 뜻은 title 툴팁으로 밝힌다.
  const readyTip = t("가격 데이터가 준비된 세트 수 / 전체 세트 수", "sets with price data / all sets");
  if (jp) { jp.textContent = `OP ${jpReady}/${d.jp.list.length}`; jp.title = readyTip; }
  if (extra) { extra.textContent = `${extraReady}/${d.extra.list.length}`; extra.title = readyTip; }
}

function updateSeo(pack) {
  if (!pack) return;
  const koName = pack.nameKo || pack.nameEn || pack.code;
  const enName = pack.nameEn || pack.nameKo || pack.code;
  const isSetPage = state.hasExplicitSet;
  const isHomePage = /\/(?:index\.html)?$/.test(location.pathname);
  const title = isSetPage ? t(
    `${pack.code} ${koName} ${enName} \uBD80\uC2A4\uD130\uBC15\uC2A4 \uC2DC\uC138\u00B7\uD788\uD2B8\uCE74\uB4DC TOP10 | OP Box Index`,
    `${pack.code} ${enName} One Piece Card Prices & Booster Box Price | OP Box Index`,
  ) : isHomePage ? t(
    "\uC6D0\uD53C\uC2A4 \uBD80\uC2A4\uD130\uBC15\uC2A4\u00B7PSA10 \uCE74\uB4DC \uC2DC\uC138 | opboxindex",
    "OP Box Index \u2014 One Piece Box Prices",
  ) : t(
    "\uC6D0\uD53C\uC2A4 \uBD80\uC2A4\uD130\uBC15\uC2A4 \uC804 \uC138\uD2B8 \uC2DC\uC138 | opboxindex",
    "One Piece Booster Box Prices by Set",
  );
  const description = isSetPage ? t(
    `${pack.code} ${koName}(${enName}) \uBD80\uC2A4\uD130\uBC15\uC2A4 \uAC00\uACA9, eBay \uC2DC\uC138, TOP10 \uD788\uD2B8\uCE74\uB4DC, NM, PSA10, PSA \uD1B5\uACC4\uB97C \uBE44\uAD50\uD569\uB2C8\uB2E4.`,
    `Compare ${pack.code} ${enName} One Piece card prices, Japanese booster box prices, eBay sold and active market data, Top 10 chase cards, NM prices, PSA 10 prices and PSA population stats.`,
  ) : isHomePage ? t(
    "\uC6D0\uD53C\uC2A4 \uBD80\uC2A4\uD130\uBC15\uC2A4 \uC2DC\uC138, \uC6D0\uD53C\uC2A4 PSA10 \uCE74\uB4DC \uC2DC\uC138, \uBD80\uC2A4\uD130\uD329 \uC2DC\uC138\uC815\uBCF4, eBay \uCD5C\uC800\uAC00\u00B7\uD310\uB9E4\uC644\uB8CC \uAE30\uC900, \uD788\uD2B8\uCE74\uB4DC TOP10\uACFC PSA \uD1B5\uACC4\uB97C \uD55C \uBC88\uC5D0 \uBE44\uAD50\uD569\uB2C8\uB2E4.",
    "One Piece booster box and PSA 10 prices from eBay sold data, updated daily.",
  ) : t(
    "OP-01\uBD80\uD130 EB\u00B7PRB\uAE4C\uC9C0 \uC77C\uBCF8\uC5B4\uD310\u00B7\uC601\uBB38\uD310 \uC6D0\uD53C\uC2A4 \uBD80\uC2A4\uD130\uBC15\uC2A4 \uC804 \uC138\uD2B8\uC758 \uC2E4\uAC70\uB798, \uCD5C\uC800 \uB9E4\uBB3C\uACFC \uAC00\uACA9 \uCD94\uC774\uB97C \uBE44\uAD50\uD569\uB2C8\uB2E4.",
    "Japanese and English One Piece booster box prices from eBay sold data.",
  );
  // 홈·목록 페이지의 **영문** 제목/설명은 정적 HTML 이 유일한 진실원이다 — 여기서 또 쓰면
  // 정적값과 렌더 후 값이 갈라지고, 구글은 렌더 후를 읽어 한쪽만 고쳤을 때 조용히 어긋난다
  // (2026-09-16 실측: 정적 57자 vs 렌더 후 35자). 세트 페이지는 URL 마다 내용이 달라 런타임이 맞고,
  // 한국어 표시는 네이버가 JS 를 안 돌려 색인과 무관하므로 탭 제목 UX 로만 바꾼다.
  // 영문으로 되돌아올 때 정적 원문을 복원해야 한다 — 안 하면 한국어 제목이 탭에 그대로 남는다(2026-09-16 실측).
  const setMeta = (sel, v) => { const el = document.querySelector(sel); if (el) el.setAttribute("content", v); };
  if (!window.__opboxStaticSeo) {
    window.__opboxStaticSeo = {
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
      ogDesc: document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "",
    };
  }
  if (!isSetPage && state.hl !== "ko") {
    const st = window.__opboxStaticSeo;
    document.title = st.title;
    setMeta('meta[name="description"]', st.desc);
    setMeta('meta[property="og:title"]', st.ogTitle);
    setMeta('meta[property="og:description"]', st.ogDesc);
  }
  if (isSetPage || state.hl === "ko") {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  }
  // canonical 은 JS 로 바꾸지 않는다(2026-09-29). 정적 HTML 의 canonical(index.html·packs.html 둘 다 "/")을 그대로 둔다.
  // 종전엔 ?set= 로 들어오면 canonical 을 packs.html 의 set 파라미터 변형(noindex)으로 바꿔 썼다. 세트 페이지 44곳의 주 CTA 가
  // /?set=CODE 로 링크돼 있어 색인 불가 URL 88개가 생겼고, 7월 홈이 검색에서 사라진 사고와 같은 중복 클러스터였다.
  // 구글 JS SEO 문서도 JS 로 기존 canonical 을 바꾸는 것을 잘못된 구현으로 적는다.
  // (compare.html 은 load() 에서 updateSeo 전에 return 하므로 여기 오지 않는다.)
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = `${SITE_BASE}/`;
    document.head.appendChild(canonical);
  }
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical.href);
  document.documentElement.lang = state.hl === "en" ? "en" : "ko";
  document.querySelector('meta[property="og:locale"]')?.setAttribute("content", state.hl === "en" ? "en_US" : "ko_KR");
  document.querySelectorAll('meta[property="og:locale:alternate"]').forEach((node) => node.remove());
  const altLocale = document.createElement("meta");
  altLocale.setAttribute("property", "og:locale:alternate");
  altLocale.setAttribute("content", state.hl === "en" ? "ko_KR" : "en_US");
  document.head.appendChild(altLocale);
  upsertHreflang(pack);
  setJsonLd("packStructuredData", {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: title.replace(" | OP Box Index", ""),
    description,
    url: canonical.href,
    image: isSetPage && pack.set?.box ? new URL(pack.set.box, location.href).href : undefined,
    inLanguage: state.hl === "en" ? "en-US" : "ko-KR",
    isAccessibleForFree: true,
    license: `${SITE_BASE}/disclaimer.html#data-license`,
    usageInfo: `${SITE_BASE}/disclaimer.html#data-license`,
    creator: { "@type": "Organization", name: "OP Box Index", url: `${SITE_BASE}/` },
    dateModified: state.data?.updated || undefined,
    spatialCoverage: ["United States", "Japan", "Singapore", "Malaysia", "Philippines", "Thailand", "Vietnam", "Indonesia"],
    variableMeasured: ["Booster box price", "Top 10 hit cards", "NM price", "PSA10 price", "PSA population"],
    keywords: [
      ...(isSetPage ? [`${pack.code}`, koName, enName] : []),
      "One Piece Card Game",
      "One Piece card prices",
      "One Piece card price",
      "One Piece booster box prices",
      "Japanese booster box price",
      "One Piece booster box investment",
      "One Piece sealed box",
      "PSA 10 population",
      "eBay sold prices",
      "TCG Southeast Asia",
      "Singapore TCG",
      "Malaysia TCG",
      "Philippines TCG",
      "Thailand TCG",
      "Vietnam TCG",
      "\uC6D0\uD53C\uC2A4 \uCE74\uB4DC\uAC8C\uC784",
      "\uBD80\uC2A4\uD130\uBC15\uC2A4 \uC2DC\uC138",
      "PSA10",
      "eBay",
    ],
  });
}

initDisplayLanguage();
load();
