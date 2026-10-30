"use strict";
(async () => {
 const preferences = await window.assistant.read();
 const names = { "captain-male": "船長", "captain-female": "船長", "captain-robot": "ロボット船長" };
 const character = Object.hasOwn(names, preferences.characterId) ? preferences.characterId : "captain-female";
 document.getElementById("portrait").src = `${character}.svg`;
 document.getElementById("captain-name").textContent = names[character];
 document.getElementById("open").addEventListener("click", () => window.assistant.open());
 document.getElementById("settings").addEventListener("click", () => window.assistant.settings());
 document.getElementById("hide").addEventListener("click", () => window.assistant.hide());
 const log = document.getElementById("conversation");
 const stateText = { connected: "通知を受信しています。", connecting: "操舵室へ接続しています。", login: "操舵室にログインすると、作業の知らせをお届けします。", offline: "操舵室との接続が切れました。再接続を待っています。", disabled: "アシスタントは無効です。" };
 let revision = -1;
 const update = state => {
   if (!Number.isSafeInteger(state.revision) || state.revision <= revision) return;
   revision = state.revision;
   document.getElementById("status").textContent = stateText[state.status] || "接続状態を確認しています。";
   log.querySelectorAll(".notice").forEach(element => element.remove());
   for (const notice of state.notices) {
     const entry = document.createElement("p"); entry.className = "spoken notice";
     entry.textContent = notice.message;
     log.append(entry);
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
