import type { SessionSnapshot } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import type { GlobalOpts } from "./cliArgs.js";
import { assertNotSelfPane, assertNotSelfTab, assertNotSelfWorkspace } from "./selfGuard.js";
import { RpcFailure } from "./wsClient.js";

/** 20260926-agent-skill-file（AC11〜AC13）。 */

const SERVER = "http://127.0.0.1:7780";
const inPane: GlobalOpts = {
  url: SERVER,
  token: undefined,
  urlExplicit: false,
  caller: { paneId: "p1", serverUrl: SERVER },
};

const snapshot = {
  panes: [
    { id: "p1", tabId: "t1" },
    { id: "p2", tabId: "t1" },
    { id: "p3", tabId: "t2" },
    { id: "p4", tabId: "t3" },
  ],
  tabs: [
    { id: "t1", workspaceId: "w1" },
    { id: "t2", workspaceId: "w1" },
    { id: "t3", workspaceId: "w2" },
  ],
} as unknown as SessionSnapshot;

function selfTargetError(fn: () => void): RpcFailure {
  try {
    fn();
  } catch (err) {
    if (err instanceof RpcFailure) return err;
    throw err;
  }
  throw new Error("expected self_target");
}

describe("assertNotSelfPane", () => {
  it("自分の pane なら self_target（抜け道を案内する）", () => {
    const err = selfTargetError(() => assertNotSelfPane(inPane, "p1", "close"));
    expect(err.code).toBe("self_target");
    expect(err.message).toContain("close pane p1");
    expect(err.message).toContain("SODA_PANE_ID=p1");
    expect(err.message).toContain('"SODA_PANE_ID= sodactl');
  });
  it("別の pane なら断らない", () => {
    expect(() => assertNotSelfPane(inPane, "p2", "close")).not.toThrow();
  });
  it("caller が無ければ断らない（pane の外）", () => {
    expect(() => assertNotSelfPane({ url: SERVER, token: undefined, urlExplicit: false }, "p1", "close")).not.toThrow();
  });
  it("接続先の origin が pane のサーバと違えば断らない（別のサーバの同じ ID）", () => {
    expect(() =>
      assertNotSelfPane({ ...inPane, url: "http://127.0.0.1:7781" }, "p1", "close"),
    ).not.toThrow();
    expect(() =>
      assertNotSelfPane({ ...inPane, url: "https://127.0.0.1:7780" }, "p1", "close"),
    ).not.toThrow();
  });
  it("ループバックの名前の違い（localhost・127.0.0.1・[::1]）は同じサーバとして断る", () => {
    expect(() =>
      assertNotSelfPane({ ...inPane, url: "http://localhost:7780" }, "p1", "close"),
    ).toThrow(RpcFailure);
    expect(() => assertNotSelfPane({ ...inPane, url: "http://[::1]:7780" }, "p1", "close")).toThrow(
      RpcFailure,
    );
  });
  it("既定のポートの省略は同じとみなし、ループバックでないホストは区別する", () => {
    const tls: GlobalOpts = {
      url: "https://myhost.lan",
      token: undefined,
      urlExplicit: false,
      caller: { paneId: "p1", serverUrl: "https://myhost.lan:443" },
    };
    expect(() => assertNotSelfPane(tls, "p1", "close")).toThrow(RpcFailure);
    expect(() =>
      assertNotSelfPane({ ...tls, url: "https://other.lan" }, "p1", "close"),
    ).not.toThrow();
  });
  it("origin が同じなら経路・末尾の / の違いは問わない", () => {
    expect(() =>
      assertNotSelfPane({ ...inPane, url: "http://127.0.0.1:7780/" }, "p1", "close"),
    ).toThrow(RpcFailure);
    expect(() =>
      assertNotSelfPane(
        { ...inPane, caller: { paneId: "p1", serverUrl: "http://127.0.0.1:7780/x" } },
        "p1",
        "close",
      ),
    ).toThrow(RpcFailure);
  });
  it('http(s) でない URL（origin が "null"）同士でも一致とみなさない', () => {
    expect(() =>
      assertNotSelfPane(
        { url: "file:///x", token: undefined, urlExplicit: false, caller: { paneId: "p1", serverUrl: "file:///y" } },
        "p1",
        "close",
      ),
    ).not.toThrow();
  });
  it("URL として読めなければ断らない", () => {
    expect(() =>
      assertNotSelfPane(
        { ...inPane, caller: { paneId: "p1", serverUrl: "not a url" } },
        "p1",
        "close",
      ),
    ).not.toThrow();
    expect(() => assertNotSelfPane({ ...inPane, url: "not a url" }, "p1", "close")).not.toThrow();
  });
});

describe("assertNotSelfTab", () => {
  it("自分の pane を含む tab なら self_target", () => {
    const err = selfTargetError(() => assertNotSelfTab(inPane, snapshot, "t1", "close"));
    expect(err.code).toBe("self_target");
    expect(err.message).toContain("close tab t1 because it contains");
    expect(err.message).toContain("SODA_PANE_ID= sodactl");
  });
  it("別の tab なら断らない", () => {
    expect(() => assertNotSelfTab(inPane, snapshot, "t2", "close")).not.toThrow();
  });
  it("自分の pane が snapshot に無ければ断らない", () => {
    expect(() =>
      assertNotSelfTab(
        { ...inPane, caller: { paneId: "p9", serverUrl: SERVER } },
        snapshot,
        "t1",
        "close",
      ),
    ).not.toThrow();
  });
  it("caller が無い・別のサーバなら断らない", () => {
    expect(() =>
      assertNotSelfTab({ url: SERVER, token: undefined, urlExplicit: false }, snapshot, "t1", "close"),
    ).not.toThrow();
    expect(() =>
      assertNotSelfTab({ ...inPane, url: "http://127.0.0.1:1" }, snapshot, "t1", "close"),
    ).not.toThrow();
  });
});

describe("assertNotSelfWorkspace", () => {
  it("自分の pane を含む workspace なら self_target", () => {
    const err = selfTargetError(() => assertNotSelfWorkspace(inPane, snapshot, "w1", "close"));
    expect(err.code).toBe("self_target");
    expect(err.message).toContain("close workspace w1 because it contains");
  });
  it("別の workspace なら断らない", () => {
    expect(() => assertNotSelfWorkspace(inPane, snapshot, "w2", "close")).not.toThrow();
  });
  it("自分の pane の tab が snapshot に無ければ断らない（投げない）", () => {
    const broken = { panes: [{ id: "p1", tabId: "t9" }], tabs: [] } as unknown as SessionSnapshot;
    expect(() => assertNotSelfWorkspace(inPane, broken, "w1", "close")).not.toThrow();
  });
  it("自分の pane が snapshot に無い・caller が無い・別のサーバなら断らない", () => {
    expect(() =>
      assertNotSelfWorkspace(
        { ...inPane, caller: { paneId: "p9", serverUrl: SERVER } },
        snapshot,
        "w1",
        "close",
      ),
    ).not.toThrow();
    expect(() =>
      assertNotSelfWorkspace({ url: SERVER, token: undefined, urlExplicit: false }, snapshot, "w1", "close"),
    ).not.toThrow();
    expect(() =>
      assertNotSelfWorkspace({ ...inPane, url: "http://127.0.0.1:1" }, snapshot, "w1", "close"),
    ).not.toThrow();
  });
});
