import {AssistantSource,AssistantLaunchSettings,AssistantModelCatalog} from "@sodashitsu/protocol";
import {presentWindow} from "./windowPresentation.js";
import {resourceHostIdentity,resourceProcessIdentities} from "@sodashitsu/client-core/nodeResourceIdentity";
import { cpus } from "node:os";
import { builtinCharacter } from "./builtinCharacters.js";
import { assistantPersona,assistantPersonaNotification,assistantPersonaGreeting } from "@sodashitsu/protocol";
import { playWav,parseVoicevoxSpeakers,characterVoice, voicevoxSpeak, voicevoxSpeakers, voicevoxOrigin } from "./voicevox.js";
import { AssistantVoice, VoiceConversation, nativeSpeak } from "./voice.js";
import {CharacterActors,type CharacterActor} from "./characterActor.js";
import { yukkuriCharacters } from "./yukkuriCharacters.js";
import { characterPng } from "./characterPng.js";
import { managedChannel } from "./managedChannel.js";
import { managedLaunch } from "./managedLaunch.js";
import { FullscreenPolicy } from "./fullscreen.js";
import { bubbleBounds, noticeBounds, resizeBubbleBounds, BUBBLE_RESIZE_HANDLES, WINDOW_RESIZE_HANDLES, resizeWindowBounds, type WindowResizeHandle, type BubbleResizeHandle, type Rect } from "./geometry.js";
import {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  dialog,
  desktopCapturer,
  type DesktopCapturerSource,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  powerMonitor,
  screen,
  session,
  Tray,
  type WebContents,
} from "electron";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  AssistantAppOpenParams,
  AssistantAppCallParams,
  DesktopAssistantPreferences,
  type AssistantNotice,
} from "@sodashitsu/protocol";
import { AssistantRpc } from "./assistantRpc.js";
import { AssistantChat, type AssistantChatState } from "./assistantChat.js";
import { deviceIdentity } from "./deviceIdentity.js";
import { NotesFile, NoteSave } from "./notes.js";
import { Transcription, AUDIO_LIMIT } from "./transcription.js";
import { randomUUID,createHash } from "node:crypto";
import { readPluginBundle } from "@sodashitsu/client-core/node/pluginPackage";
import { agentRoster } from "./noticeFeed.js";
import { RemoteNotices } from "./remoteNotices.js";
import { Characters, characterPack, type CharacterPack } from "./characters.js";
import { CaptureLease } from "./captureLease.js";
import { Reminders } from "./reminders.js";
import { Ocr } from "./ocr.js";
import { OcrRunner } from "./ocrRunner.js";
import { readPng, pngSize, PNG_LIMIT } from "./png.js";
import { RecordingLease } from "./recordingLease.js";
import { z } from "zod";
import { NoticeConnection } from "./noticeConnection.js";
import { sodaCookieHeader, isSodaSessionCookie } from "./cookieHeader.js";
import { AssistantController, type NativeAdapter } from "./controller.js";
import { PreferencesFile } from "./preferences.js";
import {
  authorizeLocalSender,
  LOCAL_ORIGIN,
  sameServerNavigation,
  type LocalRole,
} from "./security.js";

