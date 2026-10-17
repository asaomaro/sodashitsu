<script lang="ts">
// 枠の定数は `display/framePage.ts` にある。負の対照・テストが、この部品からも読めるよう再 export する。
export {
  DISPLAY_VIEW_SANDBOX,
  DISPLAY_VIEW_PAGE,
  DISPLAY_SCRIPT_VIEW_SANDBOX,
  DISPLAY_SCRIPT_VIEW_PAGE,
} from "../display/framePage.js";
/** 固定の文言（枠の外の DOM。枠の中身・題からは変えられない）。 */
export const DISPLAY_NOTE_UNSUPPORTED = "この画面では、この形式の表示を出せません";
export const DISPLAY_NOTE_LOAD_FAILED = "表示を読み込めませんでした";
export const DISPLAY_NOTE_CLOSED = "この表示は閉じられました";
export const DISPLAY_NOTE_CONTENT_FAILED = "表示の中身を取得できませんでした";
export const DISPLAY_NOTE_RENDER_FAILED =
  "この表示を描けませんでした（次の更新で直ることがあります）";
export const DISPLAY_NOTE_FOCUS_DETACHED =
  "この表示は、キー入力を取ろうとしたので、この画面では止めました";
export const DISPLAY_NOTE_SCRIPT_DISABLED = "スクリプトが動く表示は、設定で無効になっています";
export const DISPLAY_NOTE_BREAKER =
  "入力のフォーカスが繰り返し外されたので、この画面ではスクリプトの表示を止めました";
</script>

<script setup lang="ts">
import {
  DISPLAY_PING_INTERVAL_MS,
  DISPLAY_UNRESPONSIVE_MS,
  type DisplayContent,
  type DisplayInfo,
} from "@sodashitsu/protocol";
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  coverStartsEngage,
  startFromButton,
  startFromCover,
  startFromKey,
} from "../display/engageEntry.js";
import { FocusGuard } from "../display/focusGuard.js";
import {
  documentRegainedFocusWithin,
  installFocusOriginTracking,
  restoreFocus,
  tabPressedWithin,
} from "../display/focusOrigin.js";
import { frameKey, framePage } from "../display/framePage.js";
import { readFrameMessage } from "../display/frameMessages.js";
import {
  noteFocusRestored,
  startFocusDropWatch,
  stopFocusDropWatch,
} from "../display/focusDrop.js";
import {
  registerFrame,
  registerScriptFrame,
  scriptFrameCount,
  setFrameEngaged,
  stopAllScriptFrames,
  unregisterFrame,
  unregisterScriptFrame,
  type RegisteredFrame,
} from "../display/frameRegistry.js";
import EmbeddedTerminal from "./EmbeddedTerminal.vue";
import { useMachinesStore } from "../store/machines.js";
import DesktopCdpView from "./DesktopCdpView.vue";
import { terminalComponentAllowed, isExtensionDisplay, componentViewport, directOperable, type TerminalComponent } from "../display/components.js";
import { PrefixRelay } from "../display/prefixRelay.js";
import { parkFocusAfterRelay } from "../display/relayFocus.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { readThemeVars } from "../display/themeVars.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useSettingsStore } from "../store/settings.js";
const desktopMachines = useMachinesStore();

/**
 * 表示の面の枠 1 つ（静的な形式 `text`・`markdown`・`html` と、スクリプトが動く形式 `script-html`。20261007-soda-extensions の design「枠とのやりとり」「スクリプトが動く形式」）。
 * 隔離した iframe（`allow-same-origin` なし）に、`MessageChannel` の port 経由で中身を渡す。
 * - 枠ごとの乱数の**合い札**（`?t=`）。`display-ready` は、**送り主がその iframe の窓**・状態が待ち・合い札が合う、の 1 回だけ受ける。
 *   通り道と中身を渡すのは、その合図と、**最初の `load`** の両方を見た後だけ。以後、枠の `window` の `message` は受けず、port だけを聞く。
 * - 移ったことは、**`load` の回数だけ**で決める（2 回目以降の `load` は必ず「移った」。どの形式でも同じ）。見回り（`ping`）は、画面が見えている間だけ数える。
 * - 知らない形式（`framePage` が `null`）と、スクリプトが動く形式を出せると名乗っていない画面は、枠を作らず、固定の文言を出す。
 * - **スクリプトが動く形式だけ**: 覆いと「操作を始める」（`engageEntry`）・フォーカスの番（`focusGuard`・`focusOrigin`）。利用者が操作を始めるまでは、枠がフォーカスを持つ
 *   ことを許さず、元の場所へ戻して、サーバへ「取られた」と知らせる（数えて閉じるのはサーバ）。`render` は 1 回だけ（版が替わったら、置く側が枠ごと作り直す）。
 */
const props = defineProps<{ info: DisplayInfo; content?: DisplayContent | undefined; main?: boolean }>();

