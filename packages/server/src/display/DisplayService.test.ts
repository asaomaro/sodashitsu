import {
  DISPLAY_CONTENT_MAX_BYTES,
  DISPLAY_EVENT_QUEUE_MAX,
  DISPLAY_GET_CHUNK_BYTES,
  DISPLAY_SERVER_BYTES_MAX,
  DISPLAY_WAITERS_MAX,
  DISPLAY_WAITERS_PER_PANE_MAX,
  type DisplayEvent,
  type DisplaySetResult,
  type ServerEvent,
} from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { EventBus } from "../bus/EventBus.js";
import { DisplayService, type DisplayClock } from "./DisplayService.js";

class FakeClock implements DisplayClock {
  t = 1_000_000;
  private seq = 0;
  readonly active = new Map<number, { at: number; fn: () => void }>();
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    this.active.set(++this.seq, { at: this.t + ms, fn });
    return this.seq;
  }
  clearTimeout(h: unknown): void {
    this.active.delete(h as number);
  }
  advance(ms: number): void {
    this.t += ms;
    for (const [id, timer] of [...this.active]) {
      if (timer.at <= this.t) {
        this.active.delete(id);
        timer.fn();
      }
    }
  }
}

function setup(o: { screens?: string[]; panes?: string[] } = {}) {
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const clock = new FakeClock();
  const panes = new Set(o.panes ?? ["p1", "p2"]);
  const screens = new Set(o.screens ?? ["b1", "b2"]);
  const logs: { msg: string; fields: unknown }[] = [];
  let n = 0;
  const displays = new DisplayService({
    bus,
    paneExists: (id) => panes.has(id),
    isScreenKind: (id) => screens.has(id),
    clock,
    newId: () => `d${++n}`,
    logger: { info: (msg, fields) => void logs.push({ msg, fields }), warn: (msg, fields) => void logs.push({ msg, fields }) },
  });
  const names = (): string[] => events.filter((e) => e.event.startsWith("display.")).map((e) => `${e.event}:${(e.data as { name?: string; display?: { name: string } }).name ?? (e.data as { display: { name: string } }).display.name}`);
  return { displays, bus, clock, panes, screens, events, logs, names };
}

const body = (name = "main", extra: Record<string, unknown> = {}) => ({ name, kind: "panel", format: "html", content: "<p>x</p>", ...extra });
const errCode = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? "no-code";
  }
  return "no-throw";
};
const asyncErrCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? "no-code";
  }
  return "no-throw";
};
/** 決まらない Promise を、短く待って「まだ決まっていない」と確かめる。 */
async function pending(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((r) => setImmediate(r));
  return !settled;
}

