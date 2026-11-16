#!/usr/bin/env node
// 박스 sold(실거래) 수집용 URL·수집기 출력 — 브라우저 배치로 원장(ledger) 원료를 긁기 위한 헬퍼.
// sold는 eBay가 서버/API를 막아 "실제 브라우저(사용자 IP)"로만 수집 가능.
// **즉시구매(LH_BIN=1)만 받는다.** 이 원장은 즉시구매 시세용이다 — 경매는 별도로 모은다.
// 경매 낙찰가는 입찰이 안 붙으면 시세보다 훨씬 낮게 끝나서, 섞으면 시세가 아니라 잡음이 된다.
// (2026-08-13 실측: OP-01 일본판 한 세트에만 경매 69건이 섞여 있었다.)
// 필터를 거는 편이 240건 상한에도 유리하다 — 전체 237 중 즉구는 226 이 따로 다 들어온다.
//
// **가격대로 쪼개서 받는다.** eBay 는 한 검색에 240~265건까지만 준다. `_pgn=2` 는 무시된다
// (2페이지가 1페이지와 231건 겹쳤다). 그래서 그 이상은 검색 자체를 나눠야 얻는다.
// 2026-08-13 실측 — 단일 검색 대비 5구간 분할:
//   OP-01 일본판 263 → 742건 (2.8배) · OP-12 일본판 255 → 807건 (3.2배) · OP-05 영문판 139 → 853건 (6.1배)
// 즉 그동안 실거래의 1/3~1/6 만 보고 있었다.
//
// ⛔ **카테고리(_sacat)를 걸지 말 것.** 언어 패싯을 통째로 무력화한다.
// 2026-08-13 실측 — OP-13 즉구:
//   카테고리 없음   jp 70건 · en 72건 · 겹침 1     ← Language 가 제대로 나눈다
//   _sacat=261068  jp 87건 · en 87건 · 겹침 87    ← 완전히 같은 결과, 언어가 무시된다
// 카테고리를 걸면 노이즈는 확 줄지만(진짜 매물 비율 4% → 95%) 일본판/영문판 구분이 사라진다.
// 이 원장의 존재 이유가 두 판을 나눠 보는 것이라, 노이즈를 감수하고 언어를 지킨다.
// 노이즈는 어차피 code-missing / cross-set 판정이 걸러낸다.
//
// 참고: rawN 이 240 을 넘어도 "상한에 걸렸다" 는 뜻이 아니다. eBay 는 결과가 적으면 유사 상품으로
// 240칸을 채운다(실측: rawN 242 인데 실제 booster box 는 2건). 상한 판정에 rawN 을 쓰지 말 것.
//
// ⚠️ _udlo/_udhi 는 **화면에 보이는 통화** 기준이다. 이 수집은 계정 표시통화가 KRW 인
//    브라우저에서 돌리므로 구간도 원화다. 표시통화가 바뀌면 구간이 통째로 어긋나
//    한 구간에만 몰린다(실제로 달러 구간으로 잡았더니 3개가 0건이었다).
// 판별(일본판/영문판)은 제목 키워드가 아니라 eBay 의 `&Language=Japanese|English` 패싯으로 나눈다 —
// 판매자가 신고한 값이라 추측이 아니다. 제목만 보던 때는 언어 미표기로 614건을 통째로 버렸다(2026-08-12 실측). 이 스크립트는 수집 자체는 못 하고,
// (1) 전 세트 EN/JP eBay 판매완료 검색 URL과 (2) 붙여넣을 수집기 JS를 뽑아준다.
//
// 수집기는 판정하지 않는다 — 페이지의 판매건 전부를 {id,제목,판매일,표시가,통화}로 그대로 반환한다.
// 박스여부·다수량 개당가·언어·세트 판정은 전부 노드(tools/box-sold-ingest.js + lot-quantity.js)에서 한다.
// 규칙을 한 곳에 두기 위함이고, 가드 Q1이 그 판정을 코퍼스로 검증한다.
//
// 절차: node tools/box-sold-urls.js --json → 각 URL로 navigate + EXTRACTOR 실행 → 결과를
//   {collectedAt, pages:[{code, query:"jp"|"en", items:[...]}]} 덤프 파일로 모아 →
//   node tools/box-sold-ingest.js <dump.json> → node tools/build-box-sold-series.js
// Run: node tools/box-sold-urls.js [--json]
const fs = require("fs");
const path = require("path");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "onepiece-packs.json"), "utf8"));
// 발매 임박 세트 — 2026-08-19 신설. packs.json 에는 아직 없지만(화면에 빈 세트를 띄우지 않으려고)
// 수집은 발매일부터 해야 한다. 발매 직후 며칠은 다시 못 얻는다 —
// 팰월드 BP-01 에서 발매 2주차 궤적이 없어 아쉬웠던 게 정확히 이 문제다.
// 데이터가 쌓이고 화면에 올릴 때 packs.json 으로 옮기고 여기서는 지운다.
const UPCOMING = [
  { code: "OP-17", nameEn: "The World's Strongest Warriors", release: "2026-08-22" },
  // 2026-09-30 추가: 예약 판매가 이미 팔리는데(EB-05 9/15·9/28, OP-18 9/26) 다른 세트 페이지에 섞였다가 전부 버려지고 있었다.
  // 발매 뒤엔 구간이 240건 상한에 걸려 오래된 예약 판매가 밀려나므로 발매 전에 넣는다(OP-17 은 영문 발매 11주 전부터 쌓였다).
  // 이름 충돌(EB-03 Heroine's Edition ⊂ EB-05 Heroines Edition vol.2)은 ingestNameMap·가드 Q5 가 막는다.
  { code: "EB-05", nameEn: "Heroines Edition vol.2", release: "2026-10-31" },
  { code: "OP-18", nameEn: "The Dominance of God", release: "2026-11-21" },
  // 2026-11-16 추가: EB-06(JP 2027-01-30) — 아마존 재팬 초대판매가 열렸다(ASIN B0HMZ9WLVZ). OP-18 처럼 예약 판매부터 쌓는다(+10장).
  { code: "EB-06", nameEn: "East Blue", release: "2027-01-30" },
];
const ORDER = [...data.jp.list, ...data.extra.list].filter((c) => data.sets[c]);
for (const u of UPCOMING) {
  if (data.sets[u.code]) continue;              // packs.json 으로 옮겨졌으면 그쪽을 쓴다
  data.sets[u.code] = { nameEn: u.nameEn };     // 이 스크립트 안에서만 쓰는 임시 항목(파일에 안 쓴다)
  ORDER.push(u.code);
}
const q = (s) => encodeURIComponent(s).replace(/%20/g, "+");
const base = "https://www.ebay.com/sch/i.html?_nkw=";
// _sop=13 = 최근 종료순 정렬. 240건 상한에 걸릴 때 최신 판매가 잘리지 않게 한다.
const tail = "&LH_Sold=1&LH_Complete=1&_ipg=240&_sop=13";

