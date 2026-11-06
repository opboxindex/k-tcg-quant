#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(projectRoot, "data", "onepiece-packs.json");

const codeToPath = (code) => code.toLowerCase().replace("-", "");
const yuyuteiUrl = (code) => `https://yuyu-tei.jp/sell/opc/s/${codeToPath(code)}`;

function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// 상품 한 칸 = <div class="card-product …"> 부터 다음 칸 앞까지. 번호·이름·값·재고는 **그 칸 안에서만** 읽는다 — 2026-11-05.
// 왜: 종전엔 페이지 전체에 정규식 하나를 굴려 "첫 <img alt> → 첫 <span> 번호 → <h4> → 값 → 재고"를 이어 붙였다.
//     페이지 첫 <img alt> 는 메뉴 아이콘(alt="Icon")이라 첫 결과가 번호 "MENU"·이름 "収録弾"(메뉴 머리)에
//     **그 쪽 첫 상품의 값·재고**를 붙인 덩어리가 됐고, 첫 상품은 통째로 사라졌다(23쪽 전부, 2026-11-04 감사).
//     그래서 OP06-118 조로 AA·OP10-118 루피 패러렐·EB01-061 봉쿠레 AA·OP06-119 상디 망가(PRB-02) 4장이
//     nmUpdated 를 한 번도 못 받아 화면에 NM '—'. seed-set-top-cards.js 도 같은 파서라 새 세트 첫 상품이 후보에서 빠졌다.
//     칸 경계로 자르면 칸 밖(메뉴·사이드바·추천 캐러셀)의 글자가 상품에 섞일 수 없다.
const PRODUCT_START = /<div\b[^>]*\bclass="card-product\b/;
const PRODUCT_FIELDS =
  /<span[^>]*>\s*([A-Z0-9-]+)\s*<\/span>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<strong[^>]*>\s*([\d,]+)\s*円\s*<\/strong>[\s\S]*?在庫\s*:\s*([\s\S]*?)<\/label>/;