describe("DisplayService.set", () => {
  it("新規は rev 1・既定の大きさと題（name）。同じ名前の置き換えは id が同じで rev が 1 増える", () => {
    const s = setup();
    const r1 = s.displays.set("p1", body());
    expect(r1.display).toMatchObject({ id: "d1", paneId: "p1", name: "main", kind: "panel", format: "html", title: "main", size: 320, rev: 1, bytes: 8 });
    expect(r1.epoch).toBe(s.displays.epoch);
    expect(r1.next).toBe(0);
    const r2 = s.displays.set("p1", body("main", { title: "T", size: 400, content: "あ" }));
    expect(r2.display).toMatchObject({ id: "d1", rev: 2, title: "T", size: 400, bytes: 3 });
    // 置き換えで題・大きさを省くと既定に戻る
    expect(s.displays.set("p1", body()).display).toMatchObject({ rev: 3, title: "main", size: 320 });
    expect(s.names()).toEqual(["display.updated:main", "display.updated:main", "display.updated:main"]);
  });

  it("band の既定は 32px", () => {
    const s = setup();
    expect(s.displays.set("p1", body("b", { kind: "band" })).display.size).toBe(32);
  });

  it("結果の display は台帳の実体ではなくコピー（呼び出し側が書き換えても台帳は変わらない）", () => {
    const s = setup();
    const r = s.displays.set("p1", body());
    r.display.title = "HACK";
    expect(s.displays.list("p1").displays[0]!.title).toBe("main");
  });

  it("検査の誤りは invalid_display。pane が無ければ not_found（台帳・頻度の桶に影響しない）", () => {
    const s = setup();
    expect(errCode(() => s.displays.set("p1", { ...body(), name: "a b" }))).toBe("invalid_display");
    expect(errCode(() => s.displays.set("p1", { ...body(), content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES + 1) }))).toBe("invalid_display");
    expect(errCode(() => s.displays.set("nope", body()))).toBe("not_found");
    expect(s.displays.list("p1").displays).toEqual([]);
  });

  it("2 MiB ちょうどの中身が通る", () => {
    const s = setup();
    const r = s.displays.set("p1", body("big", { content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES) }));
    expect(r.display.bytes).toBe(DISPLAY_CONTENT_MAX_BYTES);
  });

  it("pane の数の上限: panel 4・band 2。置き換えは数えない。kind を変える置き換えは変えた後の種類で数える", () => {
    const s = setup();
    for (let i = 0; i < 4; i++) s.displays.set("p1", body(`p${i}`));
    expect(errCode(() => s.displays.set("p1", body("p4")))).toBe("display_limit");
    expect(() => s.displays.set("p1", body("p0", { content: "new" }))).not.toThrow(); // 置き換え
    for (let i = 0; i < 2; i++) s.displays.set("p1", body(`b${i}`, { kind: "band" }));
    expect(errCode(() => s.displays.set("p1", body("b2", { kind: "band" })))).toBe("display_limit");
    // panel を band に変える → band は満杯
    expect(errCode(() => s.displays.set("p1", body("p0", { kind: "band" })))).toBe("display_limit");
    // 別の pane は別枠
    expect(() => s.displays.set("p2", body("x"))).not.toThrow();
  });

  it("サーバ全体の面の数 64。上限で落ちても既にある面は変わらない", () => {
    const panes = Array.from({ length: 33 }, (_, i) => `q${i}`);
    const s = setup({ panes });
    // 1 pane に panel 2 つ（4 まで）で 64 面。
    for (let i = 0; i < 32; i++) {
      s.displays.set(`q${i}`, body("a"));
      s.displays.set(`q${i}`, body("b"));
    }
    expect(errCode(() => s.displays.set("q32", body("a")))).toBe("display_limit");
    expect(s.displays.list("q0").displays).toHaveLength(2);
    // 置き換えは通る
    expect(() => s.displays.set("q0", body("a", { content: "y" }))).not.toThrow();
  });

  it("サーバ全体の中身の合計 32 MiB: 超える set は display_limit で、既にある面は変わらない。置き換えは差分で見る", () => {
    const names = Array.from({ length: 20 }, (_, i) => `q${i}`);
    const s = setup({ panes: names });
    // 頻度の桶に当たらないよう、pane ごとに 1 つずつ（各 pane の量の桶は 8 MiB）。
    const big = "a".repeat(DISPLAY_CONTENT_MAX_BYTES);
    for (let i = 0; i < 16; i++) s.displays.set(names[i]!, body("a", { content: big }));
    expect(DISPLAY_SERVER_BYTES_MAX).toBe(16 * DISPLAY_CONTENT_MAX_BYTES);
    expect(errCode(() => s.displays.set(names[16]!, body("a", { content: "x" })))).toBe("display_limit");
    // 満杯でも、同じ面を同じ大きさ以下に置き換えるのは通る（差分で見る）
    expect(() => s.displays.set(names[0]!, body("a", { content: "small" }))).not.toThrow();
    // 空いた分は使える
    expect(() => s.displays.set(names[16]!, body("a", { content: "x" }))).not.toThrow();
    expect(s.displays.list(names[0]!).displays[0]).toMatchObject({ bytes: 5, rev: 2 });
    // 合計の記録が戻る: 閉じると、また 2 MiB 入る
    s.displays.close(names[1]!, { all: true });
    expect(() => s.displays.set(names[17]!, body("a", { content: big }))).not.toThrow();
  });

  it("回数の頻度: 続けて 10 回まで通り 11 回目は display_busy。1 秒で 10 回ぶん戻る。busy の set は面を変えない", () => {
    const s = setup();
    for (let i = 0; i < 10; i++) s.displays.set("p1", body("main", { content: `v${i}` }));
    expect(errCode(() => s.displays.set("p1", body("main", { content: "v10" })))).toBe("display_busy");
    expect(s.displays.list("p1").displays[0]).toMatchObject({ rev: 10, bytes: 2 });
    // 別の pane は別の桶
    expect(() => s.displays.set("p2", body())).not.toThrow();
    s.clock.advance(1000);
    expect(() => s.displays.set("p1", body("main", { content: "v10" }))).not.toThrow();
  });

  it("量の頻度: 続けて 8 MiB まで。超える set は display_busy で面は変わらない。毎秒 2 MiB 戻る", () => {
    const s = setup();
    const big = "a".repeat(DISPLAY_CONTENT_MAX_BYTES);
    for (let i = 0; i < 4; i++) s.displays.set("p1", body("main", { content: big }));
    expect(errCode(() => s.displays.set("p1", body("main", { content: big })))).toBe("display_busy");
    expect(s.displays.list("p1").displays[0]).toMatchObject({ rev: 4, bytes: DISPLAY_CONTENT_MAX_BYTES });
    // 小さい set は、残りが無いので断られる（回数の桶は戻る）
    expect(errCode(() => s.displays.set("p1", body("main", { content: "x".repeat(10) })))).toBe("display_busy");
    s.clock.advance(1000); // 2 MiB 戻る
    expect(() => s.displays.set("p1", body("main", { content: big }))).not.toThrow();
  });

  it("頻度の桶は、通らなかった set（上限・不正）に使わせない", () => {
    const s = setup();
    for (let i = 0; i < 4; i++) s.displays.set("p1", body(`p${i}`));
    // 数の上限で落ちる set を 20 回繰り返しても、回数の桶は減らない（置き換えが通る）
    for (let i = 0; i < 20; i++) expect(errCode(() => s.displays.set("p1", body("over")))).toBe("display_limit");
    for (let i = 0; i < 6; i++) expect(() => s.displays.set("p1", body("p0", { content: `v${i}` }))).not.toThrow();
    // 不正な set も使わせない
    for (let i = 0; i < 20; i++) expect(errCode(() => s.displays.set("p2", { ...body(), name: "" }))).toBe("invalid_display");
    for (let i = 0; i < 10; i++) expect(() => s.displays.set("p2", body())).not.toThrow();
  });

  it("ttlMs の経過で消え、display.closed(expired) を足す。set のたびに張り直し、ttl なしの set で外れる", () => {
    const s = setup();
    s.displays.set("p1", body("a", { ttlMs: 5000 }));
    s.clock.advance(4000);
    s.displays.set("p1", body("a", { ttlMs: 5000 })); // 張り直し
    s.clock.advance(4000);
    expect(s.displays.list("p1").displays).toHaveLength(1);
    s.clock.advance(1000);
    expect(s.displays.list("p1").displays).toEqual([]);
    expect(s.events.at(-1)).toMatchObject({ event: "display.removed", data: { name: "a", reason: "expired" } });
    s.displays.set("p1", body("b", { ttlMs: 5000 }));
    s.displays.set("p1", body("b")); // 外れる
    expect(s.clock.active.size).toBe(0);
    s.clock.advance(60_000);
    expect(s.displays.list("p1").displays).toHaveLength(1);
  });

  it("ログに中身・題を書かない", () => {
    const s = setup();
    s.displays.set("p1", body("a", { title: "SECRET-TITLE", content: "SECRET-CONTENT" }));
    s.displays.close("p1", { all: true });
    expect(JSON.stringify(s.logs)).not.toMatch(/SECRET/);
    expect(s.logs.length).toBeGreaterThan(0);
  });
});

