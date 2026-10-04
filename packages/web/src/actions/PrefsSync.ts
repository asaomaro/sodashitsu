import type { PrefsChangedEvent, PrefsResult } from "@sodashitsu/protocol";
import { errorCodeOf } from "@sodashitsu/client-core";

/**
 * web の設定の置き場所をサーバへ（20260927-cli-mode の design「設定」・decisions D3）。`main.ts` は読み込むと起動するので単体テストできない——判断をここに閉じ込める
 * （`MachineWiring` と同じ流儀）。localStorage（`soda.prefs.v1`）は起動時の表示用のキャッシュに下げ、読み書きの出入口は `store/view.ts` の `readPrefs`/`writePrefs` のまま。
 *
 * 2 度の点検で競合の不具合が出たので、状態を少なく・規則を 1 つにした（ラウンド 2 の作り直し）:
 * - 手元の値は 3 つの置き場だけ。`pending`（まだ送っていない・送ったが失敗した変更。項目ごとに最後の値）、`inflight`（送っている 1 回分。**同時に 1 回だけ**）、
 *   `localOnly`（サーバが大きすぎると断った値。この画面の中だけで効かせる）。
 * - サーバの全体（`prefs.get`・`prefs.changed`・`prefs.set` の返事）は、最後に当てた rev より新しければ**誰の変更でも**当てる。当てる値は
 *   `サーバ ⊕ localOnly ⊕ inflight ⊕ pending`（まだ認められていない手元の値を上に重ねる）。受け取る前に届いた `prefs.changed` は最も新しいものを持っておき、受け取った後で当てる。
 * - 送るのは `pending` を丸ごと 1 回分として（直列）。成功したら `inflight` を消して、溜まっていれば続けて送る。失敗したら `inflight` を `pending` へ戻す
 *   （同じ項目のもっと新しい値が `pending` にあればそちらを残す）。次に繋がったとき・次に変更したときに送り直す。
 * - 初回の移行: サーバの `rev` が 0 なら、localStorage の共有の項目を `pending` に入れてから送る（移行の種〔seed〕の印つき）。
 * - サーバが rev>0 でも、**このブラウザがまだ移していなければ**（`migrated()` が偽。localStorage の印 `soda.prefsMigrated.v1`）、サーバに**まだ無い項目だけ**を
 *   種として送る（サーバにある項目はサーバの値が勝つ）。先に端末版やほかのブラウザがサーバへ書いて rev>0 になっていても、このブラウザの localStorage の
 *   キー・テーマ等を黙って捨てない（統合の review の差し戻し）。種が残っていない状態でサーバの値を受け取れたら移し終えた印を付け、以後は移さない。
 *   移し終えた後に rev>0 のサーバから受け取った種（移す途中で失敗したもの）は、サーバに無い項目だけ残す。
 * - 大きすぎる（`invalid_params`）: 2 項目以上の 1 回分なら 1 項目ずつに分けて送り直し、1 項目でも断られたらその項目だけ `localOnly` にして知らせる（ほかの項目の同期は続く）。
 *   その項目を次に書き直したら、もう一度送ってみる。
 * - 端末ごとの項目（`sidebarWidth`・`sidebarCollapsed`・`sidebarSectionRatio`・`sidebarSectionsCollapsed`）は送らない・置き換えない（`sharedOf`）。
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
  /** このブラウザの localStorage の共有の項目をサーバへ移し終えたか（`isPrefsMigrated`）。 */
  migrated(): boolean;
  /** 移し終えた印を付ける（`markPrefsMigrated`）。 */
  markMigrated(): void;
  toast(message: string): void;
}

interface PendingValue {
  value: unknown;
  /** 初回の移行で localStorage から入れた値（利用者が書き直していない）。 */
  seed: boolean;
}

