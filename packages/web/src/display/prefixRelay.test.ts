import { DEFAULT_KEYMAP, type Action } from "@sodashitsu/client-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardRelayRun, PrefixRelay, RELAY_ACTION_MAX, RELAY_ALLOWED_ACTIONS, RELAY_MESSAGE_MAX, RELAY_WINDOW_MS, readRelayKey, type RelayKey } from "./prefixRelay.js";

const k = (key: string, over: Partial<RelayKey> = {}): RelayKey => ({ key, code: "", ctrl: false, alt: false, shift: false, meta: false, ...over });

function setup() {
  const run = vi.fn<(a: Action) => void>();
  const relay = new PrefixRelay({ keymap: () => DEFAULT_KEYMAP, run });
  return { run, relay };
}

describe("PrefixRelay（アプリのメイン画面の prefix の中継）", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("許可する操作: prefix+n／p（タブの次・前）・prefix+3（番号）", () => {
    const { run, relay } = setup();
    expect(relay.start()).toBe(true);
    expect(relay.key(k("n"))).toBe(false);
    relay.start();
    relay.key(k("p"));
    relay.start();
    relay.key(k("3"));
    expect(run.mock.calls.map((c) => c[0])).toEqual([
      { type: "tabDelta", delta: 1 },
      { type: "tabDelta", delta: -1 },
      { type: "tabIndex", index: 3 },
    ]);
  });

  it("ワークスペースの切り替え: prefix+u のあとの番号（待ちが続く）", () => {
    const { run, relay } = setup();
    relay.start();
    expect(relay.key(k("u"))).toBe(true); // 番号を待つ
    expect(relay.key(k("2"))).toBe(false);
    expect(run).toHaveBeenCalledExactlyOnceWith({ type: "workspaceIndex", index: 2 });
  });

  // 負の対照: 許可表に無い操作は、prefix を中継されても実行しない（閉じる・分割・新規・モード・番号の pane/agent・prefix の二度押し）。
  it.each([
    ["タブを閉じる（prefix+shift+x）", k("X", { shift: true })],
    ["ワークスペースを閉じる（prefix+shift+d）", k("D", { shift: true })],
    ["分割（prefix+v）", k("v")],
    ["pane を閉じる（prefix+x）", k("x")],
    ["新規タブ（prefix+c）", k("c")],
    ["設定（prefix+s）", k("s")],
    ["サーバ停止・終了系（prefix+q 等の未割り当ても含め）", k("q")],
    ["navigate モード（prefix+w）", k("w")],
    ["prefix の二度押し（端末へ送る列）", k("b", { ctrl: true })],
    ["未割り当てのキー", k("F13")],
  ])("受けない操作: %s", (_name, input) => {
    const { run, relay } = setup();
    relay.start();
    relay.key(input);
    expect(run).not.toHaveBeenCalled();
    expect(relay.pending).toBe(false); // 専用の router が prefix 以外に居残らない
  });

  it("番号の pane／agent（prefix+f／d のあとの番号）は受けない", () => {
    const { run, relay } = setup();
    relay.start();
    expect(relay.key(k("f"))).toBe(true);
    relay.key(k("1"));
    relay.start();
    relay.key(k("d"));
    relay.key(k("1"));
    expect(run).not.toHaveBeenCalled();
  });

  it("許可表は、タブとワークスペースを切り替える 4 つだけ", () => {
    expect([...RELAY_ALLOWED_ACTIONS].sort()).toEqual(["tabDelta", "tabIndex", "workspaceDelta", "workspaceIndex"]);
  });

  // 偽った知らせ: prefix の知らせなしにキーだけが来ても何も起きない（直接のキーとして解釈させない）。
  it("prefix の知らせ無しに届いたキーは捨てる", () => {
    const { run, relay } = setup();
    expect(relay.key(k("n"))).toBe(false);
    expect(run).not.toHaveBeenCalled();
    relay.start();
    relay.key(k("n")); // 1 回で待ちは終わる
    run.mockClear();
    relay.key(k("n"));
    expect(run).not.toHaveBeenCalled();
  });

  it("実物の KeyRouter の直接のキー（prefix 無しの操作）は呼べない", () => {
    const { run, relay } = setup();
    relay.key(k("v", { ctrl: true, alt: true })); // 直接のキーに割り当てがあっても、待ちでなければ捨てる
    expect(run).not.toHaveBeenCalled();
  });

  it("待ちは 3 秒で終わる", () => {
    const { run, relay } = setup();
    relay.start();
    vi.advanceTimersByTime(3100);
    expect(relay.pending).toBe(false);
    relay.key(k("n"));
    expect(run).not.toHaveBeenCalled();
  });

  it("送りすぎ: 1 秒に実行する操作は上限まで", () => {
    const { run, relay } = setup();
    for (let i = 0; i < RELAY_ACTION_MAX + 5; i++) {
      relay.start();
      relay.key(k("n"));
    }
    expect(run).toHaveBeenCalledTimes(RELAY_ACTION_MAX);
    vi.advanceTimersByTime(RELAY_WINDOW_MS);
    relay.start();
    relay.key(k("n"));
    expect(run).toHaveBeenCalledTimes(RELAY_ACTION_MAX + 1);
  });

  it("送りすぎ: 1 秒に受ける知らせは上限まで（超えた key は捨てる）", () => {
    const { run, relay } = setup();
    relay.start();
    for (let i = 0; i < RELAY_MESSAGE_MAX; i++) relay.start(); // 窓の知らせの数を使い切る
    relay.key(k("n"));
    expect(run).not.toHaveBeenCalled();
  });
});

describe("readRelayKey（枠からの知らせの検査）", () => {
  it("正しい形は読む", () => {
    expect(readRelayKey({ key: "n", code: "KeyN", ctrl: false, alt: false, shift: false, meta: false })).toEqual(k("n", { code: "KeyN" }));
    expect(readRelayKey({ key: "n", code: "", ctrl: false, alt: false, shift: false, meta: false })).not.toBeNull();
  });
  it.each([
    ["null", null],
    ["配列", []],
    ["key が空", { key: "", code: "", ctrl: false, alt: false, shift: false, meta: false }],
    ["key が長い", { key: "x".repeat(33), code: "", ctrl: false, alt: false, shift: false, meta: false }],
    ["key が文字列でない", { key: 1, code: "", ctrl: false, alt: false, shift: false, meta: false }],
    ["修飾が真偽でない", { key: "n", code: "", ctrl: "yes", alt: false, shift: false, meta: false }],
    ["code が欠ける", { key: "n", ctrl: false, alt: false, shift: false, meta: false }],
  ])("捨てる: %s", (_n, v) => {
    expect(readRelayKey(v)).toBeNull();
  });
});

describe("guardRelayRun（ダイアログが開いている間は中継の操作を実行しない）", () => {
  it("ダイアログが開いていれば run を呼ばず、閉じれば呼ぶ", () => {
    const run = vi.fn<(a: Action) => void>();
    let blocked = true;
    const guarded = guardRelayRun(() => blocked, run);
    guarded({ type: "tabDelta", delta: 1 });
    expect(run).not.toHaveBeenCalled();
    blocked = false;
    guarded({ type: "tabDelta", delta: 1 });
    expect(run).toHaveBeenCalledExactlyOnceWith({ type: "tabDelta", delta: 1 });
  });
});
