<script setup lang="ts">
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DesktopInput } from "@sodashitsu/protocol";

const props = defineProps<{ enabled: boolean; machineId?:string; machineLabel?:string }>();
const remote = computed(() => !!props.machineId && props.machineId !== LOCAL_MACHINE_ID);
let rpcSerial = 0;
const transportError = ref("");
const canvas = ref<HTMLCanvasElement>();
const surface = ref<HTMLElement>();
const screen = ref<HTMLDivElement>();
const sourceSize = ref({ width: 0, height: 0 });
const fullscreen = ref(false), fullscreenSupported = ref(false), fullscreenBusy = ref(false);
const fullscreenError = ref("");
let disposed = false, fullscreenEscapeDown = false;
function syncFullscreen(): void {
  const owned = document.fullscreenElement === surface.value;
  if (fullscreen.value && !owned) {
    // The browser can exit before delivering Escape keydown to this document.
    // A fresh non-repeat keydown resets the guard for normal remote Escape.
    fullscreenEscapeDown = true;
    release();
  }
  fullscreen.value = owned;
  scheduleFit();
}
async function leaveFullscreen(): Promise<void> {
  if (document.fullscreenElement !== surface.value) return;
  try { await document.exitFullscreen(); } catch { /* The browser may already be leaving fullscreen. */ }
}
async function toggleFullscreen(): Promise<void> {
  const element = surface.value;
  if (!element || !props.enabled || fullscreenBusy.value) return;
  focusSurface();
  fullscreenError.value = "";
  fullscreenBusy.value = true;
  try {
    if (document.fullscreenElement === element) await document.exitFullscreen();
    else await element.requestFullscreen({ navigationUI: "hide" });
    if ((disposed || !connected.value) && document.fullscreenElement === element) await document.exitFullscreen();
  } catch {
    if (!disposed) fullscreenError.value = "全画面表示に切り替えられませんでした。このブラウザの全画面表示の許可を確認してください。";
  } finally {
    fullscreenBusy.value = false;
    if (!disposed) syncFullscreen();
  }
}
function fullscreenKey(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const local = fullscreen.value || (fullscreenEscapeDown && (event.type === "keyup" || event.repeat));
  if (event.type === "keydown") {
    if (!event.repeat || fullscreen.value) fullscreenEscapeDown = fullscreen.value;
  } else fullscreenEscapeDown = false;
  if (!local) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.type === "keydown") void leaveFullscreen();
}
const socket = ref<WebSocket>();
const connected = ref(false),
  allowInput = ref(false),
  control = ref(false);
const title = ref(""),
  note = ref("接続を準備しています"),
  invitationToken = ref("");
const remember = ref(true);
const launcherAvailable = ref(false), launcherBusy = ref(false), launchPending = ref(false);
const launchTargets = ref<{id:string;title:string}[]>([]), launchTarget = ref("");
function launchWindows(): void {
  focusSurface(); relinquish(); launchTargets.value = []; launchPending.value = true;
  send({type:"launch"});
}
function connectLaunched(): void {
  if (!launchTarget.value) return;
  focusSurface(); launchPending.value = true;
  send({type:"launchConnect",targetId:launchTarget.value});
}
const invitation = computed(() => !remote.value && invitationToken.value ?
  `node ./cdp-bridge.mjs --soda ${JSON.stringify(location.origin)} --token ${invitationToken.value}${remember.value ? " --remember" : ""} --allow-input --allow-fit` : "");
