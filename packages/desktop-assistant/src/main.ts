import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  screen,
  session,
  Tray,
} from "electron";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DesktopAssistantPreferences, type AssistantNotice } from "@sodashitsu/protocol";
import { AssistantRpc } from "./assistantRpc.js";
import { AssistantChat, type AssistantChatState } from "./assistantChat.js";
import { deviceIdentity } from "./deviceIdentity.js";
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
  ["/bubble.html", "text/html"],
  ["/character.js", "text/javascript"],
  ["/settings.js", "text/javascript"],
  ["/bubble.js", "text/javascript"],
  ["/style.css", "text/css"],
  ["/captain-male.svg", "image/svg+xml"],
  ["/captain-female.svg", "image/svg+xml"],
  ["/captain-robot.svg", "image/svg+xml"],
]);
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
let tray: Tray | null = null;
let character: BrowserWindow | null = null;
let settings: BrowserWindow | null = null;
let panel: BrowserWindow | null = null;
let bubble: BrowserWindow | null = null;
let bubbleCharacterId: string | null = null;
let control: AssistantRpc | null = null;
let assistantChat: AssistantChat | null = null;
let controlOrigin: string | null = null;
let installationId: string;
let chatRevision = 0;
let backend: NoticeConnection | null = null;
let backendOrigin: string | null = null;
let notices: readonly AssistantNotice[] = [];
let inboxRevision = 0;
let noticeStatus: "connecting" | "connected" | "login" | "offline" | "disabled" = "disabled";
let controller: AssistantController;
let quitting = false;
let settingsRequested = false;
const localWindows = new Map<number, { window: BrowserWindow; role: LocalRole }>();

function localWindow(role: LocalRole): BrowserWindow {
  const win = new BrowserWindow({
    width: role === "settings" ? 520 : role === "bubble" ? 400 : 192,
    height: role === "settings" ? 670 : role === "bubble" ? 500 : 192,
    show: false,
    title: "操舵室アシスタント",
    frame: role === "settings",
    transparent: role !== "settings",
    resizable: role === "settings",
    focusable: role !== "character",
    skipTaskbar: role !== "settings",
    alwaysOnTop: role !== "settings",
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: "assistant-local",
      webSecurity: true,
    },
  });
  const id = win.webContents.id;
  localWindows.set(id, { window: win, role });
  win.on("closed", () => localWindows.delete(id));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadURL(`${LOCAL_ORIGIN}/${role}.html`).catch(() => {
    if (!win.isDestroyed()) win.destroy();
  });
  return win;
}

/** Explicit user action focuses chat; a future notice presentation uses showInactive. */
function openBubble(focus = true): void {
  if (!controller.preferences.enabled) return;
  if (bubble && !bubble.isDestroyed()) {
    if (focus) {
      bubble.show();
      bubble.focus();
    } else bubble.showInactive();
    return;
  }
  const win = localWindow("bubble");
  bubble = win;
  bubbleCharacterId = controller.preferences.characterId;
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(400, area.width);
  const height = Math.min(500, area.height);
  win.setBounds({
    x: area.x + area.width - width,
    y: area.y + area.height - height - Math.min(192, Math.max(0, area.height - height)),
    width,
    height,
  });
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      if (focus) {
        win.show();
        win.focus();
      } else win.showInactive();
    }
  });
  win.on("closed", () => {
    if (bubble === win) bubble = null;
  });
}

function inbox() {
  return { notices, status: noticeStatus, revision: inboxRevision };
}
function publishInbox(): void {
  ++inboxRevision;
  if (bubble && !bubble.isDestroyed()) bubble.webContents.send("assistant:inbox-changed", inbox());
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
    control?.stop();
    assistantChat?.stop();
    control = null;
    assistantChat = null;
    controlOrigin = null;
  }
  if (!preferences.enabled || control) return;
  const origin = preferences.serverOrigin;
  const rpc = new AssistantRpc(origin, {
    cookie: async () =>
      sodaCookieHeader(
        await session
          .fromPartition("persist:assistant-server")
          .cookies.get({ url: `${origin}/ws` }),
      ),
    status: (connected) => {
      if (control === rpc) assistantChat?.connection(connected);
    },
    changed: () => {
      if (control === rpc) void assistantChat?.refresh();
    },
  });
  assistantChat = new AssistantChat(
    installationId,
    rpc,
    (state) => {
      chatRevision = state.revision;
      if (bubble && !bubble.isDestroyed())
        bubble.webContents.send("assistant:conversation-changed", state);
    },
    chatRevision,
  );
  control = rpc;
  controlOrigin = origin;
  rpc.start();
}
function updateBackend(preferences: DesktopAssistantPreferences): void {
  updateChat(preferences);
  if (!preferences.enabled || backendOrigin !== preferences.serverOrigin) {
    backend?.stop();
    backend = null;
    backendOrigin = null;
    notices = [];
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
      notices = next;
      if (added && !controller.preferences.mute) openBubble(false);
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
    settings.show();
    settings.focus();
    return;
  }
  settings = localWindow("settings");
  settings.once("ready-to-show", () => settings?.show());
  settings.on("closed", () => {
    settings = null;
  });
}

