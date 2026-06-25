let baseUrl = "";
export function setBaseUrl(url: string): void { baseUrl = url; }
export function getBaseUrl(port: number): string { return baseUrl || `http://localhost:${port}`; }

export function buildBookmarklet(token: string, port: number): string {
  const server = getBaseUrl(port);
  return `javascript:(function(d){var s=d.createElement('script');s.src='${server}/bookmarklet.js?code=${token}&v='+Math.floor(Date.now()/1e5);d.body.append(s)})(document)`;
}

export const bookmarkletJs = `(async()=>{
var doc=document,s=doc.currentScript.src,u=new URL(s),c=u.searchParams.get('code')||'',v=u.origin;
var old=doc.getElementById('mm-sync-ov');if(old)old.remove();
var ov=doc.createElement('div');ov.id='mm-sync-ov';
ov.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:18px 20px;font:13px Inter,system-ui,-apple-system,sans-serif;color:#aaa;min-width:280px;max-width:340px;box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 0 1px rgba(147,51,234,.12)';
ov.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;margin-bottom:10px;border-bottom:1px solid #2a2a2a"><b style="color:#fff;font-size:14px;font-weight:800;letter-spacing:.3px">\\uD83C\\uDFB5 carol \\uB3D9\\uAE30\\uD654</b><button id="mmsync-x" style="background:none;border:none;color:#888;font-size:14px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px">\\u2715</button></div><div id="mmsync-st"></div>';
doc.body.appendChild(ov);
var xBtn=doc.getElementById('mmsync-x');
xBtn.onmouseenter=function(){xBtn.style.color='#fff';xBtn.style.background='#252525';};
xBtn.onmouseleave=function(){xBtn.style.color='#888';xBtn.style.background='none';};
xBtn.onclick=function(){ov.remove();};
var stEl=doc.getElementById('mmsync-st'),hadErr=false;
function addRow(id,label){var d=doc.createElement('div');d.style.cssText='display:flex;align-items:center;gap:10px;padding:3px 0';d.innerHTML='<span id="mmsi'+id+'" style="display:inline-block;width:18px;text-align:center;font-size:13px">\\u23F3</span><span style="flex:1;color:#aaa;font-size:13px">'+label+'</span><span id="mmst'+id+'" style="color:#888;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace"></span>';stEl.appendChild(d);}
function setRow(id,ic,cl,tx){var ei=doc.getElementById('mmsi'+id),et=doc.getElementById('mmst'+id);if(ei)ei.textContent=ic;if(et){if(tx!==undefined)et.textContent=tx;if(cl)et.style.color=cl;}}
function okRow(id,tx){setRow(id,'\\u2705','#4caf50',tx===undefined?'':tx);}
function failRow(id,tx){setRow(id,'\\u274C','#e57373',tx||'\\uC624\\uB958');hadErr=true;}
function skipRow(id,tx){setRow(id,'\\u23ED','#888',tx||'\\uAC74\\uB108\\uB871');}
addRow('hm','\uD648 \uB370\uC774\uD130');addRow('pd','\uD50C\uB808\uC774\uC5B4 \uB370\uC774\uD130');addRow('rc','\uCD5C\uADFC \uD50C\uB808\uC774');addRow('fc','\uCE5C\uAD6C\uCF54\uB4DC');addRow('tb4','\uD074\uB9AC\uC5B4 (Re:MASTER)');addRow('tb3','\uD074\uB9AC\uC5B4 (MASTER)');addRow('tb2','\uD074\uB9AC\uC5B4 (EXPERT)');addRow('tb1','\uD074\uB9AC\uC5B4 (ADVANCED)');addRow('tb0','\uD074\uB9AC\uC5B4 (BASIC)');addRow('rt','\uB808\uC774\uD305 \uACE1');addRow('av','\uC544\uBC14\uD0C0');addRow('jk','\uC7AC\uD0B7 \uC774\uBBF8\uC9C0');addRow('sv','\uC11C\uBC84 \uC800\uC7A5');
function xf(id,url,opt){return fetch(url).then(function(r){return r.text();}).then(function(t){var info=t.length>0?(t.length>1024?(t.length/1024).toFixed(1)+'KB':t.length+'B'):'\uC5C6\uC74C';okRow(id,info);return t;}).catch(function(){if(opt){skipRow(id,'\uC2E4\uD328');}else{failRow(id,'\uB124\uD2B8\uC6CC\uD06C \uC624\uB958');}return '';});}
var rs=await Promise.all([xf('hm','/maimai-mobile/home/'),xf('pd','/maimai-mobile/playerData/'),xf('rc','/maimai-mobile/record/'),xf('fc','/maimai-mobile/friend/userFriendCode/'),xf('tb4','/maimai-mobile/record/musicGenre/search/?genre=99&diff=4',true),xf('tb3','/maimai-mobile/record/musicGenre/search/?genre=99&diff=3',true),xf('tb2','/maimai-mobile/record/musicGenre/search/?genre=99&diff=2',true),xf('tb1','/maimai-mobile/record/musicGenre/search/?genre=99&diff=1',true),xf('tb0','/maimai-mobile/record/musicGenre/search/?genre=99&diff=0',true),xf('rt','/maimai-mobile/home/ratingTargetMusic/',true)]);
var h=rs[0],p=rs[1],rd=rs[2],f=rs[3],tb4=rs[4],tb3=rs[5],tb2=rs[6],tb1=rs[7],tb0=rs[8],rt=rs[9],a='',js=[];
try{var pg={tb0:tb0,tb1:tb1,tb2:tb2,tb3:tb3,tb4:tb4,rt:rt};Object.keys(pg).forEach(function(k){var hx=pg[k];if(!hx){console.log('[carol]',k,'empty');return;}var d=new DOMParser().parseFromString(hx,'text/html');var n=d.querySelectorAll("[class*='music_'][class*='_score_back']").length;var ts=Array.from(d.querySelectorAll('.music_name_block')).map(function(e){return e.textContent.trim();}).slice(0,3);console.log('[carol]',k,'size='+hx.length,'records='+n,'sample='+JSON.stringify(ts));});}catch(e){console.log('[carol] diag error:',e.message);}
try{var m=h.match(/src="(https:[^"]*Icon[^"]*)"/);if(m){var bl=await fetch(m[1]).then(function(r){return r.blob();});a=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsDataURL(bl);});okRow('av');}else{skipRow('av','\\uC774\\uBBF8\\uC9C0 \\uC5C6\\uC74C');}}catch(e1){failRow('av');}
try{var dp=new DOMParser(),d2=dp.parseFromString(rd,'text/html'),imgs=d2.querySelectorAll('.music_img'),cnt=Math.min(imgs.length,5);for(var i=0;i<cnt;i++){try{var src=imgs[i].src;if(src){var bl2=await fetch(src).then(function(r){return r.blob();});var b64=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsDataURL(bl2);});js.push({url:src,data:b64});}}catch(e2){}}okRow('jk',cnt+'\\uAC1C');}catch(e3){failRow('jk');}
try{var resp=await fetch(v+'/sync?code='+c,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({h:h,p:p,r:rd,f:f,a:a,js:js,tb4:tb4,tb3:tb3,tb2:tb2,tb1:tb1,tb0:tb0,rt:rt})});if(resp.ok){var svText=await resp.text();if(svText==='no_change'){skipRow('sv','\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC');}else{okRow('sv');}}else{failRow('sv','HTTP '+resp.status);}}catch(e4){failRow('sv','\uC5F0\uACB0 \uC2E4\uD328');}
var fin=doc.createElement('div');fin.style.cssText='margin-top:12px;padding-top:12px;border-top:1px solid #2a2a2a;font-weight:700;font-size:13px;letter-spacing:.2px';if(typeof svText!=='undefined'&&svText==='no_change'&&!hadErr){fin.style.color='#aaa';fin.textContent='\\u2728 \\uC774\\uBBF8 \\uCD5C\\uC2E0 \\uC0C1\\uD0DC';stEl.appendChild(fin);setTimeout(function(){ov.style.transition='opacity .3s';ov.style.opacity='0';setTimeout(function(){ov.remove();},300);},2500);}else if(!hadErr){fin.style.color='#4caf50';fin.textContent='\\u2705 \\uB3D9\\uAE30\\uD654 \\uC644\\uB8CC!';stEl.appendChild(fin);setTimeout(function(){ov.style.transition='opacity .3s';ov.style.opacity='0';setTimeout(function(){ov.remove();},300);},2500);}else{fin.style.color='#e57373';fin.textContent='\\u26A0\\uFE0F \\uC77C\\uBD80 \\uD56D\\uBAA9 \\uC2E4\\uD328';stEl.appendChild(fin);}
})()`;
