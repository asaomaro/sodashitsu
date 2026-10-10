import { errorCodeOf, type ConnectionPort } from "@sodashitsu/client-core";
import type { useUsageStore } from "../store/usage.js";

/**
 * 利用状況の配信を頼む・止める（20261010-agent-usage PR3 の AC2）。**ダッシュボードが見えていて、タブが前面にあり、接続が開いている間だけ**、サーバへ
 * `agent.usage_watch {on: true}` を送り、最初の値を `agent.usage` で取る。見えなくなる・タブが裏へ回る・接続が切れるで止める（サーバの確かめも、見ている
 * 接続が居なくなれば止まる）。別のマシンへ替わったら、前のマシンの値を捨てる。
 */
export interface UsageControllerDeps {
  conn: Pick<ConnectionPort, "request">;
  store: Pick<ReturnType<typeof useUsageStore>, "setSnapshot" | "markUnsupported" | "markFailed" | "clear">;
  /** 配信を受けたいか: ダッシュボードか、pane の利用状況の窓が見えているか（`view.usageWatchWanted`。見ている、の数え方は 1 つ）。 */
  isWanted: () => boolean;
  /** タブが前面か（`document.visibilityState === "visible"`）。 */
  isPageVisible: () => boolean;
  /** 画面の接続が向いているマシン（`machines.selectedId`）。替わったら値を捨てる。 */
  machineId: () => string;
}

export class UsageController {
  /** 接続が開いているか（`onOpened`〜`onClosed`）。 */
  private open = false;
  /** サーバへ `on: true` を送った（接続の寿命の中。切れたら false）。 */
  private watching = false;
  private generation = 0;
  private lastMachine: string | null = null;

  constructor(private readonly deps: UsageControllerDeps) {}

  /** 見る必要があるか。 */
  private wanted(): boolean {
    return this.open && this.deps.isWanted() && this.deps.isPageVisible();
  }

  /** 見えている・前面・接続の状態のどれかが変わったとき。 */
  sync(): void {
    const want = this.wanted();
    if (want && !this.watching) void this.start();
    else if (!want && this.watching) this.stop();
  }

  onOpened(): void {
    this.open = true;
    this.watching = false; // サーバの印は、接続とともに消えている
    this.generation++;
    const machine = this.deps.machineId();
    if (this.lastMachine !== null && this.lastMachine !== machine) this.deps.store.clear();
    this.lastMachine = machine;
    this.sync();
  }

  onClosed(): void {
    this.open = false;
    this.watching = false;
    this.generation++;
  }

  private async start(): Promise<void> {
    this.watching = true;
    const gen = ++this.generation;
    const live = (): boolean => gen === this.generation && this.watching;
    try {
      await this.deps.conn.request("agent.usage_watch", { on: true });
      if (!live()) return;
      const r = await this.deps.conn.request("agent.usage", {});
      if (!live()) return;
      this.deps.store.setSnapshot(r);
    } catch (err) {
      if (gen !== this.generation) return;
      this.watching = false;
      const code = errorCodeOf(err);
      // 知らない方式（古いサーバ。`/ws` は `not_found`）: 取り直しても同じなので、画面が理由を出す。
      if (code === "not_found") this.deps.store.markUnsupported();
      else this.deps.store.markFailed();
    }
  }

  private stop(): void {
    this.watching = false;
    this.generation++;
    void this.deps.conn.request("agent.usage_watch", { on: false }).catch(() => undefined);
  }
}
