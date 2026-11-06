#!/usr/bin/env node
// 시계열 공백 감사 — 2026-08-26 신설. 원피스 · TCG 시장 전부.
// 팰월드 전용 계열(경매 관측·낙찰 일별·박스 sold)은 2026-11-05 소유자 결정으로 수집을 멈추고 원장을 동결해 여기서 뺐다 —
// 동결 원장을 계속 보면 날마다 새 공백이 떠 가드·자가치유가 헛돈다. 팰월드는 'TCG 정산 일별'(13종 묶음)에서 계속 본다(가드 PW1).
//
// 왜: 기존 audit-collection-health.js 는 **가장 최근 날짜**만 본다. 어제 것이 있으면 OK 다.
// 그래서 중간에 며칠이 통째로 빠져도 통과한다. 실거래·경매 관측은 **소급 수집이 안 된다** —
// 그날 지나면 영영 못 채운다. 실제로 7/10~7/24 월·수·금 여섯 번을 놓쳤는데 아무도 몰랐고
// 그 칸은 지금도 비어 있다. 공백은 생긴 다음 날 보여야 의미가 있다.
//
// 보는 것:
//   A) 매일 도는 계열 — 최근 N일 중 빠진 날, 직전 완료일 부분수집, 창 안 지난 날의 확정 손실
//   A2) 진행 매물·시장 스캔(매일) — 그 시점 목록이라 소급 불가
//   B) 수동 수집(박스 sold, 월·수·금) — 지나간 수집일 중 안 돈 날
//   C) 주간 수집(등급) — 카드별·세트 누적, 끝난 주 중 관측이 없는 주
//   D) known-gaps.json 검증 — 등록된 날·주가 그 계열 기준으로 정말 비어 있는가
//
// 지난 공백은 못 채운다. 그래도 **보이게** 한다 — 안 보이면 다음 주에 또 놓친다.
// Run: node tools/audit-series-gaps.js [--days 21] [--json]
const fs = require("node:fs");
const path = require("node:path");
const { previousDayAssessment, previousTcgDayProblems, confirmedLoss } = require("./collection-continuity");

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
};
const ROOT = path.resolve(argValue("--root") || path.resolve(__dirname, ".."));
const DAY = 86400000;
const argN = process.argv.indexOf("--days");
const WINDOW = argN > -1 ? Number(process.argv[argN + 1]) || 21 : 21;
const DAILY_ONLY = process.argv.includes("--daily-only");

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const TODAY = argValue("--today") || iso(Date.now());
// 오늘은 아직 진행 중이라 공백으로 세지 않는다.
const LAST_FULL = iso(Date.parse(TODAY) - DAY);
const WINDOW_START = iso(Date.parse(LAST_FULL) - (WINDOW - 1) * DAY);

const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } };
const problems = [], notes = [];
let knownWrong = null;   // D) 를 돌았을 때만 채운다(--daily-only 는 계열을 다 안 봐서 검증할 수 없다)

function finish() {
  const out = { audit: problems.length ? "FAIL" : "NO_GAPS", today: TODAY, window: WINDOW, problems, notes, ...(knownWrong ? { knownWrong } : {}) };
  console.log(JSON.stringify(out, null, process.argv.includes("--json") ? 0 : 1));
  return problems.length ? 1 : 0;
}

// 조사가 끝난 영구 공백은 problems 가 아니라 notes 로 낸다 — data/known-gaps.json.
// 매번 FAIL 이 나면 사람이 이 감사를 무시하게 되고, 그러면 진짜 새 공백도 같이 묻힌다.
// 대신 목록은 사유와 확인일을 반드시 적게 해서, 새 공백을 조용히 덮는 데 못 쓰게 한다.
const KNOWN_JSON = read("data/known-gaps.json");
const KNOWN = (() => {
  const byDay = new Set(), byWeek = new Set();
  for (const g of (KNOWN_JSON && KNOWN_JSON.gaps) || []) {
    if (!g.reason || !g.confirmed) continue;              // 사유·확인일 없으면 인정하지 않는다
    for (const d of g.dates || []) byDay.add(`${g.series}|${d}`);
    for (const w of g.weeks || []) byWeek.add(`${g.series}|${w}`);
  }
  return { byDay, byWeek };
})();
const knownDay = (label, d) => KNOWN.byDay.has(`${label}|${d}`);
const knownWeek = (label, w) => KNOWN.byWeek.has(`${label}|${w}`);

