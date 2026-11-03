"use strict";
(() => {
 // No file paths cross the bridge. Only bounded bytes from an explicit user File are passed.
 const validate=(file,extensions,limit)=>{
  if(!(file instanceof File)||!extensions.includes(file.name.split(".").at(-1).toLowerCase()))throw Error(`対応形式：${extensions.join("・")}`);
  if(!file.size||file.size>limit)throw Error(`空でない${limit/1048576}MiB以内のファイルを選んでください。`);
 };
 const read=async(file,extensions,limit)=>{validate(file,extensions,limit);const bytes=await file.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>limit||bytes.byteLength!==file.size)throw Error("ファイルの容量を確認してください。");return bytes;};
 const bind=({target,accept,report})=>{
  const single=files=>{try{if(files.length!==1)throw Error("ファイルは1件ずつ選んでください。");Promise.resolve(accept(files[0])).catch(report);}catch(error){report(error);}};
  target.addEventListener("dragover",event=>{event.preventDefault();event.stopPropagation();target.classList.add("drag-over");});
  target.addEventListener("dragleave",()=>target.classList.remove("drag-over"));
  target.addEventListener("drop",event=>{event.preventDefault();event.stopPropagation();target.classList.remove("drag-over");single(Array.from(event.dataTransfer?.files??[]));});
  return single;
 };
 // Dropping outside a designated zone must never navigate away from the assistant UI.
 const preventNavigation=event=>{if(Array.from(event.dataTransfer?.types??[]).includes("Files"))event.preventDefault();};
 document.addEventListener("dragover",preventNavigation);document.addEventListener("drop",preventNavigation);
 window.assistantFileInputs=Object.freeze({validate,read,bind});
})();
