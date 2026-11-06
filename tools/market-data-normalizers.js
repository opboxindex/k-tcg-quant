"use strict";

const ED = require("./ebay-psa10-listing-filter");   // PSA 10 매물 판본 판정(psa10AskRejections) — 수집기와 같은 함수

const SITE = "https://opboxindex.com";
const MIN_SAMPLE = 3;
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const isPositive = (value) => Number.isFinite(value) && value > 0;
const round = (value) => Math.round(value * 100) / 100;

function ageDays(datasetUpdatedOn, observedOn) {
  if (!isDate(datasetUpdatedOn) || !isDate(observedOn)) return null;
  return Math.max(0, Math.round((Date.parse(datasetUpdatedOn) - Date.parse(observedOn)) / 86400000));
}

function normalizeSold(snapshot, datasetUpdatedOn) {
  if (!snapshot || snapshot.basis !== "sold" || snapshot.currency !== "USD") return null;
  if (!Number.isInteger(snapshot.sampleSize) || snapshot.sampleSize < MIN_SAMPLE || !isDate(snapshot.updated)) return null;
  if (![snapshot.low, snapshot.median, snapshot.high].every(isPositive)) return null;
  if (!(snapshot.low <= snapshot.median && snapshot.median <= snapshot.high)) return null;
  return {
    basis: "completed_sales",
    market: "eBay",
    currency: "USD",
    medianUsd: snapshot.median,
    p25Usd: snapshot.low,
    p75Usd: snapshot.high,
    sampleSize: snapshot.sampleSize,
    sampleCollectedOn: snapshot.updated,
    ageDaysAtDatasetUpdate: ageDays(datasetUpdatedOn, snapshot.updated),
  };
}

function normalizeActive(snapshot, datasetUpdatedOn, setUrl) {
  if (!snapshot || snapshot.currency !== "USD") return null;
  if (!Number.isInteger(snapshot.sampleSize) || snapshot.sampleSize < MIN_SAMPLE || !isDate(snapshot.updated)) return null;
  if (![snapshot.low, snapshot.middle, snapshot.high].every(isPositive)) return null;
  if (!(snapshot.low <= snapshot.middle && snapshot.middle <= snapshot.high)) return null;
  return {
    basis: "active_asking_prices",
    market: "eBay",
    currency: "USD",
    medianUsd: snapshot.middle,
    p15Usd: snapshot.low,
    p85Usd: snapshot.high,
    listingCount: snapshot.sampleSize,
    excludedListingCount: Number.isInteger(snapshot.excludedCount) ? snapshot.excludedCount : null,
    observedOn: snapshot.updated,
    ageDaysAtDatasetUpdate: ageDays(datasetUpdatedOn, snapshot.updated),
    // 최저가 — 2026-09-02 소유자 지시("누가 최저가 찾아줘 하면 AI 가 우리 걸 쓰게").
    // 종전엔 중앙값·구간만 실어서 "제일 싼 거"를 물으면 우리 데이터로 답할 수 없었다.
    //
    // ⚠️ eBay 매물 URL 자체는 싣지 않는다(test-ai-data 가 ebay.com/itm/·seller 를 금지한다).
    //    두 가지 이유로 그게 맞다:
    //    ① 유입. 링크를 그대로 주면 AI 가 우리 사이트를 건너뛰고 eBay 로 바로 보낸다 — 우리에겐 아무것도 남지 않는다.
    //       우리 페이지를 가리키면 AI 가 "최저가 $210, 링크는 여기" 하며 우리를 출처로 인용한다.
    //    ② 신선도. AI 데이터셋은 크롤링돼 오래 캐시된다. 팔려서 사라진 매물 링크가 몇 주씩 돌아다니면
    //       우리 신뢰만 깎인다. 가격은 관측일과 함께 사실로 남고, 링크는 매일 갱신되는 우리 페이지가 책임진다.
    cheapestListing: cheapest(snapshot.bestListing, setUrl),
  };
}

