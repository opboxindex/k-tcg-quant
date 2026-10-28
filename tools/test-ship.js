#!/usr/bin/env node
"use strict";
// tools/ship.js 순수 함수 검사 — 2026-10-28. git·네트워크 없음(check.js 가 모든 관문에서 돌린다 — 빠르고 저장소를 건드리지 않게).
//  · 08:30~09:30 KST 는 막는다(경계: 08:30 막음, 09:30 통과) — 이 PC 시간대와 무관하게 UTC 로 센다
//  · --paths 밖 변경, 비밀·문서 파일, 토큰 모양 문자열을 잡는다(가짜 토큰은 이 파일이 스스로 걸리지 않게 실행 중에 조립한다)
//  · 노출 변경(noindex 추가·canonical/hreflang 변경·사이트맵 URL 제거·페이지 삭제·title 변경)만 잡고,
//    노출을 늘리는 쪽(새 페이지·noindex 해제·사이트맵 추가)과 줄바꿈만 바뀐 페이지는 통과
// Run: node tools/test-ship.js
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseArgs, inCollectionWindow, outside, forbidden, diffLines, secretHits, seoHits } = require("./ship");

// 인자
{
  const ROOT = path.join(__dirname, "..");
  const o = parseArgs(["-m", "fix: x", "--paths", path.join(ROOT, "tools", "a.js"), `${path.join(ROOT, "sets")}${path.sep}`, "--dry-run", "--seo-ok", "--force-window"]);
  assert.equal(o.message, "fix: x");
  assert.deepEqual(o.paths, ["tools/a.js", "sets"], "경로는 저장소 기준 상대·슬래시로");
  assert.ok(o.dryRun && o.seoOk && o.forceWindow);
  assert.throws(() => parseArgs([]), /-m/, "메시지 없이는 못 올린다");
  assert.throws(() => parseArgs(["-m", "x", "--paths"]), /--paths/);
  assert.throws(() => parseArgs(["-m", "x", "--push-anyway"]), /모르는 인자/);
  assert.equal(parseArgs(["--verify", "abc123"]).verify, "abc123");
  assert.throws(() => parseArgs(["--verify"]), /sha/);
}

// 무인 수집 시간 — KST = UTC+9
assert.equal(inCollectionWindow(new Date("2026-10-27T23:29:00Z")), false, "08:29 KST 는 통과");
assert.equal(inCollectionWindow(new Date("2026-10-27T23:30:00Z")), true, "08:30 KST 는 막음");
assert.equal(inCollectionWindow(new Date("2026-10-28T00:29:00Z")), true, "09:29 KST 는 막음");
assert.equal(inCollectionWindow(new Date("2026-10-28T00:30:00Z")), false, "09:30 KST 는 통과");
assert.equal(inCollectionWindow(new Date("2026-10-28T03:00:00Z")), false, "12:00 KST 는 통과");

// --paths 범위 · 금지 파일
assert.deepEqual(outside(["tools/a.js", "sets/op-01.html", "notes.txt", "setsX/y.html"], ["tools/a.js", "sets"]), ["notes.txt", "setsX/y.html"]);
assert.deepEqual(forbidden([".env", "a/.env.local", "x/정산.xlsx", "scan.PDF", "doc.hwp", "id_rsa", "auth.json", "opbox-set-prices.csv", "tools/ship.js", "envoy.html"]),
  [".env", "a/.env.local", "x/정산.xlsx", "scan.PDF", "doc.hwp", "id_rsa", "auth.json"]);

// diff 파싱 · 토큰 모양
{
  const fake = "gh" + "p_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  const pem = "-----BEGIN " + "RSA PRIVATE KEY-----";
  const diff = [
    "diff --git a/tools/x.js b/tools/x.js", "--- a/tools/x.js", "+++ b/tools/x.js", "@@ -1 +1 @@", "-const a = 1;", `+const t = "${fake}";`, "++ not a header",
    "diff --git a/k.txt b/k.txt", "new file mode 100644", "--- /dev/null", "+++ b/k.txt", "@@ -0,0 +1 @@", `+${pem}`,
    "diff --git a/old.html b/old.html", "deleted file mode 100644", "--- a/old.html", "+++ /dev/null", "@@ -1 +0,0 @@", "-<title>Old</title>",
    "diff --git a/ok.js b/ok.js", "--- a/ok.js", "+++ b/ok.js", "@@ -1 +1 @@", "+const k = process.env.GITHUB_TOKEN; // https://x-access-token:<토큰>@github.com 금지",
  ].join("\n");
  const lines = diffLines(diff);
  assert.deepEqual([...lines.keys()], ["tools/x.js", "k.txt", "old.html", "ok.js"]);
  assert.deepEqual(lines.get("tools/x.js").add.length, 2, "본문의 '++' 줄은 머리줄이 아니다");
  assert.deepEqual(lines.get("old.html").del, ["<title>Old</title>"]);
  assert.deepEqual(secretHits(lines), ["tools/x.js", "k.txt"], "토큰·개인키만 잡고 env 참조·설명 문구는 통과");
}

