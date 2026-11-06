// 원피스 경매 시장 전수 스캔 — "무엇이 경매에 얼마나 나오고, 얼마에 붙고 있는가"를 매일 기록한다.
//
// 왜 별도 도구인가: fetch-auction-deals.js 는 "3시간 내 종료" 창만 본다. 그건 사이트에 띄울
// 목록용이지 시장 관측용이 아니다. 어떤 세트·어떤 카드가 경매에 많이 나오는지 알려면
// 진행 중인 경매 전체를 훑어야 한다.
//
// 왜 지금부터 쌓나: 시계열은 소급 수집이 안 된다. 오늘 안 쌓으면 오늘 데이터는 영원히 없다.
//
// ⚠️ 정확도 원칙
//  - 제목에서 세트/카드번호를 "확신할 때만" 분류한다. 애매하면 unclassified 로 두고 억지로 안 넣는다.
//    틀린 분류로 만든 그래프는 빈 그래프보다 나쁘다.
//  - 이건 전수조사가 아니라 표본이다. eBay 가 알려준 전체 건수(totalReported)를 같이 기록해
//    나중에 커버리지를 판단할 수 있게 한다.
//  - currentBid 는 "지금 붙은 값"이지 낙찰가가 아니다. 필드명·note 에서 절대 sold 로 부르지 않는다.
//
// Run: node tools/collect-auction-market.js
const fs = require("fs");
const path = require("path");
const { isExcludedEbaySellerOrLocation } = require("./ebay-listing-filters");
const { parseLotQuantity } = require("./lot-quantity");

const ROOT = path.join(__dirname, "..");

// 보관 기간. 이 파일은 하루 4번 다시 쓰인다(=커밋마다 새 blob) — 무한정 키우면 저장소가 불어난다.
// 180일이면 계절성·발매 전후 비교에 충분하다.
const KEEP_DAYS = 180;
const TOP_CARDS = 25;
const TOP_CARDS_DAYS = 30;   // 인기 카드는 "지금 뜨는 것"이 쓸모라 최근 것만 남긴다
const MIN_SET_N = 2;         // 표본 1건짜리 세트는 잡음이라 기록하지 않는다
const PAGES = 50;           // 밴드당 최대 페이지(200×50=10,000 = eBay 페이징 상한). 실제로는 밴드가 소진되면 조기 종료된다.
const PAGE_SIZE = 200;
// 가격 밴드 — 각 구간이 10,000건(eBay 페이징 상한) 아래가 되도록 실측해 나눈 값.
// 상한 없는 마지막 구간은 고가라 항상 얇다.
const PRICE_BANDS = [["0","2"],["2","5"],["5","10"],["10","20"],["20","50"],["50","100"],["100","300"],["300","99999"]];

// fetch-auction-deals.js 와 같은 배제 규칙 — 시세에서 뺀 걸 관측에 넣으면 통계가 오염된다.
const JUNK = /proxy|custom|orica|digital|reprint\s*card|fan\s*made|not\s*official|sticker|playmat|sleeve|binder|deck\s*box|empty|damaged|water|bent/i;

