#!/usr/bin/env node
"use strict";
// 사이트 사실 한 벌 — data/derived/site-facts.json 을 굽는 유일한 곳. 2026-10-15 신설.
//
// 왜: 같은 사실(박스 현재가·4주 변동·최저 매물·가장 비싼 카드·레어도·PSA 10 달러값·재판 분류·페이지 수정일 …)을
//     생성기 20여 개가 원장에서 각자 다시 셌다(box-sold-series 를 23개 파일이, onepiece-packs 를 90개 파일이 읽었다).
//     규칙 하나("가장 비싼 카드")를 바꾸는 데 8개 파일·5번의 맞춰 보기가 들었다.
//     이제 규칙은 market-data-normalizers.js(순수 함수) 한 곳, 그 함수를 부르는 곳은 이 빌더 한 곳이다.
//     생성기는 data/derived/site-facts.json 을 읽기만 한다 — 원장을 직접 읽는 것은 사실이 아닌 값(그래프 점·카드 목록·공식 문구)뿐이다.
//
// 결정성: 같은 입력 → 같은 바이트. 키 순서 고정, 생성 시각 없음(날짜는 전부 데이터 날짜). inputs 는 입력 파일의 sha1.
// 읽기: require("./build-site-facts").load() — 파일이 없거나 입력 해시가 다르면 그 자리에서 다시 굽는다(<2초). 경로는 OUT 하나(소비자는 load() 만 부른다).
//       워크플로가 생성기 하나를 이름으로 따로 불러도(update-fx → generate-ai-data) 묵은 사실을 읽지 않는다.
//
// 읽는 순서: 입력·해시 → 작은 규칙 함수 → buildSet(세트 하나) → build(전체) → load/main.
// 카드 쪽(2026-10-15, F4): 카드 상세·허브·카드리스트·등급 인구 페이지·발매 예정 페이지·일본어 발매일 표·팩 산수 글이 각자 세던 사실
//   (카드별 등급사 표·PSA 인구 이력·경매 변형 행·시세 체크포인트·박스 배수·카드 페이지 수정일, 카드리스트의 "우리 숫자"·페이지 날짜,
//   등급 인구 페이지 행, 예약판매 호가·발매 여부, 공식 상품명)을 아래 cards[i].*·cardLists[].numbers·sets[code].gradingPage·upcoming 으로 옮겼다.
// Run: node tools/build-site-facts.js
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const N = require("./market-data-normalizers");
const CL = require("./card-list-shared");
const CS = require("./card-series-store");
// 변형 판별(tier)은 등급 원장 적재기와 같은 함수 — 여기서 다르게 자르면 원장 키와 어긋난다.
const { ourTier } = (() => { try { return require("./cgc-card-pop-ingest.js"); } catch { return { ourTier: (n) => String(n || "").toLowerCase() }; } })();
// DON!! 카드의 PSA 인구 키(donRef) — PSA 인구 적재기와 같은 함수(카드 상세 이력표의 마지막 행 = 머리의 인구가 되게).
const { donRef } = (() => { try { return require("./psa-card-pop-ingest.js"); } catch { return { donRef: () => null }; } })();

const ROOT = path.join(__dirname, "..");
const SITE = N.SITE;
// 위치: data/derived/ — data/ 바로 아래 .json 은 collect-status.js 가 "등록 안 된 축적 파일(UNTRACKED)"로 고발한다(가드 R4). 이 파일은 수집이 아니라
// 생성 사슬의 파생물(언제든 다시 굽는다)이라 하위 폴더에 둔다(collect-status 는 하위 폴더를 파일 5개 이상일 때만 축적으로 본다). 커밋하지 않는다(.gitignore 권장).
const OUT = path.join(ROOT, "data", "derived", "site-facts.json");
const DAY = 864e5;
const isDate = N.isDate;
const slug = (code) => String(code).toLowerCase();
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const readJson = (rel, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return fallback; } };
const median = (arr) => { const a = arr.filter((x) => x != null).sort((x, y) => x - y); return { v: a.length ? a[Math.floor(a.length / 2)] : null, n: a.length }; };
const lastWith = (arr, key) => { const f = (arr || []).filter((p) => p && p[key] != null); return f.length ? f[f.length - 1] : null; };
const round1 = (v) => Math.round(v * 10) / 10;

// ── 입력 파일 — load() 의 신선도 검사(sha1). onepiece-packs 는 marketIndex(build-market-index 가 이 사실로 다시 쓰는 사본)를 뺀 내용으로 잰다.
const INPUTS = [
  "data/onepiece-packs.json", "data/box-sold-series.json", "data/set-facts.json", "data/official-cardlist.json",
  "data/set-auction-stats.json", "data/fx-history.json", "data/upcoming-set-pages.json",
  "data/psa-card-pop.json", "data/cgc-card-pop.json", "data/tag-card-pop.json",
  "data/grading-series.json", "data/auction-series.json", "data/tcg-series.json", "cards/card-map.json",
  // 카드 쪽(2026-10-15): 카드별 경매 실적(45일 롤링)·카드 시세 이력·예약판매 호가·PSA 판별 주간 증감
  "data/auction-card-stats.json", "data/card-series.json", "data/preorder-series.json", "data/psa-edition-weekly.json",
  // 반다이 상품 페이지 확인(2026-10-19, tools/check-bandai-product-pages.js) — 발매 전 페이지의 "Bandai product page checked" 날짜
  "data/bandai-product-check.json",
];
// 사이트의 "현재" 기준(일) — 마지막 관측이 이보다 오래되면 현재값으로 쓰지 않는다(가드 D17). 카드 페이지의 박스 배수 분모·Product 호가 신선도가 같은 값.
const CURRENT_DAYS = 28;
// PSA 10 sold 중앙값 낡음 기준(일) — 홈 packs.js PSA10_STALE_DAYS 와 같은 값. 넘으면 원본 대비 배수(Premium)를 내지 않는다.
const PSA10_STALE_DAYS = 35;
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const listHtml = (dir) => { try { return fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".html")).sort(); } catch { return []; } };
function inputHashes() {
  const out = {};
  for (const rel of INPUTS) {
    let buf;
    try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { out[rel] = null; continue; }
    if (rel === "data/onepiece-packs.json") { const p = JSON.parse(buf); delete p.marketIndex; buf = JSON.stringify(p); }
    out[rel] = sha1(buf);
  }
  out["sets/*.html"] = sha1(listHtml("sets").join("\n"));   // 페이지 존재(영문판 페이지 주소·releaseFacts.pages)가 사실에 들어간다
  return out;
}

// ── 세트 코드 자연 정렬(OP → EB → PRB, 번호순) — 홈 요약표·한국어 허브가 같은 순서를 쓴다.
function orderKey(code) {
  const m = String(code).match(/^([A-Z]+)-?(\d+)/);
  const fam = { OP: 0, EB: 1, PRB: 2 }[m ? m[1] : "OP"] ?? 9;
  return fam * 1000 + (m ? parseInt(m[2], 10) : 0);
}
// 발매 시점부터 실제 추적한 세트만(감사 결과). 나머지는 중간 시작이라 "발매 대비" 주장 금지.
const LAUNCH_TRACKED = new Set(["OP-16", "OP-17"]);

// 세트·판 하나의 Key facts 묶음 — H1 아래 표(일본판·영문판·한국어 페이지)와 검색 설명문이 이 값을 그대로 쓴다.
//   가격 두 줄만 판(ed)을 따르고 나머지는 세트 단위 사실이다.
//   sold = box-sold-series current[ed](마지막 중앙값 점이 asOf 로부터 28일 이내일 때만 — 모든 표와 같은 규칙, 가드 D17)
//   ask  = 최저 실매물(lowestAsk) · 사실 = data/set-facts.json(반다이 공식) · 카드 리스트 = 공식 카드 리스트 요약
function keyFactsModel(src, code, ed) {
  const { packs, sold, facts } = src;
  const s = (packs.sets || {})[code] || {};
  const sf = (facts.sets || {})[code] || {};
  const ser = (sold.sets || {})[code] || {};
  const last = (ser.current && ser.current[ed]) || null;
  const cl = CL.productOf(code);
  const jpPack = sf.jpMsrpYenPerPack || (sf.jpMsrpYen && sf.packsPerBox && Number.isInteger(sf.jpMsrpYen / sf.packsPerBox) ? sf.jpMsrpYen / sf.packsPerBox : null);
  const en = sf.enRelease || {};
  const sources = [];
  if (sf.jpRelease && sf.jpRelease.source) sources.push({ key: "jpRelease", en: "JP release", ko: "일본판 발매일", url: sf.jpRelease.source, checked: sf.jpRelease.verifiedOn || null, archived: /web\.archive\.org/.test(sf.jpRelease.source) });
  if (sf.jpSpecSource && sf.jpSpecSource.source) sources.push({ key: "jpSpec", en: "JP MSRP & card types", ko: "일본판 정가·카드 종류", url: sf.jpSpecSource.source, checked: sf.jpSpecSource.verifiedOn || null });
  if (en.source) sources.push({ key: "en", en: "EN release & MSRP", ko: "영문판 발매일·정가", url: en.source, checked: en.verifiedOn || null });
  if (cl) sources.push({ key: "cardList", en: "card list", ko: "카드 리스트", url: cl.url, checked: cl.checked || null });
  return {
    code, ed,
    sold: last ? { median: last.median, n: last.n ?? null, d: last.d, windowDays: (ser.windowDays || {})[ed] || null, reprint: ed === "en" && N.enIsReprint(ser) } : null,
    soldReleased: !!(ser.release && ser.release[ed] && (!sold.asOf || ser.release[ed] <= sold.asOf)),
    boxConfigStated: sf.boxConfig ? sf.boxConfig.stated !== false : null,
    ask: lowestAsk(src, s, ed),
    jpRelease: (sf.jpRelease && sf.jpRelease.date) || null,
    enRelease: en.date || s.release || null,
    msrp: { jpBox: sf.jpMsrpYen || null, jpPack, enPack: en.msrpUsdPerPack ?? null },
    packsPerBox: sf.packsPerBox || null,
    cardsPerPack: sf.cardsPerPack || null,
    cardTypes: sf.cardTypes ? { official: true, value: String(sf.cardTypes) } : cl ? { official: false, numbers: cl.counts.numbers } : null,
    cardList: cl ? { href: `${CL.slugOf(code)}-card-list.html`, cards: cl.counts.cards, numbers: cl.counts.numbers, checked: cl.checked || null } : null,
    sources,
  };
}

// 최저 실매물 — 미개봉 새 제품이고 제목이 개봉·빈 박스·재밀봉·손상을 말하지 않는 검증된 최저 총액(가격+배송).
// 세트 페이지 구매 버튼(buyCta)·Key facts 표·FAQ 가 이 값 하나를 쓴다.
function lowestAsk(src, set, ed) {
  const a = set && set.boxMarket && set.boxMarket[ed] && set.boxMarket[ed].ebayActive;
  const bl = a && a.bestListing;
  if (!bl || bl.total == null || !N.epnUrl(bl.url)) return null;
  if (!/new/i.test(bl.condition || "")) return null;
  if (/unseal|open|empty|no packs|reseal|damaged/i.test(bl.title || "")) return null;
  const fx = (src.packs.fx || {}).usdKrw;
  const toU = (v, cur) => (v == null ? null : cur === "USD" ? v : cur === "KRW" && fx ? v / fx : null);
  const total = toU(bl.total, bl.currency || a.currency);
  if (total == null) return null;
  return { total, url: bl.url, updated: a.updated || null, mid: a.middle != null ? toU(a.middle, a.currency) : null, listings: Number.isInteger(a.sampleSize) ? a.sampleSize : null };
}

// 호가 위젯 값 — 표본 3건 미만은 시장값이 아니라 싣지 않는다(2026-08-26 감사). 화면 위젯·Product 구조화데이터·영문판 지표 칸이 같은 값.
function liveAsk(set, ed, fx) {
  const m = set.boxMarket?.[ed]?.ebayActive;
  if (!m || m.middle == null || !m.sampleSize || m.sampleSize < 3) return null;
  const toU = (v) => (v == null ? null : m.currency === "USD" ? v : m.currency === "KRW" && fx.usdKrw ? v / fx.usdKrw : null);
  const mid = toU(m.middle);
  if (mid == null) return null;
  const lo = m.low != null ? toU(m.low) : null, hi = m.high != null ? toU(m.high) : null;
  return { mid, lo, hi, n: m.sampleSize, updated: m.updated || null, range: lo != null && hi != null };
}

