import { EventEmitter } from "node:events";
import { createHash,randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  nextLoad:null as null|(()=>Promise<void>),
  deferReady:false,
  audioRead:null as null|((path:string,signal?:AbortSignal)=>Promise<import("./transcription.js").AudioFile>),
  displayRequests: new Map<string, (request: any, callback: (value: any) => void) => void>(),
  permissionChecks: new Map<string, (...args: any[]) => boolean>(),
  permissionRequests: new Map<string, (...args: any[]) => void>(),
  controls: [] as Array<{
    options: { status: (connected: boolean) => void; prefsChanged?:(state:{rev:number;prefs:Record<string,unknown>})=>void };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  }>,
  connections: [] as Array<{
    feed:{agents:import("./noticeFeed.js").AssistantAgentRow[]};
    options: {
      cookie: () => Promise<string | null>;
      changed: (notices: unknown[], added: boolean) => void;
      status: (status: string) => void;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    reconnect: ReturnType<typeof vi.fn>;
  }>,
  protocols: new Map<string, (request: Request) => Promise<Response>>(),
  handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(),
  partitions: new Map<
    string,
    {
      protocol: {
        handle: (scheme: string, handler: (request: Request) => Promise<Response>) => void;
      };
      setDisplayMediaRequestHandler: ReturnType<typeof vi.fn>;
      setPermissionRequestHandler: ReturnType<typeof vi.fn>;
      setPermissionCheckHandler: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      cookies: EventEmitter & { get: ReturnType<typeof vi.fn> };
    }
  >(),
  windows: [] as Array<MockWindow>,
  directory: "",
  fullscreenQuery: vi.fn(async () => false),
  quit: vi.fn(),
  startup: vi.fn(),
  audioFetch:vi.fn(async () => Response.json({ text: "generated recording transcription" })),
  speech:vi.fn(async (_text:string,_signal:AbortSignal,started?:()=>void)=>{started?.();}),
  wavPlay:vi.fn(async(_wav:Uint8Array,_signal:AbortSignal,_platform?:unknown,_run?:unknown,started?:()=>void)=>{started?.();}),
}));
class MockView {
 static count=0;
 url="";destroyed=false;bounds={x:0,y:0,width:0,height:0};
 constructor(readonly options:Record<string,unknown>){ }
 setBackgroundColor=vi.fn();
 setBounds=vi.fn((bounds:typeof this.bounds)=>{this.bounds=bounds;});
 readonly webContents=Object.assign(new EventEmitter(),{
   id:10000+(++MockView.count),mainFrame:{url:""},setWindowOpenHandler:vi.fn(),invalidate:vi.fn(),focus:vi.fn(),
   isDestroyed:()=>this.destroyed,close:vi.fn(()=>{this.destroyed=true;}),
   loadURL:vi.fn(async(url:string)=>{this.url=url;this.webContents.mainFrame.url=url;}),
 });
}
const remoteOf=(window:MockWindow)=>window.contentView.children[0]!;
class MockWindow extends EventEmitter {
  destroyed = false;
  visible = false;
  url = "";
  readonly webContents = Object.assign(new EventEmitter(), {
    id: fixture.windows.length + 1,
    mainFrame: { url: "" },
    setWindowOpenHandler: vi.fn(),
    invalidate:vi.fn(),
    send: vi.fn(),
  });
  constructor(readonly options: Record<string, unknown>) {
    super();
    fixture.windows.push(this);
  }
  async loadURL(url: string) {
    this.url = url;
    this.webContents.mainFrame.url = url;
    if(!fixture.deferReady)queueMicrotask(() => this.emit("ready-to-show"));
    const delayed=fixture.nextLoad;fixture.nextLoad=null;if(delayed)await delayed();
  }
  close(){this.destroy();}
  isDestroyed() {
    return this.destroyed;
  }
  destroy() {
    this.destroyed = true;
    this.visible = false;
    this.emit("closed");
  }
  contentView={children:[] as MockView[],addChildView:(view:MockView)=>{this.contentView.children.push(view);}};
  bounds = {x:0,y:0,width:400,height:640};
  getBounds = () => ({...this.bounds});
  setBounds = vi.fn((value: typeof this.bounds) => {this.bounds={...value};this.emit("resize");});
  menu:unknown="default";
  setMenu=vi.fn(value=>{this.menu=value;});
  setAlwaysOnTop=vi.fn();
  minimized=false;maximized=false;
  minimize=vi.fn(()=>{this.minimized=true;this.emit("minimize");});
  maximize=vi.fn(()=>{this.maximized=true;});
  unmaximize=vi.fn(()=>{this.maximized=false;});
  isMaximized(){return this.maximized;}
  isMinimized(){return false;}
  restore=vi.fn();
  isVisible() {
    return this.visible;
  }
  show = vi.fn(() => {
    this.visible = true;
  });
  showInactive = vi.fn(() => {
    this.visible = true;
  });
  focus = vi.fn();
  hide = vi.fn(() => {
    this.visible = false;
    this.emit("hide");
  });
}
vi.mock("./voicevox.js",async importOriginal=>{
 const actual=await importOriginal<typeof import("./voicevox.js")>();
 return {...actual,playWav:fixture.wavPlay,voicevoxSpeak:(settings:Parameters<typeof actual.voicevoxSpeak>[0])=>actual.voicevoxSpeak(settings,fixture.wavPlay)};
});
vi.mock("./voice.js",async importOriginal=>({...await importOriginal<typeof import("./voice.js")>(),nativeSpeak:()=>fixture.speech}));
vi.mock("electron", () => ({
  app: Object.assign(new EventEmitter(), {
    setName: vi.fn(),
    setAppUserModelId:vi.fn(),
    disableHardwareAcceleration:vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: async () => {},
    getPath: () => fixture.directory,
    quit: fixture.quit,
    isPackaged: false,
    setLoginItemSettings: fixture.startup,
  }),
  desktopCapturer: {
    getSources: vi.fn(async () => [
      { id: "screen:generated", name: "Generated screen", display_id: "1" },
    ]),
  },
  nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: false }),
  powerMonitor: Object.assign(new EventEmitter(), { getSystemIdleState: vi.fn(() => "active") }),
  clipboard: {
    read: vi.fn(async () => [
      {
        types: ["image/png"],
        getType: async () =>
          new Blob(
            [
              Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
                "base64",
              ),
            ],
            { type: "image/png" },
          ),
      },
    ]),
    readText: vi.fn(() => "generated clipboard text"),
    writeText: vi.fn(),
  },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
  BrowserWindow: MockWindow,
  WebContentsView:MockView,
  ipcMain: {
    handle: (name: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) =>
      fixture.handlers.set(name, handler),
  },
  Menu: { buildFromTemplate: (items: unknown) => items },
  nativeImage: { createFromPath: (path: string) => path,createFromBuffer:(bytes:Buffer)=>{
    const cropped={getSize:()=>({width:1,height:1}),resize:()=>({toPNG:()=>bytes})};
    return {isEmpty:()=>false,getSize:()=>({width:1,height:1}),toBitmap:()=>Buffer.from([0,0,0,255]),crop:()=>cropped};
  } },
  protocol: { registerSchemesAsPrivileged: vi.fn() },
  screen: Object.assign(new EventEmitter(), {
    getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    getCursorScreenPoint: vi.fn(() => ({x:0,y:0})),
    getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
  }),
  session: {
    fromPartition: (name: string) => {
      if (!fixture.partitions.has(name))
        fixture.partitions.set(name, {
          protocol: {
            handle: (scheme, handler) => {
              fixture.protocols.set(`${name}:${scheme}`, handler);
            },
          },
          setDisplayMediaRequestHandler: vi.fn((handler) =>
            fixture.displayRequests.set(name, handler),
          ),
          setPermissionRequestHandler: vi.fn((handler: (...args: any[]) => void) =>
            fixture.permissionRequests.set(name, handler),
          ),
          setPermissionCheckHandler: vi.fn((handler: (...args: any[]) => boolean) =>
            fixture.permissionChecks.set(name, handler),
          ),
          on: vi.fn(),
          cookies: Object.assign(new EventEmitter(), {
            get: vi.fn(async () => [{ name: "soda_session_work", value: "generated", path: "/" }]),
          }),
        });
      return fixture.partitions.get(name);
    },
  },
  Tray: class extends EventEmitter {
    setToolTip() {}
    setContextMenu() {}
  },
}));

vi.mock("./fullscreen.js", () => ({
  FullscreenPolicy: class {
    quiet() {
      return fixture.fullscreenQuery();
    }
    invalidate = vi.fn();
    stop = vi.fn();
  },
}));

vi.mock("./ocrRunner.js", () => ({
  OcrRunner: class {
    run = vi.fn(async () => "generated OCR text");
  },
}));

vi.mock("./transcription.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./transcription.js")>();
  return {
    ...actual,
    Transcription: class extends actual.Transcription {
      constructor(options: ConstructorParameters<typeof actual.Transcription>[0]) {
        super({
          ...options,
          read:(path,signal)=>fixture.audioRead?fixture.audioRead(path,signal):actual.readAudioFile(path,signal),
          fetch: fixture.audioFetch,
        });
      }
    },
  };
});

vi.mock("./assistantRpc.js", () => ({
  AssistantRpc: class {
    start = vi.fn();
    stop = vi.fn();
    reconnect = vi.fn();
    request = vi.fn(async (method: string) =>
      method === "assistant.get"
        ? null
        : { kinds: [{ kind: "codex", label: "Codex", available: true }] },
    );
    constructor(
      _origin: string,
      readonly options: { status: (connected: boolean) => void; prefsChanged?:(state:{rev:number;prefs:Record<string,unknown>})=>void },
    ) {
      fixture.controls.push(this);
    }
  },
}));



vi.mock("./noticeConnection.js", () => ({
  NoticeConnection: class {
    feed={agents:[] as import("./noticeFeed.js").AssistantAgentRow[]};
    start = vi.fn();
    stop = vi.fn();
    reconnect = vi.fn();
    constructor(
      _origin: string,
      readonly options: {
        cookie: () => Promise<string | null>;
        changed: (notices: unknown[], added: boolean) => void;
        status: (status: string) => void;
      },
    ) {
      fixture.connections.push(this);
    }
  },
}));

beforeAll(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), "soda-assistant-native-test-"));
  await import("./main.js");
  await vi.waitFor(() => expect(fixture.windows).toHaveLength(1));
});
afterAll(async () => {
  const { app } = await import("electron");
  app.emit("before-quit");
  await rm(fixture.directory, { recursive: true, force: true });
});

it("registers assets in the exact local partition and starts disabled without an agent", async () => {
  const handler = fixture.protocols.get("assistant-local:soda-assistant")!;
  expect(handler).toBeTypeOf("function");
  const settings = await handler(new Request("soda-assistant://app/settings.html"));
  expect(settings.status).toBe(200);
  expect(await settings.text()).toContain("ロボット船長");
  expect(settings.headers.get("Content-Security-Policy")).toContain("connect-src 'none'");
  for (const path of ["../src/main.ts", "unknown.svg", "settings.html?x=1"])
    expect((await handler(new Request(`soda-assistant://app/${path}`))).status).toBe(404);
  const win = fixture.windows[0]!;
  expect(win.url).toBe("soda-assistant://app/settings.html");
  expect(win.options).toMatchObject({
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      partition: "assistant-local",
    },
  });
  expect(fixture.startup).not.toHaveBeenCalled();
});

it("enables robot captain without focus stealing, fences IPC and opens a native-free panel", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  const saved = await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    characterId: "captain-robot",
  });
  expect(saved).toMatchObject({ characterId: "captain-robot", enabled: true });
  const character = fixture.windows[1]!;
  await vi.waitFor(() => expect(character.showInactive).toHaveBeenCalledOnce());
  expect(character.options).toMatchObject({
    focusable: false,
    transparent: true,
    skipTaskbar: true,
  });
  expect(character.focus).not.toHaveBeenCalled();
  const characterEvent = {
    sender: character.webContents,
    senderFrame: character.webContents.mainFrame,
  };
  await expect(
    fixture.handlers.get("assistant:save")!(characterEvent, { enabled: false }),
  ).rejects.toThrow("許可");
  await expect(
    fixture.handlers.get("assistant:read")!({ ...event, senderFrame: { url: settings.url } }),
  ).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:open")!(characterEvent);
  const panel = fixture.windows[2]!;
  expect(remoteOf(panel).url).toBe("http://127.0.0.1:7780/");
  expect(remoteOf(panel).options).toMatchObject({
    webPreferences: {
      partition: "persist:assistant-server",
      sandbox: true,
      nodeIntegration: false,
    },
  });
  expect((remoteOf(panel).options.webPreferences as Record<string, unknown>).preload).toBeUndefined();
  const contents = remoteOf(panel).webContents;
  const requestDetails = {isMainFrame:true, requestingUrl:contents.mainFrame.url};
  const check = fixture.permissionChecks.get("persist:assistant-server")!;
  const request = fixture.permissionRequests.get("persist:assistant-server")!;
  expect(check(contents,"clipboard-sanitized-write","http://127.0.0.1:7780",requestDetails)).toBe(true);
  const copied = vi.fn();
  request(contents,"clipboard-sanitized-write",copied,requestDetails);
  expect(copied).toHaveBeenLastCalledWith(true);
  for (const permission of ["clipboard-read","deprecated-sync-clipboard-read","media"]) {
    expect(check(contents,permission,"http://127.0.0.1:7780",requestDetails)).toBe(false);
    request(contents,permission,copied,requestDetails);
    expect(copied).toHaveBeenLastCalledWith(false);
  }
  expect(check(contents,"clipboard-sanitized-write","http://127.0.0.1:7780",{...requestDetails,isMainFrame:false})).toBe(false);
  expect(check(settings.webContents,"clipboard-sanitized-write","http://127.0.0.1:7780",requestDetails)).toBe(false);

  await expect(
    fixture.handlers.get("assistant:save")!(
      { sender: remoteOf(panel).webContents, senderFrame: remoteOf(panel).webContents.mainFrame },
      {},
    ),
  ).rejects.toThrow("許可");
  const preventDefault = vi.fn();
  remoteOf(panel).webContents.emit("will-navigate", { preventDefault }, "https://evil.test");
  expect(preventDefault).toHaveBeenCalledOnce();
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
  });
  expect(character.isDestroyed()).toBe(true);
  await expect(fixture.handlers.get("assistant:read")!(characterEvent)).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  expect(panel.isDestroyed()).toBe(true);
  expect(check(contents,"clipboard-sanitized-write","http://127.0.0.1:7780",requestDetails)).toBe(false);
});

