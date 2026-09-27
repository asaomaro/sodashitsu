import type { MachineStatus } from "@sodashitsu/protocol";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MachinesModel } from "../model/MachinesModel.js";
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
          request: () => Promise.resolve({ machines: [box] }),
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
