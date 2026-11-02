#!/usr/bin/env node
// 세트 비교표를 compare.html 과 articles/best-one-piece-booster-box.html 에 주입한다 — 2026-09-01 신설.
//
// ── 왜 만드나
// 두 페이지 모두 생성기가 없는 수동 HTML 이었다. 그래서 compare.html 의 표는
// "JP Jan / JP Jul" 열에 2026년 1월·7월 값이 박힌 채 멈춰 있었고,
// best-one-piece-booster-box.html 은 제목이 "best ... booster box" 인데 표가 0행이었다.
// 오늘 하루에만 같은 유형(수동이라 낡음)을 세 번 봤다 — PSA10 가격 두 달 정지,
// 유유테이 싱글, 이 표. 손으로 쓴 숫자는 반드시 낡는다.
//
// ── 왜 이 열들인가 (GSC 2026-09-01 미국 검색어)
//   "best one piece booster box to buy" · "one piece cards value list" · "op10 most expensive cards"
// 사는 사람이 실제로 비교하는 것: 지금 얼마인가, 최근 어느 쪽으로 움직였나,
// 영문판과 얼마나 차이 나나, 그 세트에서 제일 비싼 카드가 뭔가.
//
// ⚠️ 순위·점수를 만들지 않는다. 어느 박스가 "좋다"고 우리가 판정하지 않는다 —
//    신뢰할 수 없는 종합지수는 소유자 지시로 폐기했다. 사실만 나란히 놓고 판단은 읽는 사람 몫이다.
// ⚠️ 표본(n)을 같이 싣는다. 일본판은 하루 0.5건꼴로 팔리는 세트도 있어서,
//    n 없이 중앙값만 보이면 두께가 다른 값이 같은 무게로 읽힌다.
//
// Run: node tools/inject-set-comparison.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MARK_START = "<!-- SET-COMPARISON:START -->";
const MARK_END = "<!-- SET-COMPARISON:END -->";

// 행은 사실 파일(data/derived/site-facts.json compare.rows — tools/build-site-facts.js) — 2026-10-15.
//   현재가 칸은 box-sold-series 의 current(발매됐고 마지막 점이 asOf 로부터 28일 이내일 때만 값, 아니면 "—").
//   2026-09-30 발견: OP-02 일본판이 84일 전(7/8) 값을 표시 없이 현재가처럼 보여주고 있었다.
//   2026-10-14: 미발매 EB-05·OP-18 의 예약판매가 실거래 중앙값으로 들어가 EB-05 "−42%" 같은 숫자가 나왔다 → 예약판매는 시계열에서 빠졌고(preRelease),
//   미발매 세트 행은 남기되 값 칸은 전부 "—".
//   가장 비싼 카드 = market-data-normalizers.priciest(검증된 NM 최댓값, 동가 전부) — 세트 페이지 Key facts·한국어 문단과 같은 값. 모르면 칸을 비운다.
//   4-wk = boxChange28(current vs 28일 이상 앞선 마지막 점) — 세트 페이지·홈 board 와 같은 값(종전 "5점 전"은 OP-06 이 +7% / -6.5% 로 갈렸다).
const F = require("./build-site-facts").load();
const { buyLink } = require("./set-page-shared");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));

const buildRows = () => F.compare.rows;

// × MSRP 열(2026-10-19) — 값은 사실 파일 board 의 msrpYen·msrpUsd·vsMsrp 그대로(일본판 박스 정가, 재계산 없음). 영문판 박스 정가는 사실 파일에 없어 열을 두지 않는다.
const BOARD = Object.fromEntries(F.board.map((b) => [b.code, b]));
const yen = (v) => "¥" + Math.round(v).toLocaleString("en-US");
const msrpCells = (code) => {
  const b = BOARD[code] || {};
  return `<td>${b.msrpYen ? `${yen(b.msrpYen)}${b.msrpUsd ? `<small style="color:#7d8698"> $${b.msrpUsd}</small>` : ""}` : "—"}</td><td>${b.vsMsrp != null ? b.vsMsrp.toFixed(1) + "×" : "—"}</td>`;
};