// 계열별 "그날·그 주가 비었나" 판정 — 감사와 D) 검증이 같은 기준을 쓴다. 한 계열에 규칙이 여럿이면(빠진 날 +
// 부분수집) 하나라도 비었다고 하면 빈 것이다.
// 남아 있는 첫 점보다 앞은 반박할 근거가 없으니 빈 것으로 본다 — 2026-09-30. 시장 스캔은 180점,
// 공급은 180일, 스냅샷은 730일만 남기고 앞을 잘라낸다. 잘린 날을 "비어 있지 않다"고 하면 날짜가 지나는 것만으로
// 가드 K1 이 FAIL 해 가드를 도는 수집 워크플로 7개가 멈춘다(9/26 R4 사고와 같은 모양).
const dayRules = new Map(), weekRules = new Map();
const addRule = (rules, label, fn) => rules.set(label, [...(rules.get(label) || []), fn]);

function missingDays(dates, from, to) {
  const have = new Set(dates.filter(Boolean).map((d) => String(d).slice(0, 10)));
  const out = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const d = iso(t);
    if (!have.has(d)) out.push(d);
  }
  return out;
}

// 계열의 시작일보다 앞은 공백이 아니다(그때는 수집 자체가 없었다).
function checkDaily(label, dates) {
  const u = [...new Set(dates.filter(Boolean).map((d) => String(d).slice(0, 10)))].sort();
  if (!u.length) { problems.push(`${label} — 데이터가 아예 없다`); return; }
  const have = new Set(u);
  addRule(dayRules, label, (d) => d < u[0] || !have.has(d));
  const start = u[0] > WINDOW_START ? u[0] : WINDOW_START;
  const all = missingDays(u, start, LAST_FULL);
  const known = all.filter((d) => knownDay(label, d));
  const gaps = all.filter((d) => !knownDay(label, d));
  const line = `${label} — ${u[0]} ~ ${u[u.length - 1]} (${u.length}일)`;
  if (known.length) notes.push(`${label} — 확인된 영구 공백 ${known.length}일(${known.join(" ")}) · known-gaps.json 참조`);
  if (!gaps.length) { notes.push(`${line} · 최근 ${WINDOW}일 새 공백 없음`); return; }
  problems.push(`${label} — 최근 ${WINDOW}일 중 ${gaps.length}일 비었다: ${gaps.join(" ")}`);
}

// ── A) 매일 도는 계열 ────────────────────────────────────────────────
const auc = read("data/auction-series.json");
if (auc) {
  checkDaily("원피스 경매 일별", (auc.daily || []).map((r) => r.d));
}
else problems.push("원피스 경매 시계열 파일을 못 읽었다");

const tcg = read("data/tcg-snapshot.json");
if (tcg) {
  checkDaily("TCG 시장 스냅샷", (tcg.points || []).map((r) => r.d));
  addRule(dayRules, "TCG 시장 스냅샷", (d) => previousTcgDayProblems(tcg, d).length > 0);
}
else problems.push("TCG 스냅샷 파일을 못 읽었다");
const tcgSeries = read("data/tcg-series.json");
if (!tcgSeries) problems.push("TCG 정산 시계열 파일을 못 읽었다");
const auctionWatch = read("data/auction-watch.json");
if (!auctionWatch) problems.push("원피스 경매 감시목록 파일을 못 읽었다");
const tcgWatch = read("data/tcg-watch.json");
if (!tcgWatch) problems.push("TCG 감시목록 파일을 못 읽었다");

