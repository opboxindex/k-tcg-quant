#!/usr/bin/env node
// 연구 품질 점수판 — 2026-10-15 신설.
//
// 왜: 소유자 기준(2026-10-14) "완벽한 리서치 회사 — 누구든 숫자만 보고 설명할 수 있고, 계속 좋아진다.
//     정기 작업마다 품질 지표 최악 1개를 고친다." collect-status.js 는 "지금 뭘 수집해야 하나", guard-invariants.js 는
//     "틀린 게 있나" 를 답하지만, **"우리 데이터가 지금 얼마나 좋은가"** 를 숫자 한 장으로 말하는 곳이 없었다.
//     그래서 수집을 끝낼 때마다 이 한 장을 보고, 맨 아래 "최악 1건" 을 다음 작업으로 삼는다.
//
// 규칙은 여기서 다시 정하지 않는다 — 값을 만드는 모듈과 감사기를 그대로 불러 센다:
//   박스 창·최소 표본        build-box-sold-series.js(MIN_N) · data/box-sold-series.json(window·staleDays·current·outliers)
//   신선도·날짜 빈칸        collect-status.js --json(수집원 22종의 기준일·상태·audit-series-gaps 결과)
//   NM 쓸 수 있음·가장 비싼 카드·지표 칸   market-data-normalizers.js(nmUsable·priciest·countedValues)
//   PSA10 실거래 쓸 수 있음  ai-data-model.js(psa10Sold — AI 피드와 같은 술어)
//   레어도                  card-list-shared.js(rarityCode — 세트·카드·AI 피드와 같은 함수)
//   얇은 페이지·메타        audit-thin-pages.js · audit-seo.js
//   그래프 값 재계산        audit-box-series.js
// 지표마다 정확한 정의·상태 규칙·개선 방법은 docs/quality-scorecard.md 에 같은 ID 로 적혀 있다.
//
// 읽기만 한다. 브라우저 없음, 5초 안(가드 14초는 --guard 를 줄 때만 돈다). 종료 코드는 항상 0 —
// 점수판은 막는 도구가 아니다(막는 건 가드). 윈도우 cp949 콘솔이라 이모지를 쓰지 않는다.
// Run: node tools/quality-scorecard.js [--json] [--guard]
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const R = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(R(p));
const read = (p) => fs.readFileSync(R(p), "utf8");
const readJSON = (p) => JSON.parse(read(p));
const readOr = (p, d) => { try { return readJSON(p); } catch { return d; } };
const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = new Date().toISOString().slice(0, 10);
const daysSince = (d) => (ISO.test(String(d || "").slice(0, 10)) ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`)) / DAY) : null);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const JSON_OUT = process.argv.includes("--json");
const RUN_GUARD = process.argv.includes("--guard");

// 감사기는 자식 프로세스로 돌린다 — 문제를 찾으면 exit 1 을 내면서도 stdout 에 JSON 을 싣는 것이 그들의 정상 경로다.
// 죽었으면(파싱 불가) null — "문제 없음" 으로 조용히 넘기지 않고 그 행을 오류로 낸다.
function runJSON(script, args = []) {
  const opt = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] };
  let out = "";
  try { out = execFileSync(process.execPath, [path.join(__dirname, script), ...args], opt); }
  catch (e) { out = String(e.stdout || ""); }
  try { return JSON.parse(out); } catch { return null; }
}

// 한 줄 = 지표 하나. rank 는 최악 고르기 순서(3 FAIL · 2 WARN · 1 OK 인데 100% 가 아님 · 0 OK/INFO), shortfall 은 같은 rank 안의 크기(0~1).
const rows = [];
const add = (id, group, name, value, status, note, fix, shortfall = 0) => {
  const rank = status === "FAIL" ? 3 : status === "WARN" ? 2 : status === "OK" && shortfall > 0 ? 1 : 0;
  rows.push({ id, group, name, value, status, note: note || "", fix, rank, shortfall: Math.max(0, Math.min(1, shortfall)) });
};
const list = (xs, n = 5) => (xs.length > n ? `${xs.slice(0, n).join(", ")} 외 ${xs.length - n}` : xs.join(", "));

// ── 원천 ────────────────────────────────────────────────────────
const PACKS = readJSON("data/onepiece-packs.json");
const FX = PACKS.fx || {};
const TRACKED = Object.entries(PACKS.sets || {});                       // 추적 세트 22
const CARDS = TRACKED.flatMap(([code, s]) => (s.cards || []).map((c) => ({ code, c })));   // 추적 카드 220(세트 Top 10)
const SERIES = readOr("data/box-sold-series.json", { sets: {}, window: {} });
const { MIN_N } = require("./build-box-sold-series");                   // require 는 원장을 읽지도 쓰지도 않는다(그 파일 머리 참고)
const TARGET_N = (SERIES.window && SERIES.window.targetSales) || 12;
const STALE_DAYS = SERIES.staleDays || 28;
const N = require("./market-data-normalizers");
const AI = require("./ai-data-model");
const CL = require("./card-list-shared");
const STATUS = runJSON("collect-status.js", ["--json"]);

// ════ A. 박스 실거래 커버리지 ════
{
  const eds = ["jp", "en"];
  const cov = {}, thin = [], ns = [];
  for (const ed of eds) {
    cov[ed] = 0;
    for (const [code] of TRACKED) {
      const node = (SERIES.sets || {})[code] || {};
      const cur = node.current && node.current[ed];
      if (cur) { cov[ed]++; ns.push(cur.n); }
      else if (node.sinceRelease && node.sinceRelease[ed] > 0) {
        const pts = (node[ed] || []).filter((p) => p && p.median != null);
        thin.push(`${code}|${ed}(발매 후 ${node.sinceRelease[ed]}건, 마지막 점 ${pts.length ? pts[pts.length - 1].d : "없음"})`);
      }
    }
  }
  const total = TRACKED.length * eds.length, have = cov.jp + cov.en;
  add("A1", "box", `박스 sold 현재가 있는 세트(${STALE_DAYS}일 안 중앙값)`, `${have}/${total} (jp ${cov.jp}/${TRACKED.length} · en ${cov.en}/${TRACKED.length})`,
    have === total ? "OK" : "WARN", have === total ? "" : `없는 계열: ${list(thin.map((t) => t.split("(")[0]), 6)}`,
    "박스 수집(수집 스킬 2절) → node tools/build-box-sold-series.js. 창을 최대로 늘려도 MIN_N 이 안 모이면 시장이 얇은 것 — 창 규칙은 tools/build-box-sold-series.js 한 곳",
    (total - have) / total);
  add("A2", "box", `최소 표본(MIN_N=${MIN_N}) 미달로 점이 끊긴 계열`, `${thin.length}`,
    thin.length ? "WARN" : "OK", thin.length ? list(thin, 4) : "", "박스 수집을 거르지 않는다(월·수·금). 빈 구간이 틀린 값보다 낫다 — 추정으로 메우지 않는다",
    thin.length / Math.max(1, total));
  const med = median(ns), mn = ns.length ? Math.min(...ns) : null;
  add("A3", "box", `현재가 점의 표본 n(중앙값 / 최소, 목표 ${TARGET_N})`, ns.length ? `${med} / ${mn}` : "-",
    med == null ? "WARN" : med >= TARGET_N ? "OK" : "WARN", ns.length ? `계열 ${ns.length}개` : "현재가 계열 없음",
    "표본은 수집 빈도가 아니라 시장이 정한다 — 창(28~56일)·목표 건수는 tools/build-box-sold-series.js 한 곳",
    med == null ? 1 : Math.max(0, (TARGET_N - med) / TARGET_N));
}

// ════ B. 시계열 연속성 ════
{
  const gaps = STATUS ? STATUS.gaps || [] : null;
  add("B1", "series", `새 날짜 빈칸(최근 21일, known-gaps 제외)`, gaps ? `${gaps.length}` : "오류",
    !gaps ? "FAIL" : gaps.length ? "FAIL" : "OK", gaps ? list(gaps.map((g) => String(g).slice(0, 60)), 3) : "collect-status.js 를 못 읽었다",
    "node tools/collect-status.js 의 gaps — 박스는 재수집으로 메워지고, 경매 관측·TCG 스냅샷은 소급 불가(사유·확인일과 함께 data/known-gaps.json 에 등록)",
    gaps ? Math.min(1, gaps.length / 5) : 1);
  const known = readOr("data/known-gaps.json", { gaps: [] }).gaps || [];
  const knownN = known.reduce((a, g) => a + (g.dates || []).length + (g.weeks || []).length, 0);
  add("B2", "series", "확인된 영구 공백(날·주)", `${knownN}`, "INFO", `항목 ${known.length}건`, "채울 수 없다 — 늘지 않게만 한다(B1 이 0 이면 늘지 않는다)");

  let hatched = 0, widened = 0, outPts = 0, outRecent = 0, outAll = 0;
  const hatchedWhere = [], widenedWhere = [];
  const asOf = SERIES.asOf || today;
  for (const [code, node] of Object.entries(SERIES.sets || {})) {
    for (const ed of ["jp", "en"]) {
      const pts = (node[ed] || []).filter((p) => p && p.median != null);
      if (pts.length > 1) {
        const span = Math.round((Date.parse(pts[pts.length - 1].d) - Date.parse(pts[0].d)) / DAY / 7) + 1;
        const h = span - pts.length;
        if (h > 0) { hatched += h; hatchedWhere.push(`${code}|${ed} ${h}주`); }
      }
      for (const p of pts) { if (p.out) outPts++; if (p.win) { widened++; widenedWhere.push(`${code}|${ed} ${p.d}(${p.win}일)`); } }
      const o = ((node.outliers || {})[ed] || []);
      outAll += o.length;
      outRecent += o.filter((x) => ISO.test(x.d) && Date.parse(x.d) >= Date.parse(asOf) - 28 * DAY).length;
    }
  }
  add("B3", "series", "그래프 안 빗금 주(선 사이에 점이 없는 주)", `${hatched}`, hatched ? "WARN" : "OK", list(hatchedWhere, 5),
    "그 주 창 안에 즉시구매 판매가 MIN_N 건 미만 — 수집 누락이면 박스 재수집(eBay 는 90일치를 보여준다), 시장이 얇으면 그대로 둔다", Math.min(1, hatched / 20));
  add("B4", "series", "이상치를 빼려고 창을 늘린 점 / 이상치가 빠진 점", `${widened} / ${outPts}`, "INFO", list(widenedWhere, 3),
    "판정 규칙(양쪽 Hampel K=3.5)은 tools/build-box-sold-series.js 한 곳 — 바꾸면 test-box-sold-filters.js 6절이 검증");
  add("B5", "series", `이상치로 빠진 판매(최근 4주 / 전체)`, `${outRecent} / ${outAll}`, "INFO", `기준일 ${asOf}`,
    "최근 4주 이상치가 급증하면 수집 오염(배송비·세트 묶음·다른 상품)부터 의심 — tools/box-sold-ingest.js 필터, data/box-sold-series.json sets[*].outliers 에 id 가 있다");
}

// ════ C. 신선도(수집원별 마지막 관측 경과일) — collect-status.js 의 기준일·상태 그대로 ════
{
  const FRESH = [
    ["box", "박스 실거래(eBay sold)"], ["op-auction", "원피스 경매 정산"], ["tcg", "TCG 스냅샷"], ["psa-pop", "PSA 카드별 인구"],
    ["psa-weekly", "PSA 세트 주간"], ["grading", "CGC 카드별 인구"], ["tag-pop", "TAG 인구"], ["nm", "유유테이 NM"],
    ["psa10-sold", "PSA10 실거래"], ["fx", "환율"], ["official-cardlist", "공식 카드리스트"],
    // 2026-11-20 collect-status 가 PSA 세트 행을 원장마다 나눴다(psa-weekly = 일본판 증가 이력만). 판별 누적 원장은 새 행이라
    // 끝에 붙인다 — 가운데 끼우면 C6~C11 번호가 밀려 문서·기록의 ID 가 어긋난다.
    ["psa-edition", "PSA 판별 누적"],
  ];
  const byKey = Object.fromEntries(((STATUS && STATUS.rows) || []).map((r) => [r.key, r]));
  FRESH.forEach(([key, name], i) => {
    const r = byKey[key];
    const id = `C${i + 1}`;
    if (!r) { add(id, "fresh", name, "오류", "FAIL", "collect-status.js 에 이 수집원이 없다", "tools/collect-status.js SOURCES", 1); return; }
    const status = r.state === "정상" ? "OK" : r.state === "지연" ? "WARN" : "FAIL";
    add(id, "fresh", `${name} 경과일(지연 ${r.warn}·늦음 ${r.late})`, r.age == null ? "기록 없음" : `${r.age}일 (${r.last})`, status,
      r.every, r.how || `워크플로 ${r.wf} — 멈췄으면 Actions 로그`, r.age == null ? 1 : Math.min(1, r.age / Math.max(1, r.late)));
  });
}

// ════ D. 카드 사실 커버리지(추적 카드 = 세트 Top 10 × 22) ════
{
  const n = CARDS.length;
  const nmOk = CARDS.filter(({ c }) => N.nmUsable(c));
  const hidden = CARDS.filter(({ c }) => c.nmHiddenReason).length;
  const noDate = CARDS.filter(({ c }) => N.isPositive(c.nmJpy) && !N.isDate(c.nmUpdated) && !c.nmHiddenReason).length;
  const noVal = n - nmOk.length - hidden - noDate;
  add("D1", "cards", "쓸 수 있는 NM(값·읽은 날·숨김 없음)", `${nmOk.length}/${n}`, nmOk.length === n ? "OK" : "WARN",
    `숨김 ${hidden} · 읽은 날 없음 ${noDate} · 값 없음 ${noVal}`,
    "유유테이 NM 재수집(수집 스킬 4절, 변형별 매칭) — 숨김(nmHiddenReason)은 사유가 풀리면 지운다. 술어는 market-data-normalizers.nmUsable 한 곳",
    (n - nmOk.length) / n);
  const p10 = CARDS.filter(({ c }) => AI.psa10Sold(c, PACKS.updated)).length;
  const p10Stale = CARDS.filter(({ c }) => AI.psa10Sold(c, PACKS.updated) && (daysSince(c.psa10Ebay.updated) || 0) > 35).length;
  add("D2", "cards", "PSA10 실거래 쓸 수 있음(sold n>=3, AI 피드 술어)", `${p10}/${n}`, "OK",
    `그중 35일 넘은 것 ${p10Stale}`, "node tools/psa10-sold-refresh.js → 브라우저 수집 → node tools/psa10-sold-write.js(변형 분리 필수). 술어는 ai-data-model.psa10Sold 한 곳",
    (n - p10) / n);
  const J = (CL.doc().jp || {}).cards || {};
  const byNum = new Set(Object.values(J).map((x) => x.num));
  const withRarity = CARDS.filter(({ code, c }) => CL.rarityCode(code, c)).length;
  const noRow = CARDS.filter(({ c }) => !byNum.has(c.number)).length;
  add("D3", "cards", "레어도 코드 있음(공식 카드리스트 기준)", `${withRarity}/${n}`, withRarity === n ? "OK" : "WARN",
    `공식 목록에 번호 행이 없는 카드 ${noRow}`, "node tools/fetch-official-cardlist.js(매일 자동). 번호 행이 있는데 변형이 갈리면 _imgSuffix 로 인쇄를 확정. 함수는 card-list-shared.rarityCode 한 곳",
    (n - withRarity) / n);
  const self = CARDS.filter(({ c }) => c.image && (/^https:\/\/opboxindex\.com\//.test(c.image) || !/^https?:/.test(c.image))).length;
  const anyImg = CARDS.filter(({ c }) => c.image || c.img).length;
  add("D4", "cards", "이미지 있음(자체호스팅 / 전체)", `${self} / ${anyImg} (전체 ${n})`, anyImg === n ? "OK" : "WARN",
    "", "node tools/fetch-card-images.js · 일본판 공식 이미지는 tools/selfhost-jp-images.js(가드 I1: 외부 핫링크 금지)", (n - self) / n);
}

// ════ E. 일관성 가드·재계산 감사 ════
{
  // 가드 수는 소스의 checks 배열에서 센다(가드가 결과 파일을 남기지 않는다). 돌리는 건 14초라 --guard 때만.
  let defined = null;
  try { const m = read("tools/guard-invariants.js").match(/checks:\s*\[([^\]]*)\]/); defined = m ? (m[1].match(/"[A-Z0-9]+"/g) || []).length : null; } catch { defined = null; }
  if (RUN_GUARD) {
    let out = "", ok = false, errs = 0, warns = 0;
    try { out = execFileSync(process.execPath, [path.join(__dirname, "guard-invariants.js")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }); ok = true; }
    catch (e) { out = String(e.stderr || e.stdout || ""); }
    try { const j = JSON.parse(out); errs = (j.errors || []).length; warns = (j.warnings || []).length; ok = j.guard === "OK"; } catch { /* 파싱 실패 = FAIL 로 둔다 */ }
    add("E1", "guards", `가드 통과(정의 ${defined ?? "?"}개)`, ok ? `통과 · 경고 ${warns}` : `FAIL · 오류 ${errs}`, ok ? "OK" : "FAIL",
      "", "node tools/guard-invariants.js | head — FAIL 이면 푸시 금지(소유자 절대지시)", ok ? 0 : 1);
  } else {
    add("E1", "guards", `가드 정의 수(이번 실행에선 안 돌림)`, `${defined ?? "?"}개`, "INFO", "--guard 를 주면 돌려서 통과/오류 수를 낸다(약 14초)",
      "node tools/guard-invariants.js | head");
  }
  const bs = runJSON("audit-box-series.js", ["--json"]);
  add("E2", "guards", "박스 그래프 값 재계산 불일치(원장에서 독립 계산)", bs ? `${(bs.problems || []).length}` : "오류",
    !bs ? "FAIL" : (bs.problems || []).length ? "FAIL" : "OK", bs ? `계열 ${bs.checkedSeries} · 점 ${bs.checkedPoints} 대조` : "audit-box-series.js 를 못 읽었다",
    "node tools/audit-box-series.js — 불일치면 node tools/build-box-sold-series.js 를 다시 돌리고, 그래도 다르면 생성기 규칙이 바뀐 것(그 파일 머리)", bs ? Math.min(1, (bs.problems || []).length / 5) : 1);
}

// ════ F. 페이지·공개 파일 ════
{
  const thin = runJSON("audit-thin-pages.js");
  add("F1", "pages", "얇은 색인 페이지(본문 1,600자 미만 그리고 데이터 셀 24개 미만)", thin ? `${thin.thin}/${thin.indexablePages}` : "오류",
    !thin ? "FAIL" : thin.thin ? "WARN" : "OK", thin ? list((thin.pages || []).map((p) => `${p.page}(${p.chars}자·${p.cells}셀)`), 4) : "",
    "데이터가 쌓이면 해소(신작 세트). noindex 로 숨기지 않는다 — 노출 상태 변경은 소유자 판단", thin ? Math.min(1, thin.thin / 10) : 1);
  const seo = runJSON("audit-seo.js");
  add("F2", "pages", "메타·구조화데이터 누락(audit-seo 오류)", seo ? `${(seo.errors || []).length}` : "오류",
    !seo ? "FAIL" : (seo.errors || []).length ? "FAIL" : "OK", seo ? list(seo.errors || [], 3) : "audit-seo.js 를 못 읽었다",
    "node tools/audit-seo.js — 생성기(generate-*-pages.js)에서 고친다. 산출물 HTML 을 직접 고치지 않는다", seo ? Math.min(1, (seo.errors || []).length / 5) : 1);

  // "as of YYYY-MM-DD" / "YYYY-MM-DD 기준" 이 STALE_DAYS 보다 오래된 색인 페이지 — 낡은 날짜를 단 값은 화면에 있는 한 독자에게 "현재" 로 읽힌다.
  const stale = [];
  let scanned = 0;
  for (const d of ["", "sets", "cards", "ko", "ja", "articles"]) {
    if (!exists(d || ".")) continue;
    for (const f of fs.readdirSync(R(d || "."))) {
      if (!f.endsWith(".html") || f.startsWith("_") || /^(google|naver|BingSiteAuth)/i.test(f)) continue;
      const rel = d ? `${d}/${f}` : f;
      const html = read(rel);
      if (/<meta name="robots" content="noindex/.test(html)) continue;
      scanned++;
      const ds = [];
      for (const m of html.matchAll(/\b[Aa]s of (\d{4}-\d{2}-\d{2})/g)) ds.push(m[1]);
      for (const m of html.matchAll(/(\d{4}-\d{2}-\d{2}) 기준/g)) ds.push(m[1]);
      const old = [...new Set(ds)].filter((x) => (daysSince(x) || 0) > STALE_DAYS).sort();
      if (old.length) stale.push(`${rel}(${old[0]})`);
    }
  }
  add("F3", "pages", `색인 페이지의 "as of" 날짜 ${STALE_DAYS}일 초과`, `${stale.length}/${scanned}`, stale.length ? "WARN" : "OK", list(stale, 5),
    "그 값의 수집원을 돌린다(카드 페이지면 대개 PSA10 실거래 — C9/D2). 값이 더는 안 나오면 생성기가 날짜 대신 \"—\" 를 내게 한다", Math.min(1, stale.length / 20));

  // AI 피드·RSS 나이 — 답변 AI 가 읽는 파일. 데이터일(datasetUpdatedOn)이 오늘에서 멀면 사이트는 새것인데 AI 는 옛것을 말한다.
  const feeds = [];
  for (const f of ["opbox-ai-data.json", "opbox-ai-cards.json", "opbox-ai-grading.json", "opbox-ai-auctions.json"]) {
    const j = readOr(f, null);
    feeds.push([f.replace(/^opbox-ai-|\.json$/g, ""), j ? daysSince(j.datasetUpdatedOn) : null]);
  }
  { const m = exists("llms.txt") ? read("llms.txt").match(/[Dd]ata as of (\d{4}-\d{2}-\d{2})/) : null; feeds.push(["llms", m ? daysSince(m[1]) : null]); }
  { const m = exists("feed.xml") ? read("feed.xml").match(/<lastBuildDate>([^<]+)</) : null; const t = m ? Date.parse(m[1]) : NaN; feeds.push(["rss", Number.isNaN(t) ? null : Math.round((Date.parse(`${today}T00:00:00Z`) - t) / DAY)]); }
  const ages = feeds.map(([, a]) => a);
  const worst = ages.some((a) => a == null) ? null : Math.max(...ages);
  add("F4", "pages", "AI 피드·RSS 나이(가장 오래된 것, 일)", worst == null ? "읽기 실패" : `${worst}`,
    worst == null ? "FAIL" : worst <= 2 ? "OK" : worst <= 7 ? "WARN" : "FAIL", feeds.map(([k, a]) => `${k} ${a == null ? "?" : a}`).join(" · "),
    "node tools/generate-ai-data.js → generate-ai-extras.js → generate-llms.js → generate-feed.js(수집 스킬 6절 순서)", worst == null ? 1 : Math.min(1, worst / 7));

  // 검증 안 된 값 때문에 비운 칸 — 규칙은 market-data-normalizers.priciest·countedValues 한 곳(가드 PC1·CM1 이 페이지와 대조).
  const priciestBlank = [], metricsBlank = [];
  for (const [code, s] of TRACKED) {
    const cards = s.cards || [];
    if (!N.priciest(cards, FX)) priciestBlank.push(code);
    const top = cards.slice(0, 10);
    const rv = N.rawValues(top, FX);
    if (!N.countedValues(top, FX) && rv.verified.length + rv.unverified.length >= 5) metricsBlank.push(code);
  }
  add("F5", "pages", "가장 비싼 카드가 빈칸인 세트(검증 안 된 값이 1위 이상)", `${priciestBlank.length}/${TRACKED.length}`, priciestBlank.length ? "WARN" : "OK", list(priciestBlank, 8),
    "막는 카드의 NM 을 다시 읽는다(수집 스킬 4절) 또는 숨김 사유를 정리 — 다음 카드를 1위로 올리지 않는다", priciestBlank.length / TRACKED.length);
  add("F6", "pages", "세트 지표 3칸이 빈칸인 세트(검증 안 된 값이 바닥 이상)", `${metricsBlank.length}/${TRACKED.length}`, metricsBlank.length ? "WARN" : "OK", list(metricsBlank, 8),
    "F5 와 같다 — 세트 Top 10 안 못 쓰는 NM(읽은 날 없음·숨김)을 없앤다", metricsBlank.length / TRACKED.length);

  const pq = readOr("data/price-quality-audit.json", null);
  const sm = (pq && pq.summary) || {};
  add("F7", "pages", "가격 품질 감사(block / review)", pq ? `${sm.block || 0} / ${sm.review || 0}` : "없음", !pq ? "WARN" : sm.block ? "FAIL" : sm.review ? "WARN" : "OK",
    pq ? `감사일 ${String(pq.updated || "").slice(0, 10)} · 사유: ${list([...new Set((pq.issues || []).map((i) => i.reason))], 3)}` : "data/price-quality-audit.json 없음",
    "node tools/audit-price-quality.js(매일 자동) — psa10_price_stale 이면 C9/D2 의 PSA10 실거래 재수집", pq ? Math.min(1, ((sm.block || 0) * 5 + (sm.review || 0)) / 30) : 1);

  // Lighthouse — tools/audit-site-quality.mjs --lighthouse 가 .planning/**/lighthouse-*.json 으로 남긴다(로컬 전용 폴더). 없으면 "측정 안 됨".
  let lh = null;
  (function walk(dir, depth) {
    if (depth > 4 || !fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (/^lighthouse-.*\.json$/.test(f) && (!lh || st.mtimeMs > lh.mtime)) lh = { file: p, mtime: st.mtimeMs };
    }
  })(R(".planning"), 0);
  if (lh) {
    let scores = "";
    try { const j = JSON.parse(fs.readFileSync(lh.file, "utf8")); scores = Object.entries(j.categories || {}).map(([k, v]) => `${k} ${Math.round((v.score || 0) * 100)}`).join(" · "); } catch { scores = "점수 읽기 실패"; }
    const d = new Date(lh.mtime).toISOString().slice(0, 10), age = daysSince(d);
    add("F8", "pages", "Lighthouse 마지막 측정", `${d} (${age}일 전)`, age > 30 ? "WARN" : "OK", scores, "node tools/audit-site-quality.mjs after --lighthouse", Math.min(1, age / 60));
  } else {
    add("F8", "pages", "Lighthouse 마지막 측정", "측정 안 됨", "WARN", "저장된 결과 파일이 없다(.planning/**/lighthouse-*.json)", "node tools/audit-site-quality.mjs after --lighthouse", 0.1);
  }
}

// ── G. AI 인용(로컬 주간 추적기 요약) — 2026-10-19. 추적기(저장소 밖 box-sold-cdp/ai-citations.js)가 이 PC 에만 남기는 요약 행(AI1~AI5)을 읽는다.
//    파일이 없으면(워크플로·다른 PC) 행을 만들지 않는다. 질문 원문·답 원문은 읽지 않는다 — 요약의 id·지표명·값·상태·메모만.
{
  const f = process.env.OPBOX_AI_CITATIONS || path.join(ROOT, "..", "ai-citations", "score.json");
  let s = null;
  try { s = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  if (s && Array.isArray(s.rows)) {
    const age = daysSince(s.date);
    for (const r of s.rows) if (/^AI\d$/.test(r.id)) add(r.id, "ai", `${r.name}`, `${r.value} (${s.date}${age != null ? `, ${age}일 전` : ""})`, age != null && age > 9 ? "WARN" : r.status, r.status === "WARN" ? r.note : age != null && age > 9 ? "추적기 실행이 9일 넘게 없다" : "", r.fix || "AI 인용 추적기 재실행", r.status === "WARN" ? 0.3 : 0);
  }
}

// ── 최악 1건 — rank(FAIL>WARN>미달 OK) 가 높고, 같은 rank 면 shortfall 이 큰 것. 같으면 위쪽 행(박스 → 시계열 → 신선도 → 카드 → 가드 → 페이지).
const worst = rows.reduce((w, r) => (!w || r.rank > w.rank || (r.rank === w.rank && r.shortfall > w.shortfall) ? r : w), null);
const counts = { FAIL: 0, WARN: 0, OK: 0, INFO: 0 };
for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

if (JSON_OUT) {
  console.log(JSON.stringify({ today, counts, worst: worst && { id: worst.id, name: worst.name, value: worst.value, status: worst.status, fix: worst.fix }, rows }, null, 1));
  process.exit(0);
}

// 콘솔 표. 윈도우 cp949 라 이모지를 쓰지 않는다. 한글은 2칸으로 센다.
const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - w(s)));
const GROUPS = { box: "A. 박스 실거래 커버리지", series: "B. 시계열 연속성", fresh: "C. 신선도(마지막 관측 경과일)", cards: "D. 카드 사실 커버리지", guards: "E. 일관성 가드", pages: "F. 페이지·공개 파일", ai: "G. AI 인용(로컬 추적기)" };
const out = [`연구 품질 점수판 — ${today}   (FAIL ${counts.FAIL} · WARN ${counts.WARN} · OK ${counts.OK} · INFO ${counts.INFO})`, "정의·개선 방법: docs/quality-scorecard.md (지표 ID 기준)", ""];
let g = null;
for (const r of rows) {
  if (r.group !== g) { g = r.group; out.push(`[${GROUPS[g]}]`); }
  out.push(`  ${pad(r.status, 5)} ${pad(r.id, 4)} ${pad(r.name, 52)} ${r.value}`);
  if (r.note) out.push(`             ${pad("", 4)} ${r.note}`);
}
out.push("");
if (worst) {
  out.push("== 최악 1건 — 이번 작업에서 고칠 것 ==");
  out.push(`  ${worst.id} ${worst.name} — ${worst.value} (${worst.status})`);
  if (worst.note) out.push(`  ${worst.note}`);
  out.push(`  고치려면: ${worst.fix}`);
}
console.log(out.join("\n"));
