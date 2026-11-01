"use strict";
(() => {
 let active=null;
 const cancel=()=>{const drag=active;if(!drag)return;drag.ended=true;active=null;if(drag.token)void window.assistant.endResize({token:drag.token}).catch(()=>{});};
 window.addEventListener("blur",cancel);window.addEventListener("pagehide",cancel);
 for(const handle of ["n","w","nw"]){
  const edge=document.createElement("div");edge.className=`bubble-resize bubble-resize-${handle}`;edge.dataset.resize=handle;edge.setAttribute("aria-hidden","true");edge.title="ドラッグして大きさを変更";document.body.append(edge);
  edge.addEventListener("pointerdown",async event=>{
   if(event.button!==0||active)return;
   event.preventDefault();edge.setPointerCapture(event.pointerId);
   const drag={pointer:event.pointerId,token:null,pending:false,ended:false};active=drag;
   try{
    const result=await window.assistant.beginResize({handle});drag.token=result.token;
    if(drag.ended||active!==drag){await window.assistant.endResize({token:drag.token});return;}
    await window.assistant.resize({token:drag.token});
   }catch(error){if(active===drag)active=null;document.getElementById("status").textContent=error.message;}
  });
  edge.addEventListener("pointermove",event=>{
   const drag=active;if(!drag||drag.pointer!==event.pointerId||!drag.token||drag.pending)return;
   drag.pending=true;
   window.assistant.resize({token:drag.token}).catch(error=>{document.getElementById("status").textContent=error.message;}).finally(()=>{drag.pending=false;});
  });
  const finish=event=>{
   const drag=active;if(!drag||drag.pointer!==event.pointerId)return;
   drag.ended=true;active=null;
   if(edge.hasPointerCapture(event.pointerId))edge.releasePointerCapture(event.pointerId);
   if(drag.token)void window.assistant.resize({token:drag.token}).catch(()=>{}).then(()=>window.assistant.endResize({token:drag.token})).catch(()=>{});
  };
  edge.addEventListener("pointerup",finish);edge.addEventListener("pointercancel",finish);edge.addEventListener("lostpointercapture",finish);
 }
})();
