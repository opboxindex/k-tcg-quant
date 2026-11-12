#!/usr/bin/env node
// 수집 현황 한 장 — 2026-09-02 신설.
//
// 왜 만드나: 소유자 지적 "박스 수집·월수금 알림·워크플로가 파편적이라 내가 지금 뭘 수집하는지 모르겠다,
// 하나로 만들어봐." 실제로 수집이 세 군데에 흩어져 있었다:
//   ① GitHub Actions 워크플로(자동)  ② 브라우저로만 되는 수동 수집  ③ 월수금 알림(사람에게만 옴)
// audit-collection-health.js 는 "데이터가 늙었나"를 잘 보지만, **뭐가 자동이고 뭐가 내 손이 필요한지**는
// 말해주지 않는다. 늙은 데이터를 보고도 "기다리면 되는 건가, 내가 해야 하나"를 알 수 없다.
//
// 그래서 이 파일이 답하는 질문은 딱 하나: **"지금 내가 뭘 해야 하나?"**
//
// ⚠️ **빠짐 방지가 이 도구의 존재 이유다** — 2026-09-02 소유자 절대지시:
//    "나중에 가서 '어 빼먹었어요, 기준이 아니라서 놓쳤어요' 이러지 마라. 박스 그래프 틀리면 디진다."
//    첫 판(11개 손목록)에서 실제로 유유테이 NM 시세가 통째로 빠져 있었다. 손으로 적은 목록은 반드시 샌다.
//    그래서 이 도구는 **data/ 를 전수 스캔해 목록에 없는 축적 파일을 UNTRACKED 로 고발한다.**
//    새 수집을 추가하고 여기 등록하지 않으면 다음 실행에서 바로 튀어나온다. 목록이 조용히 낡지 않는다.
//    UNTRACKED 가 뜨면 **반드시 SOURCES 에 등록하거나 IGNORE 에 이유를 적어라.** 무시하지 말 것.
//
// 이 파일은 읽기만 한다 — 아무것도 수집하지 않고 아무 파일도 쓰지 않는다.
// Run: node tools/collect-status.js [--json]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const R = (p) => path.join(ROOT, p);
const readJSON = (p) => JSON.parse(fs.readFileSync(R(p), "utf8"));
const { nmUsable } = require("./market-data-normalizers");   // 화면이 NM 을 싣는 술어 한 곳(nm 행이 같은 카드를 본다)
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (d) => (d ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000) : null);
// 영업일 기준 경과일 — (d, today] 구간의 평일(월~금) 수. 환율(ECB)은 주말·공휴일에 새 값이 없어서
// 달력일로 세면 월요일 아침마다 "3일째 멈춤"으로 오경보가 났다(2026-09-14 실측). 주말은 세지 않는다.
const businessDaysAgo = (d) => {
  if (!d) return null;
  let n = 0;
  for (let t = Date.parse(`${d}T00:00:00Z`) + 86400000; t <= Date.parse(`${today}T00:00:00Z`); t += 86400000) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
};

