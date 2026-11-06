"use strict";
// 손으로 쓴 글·문구의 수·날짜·기준 — 2026-11-05 신설(외부 감사 확정 오류, 갈래 text). 사실 파일·다른 페이지로 다시 셀 수 있는 글자만 본다.
//  TX1 홈 "N sets · JP / EN"·"all N sets & M articles" = Key facts 세트 수·글 목록 카드 수, 글 목록 = 색인 글 전부 [홈 22·14 ↔ 실제 23·16]
//  TX2 글의 "the next set, X" 가 이미 발매된 세트면 FAIL, 동남아 글 다음 세트 칸 = releases.nextUp·일본 발매일 [7월 문장 "next set, OP-17 … August 22" 가 11월까지]
//  TX3 "comparison table compares all N" = compare.html "Sets compared"(발매된 비교표 행) [동남아 글 "ranks all 21"]
//  TX4 팩 산수 글 lead 의 "Across the N sets with …" = 문장이 말한 정의로 센 수(판매 중앙값 행 / vs MSRP 행) [18 ↔ 19]
//  TX5 "Full JP vs EN data report (all N pairs)" = 6개월 리포트 표에서 JP now·EN now 가 둘 다 있는 행 수 [고정 "20" ↔ 19]
//  TX6 7월 값과 지금 값을 한 표에 둔 글은 열·값마다 기준 라벨, 글 목록 날짜 리포트 소개에 "now $N" 금지 [7월 시장가 열과 판매 중앙값 열이 라벨 없이 섞임]
//  TX7 llms 문구 "nothing is estimated" 금지, llms-full 최근 7일 합계에 부분 수집일 금지·합 = 완전일 합 [11/04 부분일이 합계에 섞임]
//  TX8 about "weekly ungraded market values" 는 끝난 달을 단다 [7월에 멈춘 시계열을 현재 출처처럼 적음]
//  TX9 글의 "X released/launched in Japan on <날짜>" = releaseFacts 일본 발매일, "launch paths … <세트 페이지>" 는 그 페이지에 발매 경로가 있어야 [OP-17 페이지에 없는 OP-14·15 경로 안내]
// 값(수) 대조는 sink — 수집 워크플로가 페이지를 안 굽는 날엔 경고. 문구 규칙은 errors.
const { errors, read, exists, list, strip, shownText, longDate, sink } = require("./lib");

const checks = ["TX1", "TX2", "TX3", "TX4", "TX5", "TX6", "TX7", "TX8", "TX9"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoOf = (long) => { const m = String(long).match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/); if (!m) return null; const i = MONTHS.indexOf(m[1]); return i < 0 ? null : `${m[3]}-${String(i + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`; };
const DASH = (s) => /^(?:—|-|)$/.test(strip(s));
const rowsOf = (tbl) => [...String(tbl || "").matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1]));
const ARTICLES = () => list("articles", /\.html$/).map((f) => `articles/${f}`);

