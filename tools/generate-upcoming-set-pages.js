/**
 * Builds the two editorial pages for announced sets that do not yet have a
 * complete market-data record. Edit data/upcoming-set-pages.json, not sets/.
 * Run: node tools/generate-upcoming-set-pages.js
 */
const fs = require("fs");
const { navHtml, navHtmlKo } = require("./site-nav");
const { AFF_TOP, epnUrl } = require("./set-page-shared");
const { detailRobotsMeta } = require("./adsense-review-gate");
const { addUrls } = require("./sitemap-detail-urls");
// 공식 카드리스트가 뜬 날(OP-18·EB-05) 이 페이지에서 바로 그 목록으로 — 2026-10-14(W7). 데이터 기준이라 생성 순서와 무관.
const CARD_LIST = require("./card-list-shared");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE_FILE = path.join(ROOT, "data", "upcoming-set-pages.json");
const OUTPUT_DIR = path.join(ROOT, "sets");
const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
const CSS_VERSION = (fs.readFileSync(path.join(ROOT, "packs.js"), "utf8")
  .match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayDate(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function validatePage(page) {
  const requiredStrings = ["slug", "code", "title", "headline", "published", "modified"];
  for (const key of requiredStrings) {
    if (!page[key] || typeof page[key] !== "string") throw new Error(`${page.slug || "page"}: missing ${key}`);
  }
  if (!/^(?:op|eb)-\d{2}$/.test(page.slug)) throw new Error(`${page.slug}: invalid upcoming set slug`);
  for (const key of ["facts", "faq", "related"]) {
    if (!Array.isArray(page[key]) || page[key].length === 0) throw new Error(`${page.slug}: missing ${key}`);
  }
  // 해설 필드는 쓰지 않는다 — 2026-10-15 소유자 결정(데이터 페이지 = 숫자·표·라벨만). 도입 문단(introHtml)·해설 섹션(sections)·
  //   편집용 긴 설명(description)을 JSON 에서 지웠다. 다시 넣으면 화면에 안 나오는 죽은 글이 되므로 생성을 멈춘다.
  for (const key of ["introHtml", "sections", "description"]) {
    if (page[key] != null) throw new Error(`${page.slug}: "${key}" 는 쓰지 않는다(2026-10-15 소유자 결정 — 숫자·표·라벨만)`);
  }
  // 시장 데이터 상태는 손으로 쓰지 않는다 — box-sold-series 에서 만든다(marketStatusRow). 2026-10-14.
  if (page.facts.some(([label]) => label === "Market-data status")) {
    throw new Error(`${page.slug}: facts 의 "Market-data status" 는 손으로 쓰지 않는다 — 생성기가 데이터에서 만든다`);
  }
  if (!page.sourceHtml.includes("en.onepiece-cardgame.com/products/")) {
    throw new Error(`${page.slug}: official Bandai product source is required`);
  }
  // 상단 발매일 상자의 ISO 날짜는 공식 사실 표와 반드시 같아야 한다 — 한쪽만 고치면 같은 페이지에 날짜가 둘이 된다.
  for (const [key, label] of [["releaseEn", "English release"], ["releaseJp", "Japanese release"]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(page[key] || "")) throw new Error(`${page.slug}: ${key} (YYYY-MM-DD) is required`);
    const row = page.facts.find(([l]) => l === label);
    if (!row || !row[1].startsWith(displayDate(page[key]))) throw new Error(`${page.slug}: ${key} ${page[key]} ≠ facts "${label}"`);
  }
  // 확인일은 하나 — 2026-10-14. 첫 화면 "facts checked 9월 28일" 이 2주 넘게 남아 있었고, 공식은 그사이 EB-05 75+2종을 올렸다.
  //   eyebrow·출처 줄·공개 카드 출처 줄의 "checked/read <날짜>" 는 모두 page.modified(사실이 바뀐 날)와 같아야 한다.
  const checked = displayDate(page.modified);
  if (!page.eyebrow || !page.eyebrow.includes(`checked ${checked}`)) throw new Error(`${page.slug}: eyebrow 의 확인일 ≠ modified(${checked})`);
  const stamped = [page.eyebrow, page.sourceHtml, page.revealedCardsSourceHtml || "", ...page.faq.map(([, a]) => a)].join(" ");
  for (const m of stamped.matchAll(/\b(?:[Cc]hecked|[Rr]ead)(?: on)? ([A-Z][a-z]+ \d{1,2}, \d{4})/g)) {
    if (m[1] !== checked) throw new Error(`${page.slug}: 확인일 "${m[0]}" ≠ modified(${checked}) — 다시 확인했으면 modified 도 고친다`);
  }
  if (/\bNot listed\b/i.test(JSON.stringify(page))) throw new Error(`${page.slug}: "Not listed" — 공식에 있으면 값을, 없으면 "Not stated … (checked 날짜)" 로 쓴다`);
  // 공개 카드(공식) — 번호·이름·종류·색·공개일·공식 출처가 다 있어야 싣는다. 출처는 반다이/ONE PIECE.com/공식 X 만.
  for (const c of page.revealedCards || []) {
    const where = `${page.slug} revealedCards ${c.no || "?"}`;
    if (!/^(?:OP|EB|ST|PRB)\d{2}-\d{3}$/.test(c.no || "")) throw new Error(`${where}: 번호 형식`);
    if (!c.jp || !REVEAL_TYPES[c.type] || !String(c.color || "").split("/").every((x) => REVEAL_COLORS[x])) throw new Error(`${where}: 이름·종류·색`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "") || c.date > page.modified) throw new Error(`${where}: 공개일`);
    if (!/^https:\/\/(?:x\.com\/ONEPIECE_tcg(?:_EN)?\/status\/\d+|one-piece\.com\/news\/|(?:www|en)\.onepiece-cardgame\.com\/)/.test(c.source || "")) throw new Error(`${where}: 공식 출처가 아니다 — ${c.source}`);
    if (c.version && !c.versionKo) throw new Error(`${where}: version 에 versionKo(한↔영 토글) 가 없다`);
  }
  if (page.revealedCards && !page.revealedCardsSourceHtml) throw new Error(`${page.slug}: 공개 카드 표에 출처 줄이 없다`);
}

const REVEAL_TYPES = { Leader: "리더", Character: "캐릭터", Event: "이벤트", Stage: "스테이지" };
// 사실 표 라벨 한국어(토글) — 값은 영어 원문 그대로(공식 표기·날짜).
const FACT_KO = { "Product": "제품", "Japanese release": "일본판 발매일", "English release": "영문판 발매일", "Japanese MSRP": "일본판 정가", "English MSRP": "영문판 정가", "Pack contents": "팩 구성", "Total card types": "카드 종류", "Rarity breakdown (Japanese)": "레어리티(일본판)", "Theme": "테마", "Packs per box": "박스당 팩 수", "Card list": "카드 리스트", "Market-data status": "시세 데이터 상태" };
const REVEAL_COLORS = { Red: "빨강", Green: "초록", Blue: "파랑", Purple: "보라", Black: "검정", Yellow: "노랑" };

// 발매일 검색(2026-10-02): "one piece op 18 release date" 는 노출 1위인데 순위 7~9위·클릭 0 이었다(Bing 70일).
// 답(날짜)을 제목·첫 화면에 바로 보이게 한다 — 경쟁 상위 페이지는 전부 제목에 날짜나 카운트다운이 있다.
const shortDate = (iso) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
function releaseRange(page) {
  const [a, b] = [page.releaseEn, page.releaseJp].sort();
  const year = b.slice(0, 4);
  if (a === b) return `${shortDate(a)}, ${year}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${shortDate(a)}–${b.slice(8).replace(/^0/, "")}, ${year}`;
  return `${shortDate(a)}–${shortDate(b)}, ${year}`;
}
const weekday = (iso) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const TODAY = new Date().toISOString().slice(0, 10);
// 상단 발매일 상자: 이른 날짜가 위. 정적 글자는 "upcoming"/"today"/"released"(매일 바뀌지 않게), 남은 날수는 스크립트가 센다.
function staticLeft(iso) { return iso > TODAY ? "upcoming" : iso === TODAY ? "today" : "released"; }
function releaseBox(page) {
  const rows = [["English", page.releaseEn], ["Japan", page.releaseJp]].sort((x, y) => x[1].localeCompare(y[1]));
  const rowHtml = rows.map(([where, iso]) => `<div class="relRow"><span class="relWhere">${where}</span><b><time datetime="${iso}">${displayDate(iso)}</time> <small>${weekday(iso)}</small></b><span class="relLeft" data-release="${iso}">${staticLeft(iso)}</span></div>`).join("\n        ");
  const ebay = epnUrl(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`One Piece ${page.code} booster box`)}&_sop=10&customid=rel-${page.slug}`);
  return `<section class="relBox" aria-label="${escapeHtml(page.code)} release dates">
        ${rowHtml}
        ${AFF_TOP}
        <p class="relBuy"><a class="relBtn" href="${escapeHtml(ebay)}" target="_blank" rel="noopener noreferrer sponsored">${escapeHtml(page.code)} pre-orders on eBay</a></p>
      </section>`;
}

// 예약판매 가격 표 — 2026-10-08. 발매 전에 실제로 검색되는 질문("EB-05 box pre-order price")에 우리 데이터로 답한다.
// 호가는 collect-preorder-prices.js(일별, 배송비 포함 매물 백분위), 판매는 box-sold 러너. 둘 다 없으면 표를 그리지 않는다.
// 라벨만 두고 설명문은 한 줄 — 추정·예측 문구 금지(공개 문구 규칙).
// 2026-10-15: 그 한 줄에서도 "collected daily before release"·"not counted in sold-price tables"·"Same filters as …" 같은
//   방법·집계 제외 설명을 뺐다. 남는 것은 값의 정의(무엇의 최저 호가·무엇의 중앙값·언제까지)뿐이다.
// 2026-10-14: 발매 전 판매(예약판매)를 "Sold median" 으로 내던 것을 고쳤다 — 같은 날 사실 표는 "no completed sale" 이었고,
//   다른 7개 페이지는 그 값을 실거래 중앙값으로 썼다. 이제 판매 원천은 box-sold-series 의 preRelease(발매일 이전 판매 요약)와
//   current(발매 후 현재가)이고, 발매 전 판은 반드시 "presale" 라벨을 단다(가드 D16). 매물 3개 미만이면 값은 "—".
// 2026-10-15(F4): 판별 발매 여부·예약판매 호가·표 유무·페이지 수정일·원장 기준일(through)은 사실 파일 upcoming[code](tools/build-site-facts.js),
//   발매 후 현재가·발매 후 판매 건수·발매 전 판매 요약은 sets[code].current·sinceRelease·preRelease. 원장(preorder-series·box-sold-series) 직접 읽기 없음.
const F = require("./build-site-facts").load();
const U = (page) => F.upcoming[page.code];
const S = (page) => F.sets[page.code] || null;
const usd = (n) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const mmdd = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
// 판(jp/en)의 발매 여부 — 데이터 기준일(asOf) 기준. 시계열과 같은 날짜(series.release, 없으면 이 페이지의 공식 날짜) — 사실 파일 upcoming[code].released.
function edReleased(page, ed) {
  return U(page).released[ed];
}
function salesCell(page, ed) {
  const s = S(page);
  if (edReleased(page, ed)) {
    const cur = s?.current?.[ed];
    const since = s?.sinceRelease?.[ed] || 0;
    return cur
      ? `${usd(cur.median)}<small data-ko="발매 후 · ${cur.n}건 · ${escapeHtml(mmdd(cur.d))}">since release · ${plural(cur.n, "sale")} · ${escapeHtml(mmdd(cur.d))}</small>`
      : `—<small data-ko="발매 후 · ${since}건">since release · ${plural(since, "sale")}</small>`;
  }
  const pre = s?.preRelease?.[ed];
  if (!pre) return "—";
  const span = pre.first === pre.last ? mmdd(pre.first) : `${mmdd(pre.first)}–${mmdd(pre.last)}`;
  return `${pre.median != null ? usd(pre.median) : "—"}<small data-ko="예약판매 · ${pre.sales}건 · 매물 ${pre.listings}개 · ${escapeHtml(span)}">presale · ${plural(pre.sales, "sale")} · ${plural(pre.listings, "listing")} · ${escapeHtml(span)}</small>`;
}
function preorderTable(page, ko = false) {
  const u = U(page);
  const sold = S(page);
  const rows = [["Japanese", "jp", "일본판"], ["English", "en", "영문판"]].map(([label, ed, ko]) => {
    const a = u.ask[ed];
    if (!a && !sold?.preRelease?.[ed] && !sold?.current?.[ed] && !edReleased(page, ed)) return null;
    // 모바일 390px 에서 4열은 마지막 열이 잘린다(실측) — 3열로 두고 보조 수치는 셀 안 둘째 줄(small)에.
    const bestHtml = a?.best ? `<a class="rowBuy" href="${escapeHtml(epnUrl(a.best.url + (a.best.url.includes("?") ? "&" : "?") + `customid=preorder-${page.slug}-${ed}`))}" target="_blank" rel="noopener noreferrer sponsored">${usd(a.best.total)}</a>` : "—";
    const askHtml = a && a.n ? `${bestHtml}<small data-ko="중앙값 ${usd(a.median)} · 매물 ${a.n}개">median ${usd(a.median)} · ${a.n} listing${a.n === 1 ? "" : "s"}</small>` : "—";
    return `<tr><td data-ko="${ko} 박스">${label} box</td><td>${askHtml}</td><td>${salesCell(page, ed)}</td></tr>`;
  }).filter(Boolean);
  if (!rows.length) return "";
  const asOf = u.askAsOf;
  const allPre = !edReleased(page, "jp") && !edReleased(page, "en");
  const soldTh = allPre ? `<th data-ko="예약판매 거래 중앙값">Presale sold median</th>` : `<th data-ko="거래 중앙값">Sold median</th>`;
  const through = u.through;
  const table = `
      <h2 data-ko="${escapeHtml(page.code)} 예약판매 박스 가격(이베이)">${escapeHtml(page.code)} pre-order box prices on eBay</h2>
      <table class="factTable preTbl text"><thead><tr><th data-ko="판">Edition</th><th data-ko="최저 호가">Cheapest ask</th>${soldTh}</tr></thead><tbody>
          ${rows.join("\n          ")}
      </tbody></table>`;
  // 한국어판은 같은 표를 data-ko 로 바꿔 쓰고(koify), 정의 줄만 한국어로 — 값의 정의(무엇의 최저 호가·무엇의 중앙값·언제까지)뿐.
  if (ko) return `${koify(table)}
      <p class="sourceNoteA">최저 호가: 이베이 즉시구매 미개봉 박스 매물 · 배송비 포함${asOf ? ` · 기준일 ${escapeHtml(asOf)}` : ""} · 예약판매: 공식 발매일 전 이베이 완료 거래${through ? ` · ${escapeHtml(through)}까지` : ""} · 중앙값 = 서로 다른 매물 ${F.series.preReleaseMinListings}개 이상 판매</p>`;
  return `${table}
      <p class="sourceNoteA">Cheapest ask: eBay fixed-price sealed-box listings, incl. shipping${asOf ? `, as of ${escapeHtml(asOf)}` : ""} · Presale: completed eBay sales before the official release date${through ? `, through ${escapeHtml(through)}` : ""} · median = ${F.series.preReleaseMinListings}+ different listings sold</p>`;
}

// 사실 표의 "Market-data status" 줄 — 2026-10-14 부터 데이터에서 만든다(손으로 쓴 "no completed sale" 이 예약판매 실거래와 어긋났다).
// 라벨과 숫자만. 판별 발매 여부·발매 후 판매 건수·예약판매 건수/매물 수·원장 기준일.
// 반다이 확인 상태 행 — 2026-10-19. 값은 사실 파일 upcoming[code].bandai(tools/check-bandai-product-pages.js 가 그날 실제로 받은 페이지에서
//   데이터 파일의 발매일·정가 문자열을 그대로 본 마지막 날 = checkedOn, 공식 카드리스트 공개 여부·확인일 = cardList). 사실이 바뀐 날(page.modified)과 따로 둔다.
//   행 = [영문 라벨, 한국어 라벨, 영문 값 HTML, 한국어 값 HTML]. 확인 기록이 없으면 행을 그리지 않는다(지어내지 않는다). 가드 BD1 이 날짜를 로그와 대조한다.
function bandaiRows(page) {
  const b = U(page).bandai, rows = [];
  const t = (iso) => `<time datetime="${escapeHtml(iso)}">${escapeHtml(iso)}</time>`;
  if (b && b.checkedOn) rows.push(["Release date status", "발매일 확인", `Confirmed · Bandai product pages (JP · EN) checked ${t(b.checkedOn)}`, `확인됨 · 반다이 상품 페이지(일본판·영문판) 확인 ${t(b.checkedOn)}`]);
  const p = CARD_LIST.productOf(page.code);
  if (p) rows.push(["Card list status", "카드 리스트", `Published · <a href="${escapeHtml(page.slug)}-card-list.html">${p.counts.cards} cards</a> · checked ${t(p.checked)}`, `공개 · <a href="${escapeHtml(page.slug)}-card-list.html">${p.counts.cards}장</a> · 확인 ${t(p.checked)}`]);
  else if (b && b.cardList && b.cardList.checkedOn) rows.push(["Card list status", "카드 리스트", `Not published · Bandai card list checked ${t(b.cardList.checkedOn)}`, `미공개 · 반다이 카드 리스트 확인 ${t(b.cardList.checkedOn)}`]);
  return rows;
}
const bandaiChecked = (page) => (U(page).bandai && U(page).bandai.checkedOn) || null;
const MARKET_STATUS_LABEL = "Market-data status";
function marketStatusRow(page) {
  const s = S(page);
  const through = U(page).through;
  const anyReleased = edReleased(page, "jp") || edReleased(page, "en");
  const since = ["jp", "en"].map((ed) => `${ed.toUpperCase()} ${s?.sinceRelease?.[ed] || 0}`).join(" · ");
  const pre = ["jp", "en"].map((ed) => {
    const p = s?.preRelease?.[ed];
    return `${ed.toUpperCase()} ${p ? `${plural(p.sales, "sale")} (${plural(p.listings, "listing")})` : "0"}`;
  }).join(" · ");
  const value = `${anyReleased ? "Released" : "Pre-release"} · sales since release: ${since} · presale sales: ${pre}${through ? ` · eBay, through ${displayDate(through)}` : ""}`;
  return [MARKET_STATUS_LABEL, value];
}

// 페이지 수정일 — 2026-10-15. Article dateModified·article:modified_time·바이라인 "Updated" = 사실 확인일(page.modified)과
// 화면에 찍힌 시세 날짜(판매 원장 기준일 "through" · 예약판매 호가 기준일 · 판매 칸 날짜) 가운데 가장 늦은 날 — 사실 파일 upcoming[code].pageDate.
// 종전엔 page.modified(10-14)만 써서 같은 페이지의 "Presale … through 2026-10-15" 보다 수정일이 일렀다. "facts checked" 는 그대로 page.modified.
function pageModified(page) {
  return U(page).pageDate;
}

// Product + releaseDate — sets/op-17 과 같은 꼴(이름·브랜드·분류·발매일). 2026-10-14.
// 판(일본판·영문판)마다 하나. 발매일 검색("op 18 release date")에 구조화된 날짜로 답한다.
// offers 는 화면의 예약판매 호가 표에 보이는 값만(최저 호가·매물 수) — 호가가 없으면 넣지 않는다.
function productSchemas(page, canonical) {
  const name = seoName(page);
  return [["Japanese", "jp", page.releaseJp], ["English", "en", page.releaseEn]].map(([label, ed, releaseDate]) => {
    const a = U(page).ask[ed];
    const low = a?.best?.total ?? null;
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `One Piece Card Game ${page.code} ${name} Booster Box (${label})`,
      description: `${label} sealed ${page.code} ${name} One Piece Card Game booster box — official release date ${displayDate(releaseDate)}, official pack price and card-type count, pre-order asking prices.`,
      brand: { "@type": "Brand", name: "Bandai" },
      category: "Trading Card Games",
      releaseDate,
      ...(a && a.n && low != null ? {
        offers: {
          "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: Math.round(low * 100) / 100, offerCount: a.n,
          availability: edReleased(page, ed) ? "https://schema.org/InStock" : "https://schema.org/PreOrder", url: canonical,
        },
      } : {}),
    };
  });
}

// 공개 카드(공식) 표 — OP-18 등 카드리스트 공개 전 세트. 숫자·라벨만, 링크는 첫 칸(번호 → 공식 게시물).
function revealedTable(page) {
  const cards = page.revealedCards || [];
  if (!cards.length) return "";
  const rows = [...cards].sort((x, y) => x.no.localeCompare(y.no)).map((c) => {
    // 390px 에 5열이 안 들어가 마지막 열(공개일)이 잘렸다(실측) — 종류·색은 한 칸 두 줄로.
    const colorKo = c.color.split("/").map((x) => REVEAL_COLORS[x]).join("/");
    const sub = [c.en ? `<small>${escapeHtml(c.en)}</small>` : "", c.version ? `<small data-ko="${escapeHtml(c.versionKo)}">${escapeHtml(c.version)}</small>` : ""].join("");
    return `<tr><td><a href="${escapeHtml(c.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.no)}</a></td><td><span lang="ja">${escapeHtml(c.jp)}</span>${sub}</td><td><span data-ko="${REVEAL_TYPES[c.type]}">${escapeHtml(c.type)}</span><small data-ko="${colorKo}">${escapeHtml(c.color.split("/").join(" / "))}</small></td><td><time datetime="${c.date}">${c.date.slice(5)}</time></td></tr>`;
  });
  const dates = cards.map((c) => c.date).sort();
  return `
      <h2 id="revealed-cards" data-ko="${escapeHtml(page.code)} 공개 카드(공식)">${escapeHtml(page.code)} revealed cards (official)</h2>
      <p class="revCount"><b>${cards.length}</b> <span data-ko="장">cards</span> · <time datetime="${dates[0]}">${dates[0]}</time> – <time datetime="${dates[dates.length - 1]}">${dates[dates.length - 1]}</time></p>
      <table class="factTable revTbl text"><thead><tr><th data-ko="번호">No.</th><th data-ko="카드">Card</th><th data-ko="종류 · 색">Type · color</th><th data-ko="공개일">Revealed</th></tr></thead><tbody>
          ${rows.join("\n          ")}
      </tbody></table>
      <p class="sourceNoteA">${page.revealedCardsSourceHtml}</p>`;
}

