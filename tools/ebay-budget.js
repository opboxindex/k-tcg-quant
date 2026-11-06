// eBay 하루 호출량(5,000건) 배분 — 2026-09-02 신설, 2026-09-03 리셋 창 기준으로 재정렬.
//
// ── 실측으로 확정된 사실 (2026-09-03)
// · 쿼터 창은 UTC 자정이 아니라 **07:00 UTC(한국 16:00)** 에 리셋된다 — analytics 응답의 reset 값.
//   종전 코드는 자정 기준으로 "오늘 남은 실행"을 세어 7시간 어긋났고, 창 끝(00~07 UTC)에
//   스냅샷·검색이 굶어 8/29·8/30·9/1 스냅샷과 9/2·9/3 원피스 감시목록이 비었다.
// · getItems(벌크 20건 조회)는 이 앱 권한으로 403 — 지름길이 없다. 정산은 1건 = 1콜.
// · 창 하나(5,000)로 원피스 전량(정산 ~1,900 + 검색)과 TCG 13종 × 250(정산 3,250)을 다 할 수 없다.
//   그래서 **순서**가 규칙이다(소유자: 이 사이트의 주제는 원피스, TCG 는 남는 만큼 최대로):
//     ① 원피스 검색 — 감시목록에 없으면 그 경매는 영원히 못 읽는다. 가장 싸고(회차 ~50콜) 가장 급하다.
//     ② 원피스 정산 — 종료 후 30시간 안에 읽어야 한다.
//     ③ TCG 스냅샷 — 하루 한 점, 그 순간에만 존재하는 값. UTC 자정 직후(00:18) 찍는다 — 창의 끝(리셋 7시간 전)이라
//        그 뒤 순서(④ TCG 정산·여유분·드레인)가 그 몫(reserveFor "tcgSnapshot", ~124콜)을 남긴다(2026-10-14).
//        ①·② 원피스 검색·정산은 앞 순서라 이 몫을 남기지 않는다.
//     ④ TCG 정산 — 남는 쿼터 전부. 단, 이 창에서 끝나는 원피스 건수만큼은 남겨 둔다.
//
// ⚠️ 잔여량은 eBay 가 알려주는 실제 값을 쓴다. 우리가 센 횟수로 추정하면 다른 워크플로가
//    쓴 몫을 놓쳐 429 를 맞는다(2026-09-02 에 실제로 맞았다).
const fs = require("fs");
const path = require("path");
const { TCG_SCHEDULE_UTC, TCG_SNAPSHOT_RESERVE } = require("./tcg-config");

const ROOT = path.join(__dirname, "..");
const HOUR = 3600000;

// 쿼터 창이 리셋되는 UTC 시각. analytics 응답의 reset 을 우선 쓰고, 못 읽었을 때만 이 값으로 계산한다.
const RESET_UTC_HOUR = 7;

function loadEnv(p) {
  const out = {};
  try {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}
const env = { ...loadEnv(path.join(ROOT, ".env")), ...process.env };

async function token() {
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("토큰 발급 실패");
  return j.access_token;
}

/** 다음 리셋 시각(ms). API 가 reset 을 안 주면 07:00 UTC 규칙으로 계산한다. */
function nextReset(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_UTC_HOUR);
  return today > nowMs ? today : today + 24 * HOUR;
}

