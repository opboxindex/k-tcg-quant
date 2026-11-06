# OP Box Index — 운영 지침 (모든 에이전트 필독)

> ## 🔴 2026-08-10 애드센스 최신 잠금 규칙
> - 2차 거절 대응으로 AdSense는 영어 핵심·편집 지면 24장에만 유지했다. 세트·카드·한국어·허브·법적 지면과
>   `packs.html`에는 다시 넣지 않는다. eBay EPN `campid=5339163744`는 별도 주 수익원이므로 절대 제거하지 않는다.
> - 모든 변경 후 `node tools/audit-adsense-readiness.js`와 `node tools/guard-invariants.js`를 실행한다.
> - 3차 재검토는 2026-08-24 전 금지. AdSense/GSC 상태 확인과 사용자 명시 지시 없이 버튼을 누르지 않는다.
> - 승인돼도 AdSense 대량 복원이나 noindex 일괄 해제를 자동 실행하지 않는다. `HANDOFF.md` 맨 위가 최우선이다.

> ## 🔴 먼저 읽을 것 — 2026-08-10 기준 현재 상태
> 이 문서 아래쪽 내용은 7월 초에 쓰여 일부가 낡았다. **최신 이력·다음 작업은 `HANDOFF.md` 맨 위부터** 읽는다.
> 새 세션은 시작할 때 `HANDOFF.md` 상단 3개 섹션을 반드시 읽고 시작할 것.
>
> ### 절대 규칙 (사용자 지시 — 위반 시 사업 손실)
> 1. **기존 페이지의 구글 노출 상태를 임의로 바꾸지 않는다.** noindex 추가·canonical/hreflang 변경·
>    사이트맵에서 URL 제거·페이지 삭제는 **사용자 사전 확인 필수**. 새 페이지 추가·사이트맵 추가·
>    본문 수정·noindex 해제(노출을 늘리는 방향)는 허용. SEO 관련 커밋 전 `git diff`로 확인할 것.
>    (2026-07 canonical 스왑으로 홈 노출 0 사고, 7/24 대량 noindex가 유입 정체 원인)
> 2. **모든 수정 후 `node tools/guard-invariants.js` 통과 필수.** FAIL이면 푸시 금지.
>    등급 데이터를 건드렸으면 `node tools/audit-grading-numbers.js` 도 함께.
> 3. **추정치 금지.** 값이 없으면 "집계중"으로 비운다. 빈 칸이 틀린 숫자보다 낫다.
> 4. **카드 변형(변형=패러렐/망가/SP/금·은) 매칭은 번호만으로 하지 않는다.** 번호+변형 이중매칭,
>    후보가 2개 이상이면 채택하지 말고 사람에게 물어본다. 이미지 변형 오배정 사고가 반복됐다.
> 5. **판별(일본판/영문판)·등급사(PSA/CGC/TAG) 간 합산 금지.**
> 6. 크롬이 여러 대 잡히면 **묻지 말고 `osPlatform:"Windows"` + `isLocal:true`** 를 고른다.
>    맥은 회사 계정을 공유하는 타인 기기다(2026-07-31 이것 때문에 그날 수집을 통째로 날림).
>
> ### 현재 최우선순위
> 1. **해외(영어) 유저 유입** — 2026-08-01 사용자 지시로 한국어 SEO는 부차로 내려감.
> 2. **애드센스**: 2차도 "가치 없는 콘텐츠"로 거절됨. 8/10 전면 수정 배포 후 크롤 대기 중이며
>    8/24 전 3차 요청 금지. 승인 여부와 무관하게 광고/noindex 자동 원복 금지.
> 3. **9/30 대규모 업데이트** 재료로 sold·등급 데이터 계속 축적(예약 태스크 있음).
>
> ### 상태 요약 (2026-08-01)
> - 공개 105+4페이지, 색인 허용 60 / noindex 48(임시). GSC 28일: 클릭 45·노출 704·CTR 6.4%·순위 9.9.
> - GA4 채널: Direct 62%(네이버 카페 일회성, 감소 중) · Organic 16%(참여율 82%로 質 최상) · AI Assistant 11%(유일 성장).
> - 자체 데이터셋 3종: 박스 sold 시계열(월수금 수집) · 등급 인구 3사×판별(월요일 수동) · 경매 실낙찰 원장(자동, 2시간마다).
> - 신설 지면: `auction.html`(영어, 경매 실낙찰) · `ko/cards.html` `ko/grading.html` `ko/auction.html`.
> - GSC 계정 주의: 속성은 `https://opboxindex.com/` (URL 접두어). 크롬 프로필 `/u/1/` 에 로그인돼 있다.

## 수집 현황은 여기 한 곳에서 본다

```
node tools/collect-status.js
```

수집원 11개(자동 6 · 수동 5)를 한 화면에 모아 **"지금 내가 뭘 해야 하나"**에 답한다.
2026-09-02 신설 — 소유자 지적("박스 수집·월수금 알림·워크플로가 파편적이라 뭘 수집하는지 모르겠다").

- **자동 6종**: GitHub Actions 가 돌린다. 사람이 할 일 없음. 여기서 "늦음"이 뜨면 워크플로 로그를 볼 것.
- **수동 5종**: eBay·그레이딩사가 API 를 막아 **실브라우저로만** 된다 — 사용자가 시켜야 돈다.
  박스 판매(주 3회) · PSA/CGC/TAG 등급 인구(주 1회). 팰월드 전용 수집은 2026-11-05 중단(원장 동결, TCG 13종 묶음에서만 본다).
- 월·수·금 알림(`opbox-collect-reminder-mwf`)이 이 도구를 **실제로 실행해** 밀린 것만 짚어준다.
  요일로 짐작하지 않는다 — 다 최신이면 "할 거 없다"고 알린다.

`audit-collection-health.js` 와 역할이 다르다: 그쪽은 "데이터가 늙었나"(가드용, 실패 시 exit 1),
이쪽은 "누가 해야 하나"(사람용). 둘 다 남긴다.

