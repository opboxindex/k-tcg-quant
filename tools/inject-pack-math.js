#!/usr/bin/env node
// articles/how-many-packs-one-piece-booster-box.html 의 세트별 "정가 대 시세" 표를 데이터에서 매일 다시 쓴다.
//
// 왜: 이 글은 빙 평균 2.19위 · AI 인용 466건으로 사이트 최고 순위인데 노출이 16건뿐이다.
//     다루는 질문이 "박스에 팩이 몇 개" 하나뿐이라서다. 빙 검색어에는 세트별 정가·팩당 가격을
//     묻는 질의가 여럿 있다(one piece booster box msrp · op-16 japanese booster box msrp yen ·
//     op11/op09 japanese pack price per pack 등). 팩당 실거래가는 박스 실낙찰가와 팩 수를
//     둘 다 가진 곳만 낼 수 있다.
//
// 규칙 — 값은 전부 사실 파일 data/derived/site-facts.json(tools/build-site-facts.js)에서 읽는다(2026-10-15, F4). 원장 직접 읽기 없음.
//  · 박스 시세는 sets[code].current.jp(USD, box-sold-series 의 current) — 발매됐고 마지막 점이 asOf 로부터 28일 이내일 때만 값, 아니면 "—".
//    미발매 세트(OP-18·EB-05)의 예약판매는 시계열에 없다 — 2026-10-14 전엔 여기 "Box sold" 칸에 $110·$132 로 섞여 있었다.
//  · 정가는 releaseFacts[].japanese(set-facts 의 jpMsrpYen / packsPerBox). 둘 중 하나라도 없으면 그 행의 정가 열은 "—".
//    단 팩당 정가(msrpYenPerPack)가 공식 페이지로 확인된 세트는 박스 구성이 미공개여도 팩당 칸만 채운다
//    (OP-18·EB-05: 반다이 JP 페이지에 240円·6장은 있고 박스당 팩 수는 없다 — 2026-09-30). 박스 구성 미공개(basis) 세트는 박스 정가에 * 표시.
//  · 세트 코드는 sets/<code>.html 이 있을 때만 링크한다(releaseFacts[].pages.set).
//  · 엔 → USD 는 F.fx 의 jpyKrw / usdKrw (사이트 공통 방식, packs.fx = data/fx.json), 환율과 날짜를 표에 적는다.
//  · 값을 만들어내지 않는다. 데이터가 없으면 비운다.
"use strict";
const fs = require("fs");
const path = require("path");
const { buyLink } = require("./set-page-shared");

