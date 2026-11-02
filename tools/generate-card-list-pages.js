#!/usr/bin/env node
"use strict";
// 세트별 공식 카드리스트 페이지 — sets/<code>-card-list.html + ko/<code>-card-list.html + 같은 이름의 .csv·.json. 2026-10-14 신설(W7).
//
// 왜: "op 17 set list" 질의는 경쟁 상위 10곳이 전부 세트 전체 카드리스트 페이지였고, 우리 OP-17 페이지는 Top 10 표뿐이라
//     AI 인용 점유가 3.8% 였다. 공식 목록(data/official-cardlist.json)의 사실 열과, 확정 규칙으로 맞춘 우리 숫자만 싣는다.
//
// 원칙
//  · 사실 열만: 번호·이름(영/일)·희귀도·종류·색·코스트(리더는 라이프)·파워. 효과 텍스트·카드 이미지는 쓰지 않는다(소유자 결정).
//  · 행 = 공식 일본판 목록의 카드 ID 하나(패러렐·SP·TR 도 각자 한 행). 가드 CL1 이 행 수 = 공식 수를 본다.
//  · 우리 숫자(NM·경매 낙찰 중앙값·PSA 10)는 공식 ID 에 확정 규칙으로 붙을 때만, 나머지는 "—". 규칙(base·sp/tr·parallel·사람 확인 접미어·
//      같은 키 두 행 비우기·의심 표식·3건 미만, 일본판 인쇄만)은 2026-10-15 에 사실 빌더(tools/build-site-facts.js cardListNumbers)로 옮겼다 —
//      값은 data/derived/site-facts.json cardLists[].numbers[공식 ID] = {nm, auction, auctionEn, psa10, page}. 여기는 공식 목록 행에 그 값을 붙여 그리기만 한다.
//  · 박스 값은 box-sold-series 의 current 하나(가드 D17 과 같은 값, 사실 파일 cardLists[].box). 없으면 "—".
//  · 외부 시세 업체명은 쓰지 않는다. 출처 링크는 반다이 공식 카드리스트뿐이고 확인일을 같이 적는다.
//  · 페이지 날짜(화면 "Data"·CollectionPage dateModified·JSON updated)는 사실 파일 cardLists[].pageDate 하나 — 화면에 찍히는 날짜 전부의 최댓값.
// Run: node tools/generate-card-list-pages.js   (generate-card-pages.js 뒤 — 사실 파일이 cards/card-map.json 을 읽는다)
const fs = require("node:fs");
const path = require("node:path");
const { SITE, CSS_VER, esc, usd, pageHead, foot, kfTableAny, KF_CSS, buyLink, AFF_TOP } = require("./set-page-shared");
// 영문 카드리스트의 구매 링크(2026-11-02) — 이 페이지들은 빙·검색 유입이 있는데(eb-05-card-list 10월 사용자 94명) 이베이 링크가 0개였다.
// 값은 세트 페이지 구매 버튼과 같은 최저 실매물(사실 파일 ask·cards[i].psa10Ask)만, customid cl-<세트>-box-jp/en · cl-<번호>. 한국어 판은 그대로.
const boxBuyLine = (code) => {
  const a = (F.sets[code] || {}).ask || {}, slug = code.toLowerCase();
  const bits = [a.jp && buyLink({ url: a.jp.url, price: a.jp.total, spot: `cl-${slug}-box-jp`, label: "JP box" }), a.en && buyLink({ url: a.en.url, price: a.en.total, spot: `cl-${slug}-box-en`, label: "EN box" })].filter(Boolean);
  return bits.length ? `<p class="clBuy">eBay: ${bits.join(" · ")}</p>` : "";
};
const hasBuy = (code) => !!boxBuyLine(code) || ((F.sets[code] || {}).cards || []).some((c) => c.psa10Ask && c.psa10Ask.buy);
const CL = require("./card-list-shared");
const { addUrls } = require("./sitemap-detail-urls");
const { navHtmlKo } = require("./site-nav");

const ROOT = path.join(__dirname, "..");
const F = require("./build-site-facts").load();
const FL = Object.fromEntries(F.cardLists.map((l) => [l.code, l]));   // 세트 코드 → 카드리스트 사실(numbers·box·en·pageDate)
const OFFICIAL = CL.doc();
const JP = OFFICIAL.jp || { products: {}, cards: {} };
const EN = OFFICIAL.en || { products: {}, cards: {} };
const AUCTION_DAY = F.cardAuction.day;
const MIN_N = 3;   // 라벨 글자용(판정은 사실 빌더)

// ── 이름·라벨
const TYPE_EN = { LEADER: "Leader", CHARACTER: "Character", EVENT: "Event", STAGE: "Stage" };
const TYPE_KO = { LEADER: "리더", CHARACTER: "캐릭터", EVENT: "이벤트", STAGE: "스테이지" };
const COLOR_EN = { 赤: "Red", 緑: "Green", 青: "Blue", 紫: "Purple", 黒: "Black", 黄: "Yellow" };
const COLOR_KO = { Red: "빨강", Green: "초록", Blue: "파랑", Purple: "보라", Black: "검정", Yellow: "노랑" };
const KIND_EN = { base: "", parallel: "Parallel", reprint: "Reprint", sp: "SP", tr: "TR", other: "" };
const KIND_KO = { base: "", parallel: "패러렐", reprint: "재수록", sp: "SP", tr: "TR", other: "" };

// 영문 공식 이름·색·특징은 번호 단위(같은 번호는 같은 카드). 영문판 목록 전체에서 찾는다(EB-04 는 OP14-EB04·OP15-EB04 안에 있다).
const EN_BY_NUM = {};
for (const c of Object.values(EN.cards || {})) if (c && c.num && !EN_BY_NUM[c.num]) EN_BY_NUM[c.num] = c;

