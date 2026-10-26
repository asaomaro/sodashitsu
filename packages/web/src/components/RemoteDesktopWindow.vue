<script setup lang="ts">
import {DESKTOP_PROTECTED_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_VIRTUAL_DISPLAY_PROTOCOL,DESKTOP_NATIVE_CODEC_PROTOCOL,isDesktopNativeStream,type DesktopNativeCodec} from "@sodashitsu/protocol";

import "./viewportMaximize.css";
import { shallowRef, computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  decodeDesktopFrame,
  DESKTOP_IME_PROTOCOL,
  DESKTOP_INPUT_PROTOCOL,
  DESKTOP_CURSOR_PROTOCOL,
  isDesktopCursor,
  decodeDesktopCursor,
  DESKTOP_NATIVE_RATE_PROTOCOL,
  DESKTOP_VIDEO_LANE_PROTOCOL, DESKTOP_IMAGE_LANE_PROTOCOL,
  DESKTOP_NATIVE_VIDEO_PROTOCOL,
  DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,
  DESKTOP_AUDIO_PROTOCOL,DesktopNativeAudioStatus,isDesktopAudio,
  DesktopNativeVideoStats,DESKTOP_DATAGRAM_PROTOCOL,DesktopNativeFrameNotice,
  isExtendedDesktopInput,
  DesktopFrameChain,
  RemoteDesktopInput,
  DesktopReady,
  type DesktopFrameInfo,
  isDesktopMediaChunk,
  DesktopMediaStatus,
  DesktopMediaStream,
  DesktopMediaSignal,
  DesktopClipboardResult,
  DESKTOP_CLIPBOARD_LIMIT,
} from "@sodashitsu/protocol";

import DesktopFiles from "./DesktopFiles.vue";
import {DesktopFileClient} from "../desktop/fileClient.js";
import {DESKTOP_NATIVE_ADAPTIVE_PROTOCOL,DesktopNativeProfilePending,DESKTOP_MONITORS_PROTOCOL,desktopMonitorAt,type DesktopMonitorLayout,DESKTOP_FILES_PROTOCOL} from "@sodashitsu/protocol";
import {DesktopRichClipboardClient,readRichClipboard,writeRichClipboard} from "../desktop/richClipboard.js";
import {DESKTOP_RICH_CLIPBOARD_PROTOCOL,type DesktopClipboardBundle} from "@sodashitsu/protocol";
import {DesktopNativeAudioReceiver} from "../desktop/nativeAudioReceiver.js";
import { DesktopCursorRenderer } from "../desktop/cursor.js";
import { DesktopEscape, DesktopButtons, DesktopModifiers, DesktopInputSender } from "../desktop/input.js";
import { imeKeyCode, type ImeKeyCode } from "../desktop/ime.js";
import { DesktopMediaReceiver, ImageQualityController } from "../desktop/mediaReceiver.js";
import { chooseMaximumDisplayMode, sameDisplay, type DisplaySize } from "../desktop/display.js";
import { renderDesktopUpdate } from "../desktop/render.js";
import {
  loadSettings,
  saveSettings,
  normalizeSettings,
  presets,
  type ConnectionSettings,
} from "../desktop/settings.js";

