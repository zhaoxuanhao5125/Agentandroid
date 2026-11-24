/* Local presentation only. The host owns storage, networking, permissions and actions. */
(() => {
'use strict';
const $=id=>document.getElementById(id), list=s=>Array.from(document.querySelectorAll(s));
const paths={device:'M8 2.5h8a1.7 1.7 0 0 1 1.7 1.7v15.6a1.7 1.7 0 0 1-1.7 1.7H8a1.7 1.7 0 0 1-1.7-1.7V4.2A1.7 1.7 0 0 1 8 2.5z M10 5h4m-2 13.5h.01',angle:'m9 5 7 7-7 7',chevron:'m6 9 6 6 6-6',terminal:'M4 5h16v14H4z M7.5 9l2.7 2.7-2.7 2.7m5.5 0h3.5',layers:'m12 3 9 5-9 5-9-5z M3 12l9 5 9-5M3 16l9 5 9-5',flight:'m3 11 17-7-6.5 16-3.2-7.3L3 11z M10.3 12.7l5.9-5.4',app:'M4 8V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-3 M8 15l7-7m-6 0h6v6',upRight:'M6 18 18 6M7 6h11v11',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M3.5 10h17m-17 4h17 M12 3c4 4.1 4 13.9 0 18-4-4.1-4-13.9 0-18z',deck:'M3 13.5 12 4l9 9.5 M5.5 11.5V20h5v-6h3v6h5v-8.5',sliders:'M4 7h5m4 0h7M4 17h10m4 0h2 M13 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M18 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',search:'M16.5 10.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M15.2 15.2 21 21',import:'M12 3v11m-4-4 4 4 4-4 M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',cpu:'M6 6h12v12H6z M9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M9 9h6v6H9z',pulse:'M2 13h4l3-7 4 13 3-8 2 2h4',check:'m4.5 12 5 5L20 6.5',hand:'M7 14 6 7c0-1.8 2.5-2 2.8-.3l.9 4.1-.4-7c0-1.6 2.4-1.8 2.6 0l.7 7.1.4-6c.2-1.7 2.6-1.5 2.6.2l-.1 6.3.8-4.3c.4-1.6 2.6-1.1 2.3.6l-.6 7.7c-.4 3.4-2.1 5.4-5.6 5.6-2.8.1-4.5-1.4-6-3.4L3.5 14c-1-1.7 1-2.9 2.2-1.6L7 14z',overlay:'M4 5h15v11H4z M8 19h13V9 M8 9h6v3H8z',wave:'M3 12c3-9 6-9 9 0s6 9 9 0',x:'m6 6 12 12M18 6 6 18',log:'M3 6h18M3 12h12M3 18h7m6-1 2 2 3-4',pen:'m5 15 11-11 4 4L9 19l-5 1z M14 6l4 4',plan:'M4 5h3v3H4z M11 6.5h9M4 11h3v3H4z M11 12.5h9M4 17h3v3H4z M11 18.5h6',stop:'M6 6h12v12H6z',compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M15.5 8.5l-2 5-5 2 2-5z',pin:'M14 3l7 7-3 1-3 5 1 4-2 2-4-4-5 5-1-1 5-5-4-4 2-2 4 1 5-3z'};
function icon(k){const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('class','ic');s.setAttribute('aria-hidden','true');s.setAttribute('focusable','false');p.setAttribute('d',paths[k]||paths.compass);s.appendChild(p);return s;}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
function symbol(k,cls){const i=el('i',cls);i.appendChild(icon(k));return i;}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild);}
function text(id,t){$(id).textContent=t;}
function on(id,fn){$(id).addEventListener('click',fn);}
list('[data-icon]').forEach(e=>e.appendChild(icon(e.dataset.icon)));
let state=null,page='deck',previousPage='deck',skillId='',category='',pane='model',sheet=null,lastFocus=null,lastAction='',noticeTimer=0,uiModel='',uiSearch='',customSelection={model:false,search:false},pending=null;
const FAV_KEY='pilot.favorites.v1',USE_KEY='pilot.skillUsage.v1';let favs=loadFavs();
function loadUsage(){try{const o=JSON.parse(localStorage.getItem(USE_KEY)||'{}');if(!o||typeof o!=='object'||Array.isArray(o))return {};const out={};Object.keys(o).forEach(k=>{const n=Number(o[k]);if(Number.isFinite(n)&&n>0)out[k]=Math.min(9999,Math.floor(n));});return out;}catch(_){return {};}}
function saveUsage(){try{localStorage.setItem(USE_KEY,JSON.stringify(usage));}catch(_){}}
let usage=loadUsage();
function noteSkillUse(id){if(!id)return;usage[id]=(usage[id]||0)+1;if(usage[id]>9999)usage[id]=9999;saveUsage();}
function loadFavs(){try{const a=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');return new Set(Array.isArray(a)?a.filter(x=>typeof x==='string'):[]);}catch(_){return new Set();}}
function saveFavs(){try{localStorage.setItem(FAV_KEY,JSON.stringify(Array.from(favs)));}catch(_){}}
function toggleFav(id){if(favs.has(id))favs.delete(id);else favs.add(id);saveFavs();renderSkills();}
const scrolls={deck:0,skills:0,links:0,device:0}, drafts=new Map(),globalEdits=new Map();
// Conversational deck: ask / plan / crafts. Conversations are stored locally in the browser
// (WebView app storage) — never uploaded, never sent to the model except as chat context.
// Bound each transcript: DOM size and the per-invoke payload both stay limited.
// Bridge rejects a single invoke over 48000 chars: keep text+history+overhead safely below that.
const CHAT_MAX=60, CHAT_SEND_TURNS=12, CHAT_TEXT_MAX=12000, CHAT_HISTORY_BUDGET=24000;
const SESS_KEY='pilot.sessions.v2', SESS_MAX=30;
let chatMode='ask',messages=[],chatBusy=false,sessions=[],activeId='',persistTimer=0,sessionFilterText='';
// An in-flight chat belongs to the session that sent it. If the user switches sessions
// before the answer arrives, route the reply back to its owner instead of the active view.
let chatOwnerSession='';
function newSession(name){return {id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:name||'新对话',mode:'ask',messages:[],ts:Date.now(),pinned:false};}
function sortSessions(arr){return arr.sort((a,b)=>((b.pinned?1:0)-(a.pinned?1:0))||(b.ts-a.ts));}
function active(){return sessions.find(s=>s.id===activeId)||null;}
function trimMessages(){if(messages.length>CHAT_MAX){const pinned=messages[0].welcome?messages.slice(0,1):[];messages=pinned.concat(messages.slice(-CHAT_MAX));}}
function persist(){
  const a=active();if(!a)return;
  a.messages=messages;a.mode=chatMode;a.ts=Date.now();
  try{
    // Cap stored history to the newest sessions so localStorage cannot grow without bound.
    // sortSessions puts pinned chats first, so truncation never drops a fixed chat.
    const keep=sortSessions(sessions.slice()).slice(0,SESS_MAX)
      .map(s=>({id:s.id,name:s.name,mode:s.mode,ts:s.ts,pinned:!!s.pinned,messages:(s.messages||[]).slice(-CHAT_MAX)}));
    localStorage.setItem(SESS_KEY,JSON.stringify(keep));
  }catch(_){/* storage unavailable or full: keep working in memory */}
}
function persistSoon(){clearTimeout(persistTimer);persistTimer=setTimeout(persist,250);}
function loadSessions(){
  try{
    const raw=localStorage.getItem(SESS_KEY);let data=raw?JSON.parse(raw):null;
    if(data&&!Array.isArray(data))data=null;
    sessions=Array.isArray(data)?data.filter(s=>s&&typeof s==='object'&&typeof s.id==='string'&&Array.isArray(s.messages)).map(s=>({
      id:s.id,name:typeof s.name==='string'&&s.name?s.name.slice(0,40):'新对话',
      mode:['ask','plan','crafts'].includes(s.mode)?s.mode:'ask',ts:Number.isFinite(s.ts)?s.ts:Date.now(),pinned:s.pinned===true,
      messages:s.messages.filter(m=>m&&typeof m==='object'&&['user','assistant'].includes(m.role)).slice(-CHAT_MAX).map(m=>({
        role:m.role,text:typeof m.text==='string'?m.text.slice(0,CHAT_TEXT_MAX):'',
        ...(['ask','plan','crafts'].includes(m.mode)?{mode:m.mode}:{}),...(m.plan&&typeof m.plan==='object'?{plan:m.plan}:{}),
        ...(m.executed?{executed:true}:{}),...(Array.isArray(m.trace)?{trace:m.trace.slice(-40).filter(x=>typeof x==='string')}:{}),
        ...(m.stopped?{stopped:true}:{}),...(typeof m.error==='string'?{error:m.error.slice(0,300)}:{})
      }))
    })):[];
  }catch(_){sessions=[];}
  sortSessions(sessions);
  if(!sessions.length)sessions.push(newSession());
  activeId=sessions[0].id;
  chatMode=sessions[0].mode;messages=sessions[0].messages;
}
// Resolve the message array that owns the in-flight chat. If the owner session was
// deleted while the request was away, return null and let the reply be dropped safely.
function ownerMessages(){return (!chatOwnerSession||chatOwnerSession===activeId)?messages:(sessions.find(x=>x.id===chatOwnerSession)||{}).messages||null;}
const bridge=()=>window.Pilot && typeof window.Pilot.invoke==='function';
function toast(t,error=false){if(!t)return;const a=$('toast');a.textContent=t;a.dataset.error=String(error);a.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>a.hidden=true,error?5500:3200);}
function invoke(op,args={}){if(!bridge()){if(op!=='state')toast('请在 Android 应用中使用此功能。',true);return false;}try{if(op!=='state')lastAction=op;window.Pilot.invoke(JSON.stringify(Object.assign({op},args)));return true;}catch(_){toast('无法连接到 Android 主机，请返回应用重试。',true);return false;}}
function busy(){return !!(state&&(state.busy||state.active));}
function navigate(p,options={}){if(!['deck','skills','links','device'].includes(p))return;const old=page;if(old!==p){scrolls[old]=window.scrollY;previousPage=old;page=p;}Array.from($('main').querySelectorAll('.screen')).forEach(s=>{s.hidden=s.id!=='screen-'+p;s.classList.toggle('screen-enter',!s.hidden&&old!==p);});list('.nav-inner button').forEach(b=>{if(b.dataset.page===p)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(p==='device')$('device-link').setAttribute('aria-current','page');else $('device-link').removeAttribute('aria-current');document.title='pilot one thing · '+({deck:'指挥台',skills:'技能库',links:'连接',device:'设备'}[p]);if(p==='skills')renderSkills();if(p==='links')renderSettings();if(old!==p){$('main').focus({preventScroll:true});window.scrollTo({top:options.top?0:scrolls[p]||0,behavior:'auto'});}window.dispatchEvent(new Event('pilot-visibility'));}
list('[data-page]').forEach(b=>on(b.id||(b.id='nav-'+b.dataset.page),()=>navigate(b.dataset.page)));on('brand',()=>navigate('deck',{top:true}));on('device-link',()=>navigate('device',{top:true}));on('choose-skill',()=>navigate('skills',{top:true}));
function empty(parent,title,desc,k){const e=el('div','empty'),d=el('div');e.appendChild(icon(k));d.appendChild(el('b','',title));if(desc)d.appendChild(el('span','',desc));e.appendChild(d);parent.appendChild(e);}
function openSheet(opts){if(sheet)closeSheet(false);sheet=opts;lastFocus=document.activeElement;$('sheet-backdrop').hidden=false;document.querySelector('.shell').setAttribute('inert','');document.querySelector('.tabbar').setAttribute('inert','');document.body.style.overflow='hidden';text('sheet-title',opts.title);text('sheet-kicker',opts.kicker||'QUICK ACTION');text('sheet-note',opts.note||'');text('sheet-detail',opts.detail||'');$('sheet-detail').hidden=!opts.detail;$('sheet-query').hidden=!opts.query;$('sheet-query').value='';$('sheet-response').hidden=true;$('sheet-response').removeAttribute('data-error');text('sheet-submit',opts.button||'完成');$('sheet-submit').disabled=false;(opts.query?$('sheet-query'):$('sheet-close')).focus({preventScroll:true});}
function closeSheet(restore=true){if(!sheet)return;sheet=null;$('sheet-backdrop').hidden=true;document.querySelector('.shell').removeAttribute('inert');document.querySelector('.tabbar').removeAttribute('inert');document.body.style.overflow='';const focus=lastFocus;lastFocus=null;if(restore&&focus&&focus.isConnected)focus.focus({preventScroll:true});}
on('sheet-close',()=>closeSheet());$('sheet-backdrop').addEventListener('click',e=>{if(e.target===$('sheet-backdrop'))closeSheet();});on('sheet-submit',()=>{if(!sheet)return;const s=sheet,query=$('sheet-query').value.trim();if(s.query&&!query){const r=$('sheet-response');text(r,s.emptyHint||'请先输入搜索关键词。');r.dataset.error='true';r.hidden=false;$('sheet-query').focus();return;}if(s.act)s.act(query);else closeSheet();});$('sheet-query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();$('sheet-submit').click();}});
window.pilotBack=()=>{if(sheet){closeSheet();return true;}if(page!=='deck'){navigate(page==='device'&&previousPage!=='device'?previousPage:'deck');return true;}return false;};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.pilotBack())e.preventDefault();if(sheet&&e.key==='Tab'){const items=Array.from($('sheet-backdrop').querySelectorAll('button,input')).filter(n=>!n.hidden&&!n.disabled),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
function querySheet(bing){openSheet({title:bing?'Bing 搜索':'测试搜索服务',kicker:bing?'BROWSER SEARCH':'SEARCH TEST',note:bing?'关键词将交给系统浏览器。无需密钥，查看结果需要联网。':'将使用已保存的搜索配置发送一次请求，服务方可能计费。',query:true,button:bing?'打开 Bing':'发送测试查询',act:q=>{if(invoke(bing?'bing':'search',{query:q}))closeSheet();}});}

/* ---- Conversation sessions (local, private) ---- */
function renderSessionBar(){
  const a=active();text('session-name',a?a.name:'新对话');
  const b=$('session-manage');if(b)b.title='会话管理 · '+(a?a.name:'新对话');
}
function canSwitch(){if(chatBusy||busy()){toast('请等当前回复或任务结束后再切换对话。',true);return false;}return true;}
function switchSession(id){
  if(id===activeId)return;
  if(!canSwitch())return;
  if(!sessions.some(s=>s.id===id))return;
  persist(); // save current before switching
  activeId=id;const a=active();chatMode=a.mode;messages=a.messages;
  chatBusy=false;renderSessionBar();setMode(chatMode);renderMessages();syncSendButton();
}
function newChat(){
  if(!canSwitch())return;
  persist();
  const s=newSession();sessions.unshift(s);
  if(sessions.length>SESS_MAX)sessions.length=SESS_MAX;
  activeId=s.id;chatMode='ask';messages=s.messages;
  closeSheet();renderSessionBar();setMode('ask');renderMessages();syncSendButton();persist();
  $('task').value='';toast('已新建对话。');
}
function sessionStamp(s){
  if(!s.messages.length)return '空对话';
  const last=s.messages.filter(m=>m.role==='user').slice(-1)[0];
  return (last&&last.text?last.text:'新对话').slice(0,26);
}
function exportSession(){
  const a=active();if(!a)return;
  // v2 format keeps mode, plan steps and execution trace so import can rebuild a full session.
  const lines=['pilot one thing · 对话导出 v2','会话：'+a.name,'模式：'+a.mode,'导出时间：'+new Date().toLocaleString('zh-CN'),'—'.repeat(14)];
  a.messages.forEach(m=>{
    if(m.pending)return;
    const raw=String(m.text||''),flat=raw.replace(/[\r\n]+/g,' ').slice(0,CHAT_TEXT_MAX);
    // Keep the readable single-line body; append a JSON-escaped original when the text
    // contains newlines or marker-like prefixes that a line parser could misread.
    lines.push((m.role==='user'?'我':'领航员')+'：'+(flat||'（内容见文本行）'));
    if(/[\r\n]/.test(raw)||/@(mode|plan|trace|text|error):/.test(raw))lines.push('  @text:'+JSON.stringify(raw.slice(0,CHAT_TEXT_MAX)));
    if(m.mode&&m.role==='assistant')lines.push('  @mode:'+m.mode);
    if(m.plan&&typeof m.plan==='object'){
      const steps=Array.isArray(m.plan.steps)?m.plan.steps.filter(s=>s&&typeof s==='object'):[];
      lines.push('  @plan:'+JSON.stringify({answer:m.plan.answer||m.text||'',steps,target:m.plan.target||{}}));
    }
    if(Array.isArray(m.trace))m.trace.forEach(t=>lines.push('  @trace:'+String(t).replace(/\s+/g,' ').slice(0,300)));
    if(m.error)lines.push('  @error:'+String(m.error).replace(/\s+/g,' ').slice(0,300));
  });
  const body=lines.join('\n');
  openSheet({title:'导出对话',kicker:'EXPORT',note:'纯文本，含模式、计划与执行反馈，可复制保存或重新导入。仅在本机生成，不上传。',detail:body,button:'复制文本',act:()=>{copyText(body);closeSheet();}});
}
function parseImported(raw){
  const t=String(raw||'').trim();if(!t)throw new Error('请先粘贴要导入的对话内容。');
  let msgs=null,name='',mode='ask';
  // 1) Try structured JSON: an array of messages, or {name,mode,messages}.
  if(t.charAt(0)==='{'||t.charAt(0)==='['){
    try{
      const o=JSON.parse(t);
      const arr=Array.isArray(o)?o:(o&&Array.isArray(o.messages)?o.messages:null);
      if(arr){
        if(o&&!Array.isArray(o)){name=typeof o.name==='string'?o.name.slice(0,18):'';if(['ask','plan','crafts'].includes(o.mode))mode=o.mode;}
        msgs=arr.filter(m=>m&&typeof m==='object'&&['user','assistant'].includes(m.role))
          .map(m=>{
            const out={role:m.role,text:String(typeof m.text==='string'?m.text:(typeof m.content==='string'?m.content:'')).slice(0,CHAT_TEXT_MAX)};
            if(['ask','plan','crafts'].includes(m.mode))out.mode=m.mode;
            if(m.plan&&typeof m.plan==='object'&&Array.isArray(m.plan.steps))out.plan=m.plan;
            if(Array.isArray(m.trace)){out.trace=m.trace.filter(x=>typeof x==='string').slice(0,40).map(x=>x.slice(0,300));}
            if(typeof m.error==='string')out.error=m.error.slice(0,300);
            return out;
          })
          .filter(m=>m.text);
      }
    }catch(_){/* not JSON: fall through to text parser */}
  }
  // 2) Parse the plain-text export produced by exportSession() (v1 or v2).
  if(!msgs||!msgs.length){
    const lines=t.split(/\r?\n/);msgs=[];
    const nm=t.match(/^会话[：:]\s*(.*)$/m);if(nm&&nm[1].trim())name=nm[1].trim().slice(0,18);
    const md=t.match(/^模式[：:]\s*(ask|plan|crafts)$/m);if(md)mode=md[1];
    let last=null;
    lines.forEach(line=>{
      const s=line.trim();if(!s)return;
      if(/^pilot one thing/i.test(s)||/^会话[：:]/.test(s)||/^模式[：:]/.test(s)||/^导出时间[：:]/.test(s)||/^[—–-]{6,}$/.test(s))return;
      // v2 metadata attaches to the previous message.
      if(s.indexOf('@text:')===0){if(last){try{const v=JSON.parse(s.slice(6));if(typeof v==='string')last.text=v.slice(0,CHAT_TEXT_MAX);}catch(_){}}return;}
      if(s.indexOf('@mode:')===0){if(last&&['ask','plan','crafts'].includes(s.slice(6))){last.mode=s.slice(6);}return;}
      if(s.indexOf('@plan:')===0){
        if(last){try{const p=JSON.parse(s.slice(6));const steps=Array.isArray(p.steps)?p.steps.filter(x=>x&&typeof x==='object'):[];if(steps.length)last.plan={answer:typeof p.answer==='string'?p.answer.slice(0,CHAT_TEXT_MAX):last.text,steps:steps.slice(0,8),target:p.target&&typeof p.target==='object'?{pkg:String(p.target.pkg||''),label:String(p.target.label||'')}:{}};}catch(_){}}return;}
      if(s.indexOf('@trace:')===0){if(last){if(!Array.isArray(last.trace))last.trace=[];last.trace.push(s.slice(7).slice(0,300));}return;}
      if(s.indexOf('@error:')===0){if(last)last.error=s.slice(7).slice(0,300);return;}
      const m=s.match(/^(我|领航员|助手|用户)[：:]\s*([\s\S]*)$/);
      if(m&&m[2].trim()){last={role:m[1]==='我'||m[1]==='用户'?'user':'assistant',text:m[2].trim().slice(0,CHAT_TEXT_MAX)};msgs.push(last);}
    });
  }
  if(!msgs||!msgs.length)throw new Error('没有识别到可导入的消息。请粘贴本应用导出的文本，或包含 role/text 的 JSON。');
  msgs.forEach(m=>{if(m.plan&&Array.isArray(m.trace)&&m.trace.length)m.executed=true;});
  return {name:name||'导入的对话',mode,messages:msgs.slice(-CHAT_MAX)};
}
function importSession(){
  if(busy()||chatBusy){toast('请先停止当前任务，再导入对话。',true);return;}
  openSheet({title:'导入对话',kicker:'IMPORT',note:'粘贴本应用导出的纯文本，或含 messages 的 JSON。导入内容只保存在本机浏览器存储。',button:'确认导入',act:()=>{}});
  const box=$('sheet-detail');box.hidden=false;clear(box);
  const ta=el('textarea','import-area');ta.rows=9;ta.maxLength=60000;ta.placeholder='在此粘贴对话文本或 JSON…';box.appendChild(ta);
  const resp=$('sheet-response');resp.hidden=true;
  sheet.act=()=>{
    let parsed;
    try{parsed=parseImported(ta.value);}catch(e){text('sheet-response',e&&e.message?e.message:'导入内容格式不正确。');resp.dataset.error='true';resp.hidden=false;ta.focus();return;}
    persist();
    const s=newSession(parsed.name);s.messages=parsed.messages;s.mode=parsed.mode;
    sessions.unshift(s);if(sessions.length>SESS_MAX)sessions.length=SESS_MAX;
    activeId=s.id;chatMode=parsed.mode;messages=s.messages;
    closeSheet();renderSessionBar();setMode(chatMode);renderMessages();syncSendButton();persist();
    toast('已导入「'+s.name+'」· '+parsed.messages.length+' 条消息。');
  };
  ta.focus({preventScroll:true});
}
function openSessionSheet(){
  openSheet({title:'会话管理',kicker:'CONVERSATIONS',note:'对话保存在本机浏览器存储中，不上传。点击会话切换。',button:'关闭',act:()=>closeSheet()});
  const box=$('sheet-detail');box.hidden=false;clear(box);
  const filter=el('input','sess-filter');filter.type='search';filter.placeholder='搜索会话名称或内容…';filter.maxLength=80;filter.setAttribute('aria-label','搜索会话');filter.value=sessionFilterText;box.appendChild(filter);
  const listEl=el('div','session-list');
  const renderList=()=>{
    sessionFilterText=filter.value;
    clear(listEl);
    const add=el('button','sess-new-btn');add.type='button';add.append(symbol('pen'),el('span','','新建对话'));add.onclick=()=>newChat();listEl.appendChild(add);
    const q=filter.value.trim().toLowerCase();
    const list=sortSessions(sessions.slice()).filter(s=>!q||((s.name||'')+' '+sessionStamp(s)).toLowerCase().includes(q));
    if(!list.length&&q){const e=el('div','sess-noresult','没有匹配的会话');listEl.appendChild(e);return;}
    list.forEach(s=>{
      const row=el('button','session-row'+(s.id===activeId?' active':''));row.type='button';
      const main=el('span','sess-main');main.append(el('strong','',(s.pinned?'📌 ':'')+s.name),el('small','',sessionStamp(s)));
      row.appendChild(main);
      const pin=el('span','sess-pin'+(s.pinned?' on':''));pin.setAttribute('role','button');pin.setAttribute('tabindex','0');pin.setAttribute('aria-label',s.pinned?'取消固定会话':'固定会话到顶部');pin.title=s.pinned?'取消固定':'固定到顶部';pin.appendChild(symbol('pin'));
      const toggle=e=>{e.stopPropagation();togglePin(s.id);};
      pin.onclick=toggle;pin.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(e);}};
      row.appendChild(pin);
      const ren=el('span','sess-ren');ren.setAttribute('role','button');ren.setAttribute('tabindex','0');ren.setAttribute('aria-label','重命名会话');ren.appendChild(symbol('pen'));
      const rename=e=>{e.stopPropagation();renameSession(s.id);};
      ren.onclick=rename;ren.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();rename(e);}};
      row.appendChild(ren);
      const del=el('span','sess-del');del.setAttribute('role','button');del.setAttribute('tabindex','0');del.setAttribute('aria-label','删除会话');del.appendChild(symbol('x'));
      const remove=e=>{e.stopPropagation();deleteSession(s.id);};
      del.onclick=remove;del.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();remove(e);}};
      row.appendChild(del);
      row.onclick=()=>{switchSession(s.id);closeSheet();};
      listEl.appendChild(row);
    });
  };
  filter.addEventListener('input',renderList);
  renderList();
  box.appendChild(listEl);
  const imp=el('button','text-action');imp.type='button';imp.textContent='导入对话（粘贴文本或 JSON）';imp.style.marginTop='10px';imp.onclick=()=>importSession();box.appendChild(imp);
  const exp=el('button','text-action');exp.type='button';exp.textContent='导出当前对话为文本';exp.style.marginTop='8px';exp.onclick=()=>exportSession();box.appendChild(exp);
  const delAll=el('button','text-action');delAll.type='button';delAll.textContent='删除所有对话';delAll.style.cssText='margin-top:8px;color:#b1352c';delAll.onclick=()=>{
    if(!canSwitch()){closeSheet();return;}
    openSheet({title:'删除所有对话？',kicker:'DANGER',note:'此操作只删除本机保存的对话，不可恢复。技能、密钥与连接配置不受影响。',button:'确认删除',act:()=>{sessions=[newSession()];activeId=sessions[0].id;chatMode='ask';messages=sessions[0].messages;closeSheet();renderSessionBar();setMode('ask');renderMessages();persist();toast('已删除所有对话。');}});
  };box.appendChild(delAll);
}
function deleteSession(id){
  if(sessions.length<=1){toast('至少保留一个对话。',true);return;}
  const i=sessions.findIndex(s=>s.id===id);if(i<0)return;
  const wasActive=id===activeId;sessions.splice(i,1);
  if(wasActive){activeId=sessions[0].id;const a=active();chatMode=a.mode;messages=a.messages;renderSessionBar();setMode(chatMode);renderMessages();syncSendButton();}
  persist();openSessionSheet(); // refresh list
}
function renameSession(id){
  const s=sessions.find(x=>x.id===id);if(!s)return;
  openSheet({title:'重命名对话',kicker:'RENAME',note:'给这段对话起个好记的名字，仅保存在本机。',query:true,emptyHint:'请输入对话名称。',button:'保存名称',act:name=>{
    const clean=String(name||'').trim().slice(0,24);
    if(!clean){text('sheet-response','请输入名称。');$('sheet-response').dataset.error='true';$('sheet-response').hidden=false;$('sheet-query').focus();return;}
    s.name=clean;s.ts=Date.now();persist();renderSessionBar();closeSheet();openSessionSheet();toast('已重命名为「'+clean+'」。');
  }});
  const q=$('sheet-query');q.maxLength=24;q.value=s.name;
  requestAnimationFrame(()=>{q.focus({preventScroll:true});try{q.select();}catch(_){}});
}
function togglePin(id){
  const s=sessions.find(x=>x.id===id);if(!s)return;
  s.pinned=!s.pinned;s.ts=Date.now();persist();
  openSessionSheet();
  toast(s.pinned?'已固定「'+s.name+'」到顶部':'已取消固定「'+s.name+'」');
}
function copyText(t){
  try{
    const a=el('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(a);a.select();a.setSelectionRange(0,t.length);const ok=document.execCommand('copy');document.body.removeChild(a);
    toast(ok?'已复制到剪贴板。':'复制失败，可长按文本手动复制。',!ok);
  }catch(_){toast('复制失败，可长按文本手动复制。',true);}
}
on('session-manage',()=>openSessionSheet());
on('session-new',()=>newChat());
/* ---- Conversational transcript ---- */
const modeTag={ask:'问 · ASK',plan:'谋 · PLAN',crafts:'造 · CRAFTS'};
function msgActions(items){
  const bar=el('div','chat-msg-actions');
  items.forEach(([ic,label,fn])=>{
    const b=el('button','msg-act');b.type='button';b.append(symbol(ic),el('span','',label));b.onclick=fn;bar.appendChild(b);
  });
  return bar;
}
function regenerate(msg){
  if(chatBusy||busy()){toast('请等待当前回复完成。');return;}
  // Find the user prompt immediately before this assistant message and rerun it.
  const i=messages.indexOf(msg);
  let u=-1;for(let j=i-1;j>=0;j--)if(messages[j].role==='user'){u=j;break;}
  if(u<0){toast('找不到对应的提问。',true);return;}
  const prompt=messages[u].text;
  const useMode=['ask','plan','crafts'].includes(msg.mode)?msg.mode:chatMode;   // regenerate in the original mode
  messages=messages.slice(0,u+1);             // drop this answer and anything after it
  messages.push({role:'assistant',text:'',pending:true,mode:useMode});
  // Match sendChat: include both user and assistant turns in the context history.
  const valid=messages.filter(m=>(m.role==='user'||m.role==='assistant')&&!m.pending&&typeof m.text==='string'&&m.text);
  const history=[];let budget=CHAT_HISTORY_BUDGET;
  for(let k=valid.length-1;k>=0&&history.length<CHAT_SEND_TURNS*2;k--){
    const piece=valid[k].text.slice(0,CHAT_TEXT_MAX);if(piece.length>budget)break;
    history.unshift({role:valid[k].role,content:piece});budget-=piece.length;
  }
  chatOwnerSession=activeId;chatBusy=true;renderMessages();syncSendButton();persistSoon();
  if(!invoke('chat',{text:prompt,mode:useMode,history})){messages=messages.filter(m=>!m.pending);chatBusy=false;chatOwnerSession='';renderMessages();syncSendButton();persistSoon();}
}
function renderMessages(){
  const box=$('chat-thread');clear(box);
  if(!messages.length){
    const w=el('div','chat-welcome'),m=el('div','chat-welcome-mark');m.appendChild(icon('compass'));
    w.append(m,el('strong','','一次，只做一件事。'),el('p','','选一种模式，然后告诉我任务。问会直接回答；谋会列出可确认的步骤；造会逐步执行，每步都由你点头。'));
    box.appendChild(w);return;
  }
  messages.forEach(msg=>{
    const row=el('div','chat-msg '+(msg.role==='user'?'from-user':'from-ai'));
    if(msg.role==='user'){
      const b=el('div','bubble');b.textContent=msg.text;row.appendChild(b);
      row.appendChild(msgActions([['copy','复制',()=>copyText(msg.text)]]));
    }
    else{
      const head=el('div','msg-head');head.append(el('span','ai-avatar'),el('span','ai-name','领航员'),el('span','msg-mode',modeTag[msg.mode]||msg.role));
      const b=el('div','bubble');
      if(msg.pending){const d=el('span','typing');d.append(el('i'),el('i'),el('i'));b.appendChild(d);}
      else b.textContent=msg.text||'';
      row.append(head,b);
      if(msg.plan&&!msg.pending)row.appendChild(planCard(msg));
      if(msg.error){const e=el('div','msg-error');e.textContent=msg.error;row.appendChild(e);}
      if(!msg.pending){
        const acts=[['copy','复制',()=>copyText(msg.text||'')]];
        if(msg.error||msg.stopped)acts.push(['pulse','重试',()=>regenerate(msg)]);
        else if(msg.text)acts.push(['pulse','重新生成',()=>regenerate(msg)]);
        row.appendChild(msgActions(acts));
      }
    }
    box.appendChild(row);
  });
  box.scrollTop=box.scrollHeight;
}
function planCard(msg){
  const plan=msg.plan,card=el('div','plan-card'),hd=el('div','plan-head');
  hd.append(el('strong','','操作计划'),el('span','plan-count',(plan.steps||[]).length+' 步'));
  card.appendChild(hd);
  const steps=Array.isArray(plan.steps)?plan.steps.filter(s=>s&&typeof s==='object'):[],listEl=el('ol','plan-steps');
  steps.forEach(s=>{const li=el('li','',describeStep(s));listEl.appendChild(li);});
  card.appendChild(listEl);
  const tgt=plan.target||{},note=el('p','plan-note',tgt.label?('目标 · '+tgt.label):'尚未选择目标应用，执行前请在「设备」中选择。');card.appendChild(note);
  const acts=el('div','plan-actions'),run=el('button','primary compact','确认执行'),skip=el('button','ghost compact','放弃');
  run.type='button';skip.type='button';
  if(!steps.length||!tgt.pkg)run.disabled=true;
  run.onclick=()=>{
    if(!bridge()){toast('请在 Android 应用中使用此功能。',true);return;}
    run.disabled=true;
    if(invoke('executePlan',{plan})){skip.disabled=true;msg.executed=true;renderMessages();}
    else{run.disabled=false;}
  };
  skip.onclick=()=>{msg.plan=null;renderMessages();};
  if(msg.executed){acts.appendChild(el('span','plan-done','执行中 · 请在悬浮条中逐步确认'));}
  else acts.append(run,skip);
  card.appendChild(acts);
  if(msg.executed&&Array.isArray(msg.trace)&&msg.trace.length){
    const log=el('div','plan-trace');log.appendChild(el('div','trace-title','执行反馈'));
    msg.trace.forEach(t=>{const row=el('div','trace-row');row.append(el('span','trace-dot'),el('span','',typeof t==='string'?t:''));log.appendChild(row);});
    card.appendChild(log);
  }
  return card;
}
function describeStep(s){if(!s||typeof s!=='object')return '操作';switch(s.action){case 'open':return '打开所选应用';case 'click':return '点击「'+(s.text||'')+'」';case 'fill':return '填入草稿「'+(s.text||'')+'」';case 'scroll':return s.direction==='up'?'向上翻页':'向下翻页';default:return s.action||'操作';}}
on('quick-bing',()=>querySheet(true));on('demo',()=>invoke('demo'));on('target',()=>invoke('target'));on('access',()=>invoke('permissions',{kind:'access'}));on('overlay',()=>invoke('permissions',{kind:'overlay'}));on('import',()=>invoke('import'));
on('run',()=>sendChat());
// Resolve an unfinished placeholder into a visible, retryable message (used on stop/error).
function settlePending(text){
  const arr=ownerMessages()||messages;
  for(let i=arr.length-1;i>=0;i--){const m=arr[i];if(m.pending){m.pending=false;m.stopped=true;m.text=String(text||'已停止，可点「重试」重新发送。').slice(0,CHAT_TEXT_MAX);break;}}
}
function sendChat(){
  if(busy()||chatBusy){if(invoke('stop')){settlePending();chatBusy=false;chatOwnerSession='';renderMessages();syncSendButton();if(pending){pending=null;controls();}persistSoon();}return;}
  const text=$('task').value.trim();if(!text){$('task').focus();toast('先说一句你想做的事。');return;}
  const valid=messages.filter(m=>(m.role==='user'||m.role==='assistant')&&!m.pending&&typeof m.text==='string'&&m.text);
  const history=[];let budget=CHAT_HISTORY_BUDGET;
  for(let i=valid.length-1;i>=0&&history.length<CHAT_SEND_TURNS*2;i--){
    const piece=valid[i].text.slice(0,CHAT_TEXT_MAX);
    if(piece.length>budget)break;                 // stop rather than send a truncated half-turn
    history.unshift({role:valid[i].role,content:piece});budget-=piece.length;
  }
  const payload={text,mode:chatMode,history};
  if(skillId)payload.skill=skillId;
  const a=active();
  if(a&&a.messages.filter(m=>m.role==='user'&&!m.pending).length===0)a.name=text.slice(0,18)+(text.length>18?'…':''); // auto-title from first message
  messages.push({role:'user',text});
  messages.push({role:'assistant',text:'',pending:true,mode:chatMode});
  trimMessages();
  $('task').value='';chatOwnerSession=activeId;chatBusy=true;renderMessages();syncSendButton();renderSessionBar();persistSoon();
  if(!invoke('chat',payload)){messages=messages.filter(m=>!m.pending);chatBusy=false;chatOwnerSession='';renderMessages();syncSendButton();persistSoon();}
}
function syncSendButton(){const f=$('run');if(!f)return;f.querySelector('span').textContent=busy()||chatBusy?'停止':'发送';const i=f.querySelector('i');if(i){clear(i);i.appendChild(icon(busy()||chatBusy?'stop':'flight'));}}
$('task').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('run').click();}});
function setMode(mode){if(!['ask','plan','crafts'].includes(mode))return;chatMode=mode;const map={ask:'问',plan:'谋',crafts:'造'};
  list('.mode-tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===mode)));text('compose-mode',map[mode]);
  $('task').placeholder={ask:'问我任何问题，或让我帮你梳理…',plan:'描述任务，我来制定可确认的步骤…',crafts:'描述任务，我来分步执行（每步需你确认）…'}[mode];
  renderPromptChips();persistSoon();
}
const PROMPTS={
  ask:[['pulse','帮我总结要点'],['pen','润色这段话'],['globe','解释一个概念'],['check','列一个清单']],
  plan:[['plan','拆解成步骤'],['compass','规划一次行程'],['layers','对比几个方案'],['log','整理待办']],
  crafts:[['app','打开某个应用'],['device','在应用里找功能'],['compass','用计算器算一下'],['log','翻看历史记录']]
};
const CHIP_ICONS=['pulse','pen','globe','check','plan','compass','layers','log'];
const PROMPT_KEY='pilot.prompts.v1', PROMPT_MAX=8;
let customPrompts=loadPrompts();
function loadPrompts(){
  const def=m=>PROMPTS[m].map(x=>x[1]);
  try{
    const o=JSON.parse(localStorage.getItem(PROMPT_KEY)||'null');
    if(!o||typeof o!=='object')return {ask:def('ask'),plan:def('plan'),crafts:def('crafts')};
    const clean=v=>Array.isArray(v)?v.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,24)).filter(Boolean).slice(0,PROMPT_MAX):null;
    return {ask:clean(o.ask)||def('ask'),plan:clean(o.plan)||def('plan'),crafts:clean(o.crafts)||def('crafts')};
  }catch(_){return {ask:def('ask'),plan:def('plan'),crafts:def('crafts')};}
}
function savePrompts(){try{localStorage.setItem(PROMPT_KEY,JSON.stringify(customPrompts));}catch(_){toast('本机存储不可用，自定义提示词仅本次有效。',true);}}
function renderPromptChips(){
  const box=$('prompt-chips');if(!box)return;clear(box);
  (customPrompts[chatMode]||[]).forEach((label,i)=>{
    const b=el('button','prompt-chip');b.type='button';b.append(symbol(CHIP_ICONS[i%CHIP_ICONS.length]),el('span','',label));
    b.onclick=()=>{const t=$('task');if(t.value.trim())t.value=t.value.trim()+'，';t.value+=label;t.focus();};
    box.appendChild(b);
  });
  const ed=el('button','prompt-chip chip-edit');ed.type='button';ed.setAttribute('aria-label','自定义快捷提问');ed.append(symbol('sliders'),el('span','','自定义'));
  ed.onclick=editPrompts;box.appendChild(ed);
}
function editPrompts(){
  openSheet({title:'自定义快捷提问',kicker:'SHORTCUTS',note:'每行一条，最多 '+PROMPT_MAX+' 条、每条 24 字。留空则恢复该模式默认。',button:'保存',act:()=>{}});
  const box=$('sheet-detail');box.hidden=false;clear(box);
  const inputs={};
  [['ask','问 · Ask'],['plan','谋 · Plan'],['crafts','造 · Crafts']].forEach(([m,label])=>{
    const wrap=el('label','prompt-edit-field');
    wrap.appendChild(el('span','',label));
    const ta=el('textarea','prompt-edit-area');ta.rows=3;ta.maxLength=600;ta.value=(customPrompts[m]||[]).join('\n');
    inputs[m]=ta;wrap.appendChild(ta);box.appendChild(wrap);
  });
  sheet.act=()=>{
    const next={};
    for(const m of ['ask','plan','crafts']){
      const lines=inputs[m].value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>x.slice(0,24)).slice(0,PROMPT_MAX);
      next[m]=lines.length?lines:PROMPTS[m].map(x=>x[1]);
    }
    customPrompts=next;savePrompts();closeSheet();renderPromptChips();toast('快捷提问已更新。');
  };
  const first=inputs.ask;requestAnimationFrame(()=>first.focus({preventScroll:true}));
}
on('dismiss-result',()=>{$('result-panel').hidden=true;});
function copyResult(){const t=$('result-text').textContent;if(!t){toast('暂无可复制的内容。');return;}let ok=false;try{const a=el('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';document.body.appendChild(a);a.select();a.setSelectionRange(0,t.length);ok=document.execCommand('copy');document.body.removeChild(a);}catch(_){ok=false;}if(ok)toast('结果已复制到剪贴板。');else toast('复制失败，可长按结果文本手动复制。',true);}
on('copy-result',copyResult);on('clear-history',()=>openSheet({title:'清除最近事件？',kicker:'FLIGHT LOG',note:'此操作只删除本机事件记录，不会清除技能、密钥或连接配置。',button:'确认清除',act:()=>{if(invoke('clearHistory'))closeSheet();}}));
function renderDeck(){const skills=state&&state.skills||[],sel=skills.find(s=>s.id===skillId);text('skill-label',sel?sel.name:'选择技能');text('task-status',state?(state.busy?'处理中':state.active?'执行中':'待命'):(bridge()?'读取中':'未连接'));$('task-status').dataset.on=String(!!state);const flight=$('run');flight.querySelector('span').textContent=busy()||chatBusy?'停止':'发送';const ico=flight.querySelector('i');clear(ico);ico.appendChild(icon(busy()||chatBusy?'stop':'flight'));['demo','quick-bing','import','target','access','overlay','clear-history'].forEach(k=>$(k).disabled=!!(state&&state.busy));text('target-label',state?(state.target&&state.target.pkg?((state.target.label||'目标应用')+' · '+state.target.pkg):'尚未选择 · 选择可操作的应用'):'未获取设备状态');text('access-label',state?(state.access?'已开启 · 前往系统设置':'未开启 · 查看并授权'):'未获取设备状态');text('overlay-label',state?(state.overlay?'已允许 · 前往系统设置':'未允许 · 查看并授权'):'未获取设备状态');const h=$('history-list'),history=state&&Array.isArray(state.history)?state.history:[];clear(h);$('clear-history').hidden=!history.length;$('history-label').hidden=!!history.length;if(!history.length){empty(h,state?'暂无事件':'尚未读取设备记录',state?'开始任务后，执行记录会出现在这里。':'最近事件由 Android 主机提供。','log');return;}history.forEach(raw=>{const row=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const b=el('button','history-row'),date=new Date(row.time),valid=!!row.time&&Number.isFinite(date.getTime()),stamp=valid?date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'';b.append(el('span','log-dot'),el('span','',typeof row.message==='string'?row.message:''),el('time','',stamp));b.onclick=()=>openSheet({title:'事件详情',kicker:'FLIGHT LOG',note:valid?date.toLocaleString('zh-CN'):'',detail:row.message});h.appendChild(b);});}
const categoryIcon={通用:'compass',手机:'device',写作:'pen',规划:'plan',搜索:'globe',编程:'terminal',学习:'compass',办公:'plan',创意:'pen',生活:'hand',沟通:'pen',健康:'pulse',职场:'layers',效率:'check',财务:'plan',法律:'check',心理:'wave',家政:'hand',育儿:'hand',旅行:'globe',饮食:'hand',出行:'globe',维修:'cpu',自定义:'layers'};
const modeLabel={auto:'智能',answer:'回答',phone:'手机',research:'检索'};
const FAV_CAT='★ 常用',REC_CAT='推荐';
function favStar(s){
  const star=el('span','fav-star'+(favs.has(s.id)?' on':''));star.setAttribute('role','button');star.setAttribute('tabindex','0');
  star.setAttribute('aria-label',favs.has(s.id)?'取消收藏 '+s.name:'收藏 '+s.name);star.title=favs.has(s.id)?'取消收藏':'收藏，置顶到常用';
  star.textContent=favs.has(s.id)?'★':'☆';
  const fire=e=>{e.stopPropagation();toggleFav(s.id);toast(favs.has(s.id)?'已收藏「'+s.name+'」':'已取消收藏「'+s.name+'」');};
  star.onclick=fire;star.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fire(e);}};
  return star;
}
function renderSkills(){
  const skills=state&&state.skills||[],cats=Array.from(new Set(skills.map(s=>s.category).filter(Boolean)));
  const favCount=skills.filter(s=>favs.has(s.id)).length,usedCount=skills.filter(s=>(usage[s.id]||0)>0).length;
  if(category&&category!==FAV_CAT&&category!==REC_CAT&&!cats.includes(category))category='';
  const c=$('categories');clear(c);
  const tabs=[''].concat(cats);
  tabs.forEach(k=>{const b=el('button','',k||'全部');b.type='button';b.setAttribute('aria-pressed',String(k===category));b.onclick=()=>{category=k;renderSkills();Array.from(c.children).find(n=>n.textContent===(k||'全部')).focus({preventScroll:true});};c.appendChild(b);});
  const fb=el('button','',FAV_CAT+(favCount?' '+favCount:''));fb.type='button';fb.setAttribute('aria-pressed',String(category===FAV_CAT));fb.onclick=()=>{category=FAV_CAT;renderSkills();fb.focus({preventScroll:true});};c.insertBefore(fb,c.firstChild);
  const rb=el('button','',REC_CAT+(usedCount?' '+usedCount:''));rb.type='button';rb.setAttribute('aria-pressed',String(category===REC_CAT));rb.onclick=()=>{category=REC_CAT;renderSkills();rb.focus({preventScroll:true});};c.insertBefore(rb,c.firstChild);
  const q=$('skill-search').value.trim().toLowerCase(),
    rank=(a,b)=>((favs.has(b.id)?1:0)-(favs.has(a.id)?1:0))||((usage[b.id]||0)-(usage[a.id]||0)),
    pool=skills.filter(s=>[s.name,s.category,s.description].join(' ').toLowerCase().includes(q));
  let matched;
  if(category===REC_CAT)matched=pool.filter(s=>(usage[s.id]||0)>0||favs.has(s.id)).sort(rank);
  else if(category===FAV_CAT)matched=pool.filter(s=>favs.has(s.id)).sort(rank);
  else matched=pool.filter(s=>!category||s.category===category).sort(rank);
  const g=$('skills-list');clear(g);
  const label=category===REC_CAT?'推荐':category===FAV_CAT?'常用':(category||'全部');
  text('skills-count',state?(label+'技能 · '+matched.length+(category===REC_CAT&&q?'（已用/收藏）':'')):'全部技能');
  if(!matched.length){
    const emptyTitle=!state?'未读取技能库':category===REC_CAT?'还没有使用记录':category===FAV_CAT?'还没有收藏的技能':(skills.length?'没有匹配的技能':'暂无可用技能');
    const emptyDesc=!state?'在 Android 应用中查看或导入技能。':category===REC_CAT?'用过的技能与收藏会显示在这里，方便快速找到。':category===FAV_CAT?'点技能卡片右侧的☆即可收藏，常用技能会置顶显示。':(skills.length?'尝试其他关键词或分类。':'从本机导入可信的技能文件。');
    empty(g,emptyTitle,emptyDesc,'layers');return;
  }
  matched.forEach(s=>{
    const b=el('button','skill-card'),tx=el('span','skill-text');b.type='button';b.setAttribute('aria-pressed',String(s.id===skillId));
    const hd=el('span','skill-heading');hd.append(el('strong','',s.name),el('span','skill-mode',modeLabel[s.mode]||s.mode||'技能'));if(s.mode)hd.lastChild.setAttribute('data-mode',s.mode);
    if(favs.has(s.id))hd.appendChild(el('span','fav-badge','★ 常用'));
    if((usage[s.id]||0)>0)hd.appendChild(el('span','use-badge','×'+usage[s.id]));
    tx.append(hd,el('small','',s.description||s.category));
    b.append(symbol(categoryIcon[s.category]||'layers','tile-icon'),tx,favStar(s),symbol(s.id===skillId?'check':'angle','mark'));
    b.onclick=()=>{const how={answer:'直接回答 · 不操作手机',phone:'生成手机操作步骤，需先选目标应用',research:'联网检索并整理资料',auto:'按任务自动决定'};openSheet({title:s.name,kicker:'SKILL / '+(s.category||'LIBRARY'),note:(modeLabel[s.mode]||s.mode)+' · '+(how[s.mode]||'')+' · '+(s.description||''),detail:s.prompt,button:'使用此技能',act:()=>{skillId=s.id;noteSkillUse(s.id);closeSheet(false);renderDeck();navigate('deck',{top:true});toast('已选用「'+s.name+'」');}});};
    g.appendChild(b);
  });
}
$('skill-search').addEventListener('input',renderSkills);
const globalFields=['temperature','topP','maxTokens','systemPrompt'];const scopes={model:['endpoint','model','key','clearKey'],search:['searchEndpoint','searchKey','clearSearchKey','searchMethod','searchHeader','searchParam','searchAuthPrefix','searchResultsPath','searchTitleField','searchUrlField','searchSnippetField']};const customFields=scopes.search.slice(3),presetKeys={endpoint:'endpoint',model:'model',searchEndpoint:'endpoint',searchMethod:'method',searchHeader:'authHeader',searchParam:'queryField',searchAuthPrefix:'authPrefix',searchResultsPath:'resultsPath',searchTitleField:'titleField',searchUrlField:'urlField',searchSnippetField:'snippetField'};
function cfg(){return state&&state.settings||{};}
function presets(s){return state&&(s==='model'?state.modelPresets:state.searchPresets)||[];}
function selected(s){return s==='model'?uiModel:uiSearch;}
function persisted(s){const c=cfg();return s==='model'?(c.provider||c.modelProvider||''):(c.searchProvider||'');}
function mapFor(s,id=selected(s)){const k=s+':'+id;if(!drafts.has(k))drafts.set(k,new Map());return drafts.get(k);}
function profile(s){return presets(s).find(p=>p.id===selected(s))||{};}
function base(s,k){const c=cfg(),p=profile(s),active=selected(s)===persisted(s);if(globalFields.includes(k))return (c[k]!=null?c[k]:'');if(['clearKey','clearSearchKey'].includes(k))return false;if(['key','searchKey'].includes(k))return '';if(active&&c[k]!=null)return c[k];if(active&&k==='endpoint'&&c.modelEndpoint!=null)return c.modelEndpoint;return (p[presetKeys[k]]!=null?p[presetKeys[k]]:'');}
function current(s,k){const d=globalFields.includes(k)?globalEdits:mapFor(s);return d.has(k)?d.get(k):base(s,k);}
function remember(s,k,v){const d=globalFields.includes(k)?globalEdits:mapFor(s);if(String(v)===String(base(s,k)))d.delete(k);else d.set(k,v);}
function hasKey(s){const p=profile(s),c=cfg();return selected(s)===persisted(s)?(s==='model'?(c.hasKey!=null?c.hasKey:(c.hasModelKey!=null?c.hasModelKey:p.hasKey)):(c.hasSearchKey!=null?c.hasSearchKey:p.hasKey)):p.hasKey;}
function patch(s){const v={},sel=selected(s);if(sel&&sel!==persisted(s))v[s==='model'?'provider':'searchProvider']=sel;for(const [k,x] of mapFor(s)){if(s==='search'&&(sel==='bing'||(sel!=='custom'&&customFields.includes(k))))continue;if(k==='key'||k==='searchKey'){if(String(x).trim())v[k]=String(x).trim();}else v[k]=x;}if(s==='model')for(const [k,x] of globalEdits)v[k]=x;return v;}
function populate(id,rows,value){const n=$(id),sig=JSON.stringify(rows.map(p=>[p.id,p.name]));if(n.dataset.sig!==sig){clear(n);if(!rows.length)n.appendChild(new Option(bridge()?'等待主机配置':'未连接 Android 主机',''));rows.forEach(p=>n.appendChild(new Option(p.name,p.id)));n.dataset.sig=sig;}if(n.value!==value)n.value=value;}
function keyUI(s){const isM=s==='model',k=isM?'key':'searchKey',rm=isM?'clearKey':'clearSearchKey',exists=hasKey(s),remove=!!current(s,rm);text(k+'-state',remove?'待删除':exists?'已保存':state?'未设置':'');$(k).placeholder=remove?'保存后删除密钥':exists?'留空以保留已保存的密钥':'输入 API 密钥';$(rm).hidden=!exists;$(rm).textContent=remove?'撤销密钥删除':'删除已保存的'+(isM?'模型':'搜索')+'密钥';$(rm).setAttribute('aria-pressed',String(remove));}
function controls(){const changed=Object.keys(patch(pane)).length>0,blocked=!!(state&&state.busy)||!!pending;text('config-note',!state?'原生配置尚未载入。请在 Android 应用中使用连接服务。':changed?'有未保存的更改。请先保存，再测试当前配置。':'仅在保存后应用更改。测试使用已保存的配置。');$('test').disabled=blocked||changed||!state;$('save').disabled=blocked||!changed||!state;textOfTest();['model','search'].forEach(keyUI);}
function textOfTest(){$('test').querySelector('span').textContent=pane==='model'?'测试连接':uiSearch==='bing'?'试用 Bing':'测试搜索';}
function renderSettings(){if(!customSelection.model)uiModel=persisted('model');if(!customSelection.search)uiSearch=persisted('search');populate('provider',presets('model'),uiModel);populate('searchProvider',presets('search'),uiSearch);['model','search'].forEach(s=>{for(const k of scopes[s].concat(s==='model'?globalFields:[])){if(k==='clearKey'||k==='clearSearchKey')continue;const val=String(current(s,k));if($(k).value!==val)$(k).value=val;}});$('model-panel').hidden=pane!=='model';$('search-panel').hidden=pane!=='search';$('bing-note').hidden=uiSearch!=='bing';$('api-search').hidden=!uiSearch||uiSearch==='bing';$('advanced-search').hidden=uiSearch!=='custom';$('model-tab').setAttribute('aria-pressed',String(pane==='model'));$('search-tab').setAttribute('aria-pressed',String(pane==='search'));controls();}
['model','search'].forEach(s=>{const id=s==='model'?'provider':'searchProvider',k=s==='model'?'key':'searchKey',rm=s==='model'?'clearKey':'clearSearchKey';$(id).addEventListener('change',()=>{if(s==='model')uiModel=$(id).value;else uiSearch=$(id).value;customSelection[s]=selected(s)!==persisted(s);renderSettings();});on(s+'-tab',()=>{pane=s;renderSettings();});on(rm,()=>{const next=!current(s,rm);remember(s,rm,next);if(next){remember(s,k,'');$(k).value='';}controls();});scopes[s].concat(s==='model'?globalFields:[]).filter(f=>f!==rm).forEach(f=>{$(f).addEventListener('input',()=>{remember(s,f,$(f).value);if(f===k&&$(k).value)remember(s,rm,false);controls();});});});
function configError(k,msg){toast(msg,true);const input=$(k),d=input.closest('details');if(d)d.open=true;input.focus();return false;}
$('settings-form').addEventListener('submit',e=>{e.preventDefault();if(!state||pending||state.busy)return;const val=patch(pane);if(!Object.keys(val).length){toast('没有需要保存的更改。');return;}for(const k of ['temperature','topP','maxTokens']){if(!(k in val))continue;const n=Number(val[k]);if(val[k]===''||!Number.isFinite(n)||(k==='temperature'?(n<0||n>2):k==='topP'?(n<=0||n>1):(!Number.isInteger(n)||n<1||n>32768))){configError(k,k==='temperature'?'温度须在 0 到 2 之间。':k==='topP'?'Top P 须大于 0 且不超过 1。':'输出上限须为 1 到 32768 的整数。');return;}val[k]=n;}for(const k of ['endpoint','searchEndpoint'])if(k in val&&val[k]){let u;try{u=new URL(val[k]);}catch(_){}if(!u||u.protocol!=='https:'||u.search||u.hash||u.username||u.password){configError(k,'请填写完整 HTTPS 请求地址，不包含查询串、片段或用户凭据。');return;}}
const edits=new Map(mapFor(pane)),globals=pane==='model'?new Map(globalEdits):new Map();pending={scope:pane,id:selected(pane),edits,globals};controls();if(!invoke('save',{data:val})){pending=null;controls();}});
function ackSave(){if(!pending)return;const {scope,id,edits,globals}=pending,d=mapFor(scope,id);for(const [k,x] of edits)if(d.get(k)===x)d.delete(k);for(const [k,x] of globals)if(globalEdits.get(k)===x)globalEdits.delete(k);if(selected(scope)===id)customSelection[scope]=false;pending=null;renderSettings();invoke('state');}
on('test',()=>{if(pane==='search'){querySheet(uiSearch==='bing');return;}openSheet({title:'测试模型连接',kicker:'MODEL TEST',note:'将向已保存的模型地址发送一条简短测试消息，服务方可能计费。',button:'发送测试',act:()=>{if(invoke('test'))closeSheet();}});});
window.onPilotState=value=>{try{if(typeof value==='string')value=JSON.parse(value);}catch(_){return;}if(!value||typeof value!=='object'||Array.isArray(value))return;state=value;const sk=Array.isArray(state.skills)?state.skills:[];if(!sk.some(s=>s.id===skillId))skillId=(sk.find(s=>s.id==='copilot')||sk[0]||{}).id||'';renderDeck();if(page==='skills')renderSkills();renderSettings();};
function appendTrace(text){
  const m=String(text||'').slice(0,500);if(!m)return;
  // Attach the trace to the session that launched the plan, so feedback routing stays
  // correct even if the visible conversation changed while the task was running.
  const arr=ownerMessages()||messages;
  // Prefer the most recent executed plan card; otherwise adopt the latest plan card
  // (crafts may start from the native confirmation dialog without a prior UI tap).
  let target=null;
  for(let i=arr.length-1;i>=0;i--){const msg=arr[i];if(msg.role==='assistant'&&msg.executed&&msg.plan){target=msg;break;}}
  if(!target)for(let i=arr.length-1;i>=0;i--){const msg=arr[i];if(msg.role==='assistant'&&msg.plan){target=msg;msg.executed=true;break;}}
  if(!target)return;
  if(!Array.isArray(target.trace))target.trace=[];
  target.trace.push(m);if(target.trace.length>40)target.trace=target.trace.slice(-40);
  renderMessages();persistSoon();
}
window.onPilotEvent=ev=>{try{if(typeof ev==='string')ev=JSON.parse(ev);}catch(_){return;}if(!ev||typeof ev.message!=='string')return;const m=ev.message;
  if(ev.type==='chatStep'){appendTrace(m);toast(m);return;}
  if(ev.type==='error'){if(pending){pending=null;controls();}chatBusy=false;const arr=ownerMessages();chatOwnerSession='';syncSendButton();if(arr){const t=arr[arr.length-1];if(t&&t.pending){t.error=m;t.pending=false;}}renderMessages();persistSoon();toast(m,true);return;}if(ev.type==='busy')return;if(ev.type==='chatHint'){toast(m);return;}if(ev.type==='result'){text('result-text',m);$('result-panel').hidden=false;if(['search','test'].includes(lastAction)||page!=='deck')openSheet({title:lastAction==='test'?'模型测试反馈':lastAction==='search'?'搜索结果':'任务结果',kicker:'RESPONSE',detail:m});else{toast('任务结果已收到。');$('result-panel').scrollIntoView({block:'nearest',behavior:'auto'});}return;}if(ev.type==='import'){category='';$('skill-search').value='';invoke('state');}if(ev.type==='status'&&pending&&lastAction==='save')ackSave();toast(m);};
