"use strict";
// PSA 스냅샷 날짜 고르기 — 판별 누적 원장(psa-edition-weekly.json)과 일본판 주간 이력(gemrate-psa-history.json weekly[])이
// 같은 규칙·같은 날짜를 쓰게 하는 한 곳. 순수 함수만 둔다(파일·Date.now() 안 씀 — 같은 덤프면 늘 같은 답). 2026-11-20 신설.
//
// 왜: GemRate 세트 추이(set-population-trend)가 2026-10-27 까지 매일이다가 10/28 은 41계열 중 35계열이 10/27 복사,
// 10/29 는 41/41 복사, 그 뒤로는 11/06(금) 4계열 · 11/13(금) 41/41 · 11/14(토) 17 · 11/16(월) 4 만 냈다.
// 수요일 행만 받던 두 원장이 10/28 에 멈췄고 적재기는 'ok' 로 조용히 넘어갔다.
//
// 규칙(ISO 주 = 월~일, UTC):
//  - 쓸 수 있는 날 D = 수집일(collectedOn) 전 · 필수 계열(required) 전부가 D 날짜 행을 가짐 · 복사일 아님(frozenOn 이 빔).
//  - 마지막 원장 날짜의 다음 ISO 주부터 수집일이 든 주까지 주마다:
//    그 주 수요일을 쓸 수 있으면 수요일(끝나지 않은 주도) → 아니면 주가 끝났을 때(일요일 < 수집일) 수·목·화·금·월·토·일 순서로
//    처음 쓸 수 있는 날(같은 거리면 뒤 날: 목>화, 금>월, 토>일) → 끝나지 않은 주면 pending(다음 실행이 다시 본다).
//  - 끝난 주에 쓸 수 있는 날이 없으면 gap — 아무것도 쓰지 않는다(보간·추정 금지). 그 주에 행이 있던 날마다 몇 계열이 있었는지·
//    빠진 계열·복사일 여부를 돌려준다(known-gaps.json 등록 근거).
//  - 필수 계열 = 원장에 점이 하나라도 있는 대상. 새 대상은 행이 있는 첫 선택일에 합류하고, 날짜 선택을 막지 않는다.
//    합류한 대상은 같은 실행의 다음 주부터 필수다 — 한 번에 여러 주를 채울 때도 원장에 구멍이 안 생긴다(2026-11-20 검토 지적).
//  - 필수 계열의 그날 행이 값 이상(누적 0 이하·젬 음수·젬 > 누적)이거나 원장 마지막 누적(floors)보다 작으면 그날은 못 쓴다.
//    2026-06-10 OP-05 일판이 64,755 → 73 → (6/11) 65,081 로 리셋됐다. 그런 날을 고르면 일본판 이력은 정정으로 넘기고
//    판별 원장은 역행으로 멈춰 두 원장 날짜가 갈라졌다 — 여기서 거르면 두 적재기가 같은 다른 날(6/11)이나 같은 빈 주를 본다.
const DAY = 864e5;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ms = (date) => Date.parse(`${date}T00:00:00Z`);
const ymd = (time) => new Date(time).toISOString().slice(0, 10);
const mondayOf = (date) => ms(date) - ((new Date(ms(date)).getUTCDay() + 6) % 7) * DAY;
// 그 주 안의 자리(월=0): 수요일에 가까운 순, 같은 거리면 뒤 날
const NEAREST_WEDNESDAY = [2, 3, 1, 4, 0, 5, 6];

// 상류가 그날 갱신하지 않고 직전 누적을 그대로 복사한 행 고르기 — 2026-11-12 신설(collect-gemrate-psa-history.js), 2026-11-20 여기로 옮김.
// 실측: GemRate 추세가 10/27 뒤로 멈춰 10/28 행이 41계열 중 35계열에서 10/27 과 total_grades·total_gems 가 똑같았다
// (10/02~10/27 은 계열마다 26일 중 0~1일만 전날과 같았다). 그 행을 누적으로 받아 W44 증가분이 하루치 적게 들어갔다.
// 작은 세트는 정말로 하루 0건인 날이 드물게 있어 계열 하나로는 못 가른다 → 같은 날 비교할 수 있는 계열의 절반 이상이
// 직전 행과 같으면 그날은 상류가 멈춘 날로 보고, 그날 직전 행과 같은 계열만 돌려준다(그날 실제로 바뀐 계열은 그대로 쓴다).
// 직전 행 = 그 계열 배열에서 바로 앞 원소(달력의 전날이 아니다, 2026-11-20). 상류가 며칠 쉬었다 내는 복사본(10/29 → 11/13 처럼
// 띄엄띄엄)도 잡으려는 것 — 매일 행이 있던 645일에서는 전날 비교와 결과가 하나도 다르지 않다(2026-11-20 실측). 행은 날짜 오름차순.
function frozenOn(rowsByKey, date) {
  const same = [];
  let comparable = 0;
  for (const [key, rows] of Object.entries(rowsByKey)) {
    const list = rows || [];
    const index = list.findIndex((row) => row.date === date);
    if (index < 1) continue;
    const current = list[index];
    const previous = list[index - 1];
    comparable += 1;
    if (current.total_grades === previous.total_grades && current.total_gems === previous.total_gems) same.push(key);
  }
  return comparable && same.length * 2 >= comparable ? new Set(same) : new Set();
}

