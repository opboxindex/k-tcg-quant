/* 방문자 행동 이벤트 → GA4. 2026-08-27 신설.
   지금까지 GA4 는 pageview 만 쌓았다 — "몇 명 왔나"는 알아도 "뭘 눌렀나"는 0건.
   전부 이벤트 위임 하나로 처리해서 페이지별 인라인 핸들러가 없다(생성기 수정 최소화).
   개인정보는 안 보낸다: URL·라벨·섹션 이름뿐. */
(function () {
  "use strict";
  if (typeof window.gtag !== "function") return;
  var send = function (name, params) {
    try { window.gtag("event", name, params || {}); } catch (e) { /* GA 실패가 사이트를 깨면 안 된다 */ }
  };

  // 1) 이베이 클릭 — 제휴 수익의 분자. 어떤 페이지의 어떤 버튼이 실제로 눌리는지.
  // 2) 내부 이동 — 홈에서 어떤 세트/카드로 들어가는지.
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    var label = (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (/^https?:\/\/(www\.)?ebay\./.test(href) || /^https?:\/\/ebay\.us\//.test(href)) {
      // spot = 링크의 EPN customid(자리 꼬리표, 2026-11-02) — GA4 와 EPN 보고서를 같은 이름으로 맞춰 본다. 없으면 빈 값.
      var m = href.match(/[?&]customid=([^&#]*)/), spot = m ? m[1] : "";
      try { spot = decodeURIComponent(spot); } catch (e) { /* 깨진 인코딩은 원문 그대로 */ }
      send("ebay_click", { link_label: label, page_path: location.pathname, spot: spot.slice(0, 60) });
    } else if (/^https?:\/\//.test(href) && a.hostname !== location.hostname) {
      send("outbound_click", { link_domain: a.hostname, link_label: label, page_path: location.pathname });
    } else if (/\/(sets|cards|articles)\//.test(href) || /\.html$/.test(href)) {
      send("nav_click", { link_url: href.slice(0, 100), page_path: location.pathname });
    }
  }, true);

  // 3) 접힌 섹션 열기 — 오늘 접어둔 것들(용어집·key facts·세트 네비)이 실제로 열리는지.
  //    아무도 안 열면 지워도 되고, 다들 열면 다시 펼쳐야 한다는 신호.
  document.addEventListener("toggle", function (ev) {
    var d = ev.target;
    if (!d || d.tagName !== "DETAILS" || !d.open) return;
    var sum = d.querySelector("summary");
    send("section_open", {
      section: (d.className || "details").toString().slice(0, 40),
      section_label: sum ? (sum.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : "",
      page_path: location.pathname
    });
  }, true);

  // 4) 차트 탭 전환 — Daily/Weekly/Monthly 중 뭘 실제로 보는지(봉차트 투자 판단 근거).
  document.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest(".opbcTab") : null;
    if (t) send("chart_tab", { tab: (t.textContent || "").trim().slice(0, 20), page_path: location.pathname });
  }, true);
})();