type Device = { id: string; title: string; online: boolean; busy: boolean };
const devices = ref<Device[]>([]), selectedDevice = ref("");
const selected = computed(() => devices.value.find(d => d.id === selectedDevice.value));
const text = ref("");
type PointerInput = Extract<DesktopInput, { kind: "pointer" }>;
let wheel: PointerInput | undefined;
let wheelTimer: ReturnType<typeof setTimeout> | undefined;
function cancelWheel(): void {
  clearTimeout(wheelTimer);
  wheelTimer = undefined;
  wheel = undefined;
}
function flushWheel(): void {
  const pending = wheel;
  cancelWheel();
  if (pending && props.enabled && control.value && connected.value)
    send({ type: "input", input: pending });
}
const allowFit = ref(false), fit = ref(false);
let resizeObserver: ResizeObserver | undefined;
let fitTimer: ReturnType<typeof setTimeout> | undefined;
let lastFit = "";
function scheduleFit(): void {
  clearTimeout(fitTimer);
  if (!fit.value || !allowFit.value || !control.value || !props.enabled) return;
  fitTimer = setTimeout(() => {
    if (!fit.value || !allowFit.value || !control.value || !props.enabled || !screen.value) return;
    const w = screen.value.clientWidth, h = screen.value.clientHeight;
    if (document.hidden || w < 160 || h < 120) {
      cancelWheel();
      if (lastFit) send({ type: "viewport", size: null });
      lastFit = "";
      return;
    }
    const scale = Math.min(1, 4096 / w, 2400 / h);
    const size = { width: Math.floor(w * scale), height: Math.floor(h * scale) };
    if (size.width < 160 || size.height < 120) {
      cancelWheel();
      if (lastFit) send({ type: "viewport", size: null });
      lastFit = "";
      return;
    }
    const key = `${size.width}x${size.height}`;
    if (key !== lastFit) {
      lastFit = key;
      cancelWheel();
      send({ type: "viewport", size });
    }
  }, 200);
}
let width = 0,
  height = 0,
  generation = 0,
  frameEpoch = 0;
