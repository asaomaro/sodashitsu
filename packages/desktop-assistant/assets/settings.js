"use strict";
let current;
const fields = ["enabled", "mode", "characterId", "characterSize", "serverOrigin", "launchAtLogin", "reducedMotion", "mute", "transcriptionEnabled", "transcriptionOrigin", "ocrEnabled", "ocrExecutable", "ocrLanguage", "allowPluginCharacters", "allowPluginViews", "allowPluginActions", "remoteNotifications"];
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
let pendingPack=null;
function characterList(data){
 const selector=document.getElementById("characterId");selector.querySelectorAll("option[data-plugin]").forEach(option=>option.remove());
 const packs=document.getElementById("character-pack-list");packs.replaceChildren();const packIds=new Set();
 for(const character of data.characters??data){const option=document.createElement("option");option.value=character.id;option.textContent=character.name;option.dataset.plugin="true";selector.append(option);if(!packIds.has(character.packId)){packIds.add(character.packId);const pack=document.createElement("option");pack.value=character.packId;pack.textContent=character.packId;packs.append(pack);}}
 if(data.error)status.textContent=data.error;
 if(current)selector.value=current.characterId;
}
document.getElementById("preview-character-pack").onclick=async()=>{try{const data=await window.assistant.previewCharacterPack();pendingPack=data;const preview=document.getElementById("character-pack-preview");preview.replaceChildren();if(data)for(const character of data.characters){const image=document.createElement("img");image.src=character.uri;image.alt=character.name;image.width=96;image.height=96;preview.append(image);}document.getElementById("import-character-pack").hidden=!data;}catch(error){status.textContent=error.message;}};
document.getElementById("import-character-pack").onclick=async()=>{if(!pendingPack)return;try{characterList(await window.assistant.importCharacterPack({token:pendingPack.token}));pendingPack=null;document.getElementById("import-character-pack").hidden=true;document.getElementById("character-pack-preview").replaceChildren();status.textContent="素材を追加しました。追加素材の表示を有効にし、船長を選んで保存してください。";}catch(error){status.textContent=error.message;}};
document.getElementById("remove-character-pack").onclick=async()=>{try{characterList(await window.assistant.removeCharacterPack({id:document.getElementById("character-pack-list").value}));}catch(error){status.textContent=error.message;}};
Promise.all([window.assistant.read(),window.assistant.characters()]).then(([preferences,catalog])=>{characterList(catalog);display(preferences);}).catch(() => { status.textContent = "設定を読み込めません。アプリを再起動してください。"; });
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
