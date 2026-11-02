#!/usr/bin/env node
// articles/japan-vs-english.html ("Which to Buy?") 의 JP/EN 가격차 표와 그 표에 딸린 숫자들을
// box-sold-series 에서 매일 다시 쓴다. 본보기: tools/inject-box-price-guide.js.
//
// 왜: 제목 줄은 "The price gap right now ... (July 2026)" 인데 표는 7월 11–17일 주간값 10쌍에서 멈춰 있었다.
//     "지금" 이라면서 두 달 반 낡은 값이었다(예: OP-16 EN 프리미엄 글 +25% → 9/29 실측 +143%).
//
// 규칙
//  · 값은 box-sold-series 의 current(발매 후·마지막 점이 asOf 로부터 28일 이내일 때만 값). 없으면 그 쪽은 신선하지 않다.
//  · 표에는 JP·EN 둘 다 신선한 쌍만 전부 넣는다(예전 10쌍 제한 없음). 한쪽이라도 낡으면 그 쌍은 뺀다.
//  · EN premium = (EN/JP − 1)×100 반올림 %.
//  · 세트 이름은 data/onepiece-packs.json 의 nameEn, 없으면 코드만 — 지어내지 않는다.
//    링크는 ../sets/<code>.html 이 실제로 있을 때만 건다.
//  · 제목 줄의 월, 표 아래 설명 줄(날짜·쌍 수), 도입 문단의 표본 월·"모든 세트" 주장,
//    "Observed pattern" 문단의 숫자, 메타 설명의 프리미엄 범위를 전부 같은 데이터에서 계산한다.
//  · "Observed pattern" 의 "새 세트일수록 프리미엄이 작다" 주장은 메인 세트 OP-xx 의 번호 대비 프리미엄
//    Spearman 순위상관이 NEWER_SMALLER_RHO(−0.5) 이하일 때만 쓴다. 그때 숫자는 끝점(가장 오래된·가장 새 쌍)이
//    아니라 OP 쌍의 실제 최고·최저다. 아니면 전체 쌍의 최저·최고 범위 문장.
//  · 필수 자리(제목 줄·tbody·표 아래 설명 줄·dateModified) 중 하나라도 없으면 글 구조가 바뀐 것이다 —
//    반쯤 고친 글을 쓰지 않고 {status:"error"} 로 exit 1.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ART = path.join(ROOT, "articles/japan-vs-english.html");
const STALE_DAYS = 28;   // 표시용(설명 줄) — 실제 거름은 box-sold-series current 가 같은 28일로 한다
const NEWER_SMALLER_RHO = -0.5;
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MONTH[m - 1]} ${d}, ${y}`; };
const monthYear = (iso) => { const [y, m] = iso.split("-").map(Number); return `${MONTH[m - 1]} ${y}`; };
const usd = (v) => "$" + Math.round(v).toLocaleString("en-US");
const pctTxt = (p) => (p >= 0 ? "+" : "-") + Math.abs(p) + "%";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (!fs.existsSync(ART)) {
  console.log(JSON.stringify({ status: "skip", reason: "file missing" }));
  process.exit(0);
}
// 현재가(current)·기준일(asOf)·세트 이름·영문판 재판 판정은 사실 파일(data/derived/site-facts.json)에서 — 2026-10-15.
const F = require("./build-site-facts").load();
const { buyLink } = require("./set-page-shared");
const S = Object.fromEntries(F.order.series.map((c) => [c, F.sets[c]]));
let html = fs.readFileSync(ART, "utf8");
const crlf = html.includes("\r\n");
const nl = (s) => (crlf ? s.replace(/\n/g, "\r\n") : s);

// 필수 자리 — 하나라도 없으면 쓰지 않고 실패로 끝낸다.
const RE = {
  heading: /(<h2>The price gap right now: same set, two prices \()[^)<]*(\)<\/h2>)/,
  // 가격차 표의 tbody 만 — 2026-10-16. H1 아래 Key facts 표(plain <tbody>)가 앞에 오면서 "첫 tbody" 규칙이 그 표를 덮어썼다. 가격차 표의 style 속성으로 고정한다.
  tbody: /(<tbody style="font-variant-numeric:tabular-nums;">)[\s\S]*?(<\/tbody>)/,
  note: /(<\/table>\s*<\/div>\s*<p [^>]*>)[\s\S]*?(<\/p>)/,
  dateModified: /("dateModified": ")[^"]*(")/,
  // Key facts 표 자리(H1 바로 아래) — 2026-10-16. 인용 페이지에 값·기준일·표본만 담은 표(세트 페이지 kfTable 과 같은 꼴).
  keyFacts: /<!-- JP_EN_KEY_FACTS:START -->[\s\S]*?<!-- JP_EN_KEY_FACTS:END -->/,
};
const missing = Object.keys(RE).filter((k) => !RE[k].test(html));
if (missing.length) {
  console.log(JSON.stringify({ status: "error", reason: "필수 자리 못 찾음", missing }));
  process.exit(1);
}

// 기준일·현재가는 box-sold-series 의 asOf·current — 모든 페이지 표가 같은 칸을 읽는다(2026-10-14, 가드 D17).
const dataDate = F.series.asOf || "";
if (!dataDate) { console.log(JSON.stringify({ status: "skip", reason: "no series dates" })); process.exit(0); }
const fresh = (c, ed) => (S[c] && S[c].current[ed]) || null;

const ord = (c) => { const [m, n] = c.split("-"); return ({ OP: 1, EB: 2, PRB: 3 }[m] || 9) * 100 + Number(n); };
const codes = Object.keys(S).filter((c) => /^(OP|EB|PRB)-\d{2}$/.test(c)).sort((a, b) => ord(a) - ord(b));
// 우리가 추적하는 쌍 = 두 판 모두 관측이 한 번이라도 있는 세트
const tracked = codes.filter((c) => S[c].hasPoints.jp && S[c].hasPoints.en).length;

const pairs = [];
for (const code of codes) {
  const j = fresh(code, "jp"), e = fresh(code, "en");
  if (!j || !e || !(j.median > 0) || !(e.median > 0)) continue;
  pairs.push({ code, j: j.median, e: e.median, pct: Math.round((e.median / j.median - 1) * 100) });
}
if (!pairs.length) { console.log(JSON.stringify({ status: "skip", reason: "신선한 쌍이 없다" })); process.exit(0); }

const TD = 'style="padding:6px 9px;border-bottom:1px solid rgba(255,255,255,.06);"';
const TDR = 'style="text-align:right;padding:6px 9px;border-bottom:1px solid rgba(255,255,255,.06);"';
const rows = pairs.map(({ code, j, e, pct }) => {
  const en = S[code].nameEn;
  const label = esc(en ? `${code} ${en}` : code);
  const file = `sets/${code.toLowerCase()}.html`;
  const cell = fs.existsSync(path.join(ROOT, file)) ? `<a href="../${file}">${label}</a>` : label;
  // 영문 값이 재판(White) 박스면 라벨을 붙인다 — 세트 페이지와 같은 판정(사실 파일 reprint.enIsReprint, 2026-09-30).
  const rp = S[code].reprint.enIsReprint ? " <small>reprint (White)</small>" : "";
  // 세트 칸 아래 최저 실매물(일본판·영문판, 세트 페이지 구매 버튼과 같은 값, customid jve-<세트>-jp/en) — 2026-11-02. 유입(10주 61명)이 있는데 링크가 0개였다.
  const a = (F.sets[code] || {}).ask || {}, sl = code.toLowerCase();
  const buys = [a.jp && buyLink({ url: a.jp.url, price: a.jp.total, spot: `jve-${sl}-jp`, label: "JP" }), a.en && buyLink({ url: a.en.url, price: a.en.total, spot: `jve-${sl}-en`, label: "EN" })].filter(Boolean);
  const buyRow = buys.length ? `<small style="display:block;font-size:12px">eBay ${buys.join(" · ")}</small>` : "";
  return `          <tr><td ${TD}>${cell}${buyRow}</td><td ${TDR}>${usd(j)}</td><td ${TDR}>${usd(e)}${rp}</td><td ${TDR}>${pctTxt(pct)}</td></tr>`;
});

const byPct = pairs.slice().sort((a, b) => a.pct - b.pct);
const lo = byPct[0], hi = byPct[byPct.length - 1];
const jpLower = pairs.filter((p) => p.j < p.e).length;

// 메인 세트(OP-xx)만으로 세트 나이 추세를 본다 — EB·PRB 는 발매 순서가 번호와 따로 논다.
// Spearman 순위상관(동점은 평균 순위). 값이 하나뿐이라 분산이 0 이면 NaN → 추세 문장을 쓰지 않는다.
const ranks = (vs) => {
  const idx = vs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(vs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
const pearson = (xs, ys) => {
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return sxy / Math.sqrt(sxx * syy);
};
const op = pairs.filter((p) => p.code.startsWith("OP-"));
const rho = op.length >= 3 ? pearson(ranks(op.map((p) => Number(p.code.slice(3)))), ranks(op.map((p) => p.pct))) : NaN;
const newerSmaller = rho <= NEWER_SMALLER_RHO;
const opByPct = op.slice().sort((a, b) => a.pct - b.pct);
const opLo = opByPct[0], opHi = opByPct[opByPct.length - 1];

const before = html;

// Key facts 표 — 2026-10-16. 값은 이 글의 표·설명 줄과 같은 pairs·tracked·lo/hi·jpLower·dataDate(한 사실 한 값).
{
  const { KF_CSS, kfTableAny } = require("./set-page-shared");
  const kf = kfTableAny([
    ["pairs", "Set pairs with fresh medians", "두 판 모두 최신 중앙값인 세트", `<b>${pairs.length}</b> <small><span data-ko="추적 ${tracked}쌍 중 · 두 판 모두 ${STALE_DAYS}일 안 날짜">of ${tracked} tracked · both editions dated within ${STALE_DAYS} days</span></small>`],
    ["premium", "English premium range", "영문판 프리미엄 범위", `<b>${esc(pctTxt(lo.pct))} – ${esc(pctTxt(hi.pct))}</b> <small>${esc(lo.code)} · ${esc(hi.code)}</small>`],
    ["jplower", "Japanese box cheaper", "일본판 박스가 더 쌈", `<b>${jpLower} <span data-ko="/">of</span> ${pairs.length}</b>`],
    ["asof", "As of", "기준일", `<time datetime="${esc(dataDate)}">${esc(dataDate)}</time> <small><span data-ko="이베이 완료 거래 중앙값">eBay completed-sale medians</span></small>`],
  ], { label: "Japanese vs English key facts", caption: `<span data-ko="원피스 일본판 대 영문판 박스 시세">Japanese vs English One Piece booster box prices</span> · <time datetime="${esc(dataDate)}">${esc(dataDate)}</time>` });
  html = html.replace(RE.keyFacts, () => `<!-- JP_EN_KEY_FACTS:START --><style>\n${KF_CSS}\n      </style>\n      ${kf}\n      <!-- JP_EN_KEY_FACTS:END -->`);
}

// 제목 줄
html = html.replace(RE.heading, (_m, a, b) => a + monthYear(dataDate) + b);

// 표
html = html.replace(RE.tbody, (_m, a, b) => a + nl(`\n${rows.join("\n")}\n        `) + b);

// 표 아래 설명 줄 — 표 바로 다음 <p>
html = html.replace(RE.note, (_m, a, b) =>
  a + `Median sold price per sealed box from completed eBay sales, as of ${longDate(dataDate)} (${pairs.length} of the ${tracked} set pairs we track — both editions have a sold median dated within the last ${STALE_DAYS} days; every pair is on the <a href="../compare.html">compare page</a>). EN premium = how much more the English box costs than the Japanese box of the same set.` + b
);

// 도입 문단 — 표본 월과 "모든 세트" 주장
html = html.replace(/<p>Japanese boxes have lower tracked prices for [^<]*? sample below\./, () =>
  `<p>Japanese boxes have lower tracked prices for ${jpLower === pairs.length ? "every matched set" : `${jpLower} of ${pairs.length} matched sets`} in the ${monthYear(dataDate)} sample below.`
);

// Observed pattern 문단
const release = `OP-16 launched in English 13 days after Japan, and <a href="../sets/op-17.html">OP-17 launched six days later</a>.`;
const OBS = newerSmaller
  ? `<p><strong>Observed pattern:</strong> the English premium is smaller for newer sets in this snapshot — across the ${op.length} OP sets it ranges from ${pctTxt(opLo.pct)} on ${opLo.code} to ${pctTxt(opHi.pct)} on ${opHi.code}. Release gaps have also narrowed: ${release} The table shows correlation by set age; it does not isolate print volume or predict the premium on future sets.</p>`
  : `<p><strong>Observed pattern:</strong> the English premium in this snapshot runs from ${pctTxt(lo.pct)} on ${lo.code} to ${pctTxt(hi.pct)} on ${hi.code} and does not fall steadily with set age. Release gaps have narrowed: ${release} The table does not isolate print volume or predict the premium on future sets.</p>`;
html = html.replace(/<p><strong>Observed pattern:<\/strong>[\s\S]*?<\/p>/, () => OBS);

// 메타·OG·JSON-LD 설명의 프리미엄 범위
const range = lo.pct > 0 ? `${pctTxt(lo.pct)} to ${pctTxt(hi.pct)}` : `up to ${pctTxt(hi.pct)}`;
html = html.replace(/(English One Piece booster boxes cost )[^"<]*?( more than the same Japanese set)/g, (_m, a, b) => a + range + b);

html = html.replace(RE.dateModified, (_m, a, b) => a + dataDate + b);
// 화면 바이라인 "Updated" 도 dataDate 로 — JSON-LD dateModified 와 어긋나지 않게.
if (/Updated <time datetime="/.test(html)) {
  html = html.replace(/(Updated <time datetime=")[^"]*(">)[^<]*(<\/time>)/, (_m, a, b, c) => a + dataDate + b + longDate(dataDate) + c);
} else {
  html = html.replace(/(Published <time datetime="[^"]*">[^<]*<\/time>)/, (_m, a) => `${a} · Updated <time datetime="${dataDate}">${longDate(dataDate)}</time>`);
}

if (html === before) { console.log(JSON.stringify({ status: "skip", reason: "바뀐 것 없음" })); process.exit(0); }
fs.writeFileSync(ART, html);
console.log(JSON.stringify({
  status: "ok", dataDate, pairs: pairs.length, tracked, jpLower,
  lowest: `${lo.code} ${pctTxt(lo.pct)}`, highest: `${hi.code} ${pctTxt(hi.pct)}`,
  opRho: Number.isFinite(rho) ? Number(rho.toFixed(3)) : null, newerSmaller,
}));