it("uses a focusable local bubble for user chat and closes it when disabled", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    characterId: "captain-robot",
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  expect(bubble.url).toBe("soda-assistant://app/bubble.html");
  expect(bubble.options).toMatchObject({ focusable: true, skipTaskbar: true, transparent: true });
  const bubbleEvent = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  await expect(fixture.handlers.get("assistant:save")!(bubbleEvent, {})).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:hide")!(bubbleEvent);
  expect(bubble.hide).toHaveBeenCalledOnce();
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    characterId: "captain-female",
  });
  expect(bubble.isDestroyed()).toBe(true);
  await fixture.handlers.get("assistant:chat")!(event);
  const updatedBubble = fixture.windows.at(-1)!;
  expect(updatedBubble).not.toBe(bubble);
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  expect(updatedBubble.isDestroyed()).toBe(true);
});

it("delivers a compact notification without opening chat and obeys mute", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
  });
  const connection = fixture.connections.at(-1)!;
  const notice = { id: "generated", message: "作業が完了しました。" };
  connection.options.changed([notice], true);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.showInactive).toHaveBeenCalledOnce());
  expect(bubble.focus).not.toHaveBeenCalled();
  expect(bubble.url).toBe("soda-assistant://app/notice.html");
  const bubbleEvent = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  expect(await fixture.handlers.get("assistant:notice-state")!(bubbleEvent)).toMatchObject({message:"作業状況を確認してください。"});
  await expect(fixture.handlers.get("assistant:inbox")!(bubbleEvent)).rejects.toThrow("許可");
  connection.options.changed([{...notice,message:"詳しい完了内容"}],false);
  expect(bubble.webContents.send).toHaveBeenCalledWith("assistant:notice-changed",expect.objectContaining({message:"作業状況を確認してください。"}));
  await expect(fixture.handlers.get("assistant:inbox")!(event)).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  expect(connection.stop).toHaveBeenCalledOnce();
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    mute: true,
  });
  const count = fixture.windows.length;
  fixture.connections.at(-1)!.options.changed([notice], true);
  expect(fixture.windows.length).toBe(count);
  connection.options.changed([notice], true); // A retired connection cannot open the new generation's UI.
  expect(fixture.windows.length).toBe(count);
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("uses the scoped named-session cookie only inside main and reconnects on its change", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
  });
  const connection = fixture.connections.at(-1)!;
  expect(await connection.options.cookie()).toBe("soda_session_work=generated");
  const cookies = fixture.partitions.get("persist:assistant-server")!.cookies;
  expect(cookies.get).toHaveBeenLastCalledWith({ url: "http://127.0.0.1:7780/ws" });
  cookies.emit("changed", {}, { name: "soda_session_work" });
  expect(connection.reconnect).toHaveBeenCalledOnce();
  expect(await fixture.handlers.get("assistant:read")!(event)).not.toHaveProperty("cookie");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("keeps the newly enabled control connection running and reaches scoped session discovery", async () => {
  const settings = fixture.windows.find(
    (window) => !window.destroyed && window.url.endsWith("settings.html"),
  )!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
  });
  const control = fixture.controls.at(-1)!;
  expect(control.start).toHaveBeenCalledOnce();
  expect(control.stop).not.toHaveBeenCalled();
  control.options.status(true);
  await vi.waitFor(() =>
    expect(control.request).toHaveBeenCalledWith(
      "assistant.get",
      expect.objectContaining({ deviceId: expect.any(String) }),
    ),
  );
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  const bubbleEvent = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  expect(await fixture.handlers.get("assistant:conversation")!(bubbleEvent)).toMatchObject({
    connected: true,
  });
  await expect(fixture.handlers.get("assistant:conversation")!(event)).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("keeps notes and clipboard behind the current bubble role and uses the native picker for audio", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    transcriptionEnabled: true,
    transcriptionProvider: "local",
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  for (const name of [
    "tools",
    "note-save",
    "note-delete",
    "transcribe-file",
    "transcribe-cancel",
    "clipboard-read",
    "clipboard-write",
  ])
    await expect(fixture.handlers.get(`assistant:${name}`)!(event, {})).rejects.toThrow("許可");
  expect(await fixture.handlers.get("assistant:clipboard-read")!(local)).toBe(
    "generated clipboard text",
  );
  await fixture.handlers.get("assistant:clipboard-write")!(local, { text: "generated" });
  const saved = (await fixture.handlers.get("assistant:note-save")!(local, {
    text: "local note",
  })) as { id: string };
  expect(await fixture.handlers.get("assistant:tools")!(local)).toMatchObject({
    notes: [{ id: saved.id, text: "local note" }],
  });
  await fixture.handlers.get("assistant:note-delete")!(local, { id: saved.id });
  expect(await fixture.handlers.get("assistant:tools")!(local)).toMatchObject({ notes: [] });
  await fixture.handlers.get("assistant:transcribe-file")!(local, {
    path: "renderer cannot select this path",
  });
  expect(await fixture.handlers.get("assistant:tools")!(local)).toMatchObject({
    transcription: { status: "idle", text: "" },
  });
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("leases microphone permission only to the visible bubble and consumes the stopped recording token once", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    transcriptionEnabled: true,
    transcriptionProvider: "local",
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  const check = fixture.permissionChecks.get("assistant-local")!;
  const remoteCheck = fixture.permissionChecks.get("persist:assistant-server")!;
  const details = { isMainFrame: true, requestingUrl: bubble.url, mediaType: "audio" };
  expect(check(bubble.webContents, "media", "soda-assistant://app", details)).toBe(false);
  await expect(fixture.handlers.get("assistant:record-start")!(event)).rejects.toThrow("許可");
  const grant = (await fixture.handlers.get("assistant:record-start")!(local)) as { token: string };
  expect(check(bubble.webContents, "media", "soda-assistant://app", details)).toBe(true);
  bubble.visible = false;
  expect(check(bubble.webContents, "media", "soda-assistant://app", details)).toBe(false);
  bubble.visible = true;
  const permission = vi.fn();
  fixture.permissionRequests.get("assistant-local")!(bubble.webContents, "media", permission, {
    isMainFrame: true,
    requestingUrl: bubble.url,
    mediaTypes: ["audio"],
  });
  expect(permission).toHaveBeenLastCalledWith(true);
  fixture.permissionRequests.get("assistant-local")!(bubble.webContents, "media", permission, {
    isMainFrame: true,
    requestingUrl: bubble.url,
    mediaTypes: ["audio", "video"],
  });
  expect(permission).toHaveBeenLastCalledWith(false);

  expect(
    check(bubble.webContents, "media", "soda-assistant://app", { ...details, isMainFrame: false }),
  ).toBe(false);
  expect(
    check(bubble.webContents, "media", "soda-assistant://app", { ...details, mediaType: "video" }),
  ).toBe(false);
  expect(remoteCheck(bubble.webContents, "media", "soda-assistant://app", details)).toBe(false);
  await fixture.handlers.get("assistant:record-stop")!(local, { token: grant.token });
  expect(check(bubble.webContents, "media", "soda-assistant://app", details)).toBe(false);
  const payload = {
    token: grant.token,
    mime: "audio/webm",
    bytes: new Uint8Array([1, 2, 3]).buffer,
  };
  await expect(
    fixture.handlers.get("assistant:record-transcribe")!(local, {
      ...payload,
      bytes: new ArrayBuffer(25 * 1024 * 1024 + 1),
    }),
  ).rejects.toThrow();
  await expect(
    fixture.handlers.get("assistant:record-transcribe")!(local, payload),
  ).resolves.toBeUndefined();
  expect(await fixture.handlers.get("assistant:tools")!(local)).toMatchObject({
    transcription: { status: "done", text: "generated recording transcription" },
  });
  await expect(
    fixture.handlers.get("assistant:record-transcribe")!(local, payload),
  ).rejects.toThrow("対象");
  const next = (await fixture.handlers.get("assistant:record-start")!(local)) as { token: string };
  await expect(
    fixture.handlers.get("assistant:record-discard")!(local, { token: grant.token }),
  ).rejects.toThrow();
  expect(check(bubble.webContents, "media", "soda-assistant://app", details)).toBe(true);
  await fixture.handlers.get("assistant:record-discard")!(local, { token: next.token });
  for (const lifecycle of ["hide", "minimize", "navigation"]) {
    await fixture.handlers.get("assistant:chat")!(event);
    const current = fixture.windows.at(-1)!;
    const currentEvent = {
      sender: current.webContents,
      senderFrame: current.webContents.mainFrame,
    };
    await fixture.handlers.get("assistant:record-start")!(currentEvent);
    if (lifecycle === "hide") current.hide();
    else if (lifecycle === "minimize") current.emit("minimize");
    else current.webContents.emit("did-start-navigation", {}, current.url, false, true);
    expect(current.isDestroyed()).toBe(true);
    await expect(fixture.handlers.get("assistant:record-start")!(currentEvent)).rejects.toThrow(
      "許可",
    );
  }
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("uses the explicit PNG clipboard action and retires OCR on hide and navigation", async () => {
  const settings = fixture.windows.find((window) => window.url.endsWith("settings.html"))!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    ocrEnabled: true,
    ocrExecutable: "/usr/bin/tesseract",
    ocrProvider: "local",
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  await expect(fixture.handlers.get("assistant:ocr-clipboard")!(event)).rejects.toThrow("許可");
  const image = (await fixture.handlers.get("assistant:ocr-clipboard")!(local)) as any;
  expect(image.uri).toMatch(/^data:image\/png;base64,/);
  await fixture.handlers.get("assistant:ocr-run")!(local, { imageId: image.state.imageId });
  expect(await fixture.handlers.get("assistant:ocr-state")!(local)).toMatchObject({
    status: "done",
    text: "generated OCR text",
  });
  bubble.hide();
  expect(await fixture.handlers.get("assistant:ocr-state")!(local)).toMatchObject({
    imageId: null,
    text: "",
  });
  await expect(fixture.handlers.get("assistant:ocr-clipboard")!(local)).rejects.toThrow("吹き出し");
  bubble.show();
  const next = (await fixture.handlers.get("assistant:ocr-clipboard")!(local)) as any;
  bubble.webContents.emit("did-start-navigation", {}, bubble.url, false, true);
  await expect(
    fixture.handlers.get("assistant:ocr-run")!(local, { imageId: next.state.imageId }),
  ).rejects.toThrow("対象");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("does not open a source panel after its original bubble is hidden", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
  });
  const notice = {
    id: "00000000-0000-4000-8000-000000000091",
    key: "done:test:1",
    source: {
      serverOrigin: "http://127.0.0.1:7780",
      machineId: "local",
      paneId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
      agentInstanceId: "00000000-0000-4000-8000-000000000003",
    },
    kind: "done",
    title: "worker",
    message: "完了しました",
    at: 1,
  };
  fixture.connections.at(-1)!.options.changed([notice], true);
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  let finish!: (value: unknown) => void;
  fixture.controls.at(-1)!.request.mockImplementation((method: string) =>
    method === "assistant.source"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(null),
  );
  const opened = fixture.handlers.get("assistant:source-open")!(
    { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame },
    { noticeId: notice.id },
  );
  const rejected = expect(opened).rejects.toThrow("対象");
  bubble.hide();
  const count = fixture.windows.length;
  finish({
    paneId: notice.source.paneId,
    workspaceId: notice.source.workspaceId,
    agent: { instanceId: notice.source.agentInstanceId },
  });
  await rejected;
  expect(fixture.windows.length).toBe(count);
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("handles failed retarget navigation and can return explicitly to ordinary Soda", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
  });
  await fixture.handlers.get("assistant:open")!(event);
  const panel = fixture.windows.find(
    (window) => !window.destroyed && window.contentView.children[0]?.url === "http://127.0.0.1:7780/",
  )!;
  const notice = {
    id: "00000000-0000-4000-8000-000000000091",
    key: "done:test:1",
    source: {
      serverOrigin: "http://127.0.0.1:7780",
      machineId: "local",
      paneId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
      agentInstanceId: "00000000-0000-4000-8000-000000000003",
    },
    kind: "done",
    title: "worker",
    message: "完了しました",
    at: 1,
  };
  fixture.connections.at(-1)!.options.changed([notice], true);
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  fixture.controls.at(-1)!.request.mockImplementation(async () => ({
    paneId: notice.source.paneId,
    workspaceId: notice.source.workspaceId,
    agent: { instanceId: notice.source.agentInstanceId },
  }));
  vi.spyOn(remoteOf(panel).webContents, "loadURL").mockRejectedValueOnce(Error("generated connection failure"));
  await fixture.handlers.get("assistant:source-open")!(
    { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame },
    { noticeId: notice.id },
  );
  await vi.waitFor(() => expect(remoteOf(panel).url).toMatch(/^data:text\/plain/));
  await fixture.handlers.get("assistant:open")!(event);
  expect(remoteOf(panel).url).toBe("http://127.0.0.1:7780/");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});