protocol.registerSchemesAsPrivileged([
  { scheme: "soda-assistant", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const assets = fileURLToPath(new URL("../assets/", import.meta.url));
const preload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
const allowedAssets = new Map([
  ["/character.html", "text/html"],
  ["/settings.html", "text/html"],
  ["/panel.html", "text/html"],
  ["/bubble.html", "text/html"],
  ["/tools.html", "text/html"],
  ["/tool-window.js", "text/javascript"],
  ["/window.js", "text/javascript"],
  ["/appearance.js", "text/javascript"],
  ["/sections.js", "text/javascript"],
  ["/file-inputs.js", "text/javascript"],
  ["/reminder-notices.js", "text/javascript"],
  ["/notice.html", "text/html"],
  ["/notice.js", "text/javascript"],
  ["/character.js", "text/javascript"],
  ["/actor.js", "text/javascript"],
  ["/settings.js", "text/javascript"],
  ["/bubble.js", "text/javascript"],
  ["/resize.js", "text/javascript"],
  ["/tools.js", "text/javascript"],
  ["/recording.js", "text/javascript"],
  ["/ocr.js", "text/javascript"],
  ["/reminders.js", "text/javascript"],
  ["/capture.js", "text/javascript"],
  ["/apps.js", "text/javascript"],
  ["/style.css", "text/css"],
  ["/captain-male.png", "image/png"],
  ["/captain-female.png", "image/png"],
  ["/captain-robot.png", "image/png"],
  ["/sodashitsu-icon.svg", "image/svg+xml"],
  ["/captain-male.svg", "image/svg+xml"],
  ["/captain-female.svg", "image/svg+xml"],
  ["/captain-robot.svg", "image/svg+xml"],
]);
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src blob:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
let tray: Tray | null = null;
let character: BrowserWindow | null = null;
let settings: BrowserWindow | null = null;
let panel: BrowserWindow | null = null;
let responsePanel: BrowserWindow | null = null;
let bubble: BrowserWindow | null = null;
let toolsWindow:BrowserWindow|null=null,toolsEpoch=0;
let conversationDraft:{revision:number;text:string|null}={revision:0,text:null};
function toolOwner(owner:{role:LocalRole;window:BrowserWindow}){return owner.role==="tools"?owner.window===toolsWindow:owner.role==="bubble"&&owner.window===bubble;}
function toolEpoch(role:LocalRole){return role==="tools"?toolsEpoch:bubbleEpoch;}
function publishToolEvent(name:string,state:unknown){for(const win of [toolsWindow,bubble])if(win&&!win.isDestroyed())win.webContents.send(name,state);}
let bubblePortraitKey: string | null = null;
let bubbleEpoch = 0;
let bubbleRequested = false;
let bubbleSize = { width: 400, height: 640 };
let bubbleResize: { owner: number; epoch: number; token: string; expires: number; handle: BubbleResizeHandle; start: Rect; cursor: { x: number; y: number }; area: Rect } | null = null;
let panelTargeted = false;
let panelNavigation = 0;
const responseNavigations = new WeakMap<BrowserWindow, number>();
let control: AssistantRpc | null = null;
let assistantChat: AssistantChat | null = null;
let controlOrigin: string | null = null;
let installationId: string;
let resourceReportTimer:ReturnType<typeof setInterval>|undefined;
let resourceReportBusy=false;
let resourceMetricsPrimed=false;
async function reportResources(){
 if(resourceReportBusy||quitting||!control||!installationId)return;
 resourceReportBusy=true;const rpc=control;
 try{
  const {active}=await rpc.request("server.resource_app_demand",{});
  if(!active||rpc!==control){resourceMetricsPrimed=false;return;}
  const metrics=app.getAppMetrics(),identities=await resourceProcessIdentities(metrics.map(m=>m.pid));
  await rpc.request("server.resource_app_report",{deviceId:installationId,hostId:await resourceHostIdentity(),platform:process.platform as "win32"|"darwin"|"linux",processes:metrics.slice(0,64).map(m=>({pid:m.pid,startIdentity:process.platform==="win32"?`win32:${Math.trunc(m.creationTime)}`:identities.get(m.pid)??null,startedAt:m.creationTime,name:`${m.type}${m.name?` (${m.name})`:""}`.slice(0,120),cpuPercent:resourceMetricsPrimed?Math.max(0,m.cpu.percentCPUUsage*cpus().length):null,rssBytes:m.memory.workingSetSize*1024}))});
  resourceMetricsPrimed=true;
 }catch{/* An older/offline server cannot receive metrics. */}finally{resourceReportBusy=false;}
}
let chatRevision = 0;
let notesFile: NotesFile;
let transcription: Transcription;
let recording: RecordingLease;
let ocr: Ocr;
let capture: CaptureLease<DesktopCapturerSource>;
let characters: Characters;
let characterActors: CharacterActors;
let charactersError = "";
let characterPicking = false;
let pendingCharacterPack: {
  owner: number;
  token: string;
  expires: number;
  pack: CharacterPack;
  actors?: CharacterActor[];
} | null = null;
let reminders: Reminders | null = null;
let reminderRevision = 0;
let recordingOrigin: string | null = null;
let toolsRevision = 0;
let backend: NoticeConnection | null = null;
let backendOrigin: string | null = null;
let notices: readonly AssistantNotice[] = [];
let localNotices: readonly AssistantNotice[] = [];
let remoteRows: readonly AssistantNotice[] = [];
let remoteNotices: RemoteNotices | null = null;
let inboxRevision = 0;
let noticeStatus: "connecting" | "connected" | "login" | "offline" | "disabled" = "disabled";
let controller: AssistantController;
let quitting = false;
let suspended = false;
let screenLocked = false;
let characterMotionRevision=0;
let characterNotificationSeq=0;
let automaticNoticeEpoch = 0;
let compact: BrowserWindow | null = null;
let compactPayload: { id?: string; title: string; message: string } | null = null;
let appearanceRevision=0,appearanceMode="dark";
let compactRevision = 0;
let compactHeight = 220;
let latestNotification: {seq:number;id?:string;title:string;message:string}|null=null;
let notificationSequence=0;
function chatVisible():boolean {
  return !!(bubble && !bubble.isDestroyed() && (bubbleRequested || bubble.isVisible() && !bubble.isMinimized()));
}
let focusedNoticeId:string|null=null,noticeFocusRevision=0;
const handledCompactIds=new Set<string>();
function dismissCompact(id?:string):void {
  if(id){handledCompactIds.add(id);if(handledCompactIds.size>64)handledCompactIds.delete(handledCompactIds.values().next().value!);}
  if(!id||compactPayload?.id===id)closeCompact();
}
function positionCompact():void {
  if(!compact||compact.isDestroyed())return;
  const chat=bubble&&!bubble.isDestroyed()&&bubbleRequested?bubble.getBounds():undefined;
  compact.setBounds(noticeBounds(controller.preferences,adapter.displays(),adapter.portraitAspect?.(controller.preferences),chat,compactHeight));
}
function closeCompact(): void {
  ++compactRevision;
  compactPayload = null;
  compactHeight = 220;
  compact?.destroy();
  compact = null;
}
function compactState() { return { revision: compactRevision, ...compactPayload, ...(compactPayload?{message:assistantPersonaNotification(activeCharacterId(),compactPayload.title,compactPayload.message)}:{}) }; }
function refreshCompact(): void {
  if (!compactPayload?.id) return;
  const current = [...localNotices, ...remoteRows].find(n => n.id === compactPayload!.id);
  if (!current) { closeCompact(); return; }
  compactPayload = { id: current.id, title: current.title, message: current.message };
  ++compactRevision;
  compact?.webContents.send("assistant:notice-changed", compactState());
}
function showCompact(payload: { id?: string; title: string; message: string }): void {
  if (chatVisible()) return;
  if (payload.id && handledCompactIds.has(payload.id)) return;
  if (payload.id) {
    const current = [...localNotices, ...remoteRows].find(n => n.id === payload.id);
    if (!current) return;
    payload = { id: current.id, title: current.title, message: current.message };
  }
  compactPayload = payload;
  ++compactRevision;
  if (compact && !compact.isDestroyed()) {
    compact.webContents.send("assistant:notice-changed", compactState());
    compact.showInactive();
    return;
  }
  const win = localWindow("notice");
  compact = win;
  positionCompact();
  win.once("ready-to-show", () => {
    if (!win.isDestroyed() && compact === win && compactPayload && !chatVisible() && !quitting && !suspended && controller.preferences.enabled && !controller.preferences.mute) win.showInactive();
  });
  win.on("closed", () => { if (compact === win) compact = null; });
}
const fullscreen = new FullscreenPolicy();
let settingsRequested = false;
const panelViews = new WeakMap<BrowserWindow,{view:WebContentsView;shell:Promise<void>}>();
const windowRestores=new WeakMap<BrowserWindow,Rect>();
const windowMaxBounds=new WeakMap<BrowserWindow,Rect>();
const windowBoundsChanging=new WeakSet<BrowserWindow>();
const windowStateRevisions=new WeakMap<BrowserWindow,number>();
function chromeState(win:BrowserWindow){return {maximized:windowRestores.has(win),revision:windowStateRevisions.get(win)??0};}
function publishChromeState(win:BrowserWindow){
 windowStateRevisions.set(win,(windowStateRevisions.get(win)??0)+1);
 if(!win.isDestroyed())win.webContents.send("assistant:window-state-changed",chromeState(win));
}
function setChromeBounds(win:BrowserWindow,bounds:Rect){
 windowBoundsChanging.add(win);try{win.setBounds(bounds);}finally{windowBoundsChanging.delete(win);}
}
/** A real size change exits maximization without snapping back to the saved normal bounds. */
function applyResizeBounds(win:BrowserWindow,bounds:Rect){
 const current=win.getBounds();
 if(current.x===bounds.x&&current.y===bounds.y&&current.width===bounds.width&&current.height===bounds.height)return;
 const wasMaximized=windowRestores.delete(win);windowMaxBounds.delete(win);
 setChromeBounds(win,bounds);
 if(wasMaximized)publishChromeState(win);
}
function reconcileChromeState(win:BrowserWindow){
 const restore=windowRestores.get(win),maximum=windowMaxBounds.get(win);
 if(!restore||!maximum||win.isDestroyed()||windowBoundsChanging.has(win))return;
 const moved=win.getBounds();
 if(moved.x===maximum.x&&moved.y===maximum.y&&moved.width===maximum.width&&moved.height===maximum.height)return;
 windowRestores.delete(win);windowMaxBounds.delete(win);windowResizes.delete(win);
 // A native titlebar drag keeps the maximized dimensions. Restore the normal size under the pointer.
 if(moved.width===maximum.width&&moved.height===maximum.height){
  const cursor=screen.getCursorScreenPoint(),fraction=Math.max(0,Math.min(1,(cursor.x-moved.x)/maximum.width));
  const bounds={x:Math.round(cursor.x-restore.width*fraction),y:moved.y,width:restore.width,height:restore.height};
  setChromeBounds(win,resizeWindowBounds(bounds,"e",0,0,windowArea(win,moved)));
 }
 publishChromeState(win);
}
function watchChromeState(win:BrowserWindow){
 win.on("move",()=>reconcileChromeState(win));win.on("resize",()=>reconcileChromeState(win));
}
const windowResizes=new WeakMap<BrowserWindow,{token:string;handle:WindowResizeHandle;start:Rect;cursor:{x:number;y:number};area:Rect;expires:number}>();
function windowArea(win:BrowserWindow,bounds:Rect=win.getBounds()):Rect {
 const displays=adapter.displays();if(!displays.length)throw Error("表示できるディスプレイがありません。");
 const overlap=(area:Rect)=>Math.max(0,Math.min(bounds.x+bounds.width,area.x+area.width)-Math.max(bounds.x,area.x))*Math.max(0,Math.min(bounds.y+bounds.height,area.y+area.height)-Math.max(bounds.y,area.y));
 const distance=(area:Rect)=>(bounds.x+bounds.width/2-area.x-area.width/2)**2+(bounds.y+bounds.height/2-area.y-area.height/2)**2;
 return [...displays].sort((a,b)=>overlap(b.workArea)-overlap(a.workArea)||distance(a.workArea)-distance(b.workArea))[0]!.workArea;
}

const localWindows = new Map<number, { window: BrowserWindow; role: LocalRole }>();
function characterCatalog(){
 return characters.list().map(character=>{const p=assistantPersona(character.id);return {...character,persona:p?{name:p.name,first:p.profile.first,tone:p.profile.tone}:null};});
}
function activeCharacterId(preferences=controller.preferences):string {
 const id=preferences.characterId;
 return id.startsWith("plugin:")&&(!preferences.allowPluginCharacters||!characters.portrait(id))?"captain-female":id;
}
async function builtinCore(signal?:AbortSignal){
 signal?.throwIfAborted();
 const rpc=control,serverOrigin=controller.preferences.serverOrigin;
 if(!["localhost","127.0.0.1","[::1]"].includes(new URL(serverOrigin).hostname))throw Error("内蔵COREは、このPCの操舵室に接続して利用してください。");
 if(!rpc)throw Error("操舵室に接続してください。");
 const config=await rpc.request("assistant.voice_core",{},{signal});
 if(control!==rpc||controller.preferences.serverOrigin!==serverOrigin)throw Error("操舵室の接続先が変わりました。");
 if(!config.enabled)throw Error("COREをsoda voice enableで有効にしてください。");
 signal?.throwIfAborted();
 return {rpc,serverOrigin,...config};
}
async function coreRequest(request:import("@sodashitsu/protocol").VoiceCoreCall,signal?:AbortSignal,config?:Awaited<ReturnType<typeof builtinCore>>){
 config??=await builtinCore(signal);
 signal?.throwIfAborted();
 if(control!==config.rpc||controller.preferences.serverOrigin!==config.serverOrigin)throw Error("操舵室の接続先が変わりました");
 const result=await config.rpc.request("voice.call",{...request,requestId:randomUUID()},{signal});
 signal?.throwIfAborted();
 if(control!==config.rpc)throw Error("操舵室の接続が変わりました。");
 return result;
}
async function coreSpeakers(coreVersion="",signal?:AbortSignal,config?:Awaited<ReturnType<typeof builtinCore>>){
 config??=await builtinCore(signal);
 if(config.transport!=="ipc"){
  if(coreVersion)throw Error("COREの版指定にはHTTPなし常駐モードを使ってください。");
  if(!config.origin)throw Error("COREの接続先がありません。");return voicevoxSpeakers(config.origin,signal);
 }
 const result=await coreRequest({operation:"speakers",...(coreVersion?{coreVersion}:{})},signal,config);
 if(result.kind!=="json")throw Error("COREの話者一覧が不正です");return parseVoicevoxSpeakers(result.value);
}
const systemSpeak=nativeSpeak();
const voiceChoice=z.object({voiceProvider:z.enum(["system","core","voicevox"]),voicevoxOrigin:z.string().max(2048).optional(),voicevoxStyleId:z.number().int().min(0).max(2147483647),voiceFollowCharacter:z.boolean(),voiceCoreVersion:z.string().max(80).default(""),characterId:DesktopAssistantPreferences.shape.characterId}).strict();
function voiceDraftPreferences(input:unknown){
 const selected=voiceChoice.parse(input);
 if(selected.voiceProvider!=="voicevox")delete selected.voicevoxOrigin;
 return DesktopAssistantPreferences.parse({...controller.preferences,...selected});
}
function voiceCharacterName(id:string):string {
 return assistantPersona(id)?.name??characters.portrait(id)?.name??builtinCharacter(id).name;
}
async function matchedVoice(preferences:ReturnType<typeof DesktopAssistantPreferences.parse>){
 const rows=preferences.voiceProvider==="core"?await coreSpeakers(preferences.voiceCoreVersion):await voicevoxSpeakers(preferences.voicevoxOrigin);
 return characterVoice(rows,voiceCharacterName(activeCharacterId(preferences)),preferences.voicevoxStyleId);
}
function voiceFor(preferences:ReturnType<typeof DesktopAssistantPreferences.parse>):import("./voice.js").Speak {
 if(preferences.voiceProvider==="system")return systemSpeak;
 return async(text,signal)=>{
  const builtin=preferences.voiceProvider==="core"?await builtinCore(signal):null;signal.throwIfAborted();
  if(builtin?.transport==="ipc"){
   const selected=preferences.voiceFollowCharacter?characterVoice(await coreSpeakers(preferences.voiceCoreVersion,signal,builtin),voiceCharacterName(activeCharacterId(preferences)),preferences.voicevoxStyleId):null;
   signal.throwIfAborted();
   const result=await coreRequest({operation:"synthesize",cancellable:true,text,speaker:selected?.id??preferences.voicevoxStyleId,...(preferences.voiceCoreVersion?{coreVersion:preferences.voiceCoreVersion}:{})},signal,builtin);
   signal.throwIfAborted();
   if(result.kind!=="bytes"||result.mime!=="audio/wav"||result.base64.length>16*1024*1024)throw Error("COREの音声データが不正です");
   const wav=Buffer.from(result.base64,"base64");if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error("COREからWAVを受信できませんでした");
   await playWav(wav,signal);return;
  }
  if(builtin&&preferences.voiceCoreVersion)throw Error("COREの版指定にはHTTPなし常駐モードを使ってください。");
  const origin=builtin?.origin??voicevoxOrigin(preferences.voicevoxOrigin);
  if(!origin)throw Error("COREの接続先がありません。");
  return voicevoxSpeak(async(activeSignal)=>{
   const selected=preferences.voiceFollowCharacter?characterVoice(await voicevoxSpeakers(origin,activeSignal),voiceCharacterName(activeCharacterId(preferences)),preferences.voicevoxStyleId):null;
   return {voicevoxOrigin:origin,voicevoxStyleId:selected?.id??preferences.voicevoxStyleId};
  })(text,signal);
 };
}
const voice = new AssistantVoice((text,signal)=>voiceFor(controller.preferences)(text,signal), state => {
 if(controller)publishCharacterState();
 for(const {window,role} of localWindows.values())if(role!=="character"&&!window.isDestroyed())window.webContents.send("assistant:voice-changed",state);
});
function characterState() {
 const state=chatState(),preferences=controller.preferences;
 return { revision:characterMotionRevision, notificationSeq:characterNotificationSeq,
   mode:voice.snapshot().speaking?"speaking":state.connected&&state.session?.agent?.state==="working"?"working":"idle",
   reducedMotion:preferences.reducedMotion,followSystemMotion:preferences.followSystemMotion,idleFloating:preferences.idleFloating,iconRotation:preferences.iconRotation,paused:quitting||suspended||screenLocked||!preferences.enabled };
}
function publishCharacterState():void {
 ++characterMotionRevision;
 if(character&&!character.isDestroyed())character.webContents.send("assistant:character-state-changed",characterState());
}
function animateNotification():void {++characterNotificationSeq;publishCharacterState();}
const voiceConversation = new VoiceConversation();
let voiceEpoch=0;
function speakWithPolicy(key:string,text:string,stillCurrent:()=>boolean=()=>true):void {
 const preferences=controller.preferences,epoch=automaticNoticeEpoch,speechEpoch=voiceEpoch;
 const valid=()=>{
  if(speechEpoch!==voiceEpoch||quitting||suspended||!controller.preferences.enabled||!controller.preferences.voiceEnabled||controller.preferences.mute||recording?.has()||!stillCurrent())return false;
  try{return powerMonitor.getSystemIdleState(1)!=="locked";}catch{return false;}
 };
 if(!valid())return;
 if(!preferences.quietFullscreen){voice.say(key,text,valid);return;}
 void fullscreen.quiet().then(quiet=>{if(!quiet&&epoch===automaticNoticeEpoch&&valid())voice.say(key,text,valid);});
}
function speakNotice(content:{id?:string;title:string;message:string},speechEpoch=voiceEpoch):void {
 const current=()=>speechEpoch===voiceEpoch&&(!content.id||[...localNotices,...remoteRows].some(n=>n.id===content.id));
 speakWithPolicy(content.id?`notice:${content.id}`:`reminder:${content.title}:${content.message}`,assistantPersonaNotification(activeCharacterId(),content.title,content.message),current);
}

function localWindow(role: LocalRole): BrowserWindow {
  const win = new BrowserWindow({
    width: role === "tools" ? 640 : role === "settings" ? 520 : role === "bubble" ? 400 : 192,
    height: role === "tools" ? 760 : role === "settings" ? 670 : role === "bubble" ? 640 : 192,
    // Windows can retain an empty compositor surface when a hidden settings
    // window is loaded before its first show. Load this ordinary window
    // while visible; transparent character/notification windows still stay hidden.
    show: role === "settings" || role === "tools",
    title: "操舵室アシスタント",
    icon:join(assets,process.platform==="win32"?"sodashitsu.ico":"sodashitsu.png"),
    backgroundColor:"#00000000",
    hasShadow:false,
    frame: false,
    ...((role === "settings" || role === "tools") ? {minWidth:360,minHeight:360} : {}),
    transparent: true,
    resizable: false,
    focusable: role !== "character",
    skipTaskbar: role !== "settings" && role !== "tools",
    alwaysOnTop: role !== "settings" && role !== "tools",
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: "assistant-local",
      webSecurity: true,
    },
  });
  if (role === "settings" || role === "tools") {win.setMenu(null);watchChromeState(win);}
  const id = win.webContents.id;
  localWindows.set(id, { window: win, role });
  win.on("closed", () => {
    localWindows.delete(id);
    if (pendingCharacterPack?.owner === id) pendingCharacterPack = null;
  });
  const discardOnHide = () => {
    windowResizes.delete(win);
    if (role === "bubble" || role === "tools") {
      if(role==="bubble"){bubbleResize=null;++bubbleEpoch;}else ++toolsEpoch;
      if(role==="tools"||!toolsWindow)transcription?.cancel();
      ocr?.discard(id);
      if (capture?.cancel(id) && !win.isDestroyed()) win.destroy();
    }
    if ((role === "bubble" || role === "tools") && recording?.has(id)) {
      recording.cancel(id);
      if (!win.isDestroyed()) win.destroy(); // End capture even if the hidden renderer cannot respond.
    }
  };
  win.on("blur",()=>windowResizes.delete(win));
  win.on("show", () => { if (role === "bubble") closeCompact(); });
  win.on("hide", () => { if (role === "bubble") bubbleRequested = false; discardOnHide(); });
  win.on("minimize", () => { if (role === "bubble") bubbleRequested = false; discardOnHide(); });
  win.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) discardOnHide();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadURL(`${LOCAL_ORIGIN}/${role}.html`).then(()=>{
    if((role==="settings"&&settings===win)||(role==="tools"&&toolsWindow===win))presentWindow(win);
  }).catch(() => {
    if (!win.isDestroyed()) win.destroy();
  });
  return win;
}

function notifyBubble(payload?: { id?: string; title: string; message: string }): void {
  const latest = [...localNotices, ...remoteRows].sort((a,b) => b.at - a.at)[0];
  payload ??= latest ? { id: latest.id, title: latest.title || "エージェントからの通知", message: latest.message } : { title: "操舵室からのお知らせ", message: "新しい通知が届きました。" };
  const content = payload;
  latestNotification = {...payload,seq:++notificationSequence};
  publishInbox();
  const requestEpoch = ++automaticNoticeEpoch;
  const speechEpoch=voiceEpoch;
  const preferences = controller.preferences;
  if (quitting || suspended || !preferences.enabled || preferences.mute) return;
  try {
    if (powerMonitor.getSystemIdleState(1) === "locked") return;
  } catch {}
  if (!preferences.quietFullscreen) {
    if(content.id && ![...localNotices,...remoteRows].some(n=>n.id===content.id))return;
    animateNotification();
    speakNotice(content,speechEpoch);
    showCompact(content);
    return;
  }
  const epoch = requestEpoch;
  void fullscreen.quiet().then((quiet) => {
    try {
      if (powerMonitor.getSystemIdleState(1) === "locked") return;
    } catch {}
    if (
      !quiet &&
      !quitting &&
      !suspended &&
      epoch === automaticNoticeEpoch &&
      controller.preferences.enabled &&
      !controller.preferences.mute
    ) {
      if(content.id && ![...localNotices,...remoteRows].some(n=>n.id===content.id))return;
      animateNotification();
      speakNotice(content,speechEpoch);
      showCompact(content);
    }
  });
}
/** Explicit user action focuses chat; verbal notices never take focus. */
function openBubble(focus = true): void {
  if (!controller.preferences.enabled) return;
  closeCompact();
  bubbleRequested = true;
  if (bubble && !bubble.isDestroyed()) {
    if (focus) {
      bubble.show();
      bubble.focus();
    } else bubble.showInactive();
    positionCompact();
    return;
  }
  ++bubbleEpoch;
  const win = localWindow("bubble");
  const contentsId = win.webContents.id;
  bubble = win;
  bubblePortraitKey = JSON.stringify([
    controller.preferences.characterId,
    controller.preferences.allowPluginCharacters,
  ]);
  win.setBounds(bubbleBounds(controller.preferences, adapter.displays(), bubbleSize, adapter.portraitAspect?.(controller.preferences)));
  positionCompact();
  win.once("ready-to-show", () => {
    if (!win.isDestroyed() && bubbleRequested) {
      if (focus) {
        win.show();
        win.focus();
      } else win.showInactive();
    }
  });
  win.on("closed", () => {
    if (bubble === win) {
      bubbleRequested = false;
      bubbleResize = null;
      ++bubbleEpoch;
      recording?.cancel(contentsId);
      if(!toolsWindow)transcription?.cancel();
      ocr?.discard(contentsId);
      capture?.cancel(contentsId);
      bubble = null;
    }
  });
}

let publishedAudioContext="";
function audioInputContext():string {
 const p=controller.preferences,chat=assistantChat?.snapshot(),session=chat?.session;
 return createHash("sha256").update(JSON.stringify([p.enabled,p.transcriptionEnabled,p.transcriptionProvider,p.transcriptionOrigin,p.serverOrigin,session?.paneId,session?.agent?.instanceId,chat?.conversationSessionId])).digest("hex");
}
async function toolsState(revision = toolsRevision) {
  const state = transcription.snapshot();
  const preferences = controller.preferences,transcriptionContext=audioInputContext();
  let notes: Awaited<ReturnType<NotesFile["read"]>> = [];
  let notesError = "";
  try {
    notes = await notesFile.read();
  } catch {
    notesError = "メモを読み込めません。元のファイルは変更していません。";
  }
  return {
    revision,
    transcription: state,
    notes,
    notesError,
    transcriptionEnabled: preferences.enabled && preferences.transcriptionEnabled,
    transcriptionOrigin: preferences.transcriptionOrigin,
    transcriptionProvider:preferences.transcriptionProvider,
    transcriptionContext,
  };
}
async function publishTools(): Promise<void> {
  if (quitting) return;
  const revision = ++toolsRevision;
  const state = await toolsState(revision);
  publishToolEvent("assistant:tools-changed",state);
}

function combineNotices() {
  notices = [...localNotices, ...remoteRows].sort((a, b) => b.at - a.at).slice(0, 32);
  assistantChat?.notifications(notices);
  publishInbox();
}
function inbox() {
  const rows = controller.preferences.enabled ? [
    ...(noticeStatus === "connected" ? backend?.feed.agents ?? [] : []),
    ...(remoteNotices?.agents ?? []),
  ] : [];
  return { notices, status: noticeStatus, revision: inboxRevision, agentList: agentRoster(rows),latestNotification,focusedNoticeId,noticeFocusRevision };
}
function publishInbox(): void {
  refreshCompact();
  voice.validate();
  ++inboxRevision;
  if (bubble && !bubble.isDestroyed()) bubble.webContents.send("assistant:inbox-changed", inbox());
}
async function notificationWorkContext(notice:AssistantNotice):Promise<string>{
 try{
 const hub=control,rpc=notice.source.machineId==="local"?hub:remoteNotices?.rpcFor(notice.source.machineId);
 if(!rpc||notice.source.serverOrigin!==controller.preferences.serverOrigin)throw Error("通知元に接続できません。");
 const params={source:{...notice.source,machineId:"local"},key:notice.key};
 const before=await rpc.request("assistant.source",params);
 const cached=await rpc.request("agent.summary_cached",{paneId:notice.source.paneId,offset:0}).catch(()=>({summary:null}));
 const page=await rpc.request("agent.conversation_tail",{paneId:notice.source.paneId,offset:0}).catch(()=>null);
 const after=await rpc.request("assistant.source",params);
 if(page&&(before.conversationSessionId!==page.sessionId||after.conversationSessionId!==page.sessionId||page.kind!==before.agent.kind))throw Error("通知元の会話が変更されました。");
 if(control!==hub||!notices.some(n=>n.id===notice.id)||notice.source.machineId!=="local"&&remoteNotices?.rpcFor(notice.source.machineId)!==rpc)throw Error("通知元が変更されました。");
 const parts:string[]=[];
 if(page&&cached.summary&&!cached.summary.stale&&cached.summary.sourceSessionId===page.sessionId&&cached.summary.sourceKind===page.kind)parts.push(`${cached.summary.stale?"過去の参考要約（古い可能性）":"既存のペイン要約"}: ${cached.summary.text.slice(0,400)}`);
 if(page)parts.push(`${page.partial||page.nextOffset!==null?"部分的な":"取得できた"}会話記録: `+page.messages.slice(-6).map(m=>`${m.role}: ${m.text.slice(0,300)}`).join("\n"));
 return parts.join("\n")||"作業記録は取得できませんでした。";
 }catch(error){throw Object.assign(error instanceof Error?error:Error("通知元を確認できませんでした。"),{notificationInvalid:true});}
}
function chatState(): AssistantChatState {
  return (
    assistantChat?.snapshot() ?? {
      revision: chatRevision,
      connected: false,
      busy: false,
      session: null,
      kinds: [],
      messages: [],
      hint: "アシスタントは接続していません。",
    }
  );
}
function updateChat(preferences: DesktopAssistantPreferences): void {
  if (!preferences.enabled || controlOrigin !== preferences.serverOrigin) {
    conversationDraft={revision:conversationDraft.revision+1,text:null};
    if(bubble&&!bubble.isDestroyed())bubble.webContents.send("assistant:draft-changed",conversationDraft);
    control?.stop();
    assistantChat?.stop();
    reminders?.stop();
    reminders = null;
    remoteNotices?.stop();
    remoteNotices = null;
    control = null;
    assistantChat = null;
    controlOrigin = null;
  }
  if (!preferences.enabled || control) return;
  const origin = preferences.serverOrigin;
  const rpc = new AssistantRpc(origin, {
    kind:"desktop",
    cookie: async () =>
      sodaCookieHeader(
        await session
          .fromPartition("persist:assistant-server")
          .cookies.get({ url: `${origin}/ws` }),
      ),
    status: (connected) => {
      if (control === rpc) {
        assistantChat?.connection(connected);
        reminders?.connection(connected);
        remoteNotices?.connection(connected);
      }
    },
    changed: () => {
      if (control === rpc) {
        void assistantChat?.refresh();
        void remoteNotices?.refresh();
      }
    },
  });
  assistantChat = new AssistantChat(
    installationId,
    rpc,
    (state) => {
      voice.validate();
      const spoken=voiceConversation.observe(state);
      if(spoken)speakWithPolicy(spoken.key,spoken.text,()=>{
        const current=chatState();return current.connected&&current.session?.state==="ready"&&current.session.agent?.instanceId===state.session?.agent?.instanceId&&current.conversationSessionId===state.conversationSessionId;
      });
      publishCharacterState();
      const audioContext=audioInputContext();
      if(audioContext!==publishedAudioContext){publishedAudioContext=audioContext;if(transcription&&notesFile)void publishTools();}
      chatRevision = state.revision;
      if (bubble && !bubble.isDestroyed())
        bubble.webContents.send("assistant:conversation-changed", state);
    },
    chatRevision,
    notificationWorkContext,
  );
  assistantChat.configure(controller.preferences.agentProfiles,activeCharacterId(),controller.preferences.notificationSummary);
  assistantChat.notifications(notices);
  reminders = new Reminders(
    installationId,
    rpc,
    (state, added) => {
      reminderRevision = state.revision;
      if (added) {
        const run = [...state.runs].sort((a,b) => b.startedAt.localeCompare(a.startedAt))[0];
        notifyBubble(run ? { title: `リマインダー：${run.label}`, message: run.input } : undefined);
      }
      publishToolEvent("assistant:reminders-changed",state);
    },
    reminderRevision,
  );
  const remote = new RemoteNotices(origin, rpc, {
    cookie: async () =>
      sodaCookieHeader(
        await session
          .fromPartition("persist:assistant-server")
          .cookies.get({ url: `${origin}/ws` }),
      ),
    changed: (next, added) => {
      if (remoteNotices !== remote) return;
      remoteRows = next;
      combineNotices();
      if (added) notifyBubble();
    },
  });
  remoteNotices = remote;
  remote.configure(preferences.remoteNotifications);
  control = rpc;
  controlOrigin = origin;
  rpc.start();
}
function updateBackend(preferences: DesktopAssistantPreferences): void {
  if (suspended) return;
  voice.configure(preferences.enabled && preferences.voiceEnabled && !preferences.mute);
  ++automaticNoticeEpoch;
  closeCompact();
  fullscreen.invalidate();
  const captureOwner=capture?.owner();
  if (capture?.cancel()&&captureOwner!==undefined)localWindows.get(captureOwner)?.window.destroy();
  ocr.configure(
    preferences.enabled && preferences.ocrEnabled,
    preferences.ocrExecutable,
    preferences.ocrLanguage,
    preferences.ocrProvider,
  );
  if (
    recording?.has() &&
    (!preferences.enabled ||
      !preferences.transcriptionEnabled ||
      recordingOrigin !== JSON.stringify([preferences.transcriptionProvider,preferences.transcriptionOrigin,preferences.serverOrigin]))
  ) {
    const recordingOwner=recording.owner();recording.cancel();
    if(recordingOwner!==undefined)localWindows.get(recordingOwner)?.window.destroy();
  }
  assistantChat?.configure(preferences.agentProfiles,activeCharacterId(preferences),preferences.notificationSummary);
  transcription.configure(
    preferences.enabled && preferences.transcriptionEnabled,
    preferences.transcriptionOrigin,
    preferences.transcriptionProvider,
  );
  updateChat(preferences);
  remoteNotices?.configure(preferences.remoteNotifications);
  if (!preferences.enabled || backendOrigin !== preferences.serverOrigin) {
    backend?.stop();
    backend = null;
    backendOrigin = null;
    notices = [];
    latestNotification = null;
    localNotices = [];
    remoteRows = [];
    noticeStatus = "disabled";
  }
  if (!preferences.enabled || backend) return;
  const origin = preferences.serverOrigin;
  const connection = new NoticeConnection(origin, {
    cookie: async () => {
      const cookies = await session
        .fromPartition("persist:assistant-server")
        .cookies.get({ url: `${origin}/ws` });
      return sodaCookieHeader(cookies);
    },
    changed(next, added) {
      if (backend !== connection || !controller.preferences.enabled) return;
      localNotices = next;
      combineNotices();
      if (added) notifyBubble();
      publishInbox();
    },
    status(status) {
      if (backend !== connection) return;
      noticeStatus = status;
      publishInbox();
    },
  });
  backend = connection;
  backendOrigin = origin;
  connection.start();
}

function openSettings(): void {
  if (settings && !settings.isDestroyed()) {
    presentWindow(settings);
    return;
  }
  settings = localWindow("settings");
  settings.on("closed", () => {
    settings = null;
  });
}

function openTools():void {
  if(!controller.preferences.enabled)return;
  if(toolsWindow&&!toolsWindow.isDestroyed()){presentWindow(toolsWindow);return;}
  const win=localWindow("tools"),id=win.webContents.id;toolsWindow=win;
  win.on("closed",()=>{
    ++toolsEpoch;recording?.cancel(id);transcription?.cancel();ocr?.discard(id);capture?.cancel(id);
    if(toolsWindow===win)toolsWindow=null;
  });
}
function presentPanel(win:BrowserWindow):void {
 presentWindow(win);const view=panelViews.get(win)?.view;
 if(!win.isDestroyed()&&view&&!view.webContents.isDestroyed()){view.webContents.focus();view.webContents.invalidate();}
}
function loadPanel(win: BrowserWindow, url: string): void {
  const navigation = ++panelNavigation;
  responseNavigations.set(win, navigation);
  const showLoaded=()=>{
    if(!win.isDestroyed()&&responseNavigations.get(win)===navigation)presentPanel(win);
  };
  const remote=panelViews.get(win)!;
  void Promise.all([remote.shell,remote.view.webContents.loadURL(url)]).then(showLoaded).catch(() => {
    if (win.isDestroyed() || responseNavigations.get(win) !== navigation) return;
    void remote.view.webContents
      .loadURL(
        `data:text/plain;charset=utf-8,${encodeURIComponent("操舵室に接続できません。サーバと接続先を確認し、吹き出しから開き直してください。")}`,
      )
      .then(showLoaded).catch(() => {});
  });
}
function openPanel(
  origin: string,
  target?: { paneId: string; workspaceId: string; instanceId: string; machineId?: string; askId?: string },
  destination: "main" | "reply" = "main",
): void {
  const url = new URL(origin);
  // A fresh query forces a new document even when only the guarded pane/form hash changes.
  if (target) {
    url.searchParams.set("assistantNavigation", randomUUID());
    url.searchParams.set("assistantView", destination);
  }
  if (target)
    url.hash = new URLSearchParams({
      assistantPane: target.paneId,
      assistantWorkspace: target.workspaceId,
      assistantInstance: target.instanceId,
      assistantMachine: target.machineId ?? "local",
      ...(target.askId ? {assistantAsk: target.askId} : {}),
    }).toString();
  const existing = destination === "reply" ? responsePanel : panel;
  if (existing && !existing.isDestroyed()) {
    if (target || panelTargeted) loadPanel(existing, url.href);
    else presentPanel(existing);
    if (destination === "main") panelTargeted = !!target;
    return;
  }
  // Remote Soda gets an ordinary isolated browser session, never the native preload.
  const win = new BrowserWindow({
    show:false,
    icon:join(assets,process.platform==="win32"?"sodashitsu.ico":"sodashitsu.png"),
    frame:false,transparent:true,resizable:false,hasShadow:false,minWidth:360,minHeight:360,
    backgroundColor:"#00000000",
    width: destination === "reply" ? 800 : 1100,
    height: destination === "reply" ? 560 : 780,
    title: destination === "reply" ? "操舵室・通知への応答" : "操舵室",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: "assistant-local",preload,
      webSecurity: true,
      webviewTag: false,
    },
  });
  const view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:"persist:assistant-server",webSecurity:true,webviewTag:false}});
  const remoteContents=view.webContents;
  view.setBackgroundColor("#172438");win.contentView.addChildView(view);
  const layout=()=>{const {width,height}=win.getBounds();view.setBounds({x:12,y:42,width:Math.max(1,width-24),height:Math.max(1,height-54)});};
  win.on("resize",layout);layout();win.setMenu(null);watchChromeState(win);
  const shellId=win.webContents.id;localWindows.set(shellId,{window:win,role:"panel"});
  const cancelResize=()=>{windowResizes.delete(win);};
  win.on("hide",cancelResize);win.on("minimize",cancelResize);win.on("blur",cancelResize);
  win.webContents.on("did-start-navigation",(_event,_url,_inPlace,mainFrame)=>{if(mainFrame)windowResizes.delete(win);});
  win.webContents.setWindowOpenHandler(()=>({action:"deny"}));win.webContents.on("will-navigate",event=>event.preventDefault());
  const shell=win.loadURL(`${LOCAL_ORIGIN}/panel.html`);panelViews.set(win,{view,shell});
  if (destination === "reply") responsePanel = win;
  else { panel = win; panelTargeted = !!target; }
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  view.webContents.on("will-navigate", (event, url) => {
    if (!sameServerNavigation(url, origin)) event.preventDefault();
  });
  view.webContents.on("will-redirect", (event, url) => {
    if (!sameServerNavigation(url, origin)) event.preventDefault();
  });
  win.on("closed", () => {
    localWindows.delete(shellId);panelViews.delete(win);
    if(!remoteContents.isDestroyed())remoteContents.close();
    if (panel === win) panel = null;
    if (responsePanel === win) responsePanel = null;
  });
  loadPanel(win, url.href);
}

