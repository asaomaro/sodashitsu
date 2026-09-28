import { encodeOutputFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkChannelSocket, UnavailableSocket } from "./linkChannelSocket.js";
import { RemoteLinks, type RemoteLink } from "./RemoteLinks.js";
import { FakeLinkChannel, FakeMachines, remoteSnapshot, settle } from "./fakeLinkChannel.js";

// 20260927-agent-graph の 04 T1：チャネル → WebSocketLike の adapter と、マシンごとの接続。
const M = "a".repeat(32);
const N = "b".repeat(32);

describe("LinkChannelSocket", () => {
  it("作った後のマイクロタスクで開く。TEXT は { 始まりだけ、BINARY は OUTPUT・SNAPSHOT だけを渡す", async () => {
    const ch = new FakeLinkChannel();
    const ws = new LinkChannelSocket(ch);
    const got: unknown[] = [];
    let opened = 0;
    ws.onopen = () => opened++;
    ws.onmessage = (ev) => got.push(ev.data);
    ch.text('{"a":1}'); // 開く前は捨てる
    expect(ws.readyState).toBe(0);
    await Promise.resolve();
    expect(opened).toBe(1);
    expect(ws.readyState).toBe(1);
    ch.text('  {"b":2}');
    ch.text("not json");
    const out = encodeOutputFrame("p1", new Uint8Array([65]));
    ch.binary(out);
    ch.binary(new Uint8Array([FRAME_TYPE.INPUT, 0, 0]));
    ch.binary(new Uint8Array([FRAME_TYPE.OUTPUT])); // 短すぎる
    expect(got).toEqual(['  {"b":2}', out]);
    ws.send("hi");
    expect(ch.sentText).toEqual(["hi"]);
  });

  it("close はチャネルを閉じ、onclose を 1 回だけ呼ぶ。リモートからの close も 1 回。受け手の例外は外へ出さない", async () => {
    const ch = new FakeLinkChannel();
    const errors: unknown[] = [];
    const ws = new LinkChannelSocket(ch, (e) => errors.push(e));
    const closes: number[] = [];
    ws.onclose = (ev) => closes.push(ev.code);
    ws.onmessage = () => {
      throw new Error("boom");
    };
    await Promise.resolve();
    ch.text("{}");
    expect(errors).toHaveLength(1);
    ws.close(1000, "bye");
    ws.close(1000, "again");
    expect(ch.closedWith).toBe(1000);
    expect(closes).toEqual([1000]);
    ws.send("late");
    expect(ch.sentText).toEqual([]);

    const ch2 = new FakeLinkChannel();
    const ws2 = new LinkChannelSocket(ch2);
    const closes2: number[] = [];
    ws2.onclose = (ev) => closes2.push(ev.code);
    let opened = false;
    ws2.onopen = () => (opened = true);
    ch2.remoteClose(1012); // 開く前に閉じた
    await Promise.resolve();
    expect(opened).toBe(false);
    expect(closes2).toEqual([1012]);
  });

  it("UnavailableSocket は開かずにマイクロタスクで閉じる", async () => {
    const ws = new UnavailableSocket();
    const closes: number[] = [];
    ws.onclose = (ev) => closes.push(ev.code);
    let opened = false;
    ws.onopen = () => (opened = true);
    await Promise.resolve();
    expect(closes).toEqual([1013]);
    expect(opened).toBe(false);
  });
});

