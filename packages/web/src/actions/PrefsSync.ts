import type { PrefsChangedEvent, PrefsResult } from "@sodashitsu/protocol";
import { errorCodeOf } from "@sodashitsu/client-core";

/**
 * web の設定の置き場所をサーバへ（20260927-cli-mode の design「設定」・decisions D3）。`main.ts` は読み込むと起動するので単体テストできない——判断をここに閉じ込める
 * （`MachineWiring` と同じ流儀）。localStorage（`soda.prefs.v1`）は起動時の表示用のキャッシュに下げ、読み書きの出入口は `store/view.ts` の `readPrefs`/`writePrefs` のまま。
 *
 * - 画面の接続の hello が通るたび（ローカルを向いているときだけ）`prefs.get`。サーバの `rev` が 0（一度も保存していない）で localStorage に共有の項目があれば、
 *   それを `prefs.set` で送る（初回の移行。送った値で手元を上書きしない）。そうでなければ手元の共有の項目をサーバの値で置き換え、各ストアへ当てる。
 * - 以後の変更（`writePrefs`）は共有の項目だけ `prefs.set`。繋がっていない・ほかのマシンを向いている間の変更は溜めて、次に繋がったときに送る（サーバの値より後の操作が勝つ）。
 * - `prefs.changed` は、最後に当てた rev より新しければ**送った本人のものも含めて**当てる（サーバの全体が正）。ただし、送ったがまだ返事の来ていない
 *   手元の変更（送信中）と溜めた変更は上に重ねる——ほかのクライアントの変更が先に届いても、自分の新しい値を古い値で戻さない（点検の must）。
 * - 送った変更が失敗したら、その項目の最後の書き込みのときだけ溜めに戻す（後の書き込みが成功した項目は戻さない——再接続で古い値を蘇らせない）。
 * - 初回の移行は、送った結果（ほかのクライアントが先に保存した項目を含む全体）を当てる。
 * - 端末ごとの項目（`sidebarWidth`・`sidebarCollapsed`）は送らない・置き換えない。
 */
export interface PrefsSyncDeps {
  getPrefs(): Promise<PrefsResult>;
  /** 送る値は `writePrefs` に書かれた共有の項目（web のストアが書いた形。`SharedPrefs` の型は `main.ts` で付ける）。 */
  setPrefs(patch: Record<string, unknown>, baseRev: number): Promise<PrefsResult>;
  /** 画面の接続がローカル（このページを配った `soda serve`）を向いているか。ほかのマシンの設定は扱わない。 */
  isLocal(): boolean;
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

/** 手元の 1 項目の書き込み（`seq` は書いた順。同じ項目の後の書き込みほど大きい）。 */
interface LocalWrite {
  seq: number;
  value: unknown;
}

export class PrefsSync {
  /** サーバの値を受け取り済みで、変更をすぐ送れるか。 */
  private synced = false;
  /** 最後に当てたサーバの rev。 */
  private rev = 0;
  /** 書いた順の番号と、項目ごとの最後の書き込みの番号。 */
  private seq = 0;
  private readonly latest = new Map<string, number>();
  /** 送ったが返事の来ていない変更（項目ごと。最後に送ったもの）。 */
  private readonly inflight = new Map<string, LocalWrite>();
  /** 送れていない変更（繋がっていない・ほかのマシンを向いている間・送信の失敗。項目ごとに最後の値だけ）。 */
  private readonly pending = new Map<string, LocalWrite>();
  /** 受け取る前（`prefs.get` の往復中）に届いた `prefs.changed` の最も新しいもの。受け取った後に rev が新しければ当てる。 */
  private buffered: PrefsChangedEvent["data"] | undefined;
  /** 接続ごとの印（古い接続の `prefs.get` の応答を捨てる）。 */
  private generation = 0;

  constructor(private readonly deps: PrefsSyncDeps) {}

