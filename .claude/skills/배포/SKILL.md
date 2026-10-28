---
name: 배포
description: opboxindex 사이트(저장소 opboxindex/k-tcg-quant)의 변경을 올린다 — `node tools/ship.js` 한 줄이 pull→build→관문→노출·비밀 검사→커밋→push 를 순서대로 하고, `--verify` 가 Pages 배포와 라이브 반영을 확인한다. 소유자가 "배포", "올려", "푸시", "반영해", "커밋해", "사이트에 올려줘"라고 하면 쓴다. 소유자가 말하지 않아도 내가 opbox 저장소(C:\Users\kimtt\opbox-heartbeat\repo)의 파일을 고쳤으면 그 작업을 끝내기 전에 반드시 쓴다. 수집·CI 실패 메일(Collection health·Self-heal·update-* 실패)이나 서치콘솔 경고 메일이 왔을 때도 이 스킬의 'CI/수집 실패 메일이 오면'을 따른다.
---

opbox 저장소의 변경은 **이 명령 하나로만** 올린다. git·build·check 를 손으로 잇지 않는다.

```
cd /c/Users/kimtt/opbox-heartbeat/repo && node tools/ship.js -m "<무엇을 왜 — 숫자로>" --paths <내가 고친 파일·폴더 ...>
```

- Bash 도구 **포그라운드**, `timeout: 600000`(build·관문 합쳐 1~3분). 백그라운드 금지 — push 중 자격증명 창이 뜨면 아무도 못 닫는다(2026-09-16 하트비트 5시간 정지).
- 출력을 `| tail`·`| head` 로 자르지 않는다. 판단은 맨 끝 줄 `ship OK` / `ship STOP <코드>` 와 종료코드로 한다.
- `--paths` 에는 내가 손댄 소스(생성기·손으로 쓰는 HTML·원장·문서)를 적는다. build 산출물은 ship.js 가 pull 뒤에 다시 굽고 같이 커밋한다 — 미리 build 하지 않아도 된다.
- 커밋 메시지는 한국어, 무엇을 몇 건 바꿨는지 숫자로. `Co-Authored-By` 줄은 ship.js 가 붙인다.
- 먼저 `--dry-run` 으로 볼 필요는 없다(같은 검사를 다 하고 커밋 직전에 멈출 뿐). 노출 변경이 섞였을 것 같을 때만 쓴다.
- 멈추거나 `--dry-run` 이 끝나면 build 가 바꾼 파일은 ship.js 가 되돌린다 — 시작할 때의 내 변경만 남으니 고친 뒤 **같은 명령을 그대로** 다시 돌린다.

## ship.js 가 하는 일 (순서가 곧 규칙)

1. 08:30~09:30 KST 이거나 작업 스케줄러 `opbox-box-sold` 가 실행 중이면 멈춘다 — 무인 수집 daily.ps1 이 **같은 폴더**에서 pull·build·commit·push 한다. 겹치면 리베이스가 꼬여 무인 푸시가 멈춘다.
2. origin 주소 확인: `https://opboxindex@github.com/opboxindex/k-tcg-quant.git` 이어야 한다. 토큰 박힌 주소면 멈춘다.
3. `--paths` 밖의 미커밋 변경이 있으면 멈춘다 — 남의 작업·잡파일을 같이 올리지 않는다.
4. `git pull --rebase --autostash origin main` → `node tools/build.js` → `git add -A`.
5. 비밀·문서 파일, 토큰 모양 문자열, **검색 노출 변경**을 검사한다(아래 표).
6. `node tools/check.js --gate --fast` — 무인·워크플로와 같은 관문. 종료코드를 spawnSync 로 직접 본다.
7. 커밋 → `git push origin HEAD:main`(`GCM_INTERACTIVE=never`, `GIT_TERMINAL_PROMPT=0`) → 남은 미커밋 변경이 없는지 확인 → 확인 명령 출력.

build 는 매번 `feed.xml`·`ko/feed.xml`(빌드 시각) 등 몇 파일을 바꾸므로 내 변경이 없어도 작은 커밋이 생길 수 있다 — 정상이다.

## 멈췄을 때 (종료코드)