// 세트 칸 아래 최저 실매물 링크(일본판·영문판, 세트 페이지 구매 버튼과 같은 값 — 사실 파일 ask) — 2026-11-02. 비교표 두 페이지에 구매 링크가 0개였다.
// 가격 칸(판매 중앙값)에 넣지 않는다 — 가드 D17 이 그 칸의 첫 $ 값을 중앙값으로 읽고, 중앙값이 없는 행에선 매물가가 중앙값으로 읽힌다.
// spot = EPN customid 머리(페이지별로 다르게 — compare 와 글을 EPN 보고서에서 가른다).
const buyCell = (code, spot) => {
  const a = (F.sets[code] || {}).ask || {}, slug = code.toLowerCase();
  const jp = a.jp ? buyLink({ url: a.jp.url, price: a.jp.total, spot: `${spot}-${slug}-jp`, label: "JP" }) : "";
  const en = a.en ? buyLink({ url: a.en.url, price: a.en.total, spot: `${spot}-${slug}-en`, label: "EN" }) : "";
  return jp || en ? `<small class="ctBuy">eBay ${[jp, en].filter(Boolean).join(" · ")}</small>` : "";
};

function tableHtml(rows, updated, spot) {
  const body = rows.map((r) => {
    const chgTxt = r.chg == null ? "—" : `${r.chg > 0 ? "+" : ""}${r.chg}%`;   // 세트 페이지 "4-week change" 와 같은 표기(소수 한 자리)
    const chgColor = r.chg == null ? "#7d8698" : r.chg >= 0 ? "#26d07c" : "#ff6b6b";
    return `            <tr>` +
      `<th scope="row" class="ctSet"><a href="/sets/${esc(r.code.toLowerCase())}.html"><b>${esc(r.code)}</b><span>${esc(r.name)}</span></a>${buyCell(r.code, spot)}</th>` +
      `<td>${money(r.jp)}${r.jpN ? `<small style="color:#7d8698"> n${r.jpN}</small>` : ""}</td>` +
      `<td>${money(r.en)}${r.enN ? `<small style="color:#7d8698"> n${r.enN}</small>` : ""}</td>` +
      `<td style="color:${chgColor}">${chgTxt}</td>` +
      `<td>${r.ratio ? r.ratio.toFixed(1) + "x" : "—"}</td>` +
      `<td>${r.topNames ? `${money(r.topUsd)}${r.topDate && r.topDate !== updated ? ` (${esc(r.topDate)})` : ""} <small style="color:#7d8698">${r.topNames.map((n) => esc(n)).join(", ")}</small>` : "—"}</td>` +
      `<td>${r.gem == null ? "—" : r.gem + "%"}</td>` +
      msrpCells(r.code) +
      `</tr>`;
  }).join("\n");

  return `${MARK_START}
        <div class="setComparisonScroll" role="region" tabindex="0" aria-label="Japanese and English booster box price comparison" style="overflow-x:auto;"><table class="ctTable" style="width:100%; border-collapse:collapse;">
          <thead><tr><th class="ctSet">Set</th><th>JP box</th><th>EN box</th><th>4-wk</th><th>EN/JP</th><th>Priciest card (raw)</th><th>PSA 10 rate</th><th>MSRP (JP box)</th><th>× MSRP</th></tr></thead>
          <tbody>
${body}
          </tbody>
        </table></div>
        ${/* 표 밑 설명 문장 → 정의 라벨(2026-10-19, 데이터 페이지는 숫자·표·라벨만). 끝의 "As of 날짜." 는 가드 CW1 이 읽는다. */ ""}<p style="color:#7d8698;font-size:12.5px;margin-top:10px;">Median of completed eBay sales · n = sales behind the median · 4-wk = vs the median 28 days earlier · Priciest card = raw NM single · PSA 10 rate = PSA 10 share of PSA grades · × MSRP = JP box median ÷ JP box MSRP · As of ${esc(updated)}.</p>
        ${MARK_END}`;
}

function inject(file, html) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return { file, status: "파일 없음" };
  let s = fs.readFileSync(p, "utf8");
  const i = s.indexOf(MARK_START);
  const j = s.indexOf(MARK_END);
  if (i < 0 || j < 0) return { file, status: "마커 없음 — 먼저 HTML 에 마커를 넣을 것" };
  s = s.slice(0, i) + html + s.slice(j + MARK_END.length);
  fs.writeFileSync(p, s, "utf8");
  return { file, status: "ok" };
}

