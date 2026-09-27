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
 * 返事で受けた設定を正とする。保存できなければ重ねを外して元に戻し、知らせる（黙って手元だけ変わったままにしない）。
 * `prefs.set` は項目ごとの浅いマージなので、`tui` 節は節ごと送る（`setTui`）。
 */
export class SettingsWriter {
  constructor(private readonly deps: SettingsWriterDeps) {}

  /** 共有の設定の項目を替える。値 `null` は「既定へ戻す」（読む側の正規化が既定へ落とす。`undefined` は JSON で消えて送れない）。 */
  setShared(patch: Record<string, unknown>): void {
    const { prefs, conn } = this.deps;
    const release = prefs.overlay(patch);
    conn
      .request("prefs.set", { patch: patch as SharedPrefs, baseRev: Math.max(0, prefs.rev) })
      .then((r) => {
        if (r && typeof r.rev === "number") prefs.apply(r.prefs, r.rev);
        release();
      })
      .catch((err: unknown) => {
        release();
        this.deps.toast(
          errorCodeOf(err) === "invalid_params"
            ? "設定が大きすぎるため保存できませんでした"
            : "設定を保存できませんでした",
        );
      });
  }

  /** `tui` 節の 1 項目を替える（節の他の項目は今の値のまま送る）。 */
  setTui(key: string, value: unknown): void {
    this.setShared({ tui: { ...this.deps.prefs.tui, [key]: value } });
  }

  /** 端末ごとの項目（`tui-state.json`。色の出し方など）。 */
  setLocal(patch: LocalPatch): void {
    this.deps.setLocal(patch);
  }
}