function openPanel(origin: string): void {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return;
  }
  // Remote Soda gets an ordinary isolated browser session, never the native preload.
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    title: "操舵室",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:assistant-server",
      webSecurity: true,
      webviewTag: false,
    },
  });
  panel = win;
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!sameServerNavigation(url, origin)) event.preventDefault();
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (!sameServerNavigation(url, origin)) event.preventDefault();
  });
  win.on("closed", () => {
    if (panel === win) panel = null;
  });
  void win.loadURL(origin).catch(() => {
    if (!win.isDestroyed())
      void win.loadURL(
        `data:text/plain;charset=utf-8,${encodeURIComponent("操舵室に接続できません。サーバの起動と、アシスタント設定の接続先を確認してください。")}`,
      );
  });
}

const adapter: NativeAdapter = {
  displays: () =>
    screen
      .getAllDisplays()
      .map((display) => ({ id: String(display.id), workArea: display.workArea })),
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
    updateBackend(preferences);
    if (bubble && bubbleCharacterId !== preferences.characterId) {
      bubble.destroy();
      bubble = null;
      bubbleCharacterId = null;
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
            app.quit();
          },
        },
      ]),
    );
  },
  closePanel() {
    panel?.destroy();
    panel = null;
    bubble?.destroy();
    bubble = null;
  },
  openPanel,
  startup(enabled) {
    if (enabled && (process.platform !== "win32" || !app.isPackaged))
      throw new Error("自動起動はWindows配布版で設定してください");
    if (process.platform === "win32" && app.isPackaged)
      app.setLoginItemSettings({ openAtLogin: enabled });
  },
};

function registerIpc(): void {
  for (const action of [
    "read",
    "save",
    "open",
    "settings",
    "chat",
    "hide",
    "inbox",
    "conversation",
    "start-session",
    "adopt-session",
    "send-message",
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
      if (action === "read") return controller.preferences;
      if (action === "inbox") return inbox();
      if (action === "conversation") return chatState();
      if (["start-session", "adopt-session", "send-message"].includes(action)) {
        if (!assistantChat || !controller.preferences.enabled)
          throw Error("アシスタントは接続していません。");
        if (action === "start-session") return assistantChat.start(input);
        if (action === "adopt-session") return assistantChat.adopt(input);
        return assistantChat.send(input);
      }
      if (action === "save") return controller.update(input);
      if (action === "chat") {
        openBubble();
        return;
      }
      if (action === "hide") {
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

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (controller) openSettings();
    else settingsRequested = true;
  });
  app.on("window-all-closed", () => {
    /* Remain accessible through Tray on all platforms. */
  });
  app.on("before-quit", () => {
    quitting = true;
    backend?.stop();
    backend = null;
    control?.stop();
    assistantChat?.stop();
  });
  app.on("activate", () => {
    if (!quitting && controller) openSettings();
  });
  void app
    .whenReady()
    .then(async () => {
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
        isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        isolated.setPermissionCheckHandler(() => false);
        isolated.on("will-download", (event) => event.preventDefault());
      }
      installationId = await deviceIdentity(join(app.getPath("userData"), "assistant-device-id"));
      const file = new PreferencesFile(join(app.getPath("userData"), "assistant.json"));
      let preferences: DesktopAssistantPreferences;
      try {
        preferences = await file.read();
      } catch (error) {
        console.error(
          "アシスタント設定を読み込めません。元のファイルを保存したまま無効で開始します。",
          error,
        );
        preferences = DesktopAssistantPreferences.parse({});
      }
      controller = new AssistantController(preferences, adapter, (next) => file.write(next));
      session.fromPartition("persist:assistant-server").cookies.on("changed", (_event, cookie) => {
        if (isSodaSessionCookie(cookie.name)) {
          backend?.reconnect();
          control?.reconnect();
        }
      });
      registerIpc();
      controller.initialize();
      screen.on("display-added", () => controller.refreshDisplays());
      screen.on("display-removed", () => controller.refreshDisplays());
      screen.on("display-metrics-changed", () => controller.refreshDisplays());
      // Disabled by default: first launch presents settings instead of launching a model/session.
      if (!preferences.enabled || settingsRequested) openSettings();
    })
    .catch((error) => {
      console.error(error);
      app.quit();
    });
}
