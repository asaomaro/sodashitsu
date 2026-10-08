import type { ConnectionPort } from "@sodashitsu/client-core";
import { errorCodeOf } from "@sodashitsu/client-core";
import type { ExtensionInfo, ExtensionListResult, ExtensionLogResult } from "@sodashitsu/protocol";
import type { useExtensionsStore } from "../store/extensions.js";
import { failedToastText, newlyFailed } from "./extensionView.js";

export interface ExtensionControllerOptions {
  conn: Pick<ConnectionPort, "request">;
  store: ReturnType<typeof useExtensionsStore>;
  toast(message: string): void;
}

/**
 * 拡張（20261007-ext-host）の通信の係。接続のたびに `extension.list` で一覧を取る（`not_found` なら古いサーバ＝`supported = false`）。
 * `extension.changed`（中身なし）のたびに取り直す——取り直しが重なったら、最後の 1 回にまとめる。マシンの切り替え・切断で状態を捨てる。
 * 「続けて落ちた」を見つけたらトーストを出す（接続し直した直後の最初の一覧では出さない）。操作（`reload`・`restart`・`log`・`setEnabled`）はここを通る。
 */
export class ExtensionController {
  /** 切り替え・切断のたびに進める（その前に始めた要求の応答を捨てる印）。 */
  private generation = 0;
  private inFlight = false;
  private again = false;
  /** 前の一覧（知らせの比較用）。切り替え・切断で `null`。 */
  private prev: ExtensionInfo[] | null = null;

  constructor(private readonly opts: ExtensionControllerOptions) {}

  onOpened(): void {
    this.reset(false);
    void this.refresh();
  }

  onClosed(): void {
    this.reset(true);
  }

  resetForMachineSwitch(): void {
    this.reset(true);
  }

  private reset(clearStore: boolean): void {
    this.generation++;
    this.inFlight = false;
    this.again = false;
    this.prev = null;
    if (clearStore) this.opts.store.clear();
  }

  /** `extension.changed`。 */
  onChanged(): void {
    void this.refresh();
  }

  /** 一覧を取り直す。取っている最中に呼ばれたら、終わってからもう 1 回だけ取る。 */
  async refresh(): Promise<void> {
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = true;
    const generation = this.generation;
    try {
      const r = await this.opts.conn.request("extension.list", {});
      if (generation === this.generation) this.apply(r);
    } catch (err) {
      if (generation === this.generation && errorCodeOf(err) === "not_found") this.opts.store.setUnsupported();
    } finally {
      if (generation === this.generation) {
        this.inFlight = false;
        if (this.again) {
          this.again = false;
          void this.refresh();
        }
      }
    }
  }

  private apply(r: ExtensionListResult): void {
    for (const e of newlyFailed(this.prev, r.extensions)) this.opts.toast(failedToastText(e.id));
    this.prev = r.extensions;
    this.opts.store.setList(r);
  }

  /** 設定を読み直す。古いサーバ（`not_found`）では黙って何もしない。結果は一覧に反映する。 */
  async reload(quiet = false): Promise<void> {
    const generation = this.generation;
    try {
      const r = await this.opts.conn.request("extension.reload", {});
      if (generation === this.generation) this.apply(r);
    } catch (err) {
      if (errorCodeOf(err) !== "not_found" && !quiet) this.opts.toast("拡張の設定を読み直せませんでした");
    }
  }

  async restart(key: string): Promise<void> {
    await this.guarded(key, () => this.opts.conn.request("extension.restart", { key }), "拡張を起動し直せませんでした");
  }

  async setEnabled(key: string, enabled: boolean): Promise<void> {
    await this.guarded(key, () => this.opts.conn.request("extension.setEnabled", { key, enabled }), enabled ? "拡張を有効にできませんでした" : "拡張を無効にできませんでした");
  }

  /** 標準エラーの記録。失敗は `null`（知らせて返す）。 */
  async log(key: string): Promise<ExtensionLogResult | null> {
    try {
      return await this.opts.conn.request("extension.log", { key });
    } catch {
      this.opts.toast("拡張のログを読めませんでした");
      return null;
    }
  }

  private async guarded(key: string, run: () => Promise<unknown>, failure: string): Promise<void> {
    if (this.opts.store.busy.has(key)) return;
    this.opts.store.setBusy(key, true);
    try {
      await run();
    } catch {
      this.opts.toast(failure);
    } finally {
      this.opts.store.setBusy(key, false);
    }
    void this.refresh();
  }
}