// 호가 관측 한 벌(출처·검색어·매물 id 목록은 뺀다) — 영문판 최저 매물 칸·비교 글이 읽는다.
function activeAsk(set, ed) {
  const m = set.boxMarket?.[ed]?.ebayActive;
  if (!m) return null;
  const bl = m.bestListing || null;
  return {
    updated: m.updated || null, currency: m.currency || null, middle: m.middle ?? null, low: m.low ?? null, high: m.high ?? null, sampleSize: m.sampleSize ?? null,
    bestListing: bl ? { title: bl.title || null, url: bl.url || null, price: bl.price ?? null, shipping: bl.shipping ?? null, total: bl.total ?? null, currency: bl.currency || null, country: bl.country || null, condition: bl.condition || null } : null,
  };
}

// 최신 세트 — 계열(OP·EB·PRB)마다 일본판 발매일이 가장 늦은 추적 세트 중, 발매 후 120일 이내이고 공식 카드 리스트가 있는 것.
// 그 세트의 제목·H1 에 Release Date 를 넣는다(일본판·영문판·한국어 세트 페이지가 같은 목록).
function latestSets(facts, codes, asOf) {
  const best = {};
  for (const c of codes) {
    const d = (((facts.sets || {})[c] || {}).jpRelease || {}).date;
    if (!d || d > asOf) continue;
    const fam = c.split("-")[0];
    if (!best[fam] || d > best[fam].d) best[fam] = { c, d };
  }
  return Object.values(best).filter(({ c, d }) => (Date.parse(asOf) - Date.parse(d)) / 864e5 <= 120 && CL.has(c)).map(({ c }) => c).sort();
}

// 세트 페이지 수정일 = 이 페이지가 읽는 원장 기준일 중 가장 늦은 날(packs.updated · box-sold-series.asOf · 경매 집계 창 끝 ·
// 그 세트의 호가 수집일(일본판·영문판) · Key facts 출처 확인일 · 화면에 찍히는 카드 NM 관측일(최고가 카드 줄·한국어 "관측일")).
// 미래 날짜인 발매일은 데이터 날짜가 아니라 넣지 않는다(감사 #4). 카드 NM 관측일(2026-11-02, EB-05 승격): 새 세트 카드를 packs.updated 다음 날
// 시드하면 Key facts "Top chase" 날짜가 수정일보다 늦었다(가드 U2).
function setPageDate(src, code, kfJp, cardDates = []) {
  const bm = ((src.packs.sets || {})[code] || {}).boxMarket || {};
  return N.latestDate(src.packs.updated, src.sold.asOf, (src.auction.window || {}).to, bm.jp && bm.jp.ebayActive && bm.jp.ebayActive.updated, bm.en && bm.en.ebayActive && bm.en.ebayActive.updated, ...kfJp.sources.map((x) => x.checked), ...cardDates)
    || new Date().toISOString().slice(0, 10);
}

// 발매·제품 사실(AI 피드 releaseFacts) — 원천은 data/set-facts.json(반다이 공식, 항목마다 출처·확인일)과 공식 카드리스트 둘뿐.
// 영문판 발매일은 set-facts 에 없으면 세트 페이지 상단과 같은 packs 의 release. 없는 값은 null — 박스 구성이 공식에 없는 세트는 박스 정가도 계산하지 않는다.
const pageUrl = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? `${SITE}/${rel}` : null);
function buildReleaseFacts(src, datasetUpdatedOn) {
  const facts = src.facts.sets || {};
  const lists = Object.fromEntries(CL.products().map((p) => [p.code, p]));
  const codes = [...new Set([...Object.keys(facts), ...Object.keys(lists)])].sort(CL.naturalCode);
  return codes.map((code) => {
    const f = facts[code] || {};
    const sl = slug(code);
    const jpRel = isDate(f.jpRelease?.date) ? f.jpRelease.date : null;
    const enRel = isDate(f.enRelease?.date) ? f.enRelease.date : isDate(src.packs.sets?.[code]?.release) ? src.packs.sets[code].release : null;
    const known = [jpRel, enRel].filter(Boolean).sort();
    const perPack = N.isPositive(f.jpMsrpYenPerPack) ? f.jpMsrpYenPerPack : N.isPositive(f.jpMsrpYen) && N.isPositive(f.packsPerBox) ? Math.round(f.jpMsrpYen / f.packsPerBox) : null;
    const list = lists[code];
    return {
      setCode: code,
      nameEn: CL.nameEnOf(code) || null,
      status: !known.length ? null : datasetUpdatedOn && known[0] <= datasetUpdatedOn ? "released" : "upcoming",
      japanese: {
        releaseDate: jpRel,
        releaseSource: jpRel ? f.jpRelease.source || null : null,
        releaseCheckedOn: jpRel && isDate(f.jpRelease.verifiedOn) ? f.jpRelease.verifiedOn : null,
        msrpYenPerPack: perPack,
        msrpYenPerBox: N.isPositive(f.jpMsrpYen) ? f.jpMsrpYen : null,
        msrpYenPerBoxBasis: N.isPositive(f.jpMsrpYen) && f.boxConfig && f.boxConfig.stated === false ? "pack price x packsPerBox; box configuration not stated by Bandai" : null,
        packsPerBox: N.isPositive(f.packsPerBox) ? f.packsPerBox : null,
        cardsPerPack: N.isPositive(f.cardsPerPack) ? f.cardsPerPack : null,
        cardTypes: f.cardTypes ? String(f.cardTypes) : null,
        specSource: f.jpSpecSource?.source || null,
        specCheckedOn: isDate(f.jpSpecSource?.verifiedOn) ? f.jpSpecSource.verifiedOn : null,
      },
      english: {
        releaseDate: enRel,
        releaseSource: f.enRelease?.source || null,
        msrpUsdPerPack: N.isPositive(f.enRelease?.msrpUsdPerPack) ? f.enRelease.msrpUsdPerPack : null,
        cardTypes: f.enRelease?.cardTypes ? String(f.enRelease.cardTypes) : null,
        checkedOn: isDate(f.enRelease?.verifiedOn) ? f.enRelease.verifiedOn : null,
      },
      officialCardList: list ? { cards: list.counts.cards, cardNumbers: list.counts.numbers, checkedOn: list.checked || null, officialUrl: list.url || null } : null,
      pages: { set: pageUrl(`sets/${sl}.html`), englishSet: pageUrl(`sets/${sl}-english.html`), cardList: list ? `${SITE}/${CL.pagePath(code)}` : null },
    };
  });
}

// 데이터 기준일(AI 피드 datasetUpdatedOn) = packs.updated 와 AI 파일 4개(핵심·카드·등급·경매)에 실리는 관측일 가운데 가장 늦은 날.
// 발매일은 관측일이 아니라 넣지 않는다. 네 파일·llms 가 한 날을 써야 같은 값의 경과일이 파일마다 같다(2026-10-15 QA).
const OBSERVED_KEYS = new Set(["observedOn", "sampleCollectedOn", "fxObservedOn", "checkedOn", "releaseCheckedOn", "specCheckedOn", "date", "to"]);
function newestObserved(node, best) {
  if (Array.isArray(node)) return node.reduce((b, x) => newestObserved(x, b), best);
  if (!node || typeof node !== "object") return best;
  for (const [key, value] of Object.entries(node)) {
    if (OBSERVED_KEYS.has(key) && isDate(value)) best = !best || value > best ? value : best;
    else if (value && typeof value === "object") best = newestObserved(value, best);
  }
  return best;
}

// 카드 페이지 색인 — 같은 카드가 두 세트 목록에 있으면 번호가 그 세트 것인 쪽(home)을 쓴다. AI 카드 파일·카드 상세가 같은 선택.
function cardPageIndex(packs, codes, cardMap) {
  const index = new Map();
  for (const code of codes) {
    (packs.sets[code].cards || []).forEach((card, i) => {
      if (!card.number) return;
      const key = `${card.number}|${norm(card.name)}`;
      const isHome = card.number.replace("-", "").toUpperCase().startsWith(code.replace("-", "").toUpperCase());
      const prev = index.get(key);
      if (!prev || (isHome && !prev.isHome)) index.set(key, { code, i, isHome });
    });
  }
  const pages = [];
  for (const [key, file] of Object.entries(cardMap || {})) {
    const hit = index.get(key);
    if (hit) pages.push({ key, file, code: hit.code, i: hit.i });
  }
  return pages;
}

// 등급사별 감정 현황(top 카드 행) — 회사마다 10 의 정의가 달라 합치지 않는다. 키에 변형(tier)을 포함한다(2026-09-10 감사).
function gradeTrio(pop, code, c) {
  if (!c.number) return null;
  const key = c.number + "|" + ourTier(c.name);
  const pick = (src) => { const st = src?.sets?.[code]; if (!st) return null; const node = st[key] || st.jp?.[key]; return Array.isArray(node) && node.length ? node[node.length - 1] : null; };
  const p = pick(pop.psa), g = pick(pop.cgc), t = pick(pop.tag);
  const row = {};
  if (p?.total) row.psa = { n: p.total, gem: p.g10 != null ? Math.round((p.g10 / p.total) * 100) : null };
  if (g?.total) row.cgc = { n: g.total, gem: g.g ? Math.round((((g.g["Gem Mint 10"] || 0) + (g.g["Pristine 10"] || 0)) / g.total) * 100) : null };
  if (t?.total) row.tag = { n: t.total, gem: t.g ? Math.round((((t.g["10"] || 0) + (t.g["10P"] || 0)) / t.total) * 100) : null };
  return Object.keys(row).length ? row : null;
}

// 세트 경매 실적(set-auction-stats) 한 벌 — 유형 표는 종료 건수 내림차순(세트·영문판·한국어 페이지가 앞에서 N개만 자른다).
function auctionBlock(a) {
  if (!a) return null;
  const cats = Object.entries(a.byCat || {}).sort((x, y) => y[1].ended - x[1].ended).map(([cat, v]) => ({ cat, ended: v.ended ?? null, sold: v.sold ?? null, sellThrough: v.sellThrough ?? null }));
  return { ended: a.ended ?? null, sold: a.sold ?? null, sellThrough: a.sellThrough ?? null, amount: a.amount ?? null, medPrice: a.medPrice ?? null, medBidders: a.medBidders ?? null, byCat: cats };
}

