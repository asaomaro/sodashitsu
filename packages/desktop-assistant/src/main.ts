import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  screen,
  session,
  Tray,
  type WebContents,
} from "electron";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DesktopAssistantPreferences, type AssistantNotice } from "@sodashitsu/protocol";
import { AssistantRpc } from "./assistantRpc.js";
import { AssistantChat, type AssistantChatState } from "./assistantChat.js";
import { deviceIdentity } from "./deviceIdentity.js";
import { NotesFile, NoteSave } from "./notes.js";
import { Transcription, AUDIO_LIMIT } from "./transcription.js";
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
  ["/bubble.html", "text/html"],
  ["/character.js", "text/javascript"],
  ["/settings.js", "text/javascript"],
  ["/bubble.js", "text/javascript"],
  ["/tools.js", "text/javascript"],
  ["/recording.js", "text/javascript"],
  ["/ocr.js", "text/javascript"],
  ["/reminders.js", "text/javascript"],
  ["/style.css", "text/css"],
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
let bubble: BrowserWindow | null = null;
let bubbleCharacterId: string | null = null;
let bubbleEpoch = 0;
let panelTargeted = false;
let panelNavigation = 0;
let control: AssistantRpc | null = null;
let assistantChat: AssistantChat | null = null;
let controlOrigin: string | null = null;
let installationId: string;
let chatRevision = 0;
let notesFile: NotesFile;
let transcription: Transcription;
let recording: RecordingLease;
let ocr: Ocr;
let reminders: Reminders | null = null;
let reminderRevision = 0;
let recordingOrigin: string | null = null;
let toolsRevision = 0;
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
    height: role === "settings" ? 670 : role === "bubble" ? 640 : 192,
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
  const discardOnHide = () => {
    if (role === "bubble") {
      ++bubbleEpoch;
      ocr?.discard(id);
    }
    if (role === "bubble" && recording?.has(id)) {
      recording.cancel(id);
      if (!win.isDestroyed()) win.destroy(); // End capture even if the hidden renderer cannot respond.
    }
  };
  win.on("hide", discardOnHide);
  win.on("minimize", discardOnHide);
  win.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) discardOnHide();
  });
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
  ++bubbleEpoch;
  const win = localWindow("bubble");
  const contentsId = win.webContents.id;
  bubble = win;
  bubbleCharacterId = controller.preferences.characterId;
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(400, area.width);
  const height = Math.min(640, area.height);
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
    if (bubble === win) {
      ++bubbleEpoch;
      recording?.cancel(contentsId);
      transcription?.cancel();
      ocr?.discard(contentsId);
      bubble = null;
    }
  });
}