const rows = buildRows();
if (rows.length < 10) throw new Error(`세트가 ${rows.length}개뿐 — 시계열 로딩 실패 의심`);
const out = [["compare.html", "cmp"], ["articles/best-one-piece-booster-box.html", "best"]].map(([f, spot]) => inject(f, tableHtml(rows, F.compare.asOf || "", spot)));


// 글의 수정일(JSON-LD dateModified·화면 Updated)을 표의 "As of" 날짜에 맞춘다.
// 2026-09-30 발견: 표는 매일 바뀌는데 수정일이 2026-08-10 에 멈춰 있었다(가드 U1).
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MONTH[m - 1]} ${d}, ${y}`; };
const asOf = F.compare.asOf || "";
// Key facts 표(compare.html H1 바로 아래) — 2026-10-16. 값은 사실 파일 home(최저·최고 일본판 박스, 4주 등락 집계)·compare.asOf 와 이 표의 행(EN 중앙값 범위) 그대로.
{
  const { KF_CSS_ANY, kfTableAny } = require("./set-page-shared");
  const H = F.home;
  const withJp = rows.filter((r) => r.jp != null).length, withEn = rows.filter((r) => r.en != null).length;
  const enRows = rows.filter((r) => r.en != null).sort((a, b) => a.en - b.en);
  // 세트 수 = 발매된 세트(사이트 전체의 22와 같은 값) — 2026-10-19. 표에 남겨 둔 발매 전 세트(값 칸 "—")는 따로 센다(종전 "24" 는 다른 페이지의 22와 엇갈렸다).
  const upcomingRows = rows.filter((r) => (F.sets[r.code] || {}).unreleased);
  const released = rows.length - upcomingRows.length;
  const kf = kfTableAny([
    H.cheapest && H.priciest ? ["jp", "JP box range", "일본판 박스 범위", `<b>${money(H.cheapest.usd)}–${money(H.priciest.usd)}</b> <small>${esc(H.cheapest.codes.join(", "))} · ${esc(H.priciest.code)}</small>`] : null,
    ["sets", "Sets compared", "비교 세트", `<b>${released}</b> <small>${withJp} <span data-ko="일본판 중앙값">with a JP median</span> · ${withEn} <span data-ko="영문판 중앙값">with an EN median</span>${upcomingRows.length ? ` · ${upcomingRows.length} <span data-ko="발매 전">upcoming</span> (${esc(upcomingRows.map((r) => r.code).join(", "))})` : ""}</small>`],
    enRows.length ? ["en", "EN box range", "영문판 박스 범위", `<b>${money(enRows[0].en)}–${money(enRows.at(-1).en)}</b> <small>${esc(enRows[0].code)} · ${esc(enRows.at(-1).code)}</small>`] : null,
    ["change", "4-week change (JP)", "4주 등락 (일본판)", `<b>${H.nUp} <span data-ko="상승">up</span> · ${H.nDn} <span data-ko="하락">down</span></b> <small><span data-ko="28일 전 중앙값이 있는 세트">of ${H.withChg} sets with a median 28 days earlier</span></small>`],
    ["asof", "As of", "기준일", `<time datetime="${esc(asOf)}">${esc(asOf)}</time> <small><span data-ko="이베이 완료 거래 중앙값">eBay completed-sale medians</span></small>`],
  ], { label: "Set comparison key facts", caption: `<span data-ko="원피스 부스터 박스 비교">One Piece booster boxes compared</span> · <time datetime="${esc(asOf)}">${esc(asOf)}</time>` });
  const p = path.join(ROOT, "compare.html");
  let s = fs.readFileSync(p, "utf8");
  const re = /<!-- COMPARE_KEY_FACTS:START -->[\s\S]*?<!-- COMPARE_KEY_FACTS:END -->/;
  if (!re.test(s)) throw new Error("compare.html: COMPARE_KEY_FACTS 마커가 없다");
  s = s.replace(re, () => `<!-- COMPARE_KEY_FACTS:START --><style>\n${KF_CSS_ANY}\n      </style>\n      ${kf}\n      <!-- COMPARE_KEY_FACTS:END -->`);
  // 'Ranked by' 표 — 2026-10-19. 제목("Best One Piece Booster Box to Buy")에 판정 없이 답하는 정렬 줄: 행마다 세트·값·기준일.
  //   행은 사실 파일 compare.rankedBy(board·compareRows 에서 고르기만 한 것). 같은 화면 값이면 세트를 전부 싣는다.
  const fmt = (r) => (r.unit === "usd" ? money(r.value) : r.unit === "pct" ? `${r.value > 0 ? "+" : ""}${r.value}%` : r.unit === "x" ? `${r.value.toFixed(1)}×` : String(r.value));
  const setCell = (r) => r.codes.map((c, i) => `<a href="/sets/${esc(c.toLowerCase())}.html">${esc(c)}</a>${r.names && r.names[i] && r.names[i].length ? ` <small>${esc(r.names[i].join(", "))}</small>` : ""}${r.windowDays && r.windowDays[i] ? ` <small>/ ${r.windowDays[i]}d</small>` : ""}`).join("<br>");
  const dateCell = (r) => [...new Set(r.dates.filter(Boolean))].map((d) => `<time datetime="${esc(d)}">${esc(d)}</time>`).join(" · ") || "—";
  // 390px 에서 값 칸이 스크롤 상자 밖으로 밀리지 않게(최고가 카드 이름이 nowrap 이면 표가 넓어진다) — 이 표만 줄바꿈·왼쪽 정렬, 카드 이름은 세트 아래 줄.
  const ranked = `<!-- COMPARE_RANKED:START -->
      <style>.ctTable.rankedBy th, .ctTable.rankedBy td { white-space: normal; text-align: left; vertical-align: top; } .ctTable.rankedBy td small { display: block; color: var(--muted); font-size: 11.5px; } .ctTable.rankedBy td time { white-space: nowrap; }</style>
      <h2 id="ranked-by" style="font-size:19px; margin-top:20px;" data-ko="정렬 기준별 1위">Ranked by</h2>
      <div style="overflow-x:auto"><table class="ctTable rankedBy" style="width:100%; border-collapse:collapse;">
        <thead><tr><th class="ctSet" data-ko="기준">Ranked by</th><th data-ko="세트">Set</th><th data-ko="값">Value</th><th data-ko="기준일">As of</th></tr></thead>
        <tbody>
