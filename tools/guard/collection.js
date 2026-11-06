"use strict";
// 수집기·분류기·워크플로 규칙 — 수집은 바뀌면 안 된다(소유자 절대지시). 2026-10-15 분할.
//  D14 진행매물 조회 한도 100 고정 [2026-09-30 로컬 50 이 가짜 급락] · R3 sold URL 에 _sacat 금지 [2026-08-13] · R4 수집 빠짐 그물 자체검증 [2026-09-02 그물이 조용히 죽음]
//  Q1 다수량 개당가·sold 판정·판매일 표시일 [2026-07-22·10-01] · Q2 경매 분류(팩·카톤·개봉) · Q3 TAG 세트명 매핑 · Q4 변형(tier) 매칭 [2026-07-24 박스토퍼 오염]
//  Q5 시리즈 이름 충돌(EB-03/EB-05) [2026-09-30] · W1 산출물 커밋 누락 [2026-07-20 rebase 실패] · W2 건강검사 !cancelled() [2026-09-30] · W3 러너 0건 성공 금지 [2026-09-30]
//  W4 전역 신선도 감사는 커밋 뒤 [2026-09-30 CGC W39 영구 공백] · G9(워크플로) CGC 덤프 → 세트 합 적재 + 화면 블록 [2026-09-30]
//  PW1 팰월드 전용 수집이 되살아나지 않는다 [2026-11-05 소유자 결정으로 중단·원장 동결]
//  외부(external, 러너가 병렬로 돌린다): R4·Q1 회귀·G9 적재 테스트·R5 수집 신뢰성 테스트 5개·K1/K2 known-gaps [2026-09-30]·A4 애드센스 준비도 감사
const { errors, read, exists, list, packs } = require("./lib");

//  NMP1 유유테이 파서 첫 상품이 메뉴(MENU·収録弾)와 묶여 사라짐 [2026-11-05, 23쪽 전부 — 4장 NM '—'] (외부: test-yuyutei-parser.js)
//  NMF1 유유테이 NM 행이 최댓값이라 새 세트 하나만 갱신해도 전체 지연이 가려짐 [2026-11-05] — test-collect-status.js 안(R4 가 돌린다)
const checks = ["D14", "R3", "R4", "Q1", "Q2", "Q3", "Q4", "Q5", "W1", "W2", "W3", "W4", "G9", "R5", "K1", "K2", "A4", "NMP1", "PW1"];
const tail = (r) => (r.stderr || r.stdout || "unknown").trim().slice(0, 500);
const testFail = (id, name) => ({ id, args: [`tools/${name}`], judge: (r) => (r.status !== 0 ? [`${id}: ${name} 실패 — ${tail(r)}`] : []) });
// 러너(guard-invariants.js)가 모듈 실행 전에 전부 띄우고 끝에 결과를 받는다 — 직렬 4초가 병렬 1.3초.
const external = [
  { id: "R4", args: ["tools/test-collect-status.js"], judge: (r) => { try { const j = JSON.parse(r.stdout.trim().split("\n").pop()); return [...(j.test !== "OK" ? ["R4: 수집 빠짐 그물 검사 실패 — 새 수집이 조용히 누락될 수 있다"] : []), ...(j.sources < 22 ? [`R4: 등록된 수집원이 ${j.sources}개로 줄었다(22개 이상)`] : [])]; } catch (e) { return ["R4: 수집 빠짐 그물 검사가 죽었다 — " + tail(r)]; } } },
  testFail("Q1", "test-box-sold-filters.js"),
  testFail("G9", "test-pop-ingest-guards.js"),
  ...["test-auction-continuity.js", "test-ebay-budget-schedule.js", "test-self-heal-policy.js", "test-workflow-dispatch.js", "test-tcg-trend-model.js"].map((t) => testFail("R5", t)),
  { id: "K1", args: ["tools/audit-series-gaps.js", "--json"], judge: (r) => { let j = null; try { j = JSON.parse(r.stdout); } catch {} return !j || !Array.isArray(j.knownWrong) ? [`K1: 공백 감사가 결과를 못 냈다 — ${tail(r).slice(0, 300)}`] : j.knownWrong.map((m) => `K1: data/known-gaps.json 오기재 — ${m}`); } },
  testFail("K2", "test-series-gaps.js"),
  testFail("NMP1", "test-yuyutei-parser.js"),
  { id: "A4", args: ["tools/audit-adsense-readiness.js"], judge: (r) => { if (r.status === 0) return []; let j = null; try { j = JSON.parse(r.stdout || ""); } catch {} return Array.isArray(j?.errors) && j.errors.length ? j.errors.map((e) => `A4: ${e}`) : [`A4: AdSense readiness 감사 실패 — ${tail(r)}`]; } },
];

