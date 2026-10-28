# 빌드와 검사 — 한 곳

2026-10-15. 생성 순서는 `tools/build.js`, 검사 목록은 `tools/check.js` 하나다. 워크플로(`update-active-listings.yml`, `update-market-data.yml`)와 무인 수집(`box-sold-cdp/daily.ps1`)은 이 둘을 부른다. 목록을 따로 적는 곳은 없다.

## 명령

| 할 일 | 명령 |
|---|---|
| 전부 다시 굽기 | `node tools/build.js` |
| 순서만 보기 | `node tools/build.js --dry` |
| 몇 단계만 | `node tools/build.js --only inject-nav,sync-sitemap-lastmod` (순서는 항상 STEPS 순) |
| 어느 단계부터 끝까지 | `node tools/build.js --from inject-home-summary` |
| 단계별 로그 남기기 | `node tools/build.js --log-dir logs` → `logs/<step>.log` |
| 검사 전부 | `node tools/check.js` (테스트 → 감사 → 가드, 끝에 `check OK` / `check FAIL`) |
| 브라우저 감사 빼고 | `node tools/check.js --fast` |
| 커밋 직전 관문(워크플로·daily.ps1) | `node tools/check.js --gate` — 전역 신선도 감사 제외(가드 W4) |
| 수집 전 빠른 검사 | `node tools/check.js --pre` — 구문(`node --check`) + 테스트만 |
| 로컬 수정 올리기 | `node tools/ship.js -m "<메시지>" --paths <고친 파일>` — pull → build → 노출·비밀 검사 → `check.js --gate --fast` → 커밋 → push. 뒤에 `node tools/ship.js --verify <sha>`(개인 스킬 `opbox-배포`) |

수정 뒤 한 바퀴: `node tools/build.js && node tools/check.js`. 전체 빌드 9~13초(prerender-home 1.5~5.6초), 검사 20초(브라우저 감사 11.5초·가드 3.5초·테스트 24개 4.7초) — 2026-10-15 실측.

사실 파일 `data/derived/site-facts.json`(1.5MB)은 `.gitignore` 된 캐시다. `require("./build-site-facts").load()` 가 입력(원장 18개 + `sets/*.html` 목록)의 해시를 대조해 다르면 그 자리에서 다시 굽는다(~220ms, 같으면 ~30ms) — 워크플로가 도구를 이름으로 따로 불러도 묵은 사실을 읽지 않는다. 커밋 범위(`git add`)와 `OUTPUTS` 에 없는 것이 맞다.

## 순서가 사는 곳

`tools/build.js` 의 `STEPS`. 다섯 묶음이고 각 줄 옆에 왜 그 자리인지 적혀 있다.

1. 원장 → 파생 데이터: `build-box-sold-series` → `build-grading-series` → `inject-card-grades` → `compact-series` → `build-site-facts` → `build-market-index`
2. 페이지 생성기: `generate-image-variants` → `generate-card-pages` → `generate-card-list-pages` → 세트·ko·ja·등급·경매·free-data·weekly
3. AI 파일: `generate-ai-data` → `generate-ai-extras` → `generate-llms`
4. 주입기(손으로 쓴 HTML): `inject-home-summary` → `prerender-home` → 글 주입기 7개
5. 마무리: `sync-article-dates` → `inject-nav` → `inject-lang-toggle` → `generate-feed` → `sync-sitemap-lastmod`

빌드 밖에 두는 것(이유: 결정적이지 않다):
- 수집기 전부(`collect-*`, `update-ebay-*`, `fetch-*`, `*-ingest`) — 네트워크. 워크플로가 build 앞에서 돈다.
- `build-set-auction-stats` — 창 끝이 "오늘"이라 같은 원장에서도 날마다 다른 파일. 일일 워크플로만 build 앞에서 돌린다(`audit-workflows` 5번이 순서를 지킨다). 창 끝을 원장 마지막 날로 바꾸면 STEPS 에 넣을 수 있다.
- 수집에 붙은 파생 단계(`build-tcg-series`, `build-auction-series`, `inject-grader-editions`, `inject-psa-wow`) — 그 수집 워크플로가 적재 직후에 돈다. 커밋 범위가 좁아 전체 빌드를 거기서 돌리면 미스테이징 변경이 남는다.

## 바이트 동일성 규칙