it("grants one selected display without audio and consumes its PNG only once", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    ocrEnabled: true,
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  const list = (await fixture.handlers.get("assistant:screenshot-sources")!(local)) as any;
  await fixture.handlers.get("assistant:screenshot-approve")!(local, {
    token: list.token,
    id: "screen:generated",
  });
  const details = { isMainFrame: true, requestingUrl: bubble.url, mediaType: "video" };
  expect(
    fixture.permissionChecks.get("assistant-local")!(
      bubble.webContents,
      "display-capture",
      "soda-assistant://app",
      details,
    ),
  ).toBe(true);
  expect(
    fixture.permissionChecks.get("assistant-local")!(
      bubble.webContents,
      "media",
      "soda-assistant://app",
      details,
    ),
  ).toBe(false);
  const callback = vi.fn(),
    request = {
      frame: bubble.webContents.mainFrame,
      securityOrigin: "soda-assistant://app",
      audioRequested: false,
      videoRequested: true,
      userGesture: true,
    };
  fixture.displayRequests.get("assistant-local")!({ ...request, audioRequested: true }, callback);
  expect(callback).toHaveBeenLastCalledWith(null);
  fixture.displayRequests.get("persist:assistant-server")!(request, callback);
  expect(callback).toHaveBeenLastCalledWith(null);
  fixture.displayRequests.get("assistant-local")!(request, callback);
  expect(callback).toHaveBeenLastCalledWith({
    video: expect.objectContaining({ id: "screen:generated" }),
  });
  fixture.displayRequests.get("assistant-local")!(request, callback);
  expect(callback).toHaveBeenLastCalledWith(null);
  const bytes = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
      "base64",
    ),
  ).buffer;
  const result = (await fixture.handlers.get("assistant:screenshot-submit")!(local, {
    token: list.token,
    bytes,
  })) as any;
  expect(result.state.status).toBe("ready");
  await expect(
    fixture.handlers.get("assistant:screenshot-submit")!(local, { token: list.token, bytes }),
  ).rejects.toThrow("失効");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});
it("keeps plugin actions behind explicit capability and revokes pending view opens", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    allowPluginViews: true,
  });
  const actor = "00000000-0000-4000-8000-000000000003",
    runId = "00000000-0000-4000-8000-000000000004",
    rpc = fixture.controls.at(-1)!;
  let finish!: (value: any) => void;
  rpc.request.mockImplementation(async (method: string, params: any) => {
    if (method === "assistant.get")
      return {
        deviceId: params.deviceId,
        workspaceId: "00000000-0000-4000-8000-000000000002",
        tabId: "00000000-0000-4000-8000-000000000005",
        paneId: "00000000-0000-4000-8000-000000000001",
        kind: "codex",
        state: "ready",
        observedAgent: null,
        agent: {
          instanceId: actor,
          kind: "codex",
          label: "Assistant",
          state: "idle",
          completionSeq: 0,
          serverSeenSeq: 0,
          verified: true,
          since: 1,
        },
      };
    if (method === "agent.kinds")
      return { kinds: [{ kind: "codex", label: "Codex", available: true }] };
    if (method === "assistant.conversation")
      return {
        kind: "codex",
        sessionId: "generated",
        messages: [],
        nextOffset: null,
        partial: false,
        endOffset: 0,
      };
    if (method === "assistant.reminders") return { jobs: [], runs: [] };
    if (method === "assistant.app_open")
      return new Promise((resolve) => {
        finish = resolve;
      });
    return { result: "generated" };
  });
  rpc.options.status(true);
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  await vi.waitFor(async () =>
    expect(await fixture.handlers.get("assistant:conversation")!(local)).toMatchObject({
      session: { state: "ready" },
    }),
  );
  await expect(
    fixture.handlers.get("assistant:app-call")!(local, {
      instanceId: actor,
      extensionKey: "demo",
      runId,
      operation: "search",
      params: {},
    }),
  ).rejects.toThrow("許可");
  expect(rpc.request.mock.calls.some((call) => call[0] === "assistant.app_call")).toBe(false);
  const opened = fixture.handlers.get("assistant:app-open")!(local, {
    instanceId: actor,
    extensionKey: "demo",
    runId,
    viewId: "assistant",
  });
  const rejected = expect(opened).rejects.toThrow("変更");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    allowPluginViews: false,
  });
  const count = fixture.windows.length;
  finish({});
  await rejected;
  expect(fixture.windows.length).toBe(count);
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("imports only previewed PNG assets and falls back immediately when character permission is revoked", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
    entry = Buffer.from('throw Error("entry must never execute")');
  const files = [
    {
      path: "entry.mjs",
      data: entry.toString("base64"),
      sha256: createHash("sha256").update(entry).digest("hex"),
    },
    {
      path: "robot.png",
      data: png,
      sha256: createHash("sha256").update(Buffer.from(png, "base64")).digest("hex"),
    },
  ];
  const bundle = {
    format: "sodashitsu-plugin",
    version: 1,
    manifest: {
      schemaVersion: 1,
      id: "custom",
      name: "Custom",
      version: "1.0.0",
      description: "",
      entry: "entry.mjs",
      files: files.map((file) => file.path),
      allow: [],
      assistantCharacters: [{ id: "robot", name: "追加の船長", file: "robot.png" }],
    },
    files,
  };
  const path = join(fixture.directory, "custom.sodaplugin");
  await writeFile(path, JSON.stringify(bundle));
  const { dialog } = await import("electron");
  vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [path] });
  const preview = (await fixture.handlers.get("assistant:character-pack-preview")!(event)) as any;
  expect(preview.characters[0].uri).toBe(`data:image/png;base64,${png}`);
  await fixture.handlers.get("assistant:character-pack-import")!(event, { token: preview.token });
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    characterId: "plugin:custom/robot",
    allowPluginCharacters: true,
  });
  expect(await fixture.handlers.get("assistant:character-info")!(event)).toEqual({
    name: "追加の船長",
    greeting:"こんにちは。操舵室の船長です。",
    uri: `data:image/png;base64,${png}`,
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    characterId: "plugin:custom/robot",
    allowPluginCharacters: false,
  });
  expect(bubble.isDestroyed()).toBe(true);
  expect(await fixture.handlers.get("assistant:character-info")!(event)).toMatchObject({
    uri: "soda-assistant://app/captain-female.png",
  });
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  await fixture.handlers.get("assistant:character-pack-remove")!(event, { id: "custom" });
});
it("routes a remote notice reply through its registered machine and revokes it without local fallback", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    remoteNotifications: true,
  });
  const hub = fixture.controls.at(-1)!,
    machineId = "a".repeat(32);
  hub.request.mockImplementation(async (method: string) =>
    method === "machine.list"
      ? { machines: [{ id: machineId, label: "sr-pc", state: "online" }] }
      : method === "assistant.get"
        ? null
        : { kinds: [] },
  );
  hub.options.status(true);
  await vi.waitFor(() =>
    expect(
      fixture.controls.some((control) => (control.options as any).machineId === machineId),
    ).toBe(true),
  );
  const remote = fixture.controls.find(
    (control) => (control.options as any).machineId === machineId,
  )!;
  const connection = fixture.connections.find(
    (connection) => (connection.options as any).machineId === machineId,
  )!;
  const notice = {
    id: "00000000-0000-4000-8000-000000000091",
    key: "blocked:generated:1",
    source: {
      serverOrigin: "http://127.0.0.1:7780",
      machineId,
      paneId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
      agentInstanceId: "00000000-0000-4000-8000-000000000003",
    },
    kind: "attention",
    title: "worker",
    message: "確認してください",
    at: 1,
  };
  remote.request.mockImplementation(async () => ({
    paneId: notice.source.paneId,
    workspaceId: notice.source.workspaceId,
    agent: { instanceId: notice.source.agentInstanceId },
  }));
  connection.options.changed([notice], true);
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  await fixture.handlers.get("assistant:source-key")!(local, { noticeId: notice.id, keyName: "y" });
  expect(remote.request).toHaveBeenCalledWith("assistant.reply_key", {
    source: { ...notice.source, machineId: "local" },
    key: notice.key,
    keyName: "y",
  });
  expect(hub.request.mock.calls.some((call) => call[0] === "assistant.reply_key")).toBe(false);
  await fixture.handlers.get("assistant:source-open")!(local, { noticeId: notice.id });
  expect(remoteOf(fixture.windows.at(-1)!).url).toContain(`assistantMachine=${machineId}`);
  const firstUrl = new URL(remoteOf(fixture.windows.at(-1)!).url);
  const askId = "a".repeat(32);
  connection.options.changed([{...notice,kind:"question",key:`ask:${askId}`}],false);
  await fixture.handlers.get("assistant:source-open")!(local,{noticeId:notice.id});
  const secondUrl = new URL(remoteOf(fixture.windows.at(-1)!).url);
  expect(secondUrl.search).not.toBe(firstUrl.search);
  expect(new URLSearchParams(secondUrl.hash.slice(1)).get("assistantAsk")).toBe(askId);
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    quietFullscreen: false,
    mode: "tray",
    remoteNotifications: false,
  });
  await expect(
    fixture.handlers.get("assistant:source-key")!(local, { noticeId: notice.id, keyName: "y" }),
  ).rejects.toThrow("対象");
  expect(remote.stop).toHaveBeenCalled();
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});
it("keeps quiet notices in the inbox, cancels late popups and reconnects after sleep", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    quietFullscreen: true,
  });
  const connection = fixture.connections.at(-1)!,
    control = fixture.controls.at(-1)!;
  let finish!: (value: boolean) => void;
  fixture.fullscreenQuery.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const before = fixture.windows.length;
  connection.options.changed([{ id: "quiet", message: "確認してください", at: 1 }], true);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    quietFullscreen: true,
    mute: true,
  });
  finish(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(fixture.windows.length).toBe(before);
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    quietFullscreen: true,
  });
  fixture.fullscreenQuery.mockResolvedValueOnce(true);
  connection.options.changed([{ id: "quiet2", message: "お知らせです", at: 2 }], true);
  await Promise.resolve();
  await Promise.resolve();
  expect(fixture.windows.length).toBe(before);
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  const local = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  expect(await fixture.handlers.get("assistant:inbox")!(local)).toMatchObject({
    notices: [{ id: "quiet2" }],
  });
  const { powerMonitor } = await import("electron");
  powerMonitor.emit("suspend");
  expect(bubble.isVisible()).toBe(false);
  expect(control.stop).toHaveBeenCalled();
  expect(connection.stop).toHaveBeenCalled();
  powerMonitor.emit("resume");
  expect((control as any).reconnect).toHaveBeenCalled();
  expect(connection.reconnect).toHaveBeenCalled();
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it("does not show a delayed popup after the desktop becomes locked", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    quietFullscreen: true,
  });
  let finish!: (value: boolean) => void;
  fixture.fullscreenQuery.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const count = fixture.windows.length;
  fixture.connections
    .at(-1)!
    .options.changed([{ id: "locked", message: "確認してください", at: 1 }], true);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const { powerMonitor } = await import("electron");
  vi.mocked(powerMonitor.getSystemIdleState).mockReturnValue("locked");
  finish(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(fixture.windows.length).toBe(count);
  vi.mocked(powerMonitor.getSystemIdleState).mockReturnValue("active");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});
it("defers a changed server connection until resume even if a settings save completes during suspend", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    quietFullscreen: false,
  });
  const { powerMonitor } = await import("electron");
  powerMonitor.emit("suspend");
  const controls = fixture.controls.length,
    connections = fixture.connections.length;
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    quietFullscreen: false,
    serverOrigin: "http://localhost:7789",
  });
  expect(fixture.controls.length).toBe(controls);
  expect(fixture.connections.length).toBe(connections);
  powerMonitor.emit("resume");
  expect(fixture.controls.length).toBe(controls + 1);
  expect(fixture.connections.length).toBe(connections + 1);
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});

it.each(["hide","minimize","navigation"])("cancels a file audio read before model submission on %s",async(lifecycle)=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(done=>{release=done;}),started=new Promise<void>(done=>{entered=done;});
 try {
  await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:false,mode:"tray",transcriptionEnabled:true,transcriptionProvider:"agent"});
  const control=fixture.controls.at(-1)!,actor={instanceId:randomUUID(),kind:"codex",label:"generated",state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1};
  const scope={workspaceId:randomUUID(),tabId:randomUUID(),paneId:randomUUID()};
  control.request.mockImplementation(async(method:string,p:Record<string,unknown>)=>{
   if(method==="assistant.get")return{deviceId:p.deviceId,...scope,kind:"codex",state:"ready",agent:actor,observedAgent:actor};
   if(method==="agent.kinds")return{kinds:[{kind:"codex",label:"generated",available:true}]};
   if(method==="assistant.conversation")throw Error("no generated transcript");
   return{};
  });
  control.options.status(true);await fixture.handlers.get("assistant:chat")!(event);
  const bubble=fixture.windows.at(-1)!,local={sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame};
  await vi.waitFor(async()=>expect(await fixture.handlers.get("assistant:conversation")!(local)).toMatchObject({session:{state:"ready"}}));
  fixture.audioRead=async()=>{entered();await gate;return{name:"generated.wav",mime:"audio/wav",bytes:new Uint8Array([1])};};
  const {dialog}=await import("electron");vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({canceled:false,filePaths:["/generated/audio.wav"]});
  const job=fixture.handlers.get("assistant:transcribe-file")!(local);await started;
  if(lifecycle==="hide")bubble.hide();else if(lifecycle==="minimize")bubble.emit("minimize");else bubble.webContents.emit("did-start-navigation",{},"soda-assistant://app/bubble.html",false,true);
  release();await job;expect(control.request.mock.calls.some(call=>call[0]==="assistant.audio_begin")).toBe(false);
 }finally{release?.();fixture.audioRead=null;await fixture.handlers.get("assistant:save")!(event,{enabled:false});}
});


