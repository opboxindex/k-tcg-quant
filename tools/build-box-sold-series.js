// 박스 eBay SOLD(실거래) 시계열 — **원장에서 판매일 기준으로 다시 센다**.
//
// 2026-08-13 교체. 그 전(append-box-sold-series.js)은 "수집일 스냅샷"을 하루 한 점씩 덧붙였다.
// 두 가지가 틀어져 있었다:
//
//  1) **수집 방식이 바뀌면 값이 튄다.** 8/13 에 언어 판별을 제목 추측 → eBay 신고값(Language 패싯)으로
//     바꾸자 일본판 표본이 10배로 늘었고, 그날 점만 OP-13 $118 → $137 로 뛰었다. 시장이 움직인 게
//     아니라 우리가 더 잘 보게 된 것인데 그래프에는 급등으로 그려졌다 — D4 가드가 막으려던 바로 그 형태다.
//  2) **후행한다.** 스냅샷은 그날 검색결과에 보인 sold 를 전부 뭉갠 값이라 사실상 최근 90일 평균이었다.
//     OP-01 영문판은 스냅샷 $1,525 인데 최근 4주 실거래 중앙값은 $1,363 이었다. 시세가 내리는 중이면
//     스냅샷이 계속 위쪽에 붙어 있는다.
//
// 그래서 이제 원장(box-sold-ledger.json, 건별 실거래)에서 **판매일** 기준 롤링 중앙값으로 매번 다시 만든다.
// 수집일이 언제였는지, 그날 검색이 넓었는지 좁았는지와 무관해진다. 오늘 새로 발견한 과거 판매도
// 그 판매일 구간에 함께 들어가므로 지난 구간까지 같이 두꺼워진다.
//
// ⚠️ 원장은 절대 건드리지 않는다. 이 도구는 원장을 읽기만 하고 시계열만 다시 쓴다.
//    시계열은 파생물이라 언제든 재생성 가능하다 — 원장이 유일한 원본이다.
//
// Run: node tools/build-box-sold-series.js [--json]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ledgerPath = path.join(ROOT, "data", "box-sold-ledger.json");
const seriesPath = path.join(ROOT, "data", "box-sold-series.json");

// 창 길이는 **계열마다** 정한다. 세트별 거래 밀도가 10배 넘게 차이 나기 때문이다:
// OP-01 영문판은 4주에 30건 가까이 팔리는데 OP-03 일본판은 4주에 3건도 안 된다.
// 창을 하나로 고정하면 둘 중 하나가 망가진다 — 짧으면 얇은 세트가 한두 건에 흔들리고,
// 길면 두꺼운 세트가 6주 평균이 되어 시세 변화를 늦게 반영한다(스냅샷 방식이 딱 그랬다).
// 그래서 한 점에 목표 건수가 모일 만큼만 창을 늘린다. 한 계열 안에서는 창이 일정해
// 선의 기준이 중간에 바뀌지 않고, 창 길이는 시계열에 기록해 화면에서 밝힌다.
const TARGET_N = 12;      // 한 점에 이 정도가 모이도록 창을 잡는다
const MIN_WINDOW = 28;
const MAX_WINDOW = 56;    // 이보다 길면 "최근 시세"라고 부르기 어렵다
// 초판(Blue)처럼 몇 달에 몇 건뿐인 계열은 56일로는 점이 하나도 안 나온다.
// 이런 계열만 창을 더 늘린다 — 창 길이는 화면에 그대로 표시되므로 얼마나 넓게 평균했는지 드러난다.
const RARE_MAX_WINDOW = 120;
const STEP_DAYS = 7;      // 주 단위면 4개월치가 17점 남짓 — 선이 읽히면서 파일도 가볍다
const MIN_N = 6;          // 창을 최대로 늘려도 이만큼 안 모이면 점을 찍지 않는다. 빈 구간이 틀린 값보다 낫다.

// 이 그래프는 **즉시구매 시세**다. 경매 낙찰가는 입찰이 안 붙으면 시세보다 훨씬 낮게 끝나
// 섞으면 시세가 아니라 잡음이 된다(2026-08-13: OP-01 일본판 한 세트에만 경매 69건이 섞여 있었다).
// 경매는 별도로 모은다.
//
// fmt 는 2026-08-13 부터 수집한다. 그 이전 레코드는 오늘 즉구 목록에 다시 나타난 것만 소급 표시됐다 —
// eBay 가 sold 를 90일까지만 보여줘서, 그보다 오래된 판매는 즉구였는지 확인할 방법이 없다.
// 확인 안 된 건 버린다. 시계열이 짧아지지만, 경매가 섞인 시세보다 짧고 정확한 쪽이 낫다.
const BIN_ONLY = true;

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const quant = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};

