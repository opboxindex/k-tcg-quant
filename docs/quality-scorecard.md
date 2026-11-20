# 연구 품질 점수판 (tools/quality-scorecard.js)

소유자 기준(2026-10-14): **완벽한 리서치 회사 — 누구든 숫자만 보고 설명할 수 있고, 계속 좋아진다. 정기 작업마다 품질 지표 최악 1개를 고친다.**

```
node tools/quality-scorecard.js            # 사람용 표 + 맨 아래 "최악 1건"
node tools/quality-scorecard.js --json     # { today, counts, worst, rows[] }
node tools/quality-scorecard.js --guard    # E1 에서 가드를 실제로 돌린다(약 14초)
```

- 읽기만 한다. 브라우저 없음. 보통 1초, `--guard` 없이 5초 안. **종료 코드는 항상 0** — 점수판은 막는 도구가 아니다(막는 건 `guard-invariants.js`).
- 규칙은 점수판이 새로 정하지 않는다. 값을 만드는 모듈·감사기를 그대로 불러 센다(아래 "원천" 열). 그 규칙을 바꾸면 점수판도 같이 바뀐다.
- 수집 스킬(`.claude/skills/수집/SKILL.md` 8절): 수집을 끝낼 때마다 돌리고 **최악 1건을 한 줄로 소유자에게 보고**한다.

## 상태와 최악 1건

| 상태 | 뜻 |
|---|---|
| FAIL | 규칙 위반 또는 원천을 못 읽음. 이번 작업에서 고친다 |
| WARN | 규칙 안이지만 모자람(커버리지 미달·낡음·빈칸) |
| OK | 규칙 충족. 100% 가 아니면 shortfall 로 순위만 매긴다 |
| INFO | 상태가 아니라 크기만 보는 수(영구 공백 수·이상치 수·가드 정의 수) |

**최악 1건** = `rank` 가 가장 높은 행(FAIL 3 > WARN 2 > 100% 아닌 OK 1 > OK·INFO 0). 같은 rank 면 `shortfall`(0~1, 모자란 비율)이 큰 행. 그래도 같으면 위쪽 행(A → F). `--json` 의 `worst` 가 그 행이다.

## 지표 정의

ID 는 도구 출력과 1:1 이다. "정의" 는 도구가 실제로 세는 그대로다 — 다른 해석은 없다.

### A. 박스 실거래 커버리지

원천: `data/box-sold-series.json`(`tools/build-box-sold-series.js` 가 원장 `data/box-sold-ledger.json` 에서 매번 다시 굽는다). 추적 세트 = `data/onepiece-packs.json` 의 `sets` 22개 × 판(jp/en) = 44 계열.

| ID | 지표 | 정의 | 상태 규칙 | 개선 |
|---|---|---|---|---|
| A1 | 현재가 있는 세트 | 계열 중 `sets[code].current[ed]` 가 null 이 아닌 수. current = 그 판이 발매됐고 마지막 주간 점이 `asOf`(전 계열 마지막 관측일) 로부터 `staleDays`(28일) 안일 때의 그 점 | 44/44 OK, 아니면 WARN | 박스 수집(수집 스킬 2절) → `node tools/build-box-sold-series.js`. 창(28~56일)을 최대로 늘려도 MIN_N 이 안 모이면 시장이 얇은 것이다 — 창 규칙은 `build-box-sold-series.js` 한 곳 |
| A2 | MIN_N 미달로 점이 끊긴 계열 | 발매 후 즉시구매 판매(`sinceRelease[ed]`)가 1건 이상인데 current 가 없는 계열. MIN_N(6) 은 `build-box-sold-series.js` 의 export 를 읽는다 | 0 OK, 아니면 WARN | 수집일(월·수·금)을 거르지 않는다. 빈 구간이 틀린 값보다 낫다 — 추정으로 메우지 않는다 |
| A3 | 현재가 점의 표본 n | current 가 있는 계열의 `current.n` 중앙값 / 최소. 목표 = `window.targetSales`(12) | 중앙값 ≥ 12 OK, 아니면 WARN | 표본은 수집 빈도가 아니라 시장이 정한다. 목표 건수·창은 `build-box-sold-series.js` 한 곳 |

### B. 시계열 연속성

