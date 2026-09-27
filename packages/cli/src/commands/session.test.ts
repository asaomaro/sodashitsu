import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUsageError } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { runLogin, runSnapshot, runWatch } from "./session.js";

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../httpAuth.js", () => ({ login: vi.fn() }));
vi.mock("../output.js", () => ({ printJson: vi.fn(), printLine: vi.fn(), printRaw: vi.fn() }));

import { login } from "../httpAuth.js";
import { printJson, printLine } from "../output.js";
import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const mockedLogin = vi.mocked(login);
const mockedPrintJson = vi.mocked(printJson);
const mockedPrintLine = vi.mocked(printLine);

interface FakeClient extends SodaClient {
  emitEvent(evt: unknown): void;
  emitClose(code: number, reason: string): void;
}

function fakeClient(): FakeClient {
  const eventCbs: ((evt: unknown) => void)[] = [];
  const closeCbs: ((code: number, reason: string) => void)[] = [];
  return {
    hello: vi.fn().mockResolvedValue({ clientId: "c1", snapshot: { workspaces: [], tabs: [], panes: [] } }),
    request: vi.fn(),
    sendInput: vi.fn(),
    onEvent: vi.fn((cb: (evt: unknown) => void) => eventCbs.push(cb)),
    onOutput: vi.fn(),
    onSnapshot: vi.fn(),
    onClose: vi.fn((cb: (code: number, reason: string) => void) => closeCbs.push(cb)),
    close: vi.fn(),
    emitEvent: (evt: unknown) => eventCbs.forEach((cb) => cb(evt)),
    emitClose: (code: number, reason: string) => closeCbs.forEach((cb) => cb(code, reason)),
  } as unknown as FakeClient;
}

const store = {} as SessionStore;

beforeEach(() => {
  mockedWithSession.mockReset();
  mockedLogin.mockReset();
  mockedPrintJson.mockReset();
  mockedPrintLine.mockReset();
});

describe("runLogin", () => {
  it("login → store.set → printJson({ok:true})（withSession は使わない）", async () => {
    mockedLogin.mockResolvedValue("soda_session=abc");
    const setSpy = vi.fn(async () => undefined);
    const s = { get: vi.fn(), set: setSpy, clear: vi.fn() } as unknown as SessionStore;

    await runLogin({ kind: "login", opts: { url: "http://127.0.0.1:7780", token: "tok" } }, s);

    expect(mockedLogin).toHaveBeenCalledWith("http://127.0.0.1:7780", "tok");
    expect(setSpy).toHaveBeenCalledWith("http://127.0.0.1:7780", "soda_session=abc");
    expect(mockedPrintJson).toHaveBeenCalledWith({ ok: true });
    expect(mockedWithSession).not.toHaveBeenCalled();
  });

  it("--token が無ければ CliUsageError", async () => {
    await expect(runLogin({ kind: "login", opts: { url: "http://127.0.0.1:7780", token: undefined } }, store)).rejects.toThrow(CliUsageError);
    expect(mockedLogin).not.toHaveBeenCalled();
  });
});

describe("runSnapshot", () => {
  it("hello().snapshot をそのまま printJson する", async () => {
    const client = fakeClient();
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runSnapshot({ kind: "snapshot", opts: { url: "http://127.0.0.1:7780", token: undefined } }, store);

    expect(mockedPrintJson).toHaveBeenCalledWith({ workspaces: [], tabs: [], panes: [] });
  });
});

describe("runWatch", () => {
  it("既定は ISO時刻 + event名 + data の1行、--json は生イベントの JSON1行", async () => {
    const client = fakeClient();
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    const promise = runWatch({ kind: "watch", opts: { url: "http://127.0.0.1:7780", token: undefined }, json: false }, store);
    await new Promise((r) => setTimeout(r, 10));
    client.emitEvent({ event: "workspace.created", data: { workspace: { id: "w1" } } });
    client.emitClose(1000, "done");

    await expect(promise).rejects.toThrow(RpcFailure);
    expect(mockedPrintLine).toHaveBeenCalledTimes(1);
    const [line] = mockedPrintLine.mock.calls[0]!;
    expect(line).toContain("workspace.created");
    expect(line).toContain('{"workspace":{"id":"w1"}}');
  });

  it("--json は JSON.stringify(evt) をそのまま出す", async () => {
    const client = fakeClient();
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    const promise = runWatch({ kind: "watch", opts: { url: "http://127.0.0.1:7780", token: undefined }, json: true }, store);
    await new Promise((r) => setTimeout(r, 10));
    const evt = { event: "pane.closed", data: { paneId: "p1" } };
    client.emitEvent(evt);
    client.emitClose(1000, "done");

    await expect(promise).rejects.toThrow(RpcFailure);
    expect(mockedPrintLine).toHaveBeenCalledWith(JSON.stringify(evt));
  });
});
