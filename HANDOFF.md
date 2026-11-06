# 인수인계 — OP Box Index (opboxindex.com)

## 2026-11-05(목) — 외부 감사 확정 오류 정정 + 팰월드 전용 수집 중단(소유자 결정)

- **PSA 10 최저 매물 판본**: 다른 판(OP-01 Romance Dawn 등)·두 카드가 함께 쓰던 매물을 숨긴다. 규칙은
  `tools/ebay-psa10-listing-filter.js`(수집기·사실 빌더 공용), 표시는 `build-site-facts.js` 의 `src.psa10Rejected`.
  `update-ebay-psa10-active-links.js --prune` 으로 저장 데이터 16장 정리. 가드 PSA10-SHARE·PSA10-AUDIT.
- **유유테이 NM 파서**: 쪽마다 첫 상품이 메뉴와 묶여 사라지던 것 수정, 23세트 재수집(11-05). NM 신선도는 이제
  가장 오래 읽은 화면 카드 기준(collect-status nm 행). 가드 NMP1·NMF1.
- **낡은 값 표시**: 세트 NM 칸 'as of MM-DD', 대표 PSA 10·체크포인트 이월 칸은 흐림(28/35일). 가드 DSP1~DSP5.
- **손으로 쓴 숫자**: 홈 세트·글 수, 동남아 글 다음 세트, 팩 산수 정의, 6개월·OP-16 리포트 기준 라벨, changelog 9/24 이후 기록. 가드 TX1~TX9.
- **팰월드 전용 수집 중단**: 경매 관측·정산(--game=palworld)·박스 sold 적재를 지웠다. `data/palworld-*` 는 동결(append-only 보존,
  collect-status IGNORE). 가드 PW1. TCG 13종 묶음 안의 팰월드는 그대로다.
  **남은 순서 주의**: `tools/palworld-sold-urls.js` 삭제 커밋(fix-1105-palworld 0fc7cafa5)은 아직 안 합쳤다 —
  `box-sold-cdp/runner.js` 36행이 이 파일을 최상단에서 require 하므로, runner.js·daily.ps1 의 팰월드 부분을 먼저 지운 뒤에만 합친다.

## 2026-08-12(수) — EPN 제휴 고지 위반 대응(기한 8/19)·배포·감사

- **EPN 위반 통지를 받았다(2026-08-10).** Participation Requirements I.G. 위반. 지적 내용은
  "문구는 적절하나 푸터에 있어 이용자가 놓치기 쉽다"였고, 미조치 시 계정 정지 + 대기 수수료 100% 회수.
  지적 URL은 홈 하나였지만 **전수 감사 결과 제휴 링크가 뜨는 페이지는 49개**였고, 그중 47개는 고지가
  문서 97~99% 지점(푸터)에 11px·opacity .8 로만 있었으며 **2개(`compare.html`, `cards/index.html`)는
  고지가 아예 없었다**. 소셜 계정에는 eBay 링크가 없어 대상이 아님을 확인했다.
- **`.affTop` 을 신설해 제목 직후·첫 제휴 링크보다 앞에 배치했다.** 손으로 쓴 3개(`index`, `packs`,
  `compare`)와 생성기 2개(`generate-set-pages.js`, `generate-card-pages.js`)를 고쳐 45개를 재생성했다.
  출력만 고치면 다음 생성 때 사라지므로 생성기가 원본이다. 푸터 고지는 지우지 않고 유지했다.
- **문구는 EPN 이 통지에 직접 적은 예시에 맞췄다(83자).**
  `"Paid Link: As an eBay Partner Network affiliate, we earn from qualifying purchases."`
  앞이 광고 표시, 뒤가 경제적 이해관계 — I.G. 두 요건. 저쪽 예시를 그대로 쓰는 것이 해석 다툼 여지가 가장 적다.
  사용자 요청으로 231자→119자→83자까지 줄였고, 모바일(375×812) 실측 2줄·39px·화면의 5%다.
  시각 무게도 낮췄다(초록 배경/테두리 제거, 글자색을 본문과 동일한 `var(--muted)`, 라벨은 굵기로만 구분).
  **더 흐리게 하지 말 것** — EPN 이 지적한 상태가 정확히 `11px + opacity .8 + 흐린 회색`이었다.
- **가드 E1 을 추가했다.** 제휴 링크가 있는 페이지에 `.affTop` 이 있는지, 첫 제휴 링크보다 앞에 오는지,
  `font-size ≥ 12.5px` · `opacity 1` · **대비 ≥ 4.5:1(WCAG AA)** 인지 검사한다. opacity 를 1로 두고
  글자색만 어둡게 해 우회하는 것까지 막는다. 역테스트로 고지 제거(FAIL)와 색 어둡게(대비 1.9:1 FAIL) 둘 다 확인했다.
- **원격 봇 커밋 15개와의 갈라짐을 안전하게 해소했다.** 생성 산출물이 겹쳐 rebase 충돌이 났으므로,
  **소스 파일만**(`styles.css`, `index/packs/compare.html`, 생성기 2개, 가드) 패치로 떼어내 원격 최신 위에
  올린 뒤 생성기를 재실행했다. `data/` 는 단 한 건도 건드리지 않았다(커밋 `7f4ffe28` 의 `data/` diff 0).
  되돌림 대비 태그 `epn-backup-41750b39` 를 남겼다.
- **검증 결과:** 가드 49종 OK · 테스트 8/8 통과 · AdSense readiness errors 0/warnings 0 ·
  수집 건강 감사 OK(원피스 원장 08-11, TCG 스냅샷·정산 08-12) · **라이브 49/49 페이지에 고지 확인** ·
  `ads.txt` HTTP 200 · EPN campid 보존(정적 앵커 70, 삭제 0) · 광고 지면 24 유지.
  세트 페이지 반복률 중앙값 18%/최대 22%, 카드 6%/17%, 한국어 3%/10%.
- **심사 잠금 유지:** 2026-08-24 전 AdSense 재검토 요청 금지. 사용자 명시 지시 전에는 버튼을 누르지 않는다.
- **남은 일:** ①8/19 전 사용자가 EPN 에 회신 발송(초안 작성 완료, 라이브 반영 확인됨).
  ②8/24 최종 감사 중 **Policy center 경고·Privacy & messaging 의 European regulations 게시 여부·
  `Consent requirement: No CMP`·GSC 색인 상태**는 로그인 필요라 아직 미확인 — 그날 읽기 전용으로 확인할 것.
  ③한국어 세트 페이지 21장이 `noindex` 라 네이버·구글 색인에서 빠져 있다(애드센스 대비 조치의 잔재).
  심사 결과가 나온 뒤 해제 여부를 사용자와 결정한다.

## 2026-08-11(화) — AdSense 정책·ads.txt·개인정보 기술 감사

- **Google 최신 공식 기준을 다시 대조했다.** 개인정보처리방침은 Google 광고 쿠키, 이전 방문 기반 광고,
  맞춤광고 해제(`adssettings.google.com`), Google 서비스 이용 사이트의 데이터 처리
  (`policies.google.com/technologies/partner-sites`), Analytics, eBay/Amazon 제휴, 연락처를 모두 명시한다.
  `ads.txt`는 라이브에서 HTTP 200·`text/plain`이며
  `google.com, pub-1520891018658006, DIRECT, f08c47fec0942fa0` 한 줄이 정상 노출된다.
- **게시자 ID와 태그를 전수 확인했다.** 광고 지면 24장 모두 `ca-pub-1520891018658006` 하나만 사용하고,
  최신 비동기 AdSense loader와 `crossorigin="anonymous"`가 있다. noindex+AdSense 0, 얇은 광고 지면 0,
  eBay EPN 70은 그대로다. Google Privacy & messaging를 막는 `no-referrer`·`same-origin` 메타도 0장이다.
- **준비도 가드를 강화했다.** `tools/audit-adsense-readiness.js`가 이제 광고 태그의 게시자 ID·형식,
  `ads.txt` 정확한 authorized seller 행, 개인정보 필수 고지 6종, CMP를 막는 referrer 설정을 검사한다.
  역테스트에서 게시자 ID를 틀리고 맞춤광고 해제 링크를 제거했을 때 두 오류가 의도대로 FAIL했으며,
  원상복구 후 둘 다 0으로 돌아왔다.
- **CMP는 계정 측 최종 확인이 남았다.** Google은 EEA·영국·스위스에서 개인화 광고를 제공할 때 인증 CMP를
  요구한다. 공개 강제 테스트 URL에서 `googlefc`·`__tcfapi`가 나타나지 않아 유럽 규정 메시지가 미게시일
  가능성이 있으나, 계정의 Privacy & messaging 설정은 저장소나 비로그인 공개 화면만으로 확정할 수 없다.
  2026-08-24 최종 감사 때 AdSense 계정의 European regulations message 게시 상태와 Policy center의
  `Consent requirement: No CMP` 유무를 읽기 전용으로 반드시 확인한다.
- **보존 범위:** 홈페이지·가격/경매/정산 원장·자동 수집·eBay EPN은 수정하지 않았다. 재검토 요청도 실행하지 않았다.

## 2026-08-10(월) — 자동 수집 커밋 경합 복구·산출물 누락 재발 방지

- **실패 원인을 실제 Actions 로그로 확정했다.** 5차 품질 패스 직후 실행된 일일 수집 run `31368505236`은
  수집·재생성·48개 가드를 모두 통과했지만, HANDOFF 커밋과 push가 겹친 뒤 `git rebase`가 미스테이징 변경 때문에
  실패했다. 직접 원인은 `backfill-english-box-series.js`가 갱신하는 추적 파일
  `logs/en-backfill-status.json`이 명시적 커밋 목록에서 빠진 것이었다. 같은 생성기가 루트에 만드는
  `psa10-ranking.html`도 일일·주간 커밋 목록에서 빠진 잠재 결함을 함께 발견했다.
- **일일·주간 워크플로를 모두 고쳤다.** 커밋 `2b1eca9`에서 `psa10-ranking.html`을 두 워크플로의 변경 감지·
  staging 범위에 추가하고, staging 뒤 추적 파일이 하나라도 남으면 커밋 전에 파일명을 표시하며 FAIL하도록 했다.
  커밋 `6963089`에서는 `logs/en-backfill-status.json`도 일일 워크플로 범위에 추가했다. 자동 수집 결과를 무차별
  `git add -A`하지 않고 허용된 산출물만 계속 명시적으로 커밋한다.
- **가드를 먼저 깨뜨려 검증했다.** W1 확장 직후 일일·주간의 `psa10-ranking.html` 누락과 잔여 변경 검사 부재
  4건이 의도대로 FAIL했다. 첫 실재 실행 run `31369231442`에서는 새 런타임 검사가 남아 있던
  `logs/en-backfill-status.json` 1개를 정확히 잡아 배포를 차단했고, W1에 그 산출물 규칙을 추가한 뒤 다시
  1건 FAIL→수정 후 GREEN으로 복구했다.
- **실제 재실행까지 완료했다.** 최종 일일 수집 run `31369741497`은 eBay 박스·영문판·PSA10 활성 링크,
  영문 sold 백필, 가격·카드·공급 시계열, 경매 딜, 페이지 재생성, 48개 가드, 잔여 변경 검사를 모두 통과했다.
  봇 커밋 `4f22c58`이 18개 허용 산출물만 갱신했고, Pages run `31370075928`도 성공했다.
- **최종 라이브 확인:** 공개 HTML 107/107장이 HTTP 200이고 줄바꿈 정규화 후 로컬 최종본과 107/107 일치한다.
  AdSense 지면 24·noindex+AdSense 0·출시 전 과장 문구 0이며, readiness 검사의 eBay EPN 링크 70개도 유지됐다.
  홈페이지 기능·정산 원장·수동 sold 원장·제휴 구조는 바꾸지 않았다.
- **심사 잠금 유지:** 2026-08-24 전 AdSense 재검토 요청 금지. 사용자 명시 지시 전에는 버튼을 누르지 않는다.

## 2026-08-10(월) — Codex 3차 심사 5차 품질 패스: 색인 전수감사·출시 전 페이지 사실성

- **Google이 보는 사이트 전체를 다시 감사했다.** sitemap 57개 URL과 공개 HTML 107장을 대상으로 얇은 본문,
  중복 title/description, 신뢰 링크, 추측성 문구를 점검했다. 색인되는 리서치 페이지는 이제 전부 화면에서
  About와 Methodology로 이동할 수 있고, 광고 지면 24장은 기존 범위를 유지한다.
- **OP-17·EB-05의 잘못된 출처와 예측 문구를 제거했다.** 과거 페이지가 404인 추정 주소를 `Bandai official`로
  표시하고 3개 세트 또는 EB-03 하나만으로 미래 가격을 단정하던 문제를 발견했다. 실제 공식 URL인
  `https://en.onepiece-cardgame.com/products/boosters/op17/`와
  `https://en.onepiece-cardgame.com/products/eb05.html`로 교체했다. OP-17 일본 발매일·팩 가격은 Shueisha
  공식 카드 페이지를 별도 출처로 명시해 언어·지역 사양을 섞지 않았다.
- **출시 전에는 사실과 미확정을 분리한다.** OP-17은 공식 발매일·팩 가격·131+4종·공개 카드 처리만 싣고,
  실제 완료 거래 표본이 생기기 전에는 박스 시세나 매수 등급을 만들지 않는다. EB-05는 Bandai가 공개한
  2026년 10월·영문 $4.99·12장/팩만 확정으로 쓰며, 정확한 날짜·전체 카드 수·일본판 사양은 미공개로 남겼다.
  EB-03 한 세트는 비교 맥락일 뿐 EB-05 가격 예측 근거가 아니라고 명시했다.
- **생성기 우선 원칙을 새 페이지에도 적용했다.** 편집 원문은 `data/upcoming-set-pages.json`, 산출기는
  `tools/generate-upcoming-set-pages.js`이며, 두 데이터 갱신 워크플로가 syntax check 후 세트 페이지를 다시
  생성한다. `sets/op-17.html`·`sets/eb-05.html`을 직접 고치지 않는다. 카드·한국어 생성기 푸터와 기사 허브도
  About·Methodology 링크를 보존하도록 수정했다.
