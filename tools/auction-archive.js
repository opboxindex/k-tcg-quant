// 경매 낙찰기록 원장 — 일자별 파일로 나눠 저장한다.
//
// 왜 나누나 (2026-07-29): 한 파일(auction-sold.json)에 45일치를 넣고 2시간마다 통째로 다시 쓰고
// 있었다. 커밋마다 새 blob 이 생기므로 파일이 클수록 저장소가 급격히 불어난다.
// 실측: 8일치(1.1MB)만에 blob 43개 20.8MB. 45일치(약 6MB)에 도달하면 하루 70MB씩 늘어난다.
// GitHub Pages 저장소로는 몇 주면 한계다.
//
// 일자별로 나누면 "그날"이 지난 파일은 두 번 다시 쓰이지 않는다 → blob 한 개로 끝.
// 하루치는 200~300KB 수준이라 당일 재작성 비용도 작다.
//
// 이 파일들이 원장(source of truth)이다. 파생 집계(auction-daily/auction-card-stats)는
// 언제든 여기서 다시 만들 수 있다.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// 원피스 원장 한 곳이다. 팰월드 전용 원장(data/palworld-auction-archive/, 2026-08-19~11-05)은 --game 플래그로 따로
// 쌓았는데 2026-11-05 소유자 결정으로 수집을 멈추며 그 플래그를 지웠다 — 그 디렉터리는 동결(append-only, 지우지 않는다).
const DIR = path.join(ROOT, "data", "auction-archive");

const dayPath = (d) => path.join(DIR, `${d}.json`);

function readDay(d) {
  try { return JSON.parse(fs.readFileSync(dayPath(d), "utf8")).sales || []; } catch { return []; }
}

// 목록에 있는 날짜들(오름차순).
function listDays() {
  try {
    return fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  } catch { return []; }
}

// 최근 N일치 기록을 한 배열로. 파생 집계용.
function readRecent(days) {
  const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return listDays().filter((d) => d >= cut).flatMap(readDay);
}

// 기록 추가 — 같은 id 는 덮어쓰지 않는다(먼저 쓴 값이 종료 직후 값이라 더 신뢰할 만하다).
// 반환: 실제로 새로 들어간 건수.
function appendSales(rows) {
  if (!rows.length) return 0;
  fs.mkdirSync(DIR, { recursive: true });
  const byDay = {};
  for (const r of rows) (byDay[r.d] = byDay[r.d] || []).push(r);
  let added = 0;
  for (const [d, list] of Object.entries(byDay)) {
    const existing = readDay(d);
    const known = new Set(existing.map((s) => s.id));
    const fresh = list.filter((s) => !known.has(s.id));
    if (!fresh.length) continue;
    const sales = [...existing, ...fresh];
    fs.writeFileSync(dayPath(d), JSON.stringify({
      d,
      note: "Completed eBay auctions for One Piece Card Game items that ended on this date, read from the listing after close. 'price' is the final winning bid (lot total); 'unitPrice' is per item. 'sold' comes from eBay's sold-quantity field and is null where eBay does not report it — null rows are excluded from sell-through. Written once per day and not rewritten afterwards.",
      sales,
    }) + "\n", "utf8");
    added += fresh.length;
  }
  return added;
}

module.exports = { DIR, dayPath, readDay, listDays, readRecent, appendSales };