const rows = ORDER.map((code) => {
  const name = data.sets[code].nameEn || "";
  const prb = code.startsWith("PRB");
  const enKw = prb ? `One Piece ${code} Premium Booster box` : `One Piece ${code} booster box`;
  const jpKw = prb ? `One Piece ${code} Premium Booster box Japanese` : `One Piece ${code} booster box Japanese sealed`;
  return { code, name, enUrl: base + q(enKw) + tail, jpUrl: base + q(jpKw) + tail };
});

// 수집기(붙여넣기용, 판정 없음): 실제 카드 전부 → [{id,t(제목),d("Sold ..."),k(표시가),cur(KRW|USD|OTHER)}]
// 광고 카드(id 123456)와 제목/날짜/가격이 빠진 카드만 거른다. 2026-07-22 실DOM(s-card + su-styled-text) 확인됨.
const EXTRACTOR = `(()=>{const out=[];for(const c of document.querySelectorAll('.s-card,li.s-item')){const a=c.querySelector('a[href*="/itm/"]');const m=a&&a.href.match(/\\/itm\\/(\\d+)/);if(!m||m[1]==='123456')continue;const t=((c.querySelector('.su-styled-text.primary')||c.querySelector('.s-item__title'))?.textContent||'').replace(/New Listing/ig,'').trim();const d=((c.querySelector('.s-card__caption,.s-item__caption'))?.textContent||'').trim();const pTxt=((c.querySelector('.s-card__price,.s-item__price'))?.textContent||'').trim();const p=pTxt.replace(/,/g,'').match(/([\\d.]+)/);if(!t||!d||!p)continue;out.push({id:m[1],t:t.slice(0,140),d,k:parseFloat(p[1]),cur:/KRW|\\u20a9/.test(pTxt)?'KRW':/\\$/.test(pTxt)?'USD':'OTHER'});}return JSON.stringify({n:out.length,items:out});})()`;

