import type { ConnectionPort } from "@sodashitsu/client-core";
import type { ExtensionInfo, ExtensionListResult, MethodName } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExtensionsStore } from "../store/extensions.js";
import { ExtensionController } from "./ExtensionController.js";

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
    await s.ctl.reload();
    expect(s.toasts).toEqual([]);
    const t = setup({ "extension.reload": () => code("internal") });
    await t.ctl.reload();
    expect(t.toasts).toHaveLength(1);
    const q = setup({ "extension.reload": () => code("internal") });
    await q.ctl.reload(true);
    expect(q.toasts).toEqual([]);
  });
  it("log: 失敗は null と知らせ", async () => {
    const s = setup({ "extension.log": () => code("not_found") });
    expect(await s.ctl.log("a")).toBeNull();
    expect(s.toasts).toHaveLength(1);
  });
});
