// 인기 카드 개별 페이지 생성 — cards/<slug>.html + cards/index.html 허브 + 사이트맵 idempotent
// 대상: NM가 보유 카드 중 상위 N(중복 변형 제거). 카드당 NM/PSA10/인구/이력/박스대비 배수까지 실데이터.
// 2026-10-15(F4): 사실은 전부 data/derived/site-facts.json(tools/build-site-facts.js) 에서 읽는다 — F.sets[code].cards[i] 의
//   nm(usable·usd·date·stock·fresh)·psa10(usd·n·date·stale)·psa10Ask(usd·n·date·url·mid·fresh·buy)·pop(gem)·gradingRows·psaPopHistory·
//   auctionRows·checkpoints·boxMultiple·rankShown·pageDate·rarity·tier, F.sets[code].cardBox·grading.psa.jp·nameEn, F.cardAuction.day, F.cardPages.
//   여기서는 후보 고르기(상위 N·PSA 10 표본·이전 공개분)와 그리기만 한다. 원장 직접 읽기: img/cards/map.json(썸네일 — 사실이 아닌 파일 존재)뿐.
// Run: node tools/generate-card-pages.js
const CSS_VER = (require("fs").readFileSync(require("path").join(__dirname, "..", "packs.js"), "utf8").match(/DATA_VERSION = "([^"]+)"/) || [])[1] || "dev";  // 하드코딩하면 범프 때 가드 V1 이 배포를 막는다(2026-07-27)
const fs = require("fs");
// 화면 크기에 맞는 이미지 파생본(2026-10-08): 머리 카드 사진 100~200KB → 400px(≈40KB), 허브 썸네일 → 96px(≈4KB). 없으면 원본.
const { variant } = require("./image-variants");
const { navHtml } = require("./site-nav");
const { detailRobotsMeta } = require("./adsense-review-gate");
const { syncDetailUrls } = require("./sitemap-detail-urls");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const F = require("./build-site-facts").load();
// 세트별 공식 카드리스트(sets/<code>-card-list.html, 사실 파일 cardLists) — 2026-10-16. 카드 상세 116장·허브에서 가는 링크가 0 이라
// 10-14 에 새로 난 46장이 GSC 에 '알려지지 않은 URL' 로 남았다(사이트맵만으로는 크롤 순서가 뒤로 밀린다).
const CARD_LISTS = Object.fromEntries(F.cardLists.map((p) => [p.code, p]));
// 경매 집계 기준일 — 경매 표 라벨 "last 45 days to <날짜>" 가 쓴다(수정일 pageDate 는 사실 파일이 같은 날짜로 센다). 카드리스트와 같은 값 — 2026-10-15.
const AUC_DAY = F.cardAuction.day;
const SITE = "https://opboxindex.com";
const EPN = "mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339163744&toolid=10001&mkevt=1";
const TOP_N = 24;
// PSA 10 sold 표본 낡음 기준(일) — 라벨 글자용. 판정(psa10.stale)은 사실 파일이 같은 값(PSA10_STALE_DAYS)으로 한다(상세·허브 공통, 2026-10-15).
const PSA10_STALE_DAYS = 35;
// EPN 규정(Participation Requirements I.G.) — 제휴 고지는 "명확하고 눈에 띄게".
// 2026-08-10 EPN 위반 통지: 문구 자체는 적절하나 푸터에 있어 잘 보이지 않는다는 지적.
// 그래서 본문 상단(접힘선 위)에도 넣는다. 푸터의 affNote 는 그대로 둔다 — 둘 중 하나를 지우지 말 것.
// 스타일은 styles.css 의 .affTop. 작게 줄이거나 opacity 를 낮추면 위반으로 되돌아간다.
const AFF_TOP = `<p class="affTop"><b>Paid Link:</b> As an eBay Partner Network affiliate, we earn from qualifying purchases.</p>`;

// 레어도 = 반다이 공식 카드 리스트의 그 인쇄 레어도(사실 파일 cards[i].rarity — 세트·한국어·AI 피드와 같은 코드, 2026-10-15).
// H1 의 작은 레어도 표기도 같은 코드 — 2026-10-15(3차): H1 은 원본 c.rarity(EB03-026 "· SR"), 같은 페이지 "Rarity label" 은 공식 SP 라 한 페이지에 두 값이었다.
// <title> 과 H1 의 카드 이름은 그대로 둔다(SEO 민감 요소).
const { buyCta, BUY_CTA_CSS, KF_CSS, kfTableAny } = require("./set-page-shared");
const usd = (n) => (n == null ? null : "$" + Math.round(n).toLocaleString("en-US"));
const jpy = (n) => (n == null ? null : "¥" + Math.round(n).toLocaleString("en-US"));
const intl = (n) => (n == null ? "" : Number(n).toLocaleString("en-US"));
// 숫자 앞 부정관사 — 읽는 소리가 모음으로 시작하면 "an"(8·80~89·800…, 11·18·11,000…). 2026-10-15(5차): "a 80%"·"a 89%" 가 카드 42장에 나갔다.
// 퍼센트·금액·일수 앞 관사가 모두 이 함수를 쓴다.
const aN = (n) => { const dg = String(Math.floor(Math.abs(Number(n) || 0))); return dg[0] === "8" || (dg.length % 3 === 2 && /^1[18]/.test(dg)) ? "an" : "a"; };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const DATA_DATE = F.dataDate;

// ---- 후보 수집 + 중복 변형 제거(번호+정규화이름 기준; 홈세트 우선). 세트 순서는 원장 적재 순(F.order.packSets) — 동가 정렬이 이 순서를 따른다.
const seen = new Map();
for (const code of F.order.packSets) {
  const s = F.sets[code];
  for (const c of s.cards) {
    if (c.nm.jpy == null || !c.number) continue;
    const key = c.key;
    const isHome = c.number.replace("-", "").toUpperCase().startsWith(code.replace("-", "").toUpperCase());
    const prev = seen.get(key);
    if (!prev || (isHome && !prev.isHome)) seen.set(key, { code, set: s, card: c, isHome });
  }
}
// 상위 TOP_N + **이전에 이미 공개한 카드**. 순위는 시세에 따라 흔들린다 — 2026-08-25 실측으로
// 유유테이 갱신 한 번에 80장 값이 바뀌면서 OP-02 에이스 망가가 24위 밖으로 밀려 페이지가 지워졌다.
// 살아 있던 URL 이 시세 등락 때문에 404 가 되면 안 된다(노출 페이지는 추가만, 임의 제거 금지).
// 밀려난 카드도 계속 만들되 **데이터는 매번 최신으로** 다시 쓴다 — 남겨두는 것과 방치는 다르다.
const keyOfCard = (c) => c.key;
const CARDS_DIR = path.join(ROOT, "cards");
// 이전 공개 목록 = 사실 파일의 카드 페이지 색인(cards/card-map.json 에서 굽는다 — F.cardPages).
const publishedBefore = new Set(F.cardPages.map((p) => p.key));
if (!publishedBefore.size) throw new Error("card-map.json 을 못 읽었다 — 이전 공개 목록 없이 생성하면 살아 있던 페이지가 빠진다");
const top = [...seen.values()].sort((a, b) => b.card.nm.jpy - a.card.nm.jpy).slice(0, TOP_N);
const inTop = new Set(top.map((x) => keyOfCard(x.card)));
// PSA 10 실판매 표본(n>=3)이 있는 카드는 순위와 무관하게 전부 낸다 — 2026-09-07(소유자 지시 "유입 늘려라").
// 카드 단위 "<카드> psa 10 price" 검색이 이 사이트에 오는 가장 구체적인 질문인데, 답이 있는 카드가 88장인데
// 페이지는 28장뿐이었다. 기준을 "실판매 중앙값이 있는가"로 두는 이유: 호가만 있는 카드는 페이지가 얇고
// 값이 흔들린다(빈 값이 틀린 값보다 낫다). 한 번 낸 URL 은 card-map.json 이 지켜서 사라지지 않는다.
const strong = [...seen.values()]
  .filter((x) => !inTop.has(keyOfCard(x.card)))
  .filter((x) => x.card.psa10 != null)   // psa10 = 실판매 표본 3건 이상의 중앙값(사실 파일)
  .sort((a, b) => b.card.nm.jpy - a.card.nm.jpy);
const inStrong = new Set(strong.map((x) => keyOfCard(x.card)));
const keptFromBefore = [...seen.values()]
  .filter((x) => !inTop.has(keyOfCard(x.card)) && !inStrong.has(keyOfCard(x.card)) && publishedBefore.has(keyOfCard(x.card)))
  .sort((a, b) => b.card.nm.jpy - a.card.nm.jpy);