// 자립 브라우저 수집기(--collector): 페이지 이동 없이 in-page fetch(credentials:include)로
// 전 세트 EN/JP sold 페이지를 긁어 덤프 JSON을 통째로 반환한다. 사용자 실브라우저 탭 하나에서
// javascript_tool 한 번으로 실행 → 반환 문자열을 dump.json 으로 저장 → box-sold-ingest.js 에 투입.
// URL을 코드에 박아 넣어 브라우저가 세트목록을 몰라도 되게 한다. 로봇페이지는 robot:true로 표시하고 건너뛴다.
function collectorScript() {
  const pages = [];
  for (const r of rows) { pages.push({ code: r.code, query: "jp", url: r.jpUrl }); pages.push({ code: r.code, query: "en", url: r.enUrl }); }
  return `(async()=>{window.__sleep=(()=>{let w=null;try{w=new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'],{type:'text/javascript'})));}catch(e){}const cbs=new Map();let seq=0;if(w)w.onmessage=e=>{const f=cbs.get(e.data);if(f){cbs.delete(e.data);f();}};return ms=>new Promise(res=>{if(!w)return setTimeout(res,ms);const id=++seq;cbs.set(id,res);w.postMessage({id,ms});});})();const PAGES=${JSON.stringify(pages)};const grab=async(u)=>{let html;try{html=await fetch(u,{credentials:'include',signal:AbortSignal.timeout(45000)}).then(r=>r.text());}catch(e){return{robot:false,err:String(e),items:[]};}if(/Pardon our interruption|Checking your browser|captcha/i.test(html.slice(0,4000)))return{robot:true,items:[]};const doc=new DOMParser().parseFromString(html,'text/html');const out=[];for(const c of doc.querySelectorAll('.s-card,li.s-item')){const a=c.querySelector('a[href*="/itm/"]');const m=a&&(a.getAttribute('href')||'').match(/\\/itm\\/(\\d+)/);if(!m||m[1]==='123456')continue;const t=((c.querySelector('.su-styled-text.primary')||c.querySelector('.s-item__title'))?.textContent||'').replace(/New Listing/ig,'').trim();if(!/booster box/i.test(t))continue;const d=((c.querySelector('.s-card__caption,.s-item__caption'))?.textContent||'').trim();const pTxt=((c.querySelector('.s-card__price,.s-item__price'))?.textContent||'').trim();const p=pTxt.replace(/,/g,'').match(/([\\d.]+)/);if(!t||!d||!p)continue;out.push({id:m[1],t:t.slice(0,140),d:d.slice(0,32),k:parseFloat(p[1]),cur:/KRW|\\u20a9/.test(pTxt)?'KRW':/\\$/.test(pTxt)?'USD':'OTHER'});}return{robot:false,items:out};};const out={collectedAt:new Date().toISOString().slice(0,10),pages:[]};let robots=0;for(const pg of PAGES){const r=await grab(pg.url);if(r.robot)robots++;out.pages.push({code:pg.code,query:pg.query,items:r.items});await window.__sleep(700);}out.robots=robots;out.totalItems=out.pages.reduce((a,p)=>a+p.items.length,0);return JSON.stringify(out);})()`;
}

