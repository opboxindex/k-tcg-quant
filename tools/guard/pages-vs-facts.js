"use strict";
// PAGES-VS-FACTS — 모든 페이지·AI 파일이 보여주는 숫자 = data/derived/site-facts.json. 2026-10-15 신설.
// 왜: 종전 가드는 페이지끼리(세트 ↔ 비교표 ↔ 한국어 ↔ AI JSON) 숫자를 맞춰 보는 검사를 수십 개(D17·KF1·PC1·CM1·CW1·WK1·SF1·NM1·NM2·RY1·PK1·CH1·KD1·CL3·
//     RF1·LP1·AS1·KO1~KO5·MD1·RD1·UP1·CL1·G9·C4·H2·CX2·CX3·P2 …)로 들고 있었고, 규칙 하나가 바뀌면 검사도 같이 다시 셌다(4,497줄).
//     이제 사실은 한 파일에 한 번만 있고(FACTS-SOURCE 가 생성기의 재계산을 막는다), 여기서는 "페이지가 그 값을 그대로 보여주는가"만 본다 —
//     페이지 → 사실 선택자(probe) 표 하나와 비교기(cmp) 하나. 오류 꼴: PAGES-VS-FACTS/<옛 검사 ID>: <페이지> <칸>: 페이지 "…" ≠ 사실 ….
// 비교 규칙: 사실이 null 이면 페이지는 "—"(또는 없음). 문자열은 그대로, 숫자는 페이지가 보여준 자릿수의 반올림 오차 안(예 "$8,081" ↔ 8081.45, "3.6x" ↔ 3.597).
// 값 대조는 이번 실행이 페이지를 바꿨을 때만 FAIL(아니면 경고) — 환율·수집 워크플로는 사실만 바꾸고 페이지는 다음 빌드가 고친다(sink).
const { errors, warnings, read, exists, ISO, money, unH, strip, ldOf, ldFlat, descOf, longDate, shortDate, json, facts, PUBLISH_TOUCHED } = require("./lib");
const CL = require("../card-list-shared");

