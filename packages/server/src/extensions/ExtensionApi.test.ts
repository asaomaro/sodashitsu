import { describe, expect, it, vi } from "vitest";
import { EXTENSION_DISPLAY_BYTES_MAX, type ExtLine, type ExtRequest, type ServerEvent } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import { DisplayService } from "../display/DisplayService.js";
import { createExtensionApi, type ApiExtension } from "./ExtensionApi.js";

function setup(o: { scriptEnabled?: () => boolean; panes?: string[]; inScope?: (e: ApiExtension, p: string) => boolean } = {}) {
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const paneSet = new Set(o.panes ?? ["p1", "p2", "p3", "p4"]);
  const real = new DisplayService({
    bus,
    paneExists: (id) => paneSet.has(id),
    isScreenKind: () => true,
    ...(o.scriptEnabled ? { scriptEnabled: o.scriptEnabled } : {}),
  });
  const displays = {
    set: vi.fn(real.set.bind(real)),
    close: vi.fn(real.close.bind(real)),
    list: vi.fn(real.list.bind(real)),
    send: vi.fn(real.send.bind(real)),
    features: vi.fn(real.features.bind(real)),
    ownerOf: real.ownerOf.bind(real),
    countOwned: real.countOwned.bind(real),
    bytesOwned: real.bytesOwned.bind(real),
  };
  const warns: unknown[] = [];
  const api = createExtensionApi({
    displays,
    panes: () => [{ id: "p1", label: null, workspaceId: "w", workspaceLabel: "W", workspaceCwd: "/w", agent: null }],
    inScope: o.inScope ?? ((_e, p) => paneSet.has(p)),
    logger: { warn: (m, f) => void warns.push([m, f]) },
  });
  return { api, displays, real, events, warns, paneSet };
}
const ext = (over: Partial<ApiExtension> = {}): ApiExtension => ({ key: "user:a", id: "a", scope: "user", root: null, runId: "run1", tag: "ext:user:a:run1", allow: [], onUnresponsive: "pass", ...over });
const call = (api: ReturnType<typeof setup>["api"], e: ApiExtension, method: string, params?: Record<string, unknown>, id: ExtRequest["id"] = 1): ExtLine | null =>
  api.handle(e, { id, method, ...(params ? { params } : {}) });
const err = (l: ExtLine | null) => (l && l.type === "ext.result" && !l.ok ? l.error : null);
const ok = (l: ExtLine | null) => (l && l.type === "ext.result" && l.ok ? l.result : undefined);
const panel = (name: string, extra: Record<string, unknown> = {}) => ({ paneId: "p1", name, kind: "panel", format: "html", content: "<p>x</p>", ...extra });
const script = (name: string, extra: Record<string, unknown> = {}) => ({ paneId: "p1", name, kind: "panel", format: "script-html", content: "<script>1</script>", ...extra });