// ── 카드 상세 페이지의 사실(2026-10-15, F4 — generate-card-pages.js 에서 옮김) ─────────────────────────────
// 등급사 × 판 표 — PSA/CGC/TAG 를 일본판·영문판 따로(card.graderPop, inject-card-grades.js 산출). 등급사·판은 합산하지 않는다.
// 최고 등급 정의는 세트 페이지와 같다: PSA 10 / CGC Pristine 10 + Gem Mint 10 / TAG 10 + 10P. 이 카드 변형 하나의 값.
function gradingRows(c) {
  const gp = c.graderPop || {};
  const out = [];
  const add = (grader, ed, total, top, topLabel, d) => { if (!total) return; out.push({ grader, ed, total, top, topLabel, share: Math.round((top / total) * 100), d: d || null }); };
  for (const [ed, label] of [["jp", "Japanese"], ["en", "English"]]) {
    const p = gp.psa && gp.psa[ed];
    if (p) add("PSA", label, p.total, p.g10 || 0, "PSA 10", p.d);
    const g = gp.cgc && gp.cgc[ed];
    if (g) add("CGC", label, g.total, (g.pristine10 || 0) + (g.gemMint10 || 0), "Pristine 10 + Gem Mint 10", g.d);
    const t = gp.tag && gp.tag[ed];
    if (t) add("TAG", label, t.total, (t.g10 || 0) + (t.g10p || 0), "TAG 10 + 10P", t.d);
  }
  const order = { PSA: 0, CGC: 1, TAG: 2 };
  return out.sort((a, b) => order[a.grader] - order[b.grader] || (a.ed === "Japanese" ? -1 : 1));
}
// PSA 인구 관측 이력(일본판) — data/psa-card-pop.json 의 이 카드 변형 시계열. 매칭은 inject-card-grades.js 와 같다
// (donRef 가 있으면 그 키, 없으면 `번호|tier`, 담고 있는 박스 코드) — 그래야 마지막 행이 머리의 PSA 인구(graderPop.psa.jp.total)와 같다.
// 음수·역전 행(재등급·정정)은 빼지 않고 그대로 두되 total·g10 이 정수이고 g10 ≤ total 인 행만.
function psaPopHistory(pop, code, c) {
  if (!pop.psa || !code) return [];
  const num = (c.number || "").toUpperCase();
  const don = donRef(c.name);
  if (!num && !don) return [];
  const key = don ? don.key : `${num}|${ourTier(c.name || "")}`;
  const arr = pop.psa.sets?.[code]?.jp?.[key];
  if (!Array.isArray(arr)) return [];
  return arr.filter((p) => Number.isInteger(p.total) && p.total > 0 && Number.isInteger(p.g10) && p.g10 <= p.total)
    .map((p) => ({ d: p.d || null, total: p.total, g10: p.g10, g9: Number.isInteger(p.g9) ? p.g9 : null }));
}
// 카드별 경매 실적 행 — 판(JP/EN) × 변형(제목에서 읽은 tier) 가운데 낙찰 3건 이상만(auction-card-stats.json variants, 45일 롤링). 감정품 경매는 원장에서 이미 뺐다.
const AUC_TIERS = ["base", "alt", "super", "red", "sp", "gold", "silver", "signature", "boxtopper", "wanted", "tr"];
function cardAuctionRows(variants, c) {
  const rows = [];
  for (const ed of ["jp", "en"]) for (const tier of AUC_TIERS) {
    const v = variants[`${c.number}|${ed}|${tier}`];
    if (!v || v.sold < 3) continue;
    rows.push({ ed, tier, n: v.n ?? null, sold: v.sold ?? null, sellThrough: v.sellThrough ?? null, medPrice: v.medPrice ?? null, low: v.low ?? null, high: v.high ?? null });
  }
  return rows;
}
// 시세 체크포인트(카드 상세 "Recent price checkpoints") — data/card-series.json 의 이 카드 이력을 달러로. NM 은 각 시점 환율(fx-history),
// PSA 10 점은 KRW 로만 저장되므로 현재 관측(psa10Ebay.updated) 뒤의 점은 같은 관측을 매일 다시 적은 것이라 머리와 같은 관측일 환산값을 쓴다
// (2026-09-30 실측: OP09-119 이력 $2,027 / 머리 $1,822). 쓸 수 없는 NM(nmUsable 거짓)은 이력 칸에서도 뺀다(읽은 날이 없는 값은 날짜가 관측일이 아니다).
function checkpoints(series, code, c, nmUsd, fx) {
  const toUsdAt = (v, cur, date) => (v == null ? null : cur === "USD" ? v : cur === "KRW" ? v / (N.fxAt(date) || fx.usdKrw) : null);
  const pts = (CS.seriesOf(series, code, c)?.points || []).map((p) => (nmUsd != null ? p : { ...p, nm: null })).filter((p) => p.nm != null || p.psa != null);
  const g10 = c.psa10Ebay && c.psa10Ebay.soldBased && c.psa10Ebay.middle != null ? c.psa10Ebay : null;
  const g10Usd = g10 ? toUsdAt(g10.middle, g10.currency, g10.updated) : null;
  return pts.map((p) => ({
    d: p.d || null,
    nm: p.nm != null ? toUsdAt(p.nm, "KRW", p.d) : null,
    psa: p.psa != null ? (g10Usd != null && g10.updated && p.d > g10.updated ? g10Usd : toUsdAt(p.psa, "KRW", p.d)) : null,
  }));
}

// 카드 한 장의 사실 — 세트 Top 10 표·PSA 10 랭킹·한국어 카드 표·AI 피드·카드 상세가 같은 값을 읽는다.
//   ctx(카드 상세용): cardBox(박스 배수 분모) · variants(경매 변형) · series(시세 이력) · cards(같은 세트 카드 — 체이스 순위 표시 여부) · aucDay(경매 집계 기준일)
function buildCard(src, code, c, i, spikes, datasetUpdatedOn, ctx = {}) {
  const { fx, pop } = src;
  const DATA_DATE = src.dataDate;
  const rarity = CL.rarityCode(code, c) || "";
  const usable = N.nmUsable(c);
  const nmUsd = N.nmUsd(c, fx);
  const rp = N.rawPrice(c, fx);
  const ageOf = (d) => (isDate(d) && DATA_DATE ? (Date.parse(DATA_DATE) - Date.parse(d)) / DAY : null);
  const tcgOutlier = !!(c.nmJpy == null && typeof c.priceUsd === "number" && spikes.has(c.priceUsd));
  // 화면 NM 칸 = rawPrice(쓸 수 있는 NM, 아니면 NM 조사 전·숨김 표시 없는 카드의 TCG 값) — TCG 이상치(스파이크)는 "—".
  const nm = rp && !(rp.kind === "TCG" && tcgOutlier) ? rp.usd : null;
  const nmSrc = nm == null ? null : rp.kind === "TCG" ? "tcg" : "jp";
  // PSA 10 실거래 중앙값(표본 3건 이상) — 달러는 관측일 환율로 되돌린 값(psa10Usd), 원화는 그 달러 × fx.usdKrw(다른 원화 환산과 같은 환율).
  const sold = c.psa10Ebay;
  let psa10 = null;
  if (sold && sold.soldBased && sold.middle != null && (sold.sampleSize || 0) >= 3) {
    const v = N.psa10Usd(sold, fx);
    if (v != null) {
      const toU = (x) => (x == null ? null : sold.currency === "USD" ? x : sold.currency === "KRW" ? x / (N.fxAt(sold.updated) || fx.usdKrw) : null);
      const ageDays = ageOf(sold.updated);
      const stale = Number.isFinite(ageDays) && ageDays > PSA10_STALE_DAYS;
      // 배수(PSA 10 ÷ NM) 규칙은 여기 한 곳 — 2026-10-19. 35일 넘은 표본이거나 40배 넘으면(raw 오매칭) null. 종전엔 PSA10 랭킹은 묵은 표본도 1.7× 를,
      //   카드 허브는 "—" 를 내 한 카드가 두 값이었다(OP13-118). 랭킹·허브·카드 상세가 이 값을 그대로 쓴다.
      const mult = nmUsd > 0 ? v / nmUsd : null;
      psa10 = {
        usd: v, krw: fx.usdKrw ? v * fx.usdKrw : null, low: toU(sold.low), high: toU(sold.high),
        n: sold.sampleSize || null, date: sold.updated || null, ageDays,
        stale,   // 35일 넘은 sold 중앙값은 "현재가"가 아니다(홈 PSA10_STALE_DAYS 와 같은 기준)
        multiple: mult != null && !stale && mult <= 40 ? mult : null,            // PSA 10 ÷ 쓸 수 있는 NM(달러)
      };
    }
  }
  // PSA 10 최저 실매물(호가) — 카드 상세 구매 버튼·Product Offer·세트 표의 "ask" 값. buy = 버튼을 낼 수 있는 매물(EPN 링크로 바꿀 수 있고 값이 있다).
  // fresh = 관측일이 CURRENT_DAYS 이내(Product Offer 는 지금 나와 있는 매물만 — 2026-10-15 감사 #5).
  const pa = c.psa10Active || null;
  const bl = pa && pa.bestListing;
  const askUsd = bl && bl.total != null ? (bl.currency === "USD" ? bl.total : bl.currency === "KRW" && fx.usdKrw ? bl.total / fx.usdKrw : null) : null;
  const askAge = pa ? ageOf(pa.updated) : null;
  const psa10Ask = askUsd != null ? {
    usd: askUsd, n: pa.sampleSize ?? null, date: pa.updated || null, url: bl.url || null,
    mid: pa.middle != null ? (pa.currency === "USD" ? pa.middle : pa.currency === "KRW" && fx.usdKrw ? pa.middle / fx.usdKrw : null) : null,
    ageDays: askAge, fresh: Number.isFinite(askAge) && askAge <= CURRENT_DAYS, buy: !!N.epnUrl(bl.url),
  } : null;
  const psa = psa10 ? psa10.usd : psa10Ask ? psa10Ask.usd : null;
  const popJp = c.graderPop?.psa?.jp || null;
  const nmAge = ageOf(c.nmUpdated);
  const nm0 = { usable, jpy: N.isPositive(c.nmJpy) ? c.nmJpy : null, date: isDate(c.nmUpdated) ? c.nmUpdated : null, usd: nmUsd, krw: usable && fx.jpyKrw ? c.nmJpy * fx.jpyKrw : null, hiddenReason: c.nmHiddenReason || null, stock: N.stockStatus(c.nmStock),
    ageDays: nmAge, fresh: Number.isFinite(nmAge) && nmAge <= CURRENT_DAYS };   // fresh = 실제로 다시 본 날이 CURRENT_DAYS 이내(Product Offer ①)
  // 카드 상세 전용 사실 — 박스 배수(쓸 수 있는 NM ÷ 그 세트 일본판 박스 sold 중앙값, 분모는 ctx.cardBox)·등급사 표·PSA 인구 이력·경매 변형 행·시세 체크포인트.
  const rows = gradingRows(c);
  const popHist = psaPopHistory(pop, code, c);
  const aucRows = ctx.variants ? cardAuctionRows(ctx.variants, c) : [];
  const cps = ctx.series ? checkpoints(ctx.series, code, c, nmUsd, fx) : [];
  const cardBox = ctx.cardBox || null;
  // 체이스 순위는 같은 세트에 같은 NM(엔) 값이 둘 이상이면 찍지 않는다(순위가 값으로 갈리지 않는다).
  const rankShown = !!(c.rank && !((ctx.cards || []).filter((x) => x.nmJpy != null && x.nmJpy === c.nmJpy).length > 1));
  // 카드 페이지 수정일(Article dateModified·설명 "Updated") = 이 페이지에 찍히는 관측일 중 가장 늦은 날 — 2026-10-15 감사(#4).
  const pageDate = N.latestDate(DATA_DATE, nmUsd != null ? c.nmUpdated : null, psa10 ? psa10.date : psa10Ask ? psa10Ask.date : null, psa10Ask && psa10Ask.buy ? psa10Ask.date : null,
    cardBox ? cardBox.asOf : null, aucRows.length ? ctx.aucDay : null, ...rows.map((r) => r.d), popHist.length ? popHist[popHist.length - 1].d : null, cps.length ? cps[cps.length - 1].d : null);
  return {
    i, key: c.number ? `${c.number}|${norm(c.name)}` : null, number: c.number || null, name: c.name || null, rank: Number.isInteger(c.rank) ? c.rank : null,
    rarity, rarityEn: CL.rarityEn(rarity),
    tier: ourTier(c.name || ""),                                        // 변형(tier) — 등급 원장·경매 변형 키와 같은 함수
    imgSuffix: typeof c._imgSuffix === "string" ? c._imgSuffix : null,   // 사람이 확인한 공식 ID 접미어(카드리스트 "우리 숫자" 매칭의 근거)
    image: c.image || null, img: c.img || null,   // 원장 이미지 주소 그대로(자체 호스팅 판정은 페이지 쪽 — 외부 CDN 은 가드 I1 이 막는다)
    nm: nm0,
    raw: rp, tcgOutlier,
    shown: { nm, nmSrc, psa, psaKind: psa10 ? "sold" : psa10Ask ? "ask" : "", psaDate: psa10 ? psa10.date : null, psaStale: !!(psa10 && psa10.stale), psaN: psa10 ? psa10.n : null },
    psa10, psa10Ask,
    pop: popJp ? { total: popJp.total ?? null, g10: popJp.g10 ?? null, g9: popJp.g9 ?? null, d: popJp.d || null, gem: popJp.total ? Math.round(((popJp.g10 || 0) / popJp.total) * 100) : null } : null,   // gem = PSA 10 ÷ 전체
    grades: gradeTrio(pop, code, c),
    gradingRows: rows, psaPopHistory: popHist, auctionRows: aucRows, checkpoints: cps,
    boxMultiple: cardBox && nmUsd ? nmUsd / cardBox.usd : null,
    rankShown, pageDate,
    ai: { rawNmAsk: N.rawNmAsk(c, fx, datasetUpdatedOn), psa10Sold: N.psa10Sold(c, datasetUpdatedOn), psa10SoldUsd: N.withUsd(N.psa10Sold(c, datasetUpdatedOn), fx), psaPopulation: N.psaPopulation(c, datasetUpdatedOn) },
  };
}

