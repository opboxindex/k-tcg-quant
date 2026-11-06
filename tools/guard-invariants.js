// 사이트 불변식 가드 — 과거 실제 사고 유형을 전부 기계 검사로 차단. 하나라도 어기면 exit 1 → 워크플로 실패(커밋 안 됨) + 실패 메일.
// Run: node tools/guard-invariants.js   (로컬 배포 전에도; tools/check.js 가 마지막에 부른다)
// 출력: {guard, checkedPages, version, checks[], errors[], warnings[]} — daily.ps1·워크플로가 읽는다. 오류 꼴은 "코드: …", 경고는 "코드(경고) …".
//
// 2026-10-15 분할: 4,497줄 한 파일 → tools/guard/ 모듈(영역별). 앞으로 검사를 고칠 땐 그 영역 파일만 읽는다.
//   lib.js            공용(캐시 읽기·JSON-LD·sink)
//   runtime.js        packs.js·캐시 키·CSP·GA 로더             V1 V2 D4 H3 J1 X1 GA1 GA2
//   seo.js            canonical·hreflang·구조화데이터·날짜·링크   C1 C2 N1 H1 L1 L2 L3 I1 I2 R1 S2 F1 T1 U1 U2 CL2 DS1 SE1 FQ2 PL1 PO1 S3 KF1 MD1 KO5 RD1 AD1 UP1
//   sitemap-feed.js   사이트맵·피드                              C3 SM1 FD1
//   ledgers.js        원장·시계열·데이터 파일 무결성              D1 D2 D3 D5 D5b D6 D7 D8 D9 D10 D11 D12 D13 D15 D16 A1 A2 A3 A5 G8 G9 M1 M2 X2 Y1 Y2 P1 T2 T3 OL1 OL2 R2 UP1 CL1
//   collection.js     수집기·분류기·워크플로(+외부 테스트)         D14 R3 R4 Q1 Q2 Q3 Q4 Q5 W1 W2 W3 W4 G9 R5 K1 K2 A4 NMP1 PW1
//   copy-rules.js     문구(숫자·표·라벨만, 업체명, 제휴 고지)       S1 S4 VN1 D18 DF1 DF2 DF3 NP1 CX1 NC1 UP2 UP3 E1 EP1 AN1 EQ1 EL1 R2 KO1 KO2 KO3 SP1 FQ1 CL1
//   facts-source.js   FACTS-SOURCE — 생성기는 파생 사실을 세지 않는다(순수 함수 반입·원장 필드·시계열 사실 읽기 금지)
//   pages-vs-facts.js PAGES-VS-FACTS — 모든 페이지·AI 파일의 숫자 = data/derived/site-facts.json (옛 검사 ID 를 꼬리표로 남긴다: PAGES-VS-FACTS/PC1 …)
//   ai-feeds.js       AI 파일 안 일관성                           AS1 AB1
//   psa10-listings.js PSA 10 최저 매물 판본(한 매물 두 카드·자체 감사 SET 불일치)   PSA10-SHARE PSA10-AUDIT PSA10-HOOK
//   stale-display.js  낡은 값 = 날짜 + 흐림(대표 PSA 10·NM 칸·체크포인트 이월 칸)   DSP1 DSP2 DSP3 DSP4 DSP5
//   text-claims.js    손으로 쓴 글·문구의 수·날짜·기준 라벨        TX1~TX9 (2026-11-05 외부 감사)
// 사실 파일에 들어간 뒤 페이지끼리 값을 맞춰 보던 검사(D17·H2·C4·KF1·RF1·SF1·NM1·NM2·RY1·CM1·PC1·CW1·WK1·PK1·CH1·KD1·CL3·KO1~KO5·LP1·CX2·CX3·G9(4)·P2·RD1·UP1·CL1 값 부분)는
// PAGES-VS-FACTS 하나로 바뀌었다 — 값을 다시 세지 않고 사실 파일과 대조한다. 규칙 자체는 market-data-normalizers.js(순수 함수)의 단위 테스트가 지킨다.
//
// 사고 이력(검사 ID → 모듈 머리에 날짜·한 줄씩):
//  [2026-07-08 canonical 스왑: 홈 노출 0] C1 C2 C3 · [2026-07-14 DATA_VERSION 미범프] V1 · [2026-07-17 야간봇이 시리즈 덮어씀] D1 · [영구: 외부 소스명 금지] S1 S4 VN1 · [검증파일 삭제 예방] F1
//  [2026-09-30 known-gaps 가 관측 있는 주를 영구 공백으로] K1 K2 · [2026-10-14 utm 소실·GA 지연] GA1 GA2 · [2026-10-14 세트 핵심 사실 97% 지점·낡은 카드 수·월 단위 날짜] KF1
//  [2026-10-14 AI 사실 공급에 발매일·정가 없음] RF1→PAGES-VS-FACTS · [2026-10-14 사이트맵 lastmod 매일 오늘·피드 이중 이스케이프] SM1 FD1 · [2026-10-14 cheapest·MSRP 질의·JSON-LD 누락] SE1
//  [2026-10-15 외부 감사 22건] SF1 U2 PL1 S4 NM1 KO1 KO2 KO3 KO4 AB1 AS1 LP1 PO1 CL2 UP2 DS1 (값 부분은 PAGES-VS-FACTS) · [2026-10-15 2차 한 사실 두 값] RY1 NM2 · [3차 지표·가장 비싼 카드] CM1 PC1
//  [2026-10-15 5차] PK1 FQ1 SP1 AN1 EQ1 EL1 CH1 KD1 FQ2 WK1 · [2026-10-15 6차 숫자·표·라벨만 + OP-07 이상치] OL1 OL2 NC1 DF2 MD1 KO5 DF3 CX1 CX2 CX3 NP1 UP3 VN1 EP1
//  [2026-11-05 팰월드 전용 수집 중단·원장 동결] PW1
"use strict";
const { spawn } = require("node:child_process");
const lib = require("./guard/lib");

