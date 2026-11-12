// IndexNow 제출 — Bing·Naver·Yandex 등에 갱신을 통지한다. 사이트맵에 있는 URL 만 보낸다.
//
// 2026-10-14 개정(W9): 사이트맵 전체(268개)를 매일 보내던 것을 "본문이 바뀐 URL"(lastmod = 오늘)만으로 줄였다.
// 2026-10-19 개정 — 보내는 묶음 셋(사이트맵 lastmod 규칙 v3 은 그대로 둔다):
//   ① recent  : lastmod ≥ 오늘−2일. 워크플로는 하루 1회라 cron 이 빠진 날(10-15 UTC 실측)의 변경분이 영영 안 나갔다.
//   ② weekly  : 월요일(UTC)마다 AI 답에 인용되는 데이터 페이지 전체. 해시 v3 는 금액·건수를 빼므로 가격만 바뀐 날은 lastmod 가 그대로다
//               — 10/19 실측: 빙 AI 답이 9/21 사본 값(OP-01 $300·EN $1,579, 현재 $299·$1,389)과 9/10 PSA 합계를 인용했다.
//   ③ release : 발매 창(가장 이른 발매일 −31일 ~ +5일) 동안 그 세트의 발매 전 페이지(en·ko)·카드리스트·발매일 기사를 매일.
//               날짜·남은 일수는 해시에서 빠지므로 lastmod 로는 안 잡힌다. 창은 data/upcoming-set-pages.json 의 발매일에서만 나온다.
// Run: node tools/indexnow-submit.js [--date YYYY-MM-DD] [--weekly] [--urls /a.html,/b.html] [--dry-run]
//      (키 파일이 라이브에 배포된 뒤, 워크플로는 커밋·푸시 뒤에)
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const KEY = "3d439f302e46fc08f76ddba4eee3726f";
const HOST = "opboxindex.com";
const SITE = `https://${HOST}`;
const RECENT_DAYS = 2;
const WINDOW_BEFORE = 31, WINDOW_AFTER = 5;
// 가격만 바뀌는 AI 인용 데이터 페이지 — 주 1회 전체(경로 끝이 같은 사이트맵 URL)
const WEEKLY_FIXED = ["/", "/box-prices.html", "/compare.html", "/psa-grading.html", "/psa10-ranking.html", "/market-2026.html", "/sets/index.html", "/cards/", "/ko/", "/ko/cards.html",
  "/articles/one-piece-booster-box-price-guide.html", "/articles/one-piece-booster-box-prices-sea.html", "/articles/japan-vs-english.html", "/articles/japanese-vs-english-box-price-data-2026.html"];
const WEEKLY_SET = /^\/sets\/(?:op|eb|prb)-\d+(?:-english)?\.html$/;   // 세트 22 + 영문판 22 (발매 전 페이지는 아래에서 뺀다)

const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DAY = /^\d{4}-\d{2}-\d{2}$/.test(argOf("--date") || "") ? argOf("--date") : new Date().toISOString().slice(0, 10);
const dry = process.argv.includes("--dry-run");
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function plan(day = DAY, { weekly = process.argv.includes("--weekly"), urls: manual = argOf("--urls") } = {}) {
  const sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const all = [...sm.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => ({
    loc: ((m[0].match(/<loc>([^<]+)<\/loc>/) || [])[1] || "").replace(/&amp;/g, "&"),
    lastmod: (m[0].match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
  })).filter((u) => u.loc);
  const pathOf = (loc) => loc.replace(SITE, "") || "/";
  const byPath = new Map(all.map((u) => [pathOf(u.loc), u.loc]));
  const reasons = new Map();
  const add = (loc, why) => { if (!loc) return; if (!reasons.has(loc)) reasons.set(loc, new Set()); reasons.get(loc).add(why); };
  // ① recent
  const since = addDays(day, -RECENT_DAYS);
  for (const u of all) if (u.lastmod && u.lastmod >= since && u.lastmod <= day) add(u.loc, "recent");
  // ③ release (그리고 ② 에서 발매 전 페이지를 빼는 데 쓴다)
  const up = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data/upcoming-set-pages.json"), "utf8")).pages || []; } catch { return []; } })();
  const upcomingPaths = new Set(up.map((p) => `/sets/${p.slug}.html`));
  const windows = [];
  for (const p of up) {
    const first = [p.releaseEn, p.releaseJp].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "")).sort()[0];
    if (!first) continue;
    const from = addDays(first, -WINDOW_BEFORE), to = addDays(first, WINDOW_AFTER);
    const open = day >= from && day <= to;
    windows.push({ slug: p.slug, from, to, open });
    if (!open) continue;
    for (const pth of [`/sets/${p.slug}.html`, `/ko/${p.slug}.html`, `/sets/${p.slug}-card-list.html`, `/ko/${p.slug}-card-list.html`, "/articles/one-piece-set-list-release-dates.html"]) add(byPath.get(pth), "release");
  }
  // ② weekly (월요일 UTC 또는 --weekly)
  const isMonday = new Date(`${day}T00:00:00Z`).getUTCDay() === 1;
  if (weekly || isMonday) {
    for (const pth of WEEKLY_FIXED) add(byPath.get(pth), "weekly");
    for (const [pth, loc] of byPath) if (WEEKLY_SET.test(pth) && !upcomingPaths.has(pth)) add(loc, "weekly");
  }
  // 수동(추적기 AI2 — 낡은 값을 인용받은 URL 즉시 전송)
  if (manual) for (const pth of manual.split(",").map((s) => s.trim()).filter(Boolean)) add(byPath.get(pth.replace(SITE, "")), "manual");
  const urls = [...reasons.keys()];
  const count = (why) => urls.filter((u) => reasons.get(u).has(why)).length;
  return { day, sitemapUrls: all.length, send: urls.length, recent: count("recent"), weekly: count("weekly"), release: count("release"), manual: count("manual"), recentSince: since, monday: isMonday, windows, urls };
}

module.exports = { plan, WEEKLY_FIXED, WEEKLY_SET };

if (require.main === module) {
  const p = plan();
  const { urls, ...summary } = p;
  console.log(JSON.stringify({ ...summary, sample: urls.slice(0, 5), dryRun: dry }));
  if (!urls.length || dry) process.exit(0);
  fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
  }).then(async (r) => {
    console.log("IndexNow status:", r.status, r.statusText);
    const t = await r.text();
    if (t) console.log(t.slice(0, 300));
    // 실패를 초록불로 숨기지 않는다(2026-11-12 유입 진단): 워크플로 단계는 continue-on-error 라 갱신은 막지 않지만,
    // 2xx 가 아니면 종료 코드 1 + 실행 요약 경고로 남는다. 종전엔 어떤 응답이든 exit 0 이라 Bing 통지가 끊겨도 아무도 몰랐다.
    if (!r.ok) { console.log(`::warning title=IndexNow::IndexNow ${r.status} ${r.statusText} — ${urls.length} URL 통지 실패`); process.exitCode = 1; }
  }).catch((e) => { console.error("failed:", e.message); console.log(`::warning title=IndexNow::IndexNow 요청 실패 — ${e.message}`); process.exitCode = 1; });
}
