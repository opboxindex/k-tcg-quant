#!/usr/bin/env node
// 판별 PSA 증감을 세트 데이터에 주입 — 2026-07-27.
// 원장(psa-edition-weekly.json)의 마지막 두 점 차이를 psaFull/psaFullEn 에 얹는다.
// 화면은 이 값만 읽으므로 원장이 늘어도 방문자 페이로드는 세트당 몇 바이트만 늘어난다.
// 점이 두 개 미만인 판은 값을 만들지 않는다(추정 금지 → 화면에서 "-").
// 2026-11-20: wowAdd/wowPct/wowSpark·set.psaWow → psaFull(En).change = { from, to, days, add, pct, spark? } 하나로.
//   GemRate 세트 추이가 매일 → 띄엄띄엄으로 바뀌어 원장 점 사이가 늘 7일이 아니다(10-27 → 11-13 = 17일).
//   "주간"이라 부르면 17일치 증가가 한 주처럼 읽힌다 — 값마다 자기 시작·끝 날짜와 날짜 수를 같이 싣고, 화면은 그 셋을 그대로 쓴다.
//   spark = 그 계열의 마지막 ≤12개 연속 구간 [날짜 수, 누적 증가] — 구간 길이가 달라 증가분만 줄 세우면 17일치가 급증처럼 보인다.
//   4구간 미만이면 만들지 않는다(+961 한 칸으로는 늘고 있는지 줄고 있는지 알 수 없다 — 2026-08-21 규칙 그대로).
// import-gemrate-psa-history·import-gemrate-en-totals 가 psaFull·psaFullEn 을 통째로 다시 쓰므로 그 둘 뒤 마지막에 돈다.
// Run: node tools/inject-psa-wow.js
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const dataPath = path.join(ROOT, "data", "onepiece-packs.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const led = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "psa-edition-weekly.json"), "utf8"));

const DAY = 864e5;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const weeks = (led.weeks || []).slice(-2);
const [from, to] = weeks.length === 2 ? weeks : [null, null];

// 그 판의 change — 원장 마지막 두 날짜에 둘 다 점이 있을 때만. 없으면 null(화면 "—").
function changeOf(arr) {
  const a = arr.find((p) => p.d === from), b = arr.find((p) => p.d === to);
  if (!a || !b) return null;
  const add = b.g - a.g;
  const change = { from, to, days: daysBetween(from, to), add, pct: Math.round((add / a.g) * 1000) / 10 };
  // 원장 계열은 첫 점 뒤로 원장 날짜를 빠짐없이 갖는다(audit-grading-numbers G2a) — 이웃 점 쌍이 곧 연속 구간이다.
  const spark = [];
  for (let i = 1; i < arr.length; i++) spark.push([daysBetween(arr[i - 1].d, arr[i].d), arr[i].g - arr[i - 1].g]);
  if (spark.length >= 4) change.spark = spark.slice(-12);
  return change;
}

let jp = 0, en = 0;
for (const [code, set] of Object.entries(data.sets)) {
  // 옛 필드(2026-11-20 이전 이름) — 이 값을 읽는 곳은 없다. 한 번 돌면 다시는 생기지 않는다.
  delete set.psaWow;
  const s = led.sets[code] || {};
  for (const [target, ed] of [[set.psaFull, "jp"], [set.psaFullEn, "en"]]) {
    if (!target) continue;
    const change = from ? changeOf(s[ed] || []) : null;
    if (change) { target.change = change; if (ed === "jp") jp += 1; else en += 1; } else delete target.change;
  }
}
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ status: from ? "ok" : "skip", from, to, days: from ? daysBetween(from, to) : null, jpSets: jp, enSets: en }));
