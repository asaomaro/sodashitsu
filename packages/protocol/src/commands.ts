import type { PaneId } from "./ids.js";
import type { Pane } from "./model.js";

/**
 * 独自コマンド（20260927-custom-command-keys。herdr の `[[keys.command]]`）。定義はサーバの状態ディレクトリの `commands.json` にだけあり
 * （サーバの持ち主が書く）、ブラウザは id で呼ぶだけ——**コマンドの文字列はこの型に無い**（サーバの外へ出さない）。
 */

/**
 * コマンドの id の規則。持ち主が付け、ブラウザのキーの割り当ての保存の鍵になる（読み直しで変わらない）。小文字・数字・`-`・`_` の 1〜64 文字で、
 * 先頭は小文字か数字——保存のキー・DOM の属性・ログにそのまま使える。
 */
export const COMMAND_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const COMMAND_TYPES = ["popup", "pane", "shell"] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

/** popup の幅・高さ：セル数（整数）か `"N%"`（pane の領域の割合）。 */
export type PopupDimension = number | `${number}%`;

export const POPUP_CELLS_MAX = 1000;

/** `command.run` で popup の端末の大きさ（列・行）として受ける範囲。ブラウザの大きさの計算もこれに収める。 */
export const POPUP_RUN_SIZE_MIN = 2;
export const POPUP_RUN_SIZE_MAX = 500;

/**
 * popup の幅・高さを解釈する（サーバの設定の検証とブラウザの大きさの計算で同じ規則を使う）。セル数は 1〜1000 の整数、割合は `"N%"`（N は 1〜100 の整数。
 * 先頭の 0・小数・空白は不可）。それ以外は null。
 */
export function parsePopupDimension(
  v: unknown,
): { kind: "cells"; value: number } | { kind: "percent"; value: number } | null {
  if (typeof v === "number")
    return Number.isInteger(v) && v >= 1 && v <= POPUP_CELLS_MAX
      ? { kind: "cells", value: v }
      : null;
  if (typeof v !== "string") return null;
  const m = /^([1-9][0-9]{0,2})%$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 100 ? { kind: "percent", value: n } : null;
}

/** ブラウザへ渡す 1 件（**コマンドの文字列を含まない**）。`width`・`height` は `popup` のときだけ。 */
export interface CommandInfo {
  id: string;
  type: CommandType;
  description?: string;
  width?: PopupDimension;
  height?: PopupDimension;
}

/** 一覧。`problem` は設定ファイルを採らなかった理由（採ったなら null）。理由にコマンドの文字列は入らない。 */
export interface CommandListResult {
  commands: CommandInfo[];
  problem: string | null;
}

/** `command.run` の結果。`popup` の `popupId` はモデルに入らない端末の id（`pane.subscribe`・INPUT フレームで使う）。 */
export type CommandRunResult =
  | { type: "shell" }
  | { type: "pane"; pane: Pane }
  | { type: "popup"; popupId: PaneId; cols: number; rows: number };