// ── 개별 판매 이상치 — 2026-10-15. 원장은 그대로 두고, 가격 중앙값(주간·월간·일별)을 낼 때만 뺀다.
// 사고: OP-07 일본판 4주 변화가 -40.3% 로 나왔다. 9/17·9/24 점이 $134(n=6)였는데 42일 창 6건 중 3건이
// $162~181(8/20 147348308001 · 8/25 168451186418 · 9/17 306678438253)이었고, 앞뒤 8~10월 나머지 판매는 전부 ~$80 이다.
// 중앙값은 절반까지 오염을 견디지만 6건짜리 창에선 3건이면 무너진다.
// 판정은 Hampel 식별자(중앙값 ± K × 1.4826·MAD — 1.4826·MAD 는 정규분포의 표준편차 추정치)를
// **판매일 앞 90일과 뒤 90일에 각각** 적용해 **양쪽 모두에서 벗어난 판매만** 이상치로 본다(그날 다른 판매는 어느 쪽에도 안 넣는다).
//  · 진짜 수준 이동(시세가 실제로 오르거나 내림)은 뒤쪽 시장이 그 값과 맞으므로 남는다.
//  · 신규 세트 발매 주는 앞쪽(발매일 이후) 판매가 OUT_REF_MIN 건 모이기 전까지 판정하지 않는다 — 발매 수준은 그 판매들이 정한다.
//  · 가장 최근 판매는 뒤쪽 판매가 쌓이기 전까지 판정하지 않는다 — 확인되지 않은 것을 빼지 않는다.
// K=3.5 는 Iglewicz·Hoaglin 의 수정 z 점수 기준(3.5)이다. Hampel 기본값 3 으로 전 계열을 시험하면(2026-10-15 원장)
// OP-17 영문판 발매 이틀째 $567·$600 과 OP-13 일본판 $198~263 묶음 속 $235 까지 빠졌다 — 발매 프리미엄·분산이지 오류가 아니다.
// 척도 하한(OUT_FLOOR × 중앙값): 매물이 한 값에 몰리면(OP-07 10월: $79.5~80.1) MAD 가 0 에 가까워 $87 도 이상치가 된다.
// 하한 20% × K 3.5 = 중앙값 ±70% 안쪽은 언제나 정상이다. 하한 10% 로 시험하면 이상치가 33 → 91건으로 늘었다.
const OUT_K = 3.5;
const OUT_REF_DAYS = 90;
const OUT_REF_MIN = 8;      // 한쪽 기준 판매가 이보다 적으면 판정 근거가 없다 → 이상치로 보지 않는다
const OUT_FLOOR = 0.2;
const MAD_TO_SIGMA = 1.4826;
function farFrom(x, ref) {
  if (ref.length < OUT_REF_MIN) return false;
  const med = quant(ref, 0.5);
  const mad = quant(ref.map((v) => Math.abs(v - med)), 0.5);
  return Math.abs(x - med) > OUT_K * Math.max(MAD_TO_SIGMA * mad, OUT_FLOOR * med);
}
// rs: 판매일 순으로 정렬된 한 계열(세트·판·차수)의 판매. 각 판매에 out(true/false)을 단다.
function markOutliers(rs) {
  const span = OUT_REF_DAYS * DAY;
  for (const r of rs) {
    const before = [], after = [];
    for (const x of rs) {
      if (x.t >= r.t - span && x.t < r.t) before.push(x.unit);
      else if (x.t > r.t && x.t <= r.t + span) after.push(x.unit);
    }
    r.out = farFrom(r.unit, before) && farFrom(r.unit, after);
  }
  return rs;
}
// 원장 레코드 → 한 계열의 즉시구매 판매(판매일 순, 이상치 표시). 주간·월간·일별이 같은 판정을 쓴다 — 한 판매가
// 한 보기에선 시세, 다른 보기에선 이상치가 되지 않게.
function salesOf(records, wave) {
  return markOutliers((records || [])
    .filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && Number.isFinite(Number(r.unit)) && Number(r.unit) > 0)
    .filter((r) => !BIN_ONLY || r.fmt === "bin")
    .filter((r) => (wave === "blue" ? isFirstPrint(r) : wave === "white" ? !isFirstPrint(r) : true))
    .map((r) => ({ d: r.d, t: Date.parse(r.d), unit: Number(r.unit), id: String(r.id || "") }))
    .sort((a, b) => a.t - b.t));
}
// 버킷(월·일) 하나의 중앙값 표본 — 이상치를 빼도 문턱(minN) 이상이면 뺀 것, 아니면 그대로(빈 칸을 새로 만들지 않는다).
function bucketSample(all, minN) {
  const clean = all.filter((r) => !r.out);
  return clean.length < all.length && clean.length >= minN ? { use: clean, out: all.length - clean.length } : { use: all, out: 0 };
}

