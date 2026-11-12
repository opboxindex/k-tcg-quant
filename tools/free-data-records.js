"use strict";

const { SITE, buildBoxMarket } = require("./market-data-normalizers");

const BOX_HEAD = [
  "set_code", "set_name_en", "set_name_ko", "english_release_date", "canonical_url",
  "jp_sold_median_usd", "jp_sold_p25_usd", "jp_sold_p75_usd", "jp_sold_sample_size", "jp_sold_sample_collected_on",
  "jp_active_ask_median_usd", "jp_active_ask_p15_usd", "jp_active_ask_p85_usd", "jp_active_listing_count", "jp_active_observed_on",
  "en_sold_median_usd", "en_sold_p25_usd", "en_sold_p75_usd", "en_sold_sample_size", "en_sold_sample_collected_on",
  "en_active_ask_median_usd", "en_active_ask_p15_usd", "en_active_ask_p85_usd", "en_active_listing_count", "en_active_observed_on",
];
const GRADE_HEAD = [
  "set_code", "set_name_en", "edition",
  "psa_total", "psa10_rate_pct", "psa_weekly_add", "psa_total_as_of", "psa_weekly_add_as_of",
  "cgc_total", "cgc_total_as_of", "cgc_pristine10", "cgc_gem_mint10", "cgc_grade_split_as_of",
  "tag_total", "tag_total_as_of", "tag_10", "tag_10p", "tag_grade_split_as_of",
];
// is_partial: 그날 수집이 온전한가. methodology 에서 "중단된 날은 partial 로 표시하고
// 결측일을 명시한다"고 공언해 놓고 CSV 에는 컬럼조차 없었다(2026-08-25 감사).
// 결측일은 별도 행(kind="missing")으로 명시한다 — 07-24 다음 줄이 07-27 이면
// 인용자가 그 사이를 선으로 이어 없는 이틀을 메운다.
const AUCTION_HEAD = ["date", "kind", "auctions", "sold", "sell_through_pct", "median_price_usd", "median_bids", "is_partial"];

function orderKey(code) {
  const match = code.match(/^([A-Z]+)-?(\d+)/);
  const family = { OP: 0, EB: 1, PRB: 2 }[match?.[1] || "OP"] ?? 9;
  return family * 1000 + (match ? parseInt(match[2], 10) : 0);
}

function trackedCodes(data) {
  return [...(data.jp?.list || []), ...(data.extra?.list || [])]
    .filter((code) => data.sets?.[code])
    .sort((a, b) => orderKey(a) - orderKey(b));
}

/** One truthful row per product; sold and active snapshots never share a field. */
function buildBoxRecords(data) {
  const dates = [];
  const records = trackedCodes(data).map((code) => {
    const set = data.sets[code];
    const market = buildBoxMarket(set, data.updated);
    const js = market.japanese.sold, ja = market.japanese.activeAsk;
    const es = market.english.sold, ea = market.english.activeAsk;
    dates.push(js?.sampleCollectedOn, ja?.observedOn, es?.sampleCollectedOn, ea?.observedOn);
    return {
      set_code: code, set_name_en: set.nameEn ?? "", set_name_ko: set.nameKo ?? "",
      english_release_date: set.release ?? "", canonical_url: `${SITE}/sets/${code.toLowerCase()}.html`,
      jp_sold_median_usd: js?.medianUsd ?? "", jp_sold_p25_usd: js?.p25Usd ?? "", jp_sold_p75_usd: js?.p75Usd ?? "", jp_sold_sample_size: js?.sampleSize ?? "", jp_sold_sample_collected_on: js?.sampleCollectedOn ?? "",
      jp_active_ask_median_usd: ja?.medianUsd ?? "", jp_active_ask_p15_usd: ja?.p15Usd ?? "", jp_active_ask_p85_usd: ja?.p85Usd ?? "", jp_active_listing_count: ja?.listingCount ?? "", jp_active_observed_on: ja?.observedOn ?? "",
      en_sold_median_usd: es?.medianUsd ?? "", en_sold_p25_usd: es?.p25Usd ?? "", en_sold_p75_usd: es?.p75Usd ?? "", en_sold_sample_size: es?.sampleSize ?? "", en_sold_sample_collected_on: es?.sampleCollectedOn ?? "",
      en_active_ask_median_usd: ea?.medianUsd ?? "", en_active_ask_p15_usd: ea?.p15Usd ?? "", en_active_ask_p85_usd: ea?.p85Usd ?? "", en_active_listing_count: ea?.listingCount ?? "", en_active_observed_on: ea?.observedOn ?? "",
    };
  });
  return { records, dates };
}

const series = (src, code, edition) => src?.sets?.[code]?.[edition] || [];
const latest = (src, code, edition, predicate = () => true) => [...series(src, code, edition)].reverse().find(predicate) || null;