describe("DisplayService.close / list", () => {
  it("name で閉じる・all で閉じる・無い名前は closed: []", () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    s.displays.set("p1", body("b"));
    expect(s.displays.close("p1", { name: "zzz" })).toEqual({ closed: [] });
    expect(s.displays.close("p1", { name: "a" })).toEqual({ closed: ["a"] });
    expect(s.displays.close("p1", { all: true })).toEqual({ closed: ["b"] });
    expect(s.displays.close("p1", { all: true })).toEqual({ closed: [] });
    expect(s.names().filter((n) => n.startsWith("display.removed"))).toEqual(["display.removed:a", "display.removed:b"]);
  });

  it("list は pane の出来事の今の seq と epoch を返す（events が ready の後の出来事を落とさないため）", () => {
    const s = setup();
    expect(s.displays.list("p1")).toMatchObject({ seq: 0, epoch: s.displays.epoch });
    s.displays.set("p1", body("a"));
    s.displays.close("p1", { all: true }); // display.closed が 1 件
    expect(s.displays.list("p1").seq).toBe(1);
    expect(s.displays.list("p2").seq).toBe(0);
  });

  it("pane が無ければ close も list も not_found", () => {
    const s = setup();
    expect(errCode(() => s.displays.close("nope", { all: true }))).toBe("not_found");
    expect(errCode(() => s.displays.list("nope"))).toBe("not_found");
  });

  it("list は自分の pane の面だけ（出た順）", () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    s.displays.set("p2", body("x"));
    s.displays.set("p1", body("b"));
    s.displays.set("p1", body("a", { content: "again" })); // 置き換えでも順は変わらない
    expect(s.displays.list("p1").displays.map((d) => d.name)).toEqual(["a", "b"]);
    expect(s.displays.list("p2").displays.map((d) => d.name)).toEqual(["x"]);
  });

  it("close は display.removed(closed) を配り、列に display.closed(closed) を足す（自分の close も届く）", async () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, {});
    s.displays.close("p1", { name: "a" });
    const r = await w;
    expect(r.events).toMatchObject([{ type: "display.closed", name: "a", reason: "closed", seq: 1, paneId: "p1" }]);
    expect(s.events.at(-1)).toMatchObject({ event: "display.removed", data: { reason: "closed", paneId: "p1", name: "a" } });
  });
});

