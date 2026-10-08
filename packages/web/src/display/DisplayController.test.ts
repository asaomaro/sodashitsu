import { DISPLAY_GET_CHUNK_BYTES, type DisplayInfo, type MethodName } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDisplayStore } from "../store/display.js";
import { DisplayController, focusStealToast } from "./DisplayController.js";

const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id,
  paneId: "p1",
  name: id,
  kind: "panel",
  format: "html",
  title: id,
  size: 320,
  rev: 1,
  bytes: 3,
  updatedAt: "2026-10-08T00:00:00.000Z",
  ...over,
});
const code = (c: string): Error => Object.assign(new Error(`${c}: x`), { code: c });
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const b64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));

function setup(handlers: Partial<Record<MethodName, (params: any) => unknown>> = {}, now?: () => number) {
  setActivePinia(createPinia());
  const store = useDisplayStore();
  const calls: [string, any][] = [];
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
  const ctl = new DisplayController({ conn, store, toast: (m) => void toasts.push(m), ...(now ? { now } : {}) });
  return { ctl, store, calls, toasts };
}

describe("DisplayController", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("onOpened: display.subscribe で名乗り、応答の一覧で置き換える（壊れた 1 件は捨てる・未知の形式は通す）", async () => {
    const s = setup({ "display.subscribe": () => ({ displays: [info("a"), { bad: 1 }, info("b", { format: "future-x" })] }) });
    s.store.upsert(info("old"));
    s.ctl.onOpened();
    await settle();
    expect(s.calls[0]).toEqual(["display.subscribe", { features: ["panel", "band", "actions", "script-html", "collapse"] }]);
    expect([...s.store.infos.keys()]).toEqual(["a", "b"]);
    expect(s.store.infos.get("b")?.format).toBe("future-x");
  });

  it("古いサーバ（not_found）では何もしない", async () => {
    const s = setup({ "display.subscribe": () => code("not_found") });
    s.ctl.onOpened();
    await settle();
    expect(s.store.all).toEqual([]);
    expect(s.toasts).toEqual([]);
  });

  it("display.updated で見出しを入れ替え、display.removed で消す。navigated・unresponsive だけトーストを 1 回出す", () => {
    const s = setup();
    s.ctl.onEvent({ event: "display.updated", data: { display: info("a", { name: "main" }) } });
    s.ctl.onEvent({ event: "display.updated", data: { display: info("a", { name: "main", rev: 2 }) } });
    expect(s.store.infos.get("a")?.rev).toBe(2);
    s.ctl.onEvent({ event: "display.removed", data: { id: "a", paneId: "p1", name: "main", reason: "navigated" } });
    s.ctl.onEvent({ event: "display.removed", data: { id: "a", paneId: "p1", name: "main", reason: "navigated" } });
    expect(s.toasts).toEqual(["表示『main』は、別のページへ移ろうとしたので閉じました"]);
    s.ctl.onEvent({ event: "display.updated", data: { display: info("b", { name: "side" }) } });
    s.ctl.onEvent({ event: "display.removed", data: { id: "b", paneId: "p1", name: "side", reason: "unresponsive" } });
    s.ctl.onEvent({ event: "display.updated", data: { display: info("c") } });
    s.ctl.onEvent({ event: "display.removed", data: { id: "c", paneId: "p1", name: "c", reason: "closed" } });
    expect(s.toasts).toHaveLength(2);
    expect(s.toasts[1]).toBe("表示『side』は、応答しなくなったので閉じました");
  });

  it("ensureContent: display.get を offset を進めて繰り返し、片をつないで 1 回だけ文字列にする（マルチバイトが片をまたいでも壊れない）", async () => {
    const chunk = DISPLAY_GET_CHUNK_BYTES;
    // 「あ」(3 バイト) を並べ、片の境目が文字の途中に来るようにする。
    const text = "あ".repeat(Math.ceil((chunk * 2 + 10) / 3));
    const bytes = new TextEncoder().encode(text);
    const offsets: number[] = [];
    const s = setup({
      "display.get": (p) => {
        offsets.push(p.offset);
        const part = bytes.subarray(p.offset, p.offset + chunk);
        return { id: p.id, rev: 1, format: "html", totalBytes: bytes.length, offset: p.offset, base64: b64(part), eof: p.offset + chunk >= bytes.length };
      },
    });
    s.store.upsert(info("a", { bytes: bytes.length }));
    await s.ctl.ensureContent("a");
    expect(offsets).toEqual([0, chunk, chunk * 2]);
    expect(s.store.contents.get("a")?.content).toBe(text);
  });

  it("ensureContent: 同じ id は 1 本にまとめる・取り終えて版が合っていれば取らない", async () => {
    const s = setup({ "display.get": (p) => ({ id: p.id, rev: 1, format: "html", totalBytes: 1, offset: 0, base64: b64(new Uint8Array([0x61])), eof: true }) });
    s.store.upsert(info("a"));
    await Promise.all([s.ctl.ensureContent("a"), s.ctl.ensureContent("a")]);
    expect(s.calls.filter(([m]) => m === "display.get")).toHaveLength(1);
    await s.ctl.ensureContent("a");
    expect(s.calls.filter(([m]) => m === "display.get")).toHaveLength(1);
  });

  it("ensureContent: 途中で rev が変わったら最初から取り直す", async () => {
    const chunk = DISPLAY_GET_CHUNK_BYTES;
    const a = new Uint8Array(chunk + 1).fill(0x61);
    let n = 0;
    const s = setup({
      "display.get": (p) => {
        n++;
        // 1 回目の 2 片目だけ rev 2 になる（取りかけの版が替わった）。
        const rev = n === 2 ? 2 : n === 1 ? 1 : 2;
        const part = a.subarray(p.offset, p.offset + chunk);
        return { id: p.id, rev, format: "html", totalBytes: a.length, offset: p.offset, base64: b64(part), eof: p.offset + chunk >= a.length };
      },
    });
    s.store.upsert(info("a", { rev: 2, bytes: a.length }));
    await s.ctl.ensureContent("a");
    expect(s.store.contents.get("a")).toMatchObject({ rev: 2 });
    expect(s.calls.filter(([m, p]) => m === "display.get" && p.offset === 0)).toHaveLength(2);
  });

  it("ensureContent: 消えた面（display_closed）は諦める。見出しが無い id は何もしない", async () => {
    const s = setup({ "display.get": () => code("display_closed") });
    s.store.upsert(info("a"));
    await s.ctl.ensureContent("a");
    expect(s.store.contents.has("a")).toBe(false);
    await s.ctl.ensureContent("zzz");
    expect(s.calls).toHaveLength(1);
  });

  it("sendAction: 毎秒 20 回で捨てる", async () => {
    let t = 0;
    const s = setup({}, () => t);
    for (let i = 0; i < 25; i++) s.ctl.sendAction("a", 1, "go", { value: "1" });
    expect(s.calls.filter(([m]) => m === "display.action")).toHaveLength(20);
    t = 1000;
    s.ctl.sendAction("a", 1, "go");
    expect(s.calls.filter(([m]) => m === "display.action")).toHaveLength(21);
  });

  it("report: 頻度の制限に入れず、paneId と format を添える。古いサーバの invalid_params には添えずに 1 回送り直す", async () => {
    let n = 0;
    const s = setup({
      "display.report": (p) => {
        n++;
        return "paneId" in p ? code("invalid_params") : { closed: [] };
      },
    });
    for (let i = 0; i < 30; i++) s.ctl.report("a", "navigated", { paneId: "p1", format: "html" });
    await settle();
    const reports = s.calls.filter(([m]) => m === "display.report");
    expect(reports[0]?.[1]).toEqual({ id: "a", problem: "navigated", paneId: "p1", format: "html" });
    expect(reports).toHaveLength(60);
    expect(reports.filter(([, p]) => !("paneId" in p))).toHaveLength(30);
    expect(n).toBe(60);
  });

  it("マシンの切り替え・切断で空にし、その前に始めた応答を捨てる", async () => {
    let resolve!: (v: unknown) => void;
    const s = setup({ "display.subscribe": () => new Promise((r) => (resolve = r)) });
    s.ctl.onOpened();
    s.ctl.resetForMachineSwitch();
    resolve({ displays: [info("a")] });
    await settle();
    expect(s.store.all).toEqual([]);
  });

  it("ensureContent: 受け取った大きさが totalBytes と合わない・空の片が eof でないときは取り直し、何度やっても合わなければ固定の文言の印を立てる。合えば外す", async () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]);
    let mode: "short" | "empty" | "ok" = "short";
    const s = setup({
      "display.get": (p) => {
        if (mode === "empty") return { id: p.id, rev: 1, format: "html", totalBytes: 3, offset: 0, base64: "", eof: false };
        const part = mode === "short" ? bytes.subarray(0, 2) : bytes;
        return { id: p.id, rev: 1, format: "html", totalBytes: 3, offset: 0, base64: b64(part), eof: true };
      },
    });
    s.store.upsert(info("a"));
    await s.ctl.ensureContent("a");
    expect(s.store.contents.has("a")).toBe(false);
    expect(s.store.contentFailed.has("a")).toBe(true);
    expect(s.calls.filter(([m]) => m === "display.get").length).toBeGreaterThan(1); // 取り直した
    mode = "empty";
    await s.ctl.ensureContent("a");
    expect(s.store.contents.has("a")).toBe(false);
    expect(s.store.contentFailed.has("a")).toBe(true);
    mode = "ok";
    await s.ctl.ensureContent("a");
    expect(s.store.contents.get("a")?.content).toBe("abc");
    expect(s.store.contentFailed.has("a")).toBe(false);
  });

  it("display.message: その面の枠を描いている部品だけに渡す（保存しない）。登録を外せる。1 つが投げてもほかへ渡す", () => {
    const s = setup();
    const got: unknown[] = [];
    const off = s.ctl.onMessage("a", (d) => got.push(["1", d]));
    s.ctl.onMessage("a", () => {
      throw new Error("boom");
    });
    s.ctl.onMessage("a", (d) => got.push(["3", d]));
    s.ctl.onMessage("b", (d) => got.push(["b", d]));
    s.ctl.onEvent({ event: "display.message", data: { id: "a", data: { n: 1 } } });
    expect(got).toEqual([["1", { n: 1 }], ["3", { n: 1 }]]);
    off();
    s.ctl.onEvent({ event: "display.message", data: { id: "a", data: 2 } });
    expect(got).toHaveLength(3);
    s.ctl.onEvent({ event: "display.message", data: { id: "nobody", data: 3 } }); // 描いている部品が無ければ捨てる
    expect(got).toHaveLength(3);
  });

  it("display.removed の理由が focus_steal のときのトースト（設計の文言）。navigated・unresponsive は従来どおり", async () => {
    const s = setup();
    for (const id of ["a", "b", "c"]) s.store.upsert(info(id));
    s.ctl.onEvent({ event: "display.removed", data: { id: "a", paneId: "p1", name: "a", reason: "focus_steal" } });
    s.ctl.onEvent({ event: "display.removed", data: { id: "b", paneId: "p1", name: "b", reason: "navigated" } });
    s.ctl.onEvent({ event: "display.removed", data: { id: "zz", paneId: "p1", name: "zz", reason: "focus_steal" } }); // 知らない面は出さない
    expect(s.toasts).toEqual([
      "表示『a』は、キー入力を取ろうとし続けたので閉じました。この pane は、しばらくスクリプトが動く表示を出せません",
      "表示『b』は、別のページへ移ろうとしたので閉じました",
    ]);
    expect(focusStealToast("x")).toContain("しばらくスクリプトが動く表示を出せません");
  });

  it("report は、サーバが答えたら true、繋がっていない（コードの無いエラー）なら false。focus_steal の paneId・format を添える", async () => {
    const ok = setup({ "display.report": () => ({ closed: [], steals: 1 }) });
    expect(await ok.ctl.report("a", "focus_steal", { paneId: "p1", format: "script-html" })).toBe(true);
    expect(ok.calls[0]).toEqual(["display.report", { id: "a", problem: "focus_steal", paneId: "p1", format: "script-html" }]);
    const closed = setup({ "display.report": () => code("display_closed") });
    expect(await closed.ctl.report("a", "navigated", { paneId: "p1", format: "html" })).toBe(true); // サーバは答えた
    const down = setup({ "display.report": () => new Error("not connected (method=display.report)") });
    expect(await down.ctl.report("a", "focus_steal", { paneId: "p1", format: "script-html" })).toBe(false);
  });

  it("report は頻度の制限に入らない（focus_steal を 100 回続けても全部送る）", async () => {
    const s = setup({ "display.report": () => ({ closed: [] }) });
    for (let i = 0; i < 100; i++) void s.ctl.report("a", "focus_steal", { paneId: "p1", format: "script-html" });
    await settle();
    expect(s.calls.filter(([m]) => m === "display.report")).toHaveLength(100);
  });

  it("名乗る機能に script-html が入る。入れない画面は scriptCapable が偽になる", async () => {
    const a = setup({ "display.subscribe": () => ({ displays: [] }) });
    a.ctl.onOpened();
    await settle();
    expect(a.store.scriptCapable).toBe(true);
    setActivePinia(createPinia());
    const store = useDisplayStore();
    const calls: unknown[] = [];
    const conn = { request: vi.fn(async (m: string, p: unknown) => (calls.push([m, p]), { displays: [] })) } as unknown as Pick<ConnectionPort, "request">;
    new DisplayController({ conn, store, toast: () => undefined, subscribeFeatures: ["panel", "band", "actions"] }).onOpened();
    await settle();
    expect(store.scriptCapable).toBe(false);
    expect(calls[0]).toEqual(["display.subscribe", { features: ["panel", "band", "actions"] }]);
  });
});