이 프로젝트를 열면 **매번, 요청 없이도** 아래를 먼저 확인하고 챙긴다. 사용자는 "내가 모르는 것도 알아서 챙기라"고 명시적으로 요청했다 — 매번 다시 물어보지 말 것.

## 사용자 컨텍스트
- 비개발자, 짧고 직접적인 한국어 선호. 실제 사장님(1인 운영), 이 사이트로 **수익화**가 목표.
- **가격 정확도 최우선**: 불확실한 가격은 절대 노출 금지, 숨기는 게 항상 맞다. 추정치를 사실처럼 보여주지 않는다.
- 계정 생성·결제·GitHub 앱 권한 승인처럼 **영구적 권한을 넘기는 행위는 사용자가 직접** 클릭해야 한다 (분류기가 막는 게 정상 — 우회 시도 금지).

## 사이트 정보
- 라이브: https://opboxindex.com (GitHub Pages, repo: `opboxindex/k-tcg-quant`, branch `main`)
- 메인 페이지: `index.html`/`https://opboxindex.com/`. `packs.html`은 루트 canonical의 noindex 레거시 별칭.
- SEO 세트 가이드: `sets/*.html` (21개, `tools/generate-set-pages.js`로 재생성)
- 데이터: `data/onepiece-packs.json` (가격/매물, 자동 갱신됨)

## 수익화 상태 (2026-08-10 기준)
1. **Google AdSense**: `ads.txt` 유지. 2차 거절 대응 후 24개 핵심 지면만 광고 허용. 3차 요청은 8/24 이후 별도 판단.
2. **eBay Partner Network**: campid `5339163744`, `packs.js`의 `epnUrl()`이 모든 eBay 링크에 자동 부착. 대시보드는 partner.ebay.com. **클릭/전환 늘리는 게 최우선 과제.**
3. **Google Search Console**: URL 접두어 속성 `https://opboxindex.com/`으로 인증 완료(HTML 파일 `googlee0d71bc0695b5651.html` — **절대 삭제 금지**, 지우면 인증 풀림). 사이트맵 제출됨, 색인 요청됨.
4. **GA4**: `G-P73SE1WVD0`, 전 페이지 배포됨.

## 매번 자동으로 점검할 것 (요청 없어도)
- [ ] `git log --oneline -10` — 최근 뭐가 바뀌었는지, 워크플로가 정상 커밋했는지
- [ ] `.github/workflows/` 두 개가 최근에 성공했는지 (`update-active-listings` 매일 03:00 KST, `update-market-data` 매주 월 03:00 KST) — GitHub Actions 탭에서 초록불 확인
- [ ] `data/onepiece-packs.json`의 `updated` 필드가 오늘/어제 날짜인지 (오래됐으면 워크플로 문제)
- [ ] eBay 최저가 링크 커버리지: 박스 20/20, PSA10 카드 183/199가 기준선. 크게 떨어지면 `tools/audit-active-listings.js` 결과 확인
- [ ] AdSense 승인 여부 (사용자가 알려주거나 사이트에 실제 광고가 뜨는지 확인)
- [ ] Search Console "색인생성 → 페이지" 색인 수 증가 추이, 실적(노출수) 추이
- [ ] 새 세트(예: OP-16, EB-04) 데이터가 채워졌으면 `node tools/generate-set-pages.js` 재실행 + sitemap 갱신 + 색인 요청

## 다음에 진행할 성장 작업 (우선순위)
1. **영문 아티클 추가** — `articles/`에 5개(2026-07-03 기준, OP-05 vs OP-06·PSA population 2편 추가함). 세트별/주제별 롱테일 키워드 아티클을 계속 늘리면 색인·유입·AdSense 심사에 유리. `tools/generate-set-pages.js`가 세트 페이지에 자동으로 관련 아티클 링크를 심으니, 새 아티클 추가 시 이 스크립트의 링크 목록도 같이 갱신할 것.
2. **eBay CTA 전환율 계속 개선** — GA4 `outbound_click` 이벤트로 어떤 버튼/문구가 클릭률 높은지 확인 후 반영.
3. **레딧/커뮤니티 백링크** — 사용자가 직접 공유해야 하는 부분이지만, 공유하기 좋은 형태(요약 카드, 짧은 링크)를 에이전트가 준비해줄 수 있다.
4. **PSA10 미매칭 16장** — 신뢰할 매칭이 생기기 전까지는 채우지 말 것 (추정 금지 원칙).
5. **가격 품질 리뷰 항목** — `tools/audit-price-quality.js` review 건수 주기적으로 정리.
6. ~~네이버 서치어드바이저~~ — 2026-08-01 우선순위에서 내려감(해외 유입 우선).

## 절대 하지 말 것
- `.env`, eBay API 시크릿, GitHub 토큰을 출력하거나 커밋하지 않는다.
- `googlee0d71bc0695b5651.html` (GSC 인증 파일) 삭제 금지.
- 불확실한 가격을 "정상"처럼 보여주지 않는다 — 숨기는 게 항상 우선.
- GitHub 앱 설치/권한 승인, 결제, 계정 생성 등 영구 권한 행위를 대신 클릭하지 않는다 — 사용자에게 안내만 한다.

## 참고 문서 (자세한 이력)
- `docs/handoff-2026-07-01-accounts.md` — 도메인 DNS, GA4, GSC, AdSense 계정 세팅 상세
- `docs/automation.md` — 워크플로 상세
- `docs/handoff-2026-06-29.md` — 가격 데이터 정합성 작업 이력
- `docs/ebay-api.md`, `docs/price-data.md` — eBay/가격 로직 상세

새 세션을 시작하는 에이전트는 이 문서를 읽은 뒤, 위 체크리스트를 실제로 실행(git log, workflow 상태 확인 등)하고 이상 있으면 사용자에게 먼저 보고한다. 정상이면 굳이 보고하지 않고 다음 성장 작업으로 넘어간다.