// 노출 변경
{
  const page = ({ robots = "index,follow", canonical = "https://opboxindex.com/sets/op-01.html", ko = "https://opboxindex.com/ko/op-01.html", title = "OP-01 Booster Box Price", body = "" } = {}) =>
    `<!doctype html>\r\n<html><head><title>${title}</title>\r\n<meta name="robots" content="${robots}" />\n<link rel="canonical" href="${canonical}" />\n` +
    `<link rel="alternate" hreflang="en" href="https://opboxindex.com/sets/op-01.html" />\n<link rel="alternate" hreflang="ko" href="${ko}" />\n</head><body>${body}<svg><title>chart</title></svg></body></html>`;
  const M = (path, old, nw) => ({ status: "M", path, old, new: nw });
  const hits = (entries) => seoHits(entries).map((h) => h.split(":")[1].trim().split(/[ "]/)[0]);

  assert.deepEqual(seoHits([M("sets/op-01.html", page(), page({ body: "$350" }).replace(/\r\n/g, "\n"))]), [], "본문·줄바꿈만 바뀌면 통과");
  assert.deepEqual(hits([M("sets/op-01.html", page(), page({ robots: "noindex,follow" }))]), ["noindex"]);
  assert.deepEqual(seoHits([M("ko/op-01.html", page({ robots: "noindex,follow" }), page())]), [], "noindex 해제(노출 늘림)는 통과");
  assert.deepEqual(hits([M("sets/op-01.html", page(), page({ canonical: "https://opboxindex.com/" }))]), ["canonical"]);
  assert.deepEqual(hits([M("sets/op-01.html", page(), page({ ko: "https://opboxindex.com/ko/" }))]), ["hreflang"]);
  assert.deepEqual(hits([M("sets/op-01.html", page(), page({ title: "OP-01 Box" }))]), ["title"]);
  assert.deepEqual(hits([{ status: "D", path: "articles/old.html", old: page(), new: null }]), ["페이지"]);
  assert.deepEqual(seoHits([{ status: "A", path: "articles/new.html", old: null, new: page({ robots: "noindex" }) }]), [], "새 페이지는 허용");
  assert.deepEqual(seoHits([M("tools/x.js", "<title>a</title>", "<title>b</title>")]), [], "HTML 이 아니면 보지 않는다");

  const sm = (urls, extra = "") => `<urlset>${urls.map((u) => `<url><loc>${u}</loc>${extra}</url>`).join("")}</urlset>`;
  const A = "https://opboxindex.com/", B = "https://opboxindex.com/sets/op-01.html", C = "https://opboxindex.com/sets/op-17.html";
  assert.deepEqual(seoHits([M("sitemap.xml", sm([A, B]), sm([A, B, C]))]), [], "사이트맵 추가는 허용");
  assert.match(seoHits([M("sitemap.xml", sm([A, B]), sm([A]))])[0], /URL 1개 제거 — https:\/\/opboxindex\.com\/sets\/op-01\.html/);
  const alt = '<xhtml:link rel="alternate" hreflang="ko" href="https://opboxindex.com/ko/" />';
  assert.match(seoHits([M("sitemap.xml", sm([A, B], alt), sm([A, B]).replace("</url>", `${alt}</url>`))])[0], /hreflang 1개/, "같은 hreflang 줄은 개수로 센다");

  assert.equal(seoHits([M("robots.txt", "a", "b"), M("ads.txt", "a", "b"), { status: "D", path: "googlee0d71bc0695b5651.html", old: "x", new: null }]).length, 3, "검색·광고·소유 확인 파일");
}

console.log(JSON.stringify({ test: "ship", ok: true }));
