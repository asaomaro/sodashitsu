import type { PrefsChangedEvent, PrefsResult, SharedPrefs } from "@sodashitsu/protocol";
import { errorCodeOf } from "@sodashitsu/client-core";

/**
 * web の設定の置き場所をサーバへ（20260927-cli-mode の design「設定」・decisions D3）。`main.ts` は読み込むと起動するので単体テストできない——判断をここに閉じ込める
 * （`MachineWiring` と同じ流儀）。localStorage（`soda.prefs.v1`）は起動時の表示用のキャッシュに下げ、読み書きの出入口は `store/view.ts` の `readPrefs`/`writePrefs` のまま。
 *
 * - 画面の接続の hello が通るたび（ローカルを向いているときだけ）`prefs.get`。サーバの `rev` が 0（一度も保存していない）で localStorage に共有の項目があれば、
 *   それを `prefs.set` で送る（初回の移行。送った値で手元を上書きしない）。そうでなければ手元の共有の項目をサーバの値で置き換え、各ストアへ当てる。
 * - 以後の変更（`writePrefs`）は共有の項目だけ `prefs.set`。繋がっていない・ほかのマシンを向いている間の変更は溜めて、次に繋がったときに送る（サーバの値より後の操作が勝つ）。
 * - ほかのクライアントの `prefs.changed` は置き換えて当てる。自分の変更の知らせ（`byClientId` が自分）は rev だけ進める。
 * - 端末ごとの項目（`sidebarWidth`・`sidebarCollapsed`）は送らない・置き換えない。
 */
export interface PrefsSyncDeps {
  getPrefs(): Promise<PrefsResult>;
  setPrefs(patch: SharedPrefs, baseRev: number): Promise<PrefsResult>;
  /** 画面の接続がローカル（このページを配った `soda serve`）を向いているか。ほかのマシンの設定は扱わない。 */
  isLocal(): boolean;
  /** この接続の clientId（`client.hello` の応答）。 */
  clientId(): string | null;
  /** localStorage の全体（`readPrefs`）。 */
  readLocal(): Record<string, unknown>;
  /** 共有の項目だけを取り出す（`sharedPrefsOf`）。 */
  sharedOf(raw: Record<string, unknown>): Record<string, unknown>;
  /** 手元の共有の項目を置き換え、全体を返す（`replaceSharedPrefs`）。 */
  replaceShared(shared: Record<string, unknown>): Record<string, unknown>;
  /** 各ストアへ当てる（`applyPrefsToStores`）。 */
  applyToStores(raw: Record<string, unknown>): void;
  toast(message: string): void;
}

export class PrefsSync {
  /** サーバの値を受け取り済みで、変更をすぐ送れるか。 */
  private synced = false;
  private rev = 0;
  /** 送れていない変更（繋がっていない・ほかのマシンを向いている間）。 */
  private pending: Record<string, unknown> = {};
  /** 接続ごとの印（古い接続の `prefs.get` の応答を捨てる）。 */
  private generation = 0;

  constructor(private readonly deps: PrefsSyncDeps) {}

  /** 画面の接続の hello が通った（初回・再接続・マシンの切り替えのたび）。 */
  onOpened(): void {
    this.synced = false;
    const gen = ++this.generation;
    if (!this.deps.isLocal()) return;
    void this.deps
      .getPrefs()
      .then(async (r) => {
        if (gen !== this.generation) return;
        const local = this.deps.sharedOf(this.deps.readLocal());
        if (r.rev === 0 && Object.keys(local).length > 0) {
          // 初回の移行：このブラウザの値をサーバへ（送った値で手元は変えない）。
          const saved = await this.deps.setPrefs(local, 0);
          if (gen !== this.generation) return;
          this.rev = saved.rev;
          // 送っている間の変更（溜めたもの）は続けて送る。
          const rest = this.pending;
          this.pending = {};
          this.synced = true;
          if (Object.keys(rest).length > 0) this.send(rest);
          return;
        }
        this.rev = r.rev;
        const pending = this.pending;
        this.pending = {};
        this.deps.applyToStores(this.deps.replaceShared({ ...r.prefs, ...pending }));
        this.synced = true;
        if (Object.keys(pending).length > 0) this.send(pending);
      })
      .catch(() => {
        // 受け取れなかった（切れた・古いサーバで方式が無い）。手元の値のまま動き、次の接続でやり直す。
      });
  }

  /** 画面の接続が切れた。以後の変更は溜める。 */
  onClosed(): void {
    this.synced = false;
    this.generation++;
  }

  /** `writePrefs` の書き込み（`onPrefsWritten`）。 */
  onWritten(patch: Record<string, unknown>): void {
    const shared = this.deps.sharedOf(patch);
    if (Object.keys(shared).length === 0) return;
    if (!this.synced) {
      Object.assign(this.pending, shared);
      return;
    }
    this.send(shared);
  }

  /** `prefs.changed`（画面の接続に届いたもの）。 */
  onChanged(data: PrefsChangedEvent["data"]): void {
    if (!this.synced || data.rev <= this.rev) return;
    this.rev = data.rev;
    if (data.byClientId === this.deps.clientId()) return; // 自分の変更（手元は既にその値）
    this.deps.applyToStores(this.deps.replaceShared(data.prefs));
  }

  private send(patch: Record<string, unknown>): void {
    void this.deps
      .setPrefs(patch, this.rev)
      .then((r) => {
        if (r.rev > this.rev) this.rev = r.rev;
      })
      .catch((err: unknown) => {
        if (errorCodeOf(err) === "invalid_params") {
          this.deps.toast(
            "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）。",
          );
          return;
        }
        // 切れた等。次に繋がったときに送る（後の操作が勝つので、より新しい溜めた値は上書きしない）。
        this.pending = { ...patch, ...this.pending };
      });
  }
}
