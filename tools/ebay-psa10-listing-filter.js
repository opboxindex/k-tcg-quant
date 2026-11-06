"use strict";

function compact(value) {
  return String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function normalizeNumber(number, setCode) {
  const raw = String(number || "").trim().toUpperCase();
  if (/^[A-Z]+[0-9]+-\d+/.test(raw)) return raw;
  if (/^\d+$/.test(raw) && /^OP-\d+/.test(setCode)) {
    return `${setCode.replace("-", "")}-${raw.padStart(3, "0")}`;
  }
  return raw;
}

function hasNumber(title, number) {
  if (!number) return true;
  const normalizedTitle = compact(title);
  const normalizedNumber = compact(number);
  if (normalizedTitle.includes(normalizedNumber)) return true;
  const match = normalizedNumber.match(/^(OP|EB|PRB|ST)(\d{1,2})(\d{3})$/);
  if (!match) return false;
  return normalizedTitle.includes(`${match[1]}${Number(match[2])}${match[3]}`);
}

function hasConflictingCardNumber(title, expectedNumber) {
  const expected = compact(expectedNumber);
  const found = String(title || "").match(/\b(?:OP|EB|PRB|ST)\s*-?\s*\d{1,2}\s*-?\s*\d{3}\b/gi) || [];
  return found.map(compact).some((number) => number !== expected);
}

/** Premium variants must be named explicitly because they share base numbers. */
function hasVariantSignal(title, card) {
  const expected = `${card.name || ""} ${card.rarity || ""}`;
  const premiumTitle = /manga|comic|super\s*parall|super\s*alt/i;
  const treasureSignal = /treasure\s*rare|\btr\b/i;

  if (/treasure\s*rare|\btr\b/i.test(expected)) return treasureSignal.test(title);
  if (/signature|signed|stamped|stamp/i.test(expected)) return /signature|signed|stamped|stamp/i.test(title);
  if (/\bred\b/i.test(expected)) return /\bred\b/i.test(title) && premiumTitle.test(title);
  if (/manga|comic|\bsuper\b/i.test(expected)) return premiumTitle.test(title);
  if (/\bsp\b|speci[a4]l/i.test(expected)) {
    return /\bsp\b|speci[a4]l/i.test(title) && !premiumTitle.test(title);
  }
  if (/parallel|alternate/i.test(expected)) {
    return /parallel|alternate|alt\s*art|leader\s*parallel|paralle/i.test(title)
      && !premiumTitle.test(title)
      && !/\bsp\b|speci[a4]l|red\s*text/i.test(title);
  }
  return !treasureSignal.test(title);
}

// 카드명에서 캐릭터 토큰(들) 추출 — 번호·변형어를 걷어낸 4글자+ 단어들.
// camelCase 분리(EdwardNewgate→edward newgate, TonyChopper→tony chopper), 괄호 제거로 "Sakazuki (Manga)"도 처리.
// 변형어 + 불용어(the/one/new 등). 3글자 캐릭터명(Ace/Kid/Law/Uta)은 살리되 흔한 단어는 뺀다.
const VARIANT_WORDS = /^(sp|special|parallel|paralle|manga|comic|alternate|alt|art|super|gold|golden|silver|red|leader|stamped|signature|signed|wanted|poster|treasure|rare|edition|foil|holo|japanese|jpn|gem|mint|game|the|one|new|and|for|with|his|her|its|dead|mans|drawn)$/i;
function characterTokens(cardName) {
  const cleaned = String(cardName || "")
    .replace(/\b(?:OP|EB|PRB|ST)\s*-?\s*\d{1,2}\s*-?\s*\d{3}\b/gi, " ")   // 카드번호
    .replace(/\b\d+\b/g, " ")                                             // 숫자
    .replace(/([a-z])([A-Z])/g, "$1 $2")                                  // camelCase 분리
    .replace(/[()[\].,\-!/]/g, " ");
  return cleaned.split(/\s+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 3 && !VARIANT_WORDS.test(w));
}

// 매물 제목에 카드의 캐릭터가 들어있나 — 카드 토큰 중 하나라도 (공백/기호 제거한) 제목에 포함되면 통과.
// "하나라도" 규칙은 붙은이름·띄어쓰기 차이 오탐을 막는다. 토큰을 못 뽑으면 통과(과잉제거 방지).
function characterMatches(title, card) {
  const tokens = characterTokens(card.name);
  if (!tokens.length) return true;
  const norm = String(title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return tokens.some((t) => norm.includes(t));
}

// 색상 하위변형(금·은·레드) 충돌. 카드와 매물의 색이 명백히 어긋나면 다른 카드다.
const COLORS = [["red", /\bred\b/i], ["gold", /\bgold(en)?\b|金/i], ["silver", /\bsilver\b|銀/i]];
function colorConflict(title, card) {
  const cardColors = COLORS.filter(([, re]) => re.test(card.name || "")).map(([n]) => n);
  const titleColors = COLORS.filter(([, re]) => re.test(title)).map(([n]) => n);
  // 1) 양쪽 다 색 지정인데 서로 다름 (카드 gold ↔ 매물 silver) → 확실히 다른 카드.
  if (cardColors.length && titleColors.length && !cardColors.some((c) => titleColors.includes(c))) return true;
  // 2) 카드는 무색인데 매물이 '레드'(OPTCG에서 항상 별도 프리미엄) 또는 'gold letters/parallel'(별도 프리미엄)이면 다른 카드.
  //    단순 'silver' 포일은 SP 표준 표기일 수 있어 제외(Buggy Silver SP 등 정상 오탐 방지).
  //    카드가 색 지정인데 매물이 무색인 경우는 여기서 판단 안 함(생NM 가격 규칙에 위임 — Gold Stamped Signature 오탐 방지).
  if (!cardColors.length) {
    if (/\bred\b/i.test(title)) return true;
    if (/\bgold\s*(letters|parallel|foil)\b/i.test(title)) return true;
  }
  return false;
}

function isPsa10JapaneseCardListing(item, setCode, card) {
  const title = item?.title || "";
  const number = normalizeNumber(card.number, setCode);
  const country = item?.itemLocation?.country || item?.country || "";
  const hasJapaneseSignal = /japanese|japan|jpn/i.test(title) || country === "JP";
  const positive = [/one piece/i, /psa\s*10|gem\s*mint\s*10/i];
  const negative = [
    /psa\s*[1-9]\b(?!0)|psa\s*9|psa\s*8|bgs|cgc|ars|raw|ungraded|proxy|digital/i,
    /english|\beng\b|\ben\b|korean|chinese|simplified/i,
    /lot of|bundle|repack|booster|box|case/i,
  ];

  return positive.every((pattern) => pattern.test(title))
    && hasJapaneseSignal
    && !negative.some((pattern) => pattern.test(title))
    && hasNumber(title, number)
    && !hasConflictingCardNumber(title, number)
    && hasVariantSignal(title, card)
    && characterMatches(title, card)   // 캐릭터(성) 불일치 차단 (2026-07-22: Luffy 카드에 Perona 매물 등)
    && !colorConflict(title, card)     // 금·은·레드 하위변형 충돌 차단
    && !promoConflict(title, card);    // 기념 세트·프로모 판 차단
}

// 같은 번호의 기념 세트·프로모 판은 부스터 판과 다른 상품이다 — 2026-09-30 실측: OP-16 수록 에이스 SP(ST15-005_p1)의
// PSA 10 매물로 "3rd Anniversary Set" 판(_p2, 다른 그림)이 잡혀 있었다. psa10-sold-refresh.js 의 판매완료 추출기에는
// 이미 있던 배제 규칙이라 여기에도 맞춘다(두 곳은 같이 유지). 카드 이름 자체가 기념판·프로모면 막지 않는다.
function promoConflict(title, card) {
  const PROMO = /anniversary|promo|promotion|campaign|tournament|prize|winner/i;
  return PROMO.test(title) && !PROMO.test(String(card?.name || ""));
}

// 문자열(제목·Set 속성 등)에서 세트 코드를 뽑는다. "ONE PIECE PRB01-PREMIUM BOOSTER..." → "PRB-01".
function setCodeFromText(text) {
  const m = String(text || "").toUpperCase().match(/\b(OP|EB|PRB|ST)\s*-?\s*0*(\d{1,2})\b/);
  return m ? `${m[1]}-${String(m[2]).padStart(2, "0")}` : null;
}

// ── 판본(edition) 판정 — 2026-11-05 실사고 5건.
// 같은 번호·같은 변형이 여러 세트에 실린다(PRB 재수록 각인판, EB·후속 세트 SP). 번호·변형 필터만으로는 어느 판인지 모른다.
//   ① PRB-01 샹크스 망가 $1,756 = OP-01 원판 매물(제목 '2022 Romance Dawn') ② EB-05 나미 SP $295 = OP-05 판(제목 'OP05')
//   ③ PRB-01 에이스 망가 $850 = OP-02 판(Set 속성 'Paramount War' — 종전 방어는 세트 "코드"만 읽어 통과시켰다)
//   ④ 같은 매물을 두 카드가 나눠 씀(OP05-069 OP-05/PRB-01, OP-14 버기 금/은).
// 증거는 셋이다 — 제목·Set 속성의 세트 코드(OP05·PRB01, 카드 번호 OP01-016 의 앞머리는 빼고), 세트 이름(Romance Dawn·頂上決戦·
// ONE PIECE CARD THE BEST), 연도(PSA 라벨 연도 — 그 세트 일본 발매 연도보다 앞서면 그 판일 수 없다).
// 세트 이름은 손으로 쓰지 않는다: data/onepiece-packs.json nameEn·nameJa + data/official-cardlist.json 상품명 + data/set-facts.json 발매일.
const SET_CODE_RE = /\b(op|eb|prb|st)\s?0*(\d{1,2})\b/g;
const CARD_NUMBER_KEYED_RE = /\b(?:op|eb|prb|st)\s?\d{1,2}\s?\d{3}\b/g;
const PRODUCT_PREFIX_RE = /^(?:booster\s*pack|extra\s*booster|premium\s*booster|ブースターパック|エクストラブースター|プレミアムブースター)\s*-?\s*/i;
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
const REPRINT_FAMILY_RE = /^(?:PRB|EB)-/;

// 비교용 글자: 소문자·아포스트로피 제거·글자/숫자/일본어 외는 공백 하나.
function nameKey(text) {
  return String(text || "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ").trim();
}
function codeKey(code) {
  const m = String(code || "").toUpperCase().match(/^([A-Z]+)-?0*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
}

// 세트 이름·발매일 색인. 입력은 이미 읽은 JSON 세 개(없으면 null) — 순수 함수라 테스트·사실 빌더·수집기가 같은 색인을 만든다.
// 이름 하나가 여러 세트에 붙으면(nameEn "Premium Booster" = PRB-01·PRB-02) 그 이름은 세트 묶음 신호가 된다.
function buildEditionIndex({ packs, setFacts, officialCardlist } = {}) {
  const names = new Map();
  const add = (raw, code) => {
    const c = codeKey(code);
    if (!c || !raw) return;
    // 상품 종류 머리(BOOSTER PACK -·プレミアムブースター)는 떼되, 이름 전체가 그 머리면(nameEn "Premium Booster") 그대로 둔다 — PRB 묶음 신호.
    const base = nameKey(String(raw).replace(PRODUCT_PREFIX_RE, "").replace(/\s*-\s*$/, "")) || nameKey(raw);
    for (const k of new Set([base, base.replace(/^(?:the|a) /, ""), base.replace(/^one piece /, "")])) {
      if (k.length < (CJK_RE.test(k) ? 4 : 8)) continue;
      if (!names.has(k)) names.set(k, new Set());
      names.get(k).add(c);
    }
  };
  for (const [code, s] of Object.entries((packs && packs.sets) || {})) { add(s && s.nameEn, code); add(s && s.nameJa, code); }
  for (const lang of ["jp", "en"]) {
    for (const [code, p] of Object.entries(((officialCardlist && officialCardlist[lang]) || {}).products || {})) add(p && p.name, code);
  }
  const release = {};
  for (const [code, f] of Object.entries((setFacts && setFacts.sets) || {})) {
    const d = f && f.jpRelease && f.jpRelease.date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || "")) release[codeKey(code)] = d;
  }
  return {
    names: [...names.entries()].map(([key, codes]) => ({ key, codes: [...codes].sort(), cjk: CJK_RE.test(key) })).sort((a, b) => b.key.length - a.key.length || a.key.localeCompare(b.key)),
    release,
  };
}

// 수집기·감사가 쓰는 파일 읽기(사실 빌더는 이미 읽은 JSON 으로 buildEditionIndex 를 부른다).
function loadEditionIndex(root, packs) {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; } };
  return buildEditionIndex({ packs: packs || read("data/onepiece-packs.json"), setFacts: read("data/set-facts.json"), officialCardlist: read("data/official-cardlist.json") });
}