const adapter: NativeAdapter = {
  portraitAspect(preferences) {
    const image=preferences.allowPluginCharacters ? characters.portrait(preferences.characterId) : null;
    const actor=image?characterActors?.meta(preferences.characterId,image.actorSignature??""):null;
    if(actor)return actor.w/actor.h;
    if(image)return image.width/image.height;
    const {frame}=builtinCharacter(preferences.characterId);return frame.w/frame.h;
  },
  displays: () => {
    const primary = screen.getPrimaryDisplay();
    return [primary, ...screen.getAllDisplays().filter(display => display.id !== primary.id)]
      .map(display => ({ id: String(display.id), workArea: display.workArea }));
  },
  character(_preferences, bounds) {
    // Replace the local document when settings change; stale documents lose their IPC role.
    if (character && !character.isDestroyed()) character.destroy();
    const win = localWindow("character");
    character = win;
    win.setBounds(bounds);
    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) win.showInactive();
    });
    win.on("closed", () => {
      if (character === win) character = null;
    });
  },
  hideCharacter() {
    character?.destroy();
    character = null;
  },
  tray(preferences) {
    if(appearanceMode!==preferences.appearance){appearanceMode=preferences.appearance;++appearanceRevision;for(const {window} of localWindows.values())if(!window.isDestroyed())window.webContents.send("assistant:appearance-changed",{revision:appearanceRevision,mode:appearanceMode});}
    bubbleResize = null;
    updateBackend(preferences);
    if (bubble && !bubble.isDestroyed()) {
      const normal=bubbleBounds(preferences, adapter.displays(), bubbleSize, adapter.portraitAspect?.(preferences));
      if(windowRestores.has(bubble)){
        const area=windowArea(bubble,normal),bounds=resizeBubbleBounds(normal,"nw",area.x-normal.x,area.y-normal.y,area);
        windowRestores.set(bubble,normal);windowMaxBounds.set(bubble,bounds);setChromeBounds(bubble,bounds);publishChromeState(bubble);
      }else setChromeBounds(bubble,normal);
    }
    positionCompact();
    if (
      bubble &&
      bubblePortraitKey !==
        JSON.stringify([preferences.characterId, preferences.allowPluginCharacters])
    ) {
      bubble.destroy();
      bubble = null;
      bubblePortraitKey = null;
    }
    if (!tray) {
      tray = new Tray(nativeImage.createFromPath(join(assets, "tray.png")));
      tray.setToolTip("操舵室アシスタント");
      tray.on("double-click", () => {
        if (controller.preferences.enabled) openBubble();
        else openSettings();
      });
    }
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "船長と話す", enabled: preferences.enabled, click: () => openBubble() },
        {
          label: "操舵室を開く",
          enabled: preferences.enabled,
          click: () => controller.openPanel(),
        },
        { label: "アシスタント設定…", click: openSettings },
        { type: "separator" },
        {
          label: "終了",
          click: () => {
            quitting = true;
    if(resourceReportTimer)clearInterval(resourceReportTimer);
            app.quit();
          },
        },
      ]),
    );
  },
  closePanel() {
    closeCompact();
    panel?.destroy();
    panel = null;
    responsePanel?.destroy();
    responsePanel = null;
    toolsWindow?.destroy();toolsWindow=null;
    bubble?.destroy();
    bubble = null;
  },
  openPanel,
  startup(enabled) {
    if (enabled && (process.platform !== "win32" || (!app.isPackaged && !managed)))
      throw new Error("自動起動はWindows配布版で設定してください");
    if (process.platform === "win32" && (app.isPackaged || managed))
      app.setLoginItemSettings({ openAtLogin: enabled });
  },
};

