#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildAiData } = require("./ai-data-model");

const ROOT = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "onepiece-packs.json"), "utf8"));
const actual = JSON.parse(fs.readFileSync(path.join(ROOT, "opbox-ai-data.json"), "utf8"));
const expected = buildAiData(source);

function parseCsv(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { value += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(value); value = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value); value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  const [header, ...lines] = rows;
  for (const line of lines) assert.equal(line.length, header.length, `${file} row width must match its header`);
  return lines.map((line) => Object.fromEntries(header.map((key, index) => [key, line[index]])));
}

function latest(src, code, edition, predicate = () => true) {
  return [...(src.sets?.[code]?.[edition] || [])].reverse().find(predicate) || null;
}

assert.deepEqual(actual, expected, "generated AI data must exactly match the verified source snapshot");
assert.equal(actual.schemaVersion, "1.0.3");
// 확장 파일 3개(2026-09-08): 카드 페이지 전부 · 등급 인구 · 경매(원피스+TCG) — 원장과 같은 값, 내부 필드 없음, 핵심 파일에서 링크
{
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "opbox-ai-cards.json"), "utf8"));
  const grading = JSON.parse(fs.readFileSync(path.join(ROOT, "opbox-ai-grading.json"), "utf8"));
  const auctions = JSON.parse(fs.readFileSync(path.join(ROOT, "opbox-ai-auctions.json"), "utf8"));
  const cardMap = JSON.parse(fs.readFileSync(path.join(ROOT, "cards", "card-map.json"), "utf8"));
  assert.equal(actual.related.cardPages, "https://opboxindex.com/opbox-ai-cards.json");
  assert.equal(cards.count, Object.keys(cardMap).length, "every published card page must be listed");
  for (const page of cards.pages) assert.match(page.url, /^https:\/\/opboxindex\.com\/cards\/[a-z0-9-]+\.html$/);
  assert.ok(grading.sets.length >= 20, "grading file must cover the tracked sets");
  assert.ok(auctions.onePiece.daily.length >= 7 && auctions.onePiece.daily.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)), "auction days must be dated");
  assert.ok(auctions.tcg.games.length >= 10, "TCG section must list the tracked games");
  for (const [name, obj] of [["cards", cards], ["grading", grading], ["auctions", auctions]]) {
    const serialized = JSON.stringify(obj);
    for (const forbidden of ["bestListing", "itemPrices", "seller", "\"query\"", "marketplaceId", "ebay.com/itm/"]) assert.ok(!serialized.includes(forbidden), `${name}: internal field leaked: ${forbidden}`);
    assert.ok(Buffer.byteLength(serialized) < 400_000, `${name}: extra file must stay small enough to fetch in one request`);
  }
}
// 기준일 = packs.updated 와 AI 파일 4개에 실린 관측일 중 가장 늦은 날(ai-data-model.datasetAsOf) — 2026-10-15.
// packs.updated(활성 매물 UTC 날짜)보다 박스 판매 원장(KST 수집)이 하루 늦게 돌면 10-15 값이 "as of 10-14" 파일에 실렸다.
// 그래서 packs.updated 와 같을 필요는 없고 그보다 이를 수만 없다. 정확한 값은 위 deepEqual(buildAiData) 이 고정한다.
assert.ok(actual.datasetUpdatedOn >= source.updated, "dataset date must not be earlier than the packs data date");
assert.equal(actual.sets.length, [...source.jp.list, ...source.extra.list].length);
assert.equal(new Set(actual.sets.map((set) => set.setCode)).size, actual.sets.length, "set codes must be unique");

