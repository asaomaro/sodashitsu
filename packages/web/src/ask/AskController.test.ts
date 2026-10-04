import type { AskPending, MethodName } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAskStore } from "../store/ask.js";
import { AskController } from "./AskController.js";

const ask = (askId: string, paneId = "p1"): AskPending => ({ askId, paneId, spec: { title: "T", submit: "決定", note: true, questions: [] } });
const code = (c: string): Error => Object.assign(new Error(`${c}: x`), { code: c });
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(handlers: Partial<Record<MethodName, (params: unknown) => unknown>> = {}) {
  setActivePinia(createPinia());
  const store = useAskStore();
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
  const ctl = new AskController({ conn, store, toast: (m) => void toasts.push(m) });
  return { ctl, store, calls, toasts };
}

describe("AskController", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("onOpened: ask.subscribe の応答で待っている質問を置き換える（再接続・再読み込みの出し直し）", async () => {
    const s = setup({ "ask.subscribe": () => ({ asks: [ask("a"), ask("b")] }) });
    s.store.add(ask("old"));
    s.ctl.onOpened();
    await settle();
    expect(s.calls).toEqual([["ask.subscribe", {}]]);
    expect(s.store.queue.map((q) => q.askId)).toEqual(["a", "b"]);
  });
  it("古いサーバ（ask.subscribe が not_found）では黙って何もしない", async () => {
    const s = setup({ "ask.subscribe": () => code("not_found") });
    s.ctl.onOpened();
    await settle();
    expect(s.store.queue).toEqual([]);
    expect(s.toasts).toEqual([]);
  });
  it("ask.opened（id だけ）→ ask.get で定義を取って足す。ask.closed で外す。取りに行く間に閉じた（ask_closed）は無視", async () => {
    const s = setup({ "ask.get": (p) => ((p as { askId: string }).askId === "gone" ? code("ask_closed") : ask((p as { askId: string }).askId)) });
    s.ctl.onEvent({ event: "ask.opened", data: { askId: "a", paneId: "p1" } });
    s.ctl.onEvent({ event: "ask.opened", data: { askId: "gone", paneId: "p2" } });
    await settle();
    expect(s.store.queue.map((q) => q.askId)).toEqual(["a"]);
    s.ctl.onEvent({ event: "ask.closed", data: { askId: "a", paneId: "p1" } });
    expect(s.store.queue).toEqual([]);
  });
  it("onClosed・マシンの切り替えで空にし、その前に始めた要求の応答を捨てる", async () => {
    let release!: (v: unknown) => void;
    const s = setup({ "ask.get": () => new Promise((r) => (release = r)) as never });
    s.ctl.onEvent({ event: "ask.opened", data: { askId: "a", paneId: "p1" } });
    s.ctl.resetForMachineSwitch();
    release(ask("a"));
    await settle();
    expect(s.store.queue).toEqual([]);
    s.store.add(ask("x"));
    s.ctl.onClosed();
    expect(s.store.queue).toEqual([]);
  });
  it("onOpened の応答が、後の onClosed の後に届いても置き換えない", async () => {
    let release!: (v: unknown) => void;
    const s = setup({ "ask.subscribe": () => new Promise((r) => (release = r)) as never });
    s.ctl.onOpened();
    s.ctl.onClosed();
    release({ asks: [ask("late")] });
    await settle();
    expect(s.store.queue).toEqual([]);
  });
  it("answer: 送って成功したら外す", async () => {
    const s = setup();
    s.store.add(ask("a"));
    expect(await s.ctl.answer("a", { answers: { q: "x" }, custom: ["q"], note: "n" })).toBe(true);
    expect(s.calls).toEqual([["ask.answer", { askId: "a", answers: { q: "x" }, custom: ["q"], note: "n" }]]);
    expect(s.store.queue).toEqual([]);
  });
  it("answer: ask_closed は知らせて外す。ほかの失敗は知らせて開いたまま（false）", async () => {
    const closed = setup({ "ask.answer": () => code("ask_closed") });
    closed.store.add(ask("a"));
    expect(await closed.ctl.answer("a", { answers: {} })).toBe(true);
    expect(closed.store.queue).toEqual([]);
    expect(closed.toasts).toEqual(["この質問は既に閉じられました（ほかの画面で答えたか、時間切れです）"]);

    const bad = setup({ "ask.answer": () => code("invalid_params") });
    bad.store.add(ask("a"));
    expect(await bad.ctl.answer("a", { answers: {} })).toBe(false);
    expect(bad.store.queue).toHaveLength(1);
    expect(bad.toasts).toHaveLength(1);
  });
  it("cancel: 外す。ask_closed は知らせない。ほかの失敗は知らせて、それでも外す（画面を塞がない）", async () => {
    const ok = setup();
    ok.store.add(ask("a"));
    await ok.ctl.cancel("a");
    expect(ok.calls).toEqual([["ask.cancel", { askId: "a" }]]);
    expect(ok.store.queue).toEqual([]);
    const closed = setup({ "ask.cancel": () => code("ask_closed") });
    closed.store.add(ask("a"));
    await closed.ctl.cancel("a");
    expect(closed.toasts).toEqual([]);
    const fail = setup({ "ask.cancel": () => new Error("boom") });
    fail.store.add(ask("a"));
    await fail.ctl.cancel("a");
    expect(fail.toasts).toEqual(["質問を取り消せませんでした"]);
    expect(fail.store.queue).toEqual([]);
  });
});

