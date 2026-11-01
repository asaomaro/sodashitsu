"use strict";
(async () => {
 const preferences = await window.assistant.read();
 const portrait=await window.assistant.characterInfo();
 const image=document.getElementById("portrait"),motion=document.getElementById("character-motion");
 image.src=portrait.uri;image.alt=portrait.name;
 const icon=/(?:^|\/)sodashitsu-icon\.svg$/.test(portrait.uri);
 if(portrait.frame){
   const f=portrait.frame;
   image.classList.add("framed-portrait");
   Object.assign(image.style,{left:`${-100*f.x/f.w}%`,top:`${-100*f.y/f.h}%`,width:`${100*f.width/f.w}%`,height:`${100*f.height/f.h}%`});
 }
 motion.style.transformOrigin=icon?"50% 50%":"100% 100%";
 const media=matchMedia("(prefers-reduced-motion: reduce)");
 let actorPlayer=null;
 let revision=-1,frame=0,closed=false,noticeAt=-Infinity,sequence=null;
 let state={mode:"idle",reducedMotion:preferences.reducedMotion,followSystemMotion:preferences.followSystemMotion??true,idleFloating:preferences.idleFloating??false,iconRotation:preferences.iconRotation??true,paused:false},sx=1,sy=1;
 const still=()=>closed||document.hidden||(state.followSystemMotion&&media.matches)||state.reducedMotion||state.paused;
 const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;sx=sy=1;motion.style.transform="";motion.style.willChange="";motion.dataset.motion="still";noticeAt=-Infinity;actorPlayer?.render(performance.now(),"idle",Infinity,true);};
 const draw=time=>{
   frame=0;if(still()){reset();return;}
   actorPlayer?.render(time,state.mode,time-noticeAt,false);
   const elapsed=time-noticeAt,notice=elapsed>=0&&elapsed<900;
   const phase=Math.sin(time/1150+0.6),head=image.naturalWidth>=image.naturalHeight;
   let x=1-.004*(1-phase)/2,y=1-.009*(1+phase)/2,kind=state.mode;
   if(notice){const beat=Math.abs(Math.sin(elapsed/180*Math.PI))*Math.exp(-elapsed/320);y-=.065*beat;x-=.012*beat;kind="notice";}
   else if(state.mode==="speaking"){const beat=Math.abs(Math.sin(time/90));y-=(head?.06:.028)*beat;x-=.008*beat;}
   else if(state.mode==="working"){y-=.012*(1+Math.sin(time/420))/2;x-=.006*(1+Math.sin(time/640))/2;}
   // Scaling keeps the feet anchored. Floating starts at the taskbar edge
   // at its highest point and moves down into the clipped lower area.
   if(icon)x=y=1;
   sx+=(x-sx)*.3;sy+=(y-sy)*.3;
   const drop=state.idleFloating&&state.mode==="idle"&&!notice?4*(1+Math.cos(time/1400)):0;
   motion.style.transform=`translateY(${drop.toFixed(3)}px) scale(${sx.toFixed(5)}, ${sy.toFixed(5)}) rotate(${icon&&state.iconRotation!==false?(time/16000*360%360).toFixed(3):0}deg)`;
   motion.style.willChange="transform";motion.dataset.motion=kind;
   frame=requestAnimationFrame(draw);
 };
 const start=()=>{if(still()){reset();return;}if(!frame)frame=requestAnimationFrame(draw);};
 const update=next=>{
   if(!Number.isSafeInteger(next.revision)||next.revision<=revision)return;
   revision=next.revision;state={...next,followSystemMotion:next.followSystemMotion??true};
   document.body.classList.toggle("respect-system-motion",state.followSystemMotion);
   document.body.classList.toggle("idle-floating",state.idleFloating===true);
   if(sequence!==null&&sequence!==next.notificationSeq&&!still())noticeAt=performance.now();
   sequence=next.notificationSeq;start();
 };
 document.getElementById("captain").addEventListener("click",()=>{if(!still()){noticeAt=performance.now();start();}window.assistant.chat();});
 const off=window.assistant.onCharacterState(update);
 document.addEventListener("visibilitychange",start);media.addEventListener("change",start);
 window.addEventListener("pagehide",()=>{closed=true;reset();actorPlayer?.dispose();off();media.removeEventListener("change",start);document.removeEventListener("visibilitychange",start);},{once:true});
 update(await window.assistant.characterState());
 // Optional material errors keep the static portrait and all existing controls usable.
 try{
   const actor=await window.assistant.characterActor();
   if(actor&&!closed){
     const canvas=document.getElementById("character-canvas"),player=await window.createCharacterActor(actor,canvas);
     if(closed){player?.dispose();return;}
     actorPlayer=player;canvas.setAttribute("aria-label",portrait.name);image.hidden=true;canvas.hidden=false;
     if(still())reset();else start();
   }
 }catch{}
})().catch(() => { document.getElementById("captain").disabled = true; });
