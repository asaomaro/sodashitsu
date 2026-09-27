import type { MachineStatus } from "@sodashitsu/protocol";
import type { Ref } from "vue";
import type { MachineSummaryClientOptions } from "@sodashitsu/client-core";
import { LOCAL_MACHINE_ID, wsUrlFor } from "@sodashitsu/client-core";
import type { useMachinesStore } from "../store/machines.js";
import type { SwitchTarget } from "./MachineSwitcher.js";

/**
 * ブラウザの保存した SSH のマシンの配線（20260927-multi-host-machines の design「ブラウザ（main.ts の配線）」）。`main.ts` は読み込むと起動するので
 * 単体テストできない——ここに判断を閉じ込め、`main.ts` は呼ぶだけにする（点検で `main.ts` の配線の誤り〔機能が常に無効〕が見つかったため）。
 *
 * - マシンの一覧の出所: ローカルを選んでいる間は画面の接続（`onMainOpened`・`onMainMachinesChanged`）、ほかを選んでいる間はローカルの軽い接続。
 * - 軽い接続: 有効なマシンがあり、1 列の画面でないとき、[ローカル, ...マシン] のうち選んでいないものに 1 本ずつ。
 * - 選んでいるマシンが一覧から消えたら（無効化・削除）ローカルへ戻る（切れていても）。1 列の画面になったらローカルへ戻り一覧を空にする。
 */
export interface SummaryClientLike {
  start(): void;
  stop(): void;
  request(
    method: "machine.list",
    params: Record<string, never>,
  ): Promise<{ machines: MachineStatus[] }>;
}

export interface MachineWiringDeps {
  machines: ReturnType<typeof useMachinesStore>;
  switcher: {
    switchTo(id: string, target?: SwitchTarget, opts?: { force?: boolean }): Promise<boolean>;
  };
  /** 画面の接続の `machine.list`。 */
  requestMainList(): Promise<{ machines: MachineStatus[] }>;
  createSummaryClient(opts: MachineSummaryClientOptions): SummaryClientLike;
  /** 画面の接続の `/ws` の URL（`?machine=` の無いもの）。 */
  baseWsUrl: string;
  /**
   * 1 列の画面か（リアクティブ。`mobile/detect.ts` の `trackMediaQuery`）。**真偽値ではなく Ref を受ける**——`main.ts` で
   * `!isMobileViewport()`（Ref を否定して常に偽）と書いて機能が一度も働かなかった誤りを、型で止める（T13 の点検）。
   */
  mobileViewport: Ref<boolean>;
}

export class MachineWiring {
  private readonly clients = new Map<string, SummaryClientLike>();

  constructor(private readonly deps: MachineWiringDeps) {}

  /** マシンの機能を使うか（1 列の画面では使わない）。 */
  isEnabled(): boolean {
    return !this.deps.mobileViewport.value;
  }

  /** 手元の `soda serve` のマシンの一覧を当てる。選んでいるマシンが消えたらローカルへ戻る。 */
  applyMachineList(list: MachineStatus[]): void {
    if (!this.isEnabled()) return;
    const m = this.deps.machines;
    m.setMachines(list);
    if (m.selectedId !== LOCAL_MACHINE_ID && !list.some((x) => x.id === m.selectedId))
      void this.deps.switcher.switchTo(LOCAL_MACHINE_ID, undefined, { force: true });
  }

  /** 画面の接続の hello が通るたび。ローカルを向いていれば一覧を読む。 */
  onMainOpened(): void {
    if (!this.isEnabled() || this.deps.machines.selectedId !== LOCAL_MACHINE_ID) return;
    void this.deps
      .requestMainList()
      .then((r) => this.applyMachineList(r.machines))
      .catch(() => undefined);
  }

  /** 画面の接続に届いた `machine.changed`（ローカルを向いているときだけ手元の一覧）。 */
  onMainMachinesChanged(list: MachineStatus[]): void {
    if (this.deps.machines.selectedId === LOCAL_MACHINE_ID) this.applyMachineList(list);
  }

  /** 1 列の画面になった・戻った。 */
  onMobileChanged(mobile: boolean): void {
    const m = this.deps.machines;
    if (mobile) {
      if (m.selectedId !== LOCAL_MACHINE_ID)
        void this.deps.switcher.switchTo(LOCAL_MACHINE_ID, undefined, { force: true });
      m.setMachines([]);
      this.reconcileSummaryClients();
      return;
    }
    this.onMainOpened();
  }

  /** 軽い接続を、選んでいないマシンに 1 本ずつに揃える（選んだ・消えたマシンの接続は閉じて要約を捨てる）。 */
  reconcileSummaryClients(): void {
    const m = this.deps.machines;
    const wanted = new Set(
      this.isEnabled() && m.hasMachines
        ? m.sections.map((s) => s.id).filter((id) => id !== m.selectedId)
        : [],
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
          if (e.event === "machine.changed") {
            // ローカルの軽い接続の一覧だけを、ほかのマシンを選んでいる間に使う（リモートの登録簿は混ぜない）。
            if (id === LOCAL_MACHINE_ID && m.selectedId !== LOCAL_MACHINE_ID)
              this.applyMachineList(e.data.machines);
            return;
          }
          m.applySummaryEvent(id, e);
        },
        onConnected: (connected) => m.setSummaryConnected(id, connected),
        onOpened: () => {
          if (id !== LOCAL_MACHINE_ID || m.selectedId === LOCAL_MACHINE_ID) return;
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

  /** テスト用：いま張っている軽い接続のマシン。 */
  summaryClientIds(): string[] {
    return [...this.clients.keys()];
  }
}