// 최신 날짜를 뽑는 방법은 파일마다 다르다. 각 수집원이 자기 방식을 들고 있게 한다.
const pick = {
  // 어떤 파일은 "2026-09-02", 어떤 파일은 "2026-09-02T00:11:42Z" 를 쓴다. 날짜만 잘라 통일한다 —
  // 안 자르면 daysAgo 의 Date.parse 가 어긋나 멀쩡한 수집이 "지연"으로 뜬다.
  field: (file, ...names) => () => {
    const j = readJSON(file);
    for (const n of names) if (j[n]) return String(j[n]).slice(0, 10);
    return null;
  },
  archiveDir: (dir) => () => {
    if (!fs.existsSync(R(dir))) return null;
    const days = fs.readdirSync(R(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    return days.length ? days[days.length - 1].slice(0, -5) : null;
  },
  // 시계열 배열의 마지막 날짜. 배열 위치가 파일마다 달라 접근자를 받는다.
  tail: (file, get) => () => {
    const arr = get(readJSON(file));
    if (!Array.isArray(arr) || !arr.length) return null;
    const last = arr[arr.length - 1];
    return String(last.d || last.date || last.week || "").slice(0, 10) || null;
  },
  // 원장(sets 아래 관측점 배열)의 가장 늦은 관측일 — 2026-09-30 신설. 점에 seen(그 값을 마지막으로 본 수집일)이
  // 있으면 그것, 없으면 d. 등급 행이 원장 대신 파생 파일의 빌드 날짜를 읽다가 수집이 죽은 걸 못 봤다(아래 grading).
  observed: (file) => () => {
    let best = null;
    (function walk(o) {
      if (Array.isArray(o)) { for (const p of o) { const d = p && (p.seen || p.d); if (d && (!best || d > best)) best = d; } }
      else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v);
    })(readJSON(file).sets);
    return best;
  },
  // 한 작업이 원장 여럿을 채우는 행 — 가장 늦게 멈춘 원장의 날짜가 그 행의 날짜다. 하나만 빠져도 보이게.
  earliest: (...gets) => () => {
    const ds = gets.map((g) => g());
    return ds.some((d) => !d) ? null : ds.sort()[0];
  },
  // 박스 원장은 판매일이 세트×판별로 흩어져 있다 — 전부 훑어 가장 최근 판매일을 찾는다.
  boxLedger: (file) => () => {
    const L = readJSON(file);
    let best = null;
    for (const set of Object.values(L.sets || {})) {
      for (const ed of ["jp", "en"]) {
        const arr = set[ed] && (Array.isArray(set[ed]) ? set[ed] : set[ed].sales);
        if (!Array.isArray(arr)) continue;
        for (const r of arr) {
          const d = r.date || r.d;
          if (d && (!best || d > best)) best = d;
        }
      }
    }
    return best;
  },
  // 카드/세트 단위로 흩어진 갱신일 — packs.json 안을 훑어 가장 늦은 날. (유유테이 NM 은 아래 nmOldest — 가장 이른 날)
  packsField: (kind) => () => {
    const j = readJSON("data/onepiece-packs.json");
    let best = null;
    const take = (v) => { const d = v && String(v).slice(0, 10); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && (!best || d > best)) best = d; };
    for (const set of Object.values(j.sets || {})) {
      // boxMarket 은 판별(jp/en) × 종류(ebayActive/ebaySold) 네 군데에 각자 updated 를 들고 있다.
      for (const ed of ["jp", "en"]) {
        const bm = set.boxMarket && set.boxMarket[ed];
        if (!bm) continue;
        if (kind === "box") take(bm.ebayActive && bm.ebayActive.updated);
        if (kind === "boxsold") take(bm.ebaySold && bm.ebaySold.updated);
      }
      if (kind === "psafull") { take(set.psaFull && set.psaFull.updated); take(set.psaFullEn && set.psaFullEn.updated); }
      if (kind === "psaweeklyset") take(set.psaWeekly && set.psaWeekly.updated);
      if (kind === "boxseries") { for (const key of ["boxSeries", "boxSeriesEn", "boxSeriesEbay", "boxSeriesEnEbay"]) take(set[key] && set[key].updated); }
      for (const c of Object.values(set.cards || {})) {
        if (kind === "psa10active") take(c.psa10Active && c.psa10Active.updated);
        if (kind === "psa10sold") take(c.psa10Ebay && c.psa10Ebay.updated);
        if (kind === "graderpop") for (const g of Object.values(c.graderPop || {})) for (const ed of Object.values(g || {})) take(ed && ed.d);
      }
    }
    return best;
  },
  // 유유테이 NM — 화면에 나가는 카드 NM(nmUsable) 중 **가장 오래전에 읽은 날**. 하나만 밀려도 보이게(earliest 와 같은 원칙) — 2026-11-05.
  //   종전엔 packsField("nm") 의 최댓값이라, 11-02 에 EB-05 11장만 새로 읽자 나머지 183장이 10-21(15일)인데도 "3일 정상"이었고
  //   점수판 C8 도 이 행을 그대로 읽어 OK 였다. 카드는 세트마다 따로 읽히므로 새 세트 하나만 갱신해도 전체가 가려진다.
  //   읽은 날이 없는 카드·숨김 카드는 화면에 안 나가므로 빼고(점수판 D1 이 따로 센다), 가드 NMF1(test-collect-status.js)이 지킨다.
  // PSA 세트 누적도 같은 원칙 — 일본판·영문판 총량 중 가장 낡은 날(2026-11-12). 팝 리포트 대체가 검사에 걸린 세트는 옛 값에
  //   머무는데, 최댓값으로 재면 나머지가 가려 "정상"으로 뜬다(재검증 지적).
  psaFullOldest: () => {
    let worst = null;
    for (const set of Object.values(readJSON("data/onepiece-packs.json").sets || {})) {
      for (const pf of [set.psaFull, set.psaFullEn]) {
        const d = pf && String(pf.updated || "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!worst || d < worst)) worst = d;
      }
    }
    return worst;
  },
  nmOldest: () => {
    let worst = null;
    for (const set of Object.values(readJSON("data/onepiece-packs.json").sets || {})) {
      for (const c of Object.values(set.cards || {})) if (nmUsable(c) && (!worst || c.nmUpdated < worst)) worst = c.nmUpdated;
    }
    return worst;
  },
};

// ── 수집원 목록 ────────────────────────────────────────────────
// file = 이 수집원이 소유한 data/ 파일들(전수 스캔에서 "추적됨"으로 처리할 대상).
// warn/late = 며칠 지나면 지연/늦음. 자동 수집은 주기의 2~3배를 넘으면 사고다.
// how = 수동 수집의 실행 절차(사람이 그대로 따라할 수 있게).
const SOURCES = [
  // ── 자동 (GitHub Actions) ──
  { key: "op-auction", name: "원피스 경매 정산", mode: "auto", every: "90분마다", wf: "settle-auctions",
    warn: 1, late: 2, get: pick.archiveDir("data/auction-archive"),
    files: ["auction-archive", "auction-sold.json", "auction-card-stats.json", "auction-series.json", "auction-stats.json"] },
  { key: "op-market", name: "원피스 경매 시장 스캔", mode: "auto", every: "3시간마다", wf: "collect-auction-market",
    warn: 1, late: 2, get: pick.field("data/auction-market.json", "updated"),
    files: ["auction-market.json", "auction-watch.json", "auction-deals.json", "auction-findings.json"] },
  { key: "tcg", name: "TCG 경매(게임별)", mode: "auto", every: "6시간(스냅샷 1일 1회)", wf: "collect-tcg",
    warn: 1, late: 2, get: pick.archiveDir("data/tcg-archive"),
    files: ["tcg-archive", "tcg-snapshot.json", "tcg-series.json", "tcg-watch.json"] },
  { key: "active", name: "진행 중 매물 관측", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, get: pick.field("data/active-listing-audit.json", "updated"),
    files: ["active-listing-audit.json", "supply-series.json", "listing-ids.json", "price-quality-audit.json",
            "set-auction-stats.json", "psa10-mismatch-audit.json"] },
  { key: "psa10-active", name: "PSA10 진행매물 시세", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, get: pick.packsField("psa10active"), files: [] },
  // 발매 전 세트(EB-05·OP-18 …) 예약판매 박스 호가 — 2026-10-08 신설(collect-preorder-prices.js, 같은 워크플로).
  { key: "preorder", name: "예약판매 박스 호가(발매 전 세트)", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, get: pick.field("data/preorder-series.json", "updated"), files: ["preorder-series.json"] },
  { key: "fx", name: "환율", mode: "auto", every: "평일 05:10 KST(화~토)", wf: "update-fx",
    warn: 2, late: 3, businessDays: true, get: pick.field("data/fx.json", "date", "updated"), files: ["fx.json", "fx-history.json"] },
  // collect-grading.yml(월 01:30 UTC)이 만드는 건 CGC 카드별 원장 하나다(공개 API). 2026-09-30 정정: 전엔 이 행이
  // grading-series.json 의 updated — update-market-data 가 수집 성패와 무관하게 매주 찍는 빌드 날짜 — 를 읽어서,
  // 자동 CGC 가 9/3 이후 한 번도 커밋하지 못했는데도 "정상"이었다. 원장의 실제 관측일을 본다.
  { key: "grading", name: "CGC 카드별 등급 인구(공개 API)", mode: "auto", every: "매주 월요일", wf: "collect-grading",
    warn: 8, late: 12, get: pick.observed("data/cgc-card-pop.json"), files: ["cgc-card-pop.json"] },
  // CGC 는 세트·카드별 모두 공개 API 자동 수집이다(2026-09-30 이관 — 세트 총량 브라우저 수집은 없앴다). 카드별은 위 grading 행.
  // 세트 최신일은 누적 관측일과 분리값(gradesThrough) 중 이른 쪽: 분리값은 8/3 에 멈춘 채 아무 목록에도 안 걸렸던 바로 그 값이다.
  { key: "cgc-pop", name: "CGC 세트 누적+분리(박스별)", mode: "auto", every: "매주 월요일", wf: "collect-grading",
    warn: 8, late: 12, get: pick.earliest(pick.observed("data/cgc-grading-history.json"), pick.field("data/cgc-grading-history.json", "gradesThrough")),
    files: ["cgc-grading-history.json"] },
  { key: "social", name: "주간 소셜 카드 스냅샷", mode: "auto", every: "매주 일요일", wf: "generate-weekly-social-assets",
    warn: 8, late: 12, get: pick.tail("data/social-card-price-snapshots.json", (j) => j.snapshots),
    files: ["social-card-price-snapshots.json"] },

  // 2026-10-14 packs.json 의 card.series 에서 data/card-series.json 으로 분리(방문자 페이로드 상한 T2).
  { key: "card-series", name: "카드별 시세 시계열", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, get: pick.field("data/card-series.json", "updated"), files: ["card-series.json"] },
  { key: "box-series", name: "박스 시세 시계열(JP/EN×호가/실거래)", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, get: pick.packsField("boxseries"), files: [] },
  // 반다이 공식 카드리스트(JP·EN) — 2026-10-14 신설(W7, fetch-official-cardlist.js). 상품마다 마지막으로 받은 날(checked) 중
  // 가장 이른 날 — 한 상품만 계속 실패해도(직전 값 유지) 여기서 늦음으로 보인다.
  { key: "official-cardlist", name: "반다이 공식 카드리스트(JP·EN)", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, files: ["official-cardlist.json"],
    get: () => {
      const j = readJSON("data/official-cardlist.json");
      const ds = ["jp", "en"].flatMap((l) => Object.values((j[l] && j[l].products) || {}).map((p) => p.checked)).filter(Boolean).sort();
      return ds[0] || null;
    } },
  // 반다이 상품 페이지 확인(발매 전 세트 JP·EN + 카드리스트 공개 여부) — 2026-10-19 신설(check-bandai-product-pages.js). 기준일 = 마지막 시도일(updated).
  //   발매 전 세트가 없으면 파일은 그대로 남고 updated 만 오른다. 확인 성공일(lastOkOn)은 페이지·가드 BD1 이 본다.
  { key: "bandai-product-check", name: "반다이 상품 페이지 확인(발매 전 세트)", mode: "auto", every: "매일 03:00 KST", wf: "update-active-listings",
    warn: 2, late: 3, files: ["bandai-product-check.json"],
    get: () => readJSON("data/bandai-product-check.json").updated || null },

  // ── 수동 (실브라우저 필요) ──
  { key: "box", name: "박스 판매(BIN) 원장", mode: "manual", every: "주 3회(월·수·금)",
    warn: 3, late: 5, get: pick.boxLedger("data/box-sold-ledger.json"),
    files: ["box-sold-ledger.json", "box-sold-series.json"],
    how: "node tools/box-sold-urls.js --setup → 브라우저에 붙여넣고 window.__runAll() → 가끔 __progress() → 끝나면 __opPost() → node tools/box-sold-ingest.js <덤프> → node tools/build-box-sold-series.js",
    note: "eBay 가 sold 검색을 API 로 막아 실브라우저로만 된다. **empties 가 0인지 반드시 확인** — 빈 응답을 '판매 없음'으로 삼킨 사고가 있었다(2026-09-02, 83페이지)." },
  // 주기 2~3개월 → 10일. 2026-09-02 소유자 지시("10일에 1회로 바꿔").
  { key: "nm", name: "유유테이 NM 시세(일본판 단품)", mode: "manual", every: "10일마다",
    warn: 10, late: 14, get: pick.nmOldest, files: [],
    how: "node tools/update-yuyutei-nm-prices.js (로컬 — 러너 IP 는 403) → 출력의 [수동검토 필요]·[큰 변동]·[파서 확인] 줄 확인 → packs.json 의 card.nmJpy/nmUpdated 갱신",
    note: "변형(패러렐·망가 등)별로 매칭해야 한다 — 번호만 보고 붙이면 값이 통째로 틀어진다." },
  // 수동으로 잘못 분류했었다(2026-09-02 정정) — update-ebay-pack-prices.js 는 eBay API 만 쓰고
  // update-active-listings·update-market-data 워크플로가 이미 돌린다. 사람이 할 일이 없다.
  { key: "boxmarket", name: "박스 진행매물 시세(JP/EN)", mode: "auto", every: "매일 03:00 KST",
    wf: "update-active-listings", warn: 2, late: 3, get: pick.packsField("box"), files: [] },
  { key: "psa-pop", name: "PSA 카드별 등급 인구", mode: "manual", every: "주 1회(월)",
    warn: 8, late: 14, get: pick.field("data/psa-card-pop.json", "updated"), files: ["psa-card-pop.json"],
    how: "브라우저로 GemRate 카드별 수집 → node tools/collect-psa-card-pop.js" },
  // PSA 세트 주간 — 2026-09-30 수동으로 정정(전엔 auto·update-market-data). 그 워크플로의 GemRate 단계는 러너 IP 가
  // 막혀 매주 실패한다(continue-on-error — 워크플로 주석: "PSA 는 어차피 매주 월요일에 사람이 로컬에서"). 아래 원장들을 Actions 가
  // 커밋한 적이 한 번도 없고 전부 월요일 로컬 수집이었다. auto 로 두면 밀려도 "지금 할 일"에 안 뜬다.
  { key: "psa-weekly", name: "PSA 세트 주간 등급량", mode: "manual", every: "주 1회(월)",
    warn: 8, late: 14,
    // 주간 그래프가 실제로 어디까지 찼나로 잰다(weeklyThrough·판별 주간 마지막 수요일) — 2026-11-12. 세트 누적(collectedAt)은
    // 추이가 멈추면 팝 리포트로 최신화돼 "정상"으로 보이는데, 주간 증가분은 그동안 한 점도 안 는다. 누적 신선도는 아래 psa-full 행이 본다.
    get: pick.earliest(pick.field("data/gemrate-psa-history.json", "weeklyThrough"), pick.field("data/psa-edition-weekly.json", "updated")),
    files: ["gemrate-psa-history.json", "gemrate-psa-en-totals.json", "psa-edition-weekly.json", "psa-population-snapshots.json"],
    how: "9346 크롬으로 box-sold-cdp/psa-nav-run.js(카드별 팝 리포트)·psa-trend-run.js(세트 추이) 덤프를 받는다(tools/MONDAY-GRADING.md 1번) → node tools/psa-trend-ingest.js <추이 덤프> <카드별 팝 덤프> → node tools/psa-edition-weekly-ingest.js <추이 덤프> → node tools/import-gemrate-psa-history.js → node tools/import-gemrate-en-totals.js → node tools/inject-psa-wow.js",
    note: "psa-edition-weekly-ingest 는 덤프의 마지막 수요일 한 주만 넣는다 — 두 주 밀렸으면 판별 주간이 한 주 빈다(2026-09-28 복구 때 9/16 주가 빠졌다)." },
  { key: "psa-full", name: "PSA 전체 인구(세트별)", mode: "manual", every: "주 1회(월)",
    warn: 8, late: 14, get: pick.psaFullOldest, files: [],
    how: "psa-weekly 와 같은 작업 — import-gemrate-psa-history.js·import-gemrate-en-totals.js 가 packs.json 의 psaFull·psaFullEn 을 갱신한다" },
  { key: "tag-pop", name: "TAG 등급 인구(박스+카드별)", mode: "manual", every: "주 1회(월)",
    warn: 8, late: 14, get: pick.earliest(pick.observed("data/tag-card-pop.json"), pick.observed("data/tag-grading-history.json")),
    files: ["tag-card-pop.json", "tag-grading-history.json"],
    how: "브라우저로 TAG 팝리포트(node tools/tag-pop.js --setup → __tagYear 연도별 → __tagAgg) → node tools/tag-pop-ingest.js(10/10P 분리 포함) + node tools/tag-card-pop-ingest.js" },
  { key: "psa10-sold", name: "PSA10 실거래(sold) 시세", mode: "manual", every: "월 1회",
    warn: 35, late: 60, get: pick.packsField("psa10sold"), files: [],
    how: "node tools/psa10-sold-refresh.js → 브라우저 수집 → node tools/psa10-sold-write.js",
    note: "변형(레드망가↔망가 등) 분리 필수 — 번호만 매칭하면 값이 통째로 틀어진다." },
  { key: "graderpop-card", name: "카드별 등급인구(PSA/CGC/TAG)", mode: "manual", every: "주 1회(월)",
    warn: 8, late: 14, get: pick.packsField("graderpop"), files: [],
    how: "psa-pop·tag-pop 수동 수집(과 CGC 자동 수집)이 packs.json 의 card.graderPop 에 반영된다(같은 작업)" },
];

// 시계열이 아니거나(설정·파생) 수집과 무관한 파일. **이유를 반드시 적는다** — 빈 무시는 곧 빠짐이다.
const IGNORE = {
  "onepiece-packs.json": "모든 수집의 종착지(세트·카드 마스터). 개별 수집원이 이 안의 자기 필드를 갱신한다",
  "products.json": "제휴 상품 목록(수동 편집, 시계열 아님)",
  "set-facts.json": "세트 발매일·구성 등 고정 사실(수동 편집)",
  "set-commentary.json": "세트 해설 문구(수동 편집)",
  "known-gaps.json": "수집 공백 기록부(audit-series-gaps.js 가 씀, 수집원 아님)",
  // 2026-10-14: 원장 행에 seen 이 없던 시절(10/14 전) TCG 표본일 보정. 수집이 아니라 git 이력에서 다시 굽는 고정 파일이다.
  "tcg-archive-seen.json": "파생 — build-tcg-archive-seen.js 가 tcg-watch 의 git 이력에서 굽는 tcg-archive 표본일 보정(재실행 가능, 수집원 아님)",
  // 2026-09-30: 이 파일의 updated 를 등급 수집의 신선도로 읽다가 CGC 자동 수집이 죽은 걸 못 봤다. 원장 행들이 관측일로 본다.
  "grading-series.json": "파생 — build-grading-series.js 가 PSA·CGC·TAG 원장에서 다시 굽는다. updated 는 빌드 날짜라 수집 신선도가 아니다",
  "official-card-images.json": "공식 이미지 URL 목록(수동)",
  "jp-image-verdicts.json": "이미지 판정 결과(파생)",
  "priority-set-seo.json": "SEO 우선순위 설정(수동)",
  "upcoming-set-pages.json": "발매 예정 세트 설정(수동)",
  // 2026-10-14(W9): 사이트맵 lastmod 를 "본문이 바뀐 날"로만 정하려고 남기는 페이지별 본문 해시·날짜. 수집이 아니라 생성 사슬의 부산물.
  "sitemap-lastmod-state.json": "파생 — sync-sitemap-lastmod.js 가 쓰는 URL별 본문 해시·마지막 변경일(사이트맵 날짜 원천, 수집원 아님)",
  "pull-rate-research-op01-jp.json": "OP-01 봉입률 1회성 조사(고정)",
  // 2026-06-29 에 한 번 돌린 감사 기록. 지금은 아무 스크립트도 쓰지 않는다(세부보기가 65일 정지로 찾아냈다).
  // 수집 고장이 아니라 잔재 — 지우지는 않는다(그때 무엇을 고쳤는지 남은 유일한 근거).
  "psa10-sold-audit.json": "2026-06-29 1회성 감사 기록(현재 미사용, 이력 보존용)",
  // 2026-11-05 소유자 결정("팰월드만 수집했던 건 그냥 멈추자")으로 팰월드 전용 수집(경매 관측·정산, 박스 sold)을 지웠다.
  // 원장은 append-only 라 지우지 않고 동결한다 — 수집원이 아니므로 신선도를 보지 않는다(가드 PW1). 팰월드는 tcg 행(13종 묶음)이 계속 본다.
  "palworld-auction-archive": "동결 — 팰월드 전용 경매 정산 원장(2026-08-19~11-05, 수집 중단·append-only 보존)",
  "palworld-auction-market.json": "동결 — 팰월드 전용 경매 관측(2026-08-19~11-05, 수집 중단·보존)",
  "palworld-auction-sold.json": "동결 — 팰월드 전용 낙찰 일별 집계(2026-08-19~11-05, 수집 중단·보존)",
  "palworld-auction-watch.json": "동결 — 팰월드 전용 정산 감시목록(수집 중단, 남은 대기는 정산하지 않는다·예산도 안 잡는다)",
  "palworld-sold-ledger.json": "동결 — 팰월드 박스 sold 원장(2026-08-17~11-05, 수집 중단·append-only 보존)",
};

const rows = SOURCES.map((s) => {
  let last = null, err = null;
  try { last = s.get(); } catch (e) { err = String(e.message || e).slice(0, 70); }
  const age = s.businessDays ? businessDaysAgo(last) : daysAgo(last);
  const state = err ? "오류" : age == null ? "없음" : age >= s.late ? "늦음" : age >= s.warn ? "지연" : "정상";
  return { ...s, last, age, state, err };
});

// ── 빠짐 검출: data/ 전수 스캔 ────────────────────────────────
// 목록에도 없고 무시 사유도 없는 축적 파일 = 우리가 모르는 사이 쌓이고 있는 데이터.
// ⚠️ packs.json 안에도 수집이 산다(유유테이 NM·PSA10 sold·등급인구·시세 시계열…).
//    파일 스캔만으로는 이게 안 잡혀 실제로 두 번 빠뜨렸다(2026-09-02: nmUpdated, psa10Ebay).
//    그래서 packs.json 을 재귀로 훑어 "날짜값을 가진 필드 경로"를 전수로 뽑고,
//    아래 PACKS_TRACKED 에 없는 경로가 나오면 UNTRACKED 로 고발한다. 새 필드가 생기면 바로 튀어나온다.
// ⚠️ 여기 정규식은 반드시 `\.`(점 이스케이프)로 쓴다. 그냥 `.` 로 두면 아무 문자나 매칭해
//    새 수집 필드를 조용히 통과시킨다 — 그물이 있는 척하면서 실제론 아무것도 안 거른다.
//    2026-09-02 실제로 이 실수로 그물이 통째로 무력화됐다(가짜 필드 시험에서 발각).
//    tools/test-collect-status.js 가 매번 이 그물을 시험한다.
const PACKS_TRACKED = [
  /\.nmUpdated$/,                                          // 유유테이 NM (수동)
  /\.psa10Active\.updated$/,                               // PSA10 진행매물 (자동)
  /\.psa10Ebay\.updated$/,                                 // PSA10 실거래 (수동)
  /\.graderPop\..+\.d$/,                                   // 카드별 등급인구 (수동)
  /\.boxMarket\.(jp|en)\.ebay(Active|Sold)\.updated$/,     // 박스 시세 (자동/수동)
  /\.boxSeries(En|Ebay|EnEbay)?\.updated$/,                // 박스 시세 시계열 (자동)
  /\.boxSeries(En|Ebay|EnEbay)?\.points\.\d+\.d$/,
  /\.psaWeekly\.(updated|points\.\d+\.d|corrections\.\d+\.date)$/, // PSA 주간 (자동)
  /\.psaFull(En)?\.updated$/,                              // PSA 전체 인구 (자동)
  /\.psaWow\.(from|to)$/,                                  // 주간 증감 표시용(파생)
  /\.graders\.(cgc|tag)\.(jp|en)\.(from|to)$/,             // 등급사 관측창(파생)
  /\.englishNmEbay\.updated$/,                             // 영문판 NM 시세 (자동)
  /^\.marketIndex\.meter\./,                               // 개봉 미터 주간 (자동)
  /^\.marketIndex\.board\.\d+\.(nowDate|changeBasis)$/,    // 지수 보드 기준일(파생)
  /^\.marketIndex\.updated$/,
  /\.release(Ja)?$/,                                       // 세트 발매일(고정 사실)
  /^\.marketIndex\.reprints\./,                            // 재판 기록(수동 편집)
  /^\.fx\.date$/,                                          // 화면용 환율 복사본(fx.json 이 원본)
  /^\.updated$/,                                           // packs.json 자체 갱신일
];
function scanPacks() {
  let j; try { j = readJSON("data/onepiece-packs.json"); } catch { return []; }
  const seen = new Set();
  (function walk(o, p) {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        seen.add((p + "." + k).replace(/^\.sets\.[^.]+/, "").replace(/\.cards\.[^.]+/, ".cards.*").replace(/\.bySet\.[^.]+/, ".bySet.*"));
      } else if (typeof v === "object") walk(v, p + "." + k);
    }
  })(j, "");
  return [...seen].filter((p) => !PACKS_TRACKED.some((re) => re.test(p))).sort();
}
const packsUntracked = scanPacks();