const setNameEn = (code) => CL.nameEnOf(code);   // 추적 세트 → 예정 세트 → 공식 상품명(라틴 문자) 순 — card-list-shared.js
const setNameKo = (code, nameEn) => (F.sets[code] && F.sets[code].nameKo) || nameEn;

// ── 우리 숫자 — 사실 파일 cardLists[].numbers[공식 ID](값이 하나라도 붙는 ID 만 실려 있다, 없으면 전부 null). href 는 카드 상세(cards/<page>) 상대 경로.
const NONE = { nm: null, auction: null, auctionEn: null, psa10: null, page: null };
function numbersFor(code, id) {
  const r = (FL[code] && FL[code].numbers[id]) || NONE;
  return { nm: r.nm, auction: r.auction, auctionEn: r.auctionEn, psa10: r.psa10, href: r.page ? `../cards/${r.page}` : null };
}
// 가드 D17 과 같은 표기 — "$1,234"
const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
// 경매 낙찰 중앙값은 실제로 치러진 값 하나다 — $100 미만은 센트까지(9.99 를 $10 으로 올려 적지 않는다). NM·PSA 10 은 환산·중앙값이라 달러 단위.
const paid = (v) => (v < 100 ? "$" + v.toFixed(2) : money(v));

// ── 행 순서 — 그 세트 번호(예: OP17-)가 먼저, 다른 세트 번호(재수록·특별 인쇄)는 뒤로. 각 묶음 안은 공식 목록 순서.
// 2026-10-14 QA: OP-17 표 첫 행이 EB04-061_p3 이라 OP17-001 이 둘째 줄로 밀렸다. 가드 CL1 이 같은 규칙으로 대조한다.
function idsOrdered(product) { return CL.orderIds(product.code, product.ids); }
// ── 행 모델
function rowsOf(product) {
  return idsOrdered(product).map((id) => {
    const c = JP.cards[id] || {};
    const en = EN_BY_NUM[c.num] || {};
    const kind = CL.kindOf(id, c);
    const color = en.color || String(c.color || "").split("/").map((x) => COLOR_EN[x] || x).join("/");
    return {
      id, num: c.num, kind, rarity: CL.rarityShow(c.rarity), type: c.type,   // SPカード → SP — 세트·카드 상세·AI 피드와 같은 함수(2026-10-15)
      nameEn: en.name || "", nameJa: c.name || "", color,
      cost: c.cost, costKind: c.costKind, power: c.power, counter: c.counter,
      attribute: en.attribute || c.attribute || null, feature: en.feature || c.feature || "", trigger: !!c.trigger,
      ...numbersFor(product.code, id),
    };
  });
}
const anchorOf = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
// ItemList 항목 주소 — 카드 상세 페이지가 있으면 그 페이지(2026-10-19), 없으면 이 표의 행 앵커.
const itemUrl = (r, canonical) => (r.href ? `${SITE}/cards/${r.href.replace("../cards/", "")}` : `${canonical}#${anchorOf(r.id)}`);
// 공식 목록의 빈 값("-", 이벤트·스테이지의 파워 등)은 화면에 "—" — 사이트 규칙(2026-10-14 QA: "Power -" 로 나갔다).
const shown = (v) => (v == null || v === "" || v === "-" ? null : String(v));
const dashOr = (v) => (shown(v) == null ? "—" : esc(v));

// ── 출처 줄 — 사실 파일 cardLists[](공식 목록 url·확인일·변경일, 영문 상품 목록)
function sources(code) {
  const l = FL[code];
  return { jp: { url: l.url, checked: l.checked, changed: l.changed }, en: l.en.map((p) => ({ code: p.code, url: p.url, checked: p.checked })) };
}

// 페이지 날짜 = 화면 "Data"·CollectionPage dateModified·JSON updated 가 이 값 하나(2026-10-15, 4차) — 사실 파일 cardLists[].pageDate.
// 2026-10-14 QA: CollectionPage dateModified(데이터일 10-13)와 화면 "checked 2026-10-14"·사이트맵(10-14)이 달랐다. 피드(generate-feed)는 이 dateModified 를 읽는다.
// 2026-10-15 감사(#4): 그래도 화면의 경매 "last 45 days to 2026-10-15"·영문판 박스 "(2026-10-15, …)" 보다 이른 10-14 였다 —
// 경매 원장·박스 시리즈는 packs 데이터일보다 늦게 돈다. 그래서 **화면에 찍히는 날짜 전부**(공식 목록 확인일·변경일·데이터일·경매 기준일·영문 목록 확인일·
// 박스 관측일·행별 NM/PSA 10 관측일)의 가장 늦은 날을 빌더가 센다. 수정일이 본문보다 이르면 안 된다(가드 U1·CL2 와 같은 규칙).
const pageDate = (code) => FL[code].pageDate;
// ── 영문 페이지
const TITLE_MAX = 60, DESC_MAX = 155;
const fit = (cands, max, what) => {
  const hit = cands.find((c) => c.length <= max);
  if (!hit) throw new Error(`SEO 길이 초과: ${what} — "${cands[cands.length - 1]}"`);
  return hit;
};
const seen = new Set();
const unique = (t) => { if (seen.has(t)) throw new Error(`타이틀 중복: ${t}`); seen.add(t); return t; };