// 등급 인구 페이지(psa-grading.html)의 세트 행 — 판(jp/en) × 등급사(psa/cgc/tag): {total, gem, add, from, to}(2026-10-15, F4 — generate-psa-grading-page.js 에서 옮김).
//   시계열 = data/grading-series.json 의 마지막 두 점. PSA 는 최신 전체 스냅샷(psaFull·psaFullEn)이 시계열보다 새롭고, 주간 증감은
//   판별 원장(data/psa-edition-weekly.json)의 마지막 두 주(src.psaWeeks)에서 온다. 영문판 PSA 에 두 주가 없으면 증감은 null.
const GRADERS = ["psa", "cgc", "tag"];
function gradingPageRows(src, code, s) {
  const gs = src.gradingSeries || { sets: {} };
  const led = src.psaEdWeekly || { sets: {} };
  const [wPrev, wNow] = src.psaWeeks || [null, null];
  const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null);
  const prev = (arr) => (Array.isArray(arr) && arr.length > 1 ? arr[arr.length - 2] : null);
  const ed = (e) => {
    const g = ((gs.sets || {})[code] || {})[e] || {};
    const out = {};
    for (const k of GRADERS) {
      const l = last(g[k]), p = prev(g[k]);
      let total = l ? l.total : (g.latestTotal && g.latestTotal.by ? g.latestTotal.by[k] : null);
      let gem = l && l.gem != null ? l.gem : null;
      let add = l && l.add != null ? l.add : null, from = p ? p.d : null, to = l ? l.d : null;
      if (k === "psa") {
        const ps = e === "jp" ? s.psaFull : s.psaFullEn;
        if (ps) { total = ps.total; gem = ps.gems; }
        const arr = ((led.sets || {})[code] || {})[e] || [];
        const a = wPrev && arr.find((x) => x.d === wPrev), b = wNow && arr.find((x) => x.d === wNow);
        if (a && b) { add = b.g - a.g; from = wPrev; to = wNow; } else if (e === "en") { add = null; }
      }
      out[k] = total == null ? null : { total, gem: gem ?? null, add: add ?? null, from: from || null, to: to || null };
    }
    return out;
  };
  return { jp: ed("jp"), en: ed("en") };
}

// 세트 하나의 사실.
function buildSet(src, code, datasetUpdatedOn) {
  const { packs, sold, facts, auction, fx, dataDate } = src;
  const s = packs.sets[code] || {};
  const ser = sold.sets[code] || {};
  const sf = facts.sets[code] || {};
  const canonical = `${SITE}/sets/${slug(code)}.html`;
  const jp = (ser.jp || []).filter((p) => p && p.median != null);
  const en = (ser.en || []).filter((p) => p && p.median != null);
  const cur = ser.current || {};
  const point = (p) => (p ? { d: p.d, median: p.median, low: p.low ?? null, high: p.high ?? null, n: p.n ?? null, vol: p.vol ?? null } : null);
  const current = (ed) => (cur[ed] ? { ...point(cur[ed]), windowDays: (ser.windowDays || {})[ed] || null } : null);
  const kfJp = keyFactsModel(src, code, "jp"), kfEn = keyFactsModel(src, code, "en");
  const { reprint, lottery, unverified } = N.splitReprints(sf.reprintRecords);
  const rec = (r) => ({ date: r.date || "", kind: r.kind || "", source: typeof r.source === "string" ? r.source : null, sourceDead: !!r.sourceDead });

  // ── 일본판 지표(세트 페이지 격자) — 주간 점 5개 이상일 때만. 큰 숫자는 current 가 있을 때만(표·Key facts 와 같은 규칙).
  let metricsJp = null;
  if (jp.length >= 5) {
    const c0 = cur.jp;
    if (!c0) metricsJp = { price: null, priceD: null, chg: null, stock: null, days: null, psa: s.psaFull?.total ?? null, gem: s.psaFull?.gemRate ?? null, noCurrent: true };
    else {
      const last = jp[jp.length - 1];
      const change = N.boxChange28(jp, c0);
      const sup = (ser.supply || []).slice(-1)[0];
      const weekN = last.n || 0;
      const windowDays = ser.windowDays?.jp || null;
      const stock = sup ? sup.jp : null;
      metricsJp = {
        price: last.median != null ? Math.round(last.median) : null, priceD: last.d || null, chg: change ? change.pct : null, stock,
        // 재고일수 = 지금 걸린 매물 ÷ 하루 판매 속도(n 은 평균 창 안 건수라 창 길이로 나눈다 — 2026-09-08 수정)
        days: stock != null && weekN && windowDays ? Number((stock / (weekN / windowDays)).toFixed(1)) : null,
        psa: s.psaFull?.total ?? null, gem: s.psaFull?.gemRate ?? null,
      };
    }
  }
  // ── 영문판 지표(영문 세트 페이지) — 현재가·배수·설명문 모두 current 가 있을 때만. 배수는 JP·EN current 가 둘 다 있을 때만.
  const lastEn = cur.en || null, jpLast = cur.jp || null;
  const changeEn = N.boxChange28(en, lastEn);
  const supplyEn = lastWith(ser.supply, "en");
  const windowEn = ser.windowDays?.en || null;
  const askEn = s.boxMarket?.en?.ebayActive || null;
  const metricsEn = {
    price: lastEn ? lastEn.median : null, priceD: lastEn ? lastEn.d : null, priceN: lastEn ? lastEn.n ?? null : null,
    chg: changeEn ? changeEn.pct : null,
    stock: supplyEn ? supplyEn.en : null, stockD: supplyEn ? supplyEn.d : null, stockJp: supplyEn ? supplyEn.jp ?? null : null,   // stockJp = 같은 점의 일본판 매물 수(비교표)
    days: supplyEn && supplyEn.en != null && lastEn && lastEn.n && windowEn ? Math.round((supplyEn.en / (lastEn.n / windowEn)) * 10) / 10 : null,
    windowDays: windowEn,
    sold: lastEn ? { median: lastEn.median, low: lastEn.low, high: lastEn.high, sampleSize: lastEn.n, updated: lastEn.d, windowDays: windowEn } : null,
    askN: askEn && askEn.middle != null && (askEn.sampleSize || 0) >= 3 ? askEn.sampleSize : null,
    jpPrice: jpLast ? jpLast.median : null, jpPriceD: jpLast ? jpLast.d : null,
    multiple: lastEn && jpLast && jpLast.median ? Math.round((lastEn.median / jpLast.median) * 10) / 10 : null,
    psa: s.psaFullEn?.total ?? null, gem: s.psaFullEn?.gemRate ?? null, psaD: s.psaFullEn?.updated || null,
    reprint: N.enIsReprint(ser),
  };

  // ── 주간 표(weekly.html) — 이번 주 점·7일 전 점·WoW·4주·매물 수. 이번 주 = 시리즈 전체의 가장 늦은 주간 점 날짜(src.weekEnd).
  const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
  const weekly = (ed, pts) => {
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    const isThisWeek = !!(src.weekStart && last.d >= src.weekStart && last.d <= src.weekEnd);
    const prev = pts.find((p) => p.d === addDays(last.d, -7)) || null;
    const ch = N.boxChange28(pts, cur[ed] || null);
    const sup = (ser.supply || []).filter((p) => p && p[ed] != null);
    const supNow = sup.length ? sup[sup.length - 1] : null;
    const supPrev = supNow ? sup.filter((p) => p.d <= addDays(supNow.d, -7)).pop() : null;
    return { last: point(last), prev: point(prev), wow: prev ? (last.median / prev.median - 1) * 100 : null, c4: ch ? ch.pct : null, isThisWeek, listed: supNow ? supNow[ed] : null, listedPrev: supPrev ? supPrev[ed] : null };
  };

  // ── 주간 PSA 등급 증가(psaWeekly) 요약 — 합계·고점 주·마지막 주·직전 주.
  const wk = s.psaWeekly && Array.isArray(s.psaWeekly.points) ? s.psaWeekly.points : [];
  const psaWeekly = wk.length ? {
    n: wk.length, sum: wk.reduce((a, b) => a + b.v, 0), first: { d: wk[0].d, v: wk[0].v }, last: { d: wk[wk.length - 1].d, v: wk[wk.length - 1].v },
    prev: wk.length > 1 ? { d: wk[wk.length - 2].d, v: wk[wk.length - 2].v } : null,
    peak: (() => { const pk = wk.reduce((a, b) => (b.v > a.v ? b : a), wk[0]); return { d: pk.d, v: pk.v }; })(),
    updated: s.psaWeekly.updated || null,
  } : null;

  // ── 카드 상세의 박스 분모(cardBox) — 세트 페이지·홈과 같은 소스(일본판 박스 sold 주간 중앙값)의 마지막 점. 데이터일(packs.updated)로부터
  //    CURRENT_DAYS 보다 오래되면 배수를 말하지 않는다 — 낡은 분모로 "currently" 를 쓰면 안 된다(2026-09-24).
  const boxLast = jp[jp.length - 1] || null;
  const boxAge = boxLast ? (Date.parse(dataDate) - Date.parse(boxLast.d)) / DAY : null;
  const boxUsd = boxLast && boxAge != null && boxAge <= CURRENT_DAYS ? boxLast.median : null;
  const cardBox = boxUsd ? { usd: boxUsd, asOf: boxLast.d } : null;
  // ── 카드. TCG 스파이크(세트 안에서 혼자 튀는 값)는 세트 단위로 판정한다.
  const cards = s.cards || [];
  const spikes = N.tcgSpikes(cards);
  const ctx = { cardBox, variants: src.cardAuction.variants, series: src.cardSeries, cards, aucDay: src.cardAuction.day };
  const cardFacts = cards.map((c, i) => buildCard(src, code, c, i, spikes, datasetUpdatedOn, ctx));
  // 가장 비싼 카드 = 검증된 NM 최댓값(동가는 ties). 검증 안 된 값이 1위 값 이상이면 null — 세트 페이지·한국어·비교표가 같은 값.
  const pc = N.priciest(cards, fx);
  // Key facts 'Top chase (raw NM)' 행(2026-10-16) — 비교표 topUsd·가장 비싼 카드 문장과 같은 priciest 값을 두 판 모델에 같이 둔다(생성기 재계산 없음).
  const chase = pc ? { number: pc.card.number || null, name: pc.card.name || null, usd: pc.price.usd, date: pc.price.date || null } : null;
  kfJp.chase = chase; kfEn.chase = chase;
  const idx = (card) => cards.indexOf(card);
  const top10 = cards.slice(0, 10);
  const counted = N.countedValues(top10, fx);
  const rv = N.rawValues(top10, fx);
  // PSA 세트 전체 집계(psaFull / psaFullEn 이 있을 때만 — 종전 psaGem/psaTotal 폴백은 2026-08-19 에 없앴다) · CGC·TAG 는 원장 값 그대로.
  const psaBlock = (pf) => (pf ? { total: pf.total ?? null, gems: pf.gems ?? null, gemRate: pf.gemRate ?? null, updated: pf.updated || null, wowAdd: pf.wowAdd ?? null } : null);
  const grading = {
    psa: { jp: psaBlock(s.psaFull), en: psaBlock(s.psaFullEn) },
    cgc: { jp: s.graders?.cgc?.jp || null, en: s.graders?.cgc?.en || null },
    tag: { jp: s.graders?.tag?.jp || null, en: s.graders?.tag?.en || null },
  };
  const auc = auction.sets && auction.sets[code];
  const board = src.boardByCode[code] || null;
  return {
    // nameFull = 표·목록에 쓰는 세트 이름(공식 부제까지 — PRB-01 "Premium Booster — The Best", PRB-02 "… The Best vol.2") — 2026-10-19.
    //   nameEn 은 제목·H1 이 쓰는 이름이라 그대로 둔다(제목 불변 규칙). card-list-shared.nameEnOf 한 곳이 정한다.
    code, nameEn: s.nameEn || null, nameFull: CL.nameEnOf(code) || s.nameEn || null, nameKo: s.nameKo || null, slug: slug(code), box: s.box || null, release: s.release || null,
    canonicalUrl: canonical,
    englishGuideUrl: fs.existsSync(path.join(ROOT, "sets", `${slug(code)}-english.html`)) ? `${SITE}/sets/${slug(code)}-english.html` : null,
    hasCards: cards.length > 0, hasPoints: { jp: (ser.jp || []).length > 0, en: (ser.en || []).length > 0 },
    hasSetFacts: !!(facts.sets && facts.sets[code]),   // data/set-facts.json 에 항목이 있는가(재판 기록 블록은 항목이 있을 때만)
    // 판매 원장이 아는 발매일(box-sold-series release) — 미발매(발매일 > asOf)면 예약판매가 시계열에서 빠져 현재가가 없다(비교표·발매일 글).
    seriesRelease: ser.release ? { jp: ser.release.jp || null, en: ser.release.en || null } : null,
    unreleased: !!(ser.release && ser.release.jp && sold.asOf && ser.release.jp > sold.asOf),
    // 판별 발매 여부(데이터 기준일 asOf 기준)·발매 후 판매 건수·발매 전 판매 요약(예약판매) — 발매 예정 페이지의 사실 표·예약판매 표(2026-10-15, F4).
    released: { jp: !!(ser.release && ser.release.jp && sold.asOf && ser.release.jp <= sold.asOf), en: !!(ser.release && ser.release.en && sold.asOf && ser.release.en <= sold.asOf) },
    sinceRelease: { jp: ser.sinceRelease?.jp ?? null, en: ser.sinceRelease?.en ?? null },
    preRelease: { jp: ser.preRelease?.jp || null, en: ser.preRelease?.en || null },
    // 예약판매 호가(data/preorder-series.json 의 마지막 관측) — 최저 매물·중앙값·매물 수. 없으면 null.
    preorderAsk: { jp: preorderAskOf(src.preorder, code, "jp"), en: preorderAskOf(src.preorder, code, "en") },
    // 정가의 달러 환산(packs.fx) — board.msrpUsd 는 jpBox 의 반올림, 현지 통화 글(SEA)은 jpBoxFromPack(팩 수 × 팩 정가)을 쓴다. 식 순서는 종전 그대로.
    msrpUsd: {
      jpBox: sf.jpMsrpYen && fx.jpyKrw && fx.usdKrw ? (sf.jpMsrpYen * fx.jpyKrw) / fx.usdKrw : null,
      jpBoxFromPack: sf.packsPerBox && sf.jpMsrpYenPerPack && fx.jpyKrw && fx.usdKrw ? (sf.packsPerBox * sf.jpMsrpYenPerPack * fx.jpyKrw) / fx.usdKrw : null,
    },
    jpRelease: kfJp.jpRelease, enRelease: kfJp.enRelease,
    keyFacts: { jp: kfJp, en: kfEn },
    pageDate: setPageDate(src, code, kfJp, [chase && chase.date, ...cardFacts.filter((c) => c.nm.usable).map((c) => c.nm.date)]),
    current: { jp: current("jp"), en: current("en") },
    change28: { jp: N.boxChange28(jp, cur.jp || null), en: changeEn },
    lastPoint: { jp: point(jp[jp.length - 1] || null), en: point(en[en.length - 1] || null) },
    priceKrw: board && board.nowUsd != null && fx.usdKrw ? board.nowUsd * fx.usdKrw : null,
    ask: { jp: kfJp.ask, en: kfEn.ask },
    liveAsk: { jp: liveAsk(s, "jp", fx), en: liveAsk(s, "en", fx) },
    ebayActive: { jp: activeAsk(s, "jp"), en: activeAsk(s, "en") },
    market: N.buildBoxMarket(s, datasetUpdatedOn, canonical),
    metrics: { jp: metricsJp, en: metricsEn },
    reprint: { restock: reprint.map(rec), lottery: lottery.map(rec), unverified: unverified.map(rec), count: reprint.length, enIsReprint: N.enIsReprint(ser), reprintPct: ser.reprintPct || null },
    auction: auc ? { ...auctionBlock(auc), en: auctionBlock(auc.byEd && auc.byEd.en) } : null,
    grading,
    gradingPage: gradingPageRows(src, code, s),   // 등급 인구 페이지 행(판 × 등급사)
    cardBox,                                      // 카드 상세 박스 배수의 분모(일본판 sold 중앙값, CURRENT_DAYS 이내일 때만)
    psaWeekly,
    weekly: { jp: weekly("jp", jp), en: weekly("en", en) },
    top10: {
      priciest: pc ? { i: idx(pc.card), number: pc.card.number || null, name: pc.card.name || null, usd: pc.price.usd, date: pc.price.date || null, ties: pc.ties.map((c) => ({ i: idx(c), number: c.number || null, name: c.name || null })) } : null,
      counted, pricedCount: rv.verified.length + rv.unverified.length,
      allTcg: top10.length > 0 && cardFacts.slice(0, 10).every((c) => c.shown.nmSrc === "tcg"),
    },
    cards: cardFacts,
  };
}