const tracked = new Set(SOURCES.flatMap((s) => s.files || []));
const untracked = [];
for (const f of fs.readdirSync(R("data"))) {
  if (tracked.has(f) || IGNORE[f]) continue;
  const full = R(path.join("data", f));
  const isDir = fs.statSync(full).isDirectory();
  if (!isDir && !f.endsWith(".json")) continue;
  // 날짜 문자열이 5개 이상이면 시계열(축적)로 본다 — 놓치면 영구 손실이라 반드시 고발한다.
  let dates = 0;
  try {
    dates = isDir ? fs.readdirSync(full).length
      : (fs.readFileSync(full, "utf8").slice(0, 200000).match(/"\d{4}-\d{2}-\d{2}"/g) || []).length;
  } catch { /* 읽기 실패도 고발 대상 */ }
  if (dates >= 5) untracked.push(f);
}

// ── 묶인 파일을 각각 본다 — 2026-09-02 소유자 지적("원피스·TCG 세분화된 수집은 왜 빼냐").
//    한 수집원이 파일 여럿을 낳는다(경매 정산 → 원장·낙찰집계·카드별통계·시계열·종류별).
//    대표 파일 하나만 보면, 원장은 도는데 카드별 통계가 멈춰도 화면엔 "정상"이 뜬다.
//    그래서 파일마다 수정시각을 재고, 대표보다 눈에 띄게 뒤처지면 그 파일을 따로 고발한다.
//    (mtime 을 쓰는 이유: 파일마다 내부 날짜 필드 이름이 제각각이라 통일해 읽을 수 없다.
//     커밋으로 내려받아도 mtime 은 갱신되므로 "언제 마지막으로 바뀌었나"는 정확하다.)
const fileAgeDays = (rel) => {
  const full = R(path.join("data", rel));
  if (!fs.existsSync(full)) return null;
  let t = fs.statSync(full).mtimeMs;
  if (fs.statSync(full).isDirectory()) {
    // 디렉터리는 자기 mtime 이 아니라 가장 최근 파일을 본다.
    for (const f of fs.readdirSync(full)) {
      const s = fs.statSync(path.join(full, f));
      if (s.mtimeMs > t) t = s.mtimeMs;
    }
  }
  return Math.floor((Date.now() - t) / 86400000);
};
const staleParts = [];
for (const s of SOURCES) {
  for (const f of s.files || []) {
    const age = fileAgeDays(f);
    if (age == null) { staleParts.push({ source: s.name, file: f, age: null, why: "파일 없음" }); continue; }
    // 그 수집원의 주기 기준(late)을 넘게 안 바뀌었으면 이 파일만 멈춘 것이다.
    if (age >= s.late) staleParts.push({ source: s.name, file: f, age, why: `${age}일째 안 바뀜` });
  }
}