function microphonePermission(
  contents: WebContents | null,
  permission: string,
  details: {
    isMainFrame: boolean;
    requestingUrl?: string;
    mediaType?: string;
    mediaTypes?: readonly string[];
  },
): boolean {
  const owner = contents && localWindows.get(contents.id);
  if (
    !contents ||
    !owner ||
    !toolOwner(owner) ||
    owner.window.isDestroyed() ||
    contents !== owner.window.webContents ||
    !owner.window.isVisible() ||
    contents.mainFrame.url !== details.requestingUrl ||
    !controller?.preferences.enabled ||
    !controller.preferences.transcriptionEnabled
  )
    return false;
  return recording?.permits(contents.id, permission, details) ?? false;
}

function screenshotPermission(
  contents: WebContents | null,
  permission: string,
  details: {
    isMainFrame: boolean;
    requestingUrl?: string;
    mediaType?: string;
    mediaTypes?: readonly string[];
  },
): boolean {
  if (
    !contents ||
    permission !== "display-capture" ||
    !details.isMainFrame ||
    !controller?.preferences.enabled ||
    !controller.preferences.ocrEnabled
  )
    return false;
  const owner = localWindows.get(contents.id),
    media = details.mediaTypes ?? (details.mediaType ? [details.mediaType] : []);
  return (
    !!owner &&
    toolOwner(owner) &&
    !owner.window.isDestroyed() &&
    owner.window.isVisible() &&
    contents === owner.window.webContents &&
    contents.mainFrame.url === details.requestingUrl &&
    media.length === 1 &&
    media[0] === "video" &&
    (capture?.permits(contents.id) ?? false)
  );
}
function registerIpc(): void {
  for (const action of [
    "appearance-state",
    "read",
    "save",
    "open",
    "settings",
    "chat",
    "hide",
    "window-action",
    "window-state",
    "window-resize",
    "inbox",
    "tools-open",
    "draft-state",
    "draft-message",
    "draft-consume",
    "notice-state",
    "notice-size",
    "notice-dismiss",
    "notice-read",
    "notice-open",
    "voice-state",
    "voice-stop",
    "voice-test",
    "voice-speakers",
    "voice-match",
    "voice-versions",
    "resize-start",
    "resize-move",
    "resize-end",
    "conversation",
    "captain-choice",
    "agent-models",
    "agent-open",
    "notification-summary-refresh",
    "start-session",
    "adopt-session",
    "send-message",
    "apps",
    "app-open",
    "app-call",
    "display-list",
    "character-info",
    "character-state",
    "character-actor",
    "character-list",
    "character-pack-preview",
    "yukkuri-characters-preview",
    "character-pack-import",
    "character-pack-remove",
    "screenshot-sources",
    "screenshot-approve",
    "screenshot-submit",
    "screenshot-cancel",
    "reminders",
    "reminder-save",
    "reminder-remove",
    "reminder-ack",
    "source-open",
    "source-reply",
    "source-key",
    "session-open",
    "ocr-state",
    "ocr-file",
    "ocr-upload",
    "ocr-clipboard",
    "ocr-crop",
    "ocr-run",
    "ocr-discard",
    "tools",
    "note-save",
    "note-delete",
    "transcribe-file",
    "transcribe-upload",
    "transcribe-cancel",
    "clipboard-read",
    "clipboard-write",
    "record-start",
    "record-stop",
    "record-discard",
    "record-transcribe",
  ]) {
    ipcMain.handle(`assistant:${action}`, async (event, input: unknown) => {
      const owner = localWindows.get(event.sender.id);
      const current =
        !!owner && !owner.window.isDestroyed() && event.sender === owner.window.webContents;
      if (
        !owner ||
        !authorizeLocalSender(
          {
            frameUrl: event.senderFrame?.url ?? "",
            mainFrame: event.senderFrame === event.sender.mainFrame,
            current,
            role: owner.role,
          },
          action,
        )
      )
        throw new Error("許可されていない操作です");
      if (action.startsWith("resize-")) {
        if (owner.window !== bubble || !controller.preferences.enabled || !owner.window.isVisible()) throw Error("吹き出しを開いて操作してください。");
        if (action === "resize-start") {
          const {handle} = z.object({handle:z.enum(BUBBLE_RESIZE_HANDLES)}).strict().parse(input);
          const displays = adapter.displays(), preferences = controller.preferences;
          const display = displays.find(d=>d.id === preferences.position?.displayId) ?? displays[0];
          if (!display) throw Error("表示できるディスプレイがありません。");
          const token = randomUUID();
          bubbleResize = {owner:event.sender.id,epoch:bubbleEpoch,token,expires:Date.now()+30000,handle,start:owner.window.getBounds(),cursor:screen.getCursorScreenPoint(),area:display.workArea};
          return {token};
        }
        const {token} = z.object({token:z.uuid()}).strict().parse(input);
        const resize = bubbleResize;
        if (!resize || resize.token !== token || resize.owner !== event.sender.id || resize.epoch !== bubbleEpoch || Date.now() > resize.expires) throw Error("リサイズ操作を開始し直してください。");
        if (action === "resize-end") { bubbleResize = null; return; }
        const cursor = screen.getCursorScreenPoint();
        const bounds = resizeBubbleBounds(resize.start,resize.handle,cursor.x-resize.cursor.x,cursor.y-resize.cursor.y,resize.area);
        applyResizeBounds(owner.window,bounds);
        if(!windowRestores.has(owner.window))bubbleSize = {width:bounds.width,height:bounds.height};
        positionCompact();
        resize.expires = Date.now()+30000;
        return;
      }
      if (action === "window-state") {reconcileChromeState(owner.window);return chromeState(owner.window);}
      if (action === "window-resize") {
        reconcileChromeState(owner.window);
        const operation=z.discriminatedUnion("phase",[
          z.object({phase:z.literal("start"),handle:z.enum(WINDOW_RESIZE_HANDLES)}).strict(),
          z.object({phase:z.enum(["move","end"]),token:z.uuid()}).strict(),
        ]).parse(input);
        if(operation.phase==="start"){
          if(!owner.window.isVisible()||owner.window.isMinimized())throw Error("ウィンドウを開いて操作してください。");
          const token=randomUUID();windowResizes.set(owner.window,{token,handle:operation.handle,start:owner.window.getBounds(),cursor:screen.getCursorScreenPoint(),area:windowArea(owner.window),expires:Date.now()+30000});return {token};
        }
        const resize=windowResizes.get(owner.window);
        if(!resize||resize.token!==operation.token||Date.now()>resize.expires||!owner.window.isVisible()||owner.window.isMinimized())throw Error("リサイズを開始し直してください。");
        if(operation.phase==="end"){windowResizes.delete(owner.window);return;}
        const cursor=screen.getCursorScreenPoint();applyResizeBounds(owner.window,resizeWindowBounds(resize.start,resize.handle,cursor.x-resize.cursor.x,cursor.y-resize.cursor.y,resize.area));resize.expires=Date.now()+30000;return;
      }
      if (action === "window-action") {
        const operation=z.enum(["minimize","maximize","close"]).parse(input);
        windowResizes.delete(owner.window);
        if(owner.role==="bubble"){
          bubbleResize=null;
          if(operation==="close"){owner.window.hide();return chromeState(owner.window);}
          if(operation!=="maximize"||!controller.preferences.enabled||!owner.window.isVisible())throw Error("会話を開いて操作してください。");
          const restore=windowRestores.get(owner.window);
          if(restore){
            windowRestores.delete(owner.window);windowMaxBounds.delete(owner.window);
            setChromeBounds(owner.window,resizeBubbleBounds(restore,"nw",0,0,windowArea(owner.window,restore)));
          }else{
            const before=owner.window.getBounds(),area=windowArea(owner.window);
            windowRestores.set(owner.window,before);
            const bounds=resizeBubbleBounds(before,"nw",area.x-before.x,area.y-before.y,area);
            windowMaxBounds.set(owner.window,bounds);setChromeBounds(owner.window,bounds);
          }
          positionCompact();publishChromeState(owner.window);return chromeState(owner.window);
        }
        if (operation === "close") owner.window.close();
        else if (operation === "minimize") owner.window.minimize();
        else {
          reconcileChromeState(owner.window);
          const restore=windowRestores.get(owner.window);
          if(restore){windowRestores.delete(owner.window);windowMaxBounds.delete(owner.window);setChromeBounds(owner.window,resizeWindowBounds(restore,"e",0,0,windowArea(owner.window,restore)));}
          else{windowRestores.set(owner.window,owner.window.getBounds());const area=windowArea(owner.window);windowMaxBounds.set(owner.window,area);setChromeBounds(owner.window,area);windowMaxBounds.set(owner.window,owner.window.getBounds());}
          publishChromeState(owner.window);
        }
        return chromeState(owner.window);
      }
      if(action==="appearance-state")return{revision:appearanceRevision,mode:controller.preferences.appearance};
      if (action === "read") return controller.preferences;
      if (action === "inbox") return inbox();
      if (action === "voice-speakers") {
        const request=z.object({provider:z.enum(["core","voicevox"]),origin:z.string().max(2048).optional(),coreVersion:z.string().max(80).optional()}).strict().parse(input);
        return request.provider==="core"?coreSpeakers(request.coreVersion):voicevoxSpeakers(voicevoxOrigin(request.origin??""));
      }
      if(action==="voice-versions"){
        const config=await builtinCore();if(config.transport!=="ipc")return [];
        const result=await coreRequest({operation:"versions"});
        if(result.kind!=="json"||!Array.isArray(result.value))throw Error("CORE一覧が不正です");
        return result.value;
      }
      if(action==="voice-match"){
        const selected=voiceChoice.parse(input);
        return selected.voiceProvider==="system"?null:matchedVoice(voiceDraftPreferences(input));
      }
      if (action === "voice-state") return voice.snapshot();
      if (action === "voice-stop") {++voiceEpoch;voice.stop();return;}
      if (action === "voice-test") {
        if(!voice.snapshot().enabled)throw Error("ボイスをオンにして保存してください。通知を抑制する設定も確認してください。");
        const preferences=input===undefined?controller.preferences:voiceDraftPreferences(input);
        ++voiceEpoch;voice.stop();
        voice.say(`sample:${randomUUID()}`,assistantPersonaGreeting(preferences.characterId),()=>true,voiceFor(preferences));return;
      }
      if (action === "notice-state") return compactState();
      if (action === "notice-size") {
        const {revision,height}=z.object({revision:z.number().int().nonnegative(),height:z.number().int().min(1).max(16384)}).strict().parse(input);
        if(owner.window!==compact||revision!==compactRevision)return;
        compactHeight=height;positionCompact();return compact!.getBounds();
      }
      if (action === "notice-dismiss" || action === "notice-open") {
        const {revision}=z.object({revision:z.number().int().nonnegative()}).strict().parse(input);
        if(owner.window!==compact||revision!==compactRevision)return;
        const id=compactPayload?.id;
        if(action==="notice-open"){focusedNoticeId=id??null;++noticeFocusRevision;}
        dismissCompact(id);
        if(action==="notice-open"){openBubble();publishInbox();}
        return;
      }
      if (action === "notice-read") {
        const {noticeId}=z.object({noticeId:z.string().min(1).max(200)}).strict().parse(input);
        if(!owner.window.isVisible()||!notices.some(n=>n.id===noticeId))throw Error("通知の対象が変更されました。");
        dismissCompact(noticeId);return;
      }
      if(action==="tools-open"){openTools();return;}
      if(action==="draft-state")return conversationDraft;
      if(action==="draft-consume"){
        const {revision}=z.object({revision:z.number().int().nonnegative()}).strict().parse(input);
        if(revision===conversationDraft.revision)conversationDraft={...conversationDraft,text:null};return;
      }
      if(action==="draft-message"){
        if(!controller.preferences.enabled||!owner.window.isVisible())throw Error("ツールウィンドウを開いて操作してください。");
        const {text}=z.object({text:z.string().min(1).max(8192)}).strict().parse(input);
        conversationDraft={revision:conversationDraft.revision+1,text};openBubble();
        bubble?.webContents.send("assistant:draft-changed",conversationDraft);return;
      }
      if (action === "conversation") return chatState();
      if (action === "apps" || action === "app-open" || action === "app-call") {
        const rpc = control,
          info = chatState().session,
          epoch = toolEpoch(owner.role);
        if (!rpc || !info?.agent || info.state !== "ready" || !owner.window.isVisible())
          throw Error("専用セッションに接続してから利用してください。");
        if (action === "apps")
          return {
            ...(await rpc.request("assistant.apps", {
              deviceId: installationId,
              instanceId: info.agent.instanceId,
            })),
            allowViews: controller.preferences.allowPluginViews,
            allowActions: controller.preferences.allowPluginActions,
          };
        if (action === "app-open") {
          if (!controller.preferences.allowPluginViews)
            throw Error("設定でプラグインUIを許可してください。");
          const request = AssistantAppOpenParams.omit({ deviceId: true }).strict().parse(input);
          if (request.instanceId !== info.agent.instanceId)
            throw Error("専用セッションが変更されました。");
          await rpc.request("assistant.app_open", { deviceId: installationId, ...request });
          if (
            !controller.preferences.allowPluginViews ||
            control !== rpc ||
            epoch !== toolEpoch(owner.role) ||
            !toolOwner(owner) ||
            owner.window.isDestroyed() ||
            !owner.window.isVisible() ||
            chatState().session?.agent?.instanceId !== request.instanceId
          )
            throw Error("表示先が変更されました。");
          openPanel(controller.preferences.serverOrigin, {
            paneId: info.paneId,
            workspaceId: info.workspaceId,
            instanceId: request.instanceId,
          });
          return;
        }
        if (!controller.preferences.allowPluginActions)
          throw Error("設定でプラグイン操作を許可してください。");
        const request = AssistantAppCallParams.omit({ deviceId: true }).strict().parse(input);
        if (request.instanceId !== info.agent.instanceId)
          throw Error("専用セッションが変更されました。");
        const result = await rpc.request("assistant.app_call", {
          deviceId: installationId,
          ...request,
        });
        if (control !== rpc || chatState().session?.agent?.instanceId !== request.instanceId)
          throw Error("返答の対象が変更されました。");
        return result;
      }
      if (action === "display-list")
        return screen
          .getAllDisplays()
          .slice(0, 32)
          .map((display) => ({
            id: String(display.id),
            label: display.label || String(display.id),
            workArea: display.workArea,
          }));
      if (action === "character-state") return characterState();
      if (action === "character-actor") {
        const selected=controller.preferences.characterId;
        if(owner.window!==character||!controller.preferences.allowPluginCharacters)return null;
        const actor=await characterActors.get(selected,characters.portrait(selected)?.actorSignature??"");
        if(owner.window!==character||owner.window.isDestroyed()||controller.preferences.characterId!==selected||!controller.preferences.allowPluginCharacters)return null;
        return actor;
      }
      if (action === "character-info") {
        const selected = controller.preferences.characterId;
        const custom = controller.preferences.allowPluginCharacters
          ? characters.portrait(selected)
          : null;
        if (custom) return { name: custom.name, uri: custom.uri, greeting:assistantPersonaGreeting(selected) };
        const builtin = builtinCharacter(selected);
        return {
          name: builtin.name,
          uri: `${LOCAL_ORIGIN}/${builtin.file}`,
          frame: builtin.frame,
          greeting:assistantPersonaGreeting(selected),
        };
      }
      if (action === "character-list")
        return {characters:characterCatalog(),error:charactersError};
      if (action === "yukkuri-characters-preview") {
        if (characterPicking) throw Error("素材の選択が終わるまでお待ちください。");
        characterPicking = true; pendingCharacterPack = null;
        const cancel = new AbortController();
        const guard = () => { if(owner.window !== settings || owner.window.isDestroyed() || !owner.window.isVisible()) throw Error("設定画面を開いて選び直してください。"); };
        const closed = () => cancel.abort(); owner.window.once("closed", closed);
        try {
          const selection=await dialog.showOpenDialog(owner.window,{title:"キャラクター素材フォルダ（casts.json・chars）を選択",properties:["openDirectory"]});
          if(selection.canceled || !selection.filePaths[0])return null;
          const {pack,warnings,actors}=await yukkuriCharacters(selection.filePaths[0],bytes=>characterPng(bytes,value=>nativeImage.createFromBuffer(value)),cancel.signal,guard,true);
          guard();
          pendingCharacterPack={owner:event.sender.id,token:randomUUID(),expires:performance.now()+300000,pack,actors};
          return {token:pendingCharacterPack.token,name:pack.name,warnings,animationCount:actors.length,characters:pack.characters.map(character=>({name:character.name,uri:`data:image/png;base64,${character.png}`}))};
        } finally { characterPicking=false; owner.window.removeListener("closed",closed); }
      }
      if (action === "character-pack-preview") {
        if (characterPicking) throw Error("素材の選択が終わるまでお待ちください。");
        characterPicking = true;
        pendingCharacterPack = null;
        try {
          const selection = await dialog.showOpenDialog(owner.window, {
            title: "キャラクター素材を含むプラグインを選択（プログラムは実行しません）",
            properties: ["openFile"],
            filters: [{ name: "Sodashitsuプラグイン", extensions: ["sodaplugin"] }],
          });
          if (selection.canceled || !selection.filePaths[0]) return null;
          const pack = characterPack(await readPluginBundle(selection.filePaths[0]));
          if (owner.window !== settings || owner.window.isDestroyed() || !owner.window.isVisible())
            return null;
          pendingCharacterPack = {
            owner: event.sender.id,
            token: randomUUID(),
            expires: performance.now() + 300000,
            pack,
          };
          return {
            token: pendingCharacterPack.token,
            name: pack.name,
            characters: pack.characters.map((character) => ({
              name: character.name,
              uri: `data:image/png;base64,${character.png}`,
            })),
          };
        } finally {
          characterPicking = false;
        }
      }
      if (action === "character-pack-import") {
        const { token } = z.object({ token: z.uuid() }).strict().parse(input),
          pending = pendingCharacterPack;
        if (
          !pending ||
          pending.token !== token ||
          pending.owner !== event.sender.id ||
          performance.now() >= pending.expires
        )
          throw Error("素材の確認期限が切れました。選び直してください。");
        pendingCharacterPack = null;
        await characters.install(pending.pack);
        let actorError="";
        try{await characterActors.installPack(pending.pack.id,pending.actors??[]);}catch(error){actorError="立ち絵は追加しましたが、表情素材を保存できません。保存先を確認して取り込み直してください。";}
        bubble?.destroy();
        controller.refreshDisplays();
        return actorError?{characters:characterCatalog(),error:actorError}:characterCatalog();
      }
      if (action === "character-pack-remove") {
        const { id } = z
          .object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/) })
          .strict()
          .parse(input);
        if (controller.preferences.characterId.startsWith(`plugin:${id}/`))
          throw Error("標準キャラクターに切り替えて保存してから削除してください。");
        await characters.remove(id);
        await characterActors.installPack(id,[]);
        controller.refreshDisplays();
        return characterCatalog();
      }
      if (action.startsWith("screenshot-")) {
        if (
          !controller.preferences.enabled ||
          !controller.preferences.ocrEnabled ||
          !owner.window.isVisible()
        )
          throw Error("OCRを有効にし、吹き出しを開いて操作してください。");
        const id = event.sender.id;
        if (action === "screenshot-sources") return capture.list(id);
        if (action === "screenshot-cancel") {
          const request = z.object({ token: z.uuid().optional() }).strict().parse(input);
          if (capture.cancel(id, request.token)) owner.window.destroy();
          return;
        }
        if (action === "screenshot-approve") {
          const request = z
            .object({ token: z.uuid(), id: z.string().min(1).max(256) })
            .strict()
            .parse(input);
          return capture.approve(id, request.token, request.id);
        }
        const request = z
          .object({
            token: z.uuid(),
            bytes: z
              .instanceof(ArrayBuffer)
              .refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= PNG_LIMIT),
          })
          .strict()
          .parse(input);
        if (!capture.permits(id)) throw Error("画面の許可が失効しました。");
        pngSize(new Uint8Array(request.bytes));
        capture.consume(id, request.token);
        return ocr.captured(id, new Uint8Array(request.bytes));
      }
      if (action === "reminders")
        return (
          reminders?.snapshot() ?? {
            revision: reminderRevision,
            connected: false,
            jobs: [],
            runs: [],
            message: "接続してから予約してください。",
          }
        );
      if (action.startsWith("reminder-")) {
        if (!controller.preferences.enabled || !owner.window.isVisible() || !reminders)
          throw Error("吹き出しを開いて操作してください。");
        if (action === "reminder-save")
          return reminders.save(
            z
              .object({
                label: z.string().trim().min(1).max(100),
                text: z.string().trim().min(1).max(1000),
                at: z.string().datetime({ offset: true }),
              })
              .strict()
              .parse(input),
          );
        const { id } = z.object({ id: z.uuid() }).strict().parse(input);
        return action === "reminder-ack" ? reminders.acknowledge(id) : reminders.remove(id);
      }
      if (action === "session-open") {
        if (!owner.window.isVisible()) throw Error("吹き出しを開いて操作してください。");
        const info=chatState().session,rpc=control,origin=controller.preferences.serverOrigin,epoch=bubbleEpoch;
        if(!info?.agent||!chatState().connected||!rpc)throw Error("専用セッションを確認してください。");
        const instanceId=info.agent.instanceId;
        const pending=z.object({asks:z.array(z.object({askId:z.string().min(1).max(200),paneId:z.uuid()})).max(128)}).parse(await rpc.request("ask.subscribe",{renderer:"assistant"}));
        const current=chatState();
        if(control!==rpc||controller.preferences.serverOrigin!==origin||!controller.preferences.enabled||epoch!==bubbleEpoch||bubble!==owner.window||owner.window.isDestroyed()||!owner.window.isVisible()||!current.connected||current.session?.paneId!==info.paneId||current.session.workspaceId!==info.workspaceId||current.session.agent?.instanceId!==instanceId)throw Error("専用セッションが変更されました。開き直してください。");
        const question=pending.asks.find(ask=>ask.paneId===info.paneId);
        openPanel(origin,{
          paneId:info.paneId,workspaceId:info.workspaceId,instanceId:instanceId,machineId:"local",
          ...(question?{askId:question.askId}:{}),
        },"reply");
        if(question){const notice=localNotices.find(item=>item.kind==="question"&&item.key===`ask:${question.askId}`&&item.source.paneId===info.paneId&&item.source.agentInstanceId===instanceId);if(notice)dismissCompact(notice.id);}
        return;
      }
      if (action.startsWith("source-")) {
        if (!owner.window.isVisible()) throw Error("吹き出しを開いて操作してください。");
        const epoch = bubbleEpoch;
        const request = z
          .object({
            noticeId: z.uuid(),
            destination: z.enum(["reply", "main"]).optional(),
            text: z.string().trim().min(1).max(8192).optional(),
            keyName: z.enum(["Enter", "Escape", "y", "n"]).optional(),
          })
          .strict()
          .parse(input);
        const notice = notices.find((notice) => notice.id === request.noticeId);
        const hub = control;
        const rpc =
          notice?.source.machineId === "local"
            ? hub
            : remoteNotices?.rpcFor(notice?.source.machineId ?? "");
        if (
          !notice ||
          !rpc ||
          !controller.preferences.enabled ||
          notice.source.serverOrigin !== controller.preferences.serverOrigin
        )
          throw Error("通知の対象が変更されました。");
        const params = { source: { ...notice.source, machineId: "local" }, key: notice.key };
        if (action === "source-open") {
          const target = await rpc.request("assistant.source", params);
          if (
            control !== hub ||
            (notice.source.machineId !== "local" &&
              remoteNotices?.rpcFor(notice.source.machineId) !== rpc) ||
            epoch !== bubbleEpoch ||
            bubble !== owner.window ||
            owner.window.isDestroyed() ||
            !owner.window.isVisible() ||
            !notices.some((item) => item.id === notice.id)
          )
            throw Error("通知の対象が変更されました。");
          openPanel(notice.source.serverOrigin, {
            paneId: target.paneId,
            workspaceId: target.workspaceId,
            instanceId: target.agent.instanceId,
            machineId: notice.source.machineId,
            ...(notice.kind === "question" ? {askId: notice.key.slice(4)} : {}),
          }, request.destination ?? "main");
          dismissCompact(notice.id);
          return;
        }
        if (action === "source-reply") {
          if (!request.text) throw Error("返答を入力してください。");
          const result=await rpc.request("assistant.reply", { ...params, text: request.text });
          dismissCompact(notice.id);return result;
        }
        if (!request.keyName) throw Error("確認キーを指定してください。");
        const result=await rpc.request("assistant.reply_key", { ...params, keyName: request.keyName });
        dismissCompact(notice.id);return result;
      }
      if (action.startsWith("ocr-")) {
        if (action === "ocr-state") return ocr.snapshot();
        if (!controller.preferences.enabled || !owner.window.isVisible())
          throw Error("吹き出しを開いて操作してください。");
        const id = event.sender.id;
        if (action === "ocr-discard") return ocr.discard(id);
        if (action === "ocr-file" || action === "ocr-clipboard")
          return ocr.input(id, action === "ocr-file" ? "file" : "clipboard");
        if(action==="ocr-upload"){
          if(owner.window.isMinimized())throw Error("ツール画面を開いて操作してください。");
          const request=z.object({revision:z.number().int().nonnegative(),bytes:z.instanceof(ArrayBuffer).refine(b=>b.byteLength>0&&b.byteLength<=PNG_LIMIT)}).strict().parse(input);
          if(request.revision!==ocr.snapshot().revision)throw Error("画像の状態が変わりました。もう一度取り込んでください。");
          return ocr.captured(id,new Uint8Array(request.bytes));
        }
        const target = z.object({ imageId: z.uuid() });
        if (action === "ocr-run") return ocr.run(id, target.strict().parse(input).imageId);
        const rect = z
          .object({
            x: z.number().int().nonnegative(),
            y: z.number().int().nonnegative(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict();
        const request = target.extend({ rect }).strict().parse(input);
        return ocr.crop(id, request.imageId, request.rect);
      }
      if (action === "tools") return toolsState();
      if (["record-start", "record-stop", "record-discard", "record-transcribe"].includes(action)) {
        if (
          !controller.preferences.enabled ||
          !controller.preferences.transcriptionEnabled ||
          !owner.window.isVisible()
        )
          throw Error("表示中の吹き出しで、音声入力を有効にしてから録音してください。");
        const id = event.sender.id;
        if (action === "record-start") {
          ++voiceEpoch;voice.stop();
          if (transcription.isBusy()) throw Error("前の文字起こしが完了するまでお待ちください。");
          const token = recording.begin(id);
          if (owner.window.isDestroyed()) {
            recording.cancel(id);
            throw Error("吹き出しが閉じられました。");
          }
          recordingOrigin = JSON.stringify([controller.preferences.transcriptionProvider,controller.preferences.transcriptionOrigin,controller.preferences.serverOrigin]);
          return { token, maxBytes: AUDIO_LIMIT, maxDurationMs: 300_000 };
        }
        if (action === "record-discard") {
          const { token } = z.object({ token: z.uuid() }).strict().parse(input);
          if (recording.has(id)) recording.discard(id, token);
          else if (!transcription.cancel(token)) throw Error("録音の対象が変わりました。");
          owner.window.webContents.send("assistant:recording-cancelled", {
            token,
            reason: "録音を破棄しました。",
          });
          return;
        }
        if (action === "record-stop") {
          const { token } = z.object({ token: z.uuid() }).strict().parse(input);
          return recording.stopped(id, token);
        }
        const request = z
          .object({
            token: z.uuid(),
            mime: z.enum([
              "audio/webm",
              "audio/webm;codecs=opus",
              "audio/ogg",
              "audio/ogg;codecs=opus",
              "audio/mp4",
              "audio/wav",
            ]),
            bytes: z
              .instanceof(ArrayBuffer)
              .refine((value) => value.byteLength > 0 && value.byteLength <= AUDIO_LIMIT),
          })
          .strict()
          .parse(input);
        if (transcription.isBusy()) throw Error("前の文字起こしが完了するまでお待ちください。");
        recording.consume(id, request.token);
        const suffix = request.mime.startsWith("audio/ogg")
          ? "ogg"
          : request.mime.startsWith("audio/mp4")
            ? "m4a"
            : request.mime.startsWith("audio/wav")
              ? "wav"
              : "webm";
        await transcription.recorded(
          {
            name: `recording.${suffix}`,
            mime: request.mime,
            bytes: new Uint8Array(request.bytes),
          },
          request.token,
        );
        const outcome=transcription.snapshot();
        if(outcome.status!=="done")throw Error(outcome.message || "録音の処理が取り消されました");
        return;
      }
      if (
        [
          "note-save",
          "note-delete",
          "transcribe-file",
          "transcribe-upload",
          "transcribe-cancel",
          "clipboard-read",
          "clipboard-write",
        ].includes(action)
      ) {
        if (!controller.preferences.enabled) throw Error("アシスタントは無効です。");
        if (action === "note-save") {
          const parsed = NoteSave.parse(input);
          const notes = await notesFile.save(parsed);
          await publishTools();
          return { id: parsed.id ?? notes.at(-1)!.id };
        }
        if (action === "note-delete") {
          await notesFile.delete(input);
          await publishTools();
          return;
        }
        if(action==="transcribe-upload"){
          if(!owner.window.isVisible()||owner.window.isMinimized())throw Error("ツール画面を開いて操作してください。");
          if(recording.has())throw Error("録音を文字起こしするか破棄してから選んでください。");
          const request=z.object({name:z.string().min(1).max(200),context:z.string().regex(/^[0-9a-f]{64}$/),revision:z.number().int().nonnegative(),bytes:z.instanceof(ArrayBuffer).refine(b=>b.byteLength>0&&b.byteLength<=AUDIO_LIMIT)}).strict().parse(input);
          if(request.revision!==toolsRevision||request.context!==audioInputContext())throw Error("処理先または状態が変わりました。確認してもう一度実行してください。");
          return transcription.uploaded(request.name,new Uint8Array(request.bytes));
        }
        if (action === "transcribe-file") {
          if (recording.has())
            throw Error("録音を文字起こしするか破棄してから、ファイルを選んでください。");
          return transcription.file();
        }
        if (action === "transcribe-cancel") return transcription.cancel();
        if (action === "clipboard-read") {
          const text = await clipboard.readText();
          if (text.length > 8192) throw Error("コピーした文章は8192文字以内にしてください。");
          return text;
        }
        const { text } = z
          .object({ text: z.string().max(8192) })
          .strict()
          .parse(input);
        await clipboard.writeText(text);
        return;
      }
      if(action==="notification-summary-refresh"){assistantChat?.retryNotificationSummary();return;}
      if(action==="agent-open"){
        const {source}=z.object({source:AssistantSource}).strict().parse(input);
        if(owner.window!==bubble||!owner.window.isVisible()||!controller.preferences.enabled||source.serverOrigin!==controller.preferences.serverOrigin)throw Error("会話を開いて対象を選び直してください。");
        const row=inbox().agentList.agents.find(row=>row.source.paneId===source.paneId&&row.source.agentInstanceId===source.agentInstanceId&&row.source.workspaceId===source.workspaceId&&row.source.machineId===source.machineId&&row.source.serverOrigin===source.serverOrigin);
        if(!row)throw Error("エージェントが変更されたか、接続が切れました。一覧を確認してください。");
        openPanel(source.serverOrigin,{paneId:source.paneId,workspaceId:source.workspaceId,instanceId:source.agentInstanceId,machineId:source.machineId},"reply");return;
      }
      if(action==="agent-models"){
        const request=z.object({kind:z.enum(["claude","codex","muse","agy","copilot"])}).strict().parse(input);
        if(!control)throw Error("操舵室に接続してください。");
        return AssistantModelCatalog.parse(await control.request("agent.model_options",request));
      }
      if(action==="captain-choice"){
        const request=z.object({kind:z.enum(["claude","codex","muse","agy","copilot"]),profile:AssistantLaunchSettings,notificationSummary:z.boolean()}).strict().parse(input);
        const saved=await controller.chooseCaptain(request.kind,request.profile,request.notificationSummary);
        assistantChat?.configure(saved.agentProfiles,activeCharacterId(),saved.notificationSummary);
        return saved;
      }
      if (["start-session", "adopt-session", "send-message"].includes(action)) {
        if (!assistantChat || !controller.preferences.enabled)
          throw Error("アシスタントは接続していません。");
        if (action === "start-session") return assistantChat.start(input);
        if (action === "adopt-session") return assistantChat.adopt(input);
        return assistantChat.send(input);
      }
      if (action === "save") {
        if (managed && DesktopAssistantPreferences.parse(input).launchAtLogin) throw Error("sodaによる起動管理中は、Windowsログイン時の単独起動を併用できません");
        const oldVoice=JSON.stringify([controller.preferences.voiceProvider,controller.preferences.voicevoxOrigin,controller.preferences.voicevoxStyleId,controller.preferences.voiceFollowCharacter,controller.preferences.characterId,controller.preferences.voiceCoreVersion,controller.preferences.serverOrigin]);
        const saved = await controller.update(input,true);
        if(oldVoice!==JSON.stringify([saved.voiceProvider,saved.voicevoxOrigin,saved.voicevoxStyleId,saved.voiceFollowCharacter,saved.characterId,saved.voiceCoreVersion,saved.serverOrigin])){++voiceEpoch;voice.stop();}
        if (!saved.enabled) {
          if (managed) managedStreams!.output.write('{"type":"disabled"}\n');
          setImmediate(() => app.quit());
        }
        return saved;
      }
      if (action === "chat") {
        if (owner.role === "character" && bubble && !bubble.isDestroyed() && (bubble.isVisible() || bubbleRequested)) {
          bubbleRequested = false;
          bubble.hide();
        } else openBubble();
        return;
      }
      if (action === "hide") {
        if(owner.role==="tools"){owner.window.close();return;}
        bubbleRequested = false;
        if(!toolsWindow)transcription.cancel();
        bubble?.hide();
        return;
      }
      if (action === "open") {
        controller.openPanel();
        return;
      }
      openSettings();
    });
  }
}