const cands = [...top, ...strong, ...keptFromBefore];

// PSA 인구 — 사실 파일 cards[i].pop(card.graderPop.psa.jp, 번호|tier 변형 매칭 — tools/inject-card-grades.js 산출). 젬률(gem) = PSA 10 ÷ 전체(세트 페이지와 같다).
// 2026-09-29: 종전엔 세트 psa 표에서 "번호 부분일치 + 이름 앞 10자"로 첫 행을 집었다. rarity 를 안 봐서
// 인구를 보여 주던 88장이 전부 틀렸다(0/88 일치). 예: OP13-118 Super AA 와 Red Manga 가 둘 다 4,349(AA 행)였는데
// sets/op-13.html 은 같은 두 카드를 2,574 와 744 로 보여 준다. 나머지 24장은 데이터가 있는데도 비어 있었다.
function popOf(card) {
  const g = card.pop;
  if (!g || !g.total) return null;
  return { total: g.total, psa10: g.g10 || 0, psa9: g.g9 || 0, gem: g.gem, d: g.d };
}

// 등급사 × 판 표 — 사실 파일 cards[i].gradingRows(PSA/CGC/TAG 를 일본판·영문판 따로, 합산 없음, 최고 등급 정의는 세트 페이지와 같다).
// 이 카드의 변형 하나에만 해당하는 값이라, 형제 카드 페이지와 겹치지 않는 고유 데이터다.
const graderRows = (card) => card.gradingRows;
// PSA 인구 관측 이력(일본판) — 사실 파일 cards[i].psaPopHistory(data/psa-card-pop.json 의 이 카드 변형 시계열, 매칭은 inject-card-grades.js 와 같다 —
// 그래야 이 표의 마지막 행이 위 헤드라인 PSA 인구와 같은 값이 된다).
// 2026-09-29(감사 cards-weekly-pop-series-unrendered): 카드별 원장이 111장에 중앙값 10점씩 쌓여 있었는데
// 색인된 어느 페이지에도 나오지 않았다. 카드마다 다른 값이라 형제 페이지와 겹치지 않는다.
// 관측일은 불규칙하다(수집한 날 PSA 공개 보고를 기록) — 그래서 "by week" 가 아니라 "by observation date".
// 음수 증감(재등급·정정)은 화면에 증감으로 띄우지 않는다(audit-grading-numbers.js 와 같은 규칙).
function psaHistorySection(card) {
  const pts = card.psaPopHistory;
  if (pts.length < 2) return "";
  const rows = pts
    .map((p, i) => {
      const prev = i ? pts[i - 1] : null;
      const diff = prev ? p.total - prev.total : null;
      const chg = diff != null && diff > 0 ? `+${intl(diff)}` : "—";
      return `<tr><td>${esc(p.d)}</td><td class="num">${intl(p.total)}</td><td class="num">${intl(p.g10)}</td><td class="num">${Number.isInteger(p.g9) ? intl(p.g9) : "—"}</td><td class="num">${chg}</td></tr>`;
    })
    .reverse() // 최신이 위
    .join("\n        ");
  const first = pts[0], last = pts[pts.length - 1];
  const grew = last.total - first.total;
  // 캡션은 라벨만 — 2026-10-15 소유자 결정(데이터 페이지는 숫자·표·라벨만). "intervals are uneven"·"a smaller total … is shown without a change figure"·
  // "Japanese … only" 설명 문장은 지웠다(판은 제목 "(Japanese)", 음수 증감은 표의 "—"). 관측일 정의와 기간 증가분만 라벨로 남긴다.
  return `
      <h2>${esc(card.name)} PSA population by observation date (Japanese)</h2>
      <table class="dataTable"><thead><tr><th>Observed</th><th class="num">Graded</th><th class="num">PSA 10</th><th class="num">PSA 9</th><th class="num">New since previous</th></tr></thead><tbody>
        ${rows}
      </tbody></table>
      <p class="srcNoteA">Observed = date PSA's report was recorded · ${esc(first.d)} to ${esc(last.d)}: +${intl(grew > 0 ? grew : 0)} graded, ${pts.length} observations · — = no increase or first observation</p>`;
}

function graderSection(card) {
  const rows = graderRows(card);
  if (!rows.length) return "";
  const body = rows
    .map((r) => `<tr><td>${r.grader}</td><td>${r.ed}</td><td class="num">${intl(r.total)}</td><td>${r.topLabel}</td><td class="num">${intl(r.top)}</td><td class="num">${r.share}%</td><td>${esc(r.d || "—")}</td></tr>`)
    .join("\n        ");
  // 캡션은 라벨 하나 — 2026-10-15 소유자 결정. "other printings … are not included"·"counted separately and never summed" 설명 문장은 지웠다
  // (등급사·판은 표의 열로 이미 갈린다). 숫자가 어느 인쇄의 것인지만 라벨로 남긴다.
  return `
      <h2>${esc(card.name)} grading population by grader</h2>
      <table class="dataTable"><thead><tr><th>Grader</th><th>Edition</th><th>Graded</th><th>Top grade</th><th>Top-grade copies</th><th>Share</th><th>As of</th></tr></thead><tbody>
        ${body}
      </tbody></table>
      <p class="srcNoteA">Counts = exact printing ${esc(card.number || "")} ${esc(card.name)}</p>`;
}
// PSA10 표시가(세트 페이지와 동일 규칙: sold n>=3 우선, 아니면 최저 ask) — 사실 파일 cards[i].psa10(관측일 환율로 되돌린 달러) · psa10Ask.
function psa10Of(card) {
  if (card.psa10) return { v: card.psa10.usd, kind: "sold", n: card.psa10.n, date: card.psa10.date };
  if (card.psa10Ask) return { v: card.psa10Ask.usd, kind: "ask", n: card.psa10Ask.n, date: card.psa10Ask.date, url: card.psa10Ask.url };
  return null;
}

// 셀프호스팅 이미지 맵(tools/fetch-card-images.js 산출). 없으면 원본 CDN URL로 폴백.
const IMG_MAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "img", "cards", "map.json"), "utf8")); } catch { return {}; } })();
const localImg = (slug, fallback) => (IMG_MAP[slug] ? `${SITE}/${IMG_MAP[slug]}` : (fallback || null));

fs.mkdirSync(CARDS_DIR, { recursive: true });

// 검색 제목용 이름 분해(2026-09-16). 데이터의 c.name 은 "Monkey D. Luffy 012 Alternate Art Gold Stamped Signature"처럼
// 이름 뒤에 번호 토큰(012 / OP06 119 / OP05-060)과 변형 단어가 붙어 있다. 뒤에서부터 번호·변형 토큰을 떼어
// 이름을 얻고, 변형은 줄여 쓴다(Alternate Art→Alt Art, Gold Stamped Signature→Gold Stamped, (Manga)→Manga).
// 같은 이름+번호의 다른 변형(OP05-119 루피 일반/SP Gold/SP Silver 등)은 변형 단어로 구분된다.
const VARIANT_WORDS = new Set(["alternate", "alt", "art", "manga", "(manga)", "parallel", "sp", "gold", "silver", "super", "red", "box", "topper", "stamped", "signature"]);
function seoName(c) {
  const [setCode = "", num3 = ""] = String(c.number).toLowerCase().split("-");
  const isNumTok = (t) => { const l = t.toLowerCase(); return l === num3 || l === setCode || l === String(c.number).toLowerCase(); };
  const toks = String(c.name).trim().split(/\s+/);
  let i = toks.length;
  while (i > 1 && (isNumTok(toks[i - 1]) || VARIANT_WORDS.has(toks[i - 1].toLowerCase()))) i--;
  const base = toks.slice(0, i).join(" ");
  const variant = toks.slice(i).filter((t) => !isNumTok(t)).join(" ")
    .replace(/\(Manga\)/i, "Manga")
    .replace(/Alternate Art Gold Stamped Signature/i, "Gold Stamped")
    .replace(/Alternate Art/gi, "Alt Art");
  return { base, variant, short: `${base} ${c.number}${variant ? " " + variant : ""}` };
}
const seenTitles = new Set();