it("opens a separate response window and focuses the existing full Soda window by explicit choice", async () => {
  const settings = fixture.windows[0]!, event = {sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
  await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:false,mode:"tray"});
  await fixture.handlers.get("assistant:open")!(event);
  const full = fixture.windows.at(-1)!;
  const notice = {id:"00000000-0000-4000-8000-000000000091",key:"ask:response-choice",kind:"question",title:"worker",message:"確認してください",at:1,
    source:{serverOrigin:"http://127.0.0.1:7780",machineId:"local",paneId:"00000000-0000-4000-8000-000000000001",workspaceId:"00000000-0000-4000-8000-000000000002",agentInstanceId:"00000000-0000-4000-8000-000000000003"}};
  fixture.connections.at(-1)!.options.changed([notice],true);
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(()=>expect(bubble.isVisible()).toBe(true));
  fixture.controls.at(-1)!.request.mockImplementation(async()=>({paneId:notice.source.paneId,workspaceId:notice.source.workspaceId,agent:{instanceId:notice.source.agentInstanceId}}));
  const local = {sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame};
  const fullFocus = full.focus.mock.calls.length;
  await fixture.handlers.get("assistant:source-open")!(local,{noticeId:notice.id,destination:"reply"});
  const reply = fixture.windows.at(-1)!;
  expect(reply).not.toBe(full);
  expect(new URL(remoteOf(reply).url).searchParams.get("assistantView")).toBe("reply");
  expect(new URLSearchParams(new URL(remoteOf(reply).url).hash.slice(1)).get("assistantAsk")).toBe("response-choice");
  expect(remoteOf(reply).options.webPreferences).toMatchObject({sandbox:true,nodeIntegration:false,contextIsolation:true});
  expect(remoteOf(reply).options.webPreferences).not.toHaveProperty("preload");
  expect(remoteOf(full).url).toBe("http://127.0.0.1:7780/");
  expect(full.focus).toHaveBeenCalledTimes(fullFocus);
  const count = fixture.windows.length;
  await fixture.handlers.get("assistant:source-open")!(local,{noticeId:notice.id,destination:"main"});
  expect(fixture.windows.length).toBe(count);
  expect(new URL(remoteOf(full).url).searchParams.get("assistantView")).toBe("main");
  await vi.waitFor(()=>expect(full.focus).toHaveBeenCalledTimes(fullFocus+1));
  expect(reply.isDestroyed()).toBe(false);
  await expect(fixture.handlers.get("assistant:source-open")!(local,{noticeId:notice.id,destination:"external"})).rejects.toThrow();
  await fixture.handlers.get("assistant:save")!(event,{enabled:false});
  expect(reply.isDestroyed()).toBe(true);
});


it("uses the actual primary work area for automatic bottom-right placement even when enumerated second", async () => {
  const {screen}=await import("electron");
  const displays=vi.spyOn(screen,"getAllDisplays").mockReturnValue([
    {id:2,workArea:{x:-1280,y:0,width:1280,height:960}},
    {id:1,workArea:{x:0,y:0,width:1920,height:1040}},
  ] as never);
  const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
  try{
    await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",position:null,characterSize:192,quietFullscreen:false});
    const character=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/character.html")).at(-1)!;
    expect(character.setBounds).toHaveBeenLastCalledWith({x:1828,y:848,width:92,height:192});
  }finally{
    displays.mockRestore();
    await fixture.handlers.get("assistant:save")!(event,{enabled:false});
  }
});


it("resizes only the current visible bubble from the native cursor, retains size, and rejects stale gestures", async () => {
  const {screen}=await import("electron");
  const cursor=vi.spyOn(screen,"getCursorScreenPoint").mockReturnValue({x:100,y:100});
  const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
  try{
    await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
    await fixture.handlers.get("assistant:chat")!(event);
    const bubble=fixture.windows.at(-1)!,local={sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame};
    const original=bubble.getBounds();
    await expect(fixture.handlers.get("assistant:resize-start")!(event,{handle:"nw"})).rejects.toThrow("許可");
    for(const handle of ["s","e","ne","se","sw"])await expect(fixture.handlers.get("assistant:resize-start")!(local,{handle})).rejects.toThrow();
    const {token}=await fixture.handlers.get("assistant:resize-start")!(local,{handle:"nw"}) as {token:string};
    cursor.mockReturnValue({x:60,y:40});
    await fixture.handlers.get("assistant:resize-move")!(local,{token});
    expect(bubble.getBounds()).toEqual({x:original.x-40,y:original.y-60,width:original.width+40,height:original.height+60});
    await fixture.handlers.get("assistant:resize-end")!(local,{token});
    await expect(fixture.handlers.get("assistant:resize-move")!(local,{token})).rejects.toThrow("開始し直して");
    const again=await fixture.handlers.get("assistant:resize-start")!(local,{handle:"n"}) as {token:string};
    bubble.hide();
    await expect(fixture.handlers.get("assistant:resize-move")!(local,again)).rejects.toThrow("吹き出し");
    bubble.destroy();await fixture.handlers.get("assistant:chat")!(event);
    const reopened=fixture.windows.at(-1)!;
    expect(reopened.getBounds()).toMatchObject({width:original.width+40,height:original.height+60});
  }finally{cursor.mockRestore();await fixture.handlers.get("assistant:save")!(event,{enabled:false});}
});


it("toggles the bubble on repeated captain clicks and preserves it without ending the session", async () => {
  const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
  await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",quietFullscreen:false});
  const character=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/character.html")).at(-1)!;
  const click={sender:character.webContents,senderFrame:character.webContents.mainFrame};
  await fixture.handlers.get("assistant:chat")!(click);
  const bubble=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(bubble.isVisible()).toBe(true));
  const count=fixture.windows.length;
  await fixture.handlers.get("assistant:chat")!(click);
  expect(bubble.isVisible()).toBe(false);expect(bubble.isDestroyed()).toBe(false);
  await fixture.handlers.get("assistant:chat")!(click);
  expect(bubble.isVisible()).toBe(true);expect(fixture.windows.length).toBe(count);
  await fixture.handlers.get("assistant:chat")!(event);
  expect(bubble.isVisible()).toBe(true);
  await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("suppresses compact notices while chat is open and publishes a notification indicator",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:false,mode:"tray"});
 const connection=fixture.connections.at(-1)!,first={id:"first",title:"実装担当",message:"質問の内容",at:1};
 connection.options.changed([first],true);
 const compact=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(compact.isVisible()).toBe(true));
 const click={sender:compact.webContents,senderFrame:compact.webContents.mainFrame};
 const stale=(await fixture.handlers.get("assistant:notice-state")!(click) as any).revision;
 const size=fixture.handlers.get("assistant:notice-size")!;
 await expect(size(event,{revision:stale,height:350})).rejects.toThrow("許可");
 await size(click,{revision:stale,height:350});expect(compact.getBounds().height).toBe(350);
 await size(click,{revision:stale-1,height:220});expect(compact.getBounds().height).toBe(350);
 await expect(size(click,{revision:stale,height:20000})).rejects.toThrow();
 connection.options.changed([{...first,message:"新しい詳細"}],false);
 await fixture.handlers.get("assistant:notice-dismiss")!(click,{revision:stale});expect(compact.isDestroyed()).toBe(false);
 await fixture.handlers.get("assistant:notice-open")!(click,{revision:stale});expect(compact.isDestroyed()).toBe(false);
 await fixture.handlers.get("assistant:notice-open")!(click,{revision:(await fixture.handlers.get("assistant:notice-state")!(click) as any).revision});
 expect(compact.isDestroyed()).toBe(true);
 const chat=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));
 const local={sender:chat.webContents,senderFrame:chat.webContents.mainFrame},count=fixture.windows.length;
 connection.options.changed([{...first,id:"second",title:"レビュー担当",at:2}],true);
 expect(fixture.windows.length).toBe(count);
 expect(await fixture.handlers.get("assistant:inbox")!(local)).toMatchObject({latestNotification:{id:"second",title:"レビュー担当"},notices:[{id:"second"}]});
 await fixture.handlers.get("assistant:hide")!(local);
 connection.options.changed([{...first,id:"third",at:3}],true);
 const third=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(third.isVisible()).toBe(true));expect(third.url).toContain("/notice.html");
 await fixture.handlers.get("assistant:chat")!(event);expect(third.isDestroyed()).toBe(true);expect(chat.isVisible()).toBe(true);
 // Merely opening chat closes an existing compact window without losing its inbox entry.
 expect(await fixture.handlers.get("assistant:inbox")!(local)).toMatchObject({notices:[{id:"third"}]});
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});
it("keeps newer notifications when an older reply completes and retains failed replies",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:false,mode:"character"});
 await fixture.handlers.get("assistant:chat")!(event);
 const chat=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));
 const local={sender:chat.webContents,senderFrame:chat.webContents.mainFrame},connection=fixture.connections.at(-1)!,rpc=fixture.controls.at(-1)!;
 const first={id:"00000000-0000-4000-8000-000000000171",key:"attention:first",kind:"attention",title:"担当",message:"確認",at:1,
  source:{serverOrigin:"http://127.0.0.1:7780",machineId:"local",paneId:"00000000-0000-4000-8000-000000000001",workspaceId:"00000000-0000-4000-8000-000000000002",agentInstanceId:"00000000-0000-4000-8000-000000000003"}};
 connection.options.changed([first],true);const windowCount=fixture.windows.length;
 rpc.request.mockRejectedValueOnce(Error("送信失敗"));
 await expect(fixture.handlers.get("assistant:source-reply")!(local,{noticeId:first.id,text:"返答"})).rejects.toThrow("送信失敗");expect(fixture.windows.length).toBe(windowCount);
 let finish!:(value:unknown)=>void;rpc.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=fixture.handlers.get("assistant:source-reply")!(local,{noticeId:first.id,text:"返答"});
 const second={...first,id:"00000000-0000-4000-8000-000000000172",at:2};connection.options.changed([first,second],true);
 finish({ok:true});await pending;expect(await fixture.handlers.get("assistant:inbox")!(local)).toMatchObject({latestNotification:{id:second.id}});
 rpc.request.mockResolvedValueOnce({ok:true});await fixture.handlers.get("assistant:source-reply")!(local,{noticeId:second.id,text:"新しい通知への返答"});expect(fixture.windows.length).toBe(windowCount);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});
it("does not reopen an acknowledged notification after a delayed fullscreen check",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:true,mode:"character",voiceEnabled:false});
 let finish!:(value:boolean)=>void;fixture.fullscreenQuery.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const item={id:"ack-before-display",title:"担当",message:"確認",at:1};fixture.connections.at(-1)!.options.changed([item],true);
 await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
 await fixture.handlers.get("assistant:chat")!(event);const chat=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));
 await fixture.handlers.get("assistant:notice-read")!({sender:chat.webContents,senderFrame:chat.webContents.mainFrame},{noticeId:item.id});
 const count=fixture.windows.length;finish(false);await Promise.resolve();await Promise.resolve();expect(fixture.windows.length).toBe(count);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});
it("does not open a compact after chat is shown during the fullscreen check",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:true,mode:"character",voiceEnabled:false});
 let finish!:(value:boolean)=>void;fixture.fullscreenQuery.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const item={id:"ack-before-display",title:"担当",message:"確認",at:1};fixture.connections.at(-1)!.options.changed([item],true);
 await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
 await fixture.handlers.get("assistant:chat")!(event);const chat=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));
 const count=fixture.windows.length;finish(false);await Promise.resolve();await Promise.resolve();expect(fixture.windows.length).toBe(count);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});