// 해설 접기("Set notes")는 2026-10-15 에 지웠다 — 소유자 결정: 발매 전 페이지도 발매일·예약판매·제품 정보·공개 카드 표와
// 데이터 문답만. 2026-10-15 오전엔 지우지 않고 접었으나(구글은 접힌 글도 읽는다), 소유자가 해설 자체가 필요 없다고 정했다.

// 검색 제목·설명(2026-09-17): 구글은 제목 60자·설명 155자를 넘기면 잘라내거나 다시 쓴다(OP-18 은 82자/185자였다).
// JSON 의 title·description 은 편집용 긴 문장이라 그대로 못 쓴다 — <title> 은 코드 + 세트명(title 에서 " (" / " — " 앞까지)
// + "Booster Box Release Date", 설명은 코드 + 세트명 + 발매일 FAQ(faq[0]) 답의 앞 문장들로 만든다. 넘치면 생성을 멈춘다.
const TITLE_MAX = 60, DESC_MAX = 155;
const fit = (cands, max, what) => {
  const hit = cands.find((c) => c.length <= max);
  if (!hit) throw new Error(`SEO 길이 초과: ${what} — ${cands[cands.length - 1].length}자 > ${max}자 "${cands[cands.length - 1]}"`);
  return hit;
};
const seenTitles = new Set();
function seoName(page) {
  if (!page.title.startsWith(`${page.code} `)) throw new Error(`${page.slug}: title 은 "${page.code} <세트명>" 으로 시작해야 한다`);
  const name = page.title.slice(page.code.length + 1).split(/\s+(?:\(|—)/)[0].trim();
  if (!name) throw new Error(`${page.slug}: title 에서 세트명을 못 뽑았다`);
  return name;
}
function seoTitle(page) {
  // 2026-09-29: 실검색어는 "one piece op 18 release date" 다(GSC). 종전 제목엔 'One Piece' 가 없고
  // 'Release Date' 가 맨 뒤라 구글 75위였다. 검색어 순서대로 앞에 둔다.
  // 2026-10-02: 날짜를 제목에 넣는다(답이 제목에 보여야 클릭·인용이 붙는다). 60자를 넘으면 세트명부터 뺀다.
  const dated = `One Piece ${page.code} Release Date: ${releaseRange(page)}`;
  const title = fit([`${dated} — ${seoName(page)}`, dated], TITLE_MAX, page.slug);
  if (seenTitles.has(title)) throw new Error(`타이틀 중복: ${title}`);
  seenTitles.add(title);
  return title;
}
function seoDescription(page) {
  const [question, answer] = page.faq[0];
  if (!/release/i.test(question)) throw new Error(`${page.slug}: faq[0] 은 발매일 질문이어야 한다(검색 설명의 원문)`);
  const lead = `${page.code} ${seoName(page)}: `;
  const sentences = answer.split(/(?<=\.)\s+/);
  return fit(sentences.map((_, i) => lead + sentences.slice(0, sentences.length - i).join(" ")), DESC_MAX, page.slug);
}

function renderPage(page) {
  validatePage(page);
  const canonical = `https://opboxindex.com/sets/${page.slug}.html`;
  const title = seoTitle(page);
  const description = seoDescription(page);
  const modified = pageModified(page);
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.headline,
    description,
    datePublished: page.published,
    dateModified: modified,   // 사실 확인일과 화면 시세 날짜 중 늦은 날(pageModified, 2026-10-15)
    inLanguage: "en-US",
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    // og:image 와 같은 그림 — Article 의 image 가 비어 있었다(2026-10-14 W6b).
    image: "https://opboxindex.com/og/og-set-list.png",
    author: { "@type": "Organization", name: "OP Box Index", url: "https://opboxindex.com/about.html" },
    publisher: { "@type": "Organization", name: "OP Box Index", url: "https://opboxindex.com/" },
    isAccessibleForFree: true,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OP Box Index", item: "https://opboxindex.com/" },
      { "@type": "ListItem", position: 2, name: "Set guides", item: "https://opboxindex.com/sets/index.html" },
      { "@type": "ListItem", position: 3, name: page.code, item: canonical },
    ],
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  const factRows = [...bandaiRows(page).map(([en, ko, html]) => `<tr><th scope="row" data-ko="${escapeHtml(ko)}">${escapeHtml(en)}</th><td>${html}</td></tr>`),
    ...[...page.facts, marketStatusRow(page)]
      .map(([label, value]) => `<tr><th scope="row"${FACT_KO[label] ? ` data-ko="${FACT_KO[label]}"` : ""}>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)]
    .join("\n          ");
  // FAQ 는 일반 세트 페이지와 같은 틀(질문만 보이고 답은 <details>) — 머리말도 "<코드> <세트명> — frequently asked questions" 로 맞춘다. 2026-10-15.
  const faqHtml = page.faq
    .map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`)
    .join("\n        ");
  const relatedHtml = page.related
    .map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`)
    .join("\n        ");

  return `<!doctype html>
<!-- Generated by tools/generate-upcoming-set-pages.js; edit data/upcoming-set-pages.json. -->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${canonical}" />
    <link rel="alternate" hreflang="ko" href="${koCanonicalOf(page)}" />
    <link rel="alternate" hreflang="x-default" href="${canonical}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="article:published_time" content="${page.published}" />
    <meta property="article:modified_time" content="${modified}" />
    <meta property="og:image" content="https://opboxindex.com/og/og-set-list.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
    ${productSchemas(page, canonical).map((p) => `<script type="application/ld+json">${JSON.stringify(p)}</script>`).join("\n    ")}
    <link rel="stylesheet" href="../styles.css?v=${CSS_VERSION}" />
    <script defer src="../lang-toggle.js?v=${CSS_VERSION}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .factTable{width:100%;max-width:720px;border-collapse:collapse;margin:16px 0}.bodyPage table.factTable{width:100%;max-width:720px;min-width:0;font-size:14px}.bodyPage .factTable td{text-align:left;word-break:keep-all;overflow-wrap:break-word}.preTbl td small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}.preTbl td:first-child{white-space:nowrap}.factTable th,.factTable td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}.factTable th{width:36%;color:#9aa4b6;font-weight:600}.sourceNoteA{max-width:760px;color:#9aa4b6;font-size:13px;line-height:1.65}.setFaq{max-width:760px}.setFaq details{border-bottom:1px solid rgba(255,255,255,.08);padding:8px 0}.setFaq summary{cursor:pointer;font-weight:700}
      .relBox{max-width:720px;margin:14px 0 18px;padding:12px 16px 14px;border:1px solid var(--accent-line);border-radius:12px;background:var(--accent-dim)}
      .relRow{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08)}
      .relWhere{flex:0 0 64px;color:var(--muted);font-size:13px;font-weight:600}
      .relRow b{flex:1 1 auto;font-family:var(--font-display);font-size:19px;line-height:1.25;color:var(--ink)}
      .relRow b small{font-family:inherit;font-size:13px;font-weight:600;color:var(--muted);margin-left:4px}
      .relLeft{color:var(--accent);font-size:14px;font-weight:700;white-space:nowrap}
      .relBox .affTop{margin:10px 0 0}
      .relBuy{margin:10px 0 0}
      .relBtn{display:inline-block;padding:9px 14px;border-radius:9px;background:var(--accent);color:#06222a;font-weight:700;font-size:14px;text-decoration:none}
      .relBtn:hover,.relBtn:focus-visible{filter:brightness(1.08);text-decoration:underline}
      @media (max-width:420px){.relWhere{flex-basis:100%}.relRow b{font-size:18px}}
      .revTbl{font-size:14px}.revTbl th{width:auto}.revTbl th,.revTbl td{padding:7px 6px}.revTbl td:first-child{white-space:nowrap}.revTbl td small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}.revTbl td:last-child{white-space:nowrap}
      .revCount{margin:4px 0 0;color:var(--muted);font-size:13px}.revCount b{color:var(--ink);font-family:var(--font-display);font-size:17px}
      @media (max-width:720px){.bodyPage table.factTable,.revTbl{display:table;width:100%;-webkit-mask-image:none;mask-image:none}}
      @media (max-width:420px){.revTbl{font-size:13px}.revTbl th,.revTbl td{padding:6px 4px}}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("../")}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow">${escapeHtml(page.eyebrow)}${bandaiChecked(page) ? ` · Bandai product page checked ${escapeHtml(displayDate(bandaiChecked(page)))}` : ""}</p>
      <h1>${escapeHtml(page.headline)}</h1>
      ${releaseBox(page)}
      ${/* 2026-10-16: 'Product facts'(발매일·정가·팩 구성·카드 종류 — 공식 사실)를 예약가 표 위, 발매일 상자 바로 아래로. 빙 'op 18 release date' 5위·
            'eb05 release date' US 9위는 전부 발매일 기사가 받고 이 세트 페이지는 두 질의 모두 30위 밖 — 첫 화면이 호가 표라 공식 사실이 뒤로 밀려 있었다. */ ""}
      <h2 data-ko="제품 정보">Product facts</h2>
      <table class="factTable text"><tbody>
          ${factRows}
      </tbody></table>
      <p class="sourceNoteA">${page.sourceHtml}</p>
      ${preorderTable(page)}
      <p class="articleMeta">Research and data: <a href="../about.html">OP Box Index</a> · Updated <time datetime="${modified}">${displayDate(modified)}</time> · Published <time datetime="${page.published}">${displayDate(page.published)}</time> · <a href="../methodology.html">Data sources &amp; methodology</a></p>${revealedTable(page)}${(() => {
        const p = CARD_LIST.productOf(page.code);
        return p ? `\n      <p class="revCount"><a href="${escapeHtml(page.slug)}-card-list.html" data-ko="${escapeHtml(page.code)} 공식 카드 리스트">${escapeHtml(page.code)} official card list</a> · <b>${p.counts.cards}</b> <span data-ko="장">cards</span> · <span data-ko="확인">checked</span> <time datetime="${p.checked}">${p.checked}</time></p>` : "";
      })()}
      <section class="setFaq" aria-label="${escapeHtml(`${page.code} ${seoName(page)} frequently asked questions`)}">
        <h2>${escapeHtml(`${page.code} ${seoName(page)} — frequently asked questions`)}</h2>
        ${faqHtml}
      </section>
    </main>
    <footer class="articleFooter">
      <p class="relatedHead">Related</p>
      <nav class="relatedLinks" aria-label="Related research">
        ${relatedHtml}
        <a href="../about.html">About OP Box Index</a>
      </nav>
      <p class="affNote">OP Box Index is a data research site, not investment advice.</p>
    </footer>
    <script>
      // 남은 날수를 방문자 날짜로 센다(정적 글자는 upcoming/today/released).
      (function () {
        var now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        document.querySelectorAll(".relLeft[data-release]").forEach(function (el) {
          var p = el.getAttribute("data-release").split("-"), d = Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - today) / 86400000);
          el.textContent = d > 1 ? "in " + d + " days" : d === 1 ? "tomorrow" : d === 0 ? "today" : "released";
        });
      })();
    </script>
  </body>