// ── 카드리스트 페이지의 "우리 숫자"(2026-10-15, F4 — generate-card-list-pages.js 에서 옮김) ───────────────────────────
// 공식 카드 ID 하나에 NM·경매 낙찰 중앙값(일본판/영문판 인쇄)·PSA 10·카드 페이지가 확정 규칙으로 붙을 때만, 나머지는 null:
//   base     기본 ID(접미어 없음)이고 그 번호에 프리미엄 부스터 재수록 ID(_r)가 없을 때 → 경매 키 번호|jp|base
//   sp / tr  그 번호의 공식 SP(또는 TR) ID 가 전 상품 통틀어 하나일 때 → 번호|jp|sp / tr
//   parallel 자기 번호 상품(OP17-… ↔ OP-17) 안의 패러렐이 그 ID 하나뿐일 때 → 번호|jp|alt
//   그 밖(망가·슈퍼·레드·금·은·수배서, 패러렐 2개 이상)은 세트 Top 10 의 사람 확인 이미지 접미어(imgSuffix)가 그 ID 를 가리킬 때만.
//   같은 경매 키를 두 행이 가리키면 둘 다 비운다. 의심 표식(suspect)·3건 미만도 비운다(variants.usable). 일본판 인쇄만(판별 합산 금지).
//   영문판 인쇄 키(번호|en|tier)는 공식 ID 접미어가 판마다 다를 수 있어(JP _p2 ↔ EN _p1) 번호 + 구분으로 잇고, 양쪽 목록 모두 "그 구분이 하나뿐"일 때만.
//   NM·PSA 10 은 사람 확인 변형(imgSuffix)이 가리키는 카드의 사실(sets[code].cards[i].nm · psa10)을 그대로 쓴다(한 사실 = 한 값).
function cardListNumbers(src, sets, cardMap, cardAuction) {
  const OFF = CL.doc();
  const JP = OFF.jp || { products: {}, cards: {} }, EN = OFF.en || { products: {}, cards: {} };
  const JP_BY_NUM = {};
  for (const [code, p] of Object.entries(JP.products || {})) for (const id of p.ids) {
    const c = JP.cards[id];
    if (!c) continue;
    (JP_BY_NUM[c.num] = JP_BY_NUM[c.num] || []).push({ id, product: code, kind: CL.kindOf(id, c) });
  }
  const EN_ALL_BY_NUM = {};
  for (const [code, p] of Object.entries(EN.products || {})) for (const id of p.ids) {
    const c = EN.cards[id];
    if (!c) continue;
    (EN_ALL_BY_NUM[c.num] = EN_ALL_BY_NUM[c.num] || []).push({ id, parts: code.split("-").length === 2 && /\d/.test(code.split("-")[0]) ? code.split("-") : [code.replace("-", "")], kind: CL.kindOf(id, c) });
  }
  // 세트 Top 10 의 사람 확인 변형(이미지 접미어) → 공식 ID. 같은 ID 를 두 카드가 가리키면 쓰지 않는다.
  const verified = {}, dup = new Set();
  for (const [code, s] of Object.entries(src.packs.sets || {})) {
    const ids = new Set(((JP.products || {})[code] || { ids: [] }).ids);
    (s.cards || []).forEach((c, i) => {
      if (typeof c._imgSuffix !== "string" || !c.number) return;
      const id = c.number + c._imgSuffix;
      if (!ids.has(id)) return;
      if (verified[id]) dup.add(id); else verified[id] = { code, i };
    });
  }
  for (const id of dup) delete verified[id];
  const tierOf = (v) => sets[v.code].cards[v.i].tier;
  function ruleKey(id, card) {
    const v = verified[id];
    if (v) return `${card.num}|jp|${tierOf(v)}`;
    const es = JP_BY_NUM[card.num] || [];
    const kind = CL.kindOf(id, card);
    if (kind === "base") return es.some((e) => e.kind === "reprint") ? null : `${card.num}|jp|base`;
    if (kind === "sp") return es.filter((e) => e.kind === "sp").length === 1 ? `${card.num}|jp|sp` : null;
    if (kind === "tr") return es.filter((e) => e.kind === "tr").length === 1 ? `${card.num}|jp|tr` : null;
    if (kind === "parallel") {
      const pre = card.num.split("-")[0];
      const own = es.filter((e) => e.kind === "parallel" && e.product.replace("-", "") === pre);
      return own.length === 1 && own[0].id === id ? `${card.num}|jp|alt` : null;
    }
    return null;
  }
  function ruleKeyEn(id, card) {
    const kind = CL.kindOf(id, card);
    const jp = JP_BY_NUM[card.num] || [], en = EN_ALL_BY_NUM[card.num] || [];
    const pre = card.num.split("-")[0];
    const one = (arr, k) => arr.filter((e) => e.kind === k).length === 1;
    if (kind === "base") return !jp.some((e) => e.kind === "reprint") && en.some((e) => e.kind === "base") && !en.some((e) => e.kind === "reprint") ? `${card.num}|en|base` : null;
    if (kind === "sp") return one(jp, "sp") && one(en, "sp") ? `${card.num}|en|sp` : null;
    if (kind === "tr") return one(jp, "tr") && one(en, "tr") ? `${card.num}|en|tr` : null;
    if (kind === "parallel") {
      const ownJp = jp.filter((e) => e.kind === "parallel" && e.product.replace("-", "") === pre);
      const ownEn = en.filter((e) => e.kind === "parallel" && e.parts.includes(pre));
      return ownJp.length === 1 && ownJp[0].id === id && ownEn.length === 1 ? `${card.num}|en|alt` : null;
    }
    return null;
  }
  // 전 상품을 한 번에 — 같은 키를 두 ID 가 가리키면 둘 다 버린다.
  function claimKeys(fn) {
    const claims = {};
    for (const p of Object.values(JP.products || {})) for (const id of p.ids) {
      const c = JP.cards[id];
      const k = c ? fn(id, c) : null;
      if (k) (claims[k] = claims[k] || new Set()).add(id);
    }
    const out = {};
    for (const [k, ids] of Object.entries(claims)) if (ids.size === 1) out[[...ids][0]] = k;
    return out;
  }
  const KEY_OF = claimKeys(ruleKey), KEY_OF_EN = claimKeys(ruleKeyEn);
  const auctionOf = (key) => { const v = key ? cardAuction.variants[key] : null; return v && v.usable ? v : null; };
  const numbersFor = (id) => {
    const v = auctionOf(KEY_OF[id] || null);
    const auction = v ? { usd: v.medPrice, n: v.sold } : null;
    const vEn = auctionOf(KEY_OF_EN[id] || null);
    const auctionEn = vEn ? { usd: vEn.medPrice, n: vEn.sold } : null;
    const ver = verified[id];
    let nm = null, psa10 = null, page = null;
    if (ver) {
      const f = sets[ver.code].cards[ver.i];
      if (f.nm.usd != null) nm = { usd: f.nm.usd, date: f.nm.date };
      if (f.psa10) psa10 = { usd: f.psa10.usd, n: f.psa10.n, basis: "sold", date: f.psa10.date };
      page = (f.key && cardMap[f.key]) || null;   // 카드 상세 파일명(cards/<page>)
    }
    if (!psa10 && v && v.psa10Med != null && (v.psa10Sold || 0) >= 3) psa10 = { usd: v.psa10Med, n: v.psa10Sold, basis: "auction", date: cardAuction.day || null };
    return { nm, auction, auctionEn, psa10, page };
  };
  // 값이 하나라도 붙는 ID 만 싣는다(3,600여 행 대부분이 전부 null) — 없는 ID 는 생성기가 null 로 읽는다.
  const out = {};
  for (const p of CL.products()) out[p.code] = Object.fromEntries(p.ids.map((id) => [id, numbersFor(id)]).filter(([, r]) => r.nm || r.auction || r.auctionEn || r.psa10 || r.page));
  return { numbers: out, keyOf: KEY_OF, keyOfEn: KEY_OF_EN };
}

// 예약판매 호가의 마지막 관측(data/preorder-series.json) — 세트 사실(preorderAsk)·발매 예정 페이지(upcoming)가 같은 값.
function preorderAskOf(preorder, code, ed) {
  const a = ((preorder.sets || {})[code] || {})[ed];
  const l = Array.isArray(a) && a.length ? a[a.length - 1] : null;
  return l ? { d: l.d || null, n: l.n ?? null, median: l.median ?? null, low: l.low ?? null, high: l.high ?? null, best: l.best ? { total: l.best.total ?? null, url: l.best.url || null } : null } : null;
}