## 2026-07-06 추가 사항 (Claude)
- **배포 실패 대응**: GitHub Pages의 "Deploy to GitHub Pages" 단계가 간헐 실패함(인프라 결함, 콘텐츠 무관).
  배포 후 반드시 라이브 반영을 curl로 확인하고, 실패 시 `git commit --allow-empty -m "chore: retrigger"` 후 push로 재트리거.
- **IndexNow 구축됨**: `tools/indexnow-submit.js` — sitemap 전체 URL을 Bing/Naver/Yandex에 즉시 통지.
  키 파일(루트의 32자리 hex .txt)은 **삭제 금지**. 사이트맵에 URL 추가/대량 갱신 시 이 스크립트 재실행.
- **og-image.png**: 1200x630 소셜 공유 카드(루트). 전 페이지 og:image + twitter summary_large_image 적용.
  브랜딩 바뀌면 세션에서 PIL로 재생성(생성 코드는 git log 2026-07-06 커밋 참고).
- **PSA10 최저가 오매칭 방어**: 두 수집기의 hasVariantSignal 강화(SP↔패러렐↔망가 교차 차단) +
  활성 수집기에 "Sold 중간값 35% 미만이면 버튼 숨김" 안전장치. 이 로직 완화 금지.
- **GSC 소유 계정 주의**: Search Console 속성 소유 계정은 소유자 개인 구글 계정(로컬 메모 참고).

## 일본 시장 판단 (2026-07-06, 사용자와 합의된 방향)
- **일본어 버전은 당분간 만들지 않는다.** 야후재팬=구글 엔진이라 별도 등록 불필요하지만,
  일본 소비자는 eBay에서 구매하지 않음(메루카리/야후옥션/카드샵 사용) → 주 수익원인 EPN이 전환 안 됨.
- 재검토 조건: ①AdSense 승인 후(일본 트래픽도 광고 수익화 가능) ②일본측 제휴 확보 시
  (Amazon JP Associates — amazon-lottery.html의 Amazon.co.jp 링크 수익화 가능, 라쿠텐 등).
- 틈새 메모: 일본 '판매자'가 해외(eBay) 시세를 궁금해하는 수요는 존재 — JP 버전 만들 때 셀링포인트.

## TCGplayer 제휴 (Impact.com, 진행 중 — 2026-07-06 업데이트)
- TCGplayer 제휴: Impact.com 경유, **판매가 3.5%**, 첫 클릭 귀속·48시간·장바구니 전체 인정. EPN보다 요율 높음.
- **진행 상태**: Impact 계정 가입(소유자 개인 메일), 사이트 소유권 인증 진행 중.
  - 사이트 인증용 메타태그 **이미 배포됨**: `<meta name="impact-site-verification" value="16e92286-f00c-4878-ba9f-9747912758b6" />` (packs.html·index.html head, 라이브 확인됨). 삭제 금지.
  - 다음 단계: Impact 대시보드에서 TCGplayer 프로그램 신청→승인 대기→추적링크(Impact deep link) 형식 확보.
- **통합 계획(승인 후)**: 카드 카드의 "영문판 NM" 표시 자리에 "Buy English version on TCGplayer" 버튼.
  - packs.js `cardBuyLinks()` 근처에 `tcgplayerUrl()` 헬퍼 추가(epnUrl() 패턴 참고), 영문판 있는 카드에만 노출.
  - eBay(일본판)와 TCGplayer(영문판) 보완 투트랙. rel="sponsored", affiliate disclosure에 TCGplayer 추가.

## 2026-07-06 저녁 작업 (Claude) — 데이터검수 + SEO 구조 강화
- **데이터 검수 통과**: PSA10 179개 35%위반 0건, 박스 21개 정상. OP-12/13 "best>low"는 오류 아님(배송비 포함 총액이라 밴드하한보다 살짝 높은 정상 케이스).
- **아티클 SEO**: 8개 전부 Article+Breadcrumb 스키마 완비. 얇던 3개 본문 보강(japan-vs-english/reseal-checklist/sealed-box-rules → 425~502단어). 관련글 내부링크 푸터(.articleFooter) 추가.
- **아티클 허브 신설**: `articles/index.html`(CollectionPage 스키마, 8개 모음). 홈 note에 "all guides →" 링크. sitemap 77 URL.
- **WebSite/SearchAction 스키마**: packs.html에 추가(구글 sitelinks 검색창 후보).
- **스레드 첫 게시글 데이터 확정**: JP 박스 시세 TOP3(7/6) OP-01 $350 / OP-06 $200 / PRB-01 $185. "June→July 변동" 절대 금지(박스 6월 이력 없음 — 지어내면 안 됨).

## ⚠️ 데이터 진실성 사고 교훈 (중요)
- 다른 Claude 새 채팅이 **새 폴더**에서 작업하며 "6월 대비 박스 -55%" 이미지를 만듦 → 박스 6월 이력은 이 repo에 **존재 자체가 없음**. 없는 데이터로 변동% 지어낸 것.
- **철칙**: 모든 자동화/콘텐츠는 반드시 이 폴더 `data/onepiece-packs.json`에서만 값 추출. 시계열 비교는 스냅샷 2개 이상 쌓인 뒤에만. 단일 스냅샷으로 "지난달 대비" 만들지 말 것.
- 소셜 카드 시계열은 `data/social-card-price-snapshots.json`이 주간 누적되어야 가능(현재 7/6 1개뿐 = baseline).

## 광고/수익 현황 (2026-07-06)
- AdSense: 심사 약 7일째, 외부 프로세스라 앞당길 방법 없음. 콘텐츠 보강(아티클/허브)이 승인 확률에 도움 — 계속 늘릴 것.

