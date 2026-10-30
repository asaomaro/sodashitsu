import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";

// Standalone generated UI verification: headless Chromium only, no Electron/OS/agent start.
const root = fileURLToPath(new URL("../assets/", import.meta.url));
const files = new Set([
  "character.html",
  "character.js",
  "settings.html",
  "settings.js",
  "bubble.html",
  "bubble.js",
  "tools.js",
  "recording.js",
  "ocr.js",
  "style.css",
  "captain-male.svg",
  "captain-female.svg",
  "captain-robot.svg",
]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname.slice(1);
  if (!files.has(path)) {
    response.writeHead(404).end();
    return;
  }
  const ext = path.split(".").at(-1);
  response.setHeader(
    "Content-Type",
    { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" }[ext],
  );
  response.end(await readFile(join(root, path)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const watchdog = setTimeout(() => { console.error("Generated UI exceeded 30 seconds"); process.exit(124); }, 30000);
watchdog.unref();
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--disable-frame-rate-limit"],
  });
  const context = await browser.newContext({viewport:{width:400,height:640}});
  await context.addInitScript(() => {
    window.calls = [];
    window.preferences = {
      version: 1,
      enabled: false,
      mode: "character",
      characterId: "captain-female",
      characterSize: 192,
      serverOrigin: "http://127.0.0.1:7780",
      launchAtLogin: false,
      mute: false,
      ocrEnabled: false, ocrExecutable: "", ocrLanguage: "jpn+eng",
      transcriptionEnabled: false,
      transcriptionOrigin: "http://127.0.0.1:8080",
      reducedMotion: false,
      position: null,
    };
    window.ocrRevision=1; window.currentOcr={};
    window.savedNotes = [];
    window.toolsRevision = 1;
    window.currentTools = {revision:1,transcriptionEnabled:true,transcriptionOrigin:"http://127.0.0.1:8080",notes:[],notesError:"",transcription:{revision:1,status:"idle",name:"",text:"",message:"生成されたテストです。"}};
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{getVoices:()=>[{lang:"ja-JP",localService:false},{lang:"ja-JP",localService:true}],cancel:()=>window.calls.push(["stop-reading"]),speak:utterance=>window.calls.push(["speak",utterance.text,utterance.voice.localService])}});
    window.SpeechSynthesisUtterance = class {constructor(text){this.text=text;}};
    window.recordGrants=[];window.recordSequence=0;
    window.makeGeneratedMedia=()=>{const track={stop:()=>window.calls.push(["stop-track"]),onended:null};return{getTracks:()=>[track]};};
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:async()=>{window.calls.push(["get-user-media"]);return window.makeGeneratedMedia();}}});
    window.MediaRecorder=class {
      static isTypeSupported(value){return value==="audio/webm;codecs=opus";}
      constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state="inactive";window.generatedRecorder=this;}
      start(){this.state="recording";}
      stop(){if(this.state==="inactive")return;this.state="inactive";queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(["generated-audio"],{type:this.mimeType})});this.onstop?.(new Event("stop"));});}
    };
    window.toolWatchers=new Set();
    window.toolsCallback=state=>{for(const callback of window.toolWatchers)callback(state);};
    window.assistant = {
      openSource: async input=>window.calls.push(["open-source",input]),
      replySource: async input=>window.calls.push(["reply-source",input]),
      sourceKey: async input=>window.calls.push(["source-key",input]),
      openSession: async()=>window.calls.push(["open-session"]),
      conversation: async () => ({ revision: 1, connected: false, busy: false, session: null, kinds: [{kind:"codex",label:"Codex",available:true}], messages: [], hint: "専用セッションを開始できます。" }),
      onConversation: callback => { window.chatCallback = callback; return () => {}; },
      startSession: async input => window.calls.push(["start-session",input]),
      adoptSession: async input => window.calls.push(["adopt-session",input]),
      sendMessage: async input => window.calls.push(["send-message",input]),
      beginRecording: async()=>{
        const token=`00000000-0000-4000-8000-${String(++window.recordSequence).padStart(12,"0")}`;
        window.recordGrants.push(token);window.calls.push(["begin-recording",token]);
        return{token,maxBytes:25*1024*1024,maxDurationMs:300000};
      },
      stopRecording: async input=>window.calls.push(["stop-recording",input]),
      discardRecording: async input=>window.calls.push(["discard-recording",input]),
      transcribeRecording: async input=>window.calls.push(["transcribe-recording",{token:input.token,mime:input.mime,bytes:input.bytes.byteLength}]),
      onRecordingCancelled: callback=>{window.recordCancelCallback=callback;return()=>{};},
      ocrState: async () => ({revision:1,status:"idle",enabled:true,imageId:null,width:0,height:0,text:"",message:"画像を確認してから認識します。"}),
      onOcr: callback => {window.ocrCallback=callback;return()=>{};},
      ocrFile: async () => {
        const state={revision:++window.ocrRevision,status:"ready",enabled:true,imageId:`generated-${window.ocrRevision}`,width:1,height:1,text:"",message:"認識前のプレビュー"};
        window.currentOcr=state; window.ocrCallback(state);window.calls.push(["ocr-file"]);
        return {state,uri:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII="};
      },
      ocrClipboard: async () => window.assistant.ocrFile(),
      ocrCrop: async input => {window.calls.push(["ocr-crop",input]);return window.assistant.ocrFile();},
      ocrRun: async input => {window.calls.push(["ocr-run",input]);window.currentOcr={...window.currentOcr,revision:++window.ocrRevision,status:"done",text:"画像から読み取った文字"};window.ocrCallback(window.currentOcr);},
      ocrDiscard: async () => {window.ocrCallback({...window.currentOcr,revision:++window.ocrRevision,status:"idle",imageId:null,text:"",message:"破棄しました"});},
      tools: async () => window.currentTools,
      onTools: callback => { window.toolWatchers.add(callback); return ()=>window.toolWatchers.delete(callback); },
      readClipboard: async () => "コピーした文章です。",
      writeClipboard: async input => window.calls.push(["write-clipboard",input]),
      saveNote: async input => {
        const id=input.id || "00000000-0000-4000-8000-000000000077";
        window.savedNotes=[{id,text:input.text,updatedAt:1}];
        window.currentTools={...window.currentTools,revision:++window.toolsRevision,notes:window.savedNotes};
        window.toolsCallback(window.currentTools);window.calls.push(["save-note",input]);return{id};
      },
      deleteNote: async input => {
        window.savedNotes=[];window.currentTools={...window.currentTools,revision:++window.toolsRevision,notes:[]};
        window.toolsCallback(window.currentTools);window.calls.push(["delete-note",input]);
      },
      transcribeFile: async () => window.calls.push(["transcribe-file"]),
      cancelTranscription: async () => window.calls.push(["cancel-transcription"]),
      inbox: async () => ({
        status: "connected",
        revision: 1,
        notices: [{ id:"00000000-0000-4000-8000-000000000091", message: "「操舵室 / worker」の作業が完了しました。" }],
      }),
      onInbox: (callback) => {
        window.noticeCallback = callback;
        return () => {};
      },
      read: async () => window.preferences,
      save: async (preferences) => {
        window.calls.push(["save", preferences]);
        window.preferences = preferences;
        return preferences;
      },
      open: async () => window.calls.push(["open"]),
      settings: async () => window.calls.push(["settings"]),
      chat: async () => window.calls.push(["chat"]),
      hide: async () => window.calls.push(["hide"]),
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/settings.html`);
  await expect(page.getByRole("button", { name: "操舵室を開く" })).toBeDisabled();
  await page.locator("#enabled").press("Space");
  await expect(page.locator("#enabled")).toBeChecked();
  for (const character of ["captain-male", "captain-female", "captain-robot"]) {
    await page.locator("#characterId").selectOption(character);
    await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
    await expect(page.getByRole("status")).toHaveText("保存しました。");
    assert.equal(await page.evaluate(() => window.preferences.characterId), character);
  }
  await page.locator("#mode").selectOption("tray");
  await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("保存しました。");
  assert.equal(await page.evaluate(() => window.preferences.characterId), "captain-robot");
  assert.equal(await page.evaluate(() => window.preferences.mode), "tray");
  await page.getByRole("button", { name: "操舵室を開く" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "open");
  await page.evaluate(() => {
    window.assistant.save = async () => {
      throw Error("disk full");
    };
  });
  await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText("disk full");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await page.goto(`${origin}/character.html`);
  await expect(page.locator("#portrait")).toHaveAttribute("src", "captain-female.svg");
  await page.getByRole("button", { name: "船長と話す" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "chat");
  await page.goto(`${origin}/bubble.html`);
  await expect(page.getByRole("log")).toContainText("こんにちは。操舵室の船長です。");
  await expect(page.locator("#destination")).toHaveText("専用アシスタント");
  await expect(page.getByRole("log")).toContainText("作業が完了しました。");
  await page.evaluate(() =>
    window.noticeCallback({
      status: "connected",
      revision: 2,
      notices: [{ id:"00000000-0000-4000-8000-000000000092", message: "<img src=x onerror=alert(1)>確認してください。" }],
    }),
  );
  await expect(page.locator(".notice-text")).toHaveText(
    "<img src=x onerror=alert(1)>確認してください。",
  );
  await expect(page.locator(".notice img")).toHaveCount(0);
  await page.evaluate(() => window.noticeCallback({ status: "offline", revision: 1, notices: [] }));
  await expect(page.locator(".notice")).toContainText("確認してください。");
  await expect(page.locator("#send")).toBeDisabled(); // No false successful chat before backend connection.
  await page.evaluate(() => window.chatCallback({
    revision: 2, connected: true, busy: false, session: null,
    kinds: [{kind:"codex",label:"Codex",available:true}], messages: [], hint: "専用セッションを開始できます。"
  }));
  await page.locator("#start-session").press("Enter");
  assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), ["start-session", {revision:2,kind:"codex",retry:false}]);
  const actorId = "00000000-0000-4000-8000-000000000001";
  await page.evaluate(actorId => window.chatCallback({
    revision: 3, connected: true, busy: false,
    session: {paneId:"00000000-0000-4000-8000-000000000002",kind:"codex",state:"ready",agent:{instanceId:actorId,state:"idle"}},
    kinds: [{kind:"codex",label:"Codex",available:true}],
    messages: [{role:"assistant",text:"<img src=x onerror=alert(1)>こんにちは。"}], hint:"船長へのメッセージを送れます。"
  }), actorId);
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.locator(".chat-message")).toHaveText("<img src=x onerror=alert(1)>こんにちは。");
  await expect(page.locator(".chat-message img")).toHaveCount(0);
  await page.locator("#message").fill("こんにちは、船長");
  await page.locator("#send").press("Enter");
  assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), ["send-message", {revision:3,instanceId:actorId,text:"こんにちは、船長"}]);
  await expect(page.locator("#message")).toHaveValue("");
  await page.evaluate(() => window.chatCallback({revision:2,connected:false,busy:false,session:null,kinds:[],messages:[],hint:"old"}));
  await expect(page.locator("#send")).toBeEnabled();
  await page.evaluate(actorId => window.chatCallback({
    revision:4,connected:true,busy:false,
    session:{paneId:"00000000-0000-4000-8000-000000000002",kind:"codex",state:"conflict",agent:null,observedAgent:{instanceId:actorId,kind:"codex"}},
    kinds:[{kind:"codex",label:"Codex",available:true}],messages:[],hint:"対象を確認してください。"
  }),actorId);
  await expect(page.locator("#send")).toBeDisabled();
  await page.locator("#adopt-session").press("Enter");
  assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), ["adopt-session",{revision:4,instanceId:actorId}]);
  await page.evaluate(actorId=>window.chatCallback({
    revision:5,connected:true,busy:false,
    session:{paneId:"00000000-0000-4000-8000-000000000002",kind:"codex",state:"ready",agent:{instanceId:actorId,state:"idle"}},
    kinds:[{kind:"codex",label:"Codex",available:true}],messages:[],hint:"送信できます。"
  }),actorId);
  await expect(page.locator("#send")).toBeEnabled();
  await page.locator("#standard-tools > summary").press("Enter");
  const sendsBeforeTools=await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length);
  await page.locator("#read-clipboard").press("Enter");
  await expect(page.locator("#tool-text")).toHaveValue("コピーした文章です。");
  await page.evaluate(()=>{
    window.assistant.readClipboard=()=>new Promise(resolve=>{window.resolveClipboard=resolve;});
  });
  const noteSavesBeforeClipboard=await page.evaluate(()=>window.calls.filter(call=>call[0]==="save-note").length);
  await page.locator("#read-clipboard").press("Enter");
  await expect(page.locator("#tool-text")).toBeDisabled();
  await expect(page.locator("#save-note")).toBeDisabled();
  await page.evaluate(()=>document.getElementById("save-note").click());
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="save-note").length),noteSavesBeforeClipboard);
  await page.evaluate(()=>window.resolveClipboard("コピーした文章です。"));
  await expect(page.locator("#tool-text")).toBeEnabled();
  await page.locator("#prepare-summary").press("Enter");
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length),sendsBeforeTools);
  await expect(page.locator("#message")).toHaveValue(/要約してください/);
  await page.locator("#prepare-translation").press("Enter");
  await expect(page.locator("#message")).toHaveValue(/日本語に翻訳/);
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length),sendsBeforeTools);
  await page.locator("#copy-tool-text").press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["write-clipboard",{text:"コピーした文章です。"}]);
  await page.locator("#read-aloud").press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["speak","コピーした文章です。",true]);
  await page.locator("#stop-reading").press("Enter");
  await page.locator("#save-note").press("Enter");
  await expect(page.locator("#tools-status")).toContainText("保存しました");
  await page.locator("#delete-note").press("Enter");
  await expect(page.locator("#tools-status")).toContainText("削除しました");
  await page.locator("#transcribe-file").press("Enter");
  assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),"transcribe-file");
  await page.evaluate(()=>{
    window.currentTools={...window.currentTools,revision:++window.toolsRevision,transcription:{revision:2,status:"done",name:"generated.wav",text:"<img src=x onerror=alert(1)>認識結果です。",message:"確認してください。"}};
    window.toolsCallback(window.currentTools);
  });
  await expect(page.locator("#transcription-result")).toHaveValue("<img src=x onerror=alert(1)>認識結果です。");
  await page.locator("#use-transcription").press("Enter");
  await expect(page.locator("#tool-text")).toHaveValue("<img src=x onerror=alert(1)>認識結果です。");
  await expect(page.locator("#standard-tools img:not(#ocr-preview)")).toHaveCount(0);
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length),sendsBeforeTools);
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="get-user-media").length),0);
  await page.locator("#record-start").press("Enter");
  await expect(page.locator("#record-status")).toContainText("録音中");
  await expect(page.locator("#record-indicator")).toBeVisible();
  await expect(page.locator("#record-stop-visible")).toBeVisible();
  // IntersectionObserver/rAF stalls in this WSL headless environment; inspect browser DOM geometry.
  assert.deepEqual(await page.evaluate(()=>["record-stop-visible","message"].map(id=>{
    const bounds=document.getElementById(id).getBoundingClientRect();
    return{ id,inside:bounds.width>0 && bounds.height>0 && bounds.top>=0 && bounds.bottom<=innerHeight && bounds.left>=0 && bounds.right<=innerWidth };
  })),[{id:"record-stop-visible",inside:true},{id:"message",inside:true}]);
  await page.locator("#record-stop-visible").press("Enter");
  await expect(page.locator("#record-preview")).toBeVisible();
  await expect(page.locator("#record-status")).toContainText("試聴してから");
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="transcribe-recording").length),0);
  await page.locator("#record-transcribe").press("Enter");
  await expect(page.locator("#record-status")).toContainText("処理結果は文字起こし欄");
  assert.deepEqual(await page.evaluate(()=>window.calls.find(call=>call[0]==="transcribe-recording")[1]),{token:"00000000-0000-4000-8000-000000000001",mime:"audio/webm;codecs=opus",bytes:15});
  await page.locator("#record-start").press("Enter");
  await expect(page.locator("#record-status")).toContainText("録音中");
  const oldRecordingToken=await page.evaluate(()=>window.recordGrants.at(-1));
  await page.locator("#record-discard").press("Enter");
  await expect(page.locator("#record-start")).toBeEnabled();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.resolveGeneratedMedia=resolve;});});
  await page.locator("#record-start").press("Enter");
  await expect(page.locator("#record-status")).toContainText("許可を確認");
  await page.locator("#record-discard").press("Enter");
  await expect(page.locator("#record-start")).toBeDisabled();
  const stoppedBeforePermission=await page.evaluate(()=>window.calls.filter(call=>call[0]==="stop-track").length);
  await page.evaluate(()=>window.resolveGeneratedMedia(window.makeGeneratedMedia()));
  await expect(page.locator("#record-start")).toBeEnabled();
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="stop-track").length),stoppedBeforePermission+1);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>window.makeGeneratedMedia();});
  await page.locator("#record-start").press("Enter");
  await expect(page.locator("#record-status")).toContainText("録音中");
  await page.evaluate(token=>window.recordCancelCallback({token,reason:"retired event"}),oldRecordingToken);
  await expect(page.locator("#record-status")).toContainText("録音中");
  await page.locator("#record-discard").press("Enter");
  await expect(page.locator("#record-start")).toBeEnabled();
  await page.locator("#record-start").press("Enter");
  await expect(page.locator("#record-status")).toContainText("録音中");
  const stopsBeforeCollapse=await page.evaluate(()=>window.calls.filter(call=>call[0]==="stop-track").length);
  await page.locator("#standard-tools > summary").press("Enter");
  await expect(page.locator("#record-status")).toContainText("標準ツールを閉じたため");
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="stop-track").length),stopsBeforeCollapse+1);
  await page.locator("#standard-tools > summary").press("Enter");
  await expect(page.locator("#record-start")).toBeEnabled();
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="transcribe-recording").length),1);
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length),sendsBeforeTools);
  await page.getByRole("button", { name: "吹き出しを閉じる" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "hide");
  assert.deepEqual(errors, []);
  await page.evaluate(() => { document.getElementById("standard-tools").open=true; document.getElementById("ocr-tools").open=true; });
  await page.locator("#ocr-file").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#ocr-preview")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.locator("#ocr-run")).toBeEnabled();
  await page.locator("#ocr-run").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#ocr-result")).toHaveValue("画像から読み取った文字");
  await page.locator("#ocr-use").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#tool-text")).toHaveValue("画像から読み取った文字");
  await expect(page.locator("#saved-notes")).toHaveValue("");
  await page.evaluate(() => {
    window.assistant.saveNote=async input=>new Promise(resolve=>{window.releaseOcrNote=()=>resolve({id:"00000000-0000-4000-8000-000000000077"});});
    document.getElementById("tool-text").value="保存中の文章";
    document.getElementById("save-note").click();
  });
  await expect(page.locator("#tool-text")).toBeDisabled();
  await page.locator("#ocr-use").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#tool-text")).toHaveValue("保存中の文章");
  await expect(page.locator("#ocr-status")).toContainText("完了してから");
  await page.evaluate(() => window.releaseOcrNote());
  await expect(page.locator("#tool-text")).toBeEnabled();
  await page.locator("#ocr-discard").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#ocr-result")).toHaveValue("");
  await expect(page.locator("#ocr-preview")).not.toHaveAttribute("src");
  const reply=page.locator(".notice textarea");await reply.fill("通知元への返答");
  await page.evaluate(()=>window.noticeCallback({status:"connected",revision:99,notices:[{id:"00000000-0000-4000-8000-000000000092",message:"<img src=x onerror=alert(1)>確認してください。"}]}));
  await expect(reply).toHaveValue("通知元への返答");
  await page.getByRole("button",{name:"この通知元へ返答",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["reply-source",{noticeId:"00000000-0000-4000-8000-000000000092",text:"通知元への返答"}]);
  await page.getByRole("button",{name:"この端末・質問フォームを開く",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["open-source",{noticeId:"00000000-0000-4000-8000-000000000092"}]);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  clearTimeout(watchdog);
}