| 코드 | 뜻 | 할 일 |
|---|---|---|
| 2 | 인자 오류 | 메시지대로 고쳐 다시 |
| 3 | 무인 수집 시간·실행 중 | 09:30 뒤(또는 끝난 뒤) 다시. `C:\Users\kimtt\opbox-heartbeat\box-sold-cdp\box-sold.log` 마지막 줄이 오늘 `done`·`stop:` 이고 급할 때만 `--force-window` |
| 4 | `--paths` 밖 변경 | 목록을 본다. 내 것이면 `--paths` 에 더한다. 남의 것(Codex·다른 채팅·무인 작업)이면 건드리지 말고 소유자에게 한 줄 보고 |
| 5 | pull 충돌 | 생성물 충돌이면 생성물은 `git checkout HEAD -- <파일>` 로 버리고 다시(build 가 다시 굽는다). 소스 충돌은 손으로 합친다. `git stash list` 에 autostash 가 남았는지 확인 |
| 6 | build 실패 | 출력의 `FAIL <단계>` 아래를 읽고 그 생성기를 고친다 |
| 7 | 관문 FAIL | **push 금지.** 출력의 `── <검사 이름>` 아래 이유를 고치고 다시. 남의 지연 때문이라도 우회하지 않는다 |
| 8 | 비밀·문서 파일 | `.env`·키·엑셀·PDF·한글 문서·토큰 줄을 **저장소 밖으로** 옮기거나 지운다. .gitignore 로 숨기지 않는다 |
| 9 | 검색 노출 변경 | 소유자에게 예/아니오로 묻는다(아래). 예면 같은 명령에 `--seo-ok` |
| 10 | push 실패 | rejected(봇이 먼저 올림)면 같은 명령 다시 — pull·build·관문을 다시 돈다. 인증 오류면 소유자에게(토큰을 URL 에 넣어 우회하지 않는다) |
| 11 | 원격 주소 | `git remote set-url origin https://opboxindex@github.com/opboxindex/k-tcg-quant.git` |
| 12 | push 뒤 미커밋 남음 | 목록이 무엇인지 보고 커밋하거나 되돌린다 |

멈춘 채로 작업을 끝내지 않는다. **고쳐서 올리거나, 버릴 거면 내 변경도 되돌린다**(`git checkout HEAD -- <파일>`, 새 파일은 삭제 — 남의 변경은 건드리지 않는다). 미커밋 변경이 남으면 다음 날 08:30 daily.ps1 이 `git add -A` 로 검토 없이 공개 저장소에 올린다.

### 검색 노출 변경(코드 9) — 저장소 CLAUDE.md 절대 규칙 1

잡는 것: 기존 페이지의 noindex 추가 · canonical 변경 · hreflang 제거·변경 · `sitemap.xml` 의 URL·hreflang 제거 · HTML 페이지 삭제 · 기존 title 변경 · `robots.txt`·`ads.txt`·`CNAME`·IndexNow 키·서치콘솔/네이버 인증 파일 변경.
통과하는 것: 새 페이지, 사이트맵 추가, 본문 수정, noindex 해제(노출을 늘리는 쪽).
왜: 2026-07 canonical 스왑으로 홈 노출 0, 7/24 대량 noindex 로 유입 정체. 되돌려도 구글이 다시 믿기까지 몇 주가 걸린다.

소유자에게는 이렇게만 묻는다: `노출 변경 2건 — sets/op-01.html title "…"→"…" 외 1건. 올릴까요? (예/아니오)`
"예"를 받기 전에 `--seo-ok` 를 붙이지 않는다. 의도하지 않은 변경이면(생성기 부작용) 생성기를 고친다.

## 배포 확인 — push 뒤 반드시

ship.js 가 마지막에 찍은 명령을 그대로 돌린다(포그라운드, `timeout: 600000`, 최대 8분):

```
cd /c/Users/kimtt/opbox-heartbeat/repo && node tools/ship.js --verify <sha>
```

- 공개 API(`pages-build-deployment`, 워크플로 299896261)로 내 커밋의 배포를 30초 간격으로 기다린 뒤, 바뀐 HTML 최대 5장을 라이브(`?cb=` 캐시 우회)와 커밋 내용으로 대조한다. 토큰이 필요 없다.
- `verify OK` 면 끝. 내 배포가 뒤 커밋에 밀려 `cancelled` 여도 뒤 배포가 성공하면 OK 다(main 은 앞으로만 가니 내 커밋이 실린다).
- **기다리는 동안 빈 커밋 재트리거를 넣지 않는다.** concurrency 가 진행 중 배포를 취소해 더 늦어진다(2026-07-09). 재트리거는 `verify FAIL`(failure 확정)일 때 1회만: `git commit --allow-empty -m "chore: Pages 재배포"` 뒤 `node tools/ship.js -m "chore: Pages 재배포"`.
- `verify DIFF` 면 1~2분 뒤 한 번 더. 그래도 다르면 출력의 `git log` 명령으로 뒤 커밋이 그 페이지를 바꿨는지 본다.
- 사이트맵에 URL 을 추가했으면 서치콘솔 사이트맵 재제출(`수집` 스킬 7단계)과 `node tools/indexnow-submit.js` 를 잊지 않는다.