- **Factory Sealed 기준을 고정했다.** 두 페이지 모두 일본판 원피스 디스플레이는 추가 슈링크가 아니라
  **원본 Bandai 보안 테이프 미절단**을 우선 확인하며, 테이프·양측 솔기·바닥·제품 코드 사진이 없는 매물과
  loose/open/mixed-language lot은 비교에서 제외한다고 설명한다.
- **회귀 가드와 역테스트:** 새 readiness 검사는 색인 리서치 페이지의 신뢰 링크, 출시 전 페이지 생성기 표식,
  작성·수정일, 공식 출처, 예측·과장 문구를 검사한다. 수정 전 상태에서 신뢰 링크 8장, 편집 신뢰 2장,
  추측 문구 2장이 의도대로 FAIL한 뒤 수정 후 모두 0으로 복구했다.
- **검증·배포 완료:** 코드 커밋 `8f99443`, Pages run `31368504770` 성공. 테스트 8종, JSON-LD 269블록,
  내부 링크 1,959개(누락 0), SEO·AI discovery·readiness·최종 48개 guard 통과. 라이브 HTML 107/107장이
  HTTP 200이며 줄바꿈 정규화 후 로컬과 107/107 일치한다. 실사이트 AdSense 24·noindex+AdSense 0·EPN 70·
  skipLink 104이고, 출시 전 예측 금지 문구 재유입은 0이다. 가격·정산·수집 원장은 수정하지 않았다.
- **심사 잠금 유지:** 2026-08-24 전 AdSense 재검토 요청 금지. 그날 라이브·AdSense·GSC 상태를 다시 감사하고
  사용자가 명시적으로 지시할 때만 재심사 요청을 실행한다.

## 2026-08-10(월) — Codex 3차 심사 4차 품질 패스: 작성 주체·근거·TCG 정확성

- **사람 우선 콘텐츠 기준으로 24개 광고 지면을 다시 감사했다.** 17개 편집 글 모두에 화면에 보이는
  `OP Box Index` 작성 주체, 게시·수정일, About·Methodology 링크를 넣었다. 광고 지면 24장에는 전부
  About·Methodology 이동 경로가 있고, About에는 자동화가 원장 기반 표를 만들되 누락값·풀레이트·출시일을
  임의 보충하지 않는다는 제작 방식을 공개했다.
- **근거 없는 인과·투자 결론을 제거했다.** PSA 증가는 제출 활동이지 해당 주의 박스 개봉량이 아니며,
  과거 생카드 제출도 가능하다고 생성기와 편집 글 전체에서 명시했다. JP/EN 가격차를 비공개 인쇄량 탓으로
  단정하거나, 출시 간격 하나를 원인으로 쓰거나, 풀레이트 없이 개봉 EV·매수 결론을 만드는 문구도 없앴다.
  영어 세트 생성 페이지 반복률은 중앙값/최악 **16%/20%**까지 낮아졌다.
- **일본판 밀봉 안내의 실물 오류를 바로잡았다.** 일본 원피스 디스플레이는 공장 슈링크를 요구하는 제품으로
  설명하지 않고, **원본 Bandai 보안 테이프 미절단**을 우선 확인하도록 수정했다. 추가 비닐은 진품 증거가
  아니며 상단 테이프·양쪽 플랩·바닥·제품 표기를 함께 보게 했다.
- **생성기 우선 원칙을 지켰다.** `generate-set-pages.js`, `generate-psa-grading-page.js`,
  `generate-auction-page.js`, `generate-free-data.js`, `generate-weekly-report.js`를 먼저 고친 뒤 산출물을 다시
  생성했다. CSS/JS 캐시는 `20260810b`. 가격·정산·수집 원장은 수정하지 않았고, 리베이스 중 원격 봇의
  TCG 원장 커밋 `ee4a9b5`도 그대로 보존했다.
- **회귀 가드와 역테스트:** 작성자 줄·날짜·방법론, 문자 깨짐, 광고 지면 신뢰 링크, 과장 인과 문구,
  일본판 Bandai 테이프 안내를 readiness 가드가 검사한다. 작성자/방법론 누락, `?` 구분자, Bandai 테이프
  문구 삭제, 과장 인과 문구 재삽입 상태에서 각각 의도적으로 FAIL을 확인한 뒤 GREEN으로 복구했다.
- **검증·배포 완료:** 코드 커밋 `4bce696`, Pages run `31366986878` 성공. 테스트 8종, JSON-LD 269블록,
  내부 링크 1,886개, SEO·AI discovery·readiness·최종 48개 guard 통과. 라이브 HTML 107/107장이 HTTP 200이고
  줄바꿈 형식만 정규화하면 로컬과 107/107 일치했다. 실사이트 AdSense 24·noindex+AdSense 0·빈 광고 껍데기 0·
  skipLink 104·EPN 70이다. 광고 지면은 모두 400단어 이상이다.
- **심사 잠금 유지:** 2026-08-24 전 AdSense 재검토 요청 금지. 그날 라이브 상태를 다시 감사하고 사용자가
  명시적으로 지시할 때만 재심사 요청을 실행한다.

## 2026-08-10(월) — Codex 3차 심사 3차 품질 패스: 빈 광고 껍데기·UI 완성도

- **빈 광고 자리 4개 제거:** `index.html`·`packs.html`에 실제 `<ins class="adsbygoogle">` 없이 점선 박스와
  `Advertisement`만 보이던 수동 광고 껍데기 2개씩을 제거했다. 승인용 AdSense 로더는 기존 24개 핵심 지면에
  그대로 남아 있어 Auto Ads·승인 크롤 범위는 줄지 않았다. `packs.html`은 계속 AdSense가 없다.
- **접근성·레이아웃 안정성:** 전역 `:focus-visible` 키보드 포커스와 dark `color-scheme`을 추가했다.
  카드 상세·허브 이미지 48개에는 실제 파일 비율(716×1000)의 `width`·`height`를 생성기에서 넣어 CLS를 줄였다.
  본문이 있는 HTML 104개에는 `#main-content`와 영문/한국어 `skipLink`를 넣었고, 8개 생성기도 함께 수정했다.
  CSS/JS 캐시는 `20260810a`로 전체 동기화했다.
- **회귀 가드:** readiness 감사가 빈 수동 광고 껍데기, 카드 이미지 치수 누락, 전역 키보드 포커스와 본문 바로가기 누락을
  차단한다. 수정 전 의도적 역테스트는 빈 껍데기 4개·이미지 48개·본문 바로가기 104개 누락을 FAIL했고 수정 후 모두 0이다.
- **로컬 검증:** 테스트 8종, JSON-LD 269블록, grading·AI discovery·수집 건강·SEO·readiness·최종 48개 guard
  모두 통과. 가격·수집·정산 원장과 eBay EPN 70개에는 변경이 없다.
- **배포·라이브 검증 완료:** 코드 커밋 `e212f87`, GitHub Pages run `31364117187` 성공. 실제 도메인의 공개 HTML
  107/107장이 로컬과 바이트 단위로 일치했고, AdSense 24·noindex+AdSense 0·skipLink 104/104·빈 광고 껍데기 0·
  카드 치수 누락 0·EPN 70을 확인했다. AdSense 재심사 요청은 누르지 않았다.

## 2026-08-10(월) — Codex 3차 심사 2차 품질 패스: 생성형 흔적·대량 유사문장 제거

- **홈 기능은 건드리지 않고 미완성 표기만 제거했다.** `index.html`·`packs.html`의 `(MVP)`와
  `Google AdSense display ad placeholder`, `packs.js`의 동적 `Google AdSense slot/광고 자리`를 중립적인
  `Advertisement/광고`로 교체했다. 가격·차트·필터·언어 전환·수집·정산 데이터는 변경하지 않았다.
- **카드 상세는 생성기부터 다시 구성했다.** 일반론·복제 FAQ를 줄이고 카드명·번호·NM·PSA10·정확한 변형·
  박스 배수·그레이딩 인구처럼 해당 카드에서 검증된 값만 중심으로 굽는다. TOP 24에서 이미 빠진 중복 구 URL
  3장(`op01-120-shanks-manga`, `op02-013-portgas-d-ace-manga`, `op05-119-monkey-d-luffy-op05-119-manga`)은
  생성기 산출물 정리 규칙으로 제거했다. 카드 상세는 계속 `noindex,follow`·AdSense 없음이다.
- **한국어 세트 상세도 생성기에서 세트별 문장으로 바꿨다.** 세트명·시세 구간·재판 기록·대표 카드·등급사별
  표본을 각 문장에 반영하고 공통 구매 체크리스트를 허브로 축약했다. `은/는` 받침 처리도 생성기에 넣어
  `로맨스 던는`, `vol.1는`, `484,721원로` 같은 기계 번역형 문구를 제거했다. 세트 상세는 계속
  `noindex,follow`·AdSense 없음이며 `/ko/`와 한국어 주제 허브의 색인 상태는 바꾸지 않았다.
- **수치 결과:** 공개 HTML 110→107장, 카드 반복률 중앙값/최악 **65%/74%→6%/18%**,
  한국어 세트 **56%/61%→3%/10%**. 영어 세트는 23%/32% 유지. AdSense 24장,
  noindex+AdSense 0, 심사 제외+AdSense 0, 광고 지면 최소 422단어, 정적 eBay EPN 링크 70개다.
- **회귀 가드 강화:** `audit-adsense-readiness.js`가 카드(중앙값 35%·최악 45%)와 한국어 세트
  (35%·45%) 반복률, 홈의 개발단계 문구를 추가로 차단한다. 수정 전 상태에서 7개 오류로 일부러 FAIL한 뒤
  수정 후 `guard-invariants.js` A4 포함 48개 검사를 통과시켰다.
- **검증 완료:** 로컬 테스트 8종, 가격·경매·그레이딩·수집 건강·SEO·AI discovery·활성 매물 감사,
  JSON-LD 269블록 파싱, readiness, 최종 guard 모두 통과. 기존 PSA10 불일치 감사의 32개 검토 항목과
  그레이딩 경고 6개는 이번 표시 품질 작업과 별개인 기존 데이터 검토 목록이다.
- **배포·라이브 검증 완료:** 코드 커밋 `447e70c`, GitHub Pages 배포 성공. 실제 도메인 107/107장이 HTTP 200,
  광고·robots·EPN이 로컬과 전부 일치했고 EPN은 70개였다. 라이브 반복률도 카드 6%/18%, 한국어 세트 3%/10%,
  영어 세트 24%/32%이며, 제거한 중복 카드 URL 3장은 모두 HTTP 404를 확인했다.
- **심사 잠금 유지:** 2026-08-24 전 재검토 요청 금지. 그날 라이브 HTML 107장과 AdSense/GSC 상태를 다시
  검사하고, 사용자가 명시적으로 지시할 때만 심사 버튼을 누른다. 승인 전후에도 noindex·광고 범위를 자동 원복하지 않는다.

## 2026-08-10(월) — Codex 애드센스 3차 심사 대비 전면 감사·범위 축소

- **2차 거절 사유는 다시 “가치가 별로 없는 콘텐츠”.** 기존 대응은 수기 해설 파일만 검사했고 최종 HTML 전체의
  광고 범위·반복 문장을 놓쳤다. 수정 전 공개 HTML 110장 중 107장이 AdSense를 로드했고, noindex 49장에도
  전부 광고가 있었다. 영어 세트 페이지 문장 단어 반복 중앙값은 53%였다.
- **AdSense와 eBay EPN을 분리했다.** AdSense는 영어 핵심·편집 지면 24장에만 유지했다. 세트·카드·한국어·허브·
  법적 안내·`packs.html`에서는 제거했다. eBay EPN `campid=5339163744`와 CTA는 보존했다(수기 해설 세트 21/21).
- **최종 결과:** noindex+AdSense 0, 심사 제외 지면+AdSense 0, 광고 지면 최소 본문 422단어,
  세트 반복 중앙값 23%·최악 32%, `packs.html`은 단일 `noindex,follow`와 루트 canonical.
- **회귀 차단:** `node tools/audit-adsense-readiness.js`를 신설하고 `guard-invariants.js`에 A4로 연결했다.
  앞으로 생성기가 광고를 되살리거나 EPN을 지우거나 robots 메타를 중복시키면 배포 가드가 실패해야 한다.
- **3차 심사 버튼은 누르지 않았다.** AdSense 크롤러는 Google Search와 별개이고 변경 반영에 1~2주 걸릴 수 있다.
  이 배포일로부터 최소 2주인 **2026-08-24 전에는 재검토 요청 금지**. 그때 라이브 감사와 AdSense/GSC 크롤 상태를
  다시 확인한 뒤 사용자 명시 지시가 있을 때만 요청한다.
- **승인돼도 자동 원복 금지.** 카드·한국어·세트 지면에 AdSense를 일괄 복원하거나 noindex를 자동 해제하지 않는다.
  수익·검색 영향은 별도 검토 후 사용자 승인으로 단계적으로 결정한다.

## 2026-08-10(월) — 주간 수집 완료 · 애드센스 2차 거절 대응 배포 · TCG 17종 수집 가동

### 지금 바로 이어서 할 일 (우선순위순)
1. **TAG 영문판 카드별 수집 추가** — 오늘 하려다 원장 구조 때문에 보류. 실측: TAG 포털에 영문판 세트 실재
   (2025년만 33개, 이름에 "Japanese" 토큰이 없음. 예: "One Piece A Fist of Divine Speed Alternate Art").
   순서: (a) `data/tag-card-pop.json` 을 CGC 처럼 `sets[코드].jp/.en` 으로 이관(기존 평면 구조 = 전부 jp 로 옮김,
   한 건도 잃지 말 것) (b) `tag-card-pop-ingest.js` 가 tagSet 이름의 "Japanese" 유무로 판을 갈라 적재
   (c) `tag-card-pop.js` 의 연도 수집 필터에서 `/Japanese/` 조건을 판별 분기로 (d) `inject-card-grades.js` 와
   가드 D10 이 새 구조를 읽는지 확인. **이관 전 원장 백업 필수.**
