// 박스 eBay SOLD 원장(ledger) 적재 — "우리만의 데이터"의 원본 저장소.
//
// 입력: 브라우저(사용자 IP)에서 box-sold-urls.js 의 수집기(EXTRACTOR)로 긁은 원시 덤프 파일.
//   { collectedAt:"YYYY-MM-DD", pages:[ { code:"OP-13", query:"jp"|"en", items:[{id,t,d,k,cur}] } ] }
//   (id=eBay 상품번호, t=제목, d="Sold  Jul 22, 2026", k=표시가 숫자, cur=KRW|USD|OTHER)
//
// 출력 1: data/box-sold-ledger.json — 판매 1건 = 1레코드(append-only, id로 전역 중복제거).
//   여기서 주차별 중앙값·판매건수·판매액이 전부 파생된다. 과거 레코드는 절대 수정/삭제하지 않는다.
// 출력 2: data/onepiece-packs.json 의 boxMarket.[jp|en].ebaySold 스냅샷(이번 덤프에서 유효 n>=3일 때만)
//   — 기존 box-sold-series(D5) 흐름과의 연속성 유지용. 기준(페이지에 보이는 sold 전체의 중앙값) 동일.
//
// 판정 규칙(정확도 최우선 — 빈 값이 틀린 숫자보다 낫다):
//  - "booster box" 제목 + 대상 세트코드 일치, 다른 세트코드가 같이 있으면 버림(멀티세트 묶음).
//  - pack/lot/case/display/sleeve/bundle 등 비단품 신호 버림. 중국어판 버림.
//    단 "w/ Acrylic Case"·"Case Fresh" 처럼 박스 1개에 붙는 case 문구는 케이스가 아니다(box-case-words.js).
//  - 다수량: lot-quantity.js 규칙 — "x3"/"3 boxes"는 총액÷개수=개당가, 개수 불명은 버림.
//  - 언어: 제목에 english→en, japanese→jp, 표기 없으면 버림(추측 금지).
//  - 개당가 문턱: 9만원(≈$58) 미만 버림(팩/오매칭), $5,000 초과 버림(이상치).
//  - 날짜: "Sold <날짜>" 파싱 실패·미래 날짜 버림.
//
// Run: node tools/box-sold-ingest.js <dump.json>
const fs = require("fs");
const path = require("path");
const { unitPrice } = require("./lot-quantity");
// "case" 가 붙은 단품 박스("w/ Acrylic Case", "Case Fresh")를 케이스(12박스)와 가른다 — 2026-09-30.
const { stripSingleBoxCase, boxQuantity, ACCESSORY_ONLY } = require("./box-case-words");

const ROOT = path.join(__dirname, "..");
const dataPath = path.join(ROOT, "data", "onepiece-packs.json");
const ledgerPath = path.join(ROOT, "data", "box-sold-ledger.json");

// BOOSTER(/booster box/)가 이미 단품 카드·팩을 배제하므로 여기선 "박스인데 단일 봉인박스가 아닌"
// 신호만 거른다. ⚠️ "packs"(박스는 24팩을 담는다)·"card"("Card Game" 정품 박스명)를 넣으면 정상 박스가
// 대량 탈락한다(2026-07-22 레드팀 지적). lot/case/carton/display/bundle/sleeve/blister 등만.
// 한국판(korean)도 뺀다 — 이 원장은 일본판/영문판 두 판만 다루는데, 한국판이 일본판 검색에 섞여 들어왔다
// (2026-08-13: "Romance Dawn OP01 Booster Box Korean" $98 이 OP-01 일본판으로 적재됨).
// miracle battle carddass = 반다이의 **다른** 카드게임인데 "OP 16" 같은 번호를 써서 우리 세트로 잡힌다
// (2026-08-24 실측: "Miracle Battle Carddass MBC Japanese OP 16 One Piece Booster Box" $1,118 이
//  OP-16 일본판 원장에 들어와 있었다 — 그 세트 일본판 중앙값은 $120 이다).
const { OTHER_GAME } = require("./other-game-words");   // 다른 게임 상품(건담 EB01 등) — 2026-09-24
const { COMBINED } = require("./combined-set-codes");   // 영문 OP-14·OP-15 = OP14-EB04·OP15-EB04 합본 — 2026-09-30
const BAD = /\blots?\b|\bcases?\b|carton|display|sleeved?|bundle|wholesale|\bbulk\b|choose|\bpick\b|blister|proxy|\bempty\b|chinese|simplified|korean|miracle\s*battle|carddass/i;
const BOOSTER = /booster box/i;
// "Booster Pack ... x1 -From Fresh booster box" 처럼 **낱팩**을 팔면서 설명에 booster box 를
// 적는 매물이 있다. 단수 "booster pack" 이 보이면 박스가 아니다 — 박스는 "24 booster packs"(복수)로 쓴다.
// 2026-08-13: 이 두 건이 박스 시세에 $251(OP-01 영문 초판) · $66(PRB-01 영문)으로 섞여 있었다.
const SINGLE_PACK = /\bbooster pack\b(?!s)/i;
const SET_CODE = /\b(OP|EB|PRB|ST)[-\s]?(\d{2})\b/gi;