// ⚠️ 표본 편향 주의: endingSoonest 로 검색어당 600건만 긁으므로, 일반 검색어만 쓰면 회전이 빠른
//    싱글카드가 표본을 독점한다(실측: 1,158건 중 박스 1건). 박스·팩은 전용 검색어로 따로 표본을 잡는다.
//    kind 별 비율을 "시장 구성비"로 읽으면 안 되는 이유이기도 하다 — note 에 명시할 것.
// 쿼리는 "무엇을 세분해서 볼 것인가"를 그대로 반영한다. 넓은 쿼리만 두면 흔한 물건(카드)이
// 표본을 다 먹고 드문 물건(카톤)은 우연히 걸린 것만 잡힌다 — 2026-08-19 실측: 카톤 3건,
// 그중 낙찰 2건. 같은 기간 박스는 전용 쿼리가 있어 125건이 모였다.
// 카톤/케이스는 전용 쿼리를 붙여야 그나마 관측된다(원래 드문 물건이라 많이 모이진 않는다).
//
// 원피스 한 게임만 이 깊이(종류별·세트별·수량별)로 본다. 다른 TCG 13종은 collect-tcg-snapshot.js 가 게임당
// 쿼리 하나로 경매수·입찰률·거래액만 훑는다. 그 둘을 한 도구에 섞지 않는 이유: 여기서는 제목에서 세트코드를
// 뽑아내는데, 그건 게임마다 코드 체계가 달라 게임 하나하나 실측해야 한다.
// 팰월드도 2026-08-19 부터 --game=palworld 로 같은 깊이로 봤으나 2026-11-05 소유자 결정("팰월드만 수집했던 건
// 그냥 멈추자")으로 그 경로를 지웠다. 원장 data/palworld-auction-* 은 append-only 라 지우지 않고 동결했다.
// 팰월드는 TCG 13종 묶음(tcg-config.js)에서 계속 본다. 가드 PW1 이 이 경로가 되살아나는지 본다.
// 제목이 이 게임인지 — 이게 없으면 검색어에 걸린 남의 카드가 섞인다.
const IS_GAME = /one\s*piece|ワンピース/i;
// 이 게임 이름이 붙었지만 카드게임이 아닌 물건(과자 카드·피규어·굿즈).
const NOT_CARD_GAME = /berry\s*match|onepy|one\s*py|wafer|gumi|shokugan|ichiban\s*kuji|figure|keychain|poster|manga\s*volume|dvd|blu-?ray/i;
const QUERIES = [
  "One Piece Card Game",
  "One Piece Card Game Japanese",
  "One Piece TCG",
  "ワンピースカードゲーム",
  "One Piece Card Game booster box",
  "One Piece Card Game booster pack sealed",
  "ワンピースカードゲーム BOX 未開封",
  "One Piece Card Game carton",
  "One Piece Card Game sealed case",
  "ワンピースカードゲーム カートン",
];

// 실행 모드 — 2026-09-03.
//   전수(기본): 가격 밴드 × 전 페이지. 시장 관측점(출품량·세트별)을 찍고 24시간 안에 끝날 경매를 감시목록에 넣는다.
//   보충(--topup): 밴드 없이 종료 임박 순 앞쪽만. 다음 9시간 안에 끝날 경매를 감시목록에 보태고 가격 표본만 합친다.
// 왜 나눴나: 전수는 회차당 ~440콜이라 하루 8번 돌리면 쿼터의 70% 다. 감시목록을 채우는 데는
// "곧 끝나는 것"만 보면 되고 그건 ~50콜이다. 검색이 빠지면 그 시간대 경매는 영영 못 읽으므로
// 싸게 자주 도는 쪽이 맞다.
const TOPUP = process.argv.includes("--topup");
const TOPUP_HORIZON_MIN = 540;   // 보충 지평 9시간 — 3시간 간격에서 두 번 빠져도 버틴다
const outPath = path.join(ROOT, "data", "auction-market.json");

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  return fs.readFileSync(p, "utf8").split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .reduce((v, l) => { const i = l.indexOf("="); if (i > -1) v[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, ""); return v; }, {});
}
const env = { ...loadEnv(path.join(ROOT, ".env")), ...process.env };
const marketplaceId = env.EBAY_MARKETPLACE_ID || "EBAY_US";

