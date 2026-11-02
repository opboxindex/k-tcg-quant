#!/usr/bin/env node
// articles/one-piece-set-list-release-dates.html 의 "JP box" 열과 기준일을 box-sold-series 에서 다시 쓴다.
// 2026-10-14(W3): 발매일 사실 구간(맨 위 표·세트별 H2·영문판 링크·ItemList)도 data/set-facts.json 에서 굽는다 — 아래 ①②③.
// 이 글은 AI 인용 1위 페이지(전체 인용의 56%)인데 가격이 손으로 적혀 있어 매주 낡았다.
// 2026-09-28: 열 머리글은 "Sep 2026", 주석은 "July 14" 로 서로 달랐고 실제 값은 3주 전 값이었다(OP-16 −12%).
//
// 규칙
//  · 값은 box-sold-series 의 current.jp(USD, 반올림) — 모든 페이지 표가 같은 칸을 읽는다(2026-10-14).
//    current 는 그 판이 발매됐고 마지막 점이 asOf 로부터 28일 이내일 때만 있다. 없으면 "—".
//  · 미발매 세트는 "—". 발매일 이전 판매(예약판매)는 시계열에 없다(build-box-sold-series.js preRelease).
//    2026-10-14 사고: OP-18 예약판매 $110 이 이 표의 OP-18 칸과 "최신 세트(OP-17) 박스값" 자리에 들어가 있었다.
//  · 아무 값도 만들어내지 않는다. 시계열에 없는 세트는 그대로 둔다.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ART = path.join(ROOT, "articles/one-piece-set-list-release-dates.html");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${d}, ${y}`;
}

if (!fs.existsSync(ART)) {
  console.log(JSON.stringify({ status: "skip", reason: "file missing" }));
  process.exit(0);
}

// 현재가(current.jp)·기준일(판매 원장 asOf)·최신 발매 세트·다음 발매·공식 카드리스트 목록은 사실 파일(data/derived/site-facts.json)에서 — 2026-10-15.
const F = require("./build-site-facts").load();
const { buyLink } = require("./set-page-shared");
const series = Object.fromEntries(F.order.series.map((c) => [c, F.sets[c]]));
let html = fs.readFileSync(ART, "utf8");
const crlf = html.includes("\r\n");

// 데이터 기준일 = 시계열 전체의 마지막 관측일(build-box-sold-series.js asOf — 다른 표들과 같은 기준일)
const dataDate = F.series.asOf || "";
if (!dataDate) {
  console.log(JSON.stringify({ status: "skip", reason: "no series dates" }));
  process.exit(0);
}
const curJp = (code) => (series[code] && series[code].current.jp) || null;

