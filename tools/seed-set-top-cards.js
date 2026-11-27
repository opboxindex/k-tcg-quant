#!/usr/bin/env node
// 새 세트의 주요 카드(top10) 자동 채우기 — 2026-09-30.
//
// 왜: 카드 목록은 사람이 손으로 넣어야만 생겼다(OP-16 은 7/14 손입력). 손이 안 가면 세트 페이지에
//     top10 표가 통째로 빠진다 — 8월 출시 OP-17 의 cards 가 6주째 빈 배열이었다.
//
// 무엇을 하나:
//   후보 = 유유테이 판매 목록의 변형별 상품을 가격순으로. 파서·변형 판별은 update-yuyutei-nm-prices.js 것을 그대로 쓴다.
//   카드마다 반다이 공식 카드리스트(영문·일본)를 카드번호로 검색해
//     - 영문 이름과 기본판 레어리티가 확인되고
//     - 일본 목록의 입수정보에 이 상품(【CODE】)이 적혀 있을 때만 넣는다. 하나라도 못 찾으면 그 카드는 넣지 않는다.
//   이미지는 공식 일본판만(official-jp-images.js 와 같은 변환·경로·필드). 이 상품에 그 번호의 변형 이미지가
//     하나뿐이면 그것을, 여럿이면 data/jp-image-verdicts.json 의 seedVariants(눈 대조 판정)에 있을 때만 붙인다.
//     판정이 없으면 이미지 없이 넣고 후보를 출력한다 — 번호만 보고 고르지 않는다(2026-07-27 오배정 사고).
//   가격 필드(nmJpy 등)는 고른 상품의 오늘 값을 주간 유유테이 갱신과 같은 형식으로 적는다.
//     주간 갱신은 이름이 "Alternate Art" 인 카드를 기존값 근접으로만 잇기 때문에 첫 값이 있어야 이어진다.
//
// 안전:
//   cards 가 이미 n장 이상이면 아무것도 안 한다(멱등). 모자라면 부족분만 뒤에 붙이고 기존 카드는 건드리지 않는다.
//   네트워크·응답 이상은 전부 중단 — 이미지도 데이터도 쓰지 않는다.
//
// 사용: node tools/seed-set-top-cards.js <CODE> [--n 10] [--dry]
const fs = require("node:fs");
const path = require("node:path");
const { fetchProducts, yuyuTier, cardTier } = require("./update-yuyutei-nm-prices.js");
const { IMG_DIR, officialWebp, imageFields } = require("./official-jp-images.js");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "onepiece-packs.json");
const VERDICTS = path.join(ROOT, "data", "jp-image-verdicts.json");
const HOSTS = { en: "https://en.onepiece-cardgame.com", jp: "https://www.onepiece-cardgame.com" };
const NUM_RE = /^(?:[A-Z]+\d{2}-\d{3}|P-\d{3})$/;   // DON!!("-")·목록 머리("MENU") 행 제외