function seriesFor(rs, wave) {
  // 초판(Blue)은 몇 달에 4건뿐이라 일반 기준(6건)으로는 아무것도 안 나온다.
  // 이 계열만 3건으로 낮춘다 — 얇은 건 사실이라, 화면에 n 과 창 길이를 그대로 실어 보낸다.
  const minN = wave === "blue" ? 3 : MIN_N;
  if (rs.length < minN) return { points: [], windowDays: null };

  const first = rs[0].t, last = rs[rs.length - 1].t;

  // 이 계열의 거래 밀도로 창을 정한다. 최근 8주만 보고 고른다 — 옛날에 활발했다가
  // 지금 조용해진 세트에 짧은 창을 물려주면 최근 구간이 통째로 비어버린다.
  const recentFrom = last - 56 * DAY;
  const recent = rs.filter((r) => r.t > recentFrom).length;
  const spanDays = Math.max(1, Math.min(56, (last - first) / DAY));
  const perDay = recent / spanDays;
  const need = perDay > 0 ? Math.ceil(TARGET_N / perDay / 7) * 7 : MAX_WINDOW;
  const cap = wave === "blue" ? RARE_MAX_WINDOW : MAX_WINDOW;   // 이상치를 뺀 점의 창도 여기까지만 늘린다(아래 at)
  const windowDays = Math.max(MIN_WINDOW, Math.min(cap, need));

  const inWindow = (t, days) => rs.filter((r) => r.t > t - days * DAY && r.t <= t);
  const at = (t) => {
    const raw = inWindow(t, windowDays);
    if (raw.length < minN) return null;
    // 이상치(salesOf)를 뺀다. 빼고 나서 minN 이 안 되면 그 점만 창을 7일씩 cap 까지 늘려 깨끗한 판매 minN 건을 모은다 —
    // 점을 지우면 새 공백이 생기고(OP-07 9/17·9/24 는 6건 중 3건이 이상치였다), 그대로 두면 틀린 값이 남는다.
    // cap 까지 늘려도 깨끗한 판매가 minN 건이 안 되면 점을 찍지 않는다 — MIN_N 과 같은 원칙(빈 구간이 틀린 값보다 낫다).
    // 2026-11-02: 종전엔 원래 창의 판매를 이상치째 그대로 썼다. 그 예비 규칙을 타는 점은 전 계열 4개뿐이었는데 전부 오염값이었다 —
    // OP-07 일본판 9/27 $134(n 6 중 이상치 3건, 앞뒤 ~$80 · 가드 OL2)·OP-09 일본판 3/29~4/12 $99(2/20 $189·2/28 $172 포함, 사분위 상단 $154).
    // out = 그 점에서 뺀 건수, win = 늘린 창(일).
    // 점마다 n + out = (t - win, t] 의 즉시구매 판매 수 — 원장과 sets[*].outliers 만으로 다시 셀 수 있다.
    let use = raw, out = 0, win = windowDays;
    if (raw.some((r) => r.out)) {
      for (let w = windowDays; w <= cap; w += STEP_DAYS) {
        const all = w === windowDays ? raw : inWindow(t, w);
        const clean = all.filter((r) => !r.out);
        if (clean.length >= minN) { use = clean; out = all.length - clean.length; win = w; break; }
      }
      if (use === raw) return null;
    }
    const u = use.map((r) => r.unit);
    // vol = 그 점 **직전 한 주**에 실제로 팔린 건수. 중앙값을 만든 n(창 전체, 28~56일)과 다르다.
    // n 을 막대로 쓰면 창이 겹쳐 같은 판매를 여러 번 세게 되고, 막대 높이가 창 길이만 반영한다.
    // 이상치도 실제로 팔린 건이라 vol 에는 그대로 센다.
    let vol = 0;
    const volLo = t - STEP_DAYS * DAY;
    for (const r of rs) { if (r.t > volLo && r.t <= t) vol++; }
    return {
      d: iso(t), median: Math.round(quant(u, 0.5)), low: Math.round(quant(u, 0.25)), high: Math.round(quant(u, 0.75)), n: u.length, vol,
      ...(out ? { out } : {}), ...(win !== windowDays ? { win } : {}),
    };
  };

  // 격자는 **마지막 판매일에서 거꾸로** 잡는다. 앞에서부터 7일씩 세면 마지막 점이 격자에 안 걸려
  // 따로 끼워 넣게 되는데, 그러면 직전 점과 며칠밖에 안 떨어진 점이 하나 더 생겨
  // 창이 거의 같은데도 값이 달라 보이는 절벽이 만들어진다(OP-01 일본판 $290 → $258, 2026-08-13 실측).
  // 뒤에서부터 세면 마지막 점이 항상 격자 위에 있고, 점 간격도 일정해진다.
  // 하한은 **첫 판매일**이다. 예전엔 `first + 창` 을 썼다 — 창이 관측기간 안에 통째로 들어와야
  // 점을 찍는다는 뜻인데, 그러면 갓 나온 세트가 두 달 가까이 주간 그래프를 못 그린다.
  // 2026-09-02 실측: OP-17 일본판은 관측 30일 · 창 28일이라 점이 **1개**만 나왔고, 화면에는
  // "주간으로 그릴 만큼 쌓이지 않았습니다"가 떴다. 원장에는 6주치 45건이 멀쩡히 있었는데도.
  // 창이 첫 판매일보다 앞으로 삐져나가도 문제될 게 없다 — 그 구간에 판매가 없었을 뿐이고,
  // 점의 품질은 at() 의 minN(창 안에 최소 6건)이 이미 지킨다. 모자라면 그 점은 알아서 버려진다.
  const floor = first;
  const points = [];
  for (let t = last; t >= floor; t -= STEP_DAYS * DAY) {
    const p = at(t);
    if (p) points.push(p);
  }
  points.reverse();

  // 끊긴 앞부분은 버린다. 카테고리 필터를 켠 뒤 아주 오래된 판매가 한두 건씩 딸려 오는데,
  // 그런 고립된 점과 최근 구간을 선으로 이으면 없던 추세가 생긴다
  // (2026-08-13: OP-01 일본판이 2/1 $140 한 점 뒤 4개월 공백, 그다음 6/14 $286 — 선이 그 사이를 곧게 이었다).
  // 점 간격이 창 길이를 넘으면 그 지점에서 잘라 **끊김 없이 이어지는 최근 구간**만 남긴다.
  const maxGap = windowDays * DAY;
  let cut = 0;
  for (let i = points.length - 1; i > 0; i--) {
    if (Date.parse(points[i].d) - Date.parse(points[i - 1].d) > maxGap) { cut = i; break; }
  }
  return { points: points.slice(cut), windowDays };
}