// 매물 글자(제목·Set 속성)에서 판본 신호를 뽑는다. signals[] = { codes, via }, year = 글자 속 가장 늦은 20xx.
// 세트 이름을 먼저 지운다 — Set 속성 'OP07-500 YEARS IN THE FUTURE' 의 'OP07-500' 이 카드 번호로 읽히지 않게. 그다음 카드 번호를 지우고 세트 코드를 읽는다.
function editionSignals(texts, index) {
  const signals = [];
  let year = null;
  for (const raw of texts) {
    let t = ` ${nameKey(raw)} `;
    if (!t.trim()) continue;
    for (const y of t.matchAll(/\b(20[12]\d)\b/g)) year = Math.max(year || 0, Number(y[1]));
    for (const n of index.names) {
      const needle = n.cjk ? n.key : ` ${n.key} `;
      let at = t.indexOf(needle);
      while (at !== -1) {
        signals.push({ codes: n.codes, via: `name:${n.key}` });
        t = t.slice(0, at) + " ".repeat(needle.length) + t.slice(at + needle.length);
        at = t.indexOf(needle);
      }
    }
    t = t.replace(CARD_NUMBER_KEYED_RE, " ");
    for (const m of t.matchAll(SET_CODE_RE)) signals.push({ codes: [`${m[1].toUpperCase()}-${m[2].padStart(2, "0")}`], via: "code" });
  }
  return { signals, year };
}