| ID | 지표 | 정의 | 상태 규칙 | 개선 |
|---|---|---|---|---|
| B1 | 새 날짜 빈칸 | `node tools/collect-status.js --json` 의 `gaps`(= `audit-series-gaps.js` problems: 최근 21일 중 비었고 `data/known-gaps.json` 에 없는 날·주) 수 | 0 OK, 아니면 FAIL | 박스는 재수집으로 메워진다(eBay 가 90일치를 보여준다). 경매 관측·TCG 스냅샷은 소급 불가 — 사유·확인일과 함께 `data/known-gaps.json` 에 등록 |
| B2 | 확인된 영구 공백 | `data/known-gaps.json` 의 `gaps[*].dates` + `weeks` 개수 | INFO | 채울 수 없다. B1 이 0 이면 늘지 않는다 |
| B3 | 그래프 안 빗금 주 | 계열마다 주간 점이 2개 이상일 때 (마지막 점 − 첫 점)/7 + 1 − 점 수. 화면에서 빗금(`opbcGap`)으로 그려지는 주 | 0 OK, 아니면 WARN | 그 주 창 안 즉시구매 판매가 MIN_N 미만. 수집 누락이면 박스 재수집, 시장이 얇으면 그대로 둔다 |
| B4 | 창을 늘린 점 / 이상치가 빠진 점 | 주간 점 중 `win`(이상치를 빼고 MIN_N 을 채우려 창을 늘린 점) 수 / `out`(이상치가 빠진 점) 수 | INFO | 판정(양쪽 Hampel, K=3.5, 척도 하한 20%)은 `build-box-sold-series.js` 한 곳. 바꾸면 `test-box-sold-filters.js` 6절이 검증 |
| B5 | 이상치로 빠진 판매 | `sets[*].outliers[ed]` 중 판매일이 `asOf` − 28일 이후인 수 / 전체 수 | INFO | 최근 4주 이상치가 급증하면 수집 오염(배송비·세트 묶음·다른 상품)부터 의심 — `tools/box-sold-ingest.js` 필터. 판매 id 는 outliers 에 있다 |

### C. 신선도(마지막 관측 경과일)

원천: `node tools/collect-status.js --json` 의 `rows`. 기준일(`last`)·경과일(`age`)·문턱(`warn`/`late`)·상태(정상/지연/늦음)를 그대로 쓴다 — 수집원마다 "마지막 관측일" 을 뽑는 방식은 `collect-status.js` 의 `SOURCES` 가 유일한 정의다.

| ID | 수집원 | collect-status key | 주기 | 지연/늦음(일) |
|---|---|---|---|---|
| C1 | 박스 실거래(eBay sold) | `box` | 주 3회 | 3 / 5 |
| C2 | 원피스 경매 정산 | `op-auction` | 90분 | 1 / 2 |
| C3 | TCG 스냅샷 | `tcg` | 1일 | 1 / 2 |
| C4 | PSA 카드별 인구 | `psa-pop` | 주 1회 | 8 / 14 |
| C5 | PSA 세트 주간 | `psa-weekly` | 주 1회 | 8 / 14 |
| C6 | CGC 카드별 인구 | `grading` | 주 1회 | 8 / 12 |
| C7 | TAG 인구 | `tag-pop` | 주 1회 | 8 / 14 |
| C8 | 유유테이 NM | `nm` | 10일 | 10 / 14 |
| C9 | PSA10 실거래 | `psa10-sold` | 월 1회 | 35 / 60 |
| C10 | 환율 | `fx` | 매일(영업일) | 2 / 3 |
| C11 | 공식 카드리스트 | `official-cardlist` | 매일 | 2 / 3 |
| C12 | PSA 판별 누적 | `psa-edition` | 주 1회 | 8 / 14 |

상태: 정상 → OK, 지연 → WARN, 늦음·없음·오류 → FAIL. 개선 = 그 행의 `how`(수동) 또는 워크플로 `wf`(자동, 멈췄으면 Actions 로그). `collect-status.js` 에 key 가 없으면 FAIL.

### D. 카드 사실 커버리지

추적 카드 = `data/onepiece-packs.json` 의 22 세트 × `cards`(Top 10) = 220장.

