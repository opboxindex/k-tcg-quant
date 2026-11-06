"use strict";
// STALE-DISPLAY — 낡은 값은 날짜를 붙인 채 흐린다(methodology "Sold medians older than 35 days are dated and dimmed"). 2026-11-05 신설.
// 왜(2026-11-05 감사): ① 세트 Top 10 NM 칸에 행별 날짜가 없어 EB-05 의 11-02 값(신작은 매일 내린다)이 오늘 시세처럼 읽혔다.
//   ② 'Highest PSA 10' 대표 칸(psa10-ranking·cards/ Key facts·카드 상세 머리)이 118일 된 3건 표본 $14,134 를 흐림 없이 냈다(표 행은 흐렸다).
//   ③ 카드 상세 "Recent price checkpoints" 가 같은 옛 관측(PSA 10 07-10 · NM 10-21)을 매일 새 행처럼 반복했다.
//   ④ 한국어 세트 페이지의 같은 칸.
// 판정은 사실 파일(nm.stale·psa10.stale·shown.nmDate·checkpoints[].nmAsOf/psaAsOf · staleDays)을 그대로 쓴다 — 여기서 나이를 다시 세는 것은
//   사실 행을 특정할 수 없는 대표 칸(날짜가 칸 안에 있는 Key facts 'highest'·랭킹 stat)뿐이다.
// 값 대조와 같은 이유로 이번 실행이 페이지를 바꾸지 않았으면 경고만(lib.PUBLISH_TOUCHED — 수집 워크플로가 묵은 페이지 때문에 막히지 않게).
//  DSP1 대표 PSA 10 칸(랭킹 Key facts·stat · cards/ Key facts): 칸의 관측일이 staleDays.psa10 을 넘으면 흐림 class, 아니면 없음
//  DSP2 카드 상세 머리 NM·PSA 10 칸: 사실 nm.stale·psa10.stale ↔ "pc … stale"
//  DSP3 세트 Top 10(sets/<code>.html): 쓸 수 있는 NM 칸마다 "as of MM-DD"(= shown.nmDate) · nmStale ↔ class nmStale · psaStale ↔ class psaStale
//  DSP4 카드 상세 체크포인트: 이월 칸(사실 nmAsOf·psaAsOf) ↔ class carried + "as of MM-DD"
//  DSP5 한국어 세트 페이지: PSA 10 실거래 줄(li.stale ↔ psa10.stale) · 인기 카드 NM 칸(td.stale ↔ nm.stale)
// 검사 본체 scan({ F, read, exists }) 는 순수 함수다 — tools/test-stale-display.js 가 가짜 사실·페이지로 역시험한다.
const lib = require("./lib");