function build(inputs) {
  const packs = readJson("data/onepiece-packs.json");
  if (!packs) throw new Error("data/onepiece-packs.json 을 읽을 수 없다");
  const sold = readJson("data/box-sold-series.json", { sets: {} });
  const facts = readJson("data/set-facts.json", { sets: {}, bandaiAnnouncesReprints: false });
  const auction = readJson("data/set-auction-stats.json", { sets: {}, window: {}, updated: "" });
  const pop = { psa: readJson("data/psa-card-pop.json", null), cgc: readJson("data/cgc-card-pop.json", null), tag: readJson("data/tag-card-pop.json", null) };
  const fx = packs.fx || {};
  const dataDate = packs.updated || new Date().toISOString().slice(0, 10);
  const codes = [...(packs.jp?.list || []), ...(packs.extra?.list || [])].filter((c) => packs.sets?.[c]);
  // ── 카드 쪽 입력(2026-10-15, F4): 카드별 경매 실적(변형 키 → 낙찰 요약, 집계 기준일 day)·카드 시세 이력·예약판매 호가·PSA 판별 주간 원장(마지막 두 주).
  //    variants.usable = 카드리스트가 쓰는 "낙찰 중앙값으로 써도 되는 행"(의심 표식 없음·낙찰 3건 이상·중앙값 있음). 카드 상세 행(cards[i].auctionRows)은 낙찰 3건 이상만 본다.
  const aucRaw = readJson("data/auction-card-stats.json", { variants: {}, updated: "" });
  const cardAuction = {
    day: String(aucRaw.updated || "").slice(0, 10),
    variants: Object.fromEntries(Object.entries(aucRaw.variants || {}).map(([k, v]) => [k, {
      n: v.n ?? null, sold: v.sold ?? null, sellThrough: v.sellThrough ?? null, medPrice: v.medPrice ?? null, low: v.low ?? null, high: v.high ?? null,
      suspect: !!v.suspect, psa10Med: v.psa10Med ?? null, psa10Sold: v.psa10Sold ?? null, usable: !v.suspect && (v.sold || 0) >= 3 && v.medPrice != null,
    }])),
  };
  const cardSeries = readJson("data/card-series.json", { sets: {} });
  const preorder = readJson("data/preorder-series.json", { sets: {}, updated: null });
  const psaEdWeekly = readJson("data/psa-edition-weekly.json", { sets: {}, weeks: [] });
  const edWeeks = (psaEdWeekly.weeks || []).slice(-2);
  const src = { packs, sold, facts, auction, pop, fx, dataDate, cardAuction, cardSeries, preorder, psaEdWeekly, psaWeeks: edWeeks.length === 2 ? edWeeks : null };
  const yenUsd = (yen) => (fx.jpyKrw && fx.usdKrw ? (yen * fx.jpyKrw) / fx.usdKrw : null);

  // ── 성적표(board) — 홈 요약표·한국어 허브·세트 허브·packs.marketIndex(build-market-index 가 그대로 쓴다). 변화율은 최근 4주.
  //    실거래 점이 없어도 행은 남긴다(값은 비운다 — 빈칸은 눈에 띄고 틀린 숫자는 안 띈다). 키 순서는 marketIndex 와 같아야 한다.
  const board = [];
  for (const c of codes) {
    const f = (facts.sets && facts.sets[c]) || {};
    const pts = ((sold.sets[c] && sold.sets[c].jp) || []).filter((p) => p && p.median != null);
    if (!pts.length) {
      board.push({ code: c, nameEn: packs.sets[c].nameEn || c, nowUsd: null, nowDate: null, changePct: null, changeBasis: null, launchTracked: LAUNCH_TRACKED.has(c), msrpYen: f.jpMsrpYen || null, msrpUsd: f.jpMsrpYen ? Math.round(yenUsd(f.jpMsrpYen)) : null, vsMsrp: null, reprints: N.splitReprints(f.reprintRecords).reprint.length });
      continue;
    }
    const cur = (sold.sets[c] && sold.sets[c].current && sold.sets[c].current.jp) || null;
    const change = N.boxChange28((sold.sets[c] && sold.sets[c].jp) || [], cur);
    const msrpUsd = f.jpMsrpYen ? yenUsd(f.jpMsrpYen) : null;
    const nowUsd = cur ? cur.median : null;
    board.push({
      code: c, nameEn: packs.sets[c].nameEn || c,
      nowUsd: nowUsd != null ? Math.round(nowUsd) : null,
      nowDate: cur ? cur.d : null,   // 그 중앙값 점의 날짜(마지막 판매일이 아니다)
      n: cur ? cur.n ?? null : null,   // 그 점의 평균 창(windowDays) 안 판매 건수
      windowDays: cur ? ((sold.sets[c].windowDays || {}).jp || null) : null,
      changePct: change ? change.pct : null, changeBasis: change ? change.basis : null,
      launchTracked: LAUNCH_TRACKED.has(c),
      msrpYen: f.jpMsrpYen || null, msrpUsd: msrpUsd != null ? Math.round(msrpUsd) : null,
      vsMsrp: msrpUsd && nowUsd ? Math.round((nowUsd / msrpUsd) * 10) / 10 : null,
      reprints: N.splitReprints(f.reprintRecords).reprint.length,
    });
  }
  board.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
  src.boardByCode = Object.fromEntries(board.map((b) => [b.code, b]));
  const rows = [...board].sort((a, b) => orderKey(a.code) - orderKey(b.code));

  // ── 홈 요약 문답·box-prices 설명문의 값 — 최저가가 같은(화면 금액 기준) 세트는 표 순서대로 모두(5차 규칙), 28일 넘게 거래 없는 세트는 등락 집계에서 뺀다.
  const usdStr = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const byPrice = rows.filter((b) => b.nowUsd != null).sort((a, b) => b.nowUsd - a.nowUsd);
  const cheapest = byPrice[byPrice.length - 1] || null;
  const withChg = rows.filter((b) => b.changePct != null && b.nowUsd != null);
  const byChg = [...withChg].sort((a, b) => b.changePct - a.changePct);
  const home = {
    cheapest: cheapest ? { usd: cheapest.nowUsd, codes: rows.filter((b) => b.nowUsd != null && usdStr(b.nowUsd) === usdStr(cheapest.nowUsd)).map((b) => b.code) } : null,
    priciest: byPrice[0] ? { code: byPrice[0].code, usd: byPrice[0].nowUsd } : null,
    runnerUp: byPrice[1] ? { code: byPrice[1].code, usd: byPrice[1].nowUsd } : null,
    withChg: withChg.length, nUp: withChg.filter((b) => b.changePct > 0).length, nDn: withChg.filter((b) => b.changePct < 0).length,
    topUp: byChg[0] ? { code: byChg[0].code, pct: byChg[0].changePct } : null,
    topDn: byChg.length ? { code: byChg[byChg.length - 1].code, pct: byChg[byChg.length - 1].changePct } : null,
    cheapRows: [...rows].filter((b) => b.nowUsd != null).sort((a, b) => a.nowUsd - b.nowUsd || orderKey(a.code) - orderKey(b.code)).slice(0, 5).map((b) => b.code),
  };
  // 한국어 허브 — 최고·최저 박스(화면 원화 반올림 기준, 같은 금액이면 모두)와 급등·급락 3개(등락 내림차순 — 값 없는 세트는 0% 로 놓고 센다, 종전 정렬과 같다).
  const krwOf = (b) => (b.nowUsd != null && fx.usdKrw ? Math.round(b.nowUsd * fx.usdKrw) : null);
  const priced = rows.filter((b) => krwOf(b) != null);
  const pick = (v) => ({ krw: v, codes: priced.filter((b) => krwOf(b) === v).map((b) => b.code) });
  const movers = [...board].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const koHub = {
    max: priced.length ? pick(Math.max(...priced.map(krwOf))) : null, min: priced.length ? pick(Math.min(...priced.map(krwOf))) : null,
    topUp: movers.slice(0, 3).map((b) => b.code), topDn: movers.slice(-3).reverse().map((b) => b.code),
  };

  // ── 주간 표 기준 주 — 시리즈 전체에서 가장 늦은 주간 점 날짜. weekly.html 의 데이터일은 시리즈 갱신일.
  const weekEnd = codes.map((c) => ((sold.sets[c] || {}).jp || []).concat((sold.sets[c] || {}).en || []).map((p) => p.d)).flat().sort().pop() || null;
  src.weekEnd = weekEnd;
  src.weekStart = weekEnd ? new Date(Date.parse(weekEnd) - 6 * DAY).toISOString().slice(0, 10) : null;

  // ── 데이터 기준일(AI) — 1차: packs.updated 로 초안을 만들고 실린 관측일 중 가장 늦은 날을 찾는다. 2차: 그 날로 경과일을 다시 센다.
  const base = isDate(packs.updated) ? packs.updated : null;
  const cardMap = readJson("cards/card-map.json", {});
  const cardPages = cardPageIndex(packs, codes, cardMap);
  const extras = require("./ai-data-extras");
  const gradingSeries = readJson("data/grading-series.json", null), auctionSeries = readJson("data/auction-series.json", null), tcgSeries = readJson("data/tcg-series.json", null);
  src.gradingSeries = gradingSeries;   // 등급 인구 페이지 행(sets[code].gradingPage)이 읽는다
  const releaseDraft = buildReleaseFacts(src, base);
  const draftSets = codes.map((code) => {
    const set = packs.sets[code];
    return {
      boxMarket: N.buildBoxMarket(set, base, `${SITE}/sets/${slug(code)}.html`),
      topHits: (set.cards || []).filter((card) => Number.isInteger(card.rank) && card.rank <= 7).map((card) => ({ rawNmAsk: N.rawNmAsk(card, fx, base), psa10Sold: N.psa10Sold(card, base), psaPopulation: N.psaPopulation(card, base) })),
    };
  });
  const draftCards = cardPages.map(({ code, i }) => { const card = packs.sets[code].cards[i]; return { rawNmAsk: N.rawNmAsk(card, fx, base), psa10Sold: N.withUsd(N.psa10Sold(card, base), fx), psaPopulation: N.psaPopulation(card, base) }; });
  const aiGrading = extras.buildGrading(gradingSeries, packs);   // 세트별 등급 인구(AI 파일 opbox-ai-grading.json 의 본문) — PSA 총량은 페이지와 같은 packs 값
  const drafts = [
    { fx: { observedOn: isDate(fx.date) ? fx.date : null }, sets: draftSets, releaseFacts: releaseDraft },
    draftCards,
    aiGrading,
    extras.buildAuctions(auctionSeries, auction, releaseDraft),
    extras.buildTcgAuctions(tcgSeries),
  ];
  const datasetUpdatedOn = drafts.reduce((best, part) => newestObserved(part, best), base);

  // ── 세트별 사실 — 추적 세트(packs) 뒤에 판매 원장에만 있는 세트(미발매 OP-18·EB-05: 현재가 없음, 카드 없음)를 잇는다. 생성기는 order.* 목록으로 돈다.
  const seriesCodes = Object.keys(sold.sets || {});
  const sets = {};
  for (const code of [...codes, ...seriesCodes.filter((c) => !codes.includes(c))]) sets[code] = buildSet(src, code, datasetUpdatedOn);

  // ── 비교표(compare.html · best-one-piece-booster-box.html) 행 — 추적 세트(packs) 전부 + 판매 원장에만 있는 세트 중 일본판 점이 있거나 미발매인 세트.
  //    가장 비싼 카드·4주 변동은 세트 사실과 같은 값. 추적 세트는 일본판 점이 아직 없어도 싣는다(2026-11-02 EB-05 승격: 일본 발매 다음 날이라 일본판
  //    주간 점 0 → 행이 빠져 "Sets compared 22" ≠ 다른 페이지 23, 가드 OV1). 일본판 칸은 값이 없으면 "—".
  const compareRows = seriesCodes.map((code) => {
    const eds = sold.sets[code];
    const jp = (eds.jp || []).filter((x) => Number.isFinite(x.median));
    if (!jp.length && !sets[code].unreleased && !codes.includes(code)) return null;
    const cur = eds.current || {};
    const now = cur.jp || { median: null, n: null };
    const enNow = cur.en || null;
    const s = sets[code];
    const top = s.top10.priciest;
    const change = N.boxChange28(jp, eds.current && eds.current.jp);
    return {
      code, name: s.nameFull || "", jp: now.median, jpN: now.n, en: enNow ? enNow.median : null, enN: enNow ? enNow.n : null,
      chg: change ? change.pct : null, ratio: enNow && now.median ? enNow.median / now.median : null,
      topNames: top ? top.ties.map((c) => c.name) : null, topUsd: top ? top.usd : null, topDate: top ? top.date : null,
      gem: s.grading.psa.jp ? s.grading.psa.jp.gemRate ?? null : null,
    };
  }).filter(Boolean).sort((a, b) => a.code.localeCompare(b.code));
  // 'Ranked by' 표(compare.html 첫 화면) — 2026-10-19. 제목 질의 "best one piece booster box to buy" 에 판정·점수 없이 답하는 정렬 줄.
  //   값은 위 board(일본판 current·4주 등락·× MSRP·n)와 compareRows(최고가 카드) 그대로 — 고르기만 한다. 같은 화면 값이면 전부(표 순서).
  const rankedBy = (() => {
    const shown = { usd: (v) => Math.round(v), pct: (v) => v, x: (v) => v.toFixed(1), n: (v) => v };
    const pick = (list, val, dir, unit) => {
      const xs = list.filter((x) => val(x) != null);
      if (!xs.length) return null;
      const best = xs.reduce((m, x) => (dir * (val(x) - val(m)) > 0 ? x : m), xs[0]);
      return xs.filter((x) => shown[unit](val(x)) === shown[unit](val(best))).sort((a, b) => orderKey(a.code) - orderKey(b.code));
    };
    const live = board.filter((b) => b.nowUsd != null);
    const row = (k, label, ties, unit, value, date, extra = {}) => (ties ? { k, label, codes: ties.map((t) => t.code), unit, value: value(ties[0]), dates: ties.map(date), ...extra } : null);
    const out = [
      row("cheapest", "Lowest JP box price", pick(live, (b) => b.nowUsd, -1, "usd"), "usd", (b) => b.nowUsd, (b) => b.nowDate),
      row("gain", "Largest 4-week gain (JP)", pick(live.filter((b) => b.changePct != null), (b) => b.changePct, 1, "pct"), "pct", (b) => b.changePct, (b) => b.nowDate),
      row("fall", "Largest 4-week fall (JP)", pick(live.filter((b) => b.changePct != null), (b) => b.changePct, -1, "pct"), "pct", (b) => b.changePct, (b) => b.nowDate),
      row("lowMsrp", "Lowest × MSRP (JP)", pick(live, (b) => b.vsMsrp, -1, "x"), "x", (b) => b.vsMsrp, (b) => b.nowDate),
      row("highMsrp", "Highest × MSRP (JP)", pick(live, (b) => b.vsMsrp, 1, "x"), "x", (b) => b.vsMsrp, (b) => b.nowDate),
      row("mostSales", "Most sales in window (JP)", pick(live.filter((b) => b.n != null), (b) => b.n, 1, "n"), "n", (b) => b.n, (b) => b.nowDate, { windowDays: null }),
      row("chase", "Highest raw chase card", pick(compareRows.filter((r) => r.topUsd != null), (r) => r.topUsd, 1, "usd"), "usd", (r) => r.topUsd, (r) => r.topDate),
    ].filter(Boolean);
    const mostSales = out.find((r) => r.k === "mostSales");
    if (mostSales) mostSales.windowDays = mostSales.codes.map((c) => (board.find((b) => b.code === c) || {}).windowDays || null);
    const chase = out.find((r) => r.k === "chase");
    if (chase) chase.names = chase.codes.map((c) => (compareRows.find((r) => r.code === c) || {}).topNames || []);
    return out;
  })();

  // ── 지표 기준선 — 일본판은 시리즈가 있는 전 세트(주간 점 5개 이상)의 중앙값, 영문판은 영문판 페이지가 있는 세트의 중앙값. n 은 실제 모수.
  const hasBoxSold = (c) => ["jp", "en"].some((ed) => packs.sets[c]?.boxMarket?.[ed]?.ebaySold?.median != null);
  const setPages = codes.filter((c) => (packs.sets[c]?.cards || []).length > 0 || hasBoxSold(c));
  const englishPages = codes.filter((c) => packs.sets?.[c]?.boxMarket?.en?.ebaySold?.median != null);
  const metricsJpAll = Object.keys(sold.sets || {}).map((c) => (sets[c] ? sets[c].metrics.jp : null)).filter(Boolean);
  const medOf = (list, key) => median(list.map((m) => m[key]));
  const baselines = {
    jp: Object.fromEntries(["price", "chg", "days", "psa", "gem"].map((k) => [k, medOf(metricsJpAll, k)])),
    en: Object.fromEntries(["price", "chg", "days", "psa", "gem", "multiple"].map((k) => [k, medOf(englishPages.map((c) => sets[c].metrics.en), k)])),
  };

  // ── 주간 PSA 등급 증가(전 세트 합산) — 개봉 미터(build-market-index)·weekly.html 등급 표.
  const weekTotals = {}, weekCoverage = {};
  for (const c of codes) for (const p of (packs.sets[c]?.psaWeekly?.points || [])) { weekTotals[p.d] = (weekTotals[p.d] || 0) + p.v; weekCoverage[p.d] = (weekCoverage[p.d] || 0) + 1; }
  const weeks = Object.keys(weekTotals).sort().map((t) => ({ d: t, v: weekTotals[t], n: weekCoverage[t] }));
  const latestWeek = weeks[weeks.length - 1] || null, prevWeek = weeks[weeks.length - 2] || null;
  const seriesDate = sold.updated || dataDate;
  const gradeLatest = codes.map((c) => sets[c].psaWeekly && sets[c].psaWeekly.last.d).filter(Boolean).sort().pop() || null;
  const gradeAge = gradeLatest ? Math.round((Date.parse(seriesDate) - Date.parse(gradeLatest)) / DAY) : null;
  const psaWeekly = {
    weeks, latestWeek, wowPct: latestWeek && prevWeek ? Math.round((latestWeek.v / prevWeek.v - 1) * 1000) / 10 : null,
    allTimeGraded: codes.reduce((t, c) => t + ((packs.sets[c]?.psaFull?.total) || 0), 0),
    updated: codes.map((c) => packs.sets[c]?.psaWeekly?.updated).filter(Boolean).sort().at(-1) || (latestWeek && latestWeek.d) || null,
    gradeWeek: gradeAge != null && gradeAge <= 10 ? gradeLatest : null,   // 10일 넘게 낡은 주간 델타는 "이번 주"가 아니다(weekly.html)
  };

  // ── 발매 — 가장 최근 발매된 OP 세트와 다음 발매(어느 계열이든), 기준일은 판매 원장 asOf(발매일 글과 같은 기준).
  const F = facts.sets || {};
  const jpRelOf = (c) => (F[c] && F[c].jpRelease && F[c].jpRelease.date) || null;
  const firstRel = (c) => [jpRelOf(c), F[c] && F[c].enRelease && F[c].enRelease.date].filter(Boolean).sort()[0] || null;
  const asOf = sold.asOf || "";
  const newestOp = asOf ? Object.keys(F).filter((c) => /^OP-\d+$/.test(c) && jpRelOf(c) && jpRelOf(c) <= asOf).sort((a, b) => jpRelOf(a).localeCompare(jpRelOf(b)) || +a.slice(3) - +b.slice(3)).pop() || null : null;
  const nextUp = asOf ? Object.keys(F).filter((c) => firstRel(c) && firstRel(c) > asOf).sort((a, b) => firstRel(a).localeCompare(firstRel(b)))[0] || null : null;

  // ── 배포 파일의 관측일 범위(Dataset temporalCoverage·dateModified) — 홈·ko 허브·free-data·psa-grading 이 같은 값을 쓴다(2026-10-14 QA 규칙).
  //    aiData = opbox-ai-data.json(세트 박스 시장 표본·호가 관측일 + Top 7 카드 관측일), modified = datasetUpdatedOn 이상.
  //    boxCsv = opbox-set-prices.csv · grading = opbox-grading-population.csv(행 생성은 free-data-records.js — 날짜만 받는다).
  const span = (ds) => { const v = ds.filter((x) => isDate(x)).sort(); return v.length ? { from: v[0], to: v[v.length - 1], coverage: `${v[0]}/${v[v.length - 1]}` } : null; };
  const aiDates = [];
  for (const code of codes) {
    const s = sets[code];
    for (const market of Object.values(s.market)) aiDates.push(market.sold?.sampleCollectedOn, market.activeAsk?.observedOn);
    for (const c of s.cards.filter((x) => Number.isInteger(x.rank) && x.rank <= 7)) aiDates.push(c.ai.rawNmAsk?.observedOn, c.ai.psa10Sold?.sampleCollectedOn, c.ai.psaPopulation?.observedOn);
  }
  const FDR = require("./free-data-records");
  const aiSpan = span(aiDates);

  // ── 카드리스트(2026-10-15, F4) — 공식 상품 요약에 "우리 숫자"(공식 ID → nm·auction·auctionEn·psa10·page)·영문 상품 출처·박스 현재가·페이지 날짜를 더한다.
  //    pageDate = 화면에 찍히는 날짜 전부(공식 목록 확인일·변경일·데이터일·경매 기준일·영문 목록 확인일·박스 관측일·행별 NM/PSA 10 관측일) 중 가장 늦은 날 —
  //    수정일이 본문보다 이르면 안 된다(가드 CL2·U1). 화면 "Data"·CollectionPage dateModified·JSON updated·피드가 이 값 하나.
  const clNums = cardListNumbers(src, sets, cardMap, cardAuction);
  const cardLists = CL.products().map((p) => {
    const ens = CL.enProductsFor(p.code).map((e) => ({ code: e.code, url: e.url || null, checked: e.checked || null }));
    const box = (ed) => { const c = sets[p.code]?.current?.[ed]; return c && c.median != null ? { usd: c.median, n: c.n, date: c.d } : null; };
    const numbers = clNums.numbers[p.code];
    const boxes = { jp: box("jp"), en: box("en") };
    const pageDate = N.latestDate(p.checked, p.changed, dataDate, cardAuction.day, ...ens.map((e) => e.checked), boxes.jp && boxes.jp.date, boxes.en && boxes.en.date,
      ...Object.values(numbers).flatMap((r) => [r.nm && r.nm.date, r.psa10 && r.psa10.date]));
    return { code: p.code, slug: p.slug, name: CL.nameEnOf(p.code), nameJa: p.name || null, url: p.url || null, checked: p.checked || null, changed: p.changed || null, counts: p.counts, en: ens, box: boxes, numbers, pageDate };
  });
  // 카드리스트 배포 파일(CSV·JSON) Dataset 의 기간 = 공식 목록 확인일과 우리 숫자 관측일(NM·경매 through·PSA 10)의 범위, 수정일 = 세트 페이지 날짜의 최댓값.
  const clDates = [];
  for (const cl of cardLists) {
    clDates.push(cl.checked);
    for (const r of Object.values(cl.numbers)) clDates.push(r.nm && r.nm.date, r.auction && cardAuction.day, r.auctionEn && cardAuction.day, r.psa10 && r.psa10.date);
  }
  const clSpan = span(clDates);

  // ── 발매 예정 페이지(data/upcoming-set-pages.json) — 판별 발매 여부(원장 발매일, 없으면 페이지의 공식 날짜)·예약판매 호가·표 유무·페이지 수정일·일본어 공식 상품명.
  //    pageDate = 사실 확인일(page.modified)과 화면 시세 날짜(판매 원장 기준일 through · 호가 기준일 · 판매 칸 날짜) 중 가장 늦은 날(2026-10-15).
  const UP = readJson("data/upcoming-set-pages.json", { pages: [] });
  const through = sold.builtFrom?.updated || sold.asOf || "";
  const upcoming = {};
  // 반다이 상품 페이지 확인 — checkedOn = 두 판 상품 페이지에서 데이터 파일의 발매일·정가를 그대로 본 마지막 날(사실이 바뀐 날 modified 와 별도), cardList = 공식 목록 공개 여부와 확인일.
  const BANDAI = readJson("data/bandai-product-check.json", { sets: {} }).sets || {};
  for (const page of UP.pages || []) {
    const s = sets[page.code] || null;
    const relOf = (ed) => (s && s.seriesRelease && s.seriesRelease[ed]) || (ed === "jp" ? page.releaseJp : page.releaseEn);
    const released = (ed) => !!(sold.asOf && relOf(ed) <= sold.asOf);
    const ask = { jp: preorderAskOf(preorder, page.code, "jp"), en: preorderAskOf(preorder, page.code, "en") };
    const hasRow = (ed) => !!(ask[ed] || (s && s.preRelease[ed]) || (s && s.current[ed]) || released(ed));
    const hasTable = hasRow("jp") || hasRow("en");
    const askAsOf = (ask.jp && ask.jp.d) || (ask.en && ask.en.d) || preorder.updated || "";
    const bc = BANDAI[page.code] || null;
    const bandai = bc ? { checkedOn: bc.lastOkOn || null, cardList: bc.cardList ? { listed: !!bc.cardList.listed, checkedOn: bc.cardList.checkedOn || null } : null } : null;
    const dates = [page.modified, through, bandai && bandai.checkedOn, bandai && bandai.cardList && bandai.cardList.checkedOn];
    if (hasTable) { dates.push(askAsOf); for (const ed of ["jp", "en"]) dates.push(released(ed) ? s && s.current[ed] && s.current[ed].d : s && s.preRelease[ed] && s.preRelease[ed].last); }
    const prod = (page.facts || []).find((f) => f[0] === "Product");
    upcoming[page.code] = {
      slug: page.slug, modified: page.modified, release: { jp: relOf("jp"), en: relOf("en") }, released: { jp: released("jp"), en: released("en") },
      ask, askAsOf, through, hasTable, pageDate: N.latestDate(...dates), bandai,
      nameJa: prod ? String(prod[1]).split(" · ")[0].replace(/【[^】]*】/g, "").trim() : "",
    };
  }

  // ── 2026 시장 추이(market-2026.html) — 2026-10-19. 'one piece card market trend 2026' 질문은 4엔진 모두 우리 인용 0(10/19 실측), 받을 페이지가 없었다.
  //   달마다: 일본판·영문판 박스 = 세트마다 그 달 말일 점(box-sold-series monthEnd — 말일을 끝으로 하는 주간과 같은 창) → 세트 사이 중앙값(n = 세트 수) ·
  //   4주 등락 = 그 말일 점 대 28일 넘게 앞선 말일 점(전달 말일) ↑/↓ 세트 수 · 이번 달(판매 기준일 sold.asOf 의 달, partial)은 세트마다 현재가·홈과 같은 등락 ·
  //   PSA 등급 증가 = 주간 증가(psaWeekly.weeks, 전 세트 합)의 그 달 합(n = 주 수) · 경매 = auction-series 월간 낙찰 수(n = 관측일 수). asOf = 그 칸 값의 마지막 관측일.
  const MARKET_MIN_SETS = 5;
  const market = (() => {
    const year = String(sold.asOf || dataDate || "").slice(0, 4);
    if (!/^\d{4}$/.test(year)) return null;
    const lastMonth = String(sold.asOf || dataDate).slice(0, 7);
    const months = [];
    for (let m = 1; m <= 12; m++) { const ym = `${year}-${String(m).padStart(2, "0")}`; if (ym <= lastMonth) months.push(ym); }
    const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const k = s.length; return k ? (k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2) : null; };
    // 이번 달 = 판매 기준일(sold.asOf)의 달 — lastMonth 와 같은 원천. 2026-11-02: dataDate(packs.updated, UTC 기록)를 쓰면 매달 1일 08:57 KST 빌드에서
    // 마감된 지난달 행에 현재가가 들어가고 새 달 행이 하루치 점으로 계산된다(11/01 빌드 재현: packs.updated 10-31, 'Sold Nov 1' 67건).
    const curYm = lastMonth;
    const endOf = (node, ed, ym) => ((node.monthEnd || {})[ed] || []).find((p) => p && p.d.slice(0, 7) === ym) || null;
    const boxOf = (ym, ed) => {
      const vals = [], dates = [];
      for (const c of seriesCodes) {
        const node = sold.sets[c] || {};
        // 이번 달(데이터 기준일의 달)은 세트마다 현재가(current — 마지막 점이 28일 안일 때)를 쓴다 — 2026-11-02.
        // 그 달 안에 찍힌 점만 세면 월초엔 하루이틀 사이 팔린 세트만 남아(11/02 영문판 22 → 13세트) 세트 구성이 바뀐 것이
        // 시세 하락($417 → $315)처럼 보였다. 홈·box-prices·compare 의 현재가와 같은 값 — 아래 4주 등락을 이번 달만 현재가로 맞춘 것과 같은 이유.
        // 끝난 달은 말일 점 — 주간 격자 점은 판매가 늘 때마다 날짜·값이 바뀌어 공개한 달 값이 매일 달라졌다(10월 영문판 $380 → $417).
        const last = ym === curYm ? node.current && node.current[ed] : endOf(node, ed, ym);
        if (last && N.isPositive(last.median) && N.isDate(last.d)) { vals.push(last.median); dates.push(last.d); }
      }
      // 세트 5개 미만이면 "시장 중앙값"이 아니라 몇 세트의 값이다 — 칸을 비운다(n 은 남긴다).
      return vals.length >= MARKET_MIN_SETS ? { usd: Math.round(med(vals)), n: vals.length, asOf: dates.sort().pop() } : vals.length ? { usd: null, n: vals.length, asOf: dates.sort().pop() } : null;
    };
    const chgOf = (ym) => {
      let up = 0, dn = 0, flat = 0; const dates = [];
      for (const c of seriesCodes) {
        const ends = ((sold.sets[c] || {}).monthEnd || {}).jp || [], cur = ends.find((p) => p && p.d.slice(0, 7) === ym);
        if (!cur) continue;
        const ch = N.boxChange28(ends.filter((p) => p.d < cur.d), cur);
        if (!ch) continue;
        if (ch.pct > 0) up++; else if (ch.pct < 0) dn++; else flat++;
        dates.push(cur.d);
      }
      return up + dn + flat ? { up, down: dn, flat, n: up + dn + flat, asOf: dates.sort().pop() } : null;
    };
    const psaOf = (ym) => { const ws = (psaWeekly.weeks || []).filter((w) => w.d.slice(0, 7) === ym); return ws.length ? { added: ws.reduce((t, w) => t + w.v, 0), n: ws.length, asOf: ws[ws.length - 1].d } : null; };
    const aucOf = (ym) => {
      const mo = ((auctionSeries && auctionSeries.monthly) || []).find((r) => String(r.d).slice(0, 7) === ym);
      if (!mo) return null;
      const days = ((auctionSeries && auctionSeries.daily) || []).filter((r) => String(r.d).slice(0, 7) === ym).map((r) => r.d).sort();
      return { sold: mo.sold, n: mo.days, partialDays: mo.partialDays || 0, asOf: days.pop() || null };
    };
    const rows = months.map((ym) => ({ month: ym, ...(ym === curYm ? { partial: true } : {}), jp: boxOf(ym, "jp"), en: boxOf(ym, "en"), chg: chgOf(ym), psa: psaOf(ym), auction: aucOf(ym) }))
      .filter((r) => r.jp || r.en || r.chg || r.psa || r.auction);
    // 이번 달(데이터 기준일의 달) 등락은 홈·box-prices·compare 와 같은 값이어야 한다(한 사실 한 값) — 2026-10-19 검증:
    // 시장 페이지 10월 '▲7·▼8 n=18'(그 달 마지막 점 기준) vs 홈 '7 up · 9 down of 19'(현재가 기준). 이번 달만 현재가 기준으로 맞춘다.
    const curRow = rows.find((r) => r.month === curYm);
    if (curRow && home && home.withChg) curRow.chg = { up: home.nUp, down: home.nDn, flat: home.withChg - home.nUp - home.nDn, n: home.withChg, asOf: dataDate };
    const asOf = N.latestDate(...rows.flatMap((r) => [r.jp && r.jp.asOf, r.en && r.en.asOf, r.chg && r.chg.asOf, r.psa && r.psa.asOf, r.auction && r.auction.asOf]));
    return { year, rows, asOf, minSets: MARKET_MIN_SETS };
  })();

  const coverage = {
    aiData: aiSpan && { ...aiSpan, modified: N.latestDate(datasetUpdatedOn, aiSpan.to) },
    boxCsv: span(FDR.buildBoxRecords(packs).dates),
    grading: span(FDR.buildGradeRecords(packs, readJson("data/cgc-grading-history.json", null), readJson("data/tag-grading-history.json", null)).dates),
    cardLists: clSpan && { ...clSpan, modified: N.latestDate(...cardLists.map((c) => c.pageDate)) },
  };

  return {
    schemaVersion: 1,
    // 페이지의 "As of"·"Data"·"기준일" 은 이 값 하나 — 2026-10-19. 종전엔 dataDate(packs.updated)·hubDate(판매 원장 asOf 와의 늦은 쪽)·koHub.date(허브 표 최신 점)가
    //   따로 나가 같은 날 홈 10-18 · 세트 허브 10-19 · ko 제목 10-18 / 본문 10-19 로 갈렸다. 표에 보이는 어느 행 날짜보다도 이르지 않다(판매 원장 asOf 이상).
    dataDate: N.latestDate(dataDate, sold.asOf),
    fx: { date: fx.date || null, jpyKrw: fx.jpyKrw ?? null, usdKrw: fx.usdKrw ?? null, jpyUsd: fx.jpyKrw && fx.usdKrw ? fx.jpyKrw / fx.usdKrw : null },
    // builtFromUpdated = 판매 원장 마지막 날(발매 예정 페이지 "through") · preReleaseMinListings = 예약판매 중앙값에 필요한 서로 다른 매물 수(없으면 3)
    series: { asOf: sold.asOf || null, updated: sold.updated || null, staleDays: sold.staleDays || 28, builtFromUpdated: sold.builtFrom?.updated || null, preReleaseMinListings: sold.preReleaseMinListings || 3 },
    auctionWindow: { days: auction.window?.days ?? null, from: auction.window?.from || null, to: auction.window?.to || null, minDecided: auction.window?.minDecided ?? null, updated: auction.updated || null },
    ai: { datasetUpdatedOn },
    // packSets = packs.sets 의 키 순서(원장 적재 순서 — 카드 상세 후보·허브 표가 같은 순서로 돈다; 동가 정렬이 이 순서를 따른다)
    order: { all: codes, setPages, englishPages, board: rows.map((b) => b.code), series: seriesCodes, packSets: Object.keys(packs.sets || {}) },
    latestSets: latestSets(facts, codes, dataDate),
    board, home, koHub, baselines, psaWeekly,
    weekly: { weekEnd, weekStart: src.weekStart, dataDate: seriesDate },
    releases: { newestOp, nextUp, bandaiAnnouncesReprints: facts.bandaiAnnouncesReprints === true },
    releaseFacts: buildReleaseFacts(src, datasetUpdatedOn),
    cardLists,
    cardPages,
    cardAuction,                                                                   // 카드별 경매 실적(45일 롤링) — day 는 집계 기준일
    psaEditionWeeks: src.psaWeeks ? { prev: src.psaWeeks[0], now: src.psaWeeks[1] } : null,   // PSA 판별 주간 원장의 마지막 두 주(등급 인구 페이지 비교 창)
    preorder: { updated: preorder.updated || null },
    upcoming,
    // 영문판 팩 구성(반다이 영문 상품 페이지의 팩당 카드 수, 확인일) — set-facts 에 있는 세트만, 자연 정렬.
    enPackContents: Object.fromEntries(Object.keys(F).filter((c) => F[c].enPackContents).sort(CL.naturalCode).map((c) => [c, { cardsPerPack: F[c].enPackContents.cardsPerPack ?? null, source: F[c].enPackContents.source || null, verifiedOn: F[c].enPackContents.verifiedOn || null }])),
    aiGrading,
    coverage,
    compare: { rows: compareRows, rankedBy, asOf: N.latestDate(dataDate, sold.asOf) },   // = 위 dataDate(한 날짜, 2026-10-19)
    market,
    sets,
    inputs,
  };
}

