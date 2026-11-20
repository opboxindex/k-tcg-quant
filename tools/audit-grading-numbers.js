// 등급 표시 숫자 전수 검사 — 화면에 나가는 등급 숫자가 원본과 어긋나는지 본다.
//
// 왜: 등급 데이터는 이 사이트에서 가장 "우리만 가진" 부분이고, 소유자가 틀리면 안 된다고 못박았다.
// 여기서 보는 것은 계산 정합성이다(원본 수집이 맞았는지는 수집 도구가 따로 검증한다).
//
// 검사 항목
//   G1 젬률 = PSA10 ÷ 총량 (반올림 오차 0.1%p 이내)
//   G2 판별 원장(psa-edition-weekly)과 화면 증감 — 2026-11-20 개편(wowAdd·wowPct·wowSpark·psaWow → change)
//      G2a 원장 모양: weeks 오름차순·ISO 주마다 한 날 / 계열마다 점 날짜 = 첫 점 이후의 weeks / 누적 g 감소 없음 / m ≤ g
//      G2b psaFull(En).change {from,to,days,add,pct,spark} 가 원장 마지막 두 점에서 다시 계산한 값과 정확히 같다(pct 만 ±0.15).
//          두 점이 있는데 change 가 없거나, 두 점이 없는데 change 가 있거나, 옛 wowAdd·wowPct·wowSpark·psaWow 가 남으면 실패
//      G2c 일본판 세트 증가 이력(packs psaWeekly.points {d, v, f})의 구간 f→d 가 gemrate-psa-history.retainedWeeklyDates 와 맞다
//   G3 CGC 최상위 등급 합(Pristine 10 + Gem Mint 10 + Perfect 10)이 총량을 넘지 않음
//   G4 TAG 10 + 10P 가 총량을 넘지 않음
//   G5 등급 수가 총량보다 큰 항목이 없음
//   G6 판별 총량이 서로 같은 값으로 복사돼 있지 않음(일판·영판 혼입 흔적)
//   G7 화면에 나가는 등급사 증감(add/from/to)이 그 판의 실제 마지막 두 관측과 일치
//      — 2026-07-29 실사고: from/to 를 판별 공용으로 두는 바람에 영문판 날짜가 일본판 라벨을
//        덮어써, 5일치 증가(+86)가 하루치 증가처럼 표기됐다.
// Run: node tools/audit-grading-numbers.js
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const rd = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", p), "utf8")); } catch { return null; } };
const pk = rd("onepiece-packs.json");
const led = rd("psa-edition-weekly.json");
const hist = rd("gemrate-psa-history.json");
const cgc = rd("cgc-grading-history.json");
const tag = rd("tag-grading-history.json");

const errors = [];
const warn = [];
// 누적 감소 후보. 루프가 끝난 뒤 같은 등급사·판·날짜에 몇 세트가 함께 줄었는지로 판정한다(아래 참조).
const drops = [];
const codes = [...(pk.jp?.list || []), ...(pk.extra?.list || [])];

// 날짜 계산은 UTC 일 번호로 한다 — 원장 날짜가 전부 UTC 날짜라 시간대에 따라 하루가 밀리면 days 가 틀린다.
const DAY = 86400000;
const dayNum = (d) => Date.parse(`${d}T00:00:00Z`) / DAY;
const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
// 같은 ISO 주 = 같은 월요일. 주 번호(연도 경계 계산)를 만들 필요 없이 월요일만 비교하면 된다.
const mondayOf = (d) => { const n = dayNum(d); return n - ((new Date(n * DAY).getUTCDay() + 6) % 7); };

