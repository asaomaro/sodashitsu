"use strict";
(() => {
 const api = window.assistant;
 const element = id => document.getElementById(id);
 let state = null, previewId = null, pending = false;
 const result = element("ocr-result"), preview = element("ocr-preview");
 const status = element("ocr-status");
 function apply(next) {
  if (state && next.revision < state.revision) return;
  const changed = state?.imageId !== next.imageId;
  state = next;
  if (changed) {
   preview.removeAttribute("src"); preview.hidden = true; previewId = null;
   result.value = "";
   for (const [key, value] of Object.entries({ x: 0, y: 0, width: next.width, height: next.height })) element(`ocr-${key}`).value = String(value);
  }
  if (next.status === "done") result.value = next.text;
  if (!next.imageId) result.value = "";
  status.textContent = next.message;
  controls();
 }
 function controls() {
  const busy = pending || ["loading", "recognizing", "stopping"].includes(state?.status);
  for (const id of ["ocr-file", "ocr-clipboard"]) element(id).disabled = !state?.enabled || busy;
  for (const id of ["ocr-crop", "ocr-run"]) element(id).disabled = !state?.enabled || busy || !state.imageId || previewId !== state.imageId;
  element("ocr-discard").disabled = !state?.imageId && !busy;
  element("ocr-use").disabled = !state?.imageId || !result.value.trim() || busy;
 }
 async function perform(action) {
  if (pending) return;
  pending = true; controls();
  try {
   const response = await action();
   if (response?.state) {
    apply(response.state);
    if (state.imageId === response.state.imageId && state.revision === response.state.revision) {
     previewId = state.imageId; preview.src = response.uri; preview.hidden = false;
    }
   }
  } catch (error) { status.textContent = error.message || "画像を処理できませんでした。"; }
  finally { pending = false; controls(); }
 }
 element("ocr-file").addEventListener("click", () => perform(() => api.ocrFile()));
 element("ocr-clipboard").addEventListener("click", () => perform(() => api.ocrClipboard()));
 element("ocr-crop").addEventListener("click", () => {
  const rect = Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Number(element(`ocr-${key}`).value)]));
  void perform(() => api.ocrCrop({ imageId: state.imageId, rect }));
 });
 element("ocr-run").addEventListener("click", () => perform(() => api.ocrRun({ imageId: state.imageId })));
 element("ocr-discard").addEventListener("click", () => { void api.ocrDiscard().catch(error => { status.textContent = error.message; }); });
 element("ocr-use").addEventListener("click", () => {
  if (!state?.imageId) return;
  if (result.value.length > 8192) { status.textContent = "8192文字以内に編集してから渡してください。"; return; }
  if (!document.dispatchEvent(new CustomEvent("assistant-import-text", { detail: result.value, cancelable: true }))) { status.textContent = "メモの保存や読み込みが完了してから渡してください。"; return; }
  status.textContent = "扱う文章へ移しました。会話への送信はまだ行っていません。";
 });
 result.addEventListener("input", controls);
 document.addEventListener("assistant-ocr-image",event=>{
   const response=event.detail;apply(response.state);
   if(state.imageId===response.state.imageId&&state.revision===response.state.revision){previewId=state.imageId;preview.src=response.uri;preview.hidden=false;controls();}
 });
 api.onOcr(apply);
 api.ocrState().then(apply).catch(error => { status.textContent = error.message; });
 const discard = () => { preview.removeAttribute("src"); preview.hidden = true; result.value = ""; previewId = null; void api.ocrDiscard().catch(() => {}); };
 document.addEventListener("visibilitychange", () => { if (document.hidden) discard(); });
 window.addEventListener("pagehide", discard);
})();