const CSS = `      .clSummary { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 12px 0 2px; color: var(--muted); font-size: 14px; }
      .clSummary b { color: var(--ink); font-family: var(--font-display); font-size: 17px; font-variant-numeric: tabular-nums; }
      .clMeta { margin: 6px 0 0; max-width: 900px; color: var(--muted); font-size: 13px; line-height: 1.65; }
      .clMeta b { color: var(--ink); font-variant-numeric: tabular-nums; }
      .clLinks { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 10px 0 0; font-size: 14px; }
      .bodyPage table.clTable { width: 100%; min-width: 0; margin: 16px 0 8px; font-size: 13.5px; }
      .clTable th, .clTable td { padding: 7px 8px; }
      .clTable td.num, .clTable th.num { text-align: right; white-space: nowrap; }
      .clTable td small { display: block; color: var(--muted); font-size: 11.5px; }
      .clTable .cNo { display: block; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
      .clTable .ja { display: block; color: var(--muted); font-size: 12px; }
      .clTable td.cn a { text-decoration: underline; text-decoration-color: rgba(var(--accent-rgb), .55); text-decoration-thickness: 1px; text-underline-offset: 3px; }
      .clTable td.cn a:hover { color: var(--accent); }
      .clTable .sub { display: none; }
      .clTable tbody tr:target { background: var(--accent-dim); }
      @media (max-width: 900px) {
        .bodyPage table.clTable { display: table; overflow: visible; -webkit-mask-image: none; mask-image: none; }
        .clTable .wide { display: none; }
        .clTable .sub { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
      }
      .clLegend { margin: 6px 0 0; max-width: 900px; color: var(--muted); font-size: 12px; line-height: 1.65; }
      .bodyPage table.clMini { width: 100%; max-width: 640px; min-width: 0; margin: 8px 0 14px; font-size: 13.5px; }
      .clMini th, .clMini td { padding: 6px 8px; overflow-wrap: anywhere; }
      .bodyPage table.clMini :is(th, td):not(.num) { text-align: left; }
      .clMini td.num, .clMini th.num { text-align: right; white-space: nowrap; }
      .clMini td small { display: block; color: var(--muted); font-size: 11.5px; }
      .bodyPage h2.clH2 { margin: 22px 0 2px; font-size: 18px; }
      @media (max-width: 900px) { .bodyPage table.clMini { display: table; overflow: visible; -webkit-mask-image: none; mask-image: none; } }
${KF_CSS}`;