/** Keep total, weekly-change and grade-split dates separate across every grader. */
function buildGradeRecords(data, cgc, tag) {
  const records = [], dates = [];
  for (const code of trackedCodes(data)) for (const edition of ["jp", "en"]) {
    const set = data.sets[code];
    const psa = edition === "jp" ? set.psaFull : set.psaFullEn;
    // 주간 증가분(wowAdd)은 두 판 모두 판별 주간 원장의 마지막 두 수요일 차다(inject-psa-wow.js → set.psaWow). 그 끝 수요일이 기준일이다 —
    // 영문판 총량 날짜(psaFullEn.updated)를 쓰면 총량을 팝 리포트로 최신화한 주에 증가분 날짜가 열흘 넘게 앞서 찍힌다(2026-11-12).
    const psaWeekly = set.psaWow?.to;
    const cgcTotal = latest(cgc, code, edition);
    const cgcSplit = latest(cgc, code, edition, (point) => point?.grades && Object.keys(point.grades).length);
    const tagTotal = latest(tag, code, edition);
    const tagSplit = latest(tag, code, edition, (point) => Number.isFinite(point?.g10) && Number.isFinite(point?.g10p));
    if (!psa && !cgcTotal && !tagTotal) continue;
    const record = {
      set_code: code, set_name_en: set.nameEn ?? "", edition: edition === "jp" ? "japanese" : "english",
      psa_total: psa?.total ?? "", psa10_rate_pct: psa?.gemRate ?? "", psa_weekly_add: psa?.wowAdd ?? "",
      psa_total_as_of: psa?.updated ?? "", psa_weekly_add_as_of: psa?.wowAdd == null ? "" : (psaWeekly ?? ""),
      cgc_total: cgcTotal?.total ?? "", cgc_total_as_of: cgcTotal?.d ?? "",
      cgc_pristine10: cgcSplit?.grades?.["Pristine 10"] ?? "", cgc_gem_mint10: cgcSplit?.grades?.["Gem Mint 10"] ?? "", cgc_grade_split_as_of: cgcSplit?.d ?? "",
      tag_total: tagTotal?.total ?? "", tag_total_as_of: tagTotal?.d ?? "",
      tag_10: tagSplit?.g10 ?? "", tag_10p: tagSplit?.g10p ?? "", tag_grade_split_as_of: tagSplit?.d ?? "",
    };
    dates.push(record.psa_total_as_of, record.psa_weekly_add_as_of, record.cgc_total_as_of, record.cgc_grade_split_as_of, record.tag_total_as_of, record.tag_grade_split_as_of);
    records.push(record);
  }
  return { records, dates };
}

function buildAuctionRecords(source, series) {
  const records = [], dates = [];
  // partial 판정과 결측일은 auction-series.json 만 들고 있다(auction-sold.json 엔 없다).
  const partialBy = new Map();
  // 수집 공백이 커서 비율을 못 믿는 날 — build-auction-series 가 ratesVoided 로 표시한다.
  // 그 판단은 series 에만 있고 auction-sold.json 에는 없으므로 여기서 다시 걸러야 한다.
  // 표시만 하고 값을 실으면 받아가는 쪽은 플래그를 안 보고 인용한다(8/27 낙찰률 56.3%가 그 예).
  const ratesVoided = new Set();
  for (const r of (series && series.daily) || []) {
    partialBy.set(r.d, !!r.partial);
    if (r.ratesVoided) ratesVoided.add(r.d);
  }
  const gaps = new Set(((series && series.gaps) || []).flatMap((g) => (typeof g === "string" ? [g] : g && g.d ? [g.d] : [])));
  // 진행 중인 오늘은 내보내지 않는다 — 2026-08-24 실측: 낮 시점 카드 낙찰률 49.5% 였는데
  // 완결일은 26% 대다. 경매가 하루 종일 종료되고 낙찰 건이 먼저 원장에 들어와서, 낮에 자르면
  // 낙찰률이 부풀어 보인다. 이 CSV 는 AI·연구자가 인용하는 공개 파일이라 반쪽 하루를 실으면 안 된다.
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const point of source?.daily || []) {
    if (point.d >= todayIso) continue;
    dates.push(point.d);
    const put = (kind, value) => {
      if (!value?.n) return;
      // 건수는 '우리가 확인한 수'로서 사실이니 남기고, 비율·가격만 비운다.
      const voided = ratesVoided.has(point.d);
      records.push({ date: point.d, kind, auctions: value.n, sold: value.sold, sell_through_pct: voided ? "" : (value.sellThrough ?? ""), median_price_usd: voided ? "" : (value.medPrice ?? ""), median_bids: voided ? "" : (value.medBids ?? ""), is_partial: partialBy.get(point.d) ? "true" : "false" });
    };
    put("all", point);
    for (const kind of ["box", "card", "pack"]) put(kind, point.byKind?.[kind]);
  }
  // 결측일을 빈 행으로 명시한다. 값을 지어내지 않고 "그날은 수집이 없었다"만 말한다.
  for (const d of gaps) {
    if (d >= todayIso) continue;
    records.push({ date: d, kind: "missing", auctions: "", sold: "", sell_through_pct: "", median_price_usd: "", median_bids: "", is_partial: "true" });
    dates.push(d);
  }
  records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.kind).localeCompare(String(b.kind))));
  return { records, dates };
}

module.exports = { AUCTION_HEAD, BOX_HEAD, GRADE_HEAD, buildAuctionRecords, buildBoxRecords, buildGradeRecords };