// 중간 날짜 존재 여부와 "직전 완료일이 실제로 온전한가"는 별개다.
// 직전 완료일은 아직 회수 중일 수 있어도 강하게 본다(자가치유가 재실행할 근거). 그보다 앞선 날은
// 감시목록에서 그날 종료분이 빠져 손실이 확정된 것만 낸다 — 2026-09-30 전엔 직전 하루만 봐서,
// 부분일이 하루 지나면 보고에서 사라지고 known-gaps 에도 안 남았다(점검 비평 C3).
// 조사가 끝나 known-gaps.json 에 사유·확인일과 함께 등록된 날은 경고가 아니라 메모로 남긴다.
// 2026-09-03: 이 분기가 없어서 복구 불가로 확인된 9/2 공백이 2시간마다 재실행+실패 메일을 냈다.
if (auc && tcg && tcgSeries) {
  const prev = previousDayAssessment({ auctionSeries: auc, tcgSnapshot: tcg, tcgSeries, day: LAST_FULL, root: ROOT });
  problems.push(...prev.problems);
  notes.push(...prev.known.map((k) => `${k} · known-gaps.json 등록(복구 불가 확인)`));
}
if (auc && tcg && tcgSeries && auctionWatch && tcgWatch) {
  const loss = confirmedLoss({ auctionSeries: auc, auctionWatch, tcgSnapshot: tcg, tcgSeries, tcgWatch });
  const firstSettled = (tcgSeries.daily || [])[0]?.d || LAST_FULL;
  for (let t = Date.parse(firstSettled > WINDOW_START ? firstSettled : WINDOW_START); t < Date.parse(LAST_FULL); t += DAY) {
    const d = iso(t);
    for (const [label, judge] of [["원피스 경매 일별", loss.auction], ["TCG 정산 일별", loss.settlement]]) {
      const why = judge(d);
      if (!why) continue;
      if (knownDay(label, d)) notes.push(`${label} — 지난 날 ${d} ${why} · known-gaps.json 등록(복구 불가 확인)`);
      else problems.push(`${label} — 지난 날 ${d} ${why}`);
    }
  }
  addRule(dayRules, "원피스 경매 일별", (d) => !!loss.auction(d));
  addRule(dayRules, "TCG 정산 일별", (d) => !!loss.settlement(d));
}

// TCG 표본 회수(표본일) — 2026-10-14 추가(위 "TCG 정산 일별" 검사는 그대로 둔다).
// 위 검사는 종료일 원장 합계를 보수적 최소(min(eBay 24h, 125) × 0.5)와 비교한다. 그래서 시한(종료 + 30시간)을 넘겨 사라진
// 표본이 다른 날 고른 표본·여유분에 가려 안 보였다(9/4 포켓몬 표본 250건 전량 소실, 9/9 큰 게임 표본 40~77% 소실이 통과 —
// 표본일 기준 60일 4,517건). 여기서는 그날 고른 표본(tcg-series sampleWatched) 중 종료 후 읽은 수(sampleSettled, 표본일 기준)를
// 본다. 감시 목록에 그날 표본이 아직 남아 있으면(시한 안) 회수 중이라 보지 않는다 — 다 빠진 뒤에야 확정 손실이다.
// 기준 98%: 사라진 매물(eBay 404) 몇 건의 여유. 표본 수가 모르는 날(null)은 보지 않는다.
// 분자는 분모 집합 안에서만 센다 — 같은 실행에서 넣고 바로 읽어 감시 이력에 없는 표본 행은 분모(보정 파일 sampled)에도 더한다
// (2026-10-14 QA: 종전엔 분자에만 들어가 손실을 가렸다 — 9/13 pokemon 120/116 통과, 실제 120/125). 아래 min 은 같은 날
// 스냅샷을 다시 찍은(--force) 경우처럼 분모가 덮인 날의 안전장치다.
const SAMPLE_LABEL = "TCG 표본 회수(표본일)";
const SAMPLE_MIN_RATE = 0.98;
if (tcgSeries) {
  const { TCG_KEYS } = require("./tcg-config");
  const pendingSample = new Set((tcgWatch?.pending || []).filter((p) => !p.extra && typeof p.seen === "string").map((p) => `${p.g}|${p.seen}`));
  const rows = new Map((tcgSeries.daily || []).map((r) => [r.d, r]));
  const known = (tcgSeries.daily || []).filter((r) => TCG_KEYS.some((k) => Number.isFinite(r.games?.[k]?.sampleWatched)));
  const firstSampleDay = known.length ? known[0].d : null;
  const sampleShortfall = (d) => {
    const row = rows.get(d);
    const thin = [];
    for (const k of TCG_KEYS) {
      const g = row?.games?.[k];
      const watched = g?.sampleWatched;
      if (!Number.isFinite(watched) || watched <= 0 || pendingSample.has(`${k}|${d}`)) continue;
      const settled = Math.min(Number(g.sampleSettled) || 0, watched);
      if (settled < watched * SAMPLE_MIN_RATE) thin.push(`${k} ${settled}/${watched}`);
    }
    return thin;
  };
  if (firstSampleDay) {
    for (let t = Date.parse(firstSampleDay > WINDOW_START ? firstSampleDay : WINDOW_START); t <= Date.parse(LAST_FULL); t += DAY) {
      const d = iso(t);
      const thin = sampleShortfall(d);
      if (!thin.length) continue;
      const line = `${SAMPLE_LABEL} — ${d} 표본 회수 ${SAMPLE_MIN_RATE * 100}% 미달(읽음/표본, 시한 지나 확정): ${thin.join(", ")}`;
      if (knownDay(SAMPLE_LABEL, d)) notes.push(`${line} · known-gaps.json 등록(복구 불가 확인)`);
      else problems.push(line);
    }
  }
  // 남은 첫 표본 기록보다 앞은 반박할 근거가 없으니 빈 것으로 본다(위 계열들과 같은 규칙).
  addRule(dayRules, SAMPLE_LABEL, (d) => !firstSampleDay || d < firstSampleDay || sampleShortfall(d).length > 0);
}