## 절대 하지 말 것 (모두 실제 사고)

- `node tools/check.js … | tail && git push` — 파이프의 종료코드는 tail 의 것이라 FAIL 이어도 푸시된다(2026-10-28).
- pull 뒤 build 없이 관문·커밋 — 낡은 생성물로 FAIL(2026-10-28 의 진짜 원인). ship.js 가 순서를 지킨다.
- `guard-invariants.js` 단독 통과로 푸시 — 관문은 `check.js --gate --fast` 다. 그게 다음 08:30 무인 작업의 기준이다.
- 토큰을 URL 에 넣어 push(`x-access-token:…@`) — GCM 에 계정이 하나 더 생겨 무인 작업이 선택 창에 멈춘다(2026-09-16). 토큰·`.env` 값은 출력하지도 않는다.
- 브랜치 만들기·checkout — repo 는 무인 작업 전용 detached HEAD 다. 인자 없는 `git pull` 도 실패한다.
- 회사·부업 자료를 repo 폴더에 두기 — 공개 저장소로 올라간다.

## CI/수집 실패 메일이 오면

GitHub 이 실패한 예약 실행마다 메일을 보낸다. 공개 API 로 읽는다(GCM·토큰 쓰지 않는다):

```
curl -s "https://api.github.com/repos/opboxindex/k-tcg-quant/actions/runs?status=failure&per_page=5"   # id·name·created_at
curl -s "https://api.github.com/repos/opboxindex/k-tcg-quant/actions/runs/<id>/jobs"                    # 실패 step + check_run_url
curl -s "https://api.github.com/repos/opboxindex/k-tcg-quant/check-runs/<check_run_id>/annotations"     # 실패 이유 문장
```

로그 다운로드는 admin 권한이 필요해 안 된다 — 이유는 annotations 에 있다(check.js 가 `::error::` 로 남긴다).

- **Collection health / Self-heal 실패**: 대개 하루 수집 공백이다. 먼저 `node tools/collect-status.js --json` 의 `gaps`·`autoBroken` 을 본다. 수동 재실행으로 메울 수 있으면 메운다. 지나간 날의 진행 매물·경매 관측·TCG 스냅샷은 **소급 불가** — 확인했으면 `data/known-gaps.json` 의 `gaps[]` 에 `{series, dates, reason, confirmed}` 로 적고 이 스킬로 올린다. 관측이 있는 날을 적으면 가드 K1·K2 가 막는다(2026-09-30·10-24).
- **update-active-listings·update-fx 가 수집 전 검사에서 실패**: `check.js --pre` 는 생성물 대조 테스트(`DATA_TESTS`, 지금 test-ai-data)를 뺀다 — 원장만 바뀐 뒤 생성물이 낡아 수집이 3일 멈춘 교착(10/26~28, b3da59263) 때문이다. 같은 꼴이면 그 테스트를 `DATA_TESTS` 에 넣을지 판단한다. 수집 전에는 막지 말고, 빌드 뒤 `--gate` 에서는 그대로 검사한다.
- **서치콘솔 '판매자 등록정보'(shippingDetails·hasMerchantReturnPolicy 누락) 경고**: 10/28 카드·세트 페이지 Product offers 를 AggregateOffer(가격 범위)로 바꿔 배포했다(5a458f559, 가드 PO1·KF1). 구글이 다시 크롤해야 사라진다(며칠~몇 주). 경고가 남아 있어도 구조화 데이터를 다시 바꾸지 않는다. 날짜가 10/28 이전 크롤이면 기다린다.
- 원인을 고쳤으면 실패한 워크플로를 한 번만 다시 돌려 확인한다(같은 실패를 연달아 재실행하지 않는다).

## 보고 (한국어 2줄)

- 올렸으면: `배포 완료 <sha 9자리> — <무엇> (파일 N개), 라이브 확인 n/n.`
- 멈췄으면: 멈춘 코드의 뜻 한 줄 + 다음 행동. 소유자 결정이 필요하면 예/아니오 질문 하나.