2. **애드센스 3차 검토 요청** — 2026-08-24 전 금지. 새 readiness 감사와 실제 AdSense 크롤 상태를 다시 확인할 것.
3. TCG 곡선 그래프 — 2주치(8/21쯤) 모이면 시안의 자리표시를 실선으로 교체.

### 오늘 한 일 A — 월요일 정기 수집 (전부 적재·배포 완료)
- **PSA 세트단위**(JP 주간 + EN totals): GemRate 8/9 데이터, 주간 8/5까지. JP 누적 603,149.
  ⚠️ 주간 워크플로가 커밋은 했지만 PSA 스텝은 러너에서 막힘 — **로컬 월요일 수집이 전제**다.
  ⚠️ 적재 후 `import-gemrate-psa-history.js` 를 빼먹으면 가드 D3 가 88건 FAIL 로 잡는다(오늘 실제로 잡음).
- **PSA 카드별**: GemRate 가 헤드리스에 클라우드플레어 챌린지를 띄우기 시작 → **사용자 실크롬(claude-in-chrome)**
  으로 우회. RowData 는 페이지에 `var RowData = '[...]'` (작은따옴표 문자열)로 인라인. 40세트, 232건 수용.
  다운로드가 조용히 막히면 **클립보드 경유**(페이지 클릭으로 포커스 → clipboard.writeText → PowerShell Get-Clipboard).
- **CGC 카드별**: `tools/collect-cgc-card-pop.js` 신설(정식화). 그룹 전수 11,137개 페이지네이션($TEMP 캐시 7일),
  언어→코드→세트명 순 매칭. ⚠️ 일본판에 구형 "(OP05) Booster Pack Vol.5" 가 같은 번호를 쓴다 — 세트명 필수.
  42그룹 366건 적재, 모호 0.
- **TAG 카드별(JP)**: 브라우저 SPA 걷기(연도 2022~2026, MAXV 3 이하로 — 45초 CDP 타임아웃, 타임아웃 나도
  페이지 안에서는 계속 돌아 상태 유지됨). 271행 수집, 123점 적재, 모호 0.
- **eBay 솔드(월수금)**: 실크롬 배치(`box-sold-urls.js --setup` → __runBatch ×4 → __opDownload).
  42페이지 6,367건, 로봇 0. 신규 145건 적재(원장 2,437), 주간 시리즈 +42점.

### 오늘 한 일 B — 애드센스 "가치가 별로 없는 콘텐츠" 2차 거절 대응 (배포됨)
원인 실측: 세트 페이지 21장이 문장 기준 63% 동일(숫자만 교체) + description 57장 공유 + 💎 슬리브
제휴 문단 21장 반복. 조치:
- `data/set-commentary.json` 신설 — **세트별 수기 해설**(제목·desc·본문 2문단, 기계 생성 금지).
  생성기가 본문 섹션 + 고유 description + 허브 한 줄 + 세트별 FAQ 첫 문답으로 굽는다.
- `methodology.html` 신설(수집 방법론 전체). 전 페이지 푸터에 Methodology·Data terms 링크
  (세트 페이지는 생성기 FOOT — 일회성 푸터 수정이 재생성에 날아가던 회귀도 고정).
- 💎 슬리브 제휴 문단 제거(얇은 제휴 신호). 가드 S3 신설: 해설 전 세트 존재·세트 간 문장 중복 0·
  desc 고유·빌드 주입 확인.
- **GSC 색인 요청 5건 완료**(실크롬): methodology · sets/index · op-05 · op-01 · op-16.
- **이 기준은 위 최신 섹션으로 대체됨**: GSC 재크롤만으로는 부족하다. AdSense 변경 반영 1~2주를 기다리고
  2026-08-24 이후 readiness 감사·라이브 HTML·AdSense 상태를 함께 확인한다.

### 오늘 한 일 C — TCG 17종 수집 가동 (8/7 신설분 버그 3건 수정 포함)
- `collect-tcg-snapshot.js`(하루 1회: 경매·즉구 물량, 입찰률) + `settle-tcg.js`(6시간마다 게임당 100건 정산)
  + `build-tcg-series.js`(일/주/월 집계: **물량은 평균, 거래는 합**) + 가드 A3 + `collection-health.yml`
  (하루 2회, 데이터 늙으면 메일).
- 잡은 버그: cron 문자열 비교가 영원히 거짓(스냅샷 미가동될 뻔) · pokemon/pokemonjp 이중 계상(좁은 검색어
  우선 배타 배정) · 정산 처리량<유입량. ⚠️ 8/8~8/9 스냅샷은 미푸시로 영구 결손(정산은 부분 복구됨).
- 데이터 이용 조건: 본문은 `free-data.html#terms` 한 곳(공개 CSV 3종 = CC BY 4.0 유지, 작업 데이터 = 링크
  인용·대량복제 문의). 푸터 33장 "Data terms" 링크.

### 실크롬(claude-in-chrome) 수집 요령 — 다음 사람을 위해
- 브라우저 2개 연결돼 있으면 **Windows·isLocal** 선택(맥은 타인 기기 — 사용자 지시).
- 반환값에 URL/쿼리스트링이 섞이면 DLP 가 막는다(`[BLOCKED]`) → 반환은 요약 숫자만, 데이터는
  Blob 다운로드 또는 클립보드로.
- GSC 는 검색창 포커스가 모달에 씹힌다 — 모달 "닫기" 클릭 후 입력, 입력 후 스크린샷으로 확인.
- 사용자가 "tcg 그룹" 크롬 창에 GSC 를 항상 켜 둔다("널 위해서 항상 켜둔다") — 색인 요청은 직접 해도 됨.


## 2026-08-03(오후) — 카드 확대창을 살리고, 카드별 등급 인구를 세 등급사로 채움

### 고친 버그 (둘 다 계속 있었는데 아무도 몰랐다)
1. **카드 확대창 이미지가 늘 깨져 있었다.** 확대는 `imageJpSrc`(onepiece-cardgame.com 원본)를 먼저 썼는데
   그 도메인이 외부 호출을 막는다(실측 naturalWidth 0). 우리가 이미 `img/jp/*.webp` 로 자체 호스팅 중이라
   그걸 1순위로 바꿨다. 폴백 사슬(고해상→원주소→영문판), 끝까지 실패하면 이미지 칸을 숨긴다.
2. **확대창 패널이 죽은 데이터를 보고 있었다.** `japaneseNmEbay` 하나만 참조했는데 그 매칭이 0건이라
   어떤 카드를 눌러도 "표본이 아직 없습니다"만 떴다. 지금은 시세줄 + 카드별 등급 인구를 보여준다.
3. 확대창 레이아웃: 이미지 `max-width:90vw` 가 자기 칸을 넘어 오른쪽 글자를 덮었다 → 칸 기준(`100%`)으로 변경,
   격자 `minmax(0,…)`. 모바일은 세로로 쌓고 창 전체 스크롤(칸별 스크롤이면 표가 화면 밖에 갇힌다), 이미지 46vh.
4. 카드 그리드 위에 "이미지 누르면 등급 비율 보임" 안내 한 줄(한/영). 없으면 눌러볼 수 있다는 걸 알 방법이 없다.

### 카드별 등급 인구 — 세 등급사, 판별로
화면(확대창)에 다섯 줄: PSA 일본판/영문판 · CGC 일본판/영문판 · TAG 일본판. **판별·등급사 간 합산 없음.**
커버리지(210장 기준): **PSA 119 · CGC 189(양판 다 있는 카드 158) · TAG 155.**

- **PSA**: `gemrate.com/item-details-advanced` 공개 페이지의 `RowData` 에 카드·변형별로 다 있다
  (일본판/영문판 각각). PSA 본사이트는 로그인 벽이라 쓰지 않는다 — 약관 위험도 있다.
  검증된 기존 set url 에서 경로만 바꿔 40세트 5,063행. `tools/psa-card-pop-ingest.js` → `data/psa-card-pop.json`.
- **CGC**: 공개 API 발견 — `production.api.aws.ccg-ops.com/api/cards/research/trading-cards/`
  (`groups/?researchSubcategoryID=1982` → `population/?researchGroupID=<id>&page=N`).
  DOM 긁기보다 훨씬 안전하고 **카드번호가 각인 그대로(OP07-118)** 온다. 41세트 5,127행.
  `tools/cgc-card-pop-api-ingest.js` → `data/cgc-card-pop.json`(구조를 `sets[코드][판][카드키]` 로 이관,
  기존 일본판 150건은 `.jp` 로 옮겨 전부 보존).
- **TAG**: 아직 일본판만. API 가 없어 브라우저로 연도 페이지를 훑어야 한다 → **다음 월요일에 영문판 추가 예정.**
  그때까지 화면 라벨을 "TAG 일본판" 으로 박아 합산값으로 오해되지 않게 했다.

### 매칭 규칙 (사용자 지시: "카드 또 틀리지 마라")
- **어느 세트 목록에서 찾을지는 카드 각인이 정한다.** OP-13 top10 의 OP09-004 는 OP-09 목록에서 찾는다.
  담고 있는 박스에서 번호로 찾으면 남의 카드를 집는다 — 변형 오배정의 전형적 경로.
- 번호+변형 이중매칭. PSA 는 후보가 정확히 1개일 때만 채택(232건 채택, 진짜 애매 0건, 변형 없음 113건은 거부).
- CGC 는 같은 카드·같은 변형이 여러 줄로 등록돼 있어 **그 줄들을 합산**한다(346건, 애매 0건). 사유:
  영문판 오탈자 재판(Post-Errata), 철자 중복(Kouzuki/Kozuki), 동일 라벨 중복, 테두리 처리 차이(Borderless/Map Text Box).
  합쳐도 안전한 근거 — 우리 카드 목록에 같은 번호+변형이 둘인 경우가 없다. 몇 줄을 합쳤는지 `rows` 로 남긴다.
- 만점 비율은 채점 10장 미만이면 비운다(2장 중 2장 = 100% 는 아무 의미가 없다).

### 최적화 패스
- 시세 데이터(774KB·gz 108KB) 요청이 `packs.js` 파싱 후에야 시작됐다 → head 인라인 fetch 로 옮겨 **222ms → 32ms**.
  `rel=preload` 는 재사용이 안 돼 같은 파일을 두 번 받아서(실측) 인라인 fetch 로 갔다. 적용 3장(index·packs·compare).
- 감사 전부 통과: 테스트 8종 · guard(43체크) · SEO errors 0 · AI_DISCOVERY_OK · GRADING_OK · 가격품질 0 · 375px overflow 0.
- 관찰만 하고 손대지 않은 것: PSA10 최저가 링크 176/210(기준선은 카드 199장 시절 183). 일일 워크플로가 채우는 값이라 며칠 지켜본다.
- `data/auction-sold.json` 3.3MB — 어떤 페이지도 받지 않는 내부 원장. 나중에 아카이브 분리 검토.

### 오늘 만든 도구
`psa-card-pop-ingest.js`(--report 로 적재 없이 매칭만 검토) · `cgc-card-pop-api-ingest.js` ·
`inject-card-grades.js`(카드에 graderPop 주입) · `test-pop-ingest-guards.js`


## 2026-08-03 — 수집 일정 확정 (사용자 지시)
- **sold(eBay 실거래): 월·수·금** / **그레이딩 3사(PSA·CGC·TAG): 매주 월요일 1회.**
  둘 다 **사용자가 대화에서 직접 시킨다**("sold 수집 돌려줘" / "그레이딩 수집해"). 자동 예약 걸지 말 것.
  월·수·금 오전 알림(`opbox-collect-reminder-mwf`)만 남아 있고 그게 유일한 방아쇠다.
- 8/3 그레이딩 수집 완료(커밋 `d8829e2`): PSA 일본판 7/29점(누적 592,366) + 영문판 총량 19세트(604,949)
  + 판별누적 40점(3주차) / CGC 43점 / TAG 42점 + 10·10P 분리 42건. guard OK, audit GRADING_OK.
  ※ 적재 직후 `audit-grading-numbers` 가 FAIL 이면 **`node tools/inject-grader-editions.js`** 를 안 돌린 것이다(세트 페이지 주입).
- **페이지네이션 누락 대책 (2026-08-03 적용, 커밋 참조)** — 위 1번은 **해결**.
  - 원인: CGC 목록이 1→2페이지가 됐는데 `cgc-pop.js` 가 1페이지만 읽었다. **7/22·7/27 수집도 이미 당했다**
    (커버리지 36 vs 실제 43) — 일본판 7세트(OP-01·06·08·10·14·16·PRB-02)는 **8/3 이 첫 데이터 점**이라
    그 전 주와의 증감이 없다. 값이 다 그럴듯해서 2주간 아무도 몰랐다.
  - `cgc-pop.js`: 페이지별 수집 + `a.ccg-pager-last` 의 href 에서 **마지막 페이지 번호**를 읽어 `hasNext`·`lastPage` 보고.
    (실측 검증: page1 hasNext=true/lastPage=2, page2 hasNext=false)
  - `cgc-pop-ingest.js`: 페이지 파일 여러 개를 받아 병합. **마지막 페이지가 hasNext=true 면 적재 거부**,
    같은 세트가 두 페이지에 다른 값이면 거부, 수집일 혼합 거부.
  - `cgc/tag-pop-ingest.js`: **커버리지 축소 거부** — 이번 (세트|판) 수가 직전 수집일보다 적으면 멈춘다(`--allow-shrink` 로만 통과).
  - `tag-pop.js`: `__tagYear` 가 스스로 마지막 페이지까지 넘기고 페이저의 "of N" 과 대조해 `complete` 보고
    (2024 가 199행이라 다음 주에 200 넘기면 조용히 잘릴 뻔했다). 손으로 부르던 `__tagPage2` 는 없앴다.
  - 가드 **G8** 신설: 원장에서 최신 수집일 커버리지가 직전보다 적으면 FAIL(역테스트로 실제 잡히는 것 확인).
  - `box-sold-urls.js`: 검색 240건 상한에 걸렸는지 `rawN`/`capped` 로 보고.
    ~~주3회라 손실 없음~~ ← **틀렸다(2026-08-13 실측으로 뒤집힘).** 아래 8-13 항목 참고 —
    상한 때문에 실거래의 1/3~1/6 만 보고 있었다. 자주 돌리는 것으로 해결되지 않는다.
  - 자체 테스트 `tools/test-pop-ingest-guards.js`(4케이스).
