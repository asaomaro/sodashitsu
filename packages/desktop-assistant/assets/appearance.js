"use strict";
(() => {
 const media=window.matchMedia("(prefers-color-scheme: dark)");
 const valid=value=>["light","dark","system"].includes(value);
 let mode="dark",revision=-1;
 try{const saved=localStorage.getItem("assistant.appearance");if(valid(saved))mode=saved;}catch{}
 const apply=()=>{document.documentElement.dataset.assistantTheme=mode==="system"?(media.matches?"dark":"light"):mode;};
 const update=state=>{
  if(!Number.isSafeInteger(state?.revision)||state.revision<=revision||!valid(state.mode))return;
  revision=state.revision;mode=state.mode;apply();
  try{localStorage.setItem("assistant.appearance",mode);}catch{}
 };
 apply();media.addEventListener("change",apply);
 const off=window.assistant.onAppearance(update);
 window.assistant.appearanceState().then(update).catch(()=>{});
 window.addEventListener("pagehide",()=>{off();media.removeEventListener("change",apply);},{once:true});
})();
