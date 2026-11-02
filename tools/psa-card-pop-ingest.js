#!/usr/bin/env node
// 카드별 PSA 인구 적재 — 2026-08-03.
//
// 입력: GemRate 공개 페이지(표준 팝리포트 item-details — 2026-11-02 전엔 item-details-advanced)의 RowData 덤프.
//   { grader:"psa", collectedAt, sets:{ "OP-13|jp":[{num,name,par,total,g10,g9,updated}] } }
//   set URL 은 추측하지 않는다 — 이미 검증된 gemrate-psa-history / gemrate-psa-en-totals 의 url 에서
//   경로만 item-details 로 바꿔 쓴다(세트명 규칙을 추측하다 OP-06·OP-02 에서 당한 적 있음).
// 출력: data/psa-card-pop.json — 카드·변형별 주간 점 [{d,total,g10,g9,par,seen}] append-only. CGC/TAG 원장과 같은 구조.
//   d = GemRate 의 마지막 인구 변동일, seen = 그 값을 마지막으로 본 수집일(2026-09-16 추가. 감사가 관측일로 쓴다).
//
// ⚠️ 이 파일의 존재 이유는 "매칭을 틀리지 않는 것" 하나다(소유자 지시). 그래서:
//   1) **세트 각인이 그 세트 것일 때만** 본다. OP-13 목록에 있는 OP09 각인 재록 카드는 건너뛴다 —
//      우리 카드 번호는 각인 기준이고 GemRate 행 번호는 접두어가 없어, 재록까지 끌어들이면 번호가 겹친다.
//   2) 번호가 같은 행이 여럿이면 **변형(parallel)까지 정확히 1개로 좁혀질 때만** 채택한다.
//      0개거나 2개 이상이면 버리고 사유를 남긴다(ambiguous). 지어내지 않는다.
//   3) 대응표에 없는 우리 tier 는 시도조차 하지 않는다(모르는 걸 아는 척하지 않는다).
//
// 대응표 — 왼쪽이 우리 tier(cgc-card-pop-ingest.ourTier), 오른쪽이 GemRate parallel 표기(실측 2026-08-03).
// 확신이 없는 tier(signature 등)는 일부러 비워 뒀다. 비면 그 카드는 그냥 PSA 값이 없는 것으로 남는다.
const PARALLEL = {
  base: ["Base"],
  // TR(Treasure Rare) — 종전엔 tier 가 base 로 떨어져 **평범한 Base 행**이 붙었다(2026-08-25 실측).
  //   OP-08 top10 "Monkey D. Luffy TR" 에 OP-07 목록의 Base(1,813장)가 붙어 있었다.
  //   진짜 값은 OP-08 목록의 "Treasure Rare"(영문판 5,114장)다.
  tr: ["Treasure Rare"],
  alt: ["Alternate Art"],
  super: ["Manga Alternate Art"],
  red: ["Red Manga Alternate Art"],
  wanted: ["Wanted Alternate Art"],
  boxtopper: ["Box Topper"],
  // "Special" 은 EB-02 계열에서 GemRate 가 쓰는 짧은 표기다(실측 2026-08-25:
  // EB-02|jp 의 Boa Hancock 038 = "Special"(548장), 같은 카드가 OP-07 목록에는 Alternate Art 로 있다).
  // 이 표기가 없어 EB-02 SP 7장이 통째로 안 붙었다. 이름 검증이 별도로 걸리므로 남의 카드는 못 붙는다.
  sp: ["Special Alternate Art", "Special"],
  // ── 2026-08-25 추가. 종전에 gold/silver/signature 가 아예 비어 있어서 11장이 통째로 누락됐다.
  //    화면에는 "PSA 없음"으로 보였지만 데이터는 있었다 — OP-11 OP05-119 Gold 는 일본판만 2,094장이다.
  //    GemRate 는 애니버서리 각인을 par 에 그대로 쓴다(실측 2026-08-24 덤프):
  //      "3rd Anniversary-Gold" / "3rd Anniversary-Silver" / "1st Anniversary-Signature"
  //    우리 tier 는 카드명에서 나온다: ... SP Gold → gold, ... Silver Parallel → silver,
  //    ... Gold Stamped Signature → signature.
  //    ⚠️ 애니버서리 회차는 세트마다 다르므로(1st/2nd/3rd) 전부 적는다. 회차가 늘면 여기에 추가할 것.
  //    "Alternate Art-Gold" 나 "<캐릭터명>-Gold" 는 넣지 않는다 — 그건 다른 종류의 골드다.
  gold: ["3rd Anniversary-Gold", "2nd Anniversary-Gold", "1st Anniversary-Gold"],
  silver: ["3rd Anniversary-Silver", "2nd Anniversary-Silver", "1st Anniversary-Silver"],
  signature: ["1st Anniversary-Signature", "2nd Anniversary-Signature", "3rd Anniversary-Signature"],
};
// Run: node tools/psa-card-pop-ingest.js <dump.json> [--report]   (--report = 적재하지 않고 매칭 결과만 출력)
const fs = require("node:fs");
const path = require("node:path");
const { ourTier } = require("./cgc-card-pop-ingest.js");