it("retires compact notifications when their source resolves or the screen locks",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,quietFullscreen:false,mode:"tray"});
 const connection=fixture.connections.at(-1)!;
 connection.options.changed([{id:"expired",title:"確認担当",message:"確認待ち",at:1}],true);
 const first=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(first.isVisible()).toBe(true));
 connection.options.changed([],false);expect(first.isDestroyed()).toBe(true);
 connection.options.changed([{id:"lock",title:"確認担当",message:"確認待ち",at:2}],true);
 const locked=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(locked.isVisible()).toBe(true));
 const {powerMonitor}=await import("electron");powerMonitor.emit("lock-screen");expect(locked.isDestroyed()).toBe(true);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("persists the voice toggle, speaks explicit samples and new notifications, and stops when off",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,voiceEnabled:true,quietFullscreen:false,mode:"tray"});
 expect(await fixture.handlers.get("assistant:read")!(event)).toMatchObject({voiceEnabled:true});
 await fixture.handlers.get("assistant:voice-test")!(event);
 await vi.waitFor(()=>expect(fixture.speech).toHaveBeenCalled());
 expect(fixture.speech.mock.calls.at(-1)![0]).toContain("操舵室の船長");
 const before=fixture.speech.mock.calls.length;
 fixture.connections.at(-1)!.options.changed([{id:"voiced",title:"実装担当",message:"確認してください",at:1}],true);
 await vi.waitFor(()=>expect(fixture.speech.mock.calls.length).toBeGreaterThan(before));
 expect(fixture.speech.mock.calls.at(-1)![0]).toContain("実装担当");
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,voiceEnabled:false,quietFullscreen:false,mode:"tray"});
 const count=fixture.speech.mock.calls.length;
 fixture.connections.at(-1)!.options.changed([{id:"silent",title:"実装担当",message:"確認してください",at:2}],true);
 expect(fixture.speech.mock.calls.length).toBe(count);
 await expect(fixture.handlers.get("assistant:voice-test")!(event)).rejects.toThrow("オン");
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("does not start speech after stop while a fullscreen policy read is pending",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,voiceEnabled:true,quietFullscreen:true,mode:"tray"});
 let finish!:(value:boolean)=>void;fixture.fullscreenQuery.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
 const count=fixture.speech.mock.calls.length;
 fixture.connections.at(-1)!.options.changed([{id:"delayed-voice",title:"実装担当",message:"確認してください",at:1}],true);
 await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
 await fixture.handlers.get("assistant:voice-stop")!(event);finish(false);
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 expect(fixture.speech.mock.calls.length).toBe(count);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("previews yukkuri-work folder artwork and imports only after explicit confirmation",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 const root=join(fixture.directory,"yukkuri-source");await mkdir(join(root,"chars","zundamon"),{recursive:true});
 await writeFile(join(root,"casts.json"),JSON.stringify({zundamon:{name:"ずんだもん"}}));
 await writeFile(join(root,"chars","zundamon","normal.png"),Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=","base64"));
 await mkdir(join(root,"chars","zundamon","sprite"));
 await writeFile(join(root,"chars","zundamon","sprite","aaaaaaaaaaaa.png"),Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=","base64"));
 await writeFile(join(root,"chars","zundamon","sprite.json"),JSON.stringify({w:1,h:1,poses:{"":{base:"aaaaaaaaaaaa",faces:{normal:{blink:["aaaaaaaaaaaa",0,0]}}}}}));
 const {dialog}=await import("electron");vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({canceled:false,filePaths:[root]});
 const preview=await fixture.handlers.get("assistant:yukkuri-characters-preview")!(event) as any;
 expect(preview.animationCount).toBe(1);expect(preview.characters).toHaveLength(1);expect(preview.characters[0].name).toBe("ずんだもん");
 const before=await fixture.handlers.get("assistant:character-list")!(event) as any;
 expect(before.characters.some((c:any)=>c.id==="plugin:yukkuri-work/zundamon")).toBe(false);
 await fixture.handlers.get("assistant:character-pack-import")!(event,{token:preview.token});
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",quietFullscreen:false,allowPluginCharacters:true,characterId:"plugin:yukkuri-work/zundamon"});
 expect(await fixture.handlers.get("assistant:character-info")!(event)).toMatchObject({name:"ずんだもん"});
 const character=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/character.html")).at(-1)!;
 expect(await fixture.handlers.get("assistant:character-actor")!({sender:character.webContents,senderFrame:character.webContents.mainFrame})).toMatchObject({id:"plugin:yukkuri-work/zundamon"});
 await expect(fixture.handlers.get("assistant:character-actor")!(event)).rejects.toThrow("許可");
 await fixture.handlers.get("assistant:save")!(event,{enabled:false,characterId:"captain-female"});
 await fixture.handlers.get("assistant:character-pack-remove")!(event,{id:"yukkuri-work"});
});

it("publishes only character motion state for notices, speech, reduced motion and screen lock",async()=>{
 const {powerMonitor}=await import("electron");powerMonitor.emit("unlock-screen");
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",quietFullscreen:false,voiceEnabled:false,reducedMotion:false});
 let char=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/character.html")).at(-1)!;
 let owner={sender:char.webContents,senderFrame:char.webContents.mainFrame};
 const state=await fixture.handlers.get("assistant:character-state")!(owner) as any;
 expect(state).toMatchObject({mode:"idle",paused:false,reducedMotion:false});
 await expect(fixture.handlers.get("assistant:character-state")!(event)).rejects.toThrow("許可");
 fixture.connections.at(-1)!.options.changed([{id:"motion-notice",title:"作業担当",message:"確認",at:1}],true);
 expect(await fixture.handlers.get("assistant:character-state")!(owner)).toMatchObject({notificationSeq:state.notificationSeq+1});
 powerMonitor.emit("lock-screen");
 expect(await fixture.handlers.get("assistant:character-state")!(owner)).toMatchObject({paused:true});
 powerMonitor.emit("unlock-screen");
 expect(await fixture.handlers.get("assistant:character-state")!(owner)).toMatchObject({paused:false});
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",quietFullscreen:false,voiceEnabled:true,reducedMotion:true});
 char=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/character.html")).at(-1)!;owner={sender:char.webContents,senderFrame:char.webContents.mainFrame};
 let finish!:()=>void,start!:()=>void;fixture.speech.mockImplementationOnce((_text,_signal,started)=>new Promise<void>(resolve=>{finish=resolve;start=started!;}));
 await fixture.handlers.get("assistant:voice-test")!(event);
 expect(await fixture.handlers.get("assistant:character-state")!(owner)).toMatchObject({mode:"idle",reducedMotion:true});
 start();
 expect(await fixture.handlers.get("assistant:character-state")!(owner)).toMatchObject({mode:"speaking",reducedMotion:true});
 finish();await vi.waitFor(async()=>expect(await fixture.handlers.get("assistant:character-state")!(owner)).toMatchObject({mode:"idle"}));
 expect(char.webContents.send).toHaveBeenCalledWith("assistant:character-state-changed",expect.objectContaining({mode:"speaking"}));
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("exposes explicit per-app motion preference while preserving the default OS preference",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",followSystemMotion:false,reducedMotion:false,idleFloating:true});
 const char=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/character.html")).at(-1)!;
 expect(await fixture.handlers.get("assistant:character-state")!({sender:char.webContents,senderFrame:char.webContents.mainFrame})).toMatchObject({followSystemMotion:false,reducedMotion:false,idleFloating:true});
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
 expect(await fixture.handlers.get("assistant:read")!(event)).toMatchObject({followSystemMotion:true});
});
it("keeps the framed portrait anchor while saving preferences at a manual position",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",characterId:"captain-female",characterSize:192,quietFullscreen:false,position:{displayId:"1",x:1000,y:800}});
 await fixture.handlers.get("assistant:chat")!(event);
 const bubble=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/bubble.html")).at(-1)!;
 const before=bubble.setBounds.mock.calls.at(-1)![0];
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",characterId:"captain-female",characterSize:192,quietFullscreen:false,iconRotation:false,position:{displayId:"1",x:1000,y:800}});
 expect(bubble.setBounds.mock.calls.at(-1)![0]).toEqual(before);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("opens reusable tools separately, transfers drafts without sending, and revokes media on close",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false,transcriptionEnabled:true,transcriptionProvider:"local",ocrEnabled:true});
 await fixture.handlers.get("assistant:chat")!(event);const bubble=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(bubble.isVisible()).toBe(true));
 const chat={sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame};
 await fixture.handlers.get("assistant:tools-open")!(chat);const tools=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(tools.isVisible()).toBe(true));
 const local={sender:tools.webContents,senderFrame:tools.webContents.mainFrame};
 expect(tools.url).toBe("soda-assistant://app/tools.html");expect(tools.options).toMatchObject({show:true,frame:false,resizable:false,transparent:true});
 const count=fixture.windows.length;await fixture.handlers.get("assistant:tools-open")!(chat);expect(fixture.windows.length).toBe(count);expect(tools.focus).toHaveBeenCalled();
 await fixture.handlers.get("assistant:hide")!(chat);expect(tools.isVisible()).toBe(true);
 await fixture.handlers.get("assistant:draft-message")!(local,{text:"要約用の文面"});expect(bubble.isVisible()).toBe(true);
 const draft=await fixture.handlers.get("assistant:draft-state")!(chat) as {revision:number;text:string};expect(draft.text).toBe("要約用の文面");
 expect(bubble.webContents.send).toHaveBeenCalledWith("assistant:draft-changed",draft);
 await fixture.handlers.get("assistant:draft-message")!(local,{text:"新しい文面"});await fixture.handlers.get("assistant:draft-consume")!(chat,{revision:draft.revision});
 const latest=await fixture.handlers.get("assistant:draft-state")!(chat) as {revision:number;text:string};expect(latest.text).toBe("新しい文面");
 await fixture.handlers.get("assistant:draft-consume")!(chat,{revision:latest.revision});expect(await fixture.handlers.get("assistant:draft-state")!(chat)).toMatchObject({text:null});
 await expect(fixture.handlers.get("assistant:draft-message")!(chat,{text:"拒否"})).rejects.toThrow("許可");
 await fixture.handlers.get("assistant:record-start")!(local);
 const check=fixture.permissionChecks.get("assistant-local")!;expect(check(tools.webContents,"media","soda-assistant://app",{isMainFrame:true,requestingUrl:tools.url,mediaType:"audio"})).toBe(true);
 await fixture.handlers.get("assistant:hide")!(local);expect(tools.isDestroyed()).toBe(true);expect(bubble.isVisible()).toBe(true);
 fixture.connections.at(-1)!.options.changed([{id:"notice-after-tools-close",title:"担当",message:"完了",at:100}],true);
 expect(bubble.isVisible()).toBe(true);
 expect(fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/notice.html'))).toHaveLength(0);
 expect(await fixture.handlers.get("assistant:inbox")!(chat)).toMatchObject({latestNotification:{id:"notice-after-tools-close"}});
 expect(check(tools.webContents,"media","soda-assistant://app",{isMainFrame:true,requestingUrl:tools.url,mediaType:"audio"})).toBe(false);
 await fixture.handlers.get("assistant:tools-open")!(chat);const reopened=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(reopened.isVisible()).toBe(true));
 await fixture.handlers.get("assistant:draft-message")!({sender:reopened.webContents,senderFrame:reopened.webContents.mainFrame},{text:"未受領の文面"});
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
 expect(reopened.isDestroyed()).toBe(true);
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 await fixture.handlers.get("assistant:chat")!(event);const nextChat=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(nextChat.isVisible()).toBe(true));
 expect(await fixture.handlers.get("assistant:draft-state")!({sender:nextChat.webContents,senderFrame:nextChat.webContents.mainFrame})).toMatchObject({text:null});
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("opens the dedicated terminal or its pinned form in a reply popup while ordinary Soda remains separate",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 const rpc=fixture.controls.at(-1)!,actor={instanceId:randomUUID(),kind:"codex",label:"generated",state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1};
 expect(rpc.options).toMatchObject({kind:"desktop"});
 const scope={workspaceId:randomUUID(),tabId:randomUUID(),paneId:randomUUID()};let pending:{askId:string;paneId:string}[]=[];
 rpc.request.mockImplementation(async(method:string,p:Record<string,unknown>)=>{
  if(method==="assistant.get")return{deviceId:p.deviceId,...scope,kind:"codex",state:"ready",agent:actor,observedAgent:actor};
  if(method==="agent.kinds")return{kinds:[{kind:"codex",label:"generated",available:true}]};
  if(method==="ask.subscribe")return{asks:pending};
  if(method==="assistant.conversation")throw Error("no transcript");return{};
 });
 rpc.options.status(true);await fixture.handlers.get("assistant:chat")!(event);const bubble=fixture.windows.at(-1)!,local={sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame};
 await vi.waitFor(async()=>expect(await fixture.handlers.get("assistant:conversation")!(local)).toMatchObject({connected:true,session:{state:"ready"}}));
 await fixture.handlers.get("assistant:open")!(local);const full=fixture.windows.at(-1)!;
 await fixture.handlers.get("assistant:session-open")!(local);const reply=fixture.windows.at(-1)!;
 expect(reply).not.toBe(full);expect(new URL(remoteOf(reply).url).searchParams.get("assistantView")).toBe("reply");
 expect(new URLSearchParams(new URL(remoteOf(reply).url).hash.slice(1)).has("assistantAsk")).toBe(false);
 const askId=randomUUID();pending=[{askId:randomUUID(),paneId:randomUUID()},{askId,paneId:scope.paneId},{askId:randomUUID(),paneId:scope.paneId}];
 await fixture.handlers.get("assistant:session-open")!(local);
 const target=new URLSearchParams(new URL(remoteOf(reply).url).hash.slice(1));expect(target.get("assistantAsk")).toBe(askId);expect(target.get("assistantPane")).toBe(scope.paneId);
 expect(remoteOf(full).url).toBe("http://127.0.0.1:7780/");
 const previous=remoteOf(reply).url;let finish!:(value:unknown)=>void;rpc.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const delayed=fixture.handlers.get("assistant:session-open")!(local);rpc.options.status(false);finish({asks:pending});
 await expect(delayed).rejects.toThrow("専用セッションが変更");expect(remoteOf(reply).url).toBe(previous);
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("waits for the first Soda document, then activates and repaints without a second open",async()=>{
 const settings=fixture.windows[0]!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 let finish!:()=>void;fixture.nextLoad=()=>new Promise(resolve=>{finish=resolve;});
 await fixture.handlers.get("assistant:open")!(event);
 const panel=fixture.windows.at(-1)!;await new Promise(resolve=>setImmediate(resolve));
 expect(panel.options.show).toBe(false);expect(panel.options.icon).toMatch(/sodashitsu\.(ico|png)$/);
 expect(panel.show).not.toHaveBeenCalled();
 finish();await vi.waitFor(()=>expect(panel.show).toHaveBeenCalledOnce());
 expect(panel.focus).toHaveBeenCalledOnce();expect(panel.webContents.invalidate).toHaveBeenCalledOnce();
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});
it("loads settings in a visible native window and activates the loaded content without another click",async()=>{
 const {app}=await import("electron");fixture.windows[0]!.destroy();
 let finish!:()=>void;fixture.nextLoad=()=>new Promise(resolve=>{finish=resolve;});
 app.emit("activate");const settings=fixture.windows.at(-1)!;
 await new Promise(resolve=>setImmediate(resolve));
 expect(settings.url).toBe("soda-assistant://app/settings.html");
 expect(settings.options.show).toBe(true);expect(settings.options.backgroundColor).toBe("#00000000");
 expect(settings.show).not.toHaveBeenCalled();
 finish();await vi.waitFor(()=>expect(settings.show).toHaveBeenCalledOnce());
 expect(settings.focus).toHaveBeenCalledOnce();expect(settings.webContents.invalidate).toHaveBeenCalledOnce();
 app.emit("activate");expect(settings.webContents.invalidate).toHaveBeenCalledTimes(2);
});
it("matches an unsaved character through settings IPC and ignores unused external URLs for PC speech",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 const request=vi.fn(async()=>new Response(JSON.stringify([{name:"女性船長",styles:[{id:8,name:"ノーマル",type:"talk"}]}])));
 vi.stubGlobal("fetch",request);
 try{
  const result=await fixture.handlers.get("assistant:voice-match")!(event,{voiceProvider:"voicevox",voicevoxOrigin:"http://127.0.0.1:50022",voicevoxStyleId:108,voiceFollowCharacter:true,characterId:"captain-female"});
  expect(result).toMatchObject({id:8});
  // A hidden unfinished external URL is irrelevant when previewing PC speech.
  await fixture.handlers.get("assistant:save")!(event,{enabled:true,voiceEnabled:true,voiceProvider:"system",mode:"tray"});
  fixture.speech.mockClear();
  await fixture.handlers.get("assistant:voice-test")!(event,{voiceProvider:"system",voicevoxOrigin:"unfinished",voicevoxStyleId:108,voiceFollowCharacter:false,characterId:"captain-female"});
  await vi.waitFor(()=>expect(fixture.speech).toHaveBeenCalledOnce());
  await fixture.handlers.get("assistant:save")!(event,{enabled:false});
 }finally{vi.unstubAllGlobals();}
});