const checks = ["DSP1", "DSP2", "DSP3", "DSP4", "DSP5"];
const CAP = 8;
const DAY = 864e5;
const ageDays = (dataDate, d) => (Date.parse(dataDate) - Date.parse(String(d).slice(0, 10))) / DAY;
const unH = (s) => String(s ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function scan({ F, read, exists }) {
  const out = [];
  const push = (id, msg) => out.push({ id, msg });
  // 칸 하나 판정 — want(흐려야 하나)와 got(흐렸나)이 다르면 오류.
  const same = (id, where, want, got, why) => { if (!!want !== !!got) push(id, `${where}: ${want ? "흐림 class 없음" : "흐리면 안 되는데 흐림"} — ${why}`); };
  if (!F.staleDays || !(F.staleDays.nm > 0) || !(F.staleDays.psa10 > 0)) { push("DSP1", "사실 파일에 staleDays(nm·psa10)가 없다 — build-site-facts 를 다시 구울 것"); return out; }
  const limNm = F.staleDays.nm, limPsa = F.staleDays.psa10;

  // DSP1 — 날짜가 칸 안에 있는 대표 PSA 10 칸
  for (const f of ["psa10-ranking.html", "cards/index.html"]) {
    if (!exists(f)) continue;
    const td = (read(f).match(/<tr data-k="highest"><th scope="row">[\s\S]*?<\/th><td>([\s\S]*?)<\/td><\/tr>/) || [])[1];
    if (!td) { push("DSP1", `${f}: Key facts 'highest' 행을 못 읽었다 — 표 구조가 바뀌었으면 이 검사도 고칠 것`); continue; }
    const d = (td.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1];
    if (!d) { push("DSP1", `${f}: 'highest' 칸에 관측일(<time>)이 없다 — 대표 값은 날짜를 붙인다`); continue; }
    const age = ageDays(F.dataDate, d);
    same("DSP1", `${f} Key facts 'Highest PSA 10'(${d}, ${Math.round(age)}일)`, age > limPsa, /^<b class="stale"/.test(td), `관측 ${limPsa}일 넘은 표본은 흐린다`);
  }
  if (exists("psa10-ranking.html")) {
    const m = read("psa10-ranking.html").match(/<div class="stat hi( stale)?"[^>]*><b>[^<]*<\/b><span>[^<]*?sold as of (\d{4}-\d{2}-\d{2})/);
    if (!m) push("DSP1", "psa10-ranking.html: 'highest PSA 10' stat 칸(관측일 포함)을 못 읽었다");
    else same("DSP1", `psa10-ranking.html stat 'highest PSA 10'(${m[2]})`, ageDays(F.dataDate, m[2]) > limPsa, m[1], `관측 ${limPsa}일 넘은 표본은 흐린다`);
  }

  // DSP2·DSP4 — 카드 상세(머리 칸·체크포인트)
  let seen = 0;
  for (const p of F.cardPages) {
    const f = `cards/${p.file}`;
    if (!exists(f)) continue;
    const c = F.sets[p.code].cards[p.i], h = read(f);
    seen++;
    const nmM = h.match(/<div class="pc hl( stale)?"[^>]*><span>Japanese NM \(raw\)<\/span>/);
    if (!nmM) push("DSP2", `${f}: NM 머리 칸을 못 읽었다`);
    else same("DSP2", `${f} NM 머리 칸(${c.nm.date || "—"})`, c.nm.usd != null && c.nm.stale, nmM[1], `NM ${limNm}일`);
    const pM = h.match(/<div class="pc( stale)?"[^>]*><span>PSA 10 \((sold median|lowest listing)\)<\/span>/);
    if (pM) same("DSP2", `${f} PSA 10 머리 칸(${c.psa10 ? c.psa10.date : "ask"})`, pM[2] === "sold median" && c.psa10 && c.psa10.stale, pM[1], `PSA 10 sold ${limPsa}일`);
    // 체크포인트 — 화면은 마지막 6점(2점 이상일 때만)
    const tbl = (h.match(/Recent price checkpoints<\/h2>[\s\S]*?<\/table>/) || [])[0];
    const pts = c.checkpoints.length >= 2 ? c.checkpoints.slice(-6) : [];
    if (!tbl) { if (pts.length) push("DSP4", `${f}: 체크포인트 표가 없다(사실 ${pts.length}점)`); continue; }
    const trs = [...tbl.matchAll(/<tr><td>(\d{4}-\d{2}-\d{2})<\/td>([\s\S]*?)<\/tr>/g)];
    if (trs.length !== pts.length) { push("DSP4", `${f}: 체크포인트 행 ${trs.length} ≠ 사실 ${pts.length}`); continue; }
    trs.forEach((tr, i) => {
      const cells = [...tr[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)], pt = pts[i];
      for (const [j, asOf, what] of [[0, pt.nmAsOf, "NM"], [1, pt.psaAsOf, "PSA 10"]]) {
        const cell = cells[j];
        if (!cell) { push("DSP4", `${f} ${tr[1]} ${what}: 칸 없음`); continue; }
        const carried = /class="[^"]*\bcarried\b/.test(cell[1]);
        same("DSP4", `${f} ${tr[1]} ${what}`, !!asOf, carried, asOf ? `${asOf} 관측을 다시 적은 칸` : "그날 기록");
        if (asOf && carried && !cell[2].includes(`as of ${asOf.slice(5)}`)) push("DSP4", `${f} ${tr[1]} ${what}: 이월 칸에 관측일 "as of ${asOf.slice(5)}" 없음`);
      }
    });
  }
  if (F.cardPages.length && !seen) push("DSP2", "카드 상세 페이지를 하나도 못 읽었다");

  // DSP3 — 세트 Top 10(일본판 영문 페이지) · DSP5 — 한국어 세트 페이지
  let rowsSeen = 0;
  for (const code of F.order.setPages) {
    const s = F.sets[code];
    const f = `sets/${s.slug}.html`;
    const tbl = exists(f) ? (read(f).match(/<table class="chaseTable">[\s\S]*?<\/table>/) || [])[0] : null;
    for (const tr of tbl ? tbl.matchAll(/<tr><td>(\d+)<\/td>([\s\S]*?)<\/tr>/g) : []) {
      const c = s.cards[Number(tr[1]) - 1];
      if (!c) continue;
      const num = [...tr[2].matchAll(/<td class="num([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)];
      if (num.length < 2) { push("DSP3", `${f} ${tr[1]}행: NM·PSA 10 칸을 못 읽었다`); continue; }
      rowsSeen++;
      const p = c.shown, where = `${f} ${tr[1]}행 ${c.number || c.name}`;
      if (p.nmSrc === "jp" && p.nmDate && !num[0][2].includes(`as of ${p.nmDate.slice(5)}`)) push("DSP3", `${where} NM: 관측일 "as of ${p.nmDate.slice(5)}" 없음 — 표 아래 데이터 날짜만으로는 오늘 값처럼 읽힌다`);
      same("DSP3", `${where} NM(${p.nmDate || "—"})`, p.nmStale, /\bnmStale\b/.test(num[0][1]), `NM ${limNm}일`);
      same("DSP3", `${where} PSA 10(${p.psaDate || p.psaKind || "—"})`, p.psaStale, /\bpsaStale\b/.test(num[1][1]), `PSA 10 sold ${limPsa}일`);
    }
    const k = `ko/${s.slug}.html`;
    if (!exists(k)) continue;
    const h = read(k);
    const li = h.match(/<li( class="stale")?>PSA 10 실거래 중앙값 \(/);
    const pc = s.top10.priciest, p10 = pc ? s.cards[pc.i].psa10 : null;
    if (li && p10) same("DSP5", `${k} PSA 10 실거래 줄(${p10.date})`, p10.stale, li[1], `PSA 10 sold ${limPsa}일`);
    const sec = (h.match(/<section aria-label="인기 카드 시세">[\s\S]*?<\/section>/) || [""])[0];
    for (const m of sec.matchAll(/<td class="nm">([^<]*)<\/td><td class="code">([^<]*)<\/td><td>[^<]*<\/td><td class="num( stale)?"/g)) {
      const c = s.cards.find((x) => x.number === unH(m[2]) && x.name === unH(m[1]));
      if (c) same("DSP5", `${k} 인기 카드 ${c.number} NM(${c.nm.date || "—"})`, c.nm.stale, m[3], `NM ${limNm}일`);
    }
  }
  if (F.order.setPages.length && !rowsSeen) push("DSP3", "세트 Top 10 행을 하나도 못 읽었다 — 표 구조가 바뀌었으면 이 검사도 고칠 것");
  return out;
}

function run() {
  const counts = new Map();
  const where = lib.PUBLISH_TOUCHED ? lib.errors : lib.warnings;
  const tag = (id) => (lib.PUBLISH_TOUCHED ? `${id}:` : `${id}(경고)`);
  for (const { id, msg } of scan({ F: lib.facts(), read: lib.read, exists: lib.exists })) {
    const k = counts.get(id) || 0;
    counts.set(id, k + 1);
    if (k < CAP) where.push(`${tag(id)} ${msg}`);
  }
  for (const [id, k] of counts) if (k > CAP) where.push(`${tag(id)} 그 밖에 ${k - CAP}건 더`);
}

module.exports = { checks, run, scan };
