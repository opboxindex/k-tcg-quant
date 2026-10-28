#!/usr/bin/env node
"use strict";
// 배포 한 줄 — 2026-10-28 신설(개인 스킬 `opbox-배포`). 손으로 잇던 pull → build → 관문 → 커밋 → push 를 이 파일 한 곳에 고정한다.
//
// 왜: 2026-10-28 `node tools/check.js --gate --fast | tail -2 && git push` 로 이었더니 관문이 FAIL(exit 1)인데도 푸시됐다 —
//   파이프의 종료코드는 마지막 명령(tail)의 것이다. FAIL 원인은 클라우드 커밋을 pull 한 뒤 build 를 안 돌린 낡은 생성물이었다.
//   그래서 순서는 언제나 pull → build → 관문이고, 종료코드는 spawnSync 의 status 로 직접 본다. 셸 파이프는 어디에도 없다.
// 멈춤(종료코드) — 멈추면 이번 실행의 커밋은 남기지 않고, build 가 바꾼 파일(내 파일 안의 날짜 갱신 포함)은 되돌린다 — 시작할 때의 내 변경만 남는다
//   1 예외(git 명령 실패 등)   3 무인 수집과 겹침: 08:30~09:30 KST(--force-window 로 건너뜀) 이거나 작업 스케줄러 opbox-box-sold 실행 중(건너뛸 수 없음)
//   4 --paths 밖의 미커밋 변경(남의 작업·잡파일을 같이 올리지 않는다)   5 pull 실패·충돌(리베이스는 abort 해 시작 상태로)   6 build 실패
//   7 관문(check.js --gate --fast) FAIL — 푸시 금지(소유자 절대 지시)
//   8 비밀·문서 파일(.env·키·엑셀·PDF·한글 문서 등) 또는 토큰 모양 문자열 — 공개 저장소다
//   9 검색 노출 변경(noindex 추가·canonical/hreflang 변경·사이트맵 URL 제거·페이지 삭제·내 페이지 title/h1 변경) — CLAUDE.md 절대 규칙 1, 소유자 확인 뒤 --seo-ok
//   10 push 실패(이번 커밋은 풀어 둔다)   11 원격 주소(토큰 URL·opboxindex@ 없음 — 2026-09-16 GCM 계정 선택 창 사고)   12 push 는 됐는데 미커밋 변경이 남음
// Run: node tools/ship.js -m "<커밋 메시지>" [--paths a b ...] [--dry-run] [--seo-ok] [--force-window]
//      node tools/ship.js --verify <sha>   push 뒤 Pages 배포·라이브 반영 확인(읽기 전용: 공개 API·라이브 GET, 30초 간격 최대 8분 — Bash 포그라운드 한 번(timeout 600000)에 끝난다)
//   --paths   내가 고친 파일·폴더. 이 밖에 미커밋 변경이 있으면 멈춘다. 커밋에는 이 경로 + pull 뒤 build 가 바꾼 생성물이 들어간다.
//   --dry-run 커밋 직전까지(pull·build·검사·관문) 돌고 올라갈 목록만 보여준다. build 가 바꾼 파일은 되돌린다.
//   --force-window 08:30~09:30 시계 검사만 건너뛴다(opbox-box-sold 실행 중 검사는 그대로).
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PAGES_RUNS = "https://api.github.com/repos/opboxindex/k-tcg-quant/actions/workflows/299896261/runs?per_page=10"; // pages-build-deployment
const SITE = "https://opboxindex.com";
const TRAILER = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
const USAGE = 'node tools/ship.js -m "<메시지>" [--paths a b ...] [--dry-run] [--seo-ok] [--force-window] | --verify <sha>';
const TIDY = "고쳐서 같은 명령을 다시 실행하거나, 이번 변경을 버린다면 되돌린다 — 미커밋 변경을 남긴 채 끝내지 않는다(08:30 daily.ps1 이 git add -A 로 검토 없이 올린다).";

