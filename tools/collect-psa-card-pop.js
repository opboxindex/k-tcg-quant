#!/usr/bin/env node
// 카드별 PSA 인구 수집 — 2026-08-10 정식화(지난 월요일엔 임시 스크립트로 돌렸다).
//
// GemRate 의 item-details(표준 팝리포트) 페이지에 세트의 카드별 RowData 가 통째로 실려 온다.
// 2026-11-02: 종전 item-details-advanced 가 같은 세트명에 "There were no results" 와 빈 RowData('[]')를 주기 시작했다.
//   표준 페이지는 같은 행(OP-01 일본판 124행, 번호·이름·변형 동일)을 주고 필드만 다르다 — total, total_standard(=grades 합), grades[0..10](끝이 10등급=gems).
//   total 은 total_standard 보다 1~2 클 때가 있다(OP01-120 망가 5098/5097 — 11칸 밖 감정). 총량은 total 을 쓴다.
//   10/22 고급 페이지 값과 대조해 같은 정의임을 확인했다(총량·10·9 모두 그 뒤 증가분만큼만 컸다).
// URL 은 추측하지 않는다 — 검증된 gemrate-psa-history(일본판)·gemrate-psa-en-totals(영문판)의
// set-population-trend URL 에서 **경로만** item-details 로 바꾼다
// (세트명 규칙을 추측하다 OP-06·OP-02 에서 다른 세트가 적재될 뻔한 전례가 있다).
//
// 하네스는 collect-gemrate-psa-history.js 와 동일한 CDP 패턴: 빈 URL 이면 직전 세트의
// RowData 를 그대로 읽는 사고(2026-07-27)가 있어, URL 검증 실패는 예외로 끊는다.
//
// Run: node tools/collect-psa-card-pop.js --probe   (첫 세트의 원시 RowData 키만 출력 — 필드명 확인용)
//      node tools/collect-psa-card-pop.js <출력덤프.json>   → 이어서 psa-card-pop-ingest.js <덤프>
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");

function chromeExecutable() {
  const candidates = process.platform === "win32"
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find(fs.existsSync) || null;
}