let pointerAt = 0;
let lastClick = { at: -Infinity, x: 0, y: 0, button: -1, count: 0 };
const pressed = new Map<string, { key: string; code: string }>();
function send(value: unknown): void {
  if (socket.value?.readyState === WebSocket.OPEN) socket.value.send(JSON.stringify(remote.value
    ? {id:String(++rpcSerial),method:"vscode.cdp.send",params:{message:value}} : value));
}
function release(): void {
  cancelWheel();
  for (const v of pressed.values())
    send({
      type: "input",
      input: { kind: "key", event: "keyUp", ...v, modifiers: 0, repeat: false },
    });
  pressed.clear();
}
function relinquish(): void {
  clearTimeout(fitTimer);
  fit.value = false;
  lastFit = "";
  release();
  send({ type: "control", enabled: false });
  control.value = false;
}
function focusSurface(): void { surface.value?.focus({ preventScroll: true }); }
function attachRegistered(): void {
  // The clicked connect button becomes disabled when sharing starts. Keep
  // focus inside the native surface so the direct app remains operable.
  focusSurface();
  send({ type: "connect", deviceId: selectedDevice.value });
}
function connect(): void {
  const epoch = ++generation;
  transportError.value = "";
  const url = new URL(remote.value ? "/ws" : "/desktop-cdp?role=viewer", location.href);
  if (remote.value) url.searchParams.set("machine", props.machineId!);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url);
  socket.value = ws;
  ws.onopen = () => {
    note.value = "Windows側の共有元を接続してください";
    if (remote.value) ws.send(JSON.stringify({id:String(++rpcSerial),method:"vscode.cdp.open",params:{}}));
  };
  ws.onmessage = async (ev) => {
    if (epoch !== generation) return;
    let m;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      ws.close();
      return;
    }
    if (remote.value) {
      if (m.error) {
        transportError.value = "接続先のVSCode共有を利用できません。接続先のSodashitsuの版と起動設定を確認してください";
        note.value = transportError.value; launchPending.value = false; ws.close(); return;
      }
      if (m.event !== "vscode.cdp" || !m.data || typeof m.data !== "object") return;
      m = m.data;
    }
    if (m.type === "status") {
      devices.value = Array.isArray(m.devices) ? m.devices.filter((d: Device) =>
        d && typeof d.id === "string" && typeof d.title === "string" &&
        typeof d.online === "boolean" && typeof d.busy === "boolean") : [];
      if (!devices.value.some(d => d.id === selectedDevice.value))
        selectedDevice.value = devices.value.find(d => d.online && !d.busy)?.id ?? devices.value[0]?.id ?? "";
      launcherAvailable.value = m.launcherAvailable === true;
      launcherBusy.value = m.launcherBusy === true;
      launchPending.value = m.launchPending === true;
      connected.value = m.connected === true;
      if (connected.value) launchTargets.value = [];
      allowInput.value = m.allowInput === true;
      allowFit.value = m.allowFit === true;
      control.value = m.control === true;
      title.value = String(m.title ?? "");
      note.value = launchPending.value ? "VSCodeの起動・接続を準備しています" : connected.value
        ? control.value
          ? "操作中"
          : "閲覧中"
        : "共有元が接続されていません";
      if (!connected.value) {
        ++frameEpoch;
        width = height = 0;
        canvas.value?.getContext("2d")?.clearRect(0, 0, canvas.value.width, canvas.value.height);
      } else invitationToken.value = "";
    } else if (m.type === "launcherState") {
      launcherBusy.value = m.busy === true;
    } else if (m.type === "launchTargets") {
      launchTargets.value = Array.isArray(m.targets) ? m.targets.filter((t: {id:string;title:string}) =>
        t && typeof t.id === "string" && typeof t.title === "string") : [];
      launchTarget.value = launchTargets.value[0]?.id ?? "";
      launchPending.value = false;
      if (launchTargets.value.length === 1) connectLaunched();
    } else if (m.type === "invitation") {
      invitationToken.value = m.token;
      note.value =
        "初回はこのコマンドをWindows側で実行してください（5分・一回限り）。登録後は一覧から接続でき、ブリッジは共有停止後も待機します。";
    } else if (m.type === "error") {
      launchPending.value = false;
      note.value = String(m.message ?? "接続できませんでした");
    } else if (m.type === "frame" && typeof m.data === "string") {
      const frameStamp = frameEpoch;
      const image = new Image();
      image.src = "data:image/jpeg;base64," + m.data;
      try {
        await image.decode();
        if (epoch !== generation || frameStamp !== frameEpoch || !connected.value || !canvas.value)
          return;
        if (
          image.naturalWidth > 4096 ||
          image.naturalHeight > 4096 ||
          image.naturalWidth * image.naturalHeight > 8000000
        )
          throw new Error("image too large");
        canvas.value.width = image.naturalWidth;
        canvas.value.height = image.naturalHeight;
        canvas.value.getContext("2d")?.drawImage(image, 0, 0);
        if (width !== m.width || height !== m.height) cancelWheel();
        width = m.width;
        height = m.height;
        sourceSize.value = { width, height };
        canvas.value.dataset.frame = String(m.seq);
        send({ type: "ack", seq: m.seq });
      } catch {
        if (epoch === generation && frameStamp === frameEpoch) {
          note.value = "画像を読み込めませんでした";
          send({ type: "stop" });
        }
      }
    }
  };
  ws.onclose = () => {
    if (epoch !== generation) return;
    connected.value = control.value = false;
    launchPending.value = launcherBusy.value = false;
    invitationToken.value = "";
    pressed.clear();
    ++frameEpoch;
    width = height = 0;
    canvas.value?.getContext("2d")?.clearRect(0, 0, canvas.value.width, canvas.value.height);
    note.value = transportError.value || "接続が終了しました。再接続してください";
  };
  ws.onerror = () => {
    note.value = "接続できませんでした";
  };
}
function input(value: DesktopInput): void {
  if (!props.enabled || !control.value || !connected.value) return;
  if (value.kind === "pointer" && value.event === "mouseWheel") {
    if (wheel && (wheel.x !== value.x || wheel.y !== value.y ||
      wheel.modifiers !== value.modifiers || wheel.buttons !== value.buttons ||
      (wheel.deltaX !== 0 && value.deltaX !== 0 && Math.sign(wheel.deltaX) !== Math.sign(value.deltaX)) ||
      (wheel.deltaY !== 0 && value.deltaY !== 0 && Math.sign(wheel.deltaY) !== Math.sign(value.deltaY)))) flushWheel();
    wheel = { ...value,
      deltaX: Math.max(-10000, Math.min(10000, (wheel?.deltaX ?? 0) + value.deltaX)),
      deltaY: Math.max(-10000, Math.min(10000, (wheel?.deltaY ?? 0) + value.deltaY)),
    };
    wheelTimer ??= setTimeout(flushWheel, 32);
  } else {
    flushWheel();
    send({ type: "input", input: value });
  }
}
function modifiers(e: MouseEvent | KeyboardEvent): number {
  return (
    Number(e.altKey) | (Number(e.ctrlKey) * 2) | (Number(e.metaKey) * 4) | (Number(e.shiftKey) * 8)
  );
}
function pointer(e: PointerEvent | WheelEvent): void {
  if (!control.value || !props.enabled || !width || !height || !canvas.value) return;
  if (e.type === "pointercancel") {
    relinquish();
    return;
  }
  if (e.type === "pointermove" && performance.now() - pointerAt < 30) return;
  pointerAt = performance.now();
  const r = canvas.value.getBoundingClientRect();
  if (!r.width || !r.height) return;
  let x = ((e.clientX - r.left) * width) / r.width,
    y = ((e.clientY - r.top) * height) / r.height;
  if (e.type === "pointerup") {
    x = Math.max(0, Math.min(width - 0.001, x));
    y = Math.max(0, Math.min(height - 0.001, y));
  }
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  e.preventDefault();
  if (e.type === "pointerdown") {
    const now = performance.now();
    const repeated = e.button === lastClick.button && now - lastClick.at < 400 && Math.hypot(x-lastClick.x, y-lastClick.y) < 5;
    lastClick = { at: now, x, y, button: e.button, count: repeated ? Math.min(3, lastClick.count+1) : 1 };
    canvas.value.focus();
    canvas.value.setPointerCapture((e as PointerEvent).pointerId);
  }
  const wheelMode = e.type === "wheel" ? (e as WheelEvent).deltaMode : 0;
  const wheelScaleX = wheelMode === 1 ? 16 : wheelMode === 2 ? width : 1;
  const wheelScaleY = wheelMode === 1 ? 16 : wheelMode === 2 ? height : 1;
  input({
    kind: "pointer",
    event:
      e.type === "pointerdown"
        ? "mousePressed"
        : e.type === "pointerup"
          ? "mouseReleased"
          : e.type === "wheel"
            ? "mouseWheel"
            : "mouseMoved",
    x,
    y,
    button:
      e.type === "wheel" || e.button < 0
        ? "none"
        : e.button === 2
          ? "right"
          : e.button === 1
            ? "middle"
            : "left",
    buttons: e.buttons & 7,
    modifiers: modifiers(e),
    clickCount:
      e.type === "pointerdown" || e.type === "pointerup" ? lastClick.count : 0,
    deltaX: e.type === "wheel" ? Math.max(-10000, Math.min(10000, (e as WheelEvent).deltaX * wheelScaleX)) : 0,
    deltaY: e.type === "wheel" ? Math.max(-10000, Math.min(10000, (e as WheelEvent).deltaY * wheelScaleY)) : 0,
  });
}
function key(e: KeyboardEvent): void {
  if (!control.value || !props.enabled || e.isComposing) return;
  e.preventDefault();
  e.stopPropagation();
  const v = { key: e.key, code: e.code };
  if (e.type === "keydown") pressed.set(e.code, v);
  else pressed.delete(e.code);
  input({
    kind: "key",
    event: e.type === "keydown" ? "keyDown" : "keyUp",
    ...v,
    modifiers: modifiers(e),
    repeat: e.repeat,
  });
}
function sendText(): void {
  if (!text.value) return;
  input({ kind: "text", text: text.value });
  text.value = "";
}
function hidden(): void {
  if (document.hidden) relinquish();
}
watch(
  () => props.enabled,
  (enabled) => {
    if (!enabled) relinquish();
  },
);
watch(fit, active => {
  cancelWheel();
  lastFit = "";
  if (active) scheduleFit();
  else {
    clearTimeout(fitTimer);
    if (control.value && allowFit.value) send({ type: "viewport", size: null });
  }
});
watch(connected, active => { if (!active) void leaveFullscreen(); });
watch([connected, control, allowFit], ([connected, control, allowed]) => {
  if (!connected || !control) cancelWheel();
  if (!connected || !control || !allowed) {
    fit.value = false;
    clearTimeout(fitTimer);
    lastFit = "";
  }
});
onMounted(() => {
  fullscreenSupported.value = document.fullscreenEnabled === true && typeof surface.value?.requestFullscreen === "function";
  document.addEventListener("fullscreenchange", syncFullscreen);
  connect();
  resizeObserver = new ResizeObserver(scheduleFit);
  if (screen.value) resizeObserver.observe(screen.value);
  document.addEventListener("visibilitychange", hidden);
  window.addEventListener("blur", relinquish);
});
onBeforeUnmount(() => {
  disposed = true;
  document.removeEventListener("fullscreenchange", syncFullscreen);
  void leaveFullscreen();
  relinquish();
  ++generation;
  clearTimeout(fitTimer);
  resizeObserver?.disconnect();
  socket.value?.close();
  document.removeEventListener("visibilitychange", hidden);
  window.removeEventListener("blur", relinquish);
});
</script>

