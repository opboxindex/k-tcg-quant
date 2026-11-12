#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "data", "gemrate-psa-history.json");
const dayMs = 864e5;

function chromeExecutable() {
  const candidates = process.platform === "win32"
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find(fs.existsSync) || null;
}

function dateMs(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function latestWednesday(rows) {
  return [...rows].reverse().find((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === 3)?.date || null;
}

// 상류가 그날 갱신하지 않고 전날 누적을 그대로 복사한 행 고르기 — 2026-11-12.
// 실측: GemRate 추세가 10/27 뒤로 멈춰 10/28 행이 41계열 중 35계열에서 10/27 과 total_grades·total_gems 가 똑같았다
// (10/02~10/27 은 계열마다 26일 중 0~1일만 전날과 같았다). 그 행을 수요일 누적으로 받아 W44 증가분이 하루치 적게 들어갔다.
// 작은 세트는 정말로 하루 0건인 날이 드물게 있어 계열 하나로는 못 가른다 → 같은 날 비교할 수 있는 계열의 절반 이상이
// 전날과 같으면 그날은 상류가 멈춘 날로 보고, 그날 전날과 같은 계열만 돌려준다(그날 실제로 바뀐 계열은 그대로 쓴다).
function frozenOn(rowsByKey, date) {
  const prevDate = new Date(dateMs(date) - dayMs).toISOString().slice(0, 10);
  const same = [];
  let comparable = 0;
  for (const [key, rows] of Object.entries(rowsByKey)) {
    const current = (rows || []).find((row) => row.date === date);
    const previous = (rows || []).find((row) => row.date === prevDate);
    if (!current || !previous) continue;
    comparable += 1;
    if (current.total_grades === previous.total_grades && current.total_gems === previous.total_gems) same.push(key);
  }
  return comparable && same.length * 2 >= comparable ? new Set(same) : new Set();
}

const FROZEN_REASON = (date) => `GemRate public source repeated the previous day's cumulative row on ${date} (upstream refresh stopped); omitted rather than estimated.`;

// 세트 추이가 멈췄을 때 세트 누적(latest·영문판 총량)을 같은 GemRate 의 팝 리포트(item-details) 카드 합계로 대신한다 — 2026-11-12 소유자 승인.
// 실측(2026-11-12): 추이는 10/27 뒤로 복사본만 이어졌고("Updated: 2026-10-29") 팝 리포트는 "Updated: 2026-11-07" 로 살아 있었다.
// 같은 기준인지 41계열로 대조: 추이가 11/06 까지 산 4계열은 팝 합계 − 추이 = +53~+163(하루치 증가분 0.7~1.0배),
// 멈춘 37계열은 10/27 → 11/07 11일치 증가분의 0.6~1.9배였고 줄어든 계열은 없었다. 합계는 카드 행 total·grades[10] 의 합이다.
// 쓰는 조건: 팝 기준일이 지금 값보다 늦고, 누적(전체·10등급)이 줄지 않고, 늘어난 양이 최근 28일 속도로 낸 기대치의 3배+100 이하.
// 하나라도 어긋나면 지금 값을 둔다(빈칸이 틀린 값보다 낫다). 주간 그래프(수요일 누적의 차)는 채우지 않는다 — 팝 리포트는 수요일 값이 아니다.
function popReportTotals(cardDump) {
  const out = {};
  for (const [key, rows] of Object.entries(cardDump.sets || {})) {
    const date = cardDump.updated?.[key];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Array.isArray(rows) || !rows.length) continue;
    const totalGrades = rows.reduce((sum, row) => sum + row.total, 0);
    const totalGems = rows.reduce((sum, row) => sum + row.g10, 0);
    if (!Number.isInteger(totalGrades) || !Number.isInteger(totalGems) || totalGrades <= 0 || totalGems < 0 || totalGems > totalGrades) continue;
    out[key] = { date, totalGrades, totalGems, cards: rows.length };
  }
  return out;
}

// 끝에 붙은 복사본(전날과 누적이 똑같은 행)을 걷어낸 마지막 실제 변동 행 — 2026-11-12.
// 상류가 멈춘 동안에도 날짜만 바뀐 복사 행이 이어진다(10/28·10/29 실측). 그걸 "새 값"으로 받으면 옛 누적에 새 날짜가 붙고,
// 팝 리포트로 바꿔 둔 더 큰 값을 그보다 작은 옛 값으로 되돌리게 된다. 작은 세트가 정말 하루 0건인 날도 걷히지만
// 그 경우 기준일이 하루 이를 뿐 값은 같다(보수적).
function lastRealRow(rows) {
  let index = (rows || []).length - 1;
  while (index > 0 && rows[index].total_grades === rows[index - 1].total_grades && rows[index].total_gems === rows[index - 1].total_gems) index -= 1;
  return index >= 0 ? rows[index] : null;
}

// 값의 기준일을 정할 때 쓰는 마지막 행 — 끝의 복사 행 중 **상류가 멈춘 날**(frozenOn: 같은 날 다수 계열이 전날과 같음)만 걷는다.
// 정상 주에 작은 세트 하나만 하루 이틀 감정 0건이면 그건 진짜 값이라 그 날짜를 그대로 쓴다 — 전부 걷으면 그 세트 날짜만
// 앞당겨져 가장 낡은 세트로 재는 CI 신선도 검사가 괜히 실패한다(2026-11-12 재검증 지적). 증가 속도 계산은 lastRealRow 를 쓴다.
function lastLiveRow(rowsByKey, key) {
  const rows = rowsByKey[key] || [];
  let index = rows.length - 1;
  while (index > 0 && rows[index].total_grades === rows[index - 1].total_grades && rows[index].total_gems === rows[index - 1].total_gems
    && frozenOn(rowsByKey, rows[index].date).has(key)) index -= 1;
  return index >= 0 ? rows[index] : null;
}

function popReportLatest(current, rows, pop) {
  if (!pop || !current || pop.date <= current.date) return { use: false };
  if (pop.totalGrades < current.totalGrades || pop.totalGems < current.totalGems) {
    return { use: false, problem: `팝 리포트 ${pop.date} ${pop.totalGrades}/${pop.totalGems} 가 지금 ${current.date} ${current.totalGrades}/${current.totalGems} 보다 작음` };
  }
  // 최근 속도 — 마지막 실제 변동일 기준 28일
  const real = lastRealRow(rows);
  const from = real && rows.find((row) => row.date >= new Date(dateMs(real.date) - 28 * dayMs).toISOString().slice(0, 10));
  const span = real ? (dateMs(real.date) - dateMs(from.date)) / dayMs : 0;
  if (!real || span <= 0) return { use: false, problem: `추이 행이 모자라 팝 리포트 ${pop.date} 증가 폭을 검증 못 함` };
  const pace = (real.total_grades - from.total_grades) / span;
  const allowed = 3 * pace * ((dateMs(pop.date) - dateMs(real.date)) / dayMs) + 100;
  if (pop.totalGrades - real.total_grades > allowed) {
    return { use: false, problem: `팝 리포트 ${pop.date} 증가 ${pop.totalGrades - real.total_grades} 가 최근 속도 기대치 상한 ${Math.round(allowed)} 초과` };
  }
  return {
    use: true,
    latest: {
      date: pop.date,
      totalGrades: pop.totalGrades,
      totalGems: pop.totalGems,
      gemRate: Math.round((pop.totalGems / pop.totalGrades) * 1000) / 10,
      source: "pop-report",
    },
  };
}

function correctionReason(code, date, grades, gems, priorValues) {
  if (!Number.isInteger(grades) || !Number.isInteger(gems) || grades < 0 || gems < 0 || gems > grades) {
    return `${code} ${date}: invalid cumulative delta from the public source`;
  }
  const sorted = priorValues.filter(Number.isFinite).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  if (grades > Math.max(10000, median * 10)) return `${code} ${date}: upstream cumulative reset/recovery produced an implausible weekly delta`;
  return null;
}

function appendVerifiedWeeks(source, rowsByCode) {
  const through = latestWednesday(Object.values(rowsByCode)[0] || []);
  if (!through || through <= source.weeklyThrough) return { changed: false, through: source.weeklyThrough, added: [] };

  const newDates = [];
  for (let time = dateMs(source.weeklyThrough) + 7 * dayMs; time <= dateMs(through); time += 7 * dayMs) {
    newDates.push(new Date(time).toISOString().slice(0, 10));
  }

  source.corrections ||= {};
  for (const date of newDates) {
    let covered = 0;
    const previousDate = new Date(dateMs(date) - 7 * dayMs).toISOString().slice(0, 10);
    const frozenNow = frozenOn(rowsByCode, date);
    const frozenBefore = frozenOn(rowsByCode, previousDate);
    for (const [code, set] of Object.entries(source.sets)) {
      const rows = rowsByCode[code] || [];
      const current = rows.find((row) => row.date === date);
      const previous = rows.find((row) => row.date === previousDate);
      if (!current || !previous) {
        (source.corrections[code] ||= []).push({ date, reason: "GemRate public source did not expose both Wednesday cumulative rows; omitted rather than estimated." });
        covered += 1;
        continue;
      }
      // 이번 수요일이나 지난 수요일 행이 복사본이면 증가분이 하루 이상 어긋난다 — 추정하지 않고 뺀다.
      const frozenDate = frozenNow.has(code) ? date : frozenBefore.has(code) ? previousDate : null;
      if (frozenDate) {
        (source.corrections[code] ||= []).push({ date, reason: FROZEN_REASON(frozenDate) });
        covered += 1;
        continue;
      }
      const grades = current.total_grades - previous.total_grades;
      const gems = current.total_gems - previous.total_gems;
      const reason = correctionReason(code, date, grades, gems, (set.weekly || []).map((point) => point.grades));
      if (reason) {
        (source.corrections[code] ||= []).push({ date, reason });
      } else {
        set.weekly.push({ d: date, grades, gems, totalGrades: current.total_grades, totalGems: current.total_gems });
      }
      covered += 1;
    }
    if (covered !== Object.keys(source.sets).length) throw new Error(`${date}: incomplete set coverage`);
    source.retainedWeeklyDates.push(date);
  }

  // latest 는 뒤로 가지 않는다(2026-11-12): 추이의 마지막 실제 변동 행이 지금 값보다 새것이고 누적이 줄지 않을 때만 바꾼다.
  // 지금 값이 더 새것(팝 리포트 대체값 등)이면 그대로 두고, 날짜는 새것인데 누적이 줄었으면 두고 kept 에 남긴다(사람이 본다).
  const kept = [];
  for (const [code, set] of Object.entries(source.sets)) {
    const latest = lastLiveRow(rowsByCode, code);
    if (!latest) throw new Error(`${code}: latest cumulative row missing`);
    const prev = set.latest;
    if (prev?.date && latest.date <= prev.date) continue;
    if (Number.isInteger(prev?.totalGrades) && (latest.total_grades < prev.totalGrades || latest.total_gems < prev.totalGems)) {
      kept.push(`${code} 추이 ${latest.date} ${latest.total_grades}/${latest.total_gems} < 지금 ${prev.date} ${prev.totalGrades}/${prev.totalGems} — 지금 값 유지`);
      continue;
    }
    set.latest = {
      date: latest.date,
      totalGrades: latest.total_grades,
      totalGems: latest.total_gems,
      gemRate: Math.round((latest.total_gems / latest.total_grades) * 1000) / 10,
    };
  }
  source.weeklyThrough = newDates.at(-1);
  source.collectedAt = Object.values(source.sets).map((set) => set.latest.date).sort().at(0);
  return { changed: true, through: source.weeklyThrough, added: newDates, kept };
}

async function waitForJson(url, attempts = 75) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome DevTools endpoint unavailable: ${url}`);
}

async function collectRows(source) {
  const executable = chromeExecutable();
  if (!executable) throw new Error("Chrome/Chromium is required for the public GemRate collection step");
  const port = 9334;
  const profile = path.join(process.env.RUNNER_TEMP || process.env.TEMP || root, `opbox-gemrate-${process.pid}`);
  const chrome = spawn(executable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++sequence;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Page.enable");

    const rowsByCode = {};
    for (const [code, set] of Object.entries(source.sets)) {
      // URL 이 비어 있으면 Page.navigate 가 조용히 실패하고 **직전 세트의 RowData 를 그대로 읽는다**.
      // 2026-07-27 실사고: 영문판 목록에 url 을 안 넣어 다른 세트 값이 그 세트 값으로 적재됐다.
      if (!/^https:\/\/www\.gemrate\.com\/set-population-trend\?/.test(set.url || "")) {
        throw new Error(`${code}: GemRate URL 이 없거나 형식이 다름 — 아무것도 쓰지 않음`);
      }
      await send("Page.navigate", { url: set.url });
      let rows = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1200 : 250));
        const response = await send("Runtime.evaluate", {
          expression: "Array.isArray(globalThis.RowData) ? globalThis.RowData : null",
          returnByValue: true,
        });
        rows = response.result?.result?.value;
        if (Array.isArray(rows) && rows.length > 10) break;
      }
      if (!Array.isArray(rows) || rows.length < 10) throw new Error(`${code}: GemRate RowData unavailable; no files changed`);
      rowsByCode[code] = rows;
      process.stdout.write(`Collected ${code}: ${rows.at(-1).date}\n`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    socket.close();
    return rowsByCode;
  } finally {
    chrome.kill();
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch {}
  }
}

async function main() {
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const rows = await collectRows(source);
  const result = appendVerifiedWeeks(source, rows);
  if (result.changed) fs.writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: result.changed ? "updated" : "current", ...result }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack); process.exitCode = 1; });

module.exports = { appendVerifiedWeeks, correctionReason, latestWednesday, frozenOn, lastRealRow, lastLiveRow, popReportTotals, popReportLatest, collectRows };