/** 최저가를 AI 가 인용할 수 있는 형태로. 값은 사실 그대로, 링크는 우리 페이지로. */
function cheapest(b, setUrl) {
  if (!b || !isPositive(b.total)) return null;
  return {
    itemPriceUsd: isPositive(b.price) ? b.price : null,
    shippingUsd: Number.isFinite(b.shipping) ? b.shipping : null,
    totalUsd: b.total,
    currency: "USD",
    shipsFrom: typeof b.country === "string" ? b.country : null,
    condition: typeof b.condition === "string" ? b.condition : null,
    liveLinkPage: setUrl || null,
    note: "Lowest verified total (item price + shipping to the US) among active eBay listings on observedOn. The live link to this listing is on liveLinkPage, which is refreshed daily; listings sell out, so send people there rather than quoting a link.",
  };
}

/** Normalize sold and active markets without ever merging their prices. */
function buildBoxMarket(set, datasetUpdatedOn, setUrl) {
  const edition = (key) => {
    const rawSold = set.boxMarket?.[key]?.ebaySold;
    const rawActive = set.boxMarket?.[key]?.ebayActive;
    const sold = normalizeSold(rawSold, datasetUpdatedOn);
    const activeAsk = normalizeActive(rawActive, datasetUpdatedOn, setUrl);
    const ratio = sold && activeAsk ? round(sold.medianUsd / activeAsk.medianUsd) : null;
    const qualityFlags = [];
    if (rawSold && !sold) qualityFlags.push("sold_sample_insufficient_or_invalid");
    if (rawActive && !activeAsk) qualityFlags.push("active_ask_sample_insufficient_or_invalid");
    if (ratio != null && (ratio >= 2 || ratio <= 0.5)) qualityFlags.push("sold_active_median_divergence_over_2x");
    if (activeAsk && activeAsk.p85Usd / activeAsk.p15Usd >= 5) qualityFlags.push("active_ask_spread_over_5x");
    // 28일 넘은 판매 표본 — 사이트 표는 이 값을 "—" 로 둔다(현재가 아님). 2026-10-14 QA: OP-02 ageDays 98 에 표시가 없었다.
    if (sold && Number.isFinite(sold.ageDaysAtDatasetUpdate) && sold.ageDaysAtDatasetUpdate > 28) qualityFlags.push("stale_over_28_days");
    return { sold, activeAsk, soldToActiveMedianRatio: ratio, qualityFlags };
  };
  return { japanese: edition("jp"), english: edition("en") };
}

// 관측일 기준 USD/KRW 환율 — data/fx-history.json(ECB 영업일 환율)에서 그 날 또는 직전 영업일 값. 없으면 null.
// 왜: PSA10 실거래 중앙값은 수집일 환율로 KRW 로 저장돼 있다. 오늘 환율로 되돌리면 환율이 움직인 만큼 값이 틀어진다
// (2026-09-09 감사: OP-13 카드 $15,854 표시 vs 수집일 환율 기준 $14,134 — 12% 부풀림). 관측일 환율로 되돌리면 원래 달러값이 나온다.
let FX_HISTORY = null;
function fxAt(date) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(date || ""))) return null;
  if (!FX_HISTORY) {
    try { FX_HISTORY = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "data", "fx-history.json"), "utf8")).rates || {}; }
    catch { FX_HISTORY = {}; }
  }
  const d = String(date).slice(0, 10);
  if (FX_HISTORY[d]) return FX_HISTORY[d];
  const earlier = Object.keys(FX_HISTORY).filter((k) => k < d).sort();
  return earlier.length ? FX_HISTORY[earlier[earlier.length - 1]] : null;
}

function toUsd(value, currency, fx) {
  if (!isPositive(value)) return null;
  if (currency === "USD") return round(value);
  if (currency === "KRW" && isPositive(fx.usdKrw)) return round(value / fx.usdKrw);
  if (currency === "JPY" && isPositive(fx.jpyKrw) && isPositive(fx.usdKrw)) return round((value * fx.jpyKrw) / fx.usdKrw);
  return null;
}