## ⚠️ PSA10 sold 데이터 갱신 함정 (2026-07-06, 반드시 숙지)
- `card.psa10Ebay`(soldBased:true) = **PSA10 판매완료 시세** → PSA10 프리미엄 지표의 입력. 6/29 코덱스가 `psa10-sold-audit.json` 방식(커밋 42efabf "Replace PSA10 prices with eBay sold audit")으로 생성. **이걸 정기 갱신하는 워크플로가 현재 없음** → 6/29에 멈춰있음(값 자체는 유효).
- **`tools/update-ebay-psa10-prices.js`를 워크플로/수동으로 절대 돌리지 말 것.** 이름은 "psa10 가격"이지만 실제로는 `searchActiveListings`(현재 매물)를 검색하고 `soldBased` 필드를 안 만듦 → 돌리면 sold 데이터(138건)를 active로 덮어써 손상시키고 PSA10 프리미엄이 전부 사라짐. (2026-07-06 실제로 돌렸다가 롤백함.)
- PSA10 sold 자동 갱신이 필요하면: 42efabf의 sold-audit 방식을 재현하는 **검증된 sold 검색 스크립트**를 새로 만들어야 함. active 스크립트 재사용 금지.
- 참고: `update-ebay-psa10-active-links.js`(active 최저가 링크, psa10Active)는 정상이고 매일 워크플로에 있음 — 이건 별개.

## 지표 자동화 현황 (2026-07-06)
- **오늘의 박스 딜**: 입력=박스 active(bestListing/middle) → 매일 03:00 워크플로로 갱신됨. 추가 작업 불필요.
- **PSA10 프리미엄**: 입력=nmJpy(주간 갱신 ✓) + psa10Ebay sold(6/29 멈춤, 위 함정 참고). 값은 유효, 클라이언트 실시간 계산.

## 2026-07-07 Fable 마지막날 — 고도화 기틀 (Opus 완료)
- **카드 시세 이력 축적 시작**: `tools/update-card-series-history.js` — 카드별 NM·PSA10을 card.series.points에 변화시만 append(180일). 매일 03:00 워크플로에 추가됨. 오늘 시드 195개 뿌림. **2~3주 쌓이면 카드별 추이 그래프 UI 제작 가능**(renderBoxSeries 패턴 복제, points<2면 숨김).
- **전 세트 비교 랭킹 표**: 홈에 #compareTable — 20박스를 투자매력도 순으로. setAnalytics 실측 지표 재사용. 행 클릭→상세. 연구소 간판 역할 + "best one piece booster box" SEO.

## 다음에 하면 좋을 것 (Fable가 남기는 로드맵)
1. **카드 추이 그래프 UI**: card.series 데이터가 2~3주 쌓인 뒤. 카드 상세/히트리스트에 미니 스파크라인. renderBoxSeries 함수 참고.
2. **전 세트 비교를 별도 정적 페이지로**: 지금은 packs.html 내 섹션. SEO 극대화하려면 compare.html 정적 페이지화(단 지표는 클라이언트 계산 유지 — setAnalytics 로직 공유 필요, packs.js 모듈 분리 검토).
3. **그레이딩 업사이드 랭킹**: PSA10 프리미엄을 전 세트에서 모아 TOP20 페이지. 우리만의 데이터 조합.
4. **신규 세트 자동 감지**: OP-17 등 데이터 채워지면 generate-set-pages + sitemap + 색인요청 자동화.
5. **PSA10 sold 갱신 스크립트**: 위 함정 참고. sold 검색하는 검증된 스크립트 신규 제작(active 재사용 금지).

## 📐 데이터 기준 원칙 (2026-07-07 확정, 사용자 합의)
- **대표/신뢰 지표 = eBay 실거래(sold)만.** 업계 공인 기준(PSA·Card Ladder·130point 전부 eBay sold 사용). 호가(ask/active)는 "지금 살 수 있는 가격"(구매 버튼·딜)에만 쓰고, 지표에 쓸 땐 반드시 'ask/호가' 라벨.
- **TCGplayer 스크래핑 금지**: 약관 위반 + 제휴 심사 중 신뢰 훼손 + 영문판 중심이라 일본판과 부적합.
- 비교표에 "Top card sold" 컬럼(최고 카드의 PSA10 실거래, 3건+) + 카드 지지력 "1장 쏠림(top-heavy)" 경고(top1이 50%+) 적용됨.
- 알려진 한계: 카드 지지력은 유유테이 호가 기반(일본판 NM eBay 경로는 Finding API 사망으로 2026-09-30 삭제 — sold NM 없음). PRB-02 같은 재록 세트는 원본 세트 카드 호가를 참조해 과대평가 소지 — 재록 각인 카드 가격 분리 매칭은 미해결 과제.

---

# 🤝 인수인계 (2026-07-07, Claude → Codex/다음 세션)

## 지금 상태 한 줄 요약
사이트 정상, 배포 정상, 데이터 파이프라인 무인 가동 중. 미커밋 2개(.gitignore, docs/automation.md)는 코덱스 세션 작업분 — 코덱스가 마무리할 것.

## 내일(7/8) 새벽 3시 이후 확인할 것
1. **카드 이력 축적 첫 자동 실행** — `update-card-series-history.js`가 매일 워크플로에 새로 들어감. Actions 초록불 + `card.series.points` 정상 append 확인. (변화 없으면 appended=0이 정상)
2. 평소 체크리스트 (git log, 워크플로, updated 날짜, 커버리지)

## 대기 중 (외부 요인, 재촉 불가)
- **AdSense**: 심사 ~8일째. 승인되면 사용자에게 알리고 광고 슬롯 실동작 확인.
- **TCGplayer 제휴(Impact)**: 약관 동의 완료, 승인 대기. 승인되면 위 "TCGplayer 제휴" 섹션의 통합 계획 실행.
- **구글 재색인**: 영문 타이틀로 캐시 교체 중 (수일 소요). 새 페이지 compare.html 색인 유입 추이 관찰.