describe("DisplayService.subscribe / renderers / features", () => {
  it("画面でない接続の subscribe は invalid_params", () => {
    const s = setup({ screens: ["b1"] });
    expect(errCode(() => s.displays.subscribe("ext", ["panel"]))).toBe("invalid_params");
  });

  it("一覧は全 pane の分。知らない features は捨てる", () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    s.displays.set("p2", body("b"));
    const r = s.displays.subscribe("b1", ["panel", "band", "actions", "script-html", "x"]);
    expect(r.displays.map((d) => d.name)).toEqual(["a", "b"]);
    expect(s.displays.features().renderers).toMatchObject({ panel: 1, band: 1, actions: 1 });
  });

  it("renderers は名乗った種類ごとに数える。再度の subscribe は置き換え。切断・種類の変更で外れる", () => {
    const s = setup();
    expect(s.displays.features().renderers).toMatchObject({ panel: 0, band: 0, actions: 0 });
    s.displays.subscribe("b1", ["panel"]);
    s.displays.subscribe("b2", ["panel", "band", "actions"]);
    expect(s.displays.features().renderers).toMatchObject({ panel: 2, band: 1, actions: 1 });
    s.displays.subscribe("b2", ["band"]);
    expect(s.displays.features().renderers).toMatchObject({ panel: 1, band: 1, actions: 0 });
    s.displays.onClientGone("b1");
    expect(s.displays.features().renderers).toMatchObject({ panel: 0, band: 1, actions: 0 });
    s.screens.delete("b2"); // 名乗った後に external へ替えた
    expect(s.displays.features().renderers).toMatchObject({ panel: 0, band: 0, actions: 0 });
  });

  it("set の結果の renderers も同じ数を返す（0 でも成功）", () => {
    const s = setup();
    expect(s.displays.set("p1", body()).renderers).toMatchObject({ panel: 0, band: 0, actions: 0 });
    s.displays.subscribe("b1", ["panel", "band", "actions"]);
    expect(s.displays.set("p1", body()).renderers).toMatchObject({ panel: 1, band: 1, actions: 1 });
  });

  it("features: 機能・上限・epoch。上限に受け口の 1 行の上限 4 MiB が入る", () => {
    const s = setup();
    const f = s.displays.features();
    expect(f.epoch).toBe(s.displays.epoch);
    expect(f.features).toEqual(expect.arrayContaining(["panel", "band", "format:text", "format:markdown", "format:html", "actions"]));
    expect(f.limits).toMatchObject({ contentBytes: 2 * 1024 * 1024, requestLineBytes: 4 * 1024 * 1024, serverBytes: 32 * 1024 * 1024 });
  });

  it("epoch は作るたびに違う", () => {
    expect(setup().displays.epoch).not.toBe(setup().displays.epoch);
  });
});