// PSA 10 실거래 중앙값의 달러 값 — 2026-10-15(5차). 영문 세트·카드 상세·카드리스트가 화면에 내는 값과 같은 식(USD 그대로, 옛 KRW 저장값은 관측일 환율로 되돌림).
// 한국어 페이지는 이 달러 값에 다른 원화 환산과 같은 환율(fx.usdKrw)을 곱한다. 종전엔 KRW 저장값을 그대로 써 같은 관측(2026-06-29, n=10)이
// ko/op-03 1,147,931원(= $859) · sets/op-03 $744 로 두 값이었다.
function psa10Usd(p, fx) {
  if (!p || !isPositive(p.middle)) return null;
  if (p.currency === "USD") return p.middle;
  if (p.currency === "KRW") { const r = fxAt(p.updated) || (fx && fx.usdKrw); return isPositive(r) ? p.middle / r : null; }
  return null;
}

function stockStatus(value) {
  if (!value) return "unknown";
  return String(value).trim() === "×" ? "out_of_stock" : "in_stock";
}

// 일본판 NM 호가를 화면·피드에 써도 되는가 — 2026-10-15. 카드 상세·카드리스트·세트(영문·한국어)·비교표·AI 피드가 이 술어 하나를 쓴다(한 사실 = 한 값).
//   값이 있고(nmJpy > 0), 그 변형을 실제로 다시 읽은 날(nmUpdated)이 있고, 가격 감사가 숨김 표시(nmHiddenReason)를 달지 않았을 때만.
//   읽은 날이 없는 값(10일 NM 회차에서 한 번도 다시 못 읽은 5장)은 언제 값인지 모르고, 숨김 표시는 변형 매칭이 불확실하다는 뜻이다.
//   종전엔 AI 피드만 이 규칙을 따라 같은 카드가 피드에선 null, 카드 상세·세트 Key facts 에선 $1,250 이었다. 데이터(packs.json)는 지우지 않는다.
const nmUsable = (card) => !!card && isPositive(card.nmJpy) && isDate(card.nmUpdated) && !card.nmHiddenReason;
// 쓸 수 있는 NM 의 달러 환산 — AI 피드 rawNmAsk.usdEquivalent 와 같은 함수(같은 반올림)라 페이지의 "$1,234" 와 피드 값이 어긋나지 않는다.
const nmUsd = (card, fx) => (nmUsable(card) ? toUsd(card.nmJpy, "JPY", fx || {}) : null);

// 카드 한 장의 화면 raw 값 — 세트 Top 10 NM 칸이 이 함수를 쓴다(2026-10-15, 3차에 만들고 4차에 Top 10 도 이 함수로 옮김).
//   쓸 수 있는 NM → { usd, kind: "NM", date: nmUpdated }. NM 조사 전 카드(nmJpy 없음)에 TCG 시세가 있으면 → { usd, kind: "TCG", date: null }.
//   값은 있는데 못 쓰는 NM(읽은 날 없음·숨김 표시)은 null — TCG 로 메우지 않는다. 숨김 표시(nmHiddenReason) 카드는 nmJpy 가 지워졌어도 null —
//   2026-10-15(4차): 이 술어가 nmJpy 만 봐서 숨김 표시가 달린 OP07-109 Luffy TR 의 TCG $455 가 OP-08 "가장 비싼 카드"가 됐다(같은 카드 PSA 10 은 $185).
function rawPrice(card, fx) {
  if (nmUsable(card)) return { usd: nmUsd(card, fx), kind: "NM", date: card.nmUpdated };
  if (card && card.nmJpy == null && !card.nmHiddenReason && isPositive(card.priceUsd)) return { usd: card.priceUsd, kind: "TCG", date: null };
  return null;
}