// ── G2a. 판별 원장 모양 — 2026-11-20.
//    공유 점 = ISO 주마다 수요일, 없으면 주가 끝난 뒤 수요일에 가장 가까운 41계열 완전·비복사 날(tools/psa-snapshot-select.js).
//    그래서 간격이 7일이 아닐 수 있다. 대신 "모든 계열이 같은 날짜를 공유한다"를 여기서 지킨다 — 그래야 change 의 from/to 가
//    일본판·영문판 어느 계열에서나 같은 창이고, audit-series-gaps 의 합집합 주 판정이 곧 원장 주 판정이 된다.
//    누적 감소 검사도 여기로 옮겼다(마지막 두 점만이 아니라 전 구간) — 누적이 줄면 수집이 다른 세트를 읽은 것이다(과거 실사고).
const weeks = (led && led.weeks) || [];
if (!led) errors.push("G2a data/psa-edition-weekly.json 을 못 읽었다");
for (let i = 1; i < weeks.length; i++) {
  if (!(weeks[i] > weeks[i - 1])) errors.push(`G2a weeks: ${weeks[i - 1]} → ${weeks[i]} 오름차순이 아니다`);
  else if (mondayOf(weeks[i]) === mondayOf(weeks[i - 1])) errors.push(`G2a weeks: ${weeks[i - 1]}·${weeks[i]} 가 같은 ISO 주 — 주마다 한 점이어야 한다`);
}
for (const [code, eds] of Object.entries((led && led.sets) || {})) {
  for (const [ed, arr] of Object.entries(eds || {})) {
    if (!Array.isArray(arr) || !arr.length) continue;
    const got = arr.map((p) => p.d), want = weeks.filter((w) => w >= got[0]);
    if (got.join() !== want.join()) {
      const miss = want.filter((d) => !got.includes(d)), extra = got.filter((d) => !want.includes(d));
      errors.push(`G2a ${code}.${ed}: 점 날짜가 원장 weeks 와 다르다 — 빠진 날 [${miss.join(" ")}] · weeks 에 없는 날 [${extra.join(" ")}]${miss.length || extra.length ? "" : " · 순서·중복"}`);
    }
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!Number.isInteger(p.g) || !Number.isInteger(p.m) || p.m > p.g) errors.push(`G2a ${code}.${ed} ${p.d}: g(${p.g})·m(${p.m}) 가 정수가 아니거나 m > g`);
      else if (i && p.g < arr[i - 1].g) errors.push(`G2a ${code}.${ed}: 누적 등급 수가 감소(${arr[i - 1].d} ${arr[i - 1].g} → ${p.d} ${p.g}) — 수집 오염 의심`);
    }
  }
}

