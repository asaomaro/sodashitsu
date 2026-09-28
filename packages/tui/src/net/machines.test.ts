import type { MachineStatus } from "@sodashitsu/protocol";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MachinesModel } from "../model/MachinesModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { FakeSocket } from "../testing/fakeSocket.js";
import { TuiNet } from "./TuiNet.js";
import { startedApp } from "../testing/appHarness.js";
import { agent, leaf, pane, snapshot, tab, workspace } from "../testing/fixtures.js";
import { MachineWiring, type SummaryClientLike } from "./MachineWiring.js";

const box: MachineStatus = { id: "m1", label: "box", state: "online", message: null };

/** 複数ホスト（05 の T4。design「複数ホスト」・AC14）。 */
describe("MachinesModel（web の store/machines.ts と同じ規則）", () => {
  it("選べるのは今のマシンと、軽い接続が繋がっていて online のマシン。一覧から消えたマシンの要約・畳みは捨てる", () => {
    const m = new MachinesModel();
    m.setMachines([box, { ...box, id: "m2", label: "gpu", state: "attention" }]);
    expect(m.sections.map((s) => s.label)).toEqual(["ローカル", "box", "gpu"]);
    expect(m.isSelectable(LOCAL_MACHINE_ID)).toBe(true); // 今のマシン
    expect(m.isSelectable("m1")).toBe(false); // まだ繋がっていない
    m.applySummarySnapshot("m1", snapshot());
    expect(m.isSelectable("m1")).toBe(true);
    m.applySummarySnapshot("m2", snapshot());
    expect(m.isSelectable("m2")).toBe(false); // attention
    m.toggleCollapsed("m2");
    m.setMachines([box]);
    expect(m.summaries["m2"]).toBeUndefined();
    expect(m.collapsed["m2"]).toBeUndefined();
    m.setMachines(undefined as never);
    expect(m.machines).toEqual([]);
  });

  it("要約のイベント：workspace・tab・pane・エージェントの状態を追う", () => {
    const m = new MachinesModel();
    m.applySummarySnapshot("m1", snapshot());
    m.applySummaryEvent("m1", {
      event: "pane.agent_status_changed",
      data: { paneId: "p3", agent: agent({ state: "blocked" }) },
    } as never);
    expect(m.agentsInWorkspace("m1", "w2").map((a) => a.state)).toEqual(["blocked"]);
    m.applySummaryEvent("m1", { event: "workspace.closed", data: { workspaceId: "w2" } } as never);
    expect(m.summaries["m1"]!.workspaces.map((w) => w.id)).toEqual(["w1"]);
  });
});

describe("MachineWiring（web の actions/MachineWiring.ts と同じ）", () => {
  function setup() {
    const machines = new MachinesModel();
    const clients: {
      url: string;
      opts: Parameters<ConstructorParameters<typeof MachineWiring>[0]["createSummaryClient"]>[0];
      stopped: boolean;
    }[] = [];
    const switched: [string, unknown, unknown][] = [];
    const w = new MachineWiring({
      machines,
      switchTo: (id, t, o) => {
        switched.push([id, t, o]);
        machines.select(id);
      },
      requestMainList: () => Promise.resolve({ machines: [box] }),
      createSummaryClient: (opts): SummaryClientLike => {
        const c = { url: opts.wsUrl, opts, stopped: false };
        clients.push(c);
        return {
          start: () => undefined,
          stop: () => {
            c.stopped = true;
          },
          request: (() => Promise.resolve({ machines: [box] })) as SummaryClientLike["request"],
        };
      },
      baseWsUrl: "ws://127.0.0.1:9/ws",
    });
    return { machines, clients, switched, w };
  }

  it("一覧を受けたら、選んでいないマシンごとに要約の接続を開き、今のマシンが消えたらローカルへ戻す", async () => {
    const s = setup();
    s.w.onMainOpened();
    await vi.waitFor(() => expect(s.machines.machines).toEqual([box]));
    expect(s.clients.map((c) => c.url)).toEqual(["ws://127.0.0.1:9/ws?machine=m1"]);
    // m1 へ切り替えると、ローカルの要約の接続を開き m1 のは閉じる。
    s.machines.select("m1");
    s.w.reconcileSummaryClients();
    expect(s.clients[0]!.stopped).toBe(true);
    expect(s.clients[1]!.url).toBe("ws://127.0.0.1:9/ws");
    // ローカルの軽い接続の machine.changed で m1 が消えた → ローカルへ戻す。
    s.clients[1]!.opts.onEvent({ event: "machine.changed", data: { machines: [] } } as never);
    expect(s.switched).toEqual([[LOCAL_MACHINE_ID, undefined, { force: true }]]);
  });
});

