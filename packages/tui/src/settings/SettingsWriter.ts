import { errorCodeOf } from "@sodashitsu/client-core";
import type { SharedPrefs } from "@sodashitsu/protocol";
import type { TuiState } from "../local/tuiState.js";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";

/** 手元の状態の差分（`undefined` は消す）。 */
export type LocalPatch = { [K in keyof TuiState]?: TuiState[K] | undefined };

export interface SettingsWriterDeps {
  prefs: PrefsModel;
  conn: RequestPort;
  /** 保存できなかったときの知らせ。 */
  toast(message: string): void;
  /** 手元の状態（`tui-state.json`）を替えて残す（値 `undefined` はその項目を消す）。 */
  setLocal(patch: LocalPatch): void;
}

/**
 * 設定の書き込み（20260927-cli-mode の design「設定」。端末版の設定画面の変更は `prefs.set`）。**押した時点で画面に効かせ**（手元で先に重ねる）、
 * 返事で受けた設定を正とする。
 * - 切れた等で保存できなければ、重ねを外して元に戻し、知らせる（黙って手元だけ変わったままにしない）。
 * - 大きすぎて受け付けられない（`invalid_params`）ときは、web の `PrefsSync` と同じく**この画面の中だけで効かせ**（重ねたまま残す）、1 回だけ知らせる
 *   （decisions D10）。
 * - `prefs.set` は項目ごとの浅いマージで、`tui` 節は節ごと置き換わる。`setTui` は**サーバが受け付けた `tui`** に、送った後まだ返事の無い
 *   `tui` の項目と今回の項目だけを重ねて送る（保存できなかった項目・この画面だけの項目をほかの項目の要求に乗せない）。
 */
export class SettingsWriter {
  private tooLargeShown = false;
  /** `tui` の項目のうち、送った後まだ返事の無いもの（項目 → 値と印）。 */
  private readonly tuiInflight = new Map<string, { token: number; value: unknown }>();
  private nextToken = 1;

  constructor(private readonly deps: SettingsWriterDeps) {}

  /** 共有の設定の項目を替える。値 `null` は「既定へ戻す」（読む側の正規化が既定へ落とす。`undefined` は JSON で消えて送れない）。 */
  setShared(patch: Record<string, unknown>, done?: (ok: boolean) => void): void {
    const { prefs, conn } = this.deps;
    const release = prefs.overlay(patch);
    conn
      .request("prefs.set", { patch: patch as SharedPrefs, baseRev: Math.max(0, prefs.rev) })
      .then((r) => {
        if (r && typeof r.rev === "number") prefs.apply(r.prefs, r.rev);
        release();
        done?.(true);
      })
      .catch((err: unknown) => {
        done?.(false);
        if (errorCodeOf(err) === "invalid_params") {
          // 重ねたまま（この画面の中だけで効く）。知らせは 1 回だけ。
          if (!this.tooLargeShown) {
            this.tooLargeShown = true;
            this.deps.toast(
              "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）",
            );
          }
          return;
        }
        release();
        this.deps.toast("設定を保存できませんでした");
      });
  }

  /** `tui` 節の 1 項目を替える。 */
  setTui(key: string, value: unknown): void {
    const token = this.nextToken++;
    this.tuiInflight.set(key, { token, value });
    const base: Record<string, unknown> = { ...this.deps.prefs.serverTui };
    for (const [k, p] of this.tuiInflight) base[k] = p.value;
    this.setShared({ tui: base }, () => {
      if (this.tuiInflight.get(key)?.token === token) this.tuiInflight.delete(key);
    });
  }

  /** 端末ごとの項目（`tui-state.json`。色の出し方など）。 */
  setLocal(patch: LocalPatch): void {
    this.deps.setLocal(patch);
  }
}