빌드는 커밋된 `data/` 만 읽고, 같은 입력이면 **바이트까지 같은 출력**을 낸다. 난수·네트워크를 쓰지 않는다. 예외는 `feed.xml`·`ko/feed.xml` 의 `<lastBuildDate>`(와 `<pubDate>` — 그날 09:00Z 와 빌드 시각 중 이른 쪽)뿐이다.

단서(2026-10-15 실측): "오늘"(UTC 날짜)을 경과일·신선도 기준으로 읽는 단계가 아직 있다 — `build-box-sold-series`(창)·`build-grading-series`(updated)·`build-market-index`(ageDays/isStale)·`generate-card-pages`·`generate-ko-pages`·`generate-tcg-auction-page`·`generate-upcoming-set-pages`·`generate-ja-pages`(JST)·`sync-article-dates`·`sync-sitemap-lastmod`. 같은 UTC 날짜 안에서는 바이트 동일, 날이 바뀌면 경과일 표기가 달라질 수 있다. 비교는 같은 날 안에서 한다.

확인하는 법(2026-10-15 실측, 격리 사본에서):

```
# 1) 지금 트리를 통째로 굽고 복사해 둔다
node tools/build.js && mkdir -p /tmp/baseline && git ls-files '*.html' '*.json' '*.csv' '*.txt' '*.xml' '*.js' '*.css' | xargs -I{} cp --parents {} /tmp/baseline/
# 2) 바꾼 뒤 다시 굽고 비교한다 — feed.xml 둘만 달라야 한다
node tools/build.js
for f in $(git ls-files '*.html' '*.json' '*.csv' '*.txt' '*.xml' '*.js' '*.css'); do cmp -s "$f" "/tmp/baseline/$f" || echo "DIFF $f"; done
```

규칙을 바꿨을 때 달라져야 하는 파일만 DIFF 에 떠야 한다. 뜻밖의 파일이 뜨면 그 파일을 쓰는 단계의 순서나 입력을 의심한다.

## 생성기를 더하는 법

1. `tools/<이름>.js` 를 만든다. 다른 생성기처럼 `ROOT = path.join(__dirname, "..")` 기준으로 읽고 쓴다. 날짜는 데이터의 날짜만 쓴다(`new Date()` 금지). 성공이면 exit 0, 요약 JSON 한 줄을 stdout 에.
2. `tools/build.js` 의 `STEPS` 에 한 줄 넣는다 — 읽는 파일을 쓰는 단계 **뒤**, 자기 파일을 덮는 단계(`inject-nav`·`inject-lang-toggle`·`sync-sitemap-lastmod`) **앞**. 옆에 이유를 적는다.
3. 새 경로를 쓰면 `build.js` 의 `OUTPUTS` 에도 한 줄. 그러면 `node tools/audit-workflows.js` 가 두 워크플로의 커밋 범위(`git add`)에 그 경로를 더하라고 알린다 — 더한다(`git diff --quiet` 목록과 `git add` 두 곳이 같아야 한다, 가드 W1).
4. `node tools/build.js --dry` 로 자리를 보고, `node tools/build.js && node tools/check.js` 로 끝낸다. 위 바이트 동일성 확인으로 다른 파일이 안 바뀌었는지 본다.

검사를 더할 때는 `tools/check.js` 의 `CHECKS` 에 한 줄. `soft: true` 면 알림용(실패해도 FAIL 아님), `global: true` 면 전역 신선도 감사(--gate 에서 제외), `browser: true` 면 크롬 필요(--fast 에서 제외). `tools/test-*.js` 는 자동으로 잡힌다.

## 실패했을 때

- `build FAIL at <step>` — 그 단계의 전체 출력(stderr 포함)이 바로 위에 찍힌다. 고친 뒤 `--from <step>` 으로 이어서 돈다.
- `check FAIL — FAIL: a, b` — 실패한 검사마다 `── 이름` 아래 이유가 나온다. GitHub Actions 에서는 같은 줄이 annotation 과 step summary 에도 뜬다.
- 워크플로 `Verify scripts`(`--pre`)는 가드·감사를 돌리지 않는다 — 가드의 신선도 검사가 "데이터를 새로 받으려는" 잡을 막는 교착(2026-07-27) 때문이다. 진짜 관문은 build 뒤의 `Check`.
