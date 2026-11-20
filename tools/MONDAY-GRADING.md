# 월요일 그레이딩 수집 절차

두 층을 모두 갱신한다. 하나만 하면 화면에서 **세트 합계와 카드 합계가 어긋난다**.

| 층 | 무엇 | 어디에 |
|---|---|---|
| 세트 전체 | 그 세트에 여태 들어온 감정 누적(PSA·CGC·TAG 각각) | `psaFull` · `graders` |
| top10 카드 | 우리가 추적하는 카드 10장의 등급 분포 | `psa/cgc/tag-card-pop.json` |

## 순서

```bash
# 1) PSA — 카드별 + 세트 누적. GemRate 가 헤드리스를 막아 9346 실브라우저 탭으로 받는다(RUN=box-sold-cdp/runs/<폴더>).
node tools/collect-psa-card-pop.js --browser > $RUN/psa-browser.js                 # 카드별 팝 리포트 URL 목록
node ../box-sold-cdp/psa-nav-run.js $RUN/psa-browser.js $RUN/psa-card.json <오늘>  # 카드 행 + 세트별 팝 리포트 기준일(updated)
node tools/psa-card-pop-ingest.js $RUN/psa-card.json
node ../box-sold-cdp/psa-trend-run.js . $RUN/psa-trend.json                        # 세트 추이(일별 누적)
node tools/psa-trend-ingest.js $RUN/psa-trend.json $RUN/psa-card.json              # 일본판 주간 이력(날짜는 아래 'PSA 스냅샷 날짜'). 추이가 멈췄으면 세트 누적은 팝 리포트 합계로(2026-11-12)
node tools/psa-edition-weekly-ingest.js $RUN/psa-trend.json                        # 판별 누적 — 출력 gaps 의 주는 known-gaps.json 에 등록
node tools/import-gemrate-psa-history.js      # → packs.json 의 psaFull
node tools/import-gemrate-en-totals.js        # → packs.json 의 psaFullEn
node tools/inject-psa-wow.js

# 2) CGC — 카드별 + 세트(총량·Pristine 10/Gem Mint 10). 공개 API 라 collect-grading 이 매주 월요일
#    자동으로 돌린다. 그게 실패했을 때만 손으로 — 덤프 하나를 두 적재기가 같이 먹는다.
node tools/collect-cgc-card-pop.js "$TMP/cgc-dump.json"
node tools/cgc-card-pop-api-ingest.js "$TMP/cgc-dump.json"
node tools/cgc-set-grades-ingest.js "$TMP/cgc-dump.json"   # 세트 합 → cgc-grading-history (2026-09-30 전엔 버렸다)

# 3) 브라우저가 필요한 것 — 아래 "브라우저 수집" 참고
#    TAG 세트 · TAG 카드 · PSA 카드

# 4) 세트 누적을 화면에 반영 + 검증
node tools/inject-grader-editions.js          # → packs.json 의 graders (세트 누적)
node tools/inject-card-grades.js              # → packs.json 의 graderPop (카드별 등급, 확대창이 읽는 값)
node tools/build-grading-series.js            # 세트 × 등급사 × 주차 시계열
                                              # ⚠ 반드시 페이지 생성보다 먼저. 세트 페이지의
                                              #   "PSA inflow · 4 wks" 카드가 이 파일을 읽는다.
node tools/generate-set-pages.js && node tools/generate-card-pages.js && node tools/generate-ko-pages.js
node tools/audit-grading-numbers.js           # 숫자 검증 — 실패하면 배포 금지
node tools/audit-grade-attribution.js        # 귀속 검증 — 이 값이 정말 이 카드 것인가
node tools/audit-box-series.js               # 박스 그래프 점을 원장에서 재계산해 대조
node tools/audit-price-quality.js            # 가격 변형오매칭 + 신선도(관측일 없음/3주 초과)
                                              #   (변형·판·재수록본 오배정. 실패하면 배포 금지)
node tools/audit-collectors.js                # 브라우저 수집기가 실행 가능한 상태인지
node tools/audit-workflows.js                 # 워크플로 YAML 이 GitHub 에서 파싱되는지
node tools/audit-series-gaps.js               # 시계열에 빠진 날·주가 있는지(경매·TCG·진행매물 + 등급 카드별·세트 누적·판별 주간)
node tools/guard-invariants.js
```

