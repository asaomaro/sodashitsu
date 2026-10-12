import { expect, it, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import type { DisplayInfo } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";
import { DisplayModel } from "../model/DisplayModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { DisplayDialog } from "./DisplayDialog.js";
it("allows scrolling away from a form input, rejects stale submission, and reloads after reconnect", async () => {
  const content =
    '<form data-soda-action="reply"><input name="answer" value="yes"><button>送信</button></form>' +
    Array.from({ length: 50 }, (_, i) => "<p>説明" + i + "</p>").join("");
  const info: DisplayInfo = {
    id: "d",
    paneId: "p",
    name: "view",
    title: "view",
    kind: "panel",
    format: "html",
    size: 320,
    rev: 1,
    bytes: Buffer.byteLength(content),
    updatedAt: "",
  };
  let pendingSubscribe = false;
  let finishSubscribe: (value: { displays: DisplayInfo[] }) => void = () => {};
  const request = vi.fn(async (method: string) =>
    method === "display.subscribe"
      ? pendingSubscribe
        ? await new Promise<{ displays: DisplayInfo[] }>((r) => {
            finishSubscribe = r;
          })
        : { displays: [{ ...info }] }
      : method === "display.get"
        ? {
            id: "d",
            rev: info.rev,
            format: "html",
            offset: 0,
            totalBytes: info.bytes,
            base64: Buffer.from(content).toString("base64"),
            eof: true,
          }
        : {},
  );
  const port = { request } as unknown as RequestPort;
  const displays = new DisplayModel(port, vi.fn(), vi.fn());
  await displays.connect();
  const ui = new UiState(new SessionModel());
  ui.openDialogWithContext({ kind: "display", paneId: "p", displayId: "d" });
  const dialog = new DisplayDialog("p", "d", displays, port, ui, vi.fn());
  const render = () => {
    const grid = new Grid(60, 12);
    dialog.render({ grid, theme: new ThemeColors("dracula") });
    return Array.from({ length: 12 }, (_, y) => grid.rowText(y)).join("\n");
  };
  await vi.waitFor(() => expect(render()).toContain("answer:"));
  dialog.handleMouse({ action: "wheel", button: 65, x: 3, y: 3 });
  expect(render()).not.toContain("answer:");
  expect(render()).toContain("説明");
  dialog.handleKey(chordToKeyInput("Tab"));
  expect(render()).toContain("送信");
  displays.apply({ event: "display.updated", data: { display: { ...info, rev: 2 } } });
  dialog.handleKey(chordToKeyInput("Enter"));
  expect(request).not.toHaveBeenCalledWith("display.action", expect.anything());
  displays.disconnect();
  expect(render()).toContain("接続が切れています");
  pendingSubscribe = true;
  const reconnecting = displays.connect();
  render();
  expect(ui.dialogContext?.kind).toBe("display");
  expect(displays.ready).toBe(false);
  finishSubscribe({ displays: [info] });
  await reconnecting;
  await vi.waitFor(() => expect(render()).toContain("answer:"));
  dialog.dispose();
});
it("closes a form only after successful submission and never closes a replacement dialog", async () => {
  const content =
    '<form data-soda-action="answer"><input name="message" value="日本語" required><button>送信</button></form>';
  const info: DisplayInfo = {
    id: "d",
    paneId: "p",
    name: "form",
    title: "form",
    kind: "panel",
    format: "html",
    size: 320,
    rev: 1,
    bytes: Buffer.byteLength(content),
    updatedAt: "",
  };
  let fail = true;
  let defer = false;
  let finish: (value: unknown) => void = () => {};
  const request = vi.fn(async (method: string) => {
    if (method === "display.subscribe") return { displays: [info] };
    if (method === "display.get")
      return {
        id: "d",
        rev: 1,
        format: "html",
        offset: 0,
        totalBytes: info.bytes,
        base64: Buffer.from(content).toString("base64"),
        eof: true,
      };
    if (method === "display.action") {
      if (fail) throw new Error("failed");
      if (defer)
        return await new Promise((r) => {
          finish = r;
        });
    }
    return {};
  });
  const port = { request } as unknown as RequestPort;
  const displays = new DisplayModel(port, vi.fn(), vi.fn());
  await displays.connect();
  const ui = new UiState(new SessionModel());
  ui.openDialogWithContext({ kind: "display", paneId: "p", displayId: "d" });
  const create = () => new DisplayDialog("p", "d", displays, port, ui, vi.fn());
  const dialog = create();
  const render = (d = dialog) => {
    const grid = new Grid(60, 12);
    d.render({ grid, theme: new ThemeColors("dracula") });
    return Array.from({ length: 12 }, (_, y) => grid.rowText(y)).join("\n");
  };
  await vi.waitFor(() => expect(render()).toContain("日本語"));
  dialog.handleKey(chordToKeyInput("Enter"));
  await vi.waitFor(() => expect(render()).toContain("送信できません"));
  expect(ui.dialogContext?.kind).toBe("display");
  fail = false;
  dialog.handleKey(chordToKeyInput("Enter"));
  await vi.waitFor(() => expect(ui.dialogContext).toBeNull());
  dialog.dispose();
  ui.openDialogWithContext({ kind: "display", paneId: "p", displayId: "d" });
  const second = create();
  await vi.waitFor(() => expect(render(second)).toContain("日本語"));
  defer = true;
  second.handleKey(chordToKeyInput("Enter"));
  ui.openDialogWithContext({ kind: "help" });
  finish({});
  await Promise.resolve();
  await Promise.resolve();
  expect(ui.dialogContext?.kind).toBe("help");
  second.dispose();
});
it("a removed dock display leaves an unrelated settings dialog open", () => {
  const model = new SessionModel(),
    ui = new UiState(model);
  ui.openDialogWithContext({ kind: "settings" });
  const displays = new DisplayModel(
    { request: vi.fn() } as unknown as RequestPort,
    () => {},
    () => {},
  );
  displays.connected = true;
  displays.ready = true;
  const release = vi.fn(),
    dialog = new DisplayDialog(
      "p",
      "removed",
      displays,
      { request: vi.fn() } as unknown as RequestPort,
      ui,
      () => {},
      undefined,
      release,
    );
  dialog.render({ grid: new Grid(80, 24), theme: new ThemeColors("dracula") });
  dialog.render({ grid: new Grid(80, 24), theme: new ThemeColors("dracula") });
  expect(ui.dialogContext).toEqual({ kind: "settings" });
  expect(release).toHaveBeenCalledTimes(1);
  dialog.dispose();
});
it("embedded one-row bands use every cell for content while floating dialogs retain their frame", async () => {
  const info: DisplayInfo = {
    id: "status",
    paneId: "p",
    name: "status",
    title: "Statusline",
    kind: "band",
    format: "text",
    size: 32,
    rev: 1,
    bytes: 16,
    updatedAt: "",
  };
  const displays = {
    infos: new Map([[info.id, info]]),
    connected: true,
    ready: true,
    content: vi.fn(async () => ({ info, text: "Context 30%" })),
  } as unknown as DisplayModel;
  const dialog = new DisplayDialog(
    "p",
    info.id,
    displays,
    {} as RequestPort,
    new UiState(new SessionModel()),
    vi.fn(),
  );
  const theme = new ThemeColors("dracula");
  const render = (embedded: boolean, w: number, h: number) => {
    const grid = new Grid(w, h);
    dialog.render({ grid, theme, embedded });
    return grid;
  };
  await vi.waitFor(() => expect(render(true, 40, 1).rowText(0)).toContain("Context 30%"));
  expect(render(true, 40, 1).rowText(0)).not.toContain("┌");
  const floating = render(false, 60, 12);
  expect(Array.from({ length: 12 }, (_, y) => floating.rowText(y)).join("\n")).toContain("┌");
  expect(Array.from({ length: 12 }, (_, y) => floating.rowText(y)).join("\n")).toContain("Esc戻る");
  dialog.dispose();
});
it("server-owned statusline HTML renders colored cells without form chrome", async () => {
  const info: DisplayInfo = {
    id: "s",
    name: "s",
    paneId: "p",
    title: "Statusline",
    kind: "band",
    format: "html",
    size: 24,
    rev: 1,
    bytes: 10,
    updatedAt: "",
    source: { type: "builtin", id: "workspace", scope: "user" },
  };
  const text = '<div data-soda-statusline><span data-soda-color="good">Context 30%</span></div>';
  const displays = {
    infos: new Map([[info.id, info]]),
    ready: true,
    connected: true,
    content: vi.fn(async () => ({ info, text })),
  } as unknown as DisplayModel;
  const dialog = new DisplayDialog(
    "p",
    "s",
    displays,
    {} as RequestPort,
    new UiState(new SessionModel()),
    vi.fn(),
  );
  const render = () => {
    const grid = new Grid(30, 1);
    dialog.render({ grid, theme: new ThemeColors("dracula"), embedded: true });
    return grid;
  };
  await vi.waitFor(() => expect(render().rowText(0)).toContain("Context 30%"));
  const { paletteColor } = await import("../render/color.js");
  expect(render().cell(0, 0).fg).toBe(paletteColor(2));
  dialog.dispose();
});