// ── 날짜 빈칸 — 2026-09-02 소유자 지시("하루라도 빈칸 안 생기게 관리해").
//    "최신인가"와 "중간이 안 비었나"는 다른 질문이다. 어제 것이 있어도 그 앞 사흘이 비었을 수 있다.
//    실거래·경매 관측은 소급 수집이 안 되므로, 빈칸은 생긴 다음 날 보여야 의미가 있다.
//    audit-series-gaps.js 가 그 검사를 이미 한다 — 여기서 불러 한 화면에 합친다.
let gaps = [];
try {
  const out = require("node:child_process").execFileSync(
    process.execPath, [path.join(__dirname, "audit-series-gaps.js")],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, cwd: ROOT }
  );
  gaps = (JSON.parse(out).problems || []);
} catch (e) {
  // 검사가 죽었으면 그것도 알아야 한다 — 조용히 "빈칸 없음"으로 넘기면 안 된다.
  // (문제를 찾으면 exit 1 을 내므로 stdout 이 실려 온다. 그건 정상 경로다.)
  try { gaps = JSON.parse(String(e.stdout || "")).problems || []; }
  catch { gaps = ["빈칸 검사 실패: " + String(e.message || e).slice(0, 100)]; }
}

const todo = rows.filter((r) => r.mode === "manual" && r.state !== "정상");
const autoBroken = rows.filter((r) => r.mode === "auto" && (r.state === "늦음" || r.state === "오류" || r.state === "없음"));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    today, todo: todo.map((r) => r.key), autoBroken: autoBroken.map((r) => r.key), gaps, untracked, packsUntracked, staleParts,
    rows: rows.map(({ get, ...r }) => r),
  }, null, 1));
  process.exit(0);
}