const session = useSessionStore();
const components = ref(new Map<string, TerminalComponent>());
const wrap = ref<HTMLElement | null>(null);
const viewportMaximized=ref(false);
async function setViewportMaximized(value:boolean):Promise<void>{
  const el=wrap.value;
  if(value&&(!el||typeof el.showPopover!=="function")){port?.postMessage({type:"message",data:{type:"viewport-state",maximized:false}});return;}
  if(!value&&typeof el?.hidePopover==="function"){try{el.hidePopover();}catch{/* already closed */}}
  viewportMaximized.value=value;
  await nextTick();
  if(value&&viewportMaximized.value&&el===wrap.value&&el?.isConnected)el.showPopover();
  port?.postMessage({type:"message",data:{type:"viewport-state",maximized:viewportMaximized.value}});
}

const viewport = ref({ width: 0, height: 0 });
let componentResize: ResizeObserver | undefined;
const permittedComponents = computed(() => [...components.value.values()].filter(c => {
  const v = componentViewport(c, viewport.value.width, viewport.value.height);
  return v.width > 0 && v.height > 0 && (c.component === "desktop-cdp" ? isExtensionDisplay(props.info) : terminalComponentAllowed(props.info, c.paneId, session.panes, session.tabs));
}));
function componentStyle(c: TerminalComponent) {
  const v = componentViewport(c, viewport.value.width, viewport.value.height);
  return { left: `${v.x}px`, top: `${v.y}px`, width: `${v.width}px`, height: `${v.height}px` };
}
function terminalStyle(c: TerminalComponent) {
  const v = componentViewport(c, viewport.value.width, viewport.value.height);
  return { position: "absolute" as const, left: `${c.rect.x-v.x}px`, top: `${c.rect.y-v.y}px`, width: `${c.rect.width}px`, height: `${c.rect.height}px` };
}
const controller = inject(DisplayControllerKey, null);
const host = inject(DisplayHostKey, null);
const store = useDisplayStore();
const viewStore = useViewStore();
const settings = useSettingsStore();

/** この画面が出せる枠の頁（スクリプトが動く形式は、この画面が出せると名乗っているときだけ）。 */
const page = computed(() => {
  const p = framePage(props.info.format);
  if (p?.kind === "script" && (!store.scriptCapable || !settings.displayScriptEnabled)) return null; // 名乗っていない画面・設定で無効（二重の守り。検査の本物はサーバ）
  return p;
});
const isScript = computed(() => page.value?.kind === "script");
/**
 * アプリタブのメイン画面（置く側が `main` を渡し、拡張が出した script の面）: 覆い・［操作する］・`Esc` で抜ける操作が無い。開いた時点で操作中。
 * prefix は枠の中継が親へ伝え、許可表の操作だけ受ける（`PrefixRelay`）。それ以外の面（パネル・帯・浮いた窓・pane のプログラムの面）は今どおり（20261016-app-view-direct-operate）。
 */
const direct = computed(() => props.main === true && isScript.value && directOperable(props.info));
const iframeEl = ref<HTMLIFrameElement | null>(null);
const phase = ref<"waiting" | "connected" | "closed">("waiting");
const note = ref<string | null>(null);
/** 枠が「描けなかった」と知らせた（次の `rendered` で消す。枠は残る）。 */
const renderFailed = ref(false);
const loads = ref(0);
const ticket = ref("");
/** iframe の作り直しの印（形式が替わったときなど）。 */
const gen = ref(0);
/** 利用者が操作を始めた（スクリプトが動く形式。`guard.engaged` の写し。覆いと表示が見る）。 */
const engagedRef = ref(false);
/** フォーカスを取り続けたので、この画面では枠を外した（［もう一度出す］を出す）。 */
const detached = ref(false);

const guard = new FocusGuard();
let relay: PrefixRelay | null = null;
let directEngagedOnce = false;
let readySeen = false;
let renderSent = false;
let port: MessagePort | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let patrolTimer: ReturnType<typeof setInterval> | null = null;
let focusTimer: ReturnType<typeof setInterval> | null = null;
let offMessage: (() => void) | null = null;
let lastReply = 0;
let pingN = 0;
let lastOwnFocusAt = -Infinity;
let handlingSteal = false;

/** 自分で枠へフォーカスを移した直後に、静的な枠が知らせる `foreign-focus` を無視する時間。 */
const OWN_FOCUS_IGNORE_MS = 800;
/** `Tab` で入ったと見なす時間。 */
const TAB_IGNORE_MS = 500;
/** スクリプトが動く枠の、フォーカスの見回り（イベントが起きないブラウザへの備え）。 */
const FOCUS_PATROL_MS = 250;

const src = computed(() => (page.value ? `${page.value.page}?t=${ticket.value}` : ""));
const visibleNote = computed<string | null>(() => {
  if (page.value === null)
    return framePage(props.info.format)?.kind === "script" && store.scriptCapable
      ? DISPLAY_NOTE_SCRIPT_DISABLED
      : DISPLAY_NOTE_UNSUPPORTED;
  return phase.value === "closed" ? (note.value ?? DISPLAY_NOTE_CLOSED) : null;
});
const showCover = computed(() => isScript.value && phase.value !== "closed" && !engagedRef.value && !direct.value);

