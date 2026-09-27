import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import type { SodaClient } from "../wsClient.js";
import { runTabClose, runTabCreate } from "./tab.js";

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", () => ({ printJson: vi.fn(), printLine: vi.fn() }));

import { printJson } from "../output.js";
import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const mockedPrintJson = vi.mocked(printJson);

function fakeClient(requestImpl: (method: string, params: unknown) => unknown): SodaClient {
  return {
    hello: vi.fn().mockResolvedValue({ clientId: "c1", snapshot: {} }),
    request: vi.fn(requestImpl) as unknown as SodaClient["request"],
    sendInput: vi.fn(),
    onEvent: vi.fn(),
    onOutput: vi.fn(),
    onSnapshot: vi.fn(),
    onClose: vi.fn(),
    close: vi.fn(),
  } as unknown as SodaClient;
}

const OPTS = { url: "http://127.0.0.1:7780", token: undefined };
const store = {} as SessionStore;

beforeEach(() => {
  mockedWithSession.mockReset();
  mockedPrintJson.mockReset();
});

describe("runTabCreate", () => {
  it("workspaceId/label を渡すとその値で tab.create を呼ぶ", async () => {
    const client = fakeClient(() => ({ tab: { id: "t1" }, pane: { id: "p1" } }));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runTabCreate({ kind: "tab-create", opts: OPTS, workspaceId: "w1", label: "logs" }, store);

    expect(client.request).toHaveBeenCalledWith("tab.create", { workspaceId: "w1", label: "logs" });
    expect(mockedPrintJson).toHaveBeenCalledWith({ tab: { id: "t1" }, pane: { id: "p1" } });
  });

  it("workspaceId/label 省略時はキーを持たないオブジェクトを渡す", async () => {
    const client = fakeClient(() => ({}));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runTabCreate({ kind: "tab-create", opts: OPTS, workspaceId: undefined, label: undefined }, store);

    expect(client.request).toHaveBeenCalledWith("tab.create", {});
  });
});

describe("runTabClose", () => {
  it("tab.close を呼ぶ", async () => {
    const client = fakeClient(() => ({}));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runTabClose({ kind: "tab-close", opts: OPTS, tabId: "t1" }, store);

    expect(client.request).toHaveBeenCalledWith("tab.close", { tabId: "t1" });
  });
});

describe("runTabClose — 自分の pane を含む tab（20260926-agent-skill-file。AC12）", () => {
  const IN_P1 = { ...OPTS, caller: { paneId: "p1", serverUrl: "http://127.0.0.1:7780" } };
  const snapshot = { panes: [{ id: "p1", tabId: "t1" }, { id: "p2", tabId: "t2" }], tabs: [{ id: "t1", workspaceId: "w1" }, { id: "t2", workspaceId: "w1" }] };

  it("自分の pane を含む tab は tab.close を送らずに self_target", async () => {
    const client = fakeClient(() => ({}));
    (client.hello as ReturnType<typeof vi.fn>).mockResolvedValue({ clientId: "c1", snapshot });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await expect(runTabClose({ kind: "tab-close", opts: IN_P1, tabId: "t1" }, store)).rejects.toMatchObject({
      code: "self_target",
      message: expect.stringContaining("SODA_PANE_ID= sodactl"),
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("別の tab は閉じる", async () => {
    const client = fakeClient(() => ({}));
    (client.hello as ReturnType<typeof vi.fn>).mockResolvedValue({ clientId: "c1", snapshot });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runTabClose({ kind: "tab-close", opts: IN_P1, tabId: "t2" }, store);
    expect(client.request).toHaveBeenCalledWith("tab.close", { tabId: "t2" });
  });
});