describe("端末版の複数ホスト（組み立て）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("サイドバーにマシンの見出しと別のマシンの workspace。押すとそのマシンへ切り替え（?machine=）、選んだ workspace へ移る", async () => {
    const h = await startedApp({ respond: { "machine.list": { machines: [box] } } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.app.machines.machines).toEqual([box]));
    // 要約の接続（?machine=m1）が開く。hello に m1 のスナップショットで答える。
    await vi.waitFor(() => expect(h.sockets.some((s) => s.url.includes("machine=m1"))).toBe(true));
    const summary = h.sockets.find((s) => s.url.includes("machine=m1"))!;
    summary.open();
    const remote = snapshot({
      workspaces: [workspace("rw1", ["rt1"], { label: "remote-ws" })],
      tabs: [tab("rt1", "rw1", leaf("rp1"))],
      panes: [pane("rp1", "rt1")],
      focus: null,
    });
    await vi.waitFor(() => expect(summary.requests("client.hello")).toHaveLength(1));
    summary.reply({ clientId: "s1", snapshot: remote });
    await vi.waitFor(() => expect(h.app.machines.summaries["m1"]?.connected).toBe(true));
    h.app.renderNow();
    let text = await h.screen();
    expect(text).toContain("ローカル");
    expect(text).toContain("box");
    expect(text).toContain("remote-ws");
    // 別のマシンの workspace の行を押す。
    const hits = (
      h.app as unknown as { sidebarHits: { kind: string; y: number; workspaceId?: string }[] }
    ).sidebarHits;
    const row = hits.find((x) => x.kind === "machineWorkspace" && x.workspaceId === "rw1")!;
    h.io.type(`\x1b[<0;6;${row.y + 1}M\x1b[<0;6;${row.y + 1}m`);
    expect(h.app.machines.selectedId).toBe("m1");
    // 画面の接続が ?machine=m1 へ開き直す。
    await vi.waitFor(() =>
      expect(h.sockets.filter((s) => s.url.endsWith("/ws?machine=m1")).length).toBe(2),
    );
    const main = h.sockets.filter((s) => s.url.endsWith("/ws?machine=m1"))[1]!;
    main.open();
    await vi.waitFor(() => expect(main.requests("client.hello")).toHaveLength(1));
    main.reply({ clientId: "c2", snapshot: remote });
    await vi.waitFor(() => expect(h.app.model.workspaceId).toBe("rw1"));
    h.app.renderNow();
    text = await h.screen();
    expect(text).toContain("remote-ws");
    // 今のマシンの stop_server は box の名前で（別のマシン。web と同じ）。
    (h.app as unknown as { dispatcher: { run(a: unknown): void } }).dispatcher.run({
      type: "stopServer",
    });
    expect(h.app.ui.dialogContext).toEqual({
      kind: "confirmStopServer",
      target: "box",
      remote: true,
    });
  });

  it("マシンの見出しの ▸/▾ で畳む（M10）。繋がっていないマシンへは切り替えずに知らせる", async () => {
    const h = await startedApp({ respond: { "machine.list": { machines: [box] } } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.app.machines.machines).toEqual([box]));
    h.app.renderNow();
    const hits = () =>
      (
        h.app as unknown as {
          sidebarHits: { kind: string; y: number; machineId?: string; toggleX?: number }[];
        }
      ).sidebarHits;
    const header = hits().find((x) => x.kind === "machine" && x.machineId === "m1")!;
    h.io.type(
      `\x1b[<0;${header.toggleX! + 1};${header.y + 1}M\x1b[<0;${header.toggleX! + 1};${header.y + 1}m`,
    );
    expect(h.app.machines.collapsed["m1"]).toBe(true);
    h.io.type(`\x1b[<0;10;${header.y + 1}M\x1b[<0;10;${header.y + 1}m`);
    expect(h.app.machines.selectedId).toBe(LOCAL_MACHINE_ID);
    expect(h.app.ui.toasts.map((t) => t.message)).toEqual([
      "box には今は切り替えられません（繋がっていません）",
    ]);
  });
});

