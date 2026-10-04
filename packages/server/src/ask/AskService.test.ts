import type { AskAnswers, AskResult, ServerEvent } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { EventBus } from "../bus/EventBus.js";
import { AskService, type AskServiceTimers } from "./AskService.js";

class FakeTimers implements AskServiceTimers {
  private seq = 0;
  readonly active = new Map<number, { at: number; fn: () => void }>();
  t = 0;
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

const SPEC = {
  title: "T",
  questions: [
    { id: "a", label: "A", default: "x", options: ["x", "y"], allowOther: true },
    { id: "b", label: "B", type: "multi", options: ["p", "q"], showIf: { a: "x" } },
  ],
};

function setup(o: { browsers?: string[]; panes?: string[] } = {}) {
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const timers = new FakeTimers();
  const panes = new Set(o.panes ?? ["p1", "p2"]);
  const browsers = new Set(o.browsers ?? ["b1", "b2"]);
  const logs: { msg: string; fields: unknown }[] = [];
  let n = 0;
  const asks = new AskService({
    paneExists: (id) => panes.has(id),
    isBrowserKind: (id) => browsers.has(id),
    bus,
    timers,
    random: () => `ask${++n}`,
    logger: { info: (msg, fields) => void logs.push({ msg, fields }) },
  });
  const askEvents = (): string[] => events.filter((e) => e.event.startsWith("ask.")).map((e) => `${e.event}:${(e.data as { askId: string }).askId}`);
  return { asks, bus, timers, panes, browsers, events, askEvents, logs };
}

/** `open` の結果を後で見る。 */
function track(p: Promise<AskResult>): { result: () => AskResult | undefined; done: Promise<AskResult> } {
  let r: AskResult | undefined;
  const done = p.then((v) => (r = v));
  return { result: () => r, done };
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("AskService", () => {
  it("購読している画面が居れば出す: ask.opened は id だけ（定義を載せない）。最初の回答で閉じ、ask.closed を配り、結果を返す", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    expect(s.events.find((e) => e.event === "ask.opened")).toEqual({ event: "ask.opened", data: { askId: "ask1", paneId: "p1" } });
    expect(s.asks.get("b1", "ask1")).toMatchObject({ askId: "ask1", paneId: "p1", spec: { title: "T", submit: "決定" } });
    s.asks.answer("b1", { askId: "ask1", answers: { a: "y" }, note: "メモ" });
    expect(await t.done).toEqual({ status: "answered", answers: { a: "y" }, note: "メモ" });
    expect(s.askEvents()).toEqual(["ask.opened:ask1", "ask.closed:ask1"]);
    expect(s.asks.pendingCount).toBe(0);
    expect(s.timers.active.size).toBe(0);
  });

  it("custom は空でなければ結果に入る", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    // a が x でないので b は隠れる——その答えは断る（質問は閉じない）
    expect(() => s.asks.answer("b1", { askId: "ask1", answers: { a: "自由", b: ["p"] }, custom: ["a"] })).toThrowError(expect.objectContaining({ code: "invalid_params" }));
    expect(t.result()).toBeUndefined();
    s.asks.answer("b1", { askId: "ask1", answers: { a: "自由" }, custom: ["a"] });
    expect(await t.done).toEqual({ status: "answered", answers: { a: "自由" }, custom: ["a"] });
  });

  it("comments は前後の空白を除いて結果に入る。空白だけの値は落とし、全部落ちた・{} なら項目が無い", async () => {
    const run = async (comments: Record<string, string>) => {
      const s = setup();
      s.asks.subscribe("b1");
      const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
      s.asks.answer("b1", { askId: "ask1", answers: { a: "x", b: ["p"] }, comments });
      return t.done;
    };
    expect(await run({ a: "  金曜は避けたい\n", b: "希望" })).toEqual({ status: "answered", answers: { a: "x", b: ["p"] }, comments: { a: "金曜は避けたい", b: "希望" } });
    expect(await run({ a: "   ", b: "希望" })).toEqual({ status: "answered", answers: { a: "x", b: ["p"] }, comments: { b: "希望" } });
    expect(await run({ a: "", b: " \t " })).toEqual({ status: "answered", answers: { a: "x", b: ["p"] } });
    expect(await run({})).toEqual({ status: "answered", answers: { a: "x", b: ["p"] } });
  });

  it("不正な comments（定義に無い id・隠れている質問・付けられない質問・文字列でない値・合計の超過）は invalid_params で断り、質問は開いたまま残る", async () => {
    const spec = {
      questions: [
        { id: "a", label: "A", default: "x", options: ["x", "y"] },
        { id: "b", label: "B", options: ["p"], showIf: { a: "x" } },
        { id: "n", label: "N", options: ["p"], comment: false },
        { id: "t", label: "T", type: "text" },
      ],
    };
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec, timeoutMs: 1000 }));
    const base = { a: "y", n: "p", t: "" };
    const bad = (answers: AskAnswers, comments: unknown) =>
      expect(() => s.asks.answer("b1", { askId: "ask1", answers, comments } as never)).toThrowError(expect.objectContaining({ code: "invalid_params" }));
    bad(base, { zzz: "x" });
    bad(base, { b: "隠れている" }); // a が y なので b は隠れる
    bad({ ...base, a: "x", b: "p" }, { n: "x" }); // comment: false
    bad({ ...base, a: "x", b: "p" }, { t: "x" }); // text
    bad({ ...base, a: "x", b: "p" }, { a: 1 });
    bad({ ...base, a: "x", b: "p" }, { a: "あ".repeat(60_000), b: "あ".repeat(40_001) });
    expect(t.result()).toBeUndefined();
    expect(s.asks.pendingCount).toBe(1);
    s.asks.answer("b1", { askId: "ask1", answers: { ...base, a: "x", b: "p" }, comments: { a: "あ".repeat(60_000), b: "あ".repeat(40_000) } });
    expect(await t.done).toMatchObject({ status: "answered" });
  });

  it("ブラウザが 1 つも居なければ、置かずにすぐ unavailable（購読していない desktop・external・端末版の形を含む）", async () => {
    const s = setup();
    expect(await s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 })).toEqual({
      status: "unavailable",
      reason: "no browser is connected to show the form",
    });
    expect(s.asks.pendingCount).toBe(0);
    expect(s.askEvents()).toEqual([]);
  });

  it("購読の後に画面でなくなった接続（hello で external に替わった）は、購読者に数えず、get・answer・cancel もさせない", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    s.browsers.delete("b1"); // kind が external に変わった
    expect(await s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 })).toMatchObject({ status: "unavailable" });
    s.browsers.add("b1");
    track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    s.browsers.delete("b1");
    for (const fn of [() => s.asks.get("b1", "ask1"), () => s.asks.answer("b1", { askId: "ask1", answers: { a: "x" } }), () => s.asks.cancel("b1", "ask1")])
      expect(fn).toThrowError(expect.objectContaining({ code: "ask_closed" }));
  });

  it("bus の購読者が例外を投げても、台帳の後始末と ask.open の応答は止まらない", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    s.bus.subscribe((e) => {
      if (e.event === "ask.closed") throw new Error("listener failed");
    });
    s.asks.cancel("b1", "ask1");
    expect(await t.done).toEqual({ status: "cancelled" });
    expect(s.asks.pendingCount).toBe(0);
  });

  it("対応していない型の質問がある定義は、ダイアログを出さず（台帳に置かず）すぐ unavailable。黙って落とさない（追補）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const r = await s.asks.open("cli", { paneId: "p1", spec: { questions: [{ id: "a", label: "A", options: ["x"] }, { id: "e", label: "E", type: "edit", text: "文面" }] }, timeoutMs: 1000 });
    expect(r).toEqual({ status: "unavailable", reason: expect.stringContaining('"edit"') });
    expect(s.asks.pendingCount).toBe(0);
    expect(s.askEvents()).toEqual([]);
    // pane が無ければ not_found、同じ pane に質問があれば ask_busy が先（通常の定義と同じ順）
    const spec = { questions: [{ id: "e", label: "E", type: "edit" }] };
    expect(() => s.asks.open("cli", { paneId: "p9", spec, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "not_found" }));
    track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    expect(() => s.asks.open("cli2", { paneId: "p1", spec, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "ask_busy" }));
  });

  it("subscribe できるのは desktop / mobile の接続だけ", () => {
    const s = setup({ browsers: [] });
    expect(() => s.asks.subscribe("ext")).toThrowError(expect.objectContaining({ code: "invalid_params" }));
  });

  it("検査に落ちる定義・無い pane・同じ pane の 2 つめは断る（2 つめが来ても前の質問は残る）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    expect(() => s.asks.open("cli", { paneId: "p1", spec: { questions: [] }, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "invalid_ask_spec" }));
    expect(() => s.asks.open("cli", { paneId: "p9", spec: SPEC, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "not_found" }));
    const first = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    expect(() => s.asks.open("cli2", { paneId: "p1", spec: SPEC, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "ask_busy" }));
    expect(first.result()).toBeUndefined();
    expect(s.asks.pendingCount).toBe(1);
    // 別の pane は同時に出せる
    track(s.asks.open("cli3", { paneId: "p2", spec: SPEC, timeoutMs: 1000 }));
    expect(s.asks.pendingCount).toBe(2);
  });

  it("同時に待てる質問の数に上限がある（総数 32・1 接続 8）。閉じれば空く", async () => {
    const panes = Array.from({ length: 40 }, (_, i) => `q${i}`);
    const s = setup({ panes });
    s.asks.subscribe("b1");
    for (let i = 0; i < 8; i++) track(s.asks.open("cli", { paneId: panes[i]!, spec: SPEC, timeoutMs: 1000 }));
    expect(() => s.asks.open("cli", { paneId: panes[8]!, spec: SPEC, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "ask_busy" }));
    // 別の接続はまだ出せる。総数 32 に達するまで
    for (let c = 0; c < 3; c++) for (let i = 0; i < 8; i++) track(s.asks.open(`cli${c}`, { paneId: panes[8 + c * 8 + i]!, spec: SPEC, timeoutMs: 1000 }));
    expect(s.asks.pendingCount).toBe(32);
    expect(() => s.asks.open("cliX", { paneId: panes[32]!, spec: SPEC, timeoutMs: 1000 })).toThrowError(expect.objectContaining({ code: "ask_busy" }));
    s.asks.cancel("b1", s.asks.subscribe("b1")[0]!.askId);
    track(s.asks.open("cliX", { paneId: panes[32]!, spec: SPEC, timeoutMs: 1000 }));
    expect(s.asks.pendingCount).toBe(32);
  });

  it("2 つの画面が答えたら、先の回答だけ採る。後の回答は ask_closed", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    s.asks.subscribe("b2");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    s.asks.answer("b1", { askId: "ask1", answers: { a: "x", b: ["p"] } });
    expect(() => s.asks.answer("b2", { askId: "ask1", answers: { a: "y" } })).toThrowError(expect.objectContaining({ code: "ask_closed" }));
    expect(await t.done).toEqual({ status: "answered", answers: { a: "x", b: ["p"] } });
  });

  it("誤った形の回答は invalid_params で、質問は閉じない（答え直せる）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    expect(() => s.asks.answer("b1", { askId: "ask1", answers: { a: "nope" } })).toThrowError(expect.objectContaining({ code: "invalid_params" }));
    expect(() => s.asks.answer("b1", { askId: "ask1", answers: {} })).toThrowError(expect.objectContaining({ code: "invalid_params" }));
    expect(s.asks.pendingCount).toBe(1);
    s.asks.answer("b1", { askId: "ask1", answers: { a: "x", b: [] } });
    expect(await t.done).toMatchObject({ status: "answered" });
  });

  it("購読していない接続は get・answer・cancel できない（ask_closed）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    for (const fn of [() => s.asks.get("ext", "ask1"), () => s.asks.answer("ext", { askId: "ask1", answers: { a: "x" } }), () => s.asks.cancel("ext", "ask1")])
      expect(fn).toThrowError(expect.objectContaining({ code: "ask_closed" }));
    expect(s.asks.pendingCount).toBe(1);
  });

  it("cancel → cancelled。2 つの画面が同時に取り消しても 2 つ目は成功（何もしない）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    s.asks.subscribe("b2");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    s.asks.cancel("b1", "ask1");
    s.asks.cancel("b2", "ask1");
    expect(await t.done).toEqual({ status: "cancelled" });
    expect(s.askEvents()).toEqual(["ask.opened:ask1", "ask.closed:ask1"]);
  });

  it("時間切れ → timeout（ask.closed を配る）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 5000 }));
    s.timers.advance(4999);
    expect(t.result()).toBeUndefined();
    s.timers.advance(1);
    expect(await t.done).toEqual({ status: "timeout" });
    expect(s.askEvents()).toEqual(["ask.opened:ask1", "ask.closed:ask1"]);
  });

  it("pane.closed → cancelled。別の pane の質問は残る", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t1 = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    const t2 = track(s.asks.open("cli2", { paneId: "p2", spec: SPEC, timeoutMs: 1000 }));
    s.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    expect(await t1.done).toEqual({ status: "cancelled" });
    await settle();
    expect(t2.result()).toBeUndefined();
    expect(s.asks.pendingCount).toBe(1);
  });

  it("呼び出し側の切断で質問を閉じ ask.closed を配る。別の接続の質問は残る", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t1 = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    track(s.asks.open("cli2", { paneId: "p2", spec: SPEC, timeoutMs: 1000 }));
    s.asks.onClientGone("cli");
    expect(await t1.done).toEqual({ status: "cancelled" });
    expect(s.askEvents()).toContain("ask.closed:ask1");
    expect(s.asks.pendingCount).toBe(1);
    // 同じ pane に新しく出せる
    track(s.asks.open("cli3", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    expect(s.asks.pendingCount).toBe(2);
  });

  it("画面が全て切れても、待っている質問はそのまま（時間切れまで）。戻って subscribe すると受け取れる", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 5000 }));
    s.asks.onClientGone("b1");
    await settle();
    expect(t.result()).toBeUndefined();
    expect(s.asks.subscriberCount).toBe(0);
    expect(s.asks.subscribe("b2").map((a) => a.askId)).toEqual(["ask1"]);
    s.asks.answer("b2", { askId: "ask1", answers: { a: "y" } });
    expect(await t.done).toMatchObject({ status: "answered" });
  });

  it("subscribe は待っている質問を受けた順に返す", () => {
    const s = setup();
    s.asks.subscribe("b1");
    track(s.asks.open("cli", { paneId: "p2", spec: SPEC, timeoutMs: 1000 }));
    track(s.asks.open("cli2", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    expect(s.asks.subscribe("b2").map((a) => a.paneId)).toEqual(["p2", "p1"]);
  });

  it("dispose: 全ての質問を閉じ、タイマーを残さず、以後の open は unavailable", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 }));
    s.asks.dispose();
    expect(await t.done).toEqual({ status: "cancelled" });
    expect(s.timers.active.size).toBe(0);
    s.asks.subscribe("b2");
    expect(await s.asks.open("cli", { paneId: "p1", spec: SPEC, timeoutMs: 1000 })).toEqual({ status: "unavailable", reason: "the server is shutting down" });
  });

  it("ログに定義・回答の中身を出さない（askId・paneId・件数・結果の種類だけ）", async () => {
    const s = setup();
    s.asks.subscribe("b1");
    const t = track(
      s.asks.open("cli", {
        paneId: "p1",
        spec: { title: "SECRET-TITLE", questions: [{ id: "SECRET-ID", label: "SECRET-LABEL", options: ["SECRET-OPT"], default: "SECRET-OPT" }] },
        timeoutMs: 1000,
      }),
    );
    s.asks.answer("b1", { askId: "ask1", answers: { "SECRET-ID": "SECRET-OPT" }, note: "SECRET-NOTE", comments: { "SECRET-ID": "SECRET-COMMENT" } });
    expect(await t.done).toMatchObject({ comments: { "SECRET-ID": "SECRET-COMMENT" } });
    expect(s.logs.map((l) => l.msg)).toEqual(["ask opened", "ask closed"]);
    expect(JSON.stringify(s.logs)).not.toContain("SECRET");
  });
});