function newTicket(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function clearTimers(): void {
  if (handshakeTimer !== null) clearTimeout(handshakeTimer);
  if (patrolTimer !== null) clearInterval(patrolTimer);
  handshakeTimer = null;
  patrolTimer = null;
}
function closePort(): void {
  void setViewportMaximized(false);
  components.value.clear();
  if (port) {
    port.onmessage = null;
    port.close();
  }
  port = null;
}

/** 枠を（作り直して）最初の状態にする。 */
function start(): void {
  clearTimers();
  closePort();
  readySeen = false;
  renderSent = false;
  renderFailed.value = false;
  detached.value = false;
  loads.value = 0;
  note.value = null;
  phase.value = "waiting";
  guard.leave();
  guard.direct = direct.value;
  relay?.dispose();
  relay = null;
  syncGuardState();
  gen.value++;
  if (page.value === null) {
    syncFocusPatrol();
    return;
  }
  ticket.value = newTicket();
  syncFocusPatrol();
  handshakeTimer = setTimeout(() => {
    handshakeTimer = null;
    if (phase.value === "waiting") fail(DISPLAY_NOTE_LOAD_FAILED);
  }, DISPLAY_UNRESPONSIVE_MS);
}

/** 枠を外して固定の文言にする（知らせは送らない）。 */
function fail(text: string): void {
  clearTimers();
  closePort();
  phase.value = "closed";
  note.value = text;
  guard.leave();
  syncGuardState();
  releaseFocus();
}
/** 枠を外し、サーバへ知らせて面を閉じる。 */
function closeAndReport(problem: "navigated" | "unresponsive"): void {
  fail(DISPLAY_NOTE_CLOSED);
  void controller?.report(props.info.id, problem, {
    paneId: props.info.paneId,
    format: props.info.format,
  });
}
/** フォーカスがこの枠にあったなら、その pane の端末へ戻す。 */
function releaseFocus(): void {
  if (store.focusedDisplayId === props.info.id) {
    store.setFocused(null);
    host?.focusTerminal(props.info.paneId);
  }
}

function onLoad(): void {
  if (phase.value === "closed") return;
  loads.value++;
  // 期待する load は最初の 1 回だけ（どの形式でも）。2 回目以降は、枠が別の文書へ移った。
  if (loads.value >= 2) {
    closeAndReport("navigated");
    return;
  }
  tryConnect();
}

function onWindowMessage(ev: MessageEvent): void {
  const win = iframeEl.value?.contentWindow;
  if (!win || ev.source !== win) return; // 送り主がこの iframe の窓でないものは、丸ごと無視する
  const d = ev.data as { type?: unknown; t?: unknown } | null;
  if (!d || typeof d !== "object" || d.type !== "display-ready") return;
  if (phase.value !== "waiting" || readySeen) return; // 受けるのは 1 回だけ。以後は port だけ
  if (d.t !== ticket.value) {
    fail(DISPLAY_NOTE_LOAD_FAILED); // 別の文書に替わっている。通り道も中身も渡さない（知らせは送らない）
    return;
  }
  readySeen = true;
  tryConnect();
}

/** 枠の外の入力欄（input・textarea・[contenteditable]・dialog の中）にフォーカスがある。端末の入力口（xterm）は数えない。 */
function typingOutsideFrame(a: Element | null): boolean {
  if (a === null || a === iframeEl.value || a.classList.contains("xterm-helper-textarea")) return false;
  return a.matches("input, textarea, [contenteditable]") || a.closest("dialog, [role=dialog]") !== null;
}

function tryConnect(): void {
  const win = iframeEl.value?.contentWindow;
  if (phase.value !== "waiting" || !readySeen || loads.value < 1 || !win) return;
  if (handshakeTimer !== null) clearTimeout(handshakeTimer);
  handshakeTimer = null;
  const ch = new MessageChannel();
  port = ch.port1;
  port.onmessage = onPortMessage;
  win.postMessage({ type: "display-init", v: 1, features: {viewportMaximize:true} }, "*", [ch.port2]);
  phase.value = "connected";
  lastReply = Date.now();
  startPatrol();
  sendRender();
  // アプリのメイン画面は、開いた・選んだ時点で操作中（覆いなし）。版が替わっての作り直し（再接続）では、利用者が枠の外（ダイアログ・サイドバー等）で打っているなら、フォーカスを奪わない。
  if (direct.value) {
    const a = document.activeElement;
    const neutral = a === null || a === document.body || a === iframeEl.value;
    // 最初の接続でも、ダイアログが開いている・枠の外の入力欄で打っている最中は奪わない（拡張の再起動で枠が作り直されたときなど）。
    if (!viewStore.modalOpen && !typingOutsideFrame(a) && (!directEngagedOnce || neutral)) engageNow();
    directEngagedOnce = true;
  }
}

function sendRender(): void {
  if (!port || phase.value !== "connected") return;
  // スクリプトが動く形式は、1 回だけ（版が替わったら、置く側が枠ごと作り直す）。
  if (isScript.value && renderSent) return;
  const c = props.content;
  const i = props.info;
  // 手元の中身が、いまの見出しと同じ面・同じ版・同じ形式のときだけ送る（形式・版が替わった直後の前の中身を、新しい枠へ送らない）。
  if (!c || c.id !== i.id || c.rev !== i.rev || c.format !== i.format) return;
  const theme = readThemeVars();
  // prefix のキーは、スクリプトが動く形式の枠には渡さない（信頼しない中身に、利用者のキーの設定を教えない）。
  // 例外: アプリのメイン画面（拡張が出した面。`direct`）には渡す。`Esc` はアプリが使えるようにし、prefix は枠が先に受けて親へ中継する。
  const relayOn = direct.value && host?.relayKeymap !== undefined && host.runRelayedAction !== undefined;
  const k = isScript.value && !relayOn ? undefined : host?.prefixKey();
  port.postMessage({
    type: "render",
    rev: c.rev,
    format: c.format,
    source: c.content,
    theme,
    relayKeys: k ? [k] : [],
    ...(direct.value ? { direct: true } : {}),
  });
  if (isScript.value) renderSent = true;
}

function onPortMessage(ev: MessageEvent): void {
  const m = readFrameMessage(ev.data);
  if (!m) return;
  switch (m.type) {
    case "component-remove":
      if (isScript.value && m.rev === props.content?.rev) components.value.delete(m.id);
      return;
    case "component":
      if (!isScript.value || phase.value !== "connected" || m.rev !== props.content?.rev) return;
      if (!(m.component === "desktop-cdp" ? isExtensionDisplay(props.info) : terminalComponentAllowed(props.info, m.paneId, session.panes, session.tabs))) {
        components.value.delete(m.id);
        port?.postMessage({ type: "message", data: { type: "component-error", id: m.id, error: "pane_not_available" } });
        return;
      }
      if (!components.value.has(m.id) && components.value.size >= 4) return;
      components.value.set(m.id, m);
      return;
    case "pong":
      lastReply = Date.now();
      return;
    case "rejected":
      fail(DISPLAY_NOTE_UNSUPPORTED);
      return;
    case "failed":
      renderFailed.value = true;
      return;
    case "viewport-maximize":
      if(isScript.value&&phase.value==="connected"&&m.rev===props.content?.rev){if(!m.maximized||(guard.engaged&&navigator.userActivation?.isActive))void setViewportMaximized(m.maximized);else port?.postMessage({type:"message",data:{type:"viewport-state",maximized:false,reason:"user-action-required"}});}
      return;
    case "open-link":
      if(isScript.value&&guard.engaged&&m.rev===props.content?.rev&&navigator.userActivation?.isActive){
        window.open(m.url,"_blank","noopener,noreferrer");
      }
      return;
    case "action":
      controller?.sendAction(props.info.id, m.rev, m.action, m.data);
      return;
    case "key":
      if (direct.value) {
        // アプリのメイン画面: `Esc` で抜ける操作は無い（捨てる）。prefix の中継だけ受ける。
        if (m.key === "prefix") relayReply(relayStart());
        return;
      }
      if (isScript.value) {
        // 操作中の `escape` だけ受ける（prefix は受けない。操作中でなければ捨てる）。
        if (!guard.acceptKey(m.key)) return;
        guard.leave();
        syncGuardState();
        iframeEl.value
          ?.closest("[data-display-float]")
          ?.dispatchEvent(new CustomEvent("display-escape", { bubbles: true }));
        host?.focusTerminal(props.info.paneId);
        return;
      }
      // 静的な形式: フォーカスがこの枠にあるときだけ受ける。
      if (store.focusedDisplayId !== props.info.id) return;
      host?.focusTerminal(props.info.paneId);
      store.setFocused(null);
      if (m.key === "escape")
        iframeEl.value
          ?.closest("[data-display-float]")
          ?.dispatchEvent(new CustomEvent("display-escape", { bubbles: true }));
      if (m.key === "prefix") host?.injectPrefix();
      return;
    case "prefix-key":
      if (direct.value && phase.value === "connected") relayReply(relayKey(m.input));
      return;
    case "foreign-focus":
      onForeignFocus();
      return;
    case "rendered":
      renderFailed.value = false;
      return;
  }
}

// --- prefix の中継（アプリのメイン画面だけ。`PrefixRelay`）---------------------------------------------------------
function ensureRelay(): PrefixRelay | null {
  if (relay) return relay;
  const h = host;
  if (!h?.relayKeymap || !h.runRelayedAction) return null;
  relay = new PrefixRelay({
    keymap: () => h.relayKeymap!(),
    run: (action) => {
      h.runRelayedAction!(action);
      parkFocusAfterRelay(); // 端末へフォーカスを移さない（偽の切り替えで、打っている途中のキーが端末へ入らないように）
    },
  });
  return relay;
}
function relayStart(): boolean {
  return ensureRelay()?.start() ?? false;
}
function relayKey(input: Parameters<PrefixRelay["key"]>[0]): boolean {
  return ensureRelay()?.key(input) ?? false;
}
/** 待ちが続くか（番号選択の途中など）を、枠へ返す。枠は、これが偽になるまで次のキーを飲み込んで中継する。 */
function relayReply(pending: boolean): void {
  port?.postMessage({ type: "prefix-state", pending });
}

// --- 見回り（画面が見えている間だけ数える）-------------------------------------------------------------------
function startPatrol(): void {
  if (patrolTimer !== null) clearInterval(patrolTimer);
  patrolTimer = setInterval(() => {
    if (phase.value !== "connected" || document.visibilityState !== "visible") return;
    if (Date.now() - lastReply >= DISPLAY_UNRESPONSIVE_MS) {
      closeAndReport("unresponsive");
      return;
    }
    port?.postMessage({ type: "ping", n: ++pingN });
  }, DISPLAY_PING_INTERVAL_MS);
}
function onVisibility(): void {
  if (document.visibilityState === "visible") lastReply = Date.now(); // 見えるようになったら、そこから数え直す
}

// --- フォーカス ------------------------------------------------------------------------------------------
const inViewportRestore=(t:EventTarget|null):boolean=>t instanceof Element&&!!wrap.value?.contains(t)&&t.closest("[data-display-viewport-restore]")!==null;
function restoreViewport():void{if(guard.engaged)iframeEl.value?.focus();void setViewportMaximized(false);}
const inComponent = (t: EventTarget | null): boolean => t instanceof Element && !!wrap.value?.contains(t) && t.closest("[data-native-component]") !== null;
const frameHasFocus = (): boolean => iframeEl.value !== null && (document.activeElement === iframeEl.value || inComponent(document.activeElement));
// A direct app's disabled native controls cannot regain focus by themselves
// after the user visits another app or a parent control. A real pointer action
// re-enters the native surface, retaining the separate remote-control grant.
function engageDesktop(ev: PointerEvent): void {
  if (!direct.value || !ev.isTrusted || phase.value !== "connected") return;
  guard.engage();
  if (!frameHasFocus()) (ev.currentTarget as HTMLElement).focus({ preventScroll: true });
  syncGuardState();
}
function componentEscape(): void {
  guard.leave(); syncGuardState();
  iframeEl.value?.closest("[data-display-float]")?.dispatchEvent(new CustomEvent("display-escape", { bubbles: true }));
  host?.focusTerminal(props.info.paneId);
}

/** 静的な形式: フォーカスが枠にあるか（操作中の表示）。 */
function updateFocusStatic(): void {
  if (frameHasFocus()) store.setFocused(props.info.id);
  else if (store.focusedDisplayId === props.info.id) store.setFocused(null);
}
/** `guard` の状態を、画面の表示（覆い・操作中の縁）へ写す。操作中のときだけ、フォーカスが枠にある面として示す。 */
function syncGuardState(): void {
  engagedRef.value = guard.engaged;
  if (isScript.value) setFrameEngaged(props.info.id, guard.engaged);
  if (guard.engaged && guard.focused) store.setFocused(props.info.id);
  else if (store.focusedDisplayId === props.info.id) store.setFocused(null);
}

/** スクリプトが動く形式: いまのフォーカスを見て、「操作中でないのに枠が取った」に変わったときだけ、戻して知らせる。 */
function checkScriptFocus(): void {
  if (!isScript.value || iframeEl.value === null || phase.value === "closed") return;
  if (inEndButton(document.activeElement)||inViewportRestore(document.activeElement)) return;
  const verdict = guard.observe(frameHasFocus());
  syncGuardState();
  if (verdict === "steal") onSteal();
}

function onSteal(): void {
  if (handlingSteal) return;
  handlingSteal = true;
  try {
    const el = iframeEl.value;
    if (el === null) return;
    // 1. すぐ戻す（覚えた元の場所。無い・`body` なら、利用者が選んでいる pane の端末）。2. 戻ったかを確かめる（だめなら blur してもう 1 回）。
    const restored = restoreFocus(el, () => host?.focusSelectedTerminal());
    noteFocusRestored(); // 遮断器の数に入れる（落とし続ける面は、枠が取る回と body へ落とす回が交互に来る）
    guard.observe(frameHasFocus());
    syncGuardState();
    // 3. 画面が見えていれば、サーバへ「1 回取られた」と知らせる（サーバが pane ごとに数える）。送れなかったとき（切断中）は、この画面の中で数える。
    reportSteal();
    // それでも戻らなければ、この画面の枠を外す。
    if (!restored) detach();
  } finally {
    handlingSteal = false;
  }
}
function reportSteal(): void {
  if (document.visibilityState !== "visible") return;
  const ctx = { paneId: props.info.paneId, format: props.info.format };
  const p = controller?.report(props.info.id, "focus_steal", ctx);
  if (p === undefined) {
    if (guard.noteUnreported()) detach();
    return;
  }
  void p.then((sent) => {
    if (!sent && guard.noteUnreported()) detach();
  });
}
/** フォーカスを取り続けるので、この画面では枠を外す（固定の文言と［もう一度出す］）。 */
function detach(note: string = DISPLAY_NOTE_FOCUS_DETACHED): void {
  if (phase.value === "closed") return;
  fail(note);
  detached.value = true;
}
function redisplay(): void {
  start();
}

/** 静的な枠が「よそからフォーカスが来た」と知らせた。利用者が `Tab` で入ったのでも、こちらが移したのでもなければ、元の場所へ戻す（回数には数えない）。 */
function onForeignFocus(): void {
  if (isScript.value) return;
  // 脅威は、スクリプトが動く枠が、兄弟の静的な枠へフォーカスを移すことだけ。いま画面にスクリプトが動く枠が載っていなければ、静的な面は何も戻さない（支援技術・音声操作・拡張機能の
  // プログラムによるフォーカスを、追い出さない）。
  if (scriptFrameCount() === 0) return;
  const now = Date.now();
  // 利用者が入ったと見られるものは戻さない: 直前の Tab・こちらが移した直後・別のウィンドウ／タブ／ブラウザの UI（アドレスバーからの Tab を含む）から戻った直後。
  // 見分けられない場合は、戻さない側に倒す（限界。docs に書く）。
  if (
    now - lastOwnFocusAt < OWN_FOCUS_IGNORE_MS ||
    tabPressedWithin(TAB_IGNORE_MS) ||
    documentRegainedFocusWithin(TAB_IGNORE_MS * 2)
  )
    return;
  const el = iframeEl.value;
  if (el === null || !frameHasFocus()) return;
  restoreFocus(el, () => host?.focusSelectedTerminal());
  updateFocusStatic();
}

/** スクリプトが動く枠のときだけ、フォーカスの見回りを回す（イベントが起きないブラウザへの備え）。 */
function syncFocusPatrol(): void {
  if (isScript.value && page.value !== null && focusTimer === null) {
    focusTimer = setInterval(checkScriptFocus, FOCUS_PATROL_MS);
  } else if ((!isScript.value || page.value === null) && focusTimer !== null) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
}

/** 画面に載っているスクリプトが動く枠として登録する（静的な枠の `foreign-focus` の戻しと、フォーカスの脱落の見回りは、これが 1 つ以上あるときだけ働く）。 */
function syncScriptRegistration(): void {
  if (isScript.value && page.value !== null && phase.value !== "closed") {
    registerScriptFrame(props.info.id, {
      paneId: props.info.paneId,
      format: props.info.format,
      name: props.info.name,
      stop: () => detach(DISPLAY_NOTE_BREAKER),
    });
    startFocusDropWatch({
      focusSelectedTerminal: () => host?.focusSelectedTerminal(),
      notify: (message) => controller?.toast?.(message),
      trip: () => {
        stopAllScriptFrames();
        host?.focusSelectedTerminal();
        controller?.toast?.(`${DISPLAY_NOTE_BREAKER}（各表示の［再開］で戻せます）`);
      },
    });
  } else {
    unregisterScriptFrame(props.info.id);
    if (scriptFrameCount() === 0) stopFocusDropWatch();
  }
}

function onFocusSignal(): void {
  if (isScript.value) checkScriptFocus();
  else updateFocusStatic();
}
/**
 * フォーカスが動いている最中のイベント（`blur`・`focus`・`focusout`）では、`document.activeElement` がまだ前の要素（枠）のままのことがある
 * （枠から親の端末へ戻すとき、`focus` が来た時点でも iframe を指している〔実測〕）。そのまま見ると、戻したばかりの枠を「取った」と誤って数えるので、1 拍置いて見る。
 */
function onWindowBlur(): void {
  setTimeout(onFocusSignal, 0);
}
const inEndButton = (t: EventTarget | null): boolean =>
  t instanceof Element && t.closest("[data-display-end]") !== null;
function onDocFocusIn(ev: Event): void {
  // ［操作を終える］ボタンへ移ったのは、操作を終える途中（その `click` が終える）。ここで終えると、ボタンが消えて `click` が届かない。
  if (isScript.value && (inEndButton(ev.target)||inViewportRestore(ev.target))) return;
  if (isScript.value && ev.target !== iframeEl.value && !inComponent(ev.target)) {
    // 枠でない要素にフォーカスが移った: 操作を終える。そのあとで枠が取り返したら、新しい「取った」（1 拍置いて見る）。
    guard.leave();
    setTimeout(onFocusSignal, 0);
    return;
  }
  onFocusSignal();
}
/** 操作中に、枠でない場所を押した（フォーカスを受けない余白を含む）: 操作を終える。枠が自分の `blur` で取り返しても、次の見回りで「取った」と分かる。 */
function onDocPointerDown(ev: Event): void {
  if (!isScript.value || !guard.engaged) return;
  const t = ev.target;
  if (inComponent(t)||inViewportRestore(t)) return;
  if (t instanceof Node && (t === iframeEl.value || iframeEl.value?.contains(t))) return;
  // ［操作を終える］ボタンの押下は、ここで終えない（終えるとボタンが消えて、`click` が届かない）。ボタンの `click` が終える。
  if (t instanceof Element && t.closest("[data-display-end]")) return;
  guard.leave();
  syncGuardState();
  setTimeout(checkScriptFocus, 0);
}

// --- 操作を始める（スクリプトが動く形式）-----------------------------------------------------------------------
/** 操作を始める: 覆いを外し、枠へフォーカスを移す。 */
function engageNow(): void {
  const el = iframeEl.value;
  if (!isScript.value || el === null || phase.value === "closed") return;
  guard.engage();
  el.focus();
  port?.postMessage({ type: "focus" });
  guard.observe(frameHasFocus());
  syncGuardState();
}
function onCoverClick(): void {
  if (coverStartsEngage()) startFromCover(engageNow);
  else store.nudgeEngage(props.info.id); // 押しても始まらない。［操作する］ボタンを 1 秒だけ強調して、場所を教える
}
function onCoverWheel(ev: WheelEvent): void {
  const scale = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
  port?.postMessage({ type: "scroll", dx: ev.deltaX * scale, dy: ev.deltaY * scale });
}

const handle: RegisteredFrame = {
  focusInside() {
    if (direct.value) {
      engageNow();
      return;
    }
    if (isScript.value) {
      // `prefix+i`: そのキーが上がる（`keyup`）のを親が受けてから始める。
      startFromKey(engageNow);
      return;
    }
    lastOwnFocusAt = Date.now();
    iframeEl.value?.focus();
    port?.postMessage({ type: "focus" });
    updateFocusStatic();
  },
  engageFromButton(ev) {
    if (isScript.value) startFromButton(ev, engageNow);
  },
  endEngage() {
    if (!isScript.value || !guard.engaged) return;
    guard.leave();
    syncGuardState();
    host?.focusTerminal(props.info.paneId);
    if (document.activeElement === iframeEl.value) iframeEl.value?.blur();
  },
};

onMounted(() => {
  componentResize = new ResizeObserver(() => {
    viewport.value = { width: wrap.value?.clientWidth ?? 0, height: wrap.value?.clientHeight ?? 0 };
  });
  if (wrap.value) componentResize.observe(wrap.value);
  installFocusOriginTracking();
  window.addEventListener("message", onWindowMessage);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", onWindowBlur);
  window.addEventListener("focusin", onDocFocusIn);
  window.addEventListener("focusout", onWindowBlur);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("visibilitychange", onVisibility);
  syncFocusPatrol();
  registerFrame(props.info.id, handle);
  syncScriptRegistration();
  // `sodactl display send` のデータを、スクリプトが動く枠へ渡す（保存しない。いま描いている枠だけ）。
  offMessage =
    controller?.onMessage(props.info.id, (data) => {
      if (isScript.value && port && phase.value === "connected")
        port.postMessage({ type: "message", data });
    }) ?? null;
});
// 合い札・待ちの時計は、最初の描画の前（setup）で用意する（描画の後に作り直すと iframe が作り直される）。
start();
onBeforeUnmount(() => {
  componentResize?.disconnect();
  window.removeEventListener("message", onWindowMessage);
  window.removeEventListener("blur", onWindowBlur);
  window.removeEventListener("focus", onWindowBlur);
  window.removeEventListener("focusin", onDocFocusIn);
  window.removeEventListener("focusout", onWindowBlur);
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("visibilitychange", onVisibility);
  if (focusTimer !== null) clearInterval(focusTimer);
  focusTimer = null;
  offMessage?.();
  unregisterFrame(props.info.id, handle);
  unregisterScriptFrame(props.info.id);
  if (scriptFrameCount() === 0) stopFocusDropWatch();
  // 片づけのとき（面が閉じた・版や形式が替わって部品が外れる）、操作中でないのにフォーカスが枠にあれば、元の場所へ戻して「取られた」と 1 回知らせてから外す
  // （取ってから、見回りが気づく前に `close`・版の置き換えで枠を外させる、という逃げ方をさせない）。合い札の合わない合図・時間切れでは送らない。
  const el = iframeEl.value;
  relay?.dispose();
  relay = null;
  if (
    isScript.value &&
    !direct.value &&
    el !== null &&
    phase.value !== "closed" &&
    !guard.engaged &&
    frameHasFocus()
  ) {
    restoreFocus(el, () => host?.focusSelectedTerminal());
    reportSteal();
  }
  clearTimers();
  closePort();
  releaseFocus();
});

// 形式が替わったら iframe を作り直す（置く側の `:key` に加えた、二重の守り）。スクリプトが動く形式は版が替わっても作り直す（`render` は 1 回だけ）。
watch(
  () => props.info.format,
  () => {
    releaseFocus();
    start();
  },
);
watch(
  () => props.info.rev,
  () => {
    if (isScript.value) {
      releaseFocus();
      start();
    }
  },
);
// 設定・名乗りで、枠を出してよいかが変わった（頁が決まる／決まらなくなる）: 枠を最初の状態から作り直す。
watch(
  () => page.value === null,
  () => {
    releaseFocus();
    start();
  },
);
// 中身が無い・版が古いときは取る。枠を出してよいか（`page`。設定の読み込みが面の見出しより遅れることがある）が変わったときも取る。
watch(
  () => [props.info.id, props.info.rev, props.info.format, page.value !== null] as const,
  () => {
    const c = props.content;
    if (page.value && (!c || c.rev !== props.info.rev || c.format !== props.info.format))
      void controller?.ensureContent(props.info.id);
  },
  { immediate: true },
);
watch(() => [props.content, props.info.rev, props.info.format, phase.value], sendRender);
watch(() => [isScript.value, page.value, phase.value], syncScriptRegistration);
watch(direct, (d) => {
  guard.direct = d;
});

defineExpose({ key: () => frameKey(props.info) });
</script>

<template>
  <div
    ref="wrap"
    class="display-frame-wrap"
    :class="{'display-viewport-maximized':viewportMaximized}"
    :popover="viewportMaximized?'manual':undefined"
    :data-display-phase="phase"
    :data-display-engaged="isScript ? (engagedRef ? '1' : '0') : undefined"
    :data-display-direct="direct ? '' : undefined"
  >
    <button v-if="viewportMaximized" type="button" class="display-viewport-restore" data-display-viewport-restore @mousedown.prevent @click="restoreViewport">元の表示へ戻す</button>
    <iframe
      v-if="page && phase !== 'closed'"
      :key="gen"
      ref="iframeEl"
      class="display-frame"
      :class="{ 'display-frame-script': isScript }"
      :sandbox="page.sandbox"
      referrerpolicy="no-referrer"
      :src="src"
      :title="
        isScript ? 'pane のプログラムの表示（隔離・スクリプト）' : 'pane のプログラムの表示（隔離）'
      "
      :tabindex="isScript ? -1 : undefined"
      data-display-frame
      :data-display-script="isScript ? '' : undefined"
      :data-display-loads="loads"
      @load="onLoad"
    ></iframe>
    <div v-for="c in permittedComponents" :key="`${gen}:${c.id}:${c.paneId}`" class="native-component" :style="componentStyle(c)" data-native-component tabindex="-1" @pointerdown.capture="c.component === 'desktop-cdp' && engageDesktop($event)">
      <DesktopCdpView v-if="c.component === 'desktop-cdp'" :key="desktopMachines.selectedId" :machine-id="desktopMachines.selectedId" :machine-label="desktopMachines.sections.find(s => s.id === desktopMachines.selectedId)?.label ?? desktopMachines.selectedId" :enabled="engagedRef" :style="terminalStyle(c)" />
      <EmbeddedTerminal v-else :pane-id="c.paneId" :interactive="c.interactive === true" :enabled="engagedRef"
        :can-input="() => guard.engaged && phase === 'connected' && terminalComponentAllowed(info, c.paneId, session.panes, session.tabs)"
        :style="terminalStyle(c)" @escape="componentEscape" />
    </div>
    <div
      v-if="showCover"
      class="display-frame-cover"
      aria-hidden="true"
      data-display-cover
      @mousedown.prevent
      @pointerdown="store.nudgeEngage(info.id)"
      @click="onCoverClick"
      @wheel.passive="onCoverWheel"
    ></div>
    <p
      v-if="renderFailed && phase === 'connected'"
      class="display-frame-note"
      data-display-render-failed
    >
      {{ DISPLAY_NOTE_RENDER_FAILED }}
    </p>
    <p
      v-if="store.contentFailed.has(info.id)"
      class="display-frame-note"
      data-display-content-failed
    >
      {{ DISPLAY_NOTE_CONTENT_FAILED }}
    </p>
    <p v-if="visibleNote" class="display-frame-note" data-display-note>
      {{ visibleNote }}
      <button
        v-if="detached"
        type="button"
        class="display-frame-redisplay"
        data-display-redisplay
        @click="redisplay"
      >
        {{ note === DISPLAY_NOTE_BREAKER ? "再開" : "もう一度出す" }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.display-frame-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.display-viewport-maximized{position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100dvh;max-width:none;max-height:none;background:var(--soda-bg);overflow:hidden}.display-viewport-restore{position:absolute;bottom:8px;right:8px;z-index:10;padding:6px 10px;border:1px solid var(--soda-menu-border);background:var(--soda-menu-bg);color:var(--soda-fg);border-radius:6px}.display-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--soda-bg, #1e1f29);
}
.native-component { position: absolute; overflow: hidden; }
/* 覆い: 操作を始める前の枠の上。ポインタのイベントは受けるが、枠の中へは届かない（アプリの DOM）。 */
.display-frame-cover {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: transparent;
  cursor: default;
}
.display-frame-note {
  margin: 0;
  padding: 0.5em 0.8em;
  font-size: 0.85em;
  color: var(--soda-fg, #f8f8f2);
  opacity: 0.8;
}
.display-frame-redisplay {
  font: inherit;
  margin-left: 0.5em;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 4px;
  cursor: pointer;
}
</style>