for (const code of codes) {
  const s = pk.sets[code] || {};

  // ── G1. 젬률 = PSA10 ÷ 총량
  for (const [ed, f] of [["jp", s.psaFull], ["en", s.psaFullEn]]) {
    if (!f || !f.total) continue;
    const g = f.gem10 ?? f.gems;
    if (g == null) { warn.push(`${code}.${ed}: PSA10 수가 없다(젬률만 있음)`); continue; }
    if (g > f.total) errors.push(`G5 ${code}.${ed}: PSA10(${g}) > 총량(${f.total})`);
    const calc = Math.round((g / f.total) * 1000) / 10;
    if (f.gemRate != null && Math.abs(calc - f.gemRate) > 0.1) {
      errors.push(`G1 ${code}.${ed}: 젬률 표시 ${f.gemRate}% ≠ 계산 ${calc}% (${g}/${f.total})`);
    }
  }

  // ── G6. 일판·영판이 같은 숫자면 한쪽을 잘못 복사했을 가능성이 크다
  if (s.psaFull && s.psaFullEn && s.psaFull.total === s.psaFullEn.total) {
    errors.push(`G6 ${code}: 일판·영판 PSA 총량이 동일(${s.psaFull.total}) — 복사 의심`);
  }

  // ── G2b. 화면 증감(change)이 원장 마지막 두 점과 정확히 같은가 — 2026-11-20(wowAdd·wowPct·wowSpark·psaWow 대체).
  //    change = { from, to, days, add, pct, spark? } — [from, to] = weeks.slice(-2), days = UTC 일수 차, add = b.g − a.g,
  //    pct = 반올림 1자리 %, spark = 그 계열 마지막 ≤12 구간의 [일수, Δg] 쌍(구간 4개 이상일 때만). 간격이 7일이 아닐 수 있어
  //    화면은 반드시 from·to·일수를 같이 쓴다 — 그 숫자들이 원장과 하나라도 다르면 "며칠 사이 몇 장"이 거짓이 된다.
  //    옛 필드가 남아 있으면 그걸 읽는 화면이 7일이 아닌 창을 "주간"으로 낼 수 있어 실패로 본다.
  if (s.psaWow) errors.push(`G2b ${code}: 옛 psaWow 가 남아 있다 — inject-psa-wow 를 다시 돌려야 한다`);
  const [wa, wb] = weeks.length >= 2 ? weeks.slice(-2) : [null, null];
  const rec = ((led && led.sets) || {})[code] || {};
  for (const [ed, f] of [["jp", s.psaFull], ["en", s.psaFullEn]]) {
    if (!f) continue;
    const left = ["wowAdd", "wowPct", "wowSpark"].filter((k) => k in f);
    if (left.length) errors.push(`G2b ${code}.${ed}: 옛 필드 ${left.join("·")} 가 남아 있다 — inject-psa-wow 를 다시 돌려야 한다`);
    const arr = rec[ed] || [];
    const ia = wa ? arr.findIndex((p) => p.d === wa) : -1, ib = wb ? arr.findIndex((p) => p.d === wb) : -1;
    const c = f.change;
    if (ia < 0 || ib < 0) {
      if (c) errors.push(`G2b ${code}.${ed}: change(${c.from}→${c.to}) 가 있는데 원장에 마지막 두 점(${wa}·${wb})이 다 있지 않다`);
      continue;
    }
    if (!c) { errors.push(`G2b ${code}.${ed}: 원장에 ${wa}·${wb} 두 점이 있는데 change 가 없다 — inject-psa-wow 를 다시 돌려야 한다`); continue; }
    const a = arr[ia], b = arr[ib];
    const add = b.g - a.g, days = dayNum(wb) - dayNum(wa);
    const pct = Math.round((add / a.g) * 1000) / 10;
    const odd = Object.keys(c).filter((k) => !["from", "to", "days", "add", "pct", "spark"].includes(k));
    if (odd.length) errors.push(`G2b ${code}.${ed}: change 에 정의 밖 필드 ${odd.join("·")}`);
    if (c.from !== wa || c.to !== wb) errors.push(`G2b ${code}.${ed}: 증감 구간 표시 ${c.from}→${c.to} ≠ 원장 ${wa}→${wb}`);
    if (c.days !== days) errors.push(`G2b ${code}.${ed}: 증감 일수 표시 ${c.days} ≠ 원장 ${days}일 (${wa}→${wb})`);
    if (c.add !== add) errors.push(`G2b ${code}.${ed}: 증감 표시 ${c.add} ≠ 원장 ${add} (${wa}→${wb})`);
    if (typeof c.pct !== "number" || Math.abs(c.pct - pct) > 0.15) errors.push(`G2b ${code}.${ed}: 증감률 표시 ${c.pct}% ≠ 계산 ${pct}%`);
    const iv = [];
    for (let i = 1; i <= ib; i++) iv.push([dayNum(arr[i].d) - dayNum(arr[i - 1].d), arr[i].g - arr[i - 1].g]);
    const spark = iv.length >= 4 ? iv.slice(-12) : undefined;
    if (JSON.stringify(c.spark) !== JSON.stringify(spark)) {
      errors.push(`G2b ${code}.${ed}: spark ${JSON.stringify(c.spark ?? null)} ≠ 원장 재계산 ${JSON.stringify(spark ?? null)}`);
    }
    // 원장 최신값과 화면 총량이 크게 다르면 둘 중 하나가 낡았다.
    if (Math.abs(b.g - f.total) > Math.max(50, f.total * 0.02)) {
      warn.push(`${code}.${ed}: 화면 총량 ${f.total} vs 원장 최신 ${b.g} (${wb}) 차이 큼`);
    }
  }

  // ── G3/G4. 등급사별 최상위 등급 합이 총량을 넘지 않아야 한다
  for (const [name, src, keys] of [["CGC", cgc, ["Pristine 10", "Gem Mint 10", "Perfect 10"]], ["TAG", tag, null]]) {
    for (const ed of ["jp", "en"]) {
      const arr = src && src.sets && src.sets[code] && src.sets[code][ed];
      if (!Array.isArray(arr) || !arr.length) continue;
      const last = arr[arr.length - 1];
      if (!last.total) continue;
      if (keys) {
        const g = last.grades || {};
        const top = keys.reduce((t, k) => t + (g[k] || 0), 0);
        if (top > last.total) errors.push(`G3 ${code}.${ed}: CGC 최상위 합(${top}) > 총량(${last.total})`);
        const all = Object.values(g).reduce((t, v) => t + (v || 0), 0);
        if (all > last.total) errors.push(`G3 ${code}.${ed}: CGC 등급 합(${all}) > 총량(${last.total})`);
      } else {
        const t10 = (last.g10 || 0) + (last.g10p || 0);
        if (t10 > last.total) errors.push(`G4 ${code}.${ed}: TAG 10+10P(${t10}) > 총량(${last.total})`);
        if (last.gem != null && last.g10 != null && last.g10 > last.gem) {
          warn.push(`${code}.${ed}: TAG 10(${last.g10}) > gem(${last.gem}) — 정의 확인 필요`);
        }
      }
      // 누적 역행. 등급사 공개 집계는 재등급·정정으로 한두 장 줄어들 수 있다 —
      // 그건 관측 사실이라 경고로 남기고 화면에는 증감을 띄우지 않는다(주입기가 음수를 안 만든다).
      // 크게 줄면 얘기가 다르다. 다른 세트를 읽어온 것이고(과거 실사고) 그건 반드시 막아야 한다.
      for (let i = 1; i < arr.length; i++) {
        const a = arr[i - 1], b = arr[i];
        if (a.total == null || b.total == null || b.total >= a.total) continue;
        const drop = a.total - b.total;
        const msg = `${name} ${code}.${ed}: 누적 총량 감소 (${a.d} ${a.total} → ${b.d} ${b.total})`;
        drops.push({ key: `${name}|${ed}|${b.d}`, msg, big: drop > 5 && drop > a.total * 0.005 });
        break;
      }
    }
  }
}