let updated = 0, staled = 0, untouched = 0;
const SHORT = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${MON[m - 1]} ${d}`; };
const trRe = /<tr><td>((?:OP|EB|PRB)-\d+)<\/td>([\s\S]*?)<\/tr>/g;
html = html.replace(trRe, (whole, code, rest) => {
  if (!series[code]) { untouched++; return whole; }
  const cur = curJp(code);
  // 값 옆에 그 중앙값 점의 날짜(<small>) — 열 하나에 기준일이 하나가 아니다.
  // 이름 칸 아래 일본판 최저 실매물 링크(세트 페이지 구매 버튼과 같은 값 — 사실 파일 ask.jp) — 2026-11-02. 이 글은 검색 유입의 약 60%인데 구매 링크가 0개였다.
  // 가격 칸이 아니라 이름 칸 — 가격 칸은 폰에서 가로 스크롤 표의 화면 밖 마지막 열이라 링크 19개가 안 보였고, 가드 D17 은 그 칸의 첫 $ 를 중앙값으로 읽는다.
  // 이 함수는 매일 자기 출력 위에 다시 돈다 — 지난번 링크(slBuy)를 걷어 내고 단다.
  const ask = F.sets[code] && F.sets[code].ask && F.sets[code].ask.jp;
  const buy = ask ? buyLink({ url: ask.url, price: ask.total, spot: `sl-${code.toLowerCase()}`, label: "eBay from" }) : "";
  const cell = cur ? `$${Math.round(cur.median).toLocaleString("en-US")}<small> ${SHORT(cur.d)}</small>` : "—";
  // 치환 문자열이 아니라 함수로 쓴다 — cell 이 "$" 로 시작해서 $1·$& 같은 치환 패턴으로 오인된다.
  const next = rest
    .replace(/<small class="slBuy"[^>]*>[\s\S]*?<\/small>/, "")
    .replace(/^(<td>(?:(?!<\/td>)[\s\S])*)(<\/td>)/, (m, a, b) => `${a}${buy ? `<small class="slBuy" style="display:block;margin-top:2px;font-size:12px">${buy}</small>` : ""}${b}`)
    .replace(/<td class="num">(?:(?!<\/td>)[\s\S])*<\/td>/, () => `<td class="num">${cell}</td>`);
  if (next === rest) { untouched++; return whole; }
  if (cur) updated++; else staled++;
  return `<tr><td>${code}</td>${next}</tr>`;
});

// 본문 안의 OP-17 박스값 (data-op17-box 표시 구간 — 상단 안내와 "Which sets" 목록 두 곳, 표와 같은 원천)
// 2026-09-30: 목록 쪽은 손으로 쓴 "$144 on September 7" 이 표($130, 9/28)와 어긋나 있었다 → 같은 구간으로 묶었다.
// 2026-10-14: "최신 세트" 를 "시계열이 있는 가장 큰 번호" 로 고르다가 미발매 OP-18 의 예약판매 $110 이 들어갔다.
//   최신 세트 = 일본판 발매일 ≤ 데이터일인 가장 큰 OP 번호. 이 구간 앞뒤 문장이 OP-17 을 이름으로 부르므로 값도
//   표시 구간 이름의 세트(OP-17)에서 가져온다. 최신 발매 세트가 바뀌면 글 문장부터 고쳐야 한다 — 출력에 알린다.
// 2026-10-14 QA: "OP-17 latest" 배지·"Newest main set (OP-17)"·"Next booster (EB-05…)" 가 손으로 박혀 있어 EB-05(10/31)·OP-18(11/21)
//   발매 뒤에도 그대로 남을 구조였다(주입기는 경고만). 이제 최신·다음 세트는 set-facts 발매일에서 정한다 — 가드 RD1 이 같은 규칙으로 대조한다.
// 최신 발매 OP 세트·다음 발매 = 사실 파일 releases(newestOp·nextUp — 기준일은 같은 판매 원장 asOf).
const newest = F.releases.newestOp;
if (!newest) throw new Error("set-facts 에 발매된 OP 세트가 없다 — 최신 세트를 정할 수 없다");
const spanCode = newest;
// 다음 발매(어느 계열이든) — 일본판·영문판 중 이른 날이 데이터일 뒤인 세트 가운데 가장 이른 것
const nextUp = F.releases.nextUp;

// ── 발매일 사실(2026-10-14, W3) — 원천은 data/set-facts.json(공식 페이지에서 확인한 값·확인일)과
//    data/upcoming-set-pages.json(발매 전 세트 목록·공개 카드). 글에 손으로 적힌 날짜·가격·종수는 낡는다
//    ("checked September 28" 이 2주 넘게 남았고 EB-05 75+2종은 비어 있었다). 그래서 아래 세 곳을 여기서 굽는다.
//    ① 맨 위 "Release dates (official)" 표 — 최신 발매 세트(OP-17) + 발매 전 세트
//    ② 세트별 "<코드> release date" H2 — 같은 꼴(판·발매일·팩 가격·카드 종류) + 레어리티·공개 카드·출처 라벨
//    ③ 세트 목록 표의 영문 발매일 칸 → sets/<코드>-english.html 링크, 표 전체를 ItemList(Product+releaseDate) JSON-LD 로
//    글의 dateModified·바이라인·eyebrow 날짜는 여기서 쓰지 않는다 — tools/sync-article-dates.js 한 곳(본문이 바뀐 날).
const FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/set-facts.json"), "utf8")).sets || {};
// 세트별 공식 카드리스트(sets/<코드>-card-list.html) — 2026-10-14(W7). 있는 세트만 링크한다(공식 목록 데이터 기준 — 사실 파일 cardLists, 주소 규칙은 card-list-shared).
const CL_PATH = require("./card-list-shared");
const CARD_LIST = { has: (code) => F.cardLists.some((p) => p.code === code), products: () => F.cardLists, pagePath: CL_PATH.pagePath };
const UPCOMING = JSON.parse(fs.readFileSync(path.join(ROOT, "data/upcoming-set-pages.json"), "utf8")).pages || [];
const fileExists = (rel) => fs.existsSync(path.join(ROOT, rel));
const shortDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MON[m - 1]} ${d}, ${y}`; };
const weekday = (iso) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const MONIDX = Object.fromEntries(MON.map((m, i) => [m, i + 1]));
const isoOf = (txt) => { const m = String(txt).trim().match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/); return m && MONIDX[m[1]] ? `${m[3]}-${String(MONIDX[m[1]]).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };
const stripTags = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugOf = (code) => code.toLowerCase();
// 순서: 발매 전 세트(늦은 발매가 위) → 최신 발매 세트
const RELEASE_CODES = [...UPCOMING.map((p) => p.code).sort((a, b) => String(FACTS[b]?.jpRelease?.date).localeCompare(String(FACTS[a]?.jpRelease?.date))), spanCode];
for (const code of RELEASE_CODES) {
  const f = FACTS[code];
  if (!f || !f.jpRelease || !f.jpRelease.date || !f.enRelease || !f.enRelease.date || !f.jpMsrpYenPerPack || !f.enRelease.msrpUsdPerPack || !f.cardTypes) {
    throw new Error(`${code}: set-facts 에 jpRelease·enRelease·jpMsrpYenPerPack·enRelease.msrpUsdPerPack·cardTypes 가 다 있어야 발매일 구간을 굽는다`);
  }
  const up = UPCOMING.find((p) => p.code === code);
  if (up && (up.releaseJp !== f.jpRelease.date || up.releaseEn !== f.enRelease.date)) {
    throw new Error(`${code}: upcoming-set-pages(${up.releaseJp}/${up.releaseEn}) ≠ set-facts(${f.jpRelease.date}/${f.enRelease.date}) — 한쪽만 고쳤다`);
  }
}
// 세트 이름은 이 글의 세트 목록 표에서(한 곳)
const nameOf = (code) => {
  const m = html.match(new RegExp(`<tr><td>${code}</td><td>([\\s\\S]*?)</td>`));
  return m ? stripTags(m[1]).replace(/\s*\([^)]*\)\s*$/, "") : "";
};
const dateCell = (iso, englishPage) => {
  const t = `<time datetime="${iso}">${shortDay(iso)}</time>`;
  return englishPage && fileExists(`sets/${englishPage}`) ? `<a href="../sets/${englishPage}">${t}</a>` : t;
};

// ① 맨 위 표
{
  const order = [spanCode, ...UPCOMING.map((p) => p.code).sort((a, b) => FACTS[a].enRelease.date.localeCompare(FACTS[b].enRelease.date))];
  const rows = order.map((code) => {
    const f = FACTS[code], slug = slugOf(code);
    const label = `<span data-ko="${code} 발매일">${code} release date</span>${code === spanCode ? ` <small data-ko="최신 발매" data-newest>latest</small>` : ""}`;
    return `<tr><td><a href="../sets/${slug}.html">${label}</a></td><td>${dateCell(f.enRelease.date, `${slug}-english.html`)}</td><td>${dateCell(f.jpRelease.date)}</td></tr>`;
  });
  const block = `<!-- RELEASE-TOP:START -->
        <strong data-ko="발매일(공식)">Release dates (official)</strong>
        <table class="nextTbl"><thead><tr><th data-ko="세트">Set</th><th data-ko="영문판">English</th><th data-ko="일본판">Japan</th></tr></thead><tbody>
          ${rows.join("\n          ")}
        </tbody></table>
        <!-- RELEASE-TOP:END -->`;
  const re = /<!-- RELEASE-TOP:START -->[\s\S]*?<!-- RELEASE-TOP:END -->/;
  if (!re.test(html)) throw new Error("글에 RELEASE-TOP 표시가 없다 — 맨 위 발매일 표 자리를 찾을 수 없다");
  html = html.replace(re, () => block);
}

// ② 세트별 발매일 구간
{
  const RARITY = [["leader", "Leader", "리더"], ["common", "Common", "커먼"], ["uncommon", "Uncommon", "언커먼"], ["rare", "Rare", "레어"], ["superRare", "Super Rare", "슈퍼 레어"], ["secretRare", "Secret Rare", "시크릿 레어"], ["special", "Special", "스페셜"], ["treasureRare", "Treasure Rare", "트레저 레어"], ["don", "DON!!", "돈!!"]];
  const blocks = RELEASE_CODES.map((code) => {
    const f = FACTS[code], slug = slugOf(code), up = UPCOMING.find((p) => p.code === code);
    const eds = [
      ["Japanese", "일본판", f.jpRelease.date, `¥${f.jpMsrpYenPerPack}`, f.cardTypes],
      ["English", "영문판", f.enRelease.date, `$${f.enRelease.msrpUsdPerPack.toFixed(2)}`, f.enRelease.cardTypes || "—"],
    ].sort((a, b) => a[2].localeCompare(b[2]));
    const rows = eds.map(([ed, edKo, iso, price, types]) => `<tr><td data-ko="${edKo}">${ed}</td><td><strong>${dateCell(iso, ed === "English" ? `${slug}-english.html` : null)}</strong> ${weekday(iso)}</td><td>${esc(price)}</td><td>${esc(types)}</td></tr>`);
    const labels = [];
    const rc = f.jpRarityCounts;
    if (rc) labels.push(`<span data-ko="일본판 레어리티:">Japanese rarity:</span> ${RARITY.filter(([k]) => rc[k] != null).map(([k, en]) => `${en} ${rc[k]}`).join(" · ")}`);
    if (up && (up.revealedCards || []).length) labels.push(`<span data-ko="공개 카드(공식):">Revealed cards (official):</span> <a href="../sets/${slug}.html#revealed-cards">${up.revealedCards.length}</a>`);
    if (code === spanCode) labels.push(`<span data-ko="일본판 박스:">JP box:</span> <span data-newest-box>—</span>`);
    const pages = [`<a href="../sets/${slug}.html">${code} page</a>`];
    if (fileExists(`sets/${slug}-english.html`)) pages.push(`<a href="../sets/${slug}-english.html">${code} English page</a>`);
    if (CARD_LIST.has(code)) pages.push(`<a href="../sets/${slug}-card-list.html">${code} card list</a>`);
    labels.push(pages.join(" · "));
    const jpSrc = (f.jpSpecSource && f.jpSpecSource.source) || f.jpRelease.source;
    const jpOn = [f.jpRelease.verifiedOn, f.jpSpecSource && f.jpSpecSource.verifiedOn].filter(Boolean).sort().pop();
    const src = `Sources: <a href="${esc(jpSrc)}" rel="noopener noreferrer" target="_blank">Bandai Japanese product page</a> (checked ${longDate(jpOn)}) · <a href="${esc(f.enRelease.source)}" rel="noopener noreferrer" target="_blank">Bandai English product page</a> (checked ${longDate(f.enRelease.verifiedOn)}).`;
    const name = nameOf(code);
    return `<h2 id="${slug}" data-ko="${code} 발매일">${code} release date</h2>
      <div class="tblWrap"><table class="dataTable text relDates tblFit" aria-label="${esc(`${code} ${name}`)} release dates">
        <thead><tr><th data-ko="판">Edition</th><th data-ko="발매일">Release date</th><th data-ko="팩 가격">Pack price</th><th data-ko="카드 종류">Card types</th></tr></thead>
        <tbody>
          ${rows.join("\n          ")}
        </tbody>
      </table></div>
      <p class="srcNoteA">${labels.join("<br />")}<br />${src}</p>`;
  });
  const block = `<!-- RELEASE-FACTS:START -->\n      ${blocks.join("\n\n      ")}\n      <!-- RELEASE-FACTS:END -->`;
  const re = /<!-- RELEASE-FACTS:START -->[\s\S]*?<!-- RELEASE-FACTS:END -->/;
  if (!re.test(html)) throw new Error("글에 RELEASE-FACTS 표시가 없다");
  html = html.replace(re, () => block);
}

// ④ 공식 카드리스트 링크 줄 — 세트 목록 표 다음, 세트별 발매일 구간 앞(2026-10-14, W7). 라벨·링크만.
{
  const lists = CARD_LIST.products();
  const block = lists.length
    ? `<!-- CARD-LISTS:START -->
      <p class="srcNoteA"><span data-ko="공식 카드 리스트(일본판):">Official card lists (Japanese edition):</span> ${lists.map((p) => `<a href="../sets/${p.slug}-card-list.html">${p.code}</a>`).join(" · ")}</p>
      <!-- CARD-LISTS:END -->`
    : "<!-- CARD-LISTS:START --><!-- CARD-LISTS:END -->";
  const re = /<!-- CARD-LISTS:START -->[\s\S]*?<!-- CARD-LISTS:END -->/;
  if (re.test(html)) html = html.replace(re, () => block);
  else if (html.includes("<!-- RELEASE-FACTS:START -->")) html = html.replace("<!-- RELEASE-FACTS:START -->", () => `${block}

      <!-- RELEASE-FACTS:START -->`);
  else throw new Error("글에 RELEASE-FACTS 표시가 없어 카드리스트 줄 자리를 정할 수 없다");
}

// ③ 영문 발매일 칸 → 영문판 세트 페이지, 표 전체 → ItemList JSON-LD
{
  const items = [];
  const rowRe = /<tr><td>((?:OP|EB|PRB)-\d+)<\/td><td>([\s\S]*?)<\/td><td>([^<]*)<\/td><td>([\s\S]*?)<\/td>(?=<td class="num">)/g;
  html = html.replace(rowRe, (whole, code, nameCell, jpTxt, enCell) => {
    const slug = slugOf(code);
    const enTxt = stripTags(enCell);
    const enIso = isoOf(enTxt), jpIso = isoOf(jpTxt);
    const engPage = `${slug}-english.html`;
    const nextEn = enIso && fileExists(`sets/${engPage}`) ? `<a href="../sets/${engPage}">${enTxt}</a>` : (enIso ? enTxt : enCell);
    const name = stripTags(nameCell).replace(/\s*\([^)]*\)\s*$/, "");
    const setUrl = fileExists(`sets/${slug}.html`) ? `https://opboxindex.com/sets/${slug}.html` : CARD_LIST.has(code) ? `https://opboxindex.com/${CARD_LIST.pagePath(code)}` : null;
    if (jpIso) items.push({ name: `One Piece Card Game ${code} ${name} Booster Box (Japanese)`, releaseDate: jpIso, url: setUrl });
    if (enIso) items.push({ name: `One Piece Card Game ${code} ${name} Booster Box (English)`, releaseDate: enIso, url: fileExists(`sets/${engPage}`) ? `https://opboxindex.com/sets/${engPage}` : setUrl });
    return `<tr><td>${code}</td><td>${nameCell}</td><td>${jpTxt}</td><td>${nextEn}</td>`;
  });
  if (items.length < 40) throw new Error(`세트 목록 표에서 발매일을 ${items.length}개밖에 못 읽었다 — 표 구조가 바뀌었으면 이 주입기도 고칠 것`);
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "One Piece Card Game booster box release dates (Japanese and English)",
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${it.name}: ${it.releaseDate}`,
      ...(it.url ? { url: it.url } : {}),
    })),
  };
  const tag = `<script type="application/ld+json" data-release-list>${JSON.stringify(ld)}</script>`;
  if (/<script type="application\/ld\+json" data-release-list>[\s\S]*?<\/script>/.test(html)) {
    html = html.replace(/<script type="application\/ld\+json" data-release-list>[\s\S]*?<\/script>/, () => tag);
  } else {
    const bc = html.match(/^([ \t]*)<script type="application\/ld\+json">\{"@context": "https:\/\/schema\.org", "@type": "BreadcrumbList"[\s\S]*?<\/script>/m);
    if (!bc) throw new Error("BreadcrumbList JSON-LD 를 못 찾아 ItemList 자리를 정할 수 없다");
    html = html.replace(bc[0], () => `${bc[0]}\n${bc[1]}${tag}`);
  }
}

const spanCur = curJp(spanCode);
const spanTxt = spanCur ? `$${Math.round(spanCur.median).toLocaleString("en-US")} on ${longDate(spanCur.d)}` : "—";

// ⑤ 첫 화면 안내 문단(RELEASE-LEAD)과 "Which sets to look at first" 앞 두 줄(RELEASE-WHICH) — 손글씨였던 것을 데이터에서 굽는다.
{
  const sf = FACTS[spanCode];
  const nm = nameOf(spanCode);
  const firstRel = (c) => [FACTS[c] && FACTS[c].jpRelease && FACTS[c].jpRelease.date, FACTS[c] && FACTS[c].enRelease && FACTS[c].enRelease.date].filter(Boolean).sort()[0] || null;
  const ups = UPCOMING.map((p) => p.code).filter((c) => FACTS[c] && firstRel(c) > dataDate).sort((a, b) => FACTS[a].jpRelease.date.localeCompare(FACTS[b].jpRelease.date));
  const upBits = ups.map((c) => { const f = FACTS[c]; return `<strong>${c}</strong> ${esc(nameOf(c))}: Bandai's product pages list <strong>${longDate(f.jpRelease.date)}</strong> in Japan and <strong>${longDate(f.enRelease.date)}</strong> in English, ${esc(f.cardTypes)} card types (<a href="#${slugOf(c)}">${c} table</a>).`; });
  const lead = `<!-- RELEASE-LEAD:START -->
        <p class="srcNoteA" style="margin:6px 0 0;">${spanCode} ${esc(nm)} is out — Japan/Asia <strong>${longDate(sf.jpRelease.date)}</strong>, English <strong>${longDate(sf.enRelease.date)}</strong> — and its sealed Japanese box is tracked daily on the <a href="../sets/${slugOf(spanCode)}.html"><strong>${spanCode} box price page</strong></a> (<span data-newest-box>—</span>). ${upBits.join(" ")} Japanese retail raffles for new sets are listed on the <a href="../amazon-lottery.html">Amazon Japan raffle page</a>.</p>
        <!-- RELEASE-LEAD:END -->`;
  const reLead = /<!-- RELEASE-LEAD:START -->[\s\S]*?<!-- RELEASE-LEAD:END -->/;
  if (reLead.test(html)) html = html.replace(reLead, () => lead);
  else {
    const old = /(<!-- RELEASE-TOP:END -->\s*)<p style="[^"]*">[\s\S]*?<\/p>/;
    if (!old.test(html)) throw new Error("글에 RELEASE-LEAD 표시도, 맨 위 안내 문단도 없다");
    html = html.replace(old, (_m, a) => a + lead);
  }
  const nx = nextUp && FACTS[nextUp];
  const which = `<!-- RELEASE-WHICH:START -->
        <li><strong>Newest main set (${spanCode}):</strong> released ${longDate(sf.jpRelease.date)}; Japanese box <span data-newest-box>—</span>. <a href="../sets/${slugOf(spanCode)}.html">Live ${spanCode} data</a>.</li>${nx ? `
        <li><strong>Next release (${nextUp}, ${longDate(nx.jpRelease.date)} in Japan · ${longDate(nx.enRelease.date)} in English):</strong> <a href="../sets/${slugOf(nextUp)}.html">${nextUp} page</a>.</li>` : ""}
        <!-- RELEASE-WHICH:END -->`;
  const reWhich = /<!-- RELEASE-WHICH:START -->[\s\S]*?<!-- RELEASE-WHICH:END -->/;
  if (reWhich.test(html)) html = html.replace(reWhich, () => which);
  else {
    const old = /<li><strong>Newest main set \([^)]*\):<\/strong>[\s\S]*?<\/li>\s*<li><strong>Next booster[\s\S]*?<\/li>/;
    if (!old.test(html)) throw new Error("글에 RELEASE-WHICH 표시도, 'Newest main set' 목록 줄도 없다");
    html = html.replace(old, () => which);
  }
}
html = html.replace(
  /(<span data-(?:newest|op17)-box>)[^<]*(<\/span>)/g,
  () => `<span data-newest-box>${spanTxt}</span>`
);