if (DAILY_ONLY) process.exit(finish());

// ── A2) 진행 매물·시장 스캔(매일) — 2026-09-30 편입 ─────────────────────
// 셋 다 그 시점에 걸려 있던 목록을 센 것이라 지나가면 되돌려 받을 수 없다. 그런데 이 감사가 안 봐서
// 9/22~9/26 진행 매물(update-active-listings 3일 실패)과 9/26 시장 스캔이 빈 것이 아무 데도 안 떴다.
// 셋 다 주말도 쉬지 않는 계열이다(7/20~9/29 실측: 토·일에도 점이 있다). 세트 합집합으로 본다 — 하루치 수집이
// 통째로 빠진 날을 잡는 게 목적이다. 세트 하나만 빠진 날은 여기서 보지 않는다.
const market = read("data/auction-market.json");
if (market) checkDaily("원피스 경매 시장 스캔", (market.points || []).map((r) => r.d));
else problems.push("원피스 경매 시장 스캔 파일을 못 읽었다");

const supply = read("data/supply-series.json");
if (supply) checkDaily("공급 시계열", Object.values(supply.sets || {}).flatMap((s) => (s.points || []).map((p) => p.d)));
else problems.push("공급 시계열 파일을 못 읽었다");

// 예약판매 박스 호가(발매 전 세트, collect-preorder-prices.js) — 2026-10-08 신설. 발매 전 세트가 없는 기간엔 파일이
// 갱신되지 않는 게 정상이고, 테스트 픽스처엔 파일이 없으므로 못 읽어도 problems 에 넣지 않는다.
const preorder = read("data/preorder-series.json");
if (preorder) checkDaily("예약판매 박스 호가", Object.values(preorder.sets || {}).flatMap((s) => ["jp", "en"].flatMap((k) => (s[k] || []).map((p) => p.d))));

// 박스 진행매물 점은 WM 원본이 있는 세트는 boxSeries(En)Ebay, 없는 세트(OP-16·17 등)는 boxSeries(En) 에 들어간다
// (update-box-series-history). 판별마다 두 키를 합친다. 진행매물 점(basis active)만 센다 — 7/14 이전 옛 점은 기준이 다르다.
const packs = read("data/onepiece-packs.json");
if (packs) {
  const activeDates = (keys) => Object.values(packs.sets || {}).flatMap((s) =>
    keys.flatMap((k) => (s[k]?.points || []).filter((p) => p.basis === "active").map((p) => p.d)));
  checkDaily("박스 진행매물 시계열 JP", activeDates(["boxSeriesEbay", "boxSeries"]));
  checkDaily("박스 진행매물 시계열 EN", activeDates(["boxSeriesEnEbay", "boxSeriesEn"]));
}
else problems.push("packs.json 을 못 읽었다");

