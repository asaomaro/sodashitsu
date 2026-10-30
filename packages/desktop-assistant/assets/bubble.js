"use strict";
(async () => {
 const preferences = await window.assistant.read();
 const portrait=await window.assistant.characterInfo();
 document.getElementById("portrait").src=portrait.uri;
 document.getElementById("captain-name").textContent=portrait.name;
 document.getElementById("expand-session").addEventListener("click",()=>window.assistant.openSession().catch(error=>{document.getElementById("status").textContent=error.message;}));
 document.getElementById("open").addEventListener("click", () => window.assistant.open());
 document.getElementById("settings").addEventListener("click", () => window.assistant.settings());
 document.getElementById("hide").addEventListener("click", () => window.assistant.hide());
 const log = document.getElementById("conversation");
 const stateText = { connected: "通知を受信しています。", connecting: "操舵室へ接続しています。", login: "操舵室にログインすると、作業の知らせをお届けします。", offline: "操舵室との接続が切れました。再接続を待っています。", disabled: "アシスタントは無効です。" };
 const noticeRows=new Map();
 let revision = -1;
 const update = state => {
   if (!Number.isSafeInteger(state.revision) || state.revision <= revision) return;
   revision = state.revision;
   document.getElementById("status").textContent = stateText[state.status] || "接続状態を確認しています。";
   const present=new Set(state.notices.map(notice=>notice.id));
   for(const [id,row] of noticeRows)if(!present.has(id)){row.remove();noticeRows.delete(id);}
   for (const notice of state.notices) {
     if(noticeRows.has(notice.id))continue;
     const entry = document.createElement("p"); entry.className = "spoken notice";
     const words=document.createElement("span");words.className="notice-text";words.textContent=notice.message;entry.append(words);
     const open=document.createElement("button");open.type="button";open.textContent="この端末・質問フォームを開く";
     open.addEventListener("click",()=>window.assistant.openSource({noticeId:notice.id}).catch(error=>{document.getElementById("status").textContent=error.message;}));
     const reply=document.createElement("textarea");reply.rows=2;reply.maxLength=8192;reply.setAttribute("aria-label",`${notice.title || "通知元"}への返答`);
     const submit=document.createElement("button");submit.type="button";submit.textContent="この通知元へ返答";
     const report=error=>{document.getElementById("status").textContent=error.message;};
     submit.addEventListener("click",async()=>{if(!reply.value.trim())return;submit.disabled=true;try{await window.assistant.replySource({noticeId:notice.id,text:reply.value});reply.value="";}catch(error){report(error);}finally{submit.disabled=false;}});
     const destination=document.createElement("small");destination.textContent=notice.title || "通知元";
     entry.append(document.createElement("br"),destination,open);
     if(notice.kind!=="question")entry.append(reply,submit);
     if(notice.kind==="attention") for(const [keyName,label]of [["Enter","Enterで確認"],["Escape","Escで戻る"],["y","yを送信"],["n","nを送信"]]){
       const key=document.createElement("button");key.type="button";key.textContent=label;key.onclick=async()=>{key.disabled=true;try{await window.assistant.sourceKey({noticeId:notice.id,keyName});}catch(error){report(error);}finally{key.disabled=false;}};entry.append(key);
     }
     noticeRows.set(notice.id,entry);log.append(entry);
   }
   log.scrollTop = log.scrollHeight;
 };
 const unsubscribe = window.assistant.onInbox(update);
 window.addEventListener("pagehide", unsubscribe, {once:true});
 update(await window.assistant.inbox());
 let chatRevision = -1, chatState = null;
 const message = document.getElementById("message");
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
