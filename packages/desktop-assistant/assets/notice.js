"use strict";
(async()=>{
 let revision=-1,lastSize="",queued=false;
 const card=document.querySelector(".notice-card"),title=document.getElementById("notice-title"),message=document.getElementById("notice-message"),more=document.getElementById("notice-more");
 const layout=()=>{
   queued=false;
   // Measure an unconstrained copy at the actual width; capped windows show a preview.
   const copy=card.cloneNode(true);copy.removeAttribute("aria-label");copy.setAttribute("aria-hidden","true");
   Object.assign(copy.style,{position:"fixed",left:"-20000px",top:"0",width:`${card.getBoundingClientRect().width}px`,height:"auto",visibility:"hidden"});
   copy.querySelectorAll("[id]").forEach(el=>{if(el.id==="notice-more")el.hidden=true;el.removeAttribute("id");el.style.webkitLineClamp="unset";el.style.overflow="visible";});
   document.body.append(copy);const height=Math.min(16384,Math.ceil(copy.getBoundingClientRect().height+16));copy.remove();
   const key=`${revision}:${height}:${innerWidth}`;
   if(revision>=0&&key!==lastSize){lastSize=key;window.assistant.sizeNotice({revision,height}).catch(()=>{});}
   more.hidden=true;title.style.webkitLineClamp="unset";message.style.webkitLineClamp="unset";
   if(title.scrollHeight+message.scrollHeight+4>document.getElementById("notice-content").clientHeight)title.style.webkitLineClamp="3";
   const fit=()=>{const available=document.getElementById("notice-content").clientHeight-title.getBoundingClientRect().height-4;message.style.webkitLineClamp=String(Math.max(1,Math.floor(available/parseFloat(getComputedStyle(message).lineHeight))));};
   fit();
   if(title.scrollHeight>title.clientHeight+1||message.scrollHeight>message.clientHeight+1){more.hidden=false;fit();}
 };
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(layout);}};
 new ResizeObserver(schedule).observe(document.body);
 window.addEventListener("resize",schedule);
 window.addEventListener("assistant-voice-layout",schedule);
 const update=state=>{
   if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;
   revision=state.revision;
   document.getElementById("notice-title").textContent=state.title||"操舵室からのお知らせ";
   document.getElementById("notice-message").textContent=state.message||"";
   schedule();
 };
 const off=window.assistant.onNotice(update);
 window.addEventListener("pagehide",off,{once:true});
 document.getElementById("notice-open").addEventListener("click",()=>window.assistant.openNotice({revision}).catch(()=>{}));
 document.getElementById("dismiss").addEventListener("click",()=>window.assistant.dismissNotice({revision}).catch(()=>{}));
 update(await window.assistant.noticeState());
})();

(()=>{const stop=document.getElementById("voice-stop");let revision=-1;const update=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;revision=state.revision;stop.hidden=!state.speaking;window.dispatchEvent(new Event("assistant-voice-layout"));};const off=window.assistant.onVoice(update);window.addEventListener("pagehide",off,{once:true});window.assistant.voiceState().then(update).catch(()=>{});stop.onclick=()=>window.assistant.stopVoice();})();