async function toolsState(revision = toolsRevision) {
  const state = transcription.snapshot();
  const preferences = controller.preferences;
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
  };
}
async function publishTools(): Promise<void> {
  if (quitting) return;
  const revision = ++toolsRevision;
  const state = await toolsState(revision);
  if (bubble && !bubble.isDestroyed()) bubble.webContents.send("assistant:tools-changed", state);
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
    reminders?.stop();
    reminders = null;
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
      if (control === rpc) {
        assistantChat?.connection(connected);
        reminders?.connection(connected);
      }
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
  reminders = new Reminders(
    installationId,
    rpc,
    (state, added) => {
      reminderRevision = state.revision;
      if (added && !controller.preferences.mute) openBubble(false);
      if (bubble && !bubble.isDestroyed())
        bubble.webContents.send("assistant:reminders-changed", state);
    },
    reminderRevision,
  );
  control = rpc;
  controlOrigin = origin;
  rpc.start();
}
function updateBackend(preferences: DesktopAssistantPreferences): void {
  ocr.configure(
    preferences.enabled && preferences.ocrEnabled,
    preferences.ocrExecutable,
    preferences.ocrLanguage,
  );
  if (
    recording?.has() &&
    (!preferences.enabled ||
      !preferences.transcriptionEnabled ||
      recordingOrigin !== preferences.transcriptionOrigin)
  ) {
    recording.cancel();
    bubble?.destroy();
  }
  transcription.configure(
    preferences.enabled && preferences.transcriptionEnabled,
    preferences.transcriptionOrigin,
  );
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

function loadPanel(win: BrowserWindow, url: string): void {
  const navigation = ++panelNavigation;
  void win.loadURL(url).catch(() => {
    if (win !== panel || win.isDestroyed() || navigation !== panelNavigation) return;
    void win
      .loadURL(
        `data:text/plain;charset=utf-8,${encodeURIComponent("操舵室に接続できません。サーバと接続先を確認し、吹き出しから開き直してください。")}`,
      )
      .catch(() => {});
  });
}
function openPanel(
  origin: string,
  target?: { paneId: string; workspaceId: string; instanceId: string },
): void {
  const url = new URL(origin);
  if (target)
    url.hash = new URLSearchParams({
      assistantPane: target.paneId,
      assistantWorkspace: target.workspaceId,
      assistantInstance: target.instanceId,
    }).toString();
  if (panel && !panel.isDestroyed()) {
    if (target || panelTargeted) loadPanel(panel, url.href);
    panelTargeted = !!target;
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
  panelTargeted = !!target;
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
  loadPanel(win, url.href);
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
    owner.role !== "bubble" ||
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
    "ocr-clipboard",
    "ocr-crop",
    "ocr-run",
    "ocr-discard",
    "tools",
    "note-save",
    "note-delete",
    "transcribe-file",
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
      if (action === "read") return controller.preferences;
      if (action === "inbox") return inbox();
      if (action === "conversation") return chatState();
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
        const state = chatState();
        const info = state.session;
        if (!info?.agent || !state.connected) throw Error("専用セッションを確認してください。");
        openPanel(controller.preferences.serverOrigin, {
          paneId: info.paneId,
          workspaceId: info.workspaceId,
          instanceId: info.agent.instanceId,
        });
        return;
      }
      if (action.startsWith("source-")) {
        if (!owner.window.isVisible()) throw Error("吹き出しを開いて操作してください。");
        const epoch = bubbleEpoch;
        const request = z
          .object({
            noticeId: z.uuid(),
            text: z.string().trim().min(1).max(8192).optional(),
            keyName: z.enum(["Enter", "Escape", "y", "n"]).optional(),
          })
          .strict()
          .parse(input);
        const notice = notices.find((notice) => notice.id === request.noticeId);
        const rpc = control;
        if (
          !notice ||
          !rpc ||
          !controller.preferences.enabled ||
          notice.source.serverOrigin !== controller.preferences.serverOrigin
        )
          throw Error("通知の対象が変更されました。");
        const params = { source: notice.source, key: notice.key };
        if (action === "source-open") {
          const target = await rpc.request("assistant.source", params);
          if (
            control !== rpc ||
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
          });
          return;
        }
        if (action === "source-reply") {
          if (!request.text) throw Error("返答を入力してください。");
          return rpc.request("assistant.reply", { ...params, text: request.text });
        }
        if (!request.keyName) throw Error("確認キーを指定してください。");
        return rpc.request("assistant.reply_key", { ...params, keyName: request.keyName });
      }
      if (action.startsWith("ocr-")) {
        if (action === "ocr-state") return ocr.snapshot();
        if (!controller.preferences.enabled || !owner.window.isVisible())
          throw Error("吹き出しを開いて操作してください。");
        const id = event.sender.id;
        if (action === "ocr-discard") return ocr.discard(id);
        if (action === "ocr-file" || action === "ocr-clipboard")
          return ocr.input(id, action === "ocr-file" ? "file" : "clipboard");
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
          throw Error("表示中の吹き出しで、ローカル文字起こしを有効にしてから録音してください。");
        const id = event.sender.id;
        if (action === "record-start") {
          if (transcription.isBusy()) throw Error("前の文字起こしが完了するまでお待ちください。");
          const token = recording.begin(id);
          if (owner.window.isDestroyed()) {
            recording.cancel(id);
            throw Error("吹き出しが閉じられました。");
          }
          recordingOrigin = controller.preferences.transcriptionOrigin;
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
        return transcription.recorded(
          {
            name: `recording.${suffix}`,
            mime: request.mime,
            bytes: new Uint8Array(request.bytes),
          },
          request.token,
        );
      }
      if (
        [
          "note-save",
          "note-delete",
          "transcribe-file",
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
        transcription.cancel();
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
    reminders?.stop();
    transcription?.cancel();
    recording?.cancel();
    ocr?.discard();
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
        isolated.setPermissionRequestHandler((contents, permission, callback, details) => {
          callback(
            partition === "assistant-local" && microphonePermission(contents, permission, details),
          );
        });
        isolated.setPermissionCheckHandler((contents, permission, _origin, details) => {
          return (
            partition === "assistant-local" && microphonePermission(contents, permission, details)
          );
        });
        isolated.on("will-download", (event) => event.preventDefault());
      }
      installationId = await deviceIdentity(join(app.getPath("userData"), "assistant-device-id"));
      notesFile = new NotesFile(join(app.getPath("userData"), "assistant-notes.json"));
      transcription = new Transcription({
        pick: async () => {
          const owner = bubble;
          if (!owner || owner.isDestroyed()) return null;
          const selection = await dialog.showOpenDialog(owner, {
            title: "このPCのWhisperで文字起こしする音声を選択",
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
      const ocrRunner = new OcrRunner();
      ocr = new Ocr({
        changed: (state) => {
          if (bubble && !bubble.isDestroyed())
            bubble.webContents.send("assistant:ocr-changed", state);
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
