let baseUrl = "";
export function setBaseUrl(url: string): void { baseUrl = url; }
export function getBaseUrl(port: number): string { return baseUrl || `http://localhost:${port}`; }

export interface BookmarkletPreset {
  id: string;
  label: string;
  description: string;
  code: string;
}

export const BOOKMARKLET_PRESETS: BookmarkletPreset[] = [{
  id: "maishift",
  label: "maishift",
  description: "대부분 사용자가 함께 쓰는 maishift 북마클릿",
  code: "javascript:(function(i){var t=i.createElement(\"script\");t.src=\"https://maimai.shiftpsh.com/bookmarklet.js?v=\"+Math.floor(Date.now()/1e5),i.body.append(t)})(document);",
}];

export function getBookmarkletPresets(ids: string[]): Array<{ label: string; code: string }> {
  const enabled = new Set(ids);
  return BOOKMARKLET_PRESETS.filter((preset) => enabled.has(preset.id)).map((preset) => ({ label: preset.label, code: preset.code }));
}

export function buildBookmarklet(token: string, port: number): string {
  const server = getBaseUrl(port);
  return `javascript:(function(d){var s=d.createElement('script');s.src='${server}/bookmarklet.js?code=${token}&v='+Math.floor(Date.now()/1e5);d.body.append(s)})(document)`;
}

export function buildBookmarkletJs(extras: Array<{ label: string; code: string }>): string {
  if (extras.length === 0) return bookmarkletJs;
  const extrasJson = JSON.stringify(extras);
  const opensShiftWindow = extras.some((bookmarklet) => bookmarklet.code.includes("maimai.shiftpsh.com/bookmarklet.js"));
  const shiftWindowPrelude = opensShiftWindow
    ? `var _carolShiftWin=null;try{_carolShiftWin=window.open('https://maimai.shiftpsh.com/upload','maimai-record');}catch(_shiftOpen){}`
    : "";
  const injection = `setTimeout(function(){var _exbms=${extrasJson};if(_exbms.length>0){addSection('EXTRA');_exbms.forEach(function(bm,i){var _id='ex'+i;var _lbl=bm.label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');addRow(_id,_lbl);function _fail(tx){setRow(_id,'\\u2715','#f87171',tx||'실패');}function _ok(tx){okRow(_id,tx||'완료');}try{var _done=false,_seen=false,_isShift=bm.code.indexOf('maimai.shiftpsh.com/bookmarklet.js')>=0;function _timeout(){if(!_done){_done=true;(_seen?_fail('응답 없음'):_fail('실행 오류'));}}var _timer=setTimeout(_timeout,30000);function _bump(){clearTimeout(_timer);_timer=setTimeout(_timeout,30000);}function _finish(fn,tx){if(_done)return;_done=true;clearTimeout(_timer);if(_isShift&&_wo)window.open=_wo;fn(tx);}function _watch(n){_seen=true;if(n&&n.tagName&&n.tagName.toLowerCase()==='script'){n.addEventListener('load',function(){if(_isShift){setRow(_id,'\\u21bb','#facc15','실행 중');}else{_finish(_ok,'로드됨');}},{once:true});n.addEventListener('error',function(){_finish(_fail,'로드 실패');},{once:true});}}var _ac=doc.body.appendChild,_ap=doc.body.append,_wo=window.open;doc.body.appendChild=function(n){_watch(n);return _ac.call(this,n);};doc.body.append=function(){for(var _ai=0;_ai<arguments.length;_ai++)_watch(arguments[_ai]);return _ap.apply(this,arguments);};if(_isShift){window.open=function(url,name,features){if(String(url).indexOf('https://maimai.shiftpsh.com/upload')===0&&name==='maimai-record'){if(!_carolShiftWin||_carolShiftWin.closed){_finish(_fail,'팝업 차단');return null;}return{postMessage:function(msg,origin){if(!_done){if(msg&&msg.topic==='complete'){_finish(_ok,'완료');}else{_bump();setRow(_id,'\\u21bb','#facc15','실행 중');}}return _carolShiftWin.postMessage(msg,origin);}};}return _wo.apply(this,arguments);};}try{var _c=bm.code.replace(/^javascript:/,'');(0,eval)(_c);if(!_seen&&!_isShift)_finish(_ok,'완료');}finally{doc.body.appendChild=_ac;doc.body.append=_ap;if(!_isShift)window.open=_wo;}}catch(_e){console.warn('[carol] extra:',bm.label,_e);_fail('실패');}});}},0);`;
  const marker = "})()";
  const source = opensShiftWindow ? bookmarkletJs.replace("var old=doc.getElementById('mm-sync-ov');", `${shiftWindowPrelude}var old=doc.getElementById('mm-sync-ov');`) : bookmarkletJs;
  const pos = source.lastIndexOf(marker);
  if (pos === -1) return bookmarkletJs;
  return source.slice(0, pos) + injection + source.slice(pos);
}