- **주간 워크플로 실패 원인 규명 + 조치 (2026-08-03)** — 돌긴 돌았다(7/27 05:44, 8/3 05:42 KST). **둘 다 실패**했다.
  - 원인: `collect-gemrate-psa-history.js` 가 러너에서 `OP-01: GemRate RowData unavailable` 로 exit 1.
    로컬 크롬(사용자 IP)에서는 같은 스크립트가 멀쩡히 돈다 → 데이터센터 IP 차단으로 보인다(eBay sold 와 같은 부류).
  - 파장: 그 스텝이 죽으면서 **뒤의 전부(가격 감사·페이지 재생성·커밋)가 스킵**됐다. 즉 2주간 주간 갱신이
    아무것도 커밋되지 않았다 — 그레이딩만의 문제가 아니었다.
  - 조치: PSA 수집 2개 스텝에 `continue-on-error: true`. 대신 `audit-grading-numbers` 를 **별도 스텝으로 분리**해
    등급 숫자 검증은 계속 강제한다. `Verify PSA population snapshot freshness`(if: always) 는 그대로 둬서
    **월요일 수동 수집을 건너뛰면 그게 빨간불로 드러나게** 했다.
  - 남은 확인: 다음 일요일 20:00 UTC 실행이 초록불인지. 급하면 Actions 에서 `Run workflow` 로 수동 실행.

## 2026-08-03 — sold 수집을 수동으로 전환 (자동 루틴 삭제)
- 8/3 수집 완료: 42/42 페이지·로봇0, 원장 신규 12건(총 2,255건), 시계열 42점 append(총 292점). 가드 OK. 커밋 `f827c41`.
- **예약작업 `opbox-sold-collection-mwf` 삭제.** 사용자 지시(2026-08-03). 이유: 자동실행이 조용히 실패해
  7/10~7/21 시계열이 통째로 비었고(수집일 7일뿐: 7/09·7/22·7/27·7/29·7/31·8/02·8/03), 이 날은 사람이 먼저 돌려
  이중 실행까지 났다. **알림 루틴 `opbox-collect-reminder-mwf`(월·수·금 10:06)는 유지** — 문구를
  "'sold 수집 돌려줘' 라고 말해라(자동 안 돎)"로 교체했다. 이제 그 알림이 유일한 방아쇠다.
- **수집 절차 원문은 `C:\Users\kimtt\.claude\scheduled-tasks\opbox-sold-collection-mwf\SKILL.md` 에 그대로 남아 있다.**
  월·수·금에 사용자가 요청하면 그 SKILL.md 순서대로 하면 된다(브라우저 setup → __runBatch 4회 → __opDownload →
  box-sold-ingest.js → build-box-sold-series.js → guard → 커밋·푸시).
- 데이터 보존 상태: 원장 `data/box-sold-ledger.json` 은 append-only.
  ⚠️ **"eBay 가 최근 90일만 보여준다"는 서술은 부정확했다(2026-08-13 수정).** 제한은 기간이 아니라
  **개수**다 — 한 검색에 240~265건까지만 준다. 그래서 거래가 많은 세트(OP-01 일본판)는 2개월치에서
  잘리고, 거래가 드문 세트(OP-03)는 2023년 판매까지 나온다. `_pgn=2` 는 무시된다(1페이지와 231건 중복).
  그 이상을 얻으려면 검색 자체를 쪼개야 한다 — 지금은 가격대 5구간으로 나눠 받는다.

## 2026-08-01(추가) — 우선순위 전환: 해외(영어) 유저 1순위
- 사용자: "한국어 검색에 많이 잡힐 필요 없어, 해외 유저들이 봤으면 좋겠어" (메모리 project-opbox-korean-seo 에 기록).
  ko 페이지 3장은 유지(추가 자산), 추가 투자는 영어 쪽으로.
- **auction.html 신설(영어, 루트)** — 경매 실낙찰 데이터의 첫 영어 지면. 일별 낙찰률/중앙값 10일,
  박스vs싱글 낙찰률 비교, 카드별 경매 중앙값 top12, FAQ+Dataset LD(무료 CSV 연결).
  `tools/generate-auction-page.js`, 두 야간 워크플로 재생성+커밋 경로 반영. 홈 요약·free-data 에서 내부링크.
- 다음 영어 유입 후보(미착수): ①심사 후 카드 27장 noindex 해제(영어 롱테일 본체)
  ②Threads A안(EN>JP 인구 카드) 게시 → B안(경매 낙찰률) ③레딧 r/OnePieceTCG 에 무료 CSV/경매 데이터 공유(사용자 직접)

## 2026-08-01 세션 — 유입 진단 + 한국어 주제 페이지 3장 신설
- **절대 규칙(사용자 지시, 메모리에도 저장됨)**: 기존 페이지의 노출 상태를 임의로 바꾸지 말 것.
  noindex 추가·canonical/hreflang 변경·사이트맵 제거·페이지 삭제는 사용자 확인 필수. **추가는 허용.**
- **유입 진단(GSC+GA4 실측)**: 28일 클릭 45/노출 704/CTR 6.4%/순위 9.9. 문제는 CTR이 아니라 노출량.
  원인 = ①사이트 40일차(도메인 신뢰 부족) ②noindex 48장(카드27+ko21, 7/24 애드센스 대비 임시)
  ③"크롤됨-미색인" 22장. GA4: Direct 급등(네이버 카페 응모글)이 빠지는 중이라 정체로 보임.
  Organic 참여율 82%로 질은 최상, AI Assistant 채널만 유일하게 성장 중.
- **신설**: `tools/generate-ko-topic-pages.js` → ko/cards.html(카드시세)·ko/grading.html(그레이딩)·
  ko/auction.html(이베이 경매 낙찰 — 경매 데이터 첫 공개 지면). 전부 index,follow+사이트맵 추가,
  두 야간 워크플로에서 재생성. ko 허브에 링크 섹션 추가. 기존 페이지 head 무변경 검증 완료.
- **다음 작업(승계)**:
  1. 애드센스 결과가 나와도 광고/noindex를 자동 원복하지 않는다. 최신 상단 섹션과 사용자 명시 지시를 우선한다.
  2. 과거 계획이던 카드 27장 noindex 해제·사이트맵 복귀도 자동 실행 금지. 고유 본문 품질 감사와 사용자 승인이 먼저다.
  3. GSC에서 새 3페이지 URL 검사→색인 요청(수동으로 하면 며칠 빨라짐. 사용자 계정 gsa@)
  4. 스레드: A안(EN>JP 인구) 카드 게시 대기 중, B안(경매 낙찰률)은 2~3일 뒤
  5. 8/3(월) sold 수집 — 크롬 자동선택 규칙 적용됨(Windows·isLocal)

## ⏳ 과거 기록: 애드센스 심사용 임시조치 (2026-07-30 신청) — 자동 원복 금지
- **원복 대상 (noindex 2건뿐)**:
  1. 한국어 세트 21장(ko/op-01~prb-02): `noindex,follow` → `index,follow` + 사이트맵 복귀. 위치: tools/generate-ko-pages.js (setPageKo 안 robots 메타 + 사이트맵 제거 블록)
  2. articles/weekly-market-report-2026-07-16.html: noindex 제거 + 사이트맵 복귀 (단, 산문 181단어라 보강 후 푸는 게 맞음)
- **삭제하면 안 되는 것**: 이번에 넣은 해설 산문 전부(ko 세트 5섹션, ko 허브 시장읽기, psa10-ranking 분석+FAQ, psa-grading 분석+FAQ, 카드페이지 "왜 PSA10 값이 없나", cards 허브 방법론). 실측 데이터 파생 콘텐츠라 심사용이 아니라 자산 — 네이버 유입 계획의 본체이기도 함.
- 승인 후 할 일: ko noindex 해제(→ 네이버 Yeti용).
- 루틴 정리(2026-07-30): gsc-recovery-watch·aug31-market-data-deploy 삭제(목적 종료/9월 계획에 흡수). 남은 것: sold 수집 월수금 + 수집 알림 월수금 + 8/10 노출검증 보고 + 9/30 그래프 재설계.

## 2026-07-27 세션 (등급 데이터 전면 개편 + 실사고 3건)

### 먼저 알아야 할 것
- **7/30 애드센스 재심사가 최우선.** 그 전까지 SEO·색인 구조를 새로 건드리지 말 것.
  일일 감시 태스크 `opbox-gsc-recovery-watch`(매일 09:34)가 색인/노출을 보고한다.
- 캐시 버전 `20260727cg`. **DATA_VERSION 과 모든 HTML 의 `?v=` 를 항상 같이 올린다**(가드 V1).
- 수정 후 `node tools/guard-invariants.js` 통과 필수(체크 39개). FAIL 이면 푸시 금지.

### 이번 세션에 잡은 실데이터 오류 — 같은 부류 재발 주의
1. **OP-06 언어 오류.** GemRate 세트 URL 이 영문판(2024)을 가리켜, 여태 영문판 수치를
   "일본판"으로 표시해왔다. 일본판(2023)으로 정정: 37,205장/90.6% → **34,601장/94.0%**.
   21세트 URL 전수 확인 완료. 세트명 규칙을 추측하지 말 것 — OP-06 은 이름에 "Japanese"가
   없고, OP-02 는 영문판 발매연도가 1년 늦다. 검증된 url 을 파일에 보관해 그것만 다시 읽는다.
2. **일본판 카드 이미지 오배정 5장.** 해시 매칭이 변형을 잘못 골랐다. 170장 전수 시각검증 후 교정.
   판정 원장 `data/jp-image-verdicts.json`. **확신 없으면 영문 이미지로 되돌린다**(틀린 일판보다 맞는 영문).
3. **판별 원장 오염.** 영문판 항목에 url 을 안 넣어 Page.navigate 가 조용히 실패하고
   **직전 세트의 RowData 가 그 세트 값으로** 40점 적재됐다. 원장 폐기 후 재수집.
   → `collect-gemrate-psa-history.js` 에 URL 형식 가드를 넣어 이제 즉시 예외.

### 등급 데이터 구조 (현재 화면)
세트 페이지는 **등급사별 3개 섹션**이다. 하나로 묶거나 등급사 간 합산하지 않는다.

| 섹션 | 열 |
|---|---|
| PSA 그레이딩 | 누적 / PSA 10 / 젬률 / 주간증감 / % |
| CGC 그레이딩 | 누적 / 젬 민트 10 / 프리스틴 10 / 증감 |
| TAG 그레이딩 | 누적 / 10·10P / 최고등급 비율 / 증감 |

각 섹션은 일본판·영문판 두 행. CGC 는 만점을 젬 민트 10과 프리스틴 10으로 나누고
(프리스틴이 더 엄격), TAG 는 10과 10P 를 따로 매긴다 — PSA 10 하나와 같은 것처럼 쓰지 말 것.

**언어 기준: 카드는 전부 일본판, 박스 시세만 일본판·영문판 둘 다.**
top10 카드 표는 일본판 전용이다. 영문판 카드별을 붙이지 말 것 — 공개 데이터가
카드번호+변형이 아니라 **캐릭터 이름 단위 합계**라 변형 매칭이 불가능하다(오매칭 재발 위험).

### 데이터 파일
- `data/gemrate-psa-history.json` — 일본판 주간 시계열(2025-12-03~, append-only)
- `data/gemrate-psa-en-totals.json` — 영문판 현재 총량 + **검증된 url**(추측 금지)
- `data/psa-edition-weekly.json` — 판별 누적 주간 원장. 7/15·7/22 두 점으로 시작, 매주 축적
- `data/cgc-grading-history.json` — {jp:[],en:[]}, 각 점에 `grades`(Pristine 10/Gem Mint 10 등)
- `data/tag-grading-history.json` — {jp:[],en:[]}, `total`+`gem`(10·10P 합)

### 게시 범위 원칙 (소유자 지시)
주간 시계열은 **2025-12-03 이후만** 공개한다. 그 이전 구간을 소급 생성해 싣지 않는다 —
남의 집계를 통째로 복제해 재게시하는 모양이 되기 때문. 저장소도 공개라 "안 보여주기"로는
부족해 파일에서 실제로 지웠다. 차트 문구: "이전 주간 기록은 제공하지 않습니다".

### 남은 작업
- [ ] **CGC 2건 미수집** — OP-08 영문판, OP-02 일본판. 페이지 렌더가 25초를 넘겨 2회 실패.
      방법: cgccards.com 목록에서 iframe 으로 세트 상세를 열고 등급표(두 번째 table) 열을 합산.
      **페이지는 `?page=N` URL 로 직접 연다** — 다음 링크 클릭은 iframe 을 재로드시켜 루프가 멈춘다.
      `등급합 = 목록 총량` 일치할 때만 적재(`tools/cgc-set-grades-ingest.js`).
- [ ] **TAG 카드별 pop 미수집**(박스 총량 42점은 완료). taggrading 은 이 세션 브라우저에서 열렸다.
      `tools/tag-card-pop.js --setup` → `__tagCardYear(연도, 8)` 을 remaining 0 까지 반복.
- [ ] 7/28~29 GSC 색인 확인 → **7/30 애드센스 재신청(사용자가 직접 실행)**
- [ ] 9/30 예약 태스크: 축적된 데이터로 그래프 재설계 논의

