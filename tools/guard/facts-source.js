"use strict";
// FACTS-SOURCE — 파생 사실은 tools/build-site-facts.js(빌더)와 tools/market-data-normalizers.js(순수 함수) 두 곳에서만 센다. 2026-10-15 신설.
// 왜: 같은 규칙("가장 비싼 카드"·4주 변동·NM 사용 여부·레어도·PSA 10 달러값·재판 분류·페이지 수정일)을 생성기 20여 개가 각자 다시 셌고,
//     규칙 하나를 바꾸는 데 8개 파일·5번의 맞춰 보기가 들었다. 이제 생성기는 data/derived/site-facts.json(load())만 읽는다 — 원장을 직접 읽는 것은
//     사실이 아닌 값(그래프 점·카드 목록·공식 문구)뿐이다. 여기서는 생성기 코드가 그 선을 넘었는지 본다(값 대조는 pages-vs-facts).
//  (a) 순수 함수 반입 금지 — require("./market-data-normalizers")·build-site-facts 에서 아래 이름을 가져오거나 별칭으로 부르면 FAIL
//  (b) 원장에만 있는 필드 금지 — nmJpy·psa10Ebay·boxMarket·psaFull·graders·marketIndex·reprintRecords·jpMsrpYen … (사실 파일엔 다른 이름으로 들어 있다)
//  (c) 박스 sold 시계열(box-sold-series.json)을 읽은 변수에서 current·release·preRelease·sinceRelease·reprintPct·asOf·outliers 를 읽으면 FAIL(그래프 점·창은 허용)
// 대상: tools/build.js STEPS 의 build-market-index 뒤 generate-*/inject-*/prerender-* 전부 + 페이지 공용 라이브러리(set-page-shared·ai-data-model·ai-data-extras·dataset-coverage).
const { errors, read, exists } = require("./lib");

const checks = ["FACTS-SOURCE"];
const FORBIDDEN = ["priciest", "rawValues", "countedValues", "boxChange28", "nmUsable", "nmUsd", "rawPrice", "tcgSpikes", "psa10Usd", "toUsd", "fxAt", "latestDate", "splitReprints", "enIsReprint", "buildBoxMarket", "rawNmAsk", "psa10Sold", "psaPopulation", "withUsd", "psa10AskRejections", "ageDays", "keyFactsModel", "lowestAsk", "liveAsk", "setPageDate", "rarityCode", "gradingPageRows", "cardListNumbers", "buildGrading", "build"];
const PURE_LIBS = ["market-data-normalizers", "build-site-facts", "card-list-shared", "free-data-records", "card-series-store", "ai-data-extras"];
// packs 에만 있는 이름(사실 파일은 nm·psa10·grading·market·reprint 로 바꿔 담는다). set-facts.json 의 공식 사실(발매일·정가)은 파생이 아니라 여기 없다.
const RAW_FIELDS = ["nmJpy", "nmUpdated", "nmHiddenReason", "nmStock", "priceUsd", "psa10Ebay", "psa10Active", "ebaySold", "psaFull", "psaFullEn", "graders", "graderPop", "marketIndex", "_imgSuffix", "reprintRecords"];
const SERIES_FACTS = ["current", "release", "preRelease", "sinceRelease", "asOf", "outliers", "builtFrom", "staleDays"];   // reprintPct 는 그래프 배지 입력이라 허용(판정 enIsReprint 는 사실 파일)
// ai-data-extras.js 는 빌더(build-site-facts)가 부르는 라이브러리라 원장을 읽어도 된다 — 생성기 쪽에서 그 함수를 다시 부르는지는 (a)가 본다.
const SHARED = ["set-page-shared", "ai-data-model", "dataset-coverage"];