// 세트 이름으로도 코드를 잡는다 — 2026-08-12 신설.
// eBay 제목 상당수가 코드 없이 이름만 쓴다: "One Piece Card Game Romance Dawn Booster Box English".
// 코드만 보던 때는 이런 건이 code-missing 으로 통째로 버려졌다.
//
// ⚠️ 이름이 겹치는 세트는 제외한다. PRB-01·PRB-02 는 둘 다 nameEn 이 "Premium Booster" 라
//    이름만으로는 어느 쪽인지 알 수 없다 — 그런 건 추측하지 않고 코드에만 의존한다.
// 이름표는 onepiece-packs.json 을 그대로 읽는다(하드코딩하면 세트가 늘 때 조용히 어긋난다).
const normName = (s) => String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// extra — 수집 목록에는 있지만 packs.json 에 아직 없는 세트(box-sold-urls.js 의 UPCOMING).
// 2026-09-30: 이름표가 packs.json 만 읽어서, 수집하는 세트(EB-05 "Heroines Edition vol.2")의 이름은 모르고
// 앞 권(EB-03 "Heroine's Edition")의 이름만 알았다. 그러면 EB-05 제목이 EB-03 이름에도 걸려 cross-set 으로 버려지고,
// 코드 없는 EB-05 제목은 EB-03 으로 들어간다. 수집하는 세트는 이름표에도 있어야 한다.
//
// JP_TITLE_EN — 일본판 제목을 영어로 옮긴 이름. 2026-11-08.
// 일본판 박스 판매자는 영문판 이름(nameEn) 대신 일본판 제목의 번역을 쓴다:
//   OP-06 双璧の覇者 "Twin Champions"(영문판 "Wings of the Captain"), OP-13 受け継がれる意志 "Inherited Will"(영문판 "Carrying on His Will").
// 이름표에 없으니 "Bandai One Piece CCG Twin Champions Booster Box  Japanese"(Sold Sep 8, ₩137,640)는 덤프 49일 내내
// OP-06 일본판 검색 맨 위(0~2번째)에 있었는데도 code-missing 으로 버려졌고, 그 1건 때문에 OP-06 일본판 09-16 주가 6건에 못 미쳐 빠졌다.
// 거꾸로 "Inherited Will OP03" 처럼 두 세트를 가리키는 제목은 cross-set 으로 걸러지지 않고 OP-03 일본판에 들어갔다.
// 원장에서 확인된 이름만 넣는다(추측 금지): 'Twin Champions' 10행 전부 OP-06 일본판, 'Inherited Will' 23행 중 22행 OP-13 일본판(나머지 1행이 위 OP03).
const JP_TITLE_EN = { "OP-06": "Twin Champions", "OP-13": "Inherited Will" };
function buildNameMap(packs, extra = []) {
  const byName = new Map();
  const codes = [...(packs.jp?.list || []), ...(packs.extra?.list || [])];
  const entries = codes.map((code) => [code, packs.sets[code]?.nameEn]);
  for (const code of codes) if (JP_TITLE_EN[code]) entries.push([code, JP_TITLE_EN[code]]);
  for (const u of extra) if (!packs.sets[u.code]) entries.push([u.code, u.nameEn]);   // packs 로 옮겨진 세트는 두 번 넣지 않는다(중복 이름 → 둘 다 지워진다)
  for (const [code, nameEn] of entries) {
    const n = normName(nameEn || "");
    if (n.length < 6) continue;             // 너무 짧은 이름은 오탐 위험 — 쓰지 않는다
    if (byName.has(n)) byName.set(n, null); // 중복 이름 → 판별 불가로 표시
    else byName.set(n, code);
  }
  // null(중복)은 버리고 유일한 이름만 남긴다
  return [...byName.entries()].filter(([, v]) => v).sort((a, b) => b[0].length - a[0].length);
}
// 이름 바로 뒤의 권수 표기 — "Heroines Edition Vol.2" 의 "vol 2"(normName 뒤라 구두점은 공백이다).
const VOL_NEXT = /^ (?:vol(?:ume)? ?(?:\d+|i{1,3}|iv)|v\d+)\b/;
// 이름 바로 뒤의 맨 숫자 — "Heroines Edition 2". 권수인지 수량(2박스)인지 제목만으로는 모른다.
const NUM_NEXT = /^ (?:\d{1,2}|i{2,3})\b/;
// 제목에서 세트 이름을 찾아 코드를 돌려준다. 판별할 수 없으면 null — 추측하지 않는다.
//  · 긴 이름부터 찾고, 찾은 자리는 지운다 — "heroines edition vol 2"(EB-05) 안의 "heroines edition"(EB-03)이
//    다시 걸리지 않게. (종전엔 includes 로 둘 다 걸려 EB-05 가 cross-set 으로 버려졌다)
//  · 이름 뒤에 권수(vol 2)가 붙어 있으면 그 이름으로는 세트를 정하지 않는다 — 같은 시리즈의 다른 권이다.
//    코드(EB-05)가 제목에 있으면 그 코드로 판정되고, 없으면 code-missing 으로 버려진다.
//  · 더 긴 이름의 앞부분인 이름(시리즈 첫 권 "heroines edition") 뒤에 맨 숫자가 붙으면 null.
//    "Heroines Edition 2 Booster Box" 는 EB-05 한 박스인지 EB-03 두 박스인지 모른다.
//  · 단어 경계로만 찾는다("royal blood" 가 "royal bloodline" 에 걸리지 않게).
function codesFromName(title, nameMap) {
  let t = ` ${normName(title)} `;
  const out = [];
  for (const [n, code] of nameMap) {
    const seriesHead = nameMap.some(([m]) => m.startsWith(n + " "));
    let i;
    while ((i = t.indexOf(` ${n} `)) >= 0) {
      const rest = t.slice(i + n.length + 1);          // " vol 2 booster box " 처럼 공백으로 시작
      t = t.slice(0, i) + " | " + rest;                  // 찾은 이름은 지운다(짧은 이름이 다시 못 걸게)
      if (VOL_NEXT.test(rest)) continue;
      if (seriesHead && NUM_NEXT.test(rest)) return null;
      out.push(code);
    }
  }
  return out;
}