export const bookmarkletJs = `(async()=>{
var h=location.hostname;if(h!=='maimaidx.jp'&&h!=='maimaidx-eng.com'){alert('maimai DX NET 페이지에서 실행해주세요.\\nhttps://maimaidx-eng.com/maimai-mobile/');return;}
var doc=document,cur=doc.currentScript,s=cur.src,u=new URL(s),c=u.searchParams.get('code')||'',v=u.origin;if(cur&&cur.parentNode)cur.parentNode.removeChild(cur);try{if(performance&&performance.clearResourceTimings)performance.clearResourceTimings();}catch(_pe){}
var old=doc.getElementById('mm-sync-ov');if(old)old.remove();
var ov=doc.createElement('div');ov.id='mm-sync-ov';
ov.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:16px 18px;font:13px Inter,system-ui,-apple-system,sans-serif;color:#cccccc;min-width:300px;max-width:340px;max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 0 1px rgba(147,51,234,.12)';
ov.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:4px;border-bottom:1px solid #1e1e1e"><div style="display:flex;align-items:baseline"><span style="color:#fff;font-size:14px;font-weight:800;letter-spacing:.2px">carol</span><span style="color:#9333ea;font-size:14px;font-weight:800;letter-spacing:.2px">bot</span><span style="color:#666;font-size:10px;font-weight:600;letter-spacing:.6px;margin-left:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase">SYNC</span></div><button id="mmsync-x" style="background:none;border:none;color:#888;font-size:14px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px;transition:background .15s,color .15s">\u2715</button></div><div id="mmsync-st"></div>';
doc.body.appendChild(ov);
var xBtn=doc.getElementById('mmsync-x');
xBtn.onmouseenter=function(){xBtn.style.color='#fff';xBtn.style.background='#252525';};
xBtn.onmouseleave=function(){xBtn.style.color='#888';xBtn.style.background='none';};
xBtn.onclick=function(){ov.remove();};
var stEl=doc.getElementById('mmsync-st'),hadErr=false;
function addSection(label){var d=doc.createElement('div');d.style.cssText='display:flex;align-items:baseline;padding:8px 0 4px;margin-top:6px;border-bottom:1px solid #202020';d.innerHTML='<span style="color:#aaa;font-size:10px;font-weight:700;letter-spacing:.6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase">'+label+'</span>';stEl.appendChild(d);}
function addRow(id,label){var d=doc.createElement('div');d.style.cssText='display:flex;align-items:center;gap:10px;padding:3px 0';d.innerHTML='<span id="mmsi'+id+'" style="display:inline-block;width:14px;text-align:center;font-size:11px;color:#666">\u00B7</span><span style="flex:1;color:#cccccc;font-size:13px">'+label+'</span><span id="mmst'+id+'" style="color:#666;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.3px"></span>';stEl.appendChild(d);}
function setRow(id,ic,cl,tx){var ei=doc.getElementById('mmsi'+id),et=doc.getElementById('mmst'+id);if(ei){ei.textContent=ic;if(cl)ei.style.color=cl;}if(et){if(tx!==undefined)et.textContent=tx;if(cl)et.style.color=cl;}}
function okRow(id,tx){setRow(id,'\u2713','#4ade80',tx===undefined?'':tx);}
function failRow(id,tx){setRow(id,'\u2715','#f87171',tx||'\uC624\uB958');hadErr=true;}
function skipRow(id,tx){setRow(id,'\u2014','#666',tx||'\uAC74\uB108\uB871');}
addSection('PROFILE');
addRow('hm','\uD648 \uB370\uC774\uD130');addRow('pd','\uD50C\uB808\uC774\uC5B4 \uB370\uC774\uD130');addRow('rc','\uCD5C\uADFC \uD50C\uB808\uC774');addRow('fc','\uCE5C\uAD6C\uCF54\uB4DC');
addSection('CLEAR CHART');
addRow('tb4','Re:MASTER');addRow('tb3','MASTER');addRow('tb2','EXPERT');addRow('tb1','ADVANCED');addRow('tb0','BASIC');
addSection('ASSETS');
addRow('rt','\uB808\uC774\uD305 \uACE1');addRow('av','\uC544\uBC14\uD0C0');addRow('jk','\uC7AC\uD0B7 \uC774\uBBF8\uC9C0');
addSection('SERVER');
addRow('sv','\uC11C\uBC84 \uC800\uC7A5');
var MAX_ATTEMPTS=3;
function sleep(ms){return new Promise(function(res){setTimeout(res,ms);});}
function xf(id,url,opt,attempt){return fetch(url).then(function(r){return r.text();}).then(function(t){var info=t.length>0?(t.length>1024?(t.length/1024).toFixed(1)+'KB':t.length+'B'):'\uC5C6\uC74C';okRow(id,info);return t;}).catch(function(){if(attempt<MAX_ATTEMPTS){setRow(id,'\u21BB','#facc15','\uC7AC\uC2DC\uB3C4');}else if(opt){skipRow(id,'\uC2E4\uD328');}else{failRow(id,'\uB124\uD2B8\uC6CC\uD06C \uC624\uB958');}return '';});}
var h='',p='',rd='',f='',tb4='',tb3='',tb2='',tb1='',tb0='',rt='',a='',js=[],svText;
async function collectCore(){for(var attempt=1;attempt<=MAX_ATTEMPTS;attempt++){if(attempt>1){setRow('sv','\u21BB','#facc15','\uC7AC\uC2DC\uB3C4 '+attempt+'/'+MAX_ATTEMPTS);}var rs=await Promise.all([xf('hm','/maimai-mobile/home/',false,attempt),xf('pd','/maimai-mobile/playerData/',false,attempt),xf('rc','/maimai-mobile/record/',false,attempt),xf('fc','/maimai-mobile/friend/userFriendCode/',false,attempt),xf('tb4','/maimai-mobile/record/musicGenre/search/?genre=99&diff=4',true,attempt),xf('tb3','/maimai-mobile/record/musicGenre/search/?genre=99&diff=3',true,attempt),xf('tb2','/maimai-mobile/record/musicGenre/search/?genre=99&diff=2',true,attempt),xf('tb1','/maimai-mobile/record/musicGenre/search/?genre=99&diff=1',true,attempt),xf('tb0','/maimai-mobile/record/musicGenre/search/?genre=99&diff=0',true,attempt),xf('rt','/maimai-mobile/home/ratingTargetMusic/',true,attempt)]);h=rs[0];p=rs[1];rd=rs[2];f=rs[3];tb4=rs[4];tb3=rs[5];tb2=rs[6];tb1=rs[7];tb0=rs[8];rt=rs[9];var required={hm:h,pd:p,rc:rd,fc:f,tb4:tb4,tb3:tb3,tb2:tb2,tb1:tb1,tb0:tb0};var missing=Object.keys(required).filter(function(id){return !required[id];});if(missing.length===0)return true;console.warn('[carol] missing pages attempt',attempt,missing);if(attempt<MAX_ATTEMPTS){missing.forEach(function(id){setRow(id,'\u21BB','#facc15','\uC7AC\uC2DC\uB3C4');});await sleep(500*attempt);}else{missing.forEach(function(id){failRow(id,'\uC218\uC9D1 \uC2E4\uD328');});}}return false;}
async function postSync(){for(var attempt=1;attempt<=MAX_ATTEMPTS;attempt++){try{var resp=await fetch(v+'/sync?code='+c,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({h:h,p:p,r:rd,f:f,a:a,js:js,tb4:tb4,tb3:tb3,tb2:tb2,tb1:tb1,tb0:tb0,rt:rt})});if(resp.ok){svText=await resp.text();if(svText==='no_change'){skipRow('sv','\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC');}else{okRow('sv');}return true;}if(attempt<MAX_ATTEMPTS){setRow('sv','\u21BB','#facc15','\uC7AC\uC2DC\uB3C4 '+(attempt+1)+'/'+MAX_ATTEMPTS);await sleep(500*attempt);}else{failRow('sv','HTTP '+resp.status);}}catch(e4){if(attempt<MAX_ATTEMPTS){setRow('sv','\u21BB','#facc15','\uC7AC\uC2DC\uB3C4 '+(attempt+1)+'/'+MAX_ATTEMPTS);await sleep(500*attempt);}else{failRow('sv','\uC5F0\uACB0 \uC2E4\uD328');}}}return false;}
var coreOk=await collectCore();
if(coreOk){try{var pg={tb0:tb0,tb1:tb1,tb2:tb2,tb3:tb3,tb4:tb4,rt:rt};Object.keys(pg).forEach(function(k){var hx=pg[k];if(!hx){console.log('[carol]',k,'empty');return;}var d=new DOMParser().parseFromString(hx,'text/html');var n=d.querySelectorAll("[class*='music_'][class*='_score_back']").length;var ts=Array.from(d.querySelectorAll('.music_name_block')).map(function(e){return e.textContent.trim();}).slice(0,3);console.log('[carol]',k,'size='+hx.length,'records='+n,'sample='+JSON.stringify(ts));});}catch(e){console.log('[carol] diag error:',e.message);}
try{var m=h.match(/src="(https:[^"]*Icon[^"]*)"/);if(m){var bl=await fetch(m[1]).then(function(r){return r.blob();});a=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsDataURL(bl);});okRow('av');}else{skipRow('av','\uC774\uBBF8\uC9C0 \uC5C6\uC74C');}}catch(e1){failRow('av');}
try{var dp=new DOMParser(),d2=dp.parseFromString(rd,'text/html'),imgs=d2.querySelectorAll('.music_img'),cnt=Math.min(imgs.length,5);for(var i=0;i<cnt;i++){try{var src=imgs[i].src;if(src){var bl2=await fetch(src).then(function(r){return r.blob();});var b64=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsDataURL(bl2);});js.push({url:src,data:b64});}}catch(e2){}}okRow('jk',cnt+'\uAC1C');}catch(e3){failRow('jk');}
await postSync();}else{skipRow('av','\uAC74\uB108\uB871');skipRow('jk','\uAC74\uB108\uB871');skipRow('sv','\uC218\uC9D1 \uC2E4\uD328');}
var fin=doc.createElement('div');fin.style.cssText='display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #1e1e1e;font-weight:700;font-size:13px;letter-spacing:.2px';if(typeof svText!=='undefined'&&svText==='no_change'&&!hadErr){fin.style.color='#aaa';fin.innerHTML='<span style="font-size:14px">\u2728</span><span>\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC</span>';stEl.appendChild(fin);setTimeout(function(){ov.style.transition='opacity .3s';ov.style.opacity='0';setTimeout(function(){ov.remove();},300);},2500);}else if(!hadErr){fin.style.color='#4ade80';fin.innerHTML='<span style="font-size:14px">\u2713</span><span>\uB3D9\uAE30\uD654 \uC644\uB8CC</span>';stEl.appendChild(fin);setTimeout(function(){ov.style.transition='opacity .3s';ov.style.opacity='0';setTimeout(function(){ov.remove();},300);},2500);}else{fin.style.color='#f87171';fin.innerHTML='<span style="font-size:14px">\u26A0</span><span>\uC77C\uBD80 \uD56D\uBAA9 \uC2E4\uD328</span>';stEl.appendChild(fin);}
})()`;
