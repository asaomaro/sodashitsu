"use strict";
(()=>{
 const container=document.getElementById("reminder-notices");let revision=-1;
 const update=state=>{
  if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;revision=state.revision;
  container.replaceChildren();container.hidden=!state.runs.length;
  for(const run of state.runs){const row=document.createElement("p");row.className="spoken reminder-message";row.textContent=`リマインダー：${run.input}`;const ack=document.createElement("button");ack.type="button";ack.textContent="確認しました";ack.onclick=async()=>{ack.disabled=true;try{await window.assistant.acknowledgeReminder({id:run.id});}catch(error){document.getElementById("status").textContent=error.message;}finally{ack.disabled=false;}};row.append(ack);container.append(row);}
 };
 const off=window.assistant.onReminders(update);window.addEventListener("pagehide",off,{once:true});window.assistant.reminders().then(update).catch(()=>{});
})();