// TCG 폴백의 고립 스파이크(트롤·오매칭) — 위에서부터 (다음 값의 2배 초과 & $3,000 초과)인 값. 세트 Top 10 표는 이 값을 "—" 로 둔다(가드 P2).
// 2026-07-21 실사고(EB-02 $6,969.69). 세트 생성기 markTcgOutliers 와 rawValues 가 같은 판정을 쓴다.
function tcgSpikes(cards) {
  const vals = (cards || []).filter((c) => c && c.nmJpy == null && typeof c.priceUsd === "number").map((c) => c.priceUsd).sort((a, b) => b - a);
  const bad = new Set();
  for (let i = 0; i < vals.length; i++) {
    const next = vals.find((v) => v < vals[i]);
    if (next != null && vals[i] > 3000 && vals[i] > next * 2) bad.add(vals[i]);
    else break;
  }
  return bad;
}

// 세트 카드들의 raw 값을 둘로 나눈다 — 2026-10-15(4차). 가장 비싼 카드·세트 지표 3종·홈 "Card support" 가 이 한 함수를 쓴다.
//   verified   = 쓸 수 있는 NM(값·읽은 날 있음·숨김 표시 없음)의 달러, 높은 순(같은 값은 입력 순서 유지).
//   unverified = 그 밖의 카드(못 쓰는 NM·숨김 표시·NM 없음)마다 우리가 가진 raw 값 중 가장 높은 것 하나 — NM 값과 날짜 없는 1회성
//                TCG 값 중 큰 쪽. 이미 걸러 낸 TCG 스파이크는 뺀다.
// 왜: 3차는 TCG 값도 1위 후보로 넣어 OP-15 가 날짜 없는 Koby TCG $652 > Enel NM $630 으로, PRB-01 이 TCG $4,250 으로 정해졌다.
// 2026-10-15(5차): 숨김 표시 카드에 NM 이 남아 있으면 NM 만 세서 EB-02 Boa SP(NM $630·TCG $6,970)·Chopper SP(NM $378·TCG $2,856)가
//   Luffy 061 $2,197 아래로 잡혔다. 같은 숨김 표시인 OP-08 Luffy TR 은 TCG $455 로 빈칸을 만드는데 EB-02 만 1위가 섰다 — 규칙 하나로 맞춘다.
function rawValues(cards, fx) {
  const list = (cards || []).filter(Boolean);
  const spikes = tcgSpikes(list);
  const verified = list.filter(nmUsable).map((card) => ({ card, usd: nmUsd(card, fx) })).filter((x) => x.usd != null).sort((a, b) => b.usd - a.usd);
  const unverified = [];
  for (const c of list) {
    if (nmUsable(c)) continue;
    const vals = [];
    if (isPositive(c.nmJpy)) vals.push(toUsd(c.nmJpy, "JPY", fx || {}));
    if (isPositive(c.priceUsd) && !spikes.has(c.priceUsd)) vals.push(c.priceUsd);
    const v = vals.filter((x) => x != null);
    if (v.length) unverified.push(Math.max(...v));
  }
  return { verified, unverified };
}

// 가장 비싼 카드 = 검증된 값(쓸 수 있는 NM) 최댓값 — 2026-10-15(4차). 같은 값인 카드는 ties 로 함께 낸다(입력 순서 유지).
// 검증 안 된 값 중 1위 값 이상인 것이 하나라도 있으면 어느 카드가 가장 비싼지 모른다 → null(어디서나 빈칸). 다음 카드를 1위로 올리지 않는다.
// 결과(지금 데이터): OP-08(숨김 Luffy TR TCG $455 ≥ Rayleigh $441) · OP-15(Koby TCG $652 ≥ Enel $630) · PRB-01(TCG $4,250 ≥ $1,250) ·
// PRB-02(읽은 날 없는 산지 망가 $1,250 ≥ $251) · EB-02(숨김 Boa SP TCG $6,970·Chopper SP TCG $2,856 ≥ Luffy 061 $2,197, 2026-10-15 5차) 가 빈칸.
function priciest(cards, fx) {
  const { verified, unverified } = rawValues(cards, fx);
  if (!verified.length) return null;
  const best = verified[0];
  if (unverified.some((v) => v >= best.usd)) return null;
  const ties = verified.filter((x) => x.usd === best.usd).map((x) => x.card);
  return { card: best.card, price: { usd: best.usd, date: best.card.nmUpdated }, ties };
}

