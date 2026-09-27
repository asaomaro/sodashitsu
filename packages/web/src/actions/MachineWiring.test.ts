import type { MachineStatus, SessionSnapshot } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { trackMediaQuery } from "../mobile/detect.js";
import type { MachineSummaryClientOptions } from "@sodashitsu/client-core";
import { useMachinesStore } from "../store/machines.js";
import { MachineWiring, type SummaryClientLike } from "./MachineWiring.js";

/** ブラウザの配線（20260927-multi-host-machines の T13。`main.ts` から判断を切り出したもの）。 */
const B = "b".repeat(32);
const C = "c".repeat(32);
const online = (id: string, label = id): MachineStatus => ({
  id,
  label,
  state: "online",
  message: null,
});
const snap = (): SessionSnapshot => ({
  protocol: 1,
  serverVersion: "t",
  host: { os: "linux", windowsBuild: null, hostname: "h" },
  workspaces: [],
  tabs: [],
  panes: [],
  groups: [],
  focus: null,
  limits: { scrollbackLines: 5000 },
});

function setup(opts: { enabled?: boolean; mainList?: MachineStatus[] } = {}) {
  setActivePinia(createPinia());
  const machines = useMachinesStore();
  const mobile = ref(!(opts.enabled ?? true));
  const switchTo = vi.fn(async (id: string) => {
    machines.select(id);
    return true;
  });
  const created: {
    opts: MachineSummaryClientOptions;
    client: SummaryClientLike & { started: number; stopped: number };
  }[] = [];
  const requestMainList = vi.fn(async () => ({ machines: opts.mainList ?? [] }));
  const wiring = new MachineWiring({
    machines,
    switcher: { switchTo },
    requestMainList,
    createSummaryClient: (o) => {
      const client = {
        started: 0,
        stopped: 0,
        start() {
          this.started++;
        },
        stop() {
          this.stopped++;
        },
        request: vi.fn(async () => ({ machines: [online(B, "GPU")] })),
      };
      created.push({ opts: o, client });
      return client;
    },
    baseWsUrl: "ws://h/ws",
    mobileViewport: mobile,
  });
  return {
    wiring,
    machines,
    switchTo,
    created,
    requestMainList,
    setEnabled: (v: boolean) => (mobile.value = !v),
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("MachineWiring（T13）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("デスクトップでローカルを向いていれば、画面の接続が開くたびに一覧を読んで当てる（機能が有効）", async () => {
    const t = setup({ mainList: [online(B, "GPU")] });
    t.wiring.onMainOpened();
    await flush();
    expect(t.requestMainList).toHaveBeenCalledTimes(1);
    expect(t.machines.machines.map((m) => m.label)).toEqual(["GPU"]);
    expect(t.machines.hasMachines).toBe(true);
  });

  it("1 列の画面・リモートを向いているときは一覧を読まない", async () => {
    const t = setup({ enabled: false });
    t.wiring.onMainOpened();
    const u = setup();
    u.machines.select(B);
    u.wiring.onMainOpened();
    await flush();
    expect(t.requestMainList).not.toHaveBeenCalled();
    expect(u.requestMainList).not.toHaveBeenCalled();
  });

  it("軽い接続は選んでいないマシンにだけ（有効なマシンが無ければ張らない）。選んだら閉じて要約を捨てる", () => {
    const t = setup();
    t.wiring.reconcileSummaryClients();
    expect(t.created).toHaveLength(0); // マシンが無い（AC15）
    t.wiring.applyMachineList([online(B, "GPU"), online(C, "Build")]);
    t.wiring.reconcileSummaryClients();
    expect(t.wiring.summaryClientIds()).toEqual([B, C]); // ローカルは選んでいる
    expect(t.created.map((c) => c.opts.wsUrl)).toEqual([
      `ws://h/ws?machine=${B}`,
      `ws://h/ws?machine=${C}`,
    ]);
    expect(t.created.every((c) => c.client.started === 1)).toBe(true);
    t.machines.applySummarySnapshot(B, snap());
    t.machines.select(B);
    t.wiring.reconcileSummaryClients();
    expect(t.wiring.summaryClientIds().sort()).toEqual([C, "local"].sort());
    expect(t.created[0]!.client.stopped).toBe(1);
    expect(t.machines.summaries[B]).toBeUndefined();
  });

  it("ローカルの軽い接続の machine.changed は、ほかのマシンを選んでいる間だけ当てる。ほかのマシンの machine.changed は捨てる", () => {
    const t = setup();
    t.wiring.applyMachineList([online(B, "GPU"), online(C, "Build")]);
    t.machines.select(B);
    t.wiring.reconcileSummaryClients();
    const local = t.created.find((c) => c.opts.wsUrl === "ws://h/ws")!;
    const other = t.created.find((c) => c.opts.wsUrl.endsWith(C))!;
    other.opts.onEvent({ event: "machine.changed", data: { machines: [] } });
    expect(t.machines.machines).toHaveLength(2);
    local.opts.onEvent({
      event: "machine.changed",
      data: { machines: [online(B, "GPU"), online(C, "Renamed")] },
    });
    expect(t.machines.machines.map((m) => m.label)).toEqual(["GPU", "Renamed"]);
  });

  it("画面の接続の machine.changed はローカルを向いているときだけ当てる", () => {
    const t = setup();
    t.wiring.onMainMachinesChanged([online(B, "GPU")]);
    expect(t.machines.machines).toHaveLength(1);
    t.machines.select(B);
    t.wiring.onMainMachinesChanged([]); // リモートの登録簿
    expect(t.machines.machines).toHaveLength(1);
  });

  it("選んでいるマシンが一覧から消えたら、切れていてもローカルへ戻る", () => {
    const t = setup();
    t.wiring.applyMachineList([online(B, "GPU")]);
    t.machines.select(B);
    t.wiring.applyMachineList([]);
    expect(t.switchTo).toHaveBeenCalledWith("local", undefined, { force: true });
  });

  it("1 列の画面になったらローカルへ戻り一覧を空にして軽い接続を閉じる。広げたら一覧を読み直す", async () => {
    const t = setup({ mainList: [online(B, "GPU")] });
    t.wiring.applyMachineList([online(B, "GPU")]);
    t.wiring.reconcileSummaryClients();
    t.machines.select(B);
    t.setEnabled(false);
    t.wiring.onMobileChanged(true);
    expect(t.switchTo).toHaveBeenCalledWith("local", undefined, { force: true });
    expect(t.machines.machines).toEqual([]);
    expect(t.wiring.summaryClientIds()).toEqual([]);
    t.setEnabled(true);
    t.wiring.onMobileChanged(false);
    await flush();
    expect(t.requestMainList).toHaveBeenCalled();
    expect(t.machines.machines.map((m) => m.label)).toEqual(["GPU"]);
  });

  it("1 列の画面かは media query の一致を追う（起動の後に窓の幅が変わっても）", () => {
    const listeners: ((ev: { matches: boolean }) => void)[] = [];
    const query = {
      matches: false,
      addEventListener: (_t: string, cb: (ev: { matches: boolean }) => void) => listeners.push(cb),
    };
    const mobile = trackMediaQuery(query as unknown as MediaQueryList);
    expect(mobile.value).toBe(false);
    for (const cb of listeners) cb({ matches: true });
    expect(mobile.value).toBe(true);
  });
});