function parseYuyuteiProducts(html) {
  const products = [];
  for (const block of String(html).split(PRODUCT_START).slice(1)) {
    const match = block.match(PRODUCT_FIELDS);
    if (!match) continue;
    // 카드 이미지(class="card …")의 alt — "OP10-118 P-SEC モンキー・D・ルフィ(パラレル)". 별(즐겨찾기) 아이콘 alt 가 아니다.
    const img = (block.slice(0, match.index).match(/<img\b[^>]*\bclass="card\b[^>]*>/) || [""])[0];
    products.push({
      alt: stripTags((img.match(/\balt="([^"]*)"/) || [])[1] || ""),
      number: stripTags(match[1]),
      name: stripTags(match[2]),
      priceJpy: Number(match[3].replace(/,/g, "")),
      stockText: stripTags(match[4]),
    });
  }

  return products.filter((product) => product.number && Number.isFinite(product.priceJpy));
}

// 상품 칸 수 — 읽은 상품 수와 다르면 마크업이 바뀐 것이다(칸을 못 읽으면 그 카드 NM 이 조용히 낡는다).
const countProductBlocks = (html) => String(html).split(PRODUCT_START).length - 1;

// 변형 등급 — 유유테이 일본어 라벨 기준(가장 구체적부터). 실측 라벨(2026-07-23):
//  (レッドスーパーパラレル)=red · (スーパーパラレル)=super · (金パラレル)=gold · (銀パラレル)=silver · (手配書)=wanted · (パラレル)=parallel · 괄호없음=base
function yuyuTier(product) {
  const s = `${product.name} ${product.alt}`;
  if (/レッド.*スーパーパラレル/.test(s)) return "red";
  if (/スーパーパラレル/.test(s)) return "super";
  if (/金パラレル|ゴールド/.test(s)) return "gold";
  if (/銀パラレル|シルバー/.test(s)) return "silver";
  if (/手配書/.test(s)) return "wanted";
  if (/パラレル/.test(s)) return "parallel";
  return "base";
}
// 우리 카드 이름 → 같은 등급 체계. manga/comic 는 슈퍼파라렐을 뜻함(유유테이엔 별도 'manga' 등급 없음).
function cardTier(card) {
  const s = `${card.name || ""} ${card.rarity || ""}`.toLowerCase();
  if (/red\s*(manga|super|parallel)/.test(s)) return "red";
  if (/super\s*(alt|alternate|parallel)|\bmanga\b|comic/.test(s)) return "super";
  if (/\bgold\b/.test(s)) return "gold";
  if (/\bsilver\b/.test(s)) return "silver";
  if (/wanted/.test(s)) return "wanted";
  // SP(箔押し) — 종전엔 이 갈래가 없어 "Uta SP" 같은 카드가 전부 base 로 떨어졌다(2026-08-25).
  // 유유테이는 SP 를 "(パラレル/箔押し)" 로 적으므로 parallel 과 같은 자리에서 본다.
  if (/\bsp\b/.test(s)) return "parallel";
  if (/parallel/.test(s)) return "parallel";
  if (/alternate|\balt\b/.test(s)) return "alt";   // base/parallel 애매 — 아래 폴백에서만 처리
  return "base";
}

const PROX = Math.log(3);   // 기존값 대비 3배 이내 후보만 인정(그 이상은 값이 이동했거나 기존이 틀린 것 → 스킵+수동).
const NAMED_TIERS = new Set(["red", "super", "gold", "silver", "wanted"]);   // 이름만으로 변형이 확정되는 등급(parallel·alt·base 는 애매해서 제외).

// 한 카드번호에 속한 우리 카드들 ↔ 유유테이 후보들을 매칭.
// 핵심: top10 카드는 대부분 파라렐/chase라 base가 아니다. 변형 가격은 자릿수로 갈리므로,
//       "기존 nmJpy(대략 맞는 값)와 가장 근접한 후보"에 배정하면 변형이 정확히 갈린다(중복번호도 자연분리).
//       기존값 없는 카드만 이름→등급 매칭. 확신 없으면 배정 안 함(기존값 보존 + 수동플래그).
// 반환: Map(ourCard -> product).
function assignByNumber(ourCards, cands) {
  const res = new Map();
  const used = new Set();
  // 0) 등급 이름이 분명한 카드(레드·슈퍼·금·은·수배서)는 그 등급 후보가 양쪽 다 하나뿐이면 근접도보다 먼저 고정한다. 2026-10-21 추가.
  //    왜: 근접도는 옛값이 맞다는 전제다. 옛값이 다른 변형 값이면 그리디가 변형을 맞바꾼다.
  //    실측(2026-10-21) OP-12 OP09-093 티치 SP — 유유테이 金 ¥148,000·銀 ¥99,800 인데
  //    은 카드 옛값 ¥148,000 이 金 후보와 딱 맞아 먼저 가져갔고, 금 카드는 남은 銀 ¥99,800 을 받았다(3배 안이라 통과).
  for (const c of ourCards) {
    const t = cardTier(c);
    if (!NAMED_TIERS.has(t) || ourCards.filter((o) => cardTier(o) === t).length !== 1) continue;
    const ms = cands.filter((p) => yuyuTier(p) === t);
    if (ms.length === 1 && !used.has(ms[0])) { res.set(c, ms[0]); used.add(ms[0]); }
  }
  // 1) 기존값 있는 카드: (카드,후보) 근접쌍을 로그비 오름차순으로 그리디 배정(1:1, 3배 초과는 배정 안 함).
  const pairs = [];
  for (const c of ourCards) {
    if (!(c.nmJpy > 0)) continue;
    for (const p of cands) pairs.push({ card: c, product: p, r: Math.abs(Math.log(p.priceJpy / c.nmJpy)) });
  }
  pairs.sort((a, b) => a.r - b.r);
  for (const { card, product, r } of pairs) {
    if (res.has(card) || used.has(product) || r > PROX) continue;
    res.set(card, product); used.add(product);
  }
  // 2) 기존값 없는 카드: 이름→등급 정확일치가 유일할 때만.
  for (const c of ourCards) {
    if (res.has(c) || c.nmJpy > 0) continue;
    const t = cardTier(c);
    const ms = cands.filter((p) => !used.has(p) && yuyuTier(p) === t);
    if (ms.length === 1) { res.set(c, ms[0]); used.add(ms[0]); }
  }
  // 3) 1)에서 3배 벽에 막혀 아무것도 못 받은 카드 — 등급이 유일하게 맞으면 그걸 쓴다. 2026-08-25 추가.
  //
  // 왜: PROX 는 **여러 후보 중 고르는 기준**이지 "값이 많이 움직였으면 버려라"가 아니었다.
  //     그런데 실제로는 후보가 하나뿐일 때도 3배를 넘으면 통째로 버려서 **틀린 옛값이 영원히 남았다**.
  //     실측(2026-08-25) — 화면에 나가던 값 vs 유유테이 실제:
  //       EB-02 Uta SP        ¥5,980  → ¥59,800   (10배)
  //       OP-11 Luffy 119 SP  ¥79,800 → ¥798,000  (10배)
  //       OP-01 Luffy 024 Parallel ¥2,480 → ¥9,980 (4배)
  //     전부 "관측일 없음"으로만 보였을 뿐, 값 자체는 그대로 노출되고 있었다.
  //
  // 안전장치: 등급이 맞는 미사용 후보가 **정확히 하나**일 때만. 둘 이상이면 손대지 않는다
  //          (그게 변형 오배정 경로다). 큰 이동은 호출부에서 로그로 남겨 사람이 본다.
  for (const c of ourCards) {
    if (res.has(c)) continue;
    const t = cardTier(c);
    const ms = cands.filter((p) => !used.has(p) && yuyuTier(p) === t);
    if (ms.length === 1) { res.set(c, ms[0]); used.add(ms[0]); }
  }
  return res;
}

async function fetchProducts(code) {
  const url = yuyuteiUrl(code);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 K-TCG-Quant research bot",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`${code} yuyu-tei HTTP ${response.status}`);
  }

  const html = await response.text();
  const products = parseYuyuteiProducts(html);
  const blocks = countProductBlocks(html);
  if (products.length !== blocks) console.warn(`  [파서 확인] ${code}: 상품 칸 ${blocks}개 중 ${products.length}개만 읽음 — 유유테이 마크업이 바뀌었는지 볼 것`);
  return { url, products };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const requestedCodes = process.argv.slice(2);
  const defaultCodes = [...data.jp.list, ...data.extra.list].filter((code) => data.sets[code]?.cards?.length);
  const codes = requestedCodes.length ? requestedCodes : defaultCodes;
  const summary = [];

  for (const code of codes) {
    const set = data.sets[code];
    if (!set?.cards?.length) continue;

    const { url, products } = await fetchProducts(code);
    let updated = 0;
    let missed = 0;

    // 카드번호별로 묶어 등급매칭(같은 번호에 base/파라렐/슈퍼 등 변형이 여럿 → 정확히 배정).
    const byNumber = new Map();
    for (const card of set.cards) {
      const num = (card.number || "").replace(/^#/, "").toUpperCase();
      if (!num) continue;
      (byNumber.get(num) || byNumber.set(num, []).get(num)).push(card);
    }
    const ambiguous = [], bigMoves = [];
    for (const [num, ourCards] of byNumber) {
      const cands = products.filter((p) => p.number.toUpperCase() === num);
      if (!cands.length) { missed += ourCards.length; continue; }
      const picks = assignByNumber(ourCards, cands);
      for (const card of ourCards) {
        const before = Number(card.nmJpy) || 0;
        const selected = picks.get(card);
        if (!selected) { missed += 1; if (cands.length > 1) ambiguous.push(`${num} "${(card.name || "").slice(0, 24)}" (기존 ¥${card.nmJpy ?? "-"})`); continue; }
        card.nmJpy = selected.priceJpy;
        card.nmVenue = "遊々亭";
        card.nmSourceUrl = url;
        card.nmStock = selected.stockText;
        // **이 카드를 실제로 다시 본 날**. 전체 파일의 updated 로는 알 수 없다 — 2026-08-25 추가.
        // 매칭에 실패한 카드는 여기를 갱신하지 않으므로, 옛 가격이 남아 있으면 날짜로 드러난다.
        // 실측(2026-08-25): 175장 중 80장이 오래된 값이었고 최대 -53% 차이가 났는데
        // 화면에는 아무 표시도 없었다. 41장은 매칭 실패라 계속 옛값이 남는다.
        card.nmUpdated = today;
        updated += 1;
        // 3배 넘게 움직인 건 사람이 한 번 본다 — 진짜 급변일 수도, 변형이 바뀐 것일 수도 있다.
        if (before > 0 && (selected.priceJpy / before > 3 || before / selected.priceJpy > 3)) {
          bigMoves.push(`${num} "${(card.name || "").slice(0, 28)}" ¥${before.toLocaleString()} → ¥${selected.priceJpy.toLocaleString()} · ${selected.name.slice(0, 34)}`);
        }
      }
    }
    if (ambiguous.length) console.log(`  [수동검토 필요] ${code}: ${ambiguous.join(" · ")}`);
    if (bigMoves.length) console.log(`  [큰 변동 — 확인] ${code}: ${bigMoves.join(" · ")}`);

    set.priced = true;
    set.nmSource = "遊々亭 single-card listing";
    summary.push({ code, updated, missed, products: products.length });
    console.log(`${code}: updated=${updated} missed=${missed} products=${products.length}`);
  }

  data.updated = today;
  fs.writeFileSync(dataPath, `${JSON.stringify(data)}\n`, "utf8");

  const missedTotal = summary.reduce((sum, row) => sum + row.missed, 0);
  if (missedTotal) {
    console.error(`Missed NM matches: ${missedTotal}`);
  }
}

// seed-set-top-cards.js 가 같은 파서·변형 판별을 쓴다(후보 목록을 따로 해석하면 두 도구의 변형 판단이 갈린다).
// parseYuyuteiProducts·countProductBlocks 는 test-yuyutei-parser.js(가드 NMP1)가 고정 HTML 로 시험한다.
module.exports = { fetchProducts, parseYuyuteiProducts, countProductBlocks, yuyuTier, cardTier };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
