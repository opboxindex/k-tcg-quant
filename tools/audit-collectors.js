#!/usr/bin/env node
// 브라우저 수집기 실행 가능성 감사 — 2026-08-25 신설.
//
// 왜: 팰월드 수집기가 **문법 오류라 브라우저에서 실행 자체가 안 되는 상태**로 6일간 방치됐다.
// 템플릿 리터럴 안에서 정규식을 \\ 로 이스케이프해야 출력물에 \ 가 남는데 \ 로 써서
//   match(/\/itm\/(\d+)/)  →  출력물: match(//itm/(d+)/)
// 가 됐고, // 가 줄 주석이라 그 뒤가 통째로 죽었다. 원피스 쪽은 처음부터 \\ 로 돼 있었다.
//
// 이 부류는 기존 감사가 못 잡는다: 산출물 파일은 예전 값 그대로 남아 있어서 "오래됐다"는
// 신호만 나오고, 도구 자체가 고장났다는 사실은 사람이 직접 돌려봐야 알 수 있었다.
// 그래서 **생성된 스크립트를 실제로 평가**한다. 문법이 깨지면 여기서 FAIL 이다.
//
// Run: node tools/audit-collectors.js [--json]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const problems = [], notes = [];

// 브라우저에 심는 스크립트를 만드는 모듈들. 새 수집기를 추가하면 여기에도 넣을 것.
// palworld-sold-urls.js 는 2026-11-05 팰월드 전용 수집 중단으로 뺐다(가드 PW1).
const TARGETS = [
  "box-sold-urls.js",
  "tag-pop.js",
  "tag-card-pop.js",
];
const MAKERS = ["setupScript", "collectorScript"];

// 브라우저 전역 스텁 — 스크립트는 평가만 하고 네트워크는 타지 않는다(fetch 를 부르는 건 함수 안이다).
function stubGlobals() {
  const el = () => ({ click() {}, remove() {}, style: {}, appendChild() {}, setAttribute() {}, getAttribute: () => "" });
  global.window = {};
  global.document = {
    querySelectorAll: () => [], querySelector: () => null,
    createElement: el, body: { appendChild() {}, innerHTML: "" },
  };
  global.DOMParser = class { parseFromString() { return { querySelectorAll: () => [], querySelector: () => null }; } };
  global.history = { pushState() {} };
  global.PopStateEvent = class {};
  global.Blob = class {};
  global.URL = { createObjectURL: () => "", revokeObjectURL() {} };
  global.fetch = () => Promise.resolve({ text: () => Promise.resolve("") });
}

for (const file of TARGETS) {
  const full = path.join(ROOT, "tools", file);
  if (!fs.existsSync(full)) { problems.push(`${file} 없음 — TARGETS 목록과 실제 파일이 어긋난다`); continue; }
  let mod;
  try { mod = require(full); } catch (e) { problems.push(`${file} require 실패: ${e.message}`); continue; }

  const found = MAKERS.filter((k) => typeof mod[k] === "function");
  if (!found.length) { notes.push(`${file}: 스크립트 생성 함수 없음(검사 대상 아님)`); continue; }

  for (const key of found) {
    let src;
    try { src = mod[key](); } catch (e) { problems.push(`${file}.${key}() 호출 실패: ${e.message}`); continue; }
    if (typeof src !== "string" || src.length < 100) { problems.push(`${file}.${key}() 결과가 스크립트가 아니다`); continue; }

    // 1) 실제 평가 — 문법이 깨졌으면 여기서 걸린다.
    stubGlobals();
    try { (0, eval)(src); } catch (e) { problems.push(`${file}.${key}: 브라우저에서 실행 불가 — ${e.message}`); continue; }

    // 2) 이스케이프가 살아남았는지 — 평가는 통과해도 정규식이 반쯤 죽는 경우가 있다.
    //    예: /([d.]+)/ 는 문법은 맞지만 문자 d 를 찾는다(숫자가 아니다).
    const bs = String.fromCharCode(92);
    if (/match\(\/\(\[d\./.test(src) || src.includes(`match(/${bs}${bs}`) === false && /itm\/\(d\+\)/.test(src)) {
      problems.push(`${file}.${key}: 정규식 이스케이프가 죽었다(\\d 가 d 로 남았다) — 템플릿 안에서는 \\\\d 로 쓸 것`);
      continue;
    }
    notes.push(`${file}.${key}: 실행 가능`);
  }
}

const out = { audit: problems.length ? "FAIL" : "COLLECTORS_OK", checked: TARGETS.length, problems, notes };
console.log(JSON.stringify(out, null, process.argv.includes("--json") ? 0 : 1));
process.exit(problems.length ? 1 : 0);
