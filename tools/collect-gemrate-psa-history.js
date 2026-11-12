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

  for (const [code, set] of Object.entries(source.sets)) {
    const latest = (rowsByCode[code] || []).at(-1);
    if (!latest) throw new Error(`${code}: latest cumulative row missing`);
    set.latest = {
      date: latest.date,
      totalGrades: latest.total_grades,
      totalGems: latest.total_gems,
      gemRate: Math.round((latest.total_gems / latest.total_grades) * 1000) / 10,
    };
  }
  source.weeklyThrough = newDates.at(-1);
  source.collectedAt = Object.values(source.sets).map((set) => set.latest.date).sort().at(0);
  return { changed: true, through: source.weeklyThrough, added: newDates };
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

module.exports = { appendVerifiedWeeks, correctionReason, latestWednesday, frozenOn, collectRows };
