import type { AskAnswers } from "@sodashitsu/protocol";
// 副作用だけの import: 読み込むと `customElements.define("ask-form", …)` される（登録済みなら何もしない）。
// 部品は public_docs の ask-form から無改変で写したもの（`third_party/ask-form/README.md`。手で直さない）。
// 素の JS なので名前は取り込まない（型の宣言が無い）。要素の型は下に、Sodashitsu が使う分だけを宣言する。
import "../../../../third_party/ask-form/ask-form.js";

/** `<ask-form>` の要素（部品の公開の受け渡しのうち、Sodashitsu が使うもの）。 */
export interface AskFormElement extends HTMLElement {
  /** 定義（正規化後の `AskSpec`）。**入れるたびに全部描き直す**（入力は消える）。部品は渡した定義に書き込むので、写しを渡す。 */
  spec: unknown;
  /** 送信中。真の間は［決定］［キャンセル］が押せない。 */
  busy: boolean;
  /** 今の回答で決定する（未回答があれば、決定せずにその質問を示す）。 */
  submit(): void;
  /**
   * 次・前の質問へ移る（負の数で前、それ以外は次。表示条件で隠れている質問は飛ばし、端の質問では何もしない）。
   * 移った先の質問の入力欄（ラジオは選ばれているもの）へフォーカスが移る。描いていなければ何もしない。部品の外でキーを受けたとき用（部品 1.1.0 から）。
   */
  step(delta: number): void;
  /** 目次を出すかを決め直す（置いた側が高さを決め直したとき）。 */
  relayout(): void;
  /** 中身の高さ（質問の並び＋下のボタン）。描いていなければ 0。 */
  readonly contentHeight: number;
  /** 互換のために残る（部品 1.2.1 からページには分けない。描いていればいつも 1、描いていなければ 0）。 */
  readonly pageCount: number;
  /** 目次の幅（px）。出ていない（出さない定義・幅 768px 未満）・描いていなければ 0。置いた側が、ウィンドウの幅を広げるのに使う（部品 1.2.1 から）。 */
  readonly indexWidth: number;
}

/** `ask-submit` の `detail`（`controller.answer` の body と同じ形。`custom`・`note` は空なら項目ごと無い）。 */
export interface AskFormSubmitDetail {
  answers: AskAnswers;
  custom?: string[];
  note?: string;
}