// 유유테이 변형 라벨 → 우리 이름 꼬리표. 여기 없는 라벨의 상품은 넣지 않는다.
//   特別パラレル 은 일부러 뺐다 — 우리 이름으로 옮기면 일반 パラレル 과 같은 등급(alt)으로 읽혀
//   그레이더·이베이 매칭이 둘을 가르지 못한다(2026-09-30, OP17-062 에 둘 다 있다).
const LABEL = {
  "": "",
  "パラレル": "Alternate Art",                      // 다른 세트 번호의 SP 카드면 "SP"
  "スーパーパラレル": "Super Alternate Art",
  "海賊団スーパーパラレル": "Pirates Super Alternate Art",   // 海賊団 = 영문 표기 "… Pirates"(ロックス海賊団 = Rocks Pirates)
  "レッドスーパーパラレル": "Red Super Alternate Art",
  "金パラレル": "Gold",
  "銀パラレル": "Silver",
  "手配書": "Wanted Poster",
  // 2026-11-27 OP-18: 神の騎士団 = 반다이 영문 표기 "Holy Knights of God"(OP-18 상품 페이지). 海賊団スーパーパラレル 과 같은 꼴.
  "神の騎士団スーパーパラレル": "Holy Knights Super Alternate Art",
  // 2026-11-27 OP-18: 箔押し(박 찍힌 패러렐) — EB-05 나미 EB05-055 를 손으로 넣을 때 쓴 이름과 같다.
  //   가격 매칭(cardTier)은 alt 로 읽어 같은 번호의 일반 패러렐과 기존값 근접(3배)으로 갈린다.
  "箔押し": "Alternate Art (Foil)",
};
function tagOf(label, sp) {
  if (label === "パラレル") return sp ? "SP" : LABEL[label];
  if (label === "金パラレル" || label === "銀パラレル") return sp ? `SP ${LABEL[label]}` : `${LABEL[label]} Parallel`;
  return LABEL[label];
}

// 상품명 괄호 라벨들 — 전각 괄호도 섞여 나온다(실측: "(スーパーパラレル）").
const labelsOf = (name) => [...String(name).matchAll(/[(（]([^()（）]+)[)）]/g)].map((m) => m[1].trim());

// 공식 영문 표기 "Monkey.D.Luffy"·"Edward.Newgate" → 기존 카드 이름 표기 "Monkey D. Luffy"·"Edward Newgate".
const enName = (s) => s
  .replace(/\.D\./g, () => " D. ")
  .replace(/([A-Za-z])\.(?=[A-Za-z])/g, (m, a) => `${a} `)
  .replace(/\s+/g, " ")
  .trim();

const decode = (s) => String(s)
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, () => "&")
  .replace(/&quot;/g, () => '"')
  .replace(/&#0?39;/g, () => "'")
  .replace(/\s+/g, " ")
  .trim();

function parseCardlist(html) {
  // 점검·오류 페이지를 "검색 결과 0건"으로 읽으면 카드가 조용히 빠진다 — 카드리스트 페이지가 아니면 중단.
  if (!html.includes('class="searchCol"')) throw new Error("공식 카드리스트 응답이 카드리스트 페이지가 아님");
  const out = [];
  for (const m of html.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)) {
    const info = m[2].match(/<div class="infoCol">\s*<span>([^<]*)<\/span>\s*\|\s*<span>([^<]*)<\/span>/);
    const name = m[2].match(/<div class="cardName">([\s\S]*?)<\/div>/);
    const got = m[2].match(/<div class="getInfo">\s*<h3>[^<]*<\/h3>([\s\S]*?)(?:<div class="getInfoBtnCol">|<\/div>)/);
    if (!info || !name) continue;
    out.push({ id: m[1], num: decode(info[1]), rarity: decode(info[2]), name: decode(name[1]), got: got ? decode(got[1]) : "" });
  }
  return out;
}

