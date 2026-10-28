---
name: 수집
description: opboxindex 수집을 밀린 것만 골라 전부 돌린다 — 소유자가 "수집"이라고만 하면 이걸 쓴다. 박스 판매·등급 인구(PSA/CGC/TAG)·유유테이 NM·팰월드 등 브라우저가 필요한 수동 수집 10종을 상태 확인부터 적재·검증·배포까지 끝낸다.
---

소유자가 "수집" 한마디만 해도 **밀린 것을 알아서 전부** 돌린다. 뭘 해야 하는지 되묻지 않는다.

2026-09-02 소유자 절대지시: "여태 수집하던 것 하나도 빼먹지 마라. 그래프 틀리면 안 된다."
관련 기억: `opbox-never-miss-collection`

레포: `C:\Users\kimtt\opbox-heartbeat\repo` (무인 수집 전용 worktree, detached HEAD — 브랜치를 만들거나 checkout 하지 않는다).
`Documents\Codex\…` 본 clone 은 같은 저장소지만 그 checkout 은 10/06 main 에 멈춰 있고 미커밋 변경이 있어 쓰지 않는다(2026-10-28 확인).

## 절대 규칙 (2026-09-02 소유자 지시)

1. **정확한 데이터만 넣는다.** 애매하면 버린다 — 빈칸이 틀린 값보다 낫다.
   빈 응답을 "판매 없음"으로 적지 않는다(`empties` 확인). 번호만 보고 카드를 매칭하지 않는다.
2. **하루도 빈칸을 만들지 않는다.** 실거래·경매 관측은 소급 수집이 안 된다.
   `gaps` 가 나오면 그날 안에 처리하거나, 소급이 불가능하면 그 사실을 즉시 보고한다.
3. **수집했으면 즉시 배포한다.** 원장만 갱신하고 페이지를 안 구우면 화면은 어제 값 그대로다.
   "나중에 배포"는 없다 — 6~7단계를 같은 작업 안에서 끝낸다.
4. **못 한 건 숨기지 않는다.** "일부 수집"을 성공으로 보고하지 않는다.

## 0. 먼저 무엇이 밀렸는지 본다

```
git pull --rebase --autostash origin main
node tools/collect-status.js --json
```

- `todo` 배열 = 지금 돌려야 할 수동 수집. **이것만 돌린다** (정상인 걸 또 돌리면 토큰·시간 낭비).
- `autoBroken` = 자동인데 멈춘 것. 브라우저로 할 수 있는 게 아니다 — 워크플로 로그를 보고 소유자에게 보고만 한다.
- `gaps` = **날짜 빈칸.** 가장 급하다. 소급이 되는지 판단해 적는다 —
  박스 sold 는 eBay 가 90일치를 보여줘 며칠은 따라잡을 수 있다(원장이 상품번호로 중복을 거르니
  그냥 다시 수집하면 메워진다). 경매 관측·TCG 스냅샷은 **소급 불가** — 그 칸은 영영 빈다.
  소급 불가한 빈칸은 `data/known-gaps.json` 에 기록해 다음부터 새 공백과 구분되게 한다.
- `staleParts` = 수집원은 도는데 산출물 하나가 멈춘 것. 원인을 찾아 보고한다.
- `untracked` / `packsUntracked` 가 비어있지 않으면 **새 수집이 목록 밖에 있다는 뜻** — 반드시 등록하고 보고한다.

`todo` 가 비어 있으면 "다 최신이라 할 게 없다"고 한 줄 보고하고 끝낸다.

## 1. 브라우저 준비 (모든 수동 수집 공통)

eBay·GemRate·CGC·TAG 는 서버 접근을 막아 **실브라우저**로만 된다.

ToolSearch 로 `select:mcp__claude-in-chrome__list_connected_browsers,mcp__claude-in-chrome__select_browser,mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__tabs_close_mcp` 를 한 번에 로드한다.