| ID | 지표 | 정의 | 상태 규칙 | 개선 |
|---|---|---|---|---|
| D1 | 쓸 수 있는 NM | `market-data-normalizers.nmUsable(card)` = `nmJpy` > 0 이고 `nmUpdated` 가 날짜이고 `nmHiddenReason` 없음. 비고: 숨김 / 값은 있는데 읽은 날 없음 / 값 없음 | 220/220 OK, 아니면 WARN | 유유테이 NM 재수집(수집 스킬 4절, 변형별 매칭). 숨김은 사유가 풀리면 `nmHiddenReason` 을 지운다 |
| D2 | PSA10 실거래 쓸 수 있음 | `ai-data-model.psa10Sold(card)` 가 null 이 아님 = `psa10Ebay.soldBased`, `sampleSize` ≥ 3, `updated` 날짜, low ≤ middle ≤ high > 0, 통화 USD/KRW/JPY, source 가 "manual, variant-matched" 또는 "completed search". 비고: 그중 `updated` 가 35일 넘은 수 | OK(모든 카드에 PSA10 실거래가 있지는 않다). shortfall = 없는 비율 | `node tools/psa10-sold-refresh.js` → 브라우저 수집 → `node tools/psa10-sold-write.js`(변형 분리 필수) |
| D3 | 레어도 코드 있음 | `card-list-shared.rarityCode(code, card)` 가 빈 문자열이 아님(공식 카드리스트의 그 인쇄 레어도 → 같은 번호 인쇄들의 레어도가 하나뿐이면 그 값 → 공식 행이 없으면 원본). 비고: 공식 목록(`data/official-cardlist.json` jp.cards)에 그 번호 행이 없는 카드 수 | 220/220 OK, 아니면 WARN | `node tools/fetch-official-cardlist.js`(매일 자동). 번호 행이 있는데 변형이 갈리면 `_imgSuffix` 로 인쇄를 확정 |
| D4 | 이미지 있음 | 자체호스팅 = `card.image` 가 `https://opboxindex.com/` 으로 시작하거나 상대경로 / 전체 = `image` 또는 `img` 가 있는 수 | 전체 220 OK, 아니면 WARN. shortfall = 자체호스팅 아닌 비율 | `node tools/fetch-card-images.js`, 일본판 공식 이미지는 `tools/selfhost-jp-images.js`(가드 I1: 외부 핫링크 금지) |

### E. 일관성 가드·재계산 감사

| ID | 지표 | 정의 | 상태 규칙 | 개선 |
|---|---|---|---|---|
| E1 | 가드 | 기본: `tools/guard-invariants.js` 소스의 `checks: [...]` 배열 길이(정의 수)만 — 가드는 결과 파일을 남기지 않고 14초가 걸린다. `--guard`: 실제로 돌려 `guard: "OK"` 여부·오류 수·경고 수 | 기본 INFO. `--guard` 면 통과 OK / FAIL | `node tools/guard-invariants.js \| head`. FAIL 이면 푸시 금지(소유자 절대지시) |
| E2 | 박스 그래프 값 재계산 불일치 | `node tools/audit-box-series.js --json` 의 `problems` 수(원장에서 사분위수를 따로 계산해 시계열 점·화면 표시값과 대조) | 0 OK, 아니면 FAIL | `node tools/build-box-sold-series.js` 를 다시 돌린다. 그래도 다르면 생성기 규칙이 바뀐 것 — 그 파일 머리 주석 |

### F. 페이지·공개 파일

