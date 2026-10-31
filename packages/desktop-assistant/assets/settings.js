"use strict";
let current;
const fields = ["enabled", "mode", "characterId", "characterSize", "serverOrigin", "reducedMotion", "mute", "transcriptionEnabled", "transcriptionProvider", "transcriptionOrigin", "ocrEnabled", "ocrProvider", "ocrExecutable", "ocrLanguage", "allowPluginCharacters", "allowPluginViews", "allowPluginActions", "remoteNotifications", "quietFullscreen"];
const status = document.getElementById("status");
function display(preferences) {
 current = preferences;
 for(const kind of ["claude","codex"]) for(const key of ["model","effort"]) document.getElementById(`${kind}-${key}`).value=preferences.agentProfiles?.[kind]?.[key]??"";
 for (const key of fields) {
  const element = document.getElementById(key);
  if (element.type === "checkbox") element.checked = preferences[key];
  else element.value = preferences[key] ?? (key === "ocrProvider" ? "agent" : "");
 }
 const selector=document.getElementById("displayId"),position=preferences.position;
 if(position&&!Array.from(selector.options).some(option=>option.value===position.displayId)){const option=document.createElement("option");option.value=position.displayId;option.textContent=`未接続：${position.displayId}`;selector.append(option);}
 selector.value=position?.displayId??"";document.getElementById("positionX").value=String(position?.x??0);document.getElementById("positionY").value=String(position?.y??0);
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
Promise.all([window.assistant.read(),window.assistant.characters(),window.assistant.displays()]).then(([preferences,catalog,displays])=>{
 const selector=document.getElementById("displayId");for(const display of displays){const option=document.createElement("option");option.value=display.id;option.textContent=display.label;selector.append(option);}
 selector.onchange=()=>{const display=displays.find(display=>display.id===selector.value);if(!display)return;const size=Number(document.getElementById("characterSize").value)||192;document.getElementById("positionX").value=String(Math.round(display.workArea.x+display.workArea.width-size-16));document.getElementById("positionY").value=String(Math.round(display.workArea.y+display.workArea.height-size-16));};
 characterList(catalog);display(preferences);
}).catch(() => { status.textContent = "設定を読み込めません。アプリを再起動してください。"; });
document.getElementById("form").addEventListener("submit", async event => {
 event.preventDefault();
 if (!current) return;
 const button = event.submitter;
 button.disabled = true;
 try {
  const next = { ...current, agentProfiles: Object.fromEntries(["claude","codex"].map(kind=>[kind,Object.fromEntries(["model","effort"].map(key=>[key,document.getElementById(`${kind}-${key}`).value.trim()]))])) };
  for (const key of fields) {
   const element = document.getElementById(key);
   next[key] = element.type === "checkbox" ? element.checked : element.type === "number" ? Number(element.value) : element.value;
  }
  const displayId=document.getElementById("displayId").value;next.position=displayId?{displayId,x:Number(document.getElementById("positionX").value),y:Number(document.getElementById("positionY").value)}:null;
  display(await window.assistant.save(next));
  status.textContent = "保存しました。";
 } catch (error) { status.textContent = `保存できません: ${error.message}`; }
 finally { button.disabled = false; }
});
document.getElementById("open").addEventListener("click", () => window.assistant.open());
