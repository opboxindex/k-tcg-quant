"use strict";
// 원장·시계열·데이터 파일 무결성 — 사실 파일의 입력 쪽. 2026-10-15 분할. (append-only 원장은 여기서 읽기만 한다)
//  D1 시세 시리즈 매니페스트 [2026-07-17 야간봇 덮어씀] · D2 PSA 스냅샷 = 현재 총량 · D3 PSA 전수 이력 = 검증 원천 · D5/D5b 박스 sold 시계열·boxMarket currency [2026-07-23 $0.00]
//  D6 박스 원장 유일키 id+판매일 [2026-08-25] · D7/D8 TAG·CGC 주간 이력 append-only · D9 카드 경매 집계 형식 · D10/D11 CGC·TAG 카드별 이력
//  D12 다른 카드게임 혼입 금지 [2026-09-24 건담 EB-01] · D13 진행매물 스냅샷 = 시계열 점 [2026-09-30] · D15 원장 판매일 = eBay 표시일 [2026-10-01]
//  D16 미발매 판에 sold 숫자 금지(시계열·원장 대조) [2026-10-14 OP-18 예약판매가 sold 로] · A1/A3 경매 원장(원피스·TCG) · A2 경매 시계열 축 [2026-08-25 GMV +16.9%]
//  A5 TCG 스냅샷 시각·offHour [2026-10-13] · G8 그레이더 커버리지 회귀 [2026-07-22 CGC 1페이지만] · G9(원장) 만점 분리값 = 마지막 점 [2026-09-30]
//  M1/M2 변형 혼입(같은 PSA10 구간·NM 대비 배율) [2026-07-28] · X2 일본판 이미지 오배정 [2026-07-27] · Y1/Y2 cardCount·최신 세트 cards [2026-09-30]
//  P1 공급 시계열 고지 · T2 방문자 페이로드 상한·포맷 [2026-08-31] · T3 2시간마다 재작성되는 파일 상한 [2026-08-28] · OL1/OL2 sold 이상치 회계·고립 점 [2026-10-15 OP-07]
//  R2(원장) 재판 기록 분류·출처 [2026-08-13·4차] · UP1(원장) set-facts 레어리티 합 = cardTypes · CL1(원장) 공식 카드리스트 저장 필드 화이트리스트 [2026-10-14 W7]
const { ROOT, errors, warnings, read, exists, list, json, packs, series, setFacts, fs, path } = require("./lib");

