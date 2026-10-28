#!/usr/bin/env node
"use strict";
// 검사의 유일한 출처 — 2026-10-15 신설. tools/build.js 뒤에 한 번: 테스트 → 감사 → 가드. 한 줄에 하나, 끝에 OK/FAIL.
//
// 왜: 테스트·감사·가드가 워크플로마다 다른 조합으로 흩어져 있었다(일일 워크플로 Verify 48줄, 주간 46줄, daily.ps1 은 가드만).
//   어느 검사가 어디서 도는지 아무도 한눈에 몰랐고, 새 감사는 어느 한 곳에만 들어갔다(audit-thin-pages 는 일일에만).
//   이제 검사 목록은 아래 CHECKS 하나다. 하나가 실패해도 끝까지 돌아 전부 보여준다(한 바퀴에 다 고치게).
// 모드
//   (기본)   전부. 로컬에서 수정 뒤 이것 하나면 된다. 브라우저 감사(audit-mobile-tables)는 크롬이 있을 때만 실제로 돈다.
//   --fast   브라우저 감사를 건너뛴다(--no-browser 와 같다).
//   --gate   커밋 직전 관문(워크플로·daily.ps1): 전역 신선도 감사(audit-collection-health·audit-series-gaps)를 뺀다 —
//            남의 지연(PSA 12일째 등)이 이번 수집 결과를 버리게 하면 안 된다(가드 W4, 2026-09-30 사고). 그 둘은
//            collection-health.yml 이 하루 두 번 따로 본다.
//   --pre    수집 전 빠른 검사: 모든 tools/*.js·*.mjs·packs.js 구문(node --check) + 테스트만. 감사·가드는 돌리지 않는다 —
//            가드의 신선도 검사(T1/P1)는 그 잡이 받으려는 바로 그 데이터를 보므로, 낡으면 막고 → 못 받고 → 더 낡는다(2026-07-27 교착).
//   --log-dir d  검사별 전체 출력을 <d>/<check>.log 로 남긴다(워크플로 아티팩트).
// GitHub Actions 에서는 실패 이유를 annotation(::error::)과 step summary 에 그대로 띄운다 — 2026-07-27: 로그 다운로드에
//   admin 권한이 필요해 세 번을 추측으로 헤맸다. 이유는 반드시 화면에 남긴다.
// Run: node tools/check.js [--fast|--no-browser] [--gate] [--pre] [--log-dir logs]
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const TOOLS = path.join(ROOT, "tools");

// 순서대로 돈다. kind: test(단위 테스트) · audit(감사) · guard(마지막 관문).
//   soft    — 실패해도 전체를 FAIL 로 만들지 않는다(경고만). 알림용 감사.
//   browser — 로컬 크롬이 필요하다(--fast 로 건너뜀). 크롬이 없으면 도구 스스로 skip 으로 끝난다.
//   global  — 전역 신선도 감사(가드 W4). --gate 에서 뺀다.
//   data    — 커밋된 생성물(AI 파일·CSV)이 원장과 같은지 보는 테스트. --pre 에서 뺀다 — 원장은 다른 워크플로(collect-grading 등)가
//             먼저 바꿀 수 있고 생성물은 이 잡의 빌드가 고치는데, 빌드 앞에서 막으면 '낡으면 막고 → 못 고치고 → 더 낡는' 교착이 된다
//             (2026-10-26~28: CGC 원장만 바뀐 뒤 진행 매물·환율 수집이 test-ai-data 로 3일 멈춤). 빌드 뒤 --gate 에서는 그대로 돈다.
const DATA_TESTS = new Set(["test-ai-data"]);
const CHECKS = [
  // mutates: 추적 데이터(packs.json)를 제자리에서 썼다 되돌리는 테스트 — 커밋 직전 관문(--gate)에서는 뺀다(2026-10-16).
  ...fs.readdirSync(TOOLS).filter((f) => /^test-.*\.js$/.test(f)).sort().map((f) => ({ name: f.replace(/\.js$/, ""), kind: "test", mutates: f === "test-collect-status.js", data: DATA_TESTS.has(f.replace(/\.js$/, "")) })),
  { name: "audit-seo", kind: "audit" },
  { name: "audit-grading-numbers", kind: "audit" },           // 등급 숫자는 틀리면 안 된다(소유자 지시) — 종전엔 두 워크플로에 따로 있었다
  { name: "audit-workflows", kind: "audit" },
  { name: "audit-collection-health", kind: "audit", global: true },
  { name: "audit-thin-pages", kind: "audit", soft: true },        // 애드센스 "가치 없는 콘텐츠" 재발 감시 — 막지는 않는다
  { name: "audit-ai-discovery", kind: "audit" },
  { name: "audit-box-series", kind: "audit" },
  { name: "audit-series-gaps", kind: "audit", global: true },
  { name: "audit-mobile-tables", kind: "audit", browser: true },  // 390px 표 실측(2026-10-14 QA)
  { name: "guard-invariants", kind: "guard" },
];