const ROOT = path.resolve(__dirname, "..");
const dataPath = path.join(ROOT, "data", "onepiece-packs.json");
const histPath = path.join(ROOT, "data", "psa-card-pop.json");

const digits = (s) => (String(s || "").match(/(\d{1,4})\s*$/) || [, ""])[1].replace(/^0+(?=\d)/, "");

// 폴백(담은 세트 목록) 전용 이름 검증 — 2026-08-25.
// 각인 세트 목록에서는 "번호+접두어"가 카드를 특정하지만, 담은 세트 목록에서는 접두어가 달라
// **숫자만** 같은 남의 카드가 걸린다. 실측으로 실제 오배정이 나왔다:
//   우리 "Monkey D. Luffy 119 SP"(각인 OP05-119) → OP-11 목록의 119 = Sanji(1,346장) 가 붙었다.
//   우리 "Buggy OP09 051 SP"           → OP-09 목록의 051 = Boa Hancock(4,496장) 이 붙었다.
// 그래서 폴백에서는 GemRate 행의 카드명이 우리 카드명 안에 들어 있을 때만 채택한다.
const nameKey = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
// 같은 인물을 다르게 적는 표기차 — 여기 없으면 "다른 카드"로 보고 버린다.
// 실측(2026-08-24 덤프): 우리 "Mr2BonKurei Bentham" ↔ GemRate "Mr. 2 Bon Clay",
//                        우리 "Kouzuki Oden" ↔ GemRate "Kozuki Oden".
// 표기차만 넣는다 — 다른 인물을 여기에 넣으면 그게 곧 변형 오배정이다.
const ALIAS = [
  ["bonkurei", "bonclay"], ["bentham", "bonclay"],
  ["kouzuki", "kozuki"],
];
function nameAgrees(ourName, rowName) {
  let a = nameKey(ourName), b = nameKey(rowName);
  if (!a || !b) return false;          // 이름이 없으면 확인할 수 없다 — 채택하지 않는다
  if (a.includes(b) || b.includes(a)) return true;
  for (const [x, y] of ALIAS) {
    const a2 = a.replace(x, y), b2 = b.replace(x, y);
    if (a2.includes(b2) || b2.includes(a2)) return true;
  }
  return false;
}
const codeNoDash = (c) => String(c || "").replace(/-/g, "").toUpperCase();

// DON!! 카드만 GemRate 의 필드가 뒤집혀 있다 — 2026-08-25 실측.
//   name = "Don!! Card"(75~78행이 전부 같은 이름) · par = "<캐릭터>-Gold" · num = 빈칸.
// 번호가 없으니 번호 경로로는 영원히 못 잡는다. 캐릭터명으로만 특정한다.
// 안전장치: 그 캐릭터의 -Gold 행이 **정확히 하나**일 때만 채택한다.
//   ("Luffy" 처럼 Gear 4 / Gear 5 두 행에 걸리는 이름은 판정 불가로 버린다.)
const donRef = (cardName) => {
  const m = String(cardName || "").match(/^DON\s*Card\s+(.+?)\s+Gold$/i);
  return m ? { char: m[1], key: `DON-${nameKey(m[1])}|gold` } : null;
};