## PSA 스냅샷 날짜 (2026-11-20)

일본판 주간 이력(`gemrate-psa-history.json` weekly)과 판별 누적(`psa-edition-weekly.json`)은 같은 선택기
`tools/psa-snapshot-select.js` 로 **ISO 주(월~일)마다 한 날**을 고른다. 두 원장 날짜는 늘 같다.
- 그 주 수요일에 41계열이 모두 실제 값(행 있음 · 상류 복사일 아님)이면 수요일.
- 아니면 주가 끝난 뒤 수요일에 가장 가까운 그런 날(수·목·화·금·월·토·일 순). 덤프 하나로 밀린 주를 모두 채운다.
- GemRate 가 10/27 뒤로 매일 갱신을 멈춰(10/28·10/29 복사, 그 뒤 11/06·11/13·11/14·11/16 만) 간격이 7일이 아닐 수 있다.
  증가분은 "직전 원장 날짜 → 이번 날짜" 사이 값이고 화면은 언제나 시작일 → 끝일(일수)로 적는다.

두 적재기 출력에서 볼 것:
- `gaps` — 끝난 주에 그런 날이 없다. 원장에는 아무것도 안 쓴다(보간 없음). 그 주를 같은 커밋에서
  `data/known-gaps.json` 'PSA 판별 주간' weeks 에 등록한다(사유: 출력 `days` 의 날짜별 have/of — 그날 몇 계열뿐이었나).
- `pending` — 아직 안 끝난 주의 수요일이 안 된다. 등록하지 않는다 — 다음 월요일 덤프가 다시 본다.
- `psa-edition-weekly-ingest` 가 exit 1(abort)이면 아무것도 안 썼다: (a) 원장 점이 덤프와 다름 (b) 원장 날짜가 덤프에서 복사일
  (c) 대상 계열이 덤프에 없음. `offenders` 를 보고 원인을 고친다 — 값을 손으로 맞추지 않는다.
  `psa-trend-ingest` 도 일본판 이력의 보관 날짜가 덤프에서 복사일이면 아무것도 안 쓰고 멈춘다((b)와 같은 검사).
- 팝 리포트 카드 합계는 세트 누적(일본판 latest · 영문판 총량) 대체에만 쓰고 원장 점으로는 안 쓴다 — 같은 집계지만 계열마다
  갱신일이 달라 41계열 공유 날짜 점을 못 만들고, 같은 날 추이 행 없이는 카드 누락을 확인할 수 없다.

## 브라우저 수집 (실브라우저 필수)

**PSA 카드별** — `collect-psa-card-pop.js` 는 이제 못 쓴다. GemRate 가 헤드리스 크롬을
봇으로 막는다("잠시만 기다리십시오"). 실브라우저에서 `fetch` 로 HTML 을 받아
`var RowData = '...'` 를 파싱한다. 주의 세 가지:
 - **반드시 gemrate.com 페이지 위에서** 실행한다. 다른 탭(eBay 등)에서 fetch 하면
   교차 출처로 전부 실패한다 — 2026-08-18 에 이걸 "요청 한도"로 오진했다.
 - 페이지는 표준 팝리포트 `item-details` 다(2026-11-02~ — `item-details-advanced` 는 같은 세트명에 빈 RowData 를 준다).
   필드는 `total`·`total_standard`(=`grades` 합, total 이 1~2 클 때가 있다 — 총량은 total)와 `grades[0..10]`(끝 두 칸이 9·10등급)이다. `total_graded` 는 없다 — 그걸 찾으면 감정 수가 전부 0 이 된다.
 - 같은 오리진 fetch 를 몰아 보내면 Cloudflare 가 "Just a moment" 뒤 "Access denied" 로 막는다(2026-11-02). 세트 사이를 4초 이상 둔다.
 - `card_number` 는 세트 접두어 없는 `"069"` 형식이다. `"OP05-069"` 와 직접 대조하면 하나도 안 맞는다.