describe("DisplayService.get（小分けの取得）", () => {
  const sub = (s: ReturnType<typeof setup>): void => void s.displays.subscribe("b1", ["panel"]);

  it("名乗っていない接続・無い面は display_closed", () => {
    const s = setup();
    s.displays.set("p1", body());
    expect(errCode(() => s.displays.get("b1", "d1", 0))).toBe("display_closed"); // 名乗っていない
    sub(s);
    expect(errCode(() => s.displays.get("b1", "zzz", 0))).toBe("display_closed");
    expect(errCode(() => s.displays.get("ext", "d1", 0))).toBe("display_closed");
    expect(s.displays.get("b1", "d1", 0)).toMatchObject({ id: "d1", rev: 1, format: "html", totalBytes: 8, offset: 0, eof: true });
  });

  it("2 MiB ちょうどは片 3 つにまたがり、つなぐと元の中身と一致する。片の境目で eof が決まる", () => {
    const s = setup();
    const content = Array.from({ length: DISPLAY_CONTENT_MAX_BYTES / 4 }, (_, i) => String.fromCharCode(97 + (i % 26)) + "あ".slice(0, 0) + "b" + "c" + "d").join("").slice(0, DISPLAY_CONTENT_MAX_BYTES);
    expect(Buffer.byteLength(content)).toBe(DISPLAY_CONTENT_MAX_BYTES);
    s.displays.set("p1", body("big", { content }));
    sub(s);
    const parts: Buffer[] = [];
    const eofs: boolean[] = [];
    for (let offset = 0; ; offset += DISPLAY_GET_CHUNK_BYTES) {
      const c = s.displays.get("b1", "d1", offset);
      expect(c.totalBytes).toBe(DISPLAY_CONTENT_MAX_BYTES);
      expect(c.offset).toBe(offset);
      parts.push(Buffer.from(c.base64, "base64"));
      eofs.push(c.eof);
      if (c.eof) break;
    }
    expect(parts).toHaveLength(3);
    expect(eofs).toEqual([false, false, true]);
    expect(parts[0]!.length).toBe(DISPLAY_GET_CHUNK_BYTES);
    expect(Buffer.concat(parts).toString("utf8")).toBe(content);
  });

  it("片の大きさちょうどの中身は 1 片で eof。次の offset は範囲外", () => {
    const s = setup();
    s.displays.set("p1", body("x", { content: "a".repeat(DISPLAY_GET_CHUNK_BYTES) }));
    sub(s);
    expect(s.displays.get("b1", "d1", 0).eof).toBe(true);
    expect(errCode(() => s.displays.get("b1", "d1", DISPLAY_GET_CHUNK_BYTES))).toBe("invalid_params");
  });

  it("空の中身は 1 片（offset 0・eof）", () => {
    const s = setup();
    s.displays.set("p1", body("x", { content: "" }));
    sub(s);
    expect(s.displays.get("b1", "d1", 0)).toMatchObject({ totalBytes: 0, base64: "", eof: true });
  });

  it("offset が片の倍数でない・範囲外は invalid_params", () => {
    const s = setup();
    s.displays.set("p1", body("x", { content: "a".repeat(DISPLAY_GET_CHUNK_BYTES + 5) }));
    sub(s);
    expect(errCode(() => s.displays.get("b1", "d1", 1))).toBe("invalid_params");
    expect(errCode(() => s.displays.get("b1", "d1", DISPLAY_GET_CHUNK_BYTES - 1))).toBe("invalid_params");
    expect(errCode(() => s.displays.get("b1", "d1", DISPLAY_GET_CHUNK_BYTES * 2))).toBe("invalid_params");
    expect(s.displays.get("b1", "d1", DISPLAY_GET_CHUNK_BYTES)).toMatchObject({ eof: true, offset: DISPLAY_GET_CHUNK_BYTES });
  });

  it("途中で rev が変わったら、次の片の rev で分かる（画面が最初から取り直す）", () => {
    const s = setup();
    s.displays.set("p1", body("x", { content: "a".repeat(DISPLAY_GET_CHUNK_BYTES * 2) }));
    sub(s);
    const first = s.displays.get("b1", "d1", 0);
    s.displays.set("p1", body("x", { content: "b".repeat(DISPLAY_GET_CHUNK_BYTES * 2) }));
    const second = s.displays.get("b1", "d1", DISPLAY_GET_CHUNK_BYTES);
    expect(first.rev).toBe(1);
    expect(second.rev).toBe(2);
  });

  it("名乗った後に external へ替えた接続は使えない", () => {
    const s = setup();
    s.displays.set("p1", body());
    sub(s);
    s.screens.delete("b1");
    expect(errCode(() => s.displays.get("b1", "d1", 0))).toBe("display_closed");
  });
});

