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
const watchdog = setTimeout(() => { console.error("Generated UI exceeded 30 seconds"); process.exit(124); }, 30000);
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
    window.ocrRevision=1; window.currentOcr={};
    window.savedNotes = [];
    window.toolsRevision = 1;
    window.currentTools = {transcriptionContext:"a".repeat(64),revision:1,transcriptionEnabled:true,transcriptionProvider:"local",transcriptionOrigin:"http://127.0.0.1:8080",notes:[],notesError:"",transcription:{revision:1,status:"idle",name:"",text:"",message:"生成されたテストです。"}};
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
  let page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/settings.html`);
  const checkWindow = async role => {
    for(const size of [{width:520,height:670},{width:360,height:480}]){
      await page.setViewportSize(size);
      await expect(page.locator(".assistant-window-header")).toBeVisible();
      await expect(page.locator(".speech-tail")).toHaveCount(0);
      const layout=await page.evaluate(()=>{
        const body=document.body,card=document.querySelector(".assistant-card"),content=document.querySelector(".assistant-scroll");
        return {outer:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth,scroll:getComputedStyle(content).overflowY,border:getComputedStyle(card).borderTopColor,radius:getComputedStyle(card).borderTopLeftRadius,scrollbar:getComputedStyle(content).scrollbarColor,background:getComputedStyle(body).backgroundColor,card:card.getBoundingClientRect().toJSON(),header:document.querySelector(".assistant-window-header").getBoundingClientRect().height,head:document.querySelector(".assistant-window-header").getBoundingClientRect().top};
      });
      if(!layout.outer)await page.screenshot({path:"/tmp/soda-sections-layout-failure.png"});
      assert.ok(layout.outer,role+" has no page scrollbar");assert.equal(layout.background,"rgba(0, 0, 0, 0)");assert.equal(layout.card.x,0);assert.equal(layout.card.y,0);assert.equal(layout.card.width,size.width);assert.ok(layout.header<=30);assert.equal(layout.scroll,"auto");assert.equal(layout.border,"rgb(229, 190, 97)");assert.equal(layout.radius,"20px");assert.ok(layout.scrollbar.includes("201, 166, 79"));
      await page.locator(".assistant-scroll").evaluate(el=>{el.scrollTop=el.scrollHeight;});
      assert.equal(await page.locator(".assistant-window-header").evaluate(el=>el.getBoundingClientRect().top),layout.head);
      await page.getByRole("button",{name:"最小化",exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["window-action","minimize"]);
      await page.getByRole("button",{name:"最大化",exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["window-action","maximize"]);
      const restore=page.getByRole("button",{name:"元のサイズに戻す",exact:true});
      await expect(restore).toHaveAttribute("data-maximized","true");await expect(restore.locator("svg path")).toHaveCount(2);
      await restore.click();
      await expect(page.getByRole("button",{name:"最大化",exact:true}).locator("svg rect")).toHaveCount(1);
      await page.getByRole("button",{name:"最大化",exact:true}).click();
      await page.evaluate(()=>{window.chromeState={maximized:false,revision:window.chromeState.revision+1};window.chromeStateCallback(window.chromeState);});
      await expect(page.getByRole("button",{name:"最大化",exact:true})).toHaveAttribute("data-maximized","false");
      await page.evaluate(()=>window.chromeStateCallback({maximized:true,revision:0}));
      await expect(page.getByRole("button",{name:"最大化",exact:true})).toHaveAttribute("data-maximized","false");
      await page.locator(".assistant-scroll").evaluate(el=>{el.scrollTop=0;});
    }
    await page.setViewportSize({width:520,height:670});
    await page.screenshot({path:`/tmp/soda-assistant-${role}-styled.png`});
  };
  for(const size of [{width:520,height:670},{width:360,height:480}]){
    await page.setViewportSize(size);
    const footer=page.locator(".settings-footer");await expect(footer).toBeVisible();
    const before=await footer.boundingBox();
    await page.locator(".assistant-scroll").evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const after=await footer.boundingBox();assert.equal(after.y,before.y,"settings footer must not move when content scrolls");
    assert.equal(await page.locator('.settings-footer button[type="submit"]').evaluate(el=>el.form?.id),"form");
    await page.evaluate(()=>{document.getElementById("status").textContent="保存しました。";});
    const saveBox=await page.locator('.settings-footer button[type="submit"]').boundingBox(),openBox=await page.locator("#open").boundingBox(),statusBox=await page.locator("#status").boundingBox();
    assert.ok(statusBox.x>=openBox.x+openBox.width,"save status follows the action buttons");
    assert.ok(Math.abs(statusBox.y+statusBox.height/2-(saveBox.y+saveBox.height/2))<2,"save status is on the button row");
    assert.ok(after.y+after.height<=size.height&&after.y>=0,"footer is contained in the window");
    await page.locator(".assistant-scroll").evaluate(el=>{el.scrollTop=0;});
  }
  await page.evaluate(()=>{document.getElementById("status").textContent="";});
  await checkWindow("settings");
  await page.goto(`${origin}/panel.html`);
  await page.locator("#panel-slot").evaluate(el=>{el.textContent="生成した操舵室ビュー（実際のアプリでは隔離した描画面を配置）";});
  await checkWindow("panel");
  await page.locator("[data-window-resize=e]").hover();await page.mouse.down();await page.mouse.move(518,350);await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.calls.some(c=>c[0]==="window-resize"&&c[1].phase==="start"&&c[1].handle==="e"))).toBe(true);
  await page.goto(`${origin}/settings.html`);
  await page.setViewportSize({width:400,height:640});
  await expect(page.getByRole("button", { name: "操舵室を開く" })).toBeDisabled();
  await expect(page.locator("#ocrProvider")).toHaveValue("agent");
  await page.locator("#claude-model").fill("sonnet");
  await page.locator("#claude-effort").selectOption("high");
  await page.locator("#codex-model").fill("custom-model");
  await page.locator("#codex-effort").selectOption("low");
  for(const kind of ["muse","agy","copilot"]){await page.locator(`#${kind}-model`).fill(`${kind}-test-model`);await page.locator(`#${kind}-effort`).selectOption("high");}
  await page.getByRole("button", {name:"保存",exact:true}).press("Enter");
  await expect(page.locator("#status")).toHaveText("保存しました。");
  assert.deepEqual(await page.evaluate(()=>window.preferences.agentProfiles), {claude:{model:"sonnet",effort:"high"},codex:{model:"custom-model",effort:"low"},muse:{model:"muse-test-model",effort:"high"},agy:{model:"agy-test-model",effort:"high"},copilot:{model:"copilot-test-model",effort:"high"}});
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="start-session").length),0);
  await expect(page.locator("#claude-model")).toHaveValue("sonnet");
  for(const kind of ["muse","agy","copilot"]){await expect(page.locator(`#${kind}-model`)).toHaveValue(`${kind}-test-model`);await expect(page.locator(`#${kind}-effort`)).toHaveValue("high");}
  await expect(page.locator("#followSystemMotion")).toBeChecked();
  await page.locator("#followSystemMotion").uncheck();
  await expect(page.locator("#voiceEnabled")).not.toBeChecked();
  await page.locator("#voiceEnabled").check();
  await page.locator("#idleFloating").check();
  await page.locator("#voiceProvider").selectOption("voicevox");
  await page.locator("#voice-speakers").click();
  await page.locator("#voicevoxStyleId").selectOption("108");
  await expect(page.locator("#voiceFollowCharacter")).not.toBeChecked();
  await page.getByRole("button",{name:"ボイスを試す",exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="test-voice").at(-1)[1].voicevoxStyleId),108);
  assert.notEqual(await page.evaluate(()=>window.preferences.voicevoxStyleId),108);
  await page.getByRole("button",{name:"保存",exact:true}).press("Enter");
  await expect(page.locator("#status")).toHaveText("保存しました。");
  assert.equal(await page.evaluate(()=>window.preferences.voiceEnabled),true);
  assert.equal(await page.evaluate(()=>window.preferences.idleFloating),true);
  assert.equal(await page.evaluate(()=>window.preferences.voiceProvider),"voicevox");
  assert.equal(await page.evaluate(()=>window.preferences.voicevoxStyleId),108);
  assert.equal(await page.evaluate(()=>window.preferences.followSystemMotion),false);
  await page.getByRole("button",{name:"ボイスを試す",exact:true}).press("Enter");
  await expect(page.locator("#voice-status")).toHaveText("読み上げています。");
  await page.locator("#voice-stop").press("Enter");
  await expect(page.locator("#voice-status")).toHaveText("読み上げを停止しました。");
  await page.locator("#voiceProvider").selectOption("core");
  await page.locator("#voice-core-refresh").click();
  await page.locator("#voiceCoreVersion").selectOption("0.17.0");
  await page.getByRole("button",{name:"ボイスを試す",exact:true}).click();
  const coreDraft=await page.evaluate(()=>window.calls.filter(c=>c[0]==="test-voice").at(-1)[1]);
  assert.equal(coreDraft.voiceCoreVersion,"0.17.0");assert.equal(coreDraft.voiceProvider,"core");assert.equal(coreDraft.voicevoxOrigin,undefined);
  await page.evaluate(()=>{window.originalSpeakers=window.assistant.voiceSpeakers;window.assistant.voiceSpeakers=()=>new Promise(resolve=>window.finishSpeakers=resolve);});
  await page.locator("#voice-speakers").click();await expect(page.locator("#voice-speakers")).toBeDisabled();
  await page.locator("#voiceCoreVersion").selectOption("0.17.1");
  await page.evaluate(()=>window.finishSpeakers([{id:999,label:"古いCOREの声"}]));
  await expect(page.locator("#voice-speakers")).toBeEnabled();await expect(page.locator('#voicevoxStyleId option[value="999"]')).toHaveCount(0);
  await page.evaluate(()=>window.assistant.voiceSpeakers=window.originalSpeakers);
  await page.locator("#voiceProvider").selectOption("voicevox");

  await page.locator("#voiceEnabled").uncheck();
  await page.getByRole("button",{name:"保存",exact:true}).press("Enter");
  assert.equal(await page.evaluate(()=>window.preferences.voiceEnabled),false);
  await page.locator("#enabled").press("Space");
  await expect(page.locator("#enabled")).toBeChecked();
  await page.locator("#preview-yukkuri-characters").press("Enter");
  await expect(page.locator("#character-pack-preview img")).toHaveCount(1);
  await expect(page.locator("#character-pack-preview img")).toHaveAttribute("alt","ずんだもん");
  await page.locator("#import-character-pack").press("Enter");
  await page.locator("#characterId").selectOption("plugin:yukkuri-work/zundamon");
  await expect(page.locator("#selected-character-preview")).toHaveAttribute("alt","ずんだもん");
  await expect(page.locator("#selected-character-credit")).toHaveText("元の立ち絵の素材メモ");
  await page.locator("#selected-character-credit").evaluate(el=>el.textContent="利用条件と説明文です。\n".repeat(80));
  const creditSection=page.locator('[data-collapse-empty="selected-character-credit selected-character-persona"]');
  await expect.poll(()=>page.locator("#selected-character-credit").evaluate(el=>el.clientHeight>=el.scrollHeight-1)).toBe(true);
  await creditSection.locator(":scope > summary").click();await expect(page.locator("#selected-character-credit")).not.toBeVisible();
  await creditSection.locator(":scope > summary").press("Enter");await expect(page.locator("#selected-character-credit")).toBeVisible();
  await page.locator("#appearance-section > summary").click();
  await page.locator("#characterSize").evaluate(el=>{el.value="";el.form.reportValidity();});
  await expect(page.locator("#appearance-section")).toHaveJSProperty("open",true);await page.locator("#characterSize").fill("192");

  await page.locator("#voiceFollowCharacter").check();
  await expect(page.locator("#voicevoxStyleId")).toHaveValue("3");
  await page.getByRole("button",{name:"保存",exact:true}).press("Enter");
  assert.equal(await page.evaluate(()=>window.preferences.characterId),"plugin:yukkuri-work/zundamon");
  assert.equal(await page.evaluate(()=>window.preferences.allowPluginCharacters),true);
  for (const character of ["captain-male", "captain-female", "sodashitsu-icon", "captain-robot"]) {
    await page.locator("#characterId").selectOption(character);
    await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
    await expect(page.locator("#status")).toHaveText("保存しました。");
    assert.equal(await page.evaluate(() => window.preferences.characterId), character);
  }
  await page.locator("#displayId").selectOption("1");await page.locator("#positionX").fill("100");await page.locator("#positionY").fill("200");
  await page.locator("#mode").selectOption("tray");
  await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
  await expect(page.locator("#status")).toHaveText("保存しました。");
  assert.deepEqual(await page.evaluate(()=>window.preferences.position),{displayId:"1",x:100,y:200});
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
  await expect(page.locator("#status")).toContainText("disk full");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await page.goto(`${origin}/character.html`);
  await expect(page.locator("#portrait")).toHaveAttribute("src", "captain-female.png");
  await expect.poll(()=>page.locator("#portrait").evaluate(el=>el.naturalWidth)).toBe(1024);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"アシスタント設定",exact:true})).toHaveCount(0);
  const motion=page.locator("#character-motion");
  await expect(motion).toHaveAttribute("data-motion","idle");
  const firstMotion=await motion.evaluate(el=>el.style.transform);
  await expect.poll(()=>motion.evaluate(el=>el.style.transform)).not.toBe(firstMotion);
  await page.evaluate(()=>window.characterCallback({revision:2,notificationSeq:0,mode:"speaking",paused:false,reducedMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","speaking");
  await page.evaluate(()=>window.characterCallback({revision:3,notificationSeq:1,mode:"idle",paused:false,reducedMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","notice");
  const box=await motion.boundingBox();assert.ok(box.x>=-.01&&box.y>=-.01&&box.x+box.width<=400.01&&box.y+box.height<=640.01,"motion stays inside character bounds");
  await expect(motion).toHaveAttribute("data-motion","idle");
  await page.evaluate(()=>window.characterCallback({revision:4,notificationSeq:1,mode:"working",paused:false,reducedMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","working");
  await page.evaluate(()=>window.characterCallback({revision:5,notificationSeq:1,mode:"idle",paused:false,reducedMotion:true}));
  await expect(motion).toHaveAttribute("data-motion","still");assert.equal(await motion.evaluate(el=>el.style.transform),"");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.evaluate(()=>window.characterCallback({revision:6,notificationSeq:1,mode:"speaking",paused:false,reducedMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","still");
  await page.evaluate(()=>window.characterCallback({revision:7,notificationSeq:1,mode:"idle",paused:false,reducedMotion:false,followSystemMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","idle");
  await expect.poll(()=>motion.evaluate(el=>getComputedStyle(el).transform)).not.toBe("none");
  await page.evaluate(()=>window.characterCallback({revision:8,notificationSeq:1,mode:"speaking",paused:false,reducedMotion:true,followSystemMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","still");
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.evaluate(()=>window.characterCallback({revision:9,notificationSeq:2,mode:"idle",paused:true,reducedMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","still");
  await page.evaluate(()=>window.characterCallback({revision:10,notificationSeq:2,mode:"idle",paused:false,reducedMotion:false}));
  await expect(motion).toHaveAttribute("data-motion","idle");
  await page.evaluate(()=>window.characterCallback({revision:11,notificationSeq:2,mode:"idle",paused:false,reducedMotion:false,idleFloating:true}));
  await expect(page.locator("body")).toHaveClass(/idle-floating/);
  const floatY=await motion.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42);
  await expect.poll(()=>motion.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42)).not.toBe(floatY);
  const floatBox=await motion.boundingBox();assert.ok(floatBox.y>=-.01&&floatBox.y+floatBox.height<=648.01,"floating moves down from the taskbar edge within its clipped eight-DIP range");
  await page.evaluate(()=>window.characterCallback({revision:12,notificationSeq:2,mode:"idle",paused:false,reducedMotion:false,idleFloating:false}));
  await expect.poll(()=>motion.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42)).toBe(0);
  await page.getByRole("button", { name: "船長と話す" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "chat");
  await page.addInitScript(()=>{window.preferences.characterId="sodashitsu-icon";});
  await page.goto(`${origin}/character.html`);
  await expect(page.locator("#portrait")).toHaveAttribute("src","sodashitsu-icon.svg");
  await expect.poll(()=>page.locator("#portrait").evaluate(el=>el.naturalWidth)).toBe(256);
  const iconMotion=page.locator("#character-motion"),rotation=await iconMotion.evaluate(el=>el.style.transform);
  await expect.poll(()=>iconMotion.evaluate(el=>el.style.transform)).not.toBe(rotation);
  assert.equal(await iconMotion.evaluate(el=>getComputedStyle(el).transformOrigin),"200px 320px");
  await page.evaluate(()=>window.characterCallback({revision:2,notificationSeq:0,mode:"idle",paused:false,reducedMotion:false,iconRotation:false,idleFloating:true}));
  await expect.poll(()=>iconMotion.evaluate(el=>el.style.transform.includes("rotate(0deg)"))).toBe(true);
  await page.evaluate(()=>window.characterCallback({revision:3,notificationSeq:0,mode:"idle",paused:false,reducedMotion:true,iconRotation:true,idleFloating:true}));
  await expect(iconMotion).toHaveAttribute("data-motion","still");
  console.log("PASS: original Sodashitsu icon loads, rotates around its centre, and obeys rotation/reduced-motion preferences");
  await page.setViewportSize({width:340,height:220});
  await page.goto(`${origin}/notice.html`);
  await expect(page.locator("#notice-title")).toContainText("実装担当");
  await expect(page.locator("#notice-message")).toContainText("変更を適用しますか？");
  if(process.env.SODA_ASSISTANT_NOTICE_SCREENSHOT)await page.screenshot({path:process.env.SODA_ASSISTANT_NOTICE_SCREENSHOT});
  await page.evaluate(()=>window.compactCallback({revision:2,title:"レビュー担当",message:"<img src=x onerror=alert(1)>確認してください。".repeat(30)}));
  await expect(page.locator("#notice-title")).toHaveText("レビュー担当");
  await expect(page.locator("#notice-content img")).toHaveCount(0);
  await expect(page.locator("#notice-more")).toBeVisible();
  assert.equal(await page.locator("#notice-content").evaluate(el=>getComputedStyle(el).overflowY),"hidden");
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c[0]==="notice-size").at(-1)?.[1].height)).toBeGreaterThan(220);
  const naturalHeight=await page.evaluate(()=>window.calls.filter(c=>c[0]==="notice-size").at(-1)[1].height);
  await page.setViewportSize({width:340,height:naturalHeight});
  await expect(page.locator("#notice-more")).toBeHidden();
  await page.setViewportSize({width:340,height:220});
  await page.evaluate(()=>window.compactCallback({revision:1,title:"古い通知",message:"古い内容"}));
  await expect(page.locator("#notice-title")).toHaveText("レビュー担当");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
  await page.getByRole("button",{name:"内容を開く",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["open-notice",{revision:2}]);
  await page.getByRole("button",{name:"通知の吹き出しを閉じる",exact:true}).press("Enter");
  assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),"dismiss-notice");
  await page.setViewportSize({width:400,height:640});
  await page.goto(`${origin}/bubble.html`);
  await expect(page.getByRole("log")).toContainText("こんにちは。操舵室の船長です。");
  await expect(page.locator(".bubble-resize")).toHaveCount(3);
  assert.deepEqual(await page.locator(".bubble-resize").evaluateAll(rows=>rows.map(el=>el.dataset.resize).sort()),["n","nw","w"]);
  await expect(page.locator(".speech-tail")).toBeVisible();
  const tail=await page.locator(".speech-tail").evaluate(el=>{
   const style=getComputedStyle(el),r=el.getBoundingClientRect(),speech=document.querySelector(".speech");
   return {width:parseFloat(style.width),transform:style.transform,bottom:r.bottom,bodyBottom:speech.getBoundingClientRect().bottom,outside:!speech.contains(el),height:innerHeight};
  });
  assert.equal(tail.width,18);assert.notEqual(tail.transform,"none");assert.ok(tail.outside);assert.ok(tail.bottom>tail.bodyBottom+8);assert.ok(tail.bottom<tail.height);

  await page.mouse.move(200,8); await page.mouse.down();
  await expect.poll(()=>page.evaluate(()=>window.calls.some(call=>call[0]==="resize-start"&&call[1].handle==="n"))).toBe(true);
  await page.mouse.move(200,38); await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.calls.some(call=>call[0]==="resize-end"))).toBe(true);
  assert.ok(await page.evaluate(()=>window.calls.some(call=>call[0]==="resize-move")));

  await expect(page.locator("#destination")).toHaveText("専用アシスタント");
  await expect(page.locator("#notices")).toContainText("作業が完了しました。");
  await expect(page.locator("#agent-roster-summary")).toContainText("3件・作業中 1件・確認待ち 1件");
  await expect(page.locator("#agent-roster-rows li")).toHaveCount(3);
  await expect(page.locator("#agent-roster-rows")).toContainText("実装担当");
  await page.locator("#agent-filter").selectOption("working");
  await expect(page.locator("#agent-roster-rows li")).toHaveCount(1);
  await expect(page.locator("#agent-roster-rows")).toContainText("実装担当");
  await page.locator("#agent-filter").selectOption("blocked");
  await expect(page.locator("#agent-roster-rows")).toContainText("レビュー担当");
  await page.locator("#agent-filter").selectOption("all");
  if(process.env.SODA_ASSISTANT_UI_SCREENSHOT)await page.screenshot({path:process.env.SODA_ASSISTANT_UI_SCREENSHOT});


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
  await expect(page.locator("#agent-roster-rows li")).toHaveCount(0);
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
    session: {paneId:"00000000-0000-4000-8000-000000000002",kind:"codex",state:"ready",launchSettings:{model:"custom-model",effort:"high"},agent:{instanceId:actorId,state:"idle"}},
    launchProfiles:{codex:{model:"new-model",effort:"low"}},
    kinds: [{kind:"codex",label:"Codex",available:true}],
    messages: [{role:"assistant",text:"<img src=x onerror=alert(1)>こんにちは。"}], hint:"船長へのメッセージを送れます。"
  }), actorId);
  await expect(page.locator("#launch-settings")).toContainText("起動時指定：モデル custom-model / effort high");
  await expect(page.locator("#launch-settings")).toContainText("保存済み設定と異なります");
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
  await expect(page.locator("#standard-tools")).toHaveCount(0);
  await page.getByRole("button",{name:"ツールを開く",exact:true}).press("Enter");
  assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),"tools-open");
  conversationPage=page;page=await context.newPage();page.on("pageerror",error=>errors.push(String(error)));
  await page.goto(`${origin}/tools.html`);
  await checkWindow("tools");
  await page.setViewportSize({width:400,height:640});
  await expect(page.getByRole("heading",{name:"アシスタントのツール"})).toBeVisible();
  // Standard tools share one parent; plugin state survives folding that parent.
  assert.equal(await page.locator("#ocr-tools").evaluate(el=>el.closest("#standard-tools")!==null),true);
  assert.equal(await page.locator("#reminder-tools").evaluate(el=>el.closest("#standard-tools")!==null),true);
  await page.locator("#plugin-tools > summary").press("Enter");
  await page.locator("#standard-tools > summary").press("Enter");
  await expect(page.locator("#apps-refresh")).toBeVisible();
  await expect(page.locator("#ocr-drop")).toBeHidden();
  await page.locator("#standard-tools > summary").press("Enter");
  await expect(page.locator("#apps-refresh")).toBeVisible();
  await page.locator("#plugin-tools > summary").press("Enter");
  const sendsBeforeTools=await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length);
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array([1,2,3])],"generated.wav",{type:"audio/wav"}));document.getElementById("audio-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));});
  await expect(page.locator("#audio-drop-name")).toContainText("generated.wav");
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="transcribe-upload").length),0);
  await page.locator("#audio-drop-start").press("Enter");
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c[0]==="transcribe-upload").length)).toBe(1);
  assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c[0]==="transcribe-upload")[1]),{name:"generated.wav",bytes:3,revision:1,context:"a".repeat(64)});
  await expect(page.locator("#audio-drop-start")).toBeDisabled();
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File(["bad"],"bad.txt"));document.getElementById("audio-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));});
  await expect(page.locator("#audio-drop-name")).toContainText("対応形式");
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="transcribe-upload").length),1);

  // A conversation/provider switch while bytes are loading must invalidate consent.
  await page.evaluate(()=>{const file=new File(["wav"],"pending.wav");file.arrayBuffer=()=>new Promise(resolve=>{window.finishAudioRead=()=>resolve(new Uint8Array([1,2,3]).buffer);});const data=new DataTransfer();data.items.add(file);document.getElementById("audio-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));});
  await page.locator("#audio-drop-start").press("Enter");
  await expect.poll(()=>page.evaluate(()=>typeof window.finishAudioRead)).toBe("function");
  await page.evaluate(()=>{window.currentTools={...window.currentTools,revision:++window.toolsRevision,transcriptionContext:"b".repeat(64)};for(const callback of window.toolWatchers)callback(window.currentTools);window.finishAudioRead();});
  await expect(page.locator("#audio-drop-name")).toContainText("取り消しました");
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="transcribe-upload").length),1);

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
  await expect(conversationPage.locator("#message")).toHaveValue(/要約してください/);
  await page.locator("#prepare-translation").press("Enter");
  await expect(conversationPage.locator("#message")).toHaveValue(/日本語に翻訳/);
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
  const beforeAgentAudio=await page.evaluate(()=>window.calls.length);
  await page.evaluate(()=>{window.currentTools={...window.currentTools,revision:++window.toolsRevision,transcriptionProvider:"agent"};window.toolsCallback(window.currentTools);});
  await expect(page.locator("#transcription-route")).toContainText("専用Codexとその提供元");
  await expect(page.locator("#transcribe-file")).toHaveText("音声ファイルを専用Codexへ送る");
  await expect(page.locator("#record-transcribe")).toHaveText("録音を専用Codexへ送る");
  assert.equal(await page.evaluate(()=>window.calls.length),beforeAgentAudio);
  await page.evaluate(()=>{window.currentTools={...window.currentTools,revision:++window.toolsRevision,transcriptionProvider:"local"};window.toolsCallback(window.currentTools);});
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length),sendsBeforeTools);
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="get-user-media").length),0);
  await page.locator("#record-start").press("Enter");
  await expect(page.locator("#record-status")).toContainText("録音中");
  await expect(page.locator("#record-indicator")).toBeVisible();
  await expect(page.locator("#record-stop-visible")).toBeVisible();
  // IntersectionObserver/rAF stalls in this WSL headless environment; inspect browser DOM geometry.
  assert.deepEqual(await page.evaluate(()=>["record-stop-visible"].map(id=>{
    const bounds=document.getElementById(id).getBoundingClientRect();
    return{ id,inside:bounds.width>0 && bounds.height>0 && bounds.top>=0 && bounds.bottom<=innerHeight && bounds.left>=0 && bounds.right<=innerWidth };
  })),[{id:"record-stop-visible",inside:true}]);
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
  await page.getByRole("button", { name: "閉じる",exact:true }).press("Enter");
  assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), ["window-action", "close"]);
  assert.deepEqual(errors, []);
  await page.evaluate(() => { document.getElementById("standard-tools").open=true; document.getElementById("ocr-tools").open=true; });
  await expect(page.locator("#capture-list,#capture-start,#capture-sources")).toHaveCount(0);
  const importsBefore=await page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-upload").length);
  await page.evaluate(()=>{
    const bytes=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII="),c=>c.charCodeAt(0)),data=new DataTransfer();
    data.items.add(new File([bytes],"generated.png",{type:"image/png"}));document.getElementById("ocr-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));
  });
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-upload").length)).toBe(importsBefore+1);
  await expect(page.locator("#ocr-preview")).toHaveAttribute("src",/^data:image\/png;base64,/);
  const recognitionBefore=await page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-run").length);
  await page.evaluate(()=>{
    const data=new DataTransfer(),bytes=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII="),c=>c.charCodeAt(0));
    data.items.add(new File([bytes],"pasted.png",{type:"image/png"}));document.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data}));
  });
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-upload").length)).toBe(importsBefore+2);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-run").length),recognitionBefore);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="get-display-media").length),0);
  assert.equal(await page.evaluate(()=>{const data=new DataTransfer();data.setData("text/plain","通常の文章");const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data});document.getElementById("tool-text").dispatchEvent(event);return event.defaultPrevented;}),false);
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File(["bad"],"invalid.txt"));document.getElementById("ocr-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));});
  await expect(page.locator("#ocr-status")).toContainText("対応形式");
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-upload").length),importsBefore+2);
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(8*1024*1024+1)],"large.png",{type:"image/png"}));document.getElementById("ocr-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));});
  await expect(page.locator("#ocr-status")).toContainText("8MiB");
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-upload").length),importsBefore+2);
  await page.locator("#ocr-file").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#ocr-preview")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.locator("#ocr-run")).toBeEnabled();
  // A later metadata event for the same image may precede the image response.
  await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=300;const ctx=window.realCanvasContext.call(canvas,"2d");ctx.fillStyle="white";ctx.fillRect(0,0,1200,300);ctx.fillStyle="black";ctx.font="40px sans-serif";ctx.fillText("OCR preview selection",60,100);window.ocrTestImage=window.realCanvasDataURL.call(canvas);window.ocrMetadataRace=true;});
  await page.locator("#ocr-file").press("Enter");
  await expect(page.locator("#ocr-preview-panel")).toBeVisible();
  await expect.poll(()=>page.locator("#ocr-preview").evaluate(el=>el.naturalWidth)).toBe(1200);
  await expect(page.locator("#ocr-run")).toBeEnabled();
  const selectOcr=async(reverse=false)=>{
    await page.locator("#ocr-preview").scrollIntoViewIfNeeded();const box=await page.locator("#ocr-preview").boundingBox();assert.ok(box.width<1200&&box.height>0);
    const a={x:box.x+box.width*.2,y:box.y+box.height*.2},b={x:box.x+box.width*.8,y:box.y+box.height*.8};
    await page.mouse.move((reverse?b:a).x,(reverse?b:a).y);await page.mouse.down();await page.mouse.move((reverse?a:b).x,(reverse?a:b).y,{steps:5});await page.mouse.up();
    const values=await page.evaluate(()=>Object.fromEntries(["x","y","width","height"].map(k=>[k,Number(document.getElementById(`ocr-${k}`).value)])));
    for(const [k,v] of Object.entries({x:240,y:60,width:720,height:180}))assert.ok(Math.abs(values[k]-v)<=2,`${k}: ${values[k]}`);
    await expect(page.locator("#ocr-selection")).toBeVisible();return values;
  };
  await selectOcr();const chosen=await selectOcr(true);
  if(process.env.SODA_ASSISTANT_OCR_SCREENSHOT)await page.locator("#ocr-preview-panel").screenshot({path:process.env.SODA_ASSISTANT_OCR_SCREENSHOT});
  await page.locator("#ocr-crop").press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c[0]==="ocr-crop").at(-1)[1].rect),chosen);
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
  await page.evaluate(()=>{window.currentOcr={...window.currentOcr,provider:"agent",status:"ready",text:""};window.ocrCallback(window.currentOcr);});
  await expect(page.locator("#ocr-run")).toHaveText("画像をエージェントに送って読む");
  await expect(page.locator("#ocr-tools")).toContainText("通常24時間");
  const beforeImage=await page.evaluate(()=>window.calls.filter(call=>call[0]==="ocr-run").length);
  await page.locator("#ocr-run").press("Enter");
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="ocr-run").length),beforeImage+1);
  await page.locator("#ocr-discard").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#ocr-result")).toHaveValue("");
  await expect(page.locator("#ocr-preview")).not.toHaveAttribute("src");
  await page.evaluate(()=>{
    document.getElementById("reminder-label").value="打ち合わせ";document.getElementById("reminder-text").value="打ち合わせの時間です";document.getElementById("reminder-date").value="2026-11-01T12:00";document.getElementById("reminder-save").click();
  });
  await expect(page.locator("#reminder-status")).toHaveText("予約しました。");
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="save-reminder").length),1);
  await page.evaluate(()=>window.remindersCallback({revision:2,connected:true,message:"予約しました",jobs:[],runs:[{id:"00000000-0000-4000-8000-000000000099",input:"<img src=x>打ち合わせの時間です"}]}));
  await expect(page.locator(".reminder-message")).toContainText("お知らせです。<img src=x>打ち合わせの時間です");
  await expect(page.locator(".reminder-message img")).toHaveCount(0);
  await page.getByRole("button",{name:"確認しました",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["ack-reminder",{id:"00000000-0000-4000-8000-000000000099"}]);
  await page.evaluate(()=>{document.getElementById("apps-refresh").closest("details").open=true;});
  await page.locator("#apps-refresh").press("Enter");await expect(page.locator("#app-call")).toBeEnabled();
  await page.getByRole("button",{name:"プラグインUI",exact:true}).press("Enter");assert.equal(await page.evaluate(()=>window.calls.at(-1)[0]),"open-app");
  await page.locator("#app-params").fill('{"query":"明示した検索"}');await page.locator("#app-call").press("Enter");
  await expect(page.locator("#app-result")).toHaveValue("<img src=x>プラグインの結果");await expect(page.locator("#app-views img")).toHaveCount(0);
  await page.locator("#app-use").press("Enter");await expect(page.locator("#tool-text")).toHaveValue("<img src=x>プラグインの結果");
  await page.evaluate(()=>{window.assistant.apps=async()=>{throw Error("一覧が変わりました");};});await page.locator("#apps-refresh").press("Enter");await expect(page.locator("#app-views button")).toHaveCount(0);await expect(page.locator("#app-call")).toBeDisabled();
  await page.evaluate(()=>{window.originalClipboardRead=window.assistant.readClipboard;window.assistant.readClipboard=async()=>"コピーした長い文章\n".repeat(100);});
  await page.locator("#read-clipboard").press("Enter");
  await expect.poll(()=>page.locator("#tool-text").evaluate(el=>el.clientHeight>=el.scrollHeight-1)).toBe(true);
  await page.evaluate(()=>{window.assistant.readClipboard=window.originalClipboardRead;});
  page=conversationPage;
  await page.evaluate(()=>window.remindersCallback({revision:3,connected:true,jobs:[],runs:[{id:"00000000-0000-4000-8000-000000000044",input:"会話で確認するリマインダー"}],message:"届いています"}));
  await expect(page.locator("#reminder-notices")).toContainText("会話で確認するリマインダー");
  await page.evaluate(()=>window.noticeCallback({status:"connected",revision:98,latestNotification:{seq:1,title:"リマインダー：予定",message:"会話で確認するリマインダー"},notices:[{id:"00000000-0000-4000-8000-000000000092",message:"確認してください。"}]}));
  await expect(page.locator("#notification-indicator")).toContainText("リマインダー：予定");
  await page.locator("#notification-indicator").press("Enter");
  await expect(page.locator("#notification-indicator")).toBeHidden();

  await page.locator("#reminder-notices").getByRole("button",{name:"確認しました",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["ack-reminder",{id:"00000000-0000-4000-8000-000000000044"}]);
  await page.evaluate(()=>window.remindersCallback({revision:4,connected:true,jobs:[],runs:[],message:""}));
  const reply=page.locator(".notice textarea");await reply.fill("通知元への返答");
  await page.evaluate(()=>window.noticeCallback({status:"connected",revision:99,notices:[{id:"00000000-0000-4000-8000-000000000092",message:"<img src=x onerror=alert(1)>確認してください。"}]}));
  await page.evaluate(()=>window.noticeCallback({status:"connected",revision:100,latestNotification:{seq:2,id:"00000000-0000-4000-8000-000000000092",title:"実装担当 (12345678) / 操舵室",message:"確認待ち"},notices:[{id:"00000000-0000-4000-8000-000000000092",title:"実装担当 (12345678) / 操舵室",message:"確認待ち\n直近の応答：変更を適用しますか？"}]}));
  await expect(page.locator(".notice small")).toContainText("実装担当");
  await expect(page.locator(".notice-text")).toContainText("変更を適用しますか？");
  await expect(page.locator("#notification-indicator")).toBeVisible();
  await expect(page.locator("#notification-indicator")).toContainText("新しい通知：実装担当");
  await expect(page.locator("#notification-indicator")).toBeInViewport();
  if(process.env.SODA_ASSISTANT_UI_SCREENSHOT)await page.screenshot({path:process.env.SODA_ASSISTANT_UI_SCREENSHOT});
  await page.locator("#notification-indicator").press("Enter");
  await expect(page.locator("#notification-indicator")).toBeHidden();
  await page.locator(".notice-title-button").press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["notice-read",{noticeId:"00000000-0000-4000-8000-000000000092"}]);
  await expect(page.locator(".notice-current")).toHaveCount(1);

  await expect(reply).toHaveValue("通知元への返答");
  await page.getByRole("button",{name:"この通知元へ返答",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["reply-source",{noticeId:"00000000-0000-4000-8000-000000000092",text:"通知元への返答"}]);
  await page.getByRole("button",{name:"小窓で応答",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["open-source",{noticeId:"00000000-0000-4000-8000-000000000092",destination:"reply"}]);
  await page.getByRole("button",{name:"操舵室で開く",exact:true}).press("Enter");
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)),["open-source",{noticeId:"00000000-0000-4000-8000-000000000092",destination:"main"}]);
  // Pending response choices must stay outside chat even as its transcript is rebuilt.
  await page.evaluate(()=>window.chatCallback({revision:99,connected:true,busy:false,
    session:{paneId:"00000000-0000-4000-8000-000000000002",kind:"codex",state:"ready",agent:{instanceId:"00000000-0000-4000-8000-000000000001",kind:"codex",state:"idle"}},
    kinds:[{kind:"codex",label:"Codex",available:true}],messages:Array.from({length:100},(_,i)=>({id:String(i),role:"assistant",text:"長い会話".repeat(100)})),hint:"船長へのメッセージを送れます。"}));
  await expect(page.locator("#notices").getByRole("button",{name:"小窓で応答",exact:true})).toBeVisible();
  await expect(page.locator("#notices").getByRole("button",{name:"操舵室で開く",exact:true})).toBeVisible();
  await expect(page.locator("#conversation .notice")).toHaveCount(0);
  await page.evaluate(()=>window.noticeCallback({status:"connected",revision:101,
    notices:[{id:"00000000-0000-4000-8000-000000000092",message:"確認してください。"}],
    agentList:{total:300,working:256,blocked:0,agents:Array.from({length:256},(_,i)=>({title:`作業担当 ${i}`,state:"working"}))},
  }));
  await page.locator("#agent-filter").selectOption("idle");
  await expect(page.locator("#agent-roster-status")).toContainText("表示対象の先頭256件");
  await page.locator("#agent-filter").selectOption("all");
  assert.ok(await page.locator("#agent-roster-rows").evaluate(element=>element.scrollHeight<=element.clientHeight+1&&element.clientHeight>150));
  await page.locator("#notices textarea").fill("折り畳んでも保持する返答\n".repeat(20));
  await page.locator("#notices > details > summary").click();
  await expect(page.locator("#notices .notice-text")).not.toBeVisible();
  await page.locator("#notice-section > summary").click();
  await page.evaluate(()=>window.noticeCallback({status:"connected",revision:102,notices:[{id:"00000000-0000-4000-8000-000000000092",message:"更新した通知です。"}]}));
  await expect(page.locator("#notice-section")).toHaveJSProperty("open",false);
  await page.locator("#notice-section > summary").click();
  await expect(page.locator("#notices > details")).toHaveJSProperty("open",false);
  await page.locator("#notices > details > summary").press("Enter");await expect(page.locator("#notices .notice-text")).toBeVisible();
  await expect(page.locator("#notices textarea")).toHaveValue("折り畳んでも保持する返答\n".repeat(20));
  await expect.poll(()=>page.locator("#notices textarea").evaluate(el=>el.clientHeight>=el.scrollHeight-1)).toBe(true);

  // Expanded sections show every row; only the outer content area scrolls.
  await page.evaluate(() => {
    document.getElementById("conversation").replaceChildren();
    for (let i=0;i<40;i++){const message=document.createElement("p");message.className="spoken";message.textContent=`会話 ${i}: `+"長い会話の内容です。".repeat(20);document.getElementById("conversation").append(message);}
    document.getElementById("launch-settings").textContent="起動時指定：モデル 既定値 / effort 既定値（CLI内での変更は追跡しません）";
  });
  for(const viewport of [{width:400,height:640},{width:400,height:540},{width:320,height:480}]){
    await page.setViewportSize(viewport);
    const layout=await page.evaluate(()=>{
      const outer=document.querySelector(".speech-content"),frame=document.querySelector(".speech").getBoundingClientRect();outer.scrollTop=0;
      const nested=[...outer.querySelectorAll("*")].filter(el=>{
        const style=getComputedStyle(el);return ["auto","scroll"].includes(style.overflowY)&&el.scrollHeight>el.clientHeight+1;
      }).map(el=>el.id||el.tagName);
      const conversation=document.getElementById("conversation");conversation.scrollTop=100;
      return {fits:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth,frameFits:frame.top>=0&&frame.bottom<=innerHeight,outerScrolls:outer.scrollHeight>outer.clientHeight,nested,conversationDoesNotScroll:conversation.scrollTop===0&&conversation.scrollHeight<=conversation.clientHeight+1};
    });
    assert.deepEqual(layout,{fits:true,frameFits:true,outerScrolls:true,nested:[],conversationDoesNotScroll:true},`single content scroll ${viewport.width}x${viewport.height}`);
    await page.locator("#conversation-section > summary").click();await expect(page.locator("#conversation")).not.toBeVisible();
    await page.locator("#conversation-section > summary").press("Enter");await expect(page.locator("#conversation")).toBeVisible();
    await page.locator("#message").fill("長い入力です。\n".repeat(20));
    await expect.poll(()=>page.locator("#message").evaluate(el=>el.clientHeight>=el.scrollHeight-1)).toBe(true);
    await page.locator("#chat").scrollIntoViewIfNeeded();await expect(page.locator("#send")).toBeVisible();
    await page.locator("#message").fill("");
  }
  await page.setViewportSize({width:400,height:640});
  await page.locator(".speech-content").evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:"/tmp/soda-sections-conversation.png"});
  console.log("PASS: one outer content scroll, fully expanded sections/editors, and keyboard folding at 400x640, 400x540 and 320x480");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: generated settings keyboard flow, four-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing, explicit microphone stop/review/upload and late-permission cancellation, OCR preview/recognition/import and note-save fencing",
  );
  const other = await context.newPage();
  await other.goto(`http://127.0.0.1:${server.address().port}/bubble.html`);
  for (const [index,kind] of ["copilot","agy"].entries()) {
    const revision=100+index;
    await other.evaluate(({kind,revision,actorId}) => window.chatCallback({
      revision,connected:true,busy:false,
      session:{paneId:"00000000-0000-4000-8000-000000000002",kind,state:"ready",agent:{instanceId:actorId,kind,state:"idle"}},
      kinds:[{kind,label:kind,available:true}],messages:[{id:kind,role:"user",text:`${kind}への質問`},{id:kind+"-answer",role:"assistant",text:`${kind}の返答 <script>private</script>`}],hint:"船長へのメッセージを送れます。"
    }),{kind,revision,actorId});
    await expect(other.locator("#destination")).toContainText(kind);
    await expect(other.locator(".chat-message.user")).toHaveText(`${kind}への質問`);
    await expect(other.locator(".chat-message.assistant")).toHaveText(`${kind}の返答 <script>private</script>`);
    await expect(other.locator(".chat-message script")).toHaveCount(0);
    await other.locator("#message").fill(`${kind}への返答`);
    await other.locator("#send").press("Enter");
    assert.deepEqual(await other.evaluate(()=>window.calls.at(-1)),["send-message",{revision,instanceId:actorId,text:`${kind}への返答`}]);
  }
  await other.close();
  const appearancePage=await context.newPage();appearancePage.on("pageerror",error=>errors.push(String(error)));
  await appearancePage.goto(`${origin}/settings.html`);
  await expect(appearancePage.locator("#appearance")).toHaveValue("dark");
  await appearancePage.locator("#appearance").selectOption("light");
  await appearancePage.locator('button[type="submit"]').first().click();
  await expect(appearancePage.locator("html")).toHaveAttribute("data-assistant-theme","light");
  assert.equal(await appearancePage.evaluate(()=>getComputedStyle(document.querySelector(".assistant-card")).backgroundColor),"rgb(248, 245, 236)");
  if(process.env.SODA_ASSISTANT_LIGHT_SCREENSHOT)await appearancePage.screenshot({path:process.env.SODA_ASSISTANT_LIGHT_SCREENSHOT});
  await appearancePage.locator("#appearance").selectOption("system");
  await appearancePage.locator('button[type="submit"]').first().click();
  await appearancePage.emulateMedia({colorScheme:"dark"});
  await expect(appearancePage.locator("html")).toHaveAttribute("data-assistant-theme","dark");
  await appearancePage.emulateMedia({colorScheme:"light"});
  await expect(appearancePage.locator("html")).toHaveAttribute("data-assistant-theme","light");
  await appearancePage.locator("#appearance").selectOption("dark");await appearancePage.locator('button[type="submit"]').first().click();
  await appearancePage.emulateMedia({colorScheme:"light"});await expect(appearancePage.locator("html")).toHaveAttribute("data-assistant-theme","dark");
  await appearancePage.evaluate(()=>window.appearanceCallback({revision:1,mode:"light"}));await expect(appearancePage.locator("html")).toHaveAttribute("data-assistant-theme","dark");
  for(const role of ["bubble","notice","tools","panel","character"]){
    await appearancePage.goto(`${origin}/${role}.html`);await appearancePage.evaluate(()=>window.appearanceCallback({revision:2,mode:"light"}));
    await expect(appearancePage.locator("html")).toHaveAttribute("data-assistant-theme","light");
  }
  await appearancePage.close();assert.deepEqual(errors,[]);
  console.log("PASS: assistant normal/dark/system preferences, live OS changes, stale revisions, and every local window");
  await context.close();
  console.log("generated Copilot and Antigravity bubble text and pinned reply PASS");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  clearTimeout(watchdog);
}
