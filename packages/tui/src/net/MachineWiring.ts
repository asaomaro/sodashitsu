import type {
  MachineStatus,
  MethodName,
  ParamsOf,
  ResultOf,
  SharedPrefs,
} from "@sodashitsu/protocol";
import {
  LOCAL_MACHINE_ID,
  wsUrlFor,
  type MachineSummaryClientOptions,
} from "@sodashitsu/client-core";
import type { MachinesModel } from "../model/MachinesModel.js";

export interface SummaryClientLike {
  start(): void;
  stop(): void;
  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
}

export interface SwitchTarget {
  workspaceId: string;
  tabId: string;
}

export interface MachineWiringDeps {
  machines: MachinesModel;
  /** マシンを切り替える（`force` は選べなくても——一覧から今のマシンが消えたとき）。 */
  switchTo(id: string, target?: SwitchTarget, opts?: { force?: boolean }): void;
  /** 画面の接続での `machine.list`（手元のサーバ）。 */
  requestMainList(): Promise<{ machines: MachineStatus[] }>;
  createSummaryClient(opts: MachineSummaryClientOptions): SummaryClientLike;
  /** 手元の `soda serve` の `/ws`。 */
  baseWsUrl: string;
  /** ほかのマシンを見ている間に、ローカルの軽い接続が開いた（共有の設定はローカルのサーバとだけやりとりする。decisions D7.4）。 */
  onLocalSummaryOpened?(): void;
  /** ほかのマシンを見ている間の、ローカルの軽い接続の `prefs.changed`。 */
  onLocalPrefsChanged?(data: { prefs: SharedPrefs; rev: number }): void;
}

/**
 * 複数ホストの結線（web の `actions/MachineWiring.ts` と同じ規則。20260927-cli-mode の design「複数ホスト」）。マシンの一覧は手元のサーバ
 * （ローカルを選んでいれば画面の接続、ほかを選んでいればローカルの軽い接続）から受け、選んでいないマシンごとに要約の接続（client-core の
 * `MachineSummaryClient`）を 1 本ずつ持つ。今のマシンが一覧から消えたらローカルへ戻す。端末版には web のモバイルの無効化は無い。
 */
export class MachineWiring {
  private readonly clients = new Map<string, SummaryClientLike>();

  constructor(private readonly deps: MachineWiringDeps) {}

  applyMachineList(raw: MachineStatus[]): void {
    const list = Array.isArray(raw) ? raw : [];
    const m = this.deps.machines;
    m.setMachines(list);
    if (m.selectedId !== LOCAL_MACHINE_ID && !list.some((x) => x.id === m.selectedId))
      this.deps.switchTo(LOCAL_MACHINE_ID, undefined, { force: true });
    this.reconcileSummaryClients();
  }

  /** 画面の接続が開いた。ローカルを見ているなら一覧をもらう（ほかのマシンを見ているなら、一覧はローカルの軽い接続から）。 */
  onMainOpened(): void {
    if (this.deps.machines.selectedId !== LOCAL_MACHINE_ID) {
      this.reconcileSummaryClients();
      return;
    }
    void this.deps
      .requestMainList()
      .then((r) => this.applyMachineList(r.machines))
      .catch(() => undefined);
  }

  /** 画面の接続の `machine.changed`（ローカルを見ているときだけ当てる。ほかのマシンのサーバの一覧は使わない）。 */
  onMainMachinesChanged(list: MachineStatus[]): void {
    if (this.deps.machines.selectedId === LOCAL_MACHINE_ID) this.applyMachineList(list);
  }

  /** 選んでいないマシンの要約の接続を、今の一覧と選択に合わせる。 */
  reconcileSummaryClients(): void {
    const m = this.deps.machines;
    const wanted = new Set(
      m.hasMachines ? m.sections.map((s) => s.id).filter((id) => id !== m.selectedId) : [],
    );
    for (const [id, client] of this.clients) {
      if (wanted.has(id)) continue;
      client.stop();
      this.clients.delete(id);
      m.dropSummary(id);
    }
    for (const id of wanted) {
      if (this.clients.has(id)) continue;
      const client: SummaryClientLike = this.deps.createSummaryClient({
        wsUrl: wsUrlFor(this.deps.baseWsUrl, id),
        onSnapshot: (s) => m.applySummarySnapshot(id, s),
        onEvent: (e) => {
          if (e.event === "prefs.changed") {
            if (id === LOCAL_MACHINE_ID && m.selectedId !== LOCAL_MACHINE_ID)
              this.deps.onLocalPrefsChanged?.(e.data);
            return;
          }
          if (e.event === "machine.changed") {
            if (id === LOCAL_MACHINE_ID && m.selectedId !== LOCAL_MACHINE_ID)
              this.applyMachineList(e.data.machines);
            return;
          }
          m.applySummaryEvent(id, e);
        },
        onConnected: (connected) => m.setSummaryConnected(id, connected),
        onOpened: () => {
          if (id !== LOCAL_MACHINE_ID || m.selectedId === LOCAL_MACHINE_ID) return;
          this.deps.onLocalSummaryOpened?.();
          void client
            .request("machine.list", {})
            .then((r) => this.applyMachineList(r.machines))
            .catch(() => undefined);
        },
      });
      this.clients.set(id, client);
      client.start();
    }
  }

  /** ローカルの軽い接続（ほかのマシンを見ている間だけある）。共有の設定の読み書きはここを通す。 */
  localClient(): SummaryClientLike | undefined {
    return this.clients.get(LOCAL_MACHINE_ID);
  }

  summaryClientIds(): string[] {
    return [...this.clients.keys()];
  }

  stop(): void {
    for (const c of this.clients.values()) c.stop();
    this.clients.clear();
  }
}