describe("DisplayService.action / dismiss / report", () => {
  function ready() {
    const s = setup();
    s.displays.set("p1", body("main"));
    s.displays.subscribe("b1", ["panel", "actions"]);
    return s;
  }

  it("action は列に display.action を足す（rev は画面が送った値）。名乗っていない接続は display_closed", async () => {
    const s = ready();
    s.displays.set("p1", body("main", { content: "v2" })); // rev 2
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, {});
    s.displays.action("b1", { id: "d1", rev: 1, action: "go", data: { a: "b" } });
    const r = await w;
    expect(r.events).toEqual([{ type: "display.action", seq: 1, paneId: "p1", name: "main", rev: 1, action: "go", data: { a: "b" }, at: expect.any(String) }]);
    expect(errCode(() => s.displays.action("b2", { id: "d1", rev: 1, action: "go" }))).toBe("display_closed");
    expect(errCode(() => s.displays.action("b1", { id: "zzz", rev: 1, action: "go" }))).toBe("display_closed");
  });

  it("action の検査: rev は 1〜今の rev の整数・名前と値の規則・text の面は invalid_params", () => {
    const s = ready();
    for (const rev of [0, 2, 1.5, -1]) expect(errCode(() => s.displays.action("b1", { id: "d1", rev, action: "go" }))).toBe("invalid_params");
    expect(errCode(() => s.displays.action("b1", { id: "d1", rev: 1, action: "a b" }))).toBe("invalid_params");
    expect(errCode(() => s.displays.action("b1", { id: "d1", rev: 1, action: "go", data: { a: 1 } }))).toBe("invalid_params");
    expect(errCode(() => s.displays.action("b1", { id: "d1", rev: 1, action: "go", data: { v: "x".repeat(9000) } }))).toBe("invalid_params");
    s.displays.set("p1", { name: "t", kind: "panel", format: "text", content: "x" });
    expect(errCode(() => s.displays.action("b1", { id: "d2", rev: 1, action: "go" }))).toBe("invalid_params");
    // markdown は通る
    s.displays.set("p1", { name: "m", kind: "panel", format: "markdown", content: "x" });
    expect(() => s.displays.action("b1", { id: "d3", rev: 1, action: "go" })).not.toThrow();
  });

  it("操作の頻度（接続ごとに 20 回）を超えた分は、誤りにせず捨てて成功。ログには数だけ。1 秒で戻る", async () => {
    const s = ready();
    for (let i = 0; i < 20; i++) s.displays.action("b1", { id: "d1", rev: 1, action: `a${i}` });
    expect(() => s.displays.action("b1", { id: "d1", rev: 1, action: "dropped1" })).not.toThrow();
    expect(() => s.displays.action("b1", { id: "d1", rev: 1, action: "dropped2" })).not.toThrow();
    const r = await s.displays.wait("p1", { since: 0, timeoutMs: 1000 }, {});
    expect(r.events).toHaveLength(20);
    expect(r.events.some((e) => e.type === "display.action" && e.action.startsWith("dropped"))).toBe(false);
    expect(JSON.stringify(s.logs)).not.toMatch(/dropped1|dropped2/);
    // 別の接続は別の桶
    s.displays.subscribe("b2", ["actions"]);
    s.displays.action("b2", { id: "d1", rev: 1, action: "from-b2" });
    expect((await s.displays.wait("p1", { since: 20, timeoutMs: 1000 }, {})).events).toHaveLength(1);
    s.clock.advance(1000);
    s.displays.action("b1", { id: "d1", rev: 1, action: "again" });
    expect((await s.displays.wait("p1", { since: 21, timeoutMs: 1000 }, {})).events).toMatchObject([{ action: "again" }]);
  });

  it("dismiss: id で 1 つ・paneId で pane の全部。reason は dismissed。名乗っていない接続は display_closed。無い id は成功", async () => {
    const s = ready();
    s.displays.set("p1", body("other"));
    expect(errCode(() => s.displays.dismiss("b2", { id: "d1" }))).toBe("display_closed");
    expect(s.displays.dismiss("b1", { id: "zzz" })).toEqual({ closed: [] });
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, {});
    expect(s.displays.dismiss("b1", { id: "d1" })).toEqual({ closed: ["main"] });
    expect((await w).events).toMatchObject([{ type: "display.closed", name: "main", reason: "dismissed" }]);
    expect(s.displays.dismiss("b1", { paneId: "p1" })).toEqual({ closed: ["other"] });
    expect(s.displays.list("p1").displays).toEqual([]);
    expect(s.events.filter((e) => e.event === "display.removed").map((e) => (e.data as { reason: string }).reason)).toEqual(["dismissed", "dismissed"]);
  });

  it("report: navigated・unresponsive は、その面を閉じて理由を problem のまま列に入れる。名乗っていない接続は display_closed。無い id は成功", async () => {
    const s = ready();
    s.displays.set("p1", body("other"));
    expect(errCode(() => s.displays.report("b2", { id: "d1", problem: "navigated" }))).toBe("display_closed");
    expect(s.displays.report("b1", { id: "zzz", problem: "navigated" })).toEqual({ closed: [] });
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, {});
    expect(s.displays.report("b1", { id: "d1", problem: "navigated" })).toEqual({ closed: ["main"] });
    expect((await w).events).toMatchObject([{ type: "display.closed", name: "main", reason: "navigated" }]);
    expect(s.displays.report("b1", { id: "d2", problem: "unresponsive" })).toEqual({ closed: ["other"] });
    expect(s.events.at(-1)).toMatchObject({ event: "display.removed", data: { name: "other", reason: "unresponsive" } });
  });
});

