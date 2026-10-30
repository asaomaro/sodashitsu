"use strict";
(async () => {
 const preferences = await window.assistant.read();
 const portrait=await window.assistant.characterInfo();
 document.getElementById("portrait").src=portrait.uri;document.getElementById("portrait").alt=portrait.name;
 document.getElementById("captain").addEventListener("click", () => window.assistant.chat());
 document.getElementById("settings").addEventListener("click", () => window.assistant.settings());
})().catch(() => { document.getElementById("captain").disabled = true; });
