"use strict";
let current;
const fields = ["enabled", "mode", "appearance", "colorTheme", "windowLayer", "characterId", "characterSize", "serverOrigin", "reducedMotion", "followSystemMotion", "idleFloating", "iconRotation", "mute", "voiceEnabled", "voiceFollowCharacter", "voiceCoreVersion", "voiceProvider", "voicevoxOrigin", "voicevoxStyleId", "transcriptionEnabled", "transcriptionProvider", "transcriptionOrigin", "ocrEnabled", "ocrProvider", "ocrExecutable", "ocrLanguage", "allowPluginCharacters", "allowPluginViews", "allowPluginActions", "remoteNotifications", "quietFullscreen"];
const status = document.getElementById("status");
function display(preferences) {
 current = preferences;
 for (const key of fields) {
  const element = document.getElementById(key);
  if (element.type === "checkbox") element.checked = (key === "followSystemMotion" || key === "iconRotation" || key === "voiceFollowCharacter") ? preferences[key] !== false : preferences[key];
  else {
   const defaults={windowLayer:"front",colorTheme:"sodashitsu-assistant-dark",appearance:"dark",voiceProvider:"system",voicevoxOrigin:"http://127.0.0.1:50021",voicevoxStyleId:2,ocrProvider:"agent"};
   const value=preferences[key]??defaults[key]??"";
   if(key==="voiceCoreVersion"&&value&&!Array.from(element.options).some(o=>o.value===value)){const o=document.createElement("option");o.value=value;o.textContent=value;element.append(o);}
   if(key==="voicevoxStyleId"&&!Array.from(element.options).some(o=>o.value===String(value))){const o=document.createElement("option");o.value=String(value);o.textContent=`保存済みの声（${value}）`;element.append(o);}
   element.value=value;
  }
 }
 const selector=document.getElementById("displayId"),position=preferences.position;
 if(position&&!Array.from(selector.options).some(option=>option.value===position.displayId)){const option=document.createElement("option");option.value=position.displayId;option.textContent=`未接続：${position.displayId}`;selector.append(option);}
 selector.value=position?.displayId??"";document.getElementById("positionX").value=String(position?.x??0);document.getElementById("positionY").value=String(position?.y??0);
 document.getElementById("open").disabled = !preferences.enabled;
 syncAppearanceFields(true);
 selectedPortrait();
 voiceFields();
 void syncCharacterVoice();
}
let pendingPack=null,characterCatalog=[];
function selectedPortrait(){
 document.getElementById("icon-rotation-setting").hidden=document.getElementById("characterId").value!=="sodashitsu-icon";
 const value=document.getElementById("characterId").value,character=characterCatalog.find(item=>item.id===value),image=document.getElementById("selected-character-preview");
 image.hidden=!character&&!/^(captain-(male|female|robot)|sodashitsu-icon)$/.test(value);
 if(!image.hidden){image.src=character?.uri||`${value}.${value==="sodashitsu-icon"?"svg":"png"}`;image.alt=character?.name||"選択中の立ち絵";}
 document.getElementById("selected-character-credit").textContent=character?.credit||"";
 const persona=character?.persona;document.getElementById("selected-character-persona").textContent=persona?`一人称：${persona.first.join("／")}。口調：${persona.tone}`:character?"専用の口調設定はありません。":"";
}
document.getElementById("characterId").addEventListener("change",()=>{selectedPortrait();void syncCharacterVoice(true);});
function showPack(data){
 pendingPack=data;const preview=document.getElementById("character-pack-preview");preview.replaceChildren();
 if(data)for(const character of data.characters){const image=document.createElement("img");image.src=character.uri;image.alt=character.name;image.width=72;image.height=96;preview.append(image);}
 document.getElementById("import-character-pack").hidden=!data;
 if(data)status.textContent=`${data.name}：${data.characters.length}件${data.animationCount?`（${data.animationCount}件に表情差分）`:""}。確認して追加してください。${(data.warnings||[]).join(" ")}`;
}
document.getElementById("preview-yukkuri-characters").onclick=async()=>{const button=document.getElementById("preview-yukkuri-characters");button.disabled=true;status.textContent="立ち絵と表情・ポーズ素材を読み込んでいます。";try{showPack(await window.assistant.previewYukkuriCharacters());}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
function characterList(data){
 characterCatalog=data.characters??data;
 const selector=document.getElementById("characterId");selector.querySelectorAll("option[data-plugin]").forEach(option=>option.remove());
 const packs=document.getElementById("character-pack-list");packs.replaceChildren();const packIds=new Set();
 for(const character of data.characters??data){const option=document.createElement("option");option.value=character.id;option.textContent=character.name;option.dataset.plugin="true";selector.append(option);if(!packIds.has(character.packId)){packIds.add(character.packId);const pack=document.createElement("option");pack.value=character.packId;pack.textContent=character.packId==="yukkuri-work"?"フォルダから取り込んだキャラクター":character.packId;packs.append(pack);}}
 if(data.error)status.textContent=data.error;
 if(current)selector.value=current.characterId;selectedPortrait();
}
document.getElementById("preview-character-pack").onclick=async()=>{try{const data=await window.assistant.previewCharacterPack();pendingPack=data;const preview=document.getElementById("character-pack-preview");preview.replaceChildren();if(data)for(const character of data.characters){const image=document.createElement("img");image.src=character.uri;image.alt=character.name;image.width=96;image.height=96;preview.append(image);}document.getElementById("import-character-pack").hidden=!data;}catch(error){status.textContent=error.message;}};
document.getElementById("import-character-pack").onclick=async()=>{if(!pendingPack)return;try{const installed=await window.assistant.importCharacterPack({token:pendingPack.token});characterList(installed);document.getElementById("allowPluginCharacters").checked=true;queueSettings(["allowPluginCharacters"]);pendingPack=null;document.getElementById("import-character-pack").hidden=true;document.getElementById("character-pack-preview").replaceChildren();status.textContent=installed.error||"素材を追加しました。立ち絵を選ぶと自動で反映します。";}catch(error){status.textContent=error.message;}};
document.getElementById("remove-character-pack").onclick=async()=>{try{characterList(await window.assistant.removeCharacterPack({id:document.getElementById("character-pack-list").value}));}catch(error){status.textContent=error.message;}};
Promise.all([window.assistant.read(),window.assistant.characters(),window.assistant.displays()]).then(([preferences,catalog,displays])=>{
 const selector=document.getElementById("displayId");for(const display of displays){const option=document.createElement("option");option.value=display.id;option.textContent=display.label;selector.append(option);}
 selector.onchange=()=>{const display=displays.find(display=>display.id===selector.value);if(!display)return;const size=Number(document.getElementById("characterSize").value)||192;document.getElementById("positionX").value=String(Math.round(display.workArea.x+display.workArea.width-size-16));document.getElementById("positionY").value=String(Math.round(display.workArea.y+display.workArea.height-size-16));};
 characterList(catalog);display(preferences);
}).catch(() => { status.textContent = "設定を読み込めません。アプリを再起動してください。"; });
// Save only changed settings, serially. A completed write must never redraw newer drafts.
const pendingSettings=[],failedSettings=[],invalidSettings=new Set();let savingSettings=false,settingsError="";
function forgetSettings(keys){for(const rows of [pendingSettings,failedSettings])for(const patch of rows)for(const key of keys)delete patch[key];}
function settingValue(key){
 if(key==="position"){const displayId=document.getElementById("displayId").value;return displayId?{displayId,x:Number(document.getElementById("positionX").value),y:Number(document.getElementById("positionY").value)}:null;}
 const element=document.getElementById(key);
 return element.type==="checkbox"?element.checked:(element.type==="number"||key==="voicevoxStyleId")?Number(element.value):element.value;
}
function queueSettings(keys){
 if(!current)return;
 const ids=keys.flatMap(key=>key==="position"?["positionX","positionY"]:[key]);
 if(ids.some(id=>!document.getElementById(id).checkValidity())){forgetSettings(keys);for(const key of keys)invalidSettings.add(key);status.textContent="入力内容を確認してください。変更はまだ反映されていません。";return;}
 forgetSettings(keys);for(const key of keys)invalidSettings.delete(key);
 pendingSettings.push(...failedSettings.splice(0),Object.fromEntries(keys.map(key=>[key,settingValue(key)])));
 void saveSettings();
}
async function saveSettings(){
 if(savingSettings||!pendingSettings.length)return;
 savingSettings=true;
 try{
  while(pendingSettings.length){
   const patch=pendingSettings.shift();if(!Object.keys(patch).length)continue;
   status.textContent="反映中…";
   try{
    // Preserve position/captain changes made by other windows since this form opened.
    current=await window.assistant.save({...await window.assistant.read(),...patch});
    document.getElementById("open").disabled=!current.enabled;
   }catch(error){
    // A rejected field must not prevent unrelated settings from being applied.
    for(const key of Object.keys(patch))if(invalidSettings.has(key)||pendingSettings.some(next=>Object.hasOwn(next,key)))delete patch[key];
    if(Object.keys(patch).length)failedSettings.push(patch);
    settingsError=error.message;
   }
  }
  status.textContent=failedSettings.some(patch=>Object.keys(patch).length)?`一部の設定を反映できません: ${settingsError}。設定を変更すると再試行します。`:invalidSettings.size?"入力内容を確認してください。変更はまだ反映されていません。":"反映しました。";
 }finally{savingSettings=false;}
}
const form=document.getElementById("form");
form.addEventListener("change",event=>{
 const key=event.target.id;
 if(["displayId","positionX","positionY"].includes(key))queueSettings(["position"]);
 else if(fields.includes(key))queueSettings(key==="appearance"||key==="colorTheme"?["appearance","colorTheme"]:key==="voicevoxStyleId"?[key,"voiceFollowCharacter"]:[key]);
});
form.addEventListener("submit",event=>{
 event.preventDefault();
 // Enter commits a text/number field, without a separate save action.
 const key=document.activeElement?.id;
 if(["positionX","positionY"].includes(key))queueSettings(["position"]);
 else if(fields.includes(key))queueSettings([key]);
});
document.getElementById("open").addEventListener("click", () => window.assistant.open());

function voiceFields(){
 const provider=document.getElementById("voiceProvider").value;
 document.getElementById("voicevox-external").hidden=provider!=="voicevox";
 document.getElementById("voicevoxOrigin").disabled=provider!=="voicevox";
 document.getElementById("voice-core-help").hidden=provider!=="core";
 document.getElementById("voice-core-version").hidden=provider!=="core";
 document.getElementById("voicevox-choices").hidden=provider==="system";
 document.getElementById("system-voice-help").hidden=provider!=="system";
}
document.getElementById("voiceProvider").addEventListener("change",()=>{voiceFields();void syncCharacterVoice(true);});
document.getElementById("voiceCoreVersion").addEventListener("change",()=>void syncCharacterVoice(true));
document.getElementById("voice-core-refresh").onclick=async()=>{try{const rows=await window.assistant.voiceVersions();const select=document.getElementById("voiceCoreVersion"),value=select.value;select.replaceChildren(new Option("既定のCORE",""));for(const row of rows)select.append(new Option(`${row.version}（${row.accelerationMode}）`,row.version));if(rows.some(r=>r.version===value))select.value=value;else if(value)select.append(new Option(value,value,true,true));}catch(error){status.textContent=error.message;}};
document.getElementById("voiceFollowCharacter").addEventListener("change",()=>void syncCharacterVoice(true));
document.getElementById("voicevoxStyleId").addEventListener("change",()=>{document.getElementById("voiceFollowCharacter").checked=false;++voiceMatchRevision;});
let voiceRevision=-1;
const showVoice=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=voiceRevision)return;voiceRevision=state.revision;document.getElementById("voice-status").textContent=state.message;};
const offVoice=window.assistant.onVoice(showVoice);window.addEventListener("pagehide",offVoice,{once:true});
window.assistant.voiceState().then(showVoice).catch(error=>{document.getElementById("voice-status").textContent=error.message;});
function voiceDraft(){return {voiceProvider:document.getElementById("voiceProvider").value,...(document.getElementById("voiceProvider").value==="voicevox"?{voicevoxOrigin:document.getElementById("voicevoxOrigin").value}:{}),voicevoxStyleId:Number(document.getElementById("voicevoxStyleId").value),voiceFollowCharacter:document.getElementById("voiceFollowCharacter").checked,voiceCoreVersion:document.getElementById("voiceCoreVersion").value,characterId:document.getElementById("characterId").value};}
let voiceMatchRevision=0;
async function syncCharacterVoice(persist=false){
 const revision=++voiceMatchRevision,draft=voiceDraft();
 if(!draft.voiceFollowCharacter||draft.voiceProvider==="system")return;
 try{
  const selected=await window.assistant.matchVoice(draft);
  if(revision!==voiceMatchRevision||JSON.stringify(draft)!==JSON.stringify(voiceDraft()))return;
  if(!selected){document.getElementById("voice-status").textContent="対応する声がないため、選択中の声を使います。";return;}
  const select=document.getElementById("voicevoxStyleId");
  if(!Array.from(select.options).some(o=>o.value===String(selected.id))){const option=document.createElement("option");option.value=String(selected.id);option.textContent=selected.label;select.append(option);}
  select.value=String(selected.id);
  if(persist)queueSettings(["voicevoxStyleId"]);
 }catch(error){if(revision===voiceMatchRevision)document.getElementById("voice-status").textContent=error.message;}
}
document.getElementById("voice-test").onclick=()=>window.assistant.testVoice(voiceDraft()).catch(error=>{document.getElementById("voice-status").textContent=error.message;});
document.getElementById("voice-stop").onclick=()=>window.assistant.stopVoice();

