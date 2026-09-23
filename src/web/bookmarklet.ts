let baseUrl = "";
export function setBaseUrl(url: string): void { baseUrl = url; }
export function getBaseUrl(port: number): string { return baseUrl || `http://localhost:${port}`; }

export interface BookmarkletPreset {
  id: string;
  label: string;
  description: string;
  code: string;
  execution?: BookmarkletExecution;
}

interface BookmarkletExecution {
  popupUrl?: string;
  popupName?: string;
  completionTopic?: string;
  timeoutMs?: number;
}

export const BOOKMARKLET_PRESETS: BookmarkletPreset[] = [{
  id: "maishift",
  label: "maishift",
  description: "대부분 사용자가 함께 쓰는 maishift 북마클릿",
  code: "javascript:(function(i){var t=i.createElement(\"script\");t.src=\"https://maimai.shiftpsh.com/bookmarklet.js?v=\"+Math.floor(Date.now()/1e5),i.body.append(t)})(document);",
  execution: {
    popupUrl: "https://maimai.shiftpsh.com/upload",
    popupName: "maimai-record",
    completionTopic: "complete",
    timeoutMs: 30000,
  },
}];

export function getBookmarkletPresets(ids: string[]): Array<{ label: string; code: string; execution?: BookmarkletExecution }> {
  const enabled = new Set(ids);
  return BOOKMARKLET_PRESETS.filter((preset) => enabled.has(preset.id)).map((preset) => ({
    label: preset.label,
    code: preset.code,
    execution: preset.execution,
  }));
}

export function buildBookmarklet(token: string, port: number): string {
  const server = getBaseUrl(port);
  return `javascript:(function(d){var s=d.createElement('script');s.src='${server}/bookmarklet.js?code=${token}&v='+Math.floor(Date.now()/1e5);d.body.append(s)})(document)`;
}

export function buildBookmarkletJs(
  extras: Array<{ label: string; code: string; execution?: BookmarkletExecution }>,
  opts: { policyNotice?: boolean; deprecationCutoff?: string } = {},
): string {
  const marker = "addSection('PROFILE');";
  let script = withAchievementInitUi(bookmarkletJs);

  // 마커 앞에 주입한 조각은 addSection('PROFILE') 전에, stEl(상태 리스트)이 만들어진 뒤 실행된다.
  const prepend = (code: string): void => {
    const pos = script.indexOf(marker);
    if (pos !== -1) script = script.slice(0, pos) + code + script.slice(pos);
  };

  // 방침 변경 1회 고지 — 오버레이 맨 위. 업데이트 = 업데이트, 자세히 = 자세히
  if (opts.policyNotice) {
    prepend(
      `(function(){try{var _pn=doc.createElement('div');_pn.style.cssText='padding:10px 0;margin-bottom:4px;border-bottom:1px solid #2e2e33;color:#f2b3bf;font-size:11px;line-height:1.5';_pn.innerHTML='캐롤봇 개인정보처리방침이 업데이트되었습니다 (2026-09-23) · 데이터 저장 방식 설명 정정 · <a href="'+v+'/privacy" target="_blank" rel="noopener" style="color:#f2b3bf">자세히</a>';stEl.appendChild(_pn);}catch(_e){}})();`,
    );
  }

  // 구 도메인으로 접속된 구북마클릿 전용 경고 — 서버가 요청 Host로 legacy 여부를 판단해 넘겨줌
  if (opts.deprecationCutoff) {
    prepend(
      `(function(){try{var _dn=doc.createElement('div');_dn.style.cssText='padding:10px 0;margin-bottom:4px;border-bottom:1px solid #2e2e33;color:#fb923c;font-size:11px;line-height:1.5';_dn.innerHTML='이 링크는 ${opts.deprecationCutoff}부터 사용할 수 없습니다 · Discord에서 /북마클릿 을 다시 실행해 새 링크를 받아주세요';stEl.appendChild(_dn);}catch(_e){}})();`,
    );
  }

  if (extras.length > 0) {
    const extrasJson = JSON.stringify(extras);
    prepend(
      `(function(){var _exbms=${extrasJson};if(_exbms.length>0){addSection('EXTRA');_exbms.forEach(function(bm,i){var _id='ex'+i;var _lbl=bm.label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');addRow(_id,_lbl);try{(0,eval)(bm.code.replace(/^javascript:/,''));okRow(_id,'\\uC2E4\\uD589');}catch(_e){console.warn('[carol] extra:',bm.label,_e);failRow(_id,'\\uC2E4\\uD328');}});}})();`,
    );
  }

  return script;
}

