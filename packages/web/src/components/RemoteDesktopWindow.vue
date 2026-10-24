<script setup lang="ts">
import "./viewportMaximize.css";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  decodeDesktopFrame,
  DESKTOP_IME_PROTOCOL,
  DESKTOP_INPUT_PROTOCOL,
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

import { DesktopEscape, DesktopButtons, DesktopModifiers } from "../desktop/input.js";
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
  mediaTransport = ref<"auto" | "relay">("auto"),
  mediaBitrate = ref(2500),
  videoFrames = ref(0);
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
function clearClipboard() {
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
async function syncClipboard() {
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
    clipboardSync.value = false;
    return;
  }
  try {
    lastClipboard = await navigator.clipboard.readText();
    if (!clipboardGranted.value) return;
    clipboardSync.value = true;
    await syncClipboard();
  } catch {
    clipboardNotice.value =
      "ブラウザのクリップボード読み取りを許可してください。HTTPSまたはlocalhostが必要です。";
  }
}
function requestVideo() {
  send({
    type: "media",
    enabled: true,
    settings: {
      audio: requestAudio.value,
      transport: mediaTransport.value,
      adaptive: adaptive.value,
      maxBitrateKbps: Number(mediaBitrate.value),
    },
  });
}
function stopVideo() {
  send({ type: "media", enabled: false });
  receiver?.stop();
  receiver = undefined;
  mediaState.value = "images";
  sound.value = false;
  restoreImage();
  releaseInputs();
}
async function toggleSound() {
  if (!receiver) return;
  try {
    await receiver?.sound(!sound.value);
    sound.value = !sound.value;
  } catch {
    error.value = "音声再生を許可してください";
  }
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
let ws: WebSocket | undefined,
  dead = false,
  epoch = 0,
  seq = 0,
  lastDrawn = 0,
  decoding = false;
let chain = new DesktopFrameChain();
let startupRetries = 0;
const inputs = new Map<number, number>();
const escapePress = new DesktopEscape(), mouseButtons = new DesktopButtons(), modifiers = new DesktopModifiers();
let drag: { x: number; y: number; left: number; top: number } | undefined;
function send(value: unknown) {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 16384)
    ws.send(JSON.stringify(value));
}
function releaseInputs() {
  mouseButtons.reset(); modifiers.reset();
  send({type:"release"});
}
function relinquish() {
  escapePress.reset(); mouseButtons.reset(); modifiers.reset();
  if (dismissPending) dismissInFlight.value = false;
  dismissPending = false;
  if (clipboardGranted.value) {
    send({ type: "clipboard_grant", enabled: false });
    clearClipboard();
  }
  if (control.value) send({ type: "control", enabled: false });
  control.value = false;
  inputs.clear();
}
function stop() {
  epoch++;
  if (clipboardGranted.value) send({ type: "clipboard_grant", enabled: false });
  clearClipboard();
  receiver?.stop();
  receiver = undefined;
  mediaState.value = "images";
  mediaAudio.value = false;
  sound.value = false;
  allowMedia.value = false;
  allowClipboard.value = false;
  relinquish();
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
  const socket = new WebSocket(url, [DESKTOP_IME_PROTOCOL, DESKTOP_INPUT_PROTOCOL]);
  ws = socket;
  socket.binaryType = "arraybuffer";
  socket.onopen = () => {
    if (version === epoch)
      send({
        type: "start",
        machineId: props.machineId,
        options: { ...options, features: true },
      });
  };
  socket.onmessage = async (event) => {
    if (dead || version !== epoch) return;
    try {
      if (event.data instanceof ArrayBuffer) {
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
        drawMs.value = performance.now() - start;
        decoding = false;
        send({ type: "ack", seq: frame.info.seq });
      } else {
        const m = JSON.parse(String(event.data));
        if (m.type === "ready") {
          const r = DesktopReady.parse(m);
          secureDesktop.value = r.secureDesktop === true;
          lockScreenCover.value = r.lockScreenCover === true;
          imeKeys.value = r.imeKeys === true;
          extendedInput.value = r.extendedInput === true;
          if (secureDesktop.value) text.value = "";
          title.value = secureDesktop.value ? "Windowsのロック解除" : r.title;
          allowed.value = r.allowInput;
          ready.value = connected.value = true;
          synthetic.value = r.backend === "synthetic";
          allowMedia.value = r.allowMedia === true;
          allowClipboard.value = r.allowClipboard === true;
          dynamicQuality.value = r.dynamicQuality === true;
          displayModes.value = r.display?.modes ?? [];
          if (!secureDesktop.value && maximumDisplay.value && !r.display) {
            maximumDisplay.value = false;
            error.value = "Bでディスプレイ解像度の変更が許可されていません";
          }
          if (!secureDesktop.value) scheduleDisplay();
          status.value = secureDesktop.value ? "ロック画面・閲覧中" : "閲覧中";
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
          mediaState.value = state.state;
          mediaAudio.value = state.audio;
          if (state.state === "images") {
            receiver?.stop();
            receiver = undefined;
            sound.value = false;
            restoreImage();
          } else if (state.state === "negotiating" && receiver?.id !== state.id) {
            receiver?.stop();
            receiver = new DesktopMediaReceiver(
              state.id,
              send,
              (video, count) => {
                if (dead || version !== epoch || !canvas.value || !info.value) return;
                if (
                  activeSettings.value?.display &&
                  (video.videoWidth !== info.value.width || video.videoHeight !== info.value.height)
                ) {
                  stopVideo();
                  error.value = "動画が等倍の画素数を維持できないため画像配信に戻しました";
                  return;
                }
                const el = canvas.value;
                el.width = info.value.width;
                el.height = info.value.height;
                el.getContext("2d")!.drawImage(video, 0, 0, el.width, el.height);
                videoFrames.value = count;
              },
              (value) => {
                mediaState.value = value;
                if (value === "images") {
                  restoreImage();
                  releaseInputs();
                }
              },
              state.iceServers as RTCIceServer[] | undefined,
            );
          }
        } else if (m.type === "rtc_signal") {
          const signal = DesktopMediaSignal.parse(m);
          if (receiver?.id === signal.id)
            await receiver.signal(signal.signal as Parameters<DesktopMediaReceiver["signal"]>[0]);
        } else if (m.type === "media_stream") {
          const stream = DesktopMediaStream.parse(m);
          if (receiver?.id === stream.id) receiver.stream(stream.generation, stream.mime);
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
          agentActive.value = m.active === true;
          agentExpires.value = typeof m.expiresAt === "number" ? m.expiresAt : 0;
          if (agentActive.value || !agentExpires.value) agentTicket.value = "";
          control.value = false;
          status.value = agentActive.value ? "エージェント操作中" : "閲覧中";
        } else if (m.type === "control") {
          escapePress.reset(); mouseButtons.reset(); modifiers.reset();
          control.value = m.enabled === true && allowed.value;
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
}
function input(value: unknown) {
  if (lockScreenCover.value) return;
  if (receiver && !receiver.active) return;
  if (!control.value || !ready.value || !lastDrawn || !RemoteDesktopInput.safeParse(value).success)
    return;
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
  for (const change of mouseButtons.update(e.buttons)) {
    if (change.button > 2 && !extendedInput.value) {
      error.value = "接続先を更新すると、マウスの戻る・進むを利用できます";
      continue;
    }
    input({kind:"pointer",...position,...change});
  }
  if (event === "move") input({kind:"pointer",...position,event:"move",button:0});
  if (event === "up" && canvas.value.hasPointerCapture(e.pointerId)) canvas.value.releasePointerCapture(e.pointerId);
}
function submitText() {
  input({kind:"text",text:text.value});
  // Clearing the draft disables the focused submit button; keep focus in the viewer.
  canvas.value?.focus({preventScroll:true});
  text.value = "";
}
function wheel(e: WheelEvent) {
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
      <div v-show="infoOpen" class="desktop-controls">
      <p v-if="title" class="target">
        {{ title }} <b v-if="synthetic">模擬画面（実デスクトップではありません）</b>
      </p>
      <p v-if="secureDesktop && !lockScreenCover" data-desktop-locked>
        Windows標準の認証画面で解除してください。認証情報は保存しません。解除後は閲覧専用に戻ります。
        <button :disabled="!control" @click="send({ type: 'sas' })">Ctrl+Alt+Del</button>
      </p>
      <p v-if="activeSettings && ready" data-desktop-applied>
        適用中: 幅上限{{ activeSettings.width }} / {{ activeSettings.fps }}fps上限 / JPEG
        {{ activeSettings.quality }} /
        {{
          { full: "フルカラー", rgb565: "約6.5万色", rgb332: "256色", gray16: "16階調グレー" }[
            activeSettings.image.colorMode
          ]
        }}
      </p>
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
      <details v-if="ready && allowMedia" data-desktop-media>
        <summary>動画・音声</summary>
        <p>
          BのWindowsブラウザで /desktop-host
          を開き、対象と同じモニターを選んで共有を許可してください。
        </p>
        <label><input v-model="requestAudio" type="checkbox" />システム音声を要求</label>
        <label
          >経路<select v-model="mediaTransport" aria-label="動画の経路">
            <option value="auto">WebRTC（接続できなければ中継）</option>
            <option value="relay">圧縮動画を中継</option>
          </select></label
        >
        <label
          >映像帯域の上限(kbps)<input
            v-model="mediaBitrate"
            aria-label="動画帯域の上限"
            type="number"
            min="128"
            max="12000"
        /></label>
        <button @click="requestVideo">動画共有を依頼</button
        ><button @click="stopVideo">動画・音声を停止</button>
        <button v-if="mediaAudio" @click="toggleSound">
          {{ sound ? "音声を止める" : "音声を再生" }}
        </button>
        <p data-media-state>
          {{
            {
              images: "画像配信",
              waiting: "Bの共有許可待ち",
              negotiating: "動画を接続中",
              rtc: "WebRTC動画",
              relay: "圧縮動画の中継",
            }[mediaState] ?? mediaState
          }}
        </p>
      </details>
      <details v-if="ready && allowClipboard" data-desktop-clipboard>
        <summary>クリップボード（テキスト）</summary>
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
        <button :disabled="!clipboardGranted" @click="toggleClipboardSync">
          {{ clipboardSync ? "自動同期を停止" : "双方向の自動同期を開始" }}
        </button>
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
          :style="canvasSize"
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
          >{{ stats.fps.toFixed(1) }} fps · {{ stats.mbps.toFixed(2) }} Mbps · relay→描画ACK p95
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
</style>

<style scoped>
.desktop-window.embedded { position:relative; inset:auto; width:100%; height:100%; min-width:0; min-height:0; resize:none; z-index:auto; box-shadow:none; }
.embedded > header { cursor:default; }
.embedded > header strong { flex:0 1 auto; max-width:40%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
