"use strict";
(async () => {
 const preferences = await window.assistant.read();
 document.getElementById("open-tools").onclick=()=>window.assistant.openTools().catch(error=>{document.getElementById("status").textContent=error.message;});
 const portrait=await window.assistant.characterInfo();
 document.getElementById("portrait").src=portrait.uri;
 document.getElementById("captain-name").textContent=portrait.name;
 const greeting=document.querySelector("#conversation > .spoken:not([id])");if(greeting&&portrait.greeting)greeting.textContent=portrait.greeting;
 document.getElementById("expand-session").addEventListener("click",()=>window.assistant.openSession().catch(error=>{document.getElementById("status").textContent=error.message;}));
 document.getElementById("open").addEventListener("click", () => window.assistant.open());
 document.getElementById("settings").addEventListener("click", () => window.assistant.settings());
 document.getElementById("hide").addEventListener("click", () => window.assistant.hide());
 const log = document.getElementById("conversation");
 const stateText = { connected: "通知を受信しています。", connecting: "操舵室へ接続しています。", login: "操舵室にログインすると、作業の知らせをお届けします。", offline: "操舵室との接続が切れました。再接続を待っています。", disabled: "アシスタントは無効です。" };
 const noticeRows=new Map();
 let noticeFocusRevision=-1;
 const notificationIndicator=document.getElementById("notification-indicator");
 let notification=null,readNotificationSequence=-1;
 const acknowledgeNotification=id=>{
  if(notification && (!id || notification.id===id)){readNotificationSequence=notification.seq;notificationIndicator.hidden=true;}
 };
 notificationIndicator.onclick=async()=>{
  const current=notification;if(!current)return;
  try{
   if(current.id&&noticeRows.has(current.id)){await window.assistant.readNotice({noticeId:current.id});selectNotice(current.id);}
   else {const target=document.getElementById("reminder-notices");if(target&&!target.hidden)target.scrollIntoView({block:"start"});else document.getElementById("status").textContent=current.message;}
   if(notification?.seq===current.seq)acknowledgeNotification();
  }catch(error){document.getElementById("status").textContent=error.message;}
 };
 const selectNotice=id=>{
  const row=noticeRows.get(id);
  for(const item of noticeRows.values())item.classList.toggle("notice-current",item===row);
  if(!row)return;
  row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:"start"});
 };
 const inbox=document.getElementById("notices");
 let agentList={agents:[],total:0,working:0,blocked:0}, rosterStatus="connecting";
 const agentStates={working:"作業中",blocked:"確認待ち",idle:"待機中",unknown:"状態不明"};
 const renderAgents=()=>{
   const list=document.getElementById("agent-roster-rows"), filter=document.getElementById("agent-filter").value;
   document.getElementById("agent-roster-summary").textContent=`エージェント一覧（${agentList.total}件・作業中 ${agentList.working}件・確認待ち ${agentList.blocked}件）`;
   const rows=agentList.agents.filter(row=>filter==="all"||row.state===filter);
   const previousScroll=list.scrollTop;
   list.replaceChildren();
   for(const row of rows){
     const item=document.createElement("li"), state=document.createElement("span"), title=document.createElement("span");
     state.className=`agent-state agent-state-${row.state}`;state.textContent=agentStates[row.state]||"状態不明";
     title.textContent=row.title;item.append(state,title);list.append(item);
   }
   list.scrollTop=previousScroll;
   const status=document.getElementById("agent-roster-status");
   status.textContent=rows.length ? (agentList.total>agentList.agents.length?`全${agentList.total}件のうち先頭${agentList.agents.length}件を表示しています。`:"") : (agentList.total>agentList.agents.length?`表示対象の先頭${agentList.agents.length}件に、該当するエージェントはいません。全${agentList.total}件は操舵室で確認できます。`:rosterStatus==="connected"?"該当するエージェントはいません。":"接続中のマシンに、表示できるエージェントはいません。");
   status.hidden=rows.length>0&&!status.textContent;
 };
 document.getElementById("agent-filter").addEventListener("change",renderAgents);
 let revision = -1;
 const update = state => {
   if (!Number.isSafeInteger(state.revision) || state.revision <= revision) return;
   revision = state.revision;
   agentList=state.agentList||{agents:[],total:0,working:0,blocked:0};rosterStatus=state.status;renderAgents();
   document.getElementById("status").textContent = stateText[state.status] || "接続状態を確認しています。";
   const present=new Set(state.notices.map(notice=>notice.id));
   notification=state.latestNotification??null;
   if(notification?.id&&!present.has(notification.id))readNotificationSequence=Math.max(readNotificationSequence,notification.seq);
   notificationIndicator.hidden=!notification||notification.seq<=readNotificationSequence;
   if(notification){notificationIndicator.textContent=`新しい通知：${notification.title}`;notificationIndicator.title=notification.message;}
   inbox.hidden=state.notices.length===0;
   let added=false;
   for(const [id,row] of noticeRows)if(!present.has(id)){row.remove();noticeRows.delete(id);}
   for (const notice of [...state.notices].reverse()) {
     if(noticeRows.has(notice.id)){
       const row=noticeRows.get(notice.id);
       row.querySelector(".notice-text").textContent=notice.message;
       const title=row.querySelector(".notice-title-button");title.textContent=title.title=notice.title || "通知元";
       continue;
     }
     const entry = document.createElement("p"); entry.className = "spoken notice";
     const words=document.createElement("span");words.className="notice-text";words.textContent=notice.message;
     const open=document.createElement("button");open.type="button";open.textContent="小窓で応答";
     open.addEventListener("click",()=>window.assistant.openSource({noticeId:notice.id,destination:"reply"}).catch(error=>{document.getElementById("status").textContent=error.message;}));
     const main=document.createElement("button");main.type="button";main.textContent="操舵室で開く";
     main.addEventListener("click",()=>window.assistant.openSource({noticeId:notice.id,destination:"main"}).catch(error=>{document.getElementById("status").textContent=error.message;}));
     const reply=document.createElement("textarea");reply.rows=2;reply.maxLength=8192;reply.setAttribute("aria-label",`${notice.title || "通知元"}への返答`);
     const submit=document.createElement("button");submit.type="button";submit.textContent="この通知元へ返答";
     const report=error=>{document.getElementById("status").textContent=error.message;};
     submit.addEventListener("click",async()=>{if(!reply.value.trim())return;submit.disabled=true;try{await window.assistant.replySource({noticeId:notice.id,text:reply.value});reply.value="";}catch(error){report(error);}finally{submit.disabled=false;}});
     const destination=document.createElement("small"),read=document.createElement("button");read.type="button";read.className="notice-title-button";read.textContent=notice.title || "通知元";
     read.title="この通知の内容を確認";
     read.addEventListener("click",()=>window.assistant.readNotice({noticeId:notice.id}).then(()=>{selectNotice(notice.id);acknowledgeNotification(notice.id);}).catch(report));destination.append(read);
     destination.title=notice.title || "通知元";
     const actions=document.createElement("span");actions.className="notice-actions";actions.append(open,main);
     entry.append(destination,actions,words);
     if(notice.kind!=="question")entry.append(reply,submit);
     if(notice.kind==="attention") for(const [keyName,label]of [["Enter","Enterで確認"],["Escape","Escで戻る"],["y","yを送信"],["n","nを送信"]]){
       const key=document.createElement("button");key.type="button";key.textContent=label;key.onclick=async()=>{key.disabled=true;try{await window.assistant.sourceKey({noticeId:notice.id,keyName});}catch(error){report(error);}finally{key.disabled=false;}};entry.append(key);
     }
     noticeRows.set(notice.id,entry);inbox.prepend(entry);added=true;
   }
   if(added)inbox.scrollTop=0;
   if(Number.isSafeInteger(state.noticeFocusRevision)&&state.noticeFocusRevision>noticeFocusRevision){
     noticeFocusRevision=state.noticeFocusRevision;selectNotice(state.focusedNoticeId);
   }
 };
 const unsubscribe = window.assistant.onInbox(update);
 window.addEventListener("pagehide", unsubscribe, {once:true});
 update(await window.assistant.inbox());
 let chatRevision = -1, chatState = null;
 const message = document.getElementById("message");
 let draftRevision=-1;
 const updateDraft=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=draftRevision)return;draftRevision=state.revision;if(state.text!==null){message.value=state.text;message.focus();void window.assistant.consumeDraft({revision:state.revision}).catch(()=>{});}};
 const offDraft=window.assistant.onDraft(updateDraft);window.addEventListener("pagehide",offDraft,{once:true});window.assistant.draftState().then(updateDraft).catch(()=>{});
 const send = document.getElementById("send");
 const kinds = document.getElementById("agent-kind");
 const start = document.getElementById("start-session");
 const adopt = document.getElementById("adopt-session");
 const sessionStatus = document.getElementById("session-status");
 const updateChat = state => {
   if (!Number.isSafeInteger(state.revision) || state.revision <= chatRevision) return;
   chatRevision = state.revision; chatState = state;
   const follow = log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
   const info = state.session;
   const target = info?.agent;
   document.getElementById("session-controls").hidden = !!info && ["ready", "starting"].includes(info.state);
   document.getElementById("destination").textContent = info ? `専用アシスタント・${info.kind}・${info.paneId.slice(0,8)}` : "専用アシスタント";
   document.getElementById("connection").hidden = true;
   sessionStatus.textContent = state.hint;
   const canSend = state.connected && !state.busy && info?.state === "ready" && target?.state === "idle";
   message.disabled = send.disabled = !canSend;
   message.placeholder = canSend ? "船長へのメッセージ" : "専用セッションの接続を確認してください";
   const launch=info?.launchSettings, desired=state.launchProfiles?.[info?.kind];
   const requested=launch ? `起動時指定：モデル ${launch.model||"既定値"} / effort ${launch.effort||"既定値"}` : "起動時のモデル・effort指定は不明です";
   const differs=launch&&desired&&(launch.model!==desired.model||launch.effort!==desired.effort);
   document.getElementById("launch-settings").textContent=info ? `${requested}${differs?"。保存済み設定と異なります。停止後、新しく開始すると反映します。":""}（CLI内での変更は追跡しません）` : "モデル・effortは設定画面で指定できます。";
   const before = kinds.value;
   const options = state.kinds.filter(kind => kind.available);
   const signature = JSON.stringify(options);
   if (kinds.dataset.signature !== signature) {
     kinds.replaceChildren(); kinds.dataset.signature = signature;
     for (const kind of options) {
       const option = document.createElement("option"); option.value = kind.kind; option.textContent = kind.label;
       kinds.append(option);
     }
     if (options.some(kind => kind.kind === before)) kinds.value = before;
     else if (info && options.some(kind => kind.kind === info.kind)) kinds.value = info.kind;
   }
   if (info && info.state !== "stopped" && options.some(kind => kind.kind === info.kind)) kinds.value = info.kind;
   kinds.disabled = !!info && info.state !== "stopped";
   start.disabled = !state.connected || state.busy || !options.length || !!info && !["shell","stopped"].includes(info.state);
   start.textContent = info?.state === "stopped" ? "旧端末を残して新しく開始" : "専用セッションを開始";
   adopt.hidden = !(state.connected && info?.state === "conflict" && info.observedAgent);
   adopt.disabled = state.busy;
   adopt.textContent = info?.observedAgent ? `このエージェントを使う（${info.observedAgent.kind}・${info.observedAgent.instanceId.slice(0,8)}）` : "このエージェントを使う";
   log.querySelectorAll(".chat-message").forEach(element => element.remove());
   for (const entry of state.messages) {
     const paragraph = document.createElement("p"); paragraph.className = `spoken chat-message ${entry.role}`;
     paragraph.textContent = entry.text; log.append(paragraph);
   }
   if (follow) log.scrollTop = log.scrollHeight;
 };
 const report = error => { sessionStatus.textContent = error?.message || "操作を確認できませんでした。"; };
 start.addEventListener("click", () => {
   if (chatState) window.assistant.startSession({ revision: chatState.revision, kind: kinds.value, retry: chatState.session?.state === "stopped" }).catch(report);
 });
 adopt.addEventListener("click", () => {
   const actor = chatState?.session?.observedAgent;
   if (actor) window.assistant.adoptSession({ revision: chatState.revision, instanceId: actor.instanceId }).catch(report);
 });
 document.getElementById("chat").addEventListener("submit", async event => {
   event.preventDefault();
   const actor = chatState?.session?.agent;
   const text = message.value;
   if (!actor || send.disabled || !text.trim()) return;
   try {
     await window.assistant.sendMessage({ revision: chatState.revision, instanceId: actor.instanceId, text });
     if (message.value === text) message.value = "";
   } catch (error) { report(error); }
 });
 const unsubscribeChat = window.assistant.onConversation(updateChat);
 window.addEventListener("pagehide", unsubscribeChat, {once:true});
 updateChat(await window.assistant.conversation());
 document.addEventListener("keydown", event => { if (event.key === "Escape") window.assistant.hide(); });
})().catch(() => { document.getElementById("status").textContent = "設定を読み込めませんでした。"; });

(()=>{const stop=document.getElementById("voice-stop");let revision=-1;const update=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;revision=state.revision;stop.hidden=!state.speaking;};const off=window.assistant.onVoice(update);window.addEventListener("pagehide",off,{once:true});window.assistant.voiceState().then(update).catch(()=>{});stop.onclick=()=>window.assistant.stopVoice();})();