// 매물이 이 카드(세트 setCode)의 판인가 — "match"(그 세트라는 증거가 있다) · "unknown"(증거 없음·묶음 신호뿐) · "conflict"(다른 판).
//   · 카드 번호의 세트(코드 'OP01'·이름 'Romance Dawn')만 가리키는 신호는, 카드가 다른 세트에 실린 판(SP·재수록)이면 판 증거가 아니다 —
//     판매자가 번호의 세트를 다시 적은 것일 뿐이다(OP-03 키드 수배서 OP01-051 매물의 'Romance Dawn'). 번호 세트 = 카드 세트일 때만 증거.
//   · 재수록 세트(PRB·EB) 신호가 있으면 원판 세트 신호는 버린다 — 재수록 매물은 원판 세트명을 같이 적지만 원판 매물은 나중 재수록 세트를 적을 이유가 없다.
//   · 남은 신호가 서로 어긋나거나 카드 세트를 가리키지 않으면 다른 판. 제목 연도가 카드 세트 일본 발매 연도보다 앞서면 다른 판.
function editionVerdict(listing, setCode, card, index) {
  const code = codeKey(setCode);
  const numberSet = setCodeFromText(normalizeNumber(card && card.number, setCode));
  const { signals, year } = editionSignals([listing && listing.title, listing && listing.setAspect].filter(Boolean), index);
  let sig = signals.filter((s) => !(numberSet !== code && s.codes.length === 1 && s.codes[0] === numberSet));
  const reprintOnly = (s) => s.codes.every((c) => REPRINT_FAMILY_RE.test(c));
  if (sig.some(reprintOnly)) sig = sig.filter(reprintOnly);
  const relYear = (c) => (index.release[c] ? Number(index.release[c].slice(0, 4)) : null);
  if (year != null && relYear(code) != null && year < relYear(code)) {
    return { verdict: "conflict", reason: `제목 연도 ${year} < ${code} 일본 발매 ${relYear(code)}`, editions: [] };
  }
  if (!sig.length) return { verdict: "unknown", reason: "판본 신호 없음", editions: [] };
  let inter = new Set(sig[0].codes);
  for (const s of sig.slice(1)) inter = new Set([...inter].filter((c) => s.codes.includes(c)));
  const all = [...new Set(sig.flatMap((s) => s.codes))].sort();
  if (!inter.size) return { verdict: "conflict", reason: `판본 신호가 서로 어긋남(${all.join("·")})`, editions: all };
  if (!inter.has(code)) return { verdict: "conflict", reason: `매물 판본 ${[...inter].sort().join("·")} ≠ ${code}`, editions: [...inter].sort() };
  if (year != null) inter = new Set([...inter].filter((c) => relYear(c) == null || relYear(c) <= year));
  if (inter.size === 1) return { verdict: "match", reason: `매물 판본 ${code}`, editions: [code] };
  return { verdict: "unknown", reason: `세트 묶음 신호뿐(${[...inter].sort().join("·")})`, editions: [...inter].sort() };
}