⚠️ **절대규칙**: `list_connected_browsers` 로 `osPlatform: Windows` + `isLocal: true` 인 것을 고른다.
macOS 는 옆자리 타인 기기다 — 절대 선택 금지, 되묻지도 않는다. 탭 그룹이 새로 생기면 **매번 다시 확인**한다.
(2026-08-24·09-02 두 번 실제 사고: 작업 탭이 동료 화면에 떴다.)

크롬이 꺼져 있으면 "크롬 켜주세요" 한 줄 보고 후 종료한다.

## 2. 박스 판매(BIN) 원장 — `todo` 에 `box` 가 있을 때

가장 자주 도는 수집이고 토큰도 제일 많이 든다. **`__runAll` 로 한 번에 돌린다.**

1. 회수 서버 띄우기(백그라운드):
   `node tools/dump-receiver.js <스크래치패드>/box-sold-dump-YYYY-MM-DD.json`
   포트 8377 에서 POST 를 받아 파일로 쓴다. 이미 떠 있으면(exit 2) 그걸 그대로 쓴다.
2. `node tools/box-sold-urls.js --setup` 출력을 브라우저 탭에서 실행 → `ready:220 pages`
3. `window.__runAll()` → `'시작'`. 220페이지를 페이지 안에서 혼자 돈다(빈응답 재시도·2차 재시도 포함).
4. 몇 분 간격으로 `window.__progress()` 만 확인한다. **매 페이지마다 부르지 말 것** — 그게 토큰을 태운다.
   `phase` 가 `완료` 가 될 때까지 기다린다(전체 15~25분).
5. `await window.__opPost()` → localhost 로 회수.
6. `node tools/box-sold-ingest.js <덤프>` → **`empties` 가 0인지 반드시 확인.**
   0이 아니면 그 조각을 간격 늘려 재수집한다. (2026-09-02: 빈 응답 83페이지를 "판매 없음"으로
   삼켜 OP-13 일본판 주력 가격대가 통째로 비었다. 소유자가 지적해서 발각됐다.)
7. `node tools/build-box-sold-series.js`

## 3. 등급 인구 (PSA / TAG) — `todo` 에 `psa-pop`·`psa-weekly`·`psa-full`·`tag-pop`·`graderpop-card` 가 있을 때

주 1회(보통 월요일). 순서와 명령은 `tools/MONDAY-GRADING.md` 가 기준이다.
CGC 는 세트(총량·Pristine/Gem Mint)·카드별 모두 워크플로 `collect-grading` 이 공개 API 로 자동 수집한다 —
손으로 CGC 목록 페이지를 긁지 않는다(`cgc-pop.js` 는 2026-09-30 삭제). 옛 절차 파일
`C:\Users\kimtt\.claude\scheduled-tasks\opbox-tag-pop-weekly\SKILL.md` 의 CGC 단계(A·B)는 따르지 않는다.
TAG 세트는 `__tagAgg` → `tag-pop-ingest.js` 한 번에 10·10P 분리값까지 담긴다.

PSA 카드별은 `node tools/collect-psa-card-pop.js --probe` 로 먼저 살핀다. GemRate 가 봇 차단
페이지("잠시만 기다리십시오…")를 주면 실브라우저로 열어야 한다 — plain fetch 는 안 된다(2026-09-02 실증).

세트 추이(PSA 일본판 주간·영문판 총량·판별 주간)도 같은 이유로 실브라우저다(2026-09-07 실증, 워크플로
`update-market-data` 의 GemRate 스텝이 매주 실패한다). 실브라우저 탭에서 각 세트의 `set-population-trend`
페이지를 열어 `globalThis.RowData` 를 `{date,total_grades,total_gems}` 로 `sessionStorage` 에 모으고
`{jp:{code:rows}, en:{code:rows}}` 로 Blob 다운로드 → `node tools/psa-trend-ingest.js <덤프>` →
`node tools/psa-edition-weekly-ingest.js <덤프>` → `node tools/import-gemrate-psa-history.js` →
`node tools/import-gemrate-en-totals.js` → `node tools/inject-psa-wow.js`. URL 목록은
`node tools/collect-psa-card-pop.js --urls` 의 경로를 `set-population-trend` 로 되돌리면 된다.
import 를 빼먹으면 원장만 새것이고 화면은 옛것이라 가드 D3 가 FAIL 난다(2026-09-07 실제).