function run() {
  const F = require("./lib").facts();
  const RF = Object.fromEntries(F.releaseFacts.map((r) => [r.setCode, r]));
  const asOf = F.series.asOf || "";

  // TX1 — 홈 칩·세트 가이드 제목, 글 목록 카드 = 색인 글
  {
    const val = sink("TX1");
    const hub = exists("articles/index.html") ? read("articles/index.html") : "";
    const cards = [...hub.matchAll(/<li class="artCard">\s*<a href="([^"]+)"/g)].map((m) => m[1]);
    const indexable = ARTICLES().filter((f) => f !== "articles/index.html" && !/name="robots" content="[^"]*noindex/i.test(read(f))).map((f) => f.slice("articles/".length));
    for (const f of indexable) if (!cards.includes(f)) errors.push(`TX1: articles/index.html 글 목록에 색인 글 ${f} 가 없다 — 홈 글 수가 이 목록을 센다`);
    for (const c of cards) if (!indexable.includes(c)) errors.push(`TX1: articles/index.html 글 카드 ${c} 가 색인 글이 아니다(없거나 noindex)`);
    if (exists("index.html")) {
      const h = read("index.html"), nSets = F.order.board.length;
      const chip = h.match(/<span data-ko="(\d+)세트 · 일본판 \/ 영문판">(\d+) sets · JP \/ EN<\/span>/);
      if (!chip) errors.push("TX1: index.html 첫 화면 칩 \"N sets · JP / EN\" 을 못 찾음");
      else for (const v of [chip[1], chip[2]]) if (+v !== nSets) { val(`index.html 칩 "${v} sets" ≠ 추적 세트 ${nSets}(Key facts Sets tracked)`); break; }
      const g = h.match(/<h2 data-ko="세트 가격 가이드 — (\d+)개 세트 · 기사 (\d+)개">Set price guides — all (\d+) sets &amp; (\d+) articles<\/h2>/);
      if (!g) errors.push("TX1: index.html 세트 가이드 제목 \"all N sets & M articles\" 을 못 찾음");
      else {
        if (+g[1] !== nSets || +g[3] !== nSets) val(`index.html 세트 가이드 "${g[3]} sets"(ko ${g[1]}) ≠ 추적 세트 ${nSets}`);
        if (+g[2] !== cards.length || +g[4] !== cards.length) val(`index.html 세트 가이드 "${g[4]} articles"(ko ${g[2]}) ≠ 글 목록 카드 ${cards.length}`);
      }
    }
  }

  // TX2 — "the next set" 가 이미 발매된 세트면 FAIL. 동남아 글의 다음 세트 칸 = releases.nextUp(일본 발매일이 기준일 뒤일 때) 그 날짜
  {
    for (const f of ARTICLES()) {
      const t = shownText(read(f));
      for (const m of t.matchAll(/\b[Tt]he next (?:main )?(?:set|booster|release)\b[^.]{0,12}?((?:OP|EB|PRB)-\d{2})/g)) {
        const jp = RF[m[1]] && RF[m[1]].japanese.releaseDate;
        if (jp && asOf && jp <= asOf) errors.push(`TX2: ${f} "${m[0].trim()}" — ${m[1]} 는 ${jp} 에 이미 발매됐다(기준일 ${asOf}). 다음 세트는 ${F.releases.nextUp || "없음"}`);
      }
    }
    const SEA = "articles/one-piece-booster-box-prices-sea.html";
    if (exists(SEA)) {
      const span = read(SEA).match(/<span data-next-set>([\s\S]*?)<\/span>/);
      if (!span) errors.push(`TX2: ${SEA} 다음 세트 칸(<span data-next-set>)이 없다 — inject-sea-prices 가 쓰는 자리`);
      else {
        const nu = F.releases.nextUp, jp = nu && RF[nu] ? RF[nu].japanese.releaseDate : null, want = jp && asOf && jp > asOf ? { code: nu, date: longDate(jp) } : null;
        const got = strip(span[1]).match(/The next set, ((?:OP|EB|PRB)-\d{2})[^,]*, is officially dated ([A-Z][a-z]+ \d{1,2}, \d{4}) in Japan/);
        const val = sink("TX2");
        if (!want && strip(span[1])) val(`${SEA} 다음 세트 칸 "${strip(span[1]).slice(0, 60)}" — 기준일 뒤 일본 발매 예정 세트가 없으면 비운다`);
        if (want && (!got || got[1] !== want.code || got[2] !== want.date)) val(`${SEA} 다음 세트 칸 "${strip(span[1]).slice(0, 80)}" ≠ ${want.code} ${want.date}`);
      }
    }
  }

  // TX3 — 비교표 세트 수 문장 = compare.html "Sets compared"
  {
    const val = sink("TX3"), n = F.compare.rows.filter((r) => !(F.sets[r.code] || {}).unreleased).length;
    for (const f of ARTICLES()) {
      for (const m of read(f).matchAll(/comparison table<\/a> (ranks|compares) all (\d+) ([A-Za-z ]+?)(?=[,.<])/g)) {
        if (m[1] === "ranks") errors.push(`TX3: ${f} "comparison table ranks all ${m[2]}" — 판매 중앙값이 없는 세트는 순위가 없다("compares all N sets")`);
        if (+m[2] !== n) val(`${f} 비교표 세트 수 ${m[2]} ≠ compare.html Sets compared ${n}`);
      }
    }
  }

  // TX4 — 팩 산수 lead: 문장이 말한 정의로 센 수
  {
    const HMP = "articles/how-many-packs-one-piece-booster-box.html";
    if (exists(HMP)) {
      const h = read(HMP), lead = (h.match(/<p data-pack-math-lead>([\s\S]*?)<\/p>/) || [])[1] || "";
      const tbl = (h.match(/<div class="tblWrap" data-pack-math>([\s\S]*?)<\/table>/) || [])[1] || "";
      const body = rowsOf((tbl.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1]).filter((cs) => cs.length >= 7);
      const withSold = body.filter((cs) => !DASH(cs[4])).length, withMult = body.filter((cs) => !DASH(cs[6])).length;
      const m = strip(lead).match(/Across the (\d+) sets with (a sold median|a “vs MSRP” multiple)/);
      if (/Across the \d+ sets/.test(strip(lead)) && !m) errors.push(`TX4: ${HMP} lead "Across the N sets …" 의 정의를 못 읽음 — "with a “vs MSRP” multiple" 또는 "with a sold median"`);
      if (m) { const want = m[2] === "a sold median" ? withSold : withMult; if (+m[1] !== want) sink("TX4")(`${HMP} lead "${m[1]} sets with ${m[2]}" ≠ 표에서 그 정의로 센 ${want}(판매 중앙값 ${withSold} · 배수 ${withMult})`); }
    }
  }

  // TX5 — "(all N pairs)" = 6개월 리포트 표에서 JP now·EN now 가 둘 다 있는 행
  {
    const R6 = "articles/japanese-vs-english-box-price-data-2026.html";
    if (exists(R6)) {
      const t6 = (read(R6).match(/<table class="dataTable">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
      const pairs = rowsOf(t6).filter((cs) => cs.length >= 4 && !DASH(cs[cs.length - 3]) && !DASH(cs[cs.length - 2])).length;
      for (const f of ARTICLES()) for (const m of read(f).matchAll(/<a href="japanese-vs-english-box-price-data-2026\.html">[^<]*\(all (\d+) pairs\)<\/a>/g)) if (+m[1] !== pairs) sink("TX5")(`${f} "(all ${m[1]} pairs)" ≠ 6개월 리포트 표의 JP now·EN now 쌍 ${pairs}`);
    }
  }

  // TX6 — 기준 라벨: 6개월 리포트 열 머리, OP-16 30일 리포트 값 칸, 글 목록의 날짜 리포트 소개
  {
    const R6 = "articles/japanese-vs-english-box-price-data-2026.html";
    if (exists(R6)) {
      const h = read(R6), th = [...((h.match(/<table class="dataTable">[\s\S]*?<thead>([\s\S]*?)<\/thead>/) || [])[1] || "").matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map((m) => m[1]);
      if (th.length < 4) errors.push(`TX6: ${R6} 표 머리를 못 읽음`);
      for (const c of th.slice(1)) {
        const name = strip(c.replace(/<small>[\s\S]*?<\/small>/g, "")), basis = strip((c.match(/<small>([\s\S]*?)<\/small>/) || [])[1] || "");
        const want = / now$/.test(name) ? "sold median" : "market value";
        if (basis !== want) errors.push(`TX6: ${R6} 열 "${name}" 기준 라벨 "${basis || "(없음)"}" — "${want}"(7월 시장가 열과 판매 중앙값 열을 라벨로 가른다)`);
      }
      const cap = (h.match(/<table class="dataTable">\s*<caption>([\s\S]*?)<\/caption>/) || [])[1] || "";
      if (!/market value/i.test(cap) || !/sold median/i.test(cap)) errors.push(`TX6: ${R6} 표 caption 에 두 기준(market value · sold median)의 정의가 없다`);
    }
    const P16 = "articles/op-16-box-price-30-days-later.html";
    if (exists(P16)) {
      const tb = (read(P16).match(/<table class="pathTable[^"]*">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
      const rs = rowsOf(tb);
      if (!rs.length) errors.push(`TX6: ${P16} 가격 경로 표를 못 읽음`);
      for (const cs of rs) if (cs.length >= 3 && /\$\d/.test(cs[2]) && !/<small>[^<]*(?:\bsales?\b|\bask\b)[^<]*<\/small>/.test(cs[2])) errors.push(`TX6: ${P16} "${strip(cs[0])}" 값 ${strip(cs[2])} 에 기준(판매 건수·ask) 라벨이 없다`);
    }
    if (exists("articles/index.html")) for (const m of read("articles/index.html").matchAll(/<span class="artEyebrow">([^<]*)<\/span>[\s\S]*?<span class="artDesc">([^<]*)<\/span>/g)) {
      if (/Data Report|Report ·/.test(m[1]) && /\bnow \$[\d,]+/i.test(m[2])) errors.push(`TX6: articles/index.html "${m[1]}" 소개 "${m[2].match(/\bnow \$[\d,]+/i)[0]}" — 날짜 박힌 리포트의 값은 날짜로("Jul 16 $150")`);
    }
  }

  // TX7 — llms
  {
    if (exists("llms.txt") && /nothing is estimated/i.test(read("llms.txt"))) errors.push("TX7: llms.txt \"nothing is estimated\" — 날짜 박힌 글 2편이 7월 시장가(추정)를 싣는다");
    if (exists("llms-full.txt")) {
      const t = read("llms-full.txt").replace(/\r\n?/g, "\n"), sec = t.split(/^## One Piece eBay auctions/m)[1] || "";
      const head = sec.match(/^Last (\d+) (complete )?days \((\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\): ([\d,]+) auctions ended, ([\d,]+) sold/m);
      if (head) {
        const days = [...sec.matchAll(/^(\d{4}-\d{2}-\d{2}) \| ([\d,]+|n\/a) \| ([\d,]+|n\/a) \| [^|]*\| [^|]*\| (complete|partial[^\n]*)$/gm)].map((m) => ({ d: m[1], ended: +m[2].replace(/,/g, ""), sold: +m[3].replace(/,/g, ""), partial: m[4] !== "complete" }));
        const inRange = days.filter((x) => x.d >= head[3] && x.d <= head[4]);
        const bad = inRange.filter((x) => x.partial).map((x) => x.d);
        if (bad.length) errors.push(`TX7: llms-full.txt 최근 ${head[1]}일 합계(${head[3]}~${head[4]})에 부분 수집일 ${bad.join(", ")} — 경매 화면처럼 완전일만`);
        if (!head[2]) errors.push(`TX7: llms-full.txt "Last ${head[1]} days" — 완전일 합계라는 라벨("complete days")`);
        const full = inRange.filter((x) => !x.partial);
        if (full.length === +head[1]) {
          const e = full.reduce((s, x) => s + x.ended, 0), so = full.reduce((s, x) => s + x.sold, 0);
          if (e !== +head[5].replace(/,/g, "") || so !== +head[6].replace(/,/g, "")) sink("TX7")(`llms-full.txt 최근 ${head[1]}일 합계 ${head[5]}/${head[6]} ≠ 아래 표 완전일 합 ${e}/${so}`);
        }
      }
    }
  }

  // TX8 — about 출처: 멈춘 주간 시장가는 끝난 달을 단다
  if (exists("about.html")) {
    const t = shownText(read("about.html"));
    for (const m of t.matchAll(/weekly ungraded market values?(.{0,30})/gi)) if (!/^\s*\(through [A-Z][a-z]+ \d{4}\)/.test(m[1])) errors.push(`TX8: about.html "${m[0].trim()}" — 2026-07 에 멈춘 시계열은 "(through July 2026)" 처럼 끝난 달을 단다`);
  }

  // TX9 — 발매일 문장 = releaseFacts, 발매 경로 안내 = 그 페이지에 경로가 있어야
  {
    const val = sink("TX9");
    for (const f of ARTICLES()) {
      const h = read(f), t = shownText(h);
      for (const m of t.matchAll(/((?:OP|EB|PRB)-\d{2}) (?:released|launched) in Japan on ([A-Z][a-z]+ \d{1,2}, \d{4})/g)) {
        const jp = RF[m[1]] && RF[m[1]].japanese.releaseDate;
        if (jp && isoOf(m[2]) !== jp) val(`${f} "${m[0]}" ≠ 일본 발매일 ${jp}`);
      }
      for (const m of h.matchAll(/launch paths?[^<]{0,120}<a href="\.\.\/sets\/([a-z0-9-]+\.html)"/gi)) {
        const target = `sets/${m[1]}`;
        if (!exists(target) || !/pre-?release|launch path/i.test(shownText(read(target)))) errors.push(`TX9: ${f} 가 ${target} 에 발매 경로(launch path)가 있다고 안내하지만 그 페이지에 없다`);
      }
    }
  }
}

module.exports = { checks, run };