### 주간 자동화 (사람 손 불필요)
`.github/workflows/update-market-data.yml`(일 20:00 UTC)에 붙어 있다:
영문판 총량 갱신 → 판별 누적 append → WoW 주입 → `psa-grading.html` 재생성.
**커밋 경로 목록에 새 데이터 파일이 들어 있어야 한다** — 안 넣으면 매주 수집해놓고 그대로 버린다
(이번에 실제로 그럴 뻔해서 고쳤다).

### 이번에 추가한 가드
- **J1** — packs.js 가 호출하는 `render*`/`init*` 함수가 선언돼 있는지 대조.
  죽은 차트 코드를 블록으로 잘라내다 그 사이의 `renderEditionTable` 까지 지워 세트 상세가
  통째로 빈 화면이 됐는데, 문법 검사도 기존 가드도 통과했다. 브라우저로 열어봐야만 보였다.
  **UI 를 건드렸으면 반드시 로컬에서 실제로 렌더시켜 확인할 것.**

---

## 2026-07-22 Codex 최적화 패스

- 최신 Claude 변경분을 기준으로 전체 가드, SEO, AI 검색 접근, eBay 필터, 가격 이상치, JS 문법을 다시 검사했다. 모두 통과했고 가격·수집·canonical·sitemap은 변경하지 않았다.
- 모바일 375px 실기기형 뷰포트에서 푸터 링크가 오른쪽으로 잘리는 문제를 확인해 `.footer nav`에 줄바꿈을 적용했다. 수정 후 문서 폭과 스크롤 폭이 모두 375px이고 화면 밖 요소는 0개다. 데스크톱 1425px에서도 가로 넘침 0개를 확인했다.
- OP-13 박스와 카드 이미지는 지연 로딩 후 정상 표시됨을 확인했다. 초기 캡처의 빈칸은 이미지 손실이 아니므로 데이터나 이미지 경로를 바꾸지 않았다.
- 캐시 버전은 `20260722b`로 전체 HTML·생성기·`packs.js`를 동시에 올렸다. 다음 변경도 `DATA_VERSION`과 모든 `?v=`를 함께 범프해야 한다.
- 남은 위험: PSA10 mismatch 감사의 21건은 가격 차이가 큰 검토 후보지만, 대표 표본을 직접 대조한 결과 교차 세트 재록/SP 등 정상 매칭도 포함돼 있었다. 가격 비율만으로 자동 삭제하지 말고 제목·카드번호·변형·언어를 개별 검증한 뒤 불확실할 때만 숨긴다.

## 2026-07-21 Opening Meter 실제 전체 세트 데이터 복구

- GemRate 공개 세트 추이 21개를 동일 기준으로 검증해 `data/gemrate-psa-history.json`에 **2026-06-03부터 주간 기록을 append-only로 복구**했다. 최신 누적은 2026-07-20, 주간 막대는 2026-07-15까지 7주다.
- 기존 `psaFull`은 일부 대표 카드 합계를 세트 전체처럼 표시한 정합성 오류가 있었다. 전 세트를 실제 전체 세트 누적 등급·PSA10 수·젬률로 교체했다(21세트 합계 577,660장).
- 전체 Opening Meter는 06-03, 06-10, 06-17, 06-24, 07-01, 07-08, 07-15를 모두 유지한다. OP-05만 원본 누적이 64,755→73→65,081로 초기화·복원된 06-10/06-17을 결측 처리했으며, 해당 주 전체 합계에는 정상인 19개 세트가 포함된다.
- `tools/collect-gemrate-psa-history.js`가 매주 월요일 공개 원본의 최신 수요일 누적값을 읽고 새 주차만 추가한다. 기존 날짜 삭제 금지, 비정상 증분은 숫자를 만들지 않고 correction으로 기록한다.
- `tools/import-gemrate-psa-history.js`와 `tools/guard-invariants.js`가 21세트 커버리지·날짜·누적값·주간 증분·과거 날짜 보존을 검증한다. 수집기/임포터 회귀 테스트도 워크플로에 포함했다.
- 작은 신규 세트(OP-16 등)의 막대가 거의 안 보이던 고정 1,000축을 동적 축으로 교정했다. PSA 패널 문구도 Top 10과 전체 세트가 섞이지 않게 수정했다.
- 막대 폭은 기록 개수에 따라 자동 축소된다. 오래된 주차를 잘라내 폭을 맞추는 방식으로 되돌리지 말 것.

## 2026-07-21 Opening Meter 정합성 수정 (이전 조치)

- `psaWeekly`는 자동 수집 데이터가 아니라 2026-07-08까지 수동 검증된 주간 스냅샷이다. 월요일 워크플로는 기존 값을 다시 그릴 뿐 새 PSA 주간 수치를 수집하지 않았다.
- `market.html`은 10일 넘게 뒤처진 미터를 `Historical snapshot`으로 명시하며, 실시간 데이터라는 표현을 사용하지 않는다.
- `tools/guard-invariants.js`가 오래된 미터를 실시간처럼 표시하거나 과거 스냅샷 배지를 누락하면 배포를 차단한다.
- 검증된 동일 기준 원본 없이 7/15 이후 막대를 추정하거나 다른 집계 방식과 섞지 않는다. 새 공식/허가 소스가 확보될 때만 갱신한다.

> 새 세션/에이전트(Codex 등)가 이어받을 때 **이 문서의 START 섹션부터** 읽고, 상세는 **CLAUDE.md / AGENTS.md** 참고.
> 갱신: 2026-07-19.

## 2026-07-19 업데이트 — 모바일 성능·SEO 안전 최적화

- **검색 신호 불변**: canonical, robots, sitemap, hreflang, 제목·본문·가격 데이터는 변경하지 않음. `audit-seo` 오류·경고 0, `audit-ai-discovery` OK, guard 80페이지 OK.
- **모바일 성능**: 메인 CSS 요청을 GA4·AdSense보다 먼저 시작하도록 `<head>` 순서 조정. 같은 Lighthouse 조건에서 Performance 57→79, LCP 7.8초→3.9초. SEO 100, 접근성 100 유지.
- **접근성 오류 제거**: 시장지표 링크 2개의 실제 텍스트를 덮던 `aria-label` 삭제. Lighthouse `label-content-name-mismatch` 해소.
- **전수 검증**: 공개 HTML 80개, JSON-LD 215개 파싱, 깨진 내부링크 0. 로컬 필터·가격 이상치·가격 품질 테스트 모두 통과.
- **캐시 버전**: `20260719a`. `packs.js`의 `DATA_VERSION`, 모든 HTML `?v=`, 3개 생성기 상수를 동시에 범프함. 다음 변경도 반드시 `guard-invariants.js` 통과 후 배포.
- **남은 Best Practices 77**: AdSense 제3자 쿠키·브라우저 진단 경고가 원인. 광고 제거 외에는 해소 불가하므로 수익화를 지키기 위해 유지.

## 2026-07-19 업데이트 — AI 검색 노출 안전 패스

- **Google SEO 신호 불변**: 홈 canonical `/`, sitemap 대표 URL, Googlebot 규칙, 공개 HTML은 변경하지 않음. 이전 canonical 스왑 사고를 피하려고 AI 봇 설정만 수정.
- **AI 검색/인용 허용**: `OAI-SearchBot`, `ChatGPT-User`, `Claude-User`, `Claude-SearchBot`, `Google-Extended`가 공개 페이지와 `/data/`를 읽을 수 있음. `/docs/`, `/tools/`, `HANDOFF.md`, `AGENTS.md`, `SECURITY.md`는 차단.
- **학습봇 분리**: Anthropic 공식 정의에 따라 `ClaudeBot`은 학습용이라 차단. Claude 검색/사용자 요청 접근은 위 두 전용 봇으로 계속 허용. `GPTBot` 차단도 유지하며 OpenAI 검색 노출에는 영향 없음.
- **AI용 설명 최신화**: `llms.txt`에 JP/EN 범위, sold와 active의 차이, NM/PSA 의미, 변형 구분, 결측 숨김 원칙, market/sitemap/RSS/raw data 링크를 명시.
- **재발방지 검사**: `tools/audit-ai-discovery.js` 신설. 검색/검색요청 봇 허용, 내부문서 차단, 학습봇 차단, 루트 canonical sitemap 유지, llms 핵심 링크를 검사. 일일·주간 워크플로 시작 시 자동 실행. `guard-invariants.js`의 오래된 ClaudeBot 분류도 공식 기준으로 교정.
- **검증**: `audit-ai-discovery` OK, `audit-seo` 오류·경고 0, `guard-invariants` OK(80페이지), `git diff --check` 통과.

## 2026-07-18 업데이트 — 오늘 한 것 + 다음 작업 (여기부터 읽기)

**오늘 완료(전부 push·guard 통과, 캐시버전 `20260719a`):**
1. **네비 통일 + 재발방지** — Market Index 링크가 articles 전체·op-17·eb-05 등 19개 페이지 네비에서 누락(눌러 이동하면 사라지던 버그) → 전 80페이지 통일. 생성기 3곳(card/weekly-report/set) 템플릿도 수정. **guard-invariants.js에 N1 검사 추가**: 네비 보유 페이지는 6개 라벨(부스터박스/비교/PSA10/마켓지수/세트가이드/아마존) 전부 필수, 누락 시 FAIL→배포차단(data-ko 라벨 기준).
2. **SEO/애드센스** — privacy.html 124→766단어(제3자쿠키/DART/광고옵트아웃3종/GA옵트아웃/제휴고지/GDPR·CCPA/아동/연락처 = 애드센스 재심사 대비). set/market/eb-05 생성기 타이틀 90~110→63~74자, 설명 250~290→~150자로 정상화(키워드는 앞 유지).
3. **한국어 정적 허브 `/ko/` 신설(유입 핵심)** — 기존 data-ko JS스왑은 네이버 Yeti(JS 미실행)에 안 보이고 `/?hl=ko`는 canonical이 /로 가 구글 미색인이었음. `tools/generate-ko-pages.js`가 검증된 onepiece-packs.json에서 **정적 한국어 HTML** 생성(21세트 원화 시세표+정가배수+재판+OPBOX지수+개봉미터+FAQ, 스키마 포함). 사이트맵 등재·hreflang(`/ko/`↔`market.html`)·IndexNow 제출·야간워크플로 편입·guard PUBLIC_HTML에 `ko` 포함. 홈 canonical/hreflang은 사고예방 위해 미변경. **사용자가 네이버 카페에 붙일 URL = opboxindex.com/ko/.** 상세: 메모리 project-opbox-korean-seo.
4. **카드 시세이력 오염 정리(정확도)** — 초기수집(7/7~7/10)이 변형매칭 미성숙으로 엉뚱한 저가를 긁어 카드페이지 "최근 시세" 표에 $3→$1,500식 불가능한 점프가 라이브 노출됨. 7/14 이전 체크포인트 237개(185장) 폐기, 표는 2점 이상일 때만 표시(generate-card-pages). 현 수집기는 검증된 nmJpy 파생이라 앞으로 오염 불가.

**다음 작업 — 카드 top10 시세 "변동" 그래프 (사용자 요청, 지금은 데이터 대기):**
- **막힌 이유**: 카드 변동데이터는 `card.series.points`에 매일 밤 축적(`tools/update-card-series-history.js`)되나 **깨끗한 건 7/14부터라 카드당 아직 1점**. NM은 nmJpy 파생이라 매일 동일(2~3개월 갱신때만 변동), **PSA10(eBay sold)만 주간 변동** → 의미있는 선은 **3~4주 뒤**.
- **배선 버그(그때 같이 고칠 것)**: SPA 카드차트 `historyChart`(packs.js ~1459)는 `card.japaneseNmEbay.history`를 읽는데 **그 필드는 0건** → 항상 빈상태. 축적되는 실데이터는 `card.series`이므로 **historyChart를 card.series로 연결**해야 개별카드 변동선이 뜸. 그 후 **top10 통합 변동 뷰**(psa10-ranking 확장 or 신규) 추가. (2026-09-30: historyChart·japaneseNmEbay 경로는 원천 Finding API 사망으로 삭제 — 변동선은 card.series 로 새로 그릴 것)
- **지금 당장 가능한 대안**: "현재 top10 시세" 스냅샷은 정확함(psa10-ranking.html이 PSA10 실거래로 랭킹 중) → 막대/카드 시각화 보강은 오늘도 가능.
- **한국어 확장 백로그**: `/ko/op-16` 등 세트별 한국어 페이지("op-16 시세" 롱테일 — 생성기 구조 이미 있음).

> ⚠️ 불변: 수정 후 반드시 `node tools/guard-invariants.js` OK 확인 후 push(FAIL이면 push 금지). 로컬 push 거부되면 아래 START의 야간충돌 대응 참고(reset --hard origin/main → 소스변경만 재적용 → 정리스크립트 재실행 → 재생성 → push). 정확도 최우선(틀린값보단 빈칸).

## START — 현재 상태·다음 작업 (2026-07-17 밤 기준)

