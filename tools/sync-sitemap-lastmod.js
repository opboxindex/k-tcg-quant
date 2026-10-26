#!/usr/bin/env node
// sitemap.xml 의 lastmod 를 "본문이 실제로 바뀐 날"로 맞춘다 — 사이트맵 날짜의 유일한 결정자.
//
// 왜(2026-10-14 개정, W9): 종전엔 git 의 마지막 커밋일을 썼다. 그런데 워크플로 checkout 은 깊이 1(shallow)이라
//   git 로그에 커밋이 하나뿐이고, 매일 메뉴·캐시 키(?v=)·푸터만 바뀌어도 파일이 커밋된다. 그 결과 222개 중 205개가
//   매일 오늘 날짜였다(10-14 실측). 날짜가 매일 같이 오르면 검색엔진은 lastmod 를 신호로 쓰지 않는다
//   (구글 문서: "lastmod 가 일관되게 정확할 때만 쓴다").
//
// 규칙
//  · 본문 해시 = <title> + meta description + <body> 에서 상단 메뉴(header.topbar)·모든 <nav>·<footer>·<script>·<style>·주석을
//    뺀 뒤 태그를 걷어 낸 보이는 글자(이미지는 alt). 캐시 키·번역 속성(data-ko)·class 는 글자가 아니라 해시에 안 든다.
//    날짜 표시도 뺀다 — 글 바이라인(p.articleMeta)·eyebrow·<time> 요소·남은 날수([data-release] 칸)·글 속 날짜 표기.
//    이 정의(bodyText)는 글 dateModified 를 정하는 sync-article-dates.js 도 그대로 쓴다 — 두 도구의 "본문" 이 하나다(2026-10-14 QA:
//    바이라인 순서만 바뀐 글 8개의 lastmod 가 올랐는데 dateModified 는 그대로라 두 날짜가 어긋났다. ja 발매일 표의 "あとN日" 은
//    매일 바뀌어 사실이 그대로인데도 매일 lastmod·IndexNow 가 바뀌었다).
//    이 해시가 지난번과 다를 때만 lastmod 를 오늘로 올린다.
//  · 지난번 해시와 날짜는 data/sitemap-lastmod-state.json 에 둔다(커밋 대상). 해시가 같으면 생성기가 lastmod 를 오늘로 올려
//    놓았더라도 기록된 날짜로 되돌린다 — 이 도구가 생성기·주입기 전부 뒤에서 돈다(워크플로 순서, 가드 SM1).
//  · 상태에 없는 URL(새 페이지·첫 실행)은 사이트맵에 이미 적힌 날짜를 그대로 받는다. --from-git 을 주면 전체 git 이력에서
//    본문 해시가 마지막으로 바뀐 커밋일을 찾아 넣는다(한 번만 쓰는 초기화용, 얕은 clone 에서는 쓰지 않는다).
//  · URL 을 더하거나 빼지 않는다([[opbox-never-deindex]]). 날짜만 바꾼다.
// Run: node tools/sync-sitemap-lastmod.js [--from-git] [--check]
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SM = path.join(ROOT, "sitemap.xml");
const STATE = path.join(ROOT, "data", "sitemap-lastmod-state.json");
const TODAY = new Date().toISOString().slice(0, 10);
// '미래' 판정만 한국 날짜까지 허용한다 — 박스 원장 기준일(collectedAt)은 한국 날짜라, 무인 수집이 09:00 KST(=UTC 자정) 전에
// 끝나면 글 dateModified 가 UTC 오늘보다 하루 앞선다. 2026-10-25 08:59 에 이걸 '미래'로 막아 그날 푸시가 빠지고 클라우드 워크플로(FX·진행매물)가 연달아 실패했다.
const TODAY_KST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// loc → 저장소 안 파일 경로
function locToFile(loc) {
  let p = loc.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
  if (p === "" || p === "/") return "index.html";
  p = decodeURIComponent(p.replace(/^\//, ""));
  if (p.endsWith("/")) p += "index.html";
  if (!/\.[a-z0-9]+$/i.test(p)) p += ".html";
  return p;
}

// 본문만 남긴 글자 — 메뉴·푸터·스크립트·스타일·캐시 키·날짜 표시가 바뀐 날은 "본문이 바뀐 날"이 아니다.
// 사이트맵 lastmod(이 파일)와 글 dateModified(sync-article-dates.js bodyKey)가 이 함수 하나를 쓴다.
const DATE_TEXT = [
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? \d{1,2}(?:, \d{4})?\b/g,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];
// 시세 숫자·건수 토큰도 뺀다 — 2026-10-16(해시 판 3). 금액($·¥·₩·€·£)·백분율·독립 숫자(판매 건수·표본·매물 수·순위·창 일수)는
//   매일 바뀌는 값이라 "본문이 바뀐 날"의 근거가 아니다. 10-16 실측: 269 URL 중 228 이 오늘 날짜(10-15 는 253) — 날짜 토큰만 빼서는
//   매일 85% 가 오르고, 그런 lastmod 는 검색엔진이 신호로 쓰지 않는다(발견됨-미생성 134 전부 미크롤). 글자(세트명·카드명·라벨·행 추가·삭제)가
//   바뀌면 여전히 바뀐 날이다. 카드 번호(OP01-001)·세트 코드(OP-18)·"35d" 처럼 글자·하이픈에 붙은 숫자는 그대로 둔다 — 식별자다.
//   해시 정의가 바뀌는 날은 날짜를 올리지 않는다(HASH_VERSION 재해시 — 기록된 날짜를 그대로 두고 해시만 새로 적는다).
//   판 3 = 어휘 집합: 제목·설명·본문에서 날짜·숫자를 뺀 뒤 "글자가 든 토큰의 집합"(순서·횟수 없음)을 해시한다 — 2026-10-16 실측(어제 21:48 → 오늘 커밋):
//   판 2(토큰 열) 로는 269 중 203 이 여전히 "바뀜" 이었다. 원인은 제목·설명의 "as of 날짜"(판 1·2 는 본문만 걷어냈다)와, 같은 라벨의 데이터 행이
//   하나 늘거나 순서가 바뀌는 것("Japanese 84→85", "— 39→37"). 새 카드명·라벨·절이 생기거나 사라지면 어휘가 바뀌어 여전히 잡힌다.
const NUMBER_TEXT = [
  /[$¥₩€£]\s?\d[\d,]*(?:\.\d+)?[KkMm]?/g,
  /[+\-−±]?\d[\d,]*(?:\.\d+)?\s?%/g,
  /(?<![A-Za-z0-9\-])[+\-−]?\d[\d,]*(?:\.\d+)?(?:x|d|배|원|円|건|장|개|회|일|종|日)?(?![A-Za-z0-9])/g,
];
const HASH_VERSION = 3;
function bodyText(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const desc = (html.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || "";
  let body = html
    .replace(/^[\s\S]*?<\/head>/i, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<header class="topbar"[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<p class="articleMeta">[\s\S]*?<\/p>/gi, " ")
    .replace(/<p class="eyebrow">[\s\S]*?<\/p>/gi, " ")
    .replace(/<time\b[^>]*>[\s\S]*?<\/time>/gi, " ")
    .replace(/(<span\b[^>]*\bdata-release="[^"]*"[^>]*>)[^<]*(<\/span>)/gi, "$1$2")
    // 보이는 글자만 남긴다(이미지는 alt) — data-ko 번역 속성·class·캐시 키처럼 화면 글이 아닌 것이 바뀐 날은 제외.
    .replace(/<img\b[^>]*?\balt="([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
  let text = `${title} ${desc} ${body}`;
  for (const re of DATE_TEXT) text = text.replace(re, " ");
  for (const re of NUMBER_TEXT) text = text.replace(re, " ");
  // 어휘 집합 — 글자(어느 문자든)가 든 토큰만, 중복 없이 정렬. 구두점만 남은 토큰("—"·"·"·"(")은 값이 있다/없다의 흔적이라 뺀다.
  const words = new Set(text.split(/\s+/).filter((t) => /\p{L}/u.test(t)));
  return [...words].sort().join("\n");
}
const bodyHash = (html) => crypto.createHash("sha1").update(bodyText(html)).digest("hex").slice(0, 16);

// { urls, v } — v 는 해시 정의의 판. 없으면 1(날짜 토큰만 뺀 2026-10-14 판).
function readState() {
  try { const j = JSON.parse(fs.readFileSync(STATE, "utf8")); return { urls: j.urls || {}, v: j.v || 1 }; } catch { return { urls: {}, v: HASH_VERSION }; }
}

// --from-git: 그 파일의 본문 해시가 지금과 같아진 가장 이른 커밋일(최신부터 거슬러 같은 해시가 이어지는 구간의 끝).
function gitBodyDate(file, hashNow) {
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  let headHash = null;
  try { headHash = bodyHash(git(["show", `HEAD:${file}`])); } catch { return null; }   // 커밋된 적 없는 새 파일
  if (headHash !== hashNow) return TODAY;                                             // 아직 커밋 안 된 본문 변경
  const revs = git(["log", "--format=%H %cs", "--", file]).split("\n").filter(Boolean).map((l) => l.split(" "));
  // cat-file --batch 한 번으로 모든 판을 받는다(파일당 git 한 번).
  const out = execFileSync("git", ["cat-file", "--batch"], { cwd: ROOT, maxBuffer: 1024 * 1024 * 1024, input: revs.map(([h]) => `${h}:${file}`).join("\n") + "\n" });
  let pos = 0, date = null;
  for (const [, d] of revs) {
    const nl = out.indexOf(10, pos);
    const header = out.slice(pos, nl).toString();
    pos = nl + 1;
    const m = header.match(/ blob (\d+)$/);
    if (!m) break;                                     // 그 판에 파일이 없음(삭제·이름 바뀜) — 여기까지
    const size = Number(m[1]);
    const html = out.slice(pos, pos + size).toString("utf8");
    pos += size + 1;
    if (bodyHash(html) !== hashNow) break;
    date = d;
  }
  return date;
}

function sync({ fromGit = false, write = true } = {}) {
  if (!fs.existsSync(SM)) return { status: "skip", reason: "sitemap 없음" };
  const { urls: state, v } = readState();
  // 해시 정의가 바뀐 첫 실행: 모든 URL 의 날짜를 그대로 두고 해시만 새 정의로 다시 적는다 — 정의 변경을 "본문 변경"으로 치면 269개가 한꺼번에 오늘이 된다.
  const rehash = v !== HASH_VERSION;
  const next = {};
  let sm = fs.readFileSync(SM, "utf8");
  const blocks = [...sm.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
  let raised = 0, restored = 0, seeded = 0, fromHistory = 0, missing = 0, same = 0;
  const samples = [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!loc) continue;
    const file = locToFile(loc.replace(/&amp;/g, "&"));
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) { missing++; continue; }
    const h = bodyHash(fs.readFileSync(abs, "utf8"));
    const cur = (block.match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const st = state[loc];
    let d;
    if (st && (st.h === h || rehash)) d = st.d;
    else if (st) d = TODAY;
    else {
      const g = fromGit ? gitBodyDate(file, h) : null;
      if (g) fromHistory++; else seeded++;
      d = g || cur || TODAY;
    }
    // 글의 JSON-LD dateModified 가 더 늦으면 그 날짜 — 2026-10-16. sync-article-dates 가 본문 "as of" 날짜를 수정일 하한으로 쓰게 되면서
    // 본문 해시(날짜 제외)는 같아도 수정일이 앞설 수 있다. 사이트맵이 글보다 이르면 아래 감사·가드 SM1 이 막는다.
    if (/^articles\//.test(file) || file === "compare.html") {
      const ld = (fs.readFileSync(abs, "utf8").match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1];
      if (ld && ld > d) d = ld;
    }
    next[loc] = { h, d };
    if (cur === d) { same++; continue; }
    const out = cur
      ? block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${d}</lastmod>`)
      : block.replace(/(<loc>[^<]*<\/loc>)/, `$1<lastmod>${d}</lastmod>`);
    sm = sm.replace(block, () => out);
    if (cur && d < cur) restored++; else raised++;
    if (samples.length < 8) samples.push(`${file} ${cur || "(없음)"} → ${d}`);
  }
  if (write) {
    fs.writeFileSync(SM, sm);
    const doc = {
      note: "sitemap.xml lastmod state — written only by tools/sync-sitemap-lastmod.js. h = hash of the page body without menus, footer, scripts, styles, cache keys, dates, prices, percentages and standalone counts (v2, 2026-10-16); d = the day that body last changed (= the URL's lastmod).",
      v: HASH_VERSION,
      urls: Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
    fs.writeFileSync(STATE, `${JSON.stringify(doc, null, 0).replace(/\},"/g, '},\n"')}\n`);
  }
  return { status: "ok", hashVersion: HASH_VERSION, rehashed: rehash, urls: blocks.length, raised, restored, seeded, fromHistory, unchanged: same, missingFile: missing, samples };
}

// 가드 SM1 용 — 사이트맵 날짜가 상태 파일·본문 해시와 맞는지만 본다(쓰지 않는다).
function verify() {
  const problems = [];
  if (!fs.existsSync(SM)) return problems;
  const { urls: state, v } = readState();
  if (v !== HASH_VERSION) return [`상태 파일의 해시 판 v${v} ≠ 도구의 v${HASH_VERSION} — node tools/sync-sitemap-lastmod.js 를 한 번 돌려 해시를 다시 적을 것(날짜는 그대로 남는다)`];
  const sm = fs.readFileSync(SM, "utf8");
  for (const m of sm.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const loc = (m[0].match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const file = loc && locToFile(loc.replace(/&amp;/g, "&"));
    if (!file || !fs.existsSync(path.join(ROOT, file))) continue;
    const cur = (m[0].match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const st = state[loc];
    if (!st) { problems.push(`${loc} 가 상태 파일에 없다`); continue; }
    if (st.h !== bodyHash(fs.readFileSync(path.join(ROOT, file), "utf8"))) problems.push(`${file} 본문이 바뀌었는데 lastmod 를 다시 정하지 않았다`);
    else if (cur !== st.d) problems.push(`${file} lastmod ${cur} ≠ 본문이 바뀐 날 ${st.d}(본문 그대로인데 날짜만 바뀜)`);
    if (cur && cur > TODAY_KST) problems.push(`${file} lastmod ${cur} 가 미래`);
    // 글: 사이트맵 lastmod 가 글의 dateModified 보다 이르면 안 된다(같은 본문 정의 — 본문이 바뀐 날은 두 곳에 같이 찍힌다).
    if (/^articles\/[^/]+\.html$/.test(file) && cur) {
      const ld = (fs.readFileSync(path.join(ROOT, file), "utf8").match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1];
      if (ld && cur < ld) problems.push(`${file} lastmod ${cur} < 글 dateModified ${ld}`);
    }
  }
  return problems;
}

module.exports = { bodyText, bodyHash, locToFile, sync, verify, STATE, HASH_VERSION };

if (require.main === module) {
  if (process.argv.includes("--check")) {
    const p = verify();
    console.log(JSON.stringify({ status: p.length ? "mismatch" : "ok", problems: p.slice(0, 20), count: p.length }));
    process.exit(p.length ? 1 : 0);
  }
  console.log(JSON.stringify(sync({ fromGit: process.argv.includes("--from-git") })));
}