## 이어서 하면 좋은 것 (우선순위)
1. **스레드 운영 지원**: 사용자가 @opboxindex 운영 시작. 게시글 데이터는 반드시 이 repo에서 추출, 시계열 변동은 스냅샷 2개+ 쌓인 뒤에만 (위 "데이터 진실성" 철칙).
2. **카드 추이 그래프**: card.series 2~3주 쌓이면. 그 전엔 만들지 말 것 (점 1개로 선 못 그림).
3. **영문 아티클 추가** — AdSense 심사·SEO 둘 다에 유효한 유일한 능동 수단.
4. 재록 세트(PRB-*) 카드값 분리 매칭 — "데이터 기준 원칙" 섹션의 알려진 한계.

## 오늘 배포된 것 (컨텍스트)
- compare.html: 전 세트 비교 + 지표 범례 + Top card sold(실거래) 컬럼 + top-heavy 경고
- 홈: 비교표 분리로 가독성 복구, 오늘의 딜/PSA10 프리미엄 유지
- 카드 이력 축적 파이프라인 (시드 195개)
- 데이터 기준 원칙 확정: 대표지표=eBay sold, 호가는 ask 라벨 필수

⚠️ 절대 금지 재확인: `update-ebay-psa10-prices.js` 실행 금지(sold 데이터 파괴), GSC 인증파일·IndexNow 키 삭제 금지, 없는 시계열로 변동% 생성 금지.

## 🐭 중국셀러 두더지게임 대응 절차 (2026-07-08)
- **왜 재발하나**: eBay API는 판매자 가입국을 안 줌. 중국셀러가 미국 창고(country=US)로 발송하면 위치필터 우회 → **이름 차단 목록**이 유일한 수단이라, 하나 막으면 다음으로 싼 중국셀러가 올라옴(코덱스 jindoutian → pengsupply 재발이 그 사례).
- **발견 시 1분 처리 절차**:
  1. `tools/ebay-listing-filters.js`의 `excludedSellerUsernames`에 유저명 추가(소문자, 확인 날짜 주석)
  2. `node tools/test-ebay-listing-filters.js` 통과 확인
  3. 해당 세트만 재수집: `node tools/update-ebay-pack-prices.js EB-02` (.env 로드 필요. 이 스크립트는 안전 — psa10-prices와 다름)
  4. 새 최저가 셀러도 의심되면 `curl https://www.ebay.com/usr/<셀러명>`으로 China 신호 확인
  5. 커밋·배포
- 차단 이력: jindoutian(7/7 코덱스), pengsupply(7/8, EB-02)

## ⚠️ 변형(variant) 필터 이력 — red 규칙 (2026-07-08)
- **사고**: OP13-118 "Red Manga"(NM $15k) 행의 PSA10 버튼·sold 밴드가 일반망가($3.2k)로 연결. 사용자 발견.
- **red 규칙**: 카드명에 red 있으면 제목에도 `\bred\b` 필수(두 수집기 hasVariantSignal). colored 오탐 방지 위해 워드바운더리 필수.
- **교훈(에이전트용)**: 파이썬 heredoc으로 JS 정규식 쓸 때 `\b`가 백스페이스(0x08)로 들어가는 사고 실제 발생 — 브랜치가 소리없이 죽음. 정규식 삽입 후 반드시 `od -c`로 바이트 확인 + 실제 파일 함수를 모듈로 로드해 대표 케이스 테스트.
- **sold 밴드 정정 기법**: `data/psa10-sold-audit.json`의 rows[].samples[]에 판매 원시 제목이 있음 → 변형 오염 발견 시 제목 필터로 재계산 가능(OP13-118: 오염 ₩5.5M → 레드만 ₩18.57M 정정). 표본<3이면 밴드 삭제(숨김).

## 🔍 2026-07-08 외부감사 소급정화 (전 세트)
- 현행 변형필터를 저장 데이터에 소급 적용하는 감사 기법 확립(아래 스니펫 패턴). sold 밴드 136개 중 39개 오염 발견 → 24 재계산 / 15 숨김. 정정 후 오염 0.
- **스레드 게시물 정정 필요**: 7/8 그레이딩 배수 게시물의 보아 OP07-051 "×16($764)"는 오염 밴드 기반이었음(정정 후 근거 소멸). OP01-078은 ×11→×14.2, 제우스 ×23 유지. 사용자에게 게시물 수정/삭제 안내함.
- 잔여 과제(우선순위): ①PSA10 sold 재수집 스크립트 신규 제작(6/29 정지 데이터의 근본 해결) ②재록(PRB-*) 카드값 분리 ③Lighthouse 성능 측정.

## 🌐 영문판 박스 시장 트래킹 (2026-07-08 가동, 사용자 전략)
- **컨셉**: 일본(스니커덩크/메루카리) ↔ 미국(eBay/TCGplayer) 브릿지. 같은 세트의 일판·영판 박스 시세를 한 화면에서 — 경쟁사에 없는 조합.
- `tools/update-ebay-english-pack-prices.js` → `boxMarket.en.ebayActive` (제목에 English 명시 매물만, 무표기 제외). 매일 03:00 워크플로 포함.
- `boxSeriesEn` 일일 축적 시작(표본3+ 세트만) → 2~3주 뒤 **일판·영판 이중 흐름 그래프** 제작 가능 (renderBoxSeries에 두 번째 라인 오버레이).
- UI: 세트 상세에 영문판 밴드 + "×N.N vs Japanese" 배율(renderEnglishBoxBand). 표본<3 숨김.
- 시드 검증: OP-01 EN $2,000 vs JP $350(×5.7) — 실제 시장과 정합. EB-02는 영문판 표본 0(자동 숨김).
- 다음 확장 아이디어: compare.html에 EN 박스가 컬럼, "JP vs EN premium" 랭킹 아티클/스레드 콘텐츠.