for (const set of actual.sets) {
  assert.match(set.canonicalUrl, /^https:\/\/opboxindex\.com\/sets\/[a-z0-9-]+\.html$/);
  // 카드 목록이 아직 없는 신규 세트(OP-17: 박스 시세만 공개, 카드는 검증 후)는 topHits 가 비는 게 맞다.
  // "빈 값이 틀린 값보다 낫다" — 다만 원본에 카드가 7장 이상 있는데 hits 가 모자라면 여전히 실패한다.
  const sourceCardCount = (source.sets[set.setCode].cards || []).length;
  const expectedHits = Math.min(7, sourceCardCount);
  assert.equal(set.topHits.length, expectedHits, `${set.setCode} must publish exactly ${expectedHits} ranked hits (source has ${sourceCardCount} cards)`);
  assert.deepEqual(set.topHits.map((card) => card.rank), Array.from({ length: expectedHits }, (_, i) => i + 1));
  for (const hit of set.topHits) if (hit.psa10Sold) {
    const raw = source.sets[set.setCode].cards.find((card) => card.rank === hit.rank).psa10Ebay;
    const expectedPercentiles = /manual, variant-matched/i.test(raw.source || "") ? [25, 75] : [15, 85];
    assert.deepEqual(hit.psa10Sold.rangePercentiles, expectedPercentiles);
    assert.equal(hit.psa10Sold.rangeLow, raw.low);
    assert.equal(hit.psa10Sold.rangeHigh, raw.high);
    assert.ok(hit.psa10Sold.rangeLow <= hit.psa10Sold.median && hit.psa10Sold.median <= hit.psa10Sold.rangeHigh);
    for (const oldName of ["p15", "p25", "p75", "p85"]) assert.ok(!(oldName in hit.psa10Sold), `PSA 10 sold must use explicit range metadata, not ${oldName}`);
  }
  for (const edition of Object.values(set.boxMarket)) {
    if (edition.sold) {
      assert.equal(edition.sold.basis, "completed_sales");
      assert.ok(edition.sold.sampleSize >= 3);
      assert.ok(edition.sold.p25Usd <= edition.sold.medianUsd && edition.sold.medianUsd <= edition.sold.p75Usd);
    }
    if (edition.activeAsk) {
      assert.equal(edition.activeAsk.basis, "active_asking_prices");
      assert.ok(edition.activeAsk.listingCount >= 3);
      assert.ok(edition.activeAsk.p15Usd <= edition.activeAsk.medianUsd && edition.activeAsk.medianUsd <= edition.activeAsk.p85Usd);
    }
  }
}

const boxRows = parseCsv("opbox-set-prices.csv");
assert.equal(boxRows.length, actual.sets.length);
for (const row of boxRows) {
  const set = actual.sets.find((item) => item.setCode === row.set_code);
  assert.ok(set, `box CSV has unknown set ${row.set_code}`);
  assert.equal(row.canonical_url, set.canonicalUrl);
  assert.equal(row.jp_sold_median_usd, String(set.boxMarket.japanese.sold?.medianUsd ?? ""));
  assert.equal(row.jp_sold_sample_collected_on, set.boxMarket.japanese.sold?.sampleCollectedOn ?? "");
  assert.equal(row.jp_active_ask_median_usd, String(set.boxMarket.japanese.activeAsk?.medianUsd ?? ""));
  assert.equal(row.jp_active_observed_on, set.boxMarket.japanese.activeAsk?.observedOn ?? "");
  assert.equal(row.en_sold_median_usd, String(set.boxMarket.english.sold?.medianUsd ?? ""));
  assert.equal(row.en_active_ask_median_usd, String(set.boxMarket.english.activeAsk?.medianUsd ?? ""));
}