const ROOT = path.join(__dirname, "..");
const ART = path.join(ROOT, "articles/how-many-packs-one-piece-booster-box.html");
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${d}, ${y}`;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (!fs.existsSync(ART)) {
  console.log(JSON.stringify({ status: "skip", reason: "article missing" }));
  process.exit(0);
}

let F;
try {
  F = require("./build-site-facts").load();
} catch (e) {
  console.log(JSON.stringify({ status: "skip", reason: "data missing: " + e.message }));
  process.exit(0);
}
const FX = F.fx;
if (!FX.jpyKrw || !FX.usdKrw) {
  console.log(JSON.stringify({ status: "skip", reason: "fx incomplete" }));
  process.exit(0);
}
const jpyUsd = (yen) => (yen * FX.jpyKrw) / FX.usdKrw;
const rate = jpyUsd(1);
// 세트 코드 → 발매·제품 사실(releaseFacts 는 OP → EB → PRB 번호순으로 이미 정렬돼 있다)
const RF = Object.fromEntries(F.releaseFacts.map((r) => [r.setCode, r]));

// 데이터 기준일 — 시계열 전체의 마지막 관측일(build-box-sold-series.js asOf, 다른 표들과 같은 기준)
const dataDate = F.series.asOf || "";
const STALE_DAYS = F.series.staleDays;
if (!dataDate) {
  console.log(JSON.stringify({ status: "skip", reason: "no series dates" }));
  process.exit(0);
}

const rows = [];
const starSets = F.releaseFacts.filter((r) => r.japanese.msrpYenPerBoxBasis != null).map((r) => r.setCode);
let liveCount = 0, cheapest = null, dearest = null;
for (const rf of F.releaseFacts) {
  const code = rf.setCode;
  const j = rf.japanese;
  const packs = j.packsPerBox;
  const msrpBox = j.msrpYenPerBox;
  const cur = (F.sets[code] && F.sets[code].current && F.sets[code].current.jp) || null;

  const msrpPack = j.msrpYenPerPack;
  const boxUsd = cur ? cur.median : null;
  const packUsd = boxUsd && packs ? boxUsd / packs : null;
  const mult = packUsd && msrpPack ? packUsd / jpyUsd(msrpPack) : null;

  if (mult) {
    liveCount++;
    if (!cheapest || mult < cheapest.mult) cheapest = { code, mult, packUsd };
    if (!dearest || mult > dearest.mult) dearest = { code, mult, packUsd };
  }

  const slug = code.toLowerCase();
  // 세트 칸 아래 일본판 최저 실매물(세트 페이지 구매 버튼과 같은 값, customid hmp-<세트>) — 2026-11-02. 이 글은 유입(10주 52명)이 있는데 이베이 링크가 0개였다.
  const ask = F.sets[code] && F.sets[code].ask && F.sets[code].ask.jp;
  const buy = ask ? buyLink({ url: ask.url, price: ask.total, spot: `hmp-${slug}`, label: "eBay from" }) : "";
  const setCell = (rf.pages.set
    ? `<a href="/sets/${slug}.html">${esc(code)}</a>`
    : esc(code)) + (buy ? `<small style="display:block;font-size:12px">${buy}</small>` : "");
  rows.push(
    `          <tr><td>${setCell}</td>` +
      `<td class="num">${packs || "—"}</td>` +
      `<td class="num">${msrpPack ? "¥" + Math.round(msrpPack) : "—"}</td>` +
      `<td class="num">${msrpBox ? "¥" + msrpBox.toLocaleString("en-US") + (j.msrpYenPerBoxBasis != null ? "*" : "") : "—"}</td>` +
      `<td class="num">${boxUsd ? "$" + Math.round(boxUsd).toLocaleString("en-US") : "—"}</td>` +
      `<td class="num">${packUsd ? "$" + packUsd.toFixed(2) : "—"}</td>` +
      `<td class="num">${mult ? mult.toFixed(1) + "×" : "—"}</td></tr>`
  );
}

const lead =
  `Japanese retail is fixed per pack, so every box has a printed baseline you can measure the market against. ` +
  `The table below puts Bandai's Japanese MSRP next to what a sealed box actually sold for, per set and per pack. ` +
  // 세는 대상 = 배수(“vs MSRP”)가 계산된 세트 — 2026-11-05. 종전 문장은 "판매 중앙값이 있는 세트"라고 쓰고 배수 세트를 셌다
  //   (판매 중앙값은 있지만 박스당 팩 수가 미공개인 EB-05 가 빠져 19 가 18 로 적혔다). 문장을 센 대상의 정의에 맞춘다(가드 TX4).
  (liveCount
    ? `Across the ${liveCount} sets with a “vs MSRP” multiple in the table below, the widest gap is ` +
      `<strong>${esc(dearest.code)}</strong> at ${dearest.mult.toFixed(1)}× Japanese retail per pack ($${dearest.packUsd.toFixed(2)}), ` +
      `and the narrowest is <strong>${esc(cheapest.code)}</strong> at ${cheapest.mult.toFixed(1)}× ($${cheapest.packUsd.toFixed(2)}). `
    : "") +
  // 2026-10-14 QA: "no completed sale in the last 28 days" 는 사실과 달랐다(발매된 세트는 전부 28일 안에 판매가 있다). "—" 의 실제 규칙을 쓴다.
  `Sets without a sold median dated within ${STALE_DAYS} days (a median needs at least 6 sales in its 28–56-day window) are left blank rather than carried forward.`;