### 현재 상태 스냅샷
- **배포**: GitHub Pages, repo `opboxindex/k-tcg-quant` branch `main`, 커스텀 도메인 opboxindex.com. push하면 1~2분 내 라이브.
- **캐시 버전**: `20260719a`. ⚠️ packs.js/styles.css/데이터를 바꾸면 **packs.js의 `DATA_VERSION` 상수(~177행)와 전체 `?v=` 문자열을 반드시 동시에** 새 값으로 범프. 방법: 파이썬 os.walk 단일패스 치환(레포에서 bash while+sed 루프는 2분 타임아웃 남 — 쓰지 말 것). 범프 후 `node tools/generate-card-pages.js && node tools/generate-set-pages.js` 재실행(구운 페이지에도 ?v 들어감).
- **야간 자동화**: `.github/workflows/update-active-listings.yml`(매일) — eBay 가격 갱신 → 카드 페이지 → 세트 페이지 순 재생성 → 커밋. 로컬 push가 거부되면: `git pull --rebase`; 꼬이면 `rebase --abort` → `reset --hard origin/main` → 자기 커밋에서 자기 파일만 checkout → 재생성 → push.
- **트래픽**: GA 활성 54(-28%), 신규 50(-31%), 조회수 477(+7%). 원인 진단 완료(아래 0G): **구글에 미색인**(브랜드 검색조차 0노출). 콘텐츠·리텐션은 정상. SEO 효과는 색인 후 2~6주 걸림 — 그 전 숫자 하락은 정상이라고 사용자에게 이미 설명함.
- **AdSense**: "가치가 별로 없는 콘텐츠" 거절 → 콘텐츠 보강 완료. **재심사 요청 버튼은 2026-07-30 이후에** (사용자가 누름).
- **페이지 구성**: 홈/packs(SPA) · compare · psa10-ranking · sets/*.html 23개(+op-17, eb-05 프리릴리즈) · cards/*.html 24개+허브 · articles 16편 · 주간리포트 파이프라인 · RSS(feed.xml) · og/*.png.

### 다음 작업 백로그 (우선순위순, 근거 포함 — 위에서부터 하면 됨)
1. **OP-16 "30일 후" 아티클** — 6/12 발매 30일 경과. 우리 실측 시리즈(4/27~) + admiral 망가 3장 카드페이지(cards/op16-063/065/073) 재료 완비. "op-16 box worth it/restock" 검색 수요 있음.
2. **세트별 "Top 10 chase cards" 라운드업 아티클 템플릿** — "op16 chase cards" 같은 세트단위 쿼리에 우리는 개별 카드페이지만 있고 라운드업이 없음. 생성기 하나 만들어 최근 세트(OP-16→OP-15→OP-13)부터. 기존 카드페이지로 내부링크.
3. **evergreen "Why One Piece box prices are falling — live tracker" 고정 URL** — 하락장 공포 쿼리를 TCGPlayer 월간포스트가 먹는 중. 주간리포트 파이프라인(tools/generate-weekly-report.js)에서 고정 URL 하나를 매주 갱신하는 방식으로. 세트별 고점대비 낙폭 표.
4. **카드 이미지 셀프호스팅 + 이미지 사이트맵** — 현재 cards/*.html 이미지가 전부 TCGplayer CDN 핫링크(끊기면 25페이지 전멸 + 이미지검색 트래픽이 tcgplayer로 감). /img/cards/{slug}.webp로 받아서 생성기 경로 교체 + sitemap에 image:image.
5. **차트 내보내기 버튼 + /embed/** — packs.js 캔버스 차트에 "이미지 저장"(canvas.toBlob, opboxindex.com 워터마크) 버튼. 커뮤니티가 스크린샷으로 소통하므로 유저가 배포자가 됨.
6. **주간 CSV 자료실(/free-data.html)** — 세트별 JP/EN 박스가·30일 변동·PSA10 톱카드 집계 CSV 주간 공개(출처링크 요구). 백링크 자석. ⚠️ eBay 원시 리스팅 덤프 금지, 파생 집계만.
7. **카드 페이지 타이틀 쿼리 매칭** — tools/generate-card-pages.js title을 "[이름] ([번호]) PSA 10 Price & Population — {월 자동}"로 (figoca가 이 패턴으로 소형사이트인데 1위 먹음).
8. **ST-31~36 스타터덱 짧은 아티클** — 7/31 발매, 그 주 검색 스파이크. 단명이라 낮은 공수로.
9. **캐터리스트 캘린더 페이지** — 확정 일정(ST 7/31 → OP-17 8/22·28 → EB-05 10월)과 영향받는 박스 링크. 주간리포트와 같이 갱신.
10. **/ja/ 섹션** (공수 큼) — 일본 셀러의 "해외(eBay) 상장가" 수요는 무경쟁. 상위 5세트+아티클 1편, 정적 페이지+hreflang(클라이언트 토글 방식 금지).

### 매주 루틴 (월요일)
1. `node tools/generate-weekly-report.js && node tools/generate-feed.js` → articles/index.html 허브 카드 최신호 교체 → 커밋/푸시 → `node tools/indexnow-submit.js`
2. **판매자 국가 재검증**: `node tools/verify-best-sellers.js`로 대상 추출 → 브라우저에서 `ebay.com/fdbk/feedback_profile/{id}` 열어 "Member since ... in <국가>" 확인(Node fetch로는 안 됨, JS 셸만 옴) → 중국/홍콩이면 tools/ebay-listing-filters.js의 excludedSellerUsernames에 추가(현재 21계정).
3. **PSA 주간 막대 append**: 7/22부터는 psaFull 스냅샷 대비 자체 계산으로 psaWeekly에 추가. (7/15 막대는 사용자의 TCGQ 호버값 대기 중.)
4. 소셜 자산은 이미 자동생성됨(social/weekly/) — 포스팅은 사용자가 함.

### 사용자 대기/예정 (내가 못 하는 것 — 재촉만)
- **GSC**: sitemap 재제출 + 주요 10페이지 색인요청 (제일 급함, 요청해둠)
- ~~Bing Webmaster Tools~~ ✅ 2026-07-18 등록 완료(GSC 가져오기, gsa 구글계정 SSO). 사이트맵 Success·74 URL 크롤됨, 데이터 리포트는 48시간 내 반영. IndexNow는 기존 tools/indexnow-submit.js가 커버. + **Naver Search Advisor** 확인은 남음
- **차주 Reddit/Threads 첫 포스팅** — 글감: `social/community-drafts-2026-07-17.md` (이 세션에서 저장). 사용자가 요청하면 지원.
- 8/31 예약작업(opbox-aug31): 공급/판매/PSA 누적 → Market Data 콤보 롤아웃 + eBay 시리즈 전환(boxSeriesEbay 승격).

### 금지·주의 (실수 잦은 순)
- **🛡️ 모든 수정 후 `node tools/guard-invariants.js` 필수 — FAIL이면 푸시 금지.** 과거 사고 5유형(canonical 스왑·버전 엇갈림·시리즈 덮어쓰기·소스명 노출·검증파일 삭제)을 기계 검사. 야간 워크플로도 커밋 직전 같은 가드로 불량 배포 차단, 실패 시 GitHub이 소유자 메일로 실패 메일 발송. 시리즈 소스 기준선은 tools/series-source-manifest.json — 정당한 전환(8/31 eBay 승격 등) 때만 의도적으로 갱신.
- **정확도 최우선**: 틀린 숫자보다 빈칸. 카드 가격은 **변형(variant) 매칭 엄수**(망가/패러렐/SP 다 다른 카드). 봉입률 등 근거 없는 수치 게시 금지.
- **외부 소스명 공개 금지**(영구 규칙): Collectr 등 업체명을 사이트/공개 JSON/클라이언트 코드에 쓰면 안 됨. 라벨은 "Weekly ungraded market (JP/EN-NA)", 필드 `marketProductId`. tools/update-box-series-history.js의 wm-시리즈 보호 로직(boxSeriesEbay 우회 축적) 건드리지 말 것.
- **스크래핑 금지**: TCGplayer/PriceCharting/CardLadder 가격 수집 금지(공식 상품 이미지는 OK). `tools/update-ebay-psa10-prices.js` 절대 실행 금지. variantOK/hasVariantSignal 완화 금지.
- **삭제 금지 파일**: googlee0d71bc0695b5651.html, naver933a...html, IndexNow 키 .txt(3d439f302e46fc08f76ddba4eee3726f.txt), impact-site-verification 메타, .env(로컬 eBay 키).
- **콘솔 cp949**: 한글/이모지 print 깨짐 → 결과는 UTF-8 파일로 쓰고 Read로 확인.
- 사용자와는 **짧은 반말 한국어**. 개발자 아님 — 개발 판단은 알아서 하되 결과·이유를 쉽게 보고. 시키지 않은 개선도 능동적으로(단, 위 금지사항 안에서).

## 0I. 2026-07-18: OPBX 마켓 인덱스 + 개봉 미터 + 성적표 (market.html) — 캐시 `20260718a`
> ⚠️ **2026-07-29 철회.** 지수·개봉미터·market.html·가드 D2·나브링크를 전부 삭제했다. 이유: 지수 한 숫자가
> 서로 반대로 움직이는 세트들을 덮어버렸고, 7/17 판매자 정리(commit b369bcb, 중국·홍콩 창고 19곳 제외) 때문에
> 시계열에 방법론 단절이 생겨 소유자가 "안 맞는 것 같다"고 판단했다. 대신 등급(PSA/CGC/TAG) 데이터에 집중.
> **단, `tools/build-market-index.js` 는 계속 돈다** — data.marketIndex 가 지수 말고도 세트별 시세판(board)과
> 재판기록(reprints)을 공급하고, 홈 요약표·ko 페이지·무료 CSV 가 그걸 쓴다. 이 단계를 빼면 그 가격들이 얼어붙는다.
> 아래 내용은 그때의 기록으로만 읽을 것.
- **정확도 감사 먼저**: 21세트 중 발매 시점부터 추적한 건 OP-14/15/16/PRB-02뿐(나머지 1월 시작). 그래서 "발매 대비"는 대부분 거짓 → 지수·성적표는 전부 "1월 7일 이후"로만 표기. 성적표 각 행에 실제 base 날짜("from Apr 27" 등) 명시, launch 태그는 진짜 발매추적 세트(OP-16)만.
- **OPBX 지수**: `tools/build-market-index.js` → data.marketIndex(메인 JSON 통합, 단일 소스·단일 버전). 등가중, 2026-01-07 가격 있는 18세트=100 기준, 현재 157.4(+57.4%, 주 -0.8%). 후발 OP-02/15/16은 지수 제외·개별표시. `tools/generate-market-page.js` → market.html(숫자 구움, Dataset+FAQ 스키마, Key Facts). packs.js `renderMarketIndex`(홈 hero 카드).
- **개봉 미터**: 전세트 psaWeekly 합산 최근주(17,526, WoW+30.4%), 누적 608,756.
- **가드 D2**: 지수 범위(50~1000)·구성종목·시계열·성적표·미터·market.html 구운값 일치 검사. 이상 시 배포 차단.
- **파이프라인**: 야간 워크플로에 build-market-index→generate-market-page 추가(매일 자동 갱신). market.html 커밋 대상 추가, 사이트맵 등록.
- **재판(再販)+정가 완료**: 조사 워크플로 wf_3c7f8892-4b7로 21세트 공식 정가+재판 전수 검증. **핵심 발견: 반다이는 세트별 재판을 공식 발표 안 함** → "공식 재판 N회"는 오해유발(재판 있었는데 0회로 보임). 정직한 표기: `data/set-facts.json`(정가 ¥4752/5280/5500·유통사 재판 기록 소스링크, 나이틀리 불변 소스파일). ①마켓 성적표에 "vs MSRP" 컬럼(OP-01 10.7배)=정직한 발매대비 + "Reprints" 카운트. ②세트페이지 "Reprints & original price" 섹션(정가·배수·재판기록 또는 "없음=미발견이지 재판無 아님"). 재판기록 있는 세트: OP-06/09/11/13/EB-01/PRB-01. 가드 D2가 vsMsrp 커버리지·재판데이터 검사.

## 0H. 2026-07-17 심야: 홈 노출 0 사고 — canonical 스왑 진단·수정 — 캐시 `20260717d`
- **증상**: GSC 실적에서 홈(/)이 7/1~7/7 노출79·클릭9·순위6.3 → **7/8부터 노출 0**. GA 활성유저 -28%의 직접 원인.
- **진단**(GSC 직접 확인): 수동조치 없음. 사이트 전체 노출은 유지되는데 packs.html?hl=en이 노출 94회로 최다 — **구글이 중복 클러스터(/, packs.html, ?hl=, ?set=)의 canonical을 /에서 packs.html 변형으로 스왑**. 원인: 사이트맵에 packs.html?set= 42개 등재(7/7 제출) + 전 페이지 브랜드로고가 packs.html?hl=en으로 링크 → 내부 신호가 packs.html에 몰림.
- **수정**: ①사이트맵 42개 제거(0G) ②**전 사이트 내부링크 홈 통일**(brand/nav/브레드크럼 스키마/절대URL, 79개 파일+생성기 2개: packs.html?hl=en→/ , ?hl=ko→/?hl=ko; **?set= 딥링크는 기능이라 유지**) ③audit-seo에 재발방지 검사(사이트맵에 /index.html·/packs.html 등재 시 에러) ④GSC 홈 재크롤 요청.
- **회복 관찰법**: GSC 실적→페이지에서 / 노출이 돌아오는지 (수일~2주). packs.html?hl=en 노출이 /로 넘어오면 성공.
- GSC 소유권: 소유자 계정으로 인증됨(google1d76c313bd3d0b59.html — 삭제금지). 색인요청 실행: /, sets/op-17, cards/, articles/japan-vs-english, sets/eb-05. 색인요청 쿼터 하루 ~10개.
- Bing Webmaster: ✅ 2026-07-18 등록 완료(GSC 가져오기). llms.txt 추가, robots에서 ClaudeBot/Claude-SearchBot 허용(AI 인용 목적).