// 콘솔 출력. 윈도우 cp949 라 이모지를 쓰지 않는다.
const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - w(s)));
const out = [`수집 현황 — ${today}   (자동 ${rows.filter((r) => r.mode === "auto").length} · 수동 ${rows.filter((r) => r.mode === "manual").length})`, ""];
// --detail 을 주면 한 수집원이 낳는 파일까지 펼친다. 묶여 보이면 그 안이 멈춰도 모른다.
const DETAIL = process.argv.includes("--detail");
const line = (r) => {
  out.push(`  ${pad(r.name, 34)} ${pad(r.state, 6)} ${pad(r.last || "-", 12)} ${r.every}`);
  if (!DETAIL) return;
  for (const f of r.files || []) {
    const age = fileAgeDays(f);
    out.push(`      · ${pad(f, 34)} ${age == null ? "파일 없음" : age === 0 ? "오늘" : age + "일 전"}`);
  }
};
out.push("[자동] GitHub Actions 가 돌린다. 사람이 할 일 없음.");
for (const r of rows.filter((x) => x.mode === "auto")) line(r);
out.push("");
out.push("[수동] 실브라우저가 필요하다 — 사람이 시켜야 돈다.");
for (const r of rows.filter((x) => x.mode === "manual")) line(r);
out.push("");
if (gaps.length) {
  out.push("!! 날짜 빈칸 — 소급 수집이 안 되는 계열은 지금 못 채우면 영영 빈다:");
  for (const g of gaps) out.push("   " + g);
  out.push("");
}
if (staleParts.length) {
  out.push("!! 묶인 파일 중 멈춘 것 — 수집원은 도는데 이 산출물만 안 바뀐다:");
  for (const p of staleParts) out.push(`   ${p.source} → data/${p.file} (${p.why})`);
  out.push("");
}
if (packsUntracked.length) {
  out.push("!! packs.json 안에 목록에 없는 날짜 필드 — 새 수집이면 SOURCES 에, 아니면 PACKS_TRACKED 에 등록할 것:");
  for (const p of packsUntracked.slice(0, 12)) out.push("   packs" + p);
  if (packsUntracked.length > 12) out.push("   ...외 " + (packsUntracked.length - 12) + "개");
  out.push("");
}
if (untracked.length) {
  out.push("!! 목록에 없는 축적 데이터 — SOURCES 에 등록하거나 IGNORE 에 이유를 적을 것:");
  for (const f of untracked) out.push(`   data/${f}`);
  out.push("");
}
if (autoBroken.length) {
  out.push("!! 자동인데 멈춤 — 워크플로 로그를 볼 것:");
  for (const r of autoBroken) out.push(`   ${r.name}: ${r.age == null ? "기록 없음" : r.age + "일째"} (${r.wf})`);
  out.push("");
}
if (todo.length) {
  out.push("== 지금 할 일 ==");
  for (const r of todo) {
    out.push(`  ${r.name} — ${r.age == null ? "기록 없음" : r.age + "일째"}`);
    out.push(`    ${r.how}`);
    if (r.note) out.push(`    주의: ${r.note}`);
  }
} else if (!gaps.length && !autoBroken.length && !staleParts.length) {
  out.push("== 지금 할 일 없음 — 수집 22종 최신 · 날짜 빈칸 없음 ==");
} else {
  out.push("== 수동 수집은 전부 최신이다(위의 경고는 사람이 브라우저로 고칠 수 있는 게 아니다) ==");
}
console.log(out.join("\n"));