function withAchievementInitUi(script: string): string {
  return script
    .replace(
      "var stEl=doc.getElementById('mmsync-st'),hadErr=false;",
      "var stEl=doc.getElementById('mmsync-st'),hadErr=false;var phaseEl=doc.createElement('div');phaseEl.style.cssText='display:none;color:#f2b3bf;font-size:11px;line-height:1.4;padding:8px 0 2px;margin-bottom:4px;border-bottom:1px solid #2e2e33';stEl.parentNode.insertBefore(phaseEl,stEl);function phase(tx){phaseEl.textContent=tx;phaseEl.style.display=tx?'block':'none';}",
    )
    .replace(
      "async function collectDetails(){var reqs=collectDetailRequests(rd),out=[];",
      "async function collectDetails(){var reqs=collectDetailRequests(rd),out=[];if(reqs.length===0){skipRow('dt','확인할 기록 없음');return [];}setRow('dt','↻','#facc15','확인 중');",
    )
    .replace(
      // "return out;}" 만으로는 앞서 정의된 runPool 에 먼저 걸린다. collectDetails 의 꼬리를 통째로 지정.
      "for(var _i=0;_i<_dres.length;_i++){if(_dres[_i])out.push(_dres[_i]);}return out;}",
      "for(var _i=0;_i<_dres.length;_i++){if(_dres[_i])out.push(_dres[_i]);}"
        + "if(out.length<reqs.length){setRow('dt','!','#facc15',out.length+'/'+reqs.length+' 수집');}"
        + "else{okRow('dt',out.length+'개');}return out;}",
    )
    .replace(
      "async function postSync(){",
      "async function postSync(){phase('동기화 저장 중...');",
    )
    .replace(
      "svText=await resp.text();",
      "svText=await resp.text();",
    )
    .replace(
      "async function postSync(){phase('동기화 저장 중...');",
      "async function postSync(){phase('동기화 저장 중...');",
    )
    .replace(
      "else{okRow('sv');}return true;",
      "else if(svText==='initialized'){phase('첫 동기화는 기준선으로 저장 · 이후부터 플레이 기록 수집');okRow('sv','기준선 설정');}else{phase('동기화 저장 완료');okRow('sv');}return true;",
    )
    .replace(
      "await postSync();",
      "await postSync();",
    )
    .replace(
      "else if(!hadErr){fin.style.color='#4ade80';",
      "else if(typeof svText!=='undefined'&&svText==='initialized'&&!hadErr){fin.style.color='#f2b3bf';fin.innerHTML='<span style=\"font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px\">INIT</span><span>첫 동기화 기준선 설정 완료 · 다음부터 플레이 기록 수집</span>';stEl.appendChild(fin);}else if(!hadErr){fin.style.color='#4ade80';",
    );
}