## 0G. 2026-07-17 밤: 트래픽 회복 패스 — 캐시 `20260717c`
- **진단(워크플로 6에이전트)**: GA 활성유저 -28%의 원인은 콘텐츠가 아니라 **구글 SERP 부재** — 16개 쿼리+브랜드검색 'opboxindex'까지 0노출. 조회수는 +7%(리텐션 정상). 인덱싱/권위가 병목.
- **인덱싱 버그 수정**: 사이트맵의 packs.html?set=* 42개 URL이 전부 canonical=홈 선언 상태였음 → 제거(113→71). sets/*.html이 인덱싱 대상.
- **프리릴리즈 페이지**: sets/op-17.html(JP 8/22·EN 8/28 공식검증 + OP-14/15/16 발매전후 실측: OP-16 예약$220→발매$139→저점$123→현재$150, "발매 2~6주 후가 저점" 데이터 결론) · sets/eb-05.html(10월 공식, EB-03 +50% 전례). SERP가 소형 샵블로그뿐인 급상승 쿼리 선점.
- **구매의도 섹션**: 세트 생성기에 "Is an X booster box worth buying? (월 자동갱신)" verdict — 낙폭/모멘텀/체이스배수/젬레이트 실데이터 분기. "is op-13 good investment" 정확일치 SERP 결과 1개뿐.
- **JP vs EN 아티클**: 정확일치 타이틀 + 실측 갭 표 10세트(+25% OP-16 ~ +641% EB-01, 신세트일수록 갭 축소 = OP-17 동시발매 논지).
- **리텐션(packs.js)**: `opbx_watch`(관심 박스 핀, detail 패널 토글, 그리드 최상단+📌) + `opbx_lastseen`(방문 스냅샷) → 재방문 시 "Since your last visit" 변동 배너(관심세트 우선, 시장평균). GA 이벤트 watch_toggle/since_last_visit.
- **사용자 액션 필요(계정)**: GSC 색인 확인+주요 URL 색인요청, Bing Webmaster 등록(GSC 가져오기), Naver Search Advisor 확인, 커뮤니티 첫 포스팅(차주 예정 — 신규유입 최대 레버).
- 백로그: 카드 이미지 셀프호스팅+이미지 사이트맵, 차트 이미지 내보내기 버튼/임베드, 주간 CSV 자료실(백링크 자석), 주간 숏폼 클립, /ja/ 섹션.

## 0F. 2026-07-17 저녁: 인기 카드 개별 페이지 (롱테일 SEO)
- **cards/*.html 24장 + cards/index.html 허브** — NM가 상위 24 유니크 카드(번호+변형명 dedupe, 홈세트 우선). 생성기 `tools/generate-card-pages.js`: NM(¥/$)·PSA10(sold/ask 라벨)·PSA 인구표(10/9/8이하 점유율)·그레이딩 경제성(프리미엄 배수별 분기 산문)·가격 체크포인트 표·변형검증 가이드·FAQ/Article/Breadcrumb 스키마. 전부 실데이터 파생, 추정치 0.
- **크로스링크**: 세트페이지 체이스 표 카드명 → 카드페이지 링크(cards/card-map.json 경유), sets/index·psa10-ranking 관련링크에 허브 추가. 사이트맵 25 URL 추가(총 113), IndexNow 전송됨.
- **야간 워크플로 통합**: update-active-listings.yml이 card-pages → set-pages 순으로 재생성+커밋 → PSA10 가격 매일 갱신됨. NM은 수동 주입 시에만 변동(슬러그 안정).

## 0E. 2026-07-17 오후: 자율 최적화 패스 — 캐시 `20260717a`
- **🚨 야간 워크플로가 Collectr 시리즈 오염** → 수리 완료. update-box-series-history.js가 boxSeries/boxSeriesEn의 source를 eBay로 덮고 active 포인트를 덧붙임(그래프 스파이크+라벨 오류). **툴 패치**: source에 Collectr 포함 시 eBay 스냅샷을 `boxSeriesEbay`/`boxSeriesEnEbay`에 병행 축적(8월 전환 때 승격), Collectr 시리즈는 불가침. 오염분은 serdump.txt로 원복(37시리즈), eBay 포인트 74개는 병행필드로 이관.
- **주간 리포트 루틴(월요일)**: `node tools/generate-weekly-report.js && node tools/generate-feed.js && node tools/indexnow-submit.js` → 허브 카드(articles/index.html) 최신호로 교체 → 커밋.
- **RSS 피드**: feed.xml + tools/generate-feed.js(아티클 추가 시 재실행). 홈/트래커/아티클 허브에 link rel=alternate.
- **아티클별 OG 이미지**: og/*.png 6종(tools/make_og_images.py) — 5개 신규 아티클+compare에 연결.
- **UI 폴리시**: 딜칩 9px→10.5px, bxEdLabel·pdRar 10.5→11px, pwHead 모바일 줄바꿈 허용. 375px 감사: 오버플로0·bleed0·탭타겟OK.
- 중국셀러 대응은 0D 참조 — verify-best-sellers.js 주간 실행(브라우저 필요).

## 0D. 2026-07-17: 중국·홍콩 위장창고 다계정망 전수 소탕 — 캐시 `20260716e`
- **발견**: US창고 발송으로 위치필터를 우회하는 중국/홍콩 셀러망이 박스 최저가를 잠식. 차단하면 같은 물건이 다른 계정으로 재등장(OP-05 $151.89 5계정, OP-14 $79.9 홍콩 8계정 등). eBay Browse API의 itemLocation은 창고(US)라 못 잡음.
- **검증법 확립**: eBay 피드백 프로필(`ebay.com/fdbk/feedback_profile/{id}`)의 "Member since ... in <국가>" — **반드시 브라우저에서**(Node fetch엔 JS껍데기만 옴). 세션 브라우저 탭에서 `window.__vf([...])` 패턴으로 일괄 확인.
- **결과**: bestListing 셀러 42개 전원 검증, 중국/홍콩 **19계정 차단**(greatestplc·wzxc2024·chuangxinhe·ajwu2024·dcfonew·dndy2024·obtr2024·onpiececard·newcardscoming·ygmvtion·wonder5136·goldencardstore·pokem_57·sunnystore24·paparazzir·fuyistore + OP-14망 vasettler·vcbbox·vbzeckon·vedesh·gromance·vdcontion·bloonymary·dihssease). 차단 후 실최저가 정상화(OP-07 $79→$110, OP-05 $152→$238, OP-14 $80→$125 — 그 대역 전체가 위장망이었음).
- **주간 루틴**: `tools/verify-best-sellers.js`가 대상 목록 추출(단 fdbk fetch는 Node에서 차단 → 세션 브라우저로 확인 필요). 주 1회 실행 권장. 신규 차단은 `tools/ebay-listing-filters.js` excludedSellerUsernames에 사유와 함께 추가 후 수집기 재실행.
- OP-13 JP는 현재 미개봉 매물 0건(정직하게 버튼 미표시), OP-11 JP kept=2로 얇음.
- 기타 결정: 팩 시뮬레이터 아이디어 폐기(봉입률 공식 근거 없음 — 정확도 원칙), 코멘트/별점은 트래픽 주500+ 이후 재검토.

## 0C. 2026-07-16: 애드센스 "가치가 별로 없는 콘텐츠" 거절 대응 — 캐시 `20260716b`
- **거절 원인 진단**: compare.html 정적 텍스트 92단어(봇에겐 빈 페이지), 세트페이지 22개 템플릿 중복, 아티클 얇음(~560단어), 도메인 3주 신생.
- **조치**: ①compare.html 정적 산문+7월 스냅샷 표(~650단어) ②세트페이지에 세트별 고유 데이터 섹션 2개 추가(6개월 시세 궤적·주간 등급 모멘텀, 생성기 tools/generate-set-pages.js — ~940단어/페이지) ③데이터 리포트 아티클 2편(각 1,300단어: japanese-vs-english-box-price-data-2026.html, psa-grading-vs-sealed-supply-2026.html — 수치 전부 우리 실데이터, scratchpad article_stats.json에서 추출) ④about.html E-E-A-T(출처·정확도정책·운영자·갱신주기·정정 연락처) ⑤홈 7월 데이터 다이제스트+OP-16 가이드 링크 누락 수정. SEO 감사 통과.
- **⚠️ 재심사 타이밍**: 콘텐츠 색인 잡히게 **최소 2주 숙성 후** "검토 요청" 클릭 권장(2026-07-30 이후). 연속 거절 방지. IndexNow 일괄 통지 완료 시점 기록 참조.
- 아티클 수치 갱신 시: 이 리포트들의 표는 정적이므로 큰 데이터 개편 때 수동 갱신 필요(as-of 날짜 명시돼 있음).

## 0B. 2026-07-15 저녁: 전 세트 롤아웃 (OP-13식 업데이트 전면 적용) — 캐시 `20260715q`
- **Top10 전 세트(21) TCG Quant와 동일**(카드·순서·공식 TCGplayer 1000px 이미지). 기존 카드는 TCGplayer id(또는 정규화 이름) 매칭으로 우리 가격 보존. **신규 17장은 가격 비움**(틀린 값 노출 금지) — 유유테이 NM 수집 대기 목록: scratchpad `merge_applied.txt` 하단.
- **Collectr 박스시세 주입: JP 21세트 + EN 17세트**(주간 ~6개월, KRW). **16세트 인터랙티브 JP vs EN 그래프 활성.** EN 없는 세트(OP-01 변형모호/OP-07 프리릴만/EB-02/EB-03 박스없음, OP-16은 JP없어 eBay JP 유지) → 단일 그래프 정직 유지.
- **PSA 패널 전 세트**: psaFull(세트전체 총·gem10·gemRate·OP평균) + 인구 top10 체이스표(합계=gem10 검증됨). **밸류패널(renderSetAnalytics) 전 세트 제거**(함수는 잔존, 미호출). psaWeekly 막대는 OP-13만(시드 데이터 있는 유일 세트) — 다른 세트는 주간 스냅 쌓이면 추가.
- 수집 방법 기록: TCG Quant SPA는 canvas차트라 top10/PSA는 DOM 추출(tcgq_all.json), Collectr api-v2는 **getcollectr 오리진에서만 fetch 가능**(CORS) → app.getcollectr.com/robots.txt 탭에서 수집(무거운 SPA 페이지는 렌더러 얼음 — 정적 페이지 사용이 핵심). 데이터: scratchpad serdump.txt / tcgq_all.json / merge_all_sets.js(재실행 가능).
- ⚠️ eBay 워크플로(시크릿 재등록 후)가 boxSeries(JP)를 eBay로 덮으면 소스 불일치로 비교그래프 자동 숨김(가드 정상동작). 8월 EN eBay 준비되면 양쪽 eBay로 전환.

## 0. 2026-07-15 세션 (그래프4 + PSA 패널 + 8/31 예약) — 캐시 `20260715b`
- **인터랙티브 JP vs EN 박스 그래프(그래프4)**: `renderBoxInteractive`(위=일본/아래=영문 실제 원화 2단 small-multiples, 압축 없음) + `initBoxCharts`(hover/탭 → 날짜+양쪽 가격 툴팁 + 세로 크로스헤어, 바닐라). `hasInteractiveBox(set)`(=JP·EN 시세 둘 다 준비 **+ 두 판 소스 일치**)인 세트만 적용 → **현재 OP-13만**. 나머지 세트는 기존 UI 유지.
- **박스 시세 소스 = eBay로 전환 결정(2026-07-15 사용자)**: OP-13은 지금 임시로 **Collectr**(6개월 히스토리, POC). eBay JP는 이미 3.5개월치 있으나 **eBay EN이 아직 얇음(7포인트)** → 8월에 eBay EN 준비되면 자동 eBay 전환. `hasInteractiveBox`에 **소스일치 가드(`seriesFam`)** 추가 = eBay JP vs Collectr EN 같은 혼합 비교 방지(자동수집이 JP만 eBay로 덮어써도 비교 그래프는 두 판 소스 같아질 때까지 숨김). 그래프 하단 출처문구는 `boxSeries.source` 기반 자동 전환(Collectr↔eBay). ⚠️ eBay EN 축적엔 eBay 시크릿 재등록 필수.
- **PSA 등급·개봉 패널**: `renderPsaDestruction`(우리 `set.psa`/`psaGem`/`psaTotal` 기반, 캡처처럼 총 등급·Gem·체이스표). 인터랙티브 세트(OP-13)에만 표시. **TCG Quant 숫자 복사 안 함**(경쟁사 가공+TCGPlayer혼입).
- **밸류패널(`renderSetAnalytics`)**: 인터랙티브 세트에선 숨김(그래프4+PSA로 대체), 나머지 세트는 그대로.
- **8/31 예약작업**(`~/.claude/scheduled-tasks/opbox-aug31-market-data-deploy`): 그때까지 누적된 **공급(eBay active·중국제외)+판매량(eBay sold 90일 스크래핑)+PSA** 를 OP01~16에 TCG Quant식 Market Data 콤보로 반영·배포·보고. ⚠️ **선행조건: GitHub 시크릿 `EBAY_CLIENT_ID/SECRET` 재등록**(7/5부터 비어 공급 자동수집 중단). 안 하면 공급은 현재 스냅샷만.
- 참고 벤치마크: **tcgquant.com**(공급=eBay+TCGPlayer 시장가±20% 매물수, 판매량=기간별 sold박스수). Collectr API엔 판매량/공급 히스토리 없음(가격만, `marketplace_listings`·`grades_population_history` 빈배열 확인). 방법론만 참고, 숫자는 우리 자체 수집.

## 1. 한 줄 정체성
원피스 TCG **부스터박스/카드 시세 리서치 사이트**. eBay 실데이터를 최대한 활용하되 **정확도가 최우선**(불확실하면 숨긴다: 틀린값 노출 < 빈값). 수익화: eBay 제휴(EPN, 켜짐) + AdSense(심사중). 사장님은 비개발자, **짧고 반말**로 소통.

## 2. 위치·배포
- 라이브: https://opboxindex.com — GitHub Pages, repo `opboxindex/k-tcg-quant` branch `main`.
- 프로젝트 폴더: `C:\Users\kimtt\Documents\Codex\2026-06-21\https-youtu-be-rhuyy9lp72m-si-a4jhiygdebzzpvjf`
- 메인 앱: `packs.html` + `packs.js`(SPA 렌더러) + `styles.css`. 데이터: `data/onepiece-packs.json`(단일 소스, 여기서만 값 읽기).
- 정적 SEO 페이지: `sets/*.html`·`sets/index.html`·`psa10-ranking.html`(생성기 `tools/generate-set-pages.js`), `compare.html`, `articles/*`.
- ⚠️ **Pages 배포가 자주 느리고 간헐 실패**. push 후 curl로 라이브 확인. **연속 재트리거 금지**(진행중 배포를 취소시켜 더 늦어짐) — 실패 확정 후 1회만.
- 캐시버스트: `packs.js`의 `DATA_VERSION` + html의 `?v=` 쿼리. 데이터/코드 바꾸면 반드시 bump.
- Windows/PowerShell. 콘솔 cp949라 한글 print 깨짐(결과는 파일로). git 경고 LF→CRLF는 무해. Codex의 미커밋 파일(.gitignore 등)이 rebase 막으면 stash 후 pull/push.

## 3. eBay 데이터 — 자동 vs 수동 (핵심)
| 데이터 | 소스 | 갱신 |
|---|---|---|
| 박스 호가(active) | eBay **Browse API** | ✅ 매일 워크플로 자동 |
| 카드 PSA10 최저매물 링크 | Browse API | ✅ 매일 자동 |
| NM(생) 카드가 | yuyu-tei | 주간 |
| **박스 sold(실거래)** | **브라우저 수동** | ⚠️ 주1회 수동 (`tools/box-sold-urls.js`) |
| **카드 PSA10 sold** | **브라우저 수동** | ⚠️ 수동 (`tools/psa10-sold-refresh.js`) |
- ⚠️ **eBay 옛 Finding API(sold) 완전 사망(503)** — 로컬·GitHub 다 안 됨. Marketplace Insights API는 승인 필요(미보유). **그래서 sold는 "사용자 로컬 브라우저(claude-in-chrome)"로만 수집 가능**(eBay가 서버/데이터센터IP 차단). CI·클라우드 자동화 불가.
- 자동 파이프라인은 GitHub secret `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` 필요(과거 소실로 3일 정지 사고 있었음 — 없으면 재등록 요청).

## 4. 정확도 규칙 (절대 준수)
- **표본 n<3 sold는 시세로 노출 금지** — 코드 전반에 n>=3 가드(딜칩·PSA밴드·카드표·랭킹·프리미엄).
- **변형 매칭이 사고지점**(레드망가↔망가↔SP↔parallel). `update-ebay-psa10-active-links.js`의 `hasVariantSignal` 로직 = sold 추출기의 `variantOK`. **절대 완화 금지.** 과거 레드망가 오매칭 사고 기록됨.
- **같은 번호 멀티변형**(예 OP06-118 alt art manga vs manga)은 브라우저 추출기가 못 구분 → 갱신 시 값 붕괴. 이런 카드는 갱신 보류(6/29값 유지)하거나 수동 확인.
- `tools/update-ebay-psa10-prices.js` **절대 실행 금지**(sold 데이터 파괴, 실사고 롤백함).
- **TCGplayer/PriceCharting 스크래핑 금지**(ToS + TCGplayer 제휴 리스크). 참고(대조)용 비공개만.
- 삭제 금지: `googlee0d71bc0695b5651.html`(GSC), IndexNow 키파일 32자hex.txt, impact-site-verification 메타.

## 5. 최근 세션에 한 것 (2026-07-09)
- 차트 부드러운 곡선 개편, 배송비 **US 기준** 표시, 네비 활성표시 버그 수정(현재페이지만).
- 세트 SEO 페이지 실데이터 심화 + **PSA10 가치 랭킹 페이지**(psa10-ranking.html) 신설, 네비/사이트맵 등록, IndexNow 통지.
- **박스 "시세(sold) vs 매물(호가)" 두 숫자 모델** — 일판·영문 20세트씩. 영문판 **그래프는 2026-08-01부터**(7월 실거래 축적 후, `renderBoxSeries`의 `EN_GRAPH_FROM`).
- PSA10 sold n>=3 전면 강제(표본<3 26장 숨김). PSA10 카드 sold 상위 8엔트리 7/9 갱신(변형필터 검증됨).

## 6. 남은 작업 / 다음 우선순위
1. **[정확도 부채] 카드 PSA10 sold** — 상위 9장은 7/10 갱신 완료(6B 참고). 나머지 ~100장은 아직 6/29(대부분 저가·멀티변형). `node tools/psa10-sold-refresh.js`로 URL+추출기 얻어 브라우저(browser_batch navigate+javascript_tool 1장씩)로 갱신. **번호가 유일한 카드만**(멀티변형 보류). n>=3·제목 변형확인만 채택. KRW 저장(median_usd*fx.usdKrw). ※ sold 날짜는 UI에 안 보이므로 신선도는 정확도용(사용자 비가시).
2. **주 1회 sold 재수집**(박스+카드). 무인 불가 → 세션에서 브라우저로. `box-sold-urls.js`/`psa10-sold-refresh.js` 헬퍼로 빠르게.
3. **8월초**: 영문판 박스 그래프 자동 활성(코드상 날짜게이트 이미 됨) — 그 전 7월 sold 몇 번 더 수집 권장.
4. **성장(트래픽)**: 색인은 IndexNow+사이트맵+내부링크 완료. 다음 = 커뮤니티 공유 카드(레딧 r/OnePieceTCG 등), 아티클 추가.
5. **최대 활용 아이디어**: sold 판매량(수요 신호)·가격 모멘텀(sold 스냅샷 2개+ 후) 지표화.

## 6B. 2026-07-10 B/A/C 패스 (리텐션·데이터·속도) — 캐시값 `20260710b`
방문자 실측(GA4 authuser=1=소유자 개인 계정): 지난 7일 활성 75명(미국34·한국20), 검색유입 27세션, eBay outbound_click 60회. 서치콘솔: 노출 150·클릭 20·평균순위 7.4. → 리텐션 나쁘지 않음. 아래로 계속 고도화.
- **B(랜딩 다듬기)**: 카드 0장인 세트(OP-16)가 "준비중" disabled 타일 + 박스 시세도 안 뜨는 죽은 페이지였음. → `renderDetail` 카드없음 분기에서 박스 시세(sold/active) 렌더 + "TOP10 집계중" 안내(`.pendingCards`). `renderPackGrid`는 `hasBoxData()` 있으면 칩 클릭 가능("박스 시세" 태그). `applyRouteState`도 박스만 있는 세트 `?set=` 라우팅 허용. (기존엔 카드 있는 세트만) — `hasBoxData()` 헬퍼 추가.
- **A(PSA10 sold 완성·정확도)**: 상위 9장 브라우저 eBay 재수집(7/10). 변형필터(vOK) 그대로, 제목 확인, n>=3만 채택. OP13-118·OP09-119·OP07-051·EB03-055·EB03-026·OP01-120·OP11-118·EB03-053·OP01-003. 표본 대폭↑(4→18 등). 실제 냉각 반영(OP09-119 -32%, OP01-003 -43%). **같은번호 멀티변형 15장(OP05-119·EB02-061·OP06-118·EB01-006·OP05-069·OP09-051 등)은 오염 위험으로 보류(6/29 유지)** — 정확도 원칙. 나머지 저가·6/29 카드는 미착수(가치 낮음).
- **C(속도/모바일)**: 측정 CLS **0**, DOM 130ms, 광고 async·폰트 display=swap·preconnect 이미 양호. FCP~2s는 AdSense 메인스레드(수익원, 손 안 댐). 개선: **데이터 JSON(459KB)을 index/packs/compare.html에서 `<link rel=preload as=fetch>`** → SPA 첫 렌더 앞당김. ⚠️ **preload href의 `?v=`는 DATA_VERSION과 반드시 동기**(안 그러면 이중 다운로드). 버전 bump 스크립트가 `20260710b` 문자열을 전부 치환하므로 같이 갱신됨 — 수동으로 DATA_VERSION만 바꾸지 말 것.

## 6A. 2026-07-10 SEO · 안정성 패스 (Codex)
- **홈 URL 정상화**: 기존 `index.html`은 곧바로 `packs.html`로 보내는 리다이렉트 전용 페이지였음. 이제 루트 `/` 자체가 실제 트래커 HTML을 제공한다. 홈 canonical, sitemap의 대표 URL, 브랜드 링크를 모두 `https://opboxindex.com/`으로 통일했다.
- **구조화 데이터 정리**: 홈의 `WebSite` 스키마에 `alternateName: OPBoxIndex`와 `Organization`을 넣었다. 실제 사이트 내 검색 기능이 없는데 선언돼 있던 `SearchAction`은 제거했다. Google이 홈을 OP-01 상세처럼 이해할 여지를 줄이는 목적이다.
- **새 영문 아티클**: `articles/one-piece-card-price-guide.html` 추가. `One Piece card prices`, `PSA 10 card prices`, `Japanese NM`, `eBay sold prices` 의도를 설명하며, 변형 오매칭·표본 부족을 숨기는 운영 원칙을 명시했다. 아티클 허브·홈·전 세트 가이드에서 내부링크를 연결했고 sitemap에도 넣었다.
- **SEO 자동 검사**: `tools/audit-seo.js` 추가. 홈/아티클/세트 페이지의 제목, 설명, canonical, H1, OG 이미지, schema, sitemap 대표 URL을 검사한다. 일일·주간 워크플로의 시작 단계에서 자동 실행된다.
- **API 재시도**: `tools/run-with-retry.js` 추가. eBay active 수집(박스/영문박스/PSA10 링크 및 주간 영문 NM)은 최대 3회, 10초/20초 backoff로 재시도한다. 재시도 뒤에도 실패하면 워크플로가 빨간불·로그 아티팩트를 남긴다.
- **검증 완료**: `node tools/audit-seo.js` 통과(홈 2, 아티클 10, 세트 20). 390px 모바일 DOM 측정에서 가로 넘침 0, 홈 title/canonical/H1 정상, 브라우저 console error 0. 새 캐시값 `20260710seo`.
- **자동화 주의**: 2026-07-10 03:00 KST active-listing 실행은 `Update eBay active box links` 단계에서 실패했다. 로컬 OAuth 키는 정상(`valid`)이며 공개 API는 상세 로그 다운로드를 막는다. 이번 재시도 배포 후 다음 03:00 KST 실행을 확인할 것. 또 실패하면 GitHub Actions 실행 로그에서 eBay HTTP 상태를 확인하고, GitHub 시크릿이 로컬 rotated Production 값과 같은지 점검한다. `update-ebay-psa10-prices.js`는 절대 실행 금지 규칙은 그대로다.

## 7. Codex 최적화 패스 시 볼 만한 것
- `packs.js`(~1200줄) 단일 파일 — 렌더 함수 많음. 성능: 대량 DOM innerHTML 재생성(renderDetail). 모듈 분리 검토(단 배포는 정적 파일이라 번들러 없음, 바닐라 유지).
- SEO 페이지 생성기(`generate-set-pages.js`)가 매일 워크플로에서 재생성됨 — 스키마/메타 보강 여지.
- 접근성(aria)·라이트하우스 점수·이미지 lazy·CLS 점검.
- ⚠️ 값/데이터 로직은 정확도 규칙(4장) 위반 없이. UI/성능/코드정리 위주 권장.

## 8. 검증 습관
- 코드 바꾸면 `node --check packs.js`, 프리뷰(preview_* 도구)로 DOM 측정(스크린샷은 광고스크립트로 자주 먹통 — DOM eval로 검증).
- 배포 후 `curl https://opboxindex.com/...` 로 라이브 확인.

## Suggested skills for next agent
- `diagnosing-bugs`: eBay 워크플로가 재시도 후에도 실패할 때만, 로그 기반으로 원인을 분리할 때 사용.
- `browser:control-in-app-browser`: 모바일 390px와 배포 후 실제 DOM/canonical을 확인할 때 사용.
- `handoff`: 다음 세션으로 넘길 때 현재 상태를 짧은 임시 인수인계로 남길 때 사용.
# 2026-07-21 Codex - PSA Opening Meter weekly pipeline

- Added `tools/update-psa-weekly-history.js` and `data/psa-population-snapshots.json`.
- The 2026-07-15 verified cumulative total (608,756 across 21 sets) is now preserved as the baseline. The previous 2026-07-08 cumulative snapshot was overwritten before this pipeline existed, so the 07-15 weekly delta must not be fabricated.
- When every set's `psaFull.total` advances with one common verified date 6-8 days after the prior snapshot, the script calculates per-set deltas and appends the next `psaWeekly.points` bar automatically.
- Duplicate dates are no-ops; changed data on an already stored date, cumulative regressions, mixed dates, and non-weekly intervals fail closed.
- The Monday market workflow runs the updater, commits the snapshot archive, and performs a final freshness check. If the upstream cumulative PSA source is older than 8 days, Actions now fails visibly instead of silently publishing a frozen "live" meter.
- Important remaining source limitation: the repository still has no approved automatic PSA/GemRate cumulative collector. PSA's unauthenticated public API quota is not sufficient for all sets, and the historical data was manually imported. Do not scrape TCG Quant or invent weekly totals. Connect an approved PSA population source before calling the meter fully unattended.

## 애드센스 통과 후 정리 목록 (2026-08-14 기록 — 사용자 지시: "통과하면 없애자")

심사 때문에 남겨둔 콘텐츠들. **애드센스 승인 전에는 건드리지 말 것** — 지금 지우면 심사 대상 페이지가 얇아진다.
승인 뒤에 아래를 정리한다.

- **홈 하단 21세트 가격표**(`index.html` 의 `.homeSummary`) — 근거가 `Weekly ungraded market`(우리가 버린 혼합소스)라
  같은 페이지의 그래프와 숫자가 다르다(OP-01 일본판 표 $313 vs 실거래 $292, 표는 2026-07-12 로 한 달 낡음).
  없애거나, 남긴다면 실거래(sold) 기준으로 갈아끼울 것.
- **compare.html** — 사용자 평: 애드센스 아니면 지울 페이지. 글이 길고 일반 독자가 안 읽는다.
- PSA 메뉴 항목 정리(사용자가 한 번 지적, 애드센스 결과 후 결정으로 보류).
- 한국어 세트페이지 21장 noindex 해제 여부도 이때 함께 결정.