const props = defineProps<{ machineId: string; label: string; embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const infoOpen = ref(false);
const toolbarCollapsed = ref(false), inputCollapsed = ref(false);
const textInput = ref<HTMLInputElement>();
const secureDesktop = ref(false);
const protectedMode=ref<"elevated-default"|"elevated-uac">();
const elevatedScreen=ref(false);
const lockScreenCover = ref(false);
const imeKeys = ref(false);
const extendedInput = ref(false);
const dismissInFlight = ref(false);
let dismissPending = false;
async function toggleToolbar() {
  toolbarCollapsed.value = !toolbarCollapsed.value;
  if (toolbarCollapsed.value) infoOpen.value = false;
  await nextTick();
  (control.value ? canvas.value : windowElement.value)?.focus({preventScroll:true});
}
async function toggleTextInput() {
  inputCollapsed.value = !inputCollapsed.value;
  await nextTick();
  const target = control.value ? (inputCollapsed.value ? canvas.value : textInput.value) : windowElement.value;
  target?.focus({preventScroll:true});
}
const canvas = ref<HTMLCanvasElement | null>(null);
const screenElement = ref<HTMLElement | null>(null);
const screenSize = ref<DisplaySize>({ width: 0, height: 0 });
const maximumDisplay = ref(false),
  displayModes = ref<DisplaySize[]>([]);
let displayObserver: ResizeObserver | undefined,
  displayTimer: ReturnType<typeof setTimeout> | undefined,
  requestedDisplay: DisplaySize | undefined;
function scheduleDisplay() {
  clearTimeout(displayTimer);
  if (!maximumDisplay.value || !ready.value || !screenElement.value) return;
  displayTimer = setTimeout(() => {
    if (!maximumDisplay.value || !ready.value || dead || !screenElement.value) return;
    const mode = chooseMaximumDisplayMode(displayModes.value);
    if (!mode || sameDisplay(mode, activeSettings.value?.display)) return;
    requestedDisplay = mode;
    connect();
  }, 700);
}
function toggleDisplay() {
  if (maximumDisplay.value) scheduleDisplay();
  else {
    requestedDisplay = undefined;
    connect();
  }
}
const status = ref("接続中"),
  error = ref(""),
  ready = ref(false),
  connected = ref(false),
  control = ref(false),
  allowed = ref(false),
  title = ref(""),
  synthetic = ref(false);
const agentActive = ref(false),
  agentTicket = ref(""),
  agentExpires = ref(0);
const savedSettings = loadSettings(props.machineId);
const deltas = ref(savedSettings.deltas),
  colorMode = ref(savedSettings.image.colorMode),
  showCursor = ref(savedSettings.image.showCursor);
const width = ref(savedSettings.width),
  fps = ref(savedSettings.fps),
  quality = ref(savedSettings.quality),
  text = ref(""),
  fit = ref(true),
  maximized = ref(false);
const info = ref<DesktopFrameInfo | null>(null),
  stats = ref({ fps: 0, mbps: 0, ackP95Ms: 0 }),
  drawMs = ref(0),
  inputAckMs = ref(0),
  rendered = ref(0);
const canvasSize = computed(() => {
  const size = info.value ?? { width: 1, height: 1 };
  const scale = fit.value
    ? Math.min(screenSize.value.width / size.width, screenSize.value.height / size.height)
    : 1;
  return { width: `${size.width * scale}px`, height: `${size.height * scale}px` };
});
const adaptive = ref(savedSettings.adaptive),
  dynamicQuality = ref(false),
  allowMedia = ref(false),
  allowClipboard = ref(false);
const mediaState = ref("images"),
  mediaAudio = ref(false),
  sound = ref(false),
  requestAudio = ref(false),
  nativeVideo = ref(false),
  nativeStats = ref<DesktopNativeVideoStats|null>(null),
  mediaTransport = ref<"auto" | "relay" | "native">("auto"),
  mediaBitrate = ref(2500),
  nativeAudio=ref(false),nativeAudioState=ref(""),
  nativeDatagrams=ref(false),nativeUdp=ref(true),nativeUdpActive=ref(false),
  nativeCodecs=ref(false),nativeCodecCandidates=ref<DesktopNativeCodec[]>([]),nativeCodec=ref<DesktopNativeCodec>("h264"),nativeActualCodec=ref<DesktopNativeCodec>(),nativeRequestedCodec=ref<DesktopNativeCodec>(),nativeCodecFallback=ref(""),
  nativeAdaptive=ref(false),
  nativeMaxFps=ref(30), nativeFps=ref(60),
  videoFrames = ref(0),
  videoFps = ref(0);
let videoStatsAt=0,videoStatsCount=0,mediaRequestSeq=0,soundRequestSeq=0;
const monitorLayout=ref<DesktopMonitorLayout>(),monitorDevice=ref<string>();
const virtualScreen=ref(false),virtualActive=ref(false);
function changeVirtualScreen(){if(virtualScreen.value)elevatedScreen.value=false;monitorDevice.value=undefined;maximumDisplay.value=false;requestedDisplay=undefined;releaseInputs();connect();const el=canvas.value;el?.getContext("2d")?.clearRect(0,0,el.width,el.height);}
function changeElevatedScreen(){if(elevatedScreen.value)virtualScreen.value=false;monitorDevice.value=undefined;maximumDisplay.value=false;requestedDisplay=undefined;releaseInputs();connect();const el=canvas.value;el?.getContext("2d")?.clearRect(0,0,el.width,el.height);}
function resetMonitor(){monitorDevice.value=undefined;changeMonitor();}
function changeMonitor(){maximumDisplay.value=false;requestedDisplay=undefined;releaseInputs();connect();}
const fileClient=shallowRef<DesktopFileClient>(),filePanel=ref<InstanceType<typeof DesktopFiles>>(),filesCap=ref(false),filesReady=ref(false);let fileSocket:WebSocket|undefined;
function resetFiles(){fileClient.value?.stop();fileClient.value=undefined;const socket=fileSocket;fileSocket=undefined;socket?.close();filesCap.value=filesReady.value=false;}
function dropFiles(event:DragEvent){const data=event.dataTransfer;if(!data?.files.length)return;if(!filePanel.value){error.value="接続先でファイル共有フォルダを設定し、ファイル転送を許可してください";return;}const files:File[]=[];for(const item of Array.from(data.items)){if(item.webkitGetAsEntry?.()?.isDirectory){error.value="フォルダは送信できません。ファイルを選択してください";continue;}const file=item.getAsFile();if(file)files.push(file);}filePanel.value.addFiles(files);}
const richClipboard=ref(false),richPipeReady=ref(false),richBusy=ref(false),richSyncMode=ref(false);
let richClient:DesktopRichClipboardClient|undefined,richSocket:WebSocket|undefined,richSeq=0,lastRichLocal="",lastRichRemote="";
const clipboardGranted = ref(false),
  clipboardText = ref(""),
  clipboardSync = ref(false),
  clipboardNotice = ref("");
let receiver: DesktopMediaReceiver | undefined,
  qualityController: ImageQualityController | undefined,
  sourceCanvas = document.createElement("canvas"),
  clipSeq = 0,
  clipBusy = false,
  lastClipboard = "";
const clipWaits = new Map<
  number,
  {
    resolve(value: string | undefined): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function cancelRichFromUi(){windowElement.value?.focus({preventScroll:true});clipboardSync.value=false;cancelRichTransfer();}
function cancelRichTransfer(){richSeq++;richClient?.cancel();richBusy.value=false;}
function resetRichClipboard(){
  cancelRichTransfer();richClient?.stop();richClient=undefined;const pipe=richSocket;richSocket=undefined;pipe?.close();
  richClipboard.value=richPipeReady.value=false;if(richSyncMode.value)clipboardSync.value=false;richSyncMode.value=false;lastRichLocal=lastRichRemote="";
}
function clearClipboard() {
  cancelRichTransfer();lastRichLocal=lastRichRemote="";
  clipboardSync.value = false;
  clipboardGranted.value = false;
  for (const wait of clipWaits.values()) {
    clearTimeout(wait.timer);
    wait.reject(new Error("クリップボード共有は終了しました"));
  }
  clipWaits.clear();
}
function clipboard(operation: "read" | "write", text?: string): Promise<string | undefined> {
  if (!clipboardGranted.value || !ready.value || (text?.length ?? 0) > DESKTOP_CLIPBOARD_LIMIT)
    return Promise.reject(
      new Error("クリップボード共有が許可されていないか、文字数が上限を超えています"),
    );
  return new Promise((resolve, reject) => {
    const id = ++clipSeq,
      timer = setTimeout(() => {
        clipWaits.delete(id);
        reject(new Error("クリップボードの応答がありません"));
      }, 2000);
    clipWaits.set(id, { resolve, reject, timer });
    send({
      type: "clipboard",
      id,
      operation,
      ...(operation === "write" ? { text: text ?? "" } : {}),
    });
  });
}
async function transferClipboard(operation: "read" | "write") {
  try {
    const value = await clipboard(operation, clipboardText.value);
    if (operation === "read") clipboardText.value = value ?? "";
    clipboardNotice.value = operation === "read" ? "共有元から取得しました" : "共有元へ送りました";
  } catch (e) {
    clipboardNotice.value = e instanceof Error ? e.message : "転送できません";
  }
}
const richActive=(owner:DesktopRichClipboardClient,version:number,request:number)=>!dead&&version===epoch&&request===richSeq&&owner===richClient&&clipboardGranted.value&&richClipboard.value&&richPipeReady.value&&document.hasFocus()&&!document.hidden;
async function richHash(value:DesktopClipboardBundle){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");}
async function transferRichClipboard(operation:"read"|"write"){
  const owner=richClient;if(!owner||richBusy.value||clipboardSync.value)return;const version=epoch,request=++richSeq;windowElement.value?.focus({preventScroll:true});richBusy.value=true;
  try{
    if(operation==="write"){const bundle=await readRichClipboard();if(!richActive(owner,version,request))return;await owner.write(bundle);if(richActive(owner,version,request))clipboardNotice.value="画像・書式を共有元へ送りました";}
    else{const bundle=await owner.read();if(!richActive(owner,version,request))return;const skipped=await writeRichClipboard(bundle);if(richActive(owner,version,request))clipboardNotice.value=skipped.length?"対応形式を手元へコピーしました（貼り付け非対応: "+skipped.map(v=>({"text/rtf":"RTF","text/html":"HTML","image/png":"PNG","text/plain":"テキスト"})[v]??v).join(", ")+"）":"画像・書式を手元へコピーしました";}
  }catch(e){if(version===epoch&&request===richSeq)clipboardNotice.value=e instanceof Error?e.message:"画像・書式を転送できません";}
  finally{if(request===richSeq)richBusy.value=false;}
}
async function syncRichClipboard(){
  const owner=richClient;if(!owner||richBusy.value||!clipboardSync.value||!document.hasFocus()||document.hidden)return;const version=epoch,request=++richSeq;richBusy.value=true;
  try{
    const local=await readRichClipboard(),localHash=await richHash(local);if(!richActive(owner,version,request)||!clipboardSync.value)return;
    if(localHash!==lastRichLocal){await owner.write(local);if(richActive(owner,version,request)&&clipboardSync.value){lastRichLocal=localHash;lastRichRemote=localHash;}}
    else{const remote=await owner.read(),remoteHash=await richHash(remote);if(!richActive(owner,version,request)||!clipboardSync.value)return;if(remoteHash!==lastRichRemote){
      const check=await richHash(await readRichClipboard());if(!richActive(owner,version,request)||!clipboardSync.value||check!==localHash)return;
      const skipped=await writeRichClipboard(remote);if(!richActive(owner,version,request)||!clipboardSync.value)return;lastRichRemote=remoteHash;lastRichLocal="";if(skipped.length)clipboardNotice.value="対応形式を同期しました（一部の形式はブラウザが貼り付けに対応していません）";
    }}
  }catch(e){if(version===epoch&&request===richSeq){clipboardSync.value=false;clipboardNotice.value=e instanceof Error?e.message:"画像・書式の同期が停止しました";}}
  finally{if(request===richSeq)richBusy.value=false;}
}
async function syncClipboard() {
  if(richSyncMode.value){await syncRichClipboard();return;}
  if (!clipboardSync.value || clipBusy || !document.hasFocus() || document.hidden) return;
  clipBusy = true;
  const version = epoch;
  try {
    const local = await navigator.clipboard.readText();
    if (version !== epoch || !clipboardSync.value) return;
    if (local.length > DESKTOP_CLIPBOARD_LIMIT) throw new Error("クリップボードは8192文字までです");
    if (local !== lastClipboard) {
      await clipboard("write", local);
      if (version !== epoch || !clipboardSync.value) return;
      lastClipboard = local;
      clipboardText.value = local;
    } else {
      const remote = (await clipboard("read")) ?? "";
      if (version !== epoch || !clipboardSync.value) return;
      if (remote !== lastClipboard) {
        await navigator.clipboard.writeText(remote);
        if (version === epoch && clipboardSync.value) {
          lastClipboard = remote;
          clipboardText.value = remote;
        }
      }
    }
  } catch (e) {
    if (version === epoch) {
      clipboardSync.value = false;
      clipboardNotice.value =
        e instanceof Error ? e.message : "ブラウザのクリップボード権限を確認してください";
    }
  } finally {
    clipBusy = false;
  }
}
async function toggleClipboardSync() {
  if (clipboardSync.value) {
    clipboardSync.value = false;cancelRichTransfer();
    return;
  }
  if(richBusy.value||clipBusy)return;
  if(richSyncMode.value&&(!richClipboard.value||!richPipeReady.value||!richClient))richSyncMode.value=false;
  try {
    if(richSyncMode.value){const version=epoch,owner=richClient,request=++richSeq;if(!owner)throw Error("画像・書式の転送経路がありません");const local=await readRichClipboard();if(!richActive(owner,version,request))return;lastRichLocal=await richHash(local);lastRichRemote="";if(!richActive(owner,version,request))return;clipboardSync.value=true;await syncRichClipboard();return;}
    lastClipboard = await navigator.clipboard.readText();
    if (!clipboardGranted.value) return;
    clipboardSync.value = true;
    await syncClipboard();
  } catch {
    clipboardNotice.value =
      "ブラウザのクリップボード読み取りを許可してください。HTTPSまたはlocalhostが必要です。";
  }
}
const codecLabel=(codec:DesktopNativeCodec|undefined)=>codec==="hevc"?"HEVC":codec==="av1"?"AV1":codec==="h264-444"?"H.264 4:4:4":"H.264";
async function requestVideo() {
  const version=epoch,request=++mediaRequestSeq;
  const settings={audio:requestAudio.value&&(mediaTransport.value!=="native"||nativeAudio.value),transport:mediaTransport.value,...(mediaTransport.value==="native"&&nativeCodecs.value?{codec:nativeCodec.value}:{}),adaptive:adaptive.value,maxBitrateKbps:Number(mediaBitrate.value),
    ...(mediaTransport.value==="native"&&nativeDatagrams.value?{udp:nativeUdp.value}:{}),...(mediaTransport.value==="native"&&nativeMaxFps.value===60?{fps:Number(nativeFps.value)}:{})};
  if(settings.transport==="native"&&settings.audio){
    let supported=false;try{supported=await DesktopNativeAudioReceiver.supported();}catch{}
    if(dead||version!==epoch||request!==mediaRequestSeq)return;
    if(!supported){settings.audio=false;error.value="このブラウザで音声を再生できないため、映像だけを共有します";}
  }
  if(!dead&&version===epoch&&request===mediaRequestSeq)send({type:"media",enabled:true,settings});
}
function stopVideo() {
  mediaRequestSeq++;soundRequestSeq++;nativeAudioState.value="";mediaAudio.value=false;
  send({ type: "media", enabled: false });
  receiver?.stop();
  receiver = undefined;
  mediaState.value = "images";nativeUdpActive.value=false;
  sound.value = false;
  restoreImage();
  releaseInputs();
}
async function toggleSound() {
  const owner=receiver;if(!owner)return;const enabled=!sound.value,request=++soundRequestSeq,version=epoch;
  const current=()=>!dead&&version===epoch&&receiver===owner&&request===soundRequestSeq;
  try{await owner.sound(enabled);if(current()&&(!enabled||mediaAudio.value))sound.value=enabled;}
  catch{if(current())error.value="音声を再生できませんでした。音声の許可設定を確認してください";}
}
const clipboardTimer = setInterval(() => void syncClipboard(), 1000);
const position = ref({ x: 48, y: 56 });
const windowElement = ref<HTMLElement>();
const restoredSize = ref<{ width: number; height: number }>();
async function toggleMaximize() {
  if (!maximized.value && windowElement.value) {
    const bounds = windowElement.value.getBoundingClientRect();
    restoredSize.value = { width: bounds.width, height: bounds.height };
  }
  drag = undefined;
  maximized.value = !maximized.value;
  if (maximized.value) infoOpen.value = false;
  await nextTick();
  (control.value ? canvas.value : windowElement.value)?.focus({preventScroll:true});
}
function maximizeFromTitle(event: MouseEvent) {
  if (!(event.target as HTMLElement).closest("button")) toggleMaximize();
}
const windowStyle = computed(() =>
  maximized.value
    ? { inset: "0", width: "auto", height: "auto" }
    : {
        left: `${position.value.x}px`,
        top: `${position.value.y}px`,
        ...(restoredSize.value
          ? { width: `${restoredSize.value.width}px`, height: `${restoredSize.value.height}px` }
          : {}),
      },
);
const cursorCanvas=ref<HTMLCanvasElement>(), separateCursor=ref(false);
let cursorRenderer:DesktopCursorRenderer|undefined;
let imageSocket:WebSocket|undefined;
let videoSocket: WebSocket | undefined, videoExpected = false, videoReady = false, nativeSupported = false;
let ws: WebSocket | undefined,
  dead = false,
  epoch = 0,
  seq = 0,
  lastDrawn = 0,
  decoding = false;
let chain = new DesktopFrameChain();
let startupRetries = 0;
const inputs = new Map<number, number>();
const inputSender = new DesktopInputSender(sendInput);
const escapePress = new DesktopEscape(), mouseButtons = new DesktopButtons(), modifiers = new DesktopModifiers();
let drag: { x: number; y: number; left: number; top: number } | undefined;
function send(value: unknown) {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 16384)
    ws.send(JSON.stringify(value));
}
function releaseInputs() {
  inputSender.clear();
  mouseButtons.reset(); modifiers.reset();
  send({type:"release"});
  cursorRenderer?.clearPrediction();
}
function relinquish() {
  inputSender.clear();
  escapePress.reset(); mouseButtons.reset(); modifiers.reset();
  if (dismissPending) dismissInFlight.value = false;
  dismissPending = false;
  if (clipboardGranted.value) {
    send({ type: "clipboard_grant", enabled: false });
    clearClipboard();
  }
  if (control.value) send({ type: "control", enabled: false });
  control.value = false;
  cursorRenderer?.clearPrediction();
  inputs.clear();
}
function stop() {
  epoch++;
  cursorRenderer?.stop();cursorRenderer=undefined;separateCursor.value=false;
  if (clipboardGranted.value) send({ type: "clipboard_grant", enabled: false });
  clearClipboard();
  receiver?.stop();
  receiver = undefined;
  mediaState.value = "images";
  mediaAudio.value = false;
  sound.value = false;
  nativeStats.value=null;
  virtualActive.value=false;nativeVideo.value=false;nativeCodecs.value=false;nativeCodecCandidates.value=[];nativeActualCodec.value=nativeRequestedCodec.value=undefined;nativeCodecFallback.value="";nativeAdaptive.value=false;nativeMaxFps.value=30;nativeDatagrams.value=nativeUdpActive.value=false;nativeAudio.value=false;nativeAudioState.value="";
  allowMedia.value = false;
  allowClipboard.value = false;
  relinquish();
  resetRichClipboard();resetFiles();monitorLayout.value=undefined;
  imageSocket?.close(1000,"desktop stopped");imageSocket=undefined;
  videoSocket?.close(1000, "desktop stopped"); videoSocket=undefined; videoExpected=videoReady=nativeSupported=false;
  ws?.close(1000, "desktop stopped");
  ws = undefined;
  ready.value = connected.value = false;
  if (secureDesktop.value) {
    text.value = '';
    sourceCanvas.width = sourceCanvas.height = 0;
    chain = new DesktopFrameChain();
    inputs.clear();
  }
  secureDesktop.value = false;
  protectedMode.value=undefined;
  lockScreenCover.value = false;
  imeKeys.value = false;
  extendedInput.value = false;
  dismissInFlight.value = false;
  dismissPending = false;
  agentActive.value = false;
  agentTicket.value = "";
  agentExpires.value = 0;
  info.value = null;
  canvas.value?.getContext("2d")?.clearRect(0, 0, canvas.value.width, canvas.value.height);
}
function close() {
  maximumDisplay.value = false;
  clearTimeout(displayTimer);
  stop();
  emit("close");
}
const settingNotice = ref("");
const activeSettings = ref<ConnectionSettings | null>(null);
function requestedSettings(): ConnectionSettings {
  return normalizeSettings({
    width: Number(width.value),
    fps: Number(fps.value),
    quality: Number(quality.value),
    deltas: deltas.value,
    adaptive: adaptive.value,
    image: { colorMode: colorMode.value, showCursor: showCursor.value },
  });
}
function preset(event: Event) {
  const name = (event.target as HTMLSelectElement).value;
  if (!Object.hasOwn(presets, name)) return;
  const value = presets[name as keyof typeof presets];
  width.value = value.width;
  fps.value = value.fps;
  quality.value = value.quality;
  deltas.value = value.deltas;
  adaptive.value = value.adaptive;
  colorMode.value = value.image.colorMode;
  showCursor.value = value.image.showCursor;
  (event.target as HTMLSelectElement).value = "";
}
function connect(automatic = false) {
  if (automatic !== true) startupRetries = 0;
  let options: ConnectionSettings;
  try {
    options = {
      ...requestedSettings(),
      ...(maximumDisplay.value && requestedDisplay ? { display: requestedDisplay } : {}),
    };
  } catch {
    settingNotice.value = "設定値を確認してください（幅320～1920、fps 1～30、JPEG品質20～90）。";
    return;
  }
  settingNotice.value = saveSettings(props.machineId, options)
    ? ""
    : "このブラウザに設定を保存できませんでした。今回の接続には反映します。";
  activeSettings.value = options;
  stop();
  error.value = "";
  status.value = "接続中";
  title.value = "";
  synthetic.value = false;
  rendered.value = lastDrawn = 0;
  seq = 0;
  chain = new DesktopFrameChain();
  sourceCanvas = document.createElement("canvas");
  qualityController = new ImageQualityController(options);
  clipSeq = 0;
  videoFrames.value = 0;
  decoding = false;
  const version = epoch,
    url = new URL("/desktop-share", location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  let monitorChanged=false;
  const socket = new WebSocket(url, [DESKTOP_PROTECTED_PROTOCOL,DESKTOP_VIRTUAL_DISPLAY_PROTOCOL,DESKTOP_MONITORS_PROTOCOL,DESKTOP_FILES_PROTOCOL, DESKTOP_IME_PROTOCOL, DESKTOP_INPUT_PROTOCOL,...(typeof ClipboardItem!=="undefined"&&typeof navigator.clipboard?.read==="function"&&typeof navigator.clipboard?.write==="function"?[DESKTOP_RICH_CLIPBOARD_PROTOCOL]:[]), DESKTOP_CURSOR_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL, ...(typeof VideoDecoder!=="undefined"?[DESKTOP_NATIVE_CODEC_PROTOCOL,DESKTOP_NATIVE_ADAPTIVE_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,DESKTOP_VIDEO_LANE_PROTOCOL,DESKTOP_NATIVE_RATE_PROTOCOL,DESKTOP_DATAGRAM_PROTOCOL,...(typeof AudioDecoder!=="undefined"&&typeof AudioContext!=="undefined"?[DESKTOP_AUDIO_PROTOCOL]:[])]:[])]);
  ws = socket;
  socket.binaryType = "arraybuffer";
  socket.onopen = () => {
    if (version === epoch)
      send({
        type: "start",
        machineId: props.machineId,
        options: {
            ...(elevatedScreen.value?{elevatedDesktop:true}:virtualScreen.value?{virtualDisplay:true}:monitorDevice.value?{monitorDevice:monitorDevice.value}:{}), ...options, features: true },
      });
  };
  socket.onmessage = async (event) => {
    if (dead || version !== epoch) return;
    try {
      if (event.data instanceof ArrayBuffer) {
        if(isDesktopAudio(new Uint8Array(event.data))){receiver?.audioChunk(new Uint8Array(event.data));return;}
        if(isDesktopCursor(new Uint8Array(event.data))){if(separateCursor.value&&!secureDesktop.value)cursorRenderer?.accept(decodeDesktopCursor(new Uint8Array(event.data)));return;}
        if (isDesktopMediaChunk(new Uint8Array(event.data))) {
          receiver?.chunk(new Uint8Array(event.data));
          return;
        }
        if (!ready.value || lockScreenCover.value || decoding) throw new Error("画像の順序が不正です");
        decoding = true;
        const frame = decodeDesktopFrame(new Uint8Array(event.data)),
          start = performance.now();
        if (frame.info.seq <= lastDrawn) throw new Error("画像の順序が不正です");
        const el = canvas.value;
        if (!el) throw new Error("描画先がありません");
        if (
          !(await renderDesktopUpdate(sourceCanvas, frame, chain, () => !dead && version === epoch))
        )
          return;
        if (!receiver?.active) {
          if (el.width !== sourceCanvas.width || el.height !== sourceCanvas.height) {
            el.width = sourceCanvas.width;
            el.height = sourceCanvas.height;
          }
          el.getContext("2d")!.drawImage(sourceCanvas, 0, 0);
        }
        info.value = frame.info;
        lastDrawn = frame.info.seq;
        rendered.value++;
        cursorRenderer?.paint();
        drawMs.value = performance.now() - start;
        decoding = false;
        send({ type: "ack", seq: frame.info.seq });
      } else {
        const m = JSON.parse(String(event.data));
        if(m.type==="monitor_topology_changed"){monitorChanged=true;maximumDisplay.value=false;requestedDisplay=undefined;monitorDevice.value=undefined;ready.value=false;control.value=false;error.value="接続先のモニター構成が変更されました。接続し直してください。";releaseInputs();}
        else if(m.type==="files_ticket"){
          if(fileSocket||typeof m.ticket!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(m.ticket))throw Error("Invalid file attachment");
          const pipe=fileSocket=new WebSocket(url,DESKTOP_FILES_PROTOCOL);const client=fileClient.value=new DesktopFileClient(value=>{if(pipe.readyState!==WebSocket.OPEN||pipe.bufferedAmount>262144)return false;pipe.send(JSON.stringify(value));return true;},()=>pipe.close());
          pipe.onopen=()=>{if(version===epoch)pipe.send(JSON.stringify({type:"video_viewer",ticket:m.ticket}));};
          pipe.onmessage=event=>{if(version!==epoch||fileSocket!==pipe)return;try{if(typeof event.data!=="string"||event.data.length>100000)throw Error("Invalid file result");client.receive(JSON.parse(event.data));}catch{client.stop();pipe.close();}};
          pipe.onerror=()=>pipe.close();pipe.onclose=()=>{if(version===epoch&&fileSocket===pipe)resetFiles();};
        }else if(m.type==="files_ready"){filesReady.value=true;}
        else if(m.type==="files_closed"){resetFiles();}
        else if(m.type==="clipboard_rich_ticket"){
          if(richSocket||typeof m.ticket!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(m.ticket))throw Error("Invalid clipboard attachment");
          const pipe=richSocket=new WebSocket(url,DESKTOP_RICH_CLIPBOARD_PROTOCOL);
          const client=richClient=new DesktopRichClipboardClient(value=>{if(pipe.readyState!==WebSocket.OPEN||pipe.bufferedAmount>65536)return false;pipe.send(JSON.stringify(value));return true;},()=>!dead&&version===epoch&&clipboardGranted.value&&richClipboard.value&&richPipeReady.value);
          pipe.onopen=()=>{if(version===epoch)pipe.send(JSON.stringify({type:"video_viewer",ticket:m.ticket}));};
          pipe.onmessage=event=>{if(version!==epoch||richSocket!==pipe)return;try{if(typeof event.data!=="string"||event.data.length>32768)throw Error("Invalid clipboard result");client.receive(JSON.parse(event.data));}catch{client.stop();pipe.close();}};
          pipe.onerror=()=>pipe.close();pipe.onclose=()=>{if(version!==epoch||richSocket!==pipe)return;resetRichClipboard();clipboardNotice.value="画像・書式の接続が終了しました。テキスト共有は継続できます";};
        }else if(m.type==="clipboard_rich_ready"){richPipeReady.value=true;}
        else if(m.type==="clipboard_rich_closed"){resetRichClipboard();clipboardNotice.value="画像・書式の接続が終了しました。テキスト共有は継続できます";}
        else if(m.type==="image_ticket"){

          if(imageSocket||typeof m.ticket!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(m.ticket))throw Error("Invalid image attachment");
          const image=imageSocket=new WebSocket(url,DESKTOP_IMAGE_LANE_PROTOCOL);image.binaryType="arraybuffer";
          image.onopen=()=>{if(version===epoch)image.send(JSON.stringify({type:"video_viewer",ticket:m.ticket}));};
          image.onmessage=e=>{if(version===epoch&&imageSocket===image)void socket.onmessage?.call(socket,e);};
          image.onerror=()=>image.close();
        }else if(m.type==="image_closed"){imageSocket?.close();imageSocket=undefined;}
        else if (m.type === "video_ticket") {
          if (videoSocket || typeof m.ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(m.ticket)) throw Error("Invalid video attachment");
          videoExpected=true; videoReady=false; nativeVideo.value=false;
          const video = videoSocket = new WebSocket(url, DESKTOP_VIDEO_LANE_PROTOCOL);
          video.binaryType="arraybuffer";
          video.onopen=()=>{if(version===epoch)video.send(JSON.stringify({type:"video_viewer",ticket:m.ticket}));};
          video.onmessage=event=>{if(version===epoch&&videoSocket===video)void socket.onmessage?.call(socket,event);};
          video.onerror=()=>video.close();
          video.onclose=()=>{
            if(version!==epoch||videoSocket!==video)return;
            videoReady=false;nativeVideo.value=false;
            // A sends an id-bound images status for an active native stream.
          };
        } else if (m.type === "video_ready") {
          videoReady=true; nativeVideo.value=nativeSupported;
        } else if (m.type === "video_closed") {
          videoReady=false; nativeVideo.value=false;
        } else if (m.type === "ready") {
          const r = DesktopReady.parse(m);
          secureDesktop.value = r.secureDesktop === true;
          protectedMode.value=r.protectedDesktop;
          lockScreenCover.value = r.lockScreenCover === true;
          imeKeys.value = r.imeKeys === true;
          extendedInput.value = r.extendedInput === true;
          if (secureDesktop.value) text.value = "";
          title.value = protectedMode.value ? (protectedMode.value==="elevated-uac"?"WindowsのUAC確認画面":"Windowsの管理者画面") : secureDesktop.value ? "Windowsのロック解除" : r.title;
          allowed.value = r.allowInput;
          ready.value = connected.value = true;
          if(r.imageLane)send({type:"image_ready"});
          synthetic.value = r.backend === "synthetic";
          allowMedia.value = r.allowMedia === true;
          separateCursor.value=r.cursor===true&&!secureDesktop.value;
          if(separateCursor.value)cursorRenderer=new DesktopCursorRenderer(()=>canvas.value,()=>cursorCanvas.value,r.width,r.height,()=>control.value);
          nativeSupported=r.nativeVideo===true;
          nativeCodecs.value=r.nativeCodecs===true;nativeCodecCandidates.value=r.nativeCodecCandidates??[];nativeAdaptive.value=r.nativeAdaptive===true;nativeMaxFps.value=r.nativeMaxFps===60?60:30;nativeDatagrams.value=r.nativeDatagrams===true;nativeAudio.value=r.nativeAudio===true;richClipboard.value=r.richClipboard===true;
          nativeVideo.value=nativeSupported&&(!videoExpected||videoReady);
          if(nativeSupported&&!allowMedia.value)mediaTransport.value="native";
          else if(!nativeSupported&&mediaTransport.value==="native")mediaTransport.value="auto";
          virtualActive.value=r.virtualDisplay===true;monitorLayout.value=r.monitorLayout;if(r.secureDesktop)monitorDevice.value=undefined;else if(r.monitorLayout)monitorDevice.value=r.monitorLayout.selected;
          filesCap.value=r.files===true;
          allowClipboard.value = r.allowClipboard === true;
          dynamicQuality.value = r.dynamicQuality === true;
          displayModes.value = r.display?.modes ?? [];
          if (!secureDesktop.value && maximumDisplay.value && !r.display) {
            maximumDisplay.value = false;
            error.value = "Bでディスプレイ解像度の変更が許可されていません";
          }
          if (!secureDesktop.value) scheduleDisplay();
          status.value = protectedMode.value ? "管理者画面・閲覧中" : secureDesktop.value ? "ロック画面・閲覧中" : "閲覧中";
        } else if ((m.type === "session_unlocked" && secureDesktop.value) || (m.type === "session_locked" && !secureDesktop.value) || (m.type === "lock_screen_changed" && (secureDesktop.value || !ready.value))) {
          const exhausted = ++startupRetries > 3;
          maximumDisplay.value = false;
          requestedDisplay = undefined;
          text.value = "";
          stop();
          if (exhausted) {
            status.value = "停止";
            error.value = "共有元のロック画面が安定しないため再接続を停止しました。少し待ってから接続し直してください。";
            return;
          }
          status.value = m.type === "session_locked" || m.type === "lock_screen_changed" ? "ロック画面に再接続中" : "解除しました。通常画面に再接続中";
          const reconnectEpoch = epoch;
          setTimeout(() => { if (!dead && epoch === reconnectEpoch) connect(true); }, 750);
        } else if (m.type === "media_status") {
          const state = DesktopMediaStatus.parse(m);
          if(state.state==="images" && receiver && receiver.id!==state.id)return;
          mediaState.value = state.state;
          if(state.state==="negotiating")nativeActualCodec.value=undefined;if(state.codecRequested)nativeRequestedCodec.value=state.codecRequested;if(state.codec)nativeActualCodec.value=state.codec;nativeCodecFallback.value=state.codecFallback??"";
          mediaAudio.value = state.audio||(state.nativeAudio===true&&nativeAudioState.value==="running");nativeUdpActive.value=state.datagrams===true;
          if (state.state === "images") {
            if(mediaTransport.value==="native"&&state.reason==="unavailable")error.value="GPU動画を利用できないため画像配信に戻しました";
            else if(mediaTransport.value==="native"&&state.reason==="congested")error.value="動画の描画待ちが続いたため画像配信に戻しました";
            receiver?.stop();
            receiver = undefined;nativeAudioState.value="";
            sound.value = false;
            restoreImage();releaseInputs();
          } else if (state.state === "negotiating" && receiver?.id !== state.id) {
            receiver?.stop();
            nativeStats.value=null;nativeAudioState.value="";mediaAudio.value=false;sound.value=false;
            videoStatsAt=videoStatsCount=0;videoFps.value=0;
            receiver = new DesktopMediaReceiver(
              state.id,
              send,
              (video, count, videoWidth, videoHeight) => {
                if (dead || version !== epoch || !canvas.value) return;
                if (
                  activeSettings.value?.display && !(mediaState.value==="native"&&nativeAdaptive.value) &&
                  (videoWidth !== activeSettings.value.display.width || videoHeight !== activeSettings.value.display.height)
                ) {
                  stopVideo();
                  error.value = "動画が等倍の画素数を維持できないため画像配信に戻しました";
                  return;
                }
                const el = canvas.value;
                el.width = videoWidth;
                el.height = videoHeight;
                el.getContext("2d")!.drawImage(video, 0, 0, el.width, el.height);
                videoFrames.value = count;
                cursorRenderer?.paint();
                const now=performance.now();
                if(!videoStatsAt){videoStatsAt=now;videoStatsCount=count;}
                else if(now-videoStatsAt>=1000){videoFps.value=(count-videoStatsCount)*1000/(now-videoStatsAt);videoStatsAt=now;videoStatsCount=count;}
              },
              (value) => {
                mediaState.value = value;
                if (value === "images") {
                  if(mediaTransport.value==="native")error.value="GPU動画を利用できないため画像配信に戻しました";
                  restoreImage();
                  releaseInputs();
                }
              },
              state.iceServers as RTCIceServer[] | undefined,state.datagrams===true,state.nativeAudio===true,
              value=>{if(dead||version!==epoch||receiver?.id!==state.id)return;if(!(value==="stopped"&&nativeAudioState.value==="unavailable"))nativeAudioState.value=value;mediaAudio.value=value==="running";if(!mediaAudio.value){soundRequestSeq++;sound.value=false;}},state.nativeCodecs===true,
            );
          }
        } else if (m.type === "rtc_signal") {
          const signal = DesktopMediaSignal.parse(m);
          if (receiver?.id === signal.id)
            await receiver.signal(signal.signal as Parameters<DesktopMediaReceiver["signal"]>[0]);
        } else if (m.type === "media_stream") {
          const stream = DesktopMediaStream.parse(m);
          if (receiver?.id === stream.id) {if(isDesktopNativeStream(stream))receiver.nativeStream(stream.generation,stream.codec,stream.width,stream.height,stream.window,stream.datagrams===true,stream.baseSeq);else receiver.stream(stream.generation, stream.mime);}
        } else if(m.type==="native_profile_pending"){const pending=DesktopNativeProfilePending.parse(m);if(receiver?.id===pending.id)receiver.profilePending(pending);
        } else if(m.type==="native_audio_status"){const audio=DesktopNativeAudioStatus.parse(m);if(receiver?.id===audio.id)receiver.audioStatus(audio);
        } else if(m.type==="native_frame_notice"){const notice=DesktopNativeFrameNotice.parse(m);if(receiver?.id===notice.id)receiver.notice(notice);
        } else if(m.type==="native_video_stats") {
          const stats=DesktopNativeVideoStats.parse(m);if(receiver?.id===stats.id)nativeStats.value=stats;
        } else if (m.type === "media_unavailable")
          error.value = "Bのメディア補助画面と共有許可を確認してください";
        else if (m.type === "clipboard_state") {
          clipboardGranted.value = m.enabled === true;
          if (!clipboardGranted.value) clearClipboard();
        } else if (m.type === "clipboard_result") {
          const result = DesktopClipboardResult.parse(m),
            wait = clipWaits.get(result.id);
          if (wait) {
            clipWaits.delete(result.id);
            clearTimeout(wait.timer);
            if (result.ok) wait.resolve(result.text);
            else wait.reject(new Error("共有元のクリップボード操作が拒否されました"));
          }
        } else if (m.type === "agent_ticket") {
          if (typeof m.ticket === "string" && /^[A-Za-z0-9_-]{43}$/.test(m.ticket))
            agentTicket.value = m.ticket;
        } else if (m.type === "agent_state") {
          inputSender.clear();
          agentActive.value = m.active === true;
          agentExpires.value = typeof m.expiresAt === "number" ? m.expiresAt : 0;
          if (agentActive.value || !agentExpires.value) agentTicket.value = "";
          control.value = false;
          cursorRenderer?.clearPrediction();
          status.value = agentActive.value ? "エージェント操作中" : "閲覧中";
        } else if (m.type === "control") {
          inputSender.clear();
          escapePress.reset(); mouseButtons.reset(); modifiers.reset();
          control.value = m.enabled === true && allowed.value;
          if(!control.value)cursorRenderer?.clearPrediction();
          status.value = agentActive.value
            ? "エージェント操作中"
            : control.value
              ? "操作中"
              : "閲覧中";
          if (control.value) canvas.value?.focus();
          if (control.value && lockScreenCover.value && dismissPending) {
            dismissPending = false;
            send({ type: "dismiss_lock_screen" });
          }
        } else if (
          m.type === "stats" &&
          [m.fps, m.mbps, m.ackP95Ms].every((v) => typeof v === "number" && Number.isFinite(v))
        ) {
          stats.value = m;
          if (adaptive.value && dynamicQuality.value) {
            const policy = qualityController?.sample(
              m.ackP95Ms,
              drawMs.value,
              socket.bufferedAmount,
            );
            if (policy) send(policy);
          }
        } else if (m.type === "input_ack") {
          const at = inputs.get(m.seq);
          if (at !== undefined) {
            inputAckMs.value = performance.now() - at;
            inputs.delete(m.seq);
          }
        } else if (m.type === "error") {
          error.value = typeof m.message === "string" ? m.message : "共有を開始できません";
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "表示に失敗しました";
      stop();
      status.value = "停止";
    }
  };
  socket.onclose = () => {
    if (version !== epoch) return;
    const wasReady = ready.value;
    stop();
    status.value = "終了";
    if(monitorChanged){status.value="停止";return;}
    if(elevatedScreen.value){status.value="停止";if(!error.value)error.value=wasReady?"管理者画面の共有が終了しました。接続し直し、操作を許可し直してください。":"管理者画面を開始できません。接続先の許可と専用保護サービスの導入・更新を確認してください。";return;}
    if(virtualScreen.value&&!wasReady){status.value="停止";error.value=(error.value?error.value+" ":"")+"仮想画面を作成できません。接続先の許可設定、署名済みドライバーと保護サービスの導入・更新を確認してください。";return;}
    if (!wasReady && activeSettings.value?.display) {
      maximumDisplay.value = false;
      requestedDisplay = undefined;
      error.value =
        "Bの解像度を変更できませんでした。共有元で対応モードと復元状態を確認してください。";
    }
    if (!wasReady && !error.value)
      error.value = "共有元が終了しました。Bの補助プログラム設定を確認してください。";
  };
  socket.onerror = () => {
    if (version === epoch) error.value = "共有用の接続を確立できませんでした";
  };
}
function restoreImage() {
  const el = canvas.value;
  if (!el || !sourceCanvas.width || !sourceCanvas.height) return;
  el.width = sourceCanvas.width;
  el.height = sourceCanvas.height;
  el.getContext("2d")!.drawImage(sourceCanvas, 0, 0);
  cursorRenderer?.paint();
}
function input(value: unknown) {
  const parsed = RemoteDesktopInput.safeParse(value);
  if (!parsed.success || !canInput()) return;
  inputSender.submit(parsed.data);
}
function canInput() {
  return !lockScreenCover.value && (!receiver || receiver.active) && control.value && ready.value && lastDrawn > 0;
}
function sendInput(value: RemoteDesktopInput) {
  // A scheduled move must still belong to the current share and permission.
  if (!canInput()) return;
  const id = ++seq;
  inputs.set(id, performance.now());
  if (inputs.size > 64) inputs.delete(inputs.keys().next().value!);
  send({ type: "input", seq: id, frameSeq: lastDrawn, input: value });
}
function pointer(e: PointerEvent, event: "move" | "down" | "up") {
  escapePress.reset();
  if (!control.value || !canvas.value || !info.value) return;
  const r = canvas.value.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if ((event === "down" || (event === "move" && e.buttons === 0)) && (x < 0 || x > 1 || y < 0 || y > 1)) return;
  if (event === "down") { canvas.value.focus(); canvas.value.setPointerCapture(e.pointerId); }
  const position = { x: Math.max(0, Math.min(1,x)), y: Math.max(0, Math.min(1,y)) };
  const onMonitor=!monitorLayout.value||!!desktopMonitorAt(monitorLayout.value,position.x,position.y);
  if(onMonitor)cursorRenderer?.local(position.x,position.y);
  for (const change of mouseButtons.update(e.buttons)) {
    if(!onMonitor&&change.event==="down")continue;
    if (change.button > 2 && !extendedInput.value) {
      error.value = "接続先を更新すると、マウスの戻る・進むを利用できます";
      continue;
    }
    input({kind:"pointer",...position,...change});
  }
  if (event === "move"&&onMonitor) input({kind:"pointer",...position,event:"move",button:0});
  if (event === "up" && canvas.value.hasPointerCapture(e.pointerId)) canvas.value.releasePointerCapture(e.pointerId);
}
function submitText() {
  input({kind:"text",text:text.value});
  // Clearing the draft disables the focused submit button; keep focus in the viewer.
  canvas.value?.focus({preventScroll:true});
  text.value = "";
}
function wheel(e: WheelEvent) {
  if(monitorLayout.value&&canvas.value){const rect=canvas.value.getBoundingClientRect();if(!rect.width||!rect.height||!desktopMonitorAt(monitorLayout.value,(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height))return;}
  escapePress.reset(); input({kind:"wheel",delta:Math.max(-1200,Math.min(1200,Math.round(-e.deltaY)))});
}
async function windowFocusOut(e: FocusEvent) {
  escapePress.reset();
  if (e.target === canvas.value) return; // Canvas has its own blur handler.
  mouseButtons.reset(); modifiers.reset();
  releaseInputs();
  // During blur, activeElement may temporarily be body before relatedTarget gains focus.
  if (e.relatedTarget instanceof Node) {
    if (!windowElement.value?.contains(e.relatedTarget)) relinquish();
    return;
  }
  // Maximizing can move the focused toolbar DOM before restoring canvas focus.
  await nextTick();
  if (!windowElement.value?.contains(document.activeElement)) relinquish();
}
function canvasBlur(e: FocusEvent) {
  escapePress.reset(); mouseButtons.reset(); modifiers.reset();
  if (e.relatedTarget instanceof Element && e.relatedTarget.closest("[data-remote-desktop]")) releaseInputs();
  else relinquish();
}
async function leaveDesktop() {
  relinquish();
  if (agentExpires.value) send({type:"agent_grant",enabled:false});
  if (maximized.value) await toggleMaximize();
  await nextTick();
  const active = document.activeElement;
  if (active instanceof HTMLElement && windowElement.value?.contains(active)) active.blur();
}
function dismissLockScreen() {
  if (!ready.value || !allowed.value || !lockScreenCover.value || dismissInFlight.value) return;
  startupRetries = 0;
  // Disabling the focused button must not blur outside and cancel its pending request.
  windowElement.value?.focus({preventScroll:true});
  dismissInFlight.value = true;
  if (control.value) send({ type: "dismiss_lock_screen" });
  else {
    dismissPending = true;
    send({ type: "control", enabled: true });
  }
}
function toggleControl() {
  startupRetries = 0;
  send({ type: "control", enabled: !control.value });
}
function sendIme(code: ImeKeyCode) {
  if (!imeKeys.value || !control.value || !ready.value || lockScreenCover.value) return;
  // Dedicated IME keys can have no physical keyup. Pair immediately so a later
  // press is never lost and focus changes cannot leave a remote key held down.
  input({ kind: "key", code, down: true });
  input({ kind: "key", code, down: false });
}
function desktopKey(e: KeyboardEvent, down: boolean) {
  if (!windowElement.value?.contains(document.activeElement)) return;
  if (e.target instanceof Element && e.target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) {
    escapePress.reset(); return;
  }
  const code = e.code || e.key;
  const modified = e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
  const leave = escapePress.key(code,down,e.repeat,modified,performance.now());
  if (code === "Escape" && !modified) {
    e.preventDefault(); e.stopPropagation();
    if (leave) { void leaveDesktop(); return; }
  }
  if (!control.value || !ready.value || lockScreenCover.value) return;
  // Every received key belongs to the remote surface, including Tab, modifiers,
  // shortcuts and composition-time physical keys; local form fields are above.
  e.preventDefault(); e.stopPropagation();
  for (const change of modifiers.update(e,down)) input(change);
  const ime = imeKeyCode(e);
  if (ime) { escapePress.reset(); if (down && !e.repeat) sendIme(ime); return; }
  const normalized = e.key === "ZenkakuHankaku" ? "ZenkakuHankaku" : code;
  const value = {kind:"key" as const,code:normalized,down};
  const parsed = RemoteDesktopInput.safeParse(value);
  if (!parsed.success) return;
  if (isExtendedDesktopInput(parsed.data) && !extendedInput.value) {
    error.value = "接続先を更新すると、この追加キーを利用できます"; return;
  }
  input(parsed.data);
}
function grip(e: PointerEvent) {
  if (props.embedded || maximized.value || (e.target as HTMLElement).closest("button")) return;
  drag = { x: e.clientX, y: e.clientY, left: position.value.x, top: position.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (drag)
    position.value = {
      x: Math.max(0, Math.min(innerWidth - 160, drag.left + e.clientX - drag.x)),
      y: Math.max(0, Math.min(innerHeight - 48, drag.top + e.clientY - drag.y)),
    };
}
function visibility() {
  if (document.hidden) relinquish();
}
const heartbeat = setInterval(() => send({ type: "heartbeat" }), 2000);
onMounted(() => {
  if (screenElement.value && typeof ResizeObserver !== "undefined") {
    displayObserver = new ResizeObserver(() => {
      if (screenElement.value) screenSize.value = { width: screenElement.value.clientWidth, height: screenElement.value.clientHeight };
      cursorRenderer?.paint();
    });
    displayObserver.observe(screenElement.value);
  }
  connect();
  window.addEventListener("blur", relinquish);
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  clearTimeout(displayTimer);
  displayObserver?.disconnect();
  clearInterval(clipboardTimer);
  dead = true;
  clearInterval(heartbeat);
  stop();
  window.removeEventListener("blur", relinquish);
  document.removeEventListener("visibilitychange", visibility);
});
</script>

<template>
  <Teleport to="body" :disabled="embedded && !maximized">
    <section
      ref="windowElement"
      class="desktop-window"
      :class="{ maximized, 'soda-viewport-maximized': maximized, embedded: embedded && !maximized }"
      :style="embedded && !maximized ? undefined : windowStyle"
      role="dialog"
      aria-label="リモートデスクトップ"
      @dragover.prevent
      @drop.prevent.stop="dropFiles"
      data-remote-desktop
      tabindex="-1"
      @keydown.capture="desktopKey($event, true)"
      @keyup.capture="desktopKey($event, false)"
      @focusout="windowFocusOut"
      @keydown.stop
      @keyup.stop
    >
      <header
        :class="{ 'toolbar-collapsed': toolbarCollapsed }"
        @dblclick="maximizeFromTitle"
        @pointerdown="grip"
        @pointermove="move"
        @pointerup="drag = undefined"
        @pointercancel="drag = undefined"
      >
        <div v-show="!toolbarCollapsed" class="viewer-toolbar-content">
        <strong>{{ label }} — デスクトップ</strong><span data-desktop-status>{{ status }}</span>
        <button
          :disabled="!ready || !allowed"
          @pointerdown.prevent
          @click="toggleControl"
        >
          {{ agentActive ? "操作を引き取る" : control ? "閲覧に戻る" : "操作する" }}
        </button>
        <button v-if="!lockScreenCover" :disabled="!ready || !control || !imeKeys"
          :title="imeKeys ? '接続先のIMEをONにする' : '接続先をIMEキー対応版に更新してください'"
          @pointerdown.prevent @click="sendIme('ImeOn')">IME ON</button>
        <button v-if="!lockScreenCover" :disabled="!ready || !control || !imeKeys"
          :title="imeKeys ? '接続先のIMEをOFFにする' : '接続先をIMEキー対応版に更新してください'"
          @pointerdown.prevent @click="sendIme('ImeOff')">IME OFF</button>
        <button :aria-expanded="infoOpen" @click="infoOpen = !infoOpen">情報・設定</button>
        <button data-desktop-maximize :aria-pressed="maximized" @click="toggleMaximize">
          {{ maximized ? "元に戻す" : "最大化" }}
        </button>
        <button @click="close">閉じる</button>
        </div>
        <button type="button" class="viewer-collapse-button" :aria-expanded="!toolbarCollapsed"
          :aria-label="toolbarCollapsed ? '操作バーを表示' : '操作バーを畳む'"
          :title="toolbarCollapsed ? '操作バーを表示' : '操作バーを畳む'"
          @dblclick.stop @click="toggleToolbar">{{ toolbarCollapsed ? '▾' : '▴' }}</button>
      </header>
      <p v-if="error" class="desktop-alert" role="alert">{{ error }}</p>
      <button v-if="!ready&&error&&!elevatedScreen" @click="resetMonitor">既定のモニターで接続し直す</button>
      <div v-show="infoOpen" class="desktop-controls">
      <p v-if="title" class="target">
        {{ title }} <b v-if="synthetic">模擬画面（実デスクトップではありません）</b>
      </p>
      <p v-if="secureDesktop && !protectedMode && !lockScreenCover" data-desktop-locked>
        Windows標準の認証画面で解除してください。認証情報は保存しません。解除後は閲覧専用に戻ります。
        <button :disabled="!control" @click="send({ type: 'sas' })">Ctrl+Alt+Del</button>
      </p>
      <p v-if="activeSettings && ready" data-desktop-applied>
        画像設定: <template v-if="activeSettings.display">{{activeSettings.display.width}}×{{activeSettings.display.height}}等倍（幅上限より優先）</template><template v-else>幅上限{{ activeSettings.width }}</template> / {{ activeSettings.fps }}fps上限 / JPEG
        {{ activeSettings.quality }} /
        {{
          { full: "フルカラー", rgb565: "約6.5万色", rgb332: "256色", gray16: "16階調グレー" }[
            activeSettings.image.colorMode
          ]
        }}
      </p>
      <label><input v-model="elevatedScreen" type="checkbox" @change="changeElevatedScreen" />管理者権限のアプリ・UAC画面を共有</label>
      <p v-if="protectedMode" data-desktop-protected>管理者画面を共有中です。画面・ロック状態が変わった場合は接続し直し、操作を許可し直してください。</p>
      <label><input v-model="virtualScreen" type="checkbox" @change="changeVirtualScreen" />一時的な仮想画面を使う</label>
      <p v-if="virtualActive" data-virtual-display-active>一時仮想画面を共有中です。共有終了時にこの画面を解放します。</p>
      <nav>

        <button :disabled="!ready" @click="send({ type: 'keyframe' })">再同期</button
        ><button @click="close">共有停止</button
        ><label
          ><input v-model="fit" type="checkbox" />画面に合わせる</label
        >
        <details>
          <summary>画質・計測</summary>
          <label
            >プリセット<select aria-label="接続プリセット" @change="preset">
              <option value="">選択…</option>
              <option value="low">低帯域</option>
              <option value="balanced">標準</option>
              <option value="quality">高画質</option>
            </select></label
          >
          <label
            >送信幅の上限<input
              v-model="width"
              aria-label="送信幅の上限"
              type="number"
              min="320"
              max="1920"
          /></label>
          <label
            >fps上限<input v-model="fps" aria-label="fps上限" type="number" min="1" max="30"
          /></label>
          <label
            >JPEG品質<input v-model="quality" aria-label="JPEG品質" type="number" min="20" max="90"
          /></label>
          <label
            >色<select v-model="colorMode" aria-label="送信する色">
              <option value="full">フルカラー</option>
              <option value="rgb565">約6.5万色</option>
              <option value="rgb332">256色</option>
              <option value="gray16">16階調グレー</option>
            </select></label
          >
          <label><input v-model="deltas" type="checkbox" />差分転送</label>
          <label><input v-model="adaptive" type="checkbox" />自動画質調整</label>
          <label><input v-model="showCursor" type="checkbox" />共有元のカーソルを表示</label>
          <p>
            幅は縦横比を保った上限、fpsは目標上限です。JPEG品質を下げると文字がにじむ場合があります。
          </p>
          <p>
            減色は細かな色の違いを失い、エージェントの画像認識にも影響します。差分PNGにも適用されます。
          </p>
          <p>
            適用すると共有へ再接続し、操作とエージェント許可を解除します。設定はこのブラウザでマシンごとに記憶します。
          </p>
          <p v-if="settingNotice" role="status">{{ settingNotice }}</p>
          <button @click="connect()">適用して再接続</button>
        </details>
      </nav>
      <details v-if="ready && (allowMedia || nativeVideo)" data-desktop-media>
        <summary>動画・音声</summary>
        <p v-if="mediaTransport==='native'">接続先のGPUで{{nativeCodecs?"選択した形式":"H.264"}}へ圧縮します。{{ nativeAudio ? "システム音声も要求できます。" : "この接続では音声は含みません。" }}利用できない場合は画像配信へ戻ります。</p>
        <p v-else>
          BのWindowsブラウザで /desktop-host
          を開き、対象と同じモニターを選んで共有を許可してください。
        </p>
        <label><input v-model="requestAudio" type="checkbox" :disabled="mediaTransport==='native'&&!nativeAudio" />システム音声を要求</label>
        <label
          >経路<select v-model="mediaTransport" aria-label="動画の経路">
            <option v-if="nativeVideo" value="native">{{ nativeAudio ? "GPU動画（システム音声対応）" : "GPU動画（音声なし）" }}</option>
            <option v-if="allowMedia" value="auto">WebRTC（接続できなければ中継）</option>
            <option v-if="allowMedia" value="relay">圧縮動画を中継</option>
          </select></label
        >
        <label
          >{{ mediaTransport==='native' ? '映像ビットレートの目標(kbps)' : '映像帯域の上限(kbps)' }}<input
            v-model="mediaBitrate"
            aria-label="動画帯域の上限"
            type="number"
            min="128"
            max="12000"
        /></label>
        <label v-if="mediaTransport==='native'&&nativeDatagrams"><input v-model="nativeUdp" type="checkbox" /> UDPを優先（利用できない場合はWSS）</label>
        <span v-if="nativeUdpActive" data-native-datagrams>UDP / {{codecLabel(nativeActualCodec)}}</span>
        <label v-if="mediaTransport==='native'&&nativeCodecs">動画コーデック<select v-model="nativeCodec" aria-label="動画コーデック"><option value="h264">H.264</option><option v-for="codec in (['hevc','av1','h264-444'] as const)" :key="codec" :value="codec" :disabled="!nativeCodecCandidates.includes(codec)">{{codecLabel(codec)}}{{nativeCodecCandidates.includes(codec)?'（GPUで試行）':'（接続先に候補なし）'}}</option></select></label>
        <p v-if="mediaTransport==='native'&&nativeCodecs&&nativeRequestedCodec&&mediaState!=='images'" data-native-codec>要求: {{codecLabel(nativeRequestedCodec)}} / 実際: {{nativeActualCodec?codecLabel(nativeActualCodec):'確認中'}}<span v-if="nativeCodecFallback"> — {{nativeCodecFallback==='decoder'?'このブラウザで復号できないため':'接続先で利用できないため'}}H.264へ復帰</span></p>
        <label v-if="mediaTransport==='native'&&nativeMaxFps===60">動画FPS上限<select v-model="nativeFps" aria-label="動画FPS上限"><option :value="30">30 fps</option><option :value="60">60 fps</option></select></label>
        <button @click="requestVideo">動画共有を依頼</button
        ><button @click="stopVideo">動画・音声を停止</button>
        <button v-if="mediaAudio" @click="toggleSound">
          {{ sound ? "音声を止める" : "音声を再生" }}
        </button>
        <p v-if="nativeAudioState" data-native-audio>システム音声: {{ nativeAudioState==='starting' ? '準備中' : nativeAudioState==='running' ? (sound ? '再生中' : 'ミュート') : nativeAudioState==='unavailable' ? '利用できません' : '停止' }}</p>
        <p data-media-state>
          {{
            {
              images: "画像配信",
              waiting: "Bの共有許可待ち",
              negotiating: "動画を接続中",
              rtc: "WebRTC動画",
              relay: "圧縮動画の中継",
              native: "GPU "+codecLabel(nativeActualCodec),
            }[mediaState] ?? mediaState
          }}
        </p>
        <p v-if="['native','rtc','relay'].includes(mediaState)" data-video-fps>動画 {{ videoFps.toFixed(1) }} fps（描画実測）</p>
        <p v-if="mediaState==='native' && nativeStats" data-native-video-stats>
          動画 {{nativeStats.width}}×{{nativeStats.height}} · 取得 {{nativeStats.captureMs.toFixed(1)}} / 色変換 {{nativeStats.conversionMs.toFixed(1)}} / 圧縮・待機 {{nativeStats.encodeMs.toFixed(1)}} ms<br />
          送信→描画ACK {{nativeStats.ackMs.toFixed(0)}} ms · 復号・描画 {{nativeStats.decodeMs.toFixed(1)}} ms · ACK待ち {{nativeStats.pending}} / {{nativeStats.window}}枚
        </p>
      </details>
      <label v-if="ready&&monitorLayout" data-monitor-selector>表示モニター<select v-model="monitorDevice" :disabled="virtualScreen" @change="changeMonitor"><option v-for="monitor in monitorLayout.monitors" :key="monitor.id" :value="monitor.id">{{monitor.id}} — {{monitor.width}}×{{monitor.height}}{{monitor.primary?'（主画面）':''}}{{monitor.scalePercent?' / '+monitor.scalePercent+'%':''}}</option><option value="all" :disabled="!monitorLayout.allSupported">全モニターをまとめて表示</option></select></label>
      <DesktopFiles v-if="ready&&filesCap&&filesReady&&fileClient" ref="filePanel" :client="fileClient" />
      <details v-if="ready && allowClipboard" data-desktop-clipboard>
        <summary>クリップボード{{ richClipboard ? "（テキスト・画像・書式）" : "（テキスト）" }}</summary>
        <p>
          PC全体のクリップボードを扱います。8192文字まで。同期はこの窓が前面の間だけ動き、同時変更時はAを優先します。
        </p>
        <button @click="send({ type: 'clipboard_grant', enabled: !clipboardGranted })">
          {{ clipboardGranted ? "クリップボード共有を解除" : "クリップボード共有を許可" }}
        </button>
        <textarea
          v-model="clipboardText"
          aria-label="共有するクリップボードのテキスト"
          maxlength="8192"
          :disabled="!clipboardGranted"
        />
        <button :disabled="!clipboardGranted" @click="transferClipboard('read')">
          共有元から取得</button
        ><button :disabled="!clipboardGranted || !allowed" @click="transferClipboard('write')">
          共有元へ送信
        </button>
        <button :disabled="!clipboardGranted||(!clipboardSync&&richBusy)" @click="toggleClipboardSync">
          {{ clipboardSync ? "自動同期を停止" : "双方向の自動同期を開始" }}
        </button>
        <div v-if="richClipboard" data-rich-clipboard>
          <p>PNG画像とHTMLの表・書式を転送します。画像2MiB、テキスト/HTML/RTF各512KiB、全体4MiBまで。RTFの貼り付けはブラウザの対応に従います。</p>
          <button :disabled="!clipboardGranted||!richPipeReady||richBusy||clipboardSync" @click="transferRichClipboard('read')">画像・書式を手元へコピー</button>
          <button :disabled="!clipboardGranted||!allowed||!richPipeReady||richBusy||clipboardSync" @click="transferRichClipboard('write')">画像・書式を共有元へ送信</button>
          <label><input v-model="richSyncMode" type="checkbox" :disabled="clipboardSync||richBusy||!richPipeReady" />画像・書式も自動同期する</label>
          <button v-if="richBusy" @click="cancelRichFromUi()">画像・書式の転送を取り消す</button>
        </div>
        <p role="status">{{ clipboardNotice }}</p>
      </details>
      <details v-if="ready && allowed && !secureDesktop" data-agent-access>
        <summary>エージェント連携</summary>
        <p>
          この共有画面の取得・PC操作を最大2分許可します。取得画像をモデルへ渡す用途を含みます。発行コードは30秒以内・1回だけ使用できます。
        </p>
        <button @click="send({ type: 'agent_grant', enabled: true })">
          エージェントへの画面提供・操作を許可
        </button>
        <button v-if="agentExpires" @click="send({ type: 'agent_grant', enabled: false })">
          エージェント許可を取り消す
        </button>
        <input
          v-if="agentTicket"
          :value="agentTicket"
          readonly
          aria-label="エージェント接続コード"
        />
        <p v-if="agentActive">
          エージェントが操作中です。操作を引き取るか、共有を停止すると失効します。
        </p>
      </details>
      <section v-if="displayModes.length" data-desktop-display>
        <label
          ><input
            v-model="maximumDisplay"
            :disabled="elevatedScreen"
            type="checkbox"
            @change="toggleDisplay"
          />接続先を最大解像度にする</label
        >
        <p>
          共有元の実ディスプレイを、対応する中で画素数が最大の解像度へ変更します。窓のサイズでは解像度を下げません。表示の拡縮は「画面に合わせる」で別に選べます。変更ごとに再接続して操作許可を解除し、共有終了時に元の解像度へ復元を試みます。
        </p>
        <p v-if="activeSettings?.display" data-applied-display>
          {{ activeSettings.display.width }}×{{ activeSettings.display.height }} — {{ fit ? '画面に合わせて表示' : '1画素＝1 CSS px' }}
        </p>
      </section>
      </div>
      <div
        ref="screenElement"
        data-desktop-screen
        class="screen"
        :class="{ controlling: control, actual: !fit }"
      >
        <canvas
          v-show="!lockScreenCover"
          ref="canvas"
          tabindex="0"
          aria-label="共有画面"
          :data-rendered-frames="rendered"
          :data-video-frames="videoFrames"
          :data-frame-info="info ? JSON.stringify(info) : undefined"
          :style="[canvasSize,{cursor:control&&separateCursor?'none':undefined}]"
          @pointerdown.prevent="pointer($event, 'down')"
          @pointermove="pointer($event, 'move')"
          @pointerup.prevent="pointer($event, 'up')"
          @pointercancel="relinquish"
          @mousedown.prevent.stop
          @mouseup.prevent.stop
          @auxclick.prevent.stop
          @contextmenu.prevent.stop
          @wheel.prevent="wheel"
          @blur="canvasBlur"
        />
        <canvas v-if="separateCursor" ref="cursorCanvas" class="cursor-overlay" :style="canvasSize" aria-hidden="true" data-remote-cursor />
        <div v-if="lockScreenCover" class="lock-screen-cover" data-desktop-lock-cover>
          <p>接続先はWindowsのロック画面です。</p>
          <button :disabled="!ready || !allowed || dismissInFlight" @click="dismissLockScreen">サインイン画面へ進む</button>
          <p>PIN・パスワードは、次の認証画面で入力してください。</p>
        </div>
        <span v-else-if="!info" class="cover">{{ status }}{{ error ? " — " + error : "" }}</span>
      </div>
      <div v-show="!lockScreenCover && (infoOpen || control)" class="desktop-input" :class="{ 'input-collapsed': inputCollapsed }">
      <div class="viewer-input-row">
      <form v-show="!inputCollapsed"
        @submit.prevent="submitText"
      >
        <input
          ref="textInput"
          :type="secureDesktop ? 'password' : 'text'"
          autocomplete="off"
          v-model="text"
          :disabled="!control"
          maxlength="1024"
          aria-label="確定した文字を送る"
          :placeholder="secureDesktop ? 'Windowsの認証画面に送る文字（保存しません）' : '日本語はここで変換を確定'"
        /><button :disabled="!control || !text">文字を送る</button>
      </form>
      <button type="button" class="viewer-collapse-button" :aria-expanded="!inputCollapsed"
        :aria-label="inputCollapsed ? '文字入力欄を表示' : '文字入力欄を畳む'"
        :title="inputCollapsed ? '文字入力欄を表示' : '文字入力欄を畳む'"
        @click="toggleTextInput">{{ inputCollapsed ? '▴' : '▾' }}</button>
      </div>
      <footer v-show="infoOpen && !inputCollapsed">
        <span>{{
          control
            ? "入力はBのPC全体に届きます。Escを2回続けて押すと操作を解除。"
            : "閲覧専用。操作にはBの事前許可が必要です。"
        }}</span
        ><output data-desktop-metrics
          >{{ mediaState!=='images' ? '画像: ' : '' }}{{ stats.fps.toFixed(1) }} fps · {{ stats.mbps.toFixed(2) }} Mbps · relay→描画ACK p95
          {{ stats.ackP95Ms.toFixed(0) }} ms · 取得 {{ info?.captureMs.toFixed(1) ?? "—" }} / encode
          {{ info?.encodeMs.toFixed(1) ?? "—" }} / 描画 {{ drawMs.toFixed(1) }} ms · 入力ACK
          {{ inputAckMs.toFixed(0) }} ms</output
        >
      </footer>
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
.desktop-window {
  position: fixed;
  box-sizing: border-box;
  z-index: 180;
  width: min(1100px, calc(100vw - 64px));
  height: min(780px, calc(100vh - 80px));
  min-width: 320px;
  min-height: 280px;
  resize: both;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--soda-bg, #161b22);
  color: var(--soda-fg, #ddd);
  border: 1px solid var(--soda-menu-border, #555);
  box-shadow: 0 8px 32px #0008;
}
.desktop-controls, .desktop-input, .desktop-alert {
  position: absolute;
  z-index: 2;
  padding: 8px;
  border: 1px solid var(--soda-menu-border, #555);
  background: var(--soda-bg, #161b22);
}
.desktop-controls { top: 48px; right: 8px; width: min(640px, calc(100% - 34px)); max-height: calc(100% - 150px); overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.desktop-input { left: 8px; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.desktop-alert { top: 48px; left: 8px; max-width: calc(100% - 34px); }
.desktop-window > header { flex: 0 0 auto; z-index: 3; }
.desktop-window.maximized { padding: 0; gap: 0; border: 0; }
.desktop-window.maximized > header { position: absolute; top: 8px; right: 8px; max-width: calc(100% - 32px); padding: 4px 8px; background: var(--soda-bg, #161b22); border-radius: 4px; cursor: default; }
.desktop-window.maximized > header strong { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer-toolbar-content { display: contents; }
.viewer-collapse-button { width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0; flex: 0 0 28px; }
.desktop-window > header.toolbar-collapsed { position: absolute; top: 8px; right: 8px; padding: 2px; background: var(--soda-bg, #161b22); border-radius: 4px; cursor: default; }
.viewer-input-row { display: flex; align-items: center; gap: 4px; }
.viewer-input-row form { flex: 1; min-width: 0; }
.desktop-input.input-collapsed { left: auto; padding: 2px; border-radius: 4px; }
.desktop-window.maximized > .screen { position: absolute; inset: 0; border: 0; scrollbar-gutter: auto; }
.desktop-window.maximized {
  min-width: 0;
  min-height: 0;
  resize: none;
}
header,
nav,
form {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
header {
  cursor: move;
  touch-action: none;
}
header strong {
  flex: 1;
}
header span {
  font-weight: bold;
}
p {
  margin: 0;
  font-size: 12px;
}
.screen {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  background: #000;
  border: 2px solid transparent;
}
.lock-screen-cover {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.screen.controlling {
  border-color: var(--soda-accent-fg, #79c0ff);
}
.screen:not(.actual) { overflow: hidden; scrollbar-gutter: auto; }
.screen:not(.actual) canvas { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  touch-action: none;
}
.actual canvas {
  max-width: none;
  max-height: none;
}
.cover {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  background: #161b22;
  padding: 16px;
}
footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}
form input {
  flex: 1;
  min-width: 80px;
}
details input[type="number"] {
  width: 72px;
}
details p {
  max-width: 640px;
  font-size: 12px;
}
.target {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cursor-overlay { pointer-events:none;z-index:1; }
.screen.actual .cursor-overlay { position:absolute;left:0;top:0;margin:0; }
</style>

<style scoped>
.desktop-window.embedded { position:relative; inset:auto; width:100%; height:100%; min-width:0; min-height:0; resize:none; z-index:auto; box-shadow:none; }
.embedded > header { cursor:default; }
.embedded > header strong { flex:0 1 auto; max-width:40%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