function parseArgs(argv) {
  const o = { fast: false, gate: false, pre: false, logDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fast" || a === "--no-browser") o.fast = true;
    else if (a === "--gate") o.gate = true;
    else if (a === "--pre") o.pre = true;
    else if (a === "--log-dir") o.logDir = argv[++i];
    else throw new Error(`모르는 인자 ${a} — node tools/check.js [--fast] [--gate] [--pre] [--log-dir d]`);
  }
  return o;
}

// 모드에 따라 실제로 도는 검사 — audit-workflows 가 워크플로의 `check.js --pre/--gate` 를 이걸로 펼친다.
//   pre → 테스트만(생성물 대조 테스트 제외) · gate → 전역 신선도 감사 제외 · fast → 브라우저 감사 제외
function plan({ pre = false, gate = false, fast = false } = {}) {
  return CHECKS.filter((c) => (pre ? c.kind === "test" && !c.data : !(c.browser && fast) && !(c.global && gate) && !(c.mutates && gate)));
}

const sec = (ms) => `${(ms / 1000).toFixed(1)}s`.padStart(6);
const run = (args) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { ms: Date.now() - t0, code: r.error ? 1 : (r.status ?? 1), out: `${r.stdout || ""}${r.stderr ? `\n[stderr]\n${r.stderr}` : ""}${r.error ? `\n${r.error.message}` : ""}` };
};

// 실패 출력에서 사람이 읽을 이유만 뽑는다 — JSON 이면 errors/problems 배열, 아니면 마지막 줄들.
function reasons(out) {
  try {
    const j = JSON.parse(out.trim().split("\n[stderr]")[0]);
    const list = [].concat(j.errors || [], j.problems || []).map(String);
    if (list.length) return list;
  } catch {}
  return out.trim().split("\n").filter(Boolean).slice(-12);
}

// --pre: 구문 검사 대상 — tools 전부 + 화면 스크립트 packs.js(일일 워크플로가 보던 것).
function syntaxCheck() {
  const files = [...fs.readdirSync(TOOLS).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => path.join("tools", f)), "packs.js"]
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
  const bad = [];
  const t0 = Date.now();
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) bad.push(`${f}: ${(r.stderr || "").trim().split("\n").slice(0, 3).join(" ")}`);
  }
  return { ms: Date.now() - t0, files: files.length, bad };
}

function main() {
  const o = parseArgs(process.argv.slice(2).filter(Boolean));
  const logDir = o.logDir ? path.resolve(ROOT, o.logDir) : null;
  if (logDir) fs.mkdirSync(logDir, { recursive: true });
  const t0 = Date.now();
  const failed = [], warned = [], details = [];
  let ran = 0, skipped = 0;

  if (o.pre) {
    const s = syntaxCheck();
    if (s.bad.length) { failed.push("syntax"); details.push(["syntax", s.bad]); console.log(`FAIL  ${sec(s.ms)}  syntax  ${s.bad.length}/${s.files} files`); }
    else console.log(`ok    ${sec(s.ms)}  syntax  ${s.files} files`);
    ran++;
  }

  const todo = new Set(plan(o).map((c) => c.name));
  for (const c of CHECKS) {
    if (o.pre && c.kind !== "test") continue;
    if (!todo.has(c.name)) { skipped++; console.log(`skip  ${"".padStart(6)}  ${c.name}  — ${c.browser ? "--fast" : c.data && o.pre ? "--pre (생성물 대조는 빌드 뒤 --gate 에서)" : c.mutates ? "--gate (원장을 제자리에서 쓰는 테스트)" : "--gate (전역 감사는 collection-health.yml)"}`); continue; }
    const r = run([path.join(TOOLS, `${c.name}.js`)]);
    if (logDir) fs.writeFileSync(path.join(logDir, `${c.name}.log`), r.out);
    ran++;
    if (r.code === 0) { console.log(`ok    ${sec(r.ms)}  ${c.name}`); continue; }
    const rs = reasons(r.out);
    if (c.soft) { warned.push(c.name); console.log(`warn  ${sec(r.ms)}  ${c.name}  exit ${r.code} (알림용 — 막지 않음)`); rs.forEach((l) => console.log(`        ${l}`)); continue; }
    failed.push(c.name); details.push([c.name, rs]);
    console.log(`FAIL  ${sec(r.ms)}  ${c.name}  exit ${r.code}`);
  }

  for (const [name, rs] of details) {
    console.log(`\n── ${name}`);
    rs.forEach((l) => console.log(`  ${l}`));
    if (process.env.GITHUB_ACTIONS) rs.forEach((l) => console.log(`::error::${name}: ${l}`));
  }
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_STEP_SUMMARY && details.length) {
    const md = [`### 검사 실패 — 배포를 막았습니다 (${failed.join(", ")})`, ...details.flatMap(([n, rs]) => [`\n**${n}**`, "```", ...rs, "```"])].join("\n");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  }
  const tally = `${ran} checks${skipped ? `, ${skipped} skipped` : ""}${warned.length ? `, warn: ${warned.join(" ")}` : ""}`;
  if (failed.length) { console.log(`\ncheck FAIL  ${sec(Date.now() - t0).trim()}  ${tally} — FAIL: ${failed.join(", ")}`); process.exit(1); }
  console.log(`\ncheck OK  ${sec(Date.now() - t0).trim()}  ${tally}`);
}

module.exports = { CHECKS, plan };
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(2); }
}
