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
  if(!BASE || !CODE){ alert("carol 채보등록: 설정이 없습니다. 설치 페이지에서 다시 실행하세요."); return; }
  if(document.getElementById("carolImportUI")){ alert("이미 실행 중입니다."); return; }

  var DIFF = {BASIC:1, ADVANCED:2, EXPERT:3, MASTER:4, "Re:MASTER":5};
  var CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;
  var NAV = {31:1, 32:1, 808:1};

  function txt(el){ return el.textContent || ""; }
  function cell(td){ return txt(td).replace(/\s+/g," ").trim(); }
  function looksLikeNotes(t){ var s=t.trim(); if(!s) return false; if(CJK.test(s)) return false; return /[{(]/.test(s) && /[,{]/.test(s); }

  // 곡 페이지 하나(Document)에서 메타 + 난이도별 노트를 뽑는다. 서버 sanitizeSong 과 짝.
  function extract(doc){
    var wb = doc.querySelector("#wikibody"); if(!wb) return null;
    // 〈スタンダード〉/〈でらっくす〉 같은 변형 구분자는 제목에서 뗀다(별명 DB 매칭용).
    var title = ((doc.querySelector("title")||{}).textContent||"").replace(/\s*-\s*simai.*$/i,"").replace(/〈[^〉]*〉/g,"").trim();
    var artist="", bpm=0, levels={}, designers={};
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
    }
    var notes={}, cur=null, kids=wb.children;
    for(var ki=0; ki<kids.length; ki++){ var el=kids[ki];
      if(el.tagName==="H2"){ var nm=txt(el).trim(); cur = DIFF[nm]!=null ? DIFF[nm] : null; continue; }
      if(cur==null) continue;
      if(el.tagName==="DIV"){ var t=txt(el).replace(/^\n+/,"").replace(/\s+$/,""); if(!t) continue; if(looksLikeNotes(t)) notes[cur]=(notes[cur]?notes[cur]+"\n":"")+t; else cur=null; }
    }
    var charts=[], order=[1,2,3,4,5];
    for(var d2=0; d2<order.length; d2++){ var d=order[d2]; if(!levels[d]) continue; var n=(notes[d]||"").replace(/\n{2,}/g,"\n").trim(); if(!n) continue; charts.push({diff:d, level:levels[d], designer:designers[d]||"", notes:n}); }
    return {title:title, artist:artist, bpm:bpm, charts:charts};
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
  ui.setAttribute("style","position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;max-width:92vw;background:#1a1a1a;color:#eee;border:1px solid #9333ea;border-radius:12px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden");
  ui.innerHTML=""
   +"<div style='padding:10px 12px;background:#9333ea;color:#fff;font-weight:700;display:flex;justify-content:space-between;align-items:center'>carol 채보 등록<span id='ciClose' style='cursor:pointer;font-weight:400;opacity:.85'>✕</span></div>"
   +"<div style='padding:12px'>"
   +"<div id='ciStat' style='margin-bottom:6px;color:#bbb'>목록을 읽는 중…</div>"
   +"<div style='height:8px;background:#2a2a2a;border-radius:99px;overflow:hidden;margin:8px 0'><div id='ciBar' style='height:100%;width:0;background:#9333ea;transition:width .2s'></div></div>"
   +"<div id='ciNow' style='color:#eee;min-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'></div>"
   +"<div id='ciEta' style='color:#888;font-size:12px;margin:4px 0 8px'></div>"
   +"<div style='display:flex;gap:6px;align-items:center;margin-bottom:8px'>"
   +"<button id='ciToggle' style='flex:1;padding:7px;border:0;border-radius:8px;background:#9333ea;color:#fff;font-weight:600;cursor:pointer'>시작</button>"
   +"<button id='ciStop' style='padding:7px 10px;border:1px solid #444;border-radius:8px;background:#2a2a2a;color:#eee;cursor:pointer'>중지</button>"
   +"<label style='font-size:12px;color:#999;display:flex;align-items:center;gap:3px'>간격<input id='ciInt' type='number' min='5' max='120' value='15' style='width:42px;background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:6px;padding:3px'>s</label>"
   +"</div>"
   +"<div id='ciLog' style='height:110px;overflow:auto;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:8px;padding:6px;font:11px/1.45 ui-monospace,Menlo,monospace;color:#ccc'></div>"
   +"</div>";
  document.body.appendChild(ui);
  var $=function(id){ return document.getElementById(id); };
  function log(msg, color){ var d=document.createElement("div"); if(color) d.style.color=color; d.textContent=msg; $("ciLog").appendChild(d); $("ciLog").scrollTop=$("ciLog").scrollHeight; }

  var state={running:false, stop:false, idx:0, ok:0, add:0, skip:0, fail:0, todo:[]};

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
        if(!song || !song.charts.length){ state.skip++; log("· "+item.title+" — 노트 없음, 건너뜀","#888"); }
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

  async function init(){
    var songs=parseList();
    if(!songs.length){ $("ciStat").textContent="이 페이지에서 곡 목록을 못 찾았습니다."; log("공식 채보 데이터(스탠다드/でらっくす) 목록 페이지에서 실행하세요.","#f66"); return; }
    $("ciStat").textContent="이미 등록된 곡 확인 중… (목록 "+songs.length+"곡)";
    var known={};
    try{ var kr=await api("/api/admin/simai/known-pages?code="+encodeURIComponent(CODE)); var kj=await kr.json(); if(kj && kj.pages) for(var i=0;i<kj.pages.length;i++) known[kj.pages[i]]=1; }
    catch(e){ log("등록 목록 조회 실패: "+(e&&e.message||e)+" (전체를 대상으로 진행)","#fa0"); }
    state.todo=songs.filter(function(s){ return !known[s.page]; });
    var already=songs.length-state.todo.length;
    log("목록 "+songs.length+"곡 · 이미 등록 "+already+"곡 · 대상 "+state.todo.length+"곡","#9cf");
    setBar(); setEta();
    if(!state.todo.length){ $("ciStat").textContent="새로 등록할 곡이 없습니다."; $("ciNow").textContent="모두 등록됨 ✓"; }
  }

  $("ciToggle").onclick=function(){ if(state.running){ state.running=false; this.textContent="재개"; } else { if(!state.todo.length){ return; } state.running=true; state.stop=false; this.textContent="일시정지"; run(); } };
  $("ciStop").onclick=function(){ state.running=false; state.stop=true; $("ciToggle").textContent="시작"; $("ciNow").textContent="중지됨"; };
  $("ciClose").onclick=function(){ state.running=false; state.stop=true; ui.remove(); };

  init();
})();
`;