  /** 画面の接続の hello が通った（初回・再接続・マシンの切り替えのたび）。 */
  onOpened(): void {
    this.synced = false;
    this.buffered = undefined;
    const gen = ++this.generation;
    if (!this.deps.isLocal()) return;
    void this.deps
      .getPrefs()
      .then(async (r) => {
        if (gen !== this.generation) return;
        const local = this.deps.sharedOf(this.deps.readLocal());
        if (r.rev === 0 && Object.keys(local).length > 0) {
          // 初回の移行：このブラウザの値（と溜めた変更）をサーバへ。返ってきた全体（ほかのクライアントが先に保存した項目を含む）を当てる。
          const writes = this.takePending();
          const saved = await this.deps.setPrefs({ ...local, ...valuesOf(writes) }, 0);
          if (gen !== this.generation) return;
          this.synced = true;
          this.accept(saved.prefs, saved.rev);
          this.flushBuffered();
          return;
        }
        this.synced = true;
        this.accept(r.prefs, r.rev);
        this.flushBuffered();
        const writes = this.takePending();
        if (writes.size > 0) this.send(writes);
      })
      .catch(() => {
        // 受け取れなかった（切れた・古いサーバで方式が無い）。手元の値のまま動き、次の接続でやり直す。
      });
  }

  /** 画面の接続が切れた。以後の変更は溜める。 */
  onClosed(): void {
    this.synced = false;
    this.buffered = undefined;
    this.generation++;
  }

  /** `writePrefs` の書き込み（`onPrefsWritten`）。 */
  onWritten(patch: Record<string, unknown>): void {
    const shared = this.deps.sharedOf(patch);
    const writes = new Map<string, LocalWrite>();
    for (const [k, value] of Object.entries(shared)) {
      const w = { seq: ++this.seq, value };
      this.latest.set(k, w.seq);
      writes.set(k, w);
    }
    if (writes.size === 0) return;
    if (!this.synced) {
      for (const [k, w] of writes) this.pending.set(k, w);
      return;
    }
    this.send(writes);
  }

  /** `prefs.changed`（画面の接続に届いたもの）。 */
  onChanged(data: PrefsChangedEvent["data"]): void {
    if (!this.synced) {
      if (this.buffered === undefined || data.rev > this.buffered.rev) this.buffered = data;
      return;
    }
    if (data.rev <= this.rev) return;
    this.accept(data.prefs, data.rev);
  }

  /** サーバの全体を受け取り、送信中・溜めた手元の変更を上に重ねて当てる。 */
  private accept(prefs: Record<string, unknown>, rev: number): void {
    this.rev = rev;
    const overlay = { ...prefs, ...valuesOf(this.inflight), ...valuesOf(this.pending) };
    this.deps.applyToStores(this.deps.replaceShared(overlay));
  }

  private flushBuffered(): void {
    const b = this.buffered;
    this.buffered = undefined;
    if (b !== undefined && b.rev > this.rev) this.accept(b.prefs, b.rev);
  }

  private takePending(): Map<string, LocalWrite> {
    const writes = new Map(this.pending);
    this.pending.clear();
    return writes;
  }

  private send(writes: Map<string, LocalWrite>): void {
    for (const [k, w] of writes) this.inflight.set(k, w);
    const gen = this.generation;
    void this.deps
      .setPrefs(valuesOf(writes), this.rev)
      .then((r) => {
        this.settle(writes, true);
        // 変更の知らせ（`prefs.changed`）は返事より先に届くので、ふつうは当て済み。届かなかった（別の接続に替わった等）ときだけ当てる。
        if (gen === this.generation && this.synced && r.rev > this.rev) this.accept(r.prefs, r.rev);
      })
      .catch((err: unknown) => {
        if (errorCodeOf(err) === "invalid_params") {
          this.settle(writes, true); // 送り直しても通らない。手元（この画面）では効いたまま
          this.deps.toast(
            "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）。",
          );
          return;
        }
        // 切れた等。次に繋がったときに送る。ただし**その項目の最後の書き込みだけ**（後の書き込みがあれば、それが送信中か溜めにある）。
        this.settle(writes, false);
      });
  }

  /** 送った変更の後始末。`ok` なら溜めから古い値を消す。失敗なら、最後の書き込みの項目だけ溜めへ戻す。 */
  private settle(writes: Map<string, LocalWrite>, ok: boolean): void {
    for (const [k, w] of writes) {
      if (this.inflight.get(k)?.seq === w.seq) this.inflight.delete(k);
      if (ok) {
        const p = this.pending.get(k);
        if (p !== undefined && p.seq < w.seq) this.pending.delete(k);
      } else if (this.latest.get(k) === w.seq && !this.pending.has(k)) {
        this.pending.set(k, w);
      }
    }
  }
}

function valuesOf(writes: ReadonlyMap<string, LocalWrite>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, w] of writes) out[k] = w.value;
  return out;
}