// 영문판에만 있는 물리적 특징. 판매자가 Language 를 Japanese 로 잘못 신고해도 이건 안 바뀐다.
//  · White/Blue Bottom — 영문판 초판 박스 바닥 색. 일본판에는 이 구분 자체가 없다.
//  · Wave 1/2 — 영문판 재생산 차수 표기. 일본판은 이렇게 부르지 않는다.
// 2026-08-13 실사고: 이 신호가 없어서 White Bottom $1,458~$1,686, Blue Bottom $4,101 짜리
// 영문판이 OP-01 "일본판" 시세로 들어갔고 5월 중앙값이 $1,437 로 찍혔다(실제 일본판은 $290 대).
const EN_ONLY_TRAIT = /\b(white|blue)\s*bottom\b|\bwave\s*[12]\b/i;

function editionOf(title) {
  if (/english|\beng\b/i.test(title)) return "en";
  if (EN_ONLY_TRAIT.test(title)) return "en";
  if (/japanese|japan\b/i.test(title)) return "jp";
  return null;   // 언어 표기 없음 — 추측하지 않는다
}

// eBay 표시일("Sold  Sep 29, 2026")을 **글자 그대로** 판매일로 쓴다 — 2026-10-01 교정(하루 이른 날짜 사고).
// 종전엔 Date.parse(실행 머신 로컬 자정, 이 PC 는 KST 00:00) → toISOString(UTC, 전날 15:00) 으로 바꿔
// 하루 이른 날짜(9/28)를 적었다. 2026-07-22 신설 때부터 그랬고, 9/30 덤프 255,760건 전부 -1일이었다
// (같은 날 0건). eBay 가 보여주는 날짜는 브라우저 로컬(KST) 기준 날짜라 그 글자가 곧 판매일이다 —
// 타임존 변환이 끼어들 자리가 없다. 월 이름을 직접 조립하므로 실행 머신의 TZ 와 무관하다
// (팰월드 sold 적재기와 같은 방식 — 그쪽은 처음부터 이렇게 해서 사고가 없었다. 그 적재기는 2026-11-05 수집 중단으로 삭제).
// 원장(data/box-sold-ledger.json)은 같은 날 tools/migrate-box-sold-dates-20261001.js 로 전 행 +1일 이관했다
// (dateBasis:"ebay-display-date"). 중복 키가 id|판매일이라 파서만 고치면 지난 판매가 전부 새 키로 다시 들어온다.
const MONTH = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function soldDateOf(caption) {
  const m = String(caption || "").match(/sold\s+([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*$/i);
  if (!m) return null;
  const mo = MONTH[m[1].toLowerCase()], day = Number(m[2]), y = Number(m[3]);
  if (!mo || new Date(Date.UTC(y, Number(mo) - 1, day)).getUTCDate() !== day) return null;   // "Feb 30" 같은 없는 날
  const iso = `${y}-${mo}-${String(day).padStart(2, "0")}`;
  if (iso > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) return null;  // 미래 날짜 — 파싱 오류
  return iso;
}

// 한 건 판정. 통과하면 원장 레코드, 아니면 {drop:이유}. (가드 Q1이 코퍼스로 검증하는 진입점)
// declaredEd — 2026-08-12 신설. eBay 검색의 `&Language=Japanese|English` 패싯으로 받아온 페이지면
// 그 판별은 **판매자가 신고한 값**이다. 제목 키워드 추측보다 훨씬 정확하다.
//   실측(OP-01): 제목만 보면 언어 미표기로 614건을 버렸는데, 패싯으로 받으면 일본판만 226건이다.
// 다만 신고가 틀린 건도 있다(같은 실측에서 일본어 패싯에 영문 제목 8건). 그래서 그대로 믿지 않고
// **제목이 정반대로 말하면 버린다**(lang-conflict). 둘이 일치하거나 제목이 침묵할 때만 채택한다.
// declaredEd 가 없으면(구 덤프·가드 코퍼스) 종전대로 제목에서만 판별한다.
// 판별 가격대 — 언어 미표기 매물의 신고값을 검증하는 데 쓴다. ingest 시작 시 원장에서 만든다.
// 값이 없으면(신생 세트) 검증을 걸지 않는다 — 근거 없이 버리지 않는다.
let EDITION_BANDS = {};

function judgeItem(item, targetCode, fxUsdKrw, nameMap, declaredEd, fmt) {
  const t = String(item.t || "");
  if (!BOOSTER.test(t)) return { drop: "not-booster-box" };
  if (SINGLE_PACK.test(t)) return { drop: "single-pack" };
  if (ACCESSORY_ONLY.test(t)) return { drop: "accessory-only" };
  // BAD 의 case 는 12박스 케이스를 막으려는 것이다. 단품 박스에 붙는 case 문구만 지우고 검사한다
  // (box-case-words.js — 9/18~9/30 덤프에서 이 이유로 단품 판매 109건이 빠져 있었다).
  if (BAD.test(stripSingleBoxCase(t))) return { drop: "bad-word" };
  if (OTHER_GAME.test(t)) return { drop: "other-game" };
  const codes = new Set();
  for (const m of t.matchAll(SET_CODE)) codes.add(`${m[1].toUpperCase()}-${m[2]}`);
  // 코드가 없으면 세트 이름으로 찾아본다. 이름으로 찾은 코드도 같은 집합에 넣어야
  // 아래 cross-set 검사(다른 세트가 같이 적힌 제목 배제)가 그대로 적용된다.
  if (nameMap) {
    const byName = codesFromName(t, nameMap);
    if (byName === null) return { drop: "name-ambiguous" };   // "Heroines Edition 2" — 권수인지 수량인지 모른다
    for (const c of byName) codes.add(c);
  }
  // 합본 제품코드(OP14-EB04·OP15-EB04)의 짝 코드는 다른 세트가 아니다 — 짝을 지우고 합본 표시를 남긴다.
  // 합본은 영문판에만 있으니 판별이 정해진 뒤 영문판이 아니면 버린다(아래 combined-code-not-en).
  let combined = false;
  for (const [ed0, partner] of Object.entries(COMBINED[targetCode] || {})) {
    if (codes.has(targetCode) && codes.has(partner)) { codes.delete(partner); combined = ed0; }
  }
  if (!codes.has(targetCode)) return { drop: "code-missing" };
  if ([...codes].some((c) => c !== targetCode)) return { drop: "cross-set" };
  const fromTitle = editionOf(t);
  // 신고값이 있으면 그걸 쓰되, 제목이 정반대로 말하면 버린다(판매자 오신고 방어).
  if (declaredEd && fromTitle && fromTitle !== declaredEd) return { drop: "lang-conflict" };
  const ed = declaredEd || fromTitle;
  if (!ed) return { drop: "no-language" };
  if (combined && ed !== combined) return { drop: "combined-code-not-en" };
  const qty = boxQuantity(t);
  if (qty == null) return { drop: "uncountable-lot" };
  const totalUsd = item.cur === "USD" ? item.k : item.cur === "KRW" ? item.k / fxUsdKrw : null;
  if (!Number.isFinite(totalUsd)) return { drop: "bad-currency" };
  const unit = unitPrice(totalUsd, qty);
  // 상한 8000 — OP-01 영문 Blue Bottom(초판)은 실제 $4~6천대다. 5000 이면 그 세트의 진짜 거래를 버린다.
  if (unit == null || unit < 90000 / fxUsdKrw || unit > 8000) return { drop: "price-out-of-range" };

  // ── 언어 신고값 교차검증 — 2026-08-24.
  // eBay Language 패싯은 판매자 신고값이라 영문판이 Japanese 로 신고되는 일이 잦다.
  // 실측: 일본판 원장 917건 중 83건(9%)이 영문판 가격대에 있었고, OP-13 은 23/91(25%)였다.
  //   예) "One Piece OP-01 Romance Dawn Booster Box New and Sealed" $1,543
  //       — jp 중앙값 $278 / en 중앙값 $1,658. 제목은 언어를 말하지 않는다.
  // 제목이 언어를 **명시한** 매물은 건드리지 않는다(그건 판매자가 직접 쓴 말이다).
  // 제목이 침묵할 때만, 값이 상대 판본 대역에 앉아 있으면 신고값을 믿지 않는다.
  // 두 조건을 다 요구하므로 두 판본 가격이 비슷한 세트에서는 아무것도 걸리지 않는다(보수적).
  if (!fromTitle) {
    const band = EDITION_BANDS[targetCode];
    const mine = band && band[ed], other = band && band[ed === "jp" ? "en" : "jp"];
    if (mine && other && other > mine * 2 && unit >= other * 0.8 && unit > mine * 2) {
      return { drop: "lang-unverified-price-band" };
    }
  }
  const d = soldDateOf(item.d);
  if (!d) return { drop: "bad-date" };
  // fmt: "bin"(즉시구매) | "auction"(경매). 시세 그래프는 즉시구매만 쓴다 — 경매는 입찰이 안 붙으면
  // 시세보다 훨씬 낮게 끝나 섞으면 잡음이 된다. 구 덤프에는 이 값이 없어 undefined 로 남는다.
  const rec = { id: String(item.id), d, unit: Number(unit.toFixed(2)), total: Number(totalUsd.toFixed(2)), qty, title: t.slice(0, 140) };
  if (fmt === "bin" || fmt === "auction") rec.fmt = fmt;
  // 원화 원본과 적용 환율을 함께 박는다 — 2026-08-17.
  // 그 전에는 달러값만 남겼는데, fx.json 이 47일 멈춰 있던 걸 뒤늦게 발견했을 때
  // "이 기록은 어느 환율로 환산됐나"를 알 길이 없어 git 이력으로 수집일을 역추적해야 했다
  // (tools/restore-box-fx.js). 두 번 다시 추정하지 않도록 원본을 그대로 보관한다.
  if (item.cur === "KRW") { rec.krw = Math.round(item.k / qty); rec.fx = Number(fxUsdKrw.toFixed(2)); }
  return { rec, ed };
}


function main(dumpFile) {
  const dump = JSON.parse(fs.readFileSync(dumpFile, "utf8"));

  // 표준 절차(box-sold-urls.js --setup)로 받은 덤프만 받는다 — 2026-08-31 신설.
  // 그날 구식 출력(--json 의 rows)으로 수집했다가 300건을 통째로 버렸다. 그 URL 에는
  // LH_BIN=1 이 없어 경매 낙찰가가 섞일 수 있고, fmt 표시가 없어 그래프가 전량 버렸다.
  // 원장에는 들어갔는데 화면에는 하나도 안 나오는 상태가 되고, 원장은 소급 수정이 안 된다.
  // 플래그가 없다고 fmt 를 임의로 'bin' 이라 적으면 경매 섞인 데이터에 즉시구매 도장을 찍는 셈이라
  // 더 나쁘다. 그래서 받지 않는다.
  if (!dump.fmtSplit || !dump.langFacet) {
    throw new Error(
      "덤프에 fmtSplit/langFacet 표시가 없다 — box-sold-urls.js --setup 으로 다시 수집할 것. " +
      "(--setup 만 LH_BIN=1(즉시구매만)·Language 패싯·가격대 분할을 건다)"
  );
  }
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const fx = data.fx.usdKrw;
  const nameMap = ingestNameMap(data);
  const today = dump.collectedAt;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) throw new Error("dump.collectedAt 필요 (YYYY-MM-DD)");

  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { ledger = { sets: {} }; }
  ledger.sets = ledger.sets || {};
  // 중복 키는 **매물 id + 판매일**이다 — 2026-08-25 수정.
  // 종전엔 id 만 봤다. 그런데 eBay 의 sold 검색은 매물 하나를 한 줄로 보여주고 날짜는 **최근 판매일**만 싣는다.
  // 재고가 여러 개인 매물(다량 판매자)은 같은 id 로 여러 번 팔리는데, id 만으로 걸러서
  // 두 번째 이후 판매를 전부 "이미 아는 건"으로 버렸다.
  // 실측 2026-08-25: OP-16 일본판이 8/6 이후 한 건도 안 팔린 것처럼 보였는데, 실제로는
  // 8/12·8/16·8/16·8/24·8/25 에 팔렸다. 그 5건의 id 가 전부 원장에 7월 날짜로 이미 있었다
  // (예: 137382805205 — eBay 는 Aug 24 "Last one", 우리 원장은 2026-07-24).
  // 그래서 일본판 시세가 20일째 정지한 것처럼 그려졌다.
  const knownKeys = new Set();
  const keyOf = (id, d) => `${id}|${d}`;
  for (const eds of Object.values(ledger.sets)) for (const arr of Object.values(eds)) if (Array.isArray(arr)) for (const r of arr) knownKeys.add(keyOf(r.id, r.d));

  // 판별 가격대(중앙값)를 원장에서 만든다 — judgeItem 의 언어 교차검증이 쓴다.
  // **제목이 언어를 명시한 기록만** 기준으로 삼는다. 신고값만 있는 기록까지 넣으면
  // 오염된 값이 다시 기준이 되어 오염을 정상으로 만든다(순환).
  EDITION_BANDS = {};
  for (const [code, eds] of Object.entries(ledger.sets)) {
    const band = {};
    for (const edKey of ["jp", "en"]) {
      const named = (eds[edKey] || []).filter((r) => editionOf(r.title || "") === edKey).map((r) => r.unit);
      if (named.length >= 5) {
        const x = named.sort((a, b) => a - b);
        band[edKey] = x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2;
      }
    }
    if (band.jp && band.en) EDITION_BANDS[code] = band;
  }

  const summary = {};
  const drops = {};
  let backfilled = 0;   // 기존 레코드에 fmt 를 뒤늦게 채운 수
  // eBay 는 한 검색에 240~265건까지만 준다(_pgn 은 무시된다). 그 수에 닿은 구간은 잘린 것이라
  // 오래된 판매를 못 봤다는 뜻이다. 조용히 넘어가면 "다 모았다"고 착각한다.
  //
  // ⚠️ 판정에 rawN 을 쓰면 안 된다 — 2026-08-18 실측: OP-16 영문 15만~30만 구간이 rawN 242 였는데
  //    실제 부스터박스는 135건이고 나머지 107개는 eBay 가 채운 유사 상품이었다. 그 구간을 반으로
  //    쪼개 봤더니 145건(+7%)에 그쳤다 — rawN 으로 세면 "137/210 페이지가 잘렸다"는 잘못된 경보가 난다.
  //    실제로 잘렸는지는 **우리가 박스로 판정한 건수(kept)** 가 240 에 닿았는지로 본다.
  const cappedPages = [];
  // UPCOMING(발매 임박, packs.json 미등재) 세트도 원장에는 받는다 — 2026-08-21.
  // 종전엔 여기서 무음 스킵됐다: 수집 배치는 OP-17 페이지를 만드는데 ingest 가 통째로 버려서,
  // 발매 직후 데이터가 영영 사라질 뻔했다(240건 상한+최근순이라 소급 불가 — 팰월드 BP-01 전례).
  // 스냅샷(packs.json 반영)은 여전히 등재된 세트만 — 화면은 세트 등재 후에 열린다.
  const upcomingCodes = new Set(require("./box-sold-urls.js").UPCOMING.map((u) => u.code));
  for (const page of dump.pages || []) {
    const code = page.code;
    if (!data.sets[code] && !upcomingCodes.has(code)) continue;
    const boxLike = (page.items || []).filter((it) => /booster\s*box/i.test(String(it.t || ""))).length;
    if (boxLike >= 235) cappedPages.push(code + "/" + page.query + (page.band != null ? "/" + page.band : ""));
    // 이번 덤프에서 유효 판정된 건 전부(이미 아는 id 포함) — 스냅샷 계산용
    const seen = { jp: [], en: [] };
    let appended = 0;
    for (const item of page.items || []) {
      // 덤프가 Language 패싯으로 수집됐다고 표시한 경우에만 신고값을 쓴다.
      // 구 덤프(langFacet 없음)는 종전대로 제목에서만 판별한다 — 과거 원장과 기준이 흔들리지 않게.
      const declaredEd = dump.langFacet ? (page.query === "jp" ? "jp" : "en") : null;
      // 덤프가 즉구/경매를 나눠 받았다고 표시한 경우에만 fmt 를 붙인다.
      const fmt = dump.fmtSplit ? (page.fmt === "auction" ? "auction" : "bin") : null;
      const j = judgeItem(item, code, fx, nameMap, declaredEd, fmt);
      if (j.drop) { drops[j.drop] = (drops[j.drop] || 0) + 1; continue; }
      seen[j.ed].push(j.rec);
      if (knownKeys.has(keyOf(j.rec.id, j.rec.d))) {
        // 같은 매물이 같은 날 여러 밴드에 잡힌 것 — 한 건이다.
        // 가격·날짜는 절대 덮어쓰지 않는다. 다만 fmt 는 예전에 아예 수집하지 않던 값이라
        // 비어 있을 때만 채운다 — 과거 레코드가 즉구였는지 경매였는지 알아낼 유일한 기회다.
        if (j.rec.fmt) {
          const arr = (ledger.sets[code] || {})[j.ed] || [];
          const old = arr.find((r) => r.id === j.rec.id && r.d === j.rec.d);
          if (old && !old.fmt) { old.fmt = j.rec.fmt; backfilled++; }
        }
        continue;
      }
      knownKeys.add(keyOf(j.rec.id, j.rec.d));
      ledger.sets[code] = ledger.sets[code] || { jp: [], en: [] };
      ledger.sets[code][j.ed].push(j.rec);
      appended++;
    }

    // 요약도 페이지마다 덮어쓰지 말고 더한다.
    // 예전엔 덮어써서 jp 페이지 결과가 en 페이지에 지워졌고, jpSeen 이 늘 0 으로 보였다(2026-08-13 수정).
    const s = summary[code] || (summary[code] = { jpSeen: 0, enSeen: 0, appended: 0 });
    s.jpSeen += seen.jp.length;
    s.enSeen += seen.en.length;
    s.appended += appended;
  }

  // ebaySold 스냅샷은 여기서 만들지 않는다 — 2026-08-21 삭제.
  // "이번 덤프에 보인 sold 전체의 사분위"는 날짜 창이 없어 사실상 90일 평균이었고, 덤프의
  // 언어 오염이 그대로 실렸다(감사 실측: 42쌍 중 29쌍 ±10% 초과, OP-05 일판 +251%).
  // 이제 build-box-sold-series.js 가 원장 기반 시리즈 최신점을 boxMarket.ebaySold 로 미러링한다.
  // ingest 후 반드시 build-box-sold-series.js 를 돌릴 것.

  for (const eds of Object.values(ledger.sets)) for (const arr of Object.values(eds)) if (Array.isArray(arr)) arr.sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id));
  ledger.note = "Append-only ledger of individual completed eBay sales of sealed One Piece booster boxes, one record per sold listing (deduplicated by eBay item id). Collected via a real browser because eBay blocks server access to completed-sale data. Prices are per box: multi-box lots are divided by the quantity stated in the title, and listings whose quantity or language cannot be determined are excluded rather than guessed. Weekly medians, sold counts, and sales volume are derived from this file. Past records are never modified or deleted.";
  ledger.updated = today;
  // updated 는 "언제 돌렸나"다 — 한 건도 못 받아도 찍힌다. 그것만 보면 수집이 전멸해도
  // 감사가 통과한다(2026-08-25 감사: 그 상태로 18일간 OK 로 보인다고 계산됐다).
  // "언제 실제로 들어왔나"를 따로 남긴다. audit-collection-health 가 이 값을 본다.
  {
    const appendedTotal = Object.values(summary).reduce((a, v) => a + (v.appended || 0), 0);
    if (appendedTotal > 0) ledger.lastAppended = { d: today, n: appendedTotal };
    // **수집을 시도한 날**을 전부 남긴다 — 2026-08-26.
    // lastAppended 는 마지막 한 번만 알려줘서 "언제부터 안 돌았나"를 못 본다.
    // 이 수집은 수동(월·수·금 브라우저)이라 조용히 빠지기 쉽다. 실제로 7/10~7/24 여섯 번을
    // 통째로 놓쳤는데 아무도 몰랐고, 실거래는 소급 수집이 안 돼 그 칸은 영구 공백이다.
    // 새 건이 0건이어도 남긴다 — 돌긴 돌았다는 사실 자체가 정보다.
    ledger.collectedDays = [...new Set([...(ledger.collectedDays || []), today])].sort();
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger) + "\n", "utf8");
  fs.writeFileSync(dataPath, JSON.stringify(data) + "\n", "utf8");

  const totals = Object.values(ledger.sets).reduce((a, s) => a + (s.jp || []).length + (s.en || []).length, 0);
  const cappedNote = cappedPages.length
    ? `${cappedPages.length}/${(dump.pages || []).length} slices returned 235+ real booster-box rows — those hit eBay's ~240 ceiling and their older sales were not visible. Narrow those price bands. (rawN is not a ceiling signal: eBay pads short result sets with similar items.)`
    : null;
  console.log(JSON.stringify({ pages: (dump.pages || []).length, summary, drops, backfilled, capped: cappedPages.length, cappedNote, ledgerTotal: totals }));
}

// ingest 가 실제로 쓰는 이름표 — packs.json 세트 + 수집 목록의 UPCOMING 세트. 가드 Q5 가 이 함수를 그대로 검사한다.
function ingestNameMap(packs) {
  return buildNameMap(packs, require("./box-sold-urls.js").UPCOMING);
}

module.exports = { judgeItem, editionOf, soldDateOf, buildNameMap, codesFromName, ingestNameMap };
if (require.main === module) {
  if (!process.argv[2]) { console.error("usage: node tools/box-sold-ingest.js <dump.json>"); process.exit(1); }
  main(process.argv[2]);
}
