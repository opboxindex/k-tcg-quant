#!/usr/bin/env node
// 수집 건강검진 — 2026-08-07 신설.
//
// 왜 만드나: 워크플로가 **성공했다고 보고하면서 아무것도 안 모으는** 경우가 실제로 있었다.
// 2026-08-05 에 PSA 주간 수집이 2주 동안 조용히 죽어 있었다(중간 단계가 exit 1 을 냈는데
// continue-on-error 로 덮여 뒤 단계가 통째로 건너뛰어졌다). 우연히 발견했다.
// 경매·시계열은 소급 수집이 안 되므로, 그 2주가 영원한 구멍으로 남는다.
//
// 그래서 "실행이 실패했는가"가 아니라 **"데이터가 늙지 않았는가"**를 본다.
// 워크플로가 뭐라고 보고하든, 파일이 어제 것이 아니면 그게 사고다.
//
// 종료 코드: 문제가 하나라도 있으면 1. 워크플로에서 이걸 실패로 잡으면 알림이 간다.
// Run: node tools/audit-collection-health.js [--json]
const fs = require("node:fs");
const path = require("node:path");
// 카드별 인구 파일의 계열 키 "번호|tier" 는 세 적재기가 전부 ourTier(카드명)로 만든다 — 감사도 같은 함수를 쓴다(2026-09-16).
const { ourTier } = require("./cgc-card-pop-ingest.js");

const ROOT = path.resolve(__dirname, "..");
const R = (p) => path.join(ROOT, p);
const has = (p) => fs.existsSync(R(p));
const readJSON = (p) => JSON.parse(fs.readFileSync(R(p), "utf8"));

// UTC 기준 오늘. 수집기가 전부 UTC 날짜로 파일을 쓰므로 여기서도 UTC 로 센다.
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (d) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const ok = (m) => notes.push(m);