const cgc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "cgc-grading-history.json"), "utf8"));
const tag = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "tag-grading-history.json"), "utf8"));
const gradeRows = parseCsv("opbox-grading-population.csv");
assert.equal(new Set(gradeRows.map((row) => `${row.set_code}|${row.edition}`)).size, gradeRows.length);
for (const row of gradeRows) {
  const edition = row.edition === "japanese" ? "jp" : "en";
  const set = source.sets[row.set_code];
  const psa = edition === "jp" ? set.psaFull : set.psaFullEn;
  const cgcTotal = latest(cgc, row.set_code, edition);
  const cgcSplit = latest(cgc, row.set_code, edition, (point) => point.grades && Object.keys(point.grades).length);
  const tagTotal = latest(tag, row.set_code, edition);
  const tagSplit = latest(tag, row.set_code, edition, (point) => Number.isFinite(point.g10) && Number.isFinite(point.g10p));
  assert.equal(row.psa_total, String(psa?.total ?? ""));
  assert.equal(row.psa_total_as_of, psa?.updated ?? "");
  assert.equal(row.psa_weekly_add_as_of, psa?.wowAdd == null ? "" : set.psaWow?.to ?? "");
  assert.equal(row.cgc_total, String(cgcTotal?.total ?? ""));
  assert.equal(row.cgc_total_as_of, cgcTotal?.d ?? "");
  assert.equal(row.cgc_pristine10, String(cgcSplit?.grades?.["Pristine 10"] ?? ""));
  assert.equal(row.cgc_gem_mint10, String(cgcSplit?.grades?.["Gem Mint 10"] ?? ""));
  assert.equal(row.cgc_grade_split_as_of, cgcSplit?.d ?? "");
  assert.equal(row.tag_total, String(tagTotal?.total ?? ""));
  assert.equal(row.tag_total_as_of, tagTotal?.d ?? "");
  assert.equal(row.tag_10, String(tagSplit?.g10 ?? ""));
  assert.equal(row.tag_10p, String(tagSplit?.g10p ?? ""));
  assert.equal(row.tag_grade_split_as_of, tagSplit?.d ?? "");
  if (row.cgc_grade_split_as_of && row.cgc_total_as_of) assert.ok(row.cgc_grade_split_as_of <= row.cgc_total_as_of);
  if (row.tag_grade_split_as_of && row.tag_total_as_of) assert.ok(row.tag_grade_split_as_of <= row.tag_total_as_of);
}

const serialized = JSON.stringify(actual);
for (const forbidden of ["bestListing", "itemPrices", "seller", "query", "marketplaceId", "campid", "client_secret", "ebay.com/itm/"]) {
  assert.ok(!serialized.includes(forbidden), `public AI data must omit ${forbidden}`);
}
assert.ok(Buffer.byteLength(serialized) < 200_000, "AI data must remain compact enough for answer-engine retrieval");

const freeData = fs.readFileSync(path.join(ROOT, "free-data.html"), "utf8");
const ldBlocks = [...freeData.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
const graph = ldBlocks.find((block) => Array.isArray(block["@graph"]))?.["@graph"] || [];
const downloads = graph.flatMap((item) => item.distribution ? [item.distribution.contentUrl] : []);
for (const name of ["opbox-ai-data.json", "opbox-set-prices.csv", "opbox-grading-population.csv", "opbox-auction-daily.csv"]) {
  assert.ok(downloads.some((url) => url?.endsWith(`/${name}`)), `Dataset JSON-LD must list ${name}`);
}

const factDates = [];
for (const set of actual.sets) {
  for (const market of Object.values(set.boxMarket)) factDates.push(market.sold?.sampleCollectedOn, market.activeAsk?.observedOn);
  for (const hit of set.topHits) {
    factDates.push(hit.rawNmAsk?.observedOn, hit.psa10Sold?.sampleCollectedOn, hit.psaPopulation?.observedOn);
    if (hit.psaPopulation?.grade10 != null) assert.ok(hit.psaPopulation.grade10 <= hit.psaPopulation.total);
    if (hit.psaPopulation?.grade9 != null) assert.ok(hit.psaPopulation.grade9 <= hit.psaPopulation.total);
    if (hit.psaPopulation?.grade10 != null && hit.psaPopulation?.grade9 != null) assert.ok(hit.psaPopulation.grade10 + hit.psaPopulation.grade9 <= hit.psaPopulation.total);
  }
}
const validFactDates = factDates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")).sort();
const aiDataset = graph.find((item) => item["@id"]?.endsWith("#ai-json"));
assert.equal(aiDataset?.temporalCoverage, `${validFactDates[0]}/${validFactDates.at(-1)}`, "AI Dataset temporal coverage must include every published fact date");

console.log(JSON.stringify({ test: "AI_DATA_OK", sets: actual.sets.length, cards: actual.sets.reduce((sum, set) => sum + set.topHits.length, 0), bytes: Buffer.byteLength(serialized) }));