describe("複数ホストの点検の指摘（05 T4）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  /** m1 へ切り替えた状態（画面の接続は m1、ローカルの軽い接続が開いている）。 */
  async function onRemote() {
    const h = await startedApp({ respond: { "machine.list": { machines: [box] } } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.sockets.some((s) => s.url.includes("machine=m1"))).toBe(true));
    const summary = h.sockets.find((s) => s.url.includes("machine=m1"))!;
    summary.open();
    await vi.waitFor(() => expect(summary.requests("client.hello")).toHaveLength(1));
    const remote = snapshot({
      workspaces: [workspace("rw1", ["rt1"], { label: "remote-ws" })],
      tabs: [tab("rt1", "rw1", leaf("rp1"))],
      panes: [pane("rp1", "rt1")],
      focus: null,
    });
    summary.reply({ clientId: "s1", snapshot: remote });
    await vi.waitFor(() => expect(h.app.machines.summaries["m1"]?.connected).toBe(true));
    h.io.type("\x02w"); // navigate モードのまま切り替える
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
    h.app.switchMachine("m1", { workspaceId: "rw1", tabId: "rt1" });
    expect(h.app.keys.mode).toBe("terminal"); // キーのモードは戻す（web の resetView）
    await vi.waitFor(() =>
      expect(h.sockets.filter((s) => s.url.endsWith("/ws?machine=m1")).length).toBe(2),
    );
    const main = h.sockets.filter((s) => s.url.endsWith("/ws?machine=m1"))[1]!;
    main.open();
    await vi.waitFor(() => expect(main.requests("client.hello")).toHaveLength(1));
    main.reply({ clientId: "c2", snapshot: remote });
    await vi.waitFor(() => expect(h.app.model.workspaceId).toBe("rw1"));
    // ローカルの軽い接続（?machine なしの 2 本目）。
    await vi.waitFor(() => expect(h.sockets.filter((s) => s.url.endsWith("/ws")).length).toBe(2));
    const local = h.sockets.filter((s) => s.url.endsWith("/ws"))[1]!;
    return { h, main, local };
  }

  it("ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）", async () => {
    const { h, main, local } = await onRemote();
    expect(main.requests("prefs.get")).toEqual([]);
    local.open();
    await vi.waitFor(() => expect(local.requests("client.hello")).toHaveLength(1));
    local.reply({ clientId: "s2", snapshot: snapshot() });
    await vi.waitFor(() => expect(local.requests("prefs.get")).toHaveLength(1));
    const get = local.requests("prefs.get")[0]!;
    local.onmessage?.({
      data: JSON.stringify({ id: get.id, result: { prefs: { theme: "nord" }, rev: 3 } }),
    });
    await vi.waitFor(() => expect(h.app.prefs.theme).toBe("nord"));
    // 遠くのサーバの prefs.changed は当てない。ローカルの軽い接続のものは当てる。
    main.event("prefs.changed", { prefs: { theme: "vesper" }, rev: 9, byClientId: "x" });
    expect(h.app.prefs.theme).toBe("nord");
    local.event("prefs.changed", { prefs: { theme: "gruvbox" }, rev: 4, byClientId: "x" });
    expect(h.app.prefs.theme).toBe("gruvbox");
    // 書き込み・読み直し（reload_config）もローカルへ。
    (
      h.app as unknown as { dispatcher: { toggleWorkspaceSort(): void; run(a: unknown): void } }
    ).dispatcher.toggleWorkspaceSort();
    expect(local.requests("prefs.set")).toHaveLength(1);
    expect(main.requests("prefs.set")).toEqual([]);
    (h.app as unknown as { dispatcher: { run(a: unknown): void } }).dispatcher.run({
      type: "reloadConfig",
    });
    expect(local.requests("prefs.get")).toHaveLength(2);
    expect(main.requests("prefs.get")).toEqual([]);
  });
});

describe("既読はマシンごと（05 T4）", () => {
  it("切り替えた先のマシンの同じ id のエージェントに、前のマシンの既読を当てない。戻れば前の既読", () => {
    const model = new SessionModel();
    const snap = snapshot({
      panes: [
        pane("p1", "t1", {
          agent: agent({ instanceId: "same", completionSeq: 2, serverSeenSeq: 0 }),
        }),
        pane("p2", "t1"),
      ],
    });
    model.applySnapshot(snap, "c1");
    model.sweepSeen((id) => id === "p1", true);
    expect(model.displayStateOf(model.panes.get("p1")!)).not.toBe("done");
    model.reset("m1");
    model.applySnapshot(snap, "c2");
    expect(model.displayStateOf(model.panes.get("p1")!)).toBe("done");
    model.reset(LOCAL_MACHINE_ID);
    model.applySnapshot(snap, "c3");
    expect(model.displayStateOf(model.panes.get("p1")!)).not.toBe("done");
  });
});

describe("要約の接続の socket（05 T4）", () => {
  it("4401 で閉じたら cookie を取り直す。作るときに投げたらすぐ閉じる socket を返す", async () => {
    const logins: number[] = [];
    let fail = false;
    const net = new TuiNet(
      {
        baseUrl: "http://127.0.0.1:9",
        origin: "http://127.0.0.1:9",
        login: async () => {
          logins.push(1);
          return `sid=${logins.length}`;
        },
        stateDir: "/x",
      },
      {
        model: new SessionModel(),
        sink: {
          onOutput: () => undefined,
          onSnapshot: () => undefined,
          onSizeChanged: () => undefined,
        },
        onState: () => undefined,
        onOpened: () => undefined,
        onClosed: () => undefined,
        onFatal: () => undefined,
      },
      {
        createWebSocket: (ep) => (url) => {
          if (fail) throw new Error("certificate mismatch");
          return new FakeSocket(url, ep.cookie());
        },
        fetchImpl: () => async () => new Response(null, { status: 204 }),
      },
    );
    const ws = net.createSocket("ws://127.0.0.1:9/ws?machine=m1");
    const closes: number[] = [];
    ws.onclose = (ev) => closes.push(ev.code);
    (ws as unknown as FakeSocket).close(4401);
    expect(closes).toEqual([4401]);
    await vi.waitFor(() => expect(logins).toHaveLength(1));
    fail = true;
    const dead = net.createSocket("ws://127.0.0.1:9/ws?machine=m1");
    const deadCloses: number[] = [];
    dead.onclose = (ev) => deadCloses.push(ev.code);
    await vi.waitFor(() => expect(deadCloses).toEqual([1006]));
  });
});