const table =
  // 폰에선 MSRP 두 열을 숨겨 354px 에 맞춘다(styles.css .packMath) — 2026-11-02: 486px 표라 글의 핵심인 Box sold·Per pack 이 흐림 밑·화면 밖이었다.
  `<div class="tblWrap" data-pack-math><table class="dataTable packMath tblFit">\n` +
  `        <thead><tr><th>Set</th><th class="num">Packs</th><th class="num">MSRP / pack</th><th class="num">MSRP / box</th><th class="num">Box sold</th><th class="num">Per pack</th><th class="num">vs MSRP</th></tr></thead>\n` +
  `        <tbody>\n${rows.join("\n")}\n        </tbody>\n` +
  `      </table></div>\n` +
  `      <p class="srcNoteA" data-pack-math-note>MSRP is Bandai's Japanese manufacturer price, tax included${starSets.length ? ` (* ${starSets.join(", ")}: Bandai's page gives the pack price only — the box figure is ${starSets.length > 1 ? "their" : "its"} pack price × 24, the standard box)` : ""}. “Box sold” is the latest rolling median of completed eBay sales for the sealed Japanese box (data as of ${longDate(dataDate)}; each median is dated within ${STALE_DAYS} days); “per pack” divides that by the pack count in the same row. Yen converted at ¥1 = $${rate.toFixed(5)} (${longDate(FX.date)}). A multiple above 1× is what an overseas buyer pays over Japanese shelf price, including the seller's shipping and margin — it is not a measure of card value.</p>`;

let html = fs.readFileSync(ART, "utf8");
const crlf = html.includes("\r\n");
const nl = (s) => (crlf ? s.replace(/\n/g, "\r\n") : s);

const leadRe = /<p data-pack-math-lead>[\s\S]*?<\/p>/;
const tableRe = /<div class="tblWrap" data-pack-math>[\s\S]*?<p class="srcNoteA" data-pack-math-note>[\s\S]*?<\/p>/;

let wrote = [];
{
  // 가장 최근 발매된 OP 세트(판매 원장 asOf 기준) — 사실 파일 releases.newestOp. 그 세트의 정가·출처는 releaseFacts, 이름은 sets[code].nameEn.
  const newest = F.releases.newestOp;
  const nf = newest ? RF[newest].japanese : null;
  const nameEn = (newest && F.sets[newest] && F.sets[newest].nameEn) || "";
  const yen = (v) => "¥" + Number(v).toLocaleString("en-US");
  let jpLi = "";
  if (nf && nf.msrpYenPerPack) {
    const packs = nf.packsPerBox || 24;
    const boxYen = nf.msrpYenPerBox || nf.msrpYenPerPack * packs;
    const stated = nf.msrpYenPerBoxBasis == null && nf.msrpYenPerBox;
    const src = nf.specSource || nf.releaseSource;
    jpLi = `<li><strong>Japanese booster pack:</strong> 6 cards per pack (Bandai official). A 24-pack box holds <strong>144 cards</strong>. For the newest main set, ${esc(newest)}${nameEn ? ` ${esc(nameEn)}` : ""}, <a href="${esc(src)}" rel="noopener noreferrer" target="_blank">Bandai lists</a> an MSRP of <strong>${yen(nf.msrpYenPerPack)} per pack</strong> (tax included)${stated ? ` — <strong>${yen(boxYen)} per box</strong>` : `; its page states no box configuration — at the standard ${packs} packs that is <strong>${yen(boxYen)}</strong>`}, about <strong>$${jpyUsd(boxYen).toFixed(2)}</strong> at ¥1 = $${rate.toFixed(5)} (${longDate(FX.date)}). Earlier sets launched at lower pack prices, so check the official product page for a specific set's original MSRP.</li>`;
  }
  // 영문판 팩 구성(반다이 영문 상품 페이지) — 사실 파일 enPackContents(자연 정렬).
  const enFacts = Object.keys(F.enPackContents);
  const enBits = enFacts.map((c) => { const e = F.enPackContents[c]; return e.cardsPerPack ? `the <a href="${esc(e.source)}" rel="noopener noreferrer" target="_blank">${esc(c)}</a> page lists <strong>${e.cardsPerPack} cards per pack</strong>` : `the <a href="${esc(e.source)}" rel="noopener noreferrer" target="_blank">${esc(c)}</a> page states no per-pack card count`; });
  const enOn = enFacts.map((c) => F.enPackContents[c].verifiedOn).filter(Boolean).sort().pop();
  const enLi = `<li><strong>English booster pack:</strong> Bandai's US site lists current English boosters at <strong>USD $4.99 MSRP per pack</strong> — about <strong>$119.76 per 24-pack box</strong>.${enBits.length ? ` On Bandai's English product pages, ${enBits.join("; ")}${enOn ? ` (checked ${longDate(enOn)})` : ""}; the English main-set pages give no per-pack card count.` : ""}</li>`;
  const block = `<!-- PACK-FACTS:START -->\n        ${jpLi}\n        ${enLi}\n        <!-- PACK-FACTS:END -->`;
  const reBlock = /<!-- PACK-FACTS:START -->[\s\S]*?<!-- PACK-FACTS:END -->/;
  const reOld = /<li><strong>Japanese booster pack:<\/strong>[\s\S]*?<\/li>\s*<li><strong>English booster pack:<\/strong>[\s\S]*?<\/li>/;
  if (jpLi && reBlock.test(html)) { html = html.replace(reBlock, () => nl(block)); wrote.push("pack-facts"); }
  else if (jpLi && reOld.test(html)) { html = html.replace(reOld, () => nl(block)); wrote.push("pack-facts"); }
}
if (leadRe.test(html)) {
  html = html.replace(leadRe, () => nl(`<p data-pack-math-lead>${lead}</p>`));
  wrote.push("lead");
}
if (tableRe.test(html)) {
  html = html.replace(tableRe, () => nl(table));
  wrote.push("table");
}
if (!wrote.length) {
  console.log(JSON.stringify({ status: "skip", reason: "markers not found" }));
  process.exit(0);
}
// 제목·표 머리 — 2026-10-14(W6a). "one piece booster box msrp" 질의(AI 점유 33%)는 일반검색 10위 밖이었다. 1위 질의
// "how many packs …" 문구는 제목 앞에 그대로 두고 뒤에 "MSRP by Set" 을 붙인다(60자 이하). 표 바로 위 H2 에 질의 문구를 그대로.
// 손 HTML 이라 여기서 매번 맞춘다(몇 번 돌려도 같다).
const TITLE = "How Many Packs in a One Piece Booster Box? MSRP by Set";
const H2 = `<h2 id="msrp-by-set">One Piece Booster Box MSRP by Set — retail vs market price</h2>`;
html = html.replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, (_m, a, b) => a + TITLE + b);
html = html.replace(/<h2[^>]*>[^<]*<\/h2>(\s*<p data-pack-math-lead>)/, (_m, rest) => H2 + rest);
html = html.replace(/("dateModified": ")[^"]*(")/, (_m, a, b) => a + dataDate + b);
// 화면 바이라인의 "Updated" 날짜도 dataDate 로 맞춘다 — JSON-LD dateModified 만 바꾸면 구글이 보는 두 날짜가 어긋난다(감사 SD2, 2026-09-29).
// 바이라인에 Updated 가 아예 없으면 Published 뒤에 한 번 넣는다.
if (/Updated <time datetime="/.test(html)) {
  html = html.replace(/(Updated <time datetime=")[^"]*(">)[^<]*(<\/time>)/, (_m, a, b, c) => a + dataDate + b + longDate(dataDate) + c);
} else {
  html = html.replace(/(Published <time datetime="[^"]*">[^<]*<\/time>)/, (_m, a) => `${a} · Updated <time datetime="${dataDate}">${longDate(dataDate)}</time>`);
}
// FAQ — 화면 FAQ 와 FAQPage JSON-LD 를 이 배열 하나에서 쓴다(가드 L2) — 2026-10-15(5차).
// 종전엔 손 HTML 이라 JSON-LD 는 화면에 없는 1문항("How many packs …"), 화면은 JSON-LD 에 없는 4문항이었다.
// 답은 그대로 옮겼다(새 문장 없음). JSON-LD 답 = 화면 답에서 태그를 걷어 낸 글자.
const FAQ = [
  ["How many packs are in a One Piece booster box?", "A standard One Piece Card Game booster box contains <strong>24 booster packs</strong>. This applies to Japanese and English main-set boxes (OP-01 onward)."],
  ["How many cards are in a full Japanese booster box?", "24 packs × 6 cards = <strong>144 cards</strong> per Japanese box."],
  ["Is a case the same as a box?", "No. A <em>case</em> is a sealed carton of boxes shipped to retailers. A retailer source lists 12 boxes per case for the Japanese OP-01 display; Bandai does not publish case configurations. This site tracks single sealed boxes only — case listings are excluded from the price data."],
  ["Do all boxes guarantee a Secret Rare or manga rare?", "No. Bandai does not guarantee a manga-art card in each box, and the relevant pull rates are not published. Card demand, sealed supply and that uncertainty can all affect secondary-market prices."],
  ["Where can I see what each box is worth right now?", `The <a href="../">live tracker</a> shows current market prices, weekly price history and top-card values for every Japanese set, updated continuously.`],
];
const faqText = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const faqBlock = `<!-- PACK-FAQ:START -->\n      <h2>FAQ</h2>\n${FAQ.map(([q, a]) => `      <h3>${esc(q)}</h3>\n      <p>${a}</p>`).join("\n")}\n      <!-- PACK-FAQ:END -->`;
const faqLd = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: faqText(a) } })) })}</script>`;
const reFaq = /<!-- PACK-FAQ:START -->[\s\S]*?<!-- PACK-FAQ:END -->/;
const reFaqOld = /<h2>FAQ<\/h2>[\s\S]*?(?=\s*<\/main>)/;   // 첫 실행(마커 없는 손 HTML) — FAQ 제목부터 </main> 앞까지
const reFaqLd = /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>/;
if (reFaq.test(html)) html = html.replace(reFaq, () => nl(faqBlock));
else if (reFaqOld.test(html)) html = html.replace(reFaqOld, () => nl(faqBlock));
if (reFaqLd.test(html)) html = html.replace(reFaqLd, () => faqLd);
fs.writeFileSync(ART, html);
console.log(JSON.stringify({ status: "ok", dataDate, rows: rows.length, live: liveCount, wrote }));