// Browse API 의 남은 호출 수와 리셋 시각. 못 읽으면 remaining null — 부르는 쪽이 보수적으로 굴어야 한다.
async function quota() {
  try {
    const tok = await token();
    const r = await fetch("https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=Browse&api_context=buy", {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) return { remaining: null, limit: null, reset: null };
    const j = await r.json();
    for (const a of j.rateLimits || []) {
      for (const res of a.resources || []) {
        // 정산·검색이 쓰는 버킷은 buy.browse 다. buy.browse.item.bulk 는 권한이 없어 못 쓴다(403).
        if (res.name && res.name !== "buy.browse") continue;
        for (const r2 of res.rates || []) {
          if (Number.isFinite(r2.remaining)) {
            const reset = r2.reset ? Date.parse(r2.reset) : NaN;
            return { remaining: r2.remaining, limit: r2.limit ?? null, reset: Number.isFinite(reset) ? reset : null };
          }
        }
      }
    }
  } catch {}
  return { remaining: null, limit: null, reset: null };
}

async function remaining() {
  return (await quota()).remaining;
}

// 한 회차가 실제로 쓰는 양(실측). 예약은 **다음 1회분만** 잡는다 — 2026-09-03.
// "남은 모든 회차분"을 예약하면 창 뒷부분에서 예약이 잔여를 넘어 정산 가용이 0 이 된다
// (실측 사고: 잔여 1,660 · 예약 1,900 → 326건 대기인데 0건 처리).
const PER_RUN = {
  tcg: 300,       // TCG 정산 한 회차 — 원피스가 예약해 두는 최소 몫(TCG 가 완전히 굶지 않게)
  search: 80,     // 원피스 검색 보충(--topup) 한 회차. 실측 2026-09-03: 종료 임박 정렬 10쿼리 ≈ 50콜
  safety: 200,    // 재시도·돌발 워크플로 — 줄이지 않는다
  // 진행 매물 하루 1회 갱신(update-active-listings, 18 UTC 예약·지연 흔함) 한 회차 전체:
  //   PSA10 링크 카드 207장 × (검색 1~3 + getItem 1) ≈ 500 + 박스 호가 JP/EN + 매물 수 + 특가 검색 ≈ 200.
  // 예약이 없어서 TCG 보충이 잔여를 다 쓴 날 429 로 죽었다(2026-09-07 20:51 UTC 실제). 이 창에서 아직 안 돌았으면 남긴다.
  active: 800,
  // TCG 스냅샷 한 번(13게임 × 8콜 + 여유) — 이 창 안의 UTC 자정 뒤 점이 아직 없을 때만 남긴다(reserveFor).
  tcgSnapshot: TCG_SNAPSHOT_RESERVE,
};

// 각 예약이 걸린 워크플로의 실행 시각(UTC 시). 리셋 창 안에 아직 안 온 실행이 있을 때만 예약한다.
const SEARCH_SCHEDULE_UTC = Object.freeze([1, 4, 7, 10, 13, 16, 19, 22]);   // collect-auction-market (07 = 전수, 나머지 = 보충)
const SCHEDULE = {
  tcg: TCG_SCHEDULE_UTC,
  search: SEARCH_SCHEDULE_UTC,
  safety: null,                             // 상시
};

/** 지금(now)과 리셋(reset) 사이에 그 시각(UTC 시)의 실행이 남아 있는가. */
function runsBeforeReset(hours, nowMs, resetMs) {
  const d = new Date(nowMs);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return (hours || []).some((h) => {
    let t = base + h * HOUR;
    if (t <= nowMs) t += 24 * HOUR;
    return t < resetMs;
  });
}

/** 리셋 전에 그 워크플로가 더 돌면 다음 1회분, 아니면 0. safety 는 항상 전액. */
function reserveLeft(key, nowMs = Date.now(), resetMs = nextReset(nowMs)) {
  const sched = SCHEDULE[key];
  if (!sched) return PER_RUN[key] ?? 0;
  return runsBeforeReset(sched, nowMs, resetMs) ? (PER_RUN[key] ?? 0) : 0;
}

/**
 * 창 마지막 회차인가 — 이 워크플로가 리셋 전에 더 안 돌면 남은 몫을 남김 없이 쓴다.
 * 리셋되면 사라지는 몫이다. 소유자(2026-09-03): "한도는 항상 쓴 적도 없다 — 남으면 포켓몬 수집에 써라."
 */
function isLastRunBeforeReset(key, nowMs = Date.now(), resetMs = nextReset(nowMs)) {
  const sched = SCHEDULE[key];
  return !!sched && !runsBeforeReset(sched, nowMs, resetMs);
}

/**
 * 이 창에서 끝나는 원피스 감시 건수 — TCG 가 정산 전에 남겨 둬야 하는 몫.
 * 감시목록에 endsAt 이 다 있으니 추정이 아니라 실제 개수다. 리셋 뒤에 끝나는 건 다음 창 몫이다.
 * 팰월드 전용 감시목록(data/palworld-auction-watch.json)은 2026-11-05 수집 중단으로 동결됐다 — 세지 않는다.
 * 그 몫(팰월드 검색·정산이 쓰던 콜)은 따로 배정하지 않는다: 남는 쿼터는 순서 ④ TCG 정산·여유분으로 흘러가고,
 * 여유분은 topup-tcg-watch.js 가 13개 게임에 같은 몫으로 나눈다.
 */
function auctionNeed(resetMs, root = ROOT) {
  let need = 0;
  try {
    const w = JSON.parse(fs.readFileSync(path.join(root, "data", "auction-watch.json"), "utf8"));
    for (const p of w.pending || []) {
      const t = Date.parse(p.endsAt || p.end || 0);
      if (Number.isFinite(t) && t < resetMs) need += 1;
    }
  } catch {}
  return need;
}

/** 이 쿼터 창(리셋 24시간 전 이후)에 진행 매물 갱신이 이미 돌았는가 — data/active-listing-audit.json 의 updated 로 판단. */
function activeListingsFresh(resetMs, root = ROOT) {
  try {
    const audit = JSON.parse(fs.readFileSync(path.join(root, "data", "active-listing-audit.json"), "utf8"));
    const t = Date.parse(audit.updated);
    return Number.isFinite(t) && t >= resetMs - 24 * HOUR;
  } catch { return false; }
}

// 진행 매물 갱신 몫은 그 워크플로가 돌 시각(18 UTC)에서 4시간 지난 22 UTC(창 시작 + 15h)까지만 지킨다.
// 그때까지 안 돌았으면(실패·미실행) 이 창에서는 포기하고 TCG 정산에 돌린다 — 2026-09-08 밤 실제:
// 갱신이 다른 이유(등급 감사 FAIL)로 죽었는데 800 을 밤새 쥐고 있어 TCG 정산이 굶었다(lorcana 26/62).
const ACTIVE_RESERVE_UNTIL_HOURS = 15;

// 원피스 경매는 창 안에서 계속 새로 검색돼 들어온다(하루 ≈1,700건 정산 = 시간당 ≈70). auctionNeed 는 "지금 알고 있는"
// 대기만 세므로, 창 앞부분에서 TCG 가 그 몫까지 가져가면 뒤에서 원피스가 우선 정산하고 TCG 여유분은 시한을 넘겨
// 버려진다(2026-09-08: TCG 대기 3,284 중 ≈2,000 소실, 검색 콜만 낭비). 리셋까지 남은 시간 × 시간당 유입을 함께 남긴다.
const OP_INFLOW_PER_HOUR = 70;
function auctionInflow(nowMs, resetMs) {
  return Math.max(0, Math.round((OP_INFLOW_PER_HOUR * (resetMs - nowMs)) / HOUR));
}

/**
 * 이 쿼터 창이 찍어야 할 TCG 스냅샷 날짜 — 창 [리셋−24h, 리셋) 안의 UTC 자정은 리셋 날짜의 00:00 이다.
 * 스냅샷은 UTC 날짜가 바뀐 뒤 첫 실행이 찍으므로(collect-tcg-snapshot) 그 날짜의 점이 이 창의 몫이다.
 */
function snapshotDayFor(resetMs) {
  return new Date(resetMs).toISOString().slice(0, 10);
}

/** 이 창이 찍어야 할 스냅샷 점이 아직 없는가 — data/tcg-snapshot.json. 못 읽으면 없는 것으로 본다(몫을 남긴다). */
function snapshotPending(resetMs, root = ROOT) {
  const day = snapshotDayFor(resetMs);
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(root, "data", "tcg-snapshot.json"), "utf8"));
    return !(snap.points || []).some((p) => p && p.d === day);
  } catch { return true; }
}