// 월간은 롤링이 아니라 **그 달에 팔린 것 전부**의 중앙값이다.
// 왜 같이 내보내나: 개별 거래 분산이 큰 세트가 있다. OP-01 일본판은 같은 4주 안에서 $105 부터
// $395 까지 팔린다(상태·경매 종료가 차이). 표본 13건짜리 주간 중앙값은 그 안에서 계속 흔들린다.
// 달 단위로 묶으면 표본이 두세 배가 되어 흔들림이 줄고, 대신 반응은 느려진다 — 둘 다 보여주고 고르게 한다.
const MONTH_MIN_N = 6;
function monthlyFor(rs) {
  const buckets = new Map();
  for (const r of rs) {
    const k = r.d.slice(0, 7);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  // 진행 중인 달은 아직 다 안 팔렸으니 문턱을 낮춰 넣는다 — 안 그러면 8월 중순에 7월이 최신으로 보인다.
  // 다만 한 단계만 낮춘다 — 3건짜리 중앙값을 넣었더니 OP-01 일본판 8월이 $275 → $176 으로
  // 36% 급락한 것처럼 그려졌다. 표본 수(n)는 그대로 실어 보내 얼마나 얇은 값인지 화면에서 드러나게 한다.
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthGap = (a, b) => {
    const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
    return (by * 12 + bm) - (ay * 12 + am);
  };
  const rows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, all]) => [k, all, k === thisMonth ? MONTH_MIN_N - 1 : MONTH_MIN_N])
    .filter(([, all, minN]) => all.length >= minN)
    .map(([k, all, minN]) => {
      // 월간은 겹치지 않는 버킷이라 vol(그 달 거래량)은 이상치까지 센 전체 건수, n 은 중앙값 표본(이상치 뺀 건수)이다.
      const { use, out } = bucketSample(all, minN), u = use.map((r) => r.unit);
      return {
        d: k + "-01", median: Math.round(quant(u, 0.5)), low: Math.round(quant(u, 0.25)),
        high: Math.round(quant(u, 0.75)), n: u.length, vol: all.length, ...(out ? { out } : {}),
      };
    });
  // 달이 두 칸 이상 비면 그 앞은 버린다 — 주간과 같은 이유다(고립된 옛 점이 가짜 추세를 만든다).
  let cut = 0;
  for (let i = rows.length - 1; i > 0; i--) {
    if (monthGap(rows[i - 1].d.slice(0, 7), rows[i].d.slice(0, 7)) > 2) { cut = i; break; }
  }
  return rows.slice(cut);
}

// 일별 — 그날 팔린 것만 센다. 롤링이 아니다.
// 박스는 하루 0.45건(중앙값 계열)이라 대부분의 날이 비어 있다. 그게 사실이므로 억지로 채우지 않는다:
// **3건 이상 팔린 날만** 점을 찍고, 나머지는 비운다. 1~2건짜리 "중앙값" 은 그날 팔린 한 건의 가격일 뿐이다.
const DAY_MIN_N = 3;
function dailyFor(rs) {
  const buckets = new Map();
  for (const r of rs) {
    if (!buckets.has(r.d)) buckets.set(r.d, []);
    buckets.get(r.d).push(r);
  }
  const rows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([, all]) => all.length >= DAY_MIN_N)
    .map(([d, all]) => {
      const { use, out } = bucketSample(all, DAY_MIN_N), u = use.map((r) => r.unit);
      return {
        d, median: Math.round(quant(u, 0.5)), low: Math.round(quant(u, 0.25)),
        high: Math.round(quant(u, 0.75)), n: u.length, vol: all.length, ...(out ? { out } : {}),
      };
    });
  // 앞쪽에 뚝 떨어진 점 하나가 남으면 선이 그 사이를 곧게 이어 없던 추세를 만든다(주간·월간과 같은 이유).
  let cut = 0;
  for (let i = rows.length - 1; i > 0; i--) {
    if (Date.parse(rows[i].d) - Date.parse(rows[i - 1].d) > 21 * DAY) { cut = i; break; }
  }
  return rows.slice(cut);
}