const checks = ["PAGES-VS-FACTS"];
const CAP = Number(process.env.GUARD_CAP) || 8;
let F, S, counts;
const numOf = (s) => { const m = String(s).replace(/,/g, "").replace(/−/g, "-").match(/-?\d+(?:\.\d+)?/); return m ? { v: Number(m[0]), d: (m[0].split(".")[1] || "").length } : null; };
const DASH = (s) => s == null || /^(?:—|-|n\/a|null|없음|집계중|)$/.test(String(s).trim());
// 비교기 — want: null(없어야 함) · string(그대로) · number(표시 자릿수 반올림 안) · {present:true}(값이 있어야 함)
function cmp(id, page, what, got, want) {
  compared++;
  const g = got == null ? null : strip(String(got));
  let ok;
  if (want == null) ok = DASH(g);
  else if (typeof want === "string") ok = g === want;
  else if (typeof want === "number") { const n = g == null ? null : numOf(g); ok = !!n && Math.abs(n.v - want) <= 0.5 * 10 ** -n.d + 1e-9; }
  else ok = g != null && !DASH(g);
  if (ok) return true;
  const k = counts.get(id) || 0; counts.set(id, k + 1);
  if (k < CAP) (PUBLISH_TOUCHED ? errors : warnings).push(`PAGES-VS-FACTS/${id}${PUBLISH_TOUCHED ? ":" : "(경고)"} ${page} ${what}: 페이지 "${g == null ? "(없음)" : g.slice(0, 60)}" ≠ 사실 ${typeof want === "number" ? Math.round(want * 1000) / 1000 : JSON.stringify(want)}`);
  return false;
}
const first = (h, re, g = 1) => { const m = h.match(re); return m ? m[g] : null; };
const dollars = (h) => (String(h ?? "").match(/\$[\d,]+(?:\.\d+)?/) || [])[0] || null;
const times = (h) => [...String(h ?? "").matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
const cells = (tr) => [...tr.matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1]);
const rows = (tbl) => [...String(tbl ?? "").matchAll(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const kfRows = (h) => Object.fromEntries([...h.matchAll(/<tr data-k="(\w+)"><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><\/tr>/g)].map((m) => [m[1], { th: m[2], td: m[3] }]));
const grid = (h) => Object.fromEntries([...h.matchAll(/<div class="statLabel">([\s\S]*?)<\/div><div class="statValue">([\s\S]*?)<\/div>(?:<div class="statBase">([\s\S]*?)<\/div>)?/g)].map((m) => [strip(m[1]), { v: strip(m[2]), base: strip(m[3] || "") }]));
const faqOf = (h) => (ldOf(h).find((j) => j["@type"] === "FAQPage") || {}).mainEntity || [];
const ans = (faq, re) => { const q = faq.find((x) => re.test(x.name || "")); return q ? String((q.acceptedAnswer || {}).text || "") : null; };
const krw = (usd) => (usd == null || !F.fx.usdKrw ? null : usd * F.fx.usdKrw);
const deq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 세트 페이지(일본판·영문판·한국어) — Key facts·지표 격자·설명문·문답·Top 10·가장 비싼 카드·재판 줄·날짜·Product
function setPage(code, ed, f, lang) {
  const s = S[code], k = s.keyFacts[ed], h = read(f), r = kfRows(h), ko = lang === "ko";
  const id = "KF1";
  if (r.sold) {
    cmp(id, f, "Key facts sold", dollars(r.sold.td), k.sold ? k.sold.median : null);
    if (k.sold) { cmp(id, f, "sold 기준일", times(r.sold.td)[0], k.sold.d); cmp(id, f, "sold 건수", first(r.sold.td, ko ? /(\d+)건/ : /(\d+) sales/), k.sold.n); if (ko) cmp("KO1", f, "sold 원화", first(r.sold.td, /([\d,]+)원/), krw(k.sold.median)); }
  }
  if (r.ask) { cmp(id, f, "Key facts ask", dollars(r.ask.td), k.ask ? k.ask.total : null); if (k.ask) { cmp(id, f, "ask 매물 수", first(r.ask.td, ko ? /매물 (\d+)건/ : /(\d+) listings/), k.ask.listings); cmp(id, f, "ask 기준일", times(r.ask.td)[0], k.ask.updated); } }
  if (r.release) { const t = times(r.release.td); if (k.jpRelease) cmp(id, f, "JP 발매일", t[0], k.jpRelease); if (k.enRelease) cmp(id, f, "EN 발매일", t[t.length - 1], k.enRelease); }
  if (r.msrp) { const yen = [...r.msrp.td.matchAll(/¥([\d,]+)/g)].map((m) => m[1]); if (k.msrp.jpBox) cmp(id, f, "JP 박스 정가", yen[0], k.msrp.jpBox); if (k.msrp.jpPack) cmp(id, f, "JP 팩 정가", yen[yen.length - 1], k.msrp.jpPack); cmp(id, f, "EN 팩 정가", first(r.msrp.td, /\$([\d.]+)/), k.msrp.enPack); }
  if (r.packs) cmp(id, f, "박스당 팩 수", first(r.packs.td, /<b>([^<]*)<\/b>/), k.packsPerBox);
  if (r.cardlist) { cmp(id, f, "카드 리스트 장수", first(r.cardlist.td, /<b>([^<]*)<\/b>/), k.cardList ? k.cardList.cards : null); if (k.cardList) { cmp(id, f, "카드 번호 수", first(r.cardlist.td, ko ? /카드 번호 (\d+)종/ : /(\d+) card numbers/), k.cardList.numbers); cmp(id, f, "카드 리스트 링크", first(r.cardlist.th, /href="([^"]+)"/), k.cardList.href); } }
  if (r.types) cmp(id, f, "카드 종류", first(strip(r.types.td), /^([\d+]+)/), k.cardTypes ? (k.cardTypes.official ? k.cardTypes.value : String(k.cardTypes.numbers)) : null);
  // 지표 격자(D17·CW1·CM1)
  const g = grid(h), m = s.metrics[ed], mult = s.metrics.en.multiple;
  if (ed === "jp" && m && !ko) {
    cmp("D17", f, "Box price (JP)", g["Box price (JP)"]?.v, s.current.jp ? s.current.jp.median : null);
    if (s.current.jp) cmp("D17", f, "Box price 기준일", first(g["Box price (JP)"]?.base || "", /as of (\d{4}-\d{2}-\d{2})/), s.current.jp.d);
    cmp("CW1", f, "4-week change", g["4-week change"]?.v, s.change28.jp ? s.change28.jp.pct : null);
    cmp("D17", f, "Days of inventory", g["Days of inventory"]?.v, m.days);
    cmp("D17", f, "PSA graded", g["PSA graded"]?.v, s.grading.psa.jp ? s.grading.psa.jp.total : null);
    cmp("D17", f, "PSA 10 rate", g["PSA 10 rate"]?.v, s.grading.psa.jp ? s.grading.psa.jp.gemRate : null);
    const c = s.top10.counted, floorKey = Object.keys(g).find((x) => /^Floor of the top \d+$/.test(x));
    if (s.top10.pricedCount >= 5 || floorKey) {
      cmp("CM1", f, "Value density", g["Value density"]?.v, c ? `${c.filter((v) => v >= 25).length} / ${c.length}` : null);
      cmp("CM1", f, "Chase concentration", g["Chase concentration"]?.v, c ? Math.round((c[0] / c.reduce((a, v) => a + v, 0)) * 100) : null);
      cmp("CM1", f, "Floor 지표 이름", floorKey, c ? `Floor of the top ${c.length}` : floorKey);
      if (floorKey) cmp("CM1", f, floorKey, g[floorKey].v, c ? c[c.length - 1] : null);
    }
  }
  if (ed === "en") {
    cmp("D17", f, "Box price (EN)", g["Box price (EN)"]?.v, s.current.en ? s.current.en.median : null);
    if (s.current.en) cmp("D17", f, "Box price 기준일", first(g["Box price (EN)"]?.base || "", /as of (\d{4}-\d{2}-\d{2})/), s.current.en.d);
    cmp("CW1", f, "4-week change", g["4-week change"]?.v, s.change28.en ? s.change28.en.pct : null);
    const la = s.liveAsk.en;
    if (g["Asking price (mid)"]) { cmp("D17", f, "Asking price (mid)", g["Asking price (mid)"].v, la ? la.mid : null); if (la) { cmp("D17", f, "호가 매물 수", first(g["Asking price (mid)"].base, /(\d+) active listings/), la.n); if (la.range) cmp("D17", f, "호가 범위", first(g["Asking price (mid)"].base, /Range (\$[\d,]+)/), la.lo); } }
    cmp("D17", f, "Days of inventory", g["Days of inventory"]?.v, m.days);
    cmp("D17", f, "vs Japanese box", g["vs Japanese box"]?.v, m.multiple);
    cmp("D17", f, "PSA graded (EN)", g["PSA graded (EN)"]?.v, s.grading.psa.en ? s.grading.psa.en.total : null);
    cmp("D17", f, "PSA 10 rate (EN)", g["PSA 10 rate (EN)"]?.v, s.grading.psa.en ? s.grading.psa.en.gemRate : null);
  }
  // 설명문(MD1·KO5·D17 8c)
  const d = descOf(h), did = ko ? "KO5" : "MD1";
  if (ko) {
    const sm = d.match(/판매 중앙값 ([\d,]+)원\((\d{4}-\d{2}-\d{2})(?:, (\d+)건)?\)/);
    cmp(did, f, "설명문 판매 중앙값", sm ? sm[1] : null, k.sold ? krw(k.sold.median) : null);
    if (k.sold && sm) { cmp(did, f, "설명문 기준일", sm[2], k.sold.d); cmp(did, f, "설명문 건수", sm[3], k.sold.n); }
    cmp(did, f, "설명문 최저 매물", first(d, /최저 매물 (\$[\d,]+)/), k.ask ? k.ask.total : null);
    cmp(did, f, "설명문 발매", first(d, /발매 (\d{4}-\d{2}-\d{2})/), k.jpRelease);
    cmp(did, f, "설명문 팩 수", first(d, /박스당 (\d+)팩/), k.packsPerBox);
  } else {
    const sm = d.match(/sold median (\$[\d,]+) \((\d{4}-\d{2}-\d{2}), n=(\d+)\)/);
    cmp(did, f, "설명문 판매 중앙값", sm ? sm[1] : null, k.sold ? k.sold.median : null);
    if (k.sold && sm) { cmp(did, f, "설명문 기준일", sm[2], k.sold.d); cmp(did, f, "설명문 건수", sm[3], k.sold.n); }
    cmp(did, f, "설명문 최저 매물", first(d, /lowest live ask (\$[\d,]+)/), k.ask ? k.ask.total : null);
    cmp(did, f, `설명문 ${ed.toUpperCase()} 발매`, first(d, new RegExp(`${ed.toUpperCase()} release (\\d{4}-\\d{2}-\\d{2})`)), ed === "jp" ? k.jpRelease : k.enRelease);
    if (ed === "jp") cmp(did, f, "설명문 팩 수", first(d, /(\d+) packs/), k.packsPerBox);
    else if (/x the JP box/.test(d)) cmp(did, f, "설명문 배수", first(d, /([\d.]+)x the JP box/), mult);   // 배수는 155자 안에 들어갈 때만 실린다(dataDesc)
  }
  // 문답(SF1·FQ1·KO1)
  const faq = faqOf(h);
  if (ko) {
    const pa = ans(faq, /박스 시세는 지금 얼마/), cur = s.current.jp;
    cmp("KO1", f, "시세 문답", pa, cur ? { present: true } : null);
    if (pa && cur) { cmp("KO1", f, "시세 문답 날짜", first(pa, /^(\d{4}-\d{2}-\d{2}) 기준/), cur.d); cmp("KO1", f, "시세 문답 금액", first(pa, /약 ([\d,]+)원/), krw(cur.median)); }
    const ca = ans(faq, /변동률은/), ch = s.change28.jp;
    cmp("KO1", f, "변동률 문답", ca, ch ? { present: true } : null);
    if (ca && ch) { cmp("KO1", f, "변동률 문답 값", first(ca, /변동률\(([^)]*)\)/), ch.pct); cmp("KO1", f, "변동률 문답 기준일", first(ca, /\d+일 전\((\d{4}-\d{2}-\d{2})\)/), ch.basis); if (cur) cmp("KO1", f, "변동률 문답 값 날짜", first(ca, /은 (\d{4}-\d{2}-\d{2}) 판매 중앙값/), cur.d); }
    const ra = ans(faq, /재판 기록이 있나요/);
    if (ra) cmp("KO2", f, "재판 문답 횟수", first(ra, /재판 (\d+)회/), s.reprint.count || null);
  } else {
    const pa = ans(faq, new RegExp(`^How much is a sealed .* ${ed === "jp" ? "Japanese" : "English"} booster box\\?$`));
    cmp("SF1", f, "가격 문답", pa, k.sold ? { present: true } : null);
    if (pa && k.sold) { const pm = pa.match(/^As of (\d{4}-\d{2}-\d{2}), completed eBay sales[^.]*?median at about (\$[\d,]+) \((\d+) sales/); cmp("SF1", f, "가격 문답 날짜", pm && pm[1], k.sold.d); cmp("SF1", f, "가격 문답 금액", pm && pm[2], k.sold.median); cmp("SF1", f, "가격 문답 건수", pm && pm[3], k.sold.n); }
    if (pa && ed === "jp") { const em = pa.match(/The English .* box runs about (\$[\d,]+) \(as of (\d{4}-\d{2}-\d{2})\)/); cmp("SF1", f, "가격 문답 영문판 값", em ? em[1] : null, s.current.en ? s.current.en.median : null); if (em && s.current.en) cmp("SF1", f, "가격 문답 영문판 날짜", em[2], s.current.en.d); }
    const ca = ans(faq, /compare with the Japanese box\?$/), both = s.current.jp && s.current.en;
    cmp("SF1", f, "배수 문답", ca, both ? { present: true } : null);
    if (ca && both) { const cm = ca.match(/English[^$]*(\$[\d,]+) \(as of (\d{4}-\d{2}-\d{2})\) versus Japanese[^$]*(\$[\d,]+) \(as of (\d{4}-\d{2}-\d{2})\).*about ([\d.]+)x/); cmp("SF1", f, "배수 문답 EN", cm && cm[1], s.current.en.median); cmp("SF1", f, "배수 문답 JP", cm && cm[3], s.current.jp.median); cmp("SF1", f, "배수 문답 배수", cm && cm[5], mult); }
    const ga = ans(faq, /graded by PSA\?$/);
    if (ga && ed === "en") { const gm = ga.match(/PSA reports ([\d,]+) graded .* as of (\d{4}-\d{2}-\d{2}), and ([\d.]+)%/); cmp("D17", f, "PSA 문답 총량", gm && gm[1], s.grading.psa.en ? s.grading.psa.en.total : null); if (gm && s.grading.psa.en) { cmp("D17", f, "PSA 문답 날짜", gm[2], s.grading.psa.en.updated); cmp("D17", f, "PSA 문답 젬률", gm[3], s.grading.psa.en.gemRate); } }
    // 영문판 박스 문장(일본판 페이지) · 가장 비싼 카드 문장(PC1)
    if (ed === "jp") { const em = h.match(/The English \S+(?: reprint \(White\))? box runs about <strong>(\$[\d,]+)<\/strong> — ([\d.]+)x the Japanese box/); cmp("SF1", f, "영문판 박스 문장", em ? em[1] : null, both ? s.current.en.median : null); if (em && both) cmp("SF1", f, "영문판 배수 문장", em[2], mult); }
    priciestSentences(f, h, s);
  }
  // Top 10(일본판 페이지 chaseTable — NM2·RY1·PK1·C4)
  if (ed === "jp" && !ko) for (const tr of rows((h.match(/<table class="chaseTable">[\s\S]*?<\/table>/) || [""])[0])) {
    const i = Number(first(tr, /^<tr><td>(\d+)<\/td>/)); if (!i) continue;
    const c = s.cards[i - 1]; if (!c) { cmp("NM2", f, `Top 10 ${i}행`, "있음", null); continue; }
    cmp("RY1", f, `Top 10 ${i} 카드`, first(tr, /<strong>([^<]*)<\/strong>/), c.name);
    cmp("RY1", f, `Top 10 ${i} 번호·레어도`, first(tr, /<span class="cNum">([^<]*)<\/span>/), c.number || c.rarityEn ? strip(`${c.number || ""} · ${c.rarityEn || ""}`) : null);
    const num = [...tr.matchAll(/<td class="num(?: [^"]*)?"[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    cmp("NM2", f, `Top 10 ${i} NM`, dollars(num[0]), c.shown.nm);
    cmp("PK1", f, `Top 10 ${i} PSA 10`, dollars(num[1]), c.shown.psa);
    if (c.shown.psa) { cmp("PK1", f, `Top 10 ${i} PSA 10 종류`, first(num[1], /<span class="psaKind">(sold|ask)/), c.shown.psaKind); if (c.shown.psaKind === "sold") cmp("PK1", f, `Top 10 ${i} PSA 10 날짜`, first(num[1], /· (\d{2}-\d{2})/), c.shown.psaDate.slice(5)); }
    const trio = strip(first(tr, /<td class="num gCol">([\s\S]*?)<\/td>/) || "").split(" / ");
    for (const [j, gr] of ["psa", "cgc", "tag"].entries()) { const gg = c.grades && c.grades[gr]; cmp("C4", f, `Top 10 ${i} ${gr} 인구`, trio[j], gg ? gg.n : null); if (gg && gg.gem != null) cmp("C4", f, `Top 10 ${i} ${gr} 젬률`, first(trio[j] || "", /(\d+)%/), gg.gem); }
  }
  // 재판 줄(R2·KO2) · 날짜(U2) · Product(KF1)
  if (ed === "jp" && !ko && s.hasSetFacts) {
    // 줄 = 라벨 + 날짜(원장 ISO 그대로; 날짜 없는 기록만 있으면 라벨만) — generate-set-pages 의 row()
    const kinds = [["Bandai Namco shop reprint (再販) lottery", (x) => x.kind === "official-reprint-lottery"], ["Distributor reprint", (x) => /distributor/i.test(x.kind)], ["Retailer-reported restocks", (x) => x.kind !== "official-reprint-lottery" && !/distributor/i.test(x.kind)]];
    for (const [label, pick] of kinds) {
      const recs = s.reprint.restock.filter(pick), dated = recs.filter((x) => x.date).map((x) => x.date);
      const li = first(h, new RegExp(`<li>(?:<a [^>]*>)?${label.replace(/[()]/g, "\\$&")}(?:</a>)?(?::([^<]*(?:<a [^>]*>[^<]*</a>[^<]*)*))?</li>`), 0);
      cmp("R2", f, `${label} 줄`, li ? "있음" : null, recs.length ? "있음" : null);
      if (li && recs.length) cmp("R2", f, `${label} 날짜`, dated.length ? unH(li.replace(/^<li>(?:<a [^>]*>)?[^:<]*(?:<\/a>)?:/, "").replace(/ — not a Bandai reprint announcement/, "").replace(/<[^>]+>/g, "")).trim() : "", dated.join(", "));
    }
  }
  if (ko) {
    const ch = s.change28.jp, li = first(h, /<li>(\d{4}-\d{2}-\d{2} 대비 <strong>[^<]*<\/strong>)/);
    cmp("CW1", f, "변동률 줄", li, ch ? { present: true } : null);
    if (li && ch) { cmp("CW1", f, "변동률 기준일", first(li, /^(\d{4}-\d{2}-\d{2})/), ch.basis); cmp("CW1", f, "변동률", first(li, /<strong>([^<]*)<\/strong>/), ch.pct); }
    cmp("KO2", f, "재판 기록 횟수", first(h, /<li>재판 기록 <strong>(\d+)회<\/strong>/) ?? (/<li><strong>재판 기록 없음<\/strong>/.test(h) ? "—" : null), s.reprint.count || null);
    cmp("KO2", f, "발매 후 추첨 횟수", first(h, /<li>발매 후 반다이 공식 추첨판매 (\d+)회\(/), s.reprint.lottery.length || null);
    const pc = s.top10.priciest, pl = h.match(/<li>최고가 카드 \(일본판 NM\) <strong>([^<]*)<\/strong>(?:\(([^)]*)\))? · (?:각 )?<strong>([\d,]+)원<\/strong>(?:\((\d{4}-\d{2}-\d{2})\))?<\/li>/);
    cmp("PC1", f, "최고가 카드 줄", pl ? pl[0] : (/<li>최고가 카드/.test(h) ? "못 읽음" : null), pc ? { present: true } : null);
    if (pl && pc) { cmp("PC1", f, "최고가 카드 이름", unH(pl[1]), pc.ties.map((t) => t.name).join(" · ")); if (pc.ties.length === 1) cmp("PC1", f, "최고가 카드 번호", pl[2], pc.number); cmp("PC1", f, "최고가 카드 원화", pl[3], s.cards[pc.i].nm.krw); cmp("PC1", f, "최고가 카드 관측일", pl[4], pc.date); }
    const p10 = pc ? s.cards[pc.i].psa10 : null, pm = h.match(/<li>PSA 10 실거래 중앙값 \(([^)]*)\) <strong>([\d,]+)원<\/strong>\((\d{4}-\d{2}-\d{2}), 표본 (\d+)건\)/);
    cmp("PK1", f, "PSA 10 줄", pm ? pm[0] : null, p10 ? { present: true } : null);
    if (pm && p10) { cmp("PK1", f, "PSA 10 카드", unH(pm[1]), pc.name); cmp("PK1", f, "PSA 10 원화", pm[2], p10.krw); cmp("PK1", f, "PSA 10 날짜", pm[3], p10.date); cmp("PK1", f, "PSA 10 표본", pm[4], p10.n); }
    koAuction(f, h, s); koCards(f, h, s); koGrading(f, h, s);
    cmp("U2", f, "갱신일", first(h, /· 갱신 (\d{4}-\d{2}-\d{2})\.<\/p>/), s.pageDate);
  } else {
    cmp("U2", f, "Data updated", first(h, /Data updated <time datetime="(\d{4}-\d{2}-\d{2})"/), s.pageDate);
    const prod = ldOf(h).find((j) => j["@type"] === "Product"), rel = ed === "jp" ? k.jpRelease : k.enRelease;
    if (prod) { if (rel) cmp("KF1", f, "Product releaseDate", prod.releaseDate, rel); const o = prod.offers || {}; cmp("KF1", f, "Product lowPrice", o.lowPrice ?? o.price, k.ask ? k.ask.total : null); if (o["@type"] === "AggregateOffer" && s.liveAsk[ed]) { cmp("KF1", f, "Product highPrice", o.highPrice, s.liveAsk[ed].hi); cmp("KF1", f, "Product offerCount", o.offerCount, s.liveAsk[ed].n); } }
    if (ed === "en") cmp("KF1", f, "구매 버튼", first(h, /<a class="buyNow"[^>]*>[\s\S]*?<b>(\$[\d,]+)<\/b>/), k.ask ? k.ask.total : null);
  }
  cmp("U2", f, "dateModified", (ldOf(h).find((j) => j["@type"] === "WebPage") || {}).dateModified, s.pageDate);
  if (!ko) cmp("KF1", f, "제목 Release Date", /release date/i.test(first(h, /<title>([^<]*)<\/title>/) || "") ? "있음" : null, F.latestSets.includes(code) ? "있음" : null);
}
function priciestSentences(f, h, s) {
  const pc = s.top10.priciest, found = [];
  for (const m of h.matchAll(/The most valuable \S+ card is <strong>([^<]*)<\/strong>(?: \(([^)]*)\))? at about <strong>(\$[\d,]+)<\/strong> (raw NM|raw TCG market price)(?: \((\d{4}-\d{2}-\d{2})\))?/g)) found.push({ names: [unH(m[1])], num: m[2], v: m[3], tcg: m[4] !== "raw NM", d: m[5] || null });
  for (const m of h.matchAll(/The most valuable \S+ cards are <strong>([^<]*)<\/strong>, tied at about <strong>(\$[\d,]+)<\/strong> (raw NM|raw TCG market price) each(?: \((\d{4}-\d{2}-\d{2})\))?/g)) found.push({ names: unH(m[1]).split(/, | and /), v: m[2], tcg: m[3] !== "raw NM", d: m[4] || null });
  cmp("PC1", f, "가장 비싼 카드 문장", found.length ? "있음" : null, pc && /^sets\/[a-z]+-\d+\.html$/.test(f) ? "있음" : found.length && !pc ? null : found.length ? "있음" : null);
  for (const x of found) {
    if (!pc) break;
    cmp("PC1", f, "가장 비싼 카드 이름", x.names.sort().join(" · "), pc.ties.map((t) => t.name).sort().join(" · "));
    if (x.num) cmp("PC1", f, "가장 비싼 카드 번호", x.num, pc.number);
    cmp("PC1", f, "가장 비싼 카드 금액", x.v, pc.usd); cmp("PC1", f, "가장 비싼 카드 라벨", x.tcg ? "TCG" : "NM", "NM"); cmp("PC1", f, "가장 비싼 카드 관측일", x.d, pc.date);
  }
}
function koAuction(f, h, s) {
  const sec = (h.match(/<section aria-label="경매 실적">[\s\S]*?<\/section>/) || [])[0];
  if (!sec || !s.auction) { cmp("KO3", f, "경매 절", sec ? "있음" : null, s.auction && s.auction.ended ? "있음" : sec ? "있음" : null); return; }
  const a = s.auction;
  cmp("KO3", f, "거래액", first(sec, /<li>거래액 <strong>([^<]*)<\/strong>/), a.amount); cmp("KO3", f, "중앙 낙찰가", first(sec, /<li>중앙 낙찰가 <strong>([^<]*)<\/strong>/), a.medPrice);
  const all = sec.match(/<tr><td class="l"><strong>전체<\/strong><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/);
  cmp("KO3", f, "경매 전체 종료", all && all[1], a.ended); cmp("KO3", f, "경매 전체 낙찰", all && all[2], a.sold); cmp("KO3", f, "경매 전체 낙찰률", all && all[3], a.sellThrough);
}
function koCards(f, h, s) {
  const sec = (h.match(/<section aria-label="인기 카드 시세">[\s\S]*?<\/section>/) || [""])[0], seen = [];
  for (const m of sec.matchAll(/<td class="nm">([^<]*)<\/td><td class="code">([^<]*)<\/td><td>([^<]*)<\/td><td class="num">([^<]*)<\/td>/g)) {
    const c = s.cards.find((x) => x.number === unH(m[2]) && x.name === unH(m[1]));
    if (!c) { cmp("NM2", f, `인기 카드 ${unH(m[2])} ${unH(m[1])}`, "있음", null); continue; }
    seen.push(c); cmp("RY1", f, `인기 카드 ${c.number} 레어도`, unH(m[3]), c.rarity || null); cmp("NM2", f, `인기 카드 ${c.number} NM 원화`, m[4], c.nm.usable ? c.nm.krw : null);
  }
  const days = seen.map((c) => c.nm.date).filter((x) => ISO.test(x || "")).sort();
  if (seen.length) cmp("NM1", f, "인기 카드 관측일", first(sec, /관측일 ([\d~-]+)/), days.length ? (days[0] === days.at(-1) ? days[0] : `${days[0]}~${days.at(-1)}`) : null);
}
function koGrading(f, h, s) {
  for (const m of h.matchAll(/<td class="l"[^>]*>(PSA|CGC|TAG) (일본판|영문판)<\/td><td class="num">([^<]*)<\/td><td class="l">([^<]*)<\/td>/g)) {
    const g = s.grading[m[1].toLowerCase()][m[2] === "일본판" ? "jp" : "en"], what = `${m[1]} ${m[2]}`;
    cmp("G9", f, `${what} 누적`, m[3], g ? g.total : null);
    if (!g) continue;
    if (m[1] === "PSA") cmp("G9", f, `${what} 젬률`, first(m[4], /PSA 10 ([\d.]+)%/), g.gemRate);
    if (m[1] === "CGC") { cmp("G9", f, `${what} 프리스틴 10`, first(m[4], /프리스틴 10 ([\d,]+)장/), g.pristine10 ?? null); cmp("G9", f, `${what} 젬 민트 10`, first(m[4], /젬 민트 10 ([\d,]+)장/), g.gemMint10 ?? null); }
    if (m[1] === "TAG") { cmp("G9", f, `${what} 10`, first(m[4], /\b10 ([\d,]+)장/), g.g10 ?? null); cmp("G9", f, `${what} 10P`, first(m[4], /10P ([\d,]+)장/), g.g10p ?? null); }
  }
}

// ── 카드 상세·허브·한국어 카드 표·PSA 10 랭킹
const cardOf = (p) => S[p.code].cards[p.i];
function cardPages() {
  const byFile = new Map(F.cardPages.map((p) => [p.file, cardOf(p)]));
  for (const p of F.cardPages) {
    const f = `cards/${p.file}`; if (!exists(f)) continue;
    const c = cardOf(p), h = read(f), psa = c.shown;
    cmp("RY1", f, "H1 번호·레어도", first(h, /<h1>[^<]*<small[^>]*>([^<]*)<\/small><\/h1>/), c.rarity ? `${c.number} · ${c.rarity}` : c.number);
    cmp("RY1", f, "Rarity label", first(h, /<li>Rarity label: ([^<]*)<\/li>/), c.rarity || "—");
    const nmB = h.match(/<span>Japanese NM \(raw\)<\/span><b>([^<]*)<\/b><small>([^<]*)<\/small>/);
    cmp("NM2", f, "NM 칸", nmB && nmB[1], psa.nm); if (nmB) cmp("NM1", f, "NM 관측일", first(nmB[2], /as of (\d{4}-\d{2}-\d{2})/), psa.nmSrc === "jp" ? c.nm.date : null);
    const pB = h.match(/<span>PSA 10 \((sold median|lowest listing)\)<\/span><b>([^<]*)<\/b><small>([^<]*)<\/small>/);
    cmp("PK1", f, "PSA 10 칸", pB && pB[2], psa.psa); if (pB && psa.psa) { cmp("PK1", f, "PSA 10 종류", pB[1] === "sold median" ? "sold" : "ask", psa.psaKind); cmp("PK1", f, "PSA 10 날짜", first(pB[3], /(\d{4}-\d{2}-\d{2})/), psa.psaKind === "sold" ? psa.psaDate : c.psa10Ask.date); if (psa.psaKind === "sold") cmp("PK1", f, "PSA 10 표본", first(pB[3], /(\d+) sales?/), psa.psaN); }
    const pop = h.match(/<span>PSA population<\/span><b>([^<]*)<\/b><small>([^<]*)<\/small>/);
    cmp("C4", f, "PSA population", pop && pop[1], c.pop ? c.pop.total : null); if (pop && c.pop) { cmp("C4", f, "PSA 10 수", first(pop[2], /([\d,]+) in PSA 10/), c.pop.g10); cmp("C4", f, "젬률", first(pop[2], /(\d+)% gem/), c.pop.gem); }
    const pm = h.match(/Premium \(PSA 10 (sold median|lowest listing) ÷ raw NM\): <b>([^<]*)<\/b>/);
    if (pm) cmp("CX2", f, "Premium", pm[2], !c.nm.usable ? null : pm[1] === "sold median" ? (c.psa10 && !c.psa10.stale ? c.psa10.multiple : null) : c.psa10Ask ? c.psa10Ask.usd / c.nm.usd : null);
    const d = descOf(h);
    cmp("NM2", f, "설명 NM", first(d, /raw Japanese NM (\$[\d,]+)/), psa.nm);
    const ps = d.match(/PSA 10 (sold|listed from) (\$[\d,]+)/);
    if (ps) cmp("CX3", f, `설명 PSA 10 ${ps[1]}`, ps[2], ps[1] === "sold" ? (c.psa10 && c.psa10.ageDays <= 28 ? c.psa10.usd : null) : c.psa10Ask ? c.psa10Ask.usd : null);
    cmp("C4", f, "설명 PSA population", first(d, /PSA population ([\d,]+)/), c.pop ? c.pop.total : null);
    cmp("U2", f, "설명 Updated", first(d, /Updated (\d{4}-\d{2}-\d{2})\.$/), c.pageDate);
    const lds = ldOf(h);
    cmp("U2", f, "Article dateModified", (lds.find((j) => j["@type"] === "Article") || {}).dateModified, c.pageDate);
    const offers = [].concat((lds.find((j) => j["@type"] === "Product") || {}).offers || []);
    const nmO = offers.find((o) => o.name === "Japanese NM (raw)"), psO = offers.find((o) => o.name === "PSA 10 (lowest listing)");
    cmp("PO1", f, "NM Offer", nmO ? nmO.price : null, c.nm.usable && c.nm.fresh && c.nm.stock !== "unknown" ? c.nm.usd : null);
    cmp("PO1", f, "PSA 10 Offer", psO ? psO.price : null, c.psa10Ask && c.psa10Ask.fresh && c.psa10Ask.buy ? c.psa10Ask.usd : null);
    const wa = ans(faqOf(h), /worth\?$/);
    if (wa) { const wm = wa.match(/^On (\d{4}-\d{2}-\d{2}), .* was tracked near (\$[\d,]+)/); cmp("NM2", f, "FAQ NM", wm && wm[2], psa.nmSrc === "jp" ? psa.nm : null); if (wm) cmp("NM1", f, "FAQ NM 날짜", wm[1], c.nm.date); }
    for (const r of rows((h.match(/grading population by grader<\/h2>[\s\S]*?<\/table>/) || [""])[0]).slice(1)) {
      const t = cells(r).map(strip), g = c.gradingRows.find((x) => x.grader === t[0] && x.ed === t[1]);
      cmp("C4", f, `등급사 표 ${t[0]} ${t[1]}`, t[2], g ? g.total : null); if (g) { cmp("C4", f, `등급사 표 ${t[0]} ${t[1]} 최고 등급`, t[4], g.top); cmp("C4", f, `등급사 표 ${t[0]} ${t[1]} 날짜`, t[6], g.d || "—"); }
    }
    const cp = rows((h.match(/Recent price checkpoints<\/h2>[\s\S]*?<\/table>/) || [""])[0]).slice(1), last = c.checkpoints[c.checkpoints.length - 1];
    if (cp.length) { const t = cells(cp[cp.length - 1]); cmp("NM2", f, "체크포인트 마지막 날짜", t[0], last ? last.d : null); if (last) { cmp("NM2", f, "체크포인트 마지막 NM", t[1], last.nm); cmp("PK1", f, "체크포인트 마지막 PSA 10", t[2], last.psa); } }
    const auc = rows((h.match(/at auction — by print and variant<\/h2>[\s\S]*?<\/table>/) || [""])[0]).slice(1);
    cmp("D9", f, "경매 변형 행 수", String(auc.length), String(c.auctionRows.length));
    auc.forEach((r, i) => { const t = cells(r).map(strip), a = c.auctionRows[i]; if (!a) return; cmp("D9", f, `경매 행 ${i + 1} 종료`, t[2], a.n); cmp("D9", f, `경매 행 ${i + 1} 낙찰`, t[3], a.sold); cmp("D9", f, `경매 행 ${i + 1} 중앙값`, t[5], a.medPrice); });
    for (const r of (h.match(/<h2>More [^<]* cards tracked here<\/h2>[\s\S]*?<\/table>/) || [""])[0].matchAll(/<tr><td><a href="([^"]+\.html)">[^<]*<\/a><\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td>/g)) {
      const o = byFile.get(r[1]); if (!o) continue;
      cmp("NM2", f, `형제 ${o.number} NM`, r[2], o.shown.nm); cmp("PK1", f, `형제 ${o.number} PSA 10`, dollars(r[3]), o.shown.psa);
    }
  }
  if (exists("cards/index.html")) {
    const h = read("cards/index.html");
    for (const r of h.matchAll(/<tr><td><a href="([^"]+\.html)">[^<]*<\/a> <small[^>]*>[^<]*<\/small><\/td><td>(?:<a [^>]*>)?[^<]*(?:<\/a>)?<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/g)) {
      const c = byFile.get(r[1]); if (!c) continue;
      const w = `cards/index.html ${c.number}`;
      cmp("NM2", w, "NM", r[2], c.shown.nm); cmp("PK1", w, "PSA 10", r[3], c.psa10 ? c.psa10.usd : null); cmp("CX2", w, "Premium", r[4], c.psa10 && !c.psa10.stale && c.nm.usable ? c.psa10.multiple : null); cmp("PK1", w, "PSA 10 표본", r[5], c.psa10 ? c.psa10.n : null); cmp("PK1", w, "PSA 10 날짜", r[6], c.psa10 ? c.psa10.date : null);
    }
    for (const m of h.matchAll(/<a href="([^"]+\.html)">(?:<img [^>]*>)?<b>[^<]*<\/b><small>[^<]*<\/small><span class="pr">([^<]*)<\/span><\/a>/g)) { const c = byFile.get(m[1]); if (c) cmp("NM2", `cards/index.html ${c.number}`, "격자 NM", m[2], c.shown.nm); }
  }
  if (exists("ko/cards.html")) {
    const byKey = new Map(F.cardPages.map((p) => [p.key, cardOf(p)]));
    for (const m of read("ko/cards.html").matchAll(/<tr><td>\d+<\/td><td class="l"><span class="cardCell">(?:<img[^>]*>)?<span>(?:[^<]*<small>([^<]*)<\/small>|([^<]*))<small>([A-Z0-9]+-\d+) · [A-Z]+-\d+[^<]*<\/small><\/span><\/span><\/td><td class="hideM">([^<]*)<\/td><td>([\s\S]*?)<\/td><td>([^<]*)<\/td><\/tr>/g)) {
      const name = unH(m[1] ?? m[2]), c = byKey.get(`${m[3]}|${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`); if (!c) continue;
      const w = `ko/cards.html ${m[3]}`;
      cmp("NM2", w, "NM 원화", m[4], c.nm.usable ? c.nm.krw : null); cmp("PK1", w, "PSA 10 원화", first(m[5], /([\d,]+)원/), c.psa10 ? c.psa10.krw : null);
      if (c.psa10 && c.psa10.stale) cmp("PK1", w, "PSA 10 관측일", first(m[5], /\((\d{4}-\d{2}-\d{2})\)/), c.psa10.date);
      cmp("CX2", w, "배수", m[6], c.psa10 && !c.psa10.stale && c.nm.usable ? c.psa10.multiple : null);
    }
  }
  if (exists("psa10-ranking.html")) {
    const all = F.order.all.flatMap((code) => S[code].cards.map((c) => [code, c]));
    for (const r of read("psa10-ranking.html").matchAll(/<tr(?: class="stale")?><td class="rk">\d+<\/td><td class="l">[\s\S]*?<span><b>([^<]*)<\/b><small>([^<]*)<\/small><\/span><\/a><\/td><td class="psa">([^<]*)<\/td><td class="obs"[^>]*>([\s\S]*?)<\/td><td class="hideM">([^<]*)<\/td><td class="rng hideM">([^<]*)<\/td><td class="hideM">([^<]*)<\/td><td class="mul">([^<]*)<\/td><td class="pop hideM">([\s\S]*?)<\/td>/g)) {
      const [set, num] = unH(r[2]).split(" · "), hit = all.find(([code, c]) => code === set && c.number === num && c.name === unH(r[1])); if (!hit) continue;
      const c = hit[1], w = `psa10-ranking.html ${num}`;
      cmp("PK1", w, "PSA 10", r[3], c.psa10 ? c.psa10.usd : null); if (c.psa10) { cmp("PK1", w, "PSA 10 날짜", times(r[4])[0], c.psa10.date); cmp("PK1", w, "PSA 10 표본", r[5], c.psa10.n); cmp("PK1", w, "PSA 10 저가", dollars(r[6]), c.psa10.low); }
      cmp("NM2", w, "NM", r[7], c.nm.usable ? c.nm.usd : null); cmp("CX2", w, "배수", r[8], c.psa10 && c.nm.usable ? c.psa10.multiple : null); cmp("C4", w, "PSA 인구", first(strip(r[9]), /^([\d,]+)/), c.pop ? c.pop.total : null);
    }
  }
}