const cache = new Map();
async function official(lang, num) {
  const key = `${lang}|${num}`;
  if (!cache.has(key)) {
    const r = await fetch(`${HOSTS[lang]}/cardlist/?search=true&freewords=${encodeURIComponent(num)}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`공식 카드리스트(${lang}) ${num} HTTP ${r.status}`);
    cache.set(key, parseCardlist(await r.text()).filter((e) => e.num === num));
  }
  return cache.get(key);
}

async function main() {
  const argv = process.argv.slice(2);
  const nAt = argv.indexOf("--n");
  const n = nAt >= 0 ? Number(argv[nAt + 1]) : 10;
  const dry = argv.includes("--dry");
  const code = (argv.find((a, i) => !a.startsWith("--") && (nAt < 0 || i !== nAt + 1)) || "").toUpperCase();
  if (!code || !(Number.isInteger(n) && n > 0)) throw new Error("사용: node tools/seed-set-top-cards.js <CODE> [--n 10] [--dry]");

  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const set = data.sets[code];
  if (!set) throw new Error(`${code}: data.sets 에 없는 세트`);
  const existing = set.cards || [];
  if (existing.length >= n) {
    console.log(JSON.stringify({ code, cards: existing.length, added: 0, note: `이미 ${n}장 이상 — 변경 없음` }));
    return;
  }
  const need = n - existing.length;

  const { url, products } = await fetchProducts(code);
  if (products.length < 20) throw new Error(`${code}: 유유테이 상품 ${products.length}개뿐 — 수집 실패로 보고 중단`);

  let verdicts = [];
  try { verdicts = (JSON.parse(fs.readFileSync(VERDICTS, "utf8")).seedVariants?.list || []).filter((v) => v.set === code); } catch {}

  const today = new Date().toISOString().slice(0, 10);
  const names = new Set(existing.map((c) => c.name));
  const taken = new Set(existing.map((c) => `${String(c.number || "").toUpperCase()}|${cardTier(c)}`));
  // 가격 내림차순. 같은 가격이면 카드번호·상품명 순(재실행해도 같은 결과).
  const cands = products
    .filter((p) => NUM_RE.test(p.number))
    .sort((a, b) => b.priceJpy - a.priceJpy || a.number.localeCompare(b.number) || a.name.localeCompare(b.name));

  const picked = [], skipped = [];
  for (const p of cands) {
    if (picked.length >= need) break;
    const skip = (why) => skipped.push(`${p.number} ${p.name} ¥${p.priceJpy.toLocaleString()} — ${why}`);
    const labels = labelsOf(p.name);
    const yr = String(p.alt || "").trim().split(/\s+/)[1] || "";   // 유유테이 칸 레어리티(P-SR·SP·SEC …)
    const label = labels.length ? labels[labels.length - 1] : "";
    if (!(label in LABEL)) { skip(`변형 라벨 "${label}" 은 이름 체계 미확정`); continue; }
    // 등급은 괄호 라벨만으로 본다 — 캐릭터명 "シルバーズ・レイリー" 가 silver 로 읽히지 않게.
    const tier = yuyuTier({ name: labels.map((l) => `(${l})`).join(""), alt: "" });

    const en = await official("en", p.number);
    const jp = await official("jp", p.number);
    const enBase = en.find((e) => e.id === p.number) || en[0];
    const rarity = (en.find((e) => e.id === p.number) || jp.find((e) => e.id === p.number) || {}).rarity;
    if (!enBase) { skip("영문 공식 카드리스트에 없음"); continue; }
    if (!rarity) { skip("공식 카드리스트에 기본판(레어리티) 없음"); continue; }
    const inSet = jp.filter((e) => e.got.includes(`【${code}】`));
    if (!inSet.length) { skip(`일본 공식 카드리스트 입수정보에 【${code}】 없음`); continue; }

    // 이 상품에 실린 공식 이미지 중 이 변형의 것을 하나로 확정한다.
    let entry = null, noImage = "";
    if (!label) {
      entry = inSet.find((e) => e.id === p.number) || null;
      if (!entry) noImage = "이 상품 목록에 기본판 이미지 없음";
    } else {
      const vars = inSet.filter((e) => e.id !== p.number);
      if (vars.length === 1) entry = vars[0];
      else {
        const v = verdicts.find((x) => x.num === p.number && x.label === label && (!x.yr || x.yr === yr));
        entry = (v && vars.find((e) => e.id === p.number + v.suffix)) || null;
        if (!entry) noImage = `변형 이미지 ${vars.length}개(${vars.map((e) => e.id).join(", ")}) — 눈 대조 판정 없음`;
      }
    }
    // SP 여부: 공식 목록의 변형 레어리티 "SPカード", 또는 유유테이 상품 칸 레어리티 "SP"(alt 둘째 칸).
    //   2026-11-27: 같은 번호에 P-SR 패러렐과 SP 패러렐이 함께 있는 카드(OP18-084, 앞서 EB05-016·006)는 라벨이 둘 다
    //   "パラレル" 이라 칸 레어리티를 안 보면 SP 상품 값이 일반 패러렐 이름에 붙었다.
    const sp = (!!entry && /^SP/i.test(entry.rarity)) || yr === "SP";
    if (label === "パラレル" && !entry && !p.number.startsWith(code.replace("-", ""))) { skip("다른 세트 번호인데 SP 여부를 공식 목록으로 확인 못 함"); continue; }

    const tag = tagOf(label, sp);
    const base = enName(enBase.name);
    let name = [base, tag].filter(Boolean).join(" ");
    if (names.has(name)) name = [base, p.number.slice(-3), tag].filter(Boolean).join(" ");
    if (names.has(name)) { skip(`같은 이름 "${name}" 이 이미 있음`); continue; }
    // 카드 페이지 생성기는 가장 짧은 제목 "<이름> <번호> Card Price"(Alternate Art→Alt Art)도 60자를 넘으면 던진다 —
    // 그러면 야간 재생성이 통째로 멈춘다(2026-09-30 첫 시도에서 실제로 걸림).
    const shortest = `${name.replace(/Alternate Art/g, () => "Alt Art")} ${p.number} Card Price`;
    if (shortest.length > 60) { skip(`이름이 길어 카드 페이지 제목(60자)에 안 들어감: ${shortest.length}자`); continue; }
    // 주간 가격 갱신(cardTier)이 이 이름을 같은 변형으로 읽는지 — 어긋나면 다음 주에 다른 상품 값이 붙는다.
    const want = tier === "parallel" && !sp ? "alt" : tier;
    const read = cardTier({ name, rarity });
    if (read !== want) { skip(`이름 "${name}" 이 가격 매칭에서 ${read} 로 읽힘(기대 ${want})`); continue; }
    const key = `${p.number}|${read}`;
    if (taken.has(key)) { skip("같은 번호·같은 변형 카드가 이미 있음"); continue; }

    taken.add(key);
    names.add(name);
    picked.push({
      file: entry ? entry.id : null,
      noImage,
      card: {
        rank: existing.length + picked.length + 1,
        name,
        number: p.number,
        rarity,
        ...(entry ? imageFields(p.number, entry.id.slice(p.number.length)) : {}),
        nmJpy: p.priceJpy,
        nmVenue: "遊々亭",
        nmSourceUrl: url,
        nmStock: p.stockText,
        nmUpdated: today,
      },
    });
  }

  const report = {
    code, mode: dry ? "dry-run" : "write", before: existing.length, added: picked.length,
    cards: picked.map(({ card, file, noImage }) => `${card.rank}. ${card.number} ${card.name} (${card.rarity}) ¥${card.nmJpy.toLocaleString()} · ${file ? `img ${file}` : `이미지 없음: ${noImage}`}`),
    skipped,
  };
  if (!picked.length || dry) { console.log(JSON.stringify(report, null, 1)); return; }

  // 이미지를 전부 받아 둔 뒤에만 쓴다 — 한 장이라도 실패하면 officialWebp 가 던져서 아무것도 안 쓴다.
  const images = new Map();
  for (const { file } of picked) {
    if (file && !images.has(file) && !fs.existsSync(path.join(IMG_DIR, `${file}.webp`))) images.set(file, await officialWebp(file));
  }
  fs.mkdirSync(IMG_DIR, { recursive: true });
  for (const [file, buf] of images) fs.writeFileSync(path.join(IMG_DIR, `${file}.webp`), buf);

  set.cards = [...existing, ...picked.map((x) => x.card)];
  set.priced = true;
  set.nmSource = "遊々亭 single-card listing";
  fs.writeFileSync(DATA, `${JSON.stringify(data)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, newImages: images.size }, null, 1));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