export const bookmarkletJs = `(async()=>{
var h=location.hostname,server=h==='maimaidx.jp'?'jp':(h==='maimaidx-eng.com'?'intl':'');if(!server){alert('maimai DX NET 페이지에서 실행해주세요.');return;}
var doc=document,cur=doc.currentScript,s=cur.src,u=new URL(s),c=u.searchParams.get('code')||'',v=u.origin;if(cur&&cur.parentNode)cur.parentNode.removeChild(cur);try{if(performance&&performance.clearResourceTimings)performance.clearResourceTimings();}catch(_pe){}
var old=doc.getElementById('mm-sync-ov');if(old)old.remove();
var ov=doc.createElement('div');ov.id='mm-sync-ov';
ov.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:#242427;border:1px solid #33333a;border-radius:16px;padding:16px 18px;font:13px Pretendard,"Pretendard Variable",system-ui,-apple-system,sans-serif;color:#cfc6ca;min-width:300px;max-width:340px;max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 0 1px rgba(255,146,148,.14)';
ov.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:4px;border-bottom:1px solid #2e2e33"><div style="display:flex;align-items:baseline"><span style="color:#f2edef;font-size:15px;font-weight:600">캐롤봇</span><span id="mmsync-region" style="color:#6f676c;font-size:10px;font-weight:600;letter-spacing:.6px;margin-left:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase">SYNC</span></div><button id="mmsync-x" style="background:none;border:none;color:#8a8087;font-size:14px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px;transition:background .15s,color .15s">\u2715</button></div><div id="mmsync-st"></div>';
doc.body.appendChild(ov);
var xBtn=doc.getElementById('mmsync-x');
xBtn.onmouseenter=function(){xBtn.style.color='#f2edef';xBtn.style.background='#2e2e33';};
xBtn.onmouseleave=function(){xBtn.style.color='#8a8087';xBtn.style.background='none';};
xBtn.onclick=function(){ov.remove();};
var stEl=doc.getElementById('mmsync-st'),hadErr=false;
var serverLabel=server==='jp'?'JP':'INTERNATIONAL';
var regionEl=doc.getElementById('mmsync-region');if(regionEl)regionEl.textContent=serverLabel;
function addSection(label){var d=doc.createElement('div');d.style.cssText='display:flex;align-items:baseline;padding:8px 0 4px;margin-top:6px;border-bottom:1px solid #2e2e33';d.innerHTML='<span style="color:#b3a8ad;font-size:10px;font-weight:700;letter-spacing:.6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase">'+label+'</span>';stEl.appendChild(d);}
function addRow(id,label){var d=doc.createElement('div');d.style.cssText='display:flex;align-items:center;gap:10px;padding:3px 0';d.innerHTML='<span id="mmsi'+id+'" style="display:inline-block;width:14px;text-align:center;font-size:11px;color:#6f676c">\u00B7</span><span style="flex:1;color:#cfc6ca;font-size:13px">'+label+'</span><span id="mmst'+id+'" style="color:#6f676c;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.3px"></span>';stEl.appendChild(d);}
function setRow(id,ic,cl,tx){var ei=doc.getElementById('mmsi'+id),et=doc.getElementById('mmst'+id);if(ei){ei.textContent=ic;if(cl)ei.style.color=cl;}if(et){if(tx!==undefined)et.textContent=tx;if(cl)et.style.color=cl;}}
function okRow(id,tx){setRow(id,'\u2713','#4ade80',tx===undefined?'':tx);}
function failRow(id,tx){setRow(id,'\u2715','#f87171',tx||'\uC624\uB958');hadErr=true;}
function skipRow(id,tx){setRow(id,'\u2014','#6f676c',tx||'\uAC74\uB108\uB871');}
addSection('PROFILE');
addRow('hm','\uD648 \uB370\uC774\uD130');addRow('pd','\uD50C\uB808\uC774\uC5B4 \uB370\uC774\uD130');addRow('rc','\uCD5C\uADFC \uD50C\uB808\uC774');addRow('fc','\uCE5C\uAD6C\uCF54\uB4DC');
addSection('CLEAR CHART');
addRow('tb4','Re:MASTER');addRow('tb3','MASTER');addRow('tb2','EXPERT');addRow('tb1','ADVANCED');addRow('tb0','BASIC');
addSection('RATING');
addRow('rt','\uB808\uC774\uD305 \uB300\uC0C1 50\uACE1');
addSection('AREA');
addRow('mp','\uC9C0\uC5ED \uC9C4\uD589\uB3C4');addRow('em','\uC774\uBCA4\uD2B8 \uC9C0\uC5ED');

addSection('PLAY DETAIL');
addRow('dt','\uD50C\uB808\uC774 \uAE30\uB85D \uC0C1\uC138');
addSection('ASSETS');
addRow('av','\uC544\uBC14\uD0C0');addRow('jk','\uC7AC\uD0B7 \uC774\uBBF8\uC9C0');
addSection('SERVER');
addRow('sv','\uC11C\uBC84 \uC800\uC7A5');
var MAX_ATTEMPTS=3,REQUEST_TIMEOUT=15000,SYNC_UPLOAD_TIMEOUT=60000,PAGE_CONCURRENCY=3,DETAIL_CONCURRENCY=1,DETAIL_GAP=250,DETAIL_ATTEMPTS=4,BUSY_BACKOFF=2000;
function isErrorPage(t){return t.length<15000&&(t.indexOf('ERROR CODE')>-1||t.indexOf('NET\uFF0DError\uFF0D')>-1);}
function sleep(ms){return new Promise(function(res){setTimeout(res,ms);});}
function jitter(base){return base+Math.floor(Math.random()*Math.min(base,600));}
function fetchWithTimeout(url,opt,to){var ac=new AbortController(),timer=setTimeout(function(){ac.abort();},to||REQUEST_TIMEOUT);return fetch(url,Object.assign({},opt||{},{signal:ac.signal})).finally(function(){clearTimeout(timer);});}
async function fetchPage(id,url,optional){for(var attempt=1;attempt<=MAX_ATTEMPTS;attempt++){try{var r=await fetchWithTimeout(url);if(!r.ok)throw new Error('HTTP '+r.status);var t=await r.text();if(isErrorPage(t))throw new Error('DXNET_BUSY');var info=t.length>0?(t.length>1024?(t.length/1024).toFixed(1)+'KB':t.length+'B'):'\uC5C6\uC74C';okRow(id,info);console.log('[carol]',id,url,t.length);return t;}catch(e){if(attempt<MAX_ATTEMPTS){setRow(id,'\u21BB','#facc15','\uC7AC\uC2DC\uB3C4 '+attempt+'/'+(MAX_ATTEMPTS-1));await sleep(jitter((e&&e.message==='DXNET_BUSY'?BUSY_BACKOFF:400)*attempt));}else if(optional){skipRow(id,'\uC2E4\uD328');}else{failRow(id,e&&e.name==='AbortError'?'\uC2DC\uAC04 \uCD08\uACFC':'\uB124\uD2B8\uC6CC\uD06C \uC624\uB958');}}}return '';}
async function runPool(items,limit,worker){var idx=0,out=new Array(items.length);async function pump(){var i=idx++;if(i>=items.length)return;out[i]=await worker(items[i],i);return pump();}var runners=[];for(var k=0;k<Math.min(limit,items.length);k++)runners.push(pump());await Promise.all(runners);return out;}
var h='',p='',rd='',f='',tb4='',tb3='',tb2='',tb1='',tb0='',rt='',m='',em='',a='',js=[],dt=[],svText;
function parsePage(tx){return new DOMParser().parseFromString(tx,'text/html');}
function pageText(d){return d.body?d.body.textContent||'':'';}
function hasScoreBlocks(tx){var d=parsePage(tx);return d.querySelectorAll("[class*='music_'][class*='_score_back'],.music_name_block").length>0;}
function collectDetailRequests(tx){var d=parsePage(tx),reqs=[];Array.from(d.querySelectorAll(".p_10.t_l.f_0.v_b")).forEach(function(block){if(!block.querySelector(".playlog_achievement_newrecord"))return;var form=block.querySelector("form[action*='playlogDetail']");if(!form)return;var input=form.querySelector("input[name='idx']");var idx=input&&input.value?input.value.trim():"";var action=form.getAttribute("action")||"";if(!idx||!action)return;reqs.push({idx:idx,url:action+(action.indexOf("?")>-1?"&":"?")+"idx="+encodeURIComponent(idx)});});return reqs;}
function validateCore(){var cookieSeen=(doc.cookie||'').length>0,tx=cookieSeen?'\uC138\uC158 \uB9CC\uB8CC':'\uB85C\uADF8\uC778 \uD544\uC694',bad=[];try{var hd=parsePage(h),pd=parsePage(p),rdp=parsePage(rd),fd=parsePage(f),pt=pageText(pd),ft=pageText(fd),checks={hm:!!(hd.querySelector('.name_block')||hd.querySelector("img[src*='Icon']")),pd:/\u30D7\u30EC\u30A4\u56DE\u6570|play[^a-z0-9]*count/i.test(pt),rc:!!(rdp.querySelector("[class*='playlog'],[class*='record']")||/playlog|record/i.test(pageText(rdp))),fc:/[0-9]{13}/.test(ft.replace(/[^0-9]/g,'')),tb4:hasScoreBlocks(tb4),tb3:hasScoreBlocks(tb3),tb2:hasScoreBlocks(tb2),tb1:hasScoreBlocks(tb1),tb0:hasScoreBlocks(tb0)};Object.keys(checks).forEach(function(id){if(!checks[id])bad.push(id);});if(bad.length){bad.forEach(function(id){failRow(id,tx);});console.warn('[carol] login/session validation failed',{cookieVisible:cookieSeen,failed:bad,home:!!checks.hm,player:!!checks.pd,record:!!checks.rc,friend:!!checks.fc});return false;}if(!cookieSeen)console.warn('[carol] no visible document.cookie; DOM login markers passed (possibly HttpOnly session)');return true;}catch(e){['hm','pd','rc','fc','tb4','tb3','tb2','tb1','tb0'].forEach(function(id){failRow(id,tx);});console.warn('[carol] login/session validation error',{cookieVisible:cookieSeen,error:e&&e.message?e.message:String(e)});return false;}}
async function collectCore(){var _pl=[{i:'hm',u:'/maimai-mobile/home/',o:false},{i:'pd',u:'/maimai-mobile/playerData/',o:false},{i:'rc',u:'/maimai-mobile/record/',o:false},{i:'fc',u:'/maimai-mobile/friend/userFriendCode/',o:false},{i:'tb4',u:'/maimai-mobile/record/musicGenre/search/?genre=99&diff=4',o:true},{i:'tb3',u:'/maimai-mobile/record/musicGenre/search/?genre=99&diff=3',o:true},{i:'tb2',u:'/maimai-mobile/record/musicGenre/search/?genre=99&diff=2',o:true},{i:'tb1',u:'/maimai-mobile/record/musicGenre/search/?genre=99&diff=1',o:true},{i:'tb0',u:'/maimai-mobile/record/musicGenre/search/?genre=99&diff=0',o:true}];if(server==='intl')_pl.push({i:'rt',u:'/maimai-mobile/home/ratingTargetMusic/',o:true});_pl.push({i:'mp',u:'/maimai-mobile/map/',o:true},{i:'em',u:'/maimai-mobile/map/eventMap/',o:true});var _res=await runPool(_pl,PAGE_CONCURRENCY,function(_p){return fetchPage(_p.i,_p.u,_p.o);});var _r={};_pl.forEach(function(_p,_i){_r[_p.i]=_res[_i];});h=_r.hm;p=_r.pd;rd=_r.rc;f=_r.fc;tb4=_r.tb4;tb3=_r.tb3;tb2=_r.tb2;tb1=_r.tb1;tb0=_r.tb0;rt=_r.rt||'';m=_r.mp;em=_r.em;var required={hm:h,pd:p,rc:rd,fc:f,tb4:tb4,tb3:tb3,tb2:tb2,tb1:tb1,tb0:tb0};var missing=Object.keys(required).filter(function(id){return !required[id];});if(missing.length===0)return validateCore();console.warn('[carol] missing pages after retries',missing);missing.forEach(function(id){failRow(id,'\uC218\uC9D1 \uC2E4\uD328');});return false;}
async function collectDetails(){var reqs=collectDetailRequests(rd),out=[];var done=0;var _dres=await runPool(reqs,DETAIL_CONCURRENCY,async function(req,_ri){for(var attempt=1;attempt<=DETAIL_ATTEMPTS;attempt++){try{if(_ri>0||attempt>1)await sleep(jitter(DETAIL_GAP));var r=await fetchWithTimeout(req.url);if(!r.ok)throw new Error('HTTP '+r.status);var html=await r.text();if(isErrorPage(html))throw new Error('DXNET_BUSY');console.log('[carol] detail',req.idx,req.url,html.length);done++;setRow('dt','\u21BB','#facc15',done+'/'+reqs.length);return {idx:req.idx,html:html};}catch(e){var busy=e&&e.message==='DXNET_BUSY';if(attempt<DETAIL_ATTEMPTS)await sleep(jitter((busy?BUSY_BACKOFF:500)*attempt));else console.warn('[carol] detail fetch failed',req.idx,req.url,busy?'DX NET busy':(e&&e.message?e.message:String(e)));}}return null;});for(var _i=0;_i<_dres.length;_i++){if(_dres[_i])out.push(_dres[_i]);}return out;}
async function postSync(){var payload=JSON.stringify({server:server,h:h,p:p,r:rd,f:f,a:a,js:js,dt:dt,tb4:tb4,tb3:tb3,tb2:tb2,tb1:tb1,tb0:tb0,rt:rt,m:m,em:em}),body=payload,headers={'Content-Type':'application/json'};if(typeof CompressionStream!=='undefined'){try{body=await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();headers['Content-Encoding']='gzip';}catch(_ce){body=payload;}}for(var attempt=1;attempt<=MAX_ATTEMPTS;attempt++){try{var resp=await fetchWithTimeout(v+'/sync?code='+c,{method:'POST',headers:headers,body:body},SYNC_UPLOAD_TIMEOUT);if(resp.ok){svText=await resp.text();if(svText==='no_change'){skipRow('sv','\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC');}else{okRow('sv');}return true;}var errText=await resp.text();if(attempt<MAX_ATTEMPTS){setRow('sv','\u21BB','#facc15','\uC7AC\uC2DC\uB3C4 '+(attempt+1)+'/'+MAX_ATTEMPTS);await sleep(jitter(800*attempt));}else{failRow('sv','HTTP '+resp.status+(errText?': '+errText.slice(0,40):''));}}catch(e4){if(attempt<MAX_ATTEMPTS){setRow('sv','\u21BB','#facc15','\uC7AC\uC2DC\uB3C4 '+(attempt+1)+'/'+MAX_ATTEMPTS);await sleep(jitter(800*attempt));}else{failRow('sv',e4&&e4.name==='AbortError'?'\uC11C\uBC84 \uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC':'\uC5F0\uACB0 \uC2E4\uD328');}}}return false;}
var coreOk=await collectCore();if(coreOk&&server==='jp')okRow('rt','\uD074\uB9AC\uC5B4 \uCC28\uD2B8\uC5D0\uC11C \uC0B0\uCD9C');
if(coreOk){try{var pg={tb0:tb0,tb1:tb1,tb2:tb2,tb3:tb3,tb4:tb4,rt:rt};Object.keys(pg).forEach(function(k){var hx=pg[k];if(!hx){console.log('[carol]',k,'empty');return;}var d=new DOMParser().parseFromString(hx,'text/html');var n=d.querySelectorAll("[class*='music_'][class*='_score_back']").length;var ts=Array.from(d.querySelectorAll('.music_name_block')).map(function(e){return e.textContent.trim();}).slice(0,3);console.log('[carol]',k,'size='+hx.length,'records='+n,'sample='+JSON.stringify(ts));});}catch(e){console.log('[carol] diag error:',e.message);}
try{dt=await collectDetails();}catch(e2){console.warn('[carol] detail collection failed',e2&&e2.message?e2.message:String(e2));dt=[];}
try{var avatarMatch=h.match(/src="(https:[^"]*Icon[^"]*)"/);if(avatarMatch){var bl=await fetch(avatarMatch[1]).then(function(r){return r.blob();});a=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsDataURL(bl);});okRow('av');}else{skipRow('av','\uC774\uBBF8\uC9C0 \uC5C6\uC74C');}}catch(e1){failRow('av');}
try{okRow('jk','\uC2A4\uD0B4\uC5D0\uC11C \uC0DD\uB7B5');}catch(e3){failRow('jk');}
await postSync();}else{if(server==='jp')skipRow('rt','\uD074\uB9AC\uC5B4 \uC218\uC9D1 \uC2E4\uD328');skipRow('av','\uAC74\uB108\uB871');skipRow('jk','\uAC74\uB108\uB871');skipRow('sv','\uC218\uC9D1 \uC2E4\uD328');}
var fin=doc.createElement('div');fin.style.cssText='display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #2e2e33;font-weight:700;font-size:13px;letter-spacing:.2px';if(typeof svText!=='undefined'&&svText==='no_change'&&!hadErr){fin.style.color='#b3a8ad';fin.innerHTML='<span style="font-size:14px">\u2728</span><span>\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC</span>';stEl.appendChild(fin);setTimeout(function(){ov.style.transition='opacity .3s';ov.style.opacity='0';setTimeout(function(){ov.remove();},300);},2500);}else if(!hadErr){fin.style.color='#4ade80';fin.innerHTML='<span style="font-size:14px">\u2713</span><span>\uB3D9\uAE30\uD654 \uC644\uB8CC</span>';stEl.appendChild(fin);setTimeout(function(){ov.style.transition='opacity .3s';ov.style.opacity='0';setTimeout(function(){ov.remove();},300);},2500);}else{fin.style.color='#f87171';fin.innerHTML='<span style="font-size:14px">\u26A0</span><span>\uC77C\uBD80 \uD56D\uBAA9 \uC2E4\uD328</span>';stEl.appendChild(fin);}
})()`;