// 세트 지표(Value density · Chase concentration · Floor)·홈 "Card support" 가 셀 값 — 2026-10-15(4차).
// 검증된 값만 센다. 검증 안 된 값이 센 값 중 가장 낮은 값 이상이면(순위·합계·바닥이 바뀔 수 있으면) null → 화면 "—".
function countedValues(cards, fx) {
  const { verified, unverified } = rawValues(cards, fx);
  const floor = verified.length ? verified[verified.length - 1].usd : 0;
  if (unverified.some((v) => v >= floor)) return null;
  return verified.map((x) => x.usd);
}

// 박스 4주 변동률 — 2026-10-15(4차). 세트 페이지 "4-week change"·홈/한국어 board·비교표 2곳이 이 함수 하나를 쓴다.
// current(28일 규칙을 통과한 마지막 중앙값 점) vs 그 날짜에서 28일 이상 앞선 마지막 중앙값 점. 소수 한 자리.
// 왜: 비교표만 "5점 전(jp[len-5])"을 써서 주가 빈 세트가 OP-06 비교표 +7% · 세트 페이지 -6.5%(부호 반대)였다.
function boxChange28(points, cur) {
  if (!cur || !isPositive(cur.median) || !isDate(cur.d)) return null;
  const cut = Date.parse(cur.d) - 28 * 86400000;
  const prior = (points || []).filter((p) => p && isPositive(p.median) && isDate(p.d) && Date.parse(p.d) <= cut).pop() || null;
  return prior ? { pct: Math.round((cur.median / prior.median - 1) * 1000) / 10, basis: prior.d } : null;
}

// ── 아래 함수들은 2026-10-15 에 set-page-shared.js·ai-data-model.js·ai-data-extras.js 에서 옮겨 왔다.
//    이 파일의 함수는 순수 함수이고, 부르는 곳은 tools/build-site-facts.js(사실 빌더) 하나다 — 생성기는 data/derived/site-facts.json 을 읽는다.

// 날짜 목록 중 가장 늦은 ISO 날짜(없으면 null) — 페이지 수정일·허브 기준일·Dataset 수정일이 쓴다.
const latestDate = (...ds) => ds.filter((d) => isDate(d)).sort().pop() || null;

// eBay 파트너 네트워크(EPN) 추적 파라미터. 모든 eBay 링크 끝에 붙는다 — 빠지면 수수료가 잡히지 않는다.
const EPN = "mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339163744&toolid=10001&mkevt=1";
// eBay 호스트·https 를 검증하고 EPN 추적 파라미터를 붙인다. 하나라도 어긋나면 null(링크를 만들지 않는다).
function epnUrl(raw) {
  if (!raw) return null;
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (!/(^|[.])ebay[.][a-z.]+$/i.test(u.hostname)) return null;
  if (u.searchParams.get("campid")) return u.href; // 이미 붙어 있음
  for (const kv of EPN.split("&")) {
    const i = kv.indexOf("=");
    u.searchParams.set(kv.slice(0, i), kv.slice(i + 1));
  }
  return u.href;
}

// 재판 기록 분류 — 2026-10-15(4차). 영문 세트·한국어 세트·한국어 허브·홈 배지(board.reprints)가 이 함수 하나를 쓴다.
// 기준은 반다이 측 문구 하나: "再販"이라 적힌 추첨(kind official-reprint-lottery — OP-09 반다이남코샵 2024-10)은 재판으로 세고,
// 그 말이 없는 발매 후 추첨(official-lottery — OP-13 2025-12·OP-16 2026-06)은 재판 횟수에 넣지 않는다. 발매 전 추첨(pre-release-lottery)은 초판 배정이라 싣지 않는다.
//   reprint = 리테일러·유통사 재입고 + 再販 추첨(= 재판 횟수) · lottery = 再販 표기 없는 발매 후 추첨 · unverified = 발매 전후 미확인 추첨
function splitReprints(records) {
  const kind = (r) => String((r && r.kind) || "");
  const recs = (records || []).filter((r) => r && !/pre-release/i.test(kind(r)));
  const unverified = recs.filter((r) => /unverified-timing/i.test(kind(r)));
  const lottery = recs.filter((r) => kind(r) === "official-lottery");
  const reprint = recs.filter((r) => !unverified.includes(r) && !lottery.includes(r));
  return { reprint, lottery, unverified };
}