// 판매일별 건수 — 2026-10-14. 그래프 아래 거래량 막대(달력 주·달·일)의 유일한 원천.
// 종전엔 막대가 가격 점(롤링 격자)의 vol 이라 점이 빠진 주는 막대도 통째로 빠졌다(빈 칸 = 0건인지 미집계인지 구분 불가).
// 여기서는 원장의 즉시구매 실거래를 판매일마다 그대로 센다. 0건인 날은 키가 없을 뿐이고, 화면은 through(원장 갱신일)까지를
// 집계된 기간으로 보고 그 안의 빈 날을 0건으로 그린다 — 0은 원장에 판매가 없다는 사실값이지 추정이 아니다.
// 범위는 그래프가 그리는 구간(주간·월간·일간 첫 점 중 가장 이른 날의 7일 전)부터만 싣는다.
function countsFor(records, wave, fromD) {
  const out = {};
  for (const r of records || []) {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.d) || !(Number(r.unit) > 0)) continue;
    if (BIN_ONLY && r.fmt !== "bin") continue;
    if (wave === "blue" && !isFirstPrint(r)) continue;
    if (wave === "white" && isFirstPrint(r)) continue;
    if (fromD && r.d < fromD) continue;
    out[r.d] = (out[r.d] || 0) + 1;
  }
  return Object.fromEntries(Object.keys(out).sort().map((d) => [d, out[d]]));
}
// 그 판의 그래프가 시작하는 날(가장 이른 첫 점)의 7일 전. 그릴 점이 하나도 없으면 null(건수도 싣지 않는다).
function countsFrom(...arrs) {
  const firsts = arrs.map((a) => (a && a.length ? a[0].d : null)).filter(Boolean).sort();
  return firsts.length ? iso(Date.parse(firsts[0]) - 7 * DAY) : null;
}

// 진행 중 매물 수(공급)는 tools/update-supply-series.js 가 매일 쌓는다.
// 가격과 함께 한 파일로 실어 보낸다 — 화면이 요청을 두 번 하지 않게. 원본(347KB)에서
// 날짜와 jp/en 매물 수만 뽑는다. 나머지 필드(신규·이탈·판매자 구성)는 이 그래프가 안 쓴다.
//
// ⚠️ 이건 "팔린 개수"가 아니라 "지금 올라와 있는 개수"다. 절대 거래량으로 표기하지 말 것.
let SUPPLY = { sets: {} };
try { SUPPLY = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "supply-series.json"), "utf8")); } catch (e) {}
function supplyFor(code) {
  const pts = ((SUPPLY.sets || {})[code] || {}).points || [];
  return pts
    .filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(p.d) && (Number.isFinite(p.jp) || Number.isFinite(p.en)))
    .map((p) => ({ d: p.d, jp: Number.isFinite(p.jp) ? p.jp : null, en: Number.isFinite(p.en) ? p.en : null }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

// 영문판 OP-01 은 인쇄 차수가 둘이고 **시세가 2~3배 다른 별개 상품**이다.
//   Blue Bottom = Wave 1 = 초판   (우리 실거래 5건 중앙 $4,143 · TCGplayer $5,622)
//   White Bottom = Wave 2 = 재판  (우리 실거래 31건 중앙 $1,561 · TCGplayer $1,526)
// TCGplayer 도 TCG Quant 도 둘을 별개 상품으로 관리한다.
//
// 그래서 **따로 그린다**. 한 선에 섞으면 재판 시세에 초판 몇 건이 얹혀 위쪽이 부풀고,
// 무엇보다 "영문판 박스 시세"가 무엇을 가리키는지 알 수 없어진다.
// 초판은 거래가 드물어(4건) 창을 넓게 잡아야 점이 나온다 — 못 그리면 요약 줄의 숫자만 남는다.
//
// 2026-08-13 정정: 처음엔 Blue 와 White 를 뭉뚱그려 "초판" 하나로 셌다. 정반대였다 —
// 우리 영문판 실거래의 다수는 White(재판)다.
const WAVE1_BLUE = /\b(blue\s*bottom|wave\s*1)\b/i;
const WAVE2_WHITE = /\b(white\s*bottom|wave\s*2)\b/i;
const isFirstPrint = (r) => WAVE1_BLUE.test((r && r.title) || "");

// 선에서 뺀 초판을 "지금 얼마"로만 요약한다. 최근 90일 실거래의 중앙값.
function firstPrintSpot(records) {
  const rs = (records || []).filter((r) => r && r.fmt === "bin" && isFirstPrint(r));
  if (rs.length < 3) return null;
  const recent = rs.slice(-12).map((r) => r.unit).sort((a, b) => a - b);
  return { median: Math.round(quant(recent, 0.5)), n: rs.length, last: rs[rs.length - 1].d };
}

// 남은 선이 재판 위주인지 알려준다 — 어느 쪽을 보고 있는지 화면에 적기 위한 값.
function reprintShare(records) {
  const rs = (records || []).filter((r) => r && r.fmt === "bin" && !isFirstPrint(r));
  if (rs.length < 5) return null;
  const white = rs.filter((r) => WAVE2_WHITE.test(r.title || "")).length;
  return white ? Math.round((white / rs.length) * 100) : null;
}

// 테스트(test-box-sold-filters.js 6절)는 판정·집계 함수만 쓴다 — require 할 때는 원장을 읽거나 파일을 쓰지 않는다.
if (require.main !== module) {
  module.exports = { salesOf, markOutliers, seriesFor, monthlyFor, dailyFor, OUTLIER: { k: OUT_K, refDays: OUT_REF_DAYS, refMinSales: OUT_REF_MIN, scaleFloor: OUT_FLOOR }, MIN_N };
  return;
}

const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);
// 그래프에 표시할 사건 — 검증된 발매일만(data/set-facts.json, 반다이 공식 페이지 출처). 2026-09-24.
let FACTS = { sets: {} };
try { FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "set-facts.json"), "utf8")); } catch (e) {}
const packsPath = path.join(ROOT, "data", "onepiece-packs.json");
const packs = JSON.parse(fs.readFileSync(packsPath, "utf8"));
let UPCOMING = {};
try { for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, "data", "upcoming-set-pages.json"), "utf8")).pages || []) UPCOMING[p.code] = p; } catch (e) {}

