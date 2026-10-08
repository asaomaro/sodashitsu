import type { ConnectionPort } from "@sodashitsu/client-core";
import type { ExtensionInfo, ExtensionListResult, MethodName } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExtensionsStore } from "../store/extensions.js";
import { ExtensionController, RETRY_DELAYS_MS } from "./ExtensionController.js";

const info = (key: string, state: ExtensionInfo["state"]): ExtensionInfo => ({
  key, id: key, scope: "user", configPath: "/x", allow: [], onUnresponsive: "pass", state, enabledInConfig: true, disabledByUser: false, failures: 0, displays: 0,
});
const list = (...e: ExtensionInfo[]): ExtensionListResult => ({ extensions: e, problems: [], userConfigPath: "/x/extensions.json" });
const code = (c: string): Error => Object.assign(new Error(`${c}: x`), { code: c });
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(handlers: Partial<Record<MethodName, (params: unknown) => unknown>> = {}) {
  setActivePinia(createPinia());
  const store = useExtensionsStore();
  const calls: [string, unknown][] = [];
  const toasts: string[] = [];
  const conn = {
    request: vi.fn(async (method: MethodName, params: unknown) => {
      calls.push([method, params]);
      const h = handlers[method];
      if (!h) return {};
      const r = h(params);
      if (r instanceof Error) throw r;
      return r;
    }),
  } as unknown as Pick<ConnectionPort, "request">;
  const ctl = new ExtensionController({ conn, store, toast: (m) => void toasts.push(m) });
  return { ctl, store, calls, toasts };
}