<template>
  <section ref="surface" class="desktop-cdp" tabindex="-1" data-desktop-cdp @keydown.capture="fullscreenKey" @keyup.capture="fullscreenKey">
    <header>
      <strong>VSCode Desktop · 実験版</strong><span>{{ title }}</span>
    </header>
    <div v-if="devices.length" class="toolbar connection-tools">
      <select v-model="selectedDevice" aria-label="登録済みの共有元" :disabled="!enabled || connected">
        <option v-for="device in devices" :key="device.id" :value="device.id">
          {{ device.title }}{{ !device.online ? '（オフライン）' : device.busy ? '（使用中・停止処理中）' : '（接続可能）' }}
        </option>
      </select>
      <button :disabled="!enabled || connected || !selected?.online || selected.busy" @click="attachRegistered">接続</button>
      <button :disabled="!enabled || !selected" @click="focusSurface(); send({ type: 'forget', deviceId: selectedDevice })">登録を解除</button>
    </div>
    <p v-if="machineLabel" class="connection-tools">接続先: {{ machineLabel }}</p>
    <p v-if="remote && !launcherAvailable && socket?.readyState === 1" class="connection-tools">接続先マシンにVSCode起動設定が必要です。</p>
    <div v-if="launcherAvailable" class="connection-tools">
      <button :disabled="!enabled || connected || launchPending || launcherBusy || socket?.readyState !== 1" @click="launchWindows">VSCodeを起動・接続</button>
      <p>このSodashitsuサーバー側のVSCodeを共有します。起動済みなら再利用します。</p>
      <p v-if="launcherBusy && !connected && !launchPending">起動・接続処理が使用中です。終了を待ってください。</p>
      <template v-if="launchTargets.length > 1 && !connected">
        <select v-model="launchTarget" aria-label="起動・接続するVSCode" :disabled="launchPending">
          <option v-for="target in launchTargets" :key="target.id" :value="target.id">{{ target.title }}</option>
        </select>
        <button :disabled="!enabled || launchPending || !launchTarget || socket?.readyState !== 1" @click="connectLaunched">選択したVSCodeに接続</button>
      </template>
    </div>
    <label v-if="!remote" class="fit-toggle connection-tools"><input v-model="remember" type="checkbox" />共有元を登録する（次回は一覧から接続）</label>
    <div class="toolbar">
      <button
        v-if="!remote"
        class="connection-tools"
        :disabled="!enabled || socket?.readyState !== 1"
        @click="
          focusSurface();
          relinquish();
          send({ type: 'invite' });
        "
      >
        共有元を接続
      </button>
      <button
        v-if="connected && allowInput"
        :disabled="!enabled"
        @click="
          release();
          send({ type: 'control', enabled: !control });
        "
      >
        {{ control ? "閲覧に戻る" : "操作する" }}
      </button>
      <button
        v-if="connected || invitation || launchPending || launchTargets.length"
        @click="
          focusSurface();
          relinquish();
          send({ type: 'stop' });
          invitationToken = '';
          launchTargets = [];
          launchPending = false;
        "
      >
        共有を停止
      </button>
      <button v-if="connected" :disabled="!enabled || !fullscreenSupported || fullscreenBusy"
        :title="fullscreenSupported ? 'Escでも全画面を解除できます' : 'このブラウザでは全画面表示を利用できません'"
        :aria-pressed="fullscreen" @click="toggleFullscreen">{{ fullscreen ? '全画面を解除' : '全画面' }}</button>
      <button v-if="socket?.readyState === 3" :disabled="!enabled" @click="connect">再接続</button>
    </div>
    <p role="status">{{ note }}</p>
    <p class="scale-note">表示: 等倍（1:1）</p>
    <p v-if="fullscreenError" role="alert">{{ fullscreenError }}</p>
    <p v-if="connected && allowInput && !enabled">画面内をクリックすると操作を再開できます。</p>
    <p v-if="connected && !allowFit">表示領域への追従は共有元で許可されていません。再接続時に --allow-input --allow-fit を付けてください。</p>
    <textarea v-if="invitation" readonly :value="invitation" aria-label="Windows側の接続コマンド" />
    <label v-if="control && allowFit" class="fit-toggle" title="Windows側で開いている同じVSCodeのレイアウトも変わります"><input v-model="fit" type="checkbox" />表示領域に合わせる</label>
    <div ref="screen" class="screen" data-desktop-screen>
      <canvas
        ref="canvas"
        tabindex="0"
        aria-label="VSCodeの遠隔画面"
        :class="{ controlling: control }"
        :style="{ width: `${sourceSize.width}px`, height: `${sourceSize.height}px` }"
        @pointerdown="pointer"
        @pointerup="pointer"
        @pointermove="pointer"
        @pointercancel="pointer"
        @wheel="pointer"
        @contextmenu.prevent
        @keydown="key"
        @keyup="key"
        @blur="release"
      />
    </div>
    <form v-if="control" @submit.prevent="sendText">
      <input
        v-model="text"
        maxlength="8192"
        aria-label="日本語・文字列入力"
        placeholder="日本語などをここで変換して送信"
      /><button :disabled="!enabled">文字を送る</button>
    </form>
  </section>