const hubItems = [];
const written = [];
for (const { code, set: s, card: c } of cands) {
  // NM = 쓸 수 있는 값만(nmUsable — 값·읽은 날 있음·숨김 표시 없음), 환산은 AI 피드 rawNmAsk.usdEquivalent 와 같은 함수 — 2026-10-15.
  // 종전엔 읽은 날이 없는 3장($1,250·$31·$38)과 숨김 표시 2장($157·$630 Offer)이 화면·Product 에 나갔는데 피드는 null 이었다.
  const nmUsd = c.nm.usd;
  // raw 대 PSA 차이("raw-to-slab spread")를 말하는 절은 이 값과 PSA 10 값(p10)이 둘 다 화면에 있을 때만(5차 검증: PSA 10 없는 5장에 남았다) — 2026-10-15(5차): NM 칸이 "—"인 eb01-061·op07-038 에
  // "…which helps explain its raw-to-slab spread" 가 남아, 화면에 없는 차이를 가리켰다.
  // NM 관측일 = 그 변형을 실제로 다시 읽은 날(nm.date) — 2026-10-15 감사(#10). 종전엔 페이지 빌드일(DATA_DATE)을 "as of" 로 달아
  // 10-11 에 읽은 값이 10-14 값처럼, 09-07 에 읽은 OP09-093 SP Gold 도 10-14 로 나갔다(카드리스트는 10-11). AI 피드·카드리스트와 같은 날짜.
  // 읽은 날이 없는 값(nmUpdated 없음 5장)에는 날짜를 지어 붙이지 않는다.
  const nmDate = nmUsd != null ? c.nm.date : null;
  const p10 = psa10Of(c);
  const pop = popOf(c);
  const slug = slugify(c.number + "-" + c.name);
  const fname = slug + ".html";
  const canonical = `${SITE}/cards/${fname}`;
  // c.img 는 옛 TCGplayer 원격 URL 이다. 오늘 자체호스팅한 c.image 가 있으면 그쪽을 쓴다 —
  // 원격을 그대로 박으면 가드 I1(외부 이미지 핫링크)이 배포를 막는다(2026-07-27 실사고).
  // cards/ 깊이라 상대경로엔 ../ 를 붙인다(가드 I2), og:image 는 절대 URL 이어야 한다.
  const selfHosted = c.image && !/^https?:/.test(c.image) ? c.image.replace(/^\.?\//, "") : null;
  const imgAbs = IMG_MAP[slug] ? `${SITE}/${IMG_MAP[slug]}` : (selfHosted ? `${SITE}/${selfHosted}` : (c.image || c.img || null));
  const imgRel = IMG_MAP[slug] ? `../${IMG_MAP[slug]}` : (selfHosted ? `../${selfHosted}` : (c.image || c.img || null));
  const setSlug = code.toLowerCase();
  // 박스 분모는 세트 페이지·홈과 같은 소스 — 우리 eBay 실거래 주간 중앙값(USD), 사실 파일 sets[code].cardBox(마지막 점이 28일보다 오래되면 null —
  // 낡은 분모로 "currently" 를 쓰면 안 된다). 2026-09-24 전까지는 7월에 멈춘 외부 주간 시리즈(boxSeries)를 써서 같은 세트가 카드 페이지 $148 / 세트 페이지 $129 로 갈렸다.
  const boxUsd = s.cardBox ? s.cardBox.usd : null;
  const boxAsOf = s.cardBox ? s.cardBox.asOf : null;
  const boxMult = c.boxMultiple;
  const rank = c.rank || null;
  // 가격 카드 아래 머리 줄 = 라벨만 — 2026-10-15 소유자 결정(데이터 페이지는 숫자·표·라벨만). 종전 문장 "… is the #1 chase card in …"·
  // "One raw … is currently worth about 63x a sealed … box" 는 라벨(세트·체이스 순위·박스 배수)로 바꾸고,
  // 해석 절("…which helps explain its raw-to-slab spread"·"…so PSA 10 supply is materially smaller …")은 지웠다 — 젬률은 위 가격 카드에 있다.
  const ebayRaw = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`One Piece ${c.number} ${c.name} Japanese`)}&_sop=15&${EPN}`;
  const ebayPsa = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`One Piece ${c.number} PSA 10 Japanese`)}&_sop=15&${EPN}`;
  // PSA 10 최저 실매물 버튼. 검색 링크는 값이 없어 잘 안 눌린다(2026-09-16 실측).
  // 표시가가 sold 중앙값이어도 실매물 URL 은 따로 있으므로 항상 psa10Ask(사실 파일, psa10Active 의 최저 매물)에서 읽는다. buy = EPN 링크로 바꿀 수 있는 매물.
  const pa = c.psa10Ask;
  const psaBuy = pa && pa.buy ? buyCta({
    url: pa.url,
    price: pa.usd,
    mid: pa.mid,
    updated: pa.date,
    label: `PSA 10 ${c.number || c.name}`,
  }) : "";

  // 시리즈(가격 이력) 표 — 체크포인트가 2개 이상 쌓인 카드만 표시(1점짜리 무의미한 표 방지).
  // ※ 2026-07-14 이전 초기 수집은 변형매칭 미성숙으로 오염되어 폐기됨(그 이후부터 신뢰 축적).
  // 이력은 data/card-series.json(2026-10-14 packs.json 에서 분리) — 달러 환산(NM 은 각 시점 환율, PSA 10 은 현재 관측일 뒤 점은 머리와 같은 값)과
  // 못 쓰는 NM 빼기는 사실 파일 cards[i].checkpoints 가 한다(2026-10-15).
  const ser = c.checkpoints;
  // 체크포인트 캡션 = 열 정의만(2026-10-15 소유자 결정) — "… checkpoints use …; missing cells remain unestimated" 설명 절은 지웠다.
  const serRows = ser.length >= 2 ? ser.slice(-6).map((p) => `<tr><td>${esc(p.d)}</td><td class="num">${p.nm != null ? usd(p.nm) : "—"}</td><td class="num">${p.psa != null ? usd(p.psa) : "—"}</td></tr>`).join("") : "";

  // PSA10 sold 값의 나이. 홈(packs.js PSA10_STALE_DAYS=35)과 같은 기준 — 35일 넘은 sold 중앙값으로는 프리미엄을 계산하지 않는다(사실 파일 psa10.stale).
  const p10Stale = !!(p10 && p10.kind === "sold" && c.psa10.stale);

  // 그레이딩 경제성(전부 실데이터 파생 — 추정치 없음)
  // PSA 등급 분포 표(10 / 9 / 8 이하) — 아래 세 갈래가 같은 표를 쓴다(2026-10-15, NM 없는 갈래를 더하며 하나로 묶음).
  const gradeTable = pop ? `<table class="dataTable"><thead><tr><th>Grade</th><th>Population</th><th>Share</th></tr></thead><tbody>
        <tr><td>PSA 10</td><td class="num">${intl(pop.psa10)}</td><td class="num">${pop.total ? Math.round((pop.psa10 / pop.total) * 100) : 0}%</td></tr>
        <tr><td>PSA 9</td><td class="num">${intl(pop.psa9)}</td><td class="num">${pop.total ? Math.round((pop.psa9 / pop.total) * 100) : 0}%</td></tr>
        <tr><td>PSA 8 or lower</td><td class="num">${intl(Math.max(0, (pop.total || 0) - (pop.psa10 || 0) - (pop.psa9 || 0)))}</td><td class="num">${pop.total ? Math.max(0, 100 - Math.round((pop.psa10 / pop.total) * 100) - Math.round((pop.psa9 / pop.total) * 100)) : 0}%</td></tr>
      </tbody></table>` : "";
  let gradeSection = "";
  // 원본 대 PSA 10 = 라벨 한 줄 — 2026-10-15 소유자 결정(데이터 페이지는 숫자·표·라벨만). 종전 판정 문장("no measurable slab premium"·
  // "a narrow … premium … before grading fees"·"this is a market spread, not a guaranteed grading return"·"A current premium is not computed until …")을
  // 지우고, 숫자는 허브(cards/index.html)와 같은 정의 "Premium = PSA 10 ÷ raw NM"(소수 1자리 x) + 차액으로 남긴다. 가격·표본·젬률은 위 가격 카드에 있다.
  // 35일 넘은 sold 중앙값으로는 배수를 내지 않는다(홈 PSA10_STALE_DAYS 와 같은 기준) — 값 대신 "—" 와 그 표본 날짜.
  const premiumLbl = p10 && p10.kind === "ask" ? "PSA 10 lowest listing ÷ raw NM" : "PSA 10 sold median ÷ raw NM";
  if (p10 && nmUsd && p10Stale) {
    gradeSection = `
      <h2>Raw vs PSA 10: is grading worth it here?</h2>
      <p>Premium (${premiumLbl}): <b>—</b> (PSA 10 sample ${esc(p10.date)}, over ${PSA10_STALE_DAYS} days old)</p>
      ${gradeTable}`;
  } else if (p10 && nmUsd) {
    const ratio = p10.v / nmUsd;
    const diff = p10.v - nmUsd;
    gradeSection = `
      <h2>Raw vs PSA 10: is grading worth it here?</h2>
      <p>Premium (${premiumLbl}): <b>${ratio.toFixed(1)}x</b> · difference <b>${diff < 0 ? "−" : "+"}${usd(Math.abs(diff))}</b></p>
      ${pop ? `${gradeTable}
      <p class="srcNoteA">Population = cumulative PSA report, exact printing ${esc(c.name)} ${esc(c.number)}</p>` : ""}`;
  } else if (p10) {
    // PSA 10 값은 있는데 쓸 수 있는 NM 이 없는 카드 — 원본 대비 배수를 계산하지 않고 등급 분포 표만 둔다(2026-10-15).
    gradeSection = pop ? `
      <h2>${esc(c.name)} PSA grade distribution</h2>
      ${gradeTable}` : "";
  } else {
    // PSA10 실거래·인구가 아직 없는 변형(금·은 SP 등) — 추정치를 넣는 건 금지다. 세트 맥락(검증된 값만)을 둔다. 2026-07-30.
    // 2026-10-15 소유자 결정: "No PSA 10 figure is shown … because …" 문장과 "Fallback estimate: none" 을 지우고
    // 값 칸 라벨 하나("PSA 10 sold median: — (fewer than 3 …)")로 바꿨다.
    const sf = s.grading.psa.jp;
    gradeSection = `
      <h2>${esc(c.name)} PSA 10 market status</h2>
      <ul class="factList">
        <li>PSA 10 sold median: — (fewer than 3 exact-printing sales)</li>
        ${sf && sf.total ? `<li>${esc(code)} Japanese PSA submissions: ${intl(sf.total)} · gem rate: ${sf.gemRate}%${sf.wowAdd != null ? ` · latest recorded week: +${intl(sf.wowAdd)}` : ""}</li>` : ""}
        <li><a href="../sets/${setSlug}.html">Open the ${esc(code)} set-level grading and box record</a></li>
      </ul>`;
  }

  // 타이틀 = "<이름> <번호> <짧은 변형> PSA 10 Price" (2026-09-16). 구글은 60자(약 580px) 넘는 제목을 잘라내거나
  // 다시 쓴다 — 전엔 112장 전부 60자 초과였다. 월 표기·"& Population"·브랜드 꼬리를 뺐다.
  const sn = seoName(c);
  // 2026-09-29: (1) 'One Piece' 를 앞에 — 60자에 들어갈 때만. (2) PSA 10 값이 없는 카드(5장)는 제목이 "PSA 10 Price" 인데
  // 본문은 "No PSA 10 figure is shown" 이었다. 그런 카드는 실제로 있는 값(원본 시세·등급 인구)으로 이름 붙인다.
  const tail = p10 ? " PSA 10 Price" : " Price & PSA Population";
  const title = [`One Piece ${sn.short}${tail}`, `${sn.short}${tail}`, `${sn.short} Card Price`].find((t) => t.length <= 60) || `${sn.short}${tail}`;
  // 이 카드번호가 경매에서 실제로 어떻게 팔렸나 — 종료 후 재조회해 쌓은 원장(auction-card-stats.json)에서만 나온다.
  // 2026-09-10: 번호 단위 통계는 변형(패러렐·망가·SP)과 기본판이 섞여 "이 카드" 값으로 쓸 수 없었다(109장 중 50장 오표시).
  // 그래서 판(JP/EN) × 변형(제목에서 읽은 tier, 등급 원장과 같은 ourTier)별로 나눠 표로 보이고 이 카드의 변형 행을 표시한다.
  // 감정품(PSA/CGC/TAG) 경매는 뺐다(다른 시장). 3건 미만 행은 싣지 않는다 — 빈 값이 틀린 값보다 낫다. 행은 사실 파일 cards[i].auctionRows, 이 카드의 변형은 cards[i].tier.
  const AUC_TIER = { base: "Base print", alt: "Alternate art / parallel", super: "Super alternate art (manga)", red: "Red alt art / red manga", sp: "SP", gold: "SP gold", silver: "SP silver", signature: "Signature / stamped", boxtopper: "Box topper", wanted: "Wanted poster", tr: "Treasure rare" };
  const aucMine = c.tier;
  const aucRows = c.auctionRows.map((v) => ({ ed: v.ed, tier: v.tier, v }));
  // PSA10 실거래 표본이 드문 카드는 값이 몇 달 묵기도 한다. 그때 페이지 빌드일(DATA_DATE)로 "Updated" 를 달면
  // 6월 가격이 오늘 값처럼 읽힌다(2026-09-22 실측 18장). 28일 넘으면 그 숫자 옆에 관측일을 붙인다(아래 p10Dated, 2026-10-15 — 종전 35일·월 표기).
  // 설명은 155자 이하. 넘치면 같은 숫자를 압축 표현으로 다시 쓴다(숫자는 그대로, 말만 줄임).
  // 페이지 수정일(Article dateModified·설명의 "Updated") = 이 페이지에 찍히는 관측일 중 가장 늦은 날 — 2026-10-15 감사(#4), 사실 파일 cards[i].pageDate
  // (데이터일·NM 관측일·PSA 10 관측일·구매 버튼 매물 관측일·박스 관측일·경매 기준일·등급사 표 날짜·PSA 인구 이력 마지막 날·체크포인트 마지막 날).
  // 종전엔 DATA_DATE(packs.updated 10-14)라, 등급사 표에 "2026-10-15" TAG 값이 있는 21장의 수정일이 내용보다 일렀다.
  const pageDate = c.pageDate;
  // 설명(meta·og)의 PSA 10 값이 그 설명의 "Updated" 날짜(pageDate)보다 28일(사이트 "현재" 기준, 가드 D17) 넘게 앞서면 관측일을 붙인다 —
  // 2026-10-15 소유자 결정("묵은 중앙값을 현재처럼 쓰지 않는다"). 종전엔 35일 넘을 때만 월("(Jul 2026)")을 붙여,
  // 29~35일 된 sold 중앙값 78장이 "Updated 2026-10-14" 옆에서 오늘 값처럼 읽혔다.
  const p10Dated = p10 && p10.date && (Date.parse(pageDate) - Date.parse(p10.date)) / 864e5 > 28 ? ` (${p10.date})` : "";
  // 2026-10-15(검증): 28일 넘은 PSA 10 sold 중앙값은 날짜를 붙여도 설명(meta·og)에서 현재가처럼 읽힌다 — 소유자 결정 "묵은 값을 현재가로 쓰지 않는다".
  // 그때는 지금 걸려 있는 최저 PSA 10 실매물(bestListing)로 바꾸고, 그것도 없으면 설명에서 PSA 10 값을 뺀다. 화면 표·FAQ 는 날짜와 함께 그대로 둔다.
  const paLow = pa ? pa.usd : null;
  const p10Desc = p10 && !p10Dated ? p10 : (p10Dated && paLow != null ? { kind: "listed", v: paLow } : null);
  // 쓸 수 있는 NM 이 없으면 설명에서 NM 부분을 뺀다(2026-10-15 — "raw Japanese NM $1,250" 이 피드 null 과 갈렸다).
  const descOf = (nmL, p10L, popL, gemL) => {
    const parts = [nmUsd != null ? `${nmL} ${usd(nmUsd)}` : "", p10Desc ? `PSA 10 ${p10Desc.kind === "sold" ? `sold ${p10L}` : "listed from "}${usd(p10Desc.v)}` : "", pop ? `${popL} ${intl(pop.total)} (${pop.gem}% ${gemL})` : ""].filter(Boolean);
    return `${sn.short}: ${parts.length ? parts.join(", ") : "price and PSA population record"}. Updated ${pageDate}.`;
  };
  let desc = descOf("raw Japanese NM", p10 && p10.kind === "sold" ? "median " : "from ", "PSA population", "gem rate");
  if (desc.length > 155) desc = descOf("raw NM", "", "PSA pop", "gem");
  if (title.length > 60 || desc.length > 155) throw new Error(`SEO 길이 초과: ${title.length}/${desc.length} ${c.number} ${c.name}`);
  if (seenTitles.has(title)) throw new Error(`타이틀 중복: ${title}`);
  seenTitles.add(title);

  // 쓸 수 있는 NM 이 없는 카드 — 값이 없다는 문장("No dated Japanese near-mint price is shown for …")은 2026-10-15(4차)에 뺐다.
  // 있는 사실(PSA 10 값·관측일·표본)만 답하고, PSA 10 도 없으면 문답을 싣지 않는다. 화면 FAQ 와 FAQPage 가 같은 배열이다.
  // PSA 10 값 뒤 괄호 = 관측일·표본(n = 판매 건수, sold 일 때만). 두 답이 같은 괄호를 쓴다 — 2026-10-15: "how much" 답은 35일 넘을 때만
  // 월("last observed in Jul 2026")을 달아 29~35일 된 값이 날짜 없이 나갔다.
  const p10Bits = p10 ? [p10.date, p10.kind === "sold" && p10.n ? `n=${p10.n}` : ""].filter(Boolean) : [];
  const p10Paren = p10Bits.length ? ` (${p10Bits.join(", ")})` : "";
  const p10Fact = p10 ? `The PSA 10 ${p10.kind === "sold" ? "sold median" : "lowest verified listing"} for ${c.name} ${c.number} was ${usd(p10.v)}${p10Paren}.` : null;
  // PSA 10 이 없을 때 붙던 "; no PSA 10 figure met the exact-variant sales rule" 은 2026-10-15 소유자 결정으로 뺐다(없는 이유 설명).
  const worthA = nmUsd != null
    ? `On ${nmDate}, ${c.name} ${c.number} was tracked near ${usd(nmUsd)} in Japanese near-mint condition${p10 ? `; its PSA 10 ${p10.kind === "sold" ? "sold median was" : "lowest verified listing was"} ${usd(p10.v)}${p10Paren}` : ""}.`
    : p10Fact;
  // 문답 = 답이 데이터 사실인 것만 — 2026-10-15 소유자 결정. "Which … printing does this page track?"(답이 구매 조언·범위 설명)는 지웠다.
  // 남는 문답이 없으면 FAQ 제목·FAQPage 를 함께 뺀다(화면 FAQ = FAQPage, 가드 L2). 화면은 세트 페이지와 같은 접힌 꼴(details).
  const faq = [
    ...(worthA ? [{ q: `How much is ${c.name} (${c.number}) worth?`, a: worthA }] : []),
    ...(pop ? [{ q: `How rare is a PSA 10 ${c.name}?`, a: `PSA reports ${intl(pop.total)} graded copies of the tracked ${c.name} ${c.number} printing, including ${intl(pop.psa10)} in PSA 10 for ${aN(pop.gem)} ${pop.gem}% gem rate.` }] : []),
  ];
  const faqLd = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  const artLd = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: `${c.name} (${c.number}) price guide`, description: desc, image: imgAbs || `${SITE}/og-image.png`, datePublished: "2026-07-17", dateModified: pageDate, inLanguage: "en-US", mainEntityOfPage: { "@type": "WebPage", "@id": canonical }, author: { "@type": "Organization", name: "OP Box Index", url: SITE + "/" }, publisher: { "@type": "Organization", name: "OP Box Index", url: SITE + "/" }, isAccessibleForFree: true });
  const crumbLd = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "OP Box Index", item: SITE + "/" },
    { "@type": "ListItem", position: 2, name: "Card prices", item: SITE + "/cards/" },
    { "@type": "ListItem", position: 3, name: `${c.name} (${c.number})`, item: canonical }] });

  // Product 스키마 — 세트 페이지와 같은 패턴(2026-09-07). 같은 카드의 상태별 가격이므로 한 상품으로 본다.
  // offers = **지금 나와 있는 호가만** — 2026-10-15 감사(#5). 종전엔 PSA 10 표시가(sold 중앙값)까지 AggregateOffer 범위에 넣고
  // offerCount 를 판매 건수+1 로 적었다(115장 중 92장이 sold 중앙값, 13장은 6~8월 관측인데 InStock). 구글 정의로 Offer 가격은
  // 지금 나와 있는 매물 값이고 offerCount 는 매물 수다 — 지난 판매가는 매물이 아니다(OP13-118: 범위 상한 $14,134 = 7/10 sold,
  // 같은 날 화면의 최저 PSA 10 매물은 $20,668). 그래서 아래 두 호가만 싣는다(지난 판매가는 범위에 넣지 않는다).
  //   ① 일본판 NM 소매 호가 — 실제로 다시 본 날(nm.date)이 28일 이내(nm.fresh)이고 재고 표기가 있을 때. "×" 면 OutOfStock
  //      (AI JSON 의 stockStatus 와 같은 함수 — 한 사실은 한 값).
  //   ② PSA 10 최저 실매물 — 화면 구매 버튼(buyCta)이 보일 때만, 버튼과 같은 값. 관측일(psa10Ask.date) 28일 이내(psa10Ask.fresh).
  // 28일 = 사이트의 "현재" 기준(가드 D17, 위 박스 배수와 같다 — 사실 빌더 CURRENT_DAYS). 둘 다 없으면 Product 를 내지 않는다 —
  // offers 없는 Product 는 Search Console 무효 항목이다(2026-10-14 QA). sold 중앙값은 화면·FAQ·description 에만 남는다.
  // 2026-10-28: 개별 Offer 는 '이 사이트가 판다'는 판매자 등록정보(merchant listing)로 읽혀 서치콘솔이 shippingDetails·
  // hasMerchantReturnPolicy 누락을 경고했다. 우리는 판매자가 아니라 남의 매물 값을 모아 보여 주므로, 구글 문서대로 제품 스니펫용
  // AggregateOffer(위 두 호가의 최저·최고) 하나로 싣는다. 매물 수를 다 세지 않으므로 offerCount 는 그대로 쓰지 않고,
  // 재고는 호가 중 하나라도 있으면 InStock(둘 다 품절 표기일 때만 OutOfStock).
  const nmStock = c.nm.stock;
  const paUsd = pa ? pa.usd : null;
  const asks = [];
  if (Number.isFinite(nmUsd) && nmUsd > 0 && c.nm.fresh && nmStock !== "unknown") asks.push({ usd: Math.round(nmUsd), inStock: nmStock === "in_stock" });
  if (psaBuy && Number.isFinite(paUsd) && paUsd > 0 && pa.fresh) asks.push({ usd: Math.round(paUsd), inStock: true });
  const prodLd = asks.length ? JSON.stringify({
    "@context": "https://schema.org", "@type": "Product",
    name: `One Piece Card Game ${c.number} ${c.name} (Japanese)`,
    image: imgAbs || `${SITE}/og-image.png`,
    description: desc,
    sku: c.number, brand: { "@type": "Brand", name: "Bandai" }, category: "Trading Card Games",
    url: canonical,
    offers: {
      "@type": "AggregateOffer", priceCurrency: "USD",
      lowPrice: Math.min(...asks.map((a) => a.usd)), highPrice: Math.max(...asks.map((a) => a.usd)),
      availability: asks.some((a) => a.inStock) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: canonical,
    },
  }) : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-P73SE1WVD0');
    </script>
    <script defer src="/track.js"></script>
    <!-- No AdSense on noindex card detail pages; eBay EPN links remain active. -->
    <!-- Card details remain noindex and ad-free through the AdSense review window.
         Reconsider indexing separately after enough exact-variant sale history accumulates. -->
    ${detailRobotsMeta()}
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${esc(imgAbs || SITE + "/og-image.png")}" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${artLd}</script>
    ${faq.length ? `<script type="application/ld+json">${faqLd}</script>` : ""}
    <script type="application/ld+json">${crumbLd}</script>
    ${prodLd ? `<script type="application/ld+json">${prodLd}</script>` : ""}
    <link rel="stylesheet" href="../styles.css?v=${CSS_VER}" />
    <script defer src="../lang-toggle.js?v=${CSS_VER}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .cardHero { display: flex; gap: 22px; flex-wrap: wrap; align-items: flex-start; margin: 14px 0 6px; }
      .cardHero img { width: 200px; height: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); }
      .priceCards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 12px 0; max-width: 560px; }
      .pc { border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 12px 14px; background: rgba(20,23,28,.6); }
      .pc span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 3px; }
      .pc b { font-size: 21px; color: #eef2ff; font-variant-numeric: tabular-nums; }
      .pc small { display: block; color: var(--muted); font-size: 11.5px; margin-top: 3px; }
      .pc.hl b { color: var(--accent); }
      .dataTable { width: 100%; max-width: 560px; border-collapse: collapse; margin: 10px 0 6px; font-size: 14px; }
      .dataTable th { text-align: right; padding: 6px 8px; border-bottom: 1px solid #2a3140; color: #9aa4b6; font-weight: 600; }
      .dataTable th:first-child, .dataTable td:first-child { text-align: left; }
      .dataTable td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.06); }
      .dataTable td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .ctaRow { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
      .ctaRow a { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); font-weight: 800; }
      .ctaRow a.primary { background: rgba(var(--accent-rgb), .14); border-color: rgba(var(--accent-rgb), .5); color: var(--accent); }