describe("ExtensionApi: 処理の順 2〜8", () => {
  it("表に無い名前・display.wait → unsupported（名前は決まった文字のときだけ文に入る）", () => {
    const s = setup();
    expect(err(call(s.api, ext(), "display.wait", { paneId: "p1" }))).toEqual({ code: "unsupported", message: "この操作は使えません: display.wait" });
    expect(err(call(s.api, ext(), "x".repeat(10)))?.code).toBe("unsupported");
    const weird = err(call(s.api, ext(), "a b<script>"));
    expect(weird?.code).toBe("unsupported");
    expect(weird?.message).toBe("この操作は使えません");
  });
  it("id なし → null（誤りのときも）", () => {
    const s = setup();
    expect(s.api.handle(ext(), { method: "ext.panes" })).toBeNull();
    expect(s.api.handle(ext(), { method: "nope" })).toBeNull();
    expect(s.api.handle(ext(), { method: "display.set", params: { paneId: "p1" } })).toBeNull();
    expect(s.api.handle(ext(), { method: "display.list", params: { paneId: "p9" } })).toBeNull();
  });
  it("id は文字列でも数でもそのまま返る", () => {
    const s = setup();
    expect(call(s.api, ext(), "ext.panes", {}, "abc")).toMatchObject({ type: "ext.result", id: "abc", ok: true });
    expect(call(s.api, ext(), "ext.panes", {}, 7)).toMatchObject({ id: 7 });
  });
  it("引数の検査: paneId が無い → invalid_params", () => {
    const s = setup();
    expect(err(call(s.api, ext(), "display.list", {}))?.code).toBe("invalid_params");
    expect(err(call(s.api, ext(), "display.close", { paneId: "p1" }))?.code).toBe("invalid_params");
  });
  it("範囲の外 → not_found（無い pane と、同じ code・同じ文）", () => {
    const s = setup({ inScope: (_e, p) => p === "p1" });
    const out = err(call(s.api, ext(), "display.list", { paneId: "p2" }));
    const missing = err(call(s.api, ext(), "display.list", { paneId: "pX" }));
    expect(out?.code).toBe("not_found");
    expect(out?.message).toBe("pane not found: p2");
    expect(missing?.code).toBe("not_found");
    expect(missing?.message).toBe("pane not found: pX");
    expect(s.displays.list).not.toHaveBeenCalled();
    expect(err(call(s.api, ext(), "display.set", panel("m", { paneId: "p2" })))?.code).toBe("not_found");
    expect(err(call(s.api, ext({ allow: ["script-html"] }), "display.send", { paneId: "p2", name: "m", data: 1 }))?.code).toBe("not_found");
    expect(s.displays.set).not.toHaveBeenCalled();
  });
  it("display.set は台帳に札を付けて通り、結果は台帳の返すもの。close・list は自分の面だけ", () => {
    const s = setup();
    const e = ext();
    const r = ok(call(s.api, e, "display.set", panel("m"))) as { display: { name: string; source: unknown } };
    expect(r.display.source).toEqual({ type: "extension", id: "a", scope: "user" });
    s.real.set("p1", { name: "plain", kind: "panel", format: "text", content: "z" });
    expect((ok(call(s.api, e, "display.list", { paneId: "p1" })) as { displays: { name: string }[] }).displays.map((d) => d.name)).toEqual(["m"]);
    expect(ok(call(s.api, e, "display.close", { paneId: "p1", name: "plain" }))).toEqual({ closed: [] });
    expect(ok(call(s.api, e, "display.close", { paneId: "p1", all: true }))).toEqual({ closed: ["m"] });
    expect(s.real.list("p1").displays.map((d) => d.name)).toEqual(["plain"]);
    expect(ok(call(s.api, e, "display.list", { paneId: "p1" }))).toEqual({ displays: [] });
  });
  it("拡張が出した面にも dock・edge・collapsed の指定が効き（source と両立）、display.features に layout が載る", () => {
    const s = setup();
    const r = ok(call(s.api, ext(), "display.set", panel("m", { dock: "bottom", collapsed: true }))) as { display: { dock?: string; collapsed?: boolean; source: unknown } };
    expect(r.display).toMatchObject({ dock: "bottom", collapsed: true, source: { type: "extension", id: "a" } });
    expect((ok(call(s.api, ext(), "display.features", {})) as { features: string[] }).features).toContain("layout");
  });
  it("同じ名前の set（pane のプログラムの面に当たる）は台帳の invalid_display がそのまま返る", () => {
    const s = setup();
    s.real.set("p1", { name: "m", kind: "panel", format: "text", content: "z" });
    expect(err(call(s.api, ext(), "display.set", panel("m")))?.code).toBe("invalid_display");
  });
  it("ext.panes は deps の一覧。ext.features の結果に display.renderers がある", () => {
    const s = setup();
    expect((ok(call(s.api, ext(), "ext.panes", {})) as { panes: unknown[] }).panes).toHaveLength(1);
    const f = ok(call(s.api, ext(), "ext.features", {})) as { methods: string[]; events: string[]; display: { renderers: unknown; features: string[] }; limits: { displayBytes: number } };
    expect(f.display.renderers).toBeDefined();
    expect(f.methods).toContain("display.set");
    expect(f.events).toContain("display.action");
    expect(f.limits.displayBytes).toBe(EXTENSION_DISPLAY_BYTES_MAX);
  });
  it("台帳が投げた RpcError の code がそのまま返る／ほかの例外・inScope の例外は internal（文は固定）", () => {
    const s = setup({ inScope: () => { throw new Error("SECRET-detail"); } });
    const e1 = err(call(s.api, ext(), "display.list", { paneId: "p1" }));
    expect(e1).toEqual({ code: "internal", message: "internal error" });
    expect(JSON.stringify(s.warns)).not.toContain("SECRET");
    const s2 = setup();
    expect(err(call(s2.api, ext(), "display.set", { paneId: "p1", name: "bad name!", kind: "panel", format: "html", content: "x" }))?.code).toBe("invalid_display");
  });
});