function run() {
  const P = packs(), R = P.fx.usdKrw;
  for (const f of ["tools/update-ebay-pack-prices.js", "tools/update-ebay-english-pack-prices.js"]) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, "");
    if (!/const searchLimit = "100";/.test(src) || /EBAY_SEARCH_LIMIT/.test(src)) errors.push(`D14: ${f} 의 조회 한도가 100 고정이 아니다 — 로컬과 클라우드가 다른 표본을 받아 박스 시계열에 가짜 급락이 생긴다`);
  }
  if (exists("tools/box-sold-urls.js")) {
    const src = read("tools/box-sold-urls.js");
    if (/_sacat=/.test(src.replace(/^\s*\/\/.*$/gm, ""))) errors.push("R3: box-sold-urls.js 가 _sacat(카테고리)을 다시 걸고 있다 — eBay 가 Language 패싯을 무시한다");
    if (!/Language=/.test(src)) errors.push("R3: box-sold-urls.js 에서 Language 패싯이 사라졌다");
  }
  // Q1 — 함정 제목(세트코드 13·연도·케이스·복수형·PRB-02 권 번호)을 실제로 실행
  const { parseLotQuantity } = require("../lot-quantity");
  for (const [title, kind, want] of [
    ["One Piece OP-13 Booster Box Japanese Sealed", "box", 1], ["One Piece Card Game OP 13 Booster Box Japanese Sealed", "box", 1], ["One Piece OP 05 Booster Box English", "box", 1], ["ST 21 One Piece box sealed Japanese", "box", 1],
    ["One Piece Card Game OP05 Booster Box 2023", "box", 1], ["One Piece Romance Dawn OP-01 Japanese 1 Box", "box", 1], ["One Piece OP-01 Booster Box - 24 Packs Japanese Sealed", "box", 1],
    ["OP-13 booster box x3 Japanese", "box", 3], ["3 Booster Boxes One Piece OP-08 Sealed", "box", 3], ["ワンピースカードゲーム OP-13 2BOX 未開封", "box", 2], ["Set of 2 One Piece PRB-01 Premium Booster Box", "box", 2],
    ["One Piece Booster Boxes OP-09 Sealed Japanese", "box", null], ["One Piece OP-01 Booster Box Case Sealed", "box", null], ["One Piece OP-13 Sealed Case 12 boxes", "box", 12],
    ["Sealed Japanese The Best Vol. 2 PRB-02 Booster Box US SELLER One Piece Card Game", "box", 1], ["One Piece TCG PRB-02 Premium Booster 2 Booster Box (FREE SHIPPING✔️)", "box", 1],
    ["10 Booster Packs One Piece OP-05 Japanese", "pack", 10], ["3 Packs One Piece Card Game OP-08 Sealed", "pack", 3], ["One Piece OP-09 Booster Packs Japanese", "pack", null],
    ["Monkey D Luffy OP01-003 Alt Art x4", "card", 4], ["One Piece card lot 50+ cards", "card", null], ["Shanks OP01-120 Manga Alt Art PSA 10", "card", 1],
  ]) { const got = parseLotQuantity(title, kind); if (got !== want) errors.push(`Q1: lot-quantity "${title}" → ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`); }
  try {
    const { judgeItem, buildNameMap, ingestNameMap } = require("../box-sold-ingest");
    const it = (t, k, cur, d) => ({ id: "1", t, k, cur: cur || "KRW", d: d || "Sold  Jul 20, 2026" });
    for (const [item, want, ed] of [
      [it("One Piece OP-13 Booster Box Japanese Sealed", 200000), 200000 / R, "jp"], [it("One Piece Card Game OP-13 Booster Box Japanese Sealed", 200000), 200000 / R, "jp"], [it("One Piece OP-13 Booster Box - 24 Packs Japanese Sealed", 250000), 250000 / R, "jp"],
      [it("OP-13 booster box Japanese x2", 380000), 190000 / R, "jp"], [it("3 Booster Boxes OP-13 Japanese Sealed", 540000), 180000 / R, "jp"], [it("One Piece OP-13 Booster Box English Sealed", 210, "USD"), 210, "en"],
      [it("One Piece OP-13 Booster Boxes Japanese", 500000), "uncountable-lot"], [it("One Piece OP-13 Booster Box Case Japanese", 2000000), "bad-word"], [it("Sleeved Boosters Double Pack Set (OP 13,14,16) Japanese", 385240), "not-booster-box"],
      [it("One Piece OP-13 OP-14 Booster Box Japanese", 400000), "cross-set"], [it("One Piece OP-13 Booster Box Sealed", 200000), "no-language"], [it("One Piece OP-13 Booster Box Japanese", 50000), "price-out-of-range"], [it("One Piece OP-13 Booster Box Japanese", 200000, "KRW", "no date here"), "bad-date"],
      [it("One Piece TCG OP13 Booster Box MINT English - New & Sealed CASE FRESH 🚀✅", 594499), 594499 / R, "en"], [it("One Piece Card Game OP-13 Booster Box English Sealed + Acrylic Case", 666560), 666560 / R, "en"],
      [it("One Piece TCG OP-13 Carrying On His Will Booster Box Case SEALED ENGLISH", 10015219), "bad-word"], [it("One Piece OP-13 Carrying On His Will 12 BOX BOOSTER BOX CASE Factory Sealed", 9051726), "bad-word"],
    ]) {
      const r = judgeItem(item, "OP-13", R);
      if (typeof want === "string") { if (r.drop !== want) errors.push(`Q1: ingest "${item.t}" → ${r.drop || "통과"} (기대 drop ${want})`); }
      else if (!r.rec || Math.abs(r.rec.unit - want) > 0.01 || r.ed !== ed) errors.push(`Q1: ingest "${item.t}" → ${JSON.stringify(r.rec ? { unit: r.rec.unit, ed: r.ed } : r)} (기대 unit ${want.toFixed(2)} ed ${ed})`);
      else if (r.rec.d !== "2026-07-20") errors.push(`Q1: ingest "${item.t}" → d ${r.rec.d} (기대 2026-07-20 — eBay 표시일 그대로, 타임존 변환 금지)`);
    }
    // Q5 — 한 이름이 다른 이름의 앞부분(EB-03 "Heroine's Edition" / EB-05 "Heroines Edition vol.2")
    const { UPCOMING } = require("../box-sold-urls");
    const next = buildNameMap(P, [{ code: "EB-05", nameEn: "Heroines Edition vol.2" }]), now = buildNameMap(P);
    const it2 = (t, k) => ({ id: "1", t, k, cur: "KRW", d: "Sold  Sep 28, 2026" });
    for (const [t, k, code, ed, map, want] of [
      ["ONE PIECE Heroines Edition Vol.2 EB-05 Japanese Booster Box PRE-ORDER", 345287.85, "EB-05", "jp", next, "keep"], ["ONE PIECE Heroines Edition Vol.2 EB-05 Japanese Booster Box PRE-ORDER", 345287.85, "EB-03", "jp", next, "code-missing"],
      ["One Piece Heroines Edition Vol.2 Booster Box Japanese", 345000, "EB-03", "jp", now, "code-missing"], ["One Piece Heroines Edition Vol.2 Booster Box Japanese", 345000, "EB-03", "jp", next, "code-missing"],
      ["One Piece Heroines Edition 2 Booster Box Japanese", 345000, "EB-03", "jp", next, "name-ambiguous"], ["One Piece Heroines Edition Booster Box Japanese Sealed", 200000, "EB-03", "jp", next, "keep"],
    ]) { const r = judgeItem(it2(t, k), code, R, map, ed, "bin"); const got = r.drop || (r.rec && r.rec.qty === 1 ? "keep" : "qty " + (r.rec && r.rec.qty)); if (got !== want) errors.push(`Q5: ${code} "${t}" → ${got} (기대 ${want})`); }
    const live = new Set(ingestNameMap(P).map(([, c]) => c));
    for (const u of UPCOMING) if (!P.sets[u.code] && String(u.nameEn || "").replace(/[^a-z0-9]/gi, "").length >= 6 && !live.has(u.code)) errors.push(`Q5: UPCOMING ${u.code}(${u.nameEn}) 가 ingest 이름표에 없다`);
  } catch (e) { errors.push(`Q1: ingest 판정 실행 실패 — ${e.message}`); }
  // Q2 — "박스 통계는 무조건 부스터박스만": 더블팩·카톤·개봉 뭉치가 box 로 새면 거래량 왜곡
  const { categorize } = require("../auction-classify");
  for (const [title, want] of [
    ["One Piece OP-13 Booster Box Japanese Sealed", "box"], ["One Piece 3 Booster Boxes OP-08 Sealed", "box"], ["One Piece OP-05 Double Pack Set Sealed", "pack"], ["One Piece OP-11 Booster Pack Japanese", "pack"], ["One Piece OP-07 24 Packs Sealed", "pack"],
    ["One Piece OP-01 Booster Box Carton Sealed (12 boxes)", "carton"], ["One Piece OP-05 Sealed Case of 12 Booster Box", "carton"], ["One Piece OP-06 Full Case Booster Box English", "carton"], ["Monkey D Luffy OP01-120 Manga PSA 10", "card"], ["One Piece OP-13 Display Box Japanese", "box"],
    ["One Piece TCG OP-05 Awakening Booster Box Case SEALED ENGLISH", "carton"], ["One Piece A Fist Of Divine Speed Booster Box Case (12 Boxes) OP11", "carton"], ["2022 One Piece OP02 Paramount War JPN Booster Box Case - Factory Sealed", "carton"],
    ["One Piece Premium Booster Box The Best PRB-01 Sealed English with acrylic case", "box"], ["One Piece TCG OP01 Romance Dawn Booster Box Sealed w/ Acrylic Case", "box"], ["One Piece OP-14 ENG Booster Box New Sealed (CASE FRESH)", "box"],
    ["Opened! One Piece Card Game OP-17 Booster Box Bulk LR And SR", "card"], ["One Piece, Op16 and OP13 Booster Box Bulk, Common, Uncommon, Rare", "card"],
  ]) { const got = categorize(title); if (got !== want) errors.push(`Q2: categorize "${title}" → ${got} (기대 ${want}) — 박스 통계 오염 위험`); }
  const { matchBox } = require("../tag-classify");
  for (const [name, code, ed] of [
    ["One Piece Romance Dawn Japanese Alternate Art", "OP-01", "jp"], ["One Piece Romance Dawn", "OP-01", "en"], ["One Piece Two Legends Alternate Art", "OP-08", "en"], ["One Piece Extra Booster Memorial Collection Japanese", "EB-01", "jp"],
    ["One Piece Extra Booster Anime 25th Collection Japanese", "EB-02", "jp"], ["One Piece Extra Booster Heroines Edition Alternate Art", "EB-03", "en"], ["One Piece Premium Booster The Best Japanese Alternate Art", "PRB-01", "jp"],
    ["One Piece Premium Booster The Best Vol. 2 Alternate Art", "PRB-02", "en"], ["One Piece Premium Card Collection 25th Edition Japanese", null, null], ["One Piece 2nd Anniversary Set Japanese Alternate Art", null, null],
  ]) { const m = matchBox(name), got = m ? `${m.code}/${m.ed}` : "null", want = code ? `${code}/${ed}` : "null"; if (got !== want) errors.push(`Q3: TAG matchBox "${name}" → ${got} (기대 ${want})`); }
  const { ourTier, cgcTier } = require("../cgc-card-pop-ingest"), { tagTier } = require("../tag-card-pop-ingest");
  for (const [fn, want] of [
    [() => ourTier("Monkey D. Luffy 118 Red Manga Alternate Art"), "red"], [() => ourTier("Monkey D. Luffy 118 Super Alternate Art"), "super"], [() => ourTier("Kuzan Manga"), "super"], [() => ourTier("Shanks OP09-004 Gold Parallel"), "gold"], [() => ourTier("Boa Hancock SP"), "sp"],
    [() => cgcTier("Monkey D. Luffy (2025) Red Manga Alt. Art SEC"), "red"], [() => cgcTier("Monkey D. Luffy (2025) Manga Alt. Art Parallel SEC"), "super"], [() => cgcTier("Roronoa Zoro (2022) (Map Text Box) Alt. Art L"), "alt"], [() => cgcTier("Boa Hancock (2025) Foil Parallel L"), "sp"], [() => cgcTier("Shanks (2025) SP Ver. (SP next to number) Silver SR"), "silver"],
    [() => tagTier("One Piece Carrying On His Will Japanese Manga Alternate Art"), "super"], [() => tagTier("One Piece Carrying On His Will Japanese Red Manga Alternate Art"), "red"], [() => tagTier("One Piece Romance Dawn Japanese Special Alternate Art"), "sp"], [() => tagTier("One Piece Romance Dawn Japanese Alternate Art"), "alt"], [() => tagTier("One Piece Carrying On His Will Japanese"), "base"],
    [() => ourTier("Boa Hancock Box Topper"), "boxtopper"], [() => ourTier("Silvers Rayleigh Parallel Manga"), "super"], [() => ourTier("Marshall D. Teach SP Silver"), "silver"],
  ]) { let got; try { got = fn(); } catch (e) { got = "ERR:" + e.message; } if (got !== want) errors.push(`Q4: tier 매칭 회귀 — ${fn.toString().slice(10, 80)} → ${got} (기대 ${want})`); }
  workflows();
  palworldStopped();
}