// ── 홈·box-prices·세트 허브·한국어 허브·비교표·주간 표·글
const boardOf = () => Object.fromEntries(F.board.map((b) => [b.code, b]));
function summaryTables() {
  const B = boardOf(), H = F.home;
  for (const f of ["index.html", "packs.html", "box-prices.html", "sets/index.html"].filter(exists)) {
    const h = read(f);
    let n = 0;
    for (const tbl of h.matchAll(/<table class="homeSummaryTable[^"]*"(?![^>]*data-cheapest)[^>]*>[\s\S]*?<\/table>/g)) for (const tr of rows(tbl[0])) {
      const cs = cells(tr), code = first(strip(cs[0] || ""), /^((?:OP|EB|PRB)-\d{2})/), b = B[code]; if (!b || cs.length < 4) continue;
      n++;
      cmp("D17", f, `${code} 박스 시세`, cs[2], b.nowUsd); cmp("D17", f, `${code} 기준일`, first(cs[3], /^(\d{2}-\d{2})/) ?? strip(cs[3]), b.nowDate ? b.nowDate.slice(5) : null);
      if (b.nowUsd != null) { cmp("D17", f, `${code} n`, first(cs[3], /n=(\d+)/), b.n); cmp("D17", f, `${code} 창`, first(cs[3], /\/(\d+)d/), b.windowDays); }
      if (cs[4] != null) cmp("CW1", f, `${code} 4주`, cs[4], b.changePct);
    }
    if (!n) cmp("D17", f, "요약표 행", null, "행을 읽어야 한다");
    if (f === "sets/index.html") cmp("CL3", f, "Data 날짜", first(h, /Data (\d{4}-\d{2}-\d{2})/), F.dataDate);
    else if (f === "box-prices.html") cmp("D17", f, "Updated", first(h, /Updated (\d{4}-\d{2}-\d{2}) · refreshed daily/), F.dataDate);
    else cmp("D17", f, "데이터 날짜", first(h, /data (\d{4}-\d{2}-\d{2}) · each row dated/), F.dataDate);
  }
  if (exists("index.html")) {
    const h = read("index.html"), faq = faqOf(h), sum = first(h, /<!-- HOME_SUMMARY:START -->([\s\S]*?)<!-- HOME_SUMMARY:END -->/) || "";
    const pr = sum.match(/<p data-ko-html="[^"]*">(\$[\d,]+) \(([^)]*)\) – (\$[\d,]+) \(([^)]*)\)[^<]*<strong>(\d+)<\/strong> up · <strong>(\d+)<\/strong> down/);
    cmp("CH1", "index.html", "요약 최저가", pr && pr[1], H.cheapest ? H.cheapest.usd : null); if (pr && H.cheapest) cmp("CH1", "index.html", "요약 최저가 세트", pr[2], H.cheapest.codes.join(", "));
    cmp("D17", "index.html", "요약 최고가", pr && pr[3], H.priciest ? H.priciest.usd : null); if (pr && H.priciest) cmp("D17", "index.html", "요약 최고가 세트", pr[4], H.priciest.code);
    cmp("D17", "index.html", "요약 상승 수", pr && pr[5], H.nUp); cmp("D17", "index.html", "요약 하락 수", pr && pr[6], H.nDn);
    const a1 = ans(faq, /^How much is a One Piece booster box\?$/) || "", m1 = a1.match(/range from about (\$[\d,]+) \(([^)]*)\) to (\$[\d,]+) \(([^)]*)\)[^.]*as of (\d{4}-\d{2}-\d{2})/);
    cmp("CH1", "index.html", "FAQ 최저가", m1 && m1[1], H.cheapest ? H.cheapest.usd : null);
    if (m1 && H.cheapest) { for (const c of H.cheapest.codes) cmp("CH1", "index.html", `FAQ 최저가 세트 ${c}`, m1[2].includes(c) ? c : null, c); cmp("D17", "index.html", "FAQ 최고가", m1[3], H.priciest.usd); cmp("D17", "index.html", "FAQ 최고가 세트", m1[4].split(" ")[0], H.priciest.code); cmp("D17", "index.html", "FAQ as of", m1[5], F.dataDate); }
    const a2 = ans(faq, /most valuable\?$/) || "", m2 = a2.match(/^(\S+) .* at about (\$[\d,]+), ahead of (\S+) .* at (\$[\d,]+)\./);
    if (H.priciest && H.runnerUp) { cmp("D17", "index.html", "FAQ 최고가 세트", m2 && m2[1], H.priciest.code); cmp("D17", "index.html", "FAQ 2위", m2 && m2[3], H.runnerUp.code); cmp("D17", "index.html", "FAQ 2위 값", m2 && m2[4], H.runnerUp.usd); }
    const a3 = ans(faq, /going up or down/) || "", m3 = a3.match(/Of the (\d+) Japanese sets[^,]*, (\d+) are up and (\d+) are down.*largest gain is (\S+) at ([+-][\d.]+%) and the largest fall is (\S+) at ([+-]?[\d.]+%)/);
    cmp("D17", "index.html", "FAQ 등락 모수", m3 && m3[1], H.withChg); cmp("D17", "index.html", "FAQ 상승 수", m3 && m3[2], H.nUp); cmp("D17", "index.html", "FAQ 하락 수", m3 && m3[3], H.nDn);
    if (m3 && H.topUp) { cmp("D17", "index.html", "FAQ 최대 상승", m3[4], H.topUp.code); cmp("D17", "index.html", "FAQ 최대 상승률", m3[5], H.topUp.pct); cmp("D17", "index.html", "FAQ 최대 하락", m3[6], H.topDn.code); cmp("D17", "index.html", "FAQ 최대 하락률", m3[7], H.topDn.pct); }
  }
  if (exists("box-prices.html")) {
    const h = read("box-prices.html"), d = descOf(h), dm = d.match(/(\$[\d,]+)–(\$[\d,]+)/);
    cmp("CH1", "box-prices.html", "설명문 최저가", dm && dm[1], H.cheapest ? H.cheapest.usd : null); cmp("D17", "box-prices.html", "설명문 최고가", dm && dm[2], H.priciest ? H.priciest.usd : null);
    const trs = rows((h.match(/<table class="homeSummaryTable[^"]*" data-cheapest>[\s\S]*?<\/table>/) || [""])[0]).filter((r) => /<td>/.test(r));
    cmp("SE1", "box-prices.html", "최저가 표 세트", trs.map((r) => first(strip(cells(r)[0]), /^((?:OP|EB|PRB)-\d{2})/)).join(","), H.cheapRows.join(","));
    for (const r of trs) { const cs = cells(r), code = first(strip(cs[0]), /^((?:OP|EB|PRB)-\d{2})/), b = B[code]; if (!b) continue; cmp("D17", "box-prices.html", `최저가 표 ${code} 값`, cs[1], b.nowUsd); cmp("D17", "box-prices.html", `최저가 표 ${code} 기준일`, cs[2], b.nowDate); cmp("D17", "box-prices.html", `최저가 표 ${code} n`, first(cs[3], /^(\d+)/), b.n); }
  }
  if (exists("ko/index.html")) {
    const h = read("ko/index.html"), K = F.koHub, d = descOf(h);
    for (const tr of rows(h)) {
      const code = first(tr, /<td class="code"><a href="[a-z]+-\d+\.html">([A-Z]+-\d+)<\/a>/), b = B[code]; if (!b) continue;
      const cs = cells(tr), w = `ko/index.html ${code}`;
      cmp("D17", w, "원화", first(cs[2], /^([\d,]+)원/) ?? strip(cs[2]), S[code].priceKrw); cmp("D17", w, "기준일", first(cs[2], /fromDate">(\d{4}-\d{2}-\d{2})/), b.nowDate);
      cmp("CW1", w, "4주 등락", first(cs[3], /^([+-]?[\d.]+%|—)/), b.changePct); if (b.changeBasis) cmp("CW1", w, "등락 기준일", first(cs[3], /fromDate[^>]*>(\d{4}-\d{2}-\d{2}) 대비/), b.changeBasis);
      cmp("KO2", w, "재판 칸", first(cs[4], /재판 (\d+)회/) ?? (/재판 기록 없음/.test(cs[4]) ? "—" : null), S[code].reprint.count || null); cmp("KO2", w, "발매 후 추첨", first(cs[4], /발매 후 추첨 (\d+)회/), S[code].reprint.lottery.length || null);
    }
    cmp("KD1", "ko/index.html", "기준일", first(h, /기준일 (\d{4}-\d{2}-\d{2})\b/), F.dataDate); cmp("KD1", "ko/index.html", "마지막 갱신", first(h, /마지막 갱신 (\d{4}-\d{2}-\d{2})\./), F.dataDate); cmp("KD1", "ko/index.html", "설명문 기준일", first(d, /기준일 (\d{4}-\d{2}-\d{2})/), F.dataDate); cmp("KD1", "ko/index.html", "제목 기준일", first(h, /<title>[^<]*\((\d{4}-\d{2}-\d{2}) 기준\)/), F.dataDate);
    for (const [lbl, v] of [["최고", K.max], ["최저", K.min]]) { const m = d.match(new RegExp(`${lbl} ([A-Z0-9·-]+) ([\\d,]+)원`)); cmp("CH1", "ko/index.html", `설명문 ${lbl} 세트`, m && m[1].split("·").sort().join("·"), v ? [...v.codes].sort().join("·") : null); cmp("CH1", "ko/index.html", `설명문 ${lbl} 원화`, m && m[2], v ? v.krw : null); }
    const up = d.match(/급등 (\S+) ([+-][\d.]+%)/), dn = d.match(/급락 (\S+) ([+-]?[\d.]+%)/);
    if (K.topUp.length) { cmp("D17", "ko/index.html", "설명문 급등", up && up[1], K.topUp[0]); cmp("D17", "ko/index.html", "설명문 급등률", up && up[2], B[K.topUp[0]].changePct); cmp("D17", "ko/index.html", "설명문 급락", dn && dn[1], K.topDn[0]); cmp("D17", "ko/index.html", "설명문 급락률", dn && dn[2], B[K.topDn[0]].changePct); }
    const fx = ans(faqOf(h), /어디 기준인가요/) || "";
    cmp("KO1", "ko/index.html", "환율 문답", first(fx, /₩([\d.]+)\/\$/), F.fx.usdKrw); cmp("KO1", "ko/index.html", "환율 문답 날짜", first(fx, /(\d{4}-\d{2}-\d{2})/), F.fx.date);
    const ds = ldFlat(h).find((j) => j["@type"] === "Dataset"); if (ds && F.coverage.boxCsv) cmp("DS1", "ko/index.html", "Dataset 기간", ds.temporalCoverage, F.coverage.boxCsv.coverage);
  }
}
function compareTables() {
  const R = Object.fromEntries(F.compare.rows.map((r) => [r.code, r]));
  for (const f of ["compare.html", "articles/best-one-piece-booster-box.html"].filter(exists)) {
    const blk = first(read(f), /<!-- SET-COMPARISON:START -->([\s\S]*?)<!-- SET-COMPARISON:END -->/) || "";
    cmp("CW1", f, "As of", first(blk, /As of (\d{4}-\d{2}-\d{2})\./), F.compare.asOf);
    let n = 0;
    for (const tr of rows(blk)) {
      const code = first(tr, /<b>([A-Z]+-\d+)<\/b>/), r = R[code]; if (!r) continue;
      n++; const cs = cells(tr), w = `${f} ${code}`;
      cmp("D17", w, "JP box", dollars(cs[1]), r.jp); if (r.jp != null) cmp("D17", w, "JP n", first(cs[1], /n(\d+)/), r.jpN);
      cmp("D17", w, "EN box", dollars(cs[2]), r.en); if (r.en != null) cmp("D17", w, "EN n", first(cs[2], /n(\d+)/), r.enN);
      cmp("CW1", w, "4-wk", cs[3], r.chg); cmp("D17", w, "EN/JP", cs[4], r.ratio);
      cmp("PC1", w, "Priciest", dollars(cs[5]), r.topUsd);
      if (r.topUsd != null) { cmp("PC1", w, "Priciest 카드", first(cs[5], /<small[^>]*>([^<]*)<\/small>/), r.topNames.join(", ")); cmp("PC1", w, "Priciest 날짜", first(cs[5], /\((\d{4}-\d{2}-\d{2})\)/), r.topDate && r.topDate !== F.compare.asOf ? r.topDate : null); cmp("PC1", w, "Priciest 라벨", / TCG /.test(cs[5]) ? "TCG" : "NM", "NM"); }
      cmp("D17", w, "PSA 10 rate", cs[6], r.gem);
    }
    if (!n) cmp("CW1", f, "비교표 행", null, "행을 읽어야 한다");
  }
}
function weekly() {
  if (!exists("weekly.html")) return;
  const h = read("weekly.html"), W = F.weekly;
  cmp("WK1", "weekly.html", "week ending", first(h, /week ending (\d{4}-\d{2}-\d{2})/), W.weekEnd);
  cmp("WK1", "weekly.html", "eyebrow", first(h, /This week · (\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2} · data \d{4}-\d{2}-\d{2})/), `${W.weekStart} – ${W.weekEnd} · data ${W.dataDate}`);
  let n = 0;
  for (const tr of h.matchAll(/<tr[^>]*><td><a href="sets\/([a-z]+-\d+)(-english)?\.html">[\s\S]*?<\/tr>/g)) {
    const cs = cells(tr[0]).map(strip), code = tr[1].toUpperCase(), ed = tr[2] ? "en" : "jp", w = `weekly.html ${code} ${ed}`;
    if (cs.length >= 8) {
      const x = S[code].weekly[ed]; n++;
      if (!x) { cmp("WK1", w, "행", "있음", null); continue; }
      cmp("WK1", w, "Last week", cs[2], x.prev ? x.prev.median : null); cmp("WK1", w, "This week", cs[3], x.last.median); cmp("WK1", w, "WoW", cs[4], x.wow); cmp("WK1", w, "4-wk", cs[5], x.c4);
      cmp("WK1", w, "Sales", first(cs[6], /^(\S+)/), x.last.vol); cmp("WK1", w, "n", first(cs[6], /n=(\d+)/), x.last.n); cmp("WK1", w, "Listed", first(cs[7], /^(\S+)/), x.listed);
    } else if (cs.length === 5) {
      const p = S[code].psaWeekly; cmp("WK1", w, "New PSA grades", cs[2], p ? p.last.v : null); if (p) { cmp("WK1", w, "Prev week", cs[3], p.prev ? p.prev.v : null); if (p.prev) cmp("WK1", w, "WoW", cs[4], (p.last.v / p.prev.v - 1) * 100); }
    }
  }
  if (!n) cmp("WK1", "weekly.html", "표 행", null, "행을 읽어야 한다");
  const ds = ldFlat(h).find((j) => j["@type"] === "Dataset"); if (ds) cmp("DS1", "weekly.html", "Dataset 기간", ds.temporalCoverage, `${W.weekStart}/${W.weekEnd}`);
}
function articles() {
  const RF = Object.fromEntries(F.releaseFacts.map((r) => [r.setCode, r]));
  const f = "articles/one-piece-set-list-release-dates.html";
  if (exists(f)) {
    const h = read(f), newest = F.releases.newestOp, cur = newest && S[newest] ? S[newest].current.jp : null;
    for (const m of h.matchAll(/<tr><td>((?:OP|EB|PRB)-\d+)<\/td><td>[\s\S]*?<\/td><td>([^<]*)<\/td><td>([\s\S]*?)<\/td><td class="num">([\s\S]*?)<\/td>/g)) {
      const r = RF[m[1]], s = S[m[1]], w = `${f} ${m[1]}`; if (!r) continue;
      cmp("RD1", w, "JP 발매일", m[2], r.japanese.releaseDate ? shortDate(r.japanese.releaseDate) : "—"); cmp("RD1", w, "EN 발매일", first(strip(m[3]), /^([A-Z][a-z]{2} \d{1,2}, \d{4}|—)/), r.english.releaseDate ? shortDate(r.english.releaseDate) : "—");
      if (r.english.releaseDate && s && s.englishGuideUrl) cmp("RD1", w, "EN 링크", first(m[3], /href="\.\.\/sets\/([a-z0-9-]+\.html)"/), `${s.slug}-english.html`);
      const c = s ? s.current.jp : null; cmp("D17", w, "JP box", dollars(m[4]), c ? c.median : null); if (c) cmp("D17", w, "JP box 날짜", first(m[4], /<small>\s*([^<]*)<\/small>/), `${shortDate(c.d).replace(/, \d{4}$/, "")}`);
    }
    for (const m of h.matchAll(/<span data-newest-box>([^<]*)<\/span>/g)) cmp("D17", f, "data-newest-box", m[1], cur ? `${money(cur.median)} on ${longDate(cur.d)}` : "—");
    cmp("D17", f, "Newest main set", first(h, /<strong>Newest main set \(([A-Z]+-\d+)\):<\/strong>/), newest);
    cmp("D17", f, "latest 배지", first(h, /<a href="\.\.\/sets\/([a-z0-9-]+)\.html">(?:<span[^>]*>)?[A-Z]+-\d+ release date(?:<\/span>)? <small[^>]*data-newest[^>]*>/), newest ? newest.toLowerCase() : null);
    const nx = h.match(/<strong>Next (?:release|booster) \(([A-Z]+-\d+), ([A-Z][a-z]+ \d{1,2}, \d{4}) in Japan · ([A-Z][a-z]+ \d{1,2}, \d{4}) in English\):<\/strong>/), nu = F.releases.nextUp && RF[F.releases.nextUp];
    cmp("RD1", f, "Next release", nx && nx[1], F.releases.nextUp); if (nx && nu) { cmp("RD1", f, "Next release JP", nx[2], longDate(nu.japanese.releaseDate)); cmp("RD1", f, "Next release EN", nx[3], longDate(nu.english.releaseDate)); }
    const top = first(h, /<!-- RELEASE-TOP:START -->([\s\S]*?)<!-- RELEASE-TOP:END -->/) || "", fb = first(h, /<!-- RELEASE-FACTS:START -->([\s\S]*?)<!-- RELEASE-FACTS:END -->/) || "";
    for (const code of [newest, ...Object.keys(F.upcoming)].filter(Boolean)) {
      const r = RF[code], row = first(top, new RegExp(`(<tr><td><a href="\\.\\./sets/${code.toLowerCase()}\\.html">[\\s\\S]*?</tr>)`)); if (!r) continue;
      cmp("RD1", `${f} 맨 위 표 ${code}`, "행", row, { present: true }); if (row) { const cs = cells(row); cmp("RD1", `${f} 맨 위 표 ${code}`, "EN 날짜", times(cs[1])[0], r.english.releaseDate); cmp("RD1", `${f} 맨 위 표 ${code}`, "JP 날짜", times(cs[2])[0], r.japanese.releaseDate); }
      const sec = first(fb, new RegExp(`(<h2 id="${code.toLowerCase()}"[\\s\\S]*?</table>)`)); cmp("RD1", `${f} ${code} 구간`, "H2", sec, { present: true });
      if (sec) for (const [lbl, ed] of [["English", "english"], ["Japanese", "japanese"]]) { const tr = first(sec, new RegExp(`(<tr><td data-ko="[^"]*">${lbl}</td>[\\s\\S]*?</tr>)`)); cmp("RD1", `${f} ${code} 구간`, `${lbl} 날짜`, tr && times(tr)[0], r[ed].releaseDate); if (tr && r.japanese.cardTypes) cmp("RD1", `${f} ${code} 구간`, `${lbl} 카드 종류`, cells(tr)[3], ed === "english" ? r.english.cardTypes || r.japanese.cardTypes : r.japanese.cardTypes); }
    }
    const il = ldOf(h).find((j) => j["@type"] === "ItemList"), names = ((il && il.itemListElement) || []).map((e) => e.name || "");
    for (const r of F.releaseFacts) for (const [lbl, d] of [["Japanese", r.japanese.releaseDate], ["English", r.english.releaseDate]]) if (d && RF[r.setCode] && S[r.setCode] && S[r.setCode].hasPoints) cmp("RD1", `${f} ItemList ${r.setCode}`, lbl, names.find((x) => new RegExp(` ${r.setCode} .*\\(${lbl}\\): `).test(x)) || null, { present: true });
    for (const x of names) { const m = x.match(/ ([A-Z]+-\d+) .*\((Japanese|English)\): (\d{4}-\d{2}-\d{2})$/); if (m && RF[m[1]]) cmp("RD1", `${f} ItemList ${m[1]}`, `${m[2]} 날짜`, m[3], m[2] === "Japanese" ? RF[m[1]].japanese.releaseDate : RF[m[1]].english.releaseDate); }
  }
  if (exists("ja/release-dates.html")) for (const m of read("ja/release-dates.html").matchAll(/<tr><td>(?:<time datetime="(\d{4}-\d{2}-\d{2})">[^<]*<\/time>|—)<\/td><td>[\s\S]*?<\/td><td class="num">((?:OP|EB|PRB)-\d+)<\/td><td class="num">([\s\S]*?)<\/td>/g)) {
    const r = RF[m[2]]; if (!r) continue;
    cmp("RD1", `ja/release-dates.html ${m[2]}`, "発売日", m[1] || "—", r.japanese.releaseDate || "—"); cmp("RD1", `ja/release-dates.html ${m[2]}`, "BOX定価", first(m[3], /^([\d,]+)円/) ?? (/^—/.test(m[3]) ? "—" : null), r.japanese.msrpYenPerBox);
    if (/<small>/.test(m[3])) cmp("RD1", `ja/release-dates.html ${m[2]}`, "パック定価", first(m[3], /(?:1パック |\d+×)([\d,]+)円/), r.japanese.msrpYenPerPack);   // 팩 가격은 박스 정가가 공식에 없을 때만 작은 글씨로
  }
  const HMP = "articles/how-many-packs-one-piece-booster-box.html";
  if (exists(HMP)) {
    const h = read(HMP), vs = {};
    for (const tr of rows(first(h, /<div class="tblWrap" data-pack-math>([\s\S]*?)<\/table>/) || "")) {
      const cs = cells(tr).map(strip), code = first(cs[0] || "", /((?:OP|EB|PRB)-\d{2})/), s = S[code]; if (!s) continue;
      const k = s.keyFacts.jp, cur = s.current.jp, w = `${HMP} ${code}`;
      cmp("KF1", w, "Packs", cs[1], k.packsPerBox); cmp("KF1", w, "MSRP / pack", cs[2], k.msrp.jpPack); cmp("KF1", w, "MSRP / box", cs[3], k.msrp.jpBox); cmp("D17", w, "Box sold", cs[4], cur ? cur.median : null);
      cmp("D17", w, "Per pack", cs[5], cur && k.packsPerBox ? cur.median / k.packsPerBox : null); const v = cur && s.msrpUsd.jpBox ? cur.median / s.msrpUsd.jpBox : null; cmp("D17", w, "vs MSRP", cs[6], v); if (v != null) vs[code] = v;
    }
    const lead = first(h, /<p data-pack-math-lead>([\s\S]*?)<\/p>/) || "", lm = lead.match(/Across the (\d+) sets[^,]*, the widest gap is <strong>([A-Z]+-\d+)<\/strong> at ([\d.]+)×[^,]*, and the narrowest is <strong>([A-Z]+-\d+)<\/strong> at ([\d.]+)×/);
    const ks = Object.keys(vs), hi = ks.reduce((a, c) => (a == null || vs[c] > vs[a] ? c : a), null), lo = ks.reduce((a, c) => (a == null || vs[c] < vs[a] ? c : a), null);   // 동률은 표 순서 앞 세트
    cmp("D17", HMP, "lead 세트 수", lm && lm[1], ks.length); if (ks.length) { cmp("D17", HMP, "lead 최대", lm && lm[2], hi); cmp("D17", HMP, "lead 최대 배수", lm && lm[3], vs[hi]); cmp("D17", HMP, "lead 최소", lm && lm[4], lo); cmp("D17", HMP, "lead 최소 배수", lm && lm[5], vs[lo]); }
    const pf = first(h, /<!-- PACK-FACTS:START -->([\s\S]*?)<!-- PACK-FACTS:END -->/) || "";
    for (const m of pf.matchAll(/>((?:OP|EB|PRB)-\d{2})<\/a> page (?:lists <strong>(\d+) cards per pack<\/strong>|states no per-pack card count)/g)) cmp("SE1", `${HMP} ${m[1]}`, "영문 팩 장수", m[2] ?? "—", (F.enPackContents[m[1]] || {}).cardsPerPack ?? null);
    const nw = F.releases.newestOp && S[F.releases.newestOp];
    if (nw) { const nm = pf.match(/For the newest set, ([A-Z]+-\d+) [^<]*<a [^>]*>Bandai lists<\/a> an MSRP of <strong>¥([\d,]+) per pack<\/strong>/); cmp("RD1", HMP, "newest set", nm && nm[1], F.releases.newestOp); cmp("KF1", HMP, "newest 팩 정가", nm && nm[2], nw.keyFacts.jp.msrp.jpPack); }
  }
  for (const [f, pick] of [["articles/one-piece-booster-box-price-guide.html", (cs) => [cs[1], cs[2], cs[3]]], ["articles/japan-vs-english.html", (cs) => [cs[1], cs[2], null]], ["articles/japanese-vs-english-box-price-data-2026.html", (cs) => [cs[cs.length - 3], cs[cs.length - 2], cs[cs.length - 1]]]]) {
    if (!exists(f)) continue;
    // Key facts 표(kfTable, 2026-10-16 — H1 바로 아래 plain <tbody>)는 가격 표가 아니다 — 첫 tbody 를 읽기 전에 걷어낸다.
    const h = read(f).replace(/<table class="kfTable[\s\S]*?<\/table>/g, ""), body = first(h, /<tbody[^>]*>([\s\S]*?)<\/tbody>/) || "";
    let n = 0;
    for (const tr of rows(body)) {
      const cs = cells(tr), code = first(strip(cs[0] || ""), /((?:OP|EB|PRB)-\d{2})/), s = S[code]; if (!s || cs.length < 3) continue;
      n++; const [jp, en, x] = pick(cs), cj = s.current.jp, ce = s.current.en, w = `${f} ${code}`;
      cmp("D17", w, "JP now", dollars(jp), cj ? cj.median : null); cmp("D17", w, "EN now", dollars(en), ce ? ce.median : null);
      if (x != null) cmp("D17", w, "EN/JP", x, cj && ce ? ce.median / cj.median : null);
      if (f.endsWith("japan-vs-english.html") && cj && ce) cmp("D17", w, "EN vs JP %", cs[3], (ce.median / cj.median - 1) * 100);
    }
    if (!n) cmp("D17", f, "표 행", null, "행을 읽어야 한다");
    if (f.endsWith("data-2026.html")) cmp("D17", f, "caption as of", first(h, /as of ([A-Z][a-z]+ \d{1,2}, \d{4})<\/caption>/), longDate(F.series.asOf));
  }
}
function upcoming() {
  for (const [code, u] of Object.entries(F.upcoming)) {
    const f = `sets/${u.slug}.html`; if (!exists(f)) continue;
    const h = read(f), s = S[code], lds = ldOf(h);
    for (const [lbl, ed] of [["Japanese", "jp"], ["English", "en"]]) {
      const p = lds.find((j) => j["@type"] === "Product" && new RegExp(`\\(${lbl}\\)$`).test(j.name || "")), a = u.ask[ed];
      cmp("UP1", f, `Product(${lbl}) releaseDate`, p && p.releaseDate, u.release[ed]);
      if (p && p.offers) { cmp("UP1", f, `Product(${lbl}) lowPrice`, p.offers.lowPrice, a && a.best ? a.best.total : null); cmp("UP1", f, `Product(${lbl}) offerCount`, p.offers.offerCount, a ? a.n : null); }
    }
    cmp("UP1", f, "Article dateModified", (lds.find((j) => j["@type"] === "Article") || {}).dateModified, u.pageDate);
    cmp("UP1", f, "바이라인 Updated", first(h, /Updated <time datetime="(\d{4}-\d{2}-\d{2})"/), u.pageDate);
    cmp("UP1", f, "article:modified_time", first(h, /<meta property="article:modified_time" content="(\d{4}-\d{2}-\d{2})"/), u.pageDate);
    // "checked <날짜>" = 사실 확인일(page.modified). 단 "Bandai product page checked <날짜>" 는 그날 실제로 받은 상품 페이지 확인일(BD1, 2026-10-19).
    for (const m of strip(h).matchAll(/(Bandai product page )?\b(?:[Cc]hecked|[Rr]ead)(?: on)? ([A-Z][a-z]+ \d{1,2}, \d{4})/g)) {
      if (m[1]) { cmp("BD1", f, "반다이 상품 페이지 확인일(eyebrow)", m[2], u.bandai && u.bandai.checkedOn ? longDate(u.bandai.checkedOn) : null); continue; }
      if (!cmp("UP1", f, "확인일", m[2], longDate(u.modified))) break;
    }
    // BD1 — 화면의 반다이 확인일 = 사실 파일 bandai.checkedOn = 수집 로그(data/bandai-product-check.json log)에 남은 그 세트의 성공 날짜. 확인한 적 없는 날짜를 쓰지 않는다.
    {
      const bc = u.bandai, B = json("data/bandai-product-check.json", { sets: {}, log: [] });
      cmp("BD1", f, "상태 행 확인일", first(h, /Bandai product pages \(JP · EN\) checked <time datetime="(\d{4}-\d{2}-\d{2})"/), bc && bc.checkedOn ? bc.checkedOn : null);
      const kf = `ko/${u.slug}.html`;
      if (exists(kf)) cmp("BD1", kf, "eyebrow 반다이 확인일", first(read(kf), /반다이 상품 페이지 확인 (\d{4}-\d{2}-\d{2})/), bc && bc.checkedOn ? bc.checkedOn : null);
      if (bc && bc.checkedOn) {
        cmp("BD1", f, "확인일이 로그의 성공 날짜", (B.log || []).some((l) => l.code === code && l.d === bc.checkedOn && l.ok === true) ? bc.checkedOn : null, bc.checkedOn);
        if (bc.checkedOn > new Date().toISOString().slice(0, 10)) cmp("BD1", f, "확인일이 미래", bc.checkedOn, "오늘 이하");
      }
      if (bc && bc.cardList && !CL.productOf(code)) cmp("BD1", f, "카드리스트 미공개 확인일", first(h, /Not published · Bandai card list checked <time datetime="(\d{4}-\d{2}-\d{2})"/), bc.cardList.checkedOn);
    }
    const st = first(h, /Market-data status<\/th><td>([^<]*)<\/td>/) || "";
    if (s) { const sm = st.match(/sales since release: JP (\d+) · EN (\d+)/); cmp("D16", f, "상태 발매 후 JP", sm && sm[1], s.sinceRelease.jp ?? 0); cmp("D16", f, "상태 발매 후 EN", sm && sm[2], s.sinceRelease.en ?? 0); for (const ed of ["jp", "en"]) { const pr = s.preRelease[ed], pm = st.match(new RegExp(`${ed.toUpperCase()} (\\d+) sales \\((\\d+) listings\\)`)); cmp("D16", f, `상태 예약판매 ${ed}`, pm && pm[1], pr ? pr.sales : null); if (pm && pr) cmp("D16", f, `상태 예약판매 매물 ${ed}`, pm[2], pr.listings); } }
    cmp("D16", f, "상태 through", first(st, /through ([A-Z][a-z]+ \d{1,2}, \d{4})$/), longDate(u.through));
    const tbl = (h.match(/<table class="factTable preTbl[^"]*">[\s\S]*?<\/table>/) || [])[0];
    cmp("D16", f, "예약판매 표", tbl ? "있음" : null, u.hasTable ? "있음" : null);
    for (const tr of rows(tbl || "")) {
      const cs = cells(tr), ed = /Japanese/.test(cs[0] || "") ? "jp" : /English/.test(cs[0] || "") ? "en" : null; if (!ed || cs.length < 3) continue;
      const a = u.ask[ed], pr = s && s.preRelease[ed], w = `${f} ${ed}`;
      cmp("UP1", w, "최저 호가", dollars(cs[1]), a && a.best ? a.best.total : null); if (a) { cmp("UP1", w, "호가 중앙값", first(cs[1], /median (\$[\d,]+)/), a.median); cmp("UP1", w, "호가 매물 수", first(cs[1], /(\d+) listings/), a.n); }
      if (!u.released[ed]) { cmp("D16", w, "예약판매 중앙값", dollars(cs[2]), pr && pr.median != null ? pr.median : null); if (pr) { cmp("D16", w, "예약판매 건수", first(cs[2], /(\d+) sales/), pr.sales); cmp("D16", w, "예약판매 매물", first(cs[2], /(\d+) listings/), pr.listings); } }
    }
  }
}
function cardLists() {
  for (const c of F.cardLists) {
    const ids = CL.orderIds(c.code, (CL.productOf(c.code) || { ids: [] }).ids), N = c.numbers;
    for (const [f, ko] of [[`sets/${c.slug}-card-list.html`, false], [`ko/${c.slug}-card-list.html`, true]]) {
      if (!exists(f)) { cmp("CL1", f, "페이지", null, "있어야 한다"); continue; }
      // 요약 = Key facts 표(table.kfTable.clSummary, 2026-10-19 — 종전 p.clSummary 한 줄). 행마다 <th>라벨</th><td><b>값</b>.
      const h = read(f), sum = first(h, /<table class="kfTable[^"]*\bclSummary\b[^"]*"[^>]*>([\s\S]*?)<\/table>/) || "";
      for (const [lbl, key] of [[ko ? "카드" : "Cards", "cards"], [ko ? "카드 번호" : "Card numbers", "numbers"], [ko ? "기본" : "Base", "base"], [ko ? "패러렐" : "Parallel", "parallel"], ["SP", "sp"], ["TR", "tr"], [ko ? "리더(기본 인쇄)" : "Leaders (base print)", "leaders"]]) cmp("CL1", f, `요약 ${lbl}`, first(sum, new RegExp(`>${lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:</span>)?</th><td><b>([^<]*)</b>`)), c.counts[key]);   // 라벨에 괄호가 있어 이스케이프(2026-10-19)
      cmp("CL1", f, "요약 caption 확인일", first(sum, /<caption>[\s\S]*?<time datetime="(\d{4}-\d{2}-\d{2})">/), c.checked);
      cmp("CL1", f, "공식 출처 링크", h.includes(`href="${c.url}"`) ? c.url : null, c.url); cmp("CL1", f, "공식 확인일", h.includes(`<time datetime="${c.checked}">${c.checked}</time>`) ? c.checked : null, c.checked);
      const box = h.match(/(?:JP box sold median|일본판 박스 판매 중앙값) <b>([^<]*)<\/b>(?: \((\d{4}-\d{2}-\d{2}), n=(\d+)\))?[^<]*?(?:EN box|영문판 박스) <b>([^<]*)<\/b>(?: \((\d{4}-\d{2}-\d{2}), n=(\d+)\))?/);
      for (const [ed, i] of [["jp", 1], ["en", 4]]) { const b = c.box[ed]; cmp("CL1", f, `${ed} 박스`, box && box[i], b ? b.usd : null); if (box && b) { cmp("CL1", f, `${ed} 박스 날짜`, box[i + 1], b.date); cmp("CL1", f, `${ed} 박스 n`, box[i + 2], b.n); } }
      cmp("CL3", f, "Data 날짜", first(h, /(?:Data|데이터) (\d{4}-\d{2}-\d{2})<\/p>/), c.pageDate); cmp("CL3", f, "CollectionPage dateModified", (ldOf(h).find((j) => j["@type"] === "CollectionPage") || {}).dateModified, c.pageDate);
      cmp("CL1", f, "ItemList 수", String(((ldOf(h).find((j) => j["@type"] === "CollectionPage") || {}).mainEntity || {}).numberOfItems), String(c.counts.cards));
      const got = [...h.matchAll(/<tr id="[^"]+" data-id="([^"]+)">([\s\S]*?)<\/tr>/g)];
      cmp("CL1", f, "표 행 수", String(got.length), String(ids.length));
      const bad = got.findIndex((m, i) => m[1] !== ids[i]); if (bad >= 0 && got.length === ids.length) cmp("CL1", f, `표 ${bad + 1}행 ID`, got[bad][1], ids[bad]);
      for (const m of got) {
        const num = [...m[2].matchAll(/<td class="num wide">([\s\S]*?)<\/td>/g)].map((x) => x[1]).slice(-4), r = N[m[1]] || {}; if (num.length < 4) continue;
        cmp("NM1", `${f} ${m[1]}`, "NM", dollars(num[0]), r.nm ? r.nm.usd : null); cmp("CL1", `${f} ${m[1]}`, "Auction JP", dollars(num[1]), r.auction ? r.auction.usd : null); cmp("CL1", `${f} ${m[1]}`, "Auction EN", dollars(num[2]), r.auctionEn ? r.auctionEn.usd : null); cmp("CL1", `${f} ${m[1]}`, "PSA 10", dollars(num[3]), r.psa10 ? r.psa10.usd : null);
      }
    }
    const jf = `sets/${c.slug}-card-list.json`;
    if (exists(jf)) {
      const j = json(jf, {}), w = jf;
      cmp("CL3", w, "updated", j.updated, c.pageDate); cmp("CL1", w, "counts.cards", String((j.counts || {}).cards), String(c.counts.cards)); cmp("CL1", w, "officialList.checked", (j.officialList || {}).checked, c.checked);
      cmp("CL1", w, "box JP", (j.box || {}).japaneseSoldMedianUsd, c.box.jp ? c.box.jp.usd : null); cmp("CL1", w, "box EN", (j.box || {}).englishSoldMedianUsd, c.box.en ? c.box.en.usd : null);
      cmp("CL1", w, "cards 수", String((j.cards || []).length), String(ids.length));
      for (const r of j.cards || []) {
        const x = N[r.id] || {}, ww = `${w} ${r.id}`;
        cmp("NM1", ww, "nm.usd", r.nm && r.nm.usd, x.nm ? x.nm.usd : null); cmp("NM1", ww, "nm.observedOn", r.nm && r.nm.observedOn, x.nm ? x.nm.date : null);
        cmp("CL1", ww, "auction", r.auction && r.auction.medianUsd, x.auction ? x.auction.usd : null); if (r.auction) { cmp("CL1", ww, "auction.sold", r.auction.sold, x.auction ? x.auction.n : null); cmp("CL1", ww, "auction.through", r.auction.through, F.cardAuction.day); }
        cmp("CL1", ww, "auctionEnglishPrint", r.auctionEnglishPrint && r.auctionEnglishPrint.medianUsd, x.auctionEn ? x.auctionEn.usd : null);
        cmp("CL1", ww, "psa10", r.psa10 && r.psa10.usd, x.psa10 ? x.psa10.usd : null); if (r.psa10 && x.psa10) { cmp("CL1", ww, "psa10.n", r.psa10.n, x.psa10.n); cmp("CL1", ww, "psa10.observedOn", r.psa10.observedOn, x.psa10.date); cmp("CL1", ww, "psa10.basis", r.psa10.basis, x.psa10.basis); }
        cmp("CL1", ww, "cardPage", r.cardPage, x.page ? { present: true } : null);
      }
    }
    const cf = `sets/${c.slug}-card-list.csv`;
    if (exists(cf)) { const lines = read(cf).trim().split("\n"); cmp("CL1", cf, "행 수", String(lines.length - 1), String(ids.length)); }
  }
  if (exists("free-data.html")) {
    const h = read("free-data.html"), nodes = ldFlat(h);
    for (const [idSuffix, cov] of [["#ai-json", F.coverage.aiData], ["#box-csv", F.coverage.boxCsv], ["#grading-csv", F.coverage.grading], ["#card-lists", F.coverage.cardLists]]) {
      const ds = nodes.find((j) => j["@type"] === "Dataset" && String(j["@id"] || "").endsWith(idSuffix)); if (!ds || !cov) continue;
      cmp("DS1", `free-data.html ${idSuffix}`, "temporalCoverage", ds.temporalCoverage, cov.coverage); cmp("DS1", `free-data.html ${idSuffix}`, "dateModified", ds.dateModified, cov.modified || cov.to);
    }
    const cat = nodes.find((j) => j["@type"] === "DataCatalog"); if (cat) cmp("CL3", "free-data.html", "Page regenerated", first(h, /Page regenerated (\d{4}-\d{2}-\d{2})/), cat.dateModified);
    cmp("DS1", "free-data.html", "FX", first(h, /FX ₩([\d.]+)\/\$ \((\d{4}-\d{2}-\d{2})\)/), F.fx.usdKrw);
    for (const m of h.matchAll(/<tr><td>([A-Z]+-\d{2})<\/td><td>(Japanese|English)<\/td>(?:<td class="num">([^<]*)<\/td>){5}/g)) {
      const t = cells(m[0]).slice(2), s = S[m[1]]; if (!s) continue;
      const ed = m[2] === "Japanese" ? "jp" : "en", g = s.grading, w = `free-data.html ${m[1]} ${m[2]}`;
      cmp("G9", w, "PSA", t[0], g.psa[ed] ? g.psa[ed].total : null); cmp("G9", w, "PSA 10 rate", t[1], g.psa[ed] ? g.psa[ed].gemRate : null); cmp("G9", w, "CGC", t[2], g.cgc[ed] ? g.cgc[ed].total : null); cmp("G9", w, "Pristine 10", t[3], g.cgc[ed] ? g.cgc[ed].pristine10 ?? null : null); cmp("G9", w, "TAG", t[4], g.tag[ed] ? g.tag[ed].total : null);
    }
  }
  if (exists("psa-grading.html")) {
    const h = read("psa-grading.html"), tbls = [...h.matchAll(/<table class="aTable">[\s\S]*?<\/table>/g)].map((m) => m[0]);
    for (const tr of rows(tbls[1] || "")) {
      const code = first(tr, /<b>([A-Z]+-\d+)<\/b>/), s = S[code]; if (!s) continue;
      const cs = cells(tr).slice(1), gp = s.gradingPage;
      for (const [i, [ed, k]] of [["jp", "psa"], ["en", "psa"], ["jp", "cgc"], ["en", "cgc"], ["jp", "tag"], ["en", "tag"]].entries()) {
        const g = gp[ed][k], w = `psa-grading.html ${code} ${k} ${ed}`;
        cmp("G9", w, "total", first(cs[i] || "", /^([\d,]+|—)/), g ? g.total : null); if (g) { cmp("G9", w, "add", first(cs[i], /<small>([+\-−][\d,]+)<\/small>/), g.add); if (g.gem != null) cmp("G9", w, "gem", first(cs[i], /class="gem">([\d.]+)% top/), (g.gem / g.total) * 100); }
      }
    }
    // "updated" = 등급 표의 마지막 관측일(generate-psa-grading-page 와 같은 정의) — 2026-10-16. F.dataDate(packs.updated)와 대조하던 탓에
    // 진행매물 수집으로 packs.updated 만 하루 앞선 날(10-15 워크플로) 등급 표는 10-14 인데 FAIL 하여 그날 관측이 커밋되지 못했다.
    const gradeTo = Object.values(S).flatMap((s) => (s.gradingPage ? ["jp", "en"].flatMap((e) => ["psa", "cgc", "tag"].map((k) => (s.gradingPage[e] && s.gradingPage[e][k] && s.gradingPage[e][k].to) || "")) : [])).sort().pop() || F.dataDate;
    cmp("G9", "psa-grading.html", "updated", first(h, /updated (\d{4}-\d{2}-\d{2})/), gradeTo);
  }
  if (exists("opbox-grading-population.csv")) {
    const [head, ...lines] = read("opbox-grading-population.csv").trim().split("\n").map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)), col = (r, n) => r[head.indexOf(n)];
    for (const r of lines) {
      const s = S[col(r, "set_code")], ed = col(r, "edition") === "japanese" ? "jp" : "en"; if (!s) continue;
      const g = s.grading, w = `opbox-grading-population.csv ${col(r, "set_code")} ${ed}`;
      cmp("G9", w, "psa_total", col(r, "psa_total") || null, g.psa[ed] ? g.psa[ed].total : null); cmp("G9", w, "psa10_rate_pct", col(r, "psa10_rate_pct") || null, g.psa[ed] ? g.psa[ed].gemRate : null); cmp("G9", w, "psa_total_as_of", col(r, "psa_total_as_of") || null, g.psa[ed] ? g.psa[ed].updated : null);
      cmp("G9", w, "cgc_total", col(r, "cgc_total") || null, g.cgc[ed] ? g.cgc[ed].total : null); cmp("G9", w, "cgc_pristine10", col(r, "cgc_pristine10") || null, g.cgc[ed] ? g.cgc[ed].pristine10 ?? null : null); cmp("G9", w, "tag_total", col(r, "tag_total") || null, g.tag[ed] ? g.tag[ed].total : null);
    }
  }
}

// ── AI 파일·llms — 피드 블록은 사실 파일의 같은 블록과 깊은 비교, llms 표는 셀 비교
function aiFiles() {
  const AI = json("opbox-ai-data.json", null), AC = json("opbox-ai-cards.json", null), AG = json("opbox-ai-grading.json", null), AU = json("opbox-ai-auctions.json", null);
  const asOf = F.ai.datasetUpdatedOn;
  for (const [f, o] of [["opbox-ai-data.json", AI], ["opbox-ai-cards.json", AC], ["opbox-ai-grading.json", AG], ["opbox-ai-auctions.json", AU]]) if (o) cmp("AS1", f, "datasetUpdatedOn", o.datasetUpdatedOn, asOf);
  if (AI) {
    cmp("AS1", "opbox-ai-data.json", "fx.observedOn", (AI.fx || {}).observedOn, F.fx.date);
    cmp("RF1", "opbox-ai-data.json", "releaseFacts", deq(AI.releaseFacts, F.releaseFacts) ? "같음" : "다름", "같음");
    cmp("D17", "opbox-ai-data.json", "sets 순서", (AI.sets || []).map((s) => s.setCode).join(","), F.order.all.join(","));
    for (const a of AI.sets || []) {
      const s = S[a.setCode]; if (!s) continue;
      const w = `opbox-ai-data.json ${a.setCode}`;
      cmp("D17", w, "boxMarket", deq(a.boxMarket, s.market) ? "같음" : "다름", "같음"); cmp("RF1", w, "englishReleaseDate", a.englishReleaseDate, s.enRelease);
      const hits = s.cards.filter((c) => Number.isInteger(c.rank) && c.rank <= 7);
      cmp("NM2", w, "topHits 수", String((a.topHits || []).length), String(hits.length));
      (a.topHits || []).forEach((t, i) => { const c = hits[i]; if (!c) return; const ww = `${w} topHits[${i}]`; cmp("RY1", ww, "card", `${t.cardNumber}|${t.name}|${t.rarity}`, `${c.number}|${c.name}|${c.rarity}`); cmp("NM1", ww, "rawNmAsk", deq(t.rawNmAsk, c.ai.rawNmAsk) ? "같음" : "다름", "같음"); cmp("PK1", ww, "psa10Sold", deq(t.psa10Sold, c.ai.psa10Sold) ? "같음" : "다름", "같음"); cmp("C4", ww, "psaPopulation", deq(t.psaPopulation, c.ai.psaPopulation) ? "같음" : "다름", "같음"); });
    }
  }
  if (AC) {
    const byUrl = new Map((AC.pages || []).map((p) => [p.url, p]));
    cmp("NM2", "opbox-ai-cards.json", "pages 수", String((AC.pages || []).length), String(F.cardPages.length));
    for (const p of F.cardPages) {
      const c = cardOf(p), a = byUrl.get(`https://opboxindex.com/cards/${p.file}`), w = `opbox-ai-cards.json ${c.number}`;
      if (!cmp("NM2", w, "page", a ? "있음" : null, "있음")) continue;
      cmp("RY1", w, "card", `${a.cardNumber}|${a.name}|${a.rarity}|${a.containerSetCode}`, `${c.number}|${c.name}|${c.rarity}|${p.code}`);
      cmp("NM1", w, "rawNmAsk", deq(a.rawNmAsk, c.ai.rawNmAsk) ? "같음" : "다름", "같음"); cmp("PK1", w, "psa10Sold", deq(a.psa10Sold, c.ai.psa10SoldUsd) ? "같음" : "다름", "같음"); cmp("C4", w, "psaPopulation", deq(a.psaPopulation, c.ai.psaPopulation) ? "같음" : "다름", "같음");
    }
  }
  if (AG) cmp("G9", "opbox-ai-grading.json", "본문(basis·definitions·observedOn·sets)", deq({ basis: AG.basis, definitions: AG.definitions, observedOn: AG.observedOn, sets: AG.sets }, F.aiGrading) ? "같음" : "다름", "같음");
  if (exists("llms.txt")) {
    const t = read("llms.txt");
    cmp("AS1", "llms.txt", "Data as of", first(t, /Data as of (\d{4}-\d{2}-\d{2})\./), asOf);
    const up = F.releaseFacts.filter((r) => r.status === "upcoming");
    cmp("RF1", "llms.txt", "Upcoming sets", first(t, /Upcoming sets with official release facts: ([^.]*)\./), up.map((r) => r.setCode).join(", ") || null);
    for (const r of up) { const line = first(t, new RegExp(`^- ${r.setCode} [^\\n]*`, "m"), 0) || ""; cmp("RF1", `llms.txt ${r.setCode}`, "발매일 줄", /Japan \S+ · English \S+/.test(line) ? `${first(line, /Japan (\S+)/)}|${first(line, /English (\S+)/)}` : null, `${r.japanese.releaseDate || "—"}|${r.english.releaseDate || "—"}`); if (r.japanese.cardTypes) cmp("RF1", `llms.txt ${r.setCode}`, "카드 종류", first(line, /· ([\d+]+) card types/), r.japanese.cardTypes); }
  }
  if (exists("llms-full.txt")) {
    const t = read("llms-full.txt"), sect = (name) => first(t, new RegExp(`^## ${name}[^\\n]*\\n(?:Format:[^\\n]*\\n)?([\\s\\S]*?)\\n\\n`, "m")) || "";
    cmp("AS1", "llms-full.txt", "제목 data as of", first(t, /^# OP Box Index — full facts file \(data as of (\d{4}-\d{2}-\d{2})\)/), asOf);
    const yen = (v) => (v == null ? "—" : `¥${v.toLocaleString("en-US")}`);
    for (const r of F.releaseFacts) {
      const row = first(sect("Release dates and product facts"), new RegExp(`^${r.setCode} \\|[^\\n]*`, "m"), 0); if (!cmp("RF1", `llms-full.txt 발매 표 ${r.setCode}`, "행", row, { present: true })) continue;
      const c = row.split(" | "), j = r.japanese, e = r.english;
      cmp("RF1", `llms-full.txt 발매 표 ${r.setCode}`, "status·JP·EN·정가·팩·장수·종류", c.slice(2, 10).join(" | "), [r.status || "—", j.releaseDate || "—", e.releaseDate || "—", yen(j.msrpYenPerPack), yen(j.msrpYenPerBox), j.packsPerBox ?? "—", j.cardsPerPack ?? "—", j.cardTypes || e.cardTypes || "—"].join(" | "));
    }
    for (const code of F.order.all) {
      const s = S[code], row = first(sect("Booster box prices by set"), new RegExp(`^${code} \\|[^\\n]*`, "m"), 0); if (!cmp("D17", `llms-full.txt 박스 표 ${code}`, "행", row, { present: true })) continue;
      const c = row.split(" | "), w = `llms-full.txt 박스 표 ${code}`;
      // 이 표는 AI 피드(sets[code].market)를 그대로 적는다 — 판매는 28일 넘으면 "—", 최저 매물은 activeAsk.cheapestListing
      for (const [i, ed] of [[2, "japanese"], [4, "english"]]) { const m = s.market[ed], sold = m.sold && !(m.qualityFlags || []).includes("stale_over_28_days") ? m.sold : null, cl = m.activeAsk && m.activeAsk.cheapestListing; cmp("D17", w, `${ed} sold`, dollars(c[i]), sold ? sold.medianUsd : null); if (sold) { cmp("D17", w, `${ed} n`, first(c[i], /n=(\d+)/), sold.sampleSize); cmp("D17", w, `${ed} 날짜`, first(c[i], /(\d{4}-\d{2}-\d{2})/), sold.sampleCollectedOn); } cmp("KF1", w, `${ed} cheapest`, dollars(c[i + 1]), cl ? cl.totalUsd : null); }
      const gr = first(sect("Graded population by set"), new RegExp(`^${code} \\|[^\\n]*`, "m"), 0); if (!gr) continue;
      const gc = gr.split(" | "), g = s.grading;
      for (const [i, ed] of [[1, "jp"], [4, "en"]]) { cmp("G9", `llms-full.txt 등급 표 ${code}`, `${ed} PSA`, first(gc[i], /^([\d,]+)/), g.psa[ed] ? g.psa[ed].total : null); cmp("G9", `llms-full.txt 등급 표 ${code}`, `${ed} CGC`, first(gc[i + 1], /^([\d,]+)/), g.cgc[ed] ? g.cgc[ed].total : null); cmp("G9", `llms-full.txt 등급 표 ${code}`, `${ed} TAG`, first(gc[i + 2], /^([\d,]+)/), g.tag[ed] ? g.tag[ed].total : null); }
    }
    const cardRows = new Map(t.split("\n").filter((l) => l.includes("https://opboxindex.com/cards/")).map((l) => { const c = l.split(" | "); return [c[c.length - 1], c]; }));
    for (const p of F.cardPages) {
      const c = cardOf(p), row = cardRows.get(`https://opboxindex.com/cards/${p.file}`), w = `llms-full.txt 카드 표 ${c.number}`;
      if (!cmp("LP1", w, "행", row, { present: true })) continue;
      const nm = c.ai.rawNmAsk, ps = c.ai.psa10SoldUsd, pop = c.ai.psaPopulation;
      cmp("NM1", w, "NM", row[3], nm ? `¥${nm.priceJpy.toLocaleString("en-US")} ≈ ${money(nm.usdEquivalent)} (${nm.observedOn})` : "n/a");
      cmp("PK1", w, "PSA 10", row[4], ps && Number.isFinite(ps.medianUsd) ? `${money(ps.medianUsd)} (n=${ps.sampleSize}, ${ps.sampleCollectedOn || ""})` : "n/a");
      cmp("LP1", w, "PSA 인구", row[5], pop ? `${pop.total.toLocaleString("en-US")} / ${pop.grade10.toLocaleString("en-US")} (${pop.observedOn})` : "n/a");
    }
    for (const c of F.cardLists) { const row = first(sect("Official card lists by set"), new RegExp(`^${c.code} [^\\n]*`, "m"), 0); if (cmp("CL1", `llms-full.txt 카드리스트 ${c.code}`, "행", row, { present: true })) cmp("CL1", `llms-full.txt 카드리스트 ${c.code}`, "장수·확인일", `${first(row, /: (\d+) cards/)}|${first(row, /checked (\d{4}-\d{2}-\d{2})/)}`, `${c.counts.cards}|${c.checked}`); }
  }
  if (exists("opbox-set-prices.csv")) {
    const [head, ...lines] = read("opbox-set-prices.csv").trim().split("\n").map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)), col = (r, n) => r[head.indexOf(n)];
    for (const r of lines) {
      const s = S[col(r, "set_code")]; if (!s) continue;
      for (const ed of ["jp", "en"]) { const m = s.market[ed === "jp" ? "japanese" : "english"], w = `opbox-set-prices.csv ${s.code} ${ed}`; cmp("D17", w, "sold median", col(r, `${ed}_sold_median_usd`) || null, m.sold ? m.sold.medianUsd : null); cmp("D17", w, "sold date", col(r, `${ed}_sold_sample_collected_on`) || null, m.sold ? m.sold.sampleCollectedOn : null); cmp("D17", w, "ask median", col(r, `${ed}_active_ask_median_usd`) || null, m.activeAsk ? m.activeAsk.medianUsd : null); }
    }
  }
}

// 영역별 대조 건수 하한 — 표 구조가 바뀌어 아무것도 못 읽으면(검사 안 하고 통과) 여기서 걸린다. 2026-10-15 실측의 절반쯤.
// OV1 — 한 사실 한 값(2026-10-19): 세트 수·카드 페이지 수·기준일·세트 이름이 페이지마다 같은가. 종전 compare "Sets compared 24"(발매 전 2개 포함) vs
//   다른 페이지 22, llms "115 cards with raw NM and PSA 10" vs cards/index 87, 홈 기준일 10-18 vs 세트 허브 10-19, PRB-01·PRB-02 둘 다 "Premium Booster" 였다.
function oneValue() {
  const nSets = F.board.length, nCards = F.cardPages.length;
  const kfB = (h, k) => { const r = kfRows(h)[k]; return r ? first(r.td, /<b>(\d+)<\/b>/) : null; };
  const kfT = (h, k) => { const r = kfRows(h)[k]; return r ? first(r.td, /<time datetime="(\d{4}-\d{2}-\d{2})"/) : null; };
  for (const [f, k] of [["sets/index.html", "sets"], ["compare.html", "sets"], ["index.html", "sets"]]) if (exists(f)) cmp("OV1", f, "세트 수", kfB(read(f), k), nSets);
  if (exists("box-prices.html")) cmp("OV1", "box-prices.html", "H1 세트 수", first(read("box-prices.html"), /<h1>[^<]*all (\d+) sets<\/h1>/), nSets);
  if (exists("llms.txt")) {
    const t = read("llms.txt");
    cmp("OV1", "llms.txt", "Coverage 세트 수", first(t, /Coverage: (\d+) tracked One Piece sets/), nSets);
    for (const re of [/(\d+) individual card price pages/, /all (\d+) card pages/, /(\d+) card pages, grading/, /cards\/\): (\d+) card pages/]) cmp("OV1", "llms.txt", `카드 페이지 수 ${re.source.slice(0, 24)}`, first(t, re), nCards);
  }
  for (const f of ["index.html", "sets/index.html", "compare.html", "cards/index.html"]) if (exists(f)) cmp("OV1", f, "기준일", kfT(read(f), "asof"), F.dataDate);
  cmp("OV1", "compare", "compare.asOf = dataDate", F.compare.asOf, F.dataDate);
  const nameOf = (c) => S[c] && (S[c].nameFull || S[c].nameEn);
  if (exists("compare.html")) for (const m of read("compare.html").matchAll(/<th scope="row" class="ctSet"><a href="\/sets\/[^"]+"><b>([A-Z]+-\d+)<\/b><span>([^<]*)<\/span>/g)) if (S[m[1]] && !S[m[1]].unreleased) cmp("OV1", `compare.html ${m[1]}`, "세트 이름", unH(m[2]), nameOf(m[1]));
  for (const f of ["box-prices.html", "index.html"]) if (exists(f)) for (const m of read(f).matchAll(/<td class="code"><a href="sets\/[^"]+">([A-Z]+-\d+)<\/a><\/td><td class="name">([^<]*)/g)) cmp("OV1", `${f} ${m[1]}`, "세트 이름", unH(m[2]), nameOf(m[1]));
}
const MIN = { oneValue: 60, sets: 3000, cards: 3500, summary: 300, compare: 230, weekly: 180, articles: 300, upcoming: 30, cardLists: 25000, ai: 1100 };   // 실측(2026-10-15) sets 6,286 · cards 7,210 · summary 603 · compare 474 · weekly 377 · articles 654 · upcoming 72 · cardLists 52,969 · ai 2,285
let compared = 0;
function run() {
  F = facts(); S = F.sets; counts = new Map(); compared = 0;
  const AREAS = [
    ["sets", () => { for (const code of F.order.setPages) { const f = `sets/${S[code].slug}.html`; if (exists(f)) setPage(code, "jp", f, "en"); } for (const code of F.order.englishPages) { const f = `sets/${S[code].slug}-english.html`; if (exists(f)) setPage(code, "en", f, "en"); } for (const code of F.order.setPages) { const f = `ko/${S[code].slug}.html`; if (exists(f)) setPage(code, "jp", f, "ko"); } }],
    ["cards", cardPages], ["summary", summaryTables], ["compare", compareTables], ["weekly", weekly], ["articles", articles], ["upcoming", upcoming], ["cardLists", cardLists], ["ai", aiFiles], ["oneValue", oneValue],
  ];
  const byArea = {};
  for (const [name, fn] of AREAS) { const before = compared; fn(); byArea[name] = compared - before; if (byArea[name] < MIN[name]) errors.push(`PAGES-VS-FACTS: ${name} 영역 대조 ${byArea[name]}건 < 하한 ${MIN[name]} — 표·칸 구조가 바뀌어 읽지 못했으면 이 검사도 같이 고칠 것`); }
  for (const [id, k] of counts) if (k > CAP) (PUBLISH_TOUCHED ? errors : warnings).push(`PAGES-VS-FACTS/${id}${PUBLISH_TOUCHED ? ":" : "(경고)"} 그 밖에 ${k - CAP}건 더`);
  return byArea;
}

module.exports = { checks, run, cmp, MIN };
