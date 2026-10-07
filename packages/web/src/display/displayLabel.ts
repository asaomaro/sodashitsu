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

/** 帯の印の `title`・`aria-label`（題を添える）。 */
export function displayBandLabel(info: Pick<DisplayInfo, "name" | "title">): string {
  return `${displayLabel(info)}: ${info.title}`;
}