window.onPilotChat=value=>{
  try{if(typeof value==='string')value=JSON.parse(value);}catch(_){return;}
  if(!value||typeof value!=='object')return;
  chatBusy=false;chatOwnerSession='';syncSendButton();
  const mode=['ask','plan','crafts'].includes(value.mode)?value.mode:'ask';
  const answer=typeof value.message==='string'?value.message.slice(0,CHAT_TEXT_MAX):'';
  // Only accept a plan whose steps is an array; sanitise each entry at render time too.
  let plan=null;
  if(value.plan&&typeof value.plan==='object'&&Array.isArray(value.plan.steps))plan=value.plan;
  // Write the answer back into the session that sent the request. If that session was
  // deleted mid-flight, drop the reply instead of polluting the current conversation.
  const arr=ownerMessages();
  if(!arr){chatOwnerSession='';return;}
  let t=null;for(let i=arr.length-1;i>=0;i--)if(arr[i].pending){t=arr[i];break;}
  if(!t){arr.push({role:'assistant',text:'',mode});t=arr[arr.length-1];}
  t.pending=false;t.text=answer||(plan?'已生成操作计划，请查看下方卡片。':'');t.mode=mode;if(plan)t.plan=plan;
  if(arr===messages)trimMessages();
  renderMessages();persistSoon();
};
const mq=window.matchMedia('(prefers-reduced-motion: reduce)');let override=null;try{const saved=localStorage.getItem('pilot.reduced');if(saved==='true'||saved==='false')override=saved==='true';}catch(_){}
function motion(){const less=override===null?mq.matches:override;document.documentElement.classList.toggle('reduce',less);$('motion-toggle').setAttribute('aria-checked',String(less));text('motion-label',less?'已启用 · 展示静态光学图形':'未启用 · 光学图形随触控响应');window.dispatchEvent(new Event('pilot-visibility'));}
on('motion-toggle',()=>{override=$('motion-toggle').getAttribute('aria-checked')!=='true';try{localStorage.setItem('pilot.reduced',String(override));}catch(_){}motion();});if(mq.addEventListener)mq.addEventListener('change',motion);else if(mq.addListener)mq.addListener(motion);
list('.mode-tab').forEach(b=>on(b.id,()=>setMode(b.dataset.mode)));
window.addEventListener('pageshow',()=>invoke('state'));document.addEventListener('visibilitychange',()=>{if(!document.hidden){invoke('state');persist();}});window.addEventListener('pagehide',()=>persist());
loadSessions();motion();renderDeck();renderSettings();renderSkills();renderSessionBar();setMode(chatMode);renderMessages();renderPromptChips();invoke('state');
})();