// ISO-8601 주("2026-W44") — 월요일 시작, 그 주 목요일이 든 해가 주의 해다.
function isoWeek(date) {
  const thursday = mondayOf(date) + 3 * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// 스냅샷 대상 = 일본판 이력의 세트 전부("CODE|jp") + 영문판 총량에서 url 이 있는 세트("CODE|en"). 영문판 미발매(null)는 대상이 아니다.
function snapshotTargets(jpHistory, enTotals) {
  return [
    ...Object.keys(jpHistory.sets || {}).map((code) => `${code}|jp`),
    ...Object.entries(enTotals.sets || {}).filter(([, set]) => set?.url).map(([code]) => `${code}|en`),
  ];
}

// 덤프({jp:{CODE:[rows]}, en:{…}})에서 대상 키별 행. 덤프에 없는 대상은 빠진다(부르는 쪽이 (c) 검사로 멈춘다).
function rowsByKeyFromDump(dump, keys) {
  const out = {};
  for (const key of keys) {
    const [code, ed] = key.split("|");
    const rows = dump?.[ed]?.[code];
    if (Array.isArray(rows)) out[key] = rows;
  }
  return out;
}

const validRow = (row) => Boolean(row) && Number.isInteger(row.total_grades) && Number.isInteger(row.total_gems)
  && row.total_grades > 0 && row.total_gems >= 0 && row.total_gems <= row.total_grades;

// 두 적재기가 같은 입력으로 고르게 하는 한 곳 — 필수 계열과 그 바닥값(판별 원장 마지막 점의 누적).
// 일본판 이력 적재(psa-trend-ingest)도 판별 원장을 읽어 이걸 쓴다: 두 원장이 같은 날짜에 있으면 일본판 바닥값도 같다.
function selectionBasis(editionLedger, targets) {
  const required = [];
  const floors = {};
  for (const key of targets) {
    const [code, ed] = key.split("|");
    const last = (editionLedger?.sets?.[code]?.[ed] || []).at(-1);
    if (!last) continue;
    required.push(key);
    floors[key] = { g: last.g, m: last.m };
  }
  return { required, floors };
}

function selectSnapshots({ rowsByKey, required, floors = {}, lastDate, collectedOn }) {
  if (!DATE.test(lastDate || "")) throw new Error(`lastDate 형식이 아니다: ${lastDate}`);
  if (!DATE.test(collectedOn || "")) throw new Error(`collectedOn 형식이 아니다: ${collectedOn}`);
  // 필수 계열이 하나도 없으면 행이 없는 날도 '쓸 수 있는 날'이 된다 — 그런 원장은 여기서 다루지 않는다.
  if (!required?.length) throw new Error("required 가 비었다 — 원장에 점이 있는 계열이 하나도 없으면 날짜를 고를 수 없다");
  const chosen = [];
  const gaps = [];
  const pending = [];
  const byDate = Object.fromEntries(Object.entries(rowsByKey).map(([key, rows]) => [key, new Map((rows || []).map((row) => [row.date, row]))]));
  const need = new Set(required);
  const floor = new Map(Object.entries(floors));
  const copyCache = new Map();
  const isCopy = (date) => {
    if (!copyCache.has(date)) copyCache.set(date, frozenOn(rowsByKey, date).size > 0);
    return copyCache.get(date);
  };
  const missingOn = (date) => [...need].filter((key) => !byDate[key]?.has(date));
  const invalidOn = (date) => [...need].filter((key) => {
    const row = byDate[key]?.get(date);
    if (!row) return false;
    const low = floor.get(key);
    return !validRow(row) || (low && (row.total_grades < low.g || row.total_gems < low.m));
  });
  const usable = (date) => date < collectedOn && !missingOn(date).length && !isCopy(date) && !invalidOn(date).length;
  // 고른 날에 값이 맞는 행이 있는 대상은 모두 그날 원장에 들어간다(판별 적재기와 같은 규칙) → 다음 주부터 필수·바닥값 갱신.
  const take = (week, date) => {
    chosen.push({ week, date });
    for (const [key, rows] of Object.entries(byDate)) {
      const row = rows.get(date);
      if (!validRow(row)) continue;
      need.add(key);
      floor.set(key, { g: row.total_grades, m: row.total_gems });
    }
  };

  for (let monday = mondayOf(lastDate) + 7 * DAY; monday <= mondayOf(collectedOn); monday += 7 * DAY) {
    const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => ymd(monday + offset * DAY));
    const week = isoWeek(days[0]);
    if (usable(days[2])) { take(week, days[2]); continue; }
    if (days[6] >= collectedOn) { pending.push(week); continue; }
    const pick = NEAREST_WEDNESDAY.map((offset) => days[offset]).find(usable);
    if (pick) { take(week, pick); continue; }
    gaps.push({
      week,
      days: days.filter((date) => Object.values(byDate).some((map) => map.has(date))).map((date) => {
        const missing = missingOn(date);
        const invalid = invalidOn(date);
        return { date, have: need.size - missing.length, of: need.size, missing, copy: isCopy(date), ...(invalid.length ? { invalid } : {}) };
      }),
    });
  }
  return { chosen, gaps, pending };
}

module.exports = { frozenOn, isoWeek, snapshotTargets, rowsByKeyFromDump, selectionBasis, selectSnapshots, validRow };