// 판본 형제 — 같은 번호·같은 변형(망가/SP/패러렐…·금/은/레드)이 다른 세트에도 있는 카드. 이 카드들 사이에선 무표기 매물이 누구 것인지 모른다.
function variantKey(card, setCode) {
  const s = `${(card && card.name) || ""} ${(card && card.rarity) || ""}`;
  const number = normalizeNumber(card && card.number, setCode);
  if (!/^(?:OP|EB|PRB|ST)\d{2}-\d{3}$/.test(number)) return null;
  const cls = /treasure\s*rare|\btr\b/i.test(s) ? "tr"
    : /signature|signed|stamp/i.test(s) ? "sig"
      : /manga|comic|\bsuper\b/i.test(s) ? "manga"
        : /\bsp\b|speci[a4]l/i.test(s) ? "sp"
          : /parallel|alternate|\balt\b/i.test(s) ? "parallel" : "base";
  const colors = COLORS.filter(([, re]) => re.test((card && card.name) || "")).map(([n]) => n).join(",");
  return `${number}|${cls}|${colors}`;
}
function editionSiblings(packs) {
  const byKey = new Map();
  for (const [code, s] of Object.entries((packs && packs.sets) || {})) {
    ((s && s.cards) || []).forEach((card, i) => {
      const k = variantKey(card, code);
      if (!k) return;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push({ code, i, card });
    });
  }
  const out = new Map();
  for (const group of byKey.values()) {
    for (const g of group) out.set(`${g.code}|${g.i}`, group.filter((o) => o.code !== g.code));
  }
  return out;
}

