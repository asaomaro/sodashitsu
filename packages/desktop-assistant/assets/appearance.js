"use strict";
(() => {
 const media=window.matchMedia("(prefers-color-scheme: dark)");
 const valid=value=>["light","dark","system"].includes(value);
 const keys=["bg","fg","input","surface","muted-surface","user","border","gold","line","contrast","selection","strong-surface","button-bg","button-fg","scroll-thumb","focus"].map(key=>"--assistant-"+key);
 let mode="dark",revision=-1,vars={};
 const palette=raw=>Object.fromEntries(keys.filter(key=>typeof raw?.[key]==="string"&&raw[key].length<128&&CSS.supports("color",raw[key])).map(key=>[key,raw[key]]));
 try{vars=palette(JSON.parse(localStorage.getItem("assistant.palette")??"{}"));}catch{}
 try{const saved=localStorage.getItem("assistant.appearance");if(valid(saved))mode=saved;}catch{}
 const apply=()=>{for(const key of keys){if(vars[key])document.documentElement.style.setProperty(key,vars[key]);else document.documentElement.style.removeProperty(key);}document.documentElement.dataset.assistantTheme=mode==="system"?(media.matches?"dark":"light"):mode;};
 const update=state=>{
  if(!Number.isSafeInteger(state?.revision)||state.revision<=revision||!valid(state.mode))return;
  revision=state.revision;mode=state.mode;vars=palette(state.vars);apply();
  try{localStorage.setItem("assistant.appearance",mode);localStorage.setItem("assistant.palette",JSON.stringify(vars));}catch{}
 };
 apply();media.addEventListener("change",apply);
 const off=window.assistant.onAppearance(update);
 window.assistant.appearanceState().then(update).catch(()=>{});
 window.addEventListener("pagehide",()=>{off();media.removeEventListener("change",apply);},{once:true});
})();
