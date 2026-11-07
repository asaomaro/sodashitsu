import {createRequire} from 'node:module';
const repo=fileURLToPath(new URL('../../../',import.meta.url)), require=createRequire(join(repo,'packages/desktop-assistant/package.json'));
const {chromium,expect}=require('@playwright/test');
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
const {THEME_NAMES,THEME_APPEARANCE}=await import(require.resolve("@sodashitsu/protocol"));
const {assistantAppearance}=await import(join(repo,"packages/desktop-assistant/dist/appearance.js"));

// Standalone generated UI verification: headless Chromium only, no Electron/OS/agent start.
const root=join(repo,"packages/desktop-assistant/assets");
const files = new Set([
  "character.html",
  "character.js",
  "actor.js",
  "settings.html",
  "panel.html",
  "settings.js",
  "bubble.html",
  "tools.html",
  "tool-window.js",
  "window.js",
  "sections.js",
  "appearance.js",
  "file-inputs.js",
  "reminder-notices.js",
  "bubble.js",
  "notice.html",
  "notice.js",
  "resize.js",
  "tools.js",
  "recording.js",
  "ocr.js",
  "reminders.js",
  "capture.js",
  "apps.js",
  "style.css",
  "captain-male.png",
  "captain-female.png",
  "captain-robot.png",
  "sodashitsu-icon.svg",
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
    { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml", png:"image/png" }[ext],
  );
  response.end(await readFile(join(root, path)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const watchdog = setTimeout(() => { console.error("Generated UI exceeded 60 seconds"); process.exit(124); }, 60000);
watchdog.unref();
try {
  browser = await chromium.launch({
    ...(process.env.SODA_E2E_CHROMIUM_PATH ? {executablePath:process.env.SODA_E2E_CHROMIUM_PATH} : {}),
    headless: true,
    args: ["--disable-gpu", "--disable-frame-rate-limit"],
  });
  const context = await browser.newContext({viewport:{width:400,height:640}});
  await context.addInitScript(() => {
    window.calls = [];window.previewVoiceRevision=1;
    window.preferences = {
      version: 1,
      enabled: false,
      mode: "character",
      characterId: "captain-female",
      characterSize: 192,
      serverOrigin: "http://127.0.0.1:7780",
      launchAtLogin: false,
      mute: false,voiceEnabled:false,
      quietFullscreen:true,
      remoteNotifications:true,
      allowPluginCharacters:false,allowPluginViews:false,allowPluginActions:false,
      ocrProvider: "agent",
      ocrEnabled: false, ocrExecutable: "", ocrLanguage: "jpn+eng",
      transcriptionEnabled: false,
      transcriptionProvider: "local",
      transcriptionOrigin: "http://127.0.0.1:8080",
      followSystemMotion:true,
      reducedMotion: false,
      position: null,
    };
    Object.assign(window.preferences,{captainKind:"codex",notificationSummary:true,agentProfiles:{claude:{model:"sonnet",effort:"high"},codex:{model:"custom-model",effort:"low"},muse:{model:"muse-test-model",effort:"high"},agy:{model:"agy-test-model",effort:"high"},copilot:{model:"copilot-test-model",effort:"high"}}},JSON.parse(localStorage.getItem("generated-captain-choice")||"{}"));
    window.ocrRevision=1; window.currentOcr={};
    window.savedNotes = [];
    window.toolsRevision = 1;
    window.currentTools = {audioCapabilities:{kind:"codex",nativeAudio:true,nativeAudioReason:"",localTranscription:true},audioTargetReady:true,nativeAudioReady:true,audioTargetLabel:"Codex",transcriptionContext:"a".repeat(64),revision:1,transcriptionEnabled:true,transcriptionProvider:"local",transcriptionOrigin:"http://127.0.0.1:8080",notes:[],notesError:"",transcription:{revision:1,status:"idle",name:"",text:"",message:"生成されたテストです。"}};
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
    navigator.mediaDevices.getDisplayMedia=async()=>{window.calls.push(["get-display-media"]);const track={stop:()=>window.calls.push(["stop-display-track"])};return{getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[]};};
    window.ImageCapture=class{async grabFrame(){return{width:1,height:1,close:()=>window.calls.push(["close-display-frame"])};}};
    window.realCanvasContext=HTMLCanvasElement.prototype.getContext;window.realCanvasDataURL=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.getContext=()=>({drawImage:()=>window.calls.push(["draw-generated-frame"])});
    HTMLCanvasElement.prototype.toDataURL=()=>"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=";
    window.toolWatchers=new Set();
    window.toolsCallback=state=>{for(const callback of window.toolWatchers)callback(state);};
    window.assistant = {
      apps:async()=>({instanceId:"00000000-0000-4000-8000-000000000003",allowViews:true,allowActions:true,views:[{extensionKey:"demo",runId:"00000000-0000-4000-8000-000000000004",id:"assistant",title:"プラグインUI"}],operations:[{extensionKey:"demo",runId:"00000000-0000-4000-8000-000000000004",name:"search",description:"明示した検索",inputSchema:{type:"object"}}]}),
      openApp:async input=>window.calls.push(["open-app",input]),
      callApp:async input=>{window.calls.push(["call-app",input]);return{result:"<img src=x>プラグインの結果"};},
      voiceVersions:async()=>[{version:"0.17.1",accelerationMode:"CPU"},{version:"0.17.0",accelerationMode:"AUTO"}],
      voiceSpeakers:async()=>[{id:108,label:"東北きりたん（ノーマル）"},{id:3,label:"ずんだもん（ノーマル）"}],
      characterActor:async()=>null,
      characterState:async()=>({revision:1,notificationSeq:0,mode:"idle",paused:false,reducedMotion:false}),
      onCharacterState:callback=>{window.characterCallback=callback;return()=>{window.characterUnsubscribed=true;};},
      characterInfo:async()=>({name:window.preferences.characterId==="captain-robot"?"ロボット船長":"船長",uri:`${window.preferences.characterId}.${window.preferences.characterId==="sodashitsu-icon"?"svg":"png"}`}),
      displays:async()=>[{id:"1",label:"生成したディスプレイ",workArea:{x:0,y:0,width:1920,height:1080}}],
      characters:async()=>({characters:[],error:""}),
      previewYukkuriCharacters:async()=>({token:"00000000-0000-4000-8000-000000000079",name:"yukkuri-work",characters:[{name:"ずんだもん",uri:"captain-robot.svg"}]}),
      previewCharacterPack:async()=>null,
      importCharacterPack:async input=>{window.calls.push(["import-character-pack",input]);return[{id:"plugin:yukkuri-work/zundamon",packId:"yukkuri-work",name:"ずんだもん",uri:"captain-robot.svg",credit:"元の立ち絵の素材メモ"}];},
      screenshotSources:async()=>({token:"00000000-0000-4000-8000-000000000088",sources:[{id:"screen:generated",name:"生成した画面"}]}),
      approveScreenshot:async input=>window.calls.push(["approve-screenshot",input]),
      submitScreenshot:async input=>{
        if(!window.calls.some(call=>call[0]==="stop-display-track"))throw Error("capture must stop before submission");
        window.calls.push(["submit-screenshot",{token:input.token,size:input.bytes.byteLength}]);
        const bytes=new Uint8Array(input.bytes);window.currentOcr={revision:++window.ocrRevision,status:"ready",enabled:true,imageId:"generated-screenshot",width:2,height:2,text:"",message:"取得しました"};window.ocrCallback(window.currentOcr);
        return{state:window.currentOcr,uri:`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`};
      },
      cancelScreenshot:async()=>{},
      reminders:async()=>({revision:1,connected:true,jobs:[],runs:[],message:"リマインダーを予約できます。"}),
      onReminders:callback=>{window.remindersCallback=callback;return()=>{};},
      saveReminder:async input=>window.calls.push(["save-reminder",input]),
      removeReminder:async input=>window.calls.push(["remove-reminder",input]),
      acknowledgeReminder:async input=>window.calls.push(["ack-reminder",input]),
      openAgent:async input=>window.calls.push(["agent-open",input]),
      openSource: async input=>window.calls.push(["open-source",input]),
      replySource: async input=>window.calls.push(["reply-source",input]),
      sourceKey: async input=>window.calls.push(["source-key",input]),
      openSession: async()=>window.calls.push(["open-session"]),
      conversation: async () => ({ revision: 1, connected: false, busy: false, session: null, kinds: ["claude","codex","muse","agy","copilot","cursor"].map(kind=>({kind,label:kind,available:true})), messages: [], hint: "専用セッションを開始できます。" }),
      onConversation: callback => { window.chatCallback = callback; return () => {}; },
      agentModels:async({kind})=>({models:kind==="codex"?[{id:"custom-model",label:"Codex custom",efforts:["low","high"]},{id:"fast-model",label:"Codex fast",efforts:["minimal"]}]:[{id:`${kind}-test-model`,label:kind+" model",efforts:[]},{id:"sonnet",label:"Sonnet",efforts:["low","high"]}],message:""}),
      chooseCaptain:async input=>{window.calls.push(["captain-choice",input]);window.preferences.captainKind=input.kind;window.preferences.notificationSummary=input.notificationSummary;window.preferences.agentProfiles={...window.preferences.agentProfiles,[input.kind]:input.profile};localStorage.setItem("generated-captain-choice",JSON.stringify({captainKind:input.kind,agentProfiles:window.preferences.agentProfiles,notificationSummary:input.notificationSummary}));return structuredClone(window.preferences);},
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
        const state={revision:++window.ocrRevision,status:"ready",enabled:true,imageId:`generated-${window.ocrRevision}`,width:window.ocrTestImage?1200:1,height:window.ocrTestImage?300:1,text:"",message:"認識前のプレビュー"};
        window.currentOcr=state; window.ocrCallback(state);window.calls.push(["ocr-file"]);
        if(window.ocrMetadataRace){window.currentOcr={...state,revision:++window.ocrRevision};window.ocrCallback(window.currentOcr);}
        return {state,uri:window.ocrTestImage||"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII="};
      },
      ocrUpload:async input=>{window.calls.push(["ocr-upload",{bytes:input.bytes.byteLength,revision:input.revision}]);return window.assistant.ocrFile();},
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
      transcribeUpload:async input=>window.calls.push(["transcribe-upload",{name:input.name,bytes:input.bytes.byteLength,revision:input.revision,context:input.context}]),
      transcribeFile: async () => window.calls.push(["transcribe-file"]),
      cancelTranscription: async () => window.calls.push(["cancel-transcription"]),
      voiceState:async()=>({revision:1,enabled:false,speaking:false,message:"ボイスはオフです。"}),
      onVoice:callback=>{window.voiceCallback=callback;return()=>{};},
      matchVoice:async input=>input.characterId.endsWith("zundamon")?{id:3,label:"ずんだもん（ノーマル）"}:null,
      testVoice:async input=>{window.calls.push(["test-voice",input]);window.voiceCallback({revision:++window.previewVoiceRevision,enabled:true,speaking:true,message:"読み上げています。"});},
      stopVoice:async()=>{window.calls.push(["stop-voice"]);window.voiceCallback({revision:++window.previewVoiceRevision,enabled:true,speaking:false,message:"読み上げを停止しました。"});},
      sizeNotice: async input=>window.calls.push(["notice-size",input]),
      noticeState: async()=>({revision:1,title:"実装担当 (12345678) / 操舵室",message:"質問内容：変更を適用しますか？"}),
      readNotice: async input=>window.calls.push(["notice-read",input]),
      openNotice: async input=>window.calls.push(["open-notice",input]),
      dismissNotice: async input=>window.calls.push(["dismiss-notice",input]),
      onNotice: callback=>{window.compactCallback=callback;return()=>{};},
      inbox: async () => ({
        status: "connected",
        revision: 1,
        agentList:{total:3,working:1,blocked:1,agents:[
          {title:"実装担当 (12345678) / 操舵室",state:"working"},
          {title:"レビュー担当 (23456789) / 操舵室",state:"blocked"},
          {title:"待機担当 (34567890) / 操舵室",state:"idle"},
        ]},
        notices: [{ id:"00000000-0000-4000-8000-000000000091", message: "「操舵室 / worker」の作業が完了しました。" }],
      }),
      onInbox: (callback) => {
        window.noticeCallback = callback;
        return () => {};
      },
      openTools:async()=>window.calls.push(["tools-open"]),
      draftState:async()=>({revision:0,text:null}),
      onDraft:callback=>{window.draftCallback=callback;return()=>{};},
      consumeDraft:async input=>window.calls.push(["consume-draft",input]),
      draftTranscription:async input=>{window.calls.push(["transcription-draft",input]);await window.deliverToolDraft({revision:(window.mockDraftRevision=(window.mockDraftRevision||0)+1),text:input.text});},
      draftMessage:async input=>{window.calls.push(["draft-message",input]);await window.deliverToolDraft({revision:(window.mockDraftRevision=(window.mockDraftRevision||0)+1),text:input.text});},
      appearanceState:async()=>({revision:1,mode:window.preferences.appearance??"dark"}),
      onAppearance:callback=>{window.appearanceCallback=state=>{window.appearanceRevision=state.revision;callback(state);};return()=>{};},
      read: async () => window.preferences,
      save: async (preferences) => {
        window.calls.push(["save", preferences]);
        window.preferences = preferences;
        window.appearanceCallback?.({revision:(window.appearanceRevision??1)+1,mode:preferences.appearance??"dark"});
        return preferences;
      },
      open: async () => window.calls.push(["open"]),
      settings: async () => window.calls.push(["settings"]),
      chat: async () => window.calls.push(["chat"]),
      beginResize:async input=>{window.calls.push(["resize-start",input]);return{token:"00000000-0000-4000-8000-000000000080"};},
      resize:async input=>window.calls.push(["resize-move",input]),
      endResize:async input=>window.calls.push(["resize-end",input]),
      windowState:async()=>window.chromeState??{maximized:false,revision:0},
      onWindowState:callback=>{window.chromeStateCallback=callback;return()=>{};},
      windowResize: async input => {window.calls.push(["window-resize",input]);return {token:"00000000-0000-4000-8000-000000000080"};},
      windowAction: async action => {window.calls.push(["window-action",action]);const state=window.chromeState??{maximized:false,revision:0};window.chromeState=action==="maximize"?{maximized:!state.maximized,revision:state.revision+1}:state;window.chromeStateCallback?.(window.chromeState);return window.chromeState;},
      hide: async () => window.calls.push(["hide"]),
    };
  });
  let conversationPage;
  await context.exposeBinding("deliverToolDraft",async(_source,state)=>{if(conversationPage)await conversationPage.evaluate(value=>window.draftCallback(value),state);});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const origin=`http://127.0.0.1:${server.address().port}`;
 await page.goto(origin+'/bubble.html');await expect(page.locator('#agent-kind option[value="cursor"]')).toHaveCount(1);
 await page.locator('#agent-kind').selectOption('cursor');await expect(page.locator('#agent-model option[value="cursor-test-model"]')).toHaveCount(1);await page.locator('#agent-model').selectOption('cursor-test-model');await page.locator('#agent-effort').selectOption('');
 await expect(page.locator('#captain-choice-status')).toContainText('保存しました');const calls=await page.evaluate(()=>window.calls);assert(calls.some(c=>c[0]==='captain-choice'&&c[1].kind==='cursor'&&c[1].profile.model==='cursor-test-model'&&c[1].profile.effort===''));assert(!calls.some(c=>['send','start-session','audio'].includes(c[0])));
 await page.reload();await expect(page.locator('#agent-kind')).toHaveValue('cursor');await expect(page.locator('#agent-model')).toHaveValue('cursor-test-model');await expect(page.locator('#agent-effort')).toHaveValue('');assert.deepEqual(errors,[]);await page.screenshot({path:join(repo,'.aidev/works/20261107-cursor-profile/browser.png')});console.log(JSON.stringify({cursorVisible:true,modelSpecificEffort:true,selectionSaved:true,reloadRestored:true,noAutoSend:true,pageErrors:errors}));
}finally{clearTimeout(watchdog);await browser?.close();await new Promise(resolve=>server.close(resolve));}