// ── B) 수동 수집(박스 sold) — 월·수·금 ──────────────────────────────
// 이 수집만 브라우저가 필요해 자동화가 안 된다. 그래서 가장 잘 빠진다.
const MWF = new Set([1, 3, 5]);   // 월·수·금 (UTC 요일)
function checkManual(label, ledgerPath) {
  const led = read(ledgerPath);
  if (!led) { problems.push(`${label} 원장을 못 읽었다`); return; }
  const days = led.collectedDays || [];
  if (!days.length) {
    notes.push(`${label} — 수집일 기록이 아직 없다(2026-08-26 부터 남긴다). 다음 수집부터 공백 판정 가능.`);
    return;
  }
  const have = new Set(days);
  // eBay sold 는 지난 판매를 나중에도 그대로 보여준다. 그래서 수집일을 하루 걸러도
  // 다음 수집이 그 날의 판매를 소급해 담는다 — 실제 데이터가 채워졌으면 구멍이 아니다.
  // (2026-08-28 을 걸렀지만 8/31 수집이 그 날 판매 66건을 다 담았다.)
  // 여기서 FAIL 로 올릴 것은 "판매일 데이터가 원장에 아예 없는 날" 하나뿐이다.
  const soldDays = new Set();
  for (const set of Object.values(led.sets || {})) {
    for (const ed of ["jp", "en"]) for (const r of set?.[ed] || []) if (r.d) soldDays.add(r.d);
  }
  const from = days[0] > WINDOW_START ? days[0] : WINDOW_START;
  const missed = [], covered = [];
  for (let t = Date.parse(from); t <= Date.parse(LAST_FULL); t += DAY) {
    const d = iso(t);
    if (!MWF.has(new Date(t).getUTCDay()) || have.has(d)) continue;
    (soldDays.has(d) ? covered : missed).push(d);
  }
  if (missed.length) problems.push(`${label} — 수집일을 걸렀고 그 날 판매도 원장에 없다 ${missed.length}일: ${missed.join(" ")}`);
  if (covered.length) notes.push(`${label} — 수집일 ${covered.length}일을 걸렀지만 이후 수집이 소급해 담았다: ${covered.join(" ")}`);
  if (!missed.length && !covered.length) notes.push(`${label} — 최근 ${WINDOW}일 수집일 전부 실행됨(마지막 ${days[days.length - 1]})`);
}
checkManual("원피스 박스 sold", "data/box-sold-ledger.json");

// ── C) 주간 수집(등급) ──────────────────────────────────────────────
// 등급 인구는 누적값이라 하루 늦어도 값이 사라지진 않는다. 다만 주가 통째로 빠지면
// 그 주의 유입량(증분)을 영영 못 나눈다. 그래서 주 단위로, 끝난 주만 본다.
//
// 관측일은 seen(그 값을 마지막으로 본 수집일) 우선, 없으면 d — 2026-09-30.
// PSA 카드별 d 는 GemRate 인구 변동일이라 값이 안 변한 카드는 d 가 그대로고 seen 만 앞으로 간다.
// d 만 보다가 9/14 에 386점을 관측한(seen=09-14) W38 을 공백으로 오판했고, 그게 known-gaps 에 영구 공백으로
// 등록까지 됐다(5c155cb3). audit-collection-health 는 9/16 에 이미 seen||d 로 바꿨었다.
// 2026-10-14: seen 과 d 를 둘 다 센다. seen||d 는 반대쪽 오판을 냈다 — 9/7 수집이 GemRate 변동일 8/31~9/4 점(d)을 담았는데
// seen(9/7, W37)만 세서 W36 을 공백으로 냈다(PSA 카드별). d 는 그 값이 성립한 날이라 그 주의 값이 있다는 뜻이다.
// seen 은 지금 PSA 카드별에만 있다(다른 원장은 d 하나).
function observedDates(sets) {
  const out = [];
  (function walk(o) {
    if (Array.isArray(o)) { for (const p of o) if (p && p.d) { out.push(p.d); if (p.seen) out.push(p.seen); } }
    else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v);
  })(sets);
  return out;
}