it("synthesizes the draft automatic speaker, then a manual speaker, without overwriting saved voice settings",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,voiceEnabled:true,voiceProvider:"system",voicevoxStyleId:108,mode:"tray"});
 const wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
 const fetcher=vi.fn(async(url:string)=>url.endsWith('/speakers')?new Response(JSON.stringify([{name:"女性船長",styles:[{id:8,name:"ノーマル",type:"talk"}]}])):url.includes('/audio_query')?new Response('{}'):new Response(wav));
 vi.stubGlobal('fetch',fetcher);fixture.wavPlay.mockClear();
 try{
  const draft={voiceProvider:"voicevox",voicevoxOrigin:"http://127.0.0.1:50022",voicevoxStyleId:108,voiceFollowCharacter:true,characterId:"captain-female"};
  await fixture.handlers.get('assistant:voice-test')!(event,draft);
  await vi.waitFor(()=>expect(fixture.wavPlay).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls.some(([url])=>url.includes('/synthesis?speaker=8'))).toBe(true);
  await fixture.handlers.get('assistant:voice-test')!(event,{...draft,voicevoxStyleId:3,voiceFollowCharacter:false});
  await vi.waitFor(()=>expect(fixture.wavPlay).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls.some(([url])=>url.includes('/synthesis?speaker=3'))).toBe(true);
  expect(await fixture.handlers.get('assistant:read')!(event)).toMatchObject({voiceProvider:'system',voicevoxStyleId:108});
 }finally{vi.unstubAllGlobals();await fixture.handlers.get('assistant:save')!(event,{enabled:false});}
});
it("does not send a resident synthesis after stop during CORE configuration lookup",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get('assistant:save')!(event,{enabled:true,voiceEnabled:true,voiceProvider:'core',voiceFollowCharacter:false,mode:'tray'});
 const rpc=fixture.controls.at(-1)!,original=rpc.request.getMockImplementation();let resolve!: (value:unknown)=>void;
 rpc.request.mockImplementation(async(method:string)=>method==='assistant.voice_core'?new Promise(done=>{resolve=done;}):{kind:'json',value:[]});
 try{
  await fixture.handlers.get('assistant:voice-test')!(event);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
  await fixture.handlers.get('assistant:voice-stop')!(event);resolve({enabled:true,transport:'ipc',origin:null});
  await new Promise(done=>setImmediate(done));expect(rpc.request.mock.calls.some(([method])=>method==='voice.call')).toBe(false);
 }finally{rpc.request.mockImplementation(original!);await fixture.handlers.get('assistant:save')!(event,{enabled:false});}
});

it("uses the resident CLI backend and selected CORE version without an HTTP synthesis request",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get('assistant:save')!(event,{enabled:true,voiceEnabled:true,voiceProvider:'core',voiceFollowCharacter:false,voicevoxStyleId:8,voiceCoreVersion:'0.17.0',mode:'tray'});
 const rpc=fixture.controls.at(-1)!,original=rpc.request.getMockImplementation(),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
 rpc.request.mockClear();rpc.request.mockImplementation(async(method:string)=>method==='assistant.voice_core'?{enabled:true,transport:'ipc',origin:null}:{kind:'bytes',mime:'audio/wav',base64:wav.toString('base64')});
 fixture.wavPlay.mockClear();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 try{
  await fixture.handlers.get('assistant:voice-test')!(event);
  await vi.waitFor(()=>expect(fixture.wavPlay).toHaveBeenCalledOnce());
  expect(rpc.request).toHaveBeenCalledWith('voice.call',expect.objectContaining({operation:'synthesize',cancellable:true,speaker:8,coreVersion:'0.17.0',requestId:expect.any(String)}),expect.anything());
  expect(fetcher).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();rpc.request.mockImplementation(original!);await fixture.handlers.get('assistant:save')!(event,{enabled:false});}
});

it("limits native window controls to approved local main frames",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 expect(settings.options).toMatchObject({frame:false,resizable:false,show:true,minWidth:360,minHeight:360});expect(settings.menu).toBeNull();
 const action=fixture.handlers.get("assistant:window-action")!;
 const before=settings.getBounds();await action(event,"maximize");expect(settings.getBounds()).toEqual({x:0,y:0,width:1920,height:1040});
 await action(event,"maximize");expect(settings.getBounds()).toEqual(before);
 await action(event,"minimize");expect(settings.minimize).toHaveBeenCalledOnce();
 await expect(action(event,"shell")).rejects.toThrow();
 await expect(action({...event,senderFrame:{url:settings.url}},"close")).rejects.toThrow("許可");
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 await fixture.handlers.get("assistant:chat")!(event);const bubble=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("bubble.html"))!;
 await expect(fixture.handlers.get("assistant:window-resize")!({sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame},{phase:"start",handle:"e"})).rejects.toThrow("許可");
 await fixture.handlers.get("assistant:tools-open")!({sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame});const tools=fixture.windows.at(-1)!;
 await action({sender:tools.webContents,senderFrame:tools.webContents.mainFrame},"close");expect(tools.destroyed).toBe(true);expect(settings.destroyed).toBe(false);
});

it("revokes transparent-window resize gestures and restores removed-display windows inside the current display",async()=>{
 const {screen}=await import("electron"),settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},resize=fixture.handlers.get("assistant:window-resize")!;
 settings.show();const cursor=vi.spyOn(screen,"getCursorScreenPoint").mockReturnValue({x:100,y:100});settings.setBounds({x:100,y:100,width:500,height:500});
 let result=await resize(event,{phase:"start",handle:"se"}) as {token:string};cursor.mockReturnValue({x:140,y:180});await resize(event,{phase:"move",token:result.token});expect(settings.getBounds()).toEqual({x:100,y:100,width:540,height:580});
 for(const lifecycle of ["hide","minimize","blur","navigation"]){settings.show();result=await resize(event,{phase:"start",handle:"n"}) as {token:string};
  if(lifecycle==="navigation")settings.webContents.emit("did-start-navigation",{},settings.url,false,true);else settings.emit(lifecycle);
  await expect(resize(event,{phase:"move",token:result.token})).rejects.toThrow("開始し直して");
 }
 const displays=vi.spyOn(screen,"getAllDisplays").mockReturnValue([{id:1,workArea:{x:0,y:0,width:1920,height:1040}},{id:2,workArea:{x:1920,y:0,width:1280,height:1000}}] as any);
 settings.setBounds({x:2100,y:100,width:600,height:600});await fixture.handlers.get("assistant:window-action")!(event,"maximize");
 displays.mockReturnValue([{id:1,workArea:{x:0,y:0,width:1920,height:1040}}] as any);await fixture.handlers.get("assistant:window-action")!(event,"maximize");
 const b=settings.getBounds();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(1920);expect(b.y+b.height).toBeLessThanOrEqual(1040);
});
it("isolates the compact panel shell from remote contents and closes child renderers",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 await fixture.handlers.get("assistant:open")!(event);const panel=fixture.windows.at(-1)!,view=remoteOf(panel);
 expect(panel.url).toBe("soda-assistant://app/panel.html");expect(panel.options).toMatchObject({frame:false,transparent:true,resizable:false});expect(view.options.webPreferences).not.toHaveProperty("preload");
 expect(view.bounds).toEqual({x:12,y:42,width:376,height:586});panel.setBounds({x:0,y:0,width:900,height:700});expect(view.bounds).toEqual({x:12,y:42,width:876,height:646});
 const local={sender:panel.webContents,senderFrame:panel.webContents.mainFrame};await expect(fixture.handlers.get("assistant:read")!(local)).rejects.toThrow("許可");await expect(fixture.handlers.get("assistant:save")!(local,{enabled:false})).rejects.toThrow("許可");
 await expect(fixture.handlers.get("assistant:window-action")!({sender:view.webContents,senderFrame:view.webContents.mainFrame},"close")).rejects.toThrow("許可");
 const remoteContents=view.webContents;(view as any).webContents=undefined;
 panel.close();expect(view.destroyed).toBe(true);expect(remoteContents.close).toHaveBeenCalledOnce();expect(settings.destroyed).toBe(false);
});

it("restores every maximized assistant window on drag, updates its icon state, and allows immediate resizing",async()=>{
 const {screen}=await import("electron"),settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!;
 const eventOf=(win:MockWindow)=>({sender:win.webContents,senderFrame:win.webContents.mainFrame}),event=eventOf(settings);
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 await fixture.handlers.get("assistant:tools-open")!(event);const tools=fixture.windows.at(-1)!;
 await fixture.handlers.get("assistant:open")!(event);const panel=fixture.windows.at(-1)!;
 const action=fixture.handlers.get("assistant:window-action")!,state=fixture.handlers.get("assistant:window-state")!,resize=fixture.handlers.get("assistant:window-resize")!;
 const cursor=vi.spyOn(screen,"getCursorScreenPoint");
 for(const win of [settings,tools,panel]){
  win.show();const local=eventOf(win);win.setBounds({x:100,y:100,width:500,height:500});
  expect(await action(local,"maximize")).toMatchObject({maximized:true});
  expect(await state(local)).toMatchObject({maximized:true});
  const idle=await resize(local,{phase:"start",handle:"se"}) as {token:string};await resize(local,{phase:"end",token:idle.token});
  expect(await state(local)).toMatchObject({maximized:true});
  cursor.mockReturnValue({x:600,y:100});const maximum=win.getBounds();win.bounds={...maximum,x:100,y:80};win.emit("move");
  expect(win.getBounds()).toMatchObject({width:500,height:500});
  expect(win.webContents.send).toHaveBeenCalledWith("assistant:window-state-changed",{maximized:false,revision:expect.any(Number)});
  expect(await state(local)).toMatchObject({maximized:false});
  const {token}=await resize(local,{phase:"start",handle:"se"}) as {token:string};
  cursor.mockReturnValue({x:640,y:130});await resize(local,{phase:"move",token});await resize(local,{phase:"end",token});
  expect(win.getBounds()).toMatchObject({width:540,height:530});
  expect(await action(local,"maximize")).toMatchObject({maximized:true});
  expect(await action(local,"maximize")).toMatchObject({maximized:false});expect(win.getBounds()).toMatchObject({width:540,height:530});
 }
 const contents=remoteOf(panel).webContents;await expect(state({sender:contents,senderFrame:contents.mainFrame})).rejects.toThrow("許可");tools.close();panel.close();
});

it("accepts tools-only bounded media imports and rejects stale OCR/audio contexts",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false,ocrEnabled:true,ocrProvider:"local",transcriptionEnabled:true,transcriptionProvider:"local"});
 await fixture.handlers.get("assistant:tools-open")!(event);const tools=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(tools.isVisible()).toBe(true));const local={sender:tools.webContents,senderFrame:tools.webContents.mainFrame};
 const upload=fixture.handlers.get("assistant:ocr-upload")!,state=await fixture.handlers.get("assistant:ocr-state")!(local) as any;
 const bytes=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=","base64")).buffer;
 await expect(upload(event,{revision:state.revision,bytes})).rejects.toThrow("許可");
 const image=await upload(local,{revision:state.revision,bytes}) as any;expect(image.state).toMatchObject({status:"ready",width:1,height:1});
 await expect(upload(local,{revision:state.revision,bytes})).rejects.toThrow("状態が変わり");
 await expect(upload(local,{revision:image.state.revision,bytes:new ArrayBuffer(8*1024*1024+1)})).rejects.toThrow();
 await expect(upload(local,{revision:image.state.revision,bytes:new ArrayBuffer(1)})).rejects.toThrow("PNG");
 const audio=fixture.handlers.get("assistant:transcribe-upload")!,snapshot=await fixture.handlers.get("assistant:tools")!(local) as any;
 const fetch=fixture.audioFetch;fetch.mockClear();
 const request={name:"dropped.wav",bytes:new Uint8Array([1,2,3]).buffer,revision:snapshot.revision,context:snapshot.transcriptionContext};
 await expect(audio(event,request)).rejects.toThrow("許可");await expect(audio(local,{...request,context:"0".repeat(64)})).rejects.toThrow("変わり");expect(fetch).not.toHaveBeenCalled();
 await audio(local,request);expect((await fixture.handlers.get("assistant:tools")!(local) as any).transcription).toMatchObject({status:"done"});expect(fetch).toHaveBeenCalledOnce();await expect(audio(local,request)).rejects.toThrow("変わり");
 const current=await fixture.handlers.get("assistant:tools")!(local) as any;expect(current.transcription.text).toBe("generated recording transcription");
 const minimized=vi.spyOn(tools,"isMinimized").mockReturnValue(true);await expect(audio(local,{...request,revision:current.revision,context:current.transcriptionContext})).rejects.toThrow("開いて");await expect(upload(local,{revision:image.state.revision,bytes})).rejects.toThrow("開いて");minimized.mockRestore();
 tools.hide();await expect(audio(local,{...request,revision:current.revision,context:current.transcriptionContext})).rejects.toThrow("開いて");tools.close();
});

it("shares only the saved appearance mode with local windows and broadcasts mode changes",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!,local={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 const save=fixture.handlers.get("assistant:save")!,state=fixture.handlers.get("assistant:appearance-state")!;
 await save(local,{enabled:true,mode:"tray",appearance:"light"});
 const first=await state(local) as {revision:number;mode:string};expect(first).toMatchObject({revision:expect.any(Number),mode:"light"});
 await fixture.handlers.get("assistant:tools-open")!(local);const tools=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(tools.isVisible()).toBe(true));
 const toolEvent={sender:tools.webContents,senderFrame:tools.webContents.mainFrame};expect(await state(toolEvent)).toEqual(first);
 await save(local,{enabled:true,mode:"tray",appearance:"system"});
 expect(tools.webContents.send).toHaveBeenCalledWith("assistant:appearance-changed",expect.objectContaining({revision:first.revision+1,mode:"system"}));
 expect(await state(toolEvent)).toMatchObject({revision:first.revision+1,mode:"system"});
 await expect(state({sender:tools.webContents,senderFrame:{url:"https://untrusted.test/"}})).rejects.toThrow("許可");
 tools.close();
});

