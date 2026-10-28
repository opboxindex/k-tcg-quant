"use strict";
// SEO 태그·구조화데이터·링크·날짜 규칙 — 사실 파일이 보장하지 못하는 페이지 구조. 2026-10-15 분할.
//  C1/C2 홈 변형 링크 금지·canonical 자기 일치 [2026-07-08 canonical 스왑: 홈 노출 0] · N1 메인 네비 전 링크 · H1 hreflang 정합 [2026-07-19]
//  L1 JSON-LD 파싱 · L2 숨긴 FAQ 금지 · L3 세트 페이지 FAQPage/카드리스트 CollectionPage [2026-07-22 CI 만 실패] · I1 외부 이미지 핫링크 금지 · I2 cards/ 이미지 경로 [2026-07-21]
//  R1 홈 정적 본문 하한 [2026-08-28 홈 노출 급감] · S2 robots AI/검색 접근 · F1 필수 파일 · T1 데이터 신선도
//  U1/U2/CL2 수정일 ≥ 화면 날짜 [2026-09-30·감사 #4] · DS1 Dataset 수정일 ≥ 기간 끝, free-data Dataset = 내려주는 파일 [감사 #4·3차]
//  SE1 제목·설명 길이·Dataset 필수 필드·Article image·Breadcrumb [2026-10-14 W6] · PL1 Product 가격은 화면에 [감사 #6] · PO1 카드 Product offers 꼴 [감사 #5]
//  S3 세트 페이지 템플릿 껍데기 금지 [2026-08-07 애드센스 거절] · KF1(구조) Key facts 표 위치·월 단위 날짜 금지 [2026-10-14 W5a] · MD1/KO5(꼴) 설명문 꼴·길이·고유 [2026-10-15]
//  RD1(구조) ItemList 에 Product 금지 [2026-10-14 QA] · AD1 글 날짜 = sync-article-dates 규칙 [2026-10-14 W3] · UP1(구조) 발매 전 페이지 바이라인 순서 [2026-10-14 W3]
const { errors, read, exists, list, PUBLIC_HTML, ISO, money, unH, ldOf, ldFlat, shownText, descOf, strip, json, packs, facts } = require("./lib");
const { KO_LABELS } = require("../site-nav");

const checks = ["C1", "C2", "N1", "H1", "L1", "L2", "L3", "I1", "I2", "R1", "S2", "F1", "T1", "U1", "U2", "CL2", "DS1", "SE1", "FQ2", "PL1", "PO1", "S3", "KF1", "KF2", "KF3", "MD1", "KO5", "RD1", "AD1", "UP1"];
const SITE = "https://opboxindex.com";
const toRel = (u) => { let p; try { p = new URL(u, SITE + "/").pathname; } catch { return null; } return p === "/" ? "index.html" : decodeURIComponent(p.slice(1)) + (p.endsWith("/") ? "index.html" : ""); };
const noindex = (h) => /name="robots" content="[^"]*noindex/i.test(h);