</template>

<style scoped>
.desktop-cdp {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--soda-bg, #202124);
  color: var(--soda-fg, #eee);
  padding: 8px;
  gap: 6px;
  font: 13px system-ui;
  overflow: auto;
}
.desktop-cdp:fullscreen {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none;
  max-height: none;
  margin: 0;
}
.desktop-cdp:fullscreen header,
.desktop-cdp:fullscreen .connection-tools,
.desktop-cdp:fullscreen .scale-note {
  display: none;
}
header,
.toolbar,
form {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
header span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
p {
  margin: 0;
}
button,
select {
  min-height: 34px;
}
select { max-width: 100%; }
textarea {
  width: 100%;
  min-height: 85px;
  box-sizing: border-box;
}
input {
  flex: 1;
  min-width: 160px;
  min-height: 32px;
}
.fit-toggle { display: flex; align-items: center; gap: 6px; }
.fit-toggle input { flex: none; min-width: 0; min-height: 0; }
.screen {
  flex: 1;
  min-height: 100px;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  background: #111;
}
canvas {
  display: block;
  flex: none;
  margin: auto;
  outline: none;
}
.controlling {
  touch-action: none;
  cursor: crosshair;
}
.controlling:focus {
  outline: 2px solid #69a8ff;
}
</style>
