"use strict";
(async()=>{
 let revision=-1;
 const update=state=>{
   if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;
   revision=state.revision;
   document.getElementById("notice-title").textContent=state.title||"操舵室からのお知らせ";
   document.getElementById("notice-message").textContent=state.message||"";
 };
 const off=window.assistant.onNotice(update);
 window.addEventListener("pagehide",off,{once:true});
 document.getElementById("notice-open").addEventListener("click",()=>window.assistant.openNotice({revision}).catch(()=>{}));
 document.getElementById("dismiss").addEventListener("click",()=>window.assistant.dismissNotice({revision}).catch(()=>{}));
 update(await window.assistant.noticeState());
})();

(()=>{const stop=document.getElementById("voice-stop");let revision=-1;const update=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;revision=state.revision;stop.hidden=!state.speaking;};const off=window.assistant.onVoice(update);window.addEventListener("pagehide",off,{once:true});window.assistant.voiceState().then(update).catch(()=>{});stop.onclick=()=>window.assistant.stopVoice();})();
