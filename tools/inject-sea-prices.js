#!/usr/bin/env node
// articles/one-piece-booster-box-prices-sea.html 의 "일본판 박스를 현지 통화로" 표와 그 위아래 문장
// (환율·기준일), 제목 줄의 월을 box-sold-series 와 data/fx.json 에서 매일 다시 쓴다.
//
// 왜: 표가 2026-07-14 시세·07-15 환율에 손으로 박혀 있었다. 9월 말 실측으로 OP-16 은 글 $150 → 실제 $95,
//     OP-01 은 $313 → $300 인데 제목 줄은 "(July 2026)" 였다.
//
// 규칙 (tools/inject-box-price-guide.js 와 같다)
//  · 행은 표에 이미 있는 세트만 다시 쓴다. 이름은 표에서 읽어 유지하고, 비어 있으면 packs.json 의 nameEn,
//    그것도 없으면 코드만 — 지어내지 않는다.
//  · USD 는 JP 시계열의 마지막 관측 중앙값. 마지막 판매가 STALE_DAYS 를 넘으면 그 행은 USD·현지 통화 모두 "—".
//  · 현지 통화 = USD × data/fx.json 의 sea 환율(1 USD 당 현지 통화, ECB 기준환율).
//  · 정가 행은 각주("MSRP row = 24 packs × ¥240 (OP-17 …)")대로 set-facts.json 의 OP-17 packsPerBox × jpMsrpYenPerPack 을
//    data/fx.json 의 jpyKrw / usdKrw 로 USD 환산한다(inject-pack-math 와 같은 식). USD 칸은 "~$37", 현지 통화는 반올림 전 USD × sea 환율.
//    각주의 팩 수·팩당 엔과 FAQ 의 "about $N at MSRP" 도 같은 값으로 다시 쓴다. 정가나 환율을 못 읽으면 "—".
//    (전에는 USD 칸의 손으로 쓴 "~$36"(7월 환율)을 읽어 곱했다 — 9/29 환율로 정의대로 계산한 값보다 1.8% 낮았다.)
//  · 표기는 기존 표 형식 그대로: ₱·฿ 10단위, S$·RM 1단위, Rp 는 100만 이상 x.xxM / 미만 xxxK.
//  · 본문 두 문장도 데이터로(2026-11-05 — 7월에 손으로 쓴 "The next set, OP-17 … August 22, 2026" 이 OP-17 발매 뒤 두 달 넘게
//    남았고, "ranks all 21 Japanese boxes" 는 어느 값과도 맞지 않았다):
//      <span data-next-set> = 사실 파일 releases.nextUp 의 일본 발매일(그날이 기준일 뒤일 때만, 아니면 빈 칸) — 발매일 글의 "Next release" 와 같은 세트.
//      비교표 문장의 세트 수 = compare.html "Sets compared"(비교표 행 중 발매된 세트) 와 같은 정의.
//  · 필수 자리(tbody·표의 세트 행·환율 문장·기준일 두 곳·제목 줄·dateModified·다음 세트 칸·비교표 문장) 중 하나라도 없으면 글 구조가 바뀐 것이다 —
//    반쯤 고친 글을 쓰지 않고 {status:"error"} 로 exit 1.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ART = path.join(ROOT, "articles/one-piece-booster-box-prices-sea.html");
const STALE_DAYS = 28;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MONTH[m - 1]} ${d}, ${y}`; };
const monthYear = (iso) => { const [y, m] = iso.split("-").map(Number); return `${MONTH[m - 1]} ${y}`; };
const usd = (v) => "$" + Math.round(v).toLocaleString("en-US");
const r1 = (v) => Math.round(v).toLocaleString("en-US");
const r10 = (v) => (Math.round(v / 10) * 10).toLocaleString("en-US");
const idr = (v) => { const k = Math.round(v / 1e3); return k >= 1000 ? "Rp" + (v / 1e6).toFixed(2) + "M" : "Rp" + k + "K"; };
// 표 열 순서(PHP·SGD·MYR·IDR·THB)와 같다. cell = 표 칸, rate = 표 위 문장의 "1 USD 당" 표기.
const CUR = [
  { code: "PHP", cell: (v) => "₱" + r10(v), rate: (r) => "₱" + r.toFixed(1) },
  { code: "SGD", cell: (v) => "S$" + r1(v), rate: (r) => "S$" + r.toFixed(2) },
  { code: "MYR", cell: (v) => "RM" + r1(v), rate: (r) => "RM" + r.toFixed(2) },
  { code: "IDR", cell: idr, rate: (r) => "Rp" + r10(r) },
  { code: "THB", cell: (v) => "฿" + r10(v), rate: (r) => "฿" + r.toFixed(1) },
];

const skip = (reason) => { console.log(JSON.stringify({ status: "skip", reason })); process.exit(0); };
const fail = (reason, extra) => { console.log(JSON.stringify({ status: "error", reason, ...extra })); process.exit(1); };
if (!fs.existsSync(ART)) skip("article missing");

let html = fs.readFileSync(ART, "utf8");
const crlf = html.includes("\r\n");
const nl = (s) => (crlf ? s.replace(/\n/g, "\r\n") : s);

// 고칠 자리가 하나라도 없으면 글 구조가 바뀐 것이다 — 반쯤 고친 글을 쓰지 않고 실패로 끝낸다.
const RE = {
  tbody: /(<tbody>)[\s\S]*?(<\/tbody>)/,
  rates: /converted from USD at [A-Z][a-z]+ \d{1,2}, \d{4} exchange rates \([^)]*\)/,
  market: /Market values as of [A-Z][a-z]+ \d{1,2}, \d{4}/,
  fx: /FX as of [A-Z][a-z]+ \d{1,2}, \d{4}/,
  heading: /(What Japanese boxes cost in your currency \()[A-Z][a-z]+ \d{4}(\))/,
  dateModified: /("dateModified": ")[^"]*(")/,
  nextSet: /<span data-next-set>[\s\S]*?<\/span>/,
  compareSets: /(<a href="\.\.\/compare\.html">comparison table<\/a> )(?:ranks|compares) all \d+ (?:Japanese boxes|sets)/,
};
const missing = Object.keys(RE).filter((k) => !RE[k].test(html));
if (missing.length) fail("필수 자리 못 찾음", { missing });

// 마지막 주간 점·세트 이름·OP-17 정가(팩 수 × 팩 정가의 달러 환산)는 사실 파일(data/derived/site-facts.json)에서 — 2026-10-15.
// 현지 통화(sea) 환율은 data/fx.json 에만 있어 그대로 읽는다(날짜·jpyKrw·usdKrw 는 packs.fx 와 같은 값 — update-fx 가 둘 다 쓴다).
const F = require("./build-site-facts").load();
const S = Object.fromEntries(F.order.series.map((c) => [c, F.sets[c]]));
let FX;
try {
  FX = JSON.parse(fs.readFileSync(path.join(ROOT, "data/fx.json"), "utf8"));
} catch (e) { skip("data missing: " + e.message); }
const SEA = FX.sea || {};
if (!FX.date || !CUR.every((c) => Number.isFinite(SEA[c.code]))) skip("fx.json sea 환율 없음");

const tbody = html.match(RE.tbody)[0];
const names = {};
const order = [];
for (const m of tbody.matchAll(/<tr><td>((?:OP|EB|PRB)-\d{2})([^<]*)<\/td>/g)) {
  const en = F.sets[m[1]] && F.sets[m[1]].nameEn;
  names[m[1]] = m[2].trim() ? m[1] + " " + m[2].trim() : en ? `${m[1]} ${en}` : m[1];
  order.push(m[1]);
}
if (!order.length) fail("필수 자리 못 찾음", { missing: ["rows"] });
const msrp = tbody.match(/<tr><td>(<em>[^<]*MSRP[^<]*<\/em>)<\/td>/);

let dataDate = "";
for (const c of Object.keys(S)) for (const ed of ["jp", "en"]) {
  const l = S[c].lastPoint[ed];
  if (l && l.d > dataDate) dataDate = l.d;
}
if (!dataDate) skip("no series dates");
const now = Date.parse(dataDate);
const fresh = (c) => {
  const l = S[c] ? S[c].lastPoint.jp : null;
  return l && Date.parse(l.d) >= now - STALE_DAYS * 86400000 ? l : null;
};
const local = (u) => CUR.map((c) => `<td>${u == null ? "—" : c.cell(u * SEA[c.code])}</td>`).join("");

const rows = [];
let freshRows = 0;
for (const code of order) {
  const j = fresh(code);
  if (j) freshRows++;
  rows.push(`          <tr><td>${names[code]}</td><td>${j ? usd(j.median) : "—"}</td>${local(j ? j.median : null)}</tr>`);
}
if (!freshRows) skip("신선한 JP 관측이 없다");
// 정가 행 — OP-17 packsPerBox × jpMsrpYenPerPack(엔) → USD(jpyKrw / usdKrw) = 사실 파일 msrpUsd.jpBoxFromPack. 현지 통화는 반올림 전 USD 에서. 못 읽으면 "—".
const MSRP_SET = "OP-17";
const mfs = F.sets[MSRP_SET] || null;
const mf = mfs ? { packsPerBox: mfs.keyFacts.jp.packsPerBox, jpMsrpYenPerPack: mfs.keyFacts.jp.msrp.jpPack } : {};
const msrpUsd = mfs ? mfs.msrpUsd.jpBoxFromPack : null;
if (msrp) rows.push(`          <tr><td>${msrp[1]}</td><td>${msrpUsd == null ? "—" : "~" + usd(msrpUsd)}</td>${local(msrpUsd)}</tr>`);

const before = html;
html = html.replace(RE.tbody, () => nl(`<tbody>\n${rows.join("\n")}\n        </tbody>`));
html = html.replace(RE.rates, () =>
  `converted from USD at ${longDate(FX.date)} exchange rates (${CUR.map((c) => c.rate(SEA[c.code])).join(", ")} per USD)`
);
html = html.replace(RE.market, () => `Market values as of ${longDate(dataDate)}`);
html = html.replace(RE.fx, () => `FX as of ${longDate(FX.date)}`);
html = html.replace(RE.heading, (_m, a, b) => a + monthYear(dataDate) + b);
// FAQ 가 가리키는 "the <월> table above" 도 제목 줄과 같은 달로 — 제목만 바뀌면 둘이 어긋난다.
html = html.replace(/(Use the )[A-Z][a-z]+ \d{4}( table above)/, (_m, a, b) => a + monthYear(dataDate) + b);
// 정가 각주의 팩 수·팩당 엔, FAQ 의 "about $N at MSRP" 도 정가 행과 같은 값으로.
if (mf.packsPerBox && mf.jpMsrpYenPerPack) {
  html = html.replace(/(MSRP row = )\d+( packs × ¥)[\d,]+( \(OP-17 )/, (_m, a, b, c) =>
    a + mf.packsPerBox + b + mf.jpMsrpYenPerPack.toLocaleString("en-US") + c);
}
html = html.replace(/(Japanese retail \(about )(?:\$[\d,]+|—)( at MSRP\))/, (_m, a, b) => a + (msrpUsd == null ? "—" : usd(msrpUsd)) + b);
// 다음 세트(사실 파일 releases.nextUp — 발매일 글 "Next release" 와 같은 세트). 일본 발매일이 기준일(F.series.asOf) 뒤일 때만 쓴다.
const nextCode = F.releases.nextUp;
const nextRf = nextCode ? F.releaseFacts.find((r) => r.setCode === nextCode) : null;
const nextJp = nextRf && nextRf.japanese.releaseDate;
const nextName = nextCode && F.sets[nextCode] ? F.sets[nextCode].nameEn || F.sets[nextCode].nameFull || "" : "";
const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nextTxt = nextJp && F.series.asOf && nextJp > F.series.asOf
  ? ` The next set, ${escH(nextCode)}${nextName ? " " + escH(nextName) : ""}, is officially dated <strong>${longDate(nextJp)}</strong> in Japan (Bandai official).`
  : "";
html = html.replace(RE.nextSet, () => `<span data-next-set>${nextTxt}</span>`);
// 비교표 세트 수 = compare.html "Sets compared"(사실 파일 compare.rows 중 발매된 세트 — inject-set-comparison 과 같은 정의).
const compareSets = F.compare.rows.filter((r) => !(F.sets[r.code] || {}).unreleased).length;
html = html.replace(RE.compareSets, (_m, a) => `${a}compares all ${compareSets} sets`);

// 수정일은 이 글이 쓰는 두 데이터(시세·환율) 중 늦은 날짜. JSON-LD 와 화면 바이라인을 같이 맞춘다.
const modDate = FX.date > dataDate ? FX.date : dataDate;
html = html.replace(RE.dateModified, (_m, a, b) => a + modDate + b);
if (/Updated <time datetime="/.test(html)) {
  html = html.replace(/(Updated <time datetime=")[^"]*(">)[^<]*(<\/time>)/, (_m, a, b, c) => a + modDate + b + longDate(modDate) + c);
} else {
  html = html.replace(/(Published <time datetime="[^"]*">[^<]*<\/time>)/, (_m, a) => `${a} · Updated <time datetime="${modDate}">${longDate(modDate)}</time>`);
}

if (html === before) skip("바뀐 것 없음");
fs.writeFileSync(ART, html);
console.log(JSON.stringify({
  status: "ok", dataDate, fxDate: FX.date, rows: order.length, fresh: freshRows, msrp: msrpUsd != null, nextSet: nextTxt ? nextCode : null, compareSets,
}));