function match(dump, data) {
  const accepted = [], ambiguous = [], noRow = [], skippedReprint = [], noMapping = [];
  for (const [code, set] of Object.entries(data.sets)) {
    for (const card of set.cards || []) {
      const don = donRef(card.name);
      if (don) {
        for (const ed of ["jp", "en"]) {
          const rows = dump.sets[`${code}|${ed}`];
          if (!Array.isArray(rows)) { noRow.push(`${code}|${ed} DON ${don.char}`); continue; }
          const hits = rows.filter((r) => /^don!!\s*card$/i.test(String(r.name || "").trim())
            && /-Gold$/i.test(String(r.par || ""))
            && nameAgrees(don.char, String(r.par).replace(/-Gold$/i, "")));
          if (hits.length !== 1) {
            if (hits.length) ambiguous.push({ key: `${code}|${ed} DON`, card: card.name, tier: "gold",
              want: `${don.char}-Gold`, got: hits.map((r) => `${r.par}(${r.total})`) });
            else noRow.push(`${code}|${ed} DON ${don.char}`);
            continue;
          }
          const r = hits[0];
          if (!(Number.isInteger(r.total) && r.total > 0 && Number.isInteger(r.g10) && r.g10 <= r.total)) continue;
          accepted.push({ code, box: code, ed, num: `DON-${nameKey(don.char)}`, tier: "gold", card: card.name,
            par: r.par, total: r.total, g10: r.g10, g9: r.g9, d: r.updated || dump.collectedAt });
        }
        continue;
      }
      const num = String(card.number || "").toUpperCase();
      if (!num) continue;
      const stamp = (num.match(/^([A-Z]+\d{2})/) || [, ""])[1];
      // 각인 세트 — 번호 접두어가 가리키는 원래 세트. 담고 있는 박스와 다를 수 있다.
      const lookIn = stamp ? `${stamp.slice(0, -2)}-${stamp.slice(-2)}` : code;
      const tier = ourTier(card.name || "");
      const wants = PARALLEL[tier];
      if (!wants) { noMapping.push(`${code} ${num} (${tier})`); continue; }

      // ⚠️ 어느 세트 목록에서 찾을지 — **담고 있는 박스를 먼저 본다**(2026-08-25 정정).
      //    그 박스 top10 에 있는 카드는 그 박스에서 뽑는 인쇄본이고, 재수록본은 원본과 인구가 다르다.
      //    PSA 는 재수록본을 재수록 세트 목록에 따로 올린다. 실측:
      //      PRB-01 Shanks Manga(각인 OP01-120) → PRB-01 목록 81장 vs OP-01 목록 4,863장 (60배)
      //      PRB-01 Ace Manga · Chopper Manga · Sabo Manga 도 33~55배 차이.
      //    종전엔 각인 세트를 먼저 봐서 **원본의 인구**를 재수록 카드에 붙이고 있었다.
      //    CGC·TAG 는 처음부터 담은 박스 기준이라 한 화면에서 세 등급사가 서로 안 맞았다.
      //
      //    ⚠️ 각인 세트로 **폴백하지 않는다**. 박스 목록에 그 카드가 없으면 값을 비운다.
      //    PRB-01 은 OP-01~OP-06 망가를 새로 찍어 담은 세트라, 각인 세트에는 늘 "같은 그림의 다른 카드"가
      //    있다. 폴백을 두면 그게 그대로 붙는다. 실측으로 두 인쇄본은 서로 다른 상품이다:
      //      Shanks OP01-120 — PRB-01 판 ¥248,000 (SEC 위 ★, TCGplayer 587708)
      //                        OP-01 판  ¥198,000 (★ 없음,   TCGplayer 454666)
      //    PSA 가 아직 박스 목록에 올리지 않은 카드(PRB-01 일본판 Luffy·Zoro·Law·Kid 망가)는
      //    비워 둔다. 없는 값이 틀린 값보다 낫다.
      //
      // ⚠️ 변형 오배정 방지 — **번호 + par 라벨 완전일치 + 이름 일치**를 요구한다.
      //    번호만으로 찾지 않는다(그게 만가/알트가 섞이던 경로다).
      const lists = [code];

      let found = false;
      for (const ed of ["jp", "en"]) {
        let picked = null, clash = null;
        for (const src of lists) {
          const rows = dump.sets[`${src}|${ed}`];
          if (!Array.isArray(rows)) continue;
          const sameNum = rows.filter((r) => digits(r.num) && digits(r.num) === digits(num));
          if (!sameNum.length) continue;
          // **모든 경로에서** 이름이 맞아야 한다 — 2026-08-25.
          // digits() 가 접두어를 버리므로 OP07-051 과 OP09-051 이 둘 다 "51" 로 같아진다. 실측 오배정:
          //   OP-09 목록의 051 "Special Alternate Art" 는 **Boa Hancock**(4,496장)인데
          //   우리 "Buggy OP09 051 SP" 에 붙었다(OP-09 의 051 Buggy 는 Wanted/Manga/Alt/Base 뿐이다).
          // 이름이 안 맞으면 채택하지 않는다. 애매하면 비우는 편이 낫다.
          const hits = sameNum.filter((r) => wants.includes(r.par) && nameAgrees(card.name, r.name));
          if (hits.length === 1) { picked = { src, r: hits[0] }; break; }   // 앞 목록(담은 박스)이 이긴다
          if (hits.length > 1) { clash = { src, sameNum }; break; }         // 같은 라벨이 둘 — 판정 불가
        }
        if (clash) {
          ambiguous.push({ key: `${clash.src}|${ed} ${num}`, card: card.name, tier, want: wants.join("/"),
            got: clash.sameNum.map((r) => `${clash.src}:${r.par}(${r.total})`) });
          continue;
        }
        if (!picked) { noRow.push(`${code}|${ed} ${num} [${tier}]`); continue; }
        const r = picked.r;
        if (!(Number.isInteger(r.total) && r.total > 0 && Number.isInteger(r.g10) && r.g10 <= r.total)) continue;
        found = true;
        // 원장 키는 **실제로 맞은 목록** 기준으로 남긴다. 재수록본은 재수록 세트 밑에,
        // 원본은 원본 세트 밑에 — 같은 번호라도 인쇄본이 다르면 다른 시계열이다.
        accepted.push({ code: picked.src, box: code, ed, num, tier, card: card.name, par: r.par, total: r.total, g10: r.g10, g9: r.g9, d: r.updated || dump.collectedAt });
      }
      if (!found && stamp && !dump.sets[`${lookIn}|jp`] && !dump.sets[`${lookIn}|en`]) skippedReprint.push(`${code} ${num} → ${lookIn} 미수집`);
    }
  }
  return { accepted, ambiguous, noRow, skippedReprint, noMapping };
}