// ── 발매 전 판매(예약판매)는 sold 시계열에서 뺀다 — 2026-10-14.
// 사고: 미발매 OP-18 의 예약판매 8건(매물 2개)이 일본판 "sold median $110" 으로 시계열에 들어가, AI 인용 1위 글
// (발매일 글)의 "최신 세트(OP-17) 박스값" 자리에 OP-18 값이 찍혔고(최신 세트 = 시계열이 있는 가장 큰 번호),
// 7개 페이지 표에 EB-05·OP-18 예약판매가가 실거래 중앙값으로 섞였다. sets/op-18 은 같은 날 "no completed sale" 이었다.
// 예약판매는 발매 후 시세와 다른 시장이다(배송 전 선결제, 소수 매물의 반복 판매). 원장은 그대로 두고 여기서 판(jp/en)별
// 공식 발매일로 나눈다: 발매일 이전 판매 → preRelease 요약(따로), 발매일 당일부터 → sold 시계열.
// 발매일 원천(앞이 우선): set-facts.json(반다이 공식, 출처 포함) → onepiece-packs.json(releaseJa=일본판, release=영문판)
// → upcoming-set-pages.json(발매 전 세트의 반다이 공식 날짜). 날짜가 없는 판은 거르지 않는다(종전 동작).
const isoDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
function releaseFor(code) {
  const f = (FACTS.sets && FACTS.sets[code]) || {}, p = (packs.sets && packs.sets[code]) || {}, u = UPCOMING[code] || {};
  return {
    jp: isoDay(f.jpRelease && f.jpRelease.date) || isoDay(p.releaseJa) || isoDay(u.releaseJp),
    en: isoDay(f.enRelease && f.enRelease.date) || isoDay(u.releaseEn) || isoDay(p.release),
  };
}
const isBinSale = (r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && Number(r.unit) > 0 && (!BIN_ONLY || r.fmt === "bin");
// 예약판매 요약. 매물 한두 개가 여러 번 팔린 것뿐이면(OP-18 일본판: 8건 = 매물 2개) 중앙값은 그 매물의 호가일 뿐이다 —
// 서로 다른 매물이 PRE_MIN_LISTINGS 개 미만이면 값은 비우고(null → 화면 "—") 건수만 남긴다.
const PRE_MIN_LISTINGS = 3;
function preReleaseFor(pre, rel) {
  const rs = (pre || []).filter(isBinSale);
  if (!rs.length) return null;
  const listings = new Set(rs.map((r) => String(r.id || ""))).size;
  const u = rs.map((r) => Number(r.unit));
  const ds = rs.map((r) => r.d).sort();
  const ok = listings >= PRE_MIN_LISTINGS;
  return {
    release: rel, sales: rs.length, listings,
    median: ok ? Math.round(quant(u, 0.5)) : null, low: ok ? Math.round(quant(u, 0.25)) : null, high: ok ? Math.round(quant(u, 0.75)) : null,
    first: ds[0], last: ds[ds.length - 1],
  };
}
const splitAtRelease = (records, rel) => {
  const pre = [], post = [];
  for (const r of records || []) (rel && r && typeof r.d === "string" && r.d < rel ? pre : post).push(r);
  return { pre, post };
};
function eventsFor(code) {
  const f = (FACTS.sets && FACTS.sets[code]) || {};
  const out = [];
  const jr = f.jpRelease && (f.jpRelease.date || f.jpRelease);
  const er = f.enRelease && (f.enRelease.date || f.enRelease);
  if (typeof jr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(jr)) out.push({ d: jr, ed: "jp", label: "JP release", labelKo: "일본판 발매" });
  if (typeof er === "string" && /^\d{4}-\d{2}-\d{2}$/.test(er)) out.push({ d: er, ed: "en", label: "EN release", labelKo: "영문판 발매" });
  return out;
}

const sets = {};
let points = 0, drawable = 0;
const windowsUsed = {};
let monthPoints = 0;
let dayPoints = 0;
const preReleaseExcluded = {};
let outlierSales = 0, outlierPoints = 0, widenedPoints = 0;
for (const [code, all] of Object.entries(ledger.sets || {})) {
  const release = releaseFor(code);
  const sJp = splitAtRelease(all.jp, release.jp), sEn = splitAtRelease(all.en, release.en);
  const eds = { jp: sJp.post, en: sEn.post };   // 아래는 전부 발매일 당일부터의 판매만 본다
  const preRelease = { jp: preReleaseFor(sJp.pre, release.jp), en: preReleaseFor(sEn.pre, release.en) };
  for (const ed of ["jp", "en"]) if (preRelease[ed]) preReleaseExcluded[`${code}.${ed}`] = preRelease[ed].sales;
  const sales = { jp: salesOf(eds.jp), en: salesOf(eds.en, "white"), enBlue: salesOf(eds.en, "blue") };
  const jp = seriesFor(sales.jp), en = seriesFor(sales.en, "white"), enBlue = seriesFor(sales.enBlue, "blue");
  // 발매 전 세트(점이 없고 예약판매만 있는 세트)도 남긴다 — 예약판매 요약과 발매일을 실어 보내야 화면이 "—" 와 건수를 낼 수 있다.
  if (!jp.points.length && !en.points.length && !preRelease.jp && !preRelease.en) continue;
  const mJp = monthlyFor(sales.jp), mEn = monthlyFor(sales.en), mEnBlue = monthlyFor(sales.enBlue);
  const dJp = dailyFor(sales.jp), dEn = dailyFor(sales.en), dEnBlue = dailyFor(sales.enBlue);
  // 이상치로 판정된 판매(원장 id·판매일·개당가) — 점의 out 을 원장에서 다시 셀 수 있게 남긴다. 없는 판은 키가 없다.
  const outliers = {};
  for (const [k, rs] of Object.entries(sales)) {
    const o = rs.filter((r) => r.out).map((r) => ({ d: r.d, id: r.id, unit: Math.round(r.unit * 100) / 100 }));
    if (o.length) { outliers[k] = o; outlierSales += o.length; }
  }
  const fJp = countsFrom(jp.points, mJp, dJp), fEn = countsFrom(en.points, mEn, dEn), fBlue = countsFrom(enBlue.points, mEnBlue, dEnBlue);
  sets[code] = {
    // 기존 키(jp/en)는 그대로 둔다 — 주간이 기본 보기이고, 이 키를 읽는 곳이 여럿이다.
    jp: jp.points, en: en.points, enBlue: enBlue.points,
    windowDays: { jp: jp.windowDays, en: en.windowDays, enBlue: enBlue.windowDays },
    monthly: { jp: mJp, en: mEn, enBlue: mEnBlue },
    daily: { jp: dJp, en: dEn, enBlue: dEnBlue },
    // 판매일별 즉시구매 건수(거래량 막대 원천). through = 원장 갱신일 — 그 뒤는 아직 안 센 날이라 0 으로 그리지 않는다.
    counts: {
      through: ledger.updated || today,
      ...(fJp ? { jp: countsFor(eds.jp, null, fJp) } : {}),
      ...(fEn ? { en: countsFor(eds.en, "white", fEn) } : {}),
      ...(fBlue ? { enBlue: countsFor(eds.en, "blue", fBlue) } : {}),
    },
    supply: supplyFor(code),
    reprintPct: { jp: reprintShare(eds.jp), en: reprintShare(eds.en) },
    firstPrint: { jp: firstPrintSpot(eds.jp), en: firstPrintSpot(eds.en) },
    events: eventsFor(code),
    // 판별 공식 발매일(시계열을 자른 기준), 발매일 이전 판매 요약, 발매일 당일부터의 즉시구매 건수.
    release,
    preRelease,
    sinceRelease: { jp: eds.jp.filter(isBinSale).length, en: eds.en.filter(isBinSale).length },
    ...(Object.keys(outliers).length ? { outliers } : {}),
  };
  for (const p of [...jp.points, ...en.points, ...enBlue.points]) if (p.out) { outlierPoints++; if (p.win) widenedPoints++; }
  points += jp.points.length + en.points.length;
  monthPoints += mJp.length + mEn.length;
  dayPoints += dJp.length + dEn.length;
  for (const s of [jp, en]) {
    if (s.points.length >= 3) { drawable++; windowsUsed[s.windowDays] = (windowsUsed[s.windowDays] || 0) + 1; }
  }
}

// ── 현재가(current) — 모든 페이지 표의 "지금 값" 칸이 읽는 단 하나의 원천. 2026-10-14.
// 종전엔 소비자마다 기준일·신선도를 따로 셌다(어떤 곳은 일본판 마지막 관측, 어떤 곳은 오늘). 같은 세트가 페이지마다
// 다른 값(또는 한쪽만 "—")으로 나올 수 있었다. 이제 기준일(asOf)은 전 계열의 마지막 관측일 중 가장 늦은 날,
// 현재가는 마지막 점이 asOf 로부터 STALE_DAYS 이내이고 그 판이 발매된 경우만 값, 아니면 null(화면 "—").
const STALE_DAYS = 28;
let asOf = "";
for (const node of Object.values(sets)) for (const ed of ["jp", "en"]) {
  const a = node[ed] || [];
  if (a.length && a[a.length - 1].d > asOf) asOf = a[a.length - 1].d;
}
for (const node of Object.values(sets)) {
  node.current = {};
  for (const ed of ["jp", "en"]) {
    const a = (node[ed] || []).filter((p) => p && p.median != null);
    const last = a[a.length - 1];
    const released = !node.release[ed] || (asOf && node.release[ed] <= asOf);
    const fresh = last && asOf && Date.parse(last.d) >= Date.parse(asOf) - STALE_DAYS * DAY;
    node.current[ed] = released && fresh ? { median: last.median, low: last.low, high: last.high, n: last.n, d: last.d } : null;
  }
}

const store = {
  note: `Rolling median of individual completed eBay sales of sealed One Piece booster boxes, sampled every ${STEP_DAYS} days and dated by SALE date (not collection date). The averaging window is chosen per series (${MIN_WINDOW}-${MAX_WINDOW} days) so that each point rests on roughly ${TARGET_N} sales, because sales volume differs more than tenfold between sets; each series records the window it used. Rebuilt from data/box-sold-ledger.json on every run, so a change in how listings are collected cannot show up as a price move. Windows with fewer than ${MIN_N} sales are omitted rather than estimated. Only fixed-price (Buy It Now) sales are included; auction results are collected separately and excluded, because an auction that draws no bidding closes far below the going rate. Sales dated before an edition's official release date (pre-orders) are excluded from the sold series and summarized separately per set under preRelease (median only when at least ${PRE_MIN_LISTINGS} different listings sold). current is the latest point when the edition is released and that point is within ${STALE_DAYS} days of asOf, otherwise null. Prices are per box in USD. A monthly view (median of every sale within each calendar month, minimum ${MONTH_MIN_N} sales) is included alongside, because sets with wide dispersion between individual sales are steadier when grouped by month. Outlier sales (listed per set under outliers) are left out of medians: a sale is an outlier when it lies more than ${OUT_K} x max(1.4826 x MAD, ${OUT_FLOOR * 100}% of median) from the median of both the ${OUT_REF_DAYS} days before and the ${OUT_REF_DAYS} days after its sale date, each side holding at least ${OUT_REF_MIN} sales. out = sales left out of that point; win = that point's window in days when it was lengthened (up to ${MAX_WINDOW} days, ${RARE_MAX_WINDOW} for the first-print series) to keep ${MIN_N} sales after leaving outliers out; when even that falls short, the point is omitted. vol and counts include outliers.`,
  window: { targetSales: TARGET_N, minDays: MIN_WINDOW, maxDays: MAX_WINDOW, stepDays: STEP_DAYS, minSales: MIN_N, basis: "sold", datedBy: "saleDate", fromRelease: true },
  // 2026-10-15 — 판정 기준은 markOutliers 주석 참고. 숫자를 바꾸면 test-box-sold-filters.js 6절이 OP-07·발매 주 사례로 다시 검증한다.
  outlierRule: { method: "two-sided Hampel", k: OUT_K, madToSigma: MAD_TO_SIGMA, scaleFloor: OUT_FLOOR, refDays: OUT_REF_DAYS, refMinSales: OUT_REF_MIN },
  builtFrom: { ledger: "data/box-sold-ledger.json", updated: ledger.updated || today },
  updated: today,
  asOf: asOf || null,
  staleDays: STALE_DAYS,
  preReleaseMinListings: PRE_MIN_LISTINGS,
  sets,
};

fs.writeFileSync(seriesPath, JSON.stringify(store, null, 1) + "\n", "utf8");

// ── boxMarket.ebaySold 를 시리즈 최신점으로 동기화 — 2026-08-21.
// 종전에는 ingest 가 "그날 덤프에 보인 sold 전체"로 스냅샷을 만들었는데, 이 파일 머리에 적힌
// 바로 그 이유(수집 방식이 바뀌면 값이 튀고, 사실상 90일 평균이라 후행)로 원장과 크게 어긋났다.
// 실측(2026-08-21 감사): 42개 (세트x언어) 중 29개가 ±10% 초과, OP-05 일판은 +251% —
// 스냅샷 n=70 인데 그 언어의 원장 누적이 43건뿐이었다(영문판이 일판 버킷에 섞임).
// 이 값은 AI 피드(opbox-ai-data.json)·CSV·화면(packs.js 실거래 카드)에 그대로 나가므로
// 여기서 시리즈 최신점(판매일 기준 롤링 중앙값)을 그대로 미러링한다. low/high = p25/p75 동일.
{
  let synced = 0, cleared = 0;
  for (const [code, node] of Object.entries(sets)) {
    const target = packs.sets[code];
    if (!target) continue;   // UPCOMING(미등재) 세트는 시리즈만 쌓는다
    for (const ed of ["jp", "en"]) {
      const pts = (node[ed] || []).filter((pt) => pt && pt.median != null);
      target.boxMarket = target.boxMarket || {};
      target.boxMarket[ed] = target.boxMarket[ed] || {};
      const last = pts[pts.length - 1];
      if (last) {
        target.boxMarket[ed].ebaySold = {
          median: last.median, low: last.low, high: last.high,
          sampleSize: last.n, basis: "sold", currency: "USD",
          updated: last.d,   // 판매일 기준 관측일 — 수집일이 아니다
          windowDays: (node.windowDays && node.windowDays[ed]) || undefined,
        };
        synced++;
      } else if (target.boxMarket[ed].ebaySold) {
        delete target.boxMarket[ed].ebaySold;   // 표본 부족이면 낡은 값을 남기지 않는다
        cleared++;
      }
    }
  }
  fs.writeFileSync(packsPath, JSON.stringify(packs));
  console.error(JSON.stringify({ ebaySoldSynced: synced, cleared }));
}

const dates = [...new Set(Object.values(sets).flatMap((v) => [...v.jp, ...v.en].map((p) => p.d)))].sort();
const out = {
  sets: Object.keys(sets).length,
  points,
  monthPoints,
  dayPoints,
  drawableSeries: `${drawable}/${Object.keys(sets).length * 2}`,
  windowsUsed,
  range: dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : null,
  asOf,
  preReleaseExcluded,
  outliers: { sales: outlierSales, weeklyPoints: outlierPoints, widened: widenedPoints },
};
console.log(JSON.stringify(out, null, process.argv.includes("--json") ? 0 : 1));