async function token() {
  const auth = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}`);
  return (await r.json()).access_token;
}

async function search(tok, q, offset, band) {
  const u = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", String(PAGE_SIZE));
  u.searchParams.set("offset", String(offset));
  // 가격대로 쪼개서 부른다 — eBay 페이징은 한 쿼리당 10,000건에서 잘린다(실측 2026-08-28:
  // "One Piece TCG" 하나가 15,362건이라 40페이지를 긁어도 8,830건에서 멈췄다).
  // 8개 밴드로 나누면 모든 구간이 1만 미만이 되어 사실상 전수를 훑을 수 있다.
  u.searchParams.set("filter", "buyingOptions:{AUCTION}" +
    (band ? `,price:[${band[0]}..${band[1]}],priceCurrency:USD` : ""));
  u.searchParams.set("sort", "endingSoonest");
  const r = await fetch(u, { headers: { Authorization: `Bearer ${tok}`, "X-EBAY-C-MARKETPLACE-ID": marketplaceId } });
  if (!r.ok) throw new Error(`Browse ${r.status}`);
  const j = await r.json();
  return { items: j.itemSummaries || [], total: j.total || 0 };
}

// ── 분류 ─────────────────────────────────────────────────────────────
// box/carton/pack/card 판정은 공용 모듈(가드 Q2가 검증). 여기선 그걸 그대로 쓴다.
const { categorize } = require("./auction-classify");
const { quota } = require("./ebay-budget");

// 세트 코드: OP-06 / OP06 / EB-01 / PRB-01 / ST-21 형태를 모두 받아 정규화한다.
// 카드번호(OP06-093)가 있으면 거기서 세트를 딴다 — 제목에 세트명이 따로 없어도 정확하다.
const CARD_ID = /\b(OP|EB|PRB|ST)[-\s]?(\d{2})[-\s]?(\d{3})\b/i;
const SET_ONLY = /\b(OP|EB|PRB|ST)[-\s]?(\d{2})\b/i;

function classify(title) {
  const card = title.match(CARD_ID);
  if (card) {
    const set = `${card[1].toUpperCase()}-${card[2]}`;
    return { set, cardId: `${card[1].toUpperCase()}${card[2]}-${card[3]}` };
  }
  const s = title.match(SET_ONLY);
  if (s) return { set: `${s[1].toUpperCase()}-${s[2]}`, cardId: null };
  return { set: null, cardId: null };   // 억지로 추측하지 않는다
}

const med = (a) => {
  const x = a.filter(Number.isFinite).sort((m, n) => m - n);
  if (!x.length) return null;
  const i = Math.floor(x.length / 2);
  return Number((x.length % 2 ? x[i] : (x[i - 1] + x[i]) / 2).toFixed(2));
};

// 가격은 "종료 임박 + 입찰 있음" 에서만 잰다.
// 이유: 막 시작한 경매의 현재가는 시작가(대개 $0.01)라 가격 정보가 아니다. 실측에서 팩 중앙값이
// $0.01 로 나왔는데, 이건 팩이 1센트라는 뜻이 아니라 1센트 시작 경매가 표본을 덮은 것이다.
// 종료가 가까울수록 입찰이 수렴하므로 그 구간만 가격으로 쓴다.
const PRICE_WINDOW_MIN = 360;   // 6시간

function summarize(rows) {
  const contested = rows.filter((r) => r.bidCount > 0);
  const converged = contested.filter((r) => r.minsLeft != null && r.minsLeft <= PRICE_WINDOW_MIN);
  return {
    // 출품량 지표 — 표본 전체 기준
    n: rows.length,
    contested: contested.length,
    avgBidCount: rows.length ? Number((rows.reduce((a, r) => a + r.bidCount, 0) / rows.length).toFixed(2)) : null,
    // 가격 지표 — 종료 6시간 이내 + 입찰 있는 건만. nPrice 가 작으면 그래프에서 숨길 것.
    nPrice: converged.length,
    medBid: med(converged.map((r) => r.bid)),
    maxBid: converged.length ? Math.max(...converged.map((r) => r.bid).filter(Number.isFinite)) : null,
  };
}

(async () => {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) throw new Error("Missing eBay credentials");
  const tok = await token();
  const seen = new Set();
  const rows = [];
  let totalReported = 0;

  // ── 쿼터 (2026-09-03 재정렬)
  // 검색은 정산보다 **우선**한다. 감시목록에 없는 경매는 끝나면 영영 못 읽지만, 정산은 30시간 안에만
  // 하면 된다. 종전 규칙(정산 몫 2,600 을 남기고 스캔)은 창 뒷부분에서 검색을 통째로 건너뛰게 해
  // 9/2·9/3 에 감시목록이 0건이 됐다(그 사이 종료분은 영구 손실).
  //   보충: 안전 몫(200)만 남기고 최대 150콜.   전수: 정산 한 회차(600)를 남긴다 — 창이 열린 직후라 넉넉하다.
  //   TCG 스냅샷 몫(tcgSnapshot)은 여기서 남기지 않는다 — 검색이 순서 ①이다(ebay-budget 머리 주석). 남기면 잔여 200~324 에서
  //   보충 스캔이 0 이 되고, 몇 회차가 연달아 잘리면 감시 지평(9시간)을 넘겨 경매를 영구히 잃는다. 그 몫은 TCG 쪽이 남긴다.
  const { remaining: quotaLeft } = await quota();
  let scanBudget = quotaLeft == null
    ? (TOPUP ? 60 : 400)
    : Math.min(TOPUP ? 150 : Infinity, Math.max(0, quotaLeft - (TOPUP ? 200 : 600)));
  let calls = 0;
  if (quotaLeft != null && scanBudget <= 0) {
    console.log(JSON.stringify({ mode: TOPUP ? "topup" : "full", note: "쿼터가 바닥이라 스캔을 건너뛴다", quotaLeft }));
    return;
  }

  // 보충 모드는 밴드가 필요 없다 — 종료 임박 순 앞쪽 몇 페이지만 보고, 지평(9시간)을 넘기면 멈춘다.
  const bands = TOPUP ? [null] : PRICE_BANDS;
  for (const q of QUERIES) {
    for (const band of bands) {
      let bandTotal = 0;
      let beyondHorizon = false;
      for (let p = 0; p < PAGES && !beyondHorizon; p++) {
      if (calls >= scanBudget) break;   // 남겨 둔 몫을 침범하지 않는다
      calls++;
      const { items, total } = await search(tok, q, p * PAGE_SIZE, band);
      if (p === 0) { bandTotal = total; totalReported += total; }
      if (!items.length) break;
      if (TOPUP) {
        const lastEnd = Date.parse(items[items.length - 1].itemEndDate || 0);
        if (Number.isFinite(lastEnd) && lastEnd > Date.now() + TOPUP_HORIZON_MIN * 60000) beyondHorizon = true;
      }
      for (const it of items) {
        const id = it.itemId;
        const title = it.title || "";
        if (!id || seen.has(id)) continue;
        if (!IS_GAME.test(title) || JUNK.test(title) || NOT_CARD_GAME.test(title)) continue;
        if (isExcludedEbaySellerOrLocation(it)) continue;
        seen.add(id);
        const bid = Number(it.currentBidPrice?.value);
        const { set, cardId } = classify(title);
        const endsAt = it.itemEndDate ? Date.parse(it.itemEndDate) : NaN;
        const kind = categorize(title);
        rows.push({
          id,
          kind,
          set,
          cardId,
          // 다수량(lot) 수량. "3 boxes"→3(개당가=총액÷3), case/lot 등 개수 불명→null(가격 통계 제외).
          // 출품량(n) 집계에는 그대로 포함 — 가격만 오염 방지.
          qty: parseLotQuantity(title, kind),
          bidCount: Number.isFinite(it.bidCount) ? it.bidCount : 0,
          bid: Number.isFinite(bid) ? bid : null,
          minsLeft: Number.isFinite(endsAt) ? Math.round((endsAt - Date.now()) / 60000) : null,
          country: it.itemLocation?.country || "",
        });
      }
      if (items.length < PAGE_SIZE) break;
      }
      // 이 밴드를 다 훑었는데도 남아 있으면(=페이징 상한에 걸림) 밴드를 더 쪼개야 한다는 신호.
      // 보충 모드(band null)는 앞쪽 몇 페이지만 보므로 페이징 상한 신호가 의미 없다.
      if (band && bandTotal > PAGES * PAGE_SIZE) console.error(`[band-full] ${q} $${band[0]}~${band[1]} total=${bandTotal} > 수집 상한 ${PAGES * PAGE_SIZE}`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── 정산 감시목록 적재.
  // 여기서 본 경매 중 곧 끝나는 것들을 기록해두면, settle-auctions.js 가 종료 후 다시 조회해
  // 진짜 낙찰가를 가져온다. 감시목록에 없으면 그 경매의 낙찰가는 영원히 못 얻는다.
  // 지평(horizon)은 "다음 스캔이 몇 번 빠져도 버티는가"다 — 2026-09-03 정정.
  // 종전 7시간은 3시간 간격 스캔이 두 번만 빠져도 구멍이 났다(GitHub 크론은 실제로 빠진다. 9/2·9/3 사고).
  //   전수: 24시간 — 스캔이 하루 통째로 빠져도 그날 종료분은 이미 감시 중이다.
  //   보충: 9시간 — 3시간 간격에서 두 번 빠져도 버틴다(페이지 비용 때문에 짧게).
  const WATCH_HORIZON_MIN = TOPUP ? TOPUP_HORIZON_MIN : 1440;
  const watchPath = path.join(ROOT, "data", "auction-watch.json");
  let watch;
  try { watch = JSON.parse(fs.readFileSync(watchPath, "utf8")); } catch { watch = { pending: [] }; }
  const pend = new Map(watch.pending.map((w) => [w.id, w]));
  let added = 0;
  for (const r of rows) {
    if (r.minsLeft == null || r.minsLeft <= 0 || r.minsLeft > WATCH_HORIZON_MIN) continue;
    if (pend.has(r.id)) continue;
    // 세트도 카드번호도 못 딴 건 나중에 어디에도 못 붙이므로 담지 않는다(조회 예산 절약).
    if (!r.set && !r.cardId) continue;
    pend.set(r.id, {
      id: r.id,
      endsAt: new Date(Date.now() + r.minsLeft * 60000).toISOString(),
      kind: r.kind, set: r.set, cardId: r.cardId,
    });
    added++;
  }
  watch.pending = [...pend.values()];
  watch.updated = new Date().toISOString();
  watch.note = "Auctions we saw running and intend to re-read after they close, so we can record the real winning bid. Populated by collect-auction-market.js, drained by settle-auctions.js.";
  fs.writeFileSync(watchPath, JSON.stringify(watch) + "\n", "utf8");

  let out;
  try { out = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch { out = { points: [] }; }
  const prior = out.points.find((p) => p.d === today);

  // 가격은 "개당가": 다수량이면 총액÷수량, 수량 불명(qty null)이면 표본에서 제외.
  // 당일 앞선 실행이 남긴 qty 없는 관측은 종전대로 bid 그대로 쓴다(다음 날부터 전부 qty 있음).
  const unitBid = (o) => {
    if (!Number.isFinite(o.bid)) return null;
    if (!("qty" in o)) return o.bid;
    return o.qty == null ? null : Number((o.bid / o.qty).toFixed(2));
  };
  const priceOf = (obsList, sel) => {
    const s = obsList.filter(sel).map(unitBid).filter(Number.isFinite);
    return { nPrice: s.length, medBid: med(s), maxBid: s.length ? Math.max(...s) : null };
  };
  const asObs = (r) => ({ id: r.id, kind: r.kind, set: r.set, cardId: r.cardId, qty: r.qty, bid: r.bid, bidCount: r.bidCount });
  const isPriceObs = (r) => r.bidCount > 0 && r.minsLeft != null && r.minsLeft <= PRICE_WINDOW_MIN && Number.isFinite(r.bid);

  // 보충 모드는 시장 관측점의 출품량(n·contested)을 건드리지 않는다 — 앞쪽 몇 페이지만 본 표본이라
  // 출품량으로 쓰면 그날 값이 줄어든다. 가격 표본만 당일 점에 합치고 가격 통계를 다시 계산한다.
  // 그날 전수가 아직 없으면(창이 열리기 전 새벽 보충) 감시목록만 채우고 끝낸다.
  if (TOPUP) {
    if (prior) {
      const obsT = new Map((prior.priceObs || []).map((o) => [o.id, o]));
      for (const r of rows) if (isPriceObs(r)) obsT.set(r.id, asObs(r));
      prior.priceObs = [...obsT.values()];
      const p = (sel) => priceOf(prior.priceObs, sel);
      for (const k of Object.keys(prior.byKind || {})) {
        Object.assign(prior.byKind[k], p((o) => o.kind === k));
        if (prior.byKind[k].byQty) {
          Object.assign(prior.byKind[k].byQty.single, p((o) => o.kind === k && o.qty === 1));
          Object.assign(prior.byKind[k].byQty.multi, p((o) => o.kind === k && Number.isFinite(o.qty) && o.qty > 1));
        }
      }
      for (const s of Object.keys(prior.bySet || {})) Object.assign(prior.bySet[s], p((o) => o.set === s));
      for (const c of prior.topCards || []) Object.assign(c, p((o) => o.cardId === c.id));
      prior.runs = (prior.runs || 0) + 1;
      fs.writeFileSync(outPath, JSON.stringify(out) + "\n", "utf8");
    }
    console.log(JSON.stringify({
      mode: "topup", calls, scanned: rows.length,
      watchAdded: added, watchPending: watch.pending.length, priceSamples: prior ? prior.priceObs.length : null,
    }));
    return;
  }

  // ── 하루 안에서 가격 표본을 누적한다.
  // 한 번 스캔하면 "종료 6시간 이내" 구간만 잡히므로 하루 한 번으론 24시간 중 6시간만 본다.
  // 그래서 하루 여러 번 돌리는데, 같은 날 실행이 이전 표본을 덮어쓰면 여러 번 돌리는 의미가 없다.
  // 경매 id 로 합집합을 만들어 같은 경매를 두 번 세지 않으면서 표본만 두껍게 한다.
  const obs = new Map((prior?.priceObs || []).map((o) => [o.id, o]));
  // 같은 경매를 또 봤다면 더 나중 값(더 수렴한 값)으로 갱신한다.
  for (const r of rows) if (isPriceObs(r)) obs.set(r.id, asObs(r));
  const priceObs = [...obs.values()];
  const price = (sel) => priceOf(priceObs, sel);

  // 출품량은 "지금 몇 건이 돌고 있나"라 시점 스냅샷이다(누적이 아님) — 마지막 전수 값을 쓴다.
  // 가격은 위에서 만든 당일 누적 표본에서 계산한다. 둘의 성격이 다르므로 분리해 둔다.
  const counts = (rs) => ({
    n: rs.length,
    contested: rs.filter((r) => r.bidCount > 0).length,
    avgBidCount: rs.length ? Number((rs.reduce((a, r) => a + r.bidCount, 0) / rs.length).toFixed(2)) : null,
  });

  const byKind = {};
  for (const k of ["box", "carton", "pack", "card"]) {
    byKind[k] = { ...counts(rows.filter((r) => r.kind === k)), ...price((o) => o.kind === k) };
  }
  // 박스는 "부스터박스 갯수"별로 세분: single(1개) / multi(2개 이상 묶음). 카톤은 위 carton 으로 별도.
  const boxRows = rows.filter((r) => r.kind === "box");
  byKind.box.byQty = {
    single: { ...counts(boxRows.filter((r) => r.qty === 1)), ...price((o) => o.kind === "box" && o.qty === 1) },
    multi: { ...counts(boxRows.filter((r) => Number.isFinite(r.qty) && r.qty > 1)), ...price((o) => o.kind === "box" && Number.isFinite(o.qty) && o.qty > 1) },
  };

  const setStats = {};
  for (const s of new Set(rows.filter((r) => r.set).map((r) => r.set))) {
    const rs = rows.filter((r) => r.set === s);
    if (rs.length < MIN_SET_N) continue;
    setStats[s] = {
      ...counts(rs),
      ...price((o) => o.set === s),
      byKind: Object.fromEntries(["box", "carton", "pack", "card"].map((k) => [k, rs.filter((r) => r.kind === k).length])),
      boxByQty: { single: rs.filter((r) => r.kind === "box" && r.qty === 1).length, multi: rs.filter((r) => r.kind === "box" && Number.isFinite(r.qty) && r.qty > 1).length },
    };
  }

  const cardIds = new Set(rows.filter((r) => r.cardId).map((r) => r.cardId));
  const topCards = [...cardIds]
    .map((id) => ({ id, ...counts(rows.filter((r) => r.cardId === id)), ...price((o) => o.cardId === id) }))
    .sort((a, b) => b.n - a.n || (b.medBid ?? 0) - (a.medBid ?? 0))
    .slice(0, TOP_CARDS);

  const point = {
    d: today,
    runs: (prior?.runs || 0) + 1,                           // 그날 몇 번 스캔했는지 — 가격 표본 두께의 근거
    scanned: rows.length,                                   // 마지막 스캔 시점 스냅샷
    totalReported,                                          // eBay가 알려준 전체 건수(커버리지 판단용)
    unclassified: rows.filter((r) => !r.set).length,        // 세트 판별 실패 — 늘어나면 파서 점검 신호
    contested: rows.filter((r) => r.bidCount > 0).length,
    byKind,
    bySet: setStats,
    topCards,
    priceObs,                                               // 당일 누적 원표본. 날이 바뀌면 아래에서 제거된다.
  };
  out.note = `Daily sample of live One Piece Card Game auctions on eBay: how many are running by set and item type, how many have attracted bids, and the median current bid. Bids are live, not final sale prices — eBay does not expose completed-sale data at this access tier. Sellers and locations excluded from our price data are excluded here too. Set and card codes are parsed from listing titles; titles we cannot classify confidently are counted under 'unclassified' rather than guessed. Price figures (medBid) are measured only on auctions ending within 6 hours that already have bids, because a freshly listed auction still shows its opening price, not its value; nPrice reports how many listings each price is based on. This is a sample, not a census: boxes and packs are sampled with dedicated queries, so the box/pack/card split is not a market share figure — compare each category against its own history, not against the others. Price figures are per unit: multi-item lots are divided by the quantity parsed from the title, and listings whose quantity cannot be determined (case/lot/bulk) are excluded from price samples while still counted in listing volume.`;
  out.updated = today;
  // 전수가 마지막으로 돈 시각 — 자가치유가 "쿼터 창이 열렸는데 전수가 안 돌았다"를 이걸로 판단한다(2026-09-03:
  // 창 첫 크론 07:20 UTC 를 GitHub 이 통째로 건너뛰었는데 아무도 몰랐다).
  out.sweptAt = new Date().toISOString();
  out.points = [...out.points.filter((p) => p.d !== today), point]
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(-KEEP_DAYS)
    // 원표본은 누적이 끝난 당일만 필요하다. 지난 날짜까지 들고 있으면 파일이 무한정 커진다.
    .map((p) => (p.d === today ? p : (delete p.priceObs, p)));
  // 오래된 날의 인기카드 목록은 지운다 — 과거 순위는 안 보고, 이게 파일 크기의 큰 몫을 먹는다.
  const cutoff = new Date(Date.now() - TOP_CARDS_DAYS * 86400000).toISOString().slice(0, 10);
  for (const p of out.points) if (p.d < cutoff) delete p.topCards;
  // 들여쓰기 없이 쓴다. 사람이 직접 읽는 파일이 아니고, 하루 4번 커밋되므로 크기가 곧 저장소 용량이다.
  fs.writeFileSync(outPath, JSON.stringify(out) + "\n", "utf8");

  console.log(JSON.stringify({
    run: point.runs, scanned: point.scanned, totalReported, unclassified: point.unclassified,
    contested: point.contested, sets: Object.keys(setStats).length,
    priceSamples: priceObs.length, watchAdded: added, watchPending: watch.pending.length,
  }));
})();