describe("ExtensionApi: script-html の 2 つの条件（allow と設定）", () => {
  it("allow が無い → set（script-html）・send は unsupported で、台帳の set・send が呼ばれていない", () => {
    const on = setup({ scriptEnabled: () => true });
    expect(err(call(on.api, ext(), "display.set", script("g")))?.code).toBe("unsupported");
    expect(err(call(on.api, ext(), "display.send", { paneId: "p1", name: "g", data: 1 }))?.code).toBe("unsupported");
    expect(on.displays.set).not.toHaveBeenCalled();
    expect(on.displays.send).not.toHaveBeenCalled();
    // 静的な形式は allow に依らない
    expect(ok(call(on.api, ext(), "display.set", panel("st")))).toBeDefined();
  });
  it("allow があり、設定が無効 → display_script_disabled（台帳の code がそのまま）", () => {
    const s = setup({ scriptEnabled: () => false });
    const e = ext({ allow: ["script-html"] });
    expect(err(call(s.api, e, "display.set", script("g")))?.code).toBe("display_script_disabled");
    expect(err(call(s.api, e, "display.send", { paneId: "p1", name: "g", data: 1 }))?.code).toBe("display_script_disabled");
    expect(s.displays.set).toHaveBeenCalledTimes(1);
  });
  it("allow があり、設定が有効 → 通る。display.send は自分の札を付けて台帳を呼ぶ（ほかの持ち主の面 → display_closed）", () => {
    const s = setup({ scriptEnabled: () => true });
    const e = ext({ allow: ["script-html"] });
    expect(ok(call(s.api, e, "display.set", script("g")))).toBeDefined();
    expect(ok(call(s.api, e, "display.send", { paneId: "p1", name: "g", data: { n: 1 } }))).toEqual({ delivered: 0 });
    expect(s.displays.send).toHaveBeenCalledWith("p1", { name: "g", data: { n: 1 } }, { owner: e.tag });
    const other = ext({ key: "user:b", id: "b", tag: "ext:user:b:r", allow: ["script-html"] });
    expect(err(call(s.api, other, "display.send", { paneId: "p1", name: "g", data: 1 }))?.code).toBe("display_closed");
    s.real.set("p1", { name: "plain", kind: "panel", format: "script-html", content: "x" });
    expect(err(call(s.api, e, "display.send", { paneId: "p1", name: "plain", data: 1 }))?.code).toBe("display_closed");
  });
  it("allow があり、冷却の間 → display_busy", () => {
    const s = setup({ scriptEnabled: () => true });
    s.real.subscribe("b1", ["panel", "script-html"]);
    const d = s.real.set("p1", { name: "x", kind: "panel", format: "script-html", content: "x" }).display;
    for (let i = 0; i < 3; i++) s.real.report("b1", { id: d.id, problem: "focus_steal", paneId: "p1", format: "script-html" });
    expect(err(call(s.api, ext({ allow: ["script-html"] }), "display.set", script("g")))?.code).toBe("display_busy");
  });
  it("allow が無ければ、features から format:script-html・send が除かれ、scriptEnabled は false・methods に display.send が無い", () => {
    const s = setup({ scriptEnabled: () => true });
    const hello = s.api.helloLine(ext()) as Extract<ExtLine, { type: "ext.hello" }>;
    expect(hello.display.features).not.toContain("format:script-html");
    expect(hello.display.features).not.toContain("send");
    expect(hello.display.scriptEnabled).toBe(false);
    expect(hello.methods).not.toContain("display.send");
    const f = ok(call(s.api, ext(), "display.features", {})) as { features: string[]; scriptEnabled: boolean };
    expect(f.features).not.toContain("format:script-html");
    expect(f.scriptEnabled).toBe(false);
    const ef = ok(call(s.api, ext(), "ext.features", {})) as { display: { scriptEnabled: boolean } };
    expect(ef.display.scriptEnabled).toBe(false);
  });
  it("allow があれば、scriptEnabled は設定の値。methods に display.send がある", () => {
    let on = false;
    const s = setup({ scriptEnabled: () => on });
    const e = ext({ allow: ["script-html"] });
    let hello = s.api.helloLine(e) as Extract<ExtLine, { type: "ext.hello" }>;
    expect(hello.display.scriptEnabled).toBe(false);
    expect(hello.display.features).toContain("format:script-html");
    expect(hello.methods).toContain("display.send");
    on = true;
    hello = s.api.helloLine(e) as Extract<ExtLine, { type: "ext.hello" }>;
    expect(hello.display.scriptEnabled).toBe(true);
    expect((ok(call(s.api, e, "display.features", {})) as { scriptEnabled: boolean }).scriptEnabled).toBe(true);
  });
  it("API は設定（prefs）を読まない・変えない: 台帳の scriptEnabled の関数は、台帳の中でだけ呼ばれる", () => {
    const fn = vi.fn(() => true);
    const s = setup({ scriptEnabled: fn });
    call(s.api, ext(), "ext.panes", {});
    call(s.api, ext(), "display.list", { paneId: "p1" });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("ExtensionApi: helloLine", () => {
  it("runId・methods・events・display.limits・limits・allow・onUnresponsive", () => {
    const s = setup();
    const h = s.api.helloLine(ext({ scope: "project", root: "/r", onUnresponsive: "block", allow: ["script-html"] })) as Extract<ExtLine, { type: "ext.hello" }>;
    expect(h).toMatchObject({ type: "ext.hello", v: 1, runId: "run1", extension: { id: "a", scope: "project", root: "/r" }, allow: ["script-html"], onUnresponsive: "block" });
    expect(h.methods).toEqual(expect.arrayContaining(["ext.features", "ext.panes", "display.set", "display.close", "display.list", "display.features", "display.send"]));
    expect(h.events).toEqual(["ext.hello", "ext.result", "ext.error", "ext.dropped", "ext.panes", "display.action", "display.closed"]);
    expect(h.display.limits.contentBytes).toBeGreaterThan(0);
    expect(h.limits.displayBytes).toBe(EXTENSION_DISPLAY_BYTES_MAX);
    expect(h.limits.displays).toBe(16);
    expect((s.api.helloLine(ext()) as { extension: Record<string, unknown> }).extension).toEqual({ id: "a", scope: "user" });
  });
});

describe("ExtensionApi: 1 つの拡張の量の上限", () => {
  it("17 個目の面 → display_limit（同じ名前の置き換えは通る）", () => {
    const s = setup({ panes: ["p1", "p2", "p3", "p4", "p5"] });
    const e = ext();
    let n = 0;
    for (const p of ["p1", "p2", "p3", "p4"]) for (let i = 0; i < 4; i++) {
      expect(err(call(s.api, e, "display.set", { ...panel(`m${n++}`), paneId: p })), `${p}-${i}`).toBeNull();
    }
    expect(s.real.countOwned(e.tag)).toBe(16);
    expect(err(call(s.api, e, "display.set", { ...panel("extra"), paneId: "p5" }))?.code).toBe("display_limit");
    expect(err(call(s.api, e, "display.set", { ...panel("m0", { content: "new" }), paneId: "p1" }))).toBeNull();
  });
  it("中身の合計が 8 MiB を超える set → display_limit。ちょうど 8 MiB は通る。自分の面の置き換えは差で数える", () => {
    const s = setup();
    const e = ext();
    const MIB = 1024 * 1024;
    const big = (name: string, bytes: number, paneId = "p1") => ({ ...panel(name, { content: "x".repeat(bytes) }), paneId });
    expect(err(call(s.api, e, "display.set", big("a", 2 * MIB)))).toBeNull();
    expect(err(call(s.api, e, "display.set", big("b", 2 * MIB)))).toBeNull();
    expect(err(call(s.api, e, "display.set", big("c", 2 * MIB, "p2")))).toBeNull();
    expect(err(call(s.api, e, "display.set", big("d", 2 * MIB, "p2")))).toBeNull(); // ちょうど 8 MiB
    expect(s.real.bytesOwned(e.tag)).toBe(8 * MIB);
    expect(err(call(s.api, e, "display.set", big("f", 1, "p3")))?.code).toBe("display_limit");
    // 自分の面の置き換えは、差で数える（同じ大きさへの置き換えは通る）
    expect(err(call(s.api, e, "display.set", big("a", 2 * MIB)))).toBeNull();
    expect(err(call(s.api, e, "display.set", big("a", 2 * MIB + 1)))?.code).toBe("display_limit");
  });
  it("他人の名前に当たるとき、他人の面のバイト数を引かない", () => {
    const s = setup();
    const e = ext();
    const MIB = 1024 * 1024;
    s.real.set("p1", { name: "theirs", kind: "panel", format: "text", content: "y".repeat(2 * MIB) });
    for (const [p, n] of [["p2", "a"], ["p2", "b"], ["p3", "c"], ["p3", "d"]] as const) {
      expect(err(call(s.api, e, "display.set", { ...panel(n, { content: "x".repeat(2 * MIB) }), paneId: p }))).toBeNull();
    }
    // 自分の合計は 8 MiB。他人の 2 MiB の名前に当たる set は、他人の分を引かずに数えるので、display_limit
    expect(err(call(s.api, e, "display.set", { ...panel("theirs", { content: "z" }), paneId: "p1" }))?.code).toBe("display_limit");
  });
});
