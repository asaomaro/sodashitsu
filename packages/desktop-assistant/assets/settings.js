"use strict";
let current;
const fields = ["enabled", "mode", "characterId", "characterSize", "serverOrigin", "launchAtLogin", "reducedMotion", "mute", "transcriptionEnabled", "transcriptionOrigin"];
const status = document.getElementById("status");
function display(preferences) {
 current = preferences;
 for (const key of fields) {
  const element = document.getElementById(key);
  if (element.type === "checkbox") element.checked = preferences[key];
  else element.value = preferences[key];
 }
 document.getElementById("open").disabled = !preferences.enabled;
}
window.assistant.read().then(display).catch(() => { status.textContent = "設定を読み込めません。アプリを再起動してください。"; });
document.getElementById("form").addEventListener("submit", async event => {
 event.preventDefault();
 if (!current) return;
 const button = event.submitter;
 button.disabled = true;
 try {
  const next = { ...current };
  for (const key of fields) {
   const element = document.getElementById(key);
   next[key] = element.type === "checkbox" ? element.checked : element.type === "number" ? Number(element.value) : element.value;
  }
  display(await window.assistant.save(next));
  status.textContent = "保存しました。";
 } catch (error) { status.textContent = `保存できません: ${error.message}`; }
 finally { button.disabled = false; }
});
document.getElementById("open").addEventListener("click", () => window.assistant.open());
