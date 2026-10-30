"use strict";
(()=>{
 const api=window.assistant,element=id=>document.getElementById(id),status=element("reminder-status");let revision=-1,busy=false,connected=false;
 const update=state=>{if(state.revision<=revision)return;revision=state.revision;connected=state.connected;element("reminder-save").disabled=busy||!connected;status.textContent=state.message;element("reminder-jobs").replaceChildren();
  for(const job of state.jobs){const row=document.createElement("li");row.textContent=`${job.label}：${job.enabled?new Date(job.nextRunAt).toLocaleString():"実行済み"} `;const remove=document.createElement("button");remove.type="button";remove.textContent="削除";remove.onclick=()=>api.removeReminder({id:job.id}).catch(report);row.append(remove);element("reminder-jobs").append(row);}
  document.querySelectorAll(".reminder-message").forEach(row=>row.remove());
  for(const run of state.runs){const row=document.createElement("p");row.className="spoken reminder-message";row.textContent=`お知らせです。${run.input}`;const ack=document.createElement("button");ack.type="button";ack.textContent="確認しました";ack.onclick=()=>api.acknowledgeReminder({id:run.id}).catch(report);row.append(ack);element("conversation").append(row);}
 };
 const report=error=>{status.textContent=error.message||"予約を確認できません。繰り返す前に一覧で確認してください。";};
 element("reminder-save").onclick=async()=>{if(busy||!connected)return;busy=true;element("reminder-save").disabled=true;try{const date=new Date(element("reminder-date").value);if(!Number.isFinite(date.getTime()))throw Error("日時を指定してください。");await api.saveReminder({label:element("reminder-label").value,text:element("reminder-text").value,at:date.toISOString()});status.textContent="予約しました。";}catch(error){report(error);}finally{busy=false;element("reminder-save").disabled=!connected;}};
 api.onReminders(update);api.reminders().then(update).catch(report);
})();
