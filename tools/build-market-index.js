// OPBOX 성적표(board) → onepiece-packs.json 의 marketIndex
//  - board 가격: 우리 eBay 실판매 원장(box-sold-series.json, jp 주간 중앙값 USD).
//    2026-08-21 전환 — 종전 외부 boxSeries 는 20/21 세트가 07-11~13 에 멈춘 것을
//    아무도 몰랐다. 우리 원장은 멈추면 수집 감사가 바로 잡는다. 차트와 같은 소스라
//    홈 표 $348 vs 차트 $305 처럼 한 화면에 두 가격이 뜨는 문제도 사라진다.
//  - Change = 각 세트 추적 시작일 대비(발매 대비 아님 — 발매추적은 launchTracked 만).
//  - 지수(2026-01-07=100)는 소비처가 없어서 전환 때 삭제했다. 화면 표시는 2026-07-29 에
//    이미 빠졌고 남은 건 방문자 페이로드 속 죽은 시계열뿐이었다.
//  - 개봉 미터(meter: 전세트 psaWeekly 최근 주 합 + 전주대비)는 2026-11-20 에 지웠다 — 화면 표시는 2026-07-29 에 이미 빠졌고
//    읽는 곳이 없었다. 남겨 두면 17일 구간을 "주(wk)"로 부르는 죽은 페이로드가 방문자에게 계속 내려간다.
// 2026-10-15: 성적표(board)는 사실 빌더(tools/build-site-facts.js — data/derived/site-facts.json board)에서 온다.
//   여기는 그 값을 packs.marketIndex 에 옮겨 쓴다.
//   재판 횟수(board.reprints)·4주 변동률·current 규칙은 빌더가 market-data-normalizers(splitReprints·boxChange28)로 한 번 센다.
// Run: node tools/build-market-index.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const F = require("./build-site-facts").load();
const d = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "onepiece-packs.json"), "utf8"));
// 검증된 세트 팩트(정가·재판) — marketIndex.reprints 는 이 원본의 사본(packs.js 홈 배지가 읽는다). 나이틀리에 안 지워지는 소스 파일.
let FACTS = { sets: {}, bandaiAnnouncesReprints: false };
try { FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "set-facts.json"), "utf8")); } catch (e) {}

const todayIso = new Date().toISOString().slice(0, 10);

// ── 성적표(전세트) = 사실 파일 board. 변화율은 **최근 4주** — "추적 시작 대비"를 버렸다(2026-08-24).
// 시리즈는 원장에서 매번 다시 만드는데, 새 수집이 과거 판매를 되메우면 초기 희소 구간의
// 중앙값이 통째로 바뀐다. 실측: OP-13 기준가가 하루 사이 \$149(05-24) → \$277(05-29) 로 튀어
// 같은 세트가 +2.7% 에서 -51.6% 가 됐다. 시장이 아니라 우리 표본이 움직인 것이다.
// 최근 4주는 양끝이 다 두꺼운 구간이라 되메움에 둔감하고, 세트 페이지의 4-week change 와 기준이 같다.
// 실거래 점이 없어도 **행은 남긴다**(2026-08-24) — 값을 지어내지 않고 비워 둔다. current 가 없으면(마지막 중앙값 점이 asOf 로부터 28일 밖) 값·날짜·등락을 비운다.
const board = F.board;

const out = {
  updated: d.updated || F.series.updated || todayIso,
  method: "Per-set current price: the latest rolling median of completed eBay sales of sealed Japanese booster boxes (our own ledger) when that median point is dated within 28 days of the series asOf, otherwise null. n = sales inside that point's rolling window (windowDays, 28-56 days). 4-week change: that median vs the median point 28 days earlier.",
  board,
  reprints: { bandaiAnnounces: FACTS.bandaiAnnouncesReprints === true, bySet: FACTS.sets || {} },
};
// 메인 JSON에 통합(단일 소스·단일 버전 — 별도 파일의 버전 엇갈림 사고 방지)
const mainPath = path.join(ROOT, "data", "onepiece-packs.json");
const main = JSON.parse(fs.readFileSync(mainPath, "utf8"));
main.marketIndex = out;
fs.writeFileSync(mainPath, JSON.stringify(main));
console.log(JSON.stringify({
  boardSets: board.length,
  boardTop: board[0].code + " " + board[0].changePct + "% ... " + board[board.length - 1].code + " " + board[board.length - 1].changePct + "%",   // null 이면 4주 기준점 없는 신생 세트
  launchTracked: board.filter((b) => b.launchTracked).map((b) => b.code),
}, null, 1));
