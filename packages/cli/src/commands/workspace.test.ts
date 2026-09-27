import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import type { SodaClient } from "../wsClient.js";
import { runWorkspaceClose, runWorkspaceCreate, runWorkspaceRename, runWorkspaceReportMetadata } from "./workspace.js";

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

describe("runWorkspaceCreate", () => {
  it("client.hello() を先に呼んでから workspace.create を呼び、結果をそのまま printJson する", async () => {
    const order: string[] = [];
    const client = fakeClient(() => ({ workspace: { id: "w1" }, tab: { id: "t1" }, pane: { id: "p1" } }));
    (client.hello as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("hello");
      return { clientId: "c1", snapshot: {} };
    });
    (client.request as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("request");
      return { workspace: { id: "w1" }, tab: { id: "t1" }, pane: { id: "p1" } };
    });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runWorkspaceCreate({ kind: "workspace-create", opts: OPTS, cwd: "/repo", label: "api" }, store);

    expect(order).toEqual(["hello", "request"]);
    expect(client.request).toHaveBeenCalledWith("workspace.create", { cwd: "/repo", label: "api" });
    expect(mockedPrintJson).toHaveBeenCalledWith({ workspace: { id: "w1" }, tab: { id: "t1" }, pane: { id: "p1" } });
  });

  it("cwd/label を省略すると、その分のキーを持たないオブジェクトを渡す（exactOptionalPropertyTypes）", async () => {
    const client = fakeClient(() => ({}));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runWorkspaceCreate({ kind: "workspace-create", opts: OPTS, cwd: undefined, label: undefined }, store);

    expect(client.request).toHaveBeenCalledWith("workspace.create", {});
  });
});

describe("runWorkspaceClose", () => {
  it("workspace.close を呼び、結果をそのまま printJson する", async () => {
    const client = fakeClient(() => ({}));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runWorkspaceClose({ kind: "workspace-close", opts: OPTS, workspaceId: "w1" }, store);

    expect(client.request).toHaveBeenCalledWith("workspace.close", { workspaceId: "w1" });
    expect(mockedPrintJson).toHaveBeenCalledWith({});
  });
});

describe("runWorkspaceRename", () => {
  it("workspace.rename を呼ぶ", async () => {
    const client = fakeClient(() => ({}));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runWorkspaceRename({ kind: "workspace-rename", opts: OPTS, workspaceId: "w1", label: "new" }, store);

    expect(client.request).toHaveBeenCalledWith("workspace.rename", { workspaceId: "w1", label: "new" });
  });
});

describe("runWorkspaceReportMetadata（20260927-sidebar-row-tokens の AC1・AC8）", () => {
  it("hello の後に workspace.report_metadata を呼び、結果をそのまま printJson する。seq・ttlMs を渡す", async () => {
    const order: string[] = [];
    const client = fakeClient(() => ({}));
    (client.hello as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("hello");
      return { clientId: "c1", snapshot: {} };
    });
    (client.request as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("request");
      return {};
    });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));
    const tokens = [{ name: "a", value: "1" }, { name: "b", value: null }];

    await runWorkspaceReportMetadata({ kind: "workspace-report-metadata", opts: OPTS, workspaceId: "w1", report: { source: "ci", tokens, seq: 3, ttlMs: 10 } }, store);

    expect(order).toEqual(["hello", "request"]);
    expect(client.request).toHaveBeenCalledWith("workspace.report_metadata", { workspaceId: "w1", source: "ci", tokens, seq: 3, ttlMs: 10 });
    expect(mockedPrintJson).toHaveBeenCalledWith({});
  });

  it("seq・ttlMs を省くとキーごと付けない（exactOptionalPropertyTypes）", async () => {
    const client = fakeClient(() => ({}));
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runWorkspaceReportMetadata({ kind: "workspace-report-metadata", opts: OPTS, workspaceId: "w1", report: { source: "ci", tokens: [{ name: "a", value: "1" }] } }, store);

    expect(client.request).toHaveBeenCalledWith("workspace.report_metadata", { workspaceId: "w1", source: "ci", tokens: [{ name: "a", value: "1" }] });
    // toHaveBeenCalledWith は undefined の項目を同じと見るので、キーが無いことを直接見る（負の確認で見つけた穴）。
    const params = (client.request as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(["source", "tokens", "workspaceId"]);
  });
});

describe("runWorkspaceClose — 自分の pane を含む workspace（20260926-agent-skill-file。AC12）", () => {
  const IN_P1 = { ...OPTS, caller: { paneId: "p1", serverUrl: "http://127.0.0.1:7780" } };
  const snapshot = { panes: [{ id: "p1", tabId: "t1" }, { id: "p2", tabId: "t2" }], tabs: [{ id: "t1", workspaceId: "w1" }, { id: "t2", workspaceId: "w2" }] };

  it("自分の pane を含む workspace は workspace.close を送らずに self_target", async () => {
    const client = fakeClient(() => ({}));
    (client.hello as ReturnType<typeof vi.fn>).mockResolvedValue({ clientId: "c1", snapshot });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await expect(runWorkspaceClose({ kind: "workspace-close", opts: IN_P1, workspaceId: "w1" }, store)).rejects.toMatchObject({
      code: "self_target",
      message: expect.stringContaining("SODA_PANE_ID= sodactl"),
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("別の workspace は閉じる", async () => {
    const client = fakeClient(() => ({}));
    (client.hello as ReturnType<typeof vi.fn>).mockResolvedValue({ clientId: "c1", snapshot });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));

    await runWorkspaceClose({ kind: "workspace-close", opts: IN_P1, workspaceId: "w2" }, store);
    expect(client.request).toHaveBeenCalledWith("workspace.close", { workspaceId: "w2" });
  });
});