describe("RemoteLinks", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const fn of cleanups.splice(0)) fn();
    vi.useRealTimers();
  });

  function make(machines: FakeMachines) {
    const links = new RemoteLinks({ machines });
    cleanups.push(() => links.closeAll());
    return links;
  }

  function track(link: RemoteLink) {
    const log: string[] = [];
    link.onOpened((s) => log.push(`opened:${s.panes.length}`));
    link.onClosed(() => log.push("closed"));
    link.onEvent((e) => log.push(`event:${e.event}`));
    link.onScreen((p, t) => log.push(`screen:${p}:${t}`));
    return log;
  }

  it("載っているマシンだけチャネルを開き、external で hello する。hello の後だけ使え、snapshot・イベント・SNAPSHOT を渡す", async () => {
    const machines = new FakeMachines([
      { id: M, label: "box" },
      { id: N, label: "other" },
    ]);
    const links = make(machines);
    links.ensure([M]);
    const link = links.get(M)!;
    const log = track(link);
    await settle();
    expect(machines.channels).toHaveLength(1);
    const ch = machines.last();
    expect(ch.lastRequest("client.hello")!.params).toEqual({ protocol: 1, kind: "external" });
    expect(link.available()).toBe(false);
    ch.event("pane.closed", { paneId: "p9" }); // hello の前のイベントは渡さない（snapshot が含む）
    ch.hello(remoteSnapshot());
    await settle();
    expect(link.available()).toBe(true);
    ch.event("pane.closed", { paneId: "p1" });
    ch.snapshotFrame("p1", "hello");
    expect(log).toEqual(["opened:0", "event:pane.closed", "screen:p1:hello"]);
    expect(links.label(M)).toBe("box");
    expect(links.label("c".repeat(32))).toBe("c".repeat(32));
    expect(links.machineIds()).toEqual([M]);
  });

  it("切れたら使えなくなり、マシンが online になった知らせで待たずに繋ぎ直して新しい snapshot を渡す", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const machines = new FakeMachines([{ id: M, label: "box" }]);
    const links = make(machines);
    links.ensure([M]);
    const link = links.get(M)!;
    const log = track(link);
    await vi.advanceTimersByTimeAsync(0);
    machines.last().hello(remoteSnapshot());
    await vi.advanceTimersByTimeAsync(0);
    expect(link.available()).toBe(true);

    machines.setOnline(M, false);
    machines.last().remoteClose(1012);
    await vi.advanceTimersByTimeAsync(0);
    expect(link.available()).toBe(false);
    expect(log).toEqual(["opened:0", "closed"]);
    // 繋ぎ直しの試み（マシンは offline なので開かない）が続いても、チャネルは増えない
    await vi.advanceTimersByTimeAsync(3000);
    expect(machines.channels).toHaveLength(1);
    await expect(link.request("session.get" as never, {} as never)).rejects.toThrow(
      "not connected",
    );

    machines.setOnline(M, true); // 待ち（倍々）を飛ばす
    await vi.advanceTimersByTimeAsync(0);
    expect(machines.channels).toHaveLength(2);
    machines.last().hello(remoteSnapshot([]), "c2");
    await vi.advanceTimersByTimeAsync(0);
    expect(link.available()).toBe(true);
    expect(log).toEqual(["opened:0", "closed", "opened:0"]);
  });

  it("外れたマシン・closeAll は閉じて繋ぎ直さない。closeAll の後の ensure でまた開ける", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const machines = new FakeMachines([
      { id: M, label: "box" },
      { id: N, label: "other" },
    ]);
    const links = make(machines);
    links.ensure([M, N]);
    await vi.advanceTimersByTimeAsync(0);
    const [chM, chN] = machines.channels as [FakeLinkChannel, FakeLinkChannel];
    chM.hello(remoteSnapshot());
    await vi.advanceTimersByTimeAsync(0);
    const linkM = links.get(M)!;
    const log = track(linkM);
    links.ensure([N]);
    expect(chM.closedWith).toBe(1000);
    expect(linkM.available()).toBe(false);
    expect(log).toEqual(["closed"]);
    expect(links.get(M)).toBeUndefined();
    machines.setOnline(M, true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(machines.channels).toHaveLength(2);

    links.closeAll();
    expect(chN.closedWith).toBe(1000);
    expect(links.machineIds()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(machines.channels).toHaveLength(2);
    links.ensure([M]);
    await vi.advanceTimersByTimeAsync(0);
    expect(machines.channels).toHaveLength(3);
  });

  it("受け手の例外は接続を閉じない（ログだけ）", async () => {
    const machines = new FakeMachines([{ id: M, label: "box" }]);
    const warn = vi.fn();
    const links = new RemoteLinks({ machines, logger: { warn } });
    cleanups.push(() => links.closeAll());
    links.ensure([M]);
    const link = links.get(M)!;
    link.onOpened(() => {
      throw new Error("listener");
    });
    await settle();
    machines.last().hello(remoteSnapshot());
    await settle();
    expect(link.available()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(machines.last().closedWith).toBeNull();
  });
});
