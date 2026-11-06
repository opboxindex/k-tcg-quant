// 다수량(lot) 제목에서 개당 수량 파싱 — 낙찰가/판매가를 "개당 가격"으로 환산하기 위한 공용 모듈.
// (경매: settle-auctions.js·collect-auction-market.js / sold 원장: box-sold-ingest.js 가 공용으로 사용)
//
// 정확도 원칙: 확실한 패턴만 수량으로 인정한다.
//  - 반환 qty=1  : 다수량 신호가 전혀 없음 (단품으로 간주)
//  - 반환 qty=N  : "x3" / "3 boxes" / "set of 2" 처럼 개수가 명시됨 (2..24) → 가격÷N 이 개당가
//  - 반환 qty=null: 묶음인 건 확실한데 개수를 셀 수 없음(case/carton/lot/bulk, 개수 없는 복수형,
//                   서로 다른 개수 패턴 충돌, 25개 이상) → 호출부는 가격 통계에서 반드시 제외.
//                   모름을 1로 단정하면 케이스(12박스) 낙찰가가 1박스 가격으로 오염된다.
//
// ⚠️ 세트코드 함정(2026-07-22 레드팀 확정): "OP 13 Booster Box"의 13, "ST 21"의 21, "OP05-119" 카드번호,
//    "2023" 연도가 수량으로 잡히면 안 된다. → 수량 탐지 전에 세트코드/카드번호 토큰을 통째로 지운다.
//    하이픈/붙여쓰기(OP-13, OP13)뿐 아니라 공백형(OP 13)까지 막아야 한다. 테스트는 guard Q1.

// 수량 탐지 전에 지우는 토큰: 세트·카드코드(OP-13 / OP 13 / OP13 / OP05-119 / ST 21 / EB-02 / PRB-01)
const SET_CODE_STRIP = /\b(?:OP|EB|PRB|ST)[-\s]?\d{2}(?:[-\s]?\d{3})?\b/gi;
// 세트 이름 속 권 번호도 지운다 — 2026-09-30. PRB-02 의 이름이 "Premium Booster The Best Vol.2" 라
// 세트코드를 지우고 나면 "Vol 2 Booster Box"·"The Best 2 - Booster Box"·"Premium Booster 2 Booster Box" 의
// 2 가 BOX_COUNT 에 "2박스"로 잡혔다. 원장에 PRB-02 22건이 qty=2(반값)로 들어갔고, 일본판 낱박스는
// 반값이 9만원 하한에 걸려 버려졌다(예: "Japanese The Best Vol. 2 PRB-02 Booster Box US SELLER" 144,522원).
const VOLUME_STRIP = /\b(?:vol(?:ume)?\.?|the\s*best|premium\s*booster)\s*-?\s*0?[12]\b/gi;

const UNCOUNTABLE = /\bcase\b|\bcases\b|carton|\blots?\b|bundle|wholesale|\bbulk\b|playset/i;

// 개수 명시 패턴 (전 kind 공통): "x3" "×3" "3x" "set of 2"
const MULT_PATTERNS = [
  /(?:^|[\s(\[])[x×]\s?(\d{1,2})(?![\d.])/gi,
  /(?<![A-Za-z0-9.-])(\d{1,2})\s?[x×](?=[\s)\],]|$)/gi,
  /\bset\s+of\s+(\d{1,2})\b/gi,
];
// 박스 전용: "3 boxes" "2 box" "2-box"
const BOX_COUNT = /(?<![A-Za-z0-9.-])(\d{1,2})[\s-]*(?:booster\s*|display\s*)?box(?:es)?\b/gi;
// 팩 전용: "10 packs" "3 booster packs" "6-pack"
const PACK_COUNT = /(?<![A-Za-z0-9.-])(\d{1,2})[\s-]*(?:booster\s*)?pack(?:s)?\b/gi;
// 개수 없는 복수형 — 몇 개인지 모르는 묶음
const PLURAL_BOXES = /\bbox(?:es)\b/i;
const PLURAL_PACKS = /\bpacks\b/i;

