// 운영자 채보 등록 북마클릿의 클라이언트 코드. /import.js 로 서빙되고, 설치 페이지의
// 북마클릿이 window.__carolImport = {base, code} 를 세팅한 뒤 이 스크립트를 주입한다.
//
// 실행 위치: atwiki simai 목록 페이지(공식 채보 데이터 스탠다드/でらっくす). 목록에서
// 곡 페이지 번호를 모으고, 이미 등록된 것을 빼고, 남은 곡을 사람 속도(기본 15초)로
// 하나씩 same-origin fetch → 추출 → carol 로 POST 한다. 진행/중지 UI 를 띄운다.
//
// atwiki 는 Cloudflare 뒤에 있어 봇이 직접 못 긁는다. 여기 fetch 는 운영자의 실제
// 브라우저 세션(이미 챌린지 통과)이 하는 same-origin 요청이라 우회가 아니다.
//
// 규칙: 이 문자열은 브라우저에 그대로 나가므로 여기 안에서 백틱과 ${ 를 쓰지 말 것
// (TS 템플릿 리터럴 안에 들어간다). 문자열은 따옴표+연결로만.

export const IMPORT_CLIENT_JS = String.raw`
(function(){
  var CFG = window.__carolImport || {};
  var BASE = String(CFG.base||"").replace(/\/+$/,"");
  var CODE = String(CFG.code||"");
  if(!BASE || !CODE){ alert("캐롤봇 채보 등록: 설정이 없습니다. 설치 페이지에서 다시 실행하세요."); return; }
  if(document.getElementById("carolImportUI")){ alert("이미 실행 중입니다."); return; }

  var DIFF = {BASIC:1, ADVANCED:2, EXPERT:3, MASTER:4, "Re:MASTER":5};
  var CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;
  var NAV = {31:1, 32:1, 808:1};
  // 지금 실행 중인 목록 페이지로 스탠다드/DX 판정(32=스탠다드, 808=でらっくす).
  // 곡 페이지에 변형 구분자가 있으면 그걸 우선한다.
  var LIST_TYPE = /\/pages\/808\.html/.test(location.pathname) ? "deluxe" : (/\/pages\/32\.html/.test(location.pathname) ? "standard" : "");

  function txt(el){ return el.textContent || ""; }
  function cell(td){ return txt(td).replace(/\s+/g," ").trim(); }
  // 노트 본문은 순수 ASCII simai(숫자·,·{}·()·[]·/-^*<> 등). 노트 구획이 여러 DIV 로
  // 쪼개지면 이어지는 DIV 가 {}/() 없이 "3,2,1,," 처럼 시작하기도 하므로 {}/() 유무로
  // 판단하면 안 된다(그러면 그 뒤가 통째로 잘린다 — Oshama Scramble! 사례). 코멘트/설명은
  // 일본어(CJK)를 포함하므로 CJK 유무로 가른다. 코멘트 플러그인/푸터 클래스도 경계로 본다.
  function isNoteText(t){ return !!t && !CJK.test(t); }
  function isBoundaryEl(el){ var c=el.className||""; return /plugin_comment/.test(c) || /(^|\s)atwiki-/.test(c); }

  // 곡 페이지 하나(Document)에서 메타 + 난이도별 노트를 뽑는다. 서버 sanitizeSong 과 짝.
  function extract(doc){
    var wb = doc.querySelector("#wikibody"); if(!wb) return null;
    // 〈スタンダード〉/〈でらっくす〉 변형 구분자만 뗀다(별명 DB 매칭용). 실제 곡명의
    // 다른 괄호(（）【】＜＞)는 건드리지 않는다. 구분자에서 스탠다드/DX 종류도 뽑는다.
    var rawTitle = ((doc.querySelector("title")||{}).textContent||"").replace(/\s*-\s*simai.*$/i,"");
    var type = /〈でらっくす〉/.test(rawTitle) ? "deluxe" : (/〈スタンダード〉/.test(rawTitle) ? "standard" : LIST_TYPE);
    var title = rawTitle.replace(/〈(スタンダード|でらっくす|デラックス)〉/g,"").trim();
    var artist="", bpm=0, levels={}, designers={};
    var utComment="", utLevel={};   // 우타게(宴): 테이블 COMMENT, H2 속성명
    var tables = wb.querySelectorAll("table");
    for(var ti=0; ti<tables.length; ti++){
      var trs = tables[ti].querySelectorAll("tr"); var rows=[];
      for(var ri=0; ri<trs.length; ri++){ var cs=trs[ri].querySelectorAll("th,td"); var row=[]; for(var ci=0; ci<cs.length; ci++) row.push(cell(cs[ci])); rows.push(row); }
      var flat = rows.map(function(r){ return r.join(" "); }).join(" ");
      if(/アーティスト/.test(flat)){
        for(var k=0;k<rows.length;k++){ var idx=rows[k].findIndex(function(c){ return /アーティスト/.test(c); }); if(idx>=0 && rows[k][idx+1]) artist=rows[k][idx+1]; }
      }
      if(/BPM/.test(flat) && /(BASIC|MASTER)/.test(flat)){
        var hdr=null; for(var h=0;h<rows.length;h++){ if(rows[h].some(function(c){ return /BPM/.test(c); })){ hdr=rows[h]; break; } }
        var val=null; if(hdr){ for(var v=0;v<rows.length;v++){ if(rows[v]!==hdr && rows[v].length===hdr.length){ val=rows[v]; break; } } }
        if(hdr && val){ for(var c2=0;c2<hdr.length;c2++){ var hh=hdr[c2]; if(/BPM/.test(hh)) bpm=parseFloat(val[c2])||0; else if(DIFF[hh]!=null && val[c2] && val[c2]!=="-") levels[DIFF[hh]]=val[c2]; } }
      }
      if(/譜面制作者/.test(flat)){
        var hdr2=null; for(var h2=0;h2<rows.length;h2++){ if(rows[h2].some(function(c){ return DIFF[c]!=null; })){ hdr2=rows[h2]; break; } }
        var val2=null; for(var v2=0;v2<rows.length;v2++){ if(rows[v2].some(function(c){ return /譜面制作者/.test(c); })){ val2=rows[v2]; break; } }
        if(hdr2 && val2){ for(var c3=0;c3<hdr2.length;c3++){ var hh3=hdr2[c3]; if(DIFF[hh3]!=null && val2[c3] && val2[c3]!=="-" && !/譜面制作者/.test(val2[c3])) designers[DIFF[hh3]]=val2[c3]; } }
      }
      // 우타게(宴): 테이블이 BPM/属性/COMMENT 형식. bpm 과 COMMENT(난이도 표기)를 뽑는다.
      if(/BPM/.test(flat) && /属性/.test(flat)){
        var uh=null; for(var uh1=0;uh1<rows.length;uh1++){ if(rows[uh1].some(function(c){ return /BPM/.test(c); })){ uh=rows[uh1]; break; } }
        var uv=null; if(uh){ for(var uv1=0;uv1<rows.length;uv1++){ if(rows[uv1]!==uh && rows[uv1].length===uh.length){ uv=rows[uv1]; break; } } }
        if(uh&&uv){ for(var uc=0;uc<uh.length;uc++){ var uhh=uh[uc]; if(/BPM/.test(uhh)){ if(!bpm) bpm=parseFloat(uv[uc])||0; } else if(/COMMENT/.test(uhh) && uv[uc]) utComment=uv[uc]; } }
      }
    }
    var notes={}, cur=null, kids=wb.children, utIdx=0;
    for(var ki=0; ki<kids.length; ki++){ var el=kids[ki];
      if(el.tagName==="H2"){ var nm=txt(el).trim();
        if(DIFF[nm]!=null){ cur=DIFF[nm]; }
        // 우타게: "属性:招" 같은 헤딩. inote 파서가 1~7 만 읽으므로 6,7 두 개까지만.
        else if(/^属性/.test(nm) && utIdx<2){ cur=6+utIdx; utIdx++; utLevel[cur]=(nm.split(/[:：]/)[1]||"").trim(); }
        else { cur=null; }
        continue;
      }
      if(cur==null) continue;
      if(isBoundaryEl(el)){ cur=null; continue; }   // 코멘트/푸터 시작 → 노트 구획 끝
      if(el.tagName==="DIV"){ var t=txt(el).replace(/^\n+/,"").replace(/\s+$/,""); if(!t) continue; if(isNoteText(t)) notes[cur]=(notes[cur]?notes[cur]+"\n":"")+t; else cur=null; }
    }
    var charts=[];
    [1,2,3,4,5].forEach(function(d){ if(!levels[d]) return; var n=(notes[d]||"").replace(/\n{2,}/g,"\n").trim(); if(!n) return; charts.push({diff:d, level:levels[d], designer:designers[d]||"", notes:n}); });
    // 우타게 채보(diff 6,7). 레벨은 COMMENT 우선, 없으면 속성명. 제작자·아티스트는 없음.
    [6,7].forEach(function(d){ if(!notes[d]) return; var n=notes[d].replace(/\n{2,}/g,"\n").trim(); if(!n) return; charts.push({diff:d, level: utComment || utLevel[d] || "", designer:"", notes:n}); });
    // 우타게만 있는 곡은 [招] 제목·宴 난이도로 이미 구분되므로 [ST]/[DX] 태그를 붙이지 않는다.
    if(charts.length && charts.every(function(c){ return c.diff>=6; })) type="";
    return {title:title, artist:artist, bpm:bpm, type:type, charts:charts};
  }

  // 목록 페이지에서 곡 {page,title} 을 모은다. 레벨 링크(숫자만)·네비·앵커는 뺀다.
  function parseList(){
    var wb=document.querySelector("#wikibody"); if(!wb) return [];
    var as=wb.querySelectorAll("a[href]"); var map={}, order=[];
    for(var i=0;i<as.length;i++){ var a=as[i]; var href=a.getAttribute("href")||"";
      var m=href.match(/\/simai\/pages\/(\d+)\.html/); if(!m) continue;
      var page=parseInt(m[1],10); if(NAV[page]) continue;
      var t=(a.textContent||"").trim(); if(!t) continue;
      if(/^\d+\+?$/.test(t)) continue;                       // "13","7+" = 레벨 링크
      if(/公式譜面|Official|テンプレ|template/.test(t)) continue;
      if(!map[page]){ map[page]={page:page, title:t}; order.push(page); }
    }
    return order.map(function(p){ return map[p]; });
  }

  function api(path, opt){ return fetch(BASE+path, opt); }
  function sleep(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }
  function fmtTime(s){ s=Math.max(0,Math.round(s)); var h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60; return (h?h+"시간 ":"")+(m?m+"분 ":"")+ss+"초"; }

  // ── UI ────────────────────────────────────────────────────────────────
  var ui=document.createElement("div"); ui.id="carolImportUI";
  ui.setAttribute("style","position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;max-width:92vw;background:#242427;color:#f2edef;border:1px solid #33333a;border-radius:16px;font:13px/1.55 Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden");
  ui.innerHTML=""
   +"<div style='padding:10px 14px;background:#ff9294;color:#3a1e1e;font-weight:600;display:flex;justify-content:space-between;align-items:center'>캐롤봇 채보 등록<span id='ciClose' style='cursor:pointer;font-weight:400;opacity:.85'>✕</span></div>"
   +"<div style='padding:12px'>"
   +"<div id='ciStat' style='margin-bottom:6px;color:#cfc6ca'>목록을 읽는 중…</div>"
   +"<div style='height:8px;background:#2e2e33;border-radius:99px;overflow:hidden;margin:8px 0'><div id='ciBar' style='height:100%;width:0;background:#ff9294;transition:width .2s'></div></div>"
   +"<div id='ciNow' style='color:#f2edef;min-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'></div>"
   +"<div id='ciEta' style='color:#8a8087;font-size:12px;margin:4px 0 8px'></div>"
   +"<div style='display:flex;gap:6px;align-items:center;margin-bottom:8px'>"
   +"<button id='ciToggle' style='flex:1;padding:7px;border:0;border-radius:10px;background:#ff9294;color:#3a1e1e;font-weight:600;cursor:pointer'>시작</button>"
   +"<button id='ciStop' style='padding:7px 10px;border:1px solid #3a353d;border-radius:8px;background:#2e2e33;color:#f2edef;cursor:pointer'>중지</button>"
   +"<label style='font-size:12px;color:#b3a8ad;display:flex;align-items:center;gap:3px'>간격<input id='ciInt' type='number' min='5' max='120' value='15' style='width:42px;background:#2e2e33;color:#f2edef;border:1px solid #3a353d;border-radius:6px;padding:3px'>s</label>"
   +"</div>"
   +"<label style='font-size:12px;color:#b3a8ad;display:flex;align-items:center;gap:5px;margin:0 0 8px'><input id='ciForce' type='checkbox' style='margin:0'>이미 등록된 곡도 다시 가져오기(잘린 채보 교체)</label>"
   +"<div id='ciLog' style='height:110px;overflow:auto;background:#1a1a1c;border:1px solid #2e2e33;border-radius:8px;padding:6px;font:11px/1.45 ui-monospace,Menlo,monospace;color:#cfc6ca'></div>"
   +"</div>";
  document.body.appendChild(ui);
  var $=function(id){ return document.getElementById(id); };
  function log(msg, color){ var d=document.createElement("div"); if(color) d.style.color=color; d.textContent=msg; $("ciLog").appendChild(d); $("ciLog").scrollTop=$("ciLog").scrollHeight; }

  var state={running:false, stop:false, idx:0, ok:0, add:0, skip:0, fail:0, todo:[], allSongs:[], known:{}};

  function setBar(){ var total=state.todo.length||1; $("ciBar").style.width=Math.round(state.idx/total*100)+"%"; $("ciStat").textContent="진행 "+state.idx+" / "+state.todo.length+"곡  ·  등록 "+state.add+" · 노트없음 "+state.skip+" · 실패 "+state.fail; }
  function setEta(){ var per=(parseInt($("ciInt").value,10)||15); var remain=(state.todo.length-state.idx)*per; $("ciEta").textContent = state.idx<state.todo.length ? ("남은 곡 "+(state.todo.length-state.idx)+" · 예상 "+fmtTime(remain)) : "완료"; }

  async function run(){
    while(state.running && !state.stop && state.idx < state.todo.length){
      var item=state.todo[state.idx];
      $("ciNow").textContent="⟳ "+item.title+" (p."+item.page+")";
      try{
        var html=await fetch("/simai/pages/"+item.page+".html").then(function(r){ return r.text(); });
        var doc=new DOMParser().parseFromString(html,"text/html");
        var song=extract(doc);
        if(!song || !song.charts.length){ state.skip++; log("· "+item.title+" — 노트 없음, 건너뜀","#8a8087"); }
        else{
          song.page=item.page;
          var r=await api("/api/admin/simai/import?code="+encodeURIComponent(CODE),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(song)});
          if(r.status===403){ log("✗ 토큰이 만료되었습니다. /채보가져오기 로 다시 열어주세요.","#f66"); state.running=false; state.stop=true; $("ciToggle").textContent="시작"; break; }
          var j=await r.json().catch(function(){ return {}; });
          if(r.ok && j.ok){ state.add++; state.ok++; log("✓ "+item.title+" — "+j.saved.length+"난이도 등록","#6f6"); }
          else{ state.fail++; log("✗ "+item.title+" — "+(j.error||("HTTP "+r.status)),"#f66"); }
        }
      }catch(e){ state.fail++; log("✗ "+item.title+" — "+(e&&e.message||e),"#f66"); }
      state.idx++; setBar(); setEta();
      if(state.idx>=state.todo.length){ $("ciNow").textContent="완료 🎉"; state.running=false; $("ciToggle").textContent="시작"; break; }
      // 사람 속도 간격. 중지/일시정지를 잘게 확인하며 대기.
      var waitMs=(parseInt($("ciInt").value,10)||15)*1000;
      var waited=0; while(waited<waitMs && state.running && !state.stop){ await sleep(250); waited+=250; }
    }
  }

  // force(재수집) 체크 상태에 따라 대상 목록을 다시 계산한다. 시작 전 · 체크 토글 시 호출.
  function recompute(){
    var force = $("ciForce").checked;
    state.todo = force ? state.allSongs.slice() : state.allSongs.filter(function(s){ return !state.known[s.page]; });
    state.idx=0; state.add=0; state.skip=0; state.fail=0;
    var already=state.allSongs.length-state.todo.length;
    $("ciStat").textContent = "목록 "+state.allSongs.length+"곡 · 이미 등록 "+already+"곡 · 대상 "+state.todo.length+"곡"+(force?" (재수집)":"");
    setBar(); setEta();
  }
  async function init(){
    var songs=parseList();
    if(!songs.length){ $("ciStat").textContent="이 페이지에서 곡 목록을 못 찾았습니다."; log("공식 채보 데이터(스탠다드/でらっくす) 목록 페이지에서 실행하세요.","#f66"); return; }
    $("ciStat").textContent="이미 등록된 곡 확인 중… (목록 "+songs.length+"곡)";
    state.allSongs=songs; state.known={};
    try{ var kr=await api("/api/admin/simai/known-pages?code="+encodeURIComponent(CODE)); var kj=await kr.json(); if(kj && kj.pages) for(var i=0;i<kj.pages.length;i++) state.known[kj.pages[i]]=1; }
    catch(e){ log("등록 목록 조회 실패: "+(e&&e.message||e)+" (전체를 대상으로 진행)","#fa0"); }
    recompute();
    log("목록 "+songs.length+"곡 · 대상 "+state.todo.length+"곡","#9cf");
    if(!state.todo.length){ $("ciNow").textContent="모두 등록됨 ✓ (잘린 채보 교체는 위 체크박스)"; }
  }

  $("ciForce").onchange=function(){ if(!state.running){ recompute(); } };
  $("ciToggle").onclick=function(){ if(state.running){ state.running=false; this.textContent="재개"; } else { if(state.idx===0){ recompute(); } if(!state.todo.length){ return; } state.running=true; state.stop=false; this.textContent="일시정지"; run(); } };
  $("ciStop").onclick=function(){ state.running=false; state.stop=true; $("ciToggle").textContent="시작"; $("ciNow").textContent="중지됨"; };
  $("ciClose").onclick=function(){ state.running=false; state.stop=true; ui.remove(); };

  init();
})();
`;
