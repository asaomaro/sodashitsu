import type { SessionSnapshot } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import type { GlobalOpts } from "./cliArgs.js";
import { paneTargetIdBeforeConnect, resolveCallerPane, resolveFocusedPane } from "./paneTarget.js";

/** 20260927-caller-pane-default の T2（AC9・AC12・AC13）。 */
const SERVER = "http://127.0.0.1:7780";
const inPane: GlobalOpts = {
  url: SERVER,
  token: undefined,
  urlExplicit: false,
  caller: { paneId: "p3", serverUrl: SERVER },
};
const caller = (explicit: boolean) => ({ kind: "caller" as const, paneId: "p3", explicit });

describe("resolveCallerPane", () => {
  it("接続先が pane のサーバなら SODA_PANE_ID（ループバックの名前の違いは同じサーバ）", () => {
    expect(resolveCallerPane(inPane, caller(true))).toBe("p3");
    expect(resolveCallerPane({ ...inPane, url: "http://localhost:7780" }, caller(false))).toBe(
      "p3",
    );
  });

  it.each([
    ["別のポート", { ...inPane, url: "http://127.0.0.1:7781" }],
    ["別のホスト", { ...inPane, url: "https://myhost.lan:7780" }],
    [
      "SODA_SERVER_URL が無い（caller なし）",
      { url: SERVER, token: undefined, urlExplicit: false },
    ],
    ["SODA_SERVER_URL が読めない", { ...inPane, caller: { paneId: "p3", serverUrl: "not a url" } }],
  ])("%s なら caller_pane_unknown（AC9）", (_label, opts) => {
    expect(() => resolveCallerPane(opts as GlobalOpts, caller(false))).toThrow(
      expect.objectContaining({
        code: "caller_pane_unknown",
        message: expect.stringContaining("--pane"),
      }),
    );
  });

  it("文面に SODA_PANE_ID と接続先を出し、SODA_SERVER_URL が無ければ (unset)", () => {
    expect(() =>
      resolveCallerPane({ url: SERVER, token: undefined, urlExplicit: false }, caller(true)),
    ).toThrow(
      /SODA_PANE_ID=p3.*127\.0\.0\.1:7780.*SODA_SERVER_URL=\(unset\)\); if it is, pass the pane ID with --pane$/,
    );
  });
});

describe("resolveFocusedPane", () => {
  it("snapshot.focus の pane（AC12）", () => {
    expect(
      resolveFocusedPane({
        focus: { workspaceId: "w1", tabId: "t1", paneId: "p7" },
      } as SessionSnapshot),
    ).toBe("p7");
  });
  it("focus が null なら not_found（AC13）", () => {
    expect(() => resolveFocusedPane({ focus: null } as SessionSnapshot)).toThrow(
      expect.objectContaining({ code: "not_found" }),
    );
  });
});

describe("paneTargetIdBeforeConnect", () => {
  it("明示の ID はそのまま（同じサーバでなくてもよい）・caller は確かめて解決・focused は接続後", () => {
    expect(
      paneTargetIdBeforeConnect({ ...inPane, url: "http://other:1" }, { kind: "id", paneId: "p2" }),
    ).toBe("p2");
    expect(paneTargetIdBeforeConnect(inPane, caller(false))).toBe("p3");
    expect(paneTargetIdBeforeConnect(inPane, { kind: "focused" })).toBeUndefined();
    expect(() =>
      paneTargetIdBeforeConnect({ ...inPane, url: "http://other:1" }, caller(true)),
    ).toThrow(expect.objectContaining({ code: "caller_pane_unknown" }));
  });
});