app.setName("Sodashitsu Assistant");
if(process.platform==="win32"){
  // Some Windows drivers repeatedly crash Chromium's GPU process on first paint.
  app.disableHardwareAcceleration();
  app.setAppUserModelId("io.sodashitsu.assistant");
}
const managedStreams = process.argv.includes("--soda-managed") ? await managedChannel(process.argv).catch(()=>{app.exit(1);return undefined;}) : undefined;
const managed = process.argv.includes("--soda-managed")
  ? await managedLaunch(managedStreams!.input, () => app.quit()).catch(() => { app.exit(1); return undefined; }) : undefined;
if (!app.requestSingleInstanceLock()) {
  if (managed) app.exit(75); else app.quit();
}
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--soda-managed")) return;
    if (controller) openSettings();
    else settingsRequested = true;
  });
  app.on("window-all-closed", () => {
    /* Remain accessible through Tray on all platforms. */
  });
  app.on("before-quit", () => {
    quitting = true;
    if(resourceReportTimer)clearInterval(resourceReportTimer);
    voice.stop();
    closeCompact();
    ++automaticNoticeEpoch;
    fullscreen.stop();
    backend?.stop();
    backend = null;
    control?.stop();
    assistantChat?.stop();
    reminders?.stop();
    remoteNotices?.stop();
    transcription?.cancel();
    recording?.cancel();
    ocr?.discard();
    capture?.cancel();
  });
  app.on("activate", () => {
    if (!quitting && controller) openSettings();
  });
  void app
    .whenReady()
    .then(async () => {
      if(process.platform==="darwin")app.dock?.setIcon(join(assets,"sodashitsu.png"));
      session
        .fromPartition("assistant-local")
        .protocol.handle("soda-assistant", async (request) => {
          const url = new URL(request.url);
          const mime =
            url.host === "app" && !url.search && !url.hash
              ? allowedAssets.get(url.pathname)
              : undefined;
          if (!mime || request.method !== "GET") return new Response(null, { status: 404 });
          return new Response(await readFile(join(assets, url.pathname.slice(1))), {
            headers: {
              "Content-Type": `${mime}; charset=utf-8`,
              "Content-Security-Policy": csp,
              "X-Content-Type-Options": "nosniff",
            },
          });
        });
      for (const partition of ["assistant-local", "persist:assistant-server"]) {
        const isolated = session.fromPartition(partition);
        isolated.setPermissionRequestHandler((contents, permission, callback, details) => {
          callback(
            partition === "assistant-local" &&
              (microphonePermission(contents, permission, details) ||
                screenshotPermission(contents, permission, details)),
          );
        });
        isolated.setPermissionCheckHandler((contents, permission, _origin, details) => {
          return (
            partition === "assistant-local" &&
            (microphonePermission(contents, permission, details) ||
              screenshotPermission(contents, permission, details))
          );
        });
        isolated.setDisplayMediaRequestHandler((request, callback) => {
          const owner = [...localWindows.values()].find(
            (owner) =>
              toolOwner(owner) &&
              !owner.window.isDestroyed() &&
              owner.window.isVisible() &&
              owner.window.webContents.mainFrame === request.frame,
          );
          if (
            partition !== "assistant-local" ||
            !owner ||
            request.securityOrigin !== LOCAL_ORIGIN ||
            request.audioRequested ||
            !request.videoRequested ||
            !request.userGesture ||
            !controller?.preferences.enabled ||
            !controller.preferences.ocrEnabled
          ) {
            callback(null);
            return;
          }
          try {
            callback({ video: capture.take(owner.window.webContents.id) });
          } catch {
            callback(null);
          }
        });
        isolated.on("will-download", (event) => event.preventDefault());
      }
      characters = new Characters(join(app.getPath("userData"), "assistant-characters.json"));
      try {
        await characters.load();
      } catch (error) {
        charactersError = error instanceof Error ? error.message : "素材を読み込めません。";
      }
      characterActors=new CharacterActors(join(app.getPath("userData"),"assistant-character-actors"));
      try{await characterActors.load();}catch(error){charactersError += ` ${error instanceof Error?error.message:"表情素材を読み込めません。"}`;}
      installationId = await deviceIdentity(join(app.getPath("userData"), "assistant-device-id"));
      resourceReportTimer=setInterval(()=>{void reportResources();},3000);
      resourceReportTimer.unref();
      if (managed) managedStreams!.output.write(JSON.stringify({type:"attached",deviceId:installationId}) + "\n");
      notesFile = new NotesFile(join(app.getPath("userData"), "assistant-notes.json"));
      transcription = new Transcription({
        prepareAgent:()=>{
          if(!assistantChat)throw Error("専用エージェントへ接続してから送信してください");
          return assistantChat.prepareAudio();
        },
        pick: async () => {
          const owner = toolsWindow??bubble;
          if (!owner || owner.isDestroyed()) return null;
          const selection = await dialog.showOpenDialog(owner, {
            title: controller.preferences.transcriptionProvider==="agent"?"専用Codexへ送る音声を選択":"このPCのWhisperで文字起こしする音声を選択",
            properties: ["openFile"],
            filters: [
              {
                name: "音声（25MB以内）",
                extensions: ["wav", "mp3", "m4a", "mp4", "ogg", "flac", "webm"],
              },
            ],
          });
          return selection.canceled ? null : (selection.filePaths[0] ?? null);
        },
        changed: () => {
          void publishTools();
        },
      });
      capture = new CaptureLease(
        () =>
          desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 0, height: 0 },
            fetchWindowIcons: false,
          }),
        (id, active) => {
          const owner = localWindows.get(id)?.window;
          if (active && owner && !owner.isDestroyed()) owner.destroy();
        },
      );
      const ocrRunner = new OcrRunner();
      ocr = new Ocr({
        changed: (state) => {
          publishToolEvent("assistant:ocr-changed",state);
        },
        input: async (id, source, signal) => {
          const owner = localWindows.get(id)?.window;
          if (!owner || owner.isDestroyed()) return null;
          if (source === "file") {
            const selection = await dialog.showOpenDialog(owner, {
              title: "文字を読み取るPNG画像を選択",
              properties: ["openFile"],
              filters: [{ name: "PNG画像（8MiB以内）", extensions: ["png"] }],
            });
            signal.throwIfAborted();
            return selection.canceled || !selection.filePaths[0]
              ? null
              : readPng(selection.filePaths[0], signal);
          }
          const items = await clipboard.read();
          signal.throwIfAborted();
          const item = items.slice(0, 16).find((item) => item.types.includes("image/png"));
          if (!item)
            throw Error(
              "クリップボードにPNG画像がありません。OSの画面切り取りでコピーしてください。",
            );
          const blob = await item.getType("image/png");
          signal.throwIfAborted();
          if (!(blob instanceof Blob) || !blob.size || blob.size > PNG_LIMIT)
            throw Error("8MiB以内のPNG画像をコピーしてください。");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          signal.throwIfAborted();
          pngSize(bytes);
          return bytes;
        },
        crop: (bytes, rect) => {
          pngSize(bytes);
          const image = nativeImage.createFromBuffer(Buffer.from(bytes));
          const size = image.getSize();
          const expected = pngSize(bytes);
          if (image.isEmpty() || size.width !== expected.width || size.height !== expected.height)
            throw Error("PNG画像を読み取れません。");
          return image.crop(rect).toPNG();
        },
        agent: (bytes, signal) => {
          if (!assistantChat || !controller.preferences.enabled) throw Error("専用エージェントに接続していません");
          return assistantChat.image(bytes, signal);
        },
        run: (bytes, executable, language, signal) =>
          ocrRunner.run(bytes, executable, language, signal),
      });
      recording = new RecordingLease((id, phase, token) => {
        recordingOrigin = null;
        const owner = localWindows.get(id)?.window;
        if (!owner || owner.isDestroyed()) return;
        owner.webContents.send("assistant:recording-cancelled", {
          token,
          reason: "録音の期限を超えたため破棄しました。",
        });
        if (phase === "capturing") owner.destroy();
      });
      const file = new PreferencesFile(join(app.getPath("userData"), "assistant.json"));
      let preferences: DesktopAssistantPreferences;
      let preferencesFailed = false;
      try {
        preferences = await file.read();
      } catch (error) {
        console.error(
          "アシスタント設定を読み込めません。元のファイルを保存したまま無効で開始します。",
          error,
        );
        preferencesFailed = true;
        preferences = DesktopAssistantPreferences.parse({});
      }
      if (managed && preferencesFailed) { app.exit(1); return; }
      controller = new AssistantController(preferences, adapter, (next) => file.write(next));
      session.fromPartition("persist:assistant-server").cookies.on("changed", (_event, cookie) => {
        if (isSodaSessionCookie(cookie.name)) {
          backend?.reconnect();
          control?.reconnect();
        }
      });
      registerIpc();
      try{screenLocked=powerMonitor.getSystemIdleState(1)==="locked";}catch{}
      if (managed) await controller.initializeManaged(managed.serverOrigin);
      else controller.initialize();
      powerMonitor.on("suspend", () => {
        suspended = true;
        publishCharacterState();
        voice.configure(false);
        closeCompact();
        ++automaticNoticeEpoch;
        fullscreen.stop();
        transcription.cancel();
        ocr.discard();
        const mediaOwners=new Set<number>();
        const captureOwner=capture.owner(),recordOwner=recording.owner();
        if(captureOwner!==undefined&&capture.permits(captureOwner))mediaOwners.add(captureOwner);
        if(recordOwner!==undefined&&recording.has())mediaOwners.add(recordOwner);
        recording.cancel();capture.cancel();
        for(const window of [toolsWindow,bubble])if(window&&!window.isDestroyed()){
          if(mediaOwners.has(window.webContents.id))window.destroy();else window.hide();
        }
        control?.stop();
        backend?.stop();
        assistantChat?.connection(false);
        reminders?.connection(false);
        remoteNotices?.connection(false);
      });
      powerMonitor.on("lock-screen", () => {
        screenLocked=true;publishCharacterState();
        voice.configure(false);
        closeCompact();
        ++automaticNoticeEpoch;
        fullscreen.stop();
        transcription.cancel();
        ocr.discard();
        if(toolsWindow&&!toolsWindow.isDestroyed())toolsWindow.hide();
        if (bubble && !bubble.isDestroyed()) bubble.hide();
      });
      powerMonitor.on("unlock-screen", () => {
        screenLocked=false;publishCharacterState();
        const prefs=controller.preferences;voice.configure(prefs.enabled&&prefs.voiceEnabled&&!prefs.mute);
        ++automaticNoticeEpoch;
        fullscreen.invalidate();
      });
      powerMonitor.on("resume", () => {
        suspended = false;
        publishCharacterState();
        const prefs=controller.preferences;voice.configure(prefs.enabled&&prefs.voiceEnabled&&!prefs.mute);
        ++automaticNoticeEpoch;
        fullscreen.invalidate();
        const previousControl = control,
          previousBackend = backend;
        controller.refreshDisplays();
        if (controller.preferences.enabled) {
          if (control === previousControl) control?.reconnect();
          if (backend === previousBackend) backend?.reconnect();
        }
      });
      screen.on("display-added", () => controller.refreshDisplays());
      screen.on("display-removed", () => controller.refreshDisplays());
      screen.on("display-metrics-changed", () => controller.refreshDisplays());
      // Disabled by default: first launch presents settings instead of launching a model/session.
      if (!controller.preferences.enabled || settingsRequested) openSettings();
    })
    .catch((error) => {
      console.error(error);
      if (managed) app.exit(1); else app.quit();
    });
}
