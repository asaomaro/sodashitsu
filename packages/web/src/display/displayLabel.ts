import type { DisplayInfo } from "@sodashitsu/protocol";

/** 固定のラベルの先頭（枠そのものの `title` などにも使う）。 */
export const DISPLAY_LABEL_PREFIX = "pane のプログラムの表示（隔離）";

/**
 * パネル・帯の見出しの**固定のラベル**（アプリが枠の外に描く文。中身・題からは変えられない）を作る唯一の関数。
 * 面の名前は `[A-Za-z0-9_-]` だけなので、似せた文言を入れられない。`DisplayInfo` の知らない項目（`source` など）は読まないので、載っていても壊れない。
 * 後の作業が「どの拡張が出したか」の文を足すのは、ここ。
 */
export function displayLabel(info: Pick<DisplayInfo, "name">): string {
  return `${DISPLAY_LABEL_PREFIX}· ${info.name}`;
}

/** 操作中の固定の文言。スクリプトが動く面は、中身が `Esc` を無効にできる場合があるので、［操作を終える］も案内する。 */
export const ENGAGED_NOTE = "入力はこの表示に届きます（Esc で端末へ）";
export const ENGAGED_NOTE_SCRIPT = "入力はこの表示に届きます（Esc か［操作を終える］で端末へ）";
export function engagedNote(info: Pick<DisplayInfo, "format">): string {
  return info.format === "script-html" ? ENGAGED_NOTE_SCRIPT : ENGAGED_NOTE;
}

/** 帯の印の `title`・`aria-label`（題を添える）。 */
export function displayBandLabel(info: Pick<DisplayInfo, "name" | "title">): string {
  return `${displayLabel(info)}: ${info.title}`;
}