const MODULES = ["runtime", "seo", "sitemap-feed", "ledgers", "collection", "copy-rules", "facts-source", "pages-vs-facts", "ai-feeds", "psa10-listings", "stale-display", "text-claims"].map((m) => [m, require(`./guard/${m}`)]);

// 외부 검사(테스트·감사)는 자식 프로세스라 먼저 전부 띄우고, 모듈을 도는 동안 병렬로 돌게 한다.
function spawnAll(list) {
  return list.map((x) => new Promise((resolve) => {
    const r = spawn(process.execPath, x.args, { cwd: lib.ROOT });
    let stdout = "", stderr = "";
    r.stdout.on("data", (d) => { stdout += d; }); r.stderr.on("data", (d) => { stderr += d; });
    r.on("error", (e) => resolve({ x, res: { status: 1, stdout, stderr: String(e.message) } }));
    r.on("close", (status) => resolve({ x, res: { status, stdout, stderr } }));
  }));
}

async function main() {
  const t0 = Date.now();
  const external = MODULES.flatMap(([, m]) => m.external || []);
  const pending = spawnAll(external);
  const checks = [];
  for (const [name, m] of MODULES) {
    for (const id of m.checks) if (!checks.includes(id)) checks.push(id);
    const n = lib.errors.length;
    try { m.run(); } catch (e) { lib.errors.push(`${m.checks[0]}: ${name} 모듈 실행 실패 — ${e.stack ? e.stack.split("\n").slice(0, 2).join(" ") : e.message}`); }
    if (process.env.GUARD_VERBOSE) console.error(`[guard] ${name} ${lib.errors.length - n} errors ${Date.now() - t0}ms`);
  }
  for (const { x, res } of await Promise.all(pending)) { try { lib.errors.push(...x.judge(res)); } catch (e) { lib.errors.push(`${x.id}: 판정 실패 — ${e.message}`); } }
  const { errors, warnings } = lib;
  if (errors.length) {
    console.error(JSON.stringify({ guard: "FAIL", errors, ...(warnings.length ? { warnings } : {}) }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ guard: "OK", checkedPages: lib.PUBLIC_HTML.length, version: require("./guard/runtime").version(), ...(warnings.length ? { warnings } : {}), checks, ms: Date.now() - t0 }));
}

main().catch((e) => { console.error(JSON.stringify({ guard: "FAIL", errors: [`guard: 실행 실패 — ${e.stack || e.message}`] }, null, 2)); process.exit(1); });
