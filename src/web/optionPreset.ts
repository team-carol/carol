// 게임 옵션 프리셋. maimai DX NET 옵션 페이지(OPTION_PAGE_PATH)의 select 값을 이름 붙여
// 캐롤봇 DB(option_presets)에 저장해 두고, 나중에 한 번에 적용한다.
//
// 봇이 직접 적용하지 않는 이유: 서버는 DX NET 세션을 갖지 않는다(SEGA 자격 증명 비저장).
// 그래서 전용 북마클릿이 사용자 브라우저에서 same-origin 으로 옵션 페이지를 받아 읽고,
// 그 폼이 보내는 것과 똑같은 POST(모든 select + CSRF token)를 보낸다. 옵션 페이지를
// 열어 둘 필요 없이 DX NET 어느 페이지에서든 동작한다.
//
// 적용할 값이 그 계정의 select 에 없으면(미해금 SE·디자인 등) 그 항목은 현재 값을 유지한다.

export const OPTION_PRESET_MAX = 10;
const NAME_MAX = 30;
const FIELD_MAX = 80;
const FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const VALUE_RE = /^[A-Za-z0-9_.+-]{0,32}$/;

export function buildOptionBookmarklet(server: string, token: string): string {
  return `javascript:(function(d){var s=d.createElement('script');s.src='${server}/option.js?code=${token}&v='+Date.now();d.body.append(s)})(document)`;
}

/** 북마클릿이 보낸 저장 요청 본문 검증. 이상하면 null. */
export function sanitizeOptionPreset(body: unknown): { name: string; server: "intl" | "jp"; values: Record<string, string>; labels: Record<string, [string, string]> } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > NAME_MAX) return null;
  const server = b.server === "jp" ? "jp" : b.server === "intl" ? "intl" : null;
  if (!server) return null;
  if (!b.values || typeof b.values !== "object" || Array.isArray(b.values)) return null;
  const rawLabels = b.labels && typeof b.labels === "object" && !Array.isArray(b.labels) ? b.labels as Record<string, unknown> : {};
  const values: Record<string, string> = {};
  const labels: Record<string, [string, string]> = {};
  for (const [k, v] of Object.entries(b.values as Record<string, unknown>)) {
    if (!FIELD_RE.test(k) || k === "token" || typeof v !== "string" || !VALUE_RE.test(v)) return null;
    values[k] = v;
    const l = rawLabels[k];
    if (Array.isArray(l) && l.length === 2 && typeof l[0] === "string" && typeof l[1] === "string") {
      labels[k] = [l[0].trim().slice(0, 60), l[1].trim().slice(0, 60)];
    }
  }
  const n = Object.keys(values).length;
  if (n === 0 || n > FIELD_MAX) return null;
  return { name, server, values, labels };
}