// due = 주가 끝난(일요일) 뒤 며칠을 기다려 보나. 창 끝을 그만큼 당기면 "끝난 주" 중 가장 늦은 주가 그만큼 늦게 들어온다.
function checkWeekly(label, dates, { due = 0 } = {}) {
  const u = [...new Set(dates.filter(Boolean).map((d) => String(d).slice(0, 10)))].sort();
  if (!u.length) { problems.push(`${label} — 관측이 하나도 없다`); return; }
  const weeks = new Set(u.map((d) => isoWeek(d)));
  addRule(weekRules, label, (w) => w < isoWeek(u[0]) || !weeks.has(w));
  const end = Date.parse(LAST_FULL) - due * DAY;
  const missed = [];
  for (let t = end - (WINDOW - 1) * DAY; t <= end; t += 7 * DAY) {
    const w = isoWeek(iso(t));
    if (!weeks.has(w) && iso(t) >= u[0]) missed.push(w);
  }
  const uniq = [...new Set(missed)];
  const knownW = uniq.filter((w) => knownWeek(label, w));
  const freshW = uniq.filter((w) => !knownWeek(label, w));
  if (knownW.length) notes.push(`${label} — 확인된 영구 공백 주 ${knownW.join(" ")} · known-gaps.json 참조`);
  if (freshW.length) problems.push(`${label} — 관측이 없는 주 ${freshW.join(" ")}`);
  else notes.push(`${label} — 최근 ${WINDOW}일 새 공백 없음(마지막 관측 ${u[u.length - 1]})`);
}

for (const [label, file, opts] of [
  ["PSA 카드별", "data/psa-card-pop.json"],
  ["CGC 카드별", "data/cgc-card-pop.json"],
  ["TAG 카드별", "data/tag-card-pop.json"],
  // 세트 누적 원장 — 2026-09-30 편입. 따라잡기 수집이 끝나면 남은 주 구멍이 어디에도 안 보였다
  // (CGC 세트 9/11 → 9/29 로 W38·W39, PSA 판별 9/09 → 9/23 으로 W38). 최신성만 보는 감사는 따라잡은 뒤 통과한다.
  ["CGC 세트 누적", "data/cgc-grading-history.json"],
  ["TAG 세트 누적", "data/tag-grading-history.json"],
  // 판별 주간은 GemRate 의 수요일 행을 다음 월요일에 받는다(9/23 점 → 9/28 수집). 월요일이 지나야 그 주를 본다.
  ["PSA 판별 주간", "data/psa-edition-weekly.json", { due: 1 }],
]) {
  const j = read(file);
  if (!j) { problems.push(`${label} 원장을 못 읽었다`); continue; }
  checkWeekly(label, observedDates(j.sets), opts);
}

function isoWeek(d) {
  const t = new Date(Date.parse(d));
  const day = (t.getUTCDay() + 6) % 7;               // 월=0
  t.setUTCDate(t.getUTCDate() - day + 3);            // 그 주의 목요일
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - first) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ── D) known-gaps.json 검증 — 2026-09-30 신설 ───────────────────────
// 기록부가 데이터와 어긋나면 둘 중 하나다: 관측이 있는 날·주를 영구 공백으로 굳히거나(5c155cb3 의 PSA 카드별 W38 —
// 감사의 틀린 기준을 기록부가 그대로 옮겼다), 계열 이름이 틀려 아무것도 못 덮는다. 창과 무관하게 전 항목을 본다.
// 가드 K1 이 이 목록이 비어 있기를 요구한다.
knownWrong = [];
for (const g of (KNOWN_JSON && KNOWN_JSON.gaps) || []) {
  if (!g.reason || !g.confirmed) knownWrong.push(`${g.series} — 사유·확인일이 없다`);
  for (const [unit, list, rules] of [["날", g.dates, dayRules], ["주", g.weeks, weekRules]]) {
    if (!list || !list.length) continue;
    const fns = rules.get(g.series);
    if (!fns) { knownWrong.push(`${g.series} — ${unit} 단위로 감사하는 계열 이름이 아니다(이름이 틀리면 아무것도 안 덮는다)`); continue; }
    for (const x of list) {
      if (!fns.some((fn) => fn(x))) knownWrong.push(`${g.series} ${x} — 이 계열 기준으로 비어 있지 않다(관측이 있거나 아직 회수 중) · 등록을 빼야 한다`);
    }
  }
}
problems.push(...knownWrong.map((m) => `known-gaps 오기재 — ${m}`));

process.exit(finish());
