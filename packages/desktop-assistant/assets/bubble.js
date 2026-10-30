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
 document.getElementById("chat").addEventListener("submit", event => event.preventDefault());
 document.addEventListener("keydown", event => { if (event.key === "Escape") window.assistant.hide(); });
})().catch(() => { document.getElementById("status").textContent = "設定を読み込めませんでした。"; });