## JP/EN 이중 트래킹 완결 상태 (2026-07-08 저녁)
- **완료**: 이중축 그래프(JP 민트/왼쪽·EN 골드/오른쪽, 방향 비교용 명시), EN 최저가 버튼(EPN·딜배지·기준일), JP/EN langTag 라벨, 검색링크 JP Sold/Active 명칭, 박스 수집기 사기매물 가드(중간값 50% 미만 최저가 제외 — EN OP-01 $450 실차단).
- **EN 그래프 선은 내일(7/9)부터**: boxSeriesEn 2점째부터 자동 연결. 오늘은 점 1개 정상.
- **다음 업데이트 스코프(사용자 지정)**: Top10 카드 영문판 시세/버튼. englishNmEbay 필드 활용 또는 신규 수집.

## 그래프 3단 구조 확정 (2026-07-08 밤)
- 세트 상세 차트: ①함께 보기(정규화 100, JP/EN 변화율 비교 — 두 판 2점+일 때 자동) ②JP 개별 패널 ③EN 개별 패널(1점이면 대기 문구).
- EN 과거 이력: `tools/backfill-english-box-series.js`(Finding API sold 주간 중앙값) — **로컬 IP는 503, CI에서만 작동**. 매일 워크플로에 포함(503 스킵 가드). 첫 성공 실행 후 EN 그래프·함께보기 패널이 자동 활성화됨 → **내일(7/9) 아침 확인할 것**.
- 프리뷰에서 미래 상태 검증할 땐 state.data에 가짜 시리즈 주입→renderDetail()→원복 패턴 사용(배포 데이터 불변).