// 열 머리글 · 주석 — 열 이름에 월을 박지 않는다(행마다 값의 날짜가 다르다). 2026-10-14 QA.
html = html.replace(/<th class="num">JP box[^<]*<\/th>/g, `<th class="num">JP box (median · date)</th>`);
{
  const f4 = FACTS["EB-04"] || {};
  const en4 = f4.enRelease || {};
  const eb04 = (en4.combinedIn || []).length ? ` EB-04 has no standalone English booster; Bandai's English card list carries its cards inside ${en4.combinedIn.map((c) => `[${esc(c)}]`).join(" and ")} (checked ${longDate(en4.verifiedOn)}).` : "";
  const note = `<p class="srcNoteA" data-release-note>English release dates are the North American dates we track (day precision). Japanese dates are the exact days on Bandai's official Japanese product pages (live or archived).${eb04} JP box = the latest rolling median of completed eBay sales of the sealed Japanese box, with the date of that median; — = no median dated within 28 days (a median needs at least 6 sales in its window) or not yet released. Data as of ${longDate(dataDate)}; live numbers on each set page. If you spot a date that does not match an official source, tell us and we will correct it.</p>`;
  const reNote = /<p class="srcNoteA"(?: data-release-note)?>English release dates are the North American dates[\s\S]*?<\/p>/;
  if (!reNote.test(html)) throw new Error("발매일 표 아래 주석 문단을 못 찾았다");
  html = html.replace(reNote, () => note);
}
// EB-04 행 — 일본 발매일·이름 링크·영문 칸을 set-facts 에서(2026-10-14 QA: 'Jan 31, 2026' 이 출처 없는 손글씨였다)
{
  const f4 = FACTS["EB-04"];
  if (f4 && f4.jpRelease && f4.jpRelease.date) {
    const en4 = f4.enRelease || {};
    const enLinks = (en4.combinedIn || []).map((c) => { const m = c.match(/^OP(\d+)-EB04$/); const pg = m ? `sets/op-${m[1]}-english.html` : null; return pg && fileExists(pg) ? `<a href="../${pg}">[${esc(c)}]</a>` : `[${esc(c)}]`; });
    const enCell = enLinks.length ? `— <small>EB-04 cards in ${enLinks.join(" · ")}</small>` : "—";
    const nameCell = CARD_LIST.has("EB-04") ? `<a href="../${CARD_LIST.pagePath("EB-04")}">EGGHEAD CRISIS</a>` : "EGGHEAD CRISIS";
    html = html.replace(/<tr><td>EB-04<\/td><td>[\s\S]*?<\/td><td>[^<]*<\/td><td>[\s\S]*?<\/td>(?=<td class="num">)/, () => `<tr><td>EB-04</td><td>${nameCell}</td><td>${shortDay(f4.jpRelease.date)}</td><td>${enCell}</td>`);
  }
}

if (crlf) html = html.replace(/\r?\n/g, "\r\n");
fs.writeFileSync(ART, html);
console.log(JSON.stringify({
  status: "ok", dataDate, updated, staled, untouched, newestReleased: newest, nextRelease: nextUp,
}));
