/**
 * スクリプトが動く面（`script-html`）の「フォーカスの番」（備え (b)。20261007-soda-extensions の design「キー入力の横取りへの備え」）の、純粋な状態機械。
 * 状態は面の枠ごとに 2 つ: `engaged`（利用者が操作を始めた）と `focused`（`document.activeElement` がその iframe）。
 *
 * - 「操作中でないのに、枠がフォーカスを持つ」に**変わった**ときだけ `"steal"` を返す（取られたままを、見回りのたびに数え直さない）。
 * - **回数で閉じる判断は持たない**（数えて閉じるのはサーバ。画面は、戻して、知らせるだけ）。例外は、知らせを送れない間だけ、この画面の中で数えて
 *   `DISPLAY_FOCUS_STEAL_MAX` 回で「この画面の枠を外す」（`noteUnreported`）。
 * - 枠からの `key` は、操作中の `escape` だけ受ける（`acceptKey`）。中身のスクリプトは、土台と同じ window にいて、キーの知らせを自分で作れるので、
 *   操作中でないのに端末へフォーカスを移す・利用者の次のキーをアプリの操作にする、を起こさせない。prefix は、スクリプトが動く面では受けない。
 */
import { DISPLAY_FOCUS_STEAL_MAX } from "@sodashitsu/protocol";

export type FocusVerdict = "steal" | null;

export class FocusGuard {
  engaged = false;
  focused = false;
  private unreported = 0;

  /**
   * `direct`: アプリタブのメイン画面（承認した拡張が出す面）の枠。覆いが無いので、枠がフォーカスを持てば、それが「操作中」（利用者がその画面を押した・開いた）。
   * 「取った」（`steal`）にならず、`Esc` で抜ける操作も無い（`acceptKey` は常に偽）。枠を離れれば操作中は終わる（印と［操作を終える］は従来どおり）。
   */
  constructor(public direct = false) {}

  /** 利用者が操作を始める（枠へ `focus()` する前に呼ぶ）。 */
  engage(): void {
    this.engaged = true;
  }

  /**
   * 操作を終える／フォーカスが枠を離れた（親の文書で、枠でない要素に `focusin` が起きた・`activeElement` が枠でなくなった）。
   * フォーカスは枠に無いものとして扱う——このあと枠が取り返せば、それは新しい「変わった」になる。
   */
  leave(): void {
    this.engaged = false;
    this.focused = false;
  }

  /**
   * 見回り・`blur`・`focusin` のたびに、いまの `document.activeElement` が枠か、を渡す。
   * 「枠でなかった」→「枠」に変わり、操作中でないときだけ `"steal"`。枠でなくなっていれば、操作中も終わる。
   */
  observe(focusedNow: boolean): FocusVerdict {
    if (!focusedNow && this.engaged) this.engaged = false; // フォーカスが枠を離れた（余白を押した、など）。操作中は終わり
    if (this.direct) {
      this.focused = focusedNow;
      this.engaged = focusedNow;
      return null;
    }
    const changed = focusedNow && !this.focused;
    this.focused = focusedNow;
    return changed && !this.engaged ? "steal" : null;
  }

  /** 枠からの `key` の知らせを受けてよいか（操作中の `escape` だけ）。 */
  acceptKey(key: string): boolean {
    return !this.direct && this.engaged && key === "escape";
  }

  /**
   * 知らせ（`report`）を送れなかった。この画面の中で数え、`DISPLAY_FOCUS_STEAL_MAX` 回に達したら `true`（この画面の枠を外す）。
   * 送れたら数えない（サーバが pane ごとに数える）。
   */
  noteUnreported(): boolean {
    this.unreported++;
    return this.unreported >= DISPLAY_FOCUS_STEAL_MAX;
  }
}