// ── 표 세 개(2026-10-19): Leaders · Most valuable cards · Rarity breakdown — 'op-17 card list' 빙 1쪽 10곳이 모두 카드리스트 전문 페이지였고
//   이긴 페이지 구조는 H2 Leaders / Most valuable / Rarity breakdown 였다(AUDIT). 우리 페이지는 H2 가 0개였다.
//   값: 리더 = 공식 목록 행 그대로 · 가장 비싼 카드 = 세트 페이지 Top 10 과 같은 사실 값(F.sets[code].cards[].shown) · 레어도 = 공식 목록 레어도별 ID 수(card-list-shared countsOf).
const CARD_MAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "cards", "card-map.json"), "utf8")); } catch { return {}; } })();
const cardPageOf = (c) => CARD_MAP[(c.number || "") + "|" + String(c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")] || null;
function extraSections(code, rows, counts, ko) {
  const T = (en, k) => (ko ? esc(k) : `<span data-ko="${esc(k)}">${esc(en)}</span>`);
  const h2 = (id, en, k) => `<h2 class="clH2" id="${id}"${ko ? "" : ` data-ko="${esc(k)}"`}>${esc(ko ? k : en)}</h2>`;
  const out = [];
  const colorOf = (c) => (ko ? String(c || "").split("/").map((x) => COLOR_KO[x] || x).join("/") : c);
  const leaders = rows.filter((r) => r.type === "LEADER" && r.kind === "base");
  if (leaders.length) {
    out.push(`${h2("leaders", "Leaders", "리더")}
      <div style="overflow-x:auto"><table class="clMini">
        <thead><tr><th>${T("Leader", "리더")}</th><th>${T("Color", "색")}</th><th class="num">${T("Life", "라이프")}</th><th class="num">${T("Power", "파워")}</th></tr></thead>
        <tbody>
          ${leaders.map((r) => { const name = esc(r.nameEn || r.nameJa); return `<tr><td>${r.href ? `<a href="${esc(r.href)}">${name}</a>` : name}<small>${esc(r.id)}</small></td><td>${esc(colorOf(r.color))}</td><td class="num">${dashOr(r.cost)}</td><td class="num">${dashOr(r.power)}</td></tr>`; }).join("\n          ")}
        </tbody>
      </table></div>`);
  }
  const s = F.sets[code];
  // 표 머리가 '# · Card · NM (raw) · PSA 10' 이라 순서는 보이는 NM 값 내림차순(값 없음은 뒤, 같은 값은 큐레이션 순서) — 2026-10-19 검증.
  const nmOf = (c) => (c && c.shown && Number.isFinite(c.shown.nm) ? c.shown.nm : -1);
  const top = s && Array.isArray(s.cards) ? s.cards.map((c, i) => ({ c, i })).sort((a, b) => nmOf(b.c) - nmOf(a.c) || a.i - b.i).map((x) => x.c) : [];
  if (top.length) {
    const href = (c) => { const pg = cardPageOf(c); return pg ? `../cards/${pg}` : null; };
    const psaCell = (p) => (p.psa != null ? `${usd(p.psa)}<small>${p.psaKind === "sold" ? `${ko ? "판매" : "sold"}${p.psaDate ? " · " + esc(p.psaDate.slice(5)) : ""}` : ko ? "호가" : "ask"}</small>` : "—");
    out.push(`${h2("most-valuable", "Most valuable cards", "가장 비싼 카드")}
      <div style="overflow-x:auto"><table class="clMini">
        <thead><tr><th class="num">#</th><th>${T("Card", "카드")}</th><th class="num">NM (raw)</th><th class="num">PSA 10</th></tr></thead>
        <tbody>
          ${top.map((c, i) => { const p = c.shown || {}; const h = href(c); const name = `<b>${esc(c.name)}</b>`; return `<tr><td class="num">${i + 1}</td><td>${h ? `<a href="${esc(h)}">${name}</a>` : name}<small>${esc(c.number || "")}${c.rarityEn ? ` · ${esc(c.rarityEn)}` : ""}</small></td><td class="num">${p.nm != null ? `${usd(p.nm)}${p.nmSrc === "tcg" ? "<small>TCG</small>" : ""}` : "—"}</td><td class="num">${psaCell(p)}${!ko && c.psa10Ask && c.psa10Ask.buy ? `<small>${buyLink({ url: c.psa10Ask.url, price: c.psa10Ask.usd, spot: `cl-${String(c.number || "").toLowerCase()}`, label: "eBay" })}</small>` : ""}</td></tr>`; }).join("\n          ")}
        </tbody>
      </table></div>`);
  }
  const rar = Object.entries(counts.rarity || {});
  if (rar.length) {
    out.push(`${h2("rarity", "Rarity breakdown", "레어도별 카드 수")}
      <div style="overflow-x:auto"><table class="clMini">
        <thead><tr><th>${T("Rarity", "레어도")}</th><th class="num">${T("Cards", "카드")}</th></tr></thead>
        <tbody>
          ${rar.map(([r, n]) => `<tr><td>${esc(r)}${CL.RARITY_EN[r] && !ko ? ` <small>${esc(CL.RARITY_EN[r])}</small>` : ""}</td><td class="num">${n}</td></tr>`).join("\n          ")}
        </tbody>
      </table></div>`);
  }
  return out.join("\n      ");
}
// Key facts 표(요약 숫자) — 종전 p.clSummary 한 줄을 표로(2026-10-19). caption = "<코드> card list · Bandai list checked <날짜>". 가드 CL1 이 행 값을 대조한다.
function summaryTable(code, n, checked, ko) {
  const rows = [["cards", "Cards", "카드", n.cards], ["numbers", "Card numbers", "카드 번호", n.numbers], ["base", "Base", "기본", n.base], ["parallel", "Parallel", "패러렐", n.parallel],
    ...(n.reprint ? [["reprint", "Reprint", "재수록", n.reprint]] : []), ["sp", "SP", "SP", n.sp], ["tr", "TR", "TR", n.tr], ["leaders", "Leaders (base print)", "리더(기본 인쇄)", n.leaders]]
    .map(([k, en, k2, v]) => [k, en, k2, `<b>${v}</b>`]);
  const time = `<time datetime="${esc(checked)}">${esc(checked)}</time>`;
  const caption = ko ? `${esc(code)} 카드 리스트 · 반다이 목록 확인 ${time}` : `<span data-ko="${esc(`${code} 카드 리스트 · 반다이 목록 확인`)}">${esc(`${code} card list · Bandai list checked`)}</span> ${time}`;
  return kfTableAny(rows, { lang: ko ? "ko" : "en", label: ko ? `${code} 카드 리스트 요약` : `${code} card list key facts`, caption, cls: "clSummary" });
}

const numCell = (o, sub, fmt = money) => (o ? `${fmt(o.usd)}<small>${esc(sub(o))}</small>` : "—");
const nmSub = (o) => (o.date ? o.date.slice(5) : "");
const aucSub = (o) => `n=${o.n}`;
const psaSub = (o) => `${o.basis}${o.date ? " · " + o.date.slice(5) : ""} · n=${o.n}`;
const costShow = (r, life) => (r.costKind === "life" ? `${life} ${esc(r.cost)}` : esc(r.cost));

function pageEn(p, rows, nameEn, src, box, links) {
  const code = p.code, n = p.counts;
  const canonical = `${SITE}/${CL.pagePath(code)}`;
  const koHref = `${SITE}/${CL.koPath(code)}`;
  const label = nameEn ? `${code} ${nameEn}` : code;
  const h1 = `${label} — Card List`;
  const title = unique(fit([
    `One Piece ${label} Card List & Set List`,
    `${label} Card List & Set List`,
    `${label} Card List (${n.cards} Cards)`,
    `${label} Card List`,
    `${code} Card List & Set List (${n.cards} Cards)`,
  ], TITLE_MAX, code));
  const desc = fit([
    `Official ${label} card list: ${n.cards} cards, ${n.numbers} card numbers — rarity, type, color, cost and power, with matched NM, auction and PSA 10 prices.`,
    `Official ${label} card list: ${n.cards} cards, ${n.numbers} card numbers — rarity, type, color, cost and power, with matched prices.`,
    `Official ${code} card list: ${n.cards} cards, ${n.numbers} card numbers — rarity, type, color, cost and power.`,
  ], DESC_MAX, code);
  const setHref = links.setPage ? `${CL.slugOf(code)}.html` : "";
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: "Set Guides", item: `${SITE}/sets/index.html` },
    ...(setHref ? [{ "@type": "ListItem", position: 3, name: `${code} Guide`, item: `${SITE}/sets/${setHref}` }] : []),
  ];
  crumbs.push({ "@type": "ListItem", position: crumbs.length + 1, name: `${code} Card List`, item: canonical });
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: h1,
    url: canonical,
    inLanguage: "en",
    dateModified: pageDate(code),
    isBasedOn: src.jp.url,
    isPartOf: { "@type": "WebSite", name: "OP Box Index", url: `${SITE}/` },
    mainEntity: {
      "@type": "ItemList",
      name: `${label} official card list (Japanese edition)`,
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${r.id} ${r.nameEn || r.nameJa}`, url: itemUrl(r, canonical) })),
    },
  };
  const extraLd = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs })}</script>
    <script type="application/ld+json">${JSON.stringify(ld)}</script>`;

  const enSrc = src.en.length
    ? src.en.map((e) => `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.code)}</a> checked <time datetime="${e.checked}">${e.checked}</time>`).join(" · ")
    : "—";
  const boxBit = (ed, lbl) => (box[ed] ? `${lbl} <b>${money(box[ed].usd)}</b> (${esc(box[ed].date)}, n=${box[ed].n})` : `${lbl} <b>—</b>`);
  const tr = rows.map((r) => {
    const kind = KIND_EN[r.kind];
    const name = r.nameEn ? `<b>${esc(r.nameEn)}</b>` : `<b lang="ja">${esc(r.nameJa)}</b>`;
    const nameCell = r.href ? `<a href="${esc(r.href)}">${name}</a>` : name;
    const ourBits = [r.nm ? `NM ${money(r.nm.usd)}` : "", r.auction ? `Auction JP ${paid(r.auction.usd)} (n=${r.auction.n})` : "", r.auctionEn ? `Auction EN ${paid(r.auctionEn.usd)} (n=${r.auctionEn.n})` : "", r.psa10 ? `PSA 10 ${money(r.psa10.usd)}` : ""].filter(Boolean);
    return `<tr id="${anchorOf(r.id)}" data-id="${esc(r.id)}"><td class="cn"><span class="cNo">${esc(r.id)}${kind ? ` · ${kind}` : ""}</span>${nameCell}${r.nameEn ? `<span class="ja" lang="ja">${esc(r.nameJa)}</span>` : ""}`
      + `<span class="sub">${esc([r.rarity, TYPE_EN[r.type] || r.type, r.color, r.costKind === "life" ? `Life ${r.cost}` : `Cost ${r.cost}`, shown(r.power) ? `Power ${r.power}` : ""].filter(Boolean).join(" · "))}</span>`
      + `${ourBits.length ? `<span class="sub">${esc(ourBits.join(" · "))}</span>` : ""}</td>`
      + `<td class="wide">${esc(r.rarity)}</td><td class="wide">${esc(TYPE_EN[r.type] || r.type)}</td><td class="wide">${esc(r.color)}</td>`
      + `<td class="num wide">${costShow(r, "Life")}</td><td class="num wide">${dashOr(r.power)}</td>`
      + `<td class="num wide">${numCell(r.nm, nmSub)}</td><td class="num wide">${numCell(r.auction, aucSub, paid)}</td><td class="num wide">${numCell(r.auctionEn, aucSub, paid)}</td><td class="num wide">${numCell(r.psa10, psaSub)}</td></tr>`;
  }).join("\n          ");

  const linkBits = [
    setHref ? `<a href="${setHref}" data-ko="${code} 세트 페이지">${code} set page</a>` : "",
    links.english ? `<a href="${CL.slugOf(code)}-english.html" data-ko="${code} 영문판 박스">${code} English box</a>` : "",
    `<a href="${CL.slugOf(code)}-card-list.csv">CSV</a>`,
    `<a href="${CL.slugOf(code)}-card-list.json">JSON</a>`,
    `<a href="index.html#card-lists" data-ko="전체 카드 리스트">All card lists</a>`,
  ].filter(Boolean);

  // 범례 = 정의 라벨만 — 2026-10-15 소유자 결정(데이터 페이지는 숫자·표·라벨만). 설명 문장("Leaders show Life in the cost column"·
  // "cards from other sets' numbers follow …"·"prints are never combined"·"Numbers appear only where … otherwise —"·
  // "Effect text and card images are not reproduced")은 지웠다 — 칸 자체가 "Life 5"·JP/EN 열·"—" 로 보인다. 한국어 범례도 같은 규칙.
  const LEGEND_EN = `<p class="clLegend">Base = official card ID without suffix · Parallel = ID ending _p · Reprint = ID ending _r · SP = rarity SP CARD · TR = rarity TR · Leaders = base-print Leader cards<br />NM = Japanese raw near-mint retail ask, ¥ → USD (MM-DD = observed) · Auction JP / EN = median winning bid for the Japanese / English print of that card, ungraded, last 45 days to ${esc(AUCTION_DAY || "—")} (n = sales) · PSA 10 = median of completed sales (n ≥ ${MIN_N}) · — = no rule-matched value · <a href="../methodology.html">Methodology</a> · Data ${esc(pageDate(code))}</p>`;
  const html = `${pageHead({ title, desc, canonical, koHref, extraLd, extraCss: CSS, chart: false })}
      <p class="eyebrow" data-ko="공식 카드 리스트 · 일본판">Official card list · Japanese edition</p>
      <h1>${esc(h1)}</h1>
      <!-- CARD-LIST:START -->
      ${summaryTable(code, n, src.jp.checked, false)}
      <p class="clMeta"><span data-ko="공식 목록(일본판):">Official list (Japanese):</span> <a href="${esc(src.jp.url)}" target="_blank" rel="noopener noreferrer">Bandai card list</a> checked <time datetime="${src.jp.checked}">${src.jp.checked}</time><br /><span data-ko="영문 이름:">English names:</span> Bandai English card list ${enSrc}<br />${boxBit("jp", "JP box sold median")} · ${boxBit("en", "EN box")}</p>
      <p class="clLinks">${linkBits.join("")}</p>
      ${hasBuy(code) ? `${AFF_TOP} ${boxBuyLine(code)}` : ""}
      ${extraSections(code, rows, n, false)}
      <h2 class="clH2" id="all-cards" data-ko="전체 ${n.cards}장">All ${n.cards} cards</h2>
      ${LEGEND_EN}
      <table class="clTable text">
        <thead><tr><th data-ko="카드">Card</th><th class="wide" data-ko="레어도">Rarity</th><th class="wide" data-ko="종류">Type</th><th class="wide" data-ko="색">Color</th><th class="num wide" data-ko="코스트/라이프">Cost / Life</th><th class="num wide" data-ko="파워">Power</th><th class="num wide">NM</th><th class="num wide" data-ko="경매 일본판">Auction JP</th><th class="num wide" data-ko="경매 영문판">Auction EN</th><th class="num wide">PSA 10</th></tr></thead>
        <tbody>
          ${tr}
        </tbody>
      </table>
      <!-- CARD-LIST:END -->
${foot({ chart: false, affiliate: false })}`;
  return html;
}

// ── 한국어 페이지 — 같은 사실(숫자는 USD 그대로, 환산하지 않는다)
function pageKo(p, rows, nameEn, nameKo, src, box, links) {
  const code = p.code, n = p.counts;
  const canonical = `${SITE}/${CL.koPath(code)}`;
  const enUrl = `${SITE}/${CL.pagePath(code)}`;
  const label = `${code} ${nameKo || ""}`.trim();
  const h1 = `${label} — 카드 리스트`;
  const titleFull = `${label} 카드 리스트 (${n.cards}장) | opboxindex`;
  const title = titleFull.length <= 40 ? titleFull : `${label} 카드 리스트 (${n.cards}장)`;
  const descFull = `${label} 공식 카드 리스트 ${n.cards}장(카드 번호 ${n.numbers}종) — 번호·레어도·종류·색·코스트·파워와 확인된 시세.`;
  const desc = descFull.length <= 80 ? descFull : `${code} 공식 카드 리스트 ${n.cards}장 — 번호·레어도·종류·색·코스트·파워.`;
  const crumb = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "OP Box Index", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: "한국어 시세", item: `${SITE}/ko/` },
    { "@type": "ListItem", position: 3, name: `${code} 카드 리스트`, item: canonical },
  ] });
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "CollectionPage", name: h1, url: canonical, inLanguage: "ko", dateModified: pageDate(code), isBasedOn: src.jp.url,
    isPartOf: { "@type": "WebSite", name: "OP Box Index", url: `${SITE}/` },
    mainEntity: { "@type": "ItemList", name: `${label} 공식 카드 리스트(일본판)`, numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${r.id} ${r.nameEn || r.nameJa}`, url: itemUrl(r, canonical) })) },
  });
  const enSrc = src.en.length ? src.en.map((e) => `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.code)}</a> 확인 <time datetime="${e.checked}">${e.checked}</time>`).join(" · ") : "—";
  const boxBit = (ed, lbl) => (box[ed] ? `${lbl} <b>${money(box[ed].usd)}</b> (${esc(box[ed].date)}, n=${box[ed].n})` : `${lbl} <b>—</b>`);
  const colorKo = (c) => String(c || "").split("/").map((x) => COLOR_KO[x] || x).join("/");
  const tr = rows.map((r) => {
    const kind = KIND_KO[r.kind];
    const name = r.nameEn ? `<b>${esc(r.nameEn)}</b>` : `<b lang="ja">${esc(r.nameJa)}</b>`;
    const nameCell = r.href ? `<a href="${esc(r.href)}">${name}</a>` : name;
    const ourBits = [r.nm ? `NM ${money(r.nm.usd)}` : "", r.auction ? `경매 일본판 ${paid(r.auction.usd)} (n=${r.auction.n})` : "", r.auctionEn ? `경매 영문판 ${paid(r.auctionEn.usd)} (n=${r.auctionEn.n})` : "", r.psa10 ? `PSA 10 ${money(r.psa10.usd)}` : ""].filter(Boolean);
    const psaKo = (o) => `${o.basis === "sold" ? "판매" : "경매"}${o.date ? " · " + o.date.slice(5) : ""} · n=${o.n}`;
    return `<tr id="${anchorOf(r.id)}" data-id="${esc(r.id)}"><td class="cn"><span class="cNo">${esc(r.id)}${kind ? ` · ${kind}` : ""}</span>${nameCell}${r.nameEn ? `<span class="ja" lang="ja">${esc(r.nameJa)}</span>` : ""}`
      + `<span class="sub">${esc([r.rarity, TYPE_KO[r.type] || r.type, colorKo(r.color), r.costKind === "life" ? `라이프 ${r.cost}` : `코스트 ${r.cost}`, shown(r.power) ? `파워 ${r.power}` : ""].filter(Boolean).join(" · "))}</span>`
      + `${ourBits.length ? `<span class="sub">${esc(ourBits.join(" · "))}</span>` : ""}</td>`
      + `<td class="wide">${esc(r.rarity)}</td><td class="wide">${esc(TYPE_KO[r.type] || r.type)}</td><td class="wide">${esc(colorKo(r.color))}</td>`
      + `<td class="num wide">${costShow(r, "라이프")}</td><td class="num wide">${dashOr(r.power)}</td>`
      + `<td class="num wide">${numCell(r.nm, nmSub)}</td><td class="num wide">${numCell(r.auction, aucSub, paid)}</td><td class="num wide">${numCell(r.auctionEn, aucSub, paid)}</td><td class="num wide">${numCell(r.psa10, psaKo)}</td></tr>`;
  }).join("\n          ");
  const slug = CL.slugOf(code);
  const linkBits = [
    links.koSet ? `<a href="${slug}.html">${code} 박스 시세</a>` : "",
    links.setPage ? `<a href="../sets/${slug}.html">${code} 세트 페이지(영문)</a>` : "",
    `<a href="../sets/${slug}-card-list.csv">CSV</a>`,
    `<a href="../sets/${slug}-card-list.json">JSON</a>`,
    // 영문판과 같은 묶음 — 전체 카드 리스트·전체 세트 가이드(2026-10-14 QA: ko 판에만 없었다)
    `<a href="../sets/index.html#card-lists">전체 카드 리스트</a>`,
    `<a href="../sets/index.html">전체 세트 가이드</a>`,
  ].filter(Boolean);
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="ko" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${enUrl}" />
    <link rel="alternate" hreflang="x-default" href="${enUrl}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${crumb}</script>
    <script type="application/ld+json">${ld}</script>
    <link rel="stylesheet" href="../styles.css?v=${CSS_VER}" />
    <meta name="theme-color" content="#0a0c10" />
    <style>
${CSS}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">본문으로 건너뛰기</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>부스터박스 리서치</small></span></a>
      ${navHtmlKo(CL.koPath(code), `/${CL.pagePath(code)}`)}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow"><a href="./" style="color:var(--muted);text-decoration:none">한국어 시세</a> · 공식 카드 리스트 · 일본판</p>
      <h1>${esc(h1)}</h1>
      <!-- CARD-LIST:START -->
      ${summaryTable(code, n, src.jp.checked, true)}
      <p class="clMeta">공식 목록(일본판): <a href="${esc(src.jp.url)}" target="_blank" rel="noopener noreferrer">반다이 카드 리스트</a> 확인 <time datetime="${src.jp.checked}">${src.jp.checked}</time><br />영문 이름: 반다이 영문 카드 리스트 ${enSrc}<br />${boxBit("jp", "일본판 박스 판매 중앙값")} · ${boxBit("en", "영문판 박스")}</p>
      <p class="clLinks">${linkBits.join("")}</p>
      ${extraSections(code, rows, n, true)}
      <h2 class="clH2" id="all-cards">전체 ${n.cards}장</h2>
      <p class="clLegend">기본 = 접미어 없는 공식 카드 ID · 패러렐 = _p 로 끝나는 ID · 재수록 = _r 로 끝나는 ID · SP = 레어도 SP CARD · TR = 레어도 TR · 리더 = 기본 인쇄 리더 카드<br />금액 = 달러(USD) · NM = 일본판 미개봉급 낱장 소매 호가, 엔 → 달러(MM-DD = 관측일) · 경매 일본판/영문판 = 그 카드의 일본판/영문판 인쇄·미감정 낙찰가 중앙값, ${esc(AUCTION_DAY || "—")}까지 45일(n = 낙찰 수) · PSA 10 = 판매 완료 중앙값(n ≥ ${MIN_N}) · — = 규칙에 맞는 값 없음 · 데이터 ${esc(pageDate(code))}</p>
      <table class="clTable text">
        <thead><tr><th>카드</th><th class="wide">레어도</th><th class="wide">종류</th><th class="wide">색</th><th class="num wide">코스트/라이프</th><th class="num wide">파워</th><th class="num wide">NM</th><th class="num wide">경매 일본판</th><th class="num wide">경매 영문판</th><th class="num wide">PSA 10</th></tr></thead>
        <tbody>
          ${tr}
        </tbody>
      </table>
      <!-- CARD-LIST:END -->
    </main>
    <footer class="footer">
      <p>OP Box Index는 투자 권유가 아닌 데이터 기반 리서치 사이트입니다.</p>
      <nav aria-label="정책 안내"><a href="../about.html">About</a><a href="../methodology.html">Methodology</a><a href="../privacy.html">Privacy</a><a href="../disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
}

// ── 기계 판독 파일
const CSV_COLS = ["set", "id", "number", "print", "rarity", "type", "name_en", "name_ja", "color", "cost", "cost_kind", "power", "counter", "attribute", "features", "trigger",
  "nm_usd", "nm_date", "auction_jp_median_usd", "auction_jp_sold_n", "auction_en_median_usd", "auction_en_sold_n", "psa10_usd", "psa10_n", "psa10_basis", "psa10_date", "card_page", "source"];
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
function cardJson(r) {
  return {
    id: r.id, number: r.num, print: r.kind, rarity: r.rarity, type: r.type, nameEn: r.nameEn || null, nameJa: r.nameJa || null, color: r.color,
    cost: r.cost, costKind: r.costKind, power: r.power, counter: r.counter, attribute: r.attribute, features: r.feature || null, trigger: r.trigger,
    nm: r.nm ? { usd: r2(r.nm.usd), observedOn: r.nm.date } : null,
    auction: r.auction ? { print: "Japanese", medianUsd: r2(r.auction.usd), sold: r.auction.n, windowDays: 45, through: AUCTION_DAY || null } : null,
    auctionEnglishPrint: r.auctionEn ? { print: "English", medianUsd: r2(r.auctionEn.usd), sold: r.auctionEn.n, windowDays: 45, through: AUCTION_DAY || null } : null,
    psa10: r.psa10 ? { usd: r2(r.psa10.usd), n: r.psa10.n, basis: r.psa10.basis, observedOn: r.psa10.date } : null,
    cardPage: r.href ? `${SITE}/cards/${r.href.replace("../cards/", "")}` : null,
  };
}
function machineFiles(p, rows, nameEn, src, box) {
  const doc = {
    // updated = 페이지 날짜(pageDate — 화면 "Data"·CollectionPage dateModified 와 같은 값, 2026-10-15 4차). 종전 DATA_DATE(10-14)는
    // 파일 안 경매 through(10-15)보다 일렀고, free-data #card-lists Dataset(10-15)과도 달랐다.
    set: p.code, name: nameEn || null, edition: "Japanese", page: `${SITE}/${CL.pagePath(p.code)}`, updated: pageDate(p.code),
    officialList: { url: src.jp.url, checked: src.jp.checked, changed: src.jp.changed },
    englishNames: src.en.map((e) => ({ product: e.code, url: e.url, checked: e.checked })),
    counts: { cards: p.counts.cards, cardNumbers: p.counts.numbers, base: p.counts.base, parallel: p.counts.parallel, reprint: p.counts.reprint, sp: p.counts.sp, tr: p.counts.tr, leaders: p.counts.leaders },
    box: { japaneseSoldMedianUsd: box.jp ? box.jp.usd : null, japaneseObservedOn: box.jp ? box.jp.date : null, japaneseN: box.jp ? box.jp.n : null, englishSoldMedianUsd: box.en ? box.en.usd : null, englishObservedOn: box.en ? box.en.date : null, englishN: box.en ? box.en.n : null },
    notes: "Card facts (number, names, rarity, type, color, cost/life, power, counter, attribute, features, trigger) are from Bandai's official card lists linked above; effect text and images are not included. nm/auction/psa10 are OP Box Index observations attached only where the official card ID matches by rule (null otherwise): nm = Japanese raw near-mint retail ask in USD, auction / auctionEnglishPrint = median winning bid for the Japanese / English print of that card number and print type, ungraded, 45-day window (prints never combined), psa10 = median of completed sales (n >= 3). OP Box Index numbers: CC BY 4.0, attribute 'OP Box Index (opboxindex.com)'.",
    cards: rows.map(cardJson),
  };
  const csv = [CSV_COLS.join(",")].concat(rows.map((r) => {
    const j = cardJson(r);
    return [p.code, r.id, r.num, r.kind, r.rarity, r.type, r.nameEn, r.nameJa, r.color, r.cost, r.costKind, r.power, r.counter, r.attribute, r.feature, r.trigger ? "yes" : "no",
      j.nm ? j.nm.usd : "", j.nm ? j.nm.observedOn : "", j.auction ? j.auction.medianUsd : "", j.auction ? j.auction.sold : "", j.auctionEnglishPrint ? j.auctionEnglishPrint.medianUsd : "", j.auctionEnglishPrint ? j.auctionEnglishPrint.sold : "",
      j.psa10 ? j.psa10.usd : "", j.psa10 ? j.psa10.n : "", j.psa10 ? j.psa10.basis : "", j.psa10 ? j.psa10.observedOn || "" : "", j.cardPage || "", src.jp.url].map(csvCell).join(",");
  })).join("\n") + "\n";
  return { doc, csv };
}
// 사이트맵 lastmod 를 올릴지 — 확인일·데이터일을 뺀 내용이 직전 JSON 과 다를 때만.
const stableOf = (d) => JSON.stringify({ ...d, updated: null, officialList: { ...d.officialList, checked: null }, englishNames: (d.englishNames || []).map((e) => ({ ...e, checked: null })) });

function main() {
  const list = CL.products();
  const smEntriesEn = [], smEntriesKo = [], written = [];
  for (const p of list) {
    const code = p.code, slug = CL.slugOf(code);
    const nameEn = setNameEn(code);
    const nameKo = setNameKo(code, nameEn);
    const rows = rowsOf(p);
    const src = sources(code);
    const box = FL[code].box;
    const links = {
      setPage: fs.existsSync(path.join(ROOT, "sets", `${slug}.html`)),
      english: fs.existsSync(path.join(ROOT, "sets", `${slug}-english.html`)),
      koSet: fs.existsSync(path.join(ROOT, "ko", `${slug}.html`)),
    };
    const { doc, csv } = machineFiles(p, rows, nameEn, src, box);
    const jsonFile = path.join(ROOT, CL.jsonPath(code));
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(jsonFile, "utf8")); } catch { /* 첫 생성 */ }
    const changed = !prev || stableOf(prev) !== stableOf(doc);
    fs.writeFileSync(path.join(ROOT, CL.pagePath(code)), pageEn(p, rows, nameEn, src, box, links), "utf8");
    fs.writeFileSync(path.join(ROOT, CL.koPath(code)), pageKo(p, rows, nameEn, nameKo, src, box, links), "utf8");
    fs.writeFileSync(jsonFile, JSON.stringify(doc, null, 1) + "\n", "utf8");
    fs.writeFileSync(path.join(ROOT, CL.csvPath(code)), csv, "utf8");
    smEntriesEn.push({ loc: `${SITE}/${CL.pagePath(code)}`, changed });
    smEntriesKo.push({ loc: `${SITE}/${CL.koPath(code)}`, changed });
    written.push({ code, rows: rows.length, numbers: rows.filter((r) => r.nm || r.auction || r.auctionEn || r.psa10).length });
  }
  const sm = path.join(ROOT, "sitemap.xml");
  const a = addUrls(sm, smEntriesEn, { priority: "0.7" });
  const b = addUrls(sm, smEntriesKo, { priority: "0.5" });
  console.log(JSON.stringify({ pages: written.length, rowsTotal: written.reduce((s, w) => s + w.rows, 0), rowsWithOurNumbers: written.reduce((s, w) => s + w.numbers, 0), sitemapAdded: a.added + b.added, sitemapBumped: a.bumped + b.bumped, sets: written.map((w) => `${w.code}:${w.rows}/${w.numbers}`) }));
}

module.exports = { rowsOf };   // ruleKey·KEY_OF 는 사실 빌더(cardListNumbers)로 옮겼다 — 2026-10-15
if (require.main === module) main();