⚠️ **절대 원칙(2026-07-24 소유자 지시)**: 카드번호만 보고 매칭 금지. 번호+변형(tier) 둘 다
일치할 때만 기록한다. 모호하면 스킵하고 보고한다. 가드 Q4 가 이걸 회귀검사한다.

## 4. 유유테이 NM 시세 — `todo` 에 `nm` 이 있을 때

10일마다. 일본판 단품 NM 가격을 유유테이에서 받아 `packs.json` 의 `card.nmJpy`/`nmUpdated` 를 갱신한다.
변형(패러렐·망가 등)별로 매칭해야 한다 — 번호만 보고 붙이면 값이 통째로 틀어진다.

## 5. PSA10 실거래 / 팰월드 — `todo` 에 `psa10-sold`·`palworld-box` 가 있을 때

- PSA10 실거래(월 1회): `node tools/psa10-sold-refresh.js` → 브라우저 수집 → `node tools/psa10-sold-write.js`
  변형(레드망가↔망가) 분리 필수.
- 팰월드 박스(주 1회): `node tools/palworld-sold-urls.js --setup` → 브라우저 수집 → ingest

## 6. 홈페이지에 반영 — 예외 없이 매번

수집만 하고 끝내면 원장만 바뀌고 **화면은 어제 값 그대로다.** 소유자 지시(2026-09-02):
"자동/수동 수집한 걸 홈페이지에 다 반영도 해야 해."

집계 → 페이지 재생성 순서로 돌린다(워크플로 `update-active-listings` 와 같은 순서):

```
node tools/build-box-sold-series.js       # 박스 원장 → 주간/월간 시계열
node tools/build-market-index.js          # 지수·개봉미터
node tools/build-grading-series.js        # 등급 인구를 건드렸으면
node tools/inject-card-grades.js          # 등급 원장 → 카드 화면값(graderPop). 빠지면 등급 감사가 "화면 총량 vs 원장" FAIL (2026-09-03 실제)
node tools/compact-series.js              # ⚠️ inject 직후 필수 — 들여쓰기 저장을 압축. 빼면 가드 T2 FAIL (2026-09-04 실제)
node tools/generate-card-pages.js
node tools/generate-english-set-pages.js  # 영문판 박스 페이지 22장 — 반드시 generate-set-pages 보다 먼저(허브·일본판 페이지가 이 파일을 보고 링크를 건다)
node tools/generate-set-pages.js
node tools/generate-upcoming-set-pages.js
node tools/generate-ko-pages.js
node tools/generate-auction-page.js
node tools/generate-tcg-auction-page.js
node tools/generate-free-data.js
node tools/generate-feed.js                # RSS — 아티클 목록에서 매번 다시 굽는다(2026-07-17 에 멈춰 있던 것을 2026-09-10 편입)
node tools/generate-ai-data.js
node tools/generate-ai-extras.js          # 카드 전체·등급·경매 AI 파일 3개
node tools/generate-llms.js                # ⚠️ 그 뒤 — llms.txt·llms-full.txt(답변 AI용 사실 파일) 재생성
node tools/inject-nav.js                  # ⚠️ 반드시 페이지 생성 뒤에
node tools/inject-lang-toggle.js          # ⚠️ 반드시 페이지 생성 뒤에
```

