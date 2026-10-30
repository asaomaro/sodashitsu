import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  protocols: new Map<string, (request: Request) => Promise<Response>>(),
  handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(),
  partitions: new Map<
    string,
    {
      protocol: {
        handle: (scheme: string, handler: (request: Request) => Promise<Response>) => void;
      };
      setPermissionRequestHandler: ReturnType<typeof vi.fn>;
      setPermissionCheckHandler: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    }
  >(),
  windows: [] as Array<MockWindow>,
  directory: "",
  quit: vi.fn(),
  startup: vi.fn(),
}));
class MockWindow extends EventEmitter {
  destroyed = false;
  url = "";
  readonly webContents = Object.assign(new EventEmitter(), {
    id: fixture.windows.length + 1,
    mainFrame: { url: "" },
    setWindowOpenHandler: vi.fn(),
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
    this.emit("closed");
  }
  setBounds = vi.fn();
  show = vi.fn();
  showInactive = vi.fn();
  focus = vi.fn();
  hide = vi.fn();
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
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
          on: vi.fn(),
        });
      return fixture.partitions.get(name);
    },
  },
  Tray: class extends EventEmitter {
    setToolTip() {}
    setContextMenu() {}
  },
}));

beforeAll(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), "soda-assistant-native-test-"));
  await import("./main.js");
  await vi.waitFor(() => expect(fixture.windows).toHaveLength(1));
});
afterAll(async () => {
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
  expect(panel.url).toBe("http://127.0.0.1:7780");
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
