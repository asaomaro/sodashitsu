"use strict";
(()=>{
 const api=window.assistant,element=id=>document.getElementById(id),status=element("capture-status"),sources=element("capture-sources");
 let token=null,busy=false,generation=0,stream=null;
 const controls=()=>{element("capture-list").disabled=busy;element("capture-start").disabled=busy||!token||!sources.value;element("capture-cancel").disabled=!busy&&!token;};
 const stop=()=>{stream?.getTracks().forEach(track=>track.stop());stream=null;};
 const cancel=()=>{++generation;stop();const old=token;token=null;sources.replaceChildren();void api.cancelScreenshot(old?{token:old}:{}).catch(()=>{});controls();};
 element("capture-cancel").onclick=cancel;
 element("capture-list").onclick=async()=>{
  if(busy)return;busy=true;const current=++generation;controls();status.textContent="取得できる画面とウィンドウの名前を確認しています。画像はまだ取得していません。";
  try{const list=await api.screenshotSources();if(current!==generation||!list)return;token=list.token;sources.replaceChildren();for(const source of list.sources){const option=document.createElement("option");option.value=source.id;option.textContent=source.name;sources.append(option);}status.textContent=list.sources.length?"対象を選び、「この画面を撮影」を押してください。音声は取得しません。":"取得できる画面がありません。OSの画面収録許可や実行環境を確認してください。";}
  catch(error){status.textContent=error.message;cancel();}finally{busy=false;controls();}
 };
 sources.onchange=controls;
 async function frame(track){
  if(typeof ImageCapture==="function")return new ImageCapture(track).grabFrame();
  const video=document.createElement("video");video.muted=true;video.srcObject=new MediaStream([track]);
  try{await video.play();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("画面の取得に時間がかかっています。")),8000);video.requestVideoFrameCallback(()=>{clearTimeout(timer);resolve();});});return await createImageBitmap(video);}
  finally{video.pause();video.srcObject=null;}
 }
 element("capture-start").onclick=async()=>{
  if(busy||!token||!sources.value)return;busy=true;const current=generation,selectedToken=token;controls();status.textContent="選択した画面を1枚取得しています。";
  let bitmap=null;
  try{
   await api.approveScreenshot({token:selectedToken,id:sources.value});if(current!==generation)return;
   const pending=navigator.mediaDevices.getDisplayMedia({audio:false,video:{width:{max:3840},height:{max:2160},frameRate:{max:1}}});
   const captured=await pending;if(current!==generation){captured.getTracks().forEach(track=>track.stop());return;}stream=captured;
   if(stream.getAudioTracks().length||stream.getVideoTracks().length!==1)throw Error("画面だけを取得できませんでした。");
   let frameTimer=null,expired=false;
   try{bitmap=await Promise.race([frame(stream.getVideoTracks()[0]).then(value=>{if(expired||current!==generation){value.close?.();throw Error("画面取得を中止しました。");}return value;}),new Promise((_,reject)=>{frameTimer=setTimeout(()=>{expired=true;reject(Error("画面取得の制限時間を超えました。"));},10000);})]);}
   finally{if(frameTimer)clearTimeout(frameTimer);}
   if(current!==generation)return;
   if(!bitmap.width||!bitmap.height||bitmap.width>3840||bitmap.height>2160)throw Error("画面の大きさが対応範囲を超えています。");
   const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext("2d").drawImage(bitmap,0,0);
   const encoded=canvas.toDataURL("image/png").split(",")[1];if(!encoded||encoded.length>Math.ceil(8*1024*1024*4/3))throw Error("画像が8MiBを超えています。");
   const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   stop();bitmap.close?.();bitmap=null;
   if(current!==generation)return;
   const image=await api.submitScreenshot({token:selectedToken,bytes:bytes.buffer});
   if(current!==generation)return;
   token=null;sources.replaceChildren();document.dispatchEvent(new CustomEvent("assistant-ocr-image",{detail:image}));status.textContent="画面を取得しました。画像を確認し、必要なら範囲を切り出して認識してください。";
  }catch(error){status.textContent=error.message;cancel();}
  finally{stop();bitmap?.close?.();busy=false;controls();}
 };
 document.addEventListener("visibilitychange",()=>{if(document.hidden)cancel();});window.addEventListener("pagehide",cancel);
 element("standard-tools").addEventListener("toggle",()=>{if(!element("standard-tools").open)cancel();});
})();