function run() {
  const F = facts();
  const setPages = PUBLIC_HTML.filter((p) => /^sets\/(?:op|eb|prb)-\d+(?:-english)?\.html$/.test(p) && !(F.upcoming[p.slice(5, -5).toUpperCase()]));
  // 발매 전 세트의 한국어판(ko/op-18·eb-05, 2026-10-16)은 영문 짝과 같이 세트 페이지 검사(KF1·MD1/KO5·U2)에서 뺀다 — 시세 표가 없는 발매일·예약판매 페이지다.
  const koSetPages = PUBLIC_HTML.filter((p) => /^ko\/(?:op|eb|prb)-\d+\.html$/.test(p) && !(F.upcoming[p.slice(3, -5).toUpperCase()]));
  const cardPages = PUBLIC_HTML.filter((p) => /^cards\/(?!index\.html$)[^/]+\.html$/.test(p));
  const declared = new Map();
  for (const f of PUBLIC_HTML) {
    const html = read(f);
    if (html.includes("packs.html?hl=")) errors.push(`C1: ${f} 에 packs.html?hl= 홈 변형 링크 잔존 (홈은 / 로만 링크)`);
    // C2 — 리다이렉트 스텁(noindex + refresh + canonical=목적지)만 예외(cards/eb02-061 정정, 2026-08-26)
    const can = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
    if (can) {
      const refresh = html.match(/http-equiv="refresh" content="\d+;\s*url=([^"]+)"/i);
      if (refresh && noindex(html)) { if (can !== new URL(refresh[1], SITE + "/").href) errors.push(`C2: ${f} 리다이렉트 스텁의 canonical(${can})과 refresh 목적지가 다르다`); }
      else {
        const expected = f === "index.html" || f === "packs.html" ? `${SITE}/` : `${SITE}/${f}`;
        const alt = f.endsWith("/index.html") ? `${SITE}/${f.replace(/index\.html$/, "")}` : null;
        if (can !== expected && can !== alt) errors.push(`C2: ${f} canonical=${can} (기대: ${expected})`);
      }
    }
    // N1 — 메뉴 라벨은 tools/site-nav.js 한 곳(data-ko 또는 한국어 본문 텍스트)
    const nav = (html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/) || [])[1];
    if (nav) { const t = nav.replace(/<[^>]+>/g, " "); for (const label of KO_LABELS) if (!nav.includes(`data-ko="${label}"`) && !t.includes(label)) errors.push(`N1: ${f} 메인 네비에 "${label}" 링크 누락 (전부 필요)`); }
    // H1 — hreflang: ?hl= 금지, 실파일, ko↔en 상호확인(상대가 미선언이면 단방향 = 구글이 무시, 2026-07-21)
    if (!can || toRel(can) === f || toRel(can) === null) {
      const map = {};
      for (const m of html.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)"/g)) {
        if (/[?&]hl=/.test(m[2])) errors.push(`H1: ${f} hreflang ${m[1]} 이 파라미터 변형을 가리킴 (${m[2]})`);
        const rel = toRel(m[2]);
        if (rel && !exists(rel)) errors.push(`H1: ${f} hreflang ${m[1]} 타겟 파일 없음 (${m[2]})`);
        map[m[1]] = m[2];
      }
      if (Object.keys(map).length) declared.set(f, map);
    }
    // L1 · L2 · L3
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch (e) { errors.push(`L1: ${f} JSON-LD 파싱 실패 (${e.message.slice(0, 60)})`); } }
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
    for (const faq of ldOf(html).filter((j) => j["@type"] === "FAQPage")) {
      for (const q of faq.mainEntity || []) { const probe = String(q.name || "").slice(0, 40); if (probe && !visible.includes(probe)) { errors.push(`L2: ${f} FAQPage 질문이 본문에 없음(숨긴 FAQ): "${probe}…"`); break; } }
    }
    if (f.startsWith("sets/") && f !== "sets/index.html") {
      if (/-card-list\.html$/.test(f)) { for (const t of ["CollectionPage", "ItemList", "BreadcrumbList"]) if (!new RegExp(`"@type"\\s*:\\s*"${t}"`).test(html)) errors.push(`L3: ${f} 에 ${t} 스키마 없음 (카드리스트 페이지 필수)`); }
      else if (!/"@type"\s*:\s*"FAQPage"/i.test(html)) errors.push(`L3: ${f} 에 FAQPage 스키마 없음 (세트 페이지 필수 — audit-seo 도 동일 검사)`);
    }
    // I1 · I2
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      if (/^https?:\/\//.test(m[1]) && !m[1].startsWith(SITE + "/")) errors.push(`I1: ${f} 외부 이미지 핫링크 (${m[1].slice(0, 60)}) — 자체 호스팅할 것`);
      if (f.startsWith("cards/") && m[1].startsWith("img/")) errors.push(`I2: ${f} 이미지 src="${m[1]}" 가 img/ 로 시작 — /cards/img/ 로 해석돼 404`);
    }
  }
  for (const [f, map] of declared) {
    for (const [lang, url] of Object.entries(map)) {
      const rel = toRel(url);
      if (lang === "x-default" || !rel || rel === f || !PUBLIC_HTML.includes(rel)) continue;
      const back = declared.get(rel);
      if (!(back && Object.values(back).some((u) => toRel(u) === f))) errors.push(`H1: ${f} → ${rel} (${lang}) 단방향 hreflang — 상대가 되가리키지 않음(미선언 포함)`);
    }
  }

  // R1 — 하한 5,800자(2026-08-28 "표만" 정리로 4,425자가 통과해 홈 노출 급감). 낮추지 말 것 — 줄이려면 <details> 로 접을 것.
  for (const f of ["index.html", "packs.html"].filter(exists)) {
    const text = read(f).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 5800) errors.push(`R1: ${f} JS 없는 본문이 ${text.length}자 — 5,800자 이상 필요(글을 지우지 말고 <details> 로 접을 것)`);
    if ((text.match(/\$[0-9][0-9,]{2,}/g) || []).length < 8) errors.push(`R1: ${f} JS 없는 본문의 가격 표기가 8개 미만 — 정적 시세표 누락 의심`);
  }
  // S2 — robots: 전면 차단은 훈련 전용 봇만, 답변/검색 봇 그룹 필수, /data/ 열려 있어야 한다(llms.txt 가 안내하는 경로)
  const robots = read("robots.txt");
  for (const g of robots.split(/\n\s*\n/)) {
    const ua = (g.match(/User-agent:\s*(\S+)/) || [])[1];
    if (ua && /^Disallow:\s*\/\s*$/m.test(g) && !["GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Bytespider", "Applebot-Extended", "Amazonbot"].includes(ua)) errors.push(`S2: robots.txt에서 ${ua} 전면 차단됨 — 훈련 전용 봇 외에는 금지`);
  }
  const blocks = robots.replace(/^\s*#.*$/gm, "").split(/\n\s*\n/);   // 전용 그룹이 있으면 * 를 무시하므로 각 봇 그룹 자체에 /data/ 차단이 없어야 한다
  for (const bot of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-User", "Claude-SearchBot", "GrokBot", "xAI-Crawler", "Google-Extended", "Googlebot", "Bingbot", "Yeti"]) {
    const blk = blocks.find((b) => new RegExp(`User-agent:\\s*${bot}\\s*$`, "m").test(b));
    if (!blk) { errors.push(`S2: robots.txt에 ${bot} 전용 그룹 없음 — * 상속으로 /data/ 가 막힘`); continue; }
    if ([...blk.matchAll(/Disallow:\s*(\S+)/g)].some((m) => m[1] === "/" || m[1].startsWith("/data"))) errors.push(`S2: ${bot} 가 /data/ 차단됨`);
  }
  if (!robots.includes("Sitemap: https://opboxindex.com/sitemap.xml")) errors.push("S2: robots.txt에 Sitemap 선언 누락");
  for (const f of ["index.html", "sets/op-16.html", "cards/index.html", "articles/index.html"]) if (noindex(read(f))) errors.push(`S2: ${f} 에 noindex — 검색/AI 노출 차단됨`);
  for (const f of ["googlee0d71bc0695b5651.html", "google1d76c313bd3d0b59.html", "naver933afc5e4330d8e58701ba45b0319b4a.html", "3d439f302e46fc08f76ddba4eee3726f.txt", "ads.txt", "robots.txt", "sitemap.xml", "llms.txt", "opbox-ai-data.json", "data/set-facts.json"]) if (!exists(f)) errors.push(`F1: 필수 파일 삭제됨: ${f}`);
  const upd = packs().updated;
  if (!upd) errors.push("T1: data.updated 없음");
  else { const days = Math.round((Date.now() - Date.parse(upd + "T00:00:00Z")) / 864e5); if (days > 4) errors.push(`T1: 데이터가 ${days}일 경과 (${upd}) — 야간 파이프라인 점검 필요`); }

  // U1/U2/CL2 — 수정일(dateModified)은 화면·설명문에 찍힌 가장 늦은 데이터 날짜 이상. 발매일 행(data-k="release")은 미래일 수 있는 사실이라 뺀다.
  const MON = Object.fromEntries(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].map((m, i) => [m, i + 1]));
  const dmOf = (html) => { const ld = ldOf(html); const n = ld.find((o) => /^(?:WebPage|Article|CollectionPage)$/.test(o["@type"]) && o.dateModified); return n ? n.dateModified : (html.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})/) || [])[1] || null; };
  const articles = ["compare.html", ...list("articles", /\.html$/).map((f) => "articles/" + f)];
  for (const f of articles) {
    const html = read(f), dm = dmOf(html);
    if (!dm) continue;
    const body = shownText(html);
    let latest = "";
    for (const m of body.matchAll(/\bas of (\d{4}-\d{2}-\d{2})/gi)) if (m[1] > latest) latest = m[1];
    for (const m of body.matchAll(/\bas of ([A-Z][a-z]+) (\d{1,2}), (\d{4})/gi)) { const mo = MON[m[1].toLowerCase()]; if (mo) { const d = `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`; if (d > latest) latest = d; } }
    if (latest > dm) errors.push(`U1: ${f} 본문은 "as of ${latest}" 인데 dateModified 가 ${dm} — 주입기가 수정일·Updated 도 같이 갱신해야 함`);
  }
  for (const f of [...setPages, ...koSetPages, ...cardPages, ...PUBLIC_HTML.filter((p) => /^(?:sets|ko)\/[^/]+-card-list\.html$/.test(p))]) {
    const html = read(f);
    if (noindex(html)) continue;
    const dm = dmOf(html), id = /-card-list\.html$/.test(f) ? "CL2" : "U2";
    if (!dm) { errors.push(`${id}: ${f} dateModified 가 없다`); continue; }
    const shown = shownText(html.replace(/<tr data-k="release">[\s\S]*?<\/tr>/, " ")) + " " + descOf(html);
    let latest = "";
    for (const m of shown.matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)) if (m[1] > latest) latest = m[1];
    if (latest > dm) errors.push(`${id}: ${f} 화면에 ${latest} 데이터가 있는데 dateModified 가 ${dm} — 수정일은 화면 날짜 중 가장 늦은 날 이상(사실 파일 pageDate)`);
  }
  // DS1 — Dataset 수정일 ≥ 기간 끝. free-data 의 Dataset 하나하나 = 그것이 내려주는 파일(JSON: datasetUpdatedOn·관측 행 최댓값, CSV: 날짜 최댓값).
  let dsN = 0;
  for (const f of PUBLIC_HTML) {
    const html = read(f);
    if (!html.includes('"Dataset"')) continue;
    for (const node of ldFlat(html).filter((x) => x["@type"] === "Dataset")) {
      dsN++;
      const dm = node.dateModified, end = String(node.temporalCoverage || "").split("/")[1] || "";
      if (!ISO.test(dm || "")) { errors.push(`DS1: ${f} Dataset "${node.name}" dateModified 가 없다`); continue; }
      if (ISO.test(end) && end > dm) errors.push(`DS1: ${f} Dataset "${node.name}" dateModified ${dm} < 기간 끝 ${end}`);
      if (f !== "free-data.html") continue;
      const files = [].concat(node.distribution || []).map((x) => String((x && x.contentUrl) || "").replace(SITE + "/", "")).filter((p) => p && exists(p));
      if (files.length === 1 && files[0].endsWith(".json")) {
        const doc = json(files[0], {});
        const rows = []; const walk = (o, k) => { if (Array.isArray(o)) o.forEach((v) => walk(v, k)); else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) walk(v, kk); else if (k === "observedOn" || k === "sampleCollectedOn" || k === "date") rows.push(o); };
        walk(doc, "");
        const want = rows.filter((d) => ISO.test(d || "")).sort().pop() || "";
        if (ISO.test(doc.datasetUpdatedOn || "") && dm !== doc.datasetUpdatedOn) errors.push(`DS1: free-data.html Dataset "${node.name}" dateModified ${dm} ≠ ${files[0]} datasetUpdatedOn ${doc.datasetUpdatedOn}`);
        if (want && end !== want) errors.push(`DS1: free-data.html Dataset "${node.name}" 기간 끝 ${end || "(없음)"} ≠ ${files[0]} 가장 늦은 관측 행 ${want}`);
      } else if (files.length === 1 && files[0].endsWith(".csv")) {
        const want = (read(files[0]).match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).sort().pop() || "";
        if (dm !== want || end !== want) errors.push(`DS1: free-data.html Dataset "${node.name}" dateModified ${dm} · 기간 끝 ${end || "(없음)"} ≠ ${files[0]} 가장 늦은 날짜 ${want}`);
      }
    }
  }
  if (!dsN) errors.push("DS1: Dataset 구조화데이터를 하나도 못 읽었다");

  // SE1 — 제목·설명 길이, Dataset 필수 필드, Article.image·BreadcrumbList, WebPage.name
  const titleOf = (h) => strip((h.match(/<title>([^<]*)<\/title>/) || [])[1]);
  if (exists("box-prices.html")) {
    const h = read("box-prices.html");
    if (titleOf(h).length > 60) errors.push(`SE1: box-prices.html 제목 ${titleOf(h).length}자 — 60자 이하`);
    if (/\bFAQ\b/.test(descOf(h))) errors.push("SE1: box-prices.html description 에 FAQ 가 남았다(페이지에 FAQ 없음)");
    if (!/<h2 id="cheapest"[^>]*>Cheapest Japanese booster boxes<\/h2>/.test(h)) errors.push("SE1: box-prices.html 에 'Cheapest Japanese booster boxes' 표가 없다");
  }
  const HMP = "articles/how-many-packs-one-piece-booster-box.html";
  if (exists(HMP)) {
    const h = read(HMP);
    if (!/^How Many Packs/.test(titleOf(h)) || !/MSRP by Set/.test(titleOf(h))) errors.push(`SE1: ${HMP} 제목 "${titleOf(h)}" — 'How Many Packs…' 앞머리 + 'MSRP by Set'`);
    if (!/<h2[^>]*>[^<]*Booster Box MSRP by Set[^<]*<\/h2>\s*<p data-pack-math-lead>/.test(h)) errors.push(`SE1: ${HMP} MSRP 표 위 H2 에 'Booster Box MSRP by Set' 이 없다`);
    // FQ2 — FAQPage = 화면 FAQ(문항·답) [2026-10-15 5차: JSON-LD 1문항 · 화면 4문항]
    const blk = (h.match(/<!-- PACK-FAQ:START -->([\s\S]*?)<!-- PACK-FAQ:END -->/) || [])[1];
    const txt = (x) => unH(x.replace(/<[^>]+>/g, "")).trim();
    const shown = blk ? [...blk.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [txt(m[1]), txt(m[2])]) : [];
    const ld = ((ldOf(h).find((j) => j["@type"] === "FAQPage") || {}).mainEntity || []).map((q) => [q.name, String((q.acceptedAnswer || {}).text || "").trim()]);
    if (!shown.length) errors.push(`FQ2: ${HMP} 화면 FAQ 블록(PACK-FAQ)을 못 읽었다 — node tools/inject-pack-math.js`);
    else if (JSON.stringify(shown) !== JSON.stringify(ld)) errors.push(`FQ2: ${HMP} FAQPage ${ld.length}문항 ≠ 화면 FAQ ${shown.length}문항(문항·답이 같아야 한다)`);
  }
  if (exists("index.html")) {
    const h = read("index.html");
    if (!titleOf(h) || titleOf(h).length > 60) errors.push(`SE1: 홈 제목 "${titleOf(h)}" — 비었거나 60자 초과`);
    if (!descOf(h) || descOf(h).length > 155) errors.push(`SE1: 홈 description ${descOf(h).length}자 — 비었거나 155자 초과`);
  }
  for (const f of setPages) for (const j of ldOf(read(f))) if (j["@type"] === "WebPage" && !j.name) errors.push(`SE1: ${f} WebPage.name 이 비었다`);
  for (const f of ["index.html", "box-prices.html", "auction.html", "tcg-auction.html", "psa-grading.html", "ko/index.html"].filter(exists)) {
    for (const ds of ldFlat(read(f)).filter((j) => j["@type"] === "Dataset")) {
      for (const k of ["temporalCoverage", "license", "distribution", "url"]) if (!ds[k]) errors.push(`SE1: ${f} Dataset.${k} 누락`);
      if (/card-lists$/.test(ds["@id"] || "") && (!ds.license || !ds.temporalCoverage)) errors.push(`SE1: ${f} 카드리스트 Dataset 에 license·temporalCoverage 가 없다`);
    }
  }
  for (const f of [...PUBLIC_HTML.filter((x) => x.startsWith("articles/") && x !== "articles/index.html"), ...Object.values(F.upcoming).map((u) => `sets/${u.slug}.html`).filter(exists)]) {
    const h = read(f);
    if (noindex(h)) continue;
    const L = ldOf(h), art = L.find((j) => j["@type"] === "Article");
    if (art && !art.image) errors.push(`SE1: ${f} Article.image 누락`);
    if (art && f.startsWith("articles/") && !L.some((j) => j["@type"] === "BreadcrumbList")) errors.push(`SE1: ${f} BreadcrumbList 누락`);
  }
  // PL1 — 세트 Product 의 가격·매물 수는 화면에 있어야 한다(JSON-LD 에만 있는 값 금지). PO1 — 카드 Product offers 는 Offer 만(AggregateOffer·offerCount 금지), 값은 pages-vs-facts.
  for (const f of setPages) {
    const html = read(f), text = shownText(html);
    for (const p of ldOf(html).filter((o) => o["@type"] === "Product" && o.offers)) {
      const o = p.offers;
      for (const v of o["@type"] === "AggregateOffer" ? [o.lowPrice, o.highPrice] : [o.price]) { if (v == null) errors.push(`PL1: ${f} Product ${o["@type"]} 에 가격이 비어 있다`); else if (!text.includes(money(v))) errors.push(`PL1: ${f} Product 가격 ${money(v)} 이 화면에 없다 — 구조화데이터에만 있는 값`); }
      if (o.offerCount != null && !new RegExp(`(^|\\D)${o.offerCount} (?:active )?listings`).test(text)) errors.push(`PL1: ${f} offerCount ${o.offerCount} 가 화면 매물 수에 없다`);
    }
  }
  for (const f of cardPages) {
    const prod = ldOf(read(f)).find((j) => j["@type"] === "Product");
    if (!prod) continue;
    // offers = 지금 나와 있는 두 호가(NM 소매·PSA 10 최저 실매물)의 AggregateOffer 하나(2026-10-28). 개별 Offer 는 판매자 등록정보로 읽혀
    // 서치콘솔이 배송·반품 정책 누락을 경고했다(우리는 판매자가 아니다). offerCount 는 매물 수를 다 세지 않아 쓰지 않는다 — 값 대조는 PAGES-VS-FACTS/PO1.
    const o = prod.offers;
    if (!o || Array.isArray(o)) errors.push(`PO1: ${f} Product offers 는 AggregateOffer 하나여야 한다 — 지금 나와 있는 호가가 없으면 Product 를 내지 않는다`);
    else {
      if (o["@type"] !== "AggregateOffer" || "offerCount" in o) errors.push(`PO1: ${f} offers 는 AggregateOffer(offerCount 없이) — 개별 Offer 는 판매자 등록정보로 읽힌다`);
      if (!Number.isFinite(o.lowPrice) || !Number.isFinite(o.highPrice) || o.lowPrice > o.highPrice || o.priceCurrency !== "USD" || !/^https:\/\/schema\.org\/(?:InStock|OutOfStock)$/.test(o.availability || "")) errors.push(`PO1: ${f} AggregateOffer 에 lowPrice ≤ highPrice·priceCurrency·availability 가 다 있지 않다`);
    }
  }
  // S3 — 카드가 있는 세트 페이지는 Key facts 행 + 그 세트 카드로 채운 Top 10 + 세트끼리 다른 설명문(문장 반복률은 audit-adsense-readiness)
  const seenDesc = new Map();
  let s3 = 0;
  for (const code of F.order.all.filter((c) => F.sets[c].hasCards)) {
    const f = `sets/${F.sets[code].slug}.html`;
    if (!exists(f)) { errors.push(`S3: ${f} 가 없다 — 카드가 있는 세트는 세트 페이지가 있어야 한다`); continue; }
    const html = read(f); s3++;
    if (!/<tr data-k="(?:sold|ask)">/.test(html)) errors.push(`S3: ${f} 에 Key facts 표(판매 중앙값·최저 매물가 행)가 없다 — 템플릿 껍데기`);
    const names = new Set(F.sets[code].cards.map((c) => c.name)), need = Math.min(10, names.size);
    const own = [...html.matchAll(/<tr><td>\d+<\/td><td class="cn">(?:(?!<\/tr>)[\s\S])*?<strong>([^<]*)<\/strong>/g)].filter((m) => names.has(strip(m[1]))).length;
    if (own < need) errors.push(`S3: ${f} Top 10 표에 ${code} 카드가 ${own}장 — ${need}장이어야 한다`);
    const d = descOf(html);
    if (seenDesc.has(d)) errors.push(`S3: ${f} 설명문이 ${seenDesc.get(d)} 와 같다`);
    seenDesc.set(d, f);
  }
  if (!s3) errors.push("S3: 카드가 있는 세트 페이지를 0장 읽었다");
  // KF1(구조) — kfTable 은 H1 바로 아래(사이엔 nextLinks 만), 영어는 HTML 앞 25% 안·한국어는 본문 글자 앞 25% 안, eBay 링크·월 단위 날짜·"Card List" 제목 금지
  const bodyText = (h) => h.replace(/<head[\s\S]*?<\/head>/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const f of [...setPages, ...koSetPages]) {
    const html = read(f), at = html.indexOf('<table class="kfTable'), h1End = html.indexOf("</h1>");
    if (at < 0) { errors.push(`KF1: ${f} 에 Key facts 표(kfTable)가 없다 — H1 바로 아래 라벨:값 표`); continue; }
    const between = html.slice(h1End + 5, at).replace(/<nav class="nextLinks"[^>]*>[\s\S]*?<\/nav>/, "").replace(/\s+/g, "");
    if (h1End < 0 || h1End > at || between) errors.push(`KF1: ${f} Key facts 표가 H1 바로 아래가 아니다(사이: ${between.slice(0, 60) || "H1 없음"})`);
    // KF2(2026-10-19) — 다음 링크 칩(nextLinks)은 Key facts 표 뒤. H1 바로 뒤 칩 줄이 AI 스니펫(본문 앞 ~200자) 몫을 먹었다. 표는 caption(무엇·언제)을 단다.
    const nl = html.indexOf('<nav class="nextLinks"');
    if (nl >= 0 && nl < at) errors.push(`KF2: ${f} nextLinks 가 Key facts 표 앞 — inject-nav 가 표 뒤로 옮긴다`);
    if (!/^<table class="kfTable[^>]*><caption>/.test(html.slice(at, html.indexOf(">", at) + 10))) errors.push(`KF2: ${f} Key facts 표에 caption 이 없다`);
    // KF3(2026-10-19) — 차트 점마다 <title> 글자(과거 $값·날짜 수백 개)를 다시 넣지 않는다. 값은 data-* 속성 + hover JS.
    if (/<svg\b(?:(?!<\/svg>)[\s\S])*?<title>/.test(html)) errors.push(`KF3: ${f} SVG 안에 <title> — 차트 툴팁은 data-* 로(box-chart.js)`);
    const ratio = f.startsWith("ko/") ? bodyText(html.slice(0, at)).length / bodyText(html).length : at / html.length;
    if (ratio > 0.25) errors.push(`KF1: ${f} Key facts 표가 ${(ratio * 100).toFixed(1)}% 지점 — 앞쪽 25% 안이어야 한다`);
    const tbl = html.slice(at, html.indexOf("</table>", at));
    if (/ebay\.com/i.test(tbl)) errors.push(`KF1: ${f} Key facts 표에 eBay 링크 — 제휴 고지(affTop)보다 앞이라 제휴 링크를 두지 않는다`);
    for (const k of ["sold", "ask", "release", "msrp", "packs", "cardlist"]) if (!tbl.includes(`<tr data-k="${k}">`)) errors.push(`KF1: ${f} Key facts 에 ${k} 행이 없다`);
    if (!f.startsWith("ko/")) {
      const mm = bodyText(html).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/);
      if (mm) errors.push(`KF1: ${f} 월 단위 날짜 "${mm[0]}" — 일 단위(ISO)로`);
      if (/card list/i.test((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "")) errors.push(`KF1: ${f} 세트 페이지 제목에 "Card List" — 카드리스트 페이지와 같은 질의를 두고 경쟁한다`);
    }
  }
  // MD1/KO5(꼴) — 설명문 = 데이터 꼴, 120~160자(영문), og 동일, 페이지끼리 다름. 값 대조는 pages-vs-facts.
  const seenD = new Set();
  for (const f of [...setPages, ...koSetPages]) {
    const html = read(f), d = descOf(html), og = (html.match(/<meta property="og:description" content="([^"]*)"/) || [])[1];
    const ko = f.startsWith("ko/"), id = ko ? "KO5" : "MD1", code = f.replace(/^(?:sets|ko)\//, "").replace(/(?:-english)?\.html$/, "").toUpperCase();
    if (ko ? !d.startsWith(`일본판 ${code} `) : !d.startsWith(`${code} `) || !d.includes(` ${/-english\.html$/.test(f) ? "English" : "Japanese"} booster box: `)) errors.push(`${id}: ${f} 설명문이 데이터 꼴이 아니다: "${d.slice(0, 60)}…"`);
    if (!ko && (d.length < 120 || d.length > 160)) errors.push(`MD1: ${f} 설명문 ${d.length}자 — 120~160자`);
    if (og == null || (html.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] !== (html.match(/<meta name="description" content="([^"]*)"/) || [])[1]) errors.push(`${id}: ${f} og:description ≠ description`);
    if (seenD.has(d)) errors.push(`${id}: ${f} 설명문이 다른 페이지와 같다`);
    seenD.add(d);
    if (ko && /매일 갱신|인기 카드 NM 시세|재판 기록·/.test(d)) errors.push(`KO5: ${f} 설명문에 소개 문구 — 사실만`);
  }
  // RD1(구조) — 발매일 글·ja 표 ItemList 는 ListItem(이름·주소)만: offers 없는 Product 는 GSC 무효 항목
  for (const f of ["articles/one-piece-set-list-release-dates.html", "ja/release-dates.html"].filter(exists)) {
    const il = ldOf(read(f)).find((j) => j["@type"] === "ItemList");
    if (il && (il.itemListElement || []).some((e) => e.item && e.item["@type"] === "Product")) errors.push(`RD1: ${f} ItemList 안에 Product — ListItem(이름·주소)로`);
    if (f.startsWith("articles/")) for (const e of (il && il.itemListElement) || []) if (e.url && !exists(e.url.replace(SITE + "/", ""))) errors.push(`RD1: ${f} ItemList 주소 ${e.url} 가 저장소에 없다(404)`);
  }
  // AD1 — 모든 글의 날짜 = sync-article-dates.js 한 곳의 규칙(본문이 바뀐 날·메타·바이라인) [2026-10-14 W3]
  try {
    const sad = require("../sync-article-dates.js"), today = new Date().toISOString().slice(0, 10);
    for (const rel of sad.listArticles()) {
      const html = read(rel), w = sad.wantedDates(rel, html, today);
      if (w && sad.applyDates(html, w.pub, w.mod) !== html) errors.push(`AD1: ${rel} 날짜가 규칙과 다르다(파일 dateModified ${(sad.articleLd(html) || {}).json?.dateModified} · 규칙 ${w.mod} · ${w.reason}) — node tools/sync-article-dates.js`);
    }
  } catch (e) { errors.push("AD1: 글 날짜 검사 실패 — " + e.message); }
  // UP1(구조) — 발매 전 페이지 바이라인 "Updated … · Published …" 순서(Bing 스니펫이 Jul 16 이었다), 공개 카드 표 행 수 = 데이터
  for (const p of json("data/upcoming-set-pages.json", { pages: [] }).pages || []) {
    const f = `sets/${p.slug}.html`;
    if (!exists(f)) { errors.push(`UP1: ${f} 가 없다`); continue; }
    const html = read(f);
    if (!new RegExp(`Updated <time datetime="\\d{4}-\\d{2}-\\d{2}">[^<]*</time> · Published <time datetime="${p.published}">`).test(html)) errors.push(`UP1: ${f} 바이라인이 "Updated … · Published ${p.published}" 순서가 아니다`);
    if ((p.revealedCards || []).length) {
      const tbl = html.match(/<table class="factTable revTbl[^"]*">[\s\S]*?<\/table>/);
      const rows = tbl ? [...tbl[0].matchAll(/<tr><td><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/td>/g)] : [];
      if (rows.length !== p.revealedCards.length) errors.push(`UP1: ${f} 공개 카드 표 ${rows.length}행 ≠ 데이터 ${p.revealedCards.length}장`);
    }
  }
}

module.exports = { checks, run };