${(F.compare.rankedBy || []).map((r) => `          <tr data-k="${esc(r.k)}"><th scope="row" class="ctSet">${esc(r.label)}</th><td>${setCell(r)}</td><td><b>${fmt(r)}</b></td><td>${dateCell(r)}</td></tr>`).join("\n")}
        </tbody>
      </table></div>
      <!-- COMPARE_RANKED:END -->`;
  const rr = /<!-- COMPARE_RANKED:START -->[\s\S]*?<!-- COMPARE_RANKED:END -->/;
  if (!rr.test(s)) throw new Error("compare.html: COMPARE_RANKED 마커가 없다");
  s = s.replace(rr, () => ranked);
  // 페이지 수정일(JSON-LD) = 표의 As of — 2026-10-19. 사이트맵은 compare.html 의 dateModified 를 lastmod 하한으로 쓴다(sync-sitemap-lastmod).
  const ld = `<script type="application/ld+json" id="page-date">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: "Compare One Piece booster boxes", url: "https://opboxindex.com/compare.html", dateModified: asOf })}</script>`;
  const lr = /<script type="application\/ld\+json" id="page-date">[\s\S]*?<\/script>/;
  if (lr.test(s)) s = s.replace(lr, () => ld);
  else s = s.replace(/<\/head>/, () => `    ${ld}\n  </head>`);
  fs.writeFileSync(p, s, "utf8");
}
if (/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  const p = path.join(ROOT, "articles/best-one-piece-booster-box.html");
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  s = s.replace(/("dateModified": ")[^"]*(")/, (_m, a, b) => a + asOf + b);
  s = s.replace(/(Updated <time datetime=")[^"]*(">)[^<]*(<\/time>)/, (_m, a, b, c) => a + asOf + b + longDate(asOf) + c);
  if (s !== before) fs.writeFileSync(p, s, "utf8");
}
console.log(JSON.stringify({ sets: rows.length, asOf, targets: out }, null, 1));