export class PrefsSync {
  /** この接続でサーバの値を受け取り済みで、送れるか。 */
  private synced = false;
  /** 最後に当てたサーバの rev。 */
  private rev = 0;
  private readonly pending = new Map<string, PendingValue>();
  private inflight: Map<string, PendingValue> | null = null;
  private readonly localOnly = new Map<string, unknown>();
  /** 大きすぎると断られた 1 回分の項目。1 項目ずつ送り直す。 */
  private readonly solo = new Set<string>();
  /** 受け取る前（`prefs.get` の往復中）に届いた `prefs.changed` の最も新しいもの。 */
  private buffered: PrefsChangedEvent["data"] | undefined;
  /** 接続ごとの印（古い接続の `prefs.get` の応答を捨てる・送信の失敗が接続の切り替えによるものかを見分ける）。 */
  private generation = 0;
  /** 大きすぎるの知らせを出したか（同じ値で繰り返し出さない。書き直したら下ろす）。 */
  private tooLargeShown = false;

  constructor(private readonly deps: PrefsSyncDeps) {}

  /** 画面の接続の hello が通った（初回・再接続・マシンの切り替えのたび）。 */
  onOpened(): void {
    this.synced = false;
    this.buffered = undefined;
    const gen = ++this.generation;
    if (!this.deps.isLocal()) return;
    void this.deps
      .getPrefs()
      .then((r) => {
        if (gen !== this.generation) return;
        // 移す値：サーバに無い項目（rev 0 なら全部）はそのまま、サーバにもある項目は入れ子のオブジェクト同士なら併合（サーバに無い中身だけ足す）、
        // それ以外はサーバの値が勝つ（移さない）。
        const seedOf = (k: string, value: unknown): unknown =>
          r.rev === 0 || !Object.hasOwn(r.prefs, k) ? value : mergeMissing(value, r.prefs[k]);
        if (r.rev === 0 || !this.deps.migrated()) {
          // 移行：まだ送っていない手元の値（利用者の変更）を優先し、それ以外の共有の項目を種として入れる。
          for (const [k, value] of Object.entries(this.deps.sharedOf(this.deps.readLocal()))) {
            if (this.pending.has(k) || this.localOnly.has(k)) continue;
            const seed = seedOf(k, value);
            if (seed !== undefined) this.pending.set(k, { value: seed, seed: true });
          }
        }
        // 前の接続で送れなかった種は、今のサーバの値に対して選び直す（その間にほかのクライアントが書いた中身は、サーバの値が勝つ）。
        for (const [k, p] of [...this.pending]) {
          if (!p.seed) continue;
          const seed = seedOf(k, p.value);
          if (seed === undefined) this.pending.delete(k);
          else this.pending.set(k, { value: seed, seed: true });
        }
        this.synced = true;
        this.accept(r.prefs, r.rev);
        const b = this.buffered;
        this.buffered = undefined;
        if (b !== undefined && b.rev > this.rev) this.accept(b.prefs, b.rev);
        this.flush();
        this.markMigratedIfDone();
      })
      .catch(() => {
        // 受け取れなかった（切れた・古いサーバで方式が無い）。手元の値のまま動き、次の接続でやり直す。
      });
  }

  /** サーバの値を受け取っていて、送っていない・送っている種が無ければ、移し終えた印を付ける（1 回だけ）。 */
  private markMigratedIfDone(): void {
    if (!this.synced || this.deps.migrated()) return;
    const seeds = [...this.pending.values(), ...(this.inflight?.values() ?? [])];
    if (seeds.some((p) => p.seed)) return;
    this.deps.markMigrated();
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
    const keys = Object.keys(shared);
    if (keys.length === 0) return;
    for (const k of keys) {
      this.localOnly.delete(k); // 書き直した（大きすぎた値ではなくなったかもしれない）。もう一度送ってみる
      this.pending.set(k, { value: shared[k], seed: false });
    }
    this.tooLargeShown = false;
    this.flush();
  }

  /** `prefs.changed`（画面の接続に届いたもの）。 */
  onChanged(data: PrefsChangedEvent["data"]): void {
    if (!this.synced) {
      if (this.buffered === undefined || data.rev > this.buffered.rev) this.buffered = data;
      return;
    }
    if (data.rev > this.rev) this.accept(data.prefs, data.rev);
  }

