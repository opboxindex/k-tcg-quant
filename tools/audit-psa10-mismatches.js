// PSA10 활성 구매링크 전수 오매칭 감사 (읽기 전용, 데이터 수정 안 함).
// 각 카드의 psa10Active.bestListing 을 getItem 으로 다시 조회해 카드 정보와 대조하고 의심 링크를 플래그.
//
// 플래그 규칙(정확도 최우선 — 감정 PSA10 은 생카드보다 비싸야 정상):
//  RAW  : 활성 PSA10 < 생NM(nmJpy/priceUsd) × 0.9  → PSA10 이 생카드보다 쌈 = 다른(싼) 카드에 물림
//  SET  : 매물 판본(Set 속성·제목의 세트 코드·세트명·연도)이 카드 세트와 다름(PRB/EB 재판 등) — editionVerdict, 수집기·사실 빌더와 같은 함수
//  VAR  : 카드명 변형(red/gold/silver/manga/super/sp/parallel/tr/signature)이 제목과 불일치
//  SOLD : 활성 < sold 중앙값 × 0.5 (참고)
//
// Run: node tools/audit-psa10-mismatches.js
const fs = require("fs");
const path = require("path");
const { loadEditionIndex, editionVerdict } = require("./ebay-psa10-listing-filter");

const ROOT = path.join(__dirname, "..");
const dataPath = path.join(ROOT, "data", "onepiece-packs.json");
const outPath = path.join(ROOT, "data", "psa10-mismatch-audit.json");

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

async function getItem(tok, id) {
  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${tok}`, "X-EBAY-C-MARKETPLACE-ID": marketplaceId } });
  if (!r.ok) return null;
  return r.json();
}

// 변형 하위종류 — 카드명에 있으면 제목에도 있어야, 없으면 제목에도 없어야 한다.
const SUBVARIANTS = [
  ["red", /\bred\b/i],
  ["gold", /\bgold\b|\bgolden\b|金/i],
  ["silver", /\bsilver\b|銀/i],
];

(async () => {
  if (!env.EBAY_CLIENT_ID) throw new Error("Missing eBay credentials");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const editionIndex = loadEditionIndex(ROOT, data);
  const fx = data.fx || {};
  const toUsd = (v, cur) => (cur === "USD" ? v : cur === "KRW" ? v / (fx.usdKrw || 1388) : cur === "JPY" ? (v * (fx.jpyKrw || 9.1)) / (fx.usdKrw || 1388) : v);
  const jpyUsd = (jpy) => (Number.isFinite(jpy) && fx.jpyKrw && fx.usdKrw ? (jpy * fx.jpyKrw) / fx.usdKrw : null);

  const codes = [...(data.jp.list || []), ...(data.extra.list || [])];
  const tasks = [];
  for (const code of codes) {
    for (const c of (data.sets[code]?.cards || [])) {
      const bl = c.psa10Active?.bestListing;
      if (!bl?.url) continue;
      const idm = bl.url.match(/itm\/(\d+)/);
      if (!idm) continue;
      tasks.push({ code, card: c, bl, itemId: `v1|${idm[1]}|0` });
    }
  }

  const tok = await token();
  const flagged = [];
  let checked = 0;
  for (const t of tasks) {
    const j = await getItem(tok, t.itemId);
    checked++;
    const title = (j && j.title) || t.bl.title || "";
    const setA = j ? ((j.localizedAspects || []).find((a) => /^set$/i.test(a.name)) || {}).value : null;
    const bestUsd = toUsd(t.bl.total, t.card.psa10Active.currency || "USD");
    const rawUsd = t.card.nmJpy != null ? jpyUsd(t.card.nmJpy) : (typeof t.card.priceUsd === "number" ? t.card.priceUsd : null);
    const soldMid = t.card.psa10Ebay?.soldBased && t.card.psa10Ebay.middle != null ? toUsd(t.card.psa10Ebay.middle, t.card.psa10Ebay.currency || "KRW") : null;
    const reasons = [];

    // RAW 는 nmJpy(유유테이 검증값)일 때만 신뢰. priceUsd(TCGplayer 폴백)는 밈/트롤가 섞여 분모로 못 씀.
    if (t.card.nmJpy != null && rawUsd != null && bestUsd != null && bestUsd < rawUsd * 0.9) reasons.push(`RAW: PSA10 $${bestUsd.toFixed(0)} < 생NM $${rawUsd.toFixed(0)}`);
    // SET 은 카드가 실린 세트(t.code)와 비교한다. 2026-11-05 까지는 카드 "번호"의 세트와 비교해 OP-05 나미 SP 의 'OP05' 매물(맞는 매물)도
    // 'OP-05 ≠ 번호세트 OP-01' 로 찍었고, 제목의 카드 번호 앞머리(OP01-016 의 OP01)를 매물 세트로 읽었다. 세트명('Paramount War')은 못 읽었다.
    const ev = editionVerdict({ title, setAspect: setA }, t.code, t.card, editionIndex);
    if (ev.verdict === "conflict") reasons.push(`SET: ${ev.reason} (${setA || "제목"})`);
    for (const [name, re] of SUBVARIANTS) {
      const inCard = re.test(t.card.name || "");
      const inTitle = re.test(title);
      if (inCard && !inTitle) reasons.push(`VAR: 카드는 ${name} 인데 매물 제목엔 없음`);
      if (!inCard && inTitle) reasons.push(`VAR: 매물은 ${name} 인데 카드명엔 없음`);
    }
    if (soldMid != null && bestUsd != null && bestUsd < soldMid * 0.5) reasons.push(`SOLD: 활성 $${bestUsd.toFixed(0)} < sold중앙 $${soldMid.toFixed(0)}×0.5`);

    if (reasons.length) {
      flagged.push({ code: t.code, number: t.card.number, cardName: t.card.name, bestUsd: bestUsd != null ? Math.round(bestUsd) : null, rawUsd: rawUsd != null ? Math.round(rawUsd) : null, listingTitle: title.slice(0, 80), setAspect: setA, reasons });
    }
  }

  flagged.sort((a, b) => b.reasons.length - a.reasons.length);
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), checked, flaggedCount: flagged.length, flagged }, null, 1) + "\n");
  console.log(JSON.stringify({ checked, flagged: flagged.length }));
  for (const f of flagged) console.log(`${f.code} ${f.number} "${f.cardName}" → ${f.reasons.join(" | ")}`);
})();