document.getElementById("voice-speakers").onclick=async()=>{const button=document.getElementById("voice-speakers");button.disabled=true;try{const provider=document.getElementById("voiceProvider").value,origin=document.getElementById("voicevoxOrigin").value,coreVersion=document.getElementById("voiceCoreVersion").value;const rows=await window.assistant.voiceSpeakers({provider,...(provider==="voicevox"?{origin}:{coreVersion})});if(document.getElementById("voiceProvider").value!==provider||(provider==="core"&&document.getElementById("voiceCoreVersion").value!==coreVersion)||(provider==="voicevox"&&document.getElementById("voicevoxOrigin").value!==origin))return;const select=document.getElementById("voicevoxStyleId"),value=select.value;select.replaceChildren();for(const row of rows){const option=document.createElement("option");option.value=String(row.id);option.textContent=row.label;select.append(option);}if(rows.some(r=>String(r.id)===value))select.value=value;await syncCharacterVoice(true);status.textContent=`${rows.length}種類の声を読み込みました。選ぶと自動で反映します。`;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};

const themeMedia=window.matchMedia("(prefers-color-scheme: dark)");
function syncAppearanceFields(adjust=false){
 const mode=document.getElementById("appearance"),theme=document.getElementById("colorTheme");
 const following=mode.value==="sodashitsu";
 theme.disabled=following;document.getElementById("color-theme-setting").hidden=following;
 if(following)return;
 if(mode.value==="system"){for(const option of theme.options)option.hidden=false;return;}
 const appearance=mode.value==="system"?(themeMedia.matches?"dark":"light"):mode.value;
 if(adjust)theme.value=theme.selectedOptions[0]?.dataset[appearance]??theme.value;
 for(const option of theme.options)option.hidden=option.dataset.mode!==appearance;
}
themeMedia.addEventListener("change",()=>syncAppearanceFields(true));
document.getElementById("appearance").addEventListener("change",()=>syncAppearanceFields(true));
document.getElementById("colorTheme").addEventListener("change",()=>{
 const mode=document.getElementById("appearance");
 if(mode.value!=="system"&&mode.value!=="sodashitsu")mode.value=document.getElementById("colorTheme").selectedOptions[0].dataset.mode;
 syncAppearanceFields(false);
});