⚠️ `inject-nav`·`inject-lang-toggle` 을 빼먹으면 페이지 생성기가 네비게이션과 한국어 토글을
덮어써서 가드 N1 이 FAIL 난다(2026-09-02 실제로 걸렸다). 순서를 지킨다.

## 7. 검증하고 배포

```
node tools/collect-status.js              # 밀린 게 사라졌는지 확인
node tools/guard-invariants.js
```

**가드가 FAIL 이면 절대 푸시하지 않는다**(소유자 절대지시). `head` 로 확인한다 — `tail` 로 보면
배열 닫는 괄호만 보여서 FAIL 을 놓친다(2026-09-02 실수).

커밋·푸시는 `배포` 스킬로 한다: `node tools/ship.js -m "<무엇을 몇 건>" --paths <바꾼 원장·파일>` —
pull → build → 관문(`check.js --gate --fast`)을 순서대로 돌고 FAIL 이면 멈춘다. guard 단독 통과나 `| tail && git push` 로 올리지 않는다(2026-10-28 사고).
커밋 메시지에는 **무엇을 몇 건 넣었는지 숫자로** 적는다.

⚠️ 사이트맵에 URL 을 추가한 날은 **서치콘솔에서 사이트맵을 다시 제출**한다(실브라우저, 계정 슬롯 /u/1/,
`https://search.google.com/u/1/search-console/sitemaps?resource_id=https%3A%2F%2Fopboxindex.com%2F` → 입력칸에 `sitemap.xml` → 제출).
2026-09-08 실측: 구글이 7/24 이후 사이트맵을 다시 안 읽어 190페이지 중 53개만 알고 있었다. 재제출하니 당일 190개로 갱신됐다.
입력은 좌표 클릭(입력칸→타이핑→제출 버튼)이 먹고, ref 클릭·form_input 은 안 먹었다.

배포 뒤 실제 화면이 바뀌었는지 한 곳만 확인한다(예: 방금 값이 들어간 세트 페이지를
`curl -s "https://opboxindex.com/sets/op-17.html?cb=$(date +%s)" | grep -c "<새 값>"`).
GitHub Pages 반영에 1~2분 걸린다.

## 8. 품질 점수판 — 수집을 끝낼 때마다 (2026-10-15 신설)

소유자 기준(2026-10-14): "완벽한 리서치 회사 — 누구든 숫자만 보고 설명할 수 있고, 계속 좋아진다.
정기 작업마다 품질 지표 최악 1개를 고친다." 수집이 끝나면(7단계 뒤) 반드시 돌린다:

```
node tools/quality-scorecard.js
```

- 1초, 브라우저 없음, exit 0(막지 않는다 — 막는 건 가드). 지표 33개를 FAIL/WARN/OK/INFO 로 내고
  맨 아래 **"최악 1건"** 과 고치는 도구를 찍는다. 정의·개선 방법은 `docs/quality-scorecard.md` (지표 ID 기준).
- 보고에 **최악 1건을 한 줄로** 넣는다(예: `최악: F7 가격 품질 감사 review 30 — PSA10 실거래 재수집`).
  이번 작업 안에서 고칠 수 있으면(수집원이 `todo` 에 있거나 생성기 재실행으로 끝나면) 고치고 다시 돌려 바뀐 값을 적는다.
  못 고치면 왜 못 고쳤는지(소급 불가·시장이 얇음·브라우저 필요)를 그 한 줄에 적는다 — 숨기지 않는다.
- `--json` 은 `worst` 와 `rows[]` 를 준다. `--guard` 는 가드까지 돌린다(14초) — 7단계에서 이미 돌렸으면 필요 없다.

## 보고 (짧은 한국어, 3줄 이내)

- 무엇을 돌렸고 몇 건 들어갔는지
- `empties`·`untracked` 같은 경고가 있었으면 그것
- 아직 밀린 게 남았으면 그것

수집을 못 한 게 있으면 **숨기지 말고 그대로 말한다.** "일부 수집" 을 성공으로 보고하지 않는다.