// PW1 — 팰월드 전용 수집(경매 관측·정산 --game=palworld, 박스 sold 적재)은 2026-11-05 소유자 결정("팰월드만 수집했던 건 그냥
// 멈추자")으로 지웠고 원장 data/palworld-* 은 append-only 라 동결했다. 되살아나면 감시 없이 동결 원장이 몰래 다시 자라고,
// 그 콜만큼 eBay 한도가 TCG 13종(남는 몫은 같은 몫)에서 빠진다. 반대로 감시·예산만 남으면 동결 원장 때문에 매일 FAIL 하거나
// 아무도 안 읽을 몫을 잡는다. 팰월드는 TCG 13종 묶음(tcg-config.js·collect-tcg)에서만 본다 — 그쪽은 이 검사 대상이 아니다.
function palworldStopped() {
  const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");   // 주석(중단 이력)은 본다고 치지 않는다
  for (const wf of list(".github/workflows", /\.ya?ml$/)) {
    read(`.github/workflows/${wf}`).split(/\r?\n/).forEach((line, i) => {
      if (!/^\s*#/.test(line) && /palworld-(auction|sold)|--game=/.test(line)) errors.push(`PW1: ${wf}:${i + 1} 가 팰월드 전용 수집을 다시 돌리거나 동결 원장을 커밋한다 — ${line.trim().slice(0, 100)}`);
    });
  }
  for (const f of ["tools/palworld-sold-urls.js", "tools/palworld-sold-ingest.js"]) if (exists(f)) errors.push(`PW1: ${f} 가 다시 생겼다 — 팰월드 박스 sold 수집은 멈췄다(palworld-sold-ledger.json 동결)`);
  for (const f of ["tools/collect-auction-market.js", "tools/settle-auctions.js", "tools/auction-archive.js"]) {
    if (/--game|palworld/i.test(code(f))) errors.push(`PW1: ${f} 에 게임 전환(--game)·팰월드 경로가 다시 생겼다 — 원피스 전용이다`);
  }
  if (/palworld/i.test(code("tools/ebay-budget.js"))) errors.push("PW1: ebay-budget.js 가 팰월드 몫을 다시 잡는다 — 동결된 감시목록은 세지 않는다(남는 몫은 TCG 13종이 같은 몫)");
  for (const f of ["tools/audit-collection-health.js", "tools/audit-series-gaps.js"]) {
    if (/palworld-(auction|sold)/.test(code(f))) errors.push(`PW1: ${f} 가 동결된 팰월드 원장의 신선도·공백을 다시 본다 — 수집이 없으니 매일 FAIL 한다`);
  }
  if (/key:\s*"palworld/.test(code("tools/collect-status.js"))) errors.push("PW1: collect-status.js 에 팰월드 수집원 행이 다시 생겼다 — 동결 원장은 IGNORE 에 둔다");
}

// W1 — 워크플로가 돌리는 도구가 쓰는 data/*.json·루트 산출물은 전부 커밋 목록(git add·git diff --quiet 동일)에 있어야 한다
function workflows() {
  const dataFiles = list("data", /\.json$/), CURATED = new Set(["set-facts.json"]);
  const norm = (t) => t.trim().split(/\s+/).filter((x) => x && x !== "--").sort().join(" ");
  const RUNNER_BLOCKED = { "update-yuyutei-nm-prices.js": "유유테이가 러너 IP 에 403 — 10일 주기 로컬 수동(collect-status nm)" };
  const GLOBAL = /node tools\/(audit-collection-health|audit-series-gaps|collect-status)\.js/;
  for (const wf of list(".github/workflows", /\.ya?ml$/)) {
    const y = read(`.github/workflows/${wf}`);
    const addLines = [...y.matchAll(/^\s*git add ([^\n]+)/gm)].map((m) => m[1]), diffLines = [...y.matchAll(/git diff --quiet ([^\n]+?);\s*then/g)].map((m) => m[1]), addLine = addLines[0] || "";
    const tools = [...y.matchAll(/node tools\/([a-z0-9-]+\.js)/g)].map((m) => m[1]);
    // W3 — 러너에서 못 도는 수집기·플래그를 위치 인자로 먹는 스크립트
    for (const [script, why] of Object.entries(RUNNER_BLOCKED)) if (y.includes(`tools/${script}`)) errors.push(`W3: ${wf} 가 ${script} 를 돌린다 — ${why}`);
    for (const line of y.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const calls = [...line.matchAll(/node\s+tools\/([a-z0-9-]+\.js)/g)];
      for (const [i, m] of calls.entries()) {
        if (m[1] === "run-with-retry.js" || !exists(`tools/${m[1]}`)) continue;
        const args = line.slice(m.index + m[0].length, i + 1 < calls.length ? calls[i + 1].index : line.length).split(/\s(?:2>|\||&&|;|>)/)[0];
        const flags = args.split(/\s+/).filter((a) => /^-/.test(a));
        if (flags.length && /process\.argv\.slice\(2\)(?!\s*\.filter\()/.test(read(`tools/${m[1]}`))) errors.push(`W3: ${wf} 가 ${m[1]} 에 ${flags.join(" ")} 를 넘기는데 스크립트가 process.argv.slice(2) 를 거르지 않는다 — 플래그가 세트코드로 먹혀 대상 0건`);
      }
    }
    // G9 — CGC 덤프를 받으면 같은 덤프로 세트 합도 적재하고 화면 블록을 다시 주입
    const dump = (y.match(/node tools\/collect-cgc-card-pop\.js ("[^"]+"|\S+)/) || [])[1];
    if (dump) { const at = y.indexOf(`node tools/cgc-set-grades-ingest.js ${dump}`); if (at < 0) errors.push(`G9: ${wf} 가 CGC 덤프(${dump})를 받고 세트 합(cgc-set-grades-ingest.js)을 적재하지 않는다`); else if (y.indexOf("node tools/inject-grader-editions.js", at) < 0) errors.push(`G9: ${wf} 가 세트 원장에 점을 늘리고 화면 블록(inject-grader-editions.js)을 다시 주입하지 않는다`); }
    // W4 — 커밋 앞의 전역 감사(남의 지연이 이번 수집 결과를 버린다)
    const lines = y.split("\n"), heads = lines.map((l, i) => [i, (l.match(/^(\s*)- (?:name|uses):/) || [])[1]]).filter(([, ind]) => ind != null);
    if (heads.length) {
      const ind = heads[0][1].length, starts = heads.filter(([, s]) => s.length === ind).map(([i]) => i);
      const steps = starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length).join("\n")), commitAt = steps.findIndex((t) => /^\s*git commit\b/m.test(t));
      if (commitAt >= 0) steps.slice(0, commitAt).forEach((t) => { const m = t.match(GLOBAL); if (m) errors.push(`W4: ${wf} 에서 전역 감사 ${m[1]} 가 커밋 단계보다 앞에 있다 — 커밋 뒤로 옮길 것`); });
    }
    if (!addLine && !diffLines.length) continue;
    for (const [i, c] of addLines.entries()) if (norm(c) !== norm(addLine)) errors.push(`W1: ${wf} 의 ${i + 1}번째 git add 범위가 최초 커밋 범위와 불일치 — rebase 후 누락 구멍`);
    for (const c of diffLines) if (addLine && norm(c) !== norm(addLine)) errors.push(`W1: ${wf} 의 git diff 목록과 git add 목록 불일치 — 커밋 누락 구멍`);
    const need = [];
    if (tools.includes("inject-nav.js")) need.push("about.html", "amazon-lottery.html", "changelog.html", "disclaimer.html", "methodology.html", "privacy.html", "psa-grading.html");
    if (tools.includes("generate-set-pages.js")) { need.push("psa10-ranking.html"); if (!y.includes("Tracked generated files remain unstaged")) errors.push(`W1: ${wf} 에 staging 후 추적 파일 잔여 검사 없음`); }
    if (tools.includes("backfill-english-box-series.js")) need.push("logs/en-backfill-status.json");
    if (tools.includes("generate-ai-data.js")) need.push("opbox-ai-data.json");
    if (tools.includes("generate-free-data.js")) need.push("free-data.html", "opbox-set-prices.csv", "opbox-grading-population.csv", "opbox-auction-daily.csv", "sitemap.xml");
    for (const out of need) if (!addLine.split(/\s+/).includes(out) && !addLine.includes(out)) errors.push(`W1: ${out} 은 ${wf} 의 산출물인데 커밋 목록에 없음 — rebase 실패를 유발함`);
    const src = [...new Set(tools)].filter((f) => exists(`tools/${f}`)).map((f) => read(`tools/${f}`)).join("\n");
    if (!src) continue;
    for (const f of dataFiles) {
      if (CURATED.has(f)) continue;
      const e = f.replace(/[.]/g, "\\.");   // 읽기만 하는 파일도 이름이 나오므로 writeFileSync 로 판별(2026-08-12 오탐)
      const pathVars = [...src.matchAll(new RegExp(`(\\w+)\\s*=\\s*path\\.join\\([^;\\n]*"${e}"`, "g"))].map((m) => m[1]);
      const writes = new RegExp(`writeFileSync\\([^)]*${e}`).test(src) || new RegExp(`"${e}"[^\\n]*\\n?[^\\n]*writeFileSync`).test(src) || pathVars.some((v) => new RegExp(`writeFileSync\\(\\s*${v}\\b`).test(src));
      if (writes && !addLine.includes(`data/${f}`)) errors.push(`W1: data/${f} 는 ${wf} 의 산출물인데 커밋 목록에 없음 — rebase 실패를 유발함`);
    }
  }
  // W2 — collection-health.yml: 두 번째 run 단계부터 if: ${{ !cancelled() }}, continue-on-error 금지
  const y = read(".github/workflows/collection-health.yml").replace(/\r\n/g, "\n");
  const runSteps = y.split(/\n(?=      - )/).slice(1).filter((s) => /^\s+run:/m.test(s));
  if (runSteps.length < 2) errors.push("W2: collection-health.yml 에서 검사 단계를 찾지 못함");
  for (const s of runSteps.slice(1)) if (!/^\s+if:\s*(\$\{\{\s*(!cancelled\(\)|always\(\))\s*\}\}|always\(\))\s*$/m.test(s)) errors.push(`W2: collection-health.yml '${((s.match(/name:\s*(.+)/) || [])[1] || s.slice(0, 40)).trim()}' 에 if: \${{ !cancelled() }} 없음`);
  if (/^\s+continue-on-error:/m.test(y)) errors.push("W2: collection-health.yml 에 continue-on-error — 실패가 성공으로 덮여 메일이 안 간다");
}

module.exports = { checks, run, external };