  /** サーバの全体を受け取り、まだ認められていない手元の値を上に重ねて当てる。 */
  private accept(prefs: Record<string, unknown>, rev: number): void {
    this.rev = rev;
    const overlay: Record<string, unknown> = { ...prefs };
    for (const [k, v] of this.localOnly) overlay[k] = v;
    for (const [k, p] of this.inflight ?? []) overlay[k] = p.value;
    for (const [k, p] of this.pending) overlay[k] = p.value;
    this.deps.applyToStores(this.deps.replaceShared(overlay));
  }

  /** 溜めた変更を 1 回分送る（同時に 1 回だけ）。 */
  private flush(): void {
    if (!this.synced || this.inflight !== null || this.pending.size === 0) return;
    const batch = new Map<string, PendingValue>();
    const soloKey = [...this.solo].find((k) => this.pending.has(k));
    if (soloKey !== undefined) {
      batch.set(soloKey, this.pending.get(soloKey)!);
      this.pending.delete(soloKey);
      this.solo.delete(soloKey);
    } else {
      for (const [k, p] of this.pending) batch.set(k, p);
      this.pending.clear();
    }
    this.inflight = batch;
    const gen = this.generation;
    const values: Record<string, unknown> = {};
    for (const [k, p] of batch) values[k] = p.value;
    void this.deps
      .setPrefs(values, this.rev)
      .then((r) => {
        this.inflight = null;
        // 変更の知らせ（`prefs.changed`）は返事より先に届くので、ふつうは当て済み。届かなかったときだけ当てる。
        if (this.synced && gen === this.generation && r.rev > this.rev) this.accept(r.prefs, r.rev);
        this.flush();
        this.markMigratedIfDone();
      })
      .catch((err: unknown) => {
        this.inflight = null;
        if (errorCodeOf(err) === "invalid_params") {
          if (batch.size > 1) {
            // どの項目が大きすぎたか分からない。1 項目ずつ送り直す。
            for (const [k, p] of batch) {
              if (!this.pending.has(k)) this.pending.set(k, p);
              this.solo.add(k);
            }
          } else {
            for (const [k, p] of batch) if (!this.pending.has(k)) this.localOnly.set(k, p.value);
            if (!this.tooLargeShown) {
              this.tooLargeShown = true;
              this.deps.toast(
                "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）。",
              );
            }
          }
          this.flush();
          // 大きすぎて断られた種も移し終えた扱い（読み込むたびに種を入れ直して断られ、知らせ続けない。統合の review r2）。
          this.markMigratedIfDone();
          return;
        }
        // 切れた等。戻して、次に繋がったとき・次に変更したときに送り直す（同じ項目のもっと新しい値が溜まっていればそちらを残す）。
        for (const [k, p] of batch) if (!this.pending.has(k)) this.pending.set(k, p);
        if (gen !== this.generation) this.flush(); // 送った後に接続が替わった（新しい接続が受け取り済みなら、そこで送る）
      });
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 移行でサーバにもある項目の併合（統合の review r2）。両方が入れ子のオブジェクト（`keys`〔`bindings`・`commands` 等〕・`notify`・`themeOverrides`・
 * `sidebarRows` 等）なら、サーバに無い中身だけを足した全体を返す（入れ子の中も同じ規則。配列・値は葉で、同じ場所ではサーバの値が勝つ）。
 * 足すものが無い・どちらかがオブジェクトでなければ undefined（移さない）。
 */
export function mergeMissing(local: unknown, server: unknown): unknown {
  if (!isPlainObject(local) || !isPlainObject(server)) return undefined;
  let added = false;
  const out: Record<string, unknown> = { ...server };
  for (const [k, v] of Object.entries(local)) {
    if (!Object.hasOwn(server, k)) {
      out[k] = v;
      added = true;
      continue;
    }
    const inner = mergeMissing(v, server[k]);
    if (inner !== undefined) {
      out[k] = inner;
      added = true;
    }
  }
  return added ? out : undefined;
}
