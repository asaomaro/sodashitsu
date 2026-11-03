"use strict";
// These controls act on this local window only; the host validates both role and sender.
for (const button of document.querySelectorAll("[data-window-action]")) {
  button.addEventListener("click", () => {
    void window.assistant.windowAction(button.dataset.windowAction).catch(error => {
      const status=document.getElementById("status")??document.getElementById("tools-status");
      if(status)status.textContent=error.message;
    });
  });
}
document.querySelector(".assistant-window-header").addEventListener("dblclick", event => {
  if (!event.target.closest("button")) void window.assistant.windowAction("maximize").catch(()=>{});
});

(() => {
 let active=null;
 const cancel=()=>{const drag=active;active=null;if(drag){drag.ended=true;if(drag.token)void window.assistant.windowResize({phase:"end",token:drag.token}).catch(()=>{});}};
 window.addEventListener("blur",cancel);window.addEventListener("pagehide",cancel);
 for(const handle of ["n","ne","e","se","s","sw","w","nw"]){
  const edge=document.createElement("div");edge.className=`window-resize window-resize-${handle}`;edge.dataset.windowResize=handle;edge.setAttribute("aria-hidden","true");document.body.append(edge);
  edge.addEventListener("pointerdown",async event=>{
   if(event.button!==0||active)return;event.preventDefault();edge.setPointerCapture(event.pointerId);
   const drag={pointer:event.pointerId,token:null,pending:false,ended:false};active=drag;
   try{const result=await window.assistant.windowResize({phase:"start",handle});drag.token=result.token;
    if(drag.ended||active!==drag){await window.assistant.windowResize({phase:"end",token:drag.token});return;}
    await window.assistant.windowResize({phase:"move",token:drag.token});
   }catch{if(active===drag)active=null;}
  });
  edge.addEventListener("pointermove",event=>{
   const drag=active;if(!drag||drag.pointer!==event.pointerId||!drag.token||drag.pending)return;drag.pending=true;
   void window.assistant.windowResize({phase:"move",token:drag.token}).catch(cancel).finally(()=>{drag.pending=false;});
  });
  const finish=event=>{
   const drag=active;if(!drag||drag.pointer!==event.pointerId)return;active=null;drag.ended=true;
   if(edge.hasPointerCapture(event.pointerId))edge.releasePointerCapture(event.pointerId);
   if(drag.token)void window.assistant.windowResize({phase:"move",token:drag.token}).catch(()=>{}).then(()=>window.assistant.windowResize({phase:"end",token:drag.token})).catch(()=>{});
  };
  for(const name of ["pointerup","pointercancel","lostpointercapture"])edge.addEventListener(name,finish);
 }
})();