</html>
`;
}

// ── 한국어판 ko/<slug>.html — 2026-10-16. sets/op-18·eb-05 는 ko 짝이 없어 hreflang 이 0 이었다(세트 가이드는 ko 짝이 있을 때만 hreflang 을 낸다).
//    같은 데이터(발매일·예약판매 호가·공식 사실·공개 카드·카드리스트 링크)를 한국어 라벨로 굽는다 — 문답·해설 없음(숫자·표·라벨만).
//    라벨 번역은 영문 템플릿의 data-ko 한 곳만 유지한다: koify 가 data-ko 를 가진 요소의 글자를 그 값으로 바꾼다(lang-toggle.js 가 화면에서 하는 일과 같다).
//    가드: 세트 페이지 검사(KF1·KO5·U2)는 발매 전 세트를 영문 짝처럼 뺀다(guard/seo.js). 한국어 고지 원문(EP1)·면책 한 줄(푸터)은 ko 규칙대로.
//    사이트맵에는 addUrls 로 더하기만 한다(날짜는 sync-sitemap-lastmod 가 정한다).
function koCanonicalOf(page) { return `https://opboxindex.com/ko/${page.slug}.html`; }
function koify(html) {
  return html.replace(/<(\w+)((?:(?!>)[\s\S])*?) data-ko="([^"]*)"((?:(?!>)[\s\S])*?)>([^<]*)<\/\1>/g, (_m, tag, a, ko, b) => `<${tag}${a}${b}>${ko}</${tag}>`);
}
const AFF_TOP_KO = `<p class="affTop"><b>Paid Link:</b> eBay 파트너 네트워크(EPN) 제휴사로서 eBay 링크를 통한 적격 구매가 발생하면 OP Box Index가 수수료를 받습니다.</p>`;
const koDate = (iso) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
function staticLeftKo(iso) { return iso > TODAY ? "발매 예정" : iso === TODAY ? "오늘" : "발매됨"; }
function releaseBoxKo(page) {
  const rows = [["영문판", page.releaseEn], ["일본판", page.releaseJp]].sort((x, y) => x[1].localeCompare(y[1]));
  const rowHtml = rows.map(([where, iso]) => `<div class="relRow"><span class="relWhere">${where}</span><b><time datetime="${iso}">${koDate(iso)}</time></b><span class="relLeft" data-release="${iso}">${staticLeftKo(iso)}</span></div>`).join("\n        ");
  const ebay = epnUrl(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`One Piece ${page.code} booster box`)}&_sop=10&customid=rel-ko-${page.slug}`);
  return `<section class="relBox" aria-label="${escapeHtml(page.code)} 발매일">
        ${rowHtml}
        ${AFF_TOP_KO}
        <p class="relBuy"><a class="relBtn" href="${escapeHtml(ebay)}" target="_blank" rel="noopener noreferrer sponsored">이베이 ${escapeHtml(page.code)} 예약판매 매물</a></p>
      </section>`;
}
function renderPageKo(page) {
  const canonical = `https://opboxindex.com/sets/${page.slug}.html`;
  const koCanonical = koCanonicalOf(page);
  const name = seoName(page);
  const modified = pageModified(page);
  const title = `${page.code} 발매일 · 예약판매 박스 가격 | opboxindex`;
  // 설명문 = 이 페이지 표의 값만(발매일·최저 호가). 소개 문구 없음.
  const u = U(page);
  const askBits = [["일본판", u.ask.jp], ["영문판", u.ask.en]].filter(([, a]) => a && a.best).map(([ed, a]) => `${ed} ${usd(a.best.total)}`);
  const desc = `${page.code} ${name} 부스터박스 발매일 영문판 ${page.releaseEn} · 일본판 ${page.releaseJp}${askBits.length ? ` · 최저 호가 ${askBits.join(" · ")} (이베이${u.askAsOf ? `, ${u.askAsOf} 기준` : ""})` : ""}`;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "OP Box Index", item: "https://opboxindex.com/" },
      { "@type": "ListItem", position: 2, name: "한국어 시세", item: "https://opboxindex.com/ko/" },
      { "@type": "ListItem", position: 3, name: page.code, item: koCanonical },
    ],
  };
  const webPage = { "@context": "https://schema.org", "@type": "WebPage", name: title, url: koCanonical, inLanguage: "ko", dateModified: modified };
  const factRows = [...bandaiRows(page).map(([, ko, , html]) => `<tr><th scope="row">${escapeHtml(ko)}</th><td>${html}</td></tr>`),
    ...[...page.facts, marketStatusRow(page)]
      .map(([label, value]) => `<tr><th scope="row">${escapeHtml(FACT_KO[label] || label)}</th><td>${escapeHtml(value)}</td></tr>`)]
    .join("\n          ");
  const cl = CARD_LIST.productOf(page.code);
  const cardListHtml = cl ? `\n      <p class="revCount"><a href="${escapeHtml(page.slug)}-card-list.html">${escapeHtml(page.code)} 공식 카드 리스트</a> · <b>${cl.counts.cards}</b> 장 · 확인 <time datetime="${cl.checked}">${cl.checked}</time></p>` : "";
  return `<!doctype html>
<!-- Generated by tools/generate-upcoming-set-pages.js; edit data/upcoming-set-pages.json. -->
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-P73SE1WVD0');</script>
    <script defer src="/track.js"></script>
    ${detailRobotsMeta()}
    <link rel="canonical" href="${koCanonical}" />
    <link rel="alternate" hreflang="ko" href="${koCanonical}" />
    <link rel="alternate" hreflang="en" href="${canonical}" />
    <link rel="alternate" hreflang="x-default" href="${canonical}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(desc)}" />
    <meta property="og:url" content="${koCanonical}" />
    <meta property="article:published_time" content="${page.published}" />
    <meta property="article:modified_time" content="${modified}" />
    <meta property="og:image" content="https://opboxindex.com/og/og-set-list.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    <script type="application/ld+json">${JSON.stringify(webPage)}</script>
    ${productSchemas(page, koCanonical).map((p) => `<script type="application/ld+json">${JSON.stringify(p)}</script>`).join("\n    ")}
    <link rel="stylesheet" href="../styles.css?v=${CSS_VERSION}" />
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .factTable{width:100%;max-width:720px;border-collapse:collapse;margin:16px 0}.bodyPage table.factTable{width:100%;max-width:720px;min-width:0;font-size:14px}.bodyPage .factTable td{text-align:left;word-break:keep-all;overflow-wrap:break-word}.preTbl td small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}.preTbl td:first-child{white-space:nowrap}.factTable th,.factTable td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}.factTable th{width:36%;color:#9aa4b6;font-weight:600}.sourceNoteA{max-width:760px;color:#9aa4b6;font-size:13px;line-height:1.65}
      .relBox{max-width:720px;margin:14px 0 18px;padding:12px 16px 14px;border:1px solid var(--accent-line);border-radius:12px;background:var(--accent-dim)}
      .relRow{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08)}
      .relWhere{flex:0 0 64px;color:var(--muted);font-size:13px;font-weight:600}
      .relRow b{flex:1 1 auto;font-family:var(--font-display);font-size:19px;line-height:1.25;color:var(--ink)}
      .relLeft{color:var(--accent);font-size:14px;font-weight:700;white-space:nowrap}
      .relBox .affTop{margin:10px 0 0}
      .relBuy{margin:10px 0 0}
      .relBtn{display:inline-block;padding:9px 14px;border-radius:9px;background:var(--accent);color:#06222a;font-weight:700;font-size:14px;text-decoration:none}
      .relBtn:hover,.relBtn:focus-visible{filter:brightness(1.08);text-decoration:underline}
      @media (max-width:420px){.relWhere{flex-basis:100%}.relRow b{font-size:18px}}
      .revTbl{font-size:14px}.revTbl th{width:auto}.revTbl th,.revTbl td{padding:7px 6px}.revTbl td:first-child{white-space:nowrap}.revTbl td small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}.revTbl td:last-child{white-space:nowrap}
      .revCount{margin:4px 0 0;color:var(--muted);font-size:13px}.revCount b{color:var(--ink);font-family:var(--font-display);font-size:17px}
      @media (max-width:720px){.bodyPage table.factTable,.revTbl{display:table;width:100%;-webkit-mask-image:none;mask-image:none}}
      @media (max-width:420px){.revTbl{font-size:13px}.revTbl th,.revTbl td{padding:6px 4px}}
      .koCta{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.koCta a{display:inline-block;padding:11px 18px;border-radius:10px;font-weight:700;text-decoration:none;font-size:14px}.koCta .primary{background:var(--accent);color:#08131a}.koCta .ghost{border:1px solid #2a3140;color:#cfd6e4}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">본문으로 건너뛰기</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>부스터박스 리서치</small></span></a>
      ${navHtmlKo(`ko/${page.slug}.html`, `/sets/${page.slug}.html`)}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow"><a href="./" style="color:var(--muted);text-decoration:none">한국어 시세</a> · 발매 예정 세트 · 공식 확인 ${page.modified}${bandaiChecked(page) ? ` · 반다이 상품 페이지 확인 ${bandaiChecked(page)}` : ""}</p>
      <h1>${escapeHtml(page.code)} ${escapeHtml(name)} 발매일 · 예약판매 박스 가격</h1>
      ${releaseBoxKo(page)}
      ${/* 2026-10-16: 영문판과 같은 순서 — 제품 정보(공식 사실) → 예약가 표. */ ""}
      <h2>제품 정보</h2>
      <table class="factTable text"><tbody>
          ${factRows}
      </tbody></table>
      <p class="sourceNoteA">${page.sourceHtml}</p>
      ${preorderTable(page, true)}
      <p class="articleMeta">데이터: <a href="../about.html">OP Box Index</a> · 갱신 <time datetime="${modified}">${modified}</time> · 게시 <time datetime="${page.published}">${page.published}</time> · <a href="../methodology.html">출처·집계 방법</a></p>${koify(revealedTable(page))}${cardListHtml}
      <div class="koCta">
        <a class="primary" href="./">전 세트 시세표 →</a>
        <a class="ghost" href="../sets/${escapeHtml(page.slug)}.html">영문 상세 →</a>
        <a class="ghost" href="amazon-lottery.html">아마존 응모 안내 →</a>
      </div>
    </main>
    <footer class="footer">
      <p>OP Box Index는 투자 권유가 아닌 데이터 기반 리서치 사이트입니다.</p>
      <nav aria-label="정책 안내"><a href="../about.html">About</a><a href="../methodology.html">Methodology</a><a href="../privacy.html">Privacy</a><a href="../disclaimer.html">Disclaimer</a></nav>
    </footer>
    <script>
      // 남은 날수를 방문자 날짜로 센다(정적 글자는 발매 예정/오늘/발매됨).
      (function () {
        var now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        document.querySelectorAll(".relLeft[data-release]").forEach(function (el) {
          var p = el.getAttribute("data-release").split("-"), d = Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - today) / 86400000);
          el.textContent = d > 1 ? "D-" + d : d === 1 ? "내일" : d === 0 ? "오늘" : "발매됨";
        });
      })();
    </script>
  </body>
</html>
`;
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, "ko"), { recursive: true });
for (const page of source.pages) {
  fs.writeFileSync(path.join(OUTPUT_DIR, `${page.slug}.html`), renderPage(page), "utf8");
  fs.writeFileSync(path.join(ROOT, "ko", `${page.slug}.html`), renderPageKo(page), "utf8");
}
const sm = addUrls(path.join(ROOT, "sitemap.xml"), source.pages.map((p) => ({ loc: koCanonicalOf(p), changed: false })));
console.log(JSON.stringify({ pagesWritten: source.pages.length, koPagesWritten: source.pages.length, sitemapAdded: sm.added, sourceUpdated: source.updated }));
