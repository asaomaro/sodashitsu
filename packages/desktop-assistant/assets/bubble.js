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
 document.getElementById("chat").addEventListener("submit", event => event.preventDefault());
 document.addEventListener("keydown", event => { if (event.key === "Escape") window.assistant.hide(); });
})().catch(() => { document.getElementById("status").textContent = "設定を読み込めませんでした。"; });
