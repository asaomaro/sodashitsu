import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  displayRequests: new Map<string, (request: any, callback: (value: any) => void) => void>(),
  permissionChecks: new Map<string, (...args: any[]) => boolean>(),
  permissionRequests: new Map<string, (...args: any[]) => void>(),
  controls: [] as Array<{
    options: { status: (connected: boolean) => void };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  }>,
  connections: [] as Array<{
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
  quit: vi.fn(),
  startup: vi.fn(),
}));
class MockWindow extends EventEmitter {
  destroyed = false;
  visible = false;
  url = "";
  readonly webContents = Object.assign(new EventEmitter(), {
    id: fixture.windows.length + 1,
    mainFrame: { url: "" },
    setWindowOpenHandler: vi.fn(),
    send: vi.fn(),
  });
  constructor(readonly options: Record<string, unknown>) {
    super();
    fixture.windows.push(this);
  }
  async loadURL(url: string) {
    this.url = url;
    this.webContents.mainFrame.url = url;
    queueMicrotask(() => this.emit("ready-to-show"));
  }
  isDestroyed() {
    return this.destroyed;
  }
  destroy() {
    this.destroyed = true;
    this.visible = false;
    this.emit("closed");
  }
  setBounds = vi.fn();
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
vi.mock("electron", () => ({
  app: Object.assign(new EventEmitter(), {
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
  ipcMain: {
    handle: (name: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) =>
      fixture.handlers.set(name, handler),
  },
  Menu: { buildFromTemplate: (items: unknown) => items },
  nativeImage: { createFromPath: (path: string) => path },
  protocol: { registerSchemesAsPrivileged: vi.fn() },
  screen: Object.assign(new EventEmitter(), {
    getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
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
          fetch: async () => Response.json({ text: "generated recording transcription" }),
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
      readonly options: { status: (connected: boolean) => void },
    ) {
      fixture.controls.push(this);
    }
  },
}));

vi.mock("./noticeConnection.js", () => ({
  NoticeConnection: class {
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
  expect(panel.url).toBe("http://127.0.0.1:7780/");
  expect(panel.options).toMatchObject({
    webPreferences: {
      partition: "persist:assistant-server",
      sandbox: true,
      nodeIntegration: false,
    },
  });
  expect((panel.options.webPreferences as Record<string, unknown>).preload).toBeUndefined();
  await expect(
    fixture.handlers.get("assistant:save")!(
      { sender: panel.webContents, senderFrame: panel.webContents.mainFrame },
      {},
    ),
  ).rejects.toThrow("許可");
  const preventDefault = vi.fn();
  panel.webContents.emit("will-navigate", { preventDefault }, "https://evil.test");
  expect(preventDefault).toHaveBeenCalledOnce();
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray" });
  expect(character.isDestroyed()).toBe(true);
  await expect(fixture.handlers.get("assistant:read")!(characterEvent)).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  expect(panel.isDestroyed()).toBe(true);
});

it("uses a focusable local bubble for user chat and closes it when disabled", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
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

it("delivers a verbal notice through an inactive bubble and obeys mute", async () => {
  const settings = fixture.windows[0]!;
  const event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray" });
  const connection = fixture.connections.at(-1)!;
  const notice = { id: "generated", message: "作業が完了しました。" };
  connection.options.changed([notice], true);
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.showInactive).toHaveBeenCalledOnce());
  expect(bubble.focus).not.toHaveBeenCalled();
  expect(bubble.webContents.send).toHaveBeenCalledWith(
    "assistant:inbox-changed",
    expect.objectContaining({ notices: [notice] }),
  );
  const bubbleEvent = { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame };
  expect(await fixture.handlers.get("assistant:inbox")!(bubbleEvent)).toMatchObject({
    notices: [notice],
  });
  await expect(fixture.handlers.get("assistant:inbox")!(event)).rejects.toThrow("許可");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  expect(connection.stop).toHaveBeenCalledOnce();
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray", mute: true });
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
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray" });
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
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray" });
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
    mode: "tray",
    transcriptionEnabled: true,
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
    mode: "tray",
    transcriptionEnabled: true,
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
    mode: "tray",
    ocrEnabled: true,
    ocrExecutable: "/usr/bin/tesseract",
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
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray" });
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
  await fixture.handlers.get("assistant:save")!(event, { enabled: true, mode: "tray" });
  await fixture.handlers.get("assistant:open")!(event);
  const panel = fixture.windows.find(
    (window) => !window.destroyed && window.url === "http://127.0.0.1:7780/",
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
  const bubble = fixture.windows.at(-1)!;
  await vi.waitFor(() => expect(bubble.isVisible()).toBe(true));
  fixture.controls.at(-1)!.request.mockImplementation(async () => ({
    paneId: notice.source.paneId,
    workspaceId: notice.source.workspaceId,
    agent: { instanceId: notice.source.agentInstanceId },
  }));
  vi.spyOn(panel, "loadURL").mockRejectedValueOnce(Error("generated connection failure"));
  await fixture.handlers.get("assistant:source-open")!(
    { sender: bubble.webContents, senderFrame: bubble.webContents.mainFrame },
    { noticeId: notice.id },
  );
  await vi.waitFor(() => expect(panel.url).toMatch(/^data:text\/plain/));
  await fixture.handlers.get("assistant:open")!(event);
  expect(panel.url).toBe("http://127.0.0.1:7780/");
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});
it("grants one selected display without audio and consumes its PNG only once", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
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
    if (method === "agent.conversation")
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
    mode: "tray",
    characterId: "plugin:custom/robot",
    allowPluginCharacters: true,
  });
  expect(await fixture.handlers.get("assistant:character-info")!(event)).toEqual({
    name: "追加の船長",
    uri: `data:image/png;base64,${png}`,
  });
  await fixture.handlers.get("assistant:chat")!(event);
  const bubble = fixture.windows.at(-1)!;
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    characterId: "plugin:custom/robot",
    allowPluginCharacters: false,
  });
  expect(bubble.isDestroyed()).toBe(true);
  expect(await fixture.handlers.get("assistant:character-info")!(event)).toMatchObject({
    uri: "soda-assistant://app/captain-female.svg",
  });
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
  await fixture.handlers.get("assistant:character-pack-remove")!(event, { id: "custom" });
});
it("routes a remote notice reply through its registered machine and revokes it without local fallback", async () => {
  const settings = fixture.windows[0]!,
    event = { sender: settings.webContents, senderFrame: settings.webContents.mainFrame };
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
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
  expect(fixture.windows.at(-1)!.url).toContain(`assistantMachine=${machineId}`);
  await fixture.handlers.get("assistant:save")!(event, {
    enabled: true,
    mode: "tray",
    remoteNotifications: false,
  });
  await expect(
    fixture.handlers.get("assistant:source-key")!(local, { noticeId: notice.id, keyName: "y" }),
  ).rejects.toThrow("対象");
  expect(remote.stop).toHaveBeenCalled();
  await fixture.handlers.get("assistant:save")!(event, { enabled: false });
});