${BUY_CTA_CSS}
      .srcNoteA { color: var(--muted); font-size: 12.5px; margin: 4px 0 16px; }
      .factList { max-width: 680px; color: #9aa4b6; line-height: 1.7; }
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("../")}
    </header>
    <main id="main-content" class="bodyPage">
      <!-- 허브 링크는 정식 주소(/cards/)로 — index.html 형태는 서치콘솔에 "대체 페이지(표준 태그 있음)"로 쌓인다(2026-09-07) -->
      <p class="eyebrow"><a href="./" style="color:inherit;">Card Prices</a> · ${esc(code)}</p>
      <h1>${esc(c.name)} <small style="color:var(--muted);font-size:.55em;">${esc(c.number)}${c.rarity ? " · " + esc(c.rarity) : ""}</small></h1>
      ${AFF_TOP}
      <div class="cardHero">
        ${imgRel ? (() => { const v = variant(imgRel, "hero"); return `<img src="${esc(v ? v.src : imgRel)}" alt="${esc(`${c.name} ${c.number} One Piece card`)}" width="${v ? v.w : 716}" height="${v ? v.h : 1000}" loading="eager" decoding="async" fetchpriority="high" />`; })() : ""}
        <div style="flex:1;min-width:260px;">
          <div class="priceCards">
            <!-- 표기는 달러 하나로 통일한다(2026-08-17). 엔화 원본은 화면에서 빼고 데이터(CSV/JSON)에 남긴다 —
                 한 줄에 통화가 둘이면 정작 비교해야 할 달러 값이 묻힌다. -->
            <div class="pc hl"><span>Japanese NM (raw)</span><b>${nmUsd != null ? usd(nmUsd) : "—"}</b><small>Japanese retail${nmDate ? ` · as of ${esc(nmDate)}` : ""}</small></div>
            ${p10 ? `<div class="pc"><span>PSA 10 ${p10.kind === "sold" ? "(sold median)" : "(lowest listing)"}</span><b>${usd(p10.v)}</b><small>${p10.kind === "sold" ? `${p10.n} sales` : "ask, not a sale"} · ${esc(p10.date || "")}</small></div>` : ""}
            ${pop ? `<div class="pc"><span>PSA population</span><b>${intl(pop.total)}</b><small>${intl(pop.psa10)} in PSA 10 · ${pop.gem}% gem rate</small></div>` : ""}
          </div>
          <p>Set: <a href="../sets/${setSlug}.html">${esc(`${code} ${s.nameEn || ""}`.trim())}</a>${CARD_LISTS[code] ? ` · <a href="../sets/${setSlug}-card-list.html">${esc(code)} card list</a>` : ""}${c.rankShown ? ` · chase rank <b>#${rank}</b>` : ""}${boxMult && boxMult > 0.8 ? ` · raw NM ÷ sealed ${esc(code)} JP box: <b>${boxMult >= 10 ? Math.round(boxMult) : boxMult.toFixed(1)}x</b> (${usd(boxUsd)} sold median, week of ${esc(boxAsOf)})` : ""}</p>
          <div class="ctaRow">
            ${psaBuy}
            <a class="${psaBuy ? "" : "primary"}" href="${ebayRaw}" target="_blank" rel="noopener noreferrer sponsored">Raw copies on eBay</a>
            <a href="${ebayPsa}" target="_blank" rel="noopener noreferrer sponsored">${psaBuy ? "All PSA 10 listings" : "PSA 10 on eBay"}</a>
          </div>
        </div>
      </div>

      ${serRows ? `<h2>Recent price checkpoints</h2>
      <table class="dataTable"><thead><tr><th>Date</th><th>NM (raw)</th><th>PSA 10</th></tr></thead><tbody>${serRows}</tbody></table>
      <p class="srcNoteA">NM = Japanese retail, raw · PSA 10 = exact-variant eBay sold median</p>` : ""}

      ${gradeSection}
      ${graderSection(c)}
      ${psaHistorySection(c)}

      ${(() => {
        // 행은 위(aucRows — pageDate 앞)에서 계산한다. 캡션 = 라벨만 — 2026-10-15 소유자 결정: "each read again after it closed"·
        // "English rows share the card number but can be a different kind of card …" 설명 문장은 지우고,
        // "Unsold auctions stay in the denominator"·"Rows under 3 sales hidden" 은 정의 라벨(sell-through = sold ÷ ended · rows: 3+ sales)로 바꿨다.
        if (!aucRows.length) return "";
        const tr = aucRows.map(({ ed, tier, v }) => `<tr${(ed === "jp" && tier === aucMine) ? ' class="mine"' : ""}><td>${ed === "jp" ? "Japanese" : "English"}</td><td>${AUC_TIER[tier]}${ed === "jp" && tier === aucMine ? " · this card (Japanese print)" : ""}</td><td>${v.n}</td><td>${v.sold}</td><td>${v.sellThrough != null ? v.sellThrough + "%" : "—"}</td><td>${usd(v.medPrice)}</td><td>${v.low != null && v.high != null ? `${usd(v.low)}–${usd(v.high)}` : "—"}</td></tr>`).join("");
        return `      <h2>${esc(c.number)} at auction — by print and variant</h2>
      <table class="cardTable"><thead><tr><th>Print</th><th>Variant (from listing title)</th><th>Ended</th><th>Sold</th><th>Sell-through</th><th>Median winning bid</th><th>P25–P75</th></tr></thead><tbody>${tr}</tbody></table>
      <p class="priceNote">Settled eBay auctions, last 45 days${AUC_DAY ? ` to ${esc(AUC_DAY)}` : ""} · ungraded · English rows = same card number, variant read from title · sell-through = sold ÷ ended · rows: 3+ sales</p>`;
      })()}
      <h2>${esc(c.name)} variant record</h2>
      <ul class="factList">
        <li>Tracked card number: ${esc(c.number)}</li>
        <li>Tracked name: ${esc(c.name)}</li>
        <li>Rarity label: ${esc(c.rarity || "not supplied")}</li>
        <li>Required listing match: artwork, finish, number and PSA label</li>
        <li><a href="../articles/one-piece-card-price-guide.html">Variant-matching method</a> · <a href="../articles/psa-10-vs-nm-card-prices.html">PSA 10 vs NM method</a></li>
      </ul>

      ${/* 같은 세트의 다른 추적 카드 — 2026-10-07. 카드 페이지 116장이 서로 전혀 링크하지 않아(자기 canonical 1개뿐)
            구글이 7/11 발견 뒤 한 번도 크롤링하지 않은 채 "발견됨 - 색인 안 됨" 145장으로 남았다. 세트 안에서 서로 걸어
            크롤 경로를 만든다. 값은 같은 산식(NM=nmUsd, PSA 10=psa10Of)이라 세트 페이지 TOP10 과 어긋나지 않는다. */ ""}
      ${(() => {
        const sib = cands.filter((x) => x.code === code && x.card !== c)
          .map((x) => ({ card: x.card, nm: x.card.nm.usd, p10: psa10Of(x.card) }))
          .sort((a, b) => (b.nm || 0) - (a.nm || 0));
        if (!sib.length) return "";
        const rows = sib.map((x) => `<tr><td><a href="${slugify(x.card.number + "-" + x.card.name)}.html">${esc(seoName(x.card).short)}</a></td><td class="num">${x.nm != null ? usd(x.nm) : "—"}</td><td class="num">${x.p10 ? `${usd(x.p10.v)}${x.p10.kind === "ask" ? " ask" : ""}` : "—"}</td></tr>`).join("");
        // 캡션 = 열 정의만 — 2026-10-15 소유자 결정. "Same figures as the … set guide" 문장은 지웠다(세트 링크는 머리 줄·푸터에 있다).
        return `<h2>More ${esc(code)} cards tracked here</h2>
      <div class="tableWrap" style="overflow-x:auto"><table class="dataTable"><thead><tr><th>Card</th><th class="num">Japanese NM</th><th class="num">PSA 10</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="srcNoteA">NM = Japanese retail, raw · PSA 10 = eBay sold median; "ask" = cheapest listing</p>`;
      })()}

      ${faq.length ? `<section class="setFaq" aria-label="${esc(c.name)} FAQ">
        <h2>FAQ</h2>
        ${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n        ")}
      </section>` : ""}
    </main>
    <footer class="articleFooter">
      <p class="relatedHead">Related</p>
      <nav class="relatedLinks">
        <a href="../sets/${setSlug}.html">${esc(code)} set guide &amp; box price</a>
        ${CARD_LISTS[code] ? `<a href="../sets/${setSlug}-card-list.html">${esc(code)} official card list — ${CARD_LISTS[code].counts.cards} cards</a>` : ""}
        <a href="../psa10-ranking.html">Most valuable PSA 10 cards</a>
        <a href="./">All tracked cards</a>
        <a href="../about.html">About the research</a>
        <a href="../methodology.html">Methodology</a>
      </nav>
      <p class="affNote">Prices are research references, not offers. As an eBay Partner we may earn a commission from qualifying purchases through eBay links, at no extra cost to you.</p>
    </footer>
  </body>