// 카드 한 장이 이 매물을 받아도 되는가. 확실하지 않으면 받지 않는다.
//   PRB 카드는 PRB 판이라는 증거(PRB01·Premium Booster·ONE PIECE CARD THE BEST)가 있어야 한다 — 재수록본(각인·로고판) ≠ 원판.
//   그 밖의 카드는 증거가 없어도 받되, 같은 번호·변형의 다른 세트 카드(형제)도 받을 수 있는 매물이면 받지 않는다.
function acceptListingEdition(listing, setCode, card, siblings, index) {
  const v = editionVerdict(listing, setCode, card, index);
  if (v.verdict === "conflict") return { ok: false, ...v };
  if (v.verdict === "match") return { ok: true, ...v };
  if (/^PRB-/.test(codeKey(setCode) || "")) return { ok: false, ...v, reason: `${v.reason} — PRB 판 표시 없음` };
  const rivals = (siblings || []).filter((s) => editionVerdict(listing, s.code, s.card, index).verdict !== "conflict");
  if (rivals.length) return { ok: false, ...v, reason: `${v.reason} — ${rivals.map((s) => s.code).join("·")} 판과 구분 불가` };
  return { ok: true, ...v };
}

// 수집기의 최저 매물 고르기 — 싼 순서의 후보(candidates: { title, raw: { itemId } })를 Set 속성까지 읽어(fetchAspect) 이 카드 판으로
// 받아도 되는 첫 매물을 돌려준다. 없으면 null(버튼 숨김). Set 속성 조회는 maxLookups 번까지.
// 종전(2026-07-22 PRB-01 재판이 OP-01 원본에 물린 실사고 뒤): 최저 매물 하나의 Set 속성에 세트 "코드"가 있을 때만 걸렀다(listingSetConflicts) —
// 'Paramount War' 같은 세트명·제목의 'Romance Dawn'·연도는 통과했고, 걸러도 다음 매물을 보지 않고 버튼을 지웠다(2026-11-05 실사고).
async function pickEditionListing(candidates, { code, card, siblings, index, fetchAspect, maxLookups = 3, log = () => {} }) {
  let lookups = 0;
  for (const cand of candidates || []) {
    if (lookups >= maxLookups) break;
    lookups += 1;
    const itemId = cand.raw && cand.raw.itemId;
    const setAspect = itemId ? await fetchAspect(itemId) : null;
    const res = acceptListingEdition({ title: cand.title, setAspect }, code, card, siblings, index);
    if (res.ok) return { ...cand, setAspect };
    log(`"${String(cand.title || "").slice(0, 70)}" Set="${setAspect || ""}" — ${res.reason}`);
  }
  return null;
}