it("maximizes chat to the top and left while retaining its anchors and normal size",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",quietFullscreen:false});
 await fixture.handlers.get("assistant:chat")!(event);
 const chat=fixture.windows.filter(w=>!w.destroyed&&w.url.endsWith("bubble.html")).at(-1)!;
 await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));
 const local={sender:chat.webContents,senderFrame:chat.webContents.mainFrame};
 const action=fixture.handlers.get("assistant:window-action")!,state=fixture.handlers.get("assistant:window-state")!;
 const before=chat.getBounds();
 expect(await action(local,"maximize")).toMatchObject({maximized:true});
 expect(chat.getBounds()).toEqual({x:0,y:0,width:before.x+before.width,height:before.y+before.height});
 const idle=await fixture.handlers.get("assistant:resize-start")!(local,{handle:"nw"}) as {token:string};
 await fixture.handlers.get("assistant:resize-end")!(local,idle);expect(await state(local)).toMatchObject({maximized:true});
 await expect(fixture.handlers.get("assistant:window-resize")!(local,{phase:"start",handle:"e"})).rejects.toThrow("許可");
 const saved=await fixture.handlers.get("assistant:read")!(event) as Record<string,unknown>;
 await fixture.handlers.get("assistant:save")!(event,{...saved,appearance:"light"});
 expect(await state(local)).toMatchObject({maximized:true});
 expect(chat.getBounds()).toEqual({x:0,y:0,width:before.x+before.width,height:before.y+before.height});
 expect(await action(local,"maximize")).toMatchObject({maximized:false});expect(chat.getBounds()).toEqual(before);
 await action(local,"maximize");await action(local,"close");
 expect(chat.isDestroyed()).toBe(false);expect(chat.isVisible()).toBe(false);
 await fixture.handlers.get("assistant:chat")!(event);expect(chat.isVisible()).toBe(true);
 await action(local,"maximize");expect(chat.getBounds()).toEqual(before);
 const character=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("character.html"))!;
 await expect(action({sender:character.webContents,senderFrame:character.webContents.mainFrame},"maximize")).rejects.toThrow("許可");
 await expect(action({sender:chat.webContents,senderFrame:{url:"soda-assistant://app/bubble.html"}},"maximize")).rejects.toThrow("許可");
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});


it("resizes stationary maximized windows and exits maximization only when their bounds change",async()=>{
 const {screen}=await import("electron"),cursor=vi.spyOn(screen,"getCursorScreenPoint").mockReturnValue({x:100,y:100});
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!;
 const eventOf=(win:MockWindow)=>({sender:win.webContents,senderFrame:win.webContents.mainFrame}),event=eventOf(settings);
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"character",quietFullscreen:false});
 await fixture.handlers.get("assistant:tools-open")!(event);const tools=fixture.windows.at(-1)!;
 await fixture.handlers.get("assistant:open")!(event);const panel=fixture.windows.at(-1)!;
 await fixture.handlers.get("assistant:chat")!(event);const chat=fixture.windows.at(-1)!;
 const action=fixture.handlers.get("assistant:window-action")!,state=fixture.handlers.get("assistant:window-state")!,resize=fixture.handlers.get("assistant:window-resize")!;
 for(const win of [settings,tools,panel,chat]){
  await vi.waitFor(()=>expect(win.isVisible()).toBe(true));const local=eventOf(win);
  await action(local,"maximize");const maximum=win.getBounds();cursor.mockReturnValue({x:100,y:100});
  const start=win===chat?()=>fixture.handlers.get("assistant:resize-start")!(local,{handle:"nw"}):()=>resize(local,{phase:"start",handle:"nw"});
  const move=(token:string)=>win===chat?fixture.handlers.get("assistant:resize-move")!(local,{token}):resize(local,{phase:"move",token});
  const end=(token:string)=>win===chat?fixture.handlers.get("assistant:resize-end")!(local,{token}):resize(local,{phase:"end",token});
  const {token}=await start() as {token:string};await move(token);
  expect(win.getBounds()).toEqual(maximum);expect(await state(local)).toMatchObject({maximized:true});
  cursor.mockReturnValue({x:140,y:130});await move(token);
  expect(win.getBounds()).toEqual({x:maximum.x+40,y:maximum.y+30,width:maximum.width-40,height:maximum.height-30});
  expect(await state(local)).toMatchObject({maximized:false});
  expect(win.webContents.send).toHaveBeenLastCalledWith("assistant:window-state-changed",{maximized:false,revision:expect.any(Number)});
  cursor.mockReturnValue({x:160,y:140});await move(token);await end(token);const resized=win.getBounds();
  expect(resized).toEqual({x:maximum.x+60,y:maximum.y+40,width:maximum.width-60,height:maximum.height-40});
  await action(local,"maximize");await action(local,"maximize");expect(win.getBounds()).toEqual(resized);
 }
 cursor.mockRestore();await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});


it("opens only a current roster actor in a reply terminal and rejects stale, hidden, and settings callers",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 await fixture.handlers.get("assistant:chat")!(event);const chat=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));
 const source={serverOrigin:"http://127.0.0.1:7780",machineId:"local",paneId:randomUUID(),workspaceId:randomUUID(),agentInstanceId:randomUUID()};
 const connection=fixture.connections.at(-1)!;connection.feed.agents=[{source,title:"作業担当",state:"working",since:1}];connection.options.status("connected");
 const open=fixture.handlers.get("assistant:agent-open")!,local={sender:chat.webContents,senderFrame:chat.webContents.mainFrame};
 await expect(open(event,{source})).rejects.toThrow("許可");
 await open(local,{source});const panel=fixture.windows.at(-1)!,url=remoteOf(panel).url;
 expect(url).toContain("assistantView=reply");expect(url).toContain(source.paneId);expect(url).toContain(source.agentInstanceId);
 await expect(open(local,{source:{...source,agentInstanceId:randomUUID()}})).rejects.toThrow("エージェントが変更");
 connection.feed.agents=[];await expect(open(local,{source})).rejects.toThrow("エージェントが変更");
 chat.hide();await expect(open(local,{source})).rejects.toThrow("会話を開いて");
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("persists captain choices only from chat and protects them from an older settings form",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 const old=await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false}) as Record<string,unknown>;
 await fixture.handlers.get("assistant:chat")!(event);const chat=fixture.windows.at(-1)!,local={sender:chat.webContents,senderFrame:chat.webContents.mainFrame};
 const choose=fixture.handlers.get("assistant:captain-choice")!;
 const input={kind:"muse",profile:{model:"muse-wonder-1.0",effort:"high"},notificationSummary:true};
 await expect(choose(event,input)).rejects.toThrow("許可");
 expect(await choose(local,input)).toMatchObject({captainKind:"muse",agentProfiles:{muse:input.profile}});
 await fixture.handlers.get("assistant:save")!(event,{...old,appearance:"light"});
 expect(await fixture.handlers.get("assistant:read")!(local)).toMatchObject({captainKind:"muse",notificationSummary:true,agentProfiles:{muse:input.profile}});
 await expect(choose(local,{...input,kind:"claude",profile:{model:"haiku",effort:"ultra"}})).rejects.toThrow();
 await fixture.handlers.get("assistant:save")!(event,{enabled:false});
});

it("defers notification display until audio is ready and keeps text when stopped during preparation",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get('assistant:save')!(event,{enabled:true,voiceEnabled:true,voiceProvider:'system',quietFullscreen:false,mode:'tray'});
 let start!:()=>void,finish!:()=>void;
 const defer=()=>fixture.speech.mockImplementationOnce((_text,_signal,ready)=>new Promise<void>(resolve=>{start=ready!;finish=resolve}));
 try{
  defer();const connection=fixture.connections.at(-1)!;
  connection.options.changed([{id:'prepare-visible',title:'準備担当',message:'作業が完了しました',at:100}],true);
  expect(fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/notice.html'))).toHaveLength(0);
  expect(await fixture.handlers.get('assistant:voice-state')!(event)).toMatchObject({speaking:false});
  start();const notice=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(notice.isVisible()).toBe(true));expect(notice.url).toContain('/notice.html');
  expect(await fixture.handlers.get('assistant:voice-state')!(event)).toMatchObject({speaking:true});
  finish();await vi.waitFor(async()=>expect(await fixture.handlers.get('assistant:voice-state')!(event)).toMatchObject({speaking:false}));
  await fixture.handlers.get('assistant:save')!(event,{enabled:true,voiceEnabled:true,voiceProvider:'system',quietFullscreen:false,mode:'tray'});
  defer();fixture.connections.at(-1)!.options.changed([{id:'prepare-stopped',title:'停止担当',message:'文字で残す通知',at:101}],true);
  expect(fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/notice.html'))).toHaveLength(0);
  await fixture.handlers.get('assistant:voice-stop')!(event);
  const textNotice=fixture.windows.at(-1)!;await vi.waitFor(()=>expect(textNotice.isVisible()).toBe(true));expect(textNotice.url).toContain('/notice.html');
  expect(await fixture.handlers.get('assistant:voice-state')!(event)).toMatchObject({speaking:false});
 }finally{finish?.();await fixture.handlers.get('assistant:save')!(event,{enabled:false});}
});

it("follows shared theme changes and OS selection without overwriting the independent palette",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 const save=fixture.handlers.get('assistant:save')!,state=fixture.handlers.get('assistant:appearance-state')!;
 await save(event,{enabled:true,mode:'tray',appearance:'sodashitsu',colorTheme:'nord'});
 const rpc=fixture.controls.at(-1)!;
 rpc.request.mockResolvedValueOnce({rev:98,prefs:{theme:'kanagawa-lotus'}});
 rpc.options.status(true);
 await vi.waitFor(async()=>expect(await state(event)).toMatchObject({theme:'kanagawa-lotus',mode:'light'}));
 expect(rpc.request).toHaveBeenCalledWith('prefs.get',{});
 rpc.options.prefsChanged!({rev:100,prefs:{theme:'one-light',themeAuto:false}});
 expect(await state(event)).toMatchObject({mode:'light',theme:'one-light'});
 rpc.options.prefsChanged!({rev:101,prefs:{theme:'tokyo-night',themeAuto:true,themeLight:'gruvbox-light',themeDark:'dracula'}});
 const {nativeTheme}=await import('electron');
 Object.assign(nativeTheme,{shouldUseDarkColors:true});nativeTheme.emit('updated');
 expect(await state(event)).toMatchObject({mode:'dark',theme:'dracula',vars:{'--assistant-button-bg':'#6070a1'}});
 rpc.options.prefsChanged!({rev:99,prefs:{theme:'one-light'}});
 expect(await state(event)).toMatchObject({theme:'dracula'});
 Object.assign(nativeTheme,{shouldUseDarkColors:false});nativeTheme.emit('updated');expect(await state(event)).toMatchObject({mode:'light',theme:'gruvbox-light'});
 expect(await fixture.handlers.get('assistant:read')!(event)).toMatchObject({appearance:'sodashitsu',colorTheme:'nord'});
 await save(event,{enabled:true,mode:'tray',appearance:'dark',colorTheme:'nord'});
 rpc.options.prefsChanged!({rev:102,prefs:{theme:'one-light'}});expect(await state(event)).toMatchObject({mode:'dark',theme:'nord'});
 await save(event,{enabled:false});
});

it("applies the selected front/back layer to the character, chat and notifications only",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},save=fixture.handlers.get('assistant:save')!;
 await save(event,{enabled:true,mode:'character',windowLayer:'front',quietFullscreen:false,voiceEnabled:false});
 const character=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/character.html')).at(-1)!;expect(character.options.alwaysOnTop).toBe(true);
 await fixture.handlers.get('assistant:chat')!(event);const chat=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/bubble.html')).at(-1)!;
 await vi.waitFor(()=>expect(chat.isVisible()).toBe(true));chat.focus.mockClear();chat.showInactive.mockClear();
 await save(event,{enabled:true,mode:'character',windowLayer:'back',quietFullscreen:false,voiceEnabled:false});
 expect(chat.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
 const backCharacter=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/character.html')).at(-1)!;expect(backCharacter.options.alwaysOnTop).toBe(false);
 await fixture.handlers.get('assistant:chat')!(event);expect(chat.showInactive).toHaveBeenCalled();expect(chat.focus).not.toHaveBeenCalled();
 expect(settings.options.alwaysOnTop).toBe(false);expect(settings.setAlwaysOnTop).not.toHaveBeenCalled();
 await save(event,{enabled:true,mode:'character',windowLayer:'front',quietFullscreen:false,voiceEnabled:false});expect(chat.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
 await save(event,{enabled:false});
});

it("uses the current stacking mode when a delayed chat window becomes ready",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},save=fixture.handlers.get('assistant:save')!;
 await save(event,{enabled:true,mode:'tray',windowLayer:'front'});
 fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/bubble.html')).forEach(w=>w.destroy());
 fixture.deferReady=true;
 try{
  await fixture.handlers.get('assistant:chat')!(event);const chat=fixture.windows.at(-1)!;
  await save(event,{enabled:true,mode:'tray',windowLayer:'back'});chat.emit('ready-to-show');
  expect(chat.focus).not.toHaveBeenCalled();expect(chat.showInactive).toHaveBeenCalled();expect(chat.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
 }finally{fixture.deferReady=false;await save(event,{enabled:false});}
});