// 공개 저장소에 올라가면 안 되는 파일. 회사·개인 자료는 거의 문서 파일이라 확장자로 막는다 — 이 저장소는 문서 파일을 하나도 추적하지 않는다(2026-10-28 git ls-files).
//   .env.example 은 값 없는 공개 견본이라 통과(추적 중인 유일한 .env* 파일).
const FORBIDDEN_FILE = /(^|\/)\.env(\.(?!example$)[^/]*)?$|(^|\/)(id_rsa|id_ed25519)|(^|\/)auth\.json$|\.(pem|key|p12|pfx|xlsx?|xlsm|hwpx?|docx?|pptx?|pdf|zip|7z)$/i;
// 추가되는 줄에 이런 모양이 있으면 막는다(값은 찍지 않는다 — 파일 이름만). GitHub 토큰·개인키·토큰 박힌 URL.
const SECRET_TEXT = /\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|x-access-token:[A-Za-z0-9_]{20,}@/;
// 검색·광고·소유 확인 파일 — 바뀌거나 지워지면 무조건 확인(robots.txt·ads.txt·도메인·IndexNow 키·서치콘솔/네이버 인증).
const PROTECTED = /^(robots\.txt|ads\.txt|CNAME|[0-9a-f]{32}\.txt|google[0-9a-f]+\.html|naver[0-9a-f]+\.html)$/;
// 이 모양이 diff 줄에 없으면 그 페이지의 노출 태그는 그대로다 — 있을 때만 옛/새 본문을 꺼내 정확히 비교한다.
const SEO_LINE = /<title|<h1|canonical|hreflang|robots|noindex/i;

function parseArgs(argv) {
  const o = { message: null, paths: null, dryRun: false, seoOk: false, forceWindow: false, verify: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-m" || a === "--message") o.message = argv[++i];
    else if (a === "--paths") { o.paths = []; while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) o.paths.push(argv[++i]); }
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--seo-ok") o.seoOk = true;
    else if (a === "--force-window") o.forceWindow = true;
    else if (a === "--verify") o.verify = argv[++i];
    else throw new Error(`모르는 인자 ${a} — ${USAGE}`);
  }
  if (o.verify === undefined) throw new Error("--verify 뒤에 커밋(sha)이 없다");
  if (!o.verify && !String(o.message || "").trim()) throw new Error(`-m "<커밋 메시지>" 가 필요하다 — ${USAGE}`);
  if (o.paths && !o.paths.length) throw new Error("--paths 뒤에 경로가 없다");
  if (o.paths) o.paths = o.paths.map((p) => path.relative(ROOT, path.resolve(p)).replace(/\\/g, "/").replace(/\/+$/, ""));
  return o;
}

// 08:30~09:30 KST — 무인 수집(작업 스케줄러 opbox-box-sold → daily.ps1)이 같은 checkout 에서 pull·build·commit·push 하는 시간.
//   겹치면 리베이스가 꼬여 무인 푸시가 멈춘다. 이 PC 시간대와 무관하게 UTC+9 로 센다(한국은 서머타임이 없다).
function inCollectionWindow(d = new Date()) {
  const m = ((d.getUTCHours() + 9) % 24) * 60 + d.getUTCMinutes();
  return m >= 8 * 60 + 30 && m < 9 * 60 + 30;
}
// 09:30 을 넘겨도 무인 작업이 아직 돌 수 있다(10/27 처럼 늦게 끝나는 날) — 작업 스케줄러 상태를 직접 본다. 영어 열거값이라 로캘 무관.
function boxSoldRunning() {
  if (process.platform !== "win32") return false;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", "(Get-ScheduledTask -TaskName opbox-box-sold -ErrorAction SilentlyContinue).State"], { encoding: "utf8" });
  return String(r.stdout || "").trim() === "Running";
}

function git(args, opt = {}) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", "-c", "core.safecrlf=false", ...args], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, input: opt.input,
    env: { ...process.env, GCM_INTERACTIVE: "never", GIT_TERMINAL_PROMPT: "0" }, // 자격증명 선택 창이 뜨면 아무도 못 닫는다(2026-09-16)
  });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opt.allowFail) throw new Error(`git ${args.join(" ")} — exit ${r.status}\n${(r.stderr || r.stdout || "").trim()}`);
  return r;
}
const out = (args) => git(args).stdout;
const zlist = (args) => out([args[0], "-z", ...args.slice(1)]).split("\0").filter(Boolean);
const blob = (rev, p) => { const r = git(["show", `${rev}:${p}`], { allowFail: true }); return r.status === 0 ? r.stdout : null; };
// 미커밋 변경(작업 트리+인덱스 vs HEAD, 내용 기준) + 추적 안 되는 새 파일. git status 는 쓰지 않는다 — core.autocrlf 가 켜진
//   이 PC 에서는 줄바꿈만 다른 생성물을 수백 개씩 M 으로 띄운다(2026-10-28 실측: status 317개, 실제 내용 변경 31개).
const dirtyFiles = () => [...new Set([...zlist(["diff", "--name-only", "HEAD"]), ...zlist(["ls-files", "--others", "--exclude-standard"])])].sort();

