"use strict";
// The video material's base + replacement patches, with unchanged original arms/poses.
window.createCharacterActor=async(actor,canvas)=>{
 if(!actor)return null;
 const images=new Map();
 await Promise.all(Object.entries(actor.images).map(async([id,png])=>{const image=new Image();image.src="data:image/png;base64,"+png;await image.decode();images.set(id,image);}));
 const scale=Math.min(1,512/Math.max(actor.w,actor.h));
 canvas.width=Math.round(actor.w*scale);canvas.height=Math.round(actor.h*scale);
 const cache=new Map(),context=canvas.getContext("2d");let last="",disposed=false;
 const frame=(pose,face,mouth,blink)=>{
   const P=actor.poses[pose]||actor.poses[""],F=P.faces[face]||P.faces.normal||{};
   const patches=[[P.base,0,0],F.e,blink?F.blink:null,mouth?((mouth==="half"&&F.half)||F.open):null].filter(Boolean);
   const key=JSON.stringify(patches);
   if(cache.has(key))return {key,image:cache.get(key)};
   const result=document.createElement("canvas");result.width=canvas.width;result.height=canvas.height;
   const ctx=result.getContext("2d");ctx.scale(scale,scale);
   patches.forEach((p,index)=>{const image=images.get(p[0]);if(!image)return;if(index)ctx.clearRect(p[1],p[2],image.naturalWidth,image.naturalHeight);ctx.drawImage(image,p[1],p[2]);});
   if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,result);return {key,image:result};
 };
 const started=performance.now(),idle=[["","normal"],["","smile"],["chin","think"],["","normal"],["point","normal"],["","smile"],["raise","smile"],["","normal"]];
 const render=(time,mode,noticeAge,still)=>{
   if(disposed)return;
   const age=Math.max(0,time-started);let pose="",face="normal",mouth="";
   if(!still){
     if(noticeAge>=0&&noticeAge<2400){pose="raise";face=noticeAge<700?"surprised":"smile";}
     else if(mode==="working"){pose="chin";face="think";}
     else if(mode==="speaking"){pose=Math.floor(age/5000)%2?"":"point";face="smile";}
     else [pose,face]=idle[Math.floor(age/6000)%idle.length];
     if(mode==="speaking")mouth=["","open","half"][Math.floor(age/110)%3];
   }
   const P=actor.poses[pose]?pose:"",F=actor.poses[P].faces[face]?face:"normal";
   const blink=!still&&(age+1100)%3700<130;
   const next=frame(P,F,mouth,blink);
   if(next.key!==last){context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(next.image,0,0);last=next.key;}
   canvas.dataset.pose=P||"normal";canvas.dataset.face=F;canvas.dataset.mouth=mouth||"closed";canvas.dataset.blink=String(blink);
 };
 render(started,"idle",Infinity,true);
 return {render,dispose:()=>{disposed=true;cache.clear();images.clear();canvas.width=canvas.height=1;}};
};