function reserveFor(key, nowMs, resetMs, root = ROOT) {
  if (key === "auction") return auctionNeed(resetMs, root) + auctionInflow(nowMs, resetMs);
  // 스냅샷 몫 — 2026-10-14. 00:18 UTC 는 창의 마지막 7시간 안이라 잔여가 바닥 쪽이다. 아무도 이 몫을 남기지 않아
  // 9/5~9/8·10/8~10/10 스냅샷이 리셋 뒤 07:18 로 밀렸다(표준 시각 밖). 그날 점이 생기면 바로 풀린다.
  if (key === "tcgSnapshot") return snapshotPending(resetMs, root) ? PER_RUN.tcgSnapshot : 0;
  if (key === "active") {
    if (activeListingsFresh(resetMs, root)) return 0;
    const windowStart = resetMs - 24 * HOUR;
    return nowMs >= windowStart + ACTIVE_RESERVE_UNTIL_HOURS * HOUR ? 0 : PER_RUN.active;
  }
  return reserveLeft(key, nowMs, resetMs);
}

// 남겨 둘 몫 목록 — 소비자마다 한 곳에서 가져간다(2026-10-14 스냅샷 몫 추가).
//   OP_SETTLE: 원피스 정산(settleBudget 기본) — 검색·안전·진행 매물. TCG 몫(스냅샷·정산 300)은 남기지 않는다 — 순서 ②가 ③④보다 앞이다.
//   TCG:       TCG 정산·여유분·드레인 — 원피스 정산(auction)과 TCG 스냅샷(tcgSnapshot)을 먼저 남긴다.
//   TCG_SNAPSHOT_SIZE: 스냅샷이 게임당 감시 표본 크기를 정할 때 — 자기 몫(tcgSnapshot)은 watchPerGameFor 가 따로 뺀다.
const RESERVE_KEYS = Object.freeze({
  OP_SETTLE: Object.freeze(["search", "safety", "active"]),
  TCG: Object.freeze(["auction", "search", "safety", "active", "tcgSnapshot"]),
  TCG_SNAPSHOT_SIZE: Object.freeze(["auction", "search", "safety", "active"]),
});