// 주석만 지운다 — 설명문 속 이름(주석의 "priciest")은 호출이 아니다. 문자열은 그대로(require 경로·원장 파일명이 거기 있다),
// 템플릿 문자열 안 ${…} 은 코드라 그 안의 주석까지 지운다(생성기가 템플릿 안에 ${/* 설명 */ ""} 를 쓴다).
const skipStr = (src, i) => { const q = src[i]; let j = i + 1; while (j < src.length && src[j] !== q && src[j] !== "\n") { if (src[j] === "\\") j++; j++; } return j + 1; };
function code(src, i = 0, inExpr = false) {
  let out = "", depth = 0;
  while (i < src.length) {
    const c = src[i], c2 = src.slice(i, i + 2);
    if (c2 === "//") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c2 === "/*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'") { const j = skipStr(src, i); out += src.slice(i, j); i = j; continue; }
    if (c === "`") { const r = template(src, i); out += r.out; i = r.end; continue; }
    if (inExpr) { if (c === "{") depth++; else if (c === "}") { if (depth === 0) return { out, end: i + 1 }; depth--; } }
    out += c; i++;
  }
  return inExpr ? { out, end: i } : out;
}
function template(src, i) {
  let out = "`", j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") { out += src.slice(j, j + 2); j += 2; continue; }
    if (src[j] === "`") return { out: out + "`", end: j + 1 };
    if (src.startsWith("${", j)) { const r = code(src, j + 2, true); out += "${" + r.out + "}"; j = r.end; continue; }
    out += src[j]; j++;
  }
  return { out, end: j };
}

// 한 파일의 위반 목록(순수 함수라 테스트가 가짜 소스를 넣어 볼 수 있다)
function scan(name, src) {
  const out = [], t = code(src);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const libRe = `require\\(\\s*["']\\./(?:${PURE_LIBS.join("|")})(?:\\.js)?["']\\s*\\)`;
  const fnAlt = FORBIDDEN.map(esc).join("|");
  for (const m of t.matchAll(new RegExp(`\\{([^}]*)\\}\\s*=\\s*${libRe}`, "g"))) {
    // 반입만 하고 부르지 않는 재수출(ai-data-model)은 두고, 실제 호출만 잡는다 — 별칭({ priciest: top })이면 별칭으로 부른다
    for (const part of m[1].split(",")) {
      const [src, local = src] = part.trim().split(/\s*:\s*/);
      if (src && FORBIDDEN.includes(src) && new RegExp(`\\b${esc(local)}\\s*\\(`).test(t)) out.push(`${name}: 순수 함수 ${src}() 를 부른다 — 사실은 build-site-facts.js 가 한 번 세고 생성기는 site-facts.json 을 읽는다`);
    }
  }
  for (const m of t.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${libRe}`, "g"))) {
    const hit = t.match(new RegExp(`\\b${esc(m[1])}\\.(${fnAlt})\\s*\\(`));
    if (hit) out.push(`${name}: ${m[1]}.${hit[1]}() — 순수 함수를 생성기에서 부른다`);
  }
  const direct = t.match(new RegExp(`${libRe}\\.(${fnAlt})\\b`));
  if (direct) out.push(`${name}: require(...).${direct[1]} — 순수 함수를 생성기에서 부른다`);
  const raw = t.match(new RegExp(`(?:\\.|\\[\\s*["'])(${RAW_FIELDS.join("|")})\\b`));
  if (raw) out.push(`${name}: 원장 필드 ${raw[1]} 를 직접 읽는다 — 사실 파일(sets[code]·cards[i])의 값을 쓸 것`);
  // (c) 시계열 변수 → 사실 필드
  const vars = [...t.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*box-sold-series/g)].map((m) => m[1]);
  for (const v of vars) {
    for (const m of t.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*[^;\\n]*\\b${esc(v)}\\b[^;\\n]*\\.sets\\b`, "g"))) vars.push(m[1]);
  }
  for (const v of new Set(vars)) {
    const hit = t.match(new RegExp(`\\b${esc(v)}\\b[^;\\n]*\\.(${SERIES_FACTS.join("|")})\\b`));
    if (hit) out.push(`${name}: 시계열 변수 ${v} 에서 ${hit[1]} 을 읽는다 — 현재가·발매 여부·예약판매는 사실 파일 sets[code] 에 있다`);
  }
  return out;
}

function targets() {
  const steps = require("../build").STEPS || [];
  const from = steps.indexOf("build-market-index");
  return [...steps.slice(from + 1).filter((s) => /^(?:generate|inject|prerender)-/.test(s)), ...SHARED].map((s) => `tools/${s}.js`).filter(exists);
}

function run() {
  const files = targets();
  if (files.length < 20) errors.push(`FACTS-SOURCE: 검사 대상 생성기가 ${files.length}개뿐이다 — tools/build.js STEPS 를 못 읽었나`);
  for (const f of files) for (const p of scan(f, read(f))) errors.push(`FACTS-SOURCE: ${p}`);
}

module.exports = { checks, run, scan, code, targets, FORBIDDEN, RAW_FIELDS, SERIES_FACTS };
