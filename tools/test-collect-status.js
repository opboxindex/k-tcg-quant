#!/usr/bin/env node
// collect-status 의 "빠짐 그물" 회귀검사 — 2026-09-02 신설.
//
// 왜 필요한가: 그물은 조용히 죽는다. 실제로 그날 정규식의 `\d` 가 `d` 로 깨져서
// (셸을 거치며 백슬래시가 먹혔다) 날짜를 하나도 못 찾는 상태가 됐는데,
// 출력은 "UNTRACKED 0" 으로 멀쩡해 보였다. **검사하지 않으면서 통과했다고 말하는** 상태였다.
// 가짜 필드를 심어봐야 그물이 살아있는지 알 수 있다.
//
// 2026-09-02 소유자 절대지시: "여태 수집하던 것 하나도 빼먹지 마라. 그래프 틀리면 안 된다."
// 이 검사는 그 약속을 코드로 지키는 장치다. 실패하면 exit 1 — 가드가 잡는다.
//
// Run: node tools/test-collect-status.js
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TOOL = path.join(__dirname, "collect-status.js");
const PACKS = path.join(ROOT, "data", "onepiece-packs.json");
const FAKE_FILE = path.join(ROOT, "data", "__test-fake-series.json");

const run = () => JSON.parse(execFileSync(process.execPath, [TOOL, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const fail = (m) => { console.error("FAIL: " + m); process.exitCode = 1; };

const original = fs.readFileSync(PACKS, "utf8");
let ok = true;

try {
  // ── 1) 평시엔 조용해야 한다 ──────────────────────────────────
  const base = run();
  if (base.untracked.length) { fail("평시에 파일 UNTRACKED 가 있다: " + base.untracked.join(",")); ok = false; }
  if (base.packsUntracked.length) { fail("평시에 packs UNTRACKED 가 있다: " + base.packsUntracked.slice(0, 5).join(",")); ok = false; }

  // ── 2) 새 시계열 파일을 심으면 잡아야 한다 ────────────────────
  fs.writeFileSync(FAKE_FILE, JSON.stringify({
    points: ["2026-09-01", "2026-09-02", "2026-08-30", "2026-08-29", "2026-08-28", "2026-08-27"].map((d) => ({ d })),
  }), "utf8");
  const withFile = run();
  if (!withFile.untracked.includes("__test-fake-series.json")) {
    fail("새 시계열 파일을 못 잡는다 — 파일 그물이 죽었다"); ok = false;
  }
  fs.unlinkSync(FAKE_FILE);

  // ── 3) packs.json 에 새 수집 필드를 심으면 잡아야 한다 ────────
  const j = JSON.parse(original);
  const setKey = Object.keys(j.sets)[0];
  j.sets[setKey].__testFakeCollector = { updated: "2026-09-02" };
  fs.writeFileSync(PACKS, JSON.stringify(j), "utf8");
  const withField = run();
  if (!withField.packsUntracked.some((p) => p.includes("__testFakeCollector"))) {
    fail("packs.json 의 새 수집 필드를 못 잡는다 — packs 그물이 죽었다(정규식의 \\d·\\. 이스케이프 확인)"); ok = false;
  }

  // ── 3b) NMF1 — 유유테이 NM 행은 가장 오래 읽은 카드로 판정한다 — 2026-11-05 ──
  // 종전엔 카드 nmUpdated 의 최댓값이라, 11-02 에 EB-05 11장만 새로 읽자 나머지 183장이 10-21(15일)인데 "3일 정상"이었다.
  // 그 상황을 그대로 만든다: 화면에 나가는 NM 카드 전부를 15일 전으로, 한 세트만 오늘로 → 행은 15일 전·늦음이어야 한다.
  const { nmUsable } = require("./market-data-normalizers");
  const day = (n) => new Date(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
  const k = JSON.parse(original);
  const nmSets = Object.keys(k.sets).filter((code) => Object.values(k.sets[code].cards || {}).some(nmUsable));
  if (nmSets.length < 2) { fail("NMF1: 화면에 나가는 NM 카드가 있는 세트가 2개 미만 — 시험을 못 만든다"); ok = false; }
  else {
    for (const code of nmSets) for (const c of Object.values(k.sets[code].cards)) if (nmUsable(c)) c.nmUpdated = code === nmSets[0] ? day(0) : day(15);
    fs.writeFileSync(PACKS, JSON.stringify(k), "utf8");
    const nm = run().rows.find((r) => r.key === "nm");
    if (!nm) { fail("NMF1: nm 행이 없다"); ok = false; }
    else if (nm.last !== day(15) || nm.state !== "늦음") {
      fail(`NMF1: 한 세트(${nmSets[0]})만 오늘 읽었는데 nm 행이 ${nm.last}·${nm.state} — 가장 오래 읽은 카드(${day(15)}·늦음)를 봐야 한다. 새 세트 갱신이 전체 지연을 가린다`); ok = false;
    }
  }
} finally {
  // 원장은 무슨 일이 있어도 되돌린다. 시험 흔적이 데이터에 남으면 그게 더 큰 사고다.
  fs.writeFileSync(PACKS, original, "utf8");
  if (fs.existsSync(FAKE_FILE)) fs.unlinkSync(FAKE_FILE);
}

// ── 4) 등록된 수집원이 전부 날짜를 읽어내는가 ────────────────
// get() 이 null 을 주면 "기록 없음"으로 뜨는데, 그게 진짜 미수집인지 내가 필드명을 틀린 건지
// 구분이 안 된다. 그 상태를 방치하면 늙은 수집을 영영 못 본다.
const now = run();
const blind = now.rows.filter((r) => r.last == null);
if (blind.length) {
  fail("최신일을 못 읽는 수집원: " + blind.map((r) => r.key).join(",") + " (필드명이 틀렸을 수 있다)");
  ok = false;
}

// ── 5) 자동 행은 그 워크플로가 실제로 커밋하는 파일로 본다 — 2026-09-30 ──
// grading 행(wf collect-grading)이 그 워크플로가 건드리지도 않는 grading-series.json — 다른 워크플로가 매주 찍는
// 빌드 날짜 — 을 읽어서, 자동 CGC 가 9/3 이후 한 번도 커밋 못 했는데 "정상"이었다. 워크플로의 git add 대상(data/)과
// 행의 파일이 하나도 안 겹치면 그 행은 자기 워크플로를 보고 있지 않은 것이다. files 가 빈 행은 packs.json 안을 읽는다.
for (const r of now.rows.filter((x) => x.mode === "auto")) {
  const yml = path.join(ROOT, ".github", "workflows", `${r.wf}.yml`);
  if (!fs.existsSync(yml)) { fail(`${r.key}: 워크플로 ${r.wf}.yml 이 없다`); ok = false; continue; }
  const added = new Set([...fs.readFileSync(yml, "utf8").matchAll(/git add ([^\n]+)/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter((p) => p.startsWith("data/")).map((p) => p.slice(5).replace(/\/$/, "")));
  const own = r.files.length ? r.files : ["onepiece-packs.json"];
  if (!own.some((f) => added.has(f))) {
    fail(`${r.key}: ${r.wf} 가 커밋하는 파일(${[...added].join(",")})과 이 행의 파일(${own.join(",")})이 안 겹친다 — 다른 수집의 날짜를 보고 있다`);
    ok = false;
  }
}

console.log(JSON.stringify({
  test: ok && !process.exitCode ? "OK" : "FAIL",
  sources: now.rows.length,
  auto: now.rows.filter((r) => r.mode === "auto").length,
  manual: now.rows.filter((r) => r.mode === "manual").length,
}));