// 이번 실행에서 정산에 쓸 수 있는 건수.
//   opts.reserveFor: 이번 실행 뒤에도 남겨 둘 용도들(기본: RESERVE_KEYS.OP_SETTLE — 원피스 정산용).
//                    TCG 정산은 RESERVE_KEYS.TCG 로 부른다(원피스 몫을 먼저 남긴다).
//   opts.share: 남은 몫 중 이번 회차가 가져갈 비율. 한 번에 다 쓰면 창 나머지 시간대가 굶는다.
//   opts.min / opts.max: 하한·상한(한 번에 너무 적거나 많이 돌지 않게)
//   opts.drainKey: 이 워크플로의 스케줄 키. 리셋 전 마지막 회차면 share 를 1 로 올려 남김 없이 쓴다.
async function settleBudget(opts = {}) {
  const min = opts.min ?? 50;
  const max = opts.max ?? 1200;
  const now = Date.now();
  const q = await quota();
  const left = q.remaining;
  if (left == null) return { n: min, left: null, keep: null, reset: null, note: "잔여량을 못 읽어 하한만 쓴다" };
  const reset = q.reset ?? nextReset(now);
  const drain = opts.drainKey ? isLastRunBeforeReset(opts.drainKey, now, reset) : false;
  const share = drain ? 1 : (opts.share ?? 0.4);
  // 기본(원피스 정산)은 검색·안전·진행 매물만 남긴다 — TCG(스냅샷·정산)는 원피스보다 뒤다. 창 끝에서 TCG 몫까지
  // 남기면 원피스 정산이 0 이 된다(2026-09-04 00:30 UTC 실측: 잔여 480 · 예약 580 → 가용 0).
  const keys = opts.reserveFor || RESERVE_KEYS.OP_SETTLE;
  const keep = keys.reduce((t, k) => t + reserveFor(k, now, reset), 0);
  const usable = Math.max(0, left - keep);
  const n = Math.max(0, Math.min(max, Math.floor(usable * share)));
  const resetAt = new Date(reset).toISOString().slice(11, 16);
  const tail = `${drain ? " · 창 마지막 회차(남김 없이)" : ""} · 리셋 ${resetAt}Z`;
  if (n < min) return { n: n > 0 ? n : 0, left, keep, reset, drain, note: `잔여 ${left} · 예약 ${keep}(${keys.join("+")}) · 가용 ${usable} — 몫이 하한 미만${tail}` };
  return { n, left, keep, reset, drain, note: `잔여 ${left} · 예약 ${keep}(${keys.join("+")}) · 가용 ${usable} · 이번 회차 ${n}${tail}` };
}

module.exports = { token, quota, remaining, settleBudget, reserveLeft, reserveFor, snapshotDayFor, snapshotPending, activeListingsFresh, auctionInflow, OP_INFLOW_PER_HOUR, isLastRunBeforeReset, auctionNeed, nextReset, runsBeforeReset, PER_RUN, SCHEDULE, SEARCH_SCHEDULE_UTC, RESET_UTC_HOUR, RESERVE_KEYS };

if (require.main === module) {
  (async () => {
    const q = await quota();
    const b = await settleBudget();
    const t = await settleBudget({ reserveFor: RESERVE_KEYS.TCG, share: 0.5, min: 60, max: 900 });
    console.log(JSON.stringify({
      잔여: q.remaining, 한도: q.limit, 리셋: q.reset ? new Date(q.reset).toISOString() : null,
      원피스_이번회차: b.n, 원피스_설명: b.note,
      TCG_이번회차: t.n, TCG_설명: t.note,
    }, null, 1));
  })();
}