describe("ExtensionController", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("onOpened: extension.list で一覧を置く", async () => {
    const s = setup({ "extension.list": () => list(info("a", "running")) });
    s.ctl.onOpened();
    await settle();
    expect(s.store.supported).toBe(true);
    expect(s.store.list?.extensions.map((e) => e.key)).toEqual(["a"]);
  });
  it("not_found は supported=false（古いサーバ）", async () => {
    const s = setup({ "extension.list": () => code("not_found") });
    s.ctl.onOpened();
    await settle();
    expect(s.store.supported).toBe(false);
    expect(s.store.list).toBeNull();
  });
  it("取り直しが重なったら、最後の 1 回にまとめる（3 回呼んでも、進行中の 1 回＋続きの 1 回）", async () => {
    let n = 0;
    const s = setup({ "extension.list": () => (n++, list(info("a", "running"))) });
    s.ctl.onOpened();
    s.ctl.onChanged();
    s.ctl.onChanged();
    s.ctl.onChanged();
    await settle();
    await settle();
    expect(n).toBe(2);
  });
  it("続けて落ちた: 最初の一覧では知らせず、running → failed で 1 回だけ知らせる", async () => {
    let cur = list(info("a", "failed"));
    const s = setup({ "extension.list": () => cur });
    s.ctl.onOpened();
    await settle();
    expect(s.toasts).toEqual([]); // 接続し直した直後の最初の一覧
    cur = list(info("a", "running"), info("b", "running"));
    await s.ctl.refresh();
    cur = list(info("a", "failed"), info("b", "running"));
    await s.ctl.refresh();
    await s.ctl.refresh();
    expect(s.toasts).toEqual(["拡張『a』が続けて落ちたので止めました（設定 › 拡張）"]);
  });
  it("マシンの切り替えで状態を捨て、前の要求の応答は捨てる。次の最初の一覧では知らせない", async () => {
    let release: (v: ExtensionListResult) => void = () => undefined;
    const s = setup({ "extension.list": () => new Promise<ExtensionListResult>((r) => (release = r)) });
    s.ctl.onOpened();
    s.ctl.resetForMachineSwitch();
    release(list(info("a", "running")));
    await settle();
    expect(s.store.list).toBeNull();
    expect(s.store.supported).toBeNull();
  });
  it("setEnabled / restart: 操作中は busy で二重に送らない。送った後に取り直す", async () => {
    const s = setup({ "extension.list": () => list(info("a", "running")) });
    const p1 = s.ctl.setEnabled("a", false);
    const p2 = s.ctl.setEnabled("a", false);
    expect(s.store.busy.has("a")).toBe(true);
    await Promise.all([p1, p2]);
    await settle();
    expect(s.calls.filter(([m]) => m === "extension.setEnabled")).toHaveLength(1);
    expect(s.calls.some(([m]) => m === "extension.list")).toBe(true);
    expect(s.store.busy.has("a")).toBe(false);
  });
  it("reload: not_found は黙る／それ以外の失敗は知らせる（quiet なら知らせない）", async () => {
    const s = setup({ "extension.reload": () => code("not_found") });
    expect(await s.ctl.reload()).toBe("skipped");
    expect(s.toasts).toEqual([]);
    const t = setup({ "extension.reload": () => code("internal") });
    expect(await t.ctl.reload()).toBe("failed");
    expect(t.toasts).toHaveLength(1);
    const q = setup({ "extension.reload": () => code("internal") });
    expect(await q.ctl.reload(true)).toBe("failed");
    expect(q.toasts).toEqual([]);
    const ok = setup({ "extension.reload": () => list(info("a", "running")) });
    expect(await ok.ctl.reload()).toBe("ok");
    expect(ok.store.list?.extensions).toHaveLength(1);
  });
  it("reload: 応答の前に接続が替わったら skipped（古い応答を置かない）", async () => {
    const s = setup({ "extension.reload": () => list(info("a", "running")) });
    const p = s.ctl.reload();
    s.ctl.resetForMachineSwitch();
    expect(await p).toBe("skipped");
    expect(s.store.list).toBeNull();
  });
  it("最初の一覧が not_found 以外で失敗: 間隔を空けて取り直し、取れたら一覧を置く。尽きたら失敗を見せ、reload で取り直せる", async () => {
    vi.useFakeTimers();
    try {
      let fail = true;
      const s = setup({ "extension.list": () => (fail ? code("internal") : list(info("a", "running"))), "extension.reload": () => list(info("a", "running")) });
      s.ctl.onOpened();
      await vi.advanceTimersByTimeAsync(0);
      expect(s.store.supported).toBeNull();
      expect(s.store.loadFailed).toBe(false);
      const listCalls = (): number => s.calls.filter(([m]) => m === "extension.list").length;
      expect(listCalls()).toBe(1);
      for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[i]!);
        expect(listCalls()).toBe(i + 2);
      }
      expect(s.store.loadFailed).toBe(true); // 尽きた
      await vi.advanceTimersByTimeAsync(60_000);
      expect(listCalls()).toBe(RETRY_DELAYS_MS.length + 1);
      fail = false;
      expect(await s.ctl.reload()).toBe("ok");
      expect(s.store.supported).toBe(true);
      expect(s.store.loadFailed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("取り直しの途中で取れたら、以後は取り直さない。切断すると、待っている取り直しを捨てる", async () => {
    vi.useFakeTimers();
    try {
      let fail = true;
      const s = setup({ "extension.list": () => (fail ? code("internal") : list(info("a", "running"))) });
      s.ctl.onOpened();
      await vi.advanceTimersByTimeAsync(0);
      fail = false;
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]!);
      expect(s.store.supported).toBe(true);
      const n = s.calls.filter(([m]) => m === "extension.list").length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(s.calls.filter(([m]) => m === "extension.list").length).toBe(n);
      fail = true;
      const t = setup({ "extension.list": () => code("internal") });
      t.ctl.onOpened();
      await vi.advanceTimersByTimeAsync(0);
      t.ctl.onClosed();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(t.calls.filter(([m]) => m === "extension.list")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("log: 失敗は null と知らせ", async () => {
    const s = setup({ "extension.log": () => code("not_found") });
    expect(await s.ctl.log("a")).toBeNull();
    expect(s.toasts).toHaveLength(1);
  });
});

describe("ExtensionController: 承認の操作（PR3）", () => {
  it("approve・deny は key と digest（ダイアログが描いたもの）を送る。revoke は root と id", async () => {
    const s = setup();
    const d = "a".repeat(64);
    expect(await s.ctl.approve("project:x:a", d)).toBe("done");
    expect(await s.ctl.deny("project:x:b", d)).toBe("done");
    expect(await s.ctl.revoke("/r", "a")).toBe("done");
    expect(s.calls.filter(([m]) => m !== "extension.list")).toEqual([
      ["extension.approve", { key: "project:x:a", digest: d }],
      ["extension.deny", { key: "project:x:b", digest: d }],
      ["extension.revoke", { root: "/r", id: "a" }],
    ]);
  });
  it("extension_stale は stale を返し、トーストは出さない（呼び手が描き直す）。一覧は取り直す", async () => {
    const s = setup({ "extension.approve": () => code("extension_stale"), "extension.list": () => list(info("a", "pending")) });
    expect(await s.ctl.approve("project:x:a", "b".repeat(64))).toBe("stale");
    expect(s.toasts).toEqual([]);
    await settle();
    expect(s.calls.some(([m]) => m === "extension.list")).toBe(true);
  });
  it("ほかの失敗はトーストと failed。操作中の二重押しは skipped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({ "extension.deny": () => gate as never });
    const first = s.ctl.deny("project:x:a", "c".repeat(64));
    expect(await s.ctl.deny("project:x:a", "c".repeat(64))).toBe("skipped");
    release();
    expect(await first).toBe("done");
    const f = setup({ "extension.approve": () => code("internal") });
    expect(await f.ctl.approve("project:x:a", "c".repeat(64))).toBe("failed");
    expect(f.toasts).toEqual(["拡張を承認できませんでした"]);
  });
  it("マシンの切り替え・切断で、開いている承認のダイアログの key も捨てる", () => {
    const s = setup();
    s.store.openApproval("project:x:a");
    s.ctl.resetForMachineSwitch();
    expect(s.store.dialogKey).toBeNull();
  });
});