**PSA10 등급 가격(실거래)** — eBay 가 sold 를 API 로 막아 브라우저로만 받는다.
  `node tools/psa10-sold-refresh.js --json` 으로 카드별 URL·추출기를 뽑고, 실브라우저에서
  같은 오리진 fetch 로 긁은 뒤 `node tools/psa10-sold-write.js <결과.json> --apply` 로 반영한다.
  채택 기준(표본 3건 이상, 기존값 대비 0.5~2배)은 그 스크립트에 박혀 있다 — 대역을 벗어나면
  값이 아니라 매칭이 바뀐 것을 먼저 의심한다(2026-08-31: x2.26 이 영문판 혼입이었다).
  언제 다시 받을지는 `audit-price-quality.js` 의 psa10_price_stale(35일)이 알려준다.

**TAG 세트·카드** — `tag-pop.js --setup` / `tag-card-pop.js --setup` 후 연도별로 훑는다.
SPA 라 느리고 렌더러가 얼기도 한다. 결과 회수는 다운로드가 막히므로
`document.body` 를 비우고 `<pre>` 에 렌더한 뒤 `get_page_text` 로 읽는다(40KB 까지 안전).
세트는 `window.__tagAgg()` → `node tools/tag-pop-ingest.js <파일>` 한 번이면 10·10P 분리값까지 담긴다.
분리값이 없는 옛 `__tagAgg` 출력은 적재기가 거부한다 — 그러면 `--setup` 을 새로 받아 다시 뽑는다
(2026-09-30: 분리 적재기가 따로 있었는데 이 절차에 없어서 8/3 뒤로 한 번도 안 돌았다).

## 왜 두 층을 같이 하나

세트 누적만 갱신하면 카드 합계가 옛 값으로 남고, 카드만 갱신하면 그 반대가 된다.
2026-08-19 점검에서 top10 합계가 세트 전체의 22~64% 로 전 세트 정상이었는데,
이 비율이 100% 를 넘으면 둘 중 하나가 낡았다는 뜻이다. `audit-grading-numbers.js` 가 그걸 잡는다.

## 죽은 필드 주의

`psaTotal` · `psaGem` 은 2026-07-15 수동 기입 후 갱신하는 코드가 없다.
화면은 `psaFull?.total ?? psaTotal` 순서라 지금은 안 쓰이지만, `psaFull` 이 빈 세트가
생기면 한 달 묵은 값이 조용히 나간다. 정리 대상.

## 그래프용 시계열

`data/grading-series.json` — 세트 × 등급사 × 주차 누적 감정. 증감(`add`)까지 계산돼 있다.
원장 셋(PSA `weekly`/CGC·TAG `jp`|`en`)이 구조가 달라서 그래프마다 형식을 맞추지 않도록
한 번만 정규화해 둔 파생 파일이다. 언제 다시 구워도 같은 값이 나온다.

```
OP-01 일본판
  PSA  2026-08-12  57,000  (+291)
  CGC  2026-08-17   6,666  (+11)
  TAG  2026-08-17     257  (+0)
  합계 63,923
```

`latestTotal` 은 각 등급사의 **최신 점**을 더한 값이다. 관측일이 회사마다 달라
"같은 날 합계"는 만들 수 없어서, 어느 날짜를 더했는지 `asOf` 에 같이 적는다.
젬 수는 합치지 않는다 — CGC 는 Pristine 10 과 Gem Mint 10 을 나누고 TAG 는 10 과 10P 가
따로라, 합치면 세 회사의 다른 잣대를 한 숫자로 뭉개게 된다.