</html>
`;
  fs.writeFileSync(path.join(CARDS_DIR, fname), html);
  written.push(fname);
  // 허브(cards/index.html)도 개별 카드 페이지와 같은 cards/ 깊이라 ../ 를 유지해야 한다.
  // (과거 .replace("../","") 로 벗겨서 허브 썸네일 24개가 전부 /cards/img/... 404 났음 — 2026-07-21 감사)
  hubItems.push({ slug: fname, name: c.name, number: c.number, code, usd: nmUsd != null ? Math.round(nmUsd) : null, img: imgRel || c.img });
}

// 이번 실행에서 안 만든 카드 페이지 — **지우지 않고 보고만 한다**(2026-08-25).
// 종전엔 바로 unlink 했다. 그 결과 시세가 조금 움직이면 살아 있던 URL 이 404 가 됐다.
// 실제로 남는 경우는 카드 이름이 바뀌어 슬러그가 갈린 때다. 사람이 보고 정리한다: --prune
const currentCardFiles = new Set(written);
const orphans = [];
for (const file of fs.readdirSync(CARDS_DIR)) {
  if (file === "index.html" || !file.endsWith(".html") || currentCardFiles.has(file)) continue;
  orphans.push(file);
}
const pruned = [];
if (process.argv.includes("--prune")) {
  for (const file of orphans) { fs.unlinkSync(path.join(CARDS_DIR, file)); pruned.push(file); }
}

// 세트 페이지가 체이스 표에 링크 걸 수 있게 슬러그 맵 출력 (generate-set-pages.js가 읽음)
const cardMap = {};
for (const it of hubItems) cardMap[it.number + "|" + norm(it.name)] = it.slug;
fs.writeFileSync(path.join(CARDS_DIR, "card-map.json"), JSON.stringify(cardMap, null, 1));

// ---- 허브(cards/index.html)
// ---- raw(NM) vs PSA 10 비교표 — 2026-09-01 신설.
// 왜: GSC 미국 검색어 1위가 "psa 10 vs raw price" / "psa 10 vs raw" 인데(28일 노출 279,
// 클릭 2), 그 답이 되는 표가 색인된 페이지에 없었다. 카드 상세에는 있지만 그 28장은
// 애드센스 심사 기간 동안 noindex 라 검색에 안 나온다. 그래서 색인되는 허브에 싣는다.
// 값은 카드 상세와 같은 원본을 쓴다 — 여기서 따로 계산하지 않는다.
// PSA 10 은 psa10Of(관측일 환율)를 그대로 쓴다. 2026-09-30 전에는 KRW 저장값을 오늘 환율로 되돌려
// 같은 거래가 허브 $15,717 / 카드 상세·랭킹 $14,134 로 갈렸다(KRW 저장 카드 7행).
const gradedRows = (() => {
  const rows = [];
  for (const code of F.order.packSets) {
    for (const c of F.sets[code].cards) {
      // 쓸 수 있는 NM 만(nm.usable, 2026-10-15) — 카드 상세·세트 Top 10·AI 피드와 같은 값.
      const p10 = c.nm.usable ? psa10Of(c) : null;
      if (!p10 || p10.kind !== "sold") continue;
      const rawUsd = c.nm.usd;
      if (!(rawUsd > 0) || !(p10.v > 0)) continue;
      const mult = p10.v / rawUsd;
      // 배수가 비현실적으로 크면 raw 쪽이 잘못 잡힌 것이다(2026-09-01 실측: OP02-059 박스토퍼가
      // raw 가 거의 0 으로 잡혀 557배가 나왔다). 값을 고쳐 쓰지 말고 표에서 뺀다.
      if (mult > 40) continue;
      // 35일 넘은 PSA 10 표본은 배수 칸을 "—" 로 — 카드 상세의 "Premium … —"·홈(packs.js psa10Stale)과 같은 기준(사실 파일 psa10.stale, 2026-10-15).
      // 종전엔 상세가 배수를 내지 않는 카드(OP13-118 등)를 허브만 1.7x 로 보여 한 사실이 두 값이었다.
      const setFile = code.toLowerCase() + ".html";
      rows.push({
        // 배수 = 사실 파일 psa10.multiple(35일·40배 규칙 한 곳, 2026-10-19)
        code, number: c.number, name: c.name, rawUsd, psaUsd: p10.v, mult: c.psa10.multiple, n: p10.n, psaDate: p10.date, nmDate: c.nm.date,
        slug: cardMap[c.key] || null,
        setHref: fs.existsSync(path.join(ROOT, "sets", setFile)) ? `../sets/${setFile}` : null,
      });
    }
  }
  rows.sort((a, b) => b.psaUsd - a.psaUsd);
  return rows;
})();
const psaDates = gradedRows.map((r) => r.psaDate).filter(Boolean).sort();
// Raw NM 관측일 범위 = 행마다 그 변형을 읽은 날(nmUpdated) — 2026-10-15 감사(#10): 종전엔 "Raw NM as of DATA_DATE"(10-14)로 적어
// 10-11·09-07 에 읽은 값을 10-14 값처럼 말했다. 카드 상세·카드리스트·AI 피드와 같은 날짜를 쓴다.
const nmDates = gradedRows.map((r) => r.nmDate).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "")).sort();
const nmSpan = nmDates.length ? (nmDates[0] === nmDates.at(-1) ? nmDates[0] : `${nmDates[0]} to ${nmDates.at(-1)}`) : null;
const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
const gradedTable = gradedRows.length ? `
      <h2 id="psa10-vs-raw">PSA 10 vs raw NM price</h2>
      <div class="tableWrap" style="overflow-x:auto">
      <table class="dataTable">
        <thead><tr><th>Card</th><th>Set</th><th>Raw NM</th><th>PSA 10</th><th>Premium</th><th>Sales</th><th>PSA 10 data</th></tr></thead>
        <tbody>
          ${gradedRows.map((r) => `<tr><td>${r.slug ? `<a href="${esc(r.slug)}">${esc(r.name)}</a>` : esc(r.name)} <small style="color:var(--muted)">${esc(r.number)}</small></td><td>${r.setHref ? `<a href="${esc(r.setHref)}">${esc(r.code)}</a>` : esc(r.code)}</td><td>${money(r.rawUsd)}</td><td>${money(r.psaUsd)}</td><td>${r.mult != null ? `${r.mult.toFixed(1)}x` : "—"}</td><td>${r.n}</td><td>${esc(r.psaDate || "—")}</td></tr>`).join("\n          ")}
        </tbody>
      </table>
      </div>
      <p class="srcNoteA" style="color:var(--muted);font-size:12.5px;margin-top:10px;">Raw NM = Japanese retail single · PSA 10 = median of eBay completed sales, n ≥ 3 matched sales · Premium = PSA 10 ÷ raw NM, PSA 10 sample ≤ ${PSA10_STALE_DAYS} days old · ${nmSpan ? `Raw NM observed ${nmSpan} · ` : ""}PSA 10 sales ${psaDates[0]} to ${psaDates[psaDates.length - 1]}</p>` : "";
// 표 캡션 = 정의 라벨만 — 2026-10-15 소유자 결정(데이터 페이지는 숫자·표·라벨만). 문장 꼴 정의를 "A = B" 라벨로 바꾸고,
// 머리 줄과 겹치던 "N cards have both figures" 는 머리 줄 하나에만 둔다(한 사실 한 값).

// dateModified = 화면 "As of"(DATA_DATE) — 2026-10-19. IndexNow 주간 전송과 함께 빙 사본 날짜를 맞춘다.
const hubLd = JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", name: "One Piece card prices — top tracked cards", dateModified: DATA_DATE, itemListElement: hubItems.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: `${it.name} (${it.number})`, url: `${SITE}/cards/${it.slug}` })) });
const ebayCardHub = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent("One Piece Card Game Japanese")}&_sop=15&${EPN}`;
const hub = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-P73SE1WVD0"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-P73SE1WVD0');
    </script>
    <script defer src="/track.js"></script>
    <!-- Navigation hubs stay ad-free during AdSense site approval. -->
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${SITE}/cards/" />
    <link rel="alternate" hreflang="en" href="${SITE}/cards/" />
    <link rel="alternate" hreflang="ko" href="${SITE}/ko/cards.html" />
    <link rel="alternate" hreflang="x-default" href="${SITE}/cards/" />
    <link rel="icon" href="../favicon.svg" type="image/svg+xml" />
    <title>PSA 10 vs Raw Price — One Piece Card List | OP Box Index</title>
    <meta name="description" content="${gradedRows.length} Japanese One Piece cards with raw NM price, PSA 10 median from completed eBay sales and the grading premium, side by side." />
    <meta property="og:site_name" content="OP Box Index" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="One Piece Card Prices — Top Tracked Cards" />
    <meta property="og:description" content="Raw NM, PSA 10 and population data for the most valuable Japanese One Piece cards." />
    <meta property="og:url" content="${SITE}/cards/" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <script type="application/ld+json">${hubLd}</script>
    <link rel="stylesheet" href="../styles.css?v=${CSS_VER}" />
    <script defer src="../lang-toggle.js?v=${CSS_VER}"></script>
    <meta name="theme-color" content="#0a0c10" />
    <style>
      .cardGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 18px; }
      .cardGrid a { display: block; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 10px; background: rgba(20,23,28,.6); text-align: center; }
      .cardGrid a:hover { border-color: var(--accent); }
      .cardGrid img { display: block; width: 100%; height: auto; border-radius: 8px; }
      .cardGrid b { display: block; font-size: 13px; margin-top: 7px; color: #eef2ff; line-height: 1.3; }
      .cardGrid small { color: var(--muted); font-size: 11.5px; }
      .cardGrid .pr { display: block; color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 800; margin-top: 3px; }
      .clList { list-style: none; padding: 0; margin: 8px 0 18px; max-width: 760px; columns: 2; column-gap: 24px; font-size: 14px; line-height: 1.9; color: var(--muted); }
      .clList li { break-inside: avoid; }
      @media (max-width: 560px) { .clList { columns: 1; } }
${KF_CSS}
    </style>
  </head>
  <body>
    <a class="skipLink" href="#main-content">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="../"><span class="brandMark">OP</span><span><strong>OP Box Index</strong><small>Booster box research</small></span></a>
      ${navHtml("../")}
    </header>
    <main id="main-content" class="bodyPage">
      <p class="eyebrow">Card Prices</p>
      <h1>PSA 10 vs raw price: One Piece card value list</h1>
      ${/* Key facts(2026-10-16) — 머리 줄("Cards with raw NM and PSA 10: N … as of")을 표 꼴로: 같은 N·같은 날짜에 최고 PSA 10 값·관측일 범위를 더한다(값은 gradedRows 그대로). */ ""}
      ${kfTableAny([
        gradedRows[0] ? ["highest", "Highest PSA 10 (sold median)", "최고 PSA 10 (판매 중앙값)", `<b>${money(gradedRows[0].psaUsd)}</b> <small>${esc(gradedRows[0].name)} · ${esc(gradedRows[0].number)} · ${gradedRows[0].n} <span data-ko="건">sales</span>${gradedRows[0].psaDate ? ` · <time datetime="${esc(gradedRows[0].psaDate)}">${esc(gradedRows[0].psaDate)}</time>` : ""}</small>`] : null,
        ["cards", "Cards with raw NM and PSA 10", "NM·PSA 10 둘 다 있는 카드", `<b>${gradedRows.length}</b> <small><span data-ko="인쇄 변형당 한 행">one row per printing variant</span></small>`],
        psaDates.length ? ["psadates", "PSA 10 sold dates", "PSA 10 판매일 범위", `<time datetime="${esc(psaDates[0])}">${esc(psaDates[0])}</time> – <time datetime="${esc(psaDates.at(-1))}">${esc(psaDates.at(-1))}</time>`] : null,
        nmDates.length ? ["nmdates", "Raw NM observed", "NM 관측일", `<time datetime="${esc(nmDates[0])}">${esc(nmDates[0])}</time>${nmDates[0] !== nmDates.at(-1) ? ` – <time datetime="${esc(nmDates.at(-1))}">${esc(nmDates.at(-1))}</time>` : ""}`] : null,
        ["asof", "As of", "기준일", `<time datetime="${esc(DATA_DATE)}">${esc(DATA_DATE)}</time>`],   // 기준일은 표 제목(caption)의 <time> 이 첫 날짜다(2026-10-19)
      ], { label: "Card value list key facts", caption: `<span data-ko="원피스 카드 시세 — NM 대 PSA 10">One Piece card prices — raw NM vs PSA 10</span> · <time datetime="${esc(DATA_DATE)}">${esc(DATA_DATE)}</time>` })}
      ${AFF_TOP}
      ${gradedTable}
      <h2 id="tracked-cards">Raw NM price by card</h2>
      <div class="cardGrid">
        ${hubItems.map((it) => `<a href="${it.slug}">${it.img ? (() => { const v = variant(it.img, "thumb"); return `<img src="${esc(v ? v.src : it.img)}" alt="${esc(it.name)}" width="${v ? v.w : 716}" height="${v ? v.h : 1000}" loading="lazy" decoding="async" />`; })() : ""}<b>${esc(it.name)}</b><small>${esc(it.number)} · ${esc(it.code)}</small><span class="pr">${it.usd != null ? "$" + it.usd.toLocaleString("en-US") : "—"}</span></a>`).join("\n        ")}
      </div>
      <p class="srcNoteA" style="color:var(--muted);font-size:12.5px;margin-top:14px;">NM = raw near-mint Japanese single, Japanese retail</p>
      <p><a href="${ebayCardHub}" target="_blank" rel="noopener noreferrer sponsored">Browse current Japanese One Piece card listings on eBay</a></p>
      ${F.cardLists.length ? `<h2 id="card-lists">Official card lists by set</h2>
      <ul class="clList">
        ${F.cardLists.map((p) => `<li><a href="../sets/${p.slug}-card-list.html"><strong>${esc(p.code)}</strong>${p.name ? " " + esc(p.name) : ""}</a> — ${p.counts.cards} cards · ${p.counts.numbers} card numbers</li>`).join("\n        ")}
      </ul>` : ""}
      ${/* 설명 3문단은 2026-08-28 소유자 지시로 삭제 — TCG 퀀트처럼 표·그리드만.
            2026-10-15 소유자 결정: 머리 문단("… where we have both prices: …"·"Variant-specific — …")과 그리드 캡션의
            "Set pages carry the full top-10 tables; this hub covers the cross-set heavy hitters." 도 라벨로 바꾸거나 지웠다. */ ""}
    </main>
    <footer class="articleFooter">
      <p class="relatedHead">Related</p>
      <nav class="relatedLinks">
        <a href="../psa10-ranking.html">Most valuable PSA 10 cards</a>
        <a href="../articles/one-piece-card-price-guide.html">Card price guide</a>
        <a href="../sets/index.html">All set guides</a>
        <a href="../about.html">About the research</a>
        <a href="../methodology.html">Methodology</a>
      </nav>
      <p class="affNote">OP Box Index is a data-driven research site, not investment advice.</p>
    </footer>
  </body>
</html>
`;
fs.writeFileSync(path.join(CARDS_DIR, "index.html"), hub);

// ---- 사이트맵: 카드 상세는 noindex(2026-07-24 임시) → 사이트맵에서 제거하고 허브(/cards/)만 유지.
//      noindex 페이지를 사이트맵에 두면 GSC 가 "제출됨+색인안됨" 모순으로 계속 표시한다.
const smPath = path.join(ROOT, "sitemap.xml");
// 심사 게이트 상태에 따라 상세 URL 을 빼거나 되돌린다(tools/sitemap-detail-urls.js).
const { removed, added } = syncDetailUrls(smPath, written.map((file) => SITE + "/cards/" + file));
let sm = fs.readFileSync(smPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
if (!sm.includes(`<loc>${SITE}/cards/</loc>`)) {
  sm = sm.replace("</urlset>", `  <url>\n    <loc>${SITE}/cards/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`);
}
fs.writeFileSync(smPath, sm);
console.log(JSON.stringify({ cards: written.length, strong: strong.length, keptFromBefore: keptFromBefore.length, orphans, pruned, sitemapRemoved: removed, sitemapAdded: added }));