const checks = ["D1", "D2", "D3", "D5", "D5b", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D15", "D16", "A1", "A2", "A3", "A5", "G8", "G9", "M1", "M2", "X2", "Y1", "Y2", "P1", "T2", "T3", "OL1", "OL2", "R2", "UP1", "CL1"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const codesOf = (P) => [...(P.jp?.list || []), ...(P.extra?.list || [])];
// append-only 주간 이력 공통(D5·D7·D8): 날짜 오름차순, 값 조건
const walkSeries = (id, sets, check) => {
  for (const [code, eds] of Object.entries(sets || {})) for (const ed of ["jp", "en"]) {
    let prev = "";
    for (const p of (eds || {})[ed] || []) {
      if (!p || typeof p.d !== "string") { errors.push(`${id}: ${code}.${ed} 날짜 없는 점`); break; }
      if (p.d <= prev) { errors.push(`${id}: ${code}.${ed} 날짜 역행/중복 (${prev}→${p.d}) — append-only 위반`); break; }
      const bad = check(p); if (bad) { errors.push(`${id}: ${code}.${ed} ${p.d} ${bad}`); break; }
      prev = p.d;
    }
  }
};

function run() {
  const P = packs(), codes = codesOf(P);
  // D1 · D2
  for (const [k, kind] of Object.entries(json("tools/series-source-manifest.json"))) {
    const [code, key] = k.split("|"), src = P.sets?.[code]?.[key]?.source;
    if (!src) errors.push(`D1: ${code}.${key} 시리즈가 사라짐 (매니페스트엔 ${kind}로 존재)`);
    else if (kind === "wm" && !/Weekly ungraded/i.test(src)) errors.push(`D1: ${code}.${key}.source="${src}" — wm 시리즈가 덮어써짐`);
  }
  const snap = (json("data/psa-population-snapshots.json", { snapshots: [] }).snapshots || []).at(-1);
  if (!snap) errors.push("D2: PSA cumulative snapshot archive missing or empty");
  else for (const code of codes) { const s = P.sets?.[code]?.psaFull; if (snap.date === s?.updated && snap.sets?.[code] !== s?.total) errors.push(`D2: ${code} current PSA total differs from stored ${snap.date} snapshot`); }
  // D3 — psaPending 은 psaFull/psaWeekly 가 아예 없고 발매 90일 이내일 때만(OP-17 표본 1장 사고)
  const V = json("data/gemrate-psa-history.json", null);
  if (!V) errors.push("D3: verified full-set PSA history source missing");
  else for (const code of codes) {
    const live = P.sets?.[code] || {}, full = live.psaFull, points = live.psaWeekly?.points, src = V.sets?.[code];
    if (live.psaPending) {
      const age = Number.isFinite(Date.parse(live.release || "")) ? Math.floor((Date.now() - Date.parse(live.release)) / 864e5) : Infinity;
      if (full || points) errors.push(`D3: ${code} psaPending 인데 psaFull/psaWeekly 가 남아 있다`); else if (age > 90) errors.push(`D3: ${code} psaPending 이 발매 ${age}일째까지 켜져 있다`);
      continue;
    }
    if (!src || !full) { errors.push(`D3: ${code} full-set PSA source or live data missing`); continue; }
    if (full.total !== src.latest?.totalGrades || full.gems !== src.latest?.totalGems) errors.push(`D3: ${code} full-set PSA totals differ from verified source`);
    if (!Array.isArray(points) || points.length < 4 || points.at(-1)?.d !== V.weeklyThrough) errors.push(`D3: ${code} weekly PSA graph does not reach ${V.weeklyThrough}`);
    if (JSON.stringify(points || []) !== JSON.stringify((src.weekly || []).map((p) => ({ d: p.d, v: p.grades })))) errors.push(`D3: ${code} weekly PSA graph differs from the verified source`);
    const have = new Set((points || []).map((p) => p.d)), corr = new Set((V.corrections?.[code] || []).map((e) => e.date)), first = points?.[0]?.d;
    for (const d of V.retainedWeeklyDates || []) if (first && d >= first && !have.has(d) && !corr.has(d)) errors.push(`D3: ${code} retained PSA week ${d} was deleted`);
    if (points?.some((p) => !Number.isFinite(p.v) || p.v < 0)) errors.push(`D3: ${code} weekly PSA graph contains an invalid value`);
  }
  // D5b · D13 · M1/M2 · X2 · Y1/Y2 — packs 안 값
  for (const [code, s] of Object.entries(P.sets || {})) {
    for (const ed of ["jp", "en"]) { const es = s.boxMarket?.[ed]?.ebaySold; if (es && es.median != null) { if (!es.currency) errors.push(`D5b: ${code}.${ed}.ebaySold median 있는데 currency 없음 — 화면 $0.00 표시 위험`); if (!(typeof es.median === "number" && es.median > 0)) errors.push(`D5b: ${code}.${ed}.ebaySold median 이상 (${es.median})`); } }
    if (/^(OP|EB|PRB)-\d+$/.test(code) && s.cardCount != null && !(Number(s.cardCount) >= 50)) errors.push(`Y1: ${code} cardCount=${s.cardCount} — 50 미만이면 세트 수록 종류 수가 아니다`);
    const byNum = {};
    (s.cards || []).forEach((c, i) => {
      if (c.number) (byNum[c.number.toUpperCase()] ||= []).push({ i, c });
      if (/\bTR\b/.test(c.name || "") && /img\/jp\//.test(c.image || "")) errors.push(`X2: ${code}[${i}] ${c.number} "${c.name}" 은 TR(영문 전용)인데 일본판 이미지 배정`);
      const local = (c.image || "").replace(/^https?:\/\/opboxindex\.com\//, "");
      if (/^img\/jp\//.test(local) && !exists(local)) errors.push(`X2: ${code}[${i}] ${c.number} 의 이미지 ${c.image} 파일 없음`);
    });
    for (const [n, arr] of Object.entries(byNum)) {
      const sig = arr.filter((x) => x.c.psa10Ebay).map((x) => `${x.c.psa10Ebay.low}|${x.c.psa10Ebay.high}`);
      if (sig.length > 1 && new Set(sig).size < sig.length) errors.push(`M1: ${code} ${n} — 서로 다른 변형이 같은 PSA10 sold 구간을 쓰고 있음`);
      for (const { i, c } of arr) {
        const p = c.psa10Ebay, mid = p?.middle;
        if (!mid || !c.nmJpy || c.nmJpy < 10000) continue;   // 싼 카드는 등급비 때문에 배율이 크다
        if (p.currency !== "USD" && p.currency !== "KRW") { errors.push(`M2: ${code} #${i} ${c.name} — psa10Ebay.currency "${p.currency}" — 환산 못 함`); continue; }
        if (p.currency === "USD" && !P.fx?.usdKrw) { errors.push(`M2: ${code} #${i} — fx.usdKrw 없음`); continue; }
        const mult = (p.currency === "USD" ? mid * P.fx.usdKrw : mid) / (c.nmJpy * 10.1);
        if (mult > 30) errors.push(`M2: ${code} #${i} ${c.name} — PSA10 이 NM 의 ${mult.toFixed(0)}배. 둘 중 하나가 다른 변형 값일 가능성`);
      }
    }
  }
  for (const f of json("data/jp-image-verdicts.json", { fixed: [] }).fixed || []) {
    const c = (P.sets?.[f.set]?.cards || [])[f.idx];
    if (c && c.number === f.num && (c.image || "").split("/").pop() !== f.after) errors.push(`X2: ${f.set}[${f.idx}] ${f.num} 이미지가 시각검증 결과 ${f.after} 와 다르다(${f.why}) — jp-image-verdicts.json 을 먼저 고칠 것`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const latest = Object.entries(P.sets || {}).filter(([c, s]) => /^OP-\d+$/.test(c) && s.release && s.release < today).sort((a, b) => a[1].release.localeCompare(b[1].release)).pop();
  if (latest && !(latest[1].cards || []).length) errors.push(`Y2: ${latest[0]}(발매 ${latest[1].release}) cards 가 비어 있음 — node tools/seed-set-top-cards.js ${latest[0]}`);
  try {
    const { editionPoint } = require("../update-box-series-history");
    for (const code of codes) for (const ed of ["jp", "en"]) {
      const want = editionPoint(P.sets?.[code], ed, P.fx);
      if (!want) continue;
      const pts = P.sets[code][want.key]?.points || [];
      if (!pts.some((p) => p.d === want.point.d)) errors.push(`D13: ${code}.${want.key} 에 ${ed} 진행매물 스냅샷(${want.point.d}) 점이 없다 — node tools/update-box-series-history.js`);
      const later = pts.filter((p) => p.basis === "active" && p.d > want.point.d).map((p) => p.d);
      if (later.length) errors.push(`D13: ${code}.${want.key} 에 스냅샷(${want.point.d})보다 늦은 active 점 ${later.join(",")}`);
    }
  } catch (e) { errors.push("D13: editionPoint 실행 실패 — " + e.message); }

  // D5 · D6 · D12 · D15 · D16 · OL1 · OL2 — 박스 sold 시계열과 원장
  const bs = json("data/box-sold-series.json", null), lg = json("data/box-sold-ledger.json", null);
  if (bs) {
    if ((bs.basis || bs.window?.basis) !== "sold") errors.push("D5: box-sold-series 의 basis 가 'sold' 가 아님");
    if (!/sold/i.test(bs.note || "") || !/date of sale|sale date/i.test(bs.note || "") || (bs.window && bs.window.datedBy !== "saleDate")) errors.push("D5: box-sold-series 가 판매일 기준이라는 고지를 잃음");
    walkSeries("D5", bs.sets, (p) => (!(typeof p.median === "number" && p.median > 0) ? "median 이상" : p.n != null && (!Number.isInteger(p.n) || p.n < 0) ? "n(판매수) 이상" : null));
    if (!DATE.test(bs.asOf || "")) errors.push("D16: box-sold-series.asOf 가 없다 — 모든 표가 같은 기준일을 읽어야 한다");
    const isBin = (r) => r && DATE.test(r.d) && Number(r.unit) > 0 && r.fmt === "bin";
    for (const [code, node] of Object.entries(bs.sets || {})) {
      if (!node.release || !node.current || !node.preRelease) { errors.push(`D16: ${code} 에 release/current/preRelease 가 없다 — build-box-sold-series.js 가 발매일로 자르지 않았다`); continue; }
      for (const ed of ["jp", "en"]) {
        const rel = node.release[ed];
        if (rel) {
          const bad = [...(node[ed] || []), ...(ed === "en" ? node.enBlue || [] : []), ...((node.daily || {})[ed] || [])].filter((p) => p && p.d < rel).map((p) => p.d)
            .concat(((node.monthly || {})[ed] || []).filter((p) => p && p.d.slice(0, 7) < rel.slice(0, 7)).map((p) => p.d), Object.keys((node.counts || {})[ed] || {}).filter((d) => d < rel));
          if (bad.length) errors.push(`D16: ${code}.${ed} sold 시계열에 발매일(${rel}) 이전 점 ${bad.length}개(${bad[0]}) — 예약판매는 preRelease 로만`);
          if (lg) { const pre = (((lg.sets || {})[code] || {})[ed] || []).filter((r) => isBin(r) && r.d < rel).length, got = node.preRelease[ed]?.sales || 0; if (pre !== got) errors.push(`D16: ${code}.${ed} 원장의 발매 전 즉구 ${pre}건 ≠ preRelease ${got}건`); }
          if (rel > bs.asOf && node.current[ed]) errors.push(`D16: ${code}.${ed} 미발매(${rel})인데 current 값이 있다`);
          const es = P.sets?.[code]?.boxMarket?.[ed]?.ebaySold; if (es && es.updated && es.updated < rel) errors.push(`D16: packs ${code}.${ed} ebaySold(${es.updated})가 발매일 이전 관측이다`);
        }
        const pr = node.preRelease[ed]; if (pr && pr.median != null && !(pr.listings >= (bs.preReleaseMinListings || 3))) errors.push(`D16: ${code}.${ed} 예약판매 매물 ${pr.listings}개로 중앙값을 냈다`);
      }
      // OL2 — 점 하나가 앞 3점·뒤 3점 중앙값 양쪽보다 같은 방향으로 30% 넘게 다르면 창 안 몇 건이 만든 값(OP-07 9/17·9/24 $134)
      const mid = (a) => { const s = a.map((p) => p.median).sort((x, y) => x - y); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
      for (const ed of ["jp", "en"]) {
        const pts = (node[ed] || []).filter((p) => p && p.median > 0);
        for (let i = 2; i < pts.length - 2; i++) {
          const a = mid(pts.slice(Math.max(0, i - 3), i)), b = mid(pts.slice(i + 1, i + 4)), ra = pts[i].median / a - 1, rb = pts[i].median / b - 1;
          if (Math.abs(ra) > 0.3 && Math.abs(rb) > 0.3 && Math.sign(ra) === Math.sign(rb)) errors.push(`OL2: ${code}.${ed} ${pts[i].d} $${pts[i].median}(n ${pts[i].n}) — 앞 3점 $${a} · 뒤 3점 $${b} 와 같은 방향으로 30% 넘게 다르다(markOutliers 확인)`);
        }
      }
    }
  }
  if (lg) {
    if (!/append-only|never modified/i.test(lg.note || "")) errors.push("D6: ledger note 에 append-only 고지 누락");
    if (lg.dateBasis !== "ebay-display-date" || !DATE.test(lg.migratedAt || "")) errors.push(`D15: box-sold-ledger.json dateBasis/migratedAt 이 이관 뒤 값이 아니다 — node tools/migrate-box-sold-dates-20261001.js`);
    const { OTHER_GAME } = require("../other-game-words");
    const hits = [], ids = new Set();
    for (const [code, eds] of Object.entries(lg.sets || {})) for (const ed of ["jp", "en"]) {
      for (const r of (eds || {})[ed] || []) {
        if (OTHER_GAME.test(r.title || "")) hits.push(`${code}.${ed} ${r.id} "${(r.title || "").slice(0, 50)}"`);
        const k = `${r.id}|${r.d}`;
        if (!r.id || ids.has(k)) { errors.push(`D6: ${code}.${ed} id+판매일 누락/중복 (${r.id} ${r.d})`); break; }
        ids.add(k);
        if (!DATE.test(r.d || "")) { errors.push(`D6: ${code}.${ed} ${r.id} 날짜 형식 이상 (${r.d})`); break; }
        if (!(Number.isFinite(r.unit) && r.unit > 0 && r.unit <= 8000)) { errors.push(`D6: ${code}.${ed} ${r.id} unit 이상 (${r.unit}) — 상한 8000(OP-01 영문 초판 $5,205)`); break; }
        if (!(Number.isInteger(r.qty) && r.qty >= 1 && r.qty <= 24)) { errors.push(`D6: ${code}.${ed} ${r.id} qty 이상 (${r.qty})`); break; }
        if (r.d > (r.seen || lg.updated || "9999-99-99")) { errors.push(`D15: ${code}.${ed} ${r.id} 판매일 ${r.d} 이 수집일보다 늦다 — 날짜가 두 번 이관됐나`); break; }
      }
    }
    if (hits.length) errors.push(`D12: 원장에 다른 카드게임 상품 ${hits.length}건 — node tools/repair-box-ledger.js: ${hits.slice(0, 3).join(" · ")}`);
  }
  if (bs && lg) ol1(bs, lg);

  // D7 · D8 · G8 · G9(원장·packs)
  const led = { cgc: json("data/cgc-grading-history.json", null), tag: json("data/tag-grading-history.json", null) };
  for (const [key, h] of Object.entries(led)) {
    if (!h) continue;
    const id = key === "tag" ? "D7" : "D8";
    if (h.grader !== key || !new RegExp(key, "i").test(h.note || "") || !/append-only/i.test(h.note || "")) errors.push(`${id}: ${key}-grading-history 의 grader/note(append-only) 이상`);
    walkSeries(id, h.sets, (p) => (!(Number.isInteger(p.total) && p.total > 0) ? "total 이상" : key === "tag" && !(Number.isInteger(p.gem) && p.gem >= 0 && p.gem <= p.total) ? "gem 이상" : null));
    const byDate = {};
    for (const [code, eds] of Object.entries(h.sets || {})) for (const ed of ["jp", "en"]) for (const p of eds[ed] || []) {
      (byDate[p.d] ||= new Set()).add(`${code}|${ed}`);
      if (key === "cgc" && p.grades) { const top = ["Pristine 10", "Gem Mint 10", "Perfect 10"].reduce((a, g) => a + (p.grades[g] || 0), 0); if (Object.values(p.grades).some((v) => !Number.isInteger(v) || v < 0) || top > p.total) errors.push(`G9: CGC ${code}.${ed} ${p.d} 분리값 이상`); }
      if (key === "tag" && (p.g10 != null || p.g10p != null) && p.gem !== p.g10 + p.g10p) errors.push(`G9: TAG ${code}.${ed} ${p.d} gem ${p.gem} ≠ 10(${p.g10}) + 10P(${p.g10p})`);
    }
    const days = Object.keys(byDate).sort();
    if (days.length >= 2) { const [prev, last] = days.slice(-2); if (byDate[last].size < byDate[prev].size) errors.push(`G8: ${key.toUpperCase()} ${last} 커버리지 ${byDate[last].size} < 직전 ${prev} ${byDate[prev].size} — 목록 페이지를 끝까지 읽었는지 확인(빠진 것: ${[...byDate[prev]].filter((k) => !byDate[last].has(k)).slice(0, 6).join(", ")})`); }
  }
  // 화면 블록(packs.graders)은 마지막 점의 분리값만 — 옛 분리값이 총량 옆에 '현재'처럼 붙지 않게
  const FIELDS = { cgc: [["pristine10", (p) => p.grades?.["Pristine 10"]], ["gemMint10", (p) => p.grades?.["Gem Mint 10"]], ["perfect10", (p) => p.grades?.["Perfect 10"]]], tag: [["g10", (p) => p.g10], ["g10p", (p) => p.g10p]] };
  for (const [code, s] of Object.entries(P.sets || {})) for (const key of ["cgc", "tag"]) for (const ed of ["jp", "en"]) {
    const e = s.graders?.[key]?.[ed], last = (led[key]?.sets?.[code]?.[ed] || []).slice().sort((a, b) => a.d.localeCompare(b.d)).at(-1);
    if (!e || !last) continue;
    for (const [f, get] of FIELDS[key]) if ((e[f] ?? null) !== (get(last) ?? null)) errors.push(`G9: ${code} ${key}.${ed}.${f} 화면 ${e[f] ?? "—"} ≠ 원장 마지막 점(${last.d}) ${get(last) ?? "—"}`);
  }
  // D9 · D10/D11 — 카드 경매 집계·카드별 등급 이력
  const cs = json("data/auction-card-stats.json", null);
  if (cs) {
    if (!/per-card/i.test(cs.note || "") || !/auction-archive/i.test(cs.note || "")) errors.push("D9: note 에 파생 출처(auction-archive) 고지 누락");
    for (const [id, c] of Object.entries(cs.cards || {})) {
      const bad = !(Number.isInteger(c.sold) && c.sold >= 3) ? "sold 표본 미달" : c.medPrice != null && !(c.medPrice > 0) ? "medPrice 이상" : c.sellThrough != null && !(c.sellThrough >= 0 && c.sellThrough <= 100) ? "sellThrough 이상" : c.low != null && c.high != null && c.low > c.high ? "low>high" : !(c.name === null || typeof c.name === "string") ? "name 형식" : null;
      if (bad) { errors.push(`D9: ${id} ${bad}`); break; }
    }
    const NS = new Set(["override", "official", "catalog", "title"]);
    for (const [key, v] of Object.entries(cs.variants || {})) {
      const bad = !(Number.isInteger(v.sold) && v.sold >= 3) ? "sold 표본 미달" : !(v.medPrice > 0) ? "medPrice 이상" : v.sellThrough != null && !(v.sellThrough >= 0 && v.sellThrough <= 100) ? "sellThrough 이상" : v.low != null && v.high != null && v.low > v.high ? "low>high" : typeof v.suspect !== "boolean" ? "suspect 가 boolean 아님" : !(v.name === null || typeof v.name === "string") ? "name 형식" : !(v.nameSource === null || NS.has(v.nameSource)) ? "nameSource 이상" : !(Number.isInteger(v.contestedSold) && v.contestedSold >= 0 && v.contestedSold <= v.sold) ? "contestedSold 이상" : v.psa10Med != null && !(v.psa10Med > 0) ? "psa10Med 이상" : null;
      if (bad) { errors.push(`D9: variant ${key} ${bad}`); break; }
    }
  }
  for (const [id, file, g] of [["D11", "data/tag-card-pop.json", "tag"], ["D10", "data/cgc-card-pop.json", "cgc"]]) {
    const cp = json(file, null);
    if (!cp) continue;
    if (cp.grader !== g || !/append-only/i.test(cp.note || "")) errors.push(`${id}: ${file} grader/note(append-only) 이상`);
    const walk = (code, label, cards) => {
      for (const [key, arr] of Object.entries(cards || {})) {
        if (!Array.isArray(arr)) { errors.push(`${id}: ${code}${label} ${key} 점 목록이 배열이 아님`); continue; }
        let prev = "";
        for (const p of arr) {
          const sum = Object.values(p?.g || {}).reduce((a, v) => a + (Number(v) || 0), 0);
          const bad = !p || typeof p.d !== "string" || p.d <= prev ? "날짜 이상/역행" : !(Number.isInteger(p.total) && p.total > 0) ? "total 이상" : sum > p.total ? `등급합(${sum})>total` : null;
          if (bad) { errors.push(`${id}: ${code}${label} ${key} ${bad}`); break; }
          prev = p.d;
        }
      }
    };
    for (const [code, b] of Object.entries(cp.sets || {})) { const eds = Object.keys(b || {}).filter((k) => k === "jp" || k === "en"); if (eds.length) for (const ed of eds) walk(code, `.${ed}`, b[ed]); else walk(code, "", b); }
  }
  auctions();
  // P1 · T2 · T3
  const sp = json("data/supply-series.json", null);
  if (sp) {
    const days = Math.round((Date.now() - Date.parse((sp.updated || "1970-01-01") + "T00:00:00Z")) / 864e5);
    if (days > 4) errors.push(`P1: 공급 시계열이 ${days}일 경과 (${sp.updated}) — update-supply-series.js 점검`);
    if (!(/delisted/i.test(sp.note || "") && /\bsold\b/i.test(sp.note || "") && /cannot distinguish|not.*a sale|never.*sale/i.test(sp.note || ""))) errors.push("P1: supply-series.note 에 '판매/내림 구분 불가' 고지 누락");
    if (Object.keys(sp.sets || {}).length < 15) errors.push(`P1: 공급 시계열 세트 부족 (${Object.keys(sp.sets || {}).length})`);
  }
  const size = (f) => fs.statSync(path.join(ROOT, f)).size;
  if (size("data/onepiece-packs.json") > 1_200_000) errors.push(`T2: data/onepiece-packs.json 가 ${(size("data/onepiece-packs.json") / 1024).toFixed(0)}KB — 상한 1172KB 초과(compact-series.js 확인, 방문자가 매번 받는 파일)`);
  if (read("data/onepiece-packs.json").slice(0, 4000).includes("\n ")) errors.push("T2: data/onepiece-packs.json 가 들여쓰기된 채로 저장돼 있다 — 전송량 1.5배. 쓴 워크플로 끝에 node tools/compact-series.js");
  // 팰월드 전용 낙찰 집계(palworld-auction-sold.json)는 2026-11-05 수집 중단으로 더 안 쓰인다(동결) — 상한 대상이 아니다.
  for (const f of ["data/auction-sold.json"].filter(exists)) if (size(f) > 400_000) errors.push(`T3: ${f} 가 ${(size(f) / 1024).toFixed(0)}KB — 상한 390KB 초과(2시간마다 커밋되는 파일: 개별 판매 혼입·안 읽는 축부터 볼 것)`);

  // R2(원장) · UP1(원장) · CL1(원장)
  const F = setFacts();
  for (const [code, sf] of Object.entries(F.sets || {})) {
    if (sf.jpRelease && !sf.jpRelease.source) errors.push(`R2: ${code}.jpRelease 에 source 가 없다 — 공식 페이지 링크 없이 발매일을 싣지 않는다`);
    for (const r of sf.reprintRecords || []) {
      if (!r.kind) errors.push(`R2: ${code} 재판 기록에 kind(출처 구분)가 없다`);
      const saysSaihan = /再販/.test(String(r.note || "").replace(/no 再販/gi, "")) || /reprint lottery/i.test(String(r.kindWas || ""));
      if (/lottery/i.test(r.kind || "") && !/pre-release|unverified-timing/i.test(r.kind || "")) {
        if (saysSaihan && r.kind !== "official-reprint-lottery") errors.push(`R2: ${code} 의 ${r.date} 추첨 메모가 "再販"인데 kind=${r.kind} — official-reprint-lottery 여야 한다`);
        if (!saysSaihan && r.kind === "official-reprint-lottery") errors.push(`R2: ${code} 의 ${r.date} 추첨을 재판으로 분류했는데 메모에 "再販" 이 없다`);
      }
      if (!/^official-(?:reprint-)?lottery$/.test(r.kind || "")) continue;
      if (!sf.jpRelease?.date) { errors.push(`R2: ${code} 의 ${r.date} 추첨을 "발매 후" 로 분류했는데 발매일이 확인돼 있지 않다`); continue; }
      if (String(r.date).slice(0, 7) < sf.jpRelease.date.slice(0, 7)) errors.push(`R2: ${code} 의 ${r.date} 추첨이 발매(${sf.jpRelease.date}) 이전인데 "발매 후" — pre-release-lottery 여야 한다`);
      const open = (String(r.note || "").match(/entries (?:opened )?(\d{4}-\d{2}-\d{2})/) || [])[1];
      if (open && open < sf.jpRelease.date) errors.push(`R2: ${code} 의 ${r.date} 추첨 응모 시작 ${open} 이 발매 전인데 kind=${r.kind} — pre-release-lottery 여야 한다(OP-16 감사 #8)`);
    }
    if (sf.jpRarityCounts && sf.cardTypes) {
      const [a, b] = String(sf.cardTypes).split("+").map(Number), rc = sf.jpRarityCounts;
      const sum = Object.entries(rc).filter(([k, v]) => typeof v === "number" && k !== "don").reduce((s, [, v]) => s + v, 0);
      if (sum !== a || (rc.don || 0) !== b) errors.push(`UP1: set-facts ${code} 레어리티 합 ${sum}+${rc.don || 0} ≠ cardTypes ${sf.cardTypes}`);
    }
  }
  const OFF = json("data/official-cardlist.json", null);
  if (!OFF) errors.push("CL1: data/official-cardlist.json 가 없다 — node tools/fetch-official-cardlist.js");
  else {
    const ALLOWED = new Set(["num", "rarity", "type", "name", "costKind", "cost", "attribute", "power", "counter", "color", "feature", "trigger"]);
    const EFFECT = /【(?:登場時|起動メイン|アタック時|ブロッカー|カウンター|トリガー|自分のターン中|相手のターン中|KO時|ドン!!×\d)】|\[(?:On Play|Activate: ?Main|When Attacking|Blocker|Trigger|Counter|Your Turn|Opponent's Turn|On K\.O\.|DON!! x\d|Rush|Double Attack|Banish)\]/;
    for (const lang of ["jp", "en"]) {
      const L = OFF[lang] || {};
      for (const [id, c] of Object.entries(L.cards || {})) { const extra = Object.keys(c).filter((k) => !ALLOWED.has(k)); if (extra.length || EFFECT.test(JSON.stringify(c))) { errors.push(`CL1: official-cardlist ${lang} ${id} 에 저장 목록 밖 필드/효과 텍스트 ${extra.join(",")} — 효과 텍스트는 저장하지 않는다`); break; } }
      for (const [code, p] of Object.entries(L.products || {})) { const miss = (p.ids || []).filter((id) => !(L.cards || {})[id]); if (miss.length) errors.push(`CL1: official-cardlist ${lang} ${code} ID ${miss.length}개가 카드 표에 없다(${miss[0]})`); if (!DATE.test(p.checked || "")) errors.push(`CL1: official-cardlist ${lang} ${code} 확인일(checked)이 없다`); }
    }
  }
}

// OL1 — 생성기 코드를 쓰지 않고 원장만으로 다시 센다: n + out = 창 안 즉시구매, 중앙값 = outliers 뺀 중앙값, win 은 7일 단위로 cap 까지만.
function ol1(bs, lg) {
  const rule = bs.outlierRule || {};
  if (!(rule.k > 0 && rule.refDays > 0 && rule.refMinSales > 0 && rule.scaleFloor > 0)) errors.push("OL1: box-sold-series.outlierRule 이 없다 — 이상치 기준을 밝히지 않은 중앙값");
  const DAY = 864e5, BLUE = /\b(blue\s*bottom|wave\s*1)\b/i;
  const q50 = (a) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; };
  let pts = 0;
  for (const [code, node] of Object.entries(bs.sets || {})) for (const key of ["jp", "en", "enBlue"]) {
    const ed = key === "jp" ? "jp" : "en", rel = (node.release || {})[ed] || null;
    const sales = (((lg.sets || {})[code] || {})[ed] || []).filter((r) => r && DATE.test(r.d) && Number(r.unit) > 0 && r.fmt === "bin" && (!rel || r.d >= rel))
      .filter((r) => (key === "enBlue" ? BLUE.test(r.title || "") : key === "en" ? !BLUE.test(r.title || "") : true)).map((r) => ({ t: Date.parse(r.d), unit: Number(r.unit), k: `${r.id}|${r.d}` }));
    const flagged = new Map(((node.outliers || {})[key] || []).map((o) => [`${o.id}|${o.d}`, o]));
    for (const [k, o] of flagged) { const hit = sales.find((r) => r.k === k); if (!hit || Math.abs(hit.unit - o.unit) > 0.01) errors.push(`OL1: ${code}.${key} 이상치 ${k} $${o.unit} 가 원장 즉시구매에 없다`); }
    const win0 = (node.windowDays || {})[key], cap = key === "enBlue" ? 120 : 56, minN = key === "enBlue" ? 3 : 6;
    for (const p of node[key] || []) {
      pts++;
      if (p.win != null && !(p.out > 0 && p.win > win0 && p.win <= cap && (p.win - win0) % 7 === 0)) { errors.push(`OL1: ${code}.${key} ${p.d} win ${p.win}(창 ${win0}, out ${p.out}) — 이상치를 뺄 때만 7일 단위로 cap 까지`); continue; }
      const t = Date.parse(p.d), w = p.win || win0, raw = sales.filter((r) => r.t > t - w * DAY && r.t <= t), keep = p.out ? raw.filter((r) => !flagged.has(r.k)) : raw;
      if (keep.length !== p.n || raw.length - keep.length !== (p.out || 0)) { errors.push(`OL1: ${code}.${key} ${p.d} n ${p.n} + out ${p.out || 0} ≠ 원장 ${keep.length} + ${raw.length - keep.length}(창 ${w}일)`); continue; }
      if (p.n < minN) errors.push(`OL1: ${code}.${key} ${p.d} 이상치를 빼고 n ${p.n} < ${minN}`);
      if (keep.length && Math.round(q50(keep.map((r) => r.unit))) !== p.median) errors.push(`OL1: ${code}.${key} ${p.d} 중앙값 ${p.median} ≠ 원장 재계산 ${Math.round(q50(keep.map((r) => r.unit)))}`);
    }
  }
  if (!pts) errors.push("OL1: 검사한 주간 점이 0개다 — 시계열 구조가 바뀌었으면 이 검사도 같이 고칠 것");
}

// A1/A3 경매 원장(한 파일 = 하루, id 중복·유찰 가격·다른 게임 혼입 금지) · A2 시계열 축 합·표본 하한·아카이브 금액 대조 · A5 TCG 스냅샷 시각
function auctions() {
  const readDay = (dir, f) => { try { return json(`${dir}/${f}`); } catch { errors.push(`A1: ${f} 파싱 실패`); return null; } };
  const arch = list("data/auction-archive", /^\d{4}-\d{2}-\d{2}\.json$/);
  if (exists("data/auction-archive")) {
    if (!arch.length) errors.push("A1: 경매 아카이브가 비어 있다 — 원장 유실 의심");
    const seen = new Set(), counts = new Map(), sums = new Map();
    for (const f of arch) {
      const j = readDay("data/auction-archive", f), day = f.slice(0, 10);
      if (!j) continue;
      const sales = j.sales;
      if (!Array.isArray(sales) || !sales.length) { errors.push(`A1: ${f} sales 비어 있음`); continue; }
      if (j.d !== day) errors.push(`A1: ${f} 내부 날짜(${j.d})가 파일명과 다름`);
      counts.set(day, sales.length);
      let sum = 0;
      for (const s of sales) {
        if (s.sold && s.currency === "USD" && s.price > 0) sum += s.price;
        const bad = !s || typeof s.id !== "string" ? "id 없는 기록" : s.d !== day ? `다른 날짜(${s.d}) 기록 혼입` : seen.has(s.id) ? `${s.id} 가 여러 날짜 파일에 중복` : s.sold === false && s.price != null ? `유찰 기록에 낙찰가(${s.price})` : s.price != null && !(s.price > 0) ? `가격 이상 (${s.price})` : s.grade && s.gradeSrc !== "title" ? "grade 에 출처(gradeSrc) 누락" : s.ed && !["jp", "en"].includes(s.ed) ? `ed 값 이상 (${s.ed})` : s.seller && (s.seller.username || s.seller.u) ? "판매자 username 저장됨 — 구간만 남길 것" : null;
        if (bad) { errors.push(`A1: ${f} ${bad}`); break; }
        seen.add(s.id);
      }
      sums.set(day, sum);
    }
    const hot = json("data/auction-sold.json", null);
    if (hot) {
      if (hot.sales) errors.push("A1: auction-sold.json 에 sales 가 다시 들어왔다 — 집계 전용 파일이다");
      for (const r of hot.daily || []) if (counts.has(r.d) && r.n > counts.get(r.d)) errors.push(`A1: ${r.d} 집계 ${r.n}건이 원장 ${counts.get(r.d)}건보다 많다`);
    }
    const S = json("data/auction-series.json", null);
    if (S) {
      let checked = 0;
      for (const r of S.daily || []) { const want = sums.get(r.d); if (want == null) continue; checked++; if (Math.abs((r.amount || 0) - want) > 1) errors.push(`A2: ${r.d} amount ${Math.round(r.amount)} ≠ 아카이브 낙찰 price 합 ${Math.round(want)}`); }
      if (!checked) errors.push("A2: 아카이브와 대조된 날이 0일 — 금액 검증이 무력화됐다");
      if (!(S.minPriceSample > 0)) errors.push("A2: minPriceSample 이 없다");
      const EDS = ["jp", "en", "other"], CATS = ["box", "graded", "raw", "pack", "lot"];
      for (const scope of ["daily", "weekly", "monthly"]) {
        if (!Array.isArray(S[scope]) || !S[scope].length) { errors.push(`A2: ${scope} 비어 있음`); continue; }
        for (const r of S[scope]) {
          for (const [name, axis] of [["byEd", EDS], ["byCat", CATS]]) { if (!r[name]) { errors.push(`A2: ${scope} ${r.d} ${name} 축 누락`); continue; } const sum = axis.reduce((a, k) => a + ((r[name][k] || {}).ended || 0), 0); if (sum !== r.ended) errors.push(`A2: ${scope} ${r.d} ${name} 합계 ${sum} ≠ ended ${r.ended}`); }
          if (r.sold + r.unsold !== r.ended) errors.push(`A2: ${scope} ${r.d} 낙찰+유찰 ≠ 종료`);
          if (r.sold === 0 && (r.amount || 0) > 0) errors.push(`A2: ${scope} ${r.d} 낙찰 0건인데 금액 ${r.amount}`);
          if (r.edTracked && r.edCoverage < S.edMinCoverage) errors.push(`A2: ${scope} ${r.d} edCoverage ${r.edCoverage}% 인데 edTracked=true`);
          for (const k of [...CATS, "all"]) {
            const p = (r.price || {})[k];
            if (!p) { errors.push(`A2: ${scope} ${r.d} price.${k} 누락`); continue; }
            if (p.n < S.minPriceSample && p.med !== null) errors.push(`A2: ${scope} ${r.d} price.${k} 표본 ${p.n}건인데 중앙값 노출`);
            if (p.med !== null && !(p.p25 <= p.med && p.med <= p.p75)) errors.push(`A2: ${scope} ${r.d} price.${k} 백분위 순서 뒤집힘`);
            const b = (r.bidders || {})[k]; if (b != null && b < 1) errors.push(`A2: ${scope} ${r.d} bidders.${k}=${b} — 유찰 혼입 의심`);
          }
        }
      }
    }
  }
  if (exists("data/tcg-archive")) {
    const seen = new Map();
    for (const f of list("data/tcg-archive", /^\d{4}-\d{2}-\d{2}\.json$/)) {
      let j; try { j = json(`data/tcg-archive/${f}`); } catch { errors.push(`A3: ${f} 파싱 실패`); continue; }
      for (const s of j.sales || []) {
        const bad = !s || typeof s.id !== "string" ? "id 없는 기록" : s.d !== f.slice(0, 10) ? `다른 날짜(${s.d}) 혼입` : !s.g ? "게임 표시 없음" : seen.has(s.id) ? (seen.get(s.id) !== s.g ? `${s.id} 가 두 게임(${seen.get(s.id)}, ${s.g})에 기록됨 — 검색어 겹침` : `${s.id} 가 여러 날짜 파일에 중복`) : s.sold === false && s.price != null ? `유찰 기록에 낙찰가(${s.price})` : s.sold === true && s.price != null && !(s.price > 0) ? `가격 이상(${s.price})` : null;
        if (bad) { errors.push(`A3: ${f} ${bad}`); break; }
        seen.set(s.id, s.g);
      }
    }
  }
  const S = json("data/tcg-series.json", null);
  if (S) {
    const keys = Object.keys(S.games || {});
    if (!keys.length) errors.push("A3: tcg-series 에 게임 목록이 없다");
    for (const scope of ["daily", "weekly", "monthly"]) for (const r of S[scope] || []) for (const k of keys) {
      const g = r.games[k];
      if (!g) { errors.push(`A3: ${scope} ${r.d} ${k} 누락`); continue; }
      if (g.sold > g.ended) errors.push(`A3: ${scope} ${r.d} ${k} 낙찰(${g.sold}) > 종료(${g.ended})`);
      if (g.ended < S.minRateSample && g.sellThrough !== null) errors.push(`A3: ${scope} ${r.d} ${k} 표본 ${g.ended}건인데 낙찰률 노출`);
      if (scope !== "daily" && r.days > 1 && g.live != null) { const max = Math.max(...(S.daily || []).filter((d) => d.games[k]?.live != null).map((d) => d.games[k].live), 0); if (max && g.live > max * 1.5) errors.push(`A3: ${scope} ${r.d} ${k} 물량(${g.live})이 일봉 최대(${max})를 넘음 — 합으로 집계된 듯`); }
    }
    // A5 — at 없는 점은 경고만(옛 수집기 점 하나에 모든 수집·배포가 멈추면 정산분이 영구 공백)
    const snap = json("data/tcg-snapshot.json", null);
    if (snap) {
      const { TCG_SNAPSHOT_STD_HOURS: STD } = require("../tcg-config"), { isoWeek } = require("../build-tcg-series");
      const atOf = new Map();
      for (const p of snap.points || []) {
        if (p.at == null) { if (p.d >= "2026-10-14") warnings.push(`A5(경고) tcg-snapshot ${p.d} 점에 at(찍은 시각) 없음`); continue; }
        const t = Date.parse(p.at), day = Date.parse(`${p.d}T00:00:00Z`);
        if (!Number.isFinite(t) || t < day || t >= day + 25 * 3600e3) { errors.push(`A5: tcg-snapshot ${p.d} at(${p.at}) 이 그날 시각이 아님`); continue; }
        atOf.set(p.d, t);
      }
      const off = [];
      for (const r of S.daily || []) {
        const t = atOf.get(r.d), h = t == null ? null : new Date(t).getUTCHours(), want = h != null && (h < STD.from || h >= STD.to);
        if ("offHour" in r && r.offHour !== true) errors.push(`A5: tcg-series daily ${r.d} offHour=${JSON.stringify(r.offHour)} — 표준 시각 날은 필드를 두지 않는다`);
        if ((r.offHour === true) !== want) errors.push(`A5: tcg-series daily ${r.d} offHour=${r.offHour === true} 인데 스냅샷 시각 → ${want} — build-tcg-series 재실행 필요`);
        if (r.offHour === true) off.push(r.d);
      }
      for (const [scope, keyOf] of [["weekly", isoWeek], ["monthly", (d) => `${d.slice(0, 7)}-01`]]) for (const r of S[scope] || []) { const n = off.filter((d) => keyOf(d) === r.d).length; if ((r.offHourDays ?? 0) !== n) errors.push(`A5: tcg-series ${scope} ${r.d} offHourDays=${r.offHourDays} ≠ daily 표시 ${n}일`); }
    }
  }
}

module.exports = { checks, run };