describe("AskController — メディア（20261004-ask-media-popup）", () => {
  const withMedia = (askId: string, extra: Partial<AskPending> = {}): AskPending => ({
    ...ask(askId),
    media: [{ id: 0, kind: "image", mime: "image/png", bytes: 2 }],
    ...extra,
  });
  const mediaOk = (): unknown => ({ base64: btoa("ab"), size: 2, eof: true });

  it("ask.opened → ask.get の後に ask.media で取り、取り終えてから store に足す（resolved に data: の URL）", async () => {
    const s = setup({ "ask.get": () => withMedia("m1"), "ask.media": mediaOk });
    s.ctl.onEvent({ event: "ask.opened", data: { askId: "m1", paneId: "p1" } });
    expect(s.store.queue).toEqual([]); // まだ（取っている最中は出さない）
    await settle();
    expect(s.calls.map((c) => c[0])).toEqual(["ask.get", "ask.media"]);
    expect(s.store.queue[0]!.resolved).toEqual({ urls: { "media:0": `data:image/png;base64,${btoa("ab")}` }, views: [] });
  });

  it("ask.subscribe の応答も、メディアを取り終えてから置き換える。メディアの無い質問は resolved を持たない", async () => {
    const s = setup({ "ask.subscribe": () => ({ asks: [withMedia("m1"), ask("plain")] }), "ask.media": mediaOk });
    s.ctl.onOpened();
    await settle();
    expect(s.store.queue.map((q) => q.askId)).toEqual(["m1", "plain"]);
    expect(s.store.queue[0]!.resolved).toBeDefined();
    expect(s.store.queue[1]).not.toHaveProperty("resolved");
  });

  it("画像が取れなくても質問は出る（参照なし）。成果物が取れなければ、トーストして取り消す（見ないまま答えさせない）", async () => {
    const noImage = setup({ "ask.get": () => withMedia("m1"), "ask.media": () => code("internal") });
    noImage.ctl.onEvent({ event: "ask.opened", data: { askId: "m1", paneId: "p1" } });
    await settle();
    expect(noImage.store.queue[0]!.resolved).toEqual({ urls: {}, views: [] });
    const noView = setup({
      "ask.get": () => withMedia("v1", { media: [{ id: 0, kind: "markdown", mime: "text/markdown", bytes: 2 }], view: [{ title: "t", kind: "markdown", media: 0 }] }),
      "ask.media": () => code("internal"),
    });
    noView.ctl.onEvent({ event: "ask.opened", data: { askId: "v1", paneId: "p1" } });
    await settle();
    expect(noView.store.queue).toEqual([]);
    expect(noView.toasts).toEqual(["成果物を読み込めませんでした（質問は取り消しました）"]);
    expect(noView.calls.map((c) => c[0])).toContain("ask.cancel");
  });

  it("メディアを取っている間に ask.closed・切断・マシンの切り替えが来たら、足さない", async () => {
    for (const interrupt of [(s: ReturnType<typeof setup>) => s.ctl.onClosed(), (s: ReturnType<typeof setup>) => s.ctl.resetForMachineSwitch()]) {
      let release!: (v: unknown) => void;
      const s = setup({ "ask.get": () => withMedia("m1"), "ask.media": () => new Promise((r) => (release = r)) as never });
      s.ctl.onEvent({ event: "ask.opened", data: { askId: "m1", paneId: "p1" } });
      await settle();
      interrupt(s);
      release(mediaOk());
      await settle();
      expect(s.store.queue).toEqual([]);
    }
  });
});

