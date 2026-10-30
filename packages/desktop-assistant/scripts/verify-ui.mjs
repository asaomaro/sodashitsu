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
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--disable-frame-rate-limit"],
  });
  const context = await browser.newContext();
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
      transcriptionEnabled: false,
      transcriptionOrigin: "http://127.0.0.1:8080",
      reducedMotion: false,
      position: null,
    };
    window.savedNotes = [];
    window.toolsRevision = 1;
    window.currentTools = {revision:1,transcriptionEnabled:true,transcriptionOrigin:"http://127.0.0.1:8080",notes:[],notesError:"",transcription:{revision:1,status:"idle",name:"",text:"",message:"生成されたテストです。"}};
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{getVoices:()=>[{lang:"ja-JP",localService:false},{lang:"ja-JP",localService:true}],cancel:()=>window.calls.push(["stop-reading"]),speak:utterance=>window.calls.push(["speak",utterance.text,utterance.voice.localService])}});
    window.SpeechSynthesisUtterance = class {constructor(text){this.text=text;}};
    window.assistant = {
      conversation: async () => ({ revision: 1, connected: false, busy: false, session: null, kinds: [{kind:"codex",label:"Codex",available:true}], messages: [], hint: "専用セッションを開始できます。" }),
      onConversation: callback => { window.chatCallback = callback; return () => {}; },
      startSession: async input => window.calls.push(["start-session",input]),
      adoptSession: async input => window.calls.push(["adopt-session",input]),
      sendMessage: async input => window.calls.push(["send-message",input]),
      tools: async () => window.currentTools,
      onTools: callback => { window.toolsCallback=callback; return ()=>{}; },
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
        notices: [{ message: "「操舵室 / worker」の作業が完了しました。" }],
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
      notices: [{ message: "<img src=x onerror=alert(1)>確認してください。" }],
    }),
  );
  await expect(page.locator(".notice")).toHaveText(
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
  await page.locator("#standard-tools summary").press("Enter");
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
  await expect(page.locator("#standard-tools img")).toHaveCount(0);
  assert.equal(await page.evaluate(()=>window.calls.filter(call=>call[0]==="send-message").length),sendsBeforeTools);
  await page.getByRole("button", { name: "吹き出しを閉じる" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "hide");
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and scoped bubble chat plus local tool drafts/notes/voice/transcription preview and clipboard editor fencing",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
