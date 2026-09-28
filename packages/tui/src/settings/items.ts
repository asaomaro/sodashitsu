import type { KeyInput } from "@sodashitsu/client-core";

/**
 * 設定画面の項目の形（20260927-cli-mode の design「設定画面（端末版）」）。画面（`modes/SettingsDialog.ts`）は項目の意味を知らず、
 * 項目が返す「次にすること」（`Activation`）に従って、選択肢の一覧・入力欄・キーの取り込み待ち・確認を出すだけ。
 * 項目は描くたびに今の設定から作り直す（変えた結果がすぐ見える。web と同じく変更は項目ごとに即座に反映）。
 */

/** 押した後の続き。文字列は結果の知らせ（画面の下の 1 行）、`void` は一覧へ戻るだけ。 */
export type Outcome = void | string | Activation;

export interface ChoiceOption {
  label: string;
  /** 今の値（印を付け、開いたときにそこを選ぶ）。 */
  current?: boolean;
  /** 選べない見出し（「暗いテーマ」等）。 */
  heading?: boolean;
}

export type Activation =
  | { kind: "choose"; title: string; options: ChoiceOption[]; pick(index: number): Outcome }
  | {
      kind: "edit";
      title: string;
      initial: string;
      /** 確定。文字列を返せば知らせ（検証で通らなければその理由。入力欄は閉じる）。 */
      commit(text: string): Outcome;
    }
  | {
      kind: "capture";
      /** 取り込み待ちの案内（Esc で取り消しを添える）。 */
      hint: string;
      /** 押したキー。`wait` は取り込みを続ける（修飾キー単体など。`message` は出してよい）。 */
      accept(k: KeyInput): { wait: true; message?: string } | { wait?: false; outcome: Outcome };
    }
  | { kind: "confirm"; title: string; yesLabel: string; yes(): Outcome };

export interface SettingItem {
  label: string;
  /** 右に出す今の値。 */
  value?: string;
  /** 選んでいるときに下へ出す説明。 */
  note?: string;
  /** 群の見出し（選べない）。 */
  heading?: boolean;
  /** 今は操作できない（理由は `note`）。 */
  disabled?: boolean;
  /** 入切の項目（Space でも切り替わる）。 */
  toggle?: boolean;
  activate?(): Outcome;
}

export interface SettingsSection {
  id: string;
  label: string;
  items(): SettingItem[];
}

export const onOff = (v: boolean): string => (v ? "入" : "切");
