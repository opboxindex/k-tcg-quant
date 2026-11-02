// 부스터 박스 실거래(sold) 시세 그래프 — 일본판/영문판 두 패널.
//
// 이 파일 하나가 **유일한 소스**다. 홈 화면(packs.js, 브라우저)과 정적 세트 페이지
// (tools/generate-set-pages.js, node)가 같은 함수를 쓴다. 예전에 화면마다 차트를 따로 그렸다가
// 같은 세트가 페이지마다 다른 숫자를 보여준 적이 있어, 두 벌로 나누지 않는다.
//
// 설계 결정 (2026-08-13):
//  · **두 패널로 나눈다.** 일본판 $257 · 영문판 $1,525 로 6배 차이라 축을 공유하면
//    일본판 선이 바닥에 눌러붙어 아무 움직임도 안 보인다. 각자 자기 축을 쓴다.
//  · **y축은 중앙값 선 기준.** low~high 전체로 잡으면 선이 축의 5% 만 쓰고 납작해진다(1차 시안 실패).
//  · **x축은 날짜 비례.** 인덱스로 그리면 13일 공백과 1일 간격이 같은 폭이 된다.
//  · **띠(low~high)는 안 그린다.** 축을 선 기준으로 좁히면 띠가 프레임을 덮어 회색 상자가 된다.
//    범위는 훑을 때 툴팁에 숫자로 정확히 나온다.
//  · **표본이 얇은 점은 뺀다.** 몇 건짜리 중앙값은 시세가 아니라 잡음이다.
//    (시계열 자체가 이미 걸러 오지만, 남의 데이터를 그릴 때를 대비해 여기서도 막는다.)
//  · 값은 **판매된 날** 기준이다(수집한 날이 아니라). tools/build-box-sold-series.js 참고 —
//    수집 방식이 바뀌어도 그게 가격 움직임으로 둔갑하지 않게 하려는 것이다.
//  · 선은 단조 3차(monotone cubic) — 일반 스플라인은 점 사이에서 튀어 없던 고점을 만든다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OPBoxChart = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const W = 680, H = 360, L = 90, R = 18, T = 26, B = 42;
  // 가격 아래에 거래량 막대를 깐다. 주식·TCGplayer 차트의 기본 배치이고,
  // "이 가격이 몇 건에서 나온 값인지"를 선 옆이 아니라 같은 그림에서 바로 보게 하려는 것이다.
  const VOL_H = 46;                    // 막대가 쓰는 세로. 이 아래는 x축 라벨.
  const PRICE_BOTTOM = H - B - VOL_H;  // 가격선이 내려올 수 있는 바닥
  const MIN_N = 5;        // 이 미만의 표본으로 만든 중앙값은 안 그린다
  const MIN_N_DAY = 3;    // 일별은 빌더가 이미 하루 3건 이상만 내보낸다 — 여기서 또 5건을 요구하면 통째로 빈다
  const MIN_POINTS = 3;        // 점 두 개짜리 "추세"는 추세가 아니다
  // 월간만 예외로 2점을 허용한다. 한 점이 9~15건짜리 두꺼운 표본이라 "6월 → 7월" 두 점도 읽을 값이 있고,
  // 3점을 요구하면 거래가 얇은 세트(OP-03·EB-01)에서 월간 패널이 통째로 빠져
  // [주간|월간] 탭까지 사라진다 — 다른 세트엔 있는 탭이 여기만 없으면 고장으로 읽힌다.
  const MIN_POINTS_MONTH = 2;

  // ── 거래량 막대는 가격 점이 아니라 **달력 칸**마다 그린다(2026-10-14 소유자 "누락 구간 없어야").
  //    종전엔 막대가 가격 점(롤링 격자)에 붙어 있어 점이 빠진 주는 막대도 빠졌고, 0건 주와 미집계가 구분되지 않았다.
  //    원천은 series.counts(판매일별 즉시구매 건수, tools/build-box-sold-series.js) 하나 — 0건 칸은 원장에 판매가 없다는 사실값이다.
  const DAY = 86400000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const mondayOf = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;   // 원장 날짜는 UTC 판매일
  const monthOf = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
  const nextMonth = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
  const monthNo = (t) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  // 완료된 주의 판매 중앙값이 이 미만인 계열(주로 일본판)은 주 막대가 0·1·2 로 출렁여 읽을 수 없다(변동계수 61%).
  // 겹치지 않는 4주 묶음으로 센다(28%, 빈 막대 0 — 2026-10-14 실측). 묶음 라벨은 날짜 범위다.
  // 기준은 빗금 기준(주간 점의 최소 표본 6건 — gapN)과 같다 — 2026-10-14 QA: 3 으로는 주 3~4건 계열(OP-02 영문 0~7건,
  // OP-16 일본판 1~8건)이 빠져 이웃 막대가 최대 13.6배로 출렁였다. 집계 단위를 키우는 것이라 값을 만들지 않는다.
  const THIN_WEEK = 6;
  // 일간 점(하루 3건 이상)이 있는 날이 그 구간(첫 점 ~ 원장 집계일)의 절반 미만이면 일간 선은 조각뿐이다 — 2026-10-14 QA:
  // OP-05 영문 18점/128일 = 홀로 남은 점 16개. 그런 판은 일간 패널 대신 안내 카드를 낸다(일본판이 이미 쓰던 "하루 3건 넘는 날이 드물다").
  const DAY_COVER_MIN = 0.5;
  function dailySparse(pts, endMs) {
    if (pts.length < MIN_POINTS) return true;
    const t0 = Date.parse(pts[0].d);
    const tEnd = Math.max(Date.parse(pts[pts.length - 1].d), Number.isFinite(endMs) ? endMs : 0);
    return pts.length / (Math.round((tEnd - t0) / DAY) + 1) < DAY_COVER_MIN;
  }
  // SVG 글자 폭 어림(사용자 단위) — 라벨이 겹치거나 칸 밖으로 잘리지 않는지 미리 잰다. 한글은 1em, 공백 0.3em, 나머지 0.6em.
  // 글자 크기는 패널 폭에 따라 11~38 단위로 바뀐다(CSS @container) — 호출부가 가장 큰 경우를 넘긴다.
  const textW = (s, fs) => [...String(s)].reduce((w, c) => w + (/[가-힣]/.test(c) ? 1 : c === " " ? 0.3 : 0.6), 0) * fs;
  const AX_FS_MAX = 38;      // .opbcAx 가 가장 커지는 경우(@container ≤280px)
  const STALE_FS_MAX = 18;   // .opbcStaleTx/.opbcStaleSub 가 보이는 가장 큰 경우(@container ≤560px, ≤440px 에선 숨김)
  // 판매형식(즉시구매·경매) 기록을 시작한 날 — tools/build-box-sold-series.js BIN_ONLY 주석.
  // 그 전 판매는 나중에 즉시구매 목록에 다시 보인 것만 남았다. 구간을 숨기지 않고 경계선 라벨만 둔다.
  const FMT_SINCE = "2026-08-13";

  // 막대 칸 목록. tStart 가 든 칸부터 asOf(원장 집계일)가 든 칸까지 빠짐없이 — 0건 칸도 칸이다.
  // asOf 당일은 수집 뒤에도 판매가 이어지므로 끝난 날이 아니다 → asOf 가 든 칸은 진행 중(part)이고, 센 기간만큼만 그린다.
  function volBuckets(grain, tStart, asOf, counts) {
    if (!counts || !(asOf >= tStart)) return { list: [], bundled: false };
    const cnt = Object.keys(counts).map((d) => [Date.parse(d), Number(counts[d]) || 0]);
    const sum = (a, b) => { let s = 0; for (const [t, n] of cnt) if (t >= a && t < b) s += n; return s; };
    const end = asOf + DAY;
    const step = grain === "day" ? (t) => t + DAY : grain === "month" ? nextMonth : (t) => t + 7 * DAY;
    const list = [];
    for (let s = grain === "day" ? tStart : grain === "month" ? monthOf(tStart) : mondayOf(tStart); s < end; s = step(s)) {
      const e = step(s);
      list.push({ s, e: Math.min(e, end), n: sum(s, Math.min(e, end)), part: e > asOf });
    }
    if (grain !== "week") return { list, bundled: false };
    const full = list.filter((b) => !b.part).map((b) => b.n).sort((a, b) => a - b);
    const k = full.length;
    const med = k ? (k % 2 ? full[(k - 1) / 2] : (full[k / 2 - 1] + full[k / 2]) / 2) : null;
    if (med == null || med >= THIN_WEEK) return { list, bundled: false };
    const out = [];
    for (let i = 0; i < list.length; i += 4) {
      const g = list.slice(i, i + 4);
      out.push({ s: g[0].s, e: g[g.length - 1].e, n: g.reduce((a, b) => a + b.n, 0), part: g.length < 4 || g.some((b) => b.part) });
    }
    return { list: out, bundled: true };
  }

  // 등락 — 탭(일·주·월)과 무관하게 하나. 마지막 점에서 28일 이전의 마지막 점 대비(marketIndex.board 와 같은 계산).
  // 2026-10-14: 같은 "4w" 라벨인데 주간·월간 탭이 60쌍 중 20쌍 방향이 반대였다 → 주간 계열로 한 번만 계산해 모든 탭에 쓴다.
  function chgOf(pts, lang) {
    if (!pts || pts.length < 2) return null;
    const last = pts[pts.length - 1], tLast = Date.parse(last.d);
    const base28 = pts.filter((p) => Date.parse(p.d) <= tLast - 28 * DAY).pop() || null;
    const base = base28 || pts[0];
    return {
      pct: Math.round(((last.median / base.median) - 1) * 1000) / 10,
      tag: base28 ? (lang === "ko" ? "4주" : "4w") : (lang === "ko" ? "첫날 대비" : "since " + md(pts[0].d)),
    };
  }

  const JP_COLOR = "#3bc8df";   // --accent
  const EN_COLOR = "#5a9bf6";
  // 초판(Blue Bottom)은 재판과 다른 상품이라 선 색도 나눈다. 파랑끼리 두면 구분이 안 된다.
  const BLUE_COLOR = "#c9a227";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const money = (v) => "$" + Math.round(v).toLocaleString("en-US");

  // 눈금은 사람이 읽는 숫자로 — 1/2/2.5/5 배수에서 고른다. $224 같은 값은 축에 두지 않는다.
  function niceTicks(min, max, want) {
    want = want || 4;
    const span = max - min || 1;
    const raw = span / want;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }

  // 단조 3차 보간 — 점 사이에서 절대 오버슈트하지 않는다(없던 고점·저점을 만들지 않는다).
  function smoothPath(pts) {
    if (pts.length < 3) return pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    const n = pts.length, d = [], m = [];
    for (let i = 0; i < n - 1; i++) d[i] = (pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], h = Math.hypot(a, b);
      if (h > 3) { m[i] = (3 / h) * a * d[i]; m[i + 1] = (3 / h) * b * d[i]; }
    }
    let out = "M" + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
    for (let i = 0; i < n - 1; i++) {
      const dx = (pts[i + 1].x - pts[i].x) / 3;
      out += " C" + (pts[i].x + dx).toFixed(1) + " " + (pts[i].y + m[i] * dx).toFixed(1) +
        " " + (pts[i + 1].x - dx).toFixed(1) + " " + (pts[i + 1].y - m[i + 1] * dx).toFixed(1) +
        " " + pts[i + 1].x.toFixed(1) + " " + pts[i + 1].y.toFixed(1);
    }
    return out;
  }

  // minN 을 넘겨 받으면 그걸 쓴다 — 일별은 애초에 하루 3건 이상인 날만 빌더가 내보내므로
  // 여기서 5건을 다시 요구하면 일간 보기가 통째로 비어버린다.
  function clean(points, minN) {
    const floor = Number.isFinite(minN) ? minN : MIN_N;
    return (points || [])
      .filter((p) => p && p.d && Number.isFinite(Number(p.median)) && Number(p.median) > 0 && Number(p.n || 0) >= floor)
      .map((p) => ({ d: p.d, median: Number(p.median), low: Number(p.low || p.median), high: Number(p.high || p.median), n: Number(p.n), vol: Number.isFinite(Number(p.vol)) ? Number(p.vol) : null }))
      .sort((a, b) => a.d.localeCompare(b.d));
  }

  const md = (d) => d.slice(5).replace("-", "/");
  // 월간 보기는 날짜가 매달 1일이라 "05/01" 로 찍으면 그날 하루로 오해된다. 달 이름으로 보여준다.
  const monthLabel = (d, lang) => (lang === "ko" ? Number(d.slice(5, 7)) + "월" : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(d.slice(5, 7)) - 1]);

  // o: {windowDays, badge, supplyPts, today, lastSaleD, events, counts, through, chg, gapN}
  function panel(rawPts, label, color, gid, lang, grain, o) {
    o = o || {};
    const windowDays = o.windowDays, badge = o.badge, events = o.events;
    const pts = clean(rawPts, grain === "day" ? MIN_N_DAY : null);
    if (pts.length < (grain === "month" ? MIN_POINTS_MONTH : MIN_POINTS)) return "";
    if (grain === "day" && dailySparse(pts, o.asOfMs)) return "";
    // 2026-08-27 시각 개편(소유자 확정안): 가격축을 오른쪽으로 옮기고 현재가 플래그를 축에 꽂는다
    // (증권 차트 문법). 왼쪽 여백은 라벨이 사라지므로 좁힌다. 전역 L/R 은 공급 패널이 계속 쓰므로
    // 여기서만 지역 상수를 쓴다.
    const PL = 16, PR = 140;   // Reserve enough room for screen-readable labels on narrow panels.

    // y축은 중앙값 선 기준으로 잡는다 — low~high 전체로 잡으면 선이 축의 5% 만 쓰고 납작해진다.
    // 다만 **최소 축 폭**을 둔다. 즉시구매만 남기고 나니 OP-01 일본판이 3개월 내내 1% 안에서
    // 움직였는데, 축을 그 폭에 맞추니 $286~$289 짜리 흔들림이 화면을 가득 채워 큰 변동처럼 보였다.
    // 축이 값의 최소 8% 는 담게 하면, 조용한 세트는 조용해 보이고 실제로 움직인 세트만 크게 보인다.
    const meds = pts.map((p) => p.median);
    const mLo = Math.min.apply(null, meds), mHi = Math.max.apply(null, meds);
    const yMid = (mHi + mLo) / 2;
    const ySpan = Math.max((mHi - mLo) * 1.6, yMid * 0.08);
    const yMin = yMid - ySpan / 2, yMax = yMid + ySpan / 2;

    const tLast = Date.parse(pts[pts.length - 1].d);
    const tFirst = Date.parse(pts[0].d);
    const counts = o.counts || null;
    const tNow = o.today ? Date.parse(o.today) : 0;
    // 막대를 셀 수 있는 마지막 날 = 원장 갱신일(through)과 오늘 중 이른 날. 그 뒤는 아직 안 센 날이라 0 으로 그리지 않는다.
    const asOf = counts ? Math.min(Date.parse(o.through || o.today || pts[pts.length - 1].d), tNow || Infinity) : null;
    // 주간 축은 첫 점이 든 달력 주의 월요일에서 시작한다 — 첫 주 막대가 축 밖으로 잘리지 않게.
    const t0 = counts && grain === "week" ? mondayOf(tFirst) : tFirst;
    const vb = counts ? volBuckets(grain, t0, asOf, counts) : { list: [], bundled: false };
    // 축을 마지막 거래일이 아니라 오늘(또는 더 늦은 공급 관측)까지 연다.
    // 그래야 거래가 끊긴 구간이 빈칸으로 드러난다 — 선이 끝나는 곳이 축 끝이면
    // 11일째 멈춘 값도 "최신"처럼 보인다.
    const supArr = (o.supplyPts || []).filter((p) => p && p.v != null && Date.parse(p.d) >= t0);
    const tSup = supArr.length ? Date.parse(supArr[supArr.length - 1].d) : 0;
    // 월간은 점이 "그 달 1일"이라 오늘까지 축을 늘리면 이번 달 전체가 빈 구간처럼 보인다(2026-09-24 실사고:
    // 9월 55건 팔린 세트에 "1d no sales" 빗금). 월간 축은 마지막 달 칸(그 달 1일)에서 끝낸다 —
    // 점이 없는 마지막 달들도 칸은 그려 '<6' 으로 드러낸다(종전엔 9월이 말없이 빠졌다).
    const lastBucket = vb.list.length ? vb.list[vb.list.length - 1] : null;
    const t1 = grain === "month" ? Math.max(tLast, lastBucket ? lastBucket.s : 0) : Math.max(tLast, tSup, tNow, asOf || 0);
    // 빈 구간의 길이는 점(버킷) 날짜가 아니라 실제 마지막 체결일로 잰다 — 건수 원천이 있으면 거기서.
    let tSale = o.lastSaleD ? Date.parse(o.lastSaleD) : tLast;
    if (counts) {
      const sold = Object.keys(counts).filter((d) => counts[d] > 0 && Date.parse(d) <= asOf).sort();
      if (sold.length) tSale = Date.parse(sold[sold.length - 1]);
    }
    const span = t1 - t0 || 1;
    const px = (p) => PL + ((Date.parse(p.d) - t0) / span) * (W - PL - PR);
    const py = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (PRICE_BOTTOM - T);

    const XY = pts.map((p) => ({ x: px(p), y: py(p.median) }));
    // 빠진 점은 곡선으로 잇지 않는다(2026-10-14) — 이어 그리면 없는 값을 만드는 셈이다.
    // 주간: 7일 격자에서 점이 빠지면(창 안 판매가 기준 미만) 끊고 빗금. 월간: 달이 비면 끊고 빗금. 일간: 하루 넘게 비면 끊기만 한다.
    const brk = (a, b) => (grain === "month"
      ? monthNo(Date.parse(b.d)) - monthNo(Date.parse(a.d)) > 1
      : Date.parse(b.d) - Date.parse(a.d) > (grain === "day" ? 1.5 : 7.5) * DAY);
    const segs = [[0]];
    for (let i = 1; i < pts.length; i++) {
      if (brk(pts[i - 1], pts[i])) segs.push([i]); else segs[segs.length - 1].push(i);
    }
    const solo = new Set(segs.filter((s) => s.length === 1).map((s) => s[0]));
    const segPaths = segs.filter((s) => s.length >= 2).map((s) => {
      const xy = s.map((i) => XY[i]);
      const d = smoothPath(xy);
      // 일간은 조각이 많아 조각마다 채움을 깔면 세로 줄무늬가 된다(2026-10-14 캡처) — 선만 그린다.
      return (grain === "day" ? "" : '<path class="opbcArea" d="' + d + " L" + xy[xy.length - 1].x.toFixed(1) + " " + PRICE_BOTTOM +
        " L" + xy[0].x.toFixed(1) + " " + PRICE_BOTTOM + ' Z" fill="url(#' + gid + ')"/>') +
        '<path class="opbcLine opbcDraw" pathLength="1" d="' + d + '" stroke="' + color + '"/>';
    }).join("");

    let ticks = niceTicks(yMin, yMax, 4);
    if (ticks.length < 3) ticks = niceTicks(yMin, yMax, 7);
    // 마지막 값과 겹치는 눈금 라벨은 지운다 — 현재가 플래그가 그 자리에 앉는다.
    // 간격 48: 폰(@container ≤440)에서 플래그가 36~44 단위로 커져 36 으로는 '$220<>$225' 처럼 겹쳤다(2026-10-14 QA 측정).
    const lastY = py(pts[pts.length - 1].median);
    const grid = ticks.map((v) =>
      '<line class="opbcGrid" x1="' + PL + '" y1="' + py(v).toFixed(1) + '" x2="' + (W - PR) + '" y2="' + py(v).toFixed(1) + '"/>' +
      (Math.abs(py(v) - lastY) < 48 ? "" :
        '<text class="opbcAx" x="' + (W - PR + 8) + '" y="' + (py(v) + 4).toFixed(1) + '">' + money(v) + "</text>")).join("");

    // x 라벨은 처음·중간·끝 3개만 — 더 넣으면 축이 데이터보다 시끄러워진다.
    const mid = pts[Math.floor(pts.length / 2)];
    const lab = (p) => (grain === "month" ? monthLabel(p.d, lang) : md(p.d));
    const grainWord = grain === "month" ? (lang === "ko" ? "월별" : "monthly")
      : grain === "day" ? (lang === "ko" ? "일별" : "daily") : null;
    // 진행 중인 달 칸은 달 이름 대신 센 기간을 쓴다 — "10/1–10/14". 이번 달 전체로 읽히면 막대가 반토막 급락처럼 보인다.
    const firstDay = (t) => md(iso(t)).replace(/\/0?1$/, "/1");
    const bLab = (b) => (grain === "day" ? md(iso(b.s))
      : grain === "month" ? (b.part ? firstDay(b.s) + "–" + md(iso(b.e - DAY)) : monthLabel(iso(b.s), lang))
      : md(iso(b.s)) + "–" + md(iso(b.e - DAY)));
    // x 라벨이 차지하는 가로 구간(가장 큰 글자 기준) — 아래 막대 숫자가 이 구간과 겹치면 숫자를 뺀다.
    const axBox = (x, s, a) => { const w = textW(s, AX_FS_MAX); return a === "start" ? [x, x + w] : a === "end" ? [x - w, x] : [x - w / 2, x + w / 2]; };
    const xlBoxes = [];
    const xlText = (x, s, a) => { xlBoxes.push(axBox(x, s, a)); return '<text class="opbcAx" x="' + x.toFixed(1) + '" y="' + (H - 12) + '" text-anchor="' + a + '">' + s + "</text>"; };
    let xl;
    if (grain === "month" && vb.list.length) {
      // 월간은 막대 칸(마지막 달까지)으로 라벨을 단다 — 점이 없는 달도 축에 이름이 있어야 빈 칸이 보인다.
      const L3 = vb.list.length >= 3 ? [vb.list[0], vb.list[Math.floor(vb.list.length / 2)], vb.list[vb.list.length - 1]] : [vb.list[0], vb.list[vb.list.length - 1]];
      xl = L3.filter((b, i, a) => a.indexOf(b) === i).map((b, i, arr) =>
        xlText(px({ d: iso(b.s) }), bLab(b), i === 0 && arr.length > 1 ? "start" : i === arr.length - 1 ? "end" : "middle")).join("");
    } else {
      // 주간·일간: 첫 라벨은 첫 점, 끝 라벨은 축 끝(t1 — 오늘까지 열린 축의 끝), 가운데 라벨은 양옆 라벨과 글자 폭만큼 떨어질 때만 —
      // 2026-10-14 QA: 끝 라벨을 마지막 점에 달아 점이 왼쪽에 몰린 계열(OP-02 일본판 06/16~07/07, 축은 10/14까지)에서 세 라벨이
      // 왼쪽 20% 안에 겹쳤다('06/1670'). 글자 크기는 패널 폭에 따라 커지므로(@container) 가장 큰 경우로 잰다.
      const items = [{ p: pts[0], a: "start" }];
      if (pts.length >= 3) items.push({ p: mid, a: "middle" });
      items.push({ p: { d: iso(t1) }, a: "end" });
      const span0 = (it) => axBox(px(it.p), lab(it.p), it.a);
      const keep = items.filter((it) => {
        if (it.a !== "middle") return true;
        const [a0, a1] = span0(it), [, s1] = span0(items[0]), [e0] = span0(items[items.length - 1]);
        return a0 >= s1 + 8 && a1 <= e0 - 8;
      });
      // 끝 라벨이 첫 라벨과 겹칠 만큼 축이 짧으면(점 3개가 며칠 안에 몰린 경우) 첫 라벨만 둔다.
      const [, f1] = span0(keep[0]), [l0] = span0(keep[keep.length - 1]);
      const shown = l0 >= f1 + 8 ? keep : [keep[0]];
      xl = shown.map((it) => xlText(px(it.p), lab(it.p), it.a)).join("");
    }

    const first = pts[0], last = pts[pts.length - 1];
    // 등락은 탭과 무관하게 하나 — 호출부가 주간 계열로 계산해 넘긴다(chgOf). 주간이 없을 때만 자기 점으로 센다:
    // 월간은 직전 달 대비라 "4주"가 아니라 "전월 대비"로 단다(같은 라벨에 다른 계산을 싣지 않는다).
    const fromWeekly = !!o.chg;
    // 진행 중인 달(2026-11-02) — 월간 마지막 점의 달이 막대와 같은 기준일(원장 갱신일·오늘 중 이른 날)까지 다 차지 않았으면
    // 그 점은 '지금까지'의 값이다. 빈 점·'진행 중' 꼬리표로 그리고, 다 찬 달과의 전월 대비는 내지 않는다
    // (EB-05 일본판 11월 2일치 11건 vs 10월 1일치 6건이 '▼7.6% 전월 대비'로 나갔다).
    const monthAsOf = asOf != null ? asOf : tNow;
    const lastPart = grain === "month" && !!monthAsOf && nextMonth(tLast) - DAY > monthAsOf;
    let cg = o.chg || null;
    if (!cg && grain === "month" && lastPart) cg = { pct: 0, tag: "", stale: true };
    if (!cg && grain === "month" && pts.length >= 2) {
      const prev = pts[pts.length - 2];
      const consec = monthNo(Date.parse(last.d)) - monthNo(Date.parse(prev.d)) === 1;
      cg = { pct: Math.round(((last.median / prev.median) - 1) * 1000) / 10,
        tag: consec ? (lang === "ko" ? "전월 대비" : "vs prev. month") : (lang === "ko" ? monthLabel(prev.d, lang) + " 대비" : "vs " + monthLabel(prev.d, lang)) };
    }
    if (!cg) cg = chgOf(pts, lang);
    const chg = cg.pct;
    // 주간이 아닌 탭에서 주간 계열 등락을 쓰면 기준을 라벨에 적는다 — 2026-10-14 QA: 월간 $301(8월) 옆 ▼1% 4w(10/04 대 09/06)처럼
    // 한 머리줄의 현재가와 등락이 서로 다른 기간이었다.
    const chgTag = fromWeekly && grain !== "week" ? (lang === "ko" ? "주간 " : "weekly ") + cg.tag : cg.tag;
    // 마지막 가격 점이 28일 넘게 묵었으면 홈 칩·전광판과 같은 규칙 — 현재가를 흐리게 + 'MM/DD', 등락은 숨긴다(2026-10-14 QA:
    // OP-02 일본판 07/07 점의 $147 이 지금 값처럼 보였다). 월간 점은 그 달 말일까지의 값이라 말일로 잰다.
    // 등락의 기준 계열(주간)이 묵었어도 숨긴다(OP-01 Blue 30일 무거래인데 ▲6.1% 4w — 칩은 숨겼다).
    const lastEnd = grain === "month" ? nextMonth(tLast) - DAY : tLast;
    const headStale = !!tNow && tNow - lastEnd > 28 * DAY;
    const hideChg = headStale || !!cg.stale;
    const sampleWord = lang === "ko" ? "건" : " sales";
    const rangeWord = lang === "ko" ? "범위" : "range";

    // ── 거래량 막대 — 달력 칸마다 하나(2026-10-14). 값이 1~3 건인 계열도 있는데, 그 사실 자체가 정보다.
    //    0건 칸은 2px 바닥선 + '0'(일간은 바닥선만 — 칸이 너무 촘촘하다). 진행 중인 칸은 테두리만.
    //    색은 한 가지 — 종전의 상승·하락 색은 1% 미만 잡음에도 바뀌어(389번 중 204번) 신호가 아니라 소음이었다.
    //    높이는 그 계열 최댓값 기준(상대 비교)이라 건수는 묶음·월간에선 막대 위 숫자로, 나머지는 훑기 판독에 싣는다.
    const volMax = Math.max.apply(null, vb.list.map((b) => b.n).concat([1]));
    const showN = vb.bundled || grain === "month";
    const cntWord = (n) => (lang === "ko" ? n + "건" : n + (n === 1 ? " sale" : " sales"));
    const bars = vb.list.map((b) => {
      const xa = px({ d: iso(b.s) });
      let cx, bw;
      if (grain === "week") { const xb = px({ d: iso(b.e) }); cx = (xa + xb) / 2; bw = Math.max(2, (xb - xa) * 0.62); }
      else {
        const unit = px({ d: iso(grain === "month" ? nextMonth(b.s) : b.s + DAY) }) - xa;
        cx = xa; bw = Math.max(1.5, Math.min(26, unit * 0.62));
      }
      const h = b.n ? Math.max(2, (b.n / volMax) * (VOL_H - 8)) : 2;
      const y = H - B - h;
      const cls = "opbcBar" + (b.part ? " opbcBarPart" : "") + (b.n ? "" : " opbcBar0");
      const rd = (lang === "ko" ? "판매 " : "Sales ") + bLab(b) + ": " + cntWord(b.n);
      // 숫자는 막대 가운데에 두되 SVG 왼쪽 밖으로 나가지 않게 — 2026-10-14 QA: 첫 막대가 PL 바로 위라 OP-16 영문 월간 '152' 가 '|52' 로 잘렸다.
      const nx = (s) => Math.max(cx, textW(s, AX_FS_MAX) / 2 + 2);
      // 낮은 막대의 숫자는 x 축 라벨 줄까지 내려온다(글자가 가장 클 때) — 라벨과 가로로 겹치면 숫자를 뺀다. 건수는 훑기 판독에 남는다.
      // 2026-10-14 QA: '0<>06/16'·'1<>10/1–10/14' 겹침. 끝 라벨을 축 끝(오늘)으로 옮기며 진행 중 칸 숫자와도 만났다.
      const numText = (s, yb) => {
        const x = nx(s), w = textW(s, AX_FS_MAX);
        const low = yb + 0.25 * AX_FS_MAX > H - 12 - 0.8 * AX_FS_MAX;
        if (low && xlBoxes.some(([a0, a1]) => x - w / 2 < a1 + 4 && x + w / 2 > a0 - 4)) return "";
        return '<text class="opbcAx opbcBarN" x="' + x.toFixed(1) + '" y="' + yb.toFixed(1) + '" text-anchor="middle">' + s + "</text>";
      };
      // data-s/data-e = 이 칸의 판매일 구간(끝 미포함) — 훑기 판독이 손가락 x 가 아니라 가격 점의 날짜로 칸을 고른다.
      return '<rect class="' + cls + '" x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1" data-x="' + cx.toFixed(1) +
        '" data-s="' + iso(b.s) + '" data-e="' + iso(b.e) + '" data-l="' + esc(rd) + '"/>' +
        (!b.n && grain !== "day" ? numText("0", H - B - 6) : b.n && showN ? numText(String(b.n), y - 5) : "");
    }).join("");
    const anyPart = vb.list.some((b) => b.part);
    const volAxis = '<line class="opbcGrid" x1="' + PL + '" y1="' + (H - B) + '" x2="' + (W - PR) + '" y2="' + (H - B) + '"/>';

    // 판매형식 기록 시작 경계(08/13). 앞 구간을 숨기지 않고 경계선만 긋고, 라벨은 아래 범례에 단다
    // (그림 안 글자는 막대 숫자와 겹쳤다 — 2026-10-14 1366 캡처).
    const tFmt = Date.parse(FMT_SINCE);
    const fmtOn = vb.list.length > 0 && tFmt > t0 && tFmt < t1;
    const fmtWord = lang === "ko" ? "즉시구매 구분 " + md(FMT_SINCE) + "~" : "BIN-tagged from " + md(FMT_SINCE);
    const fmtLayer = fmtOn
      ? '<line class="opbcFmt" x1="' + px({ d: FMT_SINCE }).toFixed(1) + '" y1="' + T + '" x2="' + px({ d: FMT_SINCE }).toFixed(1) + '" y2="' + (H - B) + '"/>'
      : "";

    // ── 매물수 겹쳐그리기는 2026-08-27 소유자 확정으로 제거 — 회색 점선이 가격선과 엉켜
    //    "이게 무슨 그래프인지 모르겠다"는 피드백. 매물수는 아래 전용 공급 패널이 담당한다.

    // ── 거래가 끊긴 구간. 억지로 실선을 이어 그리면 없는 거래를 만드는 셈이다.
    //    2026-09-16 소유자 요청으로 표시를 강하게 했다. 규칙은 그대로다 — 새 값은 만들지 않는다.
    //    ① 빗금: "여기엔 데이터가 없다"를 색이 아니라 무늬로 말한다(5% 단색은 화면에서 안 보였다).
    //    ② 점선 유도선: 마지막 체결가 높이로 오늘까지 긋되 실선·채움과 확실히 구분한다.
    //       이어진 값이 아니라 "마지막으로 팔린 가격이 여기였다"는 기준선이다.
    //    ③ 오늘 끝은 속 빈 원 — 채워진 점(실제 관측)과 모양으로 구분한다.
    let staleLayer = "", staleBadge = "", staleDefs = "";
    const hid = gid + "hatch";
    const hatchDefs =
      '<pattern id="' + hid + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="7" height="7" fill="rgba(245,200,66,.07)"/>' +
      '<line x1="0" y1="0" x2="0" y2="7" stroke="rgba(245,200,66,.30)" stroke-width="1.6"/></pattern>';
    // 점이 빠진 구간(창 안 판매가 기준 미만) — 같은 빗금에 '<6' 라벨. 값을 만들지 않는다.
    const gapN = o.gapN || MIN_N + 1;
    const gapWord = lang === "ko" ? gapN + "건 미만" : "<" + gapN + " sales";
    const lowZones = [];
    if (grain !== "day") {
      for (let k = 1; k < segs.length; k++) {
        const a = segs[k - 1][segs[k - 1].length - 1], b = segs[k][0];
        lowZones.push([XY[a].x, XY[b].x]);
      }
    }
    // 월간: 마지막 점 뒤의 완료된 달 중 점이 없는 달(OP-01 일본판 9월 3건)까지만 빗금 — 진행 중인 달은 막대 테두리(진행 중)로 이미
    // 말한다. 2026-10-14 QA: 진행 중 10월까지 빗금을 깔아 9월 점이 있는 계열(OP-02 영문)도 9월→10월이 '누락'처럼 보였다.
    if (grain === "month" && lastBucket) {
      const lastDone = lastBucket.part ? vb.list[vb.list.length - 2] : lastBucket;
      if (lastDone && lastDone.s > tLast) lowZones.push([XY[XY.length - 1].x, px({ d: iso(lastDone.s) })]);
    }
    // 주간·일간: 마지막 점 뒤에도 판매는 있었지만 창(일간은 하루)이 기준 미만이라 점이 안 나온 구간.
    // 일간도 같은 빗금 — 2026-10-14 QA: OP-05 영문 10/04 뒤 10일이 빗금도 라벨도 없는 빈칸이었다.
    if (grain !== "month" && counts && tSale > tLast + DAY) lowZones.push([XY[XY.length - 1].x, px({ d: iso(tSale) })]);
    // 빗금 안 글자('<6 sales')는 넣지 않는다 — 범례(kHatch)에 같은 말이 있고, 그림 안 글자는 1366 에서 8~9px 로 줄었다(2026-10-14 QA).
    const gapLayer = lowZones.map(([x0, x1]) =>
      '<rect class="opbcStale opbcGap" x="' + x0.toFixed(1) + '" y="' + T + '" width="' + Math.max(0, x1 - x0).toFixed(1) +
      '" height="' + (PRICE_BOTTOM - T) + '" fill="url(#' + hid + ')"/>').join("");
    if (lowZones.length) staleDefs = hatchDefs;
    if (grain !== "month" && t1 > tSale + 86400000 * 2) {
      // 빗금은 마지막 체결일부터(점 위치가 아니라). 체결일이 점보다 뒤면 그 자리부터 시작한다.
      const gx0 = px({ d: new Date(Math.max(tSale, tLast)).toISOString().slice(0, 10) }), gx1 = W - PR;
      const days = Math.round((t1 - tSale) / 86400000);
      const gy = py(pts[pts.length - 1].median);
      // 글자가 빗금 칸 안에 들어갈 때만 쓴다 — 글자 크기를 렌더 11.5px 이상으로 올리면서(아래 CSS) 칸 폭도 그 크기로 잰다(2026-10-14 QA).
      const txWide = lang === "ko" ? "거래 없음 " + days + "일" : days + "d no sales";
      const subWide = lang === "ko" ? "선은 마지막 체결가" : "line = last traded price";
      const wide = gx1 - gx0 >= Math.max(textW(txWide, STALE_FS_MAX), textW(subWide, STALE_FS_MAX)) + 12;
      const narrowOk = gx1 - gx0 >= textW(lang === "ko" ? "거래 없음" : "no sales", STALE_FS_MAX) + 12;
      staleDefs = hatchDefs;
      staleLayer =
        '<rect class="opbcStale" x="' + gx0.toFixed(1) + '" y="' + T + '" width="' + (gx1 - gx0).toFixed(1) +
        '" height="' + (PRICE_BOTTOM - T) + '" fill="url(#' + hid + ')"/>' +
        '<line class="opbcStaleEdge" x1="' + gx0.toFixed(1) + '" y1="' + T + '" x2="' + gx0.toFixed(1) + '" y2="' + PRICE_BOTTOM + '"/>' +
        '<line class="opbcStaleCarry" x1="' + gx0.toFixed(1) + '" y1="' + gy.toFixed(1) +
        '" x2="' + gx1.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="' + color + '"/>' +
        '<circle class="opbcStaleEnd" cx="' + gx1.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="4" stroke="' + color + '"/>' +
        (wide
          ? '<text class="opbcStaleTx" x="' + ((gx0 + gx1) / 2).toFixed(1) + '" y="' + (T + 18) +
            '" text-anchor="middle">' + txWide + "</text>" +
            '<text class="opbcStaleSub" x="' + ((gx0 + gx1) / 2).toFixed(1) + '" y="' + (T + 40) +
            '" text-anchor="middle">' + subWide + "</text>"
          : narrowOk
            ? '<text class="opbcStaleTx" x="' + ((gx0 + gx1) / 2).toFixed(1) + '" y="' + (T + 18) +
              '" text-anchor="middle">' + (lang === "ko" ? "거래 없음" : "no sales") + "</text>"
            : "");
      staleBadge = lang === "ko" ? "거래 없음 " + days + "일" : days + "d no sales";
    }

    // 계열 이름표. 막대 단위(주·4주·월·일)를 이름에 박는다 — 묶음으로 바뀐 계열이 주 단위로 읽히지 않게.
    const kPrice = lang === "ko" ? "가격" : "Price";
    const kVol = vb.bundled ? (lang === "ko" ? "4주 판매 건수" : "Sales / 4 weeks")
      : grain === "month" ? (lang === "ko" ? "월 판매 건수" : "Sales / month")
      : grain === "day" ? (lang === "ko" ? "일 판매 건수" : "Sales / day")
      : (lang === "ko" ? "주 판매 건수" : "Sales / week");
    const keyRow = '<div class="opbcKey">' +
      '<span><i class="kLine" style="background:' + color + '"></i>' + kPrice + "</span>" +
      (vb.list.length ? '<span><i class="kBar"></i>' + kVol + "</span>" : "") +
      (anyPart ? '<span><i class="kBar kPart"></i>' + (lang === "ko" ? "진행 중" : "in progress") + "</span>" : "") +
      (lowZones.length ? '<span><i class="kHatch"></i>' + esc(gapWord) + "</span>" : "") +
      (fmtOn ? '<span><i class="kFmt"></i>' + esc(fmtWord) + "</span>" : "") +
      "</div>";

    // 점은 마지막 것만 보인다 — 선 위 점들이 시각 소음이라는 확정안. 좌표는 스크럽 JS 가
    // 스냅용으로 계속 쓰므로 요소 자체는 남기고 투명 처리한다. 앞뒤가 끊겨 홀로 남은 점은 선이 없으니 보이게 둔다.
    const dots = pts.map((p, i) =>
      '<circle class="opbcDot" cx="' + XY[i].x.toFixed(1) + '" cy="' + XY[i].y.toFixed(1) +
      '" r="' + (i === pts.length - 1 ? 4.5 : solo.has(i) ? 3.5 : 3) + '"' +
      (i === pts.length - 1 && lastPart ? ' fill="#0a0f14" stroke="' + color + '" stroke-width="2"' : ' fill="' + color + '"') +
      (i === pts.length - 1 || solo.has(i) ? "" : ' opacity="0"') + "/>").join("");

    // 툴팁 값은 data-* 속성에만 싣고 hover/스크럽 JS 가 읽는다(2026-10-19).
    const hits = pts.map((p, i) =>
      '<circle class="opbcHitDot" cx="' + XY[i].x.toFixed(1) + '" cy="' + XY[i].y.toFixed(1) + '" r="14" fill="transparent"' +
      ' data-d="' + (grain === "month" ? p.d.slice(0, 7) : p.d) + '" data-t="' + p.d + '" data-v="' + money(p.median) +
      '" data-r="' + rangeWord + " " + money(p.low) + "–" + money(p.high) +
      // n 은 그 점(중앙값)을 만든 표본 수. 막대 건수는 달력 칸 기준이라 막대(data-l)에 따로 싣는다.
      '" data-n="' + p.n + sampleWord +
      '" data-x="' + md(p.d) + '"/>').join("");

    // ── 새 시각 요소(2026-08-27 확정안): 현재가 플래그·고점/저점 라벨.
    const flagY = py(last.median);
    const flagTx = money(last.median);
    const flag =
      '<line x1="' + PL + '" y1="' + flagY.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + flagY.toFixed(1) +
      '" stroke="' + color + '" stroke-dasharray="2 4" opacity=".45"/>' +
      '<g class="opbcFlag"' + (headStale ? ' opacity=".55"' : "") + '><rect x="' + (W - PR + 3) + '" y="' + (flagY - 11).toFixed(1) + '" width="' + (PR - 8) + '" height="22" rx="5" fill="' + color + '"/>' +
      '<text class="opbcFlagTx" x="' + (W - PR + 3 + (PR - 8) / 2) + '" y="' + (flagY + 4).toFixed(1) +
      '" text-anchor="middle" fill="#0a0f14">' + flagTx + "</text></g>";
    const hiWord = lang === "ko" ? "고점 " : "High ";
    const loWord = lang === "ko" ? "저점 " : "Low ";
    const clampX = (x) => Math.max(PL + 72, Math.min(W - PR - 72, x));   // 폰(22px 라벨)에서도 안 잘리게 72(2026-09-24)
    const hiI = meds.indexOf(mHi), loI = meds.indexOf(mLo);
    const hlLabels =
      (hiI === pts.length - 1 ? "" : '<text class="opbcAx" x="' + clampX(XY[hiI].x).toFixed(1) + '" y="' + (py(mHi) - 9).toFixed(1) +
        '" text-anchor="middle" fill="#b6c0d4">' + hiWord + money(mHi) + "</text>") +
      (loI === pts.length - 1 || loI === hiI ? "" : '<text class="opbcAx" x="' + clampX(XY[loI].x).toFixed(1) + '" y="' + (py(mLo) + 17).toFixed(1) +
        '" text-anchor="middle" fill="#b6c0d4">' + loWord + money(mLo) + "</text>");

    // 사건 표시(발매일). 창 안에 들어오는 것만 — 세로 점선 + 위쪽 라벨. 값을 바꾸지 않는 설명 레이어다(2026-09-24).
    const evLayer = (events || []).filter((e) => e && e.d && Date.parse(e.d) >= t0 && Date.parse(e.d) <= t1).map((e) => {
      const x = px({ d: e.d });
      const txt = (lang === "ko" ? (e.labelKo || e.label) : e.label) + " " + md(e.d);
      return '<line class="opbcEvt" x1="' + x.toFixed(1) + '" y1="' + T + '" x2="' + x.toFixed(1) + '" y2="' + PRICE_BOTTOM + '"/>' +
        '<text class="opbcAx opbcEvtTx" x="' + clampX(x).toFixed(1) + '" y="' + (T - 8) + '" text-anchor="middle">' + esc(txt) + "</text>";
    }).join("");

    return '<figure class="opbcPane" data-ed="' + gid + '">' +
      '<figcaption class="opbcHead"><span class="opbcLabel">' + esc(label) + "</span>" +
      (badge ? '<span class="opbcBadge">' + esc(badge) + "</span>" : "") +
      '<span class="opbcNow' + (headStale ? " opbcNowStale" : "") + '">' + money(last.median) + "</span>" +
      (lastPart && !headStale ? '<small class="opbcAsOf">' + (lang === "ko" ? "진행 중" : "in progress") + "</small>" : "") +
      (headStale ? '<small class="opbcAsOf">' + lab(last) + "</small>"
        : hideChg ? ""
        : '<span class="opbcChg ' + (chg > 0 ? "up" : chg < 0 ? "dn" : "flat") + '">' + (chg > 0 ? "▲" : chg < 0 ? "▼" : "–") + " " + Math.abs(chg) + '% <small class="opbcChgTag">' + chgTag + "</small></span>") +
      '<span class="opbcSpan">' + lab(first) + " – " + lab(last) +
      (grainWord ? " · " + grainWord
        : windowDays ? " · " + windowDays + (lang === "ko" ? "일 평균" : "-day avg") : "") +
      " · n=" + last.n + "</span>" +
      (staleBadge ? '<span class="opbcStaleBadge">' + staleBadge + "</span>" : "") + "</figcaption>" +
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label) + " " +
      esc(lang === "ko" ? "박스 실거래 중앙값 추이" : "sealed box median sold price over time") + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + color + '" stop-opacity=".30"/>' +
      '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient>' + staleDefs + '</defs>' +
      staleLayer + gapLayer + grid + volAxis + bars + fmtLayer + evLayer + segPaths +
      '<g class="opbcExtrema">' + hlLabels + '</g>' + flag + dots +
      '<circle cx="' + XY[XY.length - 1].x.toFixed(1) + '" cy="' + XY[XY.length - 1].y.toFixed(1) +
      '" r="11" class="opbcPulse" fill="' + color + '" opacity=".18"/>' +
      hits +
      '<line class="opbcCross" y1="' + T + '" y2="' + (H - B) + '" stroke="' + color + '" stroke-dasharray="3 3" opacity="0"/>' +
      '<g class="opbcDateTag" opacity="0" pointer-events="none"><rect width="46" height="18" rx="4" fill="#242936"/>' +
      '<text class="opbcAx" x="23" y="13" text-anchor="middle" fill="#cfd6e4"></text></g>' +
      '<circle class="opbcHl" r="6" fill="' + color + '" stroke="#11141c" stroke-width="3" opacity="0"/>' +
      '<g class="opbcTip" opacity="0" pointer-events="none">' +
      '<rect class="opbcTipBg" rx="7" width="186" height="62"/>' +
      '<text class="opbcTipD" x="10" y="17"></text><text class="opbcTipV" x="10" y="36"></text>' +
      '<text class="opbcTipR" x="10" y="53"></text></g>' +
      xl +
      '<rect class="opbcHit" x="' + PL + '" y="' + T + '" width="' + (W - PL - PR) + '" height="' + (H - T - B) + '" fill="transparent"/>' +
      "</svg>" + keyRow + "</figure>";
  }

  // ── 공급 패널: 지금 eBay 에 올라와 있는 밀봉 박스가 몇 개인가.
  //
  // 가격만 보면 시장을 반만 읽는다. 매물이 늘면서 가격이 버티는 것과 매물이 마르면서 오르는 것은
  // 완전히 다른 신호다. 일본판·영문판 개수는 자릿수가 같아(보통 15~30) 한 축에 같이 놓을 수 있다.
  //
  // ⚠️ 이건 "팔린 개수"가 아니라 "올라와 있는 개수"다. 목록에서 사라진 건 판매·취소·만료를
  //    구분할 수 없어 절대 거래량으로 부르지 않는다(update-supply-series.js 원칙 1).
  //
  // 기간이 가격 그래프보다 짧다(수집을 늦게 시작했다). 그래서 같은 축에 겹치지 않고 따로 그린다 —
  // 겹치면 왼쪽 3/4 가 텅 빈 채로 "공급 데이터가 없다"처럼 보인다.
  const SUP_H = 190, SUP_B = 34, SUP_T = 22;
  function supplyPanel(points, lang, today) {
    const pts = (points || []).filter((p) => p && p.d && (Number.isFinite(p.jp) || Number.isFinite(p.en)))
      .slice().sort((a, b) => a.d.localeCompare(b.d));
    if (pts.length < MIN_POINTS) return "";

    const vals = [];
    for (const p of pts) { if (Number.isFinite(p.jp)) vals.push(p.jp); if (Number.isFinite(p.en)) vals.push(p.en); }
    const vMax = Math.max.apply(null, vals), vMin = Math.min.apply(null, vals);
    // 0 부터 그렸더니 19~24 짜리 변동이 축의 위쪽 20% 에 눌려 아무것도 안 보였다(2026-08-13 실측).
    // 가격 패널과 같은 방식으로 실제 범위에 맞춘다. 축에 개수가 그대로 찍히므로 오독 위험은 낮다.
    const pad = Math.max((vMax - vMin) * 0.35, 1);
    const yMax = vMax + pad, yMin = Math.max(0, vMin - pad);
    // 하루 1회 세는 값이라 빠진 날은 빠진 날이다(2026-10-14) — 선을 끊고 가격 패널과 같은 빗금을 친다. 보간하지 않는다.
    // 마지막 관측 뒤로 이틀 넘게 비면(오늘 몫은 아직 안 돈 것일 수 있어 하루는 봐준다) 축을 오늘까지 열어 그 구간도 빗금.
    const tObs = Date.parse(pts[pts.length - 1].d);
    const tToday = today ? Date.parse(today) : 0;
    const t0 = Date.parse(pts[0].d), t1 = tToday - tObs >= 2 * DAY ? tToday : tObs;
    const span = t1 - t0 || 1;
    const px = (p) => L + ((Date.parse(p.d) - t0) / span) * (W - L - R);
    const py = (v) => SUP_T + (1 - (v - yMin) / (yMax - yMin)) * (SUP_H - SUP_T - SUP_B);
    const holes = [];
    for (let i = 1; i < pts.length; i++) {
      if (Date.parse(pts[i].d) - Date.parse(pts[i - 1].d) > 1.5 * DAY) holes.push([px(pts[i - 1]), px(pts[i])]);
    }
    if (t1 > tObs) holes.push([px(pts[pts.length - 1]), W - R]);
    const hid = "opbcSupHatch";
    const holeLayer = holes.length
      ? '<defs><pattern id="' + hid + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<rect width="7" height="7" fill="rgba(245,200,66,.07)"/>' +
        '<line x1="0" y1="0" x2="0" y2="7" stroke="rgba(245,200,66,.30)" stroke-width="1.6"/></pattern></defs>' +
        holes.map(([x0, x1]) => '<rect class="opbcStale opbcGap" x="' + x0.toFixed(1) + '" y="' + SUP_T + '" width="' + Math.max(0, x1 - x0).toFixed(1) +
          '" height="' + (SUP_H - SUP_T - SUP_B) + '" fill="url(#' + hid + ')"/>').join("")
      : "";

    // 눈금 3개를 요구하면 범위 18~28 에서 10 단위가 뽑혀 20/30 둘만 남는다. 4개로 요구해 5 단위를 얻는다.
    let ticks = niceTicks(yMin, yMax, 4);
    if (ticks.length < 3) ticks = niceTicks(yMin, yMax, 6);
    const grid = ticks.map((v) =>
      '<line class="opbcGrid" x1="' + L + '" y1="' + py(v).toFixed(1) + '" x2="' + (W - R) + '" y2="' + py(v).toFixed(1) + '"/>' +
      '<text class="opbcAx" x="' + (L - 10) + '" y="' + (py(v) + 4).toFixed(1) + '" text-anchor="end">' + v + "</text>").join("");

    const drawLine = (key, color) => {
      const own = pts.filter((p) => Number.isFinite(p[key]));
      if (own.length < 2) return "";
      // 이 판 값이 하루라도 빠지면 거기서 끊는다. 홀로 남은 날은 점으로만.
      const segs = [[own[0]]];
      for (let i = 1; i < own.length; i++) {
        if (Date.parse(own[i].d) - Date.parse(own[i - 1].d) > 1.5 * DAY) segs.push([own[i]]); else segs[segs.length - 1].push(own[i]);
      }
      const XY = (s) => s.map((p) => ({ x: px(p), y: py(p[key]) }));
      const lastXY = XY([own[own.length - 1]])[0];
      return segs.map((s) => (s.length >= 2
        ? '<path class="opbcLine opbcSupLine" d="' + smoothPath(XY(s)) + '" stroke="' + color + '"/>'
        : s[0] === own[own.length - 1] ? "" : '<circle cx="' + XY(s)[0].x.toFixed(1) + '" cy="' + XY(s)[0].y.toFixed(1) + '" r="2.5" fill="' + color + '"/>')).join("") +
        '<circle cx="' + lastXY.x.toFixed(1) + '" cy="' + lastXY.y.toFixed(1) + '" r="4" fill="' + color + '"/>';
    };

    // 훑기용 앵커. 가격 패널의 .opbcDot 자리를 대신한다 — 눈에 보이는 점은 아니지만
    // 같은 방식으로 "가장 가까운 x" 를 찾을 수 있게 한다. 값은 data 속성에 실어 보낸다.
    const jpWord = lang === "ko" ? "일본판" : "Japanese";
    const enWord = lang === "ko" ? "영문판" : "English";
    const anchors = pts.map((p) =>
      '<circle class="opbcSupDot" cx="' + px(p).toFixed(1) + '" cy="' + (SUP_H - SUP_B) / 2 + '" r="0" fill="none"' +
      ' data-d="' + p.d + '"' +
      ' data-jp="' + (p.jp == null ? "" : p.jp) + '" data-en="' + (p.en == null ? "" : p.en) + '"' +
      ' data-jpy="' + (p.jp == null ? "" : py(p.jp).toFixed(1)) + '" data-eny="' + (p.en == null ? "" : py(p.en).toFixed(1)) + '"/>').join("");

    // 값은 위 앵커(opbcSupDot)의 data-* 를 hover JS 가 읽는다 — 점마다 <title> 글자는 두지 않는다(2026-10-19, 위 가격 차트와 같은 이유).
    const hits = pts.map((p) =>
      '<circle class="opbcHitDot" cx="' + px(p).toFixed(1) + '" cy="' + (SUP_H - SUP_B) / 2 + '" r="10" fill="transparent"/>').join("");

    const xl = [pts[0], { d: iso(t1) }].map((p, i) =>
      '<text class="opbcAx" x="' + px(p).toFixed(1) + '" y="' + (SUP_H - 10) + '" text-anchor="' +
      (i === 0 ? "start" : "end") + '">' + md(p.d) + "</text>").join("");

    const lastP = pts[pts.length - 1];
    const firstP = pts[0];
    const delta = (key) => {
      if (!Number.isFinite(firstP[key]) || !Number.isFinite(lastP[key])) return "";
      const d = lastP[key] - firstP[key];
      return d === 0 ? " ±0" : (d > 0 ? " +" : " ") + d;
    };
    const title = lang === "ko" ? "지금 올라와 있는 매물" : "Listings on sale now";
    // 관측이 하나도 없는 판은 범례에서 뺀다 — 2026-10-14 QA: 영문판 페이지(영문 값만 넘김)에 'JP -' 가 빈 값처럼 떴다.
    const hasEd = (key) => pts.some((p) => Number.isFinite(p[key]));
    const legend = (hasEd("jp") ? '<span class="opbcLeg"><i style="background:' + JP_COLOR + '"></i>' +
      (lang === "ko" ? "일본판 " : "JP ") + (lastP.jp == null ? "-" : lastP.jp) + delta("jp") + "</span>" : "") +
      (hasEd("en") ? '<span class="opbcLeg"><i style="background:' + EN_COLOR + '"></i>' +
      (lang === "ko" ? "영문판 " : "EN ") + (lastP.en == null ? "-" : lastP.en) + delta("en") + "</span>" : "");

    return '<figure class="opbcPane opbcSupply" data-jpword="' + esc(jpWord) + '" data-enword="' + esc(enWord) + '">' +
      '<figcaption class="opbcHead"><span class="opbcLabel">' + esc(title) + "</span>" + legend +
      '<span class="opbcSpan">' + md(firstP.d) + " – " + md(lastP.d) + "</span></figcaption>" +
      '<svg viewBox="0 0 ' + W + " " + SUP_H + '" role="img" aria-label="' + esc(title) + '">' +
      holeLayer + grid + drawLine("jp", JP_COLOR) + drawLine("en", EN_COLOR) + anchors + hits +
      '<line class="opbcCross" y1="' + SUP_T + '" y2="' + (SUP_H - SUP_B) + '" stroke="#8d95a7" stroke-dasharray="3 3" opacity="0"/>' +
      '<circle class="opbcHl opbcHlJp" r="5" fill="' + JP_COLOR + '" stroke="#11141c" stroke-width="3" opacity="0"/>' +
      '<circle class="opbcHl opbcHlEn" r="5" fill="' + EN_COLOR + '" stroke="#11141c" stroke-width="3" opacity="0"/>' +
      '<g class="opbcTip" opacity="0" pointer-events="none">' +
      '<rect class="opbcTipBg" rx="7" width="150" height="58"/>' +
      '<text class="opbcTipD" x="10" y="17"></text>' +
      '<text class="opbcTipV opbcTipJp" x="10" y="35"></text>' +
      '<text class="opbcTipV opbcTipEn" x="10" y="51"></text></g>' +
      xl +
      '<rect class="opbcHit" x="' + L + '" y="' + SUP_T + '" width="' + (W - L - R) + '" height="' + (SUP_H - SUP_T - SUP_B) + '" fill="transparent"/>' +
      "</svg>" +
      (holes.length ? '<div class="opbcKey"><span><i class="kHatch"></i>' + (lang === "ko" ? "수집 없음" : "not collected") + "</span></div>" : "") +
      "</figure>";
  }

  // 선을 그릴 만큼은 아니지만 값이 있는 계열(초판처럼 몇 달에 몇 건)을 위한 카드.
  // 빈칸으로 두면 "없는 상품" 으로 읽힌다 — 실제로는 3배 비싼 별개 상품이 존재한다.
  function spotPane(rawPts, label, color, lang, note) {
    const pts = (rawPts || []).filter((p) => p && p.d && Number(p.median) > 0);
    if (!pts.length) return "";
    const last = pts[pts.length - 1];
    return '<figure class="opbcPane opbcPaneSpot">' +
      '<figcaption class="opbcHead"><span class="opbcLabel">' + esc(label) + "</span>" +
      '<span class="opbcNow" style="color:' + color + '">' + money(last.median) + "</span>" +
      '<span class="opbcSpan">' + md(last.d) + " · n=" + last.n + "</span></figcaption>" +
      '<p class="opbcEmpty">' + esc(note) + "</p></figure>";
  }

  // 그릴 만한 데이터가 있는지 — 호출부가 빈 상자를 띄우지 않도록 먼저 물어본다.
  function hasChart(series) {
    if (!series) return false;
    const m = series.monthly || {};
    return clean(series.jp).length >= MIN_POINTS || clean(series.en).length >= MIN_POINTS ||
      clean(m.jp).length >= MIN_POINTS_MONTH || clean(m.en).length >= MIN_POINTS_MONTH;
  }

  // series: {jp:[{d,median,low,high,n}], en:[...], windowDays:{jp,en}, monthly:{jp:[],en:[]}}
  // opts: {lang:"ko"|"en", title, note}
  //
  // 주간·월간 두 벌을 **둘 다 서버에서 그려** 내보내고 버튼으로 바꿔 보인다.
  // 눌렀을 때 새로 그리지 않으니 JS 가 없어도 주간은 그대로 읽히고, 전환도 즉시 끝난다.
  function chartHTML(series, opts) {
    opts = opts || {};
    const lang = opts.lang === "en" ? "en" : "ko";
    if (!hasChart(series)) return "";
    const wd = (series && series.windowDays) || {};
    const mo = (series && series.monthly) || {};

    // 표본이 얇아 못 그리는 판은 자리를 비우지 않고 왜 없는지 한 줄로 알린다.
    // 월간을 눌렀는데 한쪽 패널이 소리 없이 사라지면 "고장났나" 로 읽힌다 — 실제로는 그 세트가
    // 그 판으로 한 달에 몇 개 안 팔린다는 뜻이고, 그건 알 만한 정보다.
    //
    // ⚠️ 안내는 **실제로 데이터가 있는 탭**을 가리켜야 한다 — 2026-08-26.
    //    종전엔 무조건 "주간으로 보세요"였는데, OP-17 일본판은 주간이 1점뿐이라 그것도 비고
    //    정작 일간에는 선이 있었다. 안내를 따라갔는데 막다른 곳이면 안내가 없느니만 못하다.
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const cnt = (series && series.counts) || {};
    // 원장 집계일(through)과 오늘 중 이른 날 — 일간 점이 그 구간에 얼마나 촘촘한지(dailySparse) 잴 끝.
    const asOfMs = Math.min(Date.parse(cnt.through || today) || Infinity, Date.parse(today));
    const drawableGrain = (ed, g) => {
      const arr = g === "month" ? (mo[ed] || [])
        : g === "day" ? (((series && series.daily) || {})[ed] || [])
        : ((series && series[ed]) || []);
      const c = clean(arr, g === "day" ? MIN_N_DAY : null);
      return c.length >= (g === "month" ? MIN_POINTS_MONTH : MIN_POINTS) && !(g === "day" && dailySparse(c, asOfMs));
    };
    const grainName = (g) => (g === "day" ? (lang === "ko" ? "일간" : "the daily view")
      : g === "month" ? (lang === "ko" ? "월간" : "the monthly view")
      : (lang === "ko" ? "주간" : "the weekly view"));
    const missing = (label, g, ed) => {
      const alt = ["week", "day", "month"].find((x) => x !== g && drawableGrain(ed, x));
      const why = g === "month"
        ? (lang === "ko" ? "월간: 표본 부족" : "Monthly: too few sales")
        : g === "day"
        ? (lang === "ko" ? "일별: 하루 3건 미만" : "Daily: under 3 sales a day")
        : (lang === "ko" ? "주간: 표본 부족" : "Weekly: too few sales");
      const hint = alt
        ? (lang === "ko" ? " · " + grainName(alt) + " 보기" : " · see " + grainName(alt))
        : "";
      // 거대한 빈 상자로 두지 않는다 — "데이터가 아예 없나?"로 읽힌다(2026-08-28 소유자 지적).
      // 주간 최신값이 있으면 헤드라인으로 채워서, 이 판이 죽은 게 아니라 집계 단위만 다름을 보인다.
      const wk = clean((series && series[ed]) || []);
      const wkLast = wk.length ? wk[wk.length - 1] : null;
      const head = '<figcaption class="opbcHead"><span class="opbcLabel">' + esc(label) + "</span>" +
        (wkLast ? '<span class="opbcNow">' + money(wkLast.median) + "</span>" +
          '<span class="opbcSpan">' + (lang === "ko" ? "주간 기준 " : "weekly · ") + md(wkLast.d) + " · n=" + wkLast.n + "</span>" : "") +
        "</figcaption>";
      return '<figure class="opbcPane opbcPaneEmpty">' + head +
        '<p class="opbcEmpty">' + why + hint + "</p></figure>";
    };

    // 초판(Blue)은 시세가 2~3배라 선에서 빠져 있다. 남은 선이 재판 위주면 그렇다고 적는다 —
    // 안 적으면 어느 판본 시세를 보고 있는지 알 수 없다.
    const rp = (series && series.reprintPct) || {};
    const badgeFor = (ed) => (rp[ed] >= 60 ? (lang === "ko" ? "재판 White" : "reprint (White)") : null);

    // 공급 관측을 판본별로 갈라 각 패널에 넘긴다. 그날 기준 "지금 걸려 있는 매물 수"다.
    // 마지막으로 팔린 날. 뷰(일/주/월)와 무관하게 하나여야 한다 — 집계 단위가 사실을 바꾸지는 않는다.
    // 시리즈마다 커버 범위가 다르므로(OP-01 은 daily 가 06-13 한 점뿐, weekly 는 08-09 까지)
    // 가장 촘촘한 것이 아니라 가장 최근 것을 고른다.
    const lastSale = (() => {
      const out = {};
      for (const ed of ["jp", "en"]) {
        for (const src of [((series && series.daily) || {})[ed], series && series[ed]]) {
          const f = (src || []).filter((p) => p && p.median != null);
          if (!f.length) continue;
          const d = f[f.length - 1].d;
          if (!out[ed] || d > out[ed]) out[ed] = d;
        }
      }
      return out;
    })();
    const supRaw = (series && series.supply) || [];
    const supOf = (ed) => supRaw.map((p) => ({ d: p.d, v: p && p[ed] != null ? p[ed] : null })).filter((p) => p.v != null);
    // 판매일별 건수(거래량 막대 원천)와 등락(주간 계열 기준, 모든 탭 공통).
    // 주간 계열의 마지막 점이 28일 넘게 묵었으면 등락을 숨긴다(stale) — 홈 칩·전광판과 같은 규칙(2026-10-14 QA).
    const chgFor = (ed) => {
      const wk = clean((series && series[ed]) || []);
      const c = chgOf(wk, lang);
      if (c && Date.parse(today) - Date.parse(wk[wk.length - 1].d) > 28 * DAY) c.stale = true;
      return c;
    };
    const chg = { jp: chgFor("jp"), en: chgFor("en"), enBlue: chgFor("enBlue") };
    const optsFor = (ed, g, extra) => Object.assign({
      windowDays: g === "week" ? wd[ed] : null, today, counts: cnt[ed] || null, through: cnt.through, chg: chg[ed], asOfMs,
      // 점이 빠진 칸의 라벨 기준 = 빌더의 최소 표본(주간 6건, 초판 Blue 주간 3건, 월간 6건, 일간 3건).
      gapN: g === "day" ? MIN_N_DAY : g === "week" && ed === "enBlue" ? 3 : 6,
    }, extra || {});

    const grid = (g, jpPts, enPts, hidden) => {
      const jpLabel = lang === "ko" ? "일본판" : "Japanese";
      const enLabel = lang === "ko" ? "영문판" : "English";
      const evs = (series && series.events) || [];
      let jp = panel(jpPts, jpLabel, JP_COLOR, "opbcJp" + g, lang, g, optsFor("jp", g, { badge: badgeFor("jp"), supplyPts: supOf("jp"), lastSaleD: lastSale.jp, events: evs.filter((e) => e.ed === "jp") }));
      let en = panel(enPts, enLabel, EN_COLOR, "opbcEn" + g, lang, g, optsFor("en", g, { badge: badgeFor("en"), supplyPts: supOf("en"), lastSaleD: lastSale.en, events: evs.filter((e) => e.ed === "en") }));
      // 실제 선이 하나도 없는 단위는 탭 자체를 내지 않는다 — 2026-08-27 소유자 지적.
      // 종전엔 "왜 없는지" 안내 카드만 있는 빈 화면이 떴는데, 그건 고장으로 읽힌다.
      const realLine = !!(jp || en);
      // 한쪽 판이 소리 없이 사라지면 "고장났나" 로 읽힌다. 왜 없는지 한 줄로 알린다.
      // 기준은 단위마다 같다: 그 판의 기록이 조금이라도 있으면(=파는 세트면) 자리를 지킨다.
      // 서로 다른 기준을 쓰면 탭을 오갈 때 패널이 하나씩 생겼다 사라진다.
      //
      // 일간은 특히 그렇다 — 21세트 중 8개만 하루 3건을 넘긴다. 나머지 13개에서 탭을 통째로
      // 없애면 "이 세트만 일간이 없네" 가 되고, 세트를 옮길 때마다 탭 개수가 바뀐다.
      // 칸은 만들고 왜 못 그리는지 적는 편이 낫다.
      const hasAny = (arr) => ((arr || []).length > 0);
      if (!jp && hasAny(series && series.jp)) jp = missing(jpLabel, g, "jp");
      if (!en && hasAny(series && series.en)) en = missing(enLabel, g, "en");
      if (!jp && !en) return "";
      // 초판(Blue)은 별개 상품이라 칸을 따로 준다. 선을 그릴 만큼 쌓이면 선이, 아니면 숫자 카드가 뜬다.
      const bluePts = g === "month" ? ((series && series.monthly) || {}).enBlue
        : g === "day" ? ((series && series.daily) || {}).enBlue
        : (series && series.enBlue);
      const blueLabel = lang === "ko" ? "영문판 초판 Blue" : "English 1st print (Blue)";
      let blue = panel(bluePts, blueLabel, BLUE_COLOR, "opbcBlue" + g, lang, g, optsFor("enBlue", g));
      if (!realLine && !blue) return "";
      if (!blue) {
        blue = spotPane(bluePts, blueLabel, BLUE_COLOR, lang, lang === "ko"
          ? "거래가 드물어 선을 그리지 못합니다 — 최근 실거래 값입니다."
          : "Too few sales to plot a line — this is the latest completed sale level.");
      }
      return '<div class="opbcGridWrap" data-grain="' + g + '"' + (hidden ? " hidden" : "") + ">" + jp + en + blue + "</div>";
    };

    const da = (series && series.daily) || {};
    const week = grid("week", series && series.jp, series && series.en, false);
    const month = grid("month", mo.jp, mo.en, true);
    const day = grid("day", da.jp, da.en, true);
    // 눌러도 아무것도 안 뜨는 버튼은 만들지 않는다 — 그릴 게 있는 단위만 탭으로 낸다.
    const tabDefs = [
      day ? ["day", lang === "ko" ? "일간" : "Daily"] : null,
      ["week", lang === "ko" ? "주간" : "Weekly"],
      month ? ["month", lang === "ko" ? "월간" : "Monthly"] : null,
    ].filter(Boolean);
    const tabs = tabDefs.length > 1
      ? '<div class="opbcTabs" role="group" aria-label="' + (lang === "ko" ? "집계 단위" : "Time grain") + '">' +
        tabDefs.map(([g, label]) =>
          '<button type="button" class="opbcTab' + (g === "week" ? " on" : "") + '" data-grain="' + g +
          '" aria-pressed="' + (g === "week" ? "true" : "false") + '">' + label + "</button>").join("") + "</div>"
      : "";

    // 3초 안에 읽혀야 하는 것: 두 판이 지금 얼마이고 몇 배 차이인가.
    // 패널이 위아래로 떨어져 있어 스크롤하지 않으면 비교가 안 된다 — 맨 위에 숫자로 못박는다.
    const lastOf = (arr) => { const c = clean(arr); return c.length ? c[c.length - 1].median : null; };
    // "지금 값"·배수는 current(28일 규칙)가 있으면 그것만 — 2026-10-14 QA: 98일 전 일본판 값으로 "English 3.8x" 를 냈다(표는 "—").
    //   current 를 싣지 않은 호출(옛 데이터)만 마지막 점을 쓴다. 각 판 패널의 선·날짜 표시는 그대로(시계열).
    const cur = series && series.current;
    const nowOf = (ed) => (cur ? (cur[ed] && cur[ed].median) || null : lastOf(series && series[ed]));
    const jpNow = nowOf("jp"), enNow = nowOf("en");
    let compare = "";
    if (jpNow && enNow) {
      const times = (Math.max(jpNow, enNow) / Math.min(jpNow, enNow)).toFixed(1).replace(/\.0$/, "");
      const dearer = enNow >= jpNow ? (lang === "ko" ? "영문판" : "English") : (lang === "ko" ? "일본판" : "Japanese");
      compare = '<div class="opbcCompare">' +
        '<span class="opbcCmp"><i style="background:' + JP_COLOR + '"></i>' +
        (lang === "ko" ? "일본판" : "Japanese") + " <b>" + money(jpNow) + "</b></span>" +
        '<span class="opbcCmp"><i style="background:' + EN_COLOR + '"></i>' +
        (lang === "ko" ? "영문판" : "English") + " <b>" + money(enNow) + "</b></span>" +
        '<span class="opbcCmpX">' + (lang === "ko" ? dearer + "이 " + times + "배" : dearer + " " + times + "x") + "</span>" +
        "</div>";
    }

    const head = opts.title || tabs
      ? '<div class="opbcTop">' + (opts.title ? '<div class="opbcTitle">' + esc(opts.title) + "</div>" : "<span></span>") + tabs + "</div>"
      : "";
    // 2026-10-15 소유자 결정: 설명 문장 대신 라벨만(선 정의·빗금 뜻·매물 수 정의는 한 토막 라벨로 남긴다).
    const note = opts.note === false ? "" : '<p class="opbcNote">' + (lang === "ko"
      ? "<b>선</b> = 이베이 실거래(sold) 중앙값 · 판매일 기준 · 빗금 = 표본 부족"
      : "<b>Line</b> = median of completed eBay sales · by sale date · hatched = thin sample")
      + "</p>";
    // 공급은 집계 단위(주간·월간)와 무관하다 — 매일 세는 "지금 몇 개"라서 탭 밖에 둔다.
    const supply = supplyPanel(series && series.supply, lang, today);
    // 고지는 패널 **위**에 둔다. 아래 두면 다 보고 나서야 "이건 팔린 개수가 아니다"를 읽게 된다.
    const supNote = supply ? '<p class="opbcNote opbcSupNote">' + (lang === "ko"
      ? "<b>현재 매물 수</b> (판매 수 아님)"
      : "<b>Listings on sale now</b> (not units sold)") + "</p>" : "";
    const supWrap = supply ? '<div class="opbcGridWrap opbcSupWrap">' + supNote + supply + "</div>" : "";
    return '<div class="opbcWrap">' + head + compare + day + week + month + note + supWrap + "</div>";
  }

  const CSS = [
    ".opbcWrap{margin:16px 0 4px}",
    ".opbcTop{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:760px;margin:0 0 10px}",
    ".opbcTitle{font-size:12px;font-weight:700;color:var(--muted,#8d95a7);letter-spacing:.02em}",
    ".opbcCompare{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;max-width:760px;margin:0 0 12px;padding:12px 16px;border:1px solid var(--line,#242936);border-radius:12px;background:var(--paper,#11141c)}",
    ".opbcCmp{display:inline-flex;align-items:baseline;gap:7px;font-size:14px;color:var(--muted,#8d95a7)}",
    ".opbcCmp i{width:9px;height:9px;border-radius:2px;display:inline-block;align-self:center}",
    ".opbcCmp b{font-size:20px;font-weight:800;letter-spacing:-.02em;color:var(--ink,#eef2ff);font-variant-numeric:tabular-nums}",
    ".opbcCmpX{margin-left:auto;font-size:14px;font-weight:800;color:var(--ink,#eef2ff);font-variant-numeric:tabular-nums}",
    ".opbcCmpAlt{flex-basis:100%;padding-top:9px;border-top:1px solid var(--line,#242936);font-size:12px}",
    ".opbcCmpAlt b{font-size:16px}",
    ".opbcCmpAlt small{color:var(--muted,#8d95a7);font-size:11.5px;margin-left:5px}",
    ".opbcBadge{font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,.07);color:var(--muted,#8d95a7);white-space:nowrap}",
    ".opbcTabs{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line,#242936);border-radius:9px;background:var(--paper,#11141c)}",
    ".opbcTab{appearance:none;border:0;background:transparent;color:var(--muted,#8d95a7);font:inherit;font-size:12px;font-weight:700;padding:5px 12px;border-radius:7px;cursor:pointer}",
    ".opbcTab:hover{color:var(--ink,#eef2ff)}",
    ".opbcTab.on{background:rgba(59,200,223,.14);color:#3bc8df}",
    ".opbcTab:focus-visible{outline:2px solid #3bc8df;outline-offset:1px}",
    // 두 칸으로 나누지 않는다. 본문 폭이 800px 남짓이라 반으로 쪼개면 차트가 눌려
    // 세로 움직임이 안 보인다(2026-08-13 실측). 세로로 쌓으면 각 차트가 본문 폭을 다 쓴다.
    // 폭 상한을 두는 이유: SVG 가 viewBox 비율을 지키느라 폭이 넓어질수록 세로도 같이 커진다.
    // 홈(본문 1100px 남짓)에서는 차트 하나가 화면을 통째로 덮었다. 상한을 걸면 세트 페이지와 크기도 같아진다.
    ".opbcGridWrap{display:grid;gap:14px;max-width:760px}",
    // 넓은 화면에서는 일본판·영문판을 나란히 둔다 — 2026-08-27.
    // 세로로만 쌓으면 세트 페이지에서 차트 구역만 1,425px(2화면)가 되고, 두 판을 비교하려면
    // 스크롤해야 한다. 2026-08-13 에 좌우 배치를 접었던 이유는 본문이 800px 남짓이라
    // 반으로 쪼개면 한 칸이 380px 로 눌려서였다 — 그건 지금도 맞다.
    // 그래서 폭이 실제로 남을 때만(뷰포트 1240px+) 차트 구역을 본문 밖으로 넓혀
    // 한 칸을 590px 로 만든다. 그 아래에서는 예전 그대로 세로로 쌓인다.
    // 폭은 CSS 로 정하지 않는다 — 컨테이너가 좌측정렬(세트 페이지)인지 가운데정렬(ko·홈)인지에
    // 따라 100vw 계산식이 오른쪽으로 넘쳐 영문판 패널이 잘렸다(2026-08-27 실사고, ko 페이지).
    // sizeWraps() JS 가 각 wrap 의 실제 left 를 재서 뷰포트 안에 들어가는 폭만 준다.
    // [data-grain] 한정 — 공급 패널 구역(opbcSupWrap)까지 2열로 가르면 안내문이 왼쪽 칸,
    // 그래프가 오른쪽 칸이 되어 왼쪽 아래가 통째로 빈다(2026-08-28 소유자 발견).
    // 2026-08-28 최종형: 본문 컨테이너를 넓혔으므로(홈 1520·bodyPage 1320 @1240+)
    // 2열 여부는 순수 미디어쿼리로 정한다. JS 측정(opbcWide 토글)은 렌더 타이밍에 따라
    // 실배포에서 네 번 무력화됐다 — 측정 기반 방식 재도입 금지.
    "@media (min-width:1240px){.opbcGridWrap[data-grain]{max-width:none;grid-template-columns:repeat(2,minmax(0,1fr))}}",
    // display:grid 가 브라우저 기본 [hidden]{display:none} 을 이겨서, 숨겼는데 그대로 보였다(2026-08-13).
    ".opbcGridWrap[hidden]{display:none}",
    ".opbcPane{container:boxplot / inline-size;margin:0;border:1px solid var(--line,#242936);border-radius:14px;background:var(--paper,#11141c);padding:14px 16px 8px;min-width:0}",
    ".opbcHead{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}",
    ".opbcLabel{font-size:12px;font-weight:700;color:var(--muted,#8d95a7)}",
    ".opbcNow{font-size:28px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink,#eef2ff)}",
    ".opbcChg{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}",
    ".opbcChg.up{color:#00e5a0}.opbcChg.dn{color:#ff5f6e}.opbcChg.flat{color:var(--muted,#8d95a7)}",
    ".opbcChgTag{font-size:11.5px;font-weight:700;color:var(--muted,#8d95a7);margin-left:2px}",
    ".opbcSpan{margin-left:auto;font-size:11.5px;color:var(--muted,#8d95a7);font-variant-numeric:tabular-nums}",
    ".opbcSupWrap{margin-top:16px}",
    ".opbcSupNote{margin:0 0 8px}",
    ".opbcLeg{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:var(--ink,#eef2ff);font-variant-numeric:tabular-nums}",
    ".opbcLeg i{width:9px;height:9px;border-radius:2px;display:inline-block}",
    ".opbcPane svg{width:100%;height:auto;display:block;margin-top:4px;touch-action:pan-y}",
    ".opbcPane svg:focus-visible{outline:2px solid #3bc8df;outline-offset:3px;border-radius:4px}",
    ".opbcReadout{min-height:3.4em;margin:8px 0 0;color:var(--muted,#8d95a7);font-size:13px;line-height:1.7;font-variant-numeric:tabular-nums}",
    ".opbcGrid{stroke:rgba(255,255,255,.055);stroke-width:1}",
    ".opbcAx{fill:var(--muted,#8d95a7);font-size:11px;font-variant-numeric:tabular-nums}",
    ".opbcFlagTx{font-size:12px;font-weight:800}",
    ".opbcEvt{stroke:rgba(255,255,255,.28);stroke-width:1;stroke-dasharray:2 3}",
    ".opbcEvtTx{fill:#b6c0d4;font-weight:700}",
    ".opbcLine{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}",
    ".opbcDot{stroke:var(--paper,#11141c);stroke-width:1.6}",
    // 진입 모션(2026-09-23). 데이터와 무관한 시각 효과. .opbcIn 은 아래 scrub() 의 IntersectionObserver 가 붙인다 —
    // 화면 밖에서 먼저 그려지고 끝나 버리면 아무도 못 본다. JS 없이도 그림은 완성 상태로 보인다.
    "@media (prefers-reduced-motion:no-preference){",
    ".opbcPane.opbcIn .opbcDraw{stroke-dasharray:1;stroke-dashoffset:1;animation:opbcDraw 1.1s cubic-bezier(.4,0,.2,1) forwards}",
    ".opbcPane.opbcIn .opbcArea{opacity:0;animation:opbcFade .8s ease-out .5s forwards}",
    ".opbcPane.opbcIn .opbcBar{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0);animation:opbcGrow .6s cubic-bezier(.2,.7,.2,1) .15s forwards}",
    ".opbcPane.opbcIn .opbcPulse{transform-box:fill-box;transform-origin:center;animation:opbcPulse 2.8s ease-out 1.2s infinite}",
    "@keyframes opbcDraw{to{stroke-dashoffset:0}}",
    "@keyframes opbcFade{to{opacity:1}}",
    "@keyframes opbcGrow{to{transform:scaleY(1)}}",
    "@keyframes opbcPulse{0%{transform:scale(1);opacity:.18}65%{transform:scale(2.1);opacity:0}100%{transform:scale(2.1);opacity:0}}",
    "}",
    // 공급선: 색은 인라인(JP/EN 각자)이 정한다 — CSS 에 stroke 를 두면 둘 다 같은 회색이 된다(2026-09-24 수정).
    ".opbcSupLine{fill:none;stroke-width:1.8;stroke-dasharray:5 3;stroke-linejoin:round}",
    ".opbcStale{}",
    ".opbcStaleEdge{stroke:rgba(245,200,66,.75);stroke-width:1.5;stroke-dasharray:4 3}",
    ".opbcStaleCarry{stroke-width:2;stroke-dasharray:2 5;stroke-linecap:round;opacity:.65}",
    ".opbcStaleEnd{fill:#0a0f14;stroke-width:2;opacity:.75}",
    // 빗금 안 글자는 패널 폭에 따라 키운다(아래 @container) — 렌더 11.5px 이상(2026-10-14 QA: 1366 에서 9.2·7.9px 였다).
    ".opbcStaleTx{fill:#f5c842;font-size:11px;font-weight:800}",
    ".opbcStaleSub{fill:rgba(245,200,66,.7);font-size:11px;font-weight:600}",
    // 마지막 점이 28일 넘게 묵은 헤드라인 — 홈 칩(.packTrend.stale)·전광판과 같은 표시: 흐리게 + 금색 'MM/DD'(2026-10-14 QA).
    ".opbcNowStale{opacity:.55}",
    ".opbcAsOf{font-size:11.5px;font-weight:700;color:var(--gold,#f5c842);font-variant-numeric:tabular-nums}",
    ".opbcStaleBadge{margin-left:8px;padding:3px 9px;border-radius:20px;background:rgba(245,200,66,.18);border:1px solid rgba(245,200,66,.45);color:#f5c842;font-size:11.5px;font-weight:800;white-space:nowrap}",
    ".opbcKey{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 0;padding:0 4px;font-size:11.5px;color:var(--muted,#8d95a7)}",
    ".opbcKey span{display:inline-flex;align-items:center;gap:5px}",
    ".opbcKey i{display:inline-block;width:12px;height:2px;border-radius:1px}",
    // 거래량 막대는 중립색 하나(2026-10-14) — 상승·하락 색은 1% 미만 잡음에도 바뀌었다. 가격선 색 규칙은 그대로.
    ".opbcKey .kBar{width:8px;height:8px;border-radius:1px;background:var(--muted,#8d95a7);opacity:.6}",
    ".opbcKey .kPart{background:transparent;border:1px solid var(--muted,#8d95a7);box-sizing:border-box;opacity:1}",
    // 색은 styles.css 토큰(--gold-rgb·--muted) — 2026-10-14 QA.
    ".opbcKey .kHatch{width:12px;height:9px;background:repeating-linear-gradient(45deg,rgba(var(--gold-rgb,245,200,66),.42) 0 1.6px,rgba(var(--gold-rgb,245,200,66),.08) 1.6px 5px)}",
    ".opbcKey .kFmt{width:0;height:10px;border-left:1px dashed var(--muted,#8d95a7);border-radius:0}",
    ".opbcBar{fill:var(--muted,#8d95a7);fill-opacity:.5}",
    ".opbcBar0{fill-opacity:.8}",
    ".opbcBarPart{fill:none;stroke:var(--muted,#8d95a7);stroke-width:1.2;stroke-opacity:.9}",
    ".opbcBarN{font-weight:700}",
    ".opbcFmt{stroke:var(--muted,#8d95a7);stroke-opacity:.8;stroke-width:1.2;stroke-dasharray:2 3}",
    ".opbcHitDot{cursor:pointer}.opbcHit{cursor:crosshair}",
    ".opbcTipBg{fill:#151a22;stroke:rgba(255,255,255,.16)}",
    ".opbcTipD{fill:var(--muted,#8d95a7);font-size:11px;font-variant-numeric:tabular-nums}",
    ".opbcTipV{fill:var(--ink,#eef2ff);font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}",
    ".opbcTipR{fill:var(--muted,#8d95a7);font-size:11px;font-variant-numeric:tabular-nums}",
    // 2열 격자에서 빈 칸이 옆 차트 높이까지 늘어나면 거대한 빈 상자가 된다(2026-10-01 OP-13 일간 소유자 지적) —
    // 안내 카드는 제 높이만 차지한다.
    ".opbcPaneEmpty{display:flex;flex-direction:column;justify-content:center;min-height:96px;padding:14px 16px;align-self:start}",
    ".opbcPaneSpot{padding:14px 16px}",
    ".opbcPaneSpot .opbcEmpty{margin-top:8px}",
    ".opbcEmpty{margin:6px 0 0;font-size:12px;color:var(--muted,#8d95a7)}",
    ".opbcNote{font-size:12px;color:var(--muted,#8d95a7);line-height:1.7;margin:10px 0 0}",
    ".opbcNote b{color:var(--ink,#eef2ff);font-weight:700}",
    // SVG text scales with its panel, not the viewport. Container breakpoints keep
    // axes >=12 CSS px across phone, tablet and the desktop two-column layout.
    "@container boxplot (max-width:760px){.opbcAx,.opbcFlagTx{font-size:16px}.opbcStaleTx,.opbcStaleSub{font-size:15px}}",
    "@container boxplot (max-width:560px){.opbcAx,.opbcFlagTx{font-size:20px}.opbcStaleTx,.opbcStaleSub{font-size:18px}}",
    "@container boxplot (max-width:440px){.opbcAx,.opbcFlagTx{font-size:24px}.opbcExtrema,.opbcStaleTx,.opbcStaleSub,.opbcEvtTx,.opbcTip,.opbcDateTag{display:none}.opbcFlag rect{height:36px;transform:translateY(-7px)}}",
    "@container boxplot (max-width:360px){.opbcAx,.opbcFlagTx{font-size:30px}}",
    "@container boxplot (max-width:280px){.opbcAx,.opbcFlagTx{font-size:38px}.opbcFlag rect{height:44px;transform:translateY(-11px)}}",
    "@media (max-width:600px){",
    ".opbcTab{min-height:44px;padding:11px 14px;font-size:13px}",
    ".opbcTabs{gap:4px}",
    "}",
  ].join("");

  /** Add a screen-sized readout and keyboard access without changing plotted values. */
  function bindChartReadout(pane, svg, dots, at) {
    const ko = document.documentElement.lang === "ko";
    const readout = document.createElement("p");
    readout.className = "opbcReadout";
    readout.textContent = ko ? "그래프를 누르거나 방향키 ← → 로 날짜별 값을 확인하세요." : "Touch the chart or use ← → keys to inspect each date.";
    pane.appendChild(readout);
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-label", (svg.getAttribute("aria-label") || "") + (ko ? ". 방향키로 날짜 이동" : ". Arrow keys move between dates"));
    let selected = dots.length - 1;
    const show = () => {
      const rect = svg.getBoundingClientRect();
      at(rect.left + Number(dots[selected].getAttribute("cx")) / W * rect.width);
    };
    svg.addEventListener("focus", show);
    svg.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      selected = event.key === "Home" ? 0 : event.key === "End" ? dots.length - 1
        : Math.max(0, Math.min(dots.length - 1, selected + (event.key === "ArrowLeft" ? -1 : 1)));
      readout.setAttribute("aria-live", "polite");
      show();
    });
    return (index, text) => {
      selected = index;
      // Pointer movement must not flood screen-reader announcements.
      if (document.activeElement !== svg) readout.removeAttribute("aria-live");
      readout.textContent = text;
    };
  }

  // 마우스/터치로 훑을 때 값을 띄우는 향상 기능. 정적 세트 페이지도 이 파일을 <script> 로 불러
  // 같은 코드를 쓴다 — 페이지마다 문자열로 박아 넣으면 두 벌이 되어 언젠가 갈라진다.
  // 서버가 이미 SVG 를 다 그려 보내므로, 이게 안 돌아도 그래프와 숫자는 그대로 읽힌다.
  function bindPane(pane) {
    if (pane.__opbcBound) return;
    pane.__opbcBound = 1;
    const svg = pane.querySelector("svg");
    if (!svg) return;
    const hit = svg.querySelector(".opbcHit"), cross = svg.querySelector(".opbcCross"), hl = svg.querySelector(".opbcHl");
    const tip = svg.querySelector(".opbcTip"), tipD = svg.querySelector(".opbcTipD"), tipV = svg.querySelector(".opbcTipV");
    const tipR = svg.querySelector(".opbcTipR");
    const dtag = svg.querySelector(".opbcDateTag");
    const dots = [].slice.call(svg.querySelectorAll(".opbcDot"));
    const hitDots = [].slice.call(svg.querySelectorAll(".opbcHitDot"));
    // 거래량 막대(달력 칸)는 가격 점과 위치가 다르다 — 스냅된 가격 점의 날짜가 든 칸의 건수를 판독 줄 끝에 따로 붙인다.
    const volBars = [].slice.call(svg.querySelectorAll(".opbcBar[data-l]"));
    if (!hit || !dots.length) return;
    const updateReadout = bindChartReadout(pane, svg, dots, at);

    function at(clientX) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      let best = 0, bd = Infinity;
      dots.forEach((d, i) => { const dd = Math.abs(+d.getAttribute("cx") - x); if (dd < bd) { bd = dd; best = i; } });
      const d = dots[best], cx = +d.getAttribute("cx"), cy = +d.getAttribute("cy");
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", ".5");
      hl.setAttribute("cx", cx); hl.setAttribute("cy", cy); hl.setAttribute("opacity", "1");
      // 헤드라인(현재가)은 건드리지 않는다 — 훑을 때마다 바뀌면 "지금 얼마"를 잃는다.
      const hd = hitDots[best] ? hitDots[best].dataset : {};
      // 판독 줄의 건수는 스냅된 가격 점의 날짜가 든 칸(s ≤ d < e)에서 — 2026-10-14 QA: 손가락 x 에 가장 가까운 막대를 따로 골라
      // '2026-10-04 · $1,143 … · Sales 10/13: 0 sales' 처럼 한 줄에 다른 날짜가 붙었다. 그 날짜가 든 칸이 없으면 건수를 붙이지 않는다.
      const vb = hd.t ? volBars.find((b) => b.getAttribute("data-s") <= hd.t && hd.t < b.getAttribute("data-e")) || null : null;
      updateReadout(best, [hd.d, hd.v, hd.n, hd.r, vb ? vb.getAttribute("data-l") : ""].filter(Boolean).join(" · "));
      // 툴팁 폭은 CSS 가 정한다(폰에서 216) — 186 고정이면 폰에서 상자가 오른쪽으로 삐져나갔다(2026-09-24)
      const tw = parseFloat(getComputedStyle(svg.querySelector(".opbcTipBg")).width) || 186, tx = Math.min(Math.max(cx - tw / 2, 4), W - tw - 4);
      const ty = cy - 74 < T ? cy + 14 : cy - 74;
      tip.setAttribute("opacity", "1");
      tip.setAttribute("transform", "translate(" + tx + "," + ty + ")");
      tipD.textContent = (hd.d || "") + (hd.n ? " · " + hd.n : "");
      tipV.textContent = hd.v || "";
      if (tipR) tipR.textContent = hd.r || "";
      if (dtag) {
        dtag.setAttribute("transform", "translate(" + Math.min(Math.max(cx - 23, 2), W - 48) + "," + (H - B + 3) + ")");
        dtag.setAttribute("opacity", "1");
        dtag.querySelector("text").textContent = hd.x || (hd.d || "").slice(5);
      }
    }
    const off = () => {
      cross.setAttribute("opacity", "0"); hl.setAttribute("opacity", "0"); tip.setAttribute("opacity", "0");
      if (dtag) dtag.setAttribute("opacity", "0");
    };
    hit.addEventListener("pointerdown", (e) => { try { hit.setPointerCapture(e.pointerId); } catch (_) { /* 캡처 못 해도 값은 뜬다 */ } at(e.clientX); });
    hit.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) at(e.clientX); });
    hit.addEventListener("pointerleave", off);
    hit.addEventListener("pointercancel", off);
  }

  // 공급 패널은 선이 둘이라 값도 둘이다. 가격 패널과 이벤트 처리는 같지만
  // 하이라이트와 툴팁 줄이 판마다 하나씩 붙는다.
  function bindSupply(pane) {
    if (pane.__opbcBound) return;
    pane.__opbcBound = 1;
    const svg = pane.querySelector("svg");
    if (!svg) return;
    const hit = svg.querySelector(".opbcHit"), cross = svg.querySelector(".opbcCross");
    const hlJp = svg.querySelector(".opbcHlJp"), hlEn = svg.querySelector(".opbcHlEn");
    const tip = svg.querySelector(".opbcTip"), tipD = svg.querySelector(".opbcTipD");
    const tipJp = svg.querySelector(".opbcTipJp"), tipEn = svg.querySelector(".opbcTipEn");
    const dots = [].slice.call(svg.querySelectorAll(".opbcSupDot"));
    if (!hit || !dots.length) return;
    const jpWord = pane.dataset.jpword || "JP", enWord = pane.dataset.enword || "EN";
    const updateReadout = bindChartReadout(pane, svg, dots, at);

    function at(clientX) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      let best = 0, bd = Infinity;
      dots.forEach((d, i) => { const dd = Math.abs(+d.getAttribute("cx") - x); if (dd < bd) { bd = dd; best = i; } });
      const d = dots[best], cx = +d.getAttribute("cx");
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", ".45");
      const put = (el, y) => {
        if (y === "") { el.setAttribute("opacity", "0"); return; }
        el.setAttribute("cx", cx); el.setAttribute("cy", y); el.setAttribute("opacity", "1");
      };
      put(hlJp, d.dataset.jpy); put(hlEn, d.dataset.eny);
      tipD.textContent = d.dataset.d;
      tipJp.textContent = d.dataset.jp === "" ? jpWord + " -" : jpWord + " " + d.dataset.jp;
      tipEn.textContent = d.dataset.en === "" ? enWord + " -" : enWord + " " + d.dataset.en;
      updateReadout(best, [d.dataset.d, tipJp.textContent, tipEn.textContent].join(" · "));
      const tw = 150, tx = Math.min(Math.max(cx - tw / 2, 4), W - tw - 4);
      tip.setAttribute("opacity", "1");
      tip.setAttribute("transform", "translate(" + tx + "," + (SUP_T + 4) + ")");
    }
    const off = () => {
      cross.setAttribute("opacity", "0"); hlJp.setAttribute("opacity", "0");
      hlEn.setAttribute("opacity", "0"); tip.setAttribute("opacity", "0");
    };
    hit.addEventListener("pointerdown", (e) => { try { hit.setPointerCapture(e.pointerId); } catch (_) { /* 캡처 못 해도 값은 뜬다 */ } at(e.clientX); });
    hit.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) at(e.clientX); });
    hit.addEventListener("pointerleave", off);
    hit.addEventListener("pointercancel", off);
  }

  // 이미 걸린 패널은 건너뛰므로 몇 번을 불러도 안전하다(홈은 세트를 열 때마다 다시 부른다).
  function bindTabs(wrap) {
    if (wrap.__opbcTabs) return;
    wrap.__opbcTabs = 1;
    const tabs = [].slice.call(wrap.querySelectorAll(".opbcTab"));
    // data-grain 이 있는 격자만 탭 대상이다. 매물 패널도 레이아웃 때문에 .opbcGridWrap 을 쓰는데,
    // 그것까지 잡으면 탭을 누르는 순간 매물 그래프가 숨겨진다(2026-08-13 실측 — 일간 탭 추가하며 드러남).
    const grids = [].slice.call(wrap.querySelectorAll(".opbcGridWrap[data-grain]"));
    if (!tabs.length || grids.length < 2) return;
    tabs.forEach((btn) => btn.addEventListener("click", () => {
      const g = btn.dataset.grain;
      tabs.forEach((b) => { const on = b === btn; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      grids.forEach((gr) => { gr.hidden = gr.dataset.grain !== g; });
      // 숨어 있던 쪽은 아직 훑기 이벤트가 안 걸렸을 수 있다.
      [].slice.call(wrap.querySelectorAll(".opbcPane")).forEach(bindPane);
    }));
  }

  // 2열 배치는 순수 CSS 미디어쿼리가 담당한다(위 CSS 참조). JS 측정·마진 조작 방식은
  // 렌더 타이밍에 따라 실배포에서 네 번 무력화됐다 — 재도입 금지. 여기서는 과거 버전이
  // 남긴 인라인 스타일만 청소한다(캐시된 옛 JS 가 심은 width/marginLeft 잔재 방어).
  function sizeWraps(scope) {
    [].slice.call(scope.querySelectorAll(".opbcWrap")).forEach((wrap) => {
      wrap.style.width = "";
      wrap.style.marginLeft = "";
      wrap.classList.remove("opbcWide");
    });
  }

  function scrub(root) {
    const scope = root && root.querySelectorAll ? root : (typeof document !== "undefined" ? document : null);
    if (!scope) return;
    [].slice.call(scope.querySelectorAll(".opbcPane")).forEach((p) => {
      if (p.classList.contains("opbcSupply")) bindSupply(p); else bindPane(p);
    });
    [].slice.call(scope.querySelectorAll(".opbcWrap")).forEach(bindTabs);
    sizeWraps(scope);
    reveal(scope);
  }

  // 진입 모션 트리거. 패널이 1/4 이상 보일 때 .opbcIn 을 붙이고 관찰을 끝낸다.
  // 홈에서 세트를 바꾸면 패널이 새로 만들어져 다시 그려진다 — "값이 바뀌었다"는 신호가 된다.
  let io = null;
  function reveal(scope) {
    const panes = [].slice.call(scope.querySelectorAll(".opbcPane:not(.opbcIn)"));
    if (!panes.length) return;
    if (typeof IntersectionObserver === "undefined") { panes.forEach((p) => p.classList.add("opbcIn")); return; }
    if (!io) io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("opbcIn"); io.unobserve(e.target); } });
    }, { threshold: 0.25 });
    panes.forEach((p) => io.observe(p));
  }

  // 브라우저에서 이 파일을 읽으면 스타일도 스스로 넣는다.
  // styles.css 에 복사해 두면 두 벌이 되어 언젠가 갈라진다 — 규칙은 이 파일에만 둔다.
  if (typeof document !== "undefined" && !document.getElementById("opBoxChartCss")) {
    const st = document.createElement("style");
    st.id = "opBoxChartCss";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => scrub());
    else scrub();
    if (typeof window !== "undefined") window.OPBoxChartScrub = scrub;
  }

  return { chartHTML, hasChart, CSS, scrub, MIN_N, MIN_POINTS, clean, niceTicks, smoothPath };
});
