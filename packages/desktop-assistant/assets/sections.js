"use strict";
(() => {
 // Keep the real form/fieldset nodes so their values, validation and listeners survive folding.
 for(const fieldset of document.querySelectorAll("#form > fieldset")){
  const legend=fieldset.querySelector(":scope > legend");if(!legend)continue;
  const section=document.createElement("details"),summary=document.createElement("summary");
  section.className="assistant-section";section.open=true;summary.textContent=legend.textContent;
  fieldset.before(section);section.append(summary,fieldset);
 }
 const reveal=target=>{for(let node=target;node;node=node.parentElement)if(node instanceof HTMLDetailsElement)node.open=true;};
 const fitTextareas=()=>{
  for(const textarea of document.querySelectorAll("textarea")){
   if(!textarea.getClientRects().length)continue;
   textarea.style.height="auto";
   const style=getComputedStyle(textarea),border=parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
   textarea.style.height=`${textarea.scrollHeight+(Number.isFinite(border)?border:0)}px`;
  }
 };
 const refresh=()=>{
  for(const section of document.querySelectorAll("[data-collapse-empty]")){
   const hidden=section.dataset.collapseEmpty.split(" ").every(id=>{
    const content=document.getElementById(id);
    return !content||content.hidden||(!content.textContent.trim()&&!content.querySelector("img,video,audio,canvas"));
   });
   if(section.hidden!==hidden)section.hidden=hidden;
  }
  fitTextareas();
 };
 let pending=false;
 const schedule=()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;refresh();});};
 const observer=new MutationObserver(schedule);
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["open","hidden","disabled","rows"]});
 const resize=new ResizeObserver(schedule);resize.observe(document.querySelector("main")??document.body);
 document.addEventListener("input",schedule,true);document.addEventListener("change",schedule);document.addEventListener("focusin",schedule,true);document.addEventListener("toggle",schedule,true);
 document.addEventListener("invalid",event=>reveal(event.target),true);
 window.addEventListener("pagehide",()=>{observer.disconnect();resize.disconnect();},{once:true});
 window.assistantSections=Object.freeze({reveal,fitTextareas});refresh();
})();