describe("DisplayService.wait", () => {
  const fire = (s: ReturnType<typeof setup>, n: number, name = "main"): void => {
    for (let i = 0; i < n; i++) s.displays.action("b1", { id: s.displays.list("p1").displays.find((d) => d.name === name)!.id, rev: 1, action: `a${i}` });
  };
  function ready() {
    const s = setup();
    s.displays.set("p1", body("main"));
    s.displays.subscribe("b1", ["actions"]);
    return s;
  }

  it("分岐 1: epoch が違うと、すぐ reset の結果（今の seq と新しい epoch）", async () => {
    const s = ready();
    fire(s, 2);
    const r = await s.displays.wait("p1", { epoch: "old", timeoutMs: 1000 }, {});
    expect(r).toEqual({ epoch: s.displays.epoch, next: 2, events: [], dropped: 0, reset: true });
  });

  it("分岐 2: since を省くと、この後の出来事だけを待つ", async () => {
    const s = ready();
    fire(s, 2);
    const w = s.displays.wait("p1", { epoch: s.displays.epoch, timeoutMs: 5000 }, {});
    expect(await pending(w)).toBe(true);
    fire(s, 1);
    const r = await w;
    expect(r.events).toHaveLength(1);
    expect(r.events[0]!.seq).toBe(3);
    expect(r.next).toBe(3);
    expect(r.reset).toBe(false);
  });

  it("分岐 3: since より後の出来事があれば、すぐ返す。next は返した最後の seq。names で絞る", async () => {
    const s = ready();
    s.displays.set("p1", body("other"));
    fire(s, 2, "main");
    fire(s, 1, "other");
    const all = await s.displays.wait("p1", { since: 0, timeoutMs: 1000 }, {});
    expect(all.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(all.next).toBe(3);
    const onlyOther = await s.displays.wait("p1", { since: 0, names: ["other"], timeoutMs: 1000 }, {});
    expect(onlyOther.events.map((e) => e.seq)).toEqual([3]);
    const after = await s.displays.wait("p1", { since: 1, names: ["main"], timeoutMs: 1000 }, {});
    expect(after.events.map((e) => e.seq)).toEqual([2]);
    expect(after.next).toBe(2);
  });

  it("分岐 3: 溜めた出来事があふれたら、捨てた数が dropped に入る", async () => {
    // 操作の頻度（20 回/秒）の桶を、偽の時計を進めて戻しながら 80 件出す。
    const s2 = ready();
    for (let i = 0; i < 4; i++) {
      fire(s2, 20);
      s2.clock.advance(1000);
    }
    const r = await s2.displays.wait("p1", { since: 0, timeoutMs: 1000 }, {});
    expect(r.events).toHaveLength(DISPLAY_EVENT_QUEUE_MAX);
    expect(r.dropped).toBe(80 - DISPLAY_EVENT_QUEUE_MAX);
    expect(r.events[0]!.seq).toBe(80 - DISPLAY_EVENT_QUEUE_MAX + 1);
    expect(r.next).toBe(80);
    // dropped を見た後の since=next では、dropped は 0
    const w = s2.displays.wait("p1", { since: r.next, timeoutMs: 1000 }, {});
    s2.clock.advance(1000);
    expect((await w).dropped).toBe(0);
  });

  it("分岐 4: 無ければ待ち、timeoutMs で空の結果（next は今の seq）", async () => {
    const s = ready();
    const w = s.displays.wait("p1", { timeoutMs: 3000 }, {});
    expect(await pending(w)).toBe(true);
    s.clock.advance(2999);
    expect(await pending(w)).toBe(true);
    s.clock.advance(1);
    expect(await w).toEqual({ epoch: s.displays.epoch, next: 0, events: [], dropped: 0, reset: false });
    expect(s.clock.active.size).toBe(0);
  });

  it("names で待っているとき、ほかの名前の出来事では起きない", async () => {
    const s = ready();
    s.displays.set("p1", body("other"));
    const w = s.displays.wait("p1", { names: ["other"], timeoutMs: 5000 }, {});
    fire(s, 1, "main");
    expect(await pending(w)).toBe(true);
    fire(s, 1, "other");
    expect((await w).events).toMatchObject([{ name: "other", seq: 2 }]);
  });

  it("待ちの上限: pane 4・全体 64（pane の上限 × 16 pane）を超えると display_busy。外れると空きが戻る。1 つの pane の待ちで、ほかの pane は断られない", async () => {
    const panes = Array.from({ length: 18 }, (_, i) => `q${i}`);
    const s = setup({ panes });
    const ws: Promise<unknown>[] = [];
    for (let i = 0; i < DISPLAY_WAITERS_PER_PANE_MAX; i++) ws.push(s.displays.wait("q0", { timeoutMs: 5000 }, {}));
    expect(errCode(() => s.displays.wait("q0", { timeoutMs: 5000 }, {}))).toBe("display_busy");
    // q0 が満杯でも、ほかの pane は待てる。16 pane × 4 = 64 で全体が満杯
    for (let p = 1; p < 16; p++) for (let i = 0; i < 4; i++) ws.push(s.displays.wait(`q${p}`, { timeoutMs: 5000 }, {}));
    expect(DISPLAY_WAITERS_MAX).toBe(64);
    expect(errCode(() => s.displays.wait("q16", { timeoutMs: 5000 }, {}))).toBe("display_busy");
    s.clock.advance(5000); // 全部時間切れ
    await Promise.all(ws);
    expect(() => s.displays.wait("q16", { timeoutMs: 5000 }, {})).not.toThrow();
  });

  it("signal の abort で待ちが外れる（返事は決まらない）。空きが戻る", async () => {
    const s = ready();
    const ac = new AbortController();
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, { signal: ac.signal });
    ac.abort();
    fire(s, 1);
    expect(await pending(w)).toBe(true);
    expect(s.clock.active.size).toBe(0);
    // すでに abort された signal は、待ちを張らない
    const w2 = s.displays.wait("p1", { timeoutMs: 5000 }, { signal: ac.signal });
    expect(await pending(w2)).toBe(true);
    expect(s.clock.active.size).toBe(0);
    for (let i = 0; i < DISPLAY_WAITERS_PER_PANE_MAX; i++) void s.displays.wait("p1", { timeoutMs: 5000 }, {});
  });

  it("clientId の切断（onClientGone）でその接続の待ちが外れる。ほかの接続の待ちは残る", async () => {
    const s = ready();
    const a = s.displays.wait("p1", { timeoutMs: 5000 }, { clientId: "c-a" });
    const b = s.displays.wait("p1", { timeoutMs: 5000 }, { clientId: "c-b" });
    s.displays.onClientGone("c-a");
    fire(s, 1);
    expect((await b).events).toHaveLength(1);
    expect(await pending(a)).toBe(true);
  });

  it("pane が閉じると、待っている wait は not_found で終わる。列は捨てられる", async () => {
    const s = ready();
    fire(s, 1);
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, {});
    s.panes.delete("p1");
    s.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    expect(await asyncErrCode(w)).toBe("not_found");
    expect(errCode(() => s.displays.wait("p1", { timeoutMs: 1000 }, {}))).toBe("not_found");
    expect(s.clock.active.size).toBe(0);
  });

  it("pane が無ければ not_found", () => {
    const s = setup();
    expect(errCode(() => s.displays.wait("nope", { timeoutMs: 1000 }, {}))).toBe("not_found");
  });

  it("dispose で、待っている wait は空の結果で返る。以後の set は断る", async () => {
    const s = ready();
    const w = s.displays.wait("p1", { timeoutMs: 5000 }, {});
    s.displays.dispose();
    expect(await w).toMatchObject({ events: [], reset: false });
    expect(errCode(() => s.displays.set("p1", body()))).toBe("display_closed");
    expect(s.clock.active.size).toBe(0);
    s.displays.dispose(); // 二重でも投げない
  });
});