// ── 1. 원피스 경매 원장 — 하루 한 파일. 이틀 넘게 안 늘면 수집이 멈춘 것이다.
{
  const dir = "data/auction-archive";
  if (!has(dir)) fail("원피스 경매 원장 폴더가 없다");
  else {
    const files = fs.readdirSync(R(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    if (!files.length) fail("원피스 경매 원장이 비었다");
    else {
      const last = files[files.length - 1].slice(0, 10);
      const age = daysAgo(last);
      // 어제까지는 정상(오늘 자정 이후 아직 안 돌았을 수 있다). 이틀 넘으면 사고.
      if (age > 1) fail(`원피스 경매 원장이 ${age}일째 안 늘었다 (마지막 ${last})`);
      else ok(`원피스 원장 최신 ${last}`);
      // 마지막 며칠이 정상 규모인지 — 파일은 생기는데 내용이 비는 실패가 제일 찾기 어렵다.
      const recent = files.slice(-3);
      for (const f of recent) {
        const n = (readJSON(`${dir}/${f}`).sales || []).length;
        const d = f.slice(0, 10);
        if (daysAgo(d) >= 1 && n < 100) fail(`원피스 ${d} 수집량 ${n}건 — 정상일은 500건 이상이다`);
      }
    }
  }
}

// ── 2. TCG 스냅샷 — 하루 한 줄.
if (has("data/tcg-snapshot.json")) {
  const S = readJSON("data/tcg-snapshot.json");
  const pts = S.points || [];
  if (!pts.length) fail("TCG 스냅샷이 비었다");
  else {
    const last = pts[pts.length - 1];
    const age = daysAgo(last.d);
    if (age > 1) fail(`TCG 스냅샷이 ${age}일째 안 늘었다 (마지막 ${last.d})`);
    else ok(`TCG 스냅샷 최신 ${last.d}`);
    // 게임이 통째로 0 이 되면 검색어가 죽었거나 eBay 응답이 바뀐 것이다.
    const dead = (last.games || []).filter((g) => !g.live);
    if (dead.length) fail(`TCG 스냅샷에서 물량 0 인 게임: ${dead.map((g) => g.k).join(", ")} — 검색어 확인 필요`);
    const expected = Object.keys(S.terms || {}).length;
    if (expected && (last.games || []).length !== expected) {
      fail(`TCG 스냅샷 게임 수 불일치: ${last.games.length} vs 등록 ${expected}`);
    }
  }
}

// ── 3. TCG 정산 — 감시 목록이 계속 불어나면 처리량이 유입량을 못 따라가는 것이다.
//    밀린 건은 종료 후 30시간이 지나면 조회가 안 되고, 그대로 영원한 빈칸이 된다.
if (has("data/tcg-watch.json")) {
  const W = readJSON("data/tcg-watch.json");
  const pending = W.pending || [];
  const now = Date.now();
  const overdue = pending.filter((p) => Date.parse(p.end) < now - 30 * 3600 * 1000);
  if (overdue.length > 50) fail(`TCG 감시 목록에 시한 넘긴 건이 ${overdue.length}건 — 정산이 밀리고 있다`);
  // 대기 건수 자체는 위험 신호가 아니다 — 아직 종료 전인 경매가 대부분이고, 감시량을 늘리면 당연히 는다.
  // 진짜 위험은 위의 overdue(종료 후 30시간을 넘겨 조회가 막힌 건)다. 그건 영원한 빈칸이 된다.
  // 2026-08-20: 감시를 게임당 100 → 200 으로 올리며 상한을 6,000 → 12,000 으로 맞췄다.
  // (실측: 6,878건 대기 중 종료된 건 12건, 30시간 넘김 0건 — 밀린 게 아니라 대기 중이었다.)
  if (pending.length > 12000) fail(`TCG 감시 목록이 ${pending.length}건까지 불었다 — 유입 대비 처리량 부족`);
  else ok(`TCG 감시 대기 ${pending.length}건`);
}

// ── 4. TCG 정산 원장 — 스냅샷은 도는데 정산이 안 되면 낙찰률이 영영 안 나온다.
if (has("data/tcg-archive")) {
  const files = fs.readdirSync(R("data/tcg-archive")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) fail("TCG 정산 원장이 비었다");
  else {
    const last = files[files.length - 1].slice(0, 10);
    const age = daysAgo(last);
    if (age > 2) fail(`TCG 정산이 ${age}일째 안 늘었다 (마지막 ${last})`);
    else ok(`TCG 정산 최신 ${last}`);
  }
}

// ── 5. 파생 집계가 원본보다 뒤처지면, 화면은 낡은 값을 보여주면서 아무도 모른다.
for (const [f, label] of [["data/auction-series.json", "원피스 시계열"], ["data/tcg-series.json", "TCG 시계열"]]) {
  if (!has(f)) { fail(`${label} 파일이 없다`); continue; }
  const S = readJSON(f);
  const last = S.builtFrom?.last;
  if (!last) { fail(`${label}에 builtFrom.last 가 없다`); continue; }
  const age = daysAgo(last);
  if (age > 1) fail(`${label}이 ${age}일째 안 갱신됐다 (마지막 ${last})`);
  else ok(`${label} 최신 ${last}`);
}

// ── 6. 진행 중 매물 관측 — 하루 4회 도는 워크플로다. 이틀 넘게 멈추면 사고.
if (has("data/auction-market.json")) {
  const pts = readJSON("data/auction-market.json").points || [];
  const last = pts.length ? pts[pts.length - 1].d : null;
  if (!last) fail("진행 중 매물 관측이 비었다");
  else if (daysAgo(last) > 1) fail(`진행 중 매물 관측이 ${daysAgo(last)}일째 안 늘었다 (마지막 ${last})`);
  else ok(`진행 중 매물 관측 최신 ${last}`);
}

// ── 7. 그레이딩 주간 데이터 — 이 감시자를 만들게 된 바로 그 사고가 여기서 났는데
//    정작 검사 범위에 없었다(2026-08-12 발견). 실제로 PSA 판본별이 7/29 에 멈춘 채
//    화면에는 그 값이 "THIS WEEK" 으로 나가고 있었다.
//
//    주간 수집이라 하루이틀 늦는 건 정상이다. 두 주를 통째로 건너뛰면 사고다.
//    기관마다 공개 요일이 달라 날짜가 서로 다른 것 자체는 정상 — 각자 자기 기준으로만 본다.
{
  const WEEK_STALE = 10;  // 한 주(7일) + 여유 3일. 이걸 넘으면 한 주를 통째로 놓친 것이다.
  // 객체 어디에 박혀 있든 YYYY-MM-DD 를 긁어 가장 최근을 찾는다 — 파일마다 구조가 달라서다.
  const scanDates = (o, out = []) => {
    if (o == null) return out;
    if (typeof o === "string") { if (/^\d{4}-\d{2}-\d{2}$/.test(o)) out.push(o); return out; }
    if (Array.isArray(o)) { for (const x of o) scanDates(x, out); return out; }
    if (typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out.push(k);
        scanDates(v, out);
      }
    }
    return out;
  };
  const GRADING = [
    ["data/gemrate-psa-history.json", "PSA 주간 이력"],
    ["data/psa-edition-weekly.json", "PSA 판본별 주간"],
    ["data/cgc-grading-history.json", "CGC 이력"],
    ["data/tag-grading-history.json", "TAG 이력"],
  ];
  for (const [f, label] of GRADING) {
    if (!has(f)) { fail(`${label} 파일이 없다`); continue; }
    // PSA 주간 이력은 주간 그래프 끝(weeklyThrough)으로 잰다 — 파일 안 아무 날짜나 긁으면 팝 리포트로 최신화한 세트 누적(latest.date)이
    // 잡혀 주간 증가분이 멈춘 걸 가린다(2026-11-12 검증 지적).
    const j = readJSON(f);
    const ds = f === "data/gemrate-psa-history.json" ? [j.weeklyThrough].filter(Boolean) : [...new Set(scanDates(j))].sort();
    if (!ds.length) { fail(`${label}에 날짜가 하나도 없다`); continue; }
    const last = ds[ds.length - 1];
    const age = daysAgo(last);
    if (age > WEEK_STALE) fail(`${label}이 ${age}일째 안 늘었다 (마지막 ${last}) — 주간 수집을 건너뛴 것이다`);
    else ok(`${label} 최신 ${last}`);
  }
}

// ── 8. eBay 실거래(sold) 박스 시계열 — 이 프로젝트에서 **자동화가 불가능한 유일한 수집**이다.
//    eBay 가 데이터센터 IP 를 막아 사용자 실브라우저로만 긁을 수 있고, 그래서 월·수·금 사람 손에 달려 있다.
//    그런데 감시 범위 밖이라 2026-08-05·08-07 이 통째로 비고 8/12 도 늦어질 때까지 아무도 몰랐다.
//    사람이 기억해야 하는 절차는 반드시 빠진다 — 빠졌다는 사실이라도 자동으로 알려야 한다.
{
  const SOLD_STALE = 4;   // 월·수·금이면 최대 간격이 3일. 4일을 넘었으면 한 번 걸렀다는 뜻이다.
  //
  // 2026-08-13: 시계열이 "수집일 스냅샷"에서 "판매일 기준 롤링"으로 바뀌었다. 그래서 시계열 날짜는
  // 더 이상 수집일이 아니고, 세트마다 마지막 판매일이 다른 게 정상이다(거래가 드문 세트는 며칠씩 안 팔린다).
  // 옛 검사는 그걸 "부분 수집"으로 오판했다. 수집을 걸렀는지는 **원장**을 봐야 안다.
  if (!has("data/box-sold-ledger.json")) fail("박스 sold 원장 파일이 없다");
  else {
    const L = readJSON("data/box-sold-ledger.json");
    const age = L.updated ? daysAgo(L.updated) : 999;
    if (!L.updated) fail("박스 sold 원장에 updated(마지막 수집일)가 없다");
    else if (age > SOLD_STALE) fail(`박스 sold 수집이 ${age}일째 없다 (마지막 ${L.updated}) — 월·수·금 수동 수집을 걸렀다`);
    else ok(`박스 sold 원장 최신 ${L.updated}`);

    // updated 는 "돌린 날"이라 한 건도 못 받아도 찍힌다 — 2026-08-25 추가.
    // 브라우저가 로봇 페이지만 받아 items 0 으로 와도 updated 는 갱신되고, 이 검사가 없으면
    // 수집 전멸이 18일간(커버리지 검사가 과거 기록으로 버티는 기간) OK 로 보인다.
    // lastAppended 는 **실제로 새 판매가 들어온 날**이다.
    if (!L.lastAppended) {
      ok("박스 sold 원장: lastAppended 아직 없음(다음 수집부터 기록된다)");
    } else {
      const gap = daysAgo(L.lastAppended.d);
      if (gap > SOLD_STALE * 2) fail(`박스 sold 가 ${gap}일째 한 건도 안 늘었다 (마지막 적재 ${L.lastAppended.d}, ${L.lastAppended.n}건) — 수집은 돌지만 아무것도 못 받고 있다`);
      else ok(`박스 sold 마지막 적재 ${L.lastAppended.d} (${L.lastAppended.n}건)`);
    }

    // 커버리지: 최근 3주 안에 팔린 기록이 있는 세트가 몇 개인가.
    // 세트 하나가 몇 주씩 조용한 건 있을 수 있지만, 절반 이상이 조용하면 수집이 반쪽으로 돌고 있는 것이다.
    const sets = Object.keys(L.sets || {});
    const cut = new Date(Date.parse(`${today}T00:00:00Z`) - 21 * 86400000).toISOString().slice(0, 10);
    const live = sets.filter((k) => {
      const v = L.sets[k] || {};
      return [...(v.jp || []), ...(v.en || [])].some((r) => r && r.d > cut);
    });
    if (sets.length && live.length < sets.length * 0.6) {
      fail(`최근 3주 실거래가 잡힌 세트가 ${live.length}/${sets.length}뿐 — 수집이 반쪽으로 돌고 있다`);
    } else if (sets.length) ok(`박스 sold 최근 3주 거래 ${live.length}/${sets.length} 세트`);
  }
}

// ── 8b. 팰월드 전용 수집(경매 관측·박스 sold) 신선도 — 2026-08-19 추가, 2026-11-05 삭제.
//    소유자 결정("팰월드만 수집했던 건 그냥 멈추자")으로 수집을 멈추고 원장을 동결했다. 동결 원장을 여기서 계속 보면
//    이틀 뒤부터 이 감사가 매일 FAIL 한다. 팰월드는 TCG 13종 묶음(위 TCG 스냅샷·정산)으로만 본다(가드 PW1).

// ── 8c. 그레이딩 시계열(grading-series.json) — 2026-08-19 추가.
//    세트별 누적 감정을 등급사별·주차별로 담은 파생 파일이다. 원장은 갱신됐는데 이게 안 구워지면
//    화면 그래프만 지난주에 머문다 — 파생이 뒤처지는 사고는 조용해서 제일 늦게 발견된다.
if (has("data/grading-series.json")) {
  const S = readJSON("data/grading-series.json");
  const age = S.updated ? daysAgo(S.updated) : 999;
  if (age > 10) fail(`그레이딩 시계열이 ${age}일째 안 구워졌다 (마지막 ${S.updated})`);
  else ok(`그레이딩 시계열 최신 ${S.updated} (${Object.keys(S.sets || {}).length}세트)`);
}

// ── 9. 환율(fx.json) 신선도 — 2026-08-17 추가.
//    fx.json 이 07-01 값에 47일 멈춰 있었는데 아무도 몰랐다. 갱신 워크플로우가 없었던 데다,
//    "가격이 안 변하는 것"과 달리 "환율이 안 변하는 것"은 화면에 아무 표시도 남기지 않기 때문이다.
//    그 사이 실제 환율은 8.9% 움직였고, eBay 원화 표시를 달러로 바꾸는 12개 파일이 전부 틀린 값을 썼다.
//    환율은 우리가 만드는 데이터가 아니라 남의 숫자를 베끼는 것이라, 늦었다는 사실 자체가 유일한 신호다.
{
  const FX_STALE = 4;   // ECB 는 영업일만 고시한다. 주말+공휴일이 붙어도 4일이면 반드시 새 값이 있다.
  if (!has("data/fx.json")) fail("data/fx.json 이 없다");
  else {
    const fx = readJSON("data/fx.json");
    const age = fx.date ? daysAgo(fx.date) : 999;
    if (!fx.date) fail("fx.json 에 date 가 없다");
    else if (age > FX_STALE) fail(`환율이 ${age}일째 그대로다 (${fx.date} ${fx.usdKrw}) — 이 값으로 환산되는 달러 가격이 전부 틀어진다`);
    else ok(`환율 최신 ${fx.date} (USD/KRW ${fx.usdKrw})`);

    // 화면이 읽는 환율은 fx.json 이 아니라 onepiece-packs.json 안에 복사된 fx 다. 둘이 어긋나면
    // 원장은 새 환율로, 화면은 옛 환율로 돌아간다 — 2026-08-17 실제로 그랬다(fx.json 7/1, 화면 7/14).
    // 값이 다르면 어느 쪽이 맞는지 사람이 알 수 없으므로 여기서 막는다.
    if (has("data/onepiece-packs.json")) {
      const pf = (readJSON("data/onepiece-packs.json") || {}).fx || {};
      if (pf.usdKrw !== fx.usdKrw || pf.date !== fx.date) {
        fail(`화면 환율이 fx.json 과 다르다 — 화면 ${pf.date} ${pf.usdKrw} vs fx.json ${fx.date} ${fx.usdKrw}`);
      } else ok("화면 환율 = fx.json 일치");
    }

    // 이력도 같이 본다. 이력이 안 쌓이면 나중에 "이 기록은 어느 환율로 환산됐나"를 되짚을 수 없다 —
    // 그리고 그건 소급이 안 된다(무료 API 는 과거를 며칠치밖에 안 준다).
    if (!has("data/fx-history.json")) fail("data/fx-history.json 이 없다 — 환율 이력은 소급 수집이 안 된다");
    else {
      const h = readJSON("data/fx-history.json");
      const days = Object.keys(h.rates || {}).sort();
      const last = days[days.length - 1];
      if (!last) fail("환율 이력이 비어 있다");
      else if (daysAgo(last) > FX_STALE) fail(`환율 이력이 ${daysAgo(last)}일째 안 늘었다 (마지막 ${last})`);
      else ok(`환율 이력 ${days.length}일치, 최신 ${last}`);
    }
  }
}

// ── 10) 카드별 인구 파일의 "죽은 계열" — 2026-08-21 추가.
// 세트 단위 이력(cgc-grading-history 등)만 보면 카드 하나가 조용히 죽은 걸 못 본다:
// PRB-01 jp OP01-120 이 25일간 멈춰 있었는데(API 전환 후 변형 라벨 불일치) 이 감사는 OK 였다.
// 추적 카드(packs.sets[].cards)인데 그 파일의 전체 최신 관측일보다 14일 넘게 뒤처진 계열을 잡는다.
// 파일 전체 최신일 기준인 이유: 수집 자체가 늦는 것(전체가 같이 늦음)과 특정 카드만 빠지는 것을 구분하기 위해.
{
  const packs = readJSON("data/onepiece-packs.json");
  for (const f of ["cgc-card-pop.json", "tag-card-pop.json", "psa-card-pop.json"]) {
    if (!has("data/" + f)) continue;
    const pop = readJSON("data/" + f);
    let fileLatest = "";
    // 관측일 = seen(그 값을 마지막으로 본 수집일) 우선, 없으면 d — 2026-09-16.
    // PSA 의 d 는 GemRate 인구 변동일이라 값이 안 변하면 점이 안 늘고 seen 만 앞으로 간다(PRB-01 jp EB01-006 오판).
    // seen 은 d 가 같은 점에 찍히는데 그게 마지막 점이 아닐 수 있어(같은 값의 뒤 점이 있음) 계열 전체에서 가장 늦은 것을 본다.
    const latestOf = (arr) => (Array.isArray(arr) ? arr.reduce((m, p) => ((p.seen || p.d || "") > m ? p.seen || p.d : m), "") : "");
    // tag-card-pop.json 은 판 구분 없이 세트 바로 밑에 "번호|tier" 키가 온다(구 구조).
    // cgc/psa 는 jp/en 밑에 온다. 둘 다 "판 이름 → {계열}" 맵으로 정규화해서 본다.
    const editionsOf = (bucket) => {
      const legacy = Object.keys(bucket || {}).some((k) => k.includes("|"));
      if (legacy) {
        const flat = {};
        for (const [k, v] of Object.entries(bucket)) if (k.includes("|")) flat[k] = v;
        return { all: flat };
      }
      return { jp: bucket.jp || {}, en: bucket.en || {} };
    };
    for (const bucket of Object.values(pop.sets || {}))
      for (const eds of Object.values(editionsOf(bucket)))
        for (const series of Object.values(eds)) {
          const d = latestOf(series);
          if (d > fileLatest) fileLatest = d;
        }
    if (!fileLatest) continue;
    const lagging = [];
    for (const [code, set] of Object.entries(packs.sets || {})) {
      const bucket = (pop.sets || {})[code];
      if (!bucket) continue;
      // 계열 키는 "번호|tier". 번호 접두어만 보면 금/은 쌍둥이(packs 에 같은 번호가 두 줄)가 남의 tier 계열까지 잡아
      // 같은 줄을 두 번 찍었다 — 2026-09-16. 카드마다 자기 tier 계열만 보고, 키는 한 번씩만 본다.
      const keys = [...new Set((set.cards || []).filter((c) => c.number).map((c) => `${c.number}|${ourTier(c.name)}`))];
      for (const key of keys) {
        const number = key.slice(0, key.indexOf("|"));
        for (const [edKey, eds] of Object.entries(editionsOf(bucket))) {
          // 그 판에 그 tier 계열이 아예 없는 카드는 "미수집"이지 "죽은 계열"이 아니다 — absent 리포트가 다룬다.
          const d = latestOf(eds[key]);
          if (!d) continue;
          const lagDays = Math.round((Date.parse(fileLatest) - Date.parse(d)) / 864e5);
          if (lagDays > 14) lagging.push(`${code} ${edKey} ${number} (${d}, ${lagDays}일 뒤짐)`);
        }
      }
    }
    if (lagging.length) fail(`${f}: 추적 카드 계열이 파일 최신(${fileLatest})보다 14일+ 뒤짐 — ${lagging.slice(0, 6).join(" · ")}${lagging.length > 6 ? ` 외 ${lagging.length - 6}건` : ""}`);
    else ok(`${f}: 추적 카드 계열 정체 없음 (최신 ${fileLatest})`);
  }
}

// ── 11) 카드별 수집이 판본째 빠진 것 — 2026-10-15 추가.
// 10) 은 "있던 계열이 멈춘 것"만 본다. 처음부터 한 번도 안 들어온 판본은 못 잡는다:
// TAG 연도 페이지가 2쪽이 된 뒤 카드별 수집기가 1쪽만 읽어 영문 OP-10·일본판 OP-14 가 계열 0개인 채로 몇 달을 갔다.
// 세트 총량 이력에 그 판본이 있는데(50장+) 카드별 파일에 그 판본 계열이 하나도 없으면 실패.
{
  const packs = readJSON("data/onepiece-packs.json");
  for (const [cardF, histF] of [["tag-card-pop.json", "tag-grading-history.json"], ["cgc-card-pop.json", "cgc-grading-history.json"]]) {
    if (!has("data/" + cardF) || !has("data/" + histF)) continue;
    const card = readJSON("data/" + cardF), hist = readJSON("data/" + histF);
    const missing = [];
    for (const [code, eds] of Object.entries(hist.sets || {})) {
      if (!(packs.sets || {})[code]) continue;
      for (const ed of ["jp", "en"]) {
        const arr = eds[ed];
        const total = Array.isArray(arr) && arr.length ? arr[arr.length - 1].total || 0 : 0;
        if (total >= 50 && !Object.keys(((card.sets || {})[code] || {})[ed] || {}).length) missing.push(`${code} ${ed}(세트 ${total}장)`);
      }
    }
    if (missing.length) fail(`${cardF}: 세트 총량은 있는데 카드별 계열이 0개인 판본 — ${missing.join(" · ")}`);
    else ok(`${cardF}: 세트 총량이 있는 판본은 모두 카드별 계열 있음`);
  }
}

const out = { status: problems.length ? "FAIL" : "OK", today, problems, checked: notes };
console.log(JSON.stringify(out, null, process.argv.includes("--json") ? 0 : 1));
if (problems.length) process.exit(1);