const outside = (files, paths) => files.filter((f) => !paths.some((p) => p === "" || f === p || f.startsWith(`${p}/`)));
const forbidden = (files) => files.filter((f) => FORBIDDEN_FILE.test(f));

// `git diff -U0` 출력 → Map(경로 → {add, del}). 머리줄(---/+++)은 diff --git 과 첫 @@ 사이에서만 읽는다(본문의 "++ x" 줄 오인 방지).
function diffLines(text) {
  const files = new Map();
  let cur = null, header = false, from = null;
  for (const line of String(text).split("\n")) {
    if (line.startsWith("diff --git ")) { header = true; cur = null; continue; }
    if (header && line.startsWith("--- ")) { from = line === "--- /dev/null" ? null : line.slice(6); continue; }
    if (header && line.startsWith("+++ ")) { cur = { add: [], del: [] }; files.set(line === "+++ /dev/null" ? from : line.slice(6), cur); continue; }
    if (line.startsWith("@@")) { header = false; continue; }
    if (!cur || header) continue;
    if (line.startsWith("+")) cur.add.push(line.slice(1));
    else if (line.startsWith("-")) cur.del.push(line.slice(1));
  }
  return files;
}
const secretHits = (lines) => [...lines].filter(([, d]) => d.add.some((l) => SECRET_TEXT.test(l))).map(([p]) => p);