describe("DisplayService: pane.closed", () => {
  it("その pane の面をすべて外して display.removed(pane_closed) を配り、合計のバイトと頻度の桶を戻す", () => {
    const s = setup();
    s.displays.set("p1", body("a", { ttlMs: 5000 }));
    s.displays.set("p1", body("b"));
    s.displays.set("p2", body("x"));
    s.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    const removed = s.events.filter((e) => e.event === "display.removed").map((e) => e.data as { name: string; reason: string });
    expect(removed).toEqual([
      { id: "d1", paneId: "p1", name: "a", reason: "pane_closed" },
      { id: "d2", paneId: "p1", name: "b", reason: "pane_closed" },
    ]);
    expect(s.displays.list("p2").displays).toHaveLength(1);
    expect(s.clock.active.size).toBe(0); // ttl のタイマーも外れた
    expect(s.displays.subscribe("b1", ["panel"]).displays.map((d) => d.name)).toEqual(["x"]);
  });

  it("処理の中で例外が出ても続く（bus の購読が壊れない）: 配信先が投げても台帳は片づく", () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    s.displays.set("p1", body("b"));
    s.bus.subscribe((e) => {
      if (e.event === "display.removed") throw new Error("listener boom");
    });
    expect(() => s.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent)).not.toThrow();
    expect(s.displays.subscribe("b1", ["panel"]).displays).toEqual([]);
    // 後続の購読者にも届く
    const later: string[] = [];
    s.bus.subscribe((e) => later.push(e.event));
    s.displays.set("p2", body("z"));
    expect(later).toContain("display.updated");
  });

  it("別の pane の面・列には影響しない", async () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    s.displays.set("p2", body("x"));
    s.displays.subscribe("b1", ["actions"]);
    s.displays.action("b1", { id: "d2", rev: 1, action: "go" });
    s.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    const r = await s.displays.wait("p2", { since: 0, timeoutMs: 1000 }, {});
    expect(r.events).toHaveLength(1);
  });
});

describe("DisplayService: 列の seq", () => {
  it("pane ごとに 1 から。set の結果の next はその時点の seq", async () => {
    const s = setup();
    s.displays.set("p1", body("a"));
    s.displays.set("p2", body("x"));
    s.displays.subscribe("b1", ["actions"]);
    s.displays.action("b1", { id: "d1", rev: 1, action: "one" });
    s.displays.action("b1", { id: "d1", rev: 1, action: "two" });
    s.displays.action("b1", { id: "d2", rev: 1, action: "other-pane" });
    const r: DisplaySetResult = s.displays.set("p1", body("a", { content: "y" }));
    expect(r.next).toBe(2);
    expect(s.displays.set("p2", body("x", { content: "y" })).next).toBe(1);
    const ev = (await s.displays.wait("p1", { since: 0, timeoutMs: 1000 }, {})).events as DisplayEvent[];
    expect(ev.map((e) => e.seq)).toEqual([1, 2]);
  });
});