## 🚨 사고: GitHub eBay 시크릿 소실 → 파이프라인 3일 정지 (2026-07-09 발견)
- **증상**: `update-active-listings`(매일) 워크플로가 07-06 실행(run#6)부터 **연속 실패**. 단계 `Require eBay API secrets`에서 `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`가 비어(-z) exit 1 → 이후 모든 수집·커밋 스텝 skip. 07-05(run#5)까지는 성공.
- **영향**: 07-05 이후 박스 active·영문 active·PSA10 링크·박스/카드 이력 누적이 **전부 중단**(데이터 동결). 영문판 sold 백필(`backfill-en-now.yml`)도 같은 이유(App ID 빈값)로 "Missing EBAY_APP_ID" 에러 → 소급 0건.
- **진단 방법**: 백필 스크립트에 세트별 상태요약(`logs/en-backfill-status.json`) 커밋하게 해서 원인 특정(→ 503 아님, 자격증명 빈값). 워크플로 실행/실패단계는 `api.github.com/repos/opboxindex/k-tcg-quant/actions/...` 공개 API로 확인(gh CLI·인증 불필요).
- **로컬은 정상**: `.env`에 EBAY_CLIENT_ID(37자)·EBAY_CLIENT_SECRET(36자) 존재 → 로컬 Browse API 수집 OK. Finding API(sold)만 로컬 IP 503(별개 이슈).
- **복구(사용자 액션 필요)**: GitHub → 저장소 Settings → Secrets and variables → Actions 에서 저장소 시크릿 **EBAY_CLIENT_ID**, **EBAY_CLIENT_SECRET** 재등록. 값은 로컬 `.env`의 동일 키. (시크릿 등록은 권한행위라 에이전트가 대신 못 함. 값 출력·커밋 금지.)
- **복구 후 확인**: `backfill-en-now.yml` 자기발동 재실행 → `logs/en-backfill-status.json`에서 ok:true·weeks 확인. Finding API가 GitHub IP에서도 503이면 sold 소급은 불가 → 영문판 그래프는 매일 active 누적(basis:active, '호가' 라벨)으로 실제화하는 경로로 전환.


## 가격 신뢰도: 최저가 = 배송 포함 실착지금액 (2026-07-09 확인)
- PSA10/박스 "최저가"는 **상품가+실제 배송비 합계**(착지금액)다. eBay 상품 스티커(상품가만)와 비교하면 우리가 비싸 보이지만, 우리가 더 정직한 것. 사고 아님.
- 사례: OP15-086 Nami Alt PSA10 = 상품 $1,600 + 배송 $297 = **$1,897**. getItem으로 배송비 $297 실제 확인(부풀림 아님). 셀러 chibi_17(JP).
- 개선: `cardBuyLinks()` small줄에 "상품 $X + 배송 $Y" 분해 표시 추가(오해 방지). 무배송이면 "무료배송".
- 필터 건전성 확인: eBay "Nami" 저가 매물($10~150)은 전부 **다른 카드**(OP11-054·EB04·ST21·영문판). `isPsa10JapaneseCard`가 정확히 배제 중 → 표본 적어도 오염 아님.
- ⚠️ 남은 진짜 문제 = **신선도**. 07-06 이후 파이프라인 정지로 품절 매물을 최저가로 걸고 있음(OP15-086 그 매물 현재 OUT_OF_STOCK). eBay 시크릿 복구가 근본 해결 → [[GitHub eBay 시크릿 소실]] 참고.


## 배송료 기준 = US(미국) 확정 (2026-07-09, 사용자 확인)
- 최저가 총액의 배송비는 **eBay `EBAY_US` 마켓 조회 → 미국 도착 배송료**다. (수집기 `X-EBAY-C-MARKETPLACE-ID: EBAY_US`, ENDUSERCTX 미설정=마켓 기본=US)
- 실측 비교(OP15-086 item 366508267519): US=상품$1,375+배송$250 / KR=₩환산·배송0(엉터리) → KR 기준은 eBay가 신뢰값 안 줌. **US가 유일하게 일관된 기준.**
- eBay 배송료는 **구매자 주소별로 다르게** 계산됨(만인 공통 배송료 없음). 그래서 US 도착가 하나로 통일해 카드 간 동일 잣대 비교. 우리 표시가 = "미국 구매자 총액".
- UI: `cardBuyLinks()` 배송 라벨을 "미국배송 $X / US ship $X"로 명시(오해 방지). 박스 버튼도 동일 US 기준.


## UI 정리 (2026-07-09): 버튼 오버플로 + 함께보기 게이팅
- **구매 버튼 겹침 해결**: `.buyLink`가 inline-flex(내용폭)이라 좁은 열(167px)보다 넓어져(210px) 옆칸 침범 → `display:flex; width:100%; flex-wrap:wrap; box-sizing:border-box`로 열폭에 맞춰 접히게. dealChip margin-left 제거(gap 사용). 이 구조 되돌리지 말 것.
- **함께보기(compare) 패널 게이팅**: 겹치는 구간 3점+ & 14일+ 일 때만 렌더(`renderComparePanel` guard). 점 2개=하루치면 '+0% vs +0%' 납작선 나와서 깨져 보임 → 숨김. EN 데이터 2주 쌓이면 자동 등장.
- **기간 문구**: 25일 미만이면 'N일간', 이상이면 'N개월간'(`renderSeriesPanel`/`renderComparePanel`). 하루치에 '1개월간 보합' 뜨던 오류 수정.


## 성장작업 #1: 세트 SEO 페이지 실데이터 심화 (2026-07-09)
- `tools/generate-set-pages.js` 강화: 세트당 정적 HTML에 **실데이터 구워넣음** — ①요약라인(발매/카드수/PSA젬율) ②박스시세("as of 날짜" $mid·범위·매물수) ③히트카드 10행 **표**(NM생가 + PSA10 sold중앙값/ask, 날짜명시) ④세트별 고유 분석문단 ⑤PSA 그레이딩 섹션 ⑥ItemList 스키마. op-01 기준 10.9KB→16KB(+47%).
- **정직성**: 가격은 전부 "as of DATE"·sold/ask 라벨. NM=JPY→USD(fx), PSA10=sold(KRW→USD) 우선·없으면 active ask, 둘 다 없으면 "—".
- **최신 유지**: 매일 워크플로에 `generate-set-pages.js` 재생성 단계 추가 + 커밋에 `sets/ sitemap.xml` 포함 → 박스시세 매일 갱신 반영(=구글 신선도 신호). 값 스테일 걱정 없음(<24h·날짜표기).
- 다음 성장작업: #2 데이터 랭킹 페이지(PSA10 프리미엄 TOP·그레이딩 업사이드), #3 커뮤니티 공유 카드. [[project-ktcg-quant-mvp]]


## 성장작업 #2: PSA10 가치 랭킹 페이지 (2026-07-09)
- `psa10-ranking.html`(루트, generate-set-pages.js가 생성) — 전 세트 카드를 **PSA10 실거래 sold 값** 기준 TOP30. 클릭→해당 카드 트래커.
- ⚠️ **멀티플(PSA10÷NM) 안 씀**: NM 원본가가 일부 $0~3로 부실 → ×500 같은 엉터리 나옴. 정확도 우선이라 나눗셈 배제하고 **sold 값 자체로만** 랭킹. (표본 3건+, as-of 날짜 명시)
- 내부링크: 세트 페이지 PSA섹션 + 허브 + 랭킹→트래커. 사이트맵 등록. 매일 재생성(set-pages와 동일 스텝).
- 다음: #3 커뮤니티 공유 카드.

## PSA 데이터 갱신 현황 (2026-07-09 사용자 질문 답)
- **PSA population(psaGem/psaTotal/psa배열)**: GemRate/PSA pop **수동 임포트 1회**, 갱신 툴 없음 = 멈춤(psaSource 필드 참고). 천천히 변함.
- **PSA10 sold(card.psa10Ebay)**: 전부 6/29 고정, 갱신 워크플로 없음(위험 스크립트는 봉인).
- 자동갱신: PSA10 active·NM(주간)·박스(매일)만. → 갱신하려면 (a)GemRate 재수집 자동화 (b)검증된 sold 검색 스크립트 신규 제작 필요. [[project-ktcg-quant-mvp]]


## ⚠️ Pages 배포 재트리거 함정 (2026-07-09 실수 교훈)
- GitHub Pages 배포는 **concurrency로 새 배포가 뜨면 이전 in-progress 배포를 자동 취소**함. 배포 느리다고 **빈 커밋 재트리거를 연속으로 날리면 오히려 진행 중이던 배포가 cancelled 되어 더 늦어짐.**
- 올바른 대응: push 후 **그냥 기다린다**(오늘처럼 GitHub 혼잡 시 5~10분). 재트리거는 배포가 'cancelled/failure'로 확정된 걸 확인한 뒤에만 1회.
- 배포 상태 확인: `api.github.com/repos/opboxindex/k-tcg-quant/actions/workflows/299896261/runs`(pages-build-deployment). head_sha로 어느 커밋이 배포됐는지 확인.


## 영문판 두 숫자 모델: 실거래(시세) vs 최저매물(호가) (2026-07-09)
- 사용자 합의 설계: EN 박스 대표값 = **실거래(sold) 시세**, 구매버튼/매물 = **현재 최저 active(호가)**. 역할 다르니 나란히 표시.
- 데이터: `set.boxMarket.en.ebaySold = {median,low,high,sampleSize,currency,basis:"sold",source,updated}`. 수동 수집(Finding API 죽어서 자동 불가). OP-13 시드: median $486(범위 $403–535, 18건, 7/9). active low $582 → 매물이 시세 +20%.
- 렌더: `renderEnglishBoxBand()` 실거래 있으면 2카드(.enTwo emMarket/emAsk)+갭%+범위+설명. 없으면 기존 active 밴드 폴백. 수집 방법: 브라우저로 eBay LH_Sold=1 → 영문 풀박스만(팩·로트·케이스·타국 제외) 중앙값.
- ⚠️ **남은 불일치**: boxSeriesEn 그래프가 아직 active($605 호가)로 그려짐 → 실거래 블록($486)과 안 맞음. 다음 작업: 그래프도 sold 포인트로 전환(sold 2점+ 쌓이면). 주력 박스는 주기적 수동 sold 갱신 필요.


## 전 박스 실거래(sold) 조사 완료 (2026-07-09)
- **EN sold 20세트 전부** 수집(OP-01~16·EB-01·EB-03·PRB-01·02). 브라우저(Chrome MCP)+javascript_tool 추출기로 eBay 판매완료 median(사분위 p25-p75 범위). RATE=1548.63(fx.usdKrw).
- **검증**: 20세트 EN sold가 우리 code-aware active와 전부 sane(sold=active의 0.66~1.05×) → 세트 매칭·값 정확 교차확인.
- **JP는 OP-01만 채택**: 대부분 sold>active로 나옴 = 일본판 초판(1st ed) 프리미엄 오염(영어 검색이 초판 박스를 섞음). 정확도 위해 sold≤active인 OP-01(281 vs 325)만. 나머지 JP는 별도 일본어 쿼리 필요(추후).
- 추출기 재현: eBay `_nkw={code} booster box&LH_Sold=1&LH_Complete=1&_ipg=240` → `.s-card` 순회, `.su-styled-text.primary`=제목, `.s-card__price`=KRW가. 필터: /booster box/ & !(pack|lot|case|display|sleeve|x\d|...) & 언어(english/japanese) & KRW>200k. JP sold 노이즈 많음 주의.
- ⚠️ **수동 갱신 필요**: sold 자동화 불가(Finding API 죽음). 주기적(주 1회 등) 이 방법으로 재수집. 8월초 EN 그래프 켜기 전 7월치 몇 번 더 수집 권장.


## JP sold 전 세트 도입 (2026-07-09) — 시세vs매물 일판까지 완성
- **일본어 집중 검색**("{code} booster box Japanese sealed" + 제목 코드검증)으로 JP 박스 sold 재수집 → **20세트 커버**(OP-04만 얇아서 스킵). EN도 20세트. 이제 거의 전 박스가 JP+EN 두 숫자.
- **교훈 정정**: 이전에 "JP sold>active면 오염"이라 배제했는데 **틀렸음** — 그건 "현재 최저매물이 시세보다 싸다=딜 신호"인 정상 케이스. 일본어 검색+코드검증하면 클린. 배제 대신 표시.
- 가격 floor는 JP용으로 90k KRW(~$58)로 낮춤(JP 박스가 EN보다 쌈). 사분위 범위.
- ⚠️ sold 자동화 여전히 불가 → 주기 수동 재수집. 추출기: [[전 박스 실거래(sold) 조사 완료]] 참고, JP는 일본어 검색 쓸 것.


## 네비 활성표시 버그 수정 (2026-07-09)
- **원인**: styles.css `.nav a:first-child`가 항상 녹색 활성 → 어느 페이지든 첫 항목(Booster Boxes) 고정 점등 + 현재페이지(aria-current)까지 겹쳐 2개 점등. compare에서 둘 다 녹색이던 이유.
- **수정**: `.nav a:first-child` 제거, `.nav a[aria-current="page"]`만 활성. 페이지마다 정확히 1개.
- 네비 통일: 생성기(set/ranking) 네비를 Booster Boxes 라벨 + Amazon Raffle 추가 + Set Guides/Top PSA10에 aria-current. 전 페이지 6항목 동일.
- CSS 변경 반영 위해 styles.css 버전 20260706copy→20260709nav2(전 HTML + 생성기 링크).


## sold 재수집 루틴 (2026-07-09 설정)
- **완전 무인 자동 불가**: eBay가 서버/API/데이터센터IP를 막아 sold는 "사용자 로컬 브라우저(claude-in-chrome)"로만 수집됨. CI·클라우드 에이전트로는 안 됨.
- **빠른 재수집 헬퍼**: `node tools/box-sold-urls.js` → 전 세트 EN(영문검색)·JP(일본어검색) eBay 판매완료 URL + 추출기 출력. 브라우저 browser_batch로 navigate+실행 → boxMarket.[en|jp].ebaySold 갱신. 5분 배치.
- **채택 기준**: sold=active의 0.5~1.5배 & n>=3 & 사분위 범위 & as-of 날짜. JP는 일본어 검색 필수(영문검색은 초판 프리미엄 섞임).
- **주기**: 주 1회 권장. UI가 "as of 날짜" 표시하니 스테일해도 정직함. 세션에서 만날 때마다 새로고침(헬퍼로 빠름). (크론 247db825는 세션한정/7일만료라 신뢰 못 함 — 무시 가능.)


## 정확도 강화: PSA10 sold n>=3 전면 강제 (2026-07-09)
- 원칙: 표본 3건 미만 sold는 "시세"처럼 노출 금지(불확실하면 숨김). 감사서 26장이 n<3 sold 노출 중이었음.
- 수정 위치(전부 n>=3 가드): packs.js 딜칩 비교·psaEbay 밴드(기존 sampleSize>0→>=3)·프리미엄(기존OK)·topSold(기존OK); generate-set-pages cardPrices·rankingRows(기존OK). n<3은 active 폴백 또는 "표본 없음" 표기.
- ⚠️ 남은 정확도 과제: **카드 PSA10 sold 121장이 6/29 고정(10일+ 낡음)** — 박스처럼 브라우저로 재수집 필요(큰 작업). 랭킹/상위카드 우선 권장. eBay sold 자동화는 불가(브라우저 필수).


## PSA10 sold 재수집 툴 + 부분갱신 (2026-07-09)
- `tools/psa10-sold-refresh.js` — 카드별 eBay 판매완료 URL + 변형인식 추출기(검증됨) 출력. `--top N`·`--set` 옵션. 브라우저로 갱신.
- 검증: 레드망가 OP13-118($13,935)↔일반망가 분리 정확. 상위 8엔트리 7/9 갱신. 나머지 ~113장 6/29 유지.
- ⚠️ 같은 번호 멀티변형(OP06-118 등)은 추출기가 못 구분 → 갱신 보류. n>=3·기존 대역 sane만 채택.
- **인수인계 문서 `HANDOFF.md` 신설** — 새 세션/Codex는 이거 먼저 읽을 것.