// ── G2c. 일본판 세트 증가 이력(packs psaWeekly.points {d, v, f})의 구간이 원장 보존일과 맞는가 — 2026-11-20.
//    점 하나 = 직전 보존일(f) → d 사이에 새로 등급 받은 수다. 판별 원장과 같은 선택기로 날짜를 고르게 되면서 간격이 7일이 아닐 수
//    있으므로, 화면이 "f → d (며칠)" 을 쓰려면 f 가 정확해야 한다. f = d 바로 앞 보존일, 첫 보존일이면 d − 7일(옛 점은 수요일 쌍이었다).
//    v 값 자체는 가드 D3(tools/guard/ledgers.js)가 원장과 대조한다 — 여기서는 구간만 본다.
{
  const ret = (hist && hist.retainedWeeklyDates) || [];
  const at = new Map(ret.map((d, i) => [d, i]));
  for (const code of codes) {
    const w = (pk.sets[code] || {}).psaWeekly;
    if (!w) continue;
    if (!hist) { errors.push(`G2c ${code}: psaWeekly 가 있는데 data/gemrate-psa-history.json 을 못 읽었다`); continue; }
    const pts = w.points || [];
    const bad = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i && !(p.d > pts[i - 1].d)) { bad.push(`${pts[i - 1].d}→${p.d} 오름차순 아님`); continue; }
      const k = at.get(p.d);
      if (k == null) { bad.push(`${p.d} 가 retainedWeeklyDates 에 없다`); continue; }
      const f = k > 0 ? ret[k - 1] : isoOf(dayNum(p.d) - 7);
      if (p.f !== f) bad.push(`${p.d} 의 f=${p.f ?? "없음"} ≠ 직전 보존일 ${f}`);
    }
    if (bad.length) errors.push(`G2c ${code}: psaWeekly 점 ${bad.length}/${pts.length}개 구간이 보존일과 다르다 — ${bad.slice(0, 3).join(" · ")}${bad.length > 3 ? " …" : ""}`);
  }
}

// ── G7. 화면용 등급사 블록(set.graders)이 원본 시계열과 맞는가
for (const code of codes) {
  const g = (pk.sets[code] || {}).graders;
  if (!g) continue;
  for (const [key, src] of [["cgc", cgc], ["tag", tag]]) {
    const blk = g[key];
    if (!blk) continue;
    if (blk.from || blk.to) errors.push(`G7 ${code}.${key}: 증감 구간이 판별 공용으로 저장됨 — 판마다 따로 두어야 한다`);
    for (const ed of ["jp", "en"]) {
      const e = blk[ed];
      if (!e) continue;
      const arr = ((src.sets || {})[code] || {})[ed];
      if (!Array.isArray(arr) || !arr.length) { errors.push(`G7 ${code}.${key}.${ed}: 화면 값이 있는데 원본 시계열이 없다`); continue; }
      const last = arr[arr.length - 1], prev = arr.length > 1 ? arr[arr.length - 2] : null;
      if (e.total !== last.total) errors.push(`G7 ${code}.${key}.${ed}: 총량 표시 ${e.total} ≠ 최신 관측 ${last.total} (${last.d})`);
      if (e.add == null) continue;
      if (!prev) { errors.push(`G7 ${code}.${key}.${ed}: 증감이 있는데 이전 관측이 없다`); continue; }
      if (e.add !== last.total - prev.total) errors.push(`G7 ${code}.${key}.${ed}: 증감 ${e.add} ≠ ${last.total - prev.total}`);
      if (e.from !== prev.d || e.to !== last.d) {
        errors.push(`G7 ${code}.${key}.${ed}: 증감 구간 표시 ${e.from}→${e.to} ≠ 실제 ${prev.d}→${last.d}`);
      }
    }
  }
}

