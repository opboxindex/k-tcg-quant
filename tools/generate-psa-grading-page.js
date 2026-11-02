#!/usr/bin/env node
// 등급 인구 페이지 생성 — 2026-07-27 신설, 2026-09-15 재설계(소유자 지시).
//
// 무엇: 추적 22개 세트가 PSA·CGC·TAG 홀더에 몇 장 들어가 있는지, 일본판/영문판을 나눠 한 페이지에 모은다.
//   경매 페이지 문법(숫자 카드 · 세트별 누적 막대 · 박스 이미지 표), 설명문·FAQ 없음, 모바일은 표 4열.
//   9/15 이전엔 PSA 한 회사 + 보고서식 산문 + 카드별 3사 표였다 — 소유자: "이미지 없이 카드명만 있으면 못 읽는다, 다른 그레이딩도 같이 보여줘라".
//
// 데이터(2026-10-15, F4): 세트 행은 사실 파일 data/derived/site-facts.json(tools/build-site-facts.js gradingPageRows) 에서 읽는다 —
//        sets[code].gradingPage = 판(jp/en) × 등급사(psa/cgc/tag) {total, gem, add, from, to}. 원천은 data/grading-series.json(세트×판×회사 누적 시계열),
//        packs 의 psaFull / psaFullEn(최신 PSA 총량·젬 수 — 시계열보다 새롭다), data/psa-edition-weekly.json(PSA 주간 증감, 비교 창 = F.psaEditionWeeks).
//        여기서는 페이지 합계(K)·정렬·그리기만 한다. 원장 직접 읽기 없음(박스 이미지 파일 존재 확인만).
// 합산 금지: 일본판+영문판을 더하면 어느 쪽도 설명하지 못하는 값이 된다. 같은 판 안에서 회사별 합계는 낸다(누적 막대).
// 이미지: 세트 박스(/card-img/box/*.webp) 자체 호스팅만.
// Run: node tools/generate-psa-grading-page.js
const fs = require("node:fs");
const path = require("node:path");
const { navHtml } = require("./site-nav");
const { KF_CSS_ANY, kfTableAny } = require("./set-page-shared");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "psa-grading.html");
const F = require("./build-site-facts").load();
const ver = (fs.readFileSync(path.join(ROOT, "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1];

if (!F.psaEditionWeeks) { console.error("주간 비교에 두 점이 필요 — 페이지 미생성"); process.exit(1); }
const { prev: wPrev, now: wNow } = F.psaEditionWeeks;
const n = (v) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const sn = (v) => (v == null ? "—" : (v >= 0 ? "+" : "−") + Math.abs(Math.round(v)).toLocaleString("en-US"));
const pct = (a, b) => (a != null && b ? (a / b * 100).toFixed(1) + "%" : "—");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GR = ["psa", "cgc", "tag"];
const GRN = { psa: "PSA", cgc: "CGC", tag: "TAG" };
// 최상위 등급의 정의가 회사마다 다르다 — 하나로 뭉뚱그리지 않는다. CGC 는 세트 단위 등급 분포를 수집하지 않아 비율이 없다.
const TOP = { psa: "PSA 10", cgc: "Pristine 10 + Gem Mint 10", tag: "10 + 10P" };

// 세트 행 — 사실 파일 sets[code].gradingPage(PSA 는 최신 전체 스냅샷, 주간 증감은 판별 원장의 마지막 두 주). 박스 이미지는 파일이 있을 때만.
const rows = F.order.all.map((code) => {
  const set = F.sets[code];
  const box = set.box && fs.existsSync(path.join(ROOT, set.box.replace(/^\//, ""))) ? set.box.replace(/^\//, "") : null;
  return { code, name: set.nameEn || code, box, jp: set.gradingPage.jp, en: set.gradingPage.en };
});
const tot = (r, e) => GR.reduce((t, k) => t + ((r[e][k] && r[e][k].total) || 0), 0);
rows.sort((a, b) => (tot(b, "jp") + tot(b, "en")) - (tot(a, "jp") + tot(a, "en")));
const sumBy = (e, k, f) => rows.reduce((t, r) => t + ((r[e][k] && r[e][k][f]) || 0), 0);
const K = {};
for (const e of ["jp", "en"]) for (const k of GR) K[e + k] = { total: sumBy(e, k, "total"), add: sumBy(e, k, "add"), gem: sumBy(e, k, "gem") };
const win = (k, e) => { const r = rows.find((x) => x[e][k] && x[e][k].from); return r ? `${r[e][k].from.slice(5)} → ${r[e][k].to.slice(5)}` : ""; };
// Dataset 기간·수정일 = 배포 파일(등급 CSV·JSON)의 관측일 범위 — free-data 의 같은 Dataset 과 한 함수(tools/dataset-coverage.js, 2026-10-14 QA).
// 이 Dataset 은 CSV·JSON 두 파일을 내려주므로 기간 = 두 파일 기간의 합(첫날~마지막 날), 수정일 = 둘 중 늦은 날 — 2026-10-15(3차).
// 종전엔 CSV 날짜만 써서 같이 내려주는 opbox-ai-grading.json(datasetUpdatedOn 10-15, 10-15 행)보다 하루 이른 10-14 였다.
const GRADE_SPAN = (() => {
  const DC = require("./dataset-coverage");
  const csv = DC.gradingSpan();   // 사실 파일 coverage.grading
  const json = DC.extraSpan("opbox-ai-grading.json");
  const sp = DC.span([csv && csv.from, csv && csv.to, json && json.from, json && json.to]);
  return sp && { ...sp, to: DC.latestDate(sp.to, json && json.modified) };
})();
const updated = rows.flatMap((r) => ["jp", "en"].flatMap((e) => GR.map((k) => (r[e][k] && r[e][k].to) || ""))).sort().pop() || wNow;

// ── 세트별 누적 막대(회사별 색), 일본판·영문판 두 줄, 같은 눈금
const maxTot = Math.max(...rows.flatMap((r) => [tot(r, "jp"), tot(r, "en")]), 1);
const stack = (r, e) => {
  const T = tot(r, e);
  if (!T) return `<span class="sLine"><i class="edTag">${e.toUpperCase()}</i><span class="sTrack"><span class="sNa">no data yet</span></span></span>`;
  const segs = GR.map((k) => { const v = (r[e][k] && r[e][k].total) || 0; return v ? `<span class="seg ${k}" style="width:${(v / maxTot * 100).toFixed(2)}%" title="${GRN[k]} ${n(v)}"></span>` : ""; }).join("");
  return `<span class="sLine"><i class="edTag">${e.toUpperCase()}</i><span class="sTrack">${segs}</span><span class="sVal">${n(T)}</span></span>`;
};
const { variant } = require("./image-variants");
const boxThumb = (b) => (variant(b, "thumb") || { src: b }).src;   // 36~44px 칸에 670px 원본(50KB)을 쓰던 것 → 220px 썸네일(2026-10-08)
const setName = (r) => `<span class="tName">${r.box ? `<img src="${esc(boxThumb(r.box))}" alt="" width="36" height="36" loading="lazy" decoding="async" />` : ""}<span><b>${esc(r.code)}</b> <small>${esc(r.name)}</small></span></span>`;
const stackRows = rows.slice(0, 12).map((r) => `<div class="sRow">${setName(r)}<span class="sBars">${stack(r, "jp")}${stack(r, "en")}</span></div>`).join("\n");

// ── 표: 세트 × (PSA·CGC·TAG) × (JP·EN). 모바일은 EN 열을 숨기고 JP 셀 밑에 EN 값을 작게 둔다.
const cellG = (r, k) => {
  const j = r.jp[k], e = r.en[k];
  const gemLine = (x) => (x && x.gem != null && x.total ? `<small class="gem">${pct(x.gem, x.total)} top</small>` : "");
  return `<td class="num ${k}">${j ? n(j.total) : "—"}${j && j.add != null ? `<small>${sn(j.add)}</small>` : ""}${gemLine(j)}<small class="mOnly">EN ${e ? n(e.total) : "—"}</small></td>` +
    `<td class="num ${k} hideM en">${e ? n(e.total) : "—"}${e && e.add != null ? `<small>${sn(e.add)}</small>` : ""}${gemLine(e)}</td>`;
};
const setCell = (r, size) => `<td class="l setCell"><a href="sets/${r.code.toLowerCase()}.html">${r.box ? `<img src="${esc(boxThumb(r.box))}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" />` : `<span class="noImg" aria-hidden="true"></span>`}<span><b>${esc(r.code)}</b><small>${esc(r.name)}</small></span></a></td>`;
const tr = (r) => `<tr>${setCell(r, 44)}${GR.map((k) => cellG(r, k)).join("")}</tr>`;
const foot = `<tr><td class="l"><b>All ${rows.length} sets</b></td>${GR.map((k) => `<td class="num ${k}">${n(K["jp" + k].total)}<small>${sn(K["jp" + k].add)}</small>${K["jp" + k].gem ? `<small class="gem">${pct(K["jp" + k].gem, K["jp" + k].total)} top</small>` : ""}<small class="mOnly">EN ${n(K["en" + k].total)}</small></td><td class="num ${k} hideM en">${n(K["en" + k].total)}<small>${sn(K["en" + k].add)}</small>${K["en" + k].gem ? `<small class="gem">${pct(K["en" + k].gem, K["en" + k].total)} top</small>` : ""}</td>`).join("")}</tr>`;

// ── 최근 증가 상위 10(일본판, PSA 주간 증가 기준 정렬)
const byAdd = [...rows].filter((r) => r.jp.psa && r.jp.psa.add != null).sort((a, b) => b.jp.psa.add - a.jp.psa.add).slice(0, 10);
const addTr = (r) => `<tr>${setCell(r, 36)}${GR.map((k) => `<td class="num ${k}">${r.jp[k] && r.jp[k].add != null ? sn(r.jp[k].add) : "—"}</td>`).join("")}</tr>`;

const TITLE = "One Piece PSA Population Report by Set (PSA, CGC, TAG)"; // 60자 이내. 실제 유입 검색어 "psa population" 에 맞춤(2026-09-22, GSC 노출 1위)
const DESC = `One Piece PSA population report by set — PSA, CGC and TAG counts, Japanese and English separate, weekly change. ${rows.length} sets, updated ${updated}.`; // 155자 이내(2026-09-22)
if (DESC.length > 155) throw new Error(`psa-grading description ${DESC.length} > 155`);
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="https://opboxindex.com/psa-grading.html" />
    <link rel="alternate" hreflang="en" href="https://opboxindex.com/psa-grading.html" />
    <link rel="alternate" hreflang="ko" href="https://opboxindex.com/ko/grading.html" />
    <link rel="alternate" hreflang="x-default" href="https://opboxindex.com/psa-grading.html" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#0a0c10" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <title>${TITLE}</title>
    <meta name="description" content="${esc(DESC)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${esc(DESC)}" />
    <meta property="og:url" content="https://opboxindex.com/psa-grading.html" />
    <meta property="og:image" content="https://opboxindex.com/og-image.png" />
    <meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Dataset", name: "One Piece grading population by set (PSA, CGC, TAG; Japanese and English)", description: DESC, isAccessibleForFree: true, url: "https://opboxindex.com/psa-grading.html", license: "https://creativecommons.org/licenses/by/4.0/", distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: "https://opboxindex.com/opbox-grading-population.csv" }, { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://opboxindex.com/opbox-ai-grading.json" }], creator: { "@type": "Organization", name: "OP Box Index", url: "https://opboxindex.com/" }, temporalCoverage: GRADE_SPAN ? GRADE_SPAN.coverage : `${wPrev}/${updated}`, dateModified: GRADE_SPAN ? GRADE_SPAN.to : updated, variableMeasured: ["Cards graded by PSA", "Cards graded by CGC", "Cards graded by TAG", "PSA 10 share", "TAG 10 and 10P share", "Change since previous report"] })}</script>
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "OP Box Index", item: "https://opboxindex.com/" }, { "@type": "ListItem", position: 2, name: "Grading population", item: "https://opboxindex.com/psa-grading.html" }] })}</script>
    <link rel="stylesheet" href="styles.css?v=${ver}" />
    <script defer src="lang-toggle.js?v=${ver}"></script>
    <style>
      .pgWrap { max-width: 980px; margin: 0 auto; padding: 20px clamp(14px,3vw,28px) 44px; }
      .pgWrap h1 { margin: 6px 0; font-size: clamp(23px,4vw,32px); line-height: 1.2; }
      .pgWrap .lead { color: var(--muted); font-size: 15px; line-height: 1.6; margin: 6px 0 0; }
      .pgWrap h2 { font-size: 19px; margin: 0 0 2px; }
      .psa { --g: var(--blue); } .cgc { --g: var(--gold); } .tag { --g: #a98bff; }
      .statRow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 18px 0 6px; }
      .stat { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.02); }
      .stat .k { display: block; font-size: 12.5px; font-weight: 600; color: var(--g); }
      .stat b { display: block; font-size: clamp(22px,4vw,30px); font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; margin-top: 4px; }
      .stat span.s { display: block; font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.45; font-variant-numeric: tabular-nums; }
      .stat span.s em { font-style: normal; color: var(--g); font-weight: 700; }
      .chartCard { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 12px; margin: 18px 0; background: rgba(255,255,255,.015); }
      .chartHead { margin-bottom: 8px; }
      .chartHead .sub { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
      .legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 8px 0 4px; font-size: 12px; color: var(--muted); }
      .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--g); margin-right: 6px; vertical-align: -1px; }
      .sList { margin: 6px 0 2px; }
      .sRow { display: grid; grid-template-columns: minmax(170px, 1fr) 3fr; gap: 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
      .tName { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .tName img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex: 0 0 36px; background: rgba(255,255,255,.06); }
      .tName b { font-weight: 700; } .tName small { color: var(--muted); display: block; font-size: 11px; }
      .sBars { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .sLine { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .edTag { font-style: normal; font-size: 11px; font-weight: 800; letter-spacing: .04em; color: var(--muted); width: 22px; flex: 0 0 22px; }
      .sTrack { flex: 1 1 auto; position: relative; height: 16px; border-radius: 4px; background: rgba(255,255,255,.05); overflow: hidden; display: flex; }
      .seg { display: block; height: 100%; background: var(--g); }
      .sNa { position: absolute; left: 6px; top: 0; line-height: 16px; font-size: 11px; color: var(--muted); }
      .sVal { flex: 0 0 auto; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; font-size: 12.5px; }
      .tblWrap { overflow-x: auto; }
      .aTable { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 6px 0; }
      .aTable th { text-align: right; padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-weight: 600; font-size: 12.5px; font-weight: 600; letter-spacing: .04em; white-space: nowrap; }
      .aTable th.l, .aTable td.l { text-align: left; }
      .aTable th.psa, .aTable th.cgc, .aTable th.tag { color: var(--g); }
      .aTable th.en, .aTable td.en { border-left: 1px solid rgba(255,255,255,.06); }
      .aTable th.en { font-weight: 500; }
      .aTable td { padding: 7px 10px; border-bottom: 1px solid rgba(255,255,255,.05); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; vertical-align: middle; }
      .aTable td.num { font-weight: 800; font-size: 14px; color: var(--g); }
      .aTable td.num.en { color: var(--ink); opacity: .9; }
      .aTable td small { display: block; color: var(--muted); font-weight: 400; font-size: 11px; }
      .aTable td .mOnly { display: none; }
      .aTable tfoot td { border-top: 1px solid var(--line); border-bottom: 0; }
      .setCell a { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; min-width: 180px; }
      .setCell a:hover b { color: var(--accent); }
      .setCell img, .setCell .noImg { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.06); flex: 0 0 44px; }
      .setCell b { display: block; font-size: 13.5px; line-height: 1.2; }
      .setCell small { display: block; color: var(--muted); font-size: 11px; margin: 2px 0 0; white-space: normal; }
      @media (max-width: 640px) {
        .statRow { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .stat { padding: 10px 8px; } .stat b { font-size: 17px; } .stat .k { font-size: 12px; } .stat span.s { font-size: 11.5px; }
        .chartCard { padding: 12px 12px 8px; border-radius: 12px; }
        .sRow { grid-template-columns: 1fr; gap: 4px; padding: 8px 0; }
        .sVal { min-width: 56px; }
        .aTable { font-size: 12.5px; table-layout: fixed; }
        .aTable th, .aTable td { padding: 6px 4px; }
        .aTable th { font-size: 11.5px; letter-spacing: 0; white-space: normal; overflow-wrap: anywhere; }
        .aTable .hideM { display: none; }
        .aTable th.numH { width: 66px; }
        .aTable td.num { font-size: 12.5px; white-space: normal; }
        .aTable td .mOnly { display: block; color: var(--muted); font-weight: 400; font-size: 11.5px; }
        .aTable td small.gem { display: none; }
        .aTable td.l { white-space: normal; overflow-wrap: anywhere; }
        .setCell a { min-width: 0; gap: 8px; }
        .setCell img, .setCell .noImg { width: 34px; height: 34px; flex-basis: 34px; }
        .setCell span:not(.noImg) { min-width: 0; }
      }
${KF_CSS_ANY}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="./"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("", "psa-grading.html")}
    </header>
    <main id="main-content" class="pgWrap">
      <p class="eyebrow">Grading population · PSA · CGC · TAG · updated ${esc(updated)}</p>
      <h1>One Piece PSA population report by set</h1>
      ${/* Key facts(2026-10-16) — 구글 'psa population'(3개월 13노출·68위)이 닿는 페이지: 전체 PSA 등급 합계·증감 창·PSA 10 비율·기준일을 H1 바로 아래 표로.
            값은 아래 statRow 의 K(세트 행 합계)와 같다(한 사실 한 값). */ ""}
      ${kfTableAny([
        ["psajp", "PSA graded · Japanese", "PSA 등급 · 일본판", `<b>${n(K.jppsa.total)}</b> <small>${sn(K.jppsa.add)} ${esc(win("psa", "jp"))}${K.jppsa.gem ? ` · ${pct(K.jppsa.gem, K.jppsa.total)} PSA 10` : ""}</small>`],
        ["psaen", "PSA graded · English", "PSA 등급 · 영문판", `<b>${n(K.enpsa.total)}</b> <small>${sn(K.enpsa.add)} ${esc(win("psa", "en"))}${K.enpsa.gem ? ` · ${pct(K.enpsa.gem, K.enpsa.total)} PSA 10` : ""}</small>`],
        ["cgc", "CGC graded · JP / EN", "CGC 등급 · 일본판 / 영문판", `<b>${n(K.jpcgc.total)}</b> / <b>${n(K.encgc.total)}</b>`],
        ["tag", "TAG graded · JP / EN", "TAG 등급 · 일본판 / 영문판", `<b>${n(K.jptag.total)}</b> / <b>${n(K.entag.total)}</b>`],
        ["sets", "Sets covered", "세트 수", `<b>${rows.length}</b>`],
        ["updated", "Updated", "기준일", `<time datetime="${esc(updated)}">${esc(updated)}</time>`],
      ], { label: "Grading population key facts", caption: `<span data-ko="원피스 세트별 PSA 등급 수">One Piece PSA population by set</span> · <time datetime="${esc(updated)}">${esc(updated)}</time>` })}
      <p class="lead">Cards in PSA, CGC and TAG holders per booster set · Japanese and English printings kept separate · change = new grades since each company's previous report</p>

      <div class="statRow">
${GR.map((k) => `        <div class="stat ${k}"><span class="k">${GRN[k]} · Japanese</span><b>${n(K["jp" + k].total)}</b><span class="s"><em>${sn(K["jp" + k].add)}</em> ${esc(win(k, "jp"))}${K["jp" + k].gem ? ` · ${pct(K["jp" + k].gem, K["jp" + k].total)} ${TOP[k]}` : ""}</span></div>`).join("\n")}
${GR.map((k) => `        <div class="stat ${k}"><span class="k">${GRN[k]} · English</span><b>${n(K["en" + k].total)}</b><span class="s"><em>${sn(K["en" + k].add)}</em> ${esc(win(k, "en"))}${K["en" + k].gem ? ` · ${pct(K["en" + k].gem, K["en" + k].total)} ${TOP[k]}` : ""}</span></div>`).join("\n")}
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>Most graded sets</h2><p class="sub">Cards in holders · top 12 sets · one bar per printing, same scale · colour = grading company</p></div>
        <div class="legend">${GR.map((k) => `<span class="${k}"><i></i>${GRN[k]}</span>`).join("")}</div>
        <div class="sList">
${stackRows}
        </div>
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>New grades since last report · Japanese printing</h2><p class="sub">PSA ${esc(win("psa", "jp"))} · CGC ${esc(win("cgc", "jp"))} · TAG ${esc(win("tag", "jp"))} · top 10 sets by PSA</p></div>
        <div class="tblWrap"><table class="aTable">
          <caption class="sr-only">New grades since each company's previous report, Japanese printing, top 10 sets</caption>
          <thead><tr><th class="l">Set</th><th class="psa numH">PSA</th><th class="cgc numH">CGC</th><th class="tag numH">TAG</th></tr></thead>
          <tbody>
${byAdd.map(addTr).join("\n")}
          </tbody>
        </table></div>
      </div>

      <div class="chartCard">
        <div class="chartHead"><h2>All ${rows.length} sets · PSA · CGC · TAG</h2><p class="sub">Cards in holders · change since last report · top-grade share (PSA 10 · TAG 10 + 10P) · JP and EN side by side</p></div>
        <div class="tblWrap"><table class="aTable">
          <caption class="sr-only">Graded population per set at PSA, CGC and TAG, Japanese and English printings</caption>
          <thead><tr><th class="l">Set</th><th class="psa numH">PSA JP</th><th class="psa en hideM">PSA EN</th><th class="cgc numH">CGC JP</th><th class="cgc en hideM">CGC EN</th><th class="tag numH">TAG JP</th><th class="tag en hideM">TAG EN</th></tr></thead>
          <tbody>
${rows.map(tr).join("\n")}
          </tbody>
          <tfoot>${foot}</tfoot>
        </table></div>
      </div>
    </main>
    <footer class="footer">
      <p>OP Box Index is a data-driven research site, not investment advice.</p>
      <nav aria-label="Footer navigation"><a href="about.html">About</a><a href="methodology.html">Methodology</a><a href="free-data.html">Free data (CSV)</a><a href="privacy.html">Privacy</a><a href="disclaimer.html">Disclaimer</a></nav>
    </footer>
  </body>
</html>
`;
fs.writeFileSync(OUT, html, "utf8");
console.log(JSON.stringify({ page: "psa-grading.html", sets: rows.length, updated, jpPsa: K.jppsa.total, jpCgc: K.jpcgc.total, jpTag: K.jptag.total, enPsa: K.enpsa.total, enCgc: K.encgc.total, enTag: K.entag.total, bytes: html.length }));