async function waitForJson(url, attempts = 75) {
  for (let i = 0; i < attempts; i += 1) {
    try { return await (await fetch(url)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error(`Chrome DevTools endpoint unavailable: ${url}`);
}

// 두 원장에서 (세트코드, 판, URL) 목록을 만든다. URL 형식이 어긋나면 그 자리에서 끊는다.
function sources() {
  const out = [];
  const jp = JSON.parse(fs.readFileSync(path.join(root, "data", "gemrate-psa-history.json"), "utf8"));
  for (const [code, set] of Object.entries(jp.sets || {})) {
    if (set.url) out.push({ code, ed: "jp", url: set.url });
  }
  const en = JSON.parse(fs.readFileSync(path.join(root, "data", "gemrate-psa-en-totals.json"), "utf8"));
  for (const [code, set] of Object.entries(en.sets || {})) {
    // 영문판 원장은 아직 GemRate 에 없는 세트를 null 로 둔다(OP-14·15) — 건너뛴다
    if (set && set.url) out.push({ code, ed: "en", url: set.url });
  }
  for (const s of out) {
    if (!/^https:\/\/www\.gemrate\.com\/set-population-trend\?/.test(s.url)) {
      throw new Error(`${s.code}|${s.ed}: 원장 URL 형식이 다름 — 아무것도 쓰지 않음`);
    }
    s.url = s.url.replace("/set-population-trend?", "/item-details?");
  }
  return out;
}

async function main() {
  const probe = process.argv.includes("--probe");
  const outPath = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  if (!probe && !outPath && !process.argv.includes("--urls") && !process.argv.includes("--browser")) throw new Error("사용법: --probe 또는 --urls 또는 --browser(로그인 크롬용 스크립트 출력) 또는 <출력덤프.json>");

  const list = sources();
  // --urls: 실브라우저 수집용 목록만 출력(GemRate 가 헤드리스를 봇으로 막을 때 — 2026-09-07 실측 "잠시만 기다리십시오").
  if (process.argv.includes("--urls")) { console.log(JSON.stringify(list)); return; }
  // --browser: 로그인된 실크롬(javascript_tool)에 붙여넣을 스크립트 출력. 같은 오리진 fetch 로 41세트 HTML 을 받아
  // `var RowData = '[...]'` 를 파싱한다(2026-09-22 실측: Cloudflare 는 헤드리스만 막고 로그인 탭의 fetch 는 통과).
  // 실행 → window.__psaOut 에 누적 → 마지막에 Blob 다운로드(psa-card-pop-<날짜>.json) → node tools/psa-card-pop-ingest.js <파일>
  if (process.argv.includes("--browser")) {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`(async()=>{const S=${JSON.stringify(list.map((x) => [x.code, x.ed, x.url]))};
const dec=(t)=>t.replace(/&#39;/g,"'").replace(/&amp;/g,"&").replace(/&quot;/g,'"');
const out={},errs=[];
for(const [code,ed,u] of S){try{const h=await (await fetch(u,{credentials:"include"})).text();
const want=decodeURIComponent((u.match(/set_name=([^&]+)/)||[])[1]||"");const t=dec((h.match(/<title>([^<]*)/)||[])[1]||"");
if(!t.includes(want)){errs.push(code+"|"+ed+" title mismatch: "+t.slice(0,60));continue}
const m=h.match(/var RowData = '([\\s\\S]*?)';\\s*\\n/);if(!m){errs.push(code+"|"+ed+" no RowData");continue}
const rows=JSON.parse(m[1]);if(rows.length<5){errs.push(code+"|"+ed+" rows "+rows.length);continue}
const bad=rows.find(r=>!Array.isArray(r.grades)||r.grades.length!==11||r.grades.reduce((a,b)=>a+b,0)!==Number(r.total_standard??r.total)||Number(r.total)<Number(r.total_standard??r.total));if(bad){errs.push(code+"|"+ed+" unknown row shape "+JSON.stringify(Object.keys(bad)).slice(0,80));continue}
out[code+"|"+ed]=rows.map(r=>({num:String(r.card_number??""),name:String(r.name??""),par:String(r.parallel??""),total:Number(r.total),g10:Number(r.grades[10]),g9:Number(r.grades[9])}));
}catch(e){errs.push(code+"|"+ed+" "+String(e).slice(0,60))}await new Promise(z=>setTimeout(z,4000));}
window.__psaOut=out;
if(!errs.length){const dump={grader:"psa",collectedAt:"${today}",source:"gemrate item-details (RowData, browser fetch)",sets:out};
const blob=new Blob([JSON.stringify(dump)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="psa-card-pop-${today}.json";document.body.appendChild(a);a.click();}
return {sets:Object.keys(out).length,rows:Object.values(out).reduce((s,a)=>s+a.length,0),errs};})()`);
    return;
  }
  console.log(`세트 ${list.length}개 (jp ${list.filter((s) => s.ed === "jp").length} · en ${list.filter((s) => s.ed === "en").length})`);

  const executable = chromeExecutable();
  if (!executable) throw new Error("Chrome 이 필요하다");
  const port = 9341;
  const profile = path.join(process.env.TEMP || root, `opbox-psacard-${process.pid}`);
  const chrome = spawn(executable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++seq; pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Page.enable");

    const dump = { grader: "psa", collectedAt: new Date().toISOString().slice(0, 10), sets: {} };
    for (const s of (probe ? list.slice(0, 1) : list)) {
      await send("Page.navigate", { url: s.url });
      let rows = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 300));
        const res = await send("Runtime.evaluate", {
          expression: "Array.isArray(globalThis.RowData) ? globalThis.RowData : null",
          returnByValue: true,
        });
        rows = res.result?.result?.value;
        if (Array.isArray(rows) && rows.length > 5) break;
      }
      if ((!Array.isArray(rows) || rows.length < 5) && probe) {
        // 진단: RowData 가 없으면 window 전역에서 "객체 배열(5행 이상)"을 전부 찾아 이름과 키를 보고한다
        const diag = await send("Runtime.evaluate", {
          expression: `(() => {
            const found = [];
            for (const k of Object.getOwnPropertyNames(window)) {
              try {
                const v = window[k];
                if (Array.isArray(v) && v.length >= 5 && typeof v[0] === "object" && v[0] && !Array.isArray(v[0])) {
                  found.push({ name: k, len: v.length, keys: Object.keys(v[0]).slice(0, 12) });
                }
              } catch {}
            }
            const tables = [...document.querySelectorAll("table")].map((t) => ({
              rows: t.rows.length,
              head: [...(t.rows[0]?.cells || [])].map((c) => c.textContent.trim()).slice(0, 10),
            }));
            return { title: document.title, found: found.slice(0, 10), tables: tables.slice(0, 3) };
          })()`,
          returnByValue: true,
        });
        console.log("진단:", JSON.stringify(diag.result?.result?.value, null, 1).slice(0, 1600));
        return;
      }
      if (!Array.isArray(rows) || rows.length < 5) throw new Error(`${s.code}|${s.ed}: RowData 없음 — 아무것도 쓰지 않음`);
      if (probe) {
        console.log("원시 키:", JSON.stringify(Object.keys(rows[0])));
        console.log("샘플 3행:", JSON.stringify(rows.slice(0, 3), null, 1).slice(0, 900));
        return;
      }
      // 필드명은 --probe 로 실측해 맞춘다(2026-08-10 확인). 모르는 구조면 빈 값이 아니라 예외.
      dump.sets[`${s.code}|${s.ed}`] = rows.map((r) => {
        const num = r.card_number ?? r.cardNumber ?? r.num;
        // 표준 팝리포트(2026-11-02~): grades[0..10] 의 끝 두 칸이 9·10등급이고 합이 total_standard 다(total 은 그 이상). 안 맞으면 모르는 구조로 본다.
        const std = Number(r.total_standard ?? r.total);
        const grades = Array.isArray(r.grades) && r.grades.length === 11 && r.grades.reduce((a, b) => a + b, 0) === std && Number(r.total) >= std ? r.grades : null;
        const total = r.total_graded ?? r.total ?? r.totalGraded;
        const g10 = grades ? grades[10] : r.gem_mint ?? r.g10 ?? r.gem10 ?? r.psa10;
        const g9 = grades ? grades[9] : r.mint_9 ?? r.g9 ?? r.psa9;
        const name = r.card_name ?? r.name ?? r.player;
        const par = r.parallel ?? r.variety ?? r.par ?? "";
        if (num == null || total == null) throw new Error(`${s.code}|${s.ed}: 알 수 없는 행 구조 ${JSON.stringify(Object.keys(r))}`);
        return { num: String(num), name: String(name ?? ""), par: String(par ?? ""), total: Number(total), g10: Number(g10 ?? 0), g9: Number(g9 ?? 0) };
      });
      console.log(`${s.code}|${s.ed}: ${dump.sets[`${s.code}|${s.ed}`].length}행`);
    }
    fs.writeFileSync(outPath, `${JSON.stringify(dump)}\n`, "utf8");
    console.log(JSON.stringify({ status: "ok", sets: Object.keys(dump.sets).length, out: outPath }));
  } finally {
    try { chrome.kill(); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