function ingest(dump, res) {
  let store;
  try { store = JSON.parse(fs.readFileSync(histPath, "utf8")); } catch { store = { grader: "psa", sets: {} }; }
  store.sets = store.sets || {};
  let appended = 0, skipped = 0, refreshed = 0;
  for (const a of res.accepted) {
    const key = `${a.num}|${a.tier}`;
    const bucket = (store.sets[a.code] = store.sets[a.code] || {});
    const byEd = (bucket[a.ed] = bucket[a.ed] || {});
    const arr = (byEd[key] = byEd[key] || []);
    // d 는 GemRate 의 "마지막 인구 변동일"이지 수집일이 아니다 — 2026-09-16.
    // 인구가 안 변한 카드는 매주 봐도 d 가 같아 새 점이 안 생기고, 감사가 마지막 d 를 관측일로 읽어
    // "뒤짐"으로 오판했다(PRB-01 jp EB01-006, 08-17 이후 64장 그대로). 그래서 **실제로 본 날**을 seen 에 남긴다.
    // 값은 절대 안 건드린다(append-only) — 같은 d 면 seen 만 앞으로 당긴다.
    const dup = arr.find((p) => p.d === a.d);
    if (dup) {
      if (dump.collectedAt > (dup.seen || dup.d)) { dup.seen = dump.collectedAt; refreshed += 1; }
      skipped += 1; continue;
    }
    arr.push({ d: a.d, total: a.total, g10: a.g10, g9: a.g9, par: a.par, seen: dump.collectedAt });
    arr.sort((x, y) => x.d.localeCompare(y.d));
    appended += 1;
  }
  store.grader = "psa";
  store.updated = dump.collectedAt;
  store.note = "Weekly PSA population for our tracked top-10 One Piece chase cards, per card and per printing variant, kept separately for Japanese and English. Source: GemRate public set pages. Matched by set stamp + card number + variant; a card is recorded only when exactly one variant row matches, never guessed. Japanese and English are never summed. Append-only.";
  fs.writeFileSync(histPath, `${JSON.stringify(store)}\n`, "utf8");
  return { appended, skipped, refreshed };
}

module.exports = { match, ingest, PARALLEL, donRef };
if (require.main === module) {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/psa-card-pop-ingest.js <dump.json> [--report]"); process.exit(1); }
  const dump = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const res = match(dump, data);
  const summary = { accepted: res.accepted.length, ambiguous: res.ambiguous.length, noRow: res.noRow.length, skippedReprint: res.skippedReprint.length, noMapping: res.noMapping.length };
  if (process.argv.includes("--full")) {
    // 변형 오배정 검사용 — 채택 전부를 낸다(샘플이 아니라). 사람이 tier↔par 정합성을 눈으로 검증할 때 쓴다.
    console.log(JSON.stringify({ summary, accepted: res.accepted, ambiguous: res.ambiguous }, null, 1));
    return;
  }
  if (process.argv.includes("--report")) {
    console.log(JSON.stringify({ summary, ambiguousSample: res.ambiguous.slice(0, 12), noMappingSample: res.noMapping.slice(0, 8), acceptedSample: res.accepted.slice(0, 6) }, null, 1));
  } else {
    console.log(JSON.stringify({ ...summary, ...ingest(dump, res) }));
  }
}