// /option.js 로 서빙되는 클라이언트. 규칙: 이 문자열 안에서 백틱과 ${ 를 쓰지 말 것.
// 오버레이는 CSS 변수를 못 쓰므로 theme.ts 의 T 와 같은 값을 박아 둔다(bookmarklet.ts 와 같은 룩).
export const OPTION_CLIENT_JS = String.raw`
(function(){
  var h=location.hostname, server=h==='maimaidx.jp'?'jp':(h==='maimaidx-eng.com'?'intl':'');
  if(!server){ alert('maimai DX NET 페이지에서 실행해주세요.'); return; }
  var cur=document.currentScript; if(!cur) return;
  var su=new URL(cur.src), CODE=su.searchParams.get('code')||'', BASE=su.origin;
  if(cur.parentNode) cur.parentNode.removeChild(cur);
  var PAGE='/maimai-mobile/home/userOption/updateUserOption/';
  var ON_PAGE=location.pathname.indexOf(PAGE)===0;
  var API=BASE+'/api/option-presets?code='+encodeURIComponent(CODE);

  var C={bg:'#242427',border:'#33333a',line:'#2e2e33',ink:'#f2edef',text:'#cfc6ca',muted:'#b3a8ad',dim:'#8a8087',faint:'#6f676c',accent:'#ff9294',accentInk:'#3a1e1e',soft:'#f2b3bf',field:'#1a1a1c',ok:'#4ade80',err:'#f87171',warn:'#facc15'};
  var MONO='ui-monospace,SFMono-Regular,Menlo,monospace';

  var old=document.getElementById('carol-opt-ov'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='carol-opt-ov';
  ov.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:'+C.bg+';border:1px solid '+C.border+';border-radius:16px;padding:16px 18px;font:13px Pretendard,"Pretendard Variable",system-ui,-apple-system,sans-serif;color:'+C.text+';width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 0 1px rgba(255,146,148,.14);text-align:left;line-height:1.45';
  document.body.appendChild(ov);

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function el(tag,css,html){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(html!=null) e.innerHTML=html; return e; }
  function btn(label,primary){ var b=el('button','border:0;border-radius:10px;padding:6px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;'+(primary?'background:'+C.accent+';color:'+C.accentInk:'background:'+C.line+';color:'+C.text+';box-shadow:0 0 0 1px #3a353d'),esc(label)); b.type='button'; return b; }

  var head=el('div','display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid '+C.line,
    '<div style="display:flex;align-items:baseline"><span style="color:'+C.ink+';font-size:15px;font-weight:600">캐롤봇</span><span style="color:'+C.faint+';font-size:10px;font-weight:600;letter-spacing:.6px;margin-left:10px;font-family:'+MONO+'">OPTION PRESET · '+(server==='jp'?'JP':'INTL')+'</span></div>');
  var xb=el('button','background:none;border:none;color:'+C.dim+';font-size:14px;cursor:pointer;padding:2px 6px;border-radius:6px','✕'); xb.type='button'; xb.onclick=function(){ ov.remove(); };
  head.appendChild(xb); ov.appendChild(head);
  var msgEl=el('div','font-size:12px;min-height:0;margin-bottom:8px;display:none');
  ov.appendChild(msgEl);
  var body=el('div'); ov.appendChild(body);
  function msg(t,color){ msgEl.style.display=t?'block':'none'; msgEl.style.color=color||C.muted; msgEl.textContent=t||''; }

  function isErrorPage(t){ return t.length<15000&&(t.indexOf('ERROR CODE')>-1||t.indexOf('NET－Error－')>-1); }

  // 옵션 페이지를 받아 폼을 읽는다. fields: select 목록(표시·비교용), order: 폼이 보내는 순서 그대로의
  // name 있는 입력 전부(select + hidden token). POST 는 order 를 그대로 재현한다.
  async function loadForm(){
    var r=await fetch(PAGE,{credentials:'same-origin',cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var t=await r.text();
    if(isErrorPage(t)) throw new Error('DX NET 이 혼잡합니다. 잠시 뒤 다시 시도해주세요.');
    var form=parseForm(new DOMParser().parseFromString(t,'text/html')); form.html=t; return form;
  }
  // 캐롤봇 게임 설정 페이지의 '현재 설정'을 최신으로. 실패해도 북마클릿 동작에는 영향 없음.
  function pushSnapshot(form){ if(!form||!form.html) return; fetch(BASE+'/api/options/snapshot?code='+encodeURIComponent(CODE),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,html:form.html})}).catch(function(){}); }
  function parseForm(d){
    var f=d.querySelector('form[action*="updateUserOption/update"]');
    if(!f) throw new Error('옵션 페이지를 읽지 못했습니다. 로그인 상태를 확인해주세요.');
    var action=new URL(f.getAttribute('action'),location.href);
    if(action.origin!==location.origin) throw new Error('예상과 다른 폼입니다.');
    var fields=[], order=[];
    Array.prototype.forEach.call(f.elements,function(e){
      if(!e.name) return;
      if(e.tagName==='SELECT'){
        var opts={}; Array.prototype.forEach.call(e.options,function(o){ opts[o.value]=o.textContent.replace(/\s+/g,' ').trim(); });
        var tr=e.closest('tr'), label=tr&&tr.cells&&tr.cells[0]?tr.cells[0].textContent.replace(/\s+/g,' ').trim():e.name;
        var fd={name:e.name,value:e.value,label:label,options:opts}; fields.push(fd); order.push(fd);
      } else if(e.type==='hidden'){ order.push({name:e.name,value:e.value,hidden:true}); }
    });
    if(!fields.length) throw new Error('옵션 항목을 찾지 못했습니다.');
    return {action:action.href,fields:fields,order:order};
  }

  function diff(form,preset){
    var changes=[], missing=[];
    form.fields.forEach(function(fd){
      if(!Object.prototype.hasOwnProperty.call(preset.values,fd.name)) return;
      var pv=preset.values[fd.name];
      if(!Object.prototype.hasOwnProperty.call(fd.options,pv)){ missing.push(fd.label); return; }
      if(pv!==fd.value) changes.push({name:fd.name,label:fd.label,from:fd.options[fd.value],to:fd.options[pv]});
    });
    return {changes:changes,missing:missing};
  }

  async function postForm(form,preset){
    var p=new URLSearchParams();
    form.order.forEach(function(fd){
      var v=fd.value;
      if(!fd.hidden&&Object.prototype.hasOwnProperty.call(preset.values,fd.name)&&Object.prototype.hasOwnProperty.call(fd.options,preset.values[fd.name])) v=preset.values[fd.name];
      p.append(fd.name,v);
    });
    var r=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString()});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var t=await r.text();
    if(isErrorPage(t)) throw new Error('DX NET 이 저장을 거부했습니다. 잠시 뒤 다시 시도해주세요.');
  }

  var state={form:null,presets:[],max:10,open:null,confirm:null,busy:false};

  async function api(path,data){
    var r=await fetch(path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
    var j=null; try{ j=await r.json(); }catch(_e){}
    if(r.status===403) throw new Error('캐롤봇 링크가 만료됐습니다. Discord 에서 /설정 으로 북마클릿을 다시 받아주세요.');
    if(!r.ok||!j) throw new Error(j&&j.error==='limit'?'프리셋은 최대 '+(j.max||10)+'개까지 저장할 수 있습니다.':'캐롤봇 서버 오류 ('+r.status+')');
    return j;
  }

  function render(){
    body.innerHTML='';
    // 저장
    var sv=el('div','padding-bottom:12px;margin-bottom:6px;border-bottom:1px solid '+C.line);
    sv.appendChild(el('div','color:'+C.muted+';font-size:10px;font-weight:700;letter-spacing:.6px;font-family:'+MONO+';margin-bottom:6px','지금 설정 저장'));
    var row=el('div','display:flex;gap:6px');
    var inp=el('input','flex:1;min-width:0;background:'+C.field+';border:1px solid '+C.border+';border-radius:10px;padding:7px 10px;color:'+C.ink+';font:inherit;font-size:13px;outline:none');
    inp.placeholder='프리셋 이름 (예: 평소, 연습용)'; inp.maxLength=30;
    var sb=btn('저장',true);
    inp.oninput=function(){ var n=inp.value.trim(); sb.textContent=state.presets.some(function(p){return p.name===n;})?'덮어쓰기':'저장'; };
    inp.onkeydown=function(e){ if(e.key==='Enter') sb.click(); };
    sb.onclick=function(){ save(inp.value); };
    row.appendChild(inp); row.appendChild(sb); sv.appendChild(row);
    body.appendChild(sv);

    // 목록
    body.appendChild(el('div','color:'+C.muted+';font-size:10px;font-weight:700;letter-spacing:.6px;font-family:'+MONO+';padding:6px 0 4px','저장된 프리셋 '+state.presets.length+'/'+state.max));
    if(!state.presets.length){ body.appendChild(el('div','color:'+C.faint+';font-size:12px;padding:6px 0','아직 저장된 프리셋이 없습니다.')); return; }
    state.presets.forEach(function(p){
      var d=diff(state.form,p), item=el('div','padding:8px 0;border-top:1px solid '+C.line);
      var top=el('div','display:flex;align-items:center;gap:8px');
      var nm=el('div','flex:1;min-width:0;cursor:pointer',
        '<div style="color:'+C.ink+';font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</div>'
        +'<div style="color:'+(d.changes.length?C.soft:C.faint)+';font-size:11px">'+(d.changes.length?d.changes.length+'개 항목이 바뀜':'지금 설정과 같음')+(p.server!==server?' · '+(p.server==='jp'?'JP':'INTL')+'에서 저장':'')+'</div>');
      nm.onclick=function(){ state.open=state.open===p.id?null:p.id; state.confirm=null; render(); };
      var ab=btn('적용',true); ab.disabled=state.busy||!d.changes.length; if(ab.disabled) ab.style.opacity='.4';
      ab.onclick=function(){ state.open=p.id; state.confirm=state.confirm==='apply'+p.id?null:'apply'+p.id; render(); };
      var db=btn(state.confirm==='del'+p.id?'정말 삭제':'삭제',false); db.disabled=state.busy;
      if(state.confirm==='del'+p.id){ db.style.color=C.err; }
      db.onclick=function(){ if(state.confirm==='del'+p.id) remove(p); else { state.confirm='del'+p.id; render(); } };
      top.appendChild(nm); top.appendChild(ab); top.appendChild(db); item.appendChild(top);

      if(state.open===p.id){
        var box=el('div','margin-top:8px;padding:8px 10px;background:'+C.field+';border-radius:10px;font-size:11.5px');
        if(!d.changes.length) box.appendChild(el('div','color:'+C.faint,'바뀌는 항목이 없습니다.'));
        d.changes.forEach(function(c){
          box.appendChild(el('div','display:flex;gap:8px;padding:2px 0',
            '<span style="flex:1;color:'+C.muted+'">'+esc(c.label)+'</span><span style="color:'+C.faint+'">'+esc(c.from)+'</span><span style="color:'+C.faint+'">→</span><span style="color:'+C.ink+';font-weight:600">'+esc(c.to)+'</span>'));
        });
        if(d.missing.length) box.appendChild(el('div','color:'+C.warn+';margin-top:6px','이 계정에서 고를 수 없는 값이라 건너뜀: '+esc(d.missing.join(', '))));
        if(state.confirm==='apply'+p.id){
          var cf=el('div','display:flex;align-items:center;gap:6px;margin-top:8px');
          cf.appendChild(el('span','flex:1;color:'+C.text,'DX NET 옵션에 적용할까요?'));
          var yes=btn('적용하기',true), no=btn('취소',false);
          yes.onclick=function(){ apply(p); }; no.onclick=function(){ state.confirm=null; render(); };
          cf.appendChild(yes); cf.appendChild(no); box.appendChild(cf);
        }
        item.appendChild(box);
      }
      body.appendChild(item);
    });
  }

  async function save(name){
    name=String(name||'').replace(/\s+/g,' ').trim();
    if(!name){ msg('프리셋 이름을 입력해주세요.',C.err); return; }
    if(state.busy) return; state.busy=true; msg('지금 옵션을 읽는 중…');
    try{
      // 옵션 페이지에서 실행했으면 화면에 보이는 값(아직 DX NET 에 저장 안 한 변경 포함)을 저장한다.
      var src=ON_PAGE?parseForm(document):await loadForm();
      var values={}, labels={};
      src.fields.forEach(function(fd){ values[fd.name]=fd.value; labels[fd.name]=[fd.label,fd.options[fd.value]||fd.value]; });
      var j=await api(API,{name:name,server:server,values:values,labels:labels});
      state.presets=state.presets.filter(function(p){return p.name!==j.preset.name;}).concat([j.preset]);
      msg('✓ "'+name+'" 저장됨',C.ok);
    }catch(e){ msg(e&&e.message||String(e),C.err); }
    state.busy=false; render();
  }

  async function remove(p){
    if(state.busy) return; state.busy=true; state.confirm=null;
    try{
      await api(BASE+'/api/option-presets/delete?code='+encodeURIComponent(CODE),{id:p.id});
      state.presets=state.presets.filter(function(x){return x.id!==p.id;});
      msg('"'+p.name+'" 삭제됨',C.muted);
    }catch(e){ msg(e&&e.message||String(e),C.err); }
    state.busy=false; render();
  }

  async function apply(p){
    if(state.busy) return; state.busy=true; state.confirm=null; msg('적용 중…',C.warn); render();
    try{
      var form=await loadForm();                         // 새 CSRF token + 최신 값
      if(!diff(form,p).changes.length){ state.form=form; msg('이미 이 프리셋과 같습니다.',C.muted); state.busy=false; render(); return; }
      await postForm(form,p);
      state.form=await loadForm();                       // 실제로 바뀌었는지 다시 읽어 확인
      pushSnapshot(state.form);
      var left=diff(state.form,p).changes;
      if(left.length) msg('일부 항목이 적용되지 않았습니다: '+left.map(function(c){return c.label;}).join(', '),C.err);
      else { msg('✓ "'+p.name+'" 적용 완료',C.ok); if(ON_PAGE) setTimeout(function(){ location.reload(); },1200); }
    }catch(e){ msg(e&&e.message||String(e),C.err); }
    state.busy=false; render();
  }

  (async function init(){
    msg('불러오는 중…');
    try{
      var res=await Promise.all([loadForm(),api(API)]);
      state.form=res[0]; state.presets=res[1].presets||[]; if(res[1].max) state.max=res[1].max;
      pushSnapshot(state.form);
      msg('');
    }catch(e){ msg(e&&e.message||String(e),C.err); return; }
    render();
  })();
})();
`;