// ── G8. top10 카드번호 자체가 맞는가 — 등급·가격 매칭이 전부 이 번호에 매달려 있다.
//    2026-07-29 실사고: OP-09 골 D. 로저(금망가)가 "119" 로 들어가 있었다. 실제 번호는 OP09-118 이고
//    119 는 몽키 D. 루피다. 그래서 NM 재고 링크가 다른 카드를 검색했고, CGC 매칭도 실패했다.
//    사용자가 CGC 공개 인구표 캡처를 보내와서 발견됐다 — 우리 안에서는 아무도 못 잡았다.
//    같은 세트 psa 표에는 #118 로 옳게 들어 있었다. 우리 두 표를 서로 대조하면 잡힌다.
for (const code of codes) {
  const s = pk.sets[code] || {};
  for (const c of s.cards || []) {
    const raw = String(c.number || "").replace(/^#/, "").toUpperCase();
    // DON!! 카드는 표준 카드번호 체계가 없다 — 번호가 없거나 "DON!!" 인 게 정상이다.
    if (/DON/i.test(c.name || "") || raw === "DON!!") continue;
    // 번호가 아예 없으면 아무것과도 매칭되지 않으므로 틀린 값이 나갈 일은 없다 — 경고로 남긴다.
    if (!raw) { warn.push(`${code}: top10 "${c.name}" 에 카드번호 없음 — 등급·시세 매칭 불가`); continue; }
    // 위험한 건 "있지만 쓸 수 없는" 번호다. 맨숫자("119")는 그럴듯해 보여서 잘못 매칭될 수 있다.
    if (!/^(OP|EB|PRB|ST)\d{2}-\d{3}$/.test(raw)) {
      errors.push(`G8 ${code}: 카드번호 형식 이상 "${raw}" (${c.name}) — 세트접두어+3자리여야 한다`);
      continue;
    }
    // 같은 이름이 psa 표에 있으면 뒤 3자리가 같아야 한다. 다르면 둘 중 하나가 틀렸다.
    const tail = raw.slice(-3);
    const same = (s.psa || []).filter((p) => p.name === c.name);
    if (same.length && !same.some((p) => String(p.number).padStart(3, "0") === tail)) {
      errors.push(`G8 ${code}: "${c.name}" top10 번호 ${raw} 가 psa 표 번호(${same.map((p) => p.number).join("/")})와 불일치`);
    }
    // NM 링크가 다른 번호를 검색하고 있으면 다른 카드의 시세·재고를 보여준다.
    const m = String(c.nmSourceUrl || "").match(/(OP|EB|PRB|ST)\d{2}-?\d{3}/i);
    if (m && m[0].toUpperCase().replace("-", "") !== raw.replace("-", "")) {
      errors.push(`G8 ${code}: "${c.name}" NM 링크가 ${m[0]} 를 검색 — 카드번호는 ${raw}`);
    }
  }
}

// 누적 감소 판정 — 한 세트만 크게 줄면 다른 세트를 읽어온 것이라 막는다(과거 실사고).
// 같은 등급사·판에서 같은 날 세 세트 이상이 함께 줄면 등급사 집계 자체가 바뀐 것이다
// (2026-09-14 실측: TAG 일본판 21세트 중 15세트가 1~13장씩 동시 감소, 화면 재확인으로 값 일치). 그건 경고로 남기고 통과시킨다.
{
  const byKey = {};
  for (const d of drops) byKey[d.key] = (byKey[d.key] || 0) + 1;
  for (const d of drops) {
    if (d.big && byKey[d.key] < 3) errors.push(`${d.msg} — 다른 세트 오독 의심`);
    else if (byKey[d.key] >= 3) warn.push(`${d.msg} — 같은 날 ${byKey[d.key]}개 세트 동시 감소, 집계 변동으로 보고 통과. 증감 미표시`);
    else warn.push(`${d.msg} — 재등급/정정으로 보임, 증감 미표시`);
  }
}
const out = { audit: errors.length ? "GRADING_FAIL" : "GRADING_OK", sets: codes.length, errors, warnings: warn };
console.log(JSON.stringify(out, null, 1));
if (errors.length) process.exit(1);
