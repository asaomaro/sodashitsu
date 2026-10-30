"use strict";
(async () => {
 const preferences = await window.assistant.read();
 const builtin = ["captain-male", "captain-female", "captain-robot"].includes(preferences.characterId) ? preferences.characterId : "captain-female";
 document.getElementById("portrait").src = `${builtin}.svg`;
 document.getElementById("captain").addEventListener("click", () => window.assistant.chat());
 document.getElementById("settings").addEventListener("click", () => window.assistant.settings());
})().catch(() => { document.getElementById("captain").disabled = true; });