| ID | 지표 | 정의 | 상태 규칙 | 개선 |
|---|---|---|---|---|
| F1 | 얇은 색인 페이지 | `node tools/audit-thin-pages.js` 의 `thin`/`indexablePages`(noindex 아닌 페이지 중 본문 1,600자 미만 **그리고** `<td>` 24개 미만) | 0 OK, 아니면 WARN | 데이터가 쌓이면 해소(신작 세트). noindex 로 숨기지 않는다 — 노출 상태 변경은 소유자 판단 |
| F2 | 메타·구조화데이터 누락 | `node tools/audit-seo.js` 의 `errors` 수(제목·description·robots·canonical·OG·H1·FAQ/ItemList/Article 스키마·Product offers) | 0 OK, 아니면 FAIL | 생성기(`generate-*-pages.js`)에서 고친다. 산출물 HTML 을 직접 고치지 않는다 |
| F3 | "as of" 날짜 28일 초과 | 루트·`sets/`·`cards/`·`ko/`·`ja/`·`articles/` 의 noindex 아닌 HTML 중 `as of YYYY-MM-DD` 또는 `YYYY-MM-DD 기준` 날짜가 오늘보다 `staleDays`(28)일 넘게 오래된 페이지 수 / 검사 페이지 수. 비고: 페이지(가장 오래된 날짜) | 0 OK, 아니면 WARN | 그 값의 수집원을 돌린다(카드 페이지는 대개 PSA10 실거래 → C9/D2). 값이 더는 안 나오면 생성기가 날짜 대신 "—" 를 내게 한다 |
| F4 | AI 피드·RSS 나이 | `opbox-ai-data/cards/grading/auctions.json` 의 `datasetUpdatedOn`, `llms.txt` 의 "Data as of", `feed.xml` 의 `lastBuildDate` 각각 오늘까지 일수 중 최대 | ≤ 2 OK, ≤ 7 WARN, 그 밖·읽기 실패 FAIL | `generate-ai-data.js` → `generate-ai-extras.js` → `generate-llms.js` → `generate-feed.js`(수집 스킬 6절 순서) |
| F5 | 가장 비싼 카드 빈칸 세트 | `market-data-normalizers.priciest(set.cards, fx)` 가 null 인 추적 세트 수(검증 안 된 값 — 못 쓰는 NM·날짜 없는 1회성 TCG·숨김 카드 — 이 검증된 1위 값 이상) | 0 OK, 아니면 WARN | 막는 카드의 NM 을 다시 읽는다(수집 스킬 4절) 또는 숨김 사유를 정리. 다음 카드를 1위로 올리지 않는다(가드 PC1) |
| F6 | 세트 지표 3칸 빈칸 세트 | Top 10 중 raw 값이 있는 카드가 5장 이상인데 `countedValues(top10, fx)` 가 null 인 세트 수(검증 안 된 값이 검증된 값의 바닥 이상) | 0 OK, 아니면 WARN | F5 와 같다 — 세트 Top 10 안 못 쓰는 NM(읽은 날 없음·숨김)을 없앤다(가드 CM1) |
| F7 | 가격 품질 감사 | `data/price-quality-audit.json` 의 `summary.block` / `summary.review`. 비고: 감사일·사유 코드 | block > 0 FAIL, review > 0 WARN, 둘 다 0 OK, 파일 없음 WARN | `node tools/audit-price-quality.js`(매일 자동). `psa10_price_stale` 이면 C9/D2, `nm_price_*` 이면 D1 |
| F8 | Lighthouse 마지막 측정 | `.planning/**/lighthouse-*.json`(`tools/audit-site-quality.mjs --lighthouse` 산출, 로컬 전용 폴더) 중 가장 최근 파일의 날짜와 `categories` 점수 | 30일 안 OK, 넘으면 WARN, 파일 없음 WARN("측정 안 됨") | `node tools/audit-site-quality.mjs after --lighthouse`(실브라우저·로컬 서버 필요) |

## `--json` 모양

```json
{
 "today": "2026-10-15",
 "counts": { "FAIL": 0, "WARN": 10, "OK": 19, "INFO": 4 },
 "worst": { "id": "F7", "name": "…", "value": "0 / 30", "status": "WARN", "fix": "…" },
 "rows": [ { "id": "A1", "group": "box", "name": "…", "value": "41/44 (…)", "status": "WARN", "note": "…", "fix": "…", "rank": 2, "shortfall": 0.068 } ]
}
```

`group` 은 box · series · fresh · cards · guards · pages. 행 순서는 표와 같다.

## 지표를 더하거나 바꿀 때

1. 규칙은 값을 만드는 모듈에 두고 점수판은 그 함수를 부른다(새 술어를 점수판 안에 쓰지 않는다).
2. 이 문서의 같은 ID 행에 정의·상태 규칙·개선 도구를 함께 고친다. 도구 출력의 ID 와 어긋나면 안 된다.
3. 5초 안·브라우저 없음·exit 0 을 지킨다. 느린 감사(가드)는 플래그 뒤에 둔다.