// 노출을 정하는 것만 뽑는다 — robots 의 noindex, canonical, hreflang(언어=주소), 첫 <title>, 첫 <h1>(글자만). 줄바꿈은 무시(이 PC 는 CRLF·LF 가 섞인다).
const text = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function pageFacts(html) {
  const s = String(html || "").replace(/\r\n?/g, "\n");
  const tags = (re) => [...s.matchAll(re)].map((m) => m[0]);
  const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i")) || [])[1] || "";
  const links = tags(/<(?:xhtml:)?link\b[^>]*>/gi);
  return {
    noindex: tags(/<meta\b[^>]*>/gi).some((t) => /\bname\s*=\s*["'](robots|googlebot)["']/i.test(t) && /noindex/i.test(attr(t, "content"))),
    canonical: links.filter((t) => /\brel\s*=\s*["']canonical["']/i.test(t)).map((t) => attr(t, "href")).join(" "),
    hreflang: links.filter((t) => /\bhreflang\s*=/i.test(t)).map((t) => `${attr(t, "hreflang")}=${attr(t, "href")}`),
    title: text((s.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""),
    h1: text((s.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || ""),
    locs: [...s.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]),
  };
}
// a 에 있던 것 중 b 에서 빠진 것(중복은 개수로 센다 — 사이트맵은 같은 hreflang 줄이 여러 URL 에 나온다).
function missing(a, b) {
  const left = new Map();
  b.forEach((x) => left.set(x, (left.get(x) || 0) + 1));
  return a.filter((x) => { const n = left.get(x) || 0; if (n) left.set(x, n - 1); return !n; });
}

// title·h1 은 내가 고친 페이지만 본다 — 생성기가 데이터로 바꾸는 title(기준일·주간 날짜·카드 제목 형식)은 무인 워크플로도 매일 올리는
//   정상 변경이라 잡으면 소유자에게 쓸데없는 질문이 간다(2026-10-28 실측: 봇 커밋 6dbf5bb88·8bcd59e3f 에 title 변경 4건).
//   생성기 코드(tools/ 의 테스트 아닌 파일)를 고쳤으면 모든 페이지를 본다 — 그때 바뀐 title 은 내 변경의 결과다.
function titleScope(mine) {
  const set = new Set(mine);
  const gen = mine.some((f) => /^tools\/(?!test-)/.test(f));
  return (p) => gen || set.has(p);
}

// entries: [{status: A|M|D, path, old, new}] — 노출을 줄이거나 바꾸는 것만 잡는다. 새 페이지·사이트맵 추가·noindex 해제는 허용(절대 규칙 1).
//   titleCheck(path) 가 false 인 페이지의 title·h1 변경은 notes 에만 적는다. noindex·canonical·hreflang·사이트맵·삭제·보호 파일은 언제나 잡는다.
function seoHits(entries, titleCheck = () => true, notes = []) {
  const hits = [];
  for (const e of entries) {
    const hit = (why) => hits.push(`${e.path}: ${why}`);
    if (PROTECTED.test(e.path)) { if (e.status !== "A") hit(e.status === "D" ? "삭제(검색·광고·소유 확인 파일)" : "변경(검색·광고·소유 확인 파일)"); continue; }
    if (e.path === "sitemap.xml") {
      const a = pageFacts(e.old), b = pageFacts(e.new);
      const gone = missing(a.locs, b.locs), lang = missing(a.hreflang, b.hreflang);
      if (e.status === "D") hit("사이트맵 삭제");
      else if (gone.length) hit(`사이트맵에서 URL ${gone.length}개 제거 — ${gone.slice(0, 5).join(" ")}`);
      if (e.status !== "D" && lang.length) hit(`사이트맵 hreflang ${lang.length}개 제거·변경 — ${lang.slice(0, 3).join(" ")}`);
      continue;
    }
    if (!/\.html?$/i.test(e.path)) continue;
    if (e.status === "D") { hit("페이지 삭제"); continue; }
    if (e.status !== "M") continue;
    const a = pageFacts(e.old), b = pageFacts(e.new);
    if (!a.noindex && b.noindex) hit("noindex 추가");
    if (a.canonical !== b.canonical) hit(`canonical "${a.canonical}" → "${b.canonical}"`);
    const lang = missing(a.hreflang, b.hreflang);
    if (lang.length) hit(`hreflang 제거·변경 ${lang.join(" ")}`);
    for (const k of ["title", "h1"]) {
      if (!a[k] || a[k] === b[k]) continue;
      const why = `${k} "${a[k]}" → "${b[k]}"`;
      if (titleCheck(e.path)) hit(why); else notes.push(`${e.path}: ${why}`);
    }
  }
  return hits;
}

function stop(code, msg, list = [], tail = "") {
  console.log(`\nship STOP ${code} — ${msg}`);
  list.slice(0, 40).forEach((l) => console.log(`  ${l}`));
  if (list.length > 40) console.log(`  … 외 ${list.length - 40}개`);
  if (tail) console.log(tail);
  process.exit(code);
}
// build·관문은 출력을 그대로 흘려 보여주고(진행 상황), 종료코드만 받는다.
function runNode(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  return r.error ? 1 : (r.status ?? 1);
}
const changedPages = (files) => files.filter((p) => /\.html$/.test(p) && !p.startsWith("_"));
// staged 는 merge-base 기준이라 아직 안 올린 커밋의 파일까지 들어 있다 — 이번 커밋 파일과 따로 센다.
const count = (fresh, ahead, total) => `이번 커밋 파일 ${fresh}개${ahead ? ` · 아직 안 올린 커밋 ${ahead}개 포함 합계 파일 ${total}개` : ""}`;
const inRebase = () => ["rebase-merge", "rebase-apply"].some((d) => fs.existsSync(path.resolve(ROOT, out(["rev-parse", "--git-path", d]).trim())));
// 시작할 때의 내 파일 내용(pull 직후·build 전). 내가 지운 파일은 null.
const snapshot = (files) => new Map(files.map((f) => { const p = path.join(ROOT, f); return [f, fs.existsSync(p) ? fs.readFileSync(p) : null]; }));
// build 가 바꾼 것을 되돌린다(멈출 때·--dry-run·push 실패). 내 파일은 시작 내용으로 — build 가 그 안에 넣은 글 날짜 갱신 등도 빠진다.
//   왜: 생성물이 남으면 ① 같은 명령을 다시 돌릴 때 '--paths 밖 변경'(4)으로 멈추고 ② 08:30 daily.ps1 이 검토 없이 올린다.
//   생성물은 커밋된 data/ 에서 결정적으로 다시 구워지니(tools/build.js) 버려도 잃는 것이 없다 — 다시 돌리면 똑같이 다시 굽는다.
function restoreBuild(snap) {
  git(["reset", "-q"]);
  const tracked = zlist(["diff", "--name-only", "HEAD"]).filter((f) => !snap.has(f));
  const fresh = zlist(["ls-files", "--others", "--exclude-standard"]).filter((f) => !snap.has(f));
  for (let i = 0; i < tracked.length; i += 200) git(["checkout", "HEAD", "--", ...tracked.slice(i, i + 200)]); // 명령줄 길이 한도
  fresh.forEach((f) => fs.rmSync(path.join(ROOT, f), { force: true }));
  let mine = 0;
  for (const [f, buf] of snap) {
    const p = path.join(ROOT, f), now = fs.existsSync(p) ? fs.readFileSync(p) : null;
    if (buf === null ? now === null : now && now.equals(buf)) continue;
    if (buf === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, buf);
    mine++;
  }
  return tracked.length + fresh.length + mine;
}

function ship(o) {
  // 0. 무인 수집과 겹치지 않게. 실행 중 검사는 --force-window 로도 건너뛰지 않는다 — 같은 폴더에서 동시에 pull·push 하는 것이 막으려는 사고 그 자체다.
  if (!o.forceWindow && inCollectionWindow()) stop(3, "지금은 무인 수집 시간(08:30~09:30 KST)이다. 09:30 뒤에 다시 — box-sold.log 로 오늘 무인 작업이 끝났다고 확인했으면 --force-window(시계 검사만 건너뛴다)");
  if (boxSoldRunning()) stop(3, "작업 스케줄러 opbox-box-sold(daily.ps1)가 실행 중이다. box-sold.log 가 done/stop 을 찍은 뒤 다시(--force-window 로도 건너뛰지 않는다)");
  // 1. 원격 — 토큰 박힌 주소 금지, username opboxindex 고정(GCM 에 github 계정이 둘이라 username 이 없으면 선택 창 → 무인 작업 정지)
  //   set-url 만으로는 따로 잡힌 remote.origin.pushurl 이 그대로라 --push 도 같이 바꾼다.
  const fix = "git remote set-url origin https://opboxindex@github.com/opboxindex/k-tcg-quant.git && git remote set-url --push origin https://opboxindex@github.com/opboxindex/k-tcg-quant.git";
  const pushUrl = out(["remote", "get-url", "--push", "origin"]).trim();
  if (/\/\/[^/@]*:[^/@]*@/.test(pushUrl)) stop(11, `origin 주소에 비밀번호·토큰이 들어 있다(주소는 찍지 않는다). 토큰 URL 금지 — ${fix}`);
  if (!/^https:\/\/opboxindex@github\.com\/opboxindex\/k-tcg-quant(\.git)?$/.test(pushUrl)) {
    if (!o.dryRun) stop(11, `origin push 주소가 https://opboxindex@github.com/opboxindex/k-tcg-quant.git 이 아니다 — ${fix}`);
    console.log("주의: origin push 주소가 opboxindex@ 주소가 아니다(--dry-run 이라 계속 — 실제 push 는 멈춘다)");
  }
  // 2. 범위 — 시작 시점의 미커밋 변경이 전부 내 작업인지
  const before = dirtyFiles();
  if (o.paths) {
    const extra = outside(before, o.paths);
    if (extra.length) stop(4, `--paths 밖의 미커밋 변경 ${extra.length}개 — 남의 작업이면 건드리지 말고 그 작업자에게, 내 것이면 --paths 에 더한다`, extra);
    const idle = o.paths.filter((p) => !before.some((f) => f === p || f.startsWith(`${p}/`)));
    if (idle.length) console.log(`참고: --paths 중 변경 없는 경로 ${idle.join(" ")}`);
  }
  const early = forbidden(before);
  if (early.length) stop(8, "공개 저장소에 올리면 안 되는 파일이 작업 트리에 있다 — 저장소 밖으로 옮긴다(.gitignore 로 숨기지 말고)", early);
  console.log(`ship: 미커밋 변경 ${before.length}개${before.length ? ` — ${before.slice(0, 8).join(" ")}${before.length > 8 ? " …" : ""}` : ""}`);

  // 3. pull — 남의 커밋(클라우드 워크플로·daily.ps1)을 먼저 받는다. 충돌은 종료코드만 믿지 않고 미병합 파일·autostash 잔여로도 본다.
  const stashes = () => out(["stash", "list"]).split("\n").filter(Boolean).length;
  const stash0 = stashes();
  console.log("\nship: git pull --rebase --autostash origin main");
  const pull = git(["pull", "--rebase", "--autostash", "origin", "main"], { allowFail: true });
  const said = `${pull.stdout || ""}\n${pull.stderr || ""}`.split("\n").map((l) => l.trim()).filter((l) => l && !/\|\s+\d+|files? changed|^From |^\* branch|autostash/i.test(l));
  console.log(`  ${said.slice(-2).join(" · ") || (pull.status === 0 ? "ok" : "")}`);
  const unmerged = zlist(["diff", "--name-only", "--diff-filter=U"]);
  if (pull.status !== 0 || unmerged.length || stashes() > stash0) {
    // 리베이스 도중에 두지 않는다 — 그대로 두면 다음 실행도 08:30 daily.ps1 도 같은 자리에서 막힌다. abort 는 autostash 도 되돌려 놓는다(daily.ps1 ResolveConflicts 와 같다).
    const said2 = String(pull.stderr || pull.stdout).trim();
    const aborted = inRebase() && git(["rebase", "--abort"], { allowFail: true }).status === 0;
    const who = /auto-detect email|user\.email|tell me who you are/i.test(said2);
    stop(5, `pull 이 깨끗하게 끝나지 않았다${aborted ? " — 리베이스는 abort 해 시작 상태로 돌려놨다" : ""}`, [...said2.split("\n").slice(-8), ...unmerged.map((f) => `미병합: ${f}`)],
      who ? "git 신원(user.name·user.email)이 없다 — 이 checkout 의 git 설정 문제라 소유자에게 보고한다."
        : "미병합이 전부 생성물(daily.ps1 Regenerable)이면 손으로: git pull --rebase --autostash origin main → git checkout --ours -- <생성물들>(리베이스 중 --ours = origin/main) → git add -A → GIT_EDITOR=true git rebase --continue → 같은 명령. " +
          `소스·원장 충돌은 손으로 합치거나 소유자에게.${inRebase() ? " 아직 리베이스 중이다 — 먼저 git rebase --abort." : ""}${stashes() > stash0 ? " autostash 가 남았다 — git stash list." : ""}`);
  }
  const base = out(["merge-base", "HEAD", "origin/main"]).trim();
  const mine = [...new Set([...before, ...zlist(["diff", "--name-only", base, "HEAD"])])]; // 내 미커밋 변경 + 아직 안 올린 커밋의 파일
  const snap = snapshot(before);
  // 여기부터 멈추면 build 산출물을 되돌리고 멈춘다 — 같은 명령을 그대로 다시 돌릴 수 있게.
  const fail = (code, msg, list = []) => { const n = restoreBuild(snap); stop(code, msg, list, `${TIDY}\n(build 가 바꾼 파일 ${n}개는 되돌렸다 — 시작할 때의 내 변경만 남아 있다)`); };

  let staged, fresh, ahead;
  try {
    // 4. build — pull 뒤에 반드시(10/28 FAIL 의 원인). 5. 관문은 검사 뒤에.
    console.log("\nship: node tools/build.js");
    if (runNode([path.join("tools", "build.js")]) !== 0) fail(6, "build 실패 — 위 FAIL 단계 출력을 본다");

    // 6. 올라갈 것 전부 스테이징 → 비밀·문서·노출 검사(관문보다 먼저 — 빨리 멈춘다)
    git(["add", "-A"]);
    const t = zlist(["diff", "--cached", "--name-status", "--no-renames", base]);
    staged = [];
    for (let i = 0; i + 1 < t.length; i += 2) staged.push({ status: t[i][0], path: t[i + 1] });
    const bad = forbidden(staged.filter((e) => e.status !== "D").map((e) => e.path));
    if (bad.length) fail(8, "공개 저장소에 올리면 안 되는 파일", bad);
    const lines = diffLines(out(["diff", "--cached", "-U0", "--no-renames", "--no-color", base]));
    const leaks = secretHits(lines);
    if (leaks.length) fail(8, "토큰·개인키 모양 문자열이 추가된다(값은 찍지 않는다) — 그 줄을 지운다", leaks);
    const touched = (p) => { const d = lines.get(p); return !!d && [...d.add, ...d.del].some((l) => SEO_LINE.test(l)); };
    const entries = staged
      .filter((e) => e.status === "D" || PROTECTED.test(e.path) || e.path === "sitemap.xml" || (e.status === "M" && /\.html?$/i.test(e.path) && touched(e.path)))
      .map((e) => ({ ...e, old: e.status === "A" ? null : blob(base, e.path), new: e.status === "D" ? null : blob("", e.path) }));
    const notes = [];
    const seo = seoHits(entries, titleScope(mine), notes);
    if (notes.length) console.log(`참고: 생성기가 데이터로 바꾼 title·h1 ${notes.length}건 — 내 페이지가 아니라 잡지 않는다(무인 워크플로도 같은 변경을 올린다) ${notes.slice(0, 2).join(" · ")}`);
    if (seo.length && !o.seoOk) fail(9, `검색 노출 변경 ${seo.length}건 — 소유자 확인 필수(CLAUDE.md 절대 규칙 1). 확인받았으면 같은 명령에 --seo-ok`, seo);
    if (seo.length) console.log(`노출 변경 ${seo.length}건 — --seo-ok(소유자 확인됨)로 진행:\n${seo.map((s) => `  ${s}`).join("\n")}`);

    // 7. 관문 — 무인(daily.ps1)·워크플로와 같은 것. 종료코드를 직접 본다(파이프 금지의 이유).
    console.log("\nship: node tools/check.js --gate --fast");
    const gate = runNode([path.join("tools", "check.js"), "--gate", "--fast"]);
    if (gate !== 0) fail(7, `관문 FAIL(exit ${gate}) — push 하지 않는다. 위 '── 검사 이름' 아래 이유를 고친 뒤 다시`);

    ahead = Number(out(["rev-list", "--count", `${base}..HEAD`]).trim());
    fresh = zlist(["diff", "--cached", "--name-only", "HEAD"]).length; // 이번 커밋에 들어갈 파일(staged 는 아직 안 올린 커밋까지 합친 것)
    const message = /co-authored-by:/i.test(o.message) ? o.message.trim() : `${o.message.trim()}\n\n${TRAILER}`;
    if (!fresh && !ahead) { console.log("\nship OK — 올릴 것이 없다(작업 트리 깨끗, origin/main 과 같음)"); return; }
    if (o.dryRun) {
      const n = restoreBuild(snap);
      console.log(`\nship DRY-RUN OK — 커밋·push 직전에 멈췄다. ${count(fresh, ahead, staged.length)}:`);
      staged.slice(0, 40).forEach((e) => console.log(`  ${e.status} ${e.path}`));
      if (staged.length > 40) console.log(`  … 외 ${staged.length - 40}개`);
      console.log(`커밋 메시지:\n${message.replace(/^/gm, "  | ")}`);
      console.log(`build 가 바꾼 파일 ${n}개는 되돌렸다. 올리려면 --dry-run 없이 같은 명령(그때 다시 굽는다).`);
      return;
    }
    // 8. 커밋
    if (fresh) git(["commit", "-q", "-F", "-"], { input: `${message}\n` });
  } catch (e) {
    const n = restoreBuild(snap);
    const why = String(e.message).split("\n");
    stop(1, `예외 — ${why[0]}`, why.slice(1, 7), `위 오류를 고친 뒤 같은 명령. (build 가 바꾼 파일 ${n}개는 되돌렸다 — 시작할 때의 내 변경만 남아 있다)`);
  }

  // 9. push — 실패하면 이번 커밋을 푼다. 커밋을 남기면 다시 돌릴 때 그 커밋(생성물 수십 개)이 봇이 새로 구운 main 위로 리베이스되며 생성물마다 충돌한다(2026-10-28 검증).
  const sha = out(["rev-parse", "HEAD"]).trim();
  console.log(`\nship: git push origin HEAD:main  (${sha.slice(0, 9)})`);
  const push = git(["push", "origin", "HEAD:main"], { allowFail: true });
  if (push.status !== 0) {
    if (fresh) git(["reset", "-q", "--soft", "HEAD~1"]);
    const n = restoreBuild(snap);
    stop(10, `push 실패 — 이번 커밋은 풀고 build 가 바꾼 파일 ${n}개는 되돌렸다(시작할 때의 내 변경만 남음)`, String(push.stderr || push.stdout).trim().split("\n").slice(-6),
      "rejected(원격이 앞섬)면 같은 명령을 그대로 다시 — pull·build·관문을 다시 돌고 올린다. 인증 오류면 소유자에게(토큰을 URL 에 넣지 않는다).");
  }
  const left = dirtyFiles();
  const pages = changedPages(staged.filter((e) => e.status !== "D").map((e) => e.path));
  console.log(`\nship OK — ${sha.slice(0, 9)} → origin/main (${count(fresh, ahead, staged.length)})`);
  console.log(`배포 확인: node tools/ship.js --verify ${sha.slice(0, 9)}   (Pages 1~2분, 혼잡하면 5~10분 — 그동안 재트리거하지 않는다)`);
  console.log(`  실행 목록 ${PAGES_RUNS.replace("per_page=10", "per_page=5")}  (head_sha ${sha.slice(0, 9)})`);
  pages.slice(0, 3).forEach((p) => console.log(`  라이브 ${SITE}/${p}`));
  if (left.length) stop(12, "push 는 됐는데 미커밋 변경이 남았다 — 무엇인지 보고 커밋하거나 되돌린다", left);
}

// push 뒤 확인 — Pages 실행(pages-build-deployment)이 내 커밋을 배포했는지, 바뀐 페이지가 라이브에 그대로 떴는지.
//   재트리거하지 않는다: concurrency 가 진행 중 배포를 취소하므로 빈 커밋을 연달아 넣으면 더 늦어진다(2026-07-09). 기다리기만 한다.
async function verify(rev) {
  const sha = out(["rev-parse", rev]).trim();
  const getJson = async (url) => {
    const r = await fetch(url, { headers: { "User-Agent": "opbox-ship", Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}${r.status === 403 ? " (공개 API 한도 — 몇 분 뒤 다시)" : ""}`);
    return r.json();
  };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const ok = (r) => r.status === "completed" && r.conclusion === "success";
  const deadline = Date.now() + 8 * 60e3;
  let deployed = null;
  while (!deployed) {
    const runs = (await getJson(PAGES_RUNS)).workflow_runs || [];
    const mine = runs.find((r) => r.head_sha === sha);
    const later = mine ? runs.filter((r) => Date.parse(r.created_at) > Date.parse(mine.created_at)) : [];
    let state = "";
    if (!mine) state = "내 커밋의 Pages 실행이 아직 안 보인다";
    else if (mine.status !== "completed") state = `Pages 실행 ${mine.status}`;
    else if (mine.conclusion === "success") deployed = mine;
    else if (mine.conclusion === "cancelled" && later.some(ok)) deployed = later.find(ok); // main 은 앞으로만 가니 뒤 배포가 내 커밋을 싣는다
    else if (mine.conclusion === "cancelled" && later.some((r) => r.status !== "completed")) state = "뒤 커밋 배포에 밀려 취소됨 — 그 배포를 기다린다";
    else {
      console.log(`verify FAIL — Pages 실행 ${mine.conclusion}: ${mine.html_url}`);
      console.log('실패가 확정됐으니 재트리거는 1회만: git commit --allow-empty -m "chore: Pages 재배포" 뒤 node tools/ship.js -m "chore: Pages 재배포"');
      process.exit(1);
    }
    if (deployed) break;
    if (Date.now() > deadline) { console.log(`verify TIMEOUT(8분) — ${state}. 재트리거하지 말고 나중에 다시 --verify`); process.exit(1); }
    console.log(`… ${state} — 30초 뒤 다시`);
    await sleep(30e3);
  }
  const head = deployed.head_sha;
  if (git(["cat-file", "-e", `${head}^{commit}`], { allowFail: true }).status !== 0) git(["fetch", "-q", "origin", "main"], { allowFail: true });
  const want = git(["cat-file", "-e", `${head}^{commit}`], { allowFail: true }).status === 0 ? head : sha;
  const changed = git(["diff", "-z", "--name-only", "--diff-filter=AM", `${sha}~1`, sha], { allowFail: true }).stdout.split("\0").filter(Boolean);
  const pages = (changedPages(changed).length ? changedPages(changed) : ["index.html"]).slice(0, 5);
  const norm = (s) => String(s).replace(/\r\n?/g, "\n").trimEnd();
  let bad = [];
  for (let attempt = 0; attempt < 2; attempt++) { // 배포 직후 CDN 이 몇십 초 늦을 수 있어 틀린 것만 한 번 더
    if (attempt) { console.log("… 라이브가 아직 다르다 — 30초 뒤 한 번 더"); await sleep(30e3); }
    const todo = attempt ? bad : pages;
    bad = [];
    for (const p of todo) {
      const r = await fetch(`${SITE}/${p}?cb=${Date.now()}`, { headers: { "User-Agent": "opbox-ship" } });
      const same = r.ok && norm(await r.text()) === norm(blob(want, p));
      if (!same) bad.push(p);
      if (attempt || !same) console.log(`${same ? "ok  " : "DIFF"}  HTTP ${r.status}  ${SITE}/${p}`);
    }
    if (!bad.length) break;
  }
  const n = pages.length;
  console.log(`\nverify ${bad.length ? "DIFF" : "OK"} — Pages ${deployed.conclusion} ${head.slice(0, 9)}${head === sha ? "" : `(내 커밋 ${sha.slice(0, 9)} 포함)`} ${deployed.html_url} · 라이브 ${n - bad.length}/${n} 일치`);
  if (bad.length) console.log(`1~2분 뒤 다시 --verify. 그 사이 뒤 커밋이 같은 페이지를 바꿨다면 정상이다 — git log --oneline -2 origin/main -- ${bad[0]}`);
  process.exit(bad.length ? 1 : 0);
}

module.exports = { parseArgs, inCollectionWindow, outside, forbidden, diffLines, secretHits, pageFacts, titleScope, seoHits };
if (require.main === module) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (o.verify) verify(o.verify).catch((e) => { console.error(`verify 실행 실패 — ${e.message}`); process.exit(1); });
  else {
    try { ship(o); } catch (e) { console.error(`ship 실행 실패 — ${e.message}`); process.exit(1); }
  }
}