// 매물 id — 저장된 bestId("v1|123|0") 또는 URL(/itm/123).
function listingItemId(active) {
  const id = active && active.bestId && String(active.bestId).split("|")[1];
  if (id) return id;
  const m = String((active && active.bestListing && active.bestListing.url) || "").match(/\/itm\/(\d+)/);
  return m ? m[1] : null;
}

// 자체 감사(data/psa10-mismatch-audit.json)의 한 줄이 지금 이 카드의 매물을 가리키는가 — 감사 줄엔 매물 id 가 없고 제목 앞 80자가 있다.
function auditEntryFor(audit, code, card, title) {
  return ((audit && audit.flagged) || []).find((f) => f.code === code && f.number === card.number && f.cardName === card.name
    && f.listingTitle && String(title || "").startsWith(f.listingTitle)) || null;
}

// 저장된 PSA 10 최저 매물 전부를 판본 규칙으로 다시 본다 — 수집기(쓰기 직전)·사실 빌더(표시 직전)가 같은 함수를 쓴다.
// 돌려주는 값: Map("세트|카드순번" → 숨길 이유). 데이터는 고치지 않는다.
//   ① 카드별: acceptListingEdition(제목 + 저장된 Set 속성, 없으면 자체 감사가 읽어 둔 Set 속성).
//   ② 자체 감사가 SET 불일치로 표시한 매물은 그 감사 증거(제목·Set 속성)로 카드 "세트"와 대조해 다른 판이면 숨긴다.
//      2026-11-04 까지의 감사 SET 사유는 카드 "번호"의 세트와 비교한 것이라(OP-05 나미 SP 의 맞는 'OP05' 매물도 'OP-01 ≠' 로 찍혔다) 사유 글자만 보고 지우지 않는다.
//   ③ 같은 매물을 두 카드 이상이 쓰면 판본(match)과 금·은·레드가 제목으로 확인된 카드 하나만 남긴다. 둘 이상이거나 없으면 모두 숨긴다.
function psa10ListingRejections({ packs, index, audit } = {}) {
  const sibs = editionSiblings(packs);
  const rejected = new Map();
  const kept = [];
  for (const [code, s] of Object.entries((packs && packs.sets) || {})) {
    ((s && s.cards) || []).forEach((card, i) => {
      const pa = card && card.psa10Active;
      const bl = pa && pa.bestListing;
      if (!bl) return;
      const key = `${code}|${i}`;
      const auditRow = auditEntryFor(audit, code, card, bl.title);
      const listing = { title: bl.title || "", setAspect: pa.setAspect || (auditRow && auditRow.setAspect) || null };
      const res = acceptListingEdition(listing, code, card, sibs.get(key), index);
      if (!res.ok) { rejected.set(key, `판본: ${res.reason}`); return; }
      if (auditRow && (auditRow.reasons || []).some((r) => /^SET:/.test(r))) {
        const v = editionVerdict({ title: auditRow.listingTitle, setAspect: auditRow.setAspect }, code, card, index);
        if (v.verdict === "conflict") { rejected.set(key, `자체 감사 SET: ${v.reason}`); return; }
      }
      kept.push({ key, code, card, id: listingItemId(pa), title: bl.title || "", match: res.verdict === "match" });
    });
  }
  const byId = new Map();
  for (const k of kept) if (k.id) { if (!byId.has(k.id)) byId.set(k.id, []); byId.get(k.id).push(k); }
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    const confirmed = group.filter((g) => g.match && COLORS.every(([, re]) => !re.test(g.card.name || "") || re.test(g.title)));
    const keep = confirmed.length === 1 ? confirmed[0] : null;
    for (const g of group) if (g !== keep) rejected.set(g.key, `같은 매물 ${id} 을 ${group.map((x) => x.code).join("·")} 카드 ${group.length}장이 씀 — 판본 확인 안 됨`);
  }
  return rejected;
}

module.exports = {
  hasVariantSignal, isPsa10JapaneseCardListing, normalizeNumber, setCodeFromText, characterTokens, characterMatches, colorConflict,
  buildEditionIndex, loadEditionIndex, editionSignals, editionVerdict, variantKey, editionSiblings, acceptListingEdition, pickEditionListing, listingItemId, auditEntryFor, psa10ListingRejections,
};