// ⚠️ 검색 URL 은 한 번에 240건(_ipg=240)까지만 준다. `_sop=13`(최근 종료순)이라 잘리는 건 항상 **오래된 쪽**이고,
//    주 3회 수집하므로 실무상 손실은 없다. 다만 "잘렸다"는 사실은 알아야 하므로 페이지마다 필터 전 원시 카드 수(rawN)를
//    기록하고, 240 이상이면 __runBatch 가 capped 로 세어 보고한다. capped 가 늘면 수집 주기를 좁히거나 검색어를 쪼갤 것.
//
// ⚠️ **rawN=0 은 "판매 없음"이 아니라 대부분 eBay 의 조용한 빈 응답이다** — 2026-09-02 실측:
//    550ms 간격으로 220페이지를 돌리자 후반부부터 83페이지(38%)가 원시 0건으로 돌아왔다.
//    robots/capped 만 보면 정상처럼 보여서, 일본판 주력 가격대(₩15만~30만)가 통째로 비었는데도
//    아무도 몰랐다(소유자가 "OP13 일본판이 안 팔린다는 게 말이 안 된다"고 지적해서 발견).
//    그래서 __runBatch 는 rawN=0 이면 4초 쉬고 1회 재시도하고, 그래도 0이면 empties 로 보고한다.
//    **empties 가 0이 아니면 그 조각을 재수집할 것** — 간격을 늘려(3초+) 다시 돌리면 대부분 돌아온다.
//
// 배치 수집 셋업(--setup): 브라우저에 상태·헬퍼를 심는다. 페이지를 한 번에 많이 긁으면 CDP 45초
// 타임아웃에 걸리므로, 8페이지씩(빈 페이지 재시도 포함) 나눠 window.__opDump 에 누적한 뒤 내려받는다.
// tool 반환값은 잘리므로(대용량 exfil 불가) 결과 전달은 반드시 Blob 다운로드로 한다.
// 사용법(브라우저 javascript_tool) — **__runAll 한 번이면 끝난다.** 2026-09-02 신설.
//   1) <setup 스크립트>                        → 'ready:220 pages'
//   2) window.__runAll()                        → '시작' (백그라운드로 220페이지를 혼자 돈다)
//   3) window.__progress()                      → 가끔 진행률만 확인(몇 분 간격)
//   4) 끝나면 회수: localhost 수신기로 POST 하거나 __opDownload('...json')
// 왜 __runAll 인가: 예전엔 __runBatch(0,10)…(210,10) 을 22번 호출해야 했다. CDP 는 45초에 끊기고
// 매 호출이 왕복이라, 수집 한 번에 대화 토큰이 크게 들었다(2026-09-02 실측). 페이지 안에서 혼자
// 돌게 하면 호출이 3~4번으로 준다. 빈 응답 재시도·2차 재시도까지 스크립트가 알아서 한다.
// __runBatch 는 남겨둔다 — 일부 구간만 다시 받고 싶을 때 쓴다.
// ⚠️ 대기(sleep)는 Worker 타이머로 한다 — 2026-09-09 실측.
//   크롬은 보이지 않는 탭의 setTimeout 을 1분 단위로 묶고 CPU 도 줄인다. 그래서 같은 220페이지가
//   앞에 보일 땐 3초/페이지, 뒤로 가면 10~20초/페이지가 됐다. 워커 안의 setTimeout 은 이 제한을 안 받는다.
//   MessageChannel 로 도는 스핀 대기는 쓰지 말 것 — 메인 스레드를 독점해 렌더러가 얼고 더 느려졌다.
// ⚠️ fetch 는 45초 타임아웃(AbortSignal.timeout) — 응답이 안 오면 그 페이지를 빈 페이지로 두고 다음으로 간다(재시도 단계가 다시 잡는다).
function setupScript() {
  // ORDER 를 그대로 쓴다 — 실제 수집은 이 배치 경로로 돈다. 위에서 UPCOMING 을 넣고
  // 여기서 빼먹으면 발매 임박 세트가 목록에만 뜨고 정작 수집은 안 된다(2026-08-19 실수).
  const codes = ORDER;
  return `(()=>{const CODES=${JSON.stringify(codes)};const q=s=>encodeURIComponent(s).replace(/%20/g,'+');const BANDS=[[0,80000],[80000,150000],[150000,300000],[300000,600000],[600000,0]];const mk=(kw,lang,lo,hi)=>'https://www.ebay.com/sch/i.html?_nkw='+q(kw)+'&LH_Sold=1&LH_Complete=1&_ipg=240&_sop=13&LH_BIN=1&Language='+lang+(lo?'&_udlo='+lo:'')+(hi?'&_udhi='+hi:'');const P=[];for(const c of CODES){const prb=c.startsWith('PRB');const kw=prb?'One Piece '+c+' Premium Booster box':'One Piece '+c+' booster box';for(const [lo,hi] of BANDS){P.push({code:c,query:'jp',fmt:'bin',band:lo,url:mk(kw,'Japanese',lo,hi)});P.push({code:c,query:'en',fmt:'bin',band:lo,url:mk(kw,'English',lo,hi)});}}window.__PAGES=P;window.__sleep=(()=>{let w=null;try{w=new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'],{type:'text/javascript'})));}catch(e){}const cbs=new Map();let seq=0;if(w)w.onmessage=e=>{const f=cbs.get(e.data);if(f){cbs.delete(e.data);f();}};return ms=>new Promise(res=>{if(!w)return setTimeout(res,ms);const id=++seq;cbs.set(id,res);w.postMessage({id,ms});});})();window.__opDump={collectedAt:new Date().toISOString().slice(0,10),langFacet:true,fmtSplit:true,pages:[]};window.__grab=async u=>{let h;try{h=await fetch(u,{credentials:'include',signal:AbortSignal.timeout(45000)}).then(r=>r.text());}catch(e){return{robot:false,items:[]};}if(/Pardon our interruption|Checking your browser|captcha/i.test(h.slice(0,4000)))return{robot:true,items:[]};const doc=new DOMParser().parseFromString(h,'text/html');const cards=doc.querySelectorAll('.s-card,li.s-item');const rawN=cards.length;const out=[];for(const c of cards){const a=c.querySelector('a[href*="/itm/"]');const m=a&&(a.getAttribute('href')||'').match(/\\/itm\\/(\\d+)/);if(!m||m[1]==='123456')continue;const t=((c.querySelector('.su-styled-text.primary')||c.querySelector('.s-item__title'))?.textContent||'').replace(/New Listing/ig,'').trim();if(!/booster box/i.test(t))continue;const d=((c.querySelector('.s-card__caption,.s-item__caption'))?.textContent||'').trim();const pT=((c.querySelector('.s-card__price,.s-item__price'))?.textContent||'').trim();const p=pT.replace(/,/g,'').match(/([\\d.]+)/);if(!t||!d||!p)continue;out.push({id:m[1],t:t.slice(0,140),d:d.slice(0,32),k:parseFloat(p[1]),cur:/KRW|\\u20a9/.test(pT)?'KRW':/\\$/.test(pT)?'USD':'OTHER'});}return{robot:false,items:out,rawN};};window.__runBatch=async(s,n)=>{const e=Math.min(s+n,window.__PAGES.length);let rob=0,cap=0,emp=0;for(let i=s;i<e;i++){const pg=window.__PAGES[i];let r=await window.__grab(pg.url);if(!r.robot&&!r.rawN){await window.__sleep(4000);r=await window.__grab(pg.url);}if(r.robot)rob++;if(!r.rawN)emp++;if(r.rawN>=240)cap++;window.__opDump.pages.push({code:pg.code,query:pg.query,fmt:pg.fmt,band:pg.band,items:r.items,rawN:r.rawN});await window.__sleep(900);}return JSON.stringify({done:window.__opDump.pages.length,of:window.__PAGES.length,robots:rob,capped:cap,empties:emp,items:window.__opDump.pages.reduce((a,p)=>a+p.items.length,0)});};window.__runAll=()=>{if(window.__bg&&window.__bg.running)return'이미 돌고 있다';window.__bg={running:true,phase:'수집',note:''};(async()=>{try{for(let i=window.__opDump.pages.length;i<window.__PAGES.length;i++){const pg=window.__PAGES[i];let r=await window.__grab(pg.url);if(!r.robot&&!r.rawN){await window.__sleep(4000);r=await window.__grab(pg.url);}window.__opDump.pages.push({code:pg.code,query:pg.query,fmt:pg.fmt,band:pg.band,items:r.items,rawN:r.rawN});await window.__sleep(900);}window.__bg.phase='빈페이지 재시도';await window.__sleep(15000);for(let pass=0;pass<2;pass++){const idxs=[];window.__opDump.pages.forEach((p,i)=>{if(!p.rawN)idxs.push(i);});if(!idxs.length)break;for(const i of idxs){const p0=window.__opDump.pages[i];const pg=window.__PAGES.find(x=>x.code===p0.code&&x.query===p0.query&&x.band===p0.band);if(!pg)continue;const r=await window.__grab(pg.url);if(r.rawN)window.__opDump.pages[i]={code:pg.code,query:pg.query,fmt:pg.fmt,band:pg.band,items:r.items,rawN:r.rawN};await window.__sleep(4000);}}window.__bg.phase='완료';}catch(e){window.__bg.note='오류:'+String(e).slice(0,90);window.__bg.phase='중단';}window.__bg.running=false;})();return'시작';};window.__progress=()=>JSON.stringify({phase:window.__bg?window.__bg.phase:'미시작',running:window.__bg?window.__bg.running:false,done:window.__opDump.pages.length,of:window.__PAGES.length,empties:window.__opDump.pages.filter(p=>!p.rawN).length,items:window.__opDump.pages.reduce((a,p)=>a+p.items.length,0),note:window.__bg?window.__bg.note:''});window.__opPost=async(url)=>{const seen=new Set(),uniq=[];for(const p of window.__opDump.pages){const k=p.code+'/'+p.query+'/'+p.fmt+'/'+p.band;if(seen.has(k))continue;seen.add(k);uniq.push(p);}const full=JSON.stringify({collectedAt:window.__opDump.collectedAt,langFacet:true,fmtSplit:true,pages:uniq.filter(p=>p.items.length)});try{const r=await fetch(url||'http://127.0.0.1:8377/dump',{method:'POST',headers:{'content-type':'application/json'},body:full});return 'posted '+full.length+'B status '+r.status;}catch(e){return 'fail '+String(e).slice(0,80);}};window.__opDownload=fn=>{const seen=new Set(),uniq=[];for(const p of window.__opDump.pages){const k=p.code+'/'+p.query+'/'+p.fmt+'/'+p.band;if(seen.has(k))continue;seen.add(k);uniq.push(p);}const full=JSON.stringify({collectedAt:window.__opDump.collectedAt,langFacet:true,fmtSplit:true,pages:uniq});const b=new Blob([full],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return JSON.stringify({saved:fn,bytes:full.length,pages:uniq.length,items:uniq.reduce((x,p)=>x+p.items.length,0)});};return 'ready:'+window.__PAGES.length+' pages';})()`;
}

module.exports = { rows, EXTRACTOR, collectorScript, setupScript, UPCOMING };

if (require.main === module) {
  if (process.argv.includes("--setup")) {
    console.log(setupScript());
  } else if (process.argv.includes("--collector")) {
    console.log(collectorScript());
  } else if (process.argv.includes("--json")) {
    // 2026-08-31 제거: 여기서 나오던 rows 의 URL 에는 LH_BIN=1 이 없어 경매가 섞이고,
    // fmt 표시가 없어 그래프가 전량 버린다. 실제로 그 실수로 300건을 되돌렸다.
    console.error("--json 은 폐기됐다. 표준 경로는 --setup 이다(LH_BIN=1·Language 패싯·가격대 분할).");
    process.exit(1);
  } else {
    console.log(`# 박스 sold 수집 계획 (${rows.length} 세트) — 데이터 기준일: ${data.updated}`);
    console.log(`# 표준 경로: --setup 배치(10페이지씩, CDP 45초 타임아웃 회피). --collector 단일샷은 세트가 늘어 타임아웃 위험 — 소규모 테스트 전용.`);
    for (const r of rows) console.log(`${r.code}\tEN ${r.enUrl}\n\tJP ${r.jpUrl}`);
  }
}