it("waits for the shared headline and keeps full detail in the conversation only",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},save=fixture.handlers.get('assistant:save')!;
 await save(event,{enabled:true,mode:'tray',quietFullscreen:false,voiceEnabled:false});
 const rpc=fixture.controls.at(-1)!,original=rpc.request.getMockImplementation();let finish!:(value:unknown)=>void;
 rpc.request.mockImplementation(async(method:string)=>method==='notification.summary'?new Promise(done=>{finish=done;}):{ok:true});
 try{
  rpc.options.prefsChanged!({rev:10000,prefs:{summarySettings:{kind:'codex',model:'',effort:'',sessionId:''}}});
  const notice={id:randomUUID(),key:'done:headline',kind:'done',title:'担当',message:'非常に長い通知の原文'.repeat(100),at:Date.now(),source:{serverOrigin:'http://127.0.0.1:7780',machineId:'local',paneId:randomUUID(),workspaceId:randomUUID(),agentInstanceId:randomUUID()}};
  const count=fixture.windows.length;fixture.connections.at(-1)!.options.changed([notice],true);
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));expect(fixture.windows.length).toBe(count);
  finish({status:'ready',headline:'台本の確認待ちです',text:'詳細な作業要約'.repeat(100),message:''});
  await vi.waitFor(()=>expect(fixture.windows.at(-1)?.url).toBe('soda-assistant://app/notice.html'));
  const compact=fixture.windows.at(-1)!,local={sender:compact.webContents,senderFrame:compact.webContents.mainFrame};
  expect(await fixture.handlers.get('assistant:notice-state')!(local)).toMatchObject({message:'台本の確認待ちです'});
  await fixture.handlers.get('assistant:chat')!(event);const chat=fixture.windows.at(-1)!;
  expect(await fixture.handlers.get('assistant:inbox')!({sender:chat.webContents,senderFrame:chat.webContents.mainFrame})).toMatchObject({noticeSummaries:{[notice.id]:{text:'詳細な作業要約'.repeat(100)}}});
 }finally{rpc.options.prefsChanged!({rev:10001,prefs:{}});rpc.request.mockImplementation(original!);await save(event,{enabled:false});}
});

it("keeps disabled settings open for automatic saves and quits only when switching off",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},save=fixture.handlers.get('assistant:save')!;
 await new Promise(done=>setImmediate(done));fixture.quit.mockClear();await save(event,{enabled:false,appearance:'light'});await new Promise(done=>setImmediate(done));
 expect(fixture.quit).not.toHaveBeenCalled();
 await save(event,{enabled:true,mode:'tray',voiceEnabled:false});await save(event,{enabled:false});await new Promise(done=>setImmediate(done));
 expect(fixture.quit).toHaveBeenCalledOnce();
});

it("opens desktop popups in isolated sibling windows and keeps the original panel",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},save=fixture.handlers.get('assistant:save')!;
 await save(event,{enabled:true,mode:'tray',quietFullscreen:false,voiceEnabled:false});
 await fixture.handlers.get('assistant:open')!(event);const parent=fixture.windows.at(-1)!;
 const handler=remoteOf(parent).webContents.setWindowOpenHandler.mock.calls.at(-1)![0];
 const origin='http://127.0.0.1:7780',url=origin+'/desktop-view#'+encodeURIComponent(JSON.stringify({machineId:'generated-remote',label:'Generated desktop'}));
 const created:MockWindow[]=[];
 try{
  expect(handler({url})).toEqual({action:'deny'});const desktop=fixture.windows.at(-1)!;created.push(desktop);
  expect(desktop).not.toBe(parent);await vi.waitFor(()=>expect(remoteOf(desktop).url).toBe(url));
  expect(remoteOf(desktop).options.webPreferences).toMatchObject({sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'persist:assistant-server'});
  expect(remoteOf(desktop).options.webPreferences).not.toHaveProperty('preload');
  expect(desktop.options.title).toBe('操舵室・リモートデスクトップ');expect(remoteOf(parent).url).toBe(origin+'/');
  await expect(fixture.handlers.get('assistant:window-action')!({sender:remoteOf(desktop).webContents,senderFrame:remoteOf(desktop).webContents.mainFrame},'close')).rejects.toThrow('許可');
  const nested=remoteOf(desktop).webContents.setWindowOpenHandler.mock.calls.at(-1)![0];
  expect(nested({url})).toEqual({action:'deny'});const second=fixture.windows.at(-1)!;created.push(second);expect(second).not.toBe(desktop);
  const count=fixture.windows.length;
  for(const denied of [origin+'/settings',url.replace(origin,'https://foreign.invalid'),origin+'/desktop-view#%'])expect(handler({url:denied})).toEqual({action:'deny'});
  expect(fixture.windows).toHaveLength(count);
  await fixture.handlers.get('assistant:open')!(event);expect(fixture.windows).toHaveLength(count);expect(parent.visible).toBe(true);
  const contents=remoteOf(desktop).webContents;desktop.close();expect(contents.close).toHaveBeenCalledOnce();expect(parent.destroyed).toBe(false);
  expect(nested({url})).toEqual({action:'deny'});expect(fixture.windows).toHaveLength(count);
 }finally{for(const win of created)if(!win.destroyed)win.close();parent.close();await save(event,{enabled:false});}
});

it("shows a simple notice when its shared headline stalls without announcing a late duplicate",async()=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith('/settings.html')).at(-1)!;
 const event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame},save=fixture.handlers.get('assistant:save')!;
 await save(event,{enabled:true,mode:'tray',quietFullscreen:false,voiceEnabled:false});
 const rpc=fixture.controls.at(-1)!,original=rpc.request.getMockImplementation();let finish!:(value:unknown)=>void;
 rpc.request.mockImplementation(async(method:string)=>method==='notification.summary'?new Promise(done=>{finish=done;}):{ok:true});
 const originalTimeout=globalThis.setTimeout;let deadline:(()=>void)|undefined;
 const timeout=vi.spyOn(globalThis,'setTimeout').mockImplementation(((handler:()=>void,ms?:number,...args:unknown[])=>{
  if(ms===15000)deadline=handler;
  return originalTimeout(()=>Reflect.apply(handler,undefined,args),ms);
 }) as typeof setTimeout);
 try{
  rpc.options.prefsChanged!({rev:20000,prefs:{summarySettings:{kind:'codex',model:'',effort:'',sessionId:''}}});
  const notice={id:randomUUID(),key:'done:stalled-headline',kind:'done',title:'担当',message:'元の通知',at:Date.now(),source:{serverOrigin:'http://127.0.0.1:7780',machineId:'local',paneId:randomUUID(),workspaceId:randomUUID(),agentInstanceId:randomUUID()}};
  const count=fixture.windows.length;fixture.connections.at(-1)!.options.changed([notice],true);
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));expect(fixture.windows).toHaveLength(count);
  expect(deadline).toBeTypeOf('function');deadline!();
  await vi.waitFor(()=>expect(fixture.windows.at(-1)?.url).toBe('soda-assistant://app/notice.html'));
  const compact=fixture.windows.at(-1)!,local={sender:compact.webContents,senderFrame:compact.webContents.mainFrame};
  expect(await fixture.handlers.get('assistant:notice-state')!(local)).toMatchObject({message:'作業が完了しました。'});
  finish({status:'ready',headline:'後から完成した短い要約',text:'作業の詳細',message:''});
  await vi.waitFor(async()=>expect(await fixture.handlers.get('assistant:notice-state')!(local)).toMatchObject({message:'後から完成した短い要約'}));
  expect(fixture.windows.at(-1)).toBe(compact);expect(fixture.windows).toHaveLength(count+1);
 }finally{timeout.mockRestore();rpc.options.prefsChanged!({rev:20001,prefs:{}});rpc.request.mockImplementation(original!);await save(event,{enabled:false});}
});


it.each(["claude","codex","muse","agy","copilot","grok"])("previews local transcription and stages an edited draft for %s without sending",async kind=>{
 const settings=fixture.windows.filter(w=>!w.isDestroyed()&&w.url.endsWith("/settings.html")).at(-1)!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 try{
  await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false,transcriptionEnabled:true,transcriptionProvider:"local"});
  const rpc=fixture.controls.at(-1)!,actor={instanceId:randomUUID(),kind,label:kind,state:"idle",completionSeq:0,serverSeenSeq:0,verified:true,since:1};
  const scope={workspaceId:randomUUID(),tabId:randomUUID(),paneId:randomUUID()};
  rpc.request.mockImplementation(async(method:string,p:Record<string,unknown>)=>{
   if(method==="assistant.get")return{deviceId:p.deviceId,...scope,kind,state:"ready",agent:actor,observedAgent:actor};
   if(method==="agent.kinds")return{kinds:[{kind,label:kind,available:true}]};
   if(method==="assistant.conversation")throw Error("no generated transcript");return{};
  });rpc.options.status(true);await fixture.handlers.get("assistant:chat")!(event);
  const bubble=fixture.windows.at(-1)!,chat={sender:bubble.webContents,senderFrame:bubble.webContents.mainFrame};
  await vi.waitFor(async()=>expect(await fixture.handlers.get("assistant:conversation")!(chat)).toMatchObject({connected:true,session:{kind,state:"ready"}}));
  await fixture.handlers.get("assistant:tools-open")!(chat);const tools=fixture.windows.at(-1)!,local={sender:tools.webContents,senderFrame:tools.webContents.mainFrame};
  await vi.waitFor(()=>expect(tools.isVisible()).toBe(true));
  fixture.audioRead=async()=>({name:"generated.wav",mime:"audio/wav",bytes:new Uint8Array([1])});
  const {dialog}=await import("electron");vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({canceled:false,filePaths:["/generated.wav"]});
  await fixture.handlers.get("assistant:transcribe-file")!(local);
  const snapshot=await fixture.handlers.get("assistant:tools")!(local) as any;
  expect(snapshot.audioCapabilities).toMatchObject({kind,nativeAudio:kind==="codex",localTranscription:true});
  expect(snapshot.audioTargetReady).toBe(true);expect(snapshot.transcription).toMatchObject({status:"done",text:"generated recording transcription",context:snapshot.transcriptionContext});
  const request={text:"確認・編集した文章",revision:snapshot.transcription.revision,context:snapshot.transcriptionContext};
  await expect(fixture.handlers.get("assistant:transcription-draft")!(local,{...request,context:"0".repeat(64)})).rejects.toThrow("変わり");
  await expect(fixture.handlers.get("assistant:transcription-draft")!(local,{...request,revision:request.revision+1})).rejects.toThrow("変わり");
  await expect(fixture.handlers.get("assistant:transcription-draft")!(chat,request)).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:transcription-draft")!(local,request);
  expect(await fixture.handlers.get("assistant:draft-state")!(chat)).toMatchObject({text:request.text});
  expect(rpc.request.mock.calls.some(([method])=>method==="assistant.prompt"||method==="assistant.audio_begin")).toBe(false);
  const oldProviderGrant=await fixture.handlers.get("assistant:record-start")!(local) as {token:string};
  const providerFetches=fixture.audioFetch.mock.calls.length;
  await fixture.handlers.get("assistant:save")!(event,{...await fixture.handlers.get("assistant:read")!(event) as object,transcriptionProvider:"agent"});
  expect(tools.isDestroyed()).toBe(false);expect(tools.isVisible()).toBe(true);
  expect(tools.webContents.send).toHaveBeenCalledWith("assistant:recording-cancelled",{token:oldProviderGrant.token,reason:expect.stringContaining("処理先")});
  await expect(fixture.handlers.get("assistant:record-stop")!(local,{token:oldProviderGrant.token})).rejects.toThrow("対象");
  await expect(fixture.handlers.get("assistant:record-transcribe")!(local,{token:oldProviderGrant.token,mime:"audio/webm",bytes:new Uint8Array([1]).buffer})).rejects.toThrow();
  await expect(fixture.handlers.get("assistant:transcription-draft")!(local,request)).rejects.toThrow("変わり");
  expect(fixture.audioFetch.mock.calls.length).toBe(providerFetches);
  await fixture.handlers.get("assistant:save")!(event,{...await fixture.handlers.get("assistant:read")!(event) as object,transcriptionProvider:"local"});
  const grant=await fixture.handlers.get("assistant:record-start")!(local) as {token:string};
  const fetches=fixture.audioFetch.mock.calls.length;
  rpc.options.status(false);
  expect(tools.isDestroyed()).toBe(false);expect(tools.isVisible()).toBe(true);
  expect(tools.webContents.send).toHaveBeenCalledWith("assistant:recording-cancelled",{token:grant.token,reason:expect.stringContaining("処理先")});
  // This mock renderer deliberately ignores cancellation: main must still revoke the lease.
  await expect(fixture.handlers.get("assistant:record-stop")!(local,{token:grant.token})).rejects.toThrow("対象");
  await expect(fixture.handlers.get("assistant:record-transcribe")!(local,{token:grant.token,mime:"audio/webm",bytes:new Uint8Array([1]).buffer})).rejects.toThrow();
  expect(fixture.audioFetch.mock.calls.length).toBe(fetches);
  expect(fixture.permissionChecks.get("assistant-local")!(tools.webContents,"media","soda-assistant://app",{isMainFrame:true,requestingUrl:tools.url,mediaType:"audio"})).toBe(false);
  await expect(fixture.handlers.get("assistant:transcription-draft")!(local,request)).rejects.toThrow("変わり");
  expect((await fixture.handlers.get("assistant:tools")!(local) as any).transcription.text).toBe("");
 }finally{fixture.audioRead=null;await fixture.handlers.get("assistant:save")!(event,{enabled:false});}
});

it("saves Grok captain choices only through the authorized chat window",async()=>{
 const settings=fixture.windows.find(w=>!w.destroyed&&w.url.endsWith("settings.html"))!,event={sender:settings.webContents,senderFrame:settings.webContents.mainFrame};
 await fixture.handlers.get("assistant:save")!(event,{enabled:true,mode:"tray",quietFullscreen:false});
 try{await fixture.handlers.get("assistant:chat")!(event);const chat=fixture.windows.at(-1)!,local={sender:chat.webContents,senderFrame:chat.webContents.mainFrame},input={kind:"grok",profile:{model:"grok-generated",effort:"high"},notificationSummary:true};
 await expect(fixture.handlers.get("assistant:captain-choice")!(event,input)).rejects.toThrow("許可");
 expect(await fixture.handlers.get("assistant:captain-choice")!(local,input)).toMatchObject({captainKind:"grok",agentProfiles:{grok:input.profile}});
 }finally{await fixture.handlers.get("assistant:save")!(event,{enabled:false});}
});