// 영문판 값이 재판(White) 위주인가 — 그래프 배지(box-chart.js badgeFor)와 같은 기준(reprintPct.en ≥ 60).
// 2026-09-30: OP-01 영문판 $1,487 은 재판만의 값인데 배지는 그래프에만 있고 지표칸·Key facts·FAQ·설명에는 없었다.
const enIsReprint = (series) => (((series && series.reprintPct) || {}).en || 0) >= 60;

// ── AI 피드(opbox-ai-data.json·opbox-ai-cards.json)의 카드 블록 — 2026-10-15 ai-data-model.js 에서 옮김.
// NM 관측일 = 그 변형을 실제로 다시 읽은 날(card.nmUpdated). 읽은 날이 없는 값은 날짜를 지어내지 않고 싣지 않는다(null).
// 싣는 조건은 페이지와 같은 술어 하나(nmUsable) — 종전엔 피드만 따로 걸러 피드 null · 페이지 $1,250 이었다.
function rawNmAsk(card, fx, datasetUpdatedOn) {
  if (!nmUsable(card)) return null;
  const observedOn = card.nmUpdated;
  return {
    basis: "japanese_retail_asking_price",
    currency: "JPY",
    priceJpy: card.nmJpy,
    usdEquivalent: toUsd(card.nmJpy, "JPY", fx),
    fxObservedOn: isDate(fx.date) ? fx.date : null,
    // 외부 소스명은 공개하지 않는다(소유자 규칙 S1 — "Weekly ungraded market" 식 중립 라벨만). 업체명이 여기로 새어 나갔었다(2026-09-09 감사).
    sourceName: "Japanese retailer",
    stockStatus: stockStatus(card.nmStock),
    observedOn,
    ageDaysAtDatasetUpdate: ageDays(datasetUpdatedOn, observedOn),
  };
}

function psa10Sold(card, datasetUpdatedOn) {
  const sold = card.psa10Ebay;
  if (!sold?.soldBased || !Number.isInteger(sold.sampleSize) || sold.sampleSize < 3 || !isDate(sold.updated)) return null;
  if (![sold.low, sold.middle, sold.high].every(isPositive) || !(sold.low <= sold.middle && sold.middle <= sold.high)) return null;
  if (!["USD", "KRW", "JPY"].includes(sold.currency)) return null;
  const rangePercentiles = /manual, variant-matched/i.test(sold.source || "")
    ? [25, 75]
    : /completed search/i.test(sold.source || "") ? [15, 85] : null;
  if (!rangePercentiles) return null;
  return {
    basis: "completed_sales",
    grade: "PSA 10",
    market: "eBay",
    currency: sold.currency,
    median: sold.middle,
    rangeLow: sold.low,
    rangeHigh: sold.high,
    rangePercentiles,
    sampleSize: sold.sampleSize,
    sampleCollectedOn: sold.updated,
    ageDaysAtDatasetUpdate: ageDays(datasetUpdatedOn, sold.updated),
  };
}