// ── 읽기·쓰기 ─────────────────────────────────────────────────────────────────
const sameInputs = (a, b) => a && b && Object.keys(b).every((k) => a[k] === b[k]) && Object.keys(a).length === Object.keys(b).length;
function write(facts) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = `${OUT}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(facts) + "\n", "utf8");
  fs.renameSync(tmp, OUT);
}
let CACHE = null;
/** data/derived/site-facts.json — 입력이 바뀌었으면(해시 불일치) 그 자리에서 다시 굽고 돌려준다. */
function load() {
  if (CACHE) return CACHE;
  const inputs = inputHashes();
  try {
    const f = JSON.parse(fs.readFileSync(OUT, "utf8"));
    if (f.schemaVersion === 1 && sameInputs(f.inputs, inputs)) return (CACHE = f);
  } catch { /* 없으면 굽는다 */ }
  const f = build(inputs);
  write(f);
  return (CACHE = f);
}

module.exports = { load, build, inputHashes, orderKey, OUT };

if (require.main === module) {
  const t0 = Date.now();
  const f = build(inputHashes());
  write(f);
  console.log(JSON.stringify({ wrote: "data/derived/site-facts.json", sets: Object.keys(f.sets).length, cards: Object.values(f.sets).reduce((n, s) => n + s.cards.length, 0), datasetUpdatedOn: f.ai.datasetUpdatedOn, bytes: fs.statSync(OUT).size, ms: Date.now() - t0 }));
}