// 박스당 팩 수는 원피스 규칙(일반 24, 프리미엄 20) 하나다. 팰월드 BP-01(12팩/박스)용 opts.perBox 는
// 그 유일한 호출부(palworld-sold-ingest.js)를 2026-11-05 팰월드 전용 수집 중단으로 지우며 함께 뺐다.
function parseLotQuantity(title, kind) {
  const t = String(title || "").replace(SET_CODE_STRIP, " ").replace(VOLUME_STRIP, " ");   // 세트/카드코드·연도·권 번호 오인 방지
  const counts = new Set();
  const pats = [...MULT_PATTERNS];
  if (kind === "box") pats.push(BOX_COUNT);
  if (kind === "pack") pats.push(PACK_COUNT);
  for (const re of pats) {
    for (const m of t.matchAll(re)) counts.add(Number(m[1]));
  }
  if (counts.size > 1) return null;               // 패턴끼리 충돌 — 모름
  if (counts.size === 1) {
    const q = [...counts][0];
    if (q < 1 || q > 24) return null;             // 0개/비현실 수량 — 모름
    if (q > 1) return q;                          // 개수 명시된 묶음 (case 여부보다 우선)
    // q === 1 이면 아래 일반 판정으로 계속
  }
  // 박스 매물이 개수 대신 **팩 수**로 적히는 경우: "OP16 Booster Box - 144 Packs".
  // 한 박스는 24팩이므로 144팩이면 6박스다. 이걸 1박스로 보면 개당가가 6배로 뛴다
  // (2026-08-13 실측: OP-16 영문판 $1,367 — 정상 시세의 6.9배로 남아 있었다).
  // 24의 배수일 때만 인정한다. 애매한 수(예: 100팩)는 모름으로 두고 통계에서 뺀다.
  if (kind === "box") {
    const packs = [...new Set([...t.matchAll(/(?<![A-Za-z0-9.-])(\d{1,3})[\s-]*(?:booster\s*)?packs\b/gi)].map((m) => Number(m[1])))];
    if (packs.length) {
      // ⚠️ 박스당 팩 수가 제품군마다 다르다. 일반 부스터는 24팩, **프리미엄 부스터(PRB)는 20팩**이다.
      //    24 로만 나누면 "PRB-01 Premium Booster Box 20 Packs" 같은 정상 1박스가 통째로 버려진다
      //    (2026-08-13: 실제로 PRB 영문판 7건이 그렇게 빠질 뻔했다).
      // 원 제목에서 본다 — VOLUME_STRIP 이 "Premium Booster 2" 를 지우면 t 에는 이 말이 안 남는다.
      const perBox = /premium\s*booster/i.test(String(title || "")) ? 20 : 24;
      // 여럿 적혀 충돌하거나 박스 단위로 안 떨어지면 모름.
      // 안 떨어지는 수(17·16·18팩)는 박스가 아니라 낱팩 묶음이다 — 박스 시세에 넣으면 안 된다.
      if (packs.length > 1 || packs[0] % perBox !== 0) return null;
      const boxes = packs[0] / perBox;
      return boxes >= 1 && boxes <= 24 ? boxes : null;
    }
  }
  if (UNCOUNTABLE.test(t)) return null;           // 묶음인데 개수 불명
  if (kind === "box" && PLURAL_BOXES.test(t) && counts.size === 0) return null; // "boxes" 복수형·개수 없음
  if (kind === "pack" && PLURAL_PACKS.test(t) && counts.size === 0) return null; // "packs" 복수형·개수 없음
  return 1;
}

// 개당가: 수량 모름(null)이면 null — 통계에서 제외하라는 뜻.
function unitPrice(total, qty) {
  if (!Number.isFinite(total) || !Number.isFinite(qty) || qty < 1) return null;
  return Number((total / qty).toFixed(2));
}

module.exports = { parseLotQuantity, unitPrice };