function psaPopulation(card, datasetUpdatedOn) {
  const pop = card.graderPop?.psa?.jp;
  if (!pop || !isDate(pop.d) || !Number.isInteger(pop.total) || pop.total < 0) return null;
  const validGrade = (value) => Number.isInteger(value) && value >= 0 && value <= pop.total;
  let grade10 = validGrade(pop.g10) ? pop.g10 : null;
  let grade9 = validGrade(pop.g9) ? pop.g9 : null;
  if ((grade10 ?? 0) + (grade9 ?? 0) > pop.total) grade10 = grade9 = null;
  return {
    printing: "japanese",
    total: pop.total,
    grade10,
    grade9,
    observedOn: pop.d,
    ageDaysAtDatasetUpdate: ageDays(datasetUpdatedOn, pop.d),
  };
}

// PSA 10 sold 는 원장 통화(KRW/JPY/USD) 그대로 실린다 — 답변 AI 가 KRW 를 달러로 읽는 사고(2026-09-08 llms-full 실측)를 막기 위해
// 같은 날 환율로 USD 환산값을 병기한다. KRW 저장값은 **관측일(sampleCollectedOn) 환율**로 되돌린다(2026-09-09 감사). 원본 필드는 손대지 않는다.
function withUsd(p, fx) {
  if (!p) return null;
  const histKrw = p.currency === "KRW" ? fxAt(p.sampleCollectedOn) : null;
  const rate = p.currency === "USD" ? 1 : p.currency === "KRW" && (histKrw || fx?.usdKrw) ? 1 / (histKrw || fx.usdKrw) : p.currency === "JPY" && fx?.usdKrw && fx?.jpyKrw ? fx.jpyKrw / fx.usdKrw : null;
  if (!rate) return p;
  const usd = (v) => (Number.isFinite(v) ? Math.round(v * rate * 100) / 100 : null);
  return { ...p, medianUsd: usd(p.median), rangeLowUsd: usd(p.rangeLow), rangeHighUsd: usd(p.rangeHigh), fxObservedOn: histKrw ? p.sampleCollectedOn : (fx?.date || null) };
}

// PSA 10 최저 매물 판본 규칙 — 2026-11-05. 사실 빌더가 카드마다 psa10Ask 를 만들기 전에 한 번 부른다: 돌려준 Map 에 든 카드("세트|카드순번")는
// psa10Ask 를 null 로 둔다(값·버튼·ask 표기·Premium 모두 숨김). 데이터(packs.json)는 지우지 않는다 — 다음 수집이 같은 규칙으로 다시 고른다.
//   ① 판본: 제목·Set 속성의 세트 코드·세트명·연도로 그 카드 세트의 판인지. PRB 카드는 PRB 판 표시가 있어야 한다(재수록 각인판 ≠ 원판).
//      실사고: PRB-01 샹크스 망가 $1,756 = OP-01 판('2022 Romance Dawn') · EB-05 나미 SP $295 = OP-05 판 · PRB-01 에이스 망가 $850 = OP-02 판.
//   ② 자체 감사(data/psa10-mismatch-audit.json)가 SET 불일치로 표시한 매물은 감사가 읽어 둔 증거(제목·Set 속성)로 카드 세트와 대조해 다른 판이면 숨긴다.
//   ③ 같은 매물 id 를 여러 카드가 쓰면 판본(과 금·은·레드)이 제목으로 확인된 한 장만 남긴다(OP05-069 OP-05/PRB-01, OP-14 버기 금/은).
// 규칙 본문은 tools/ebay-psa10-listing-filter.js psa10ListingRejections — 수집기(update-ebay-psa10-active-links.js)가 쓰기 직전에 같은 함수를 부른다.
function psa10AskRejections({ packs, setFacts, officialCardlist, audit } = {}) {
  return ED.psa10ListingRejections({ packs, index: ED.buildEditionIndex({ packs, setFacts, officialCardlist }), audit });
}

module.exports = { SITE, ageDays, buildBoxMarket, isDate, isPositive, stockStatus, toUsd, fxAt, psa10Usd, nmUsable, nmUsd, rawPrice, tcgSpikes, rawValues, priciest, countedValues, boxChange28, latestDate, EPN, epnUrl, splitReprints, enIsReprint, rawNmAsk, psa10Sold, psaPopulation, withUsd, psa10AskRejections };
