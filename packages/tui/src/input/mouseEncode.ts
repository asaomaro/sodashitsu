/*
 * pane へ送るマウスの報告の符号化は herdr（https://github.com/herdrdev/herdr、commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の
 * `src/input/encode.rs`（`encode_mouse_button`・`encode_mouse_scroll`・`encode_mouse_cb`）を TypeScript へ移したもの（Apache-2.0。ルートの `NOTICE` を参照）。
 */
import type { MouseEncoding } from "../term/PaneTerminal.js";
import type { Mods } from "./decode.js";

/** pane が受け付けているマウスの報告の種類（headless の `mouseTrackingMode`）。 */
export type MouseTracking = "none" | "x10" | "vt200" | "drag" | "any";

export interface PaneMouseEvent {
  action: "down" | "up" | "move" | "wheel";
  /** 0 左・1 中・2 右（`wheel` は 64 上・65 下。`move` でボタン無しは -1）。 */
  button: number;
  /** pane の中の桁・行（0 始まり）。 */
  col: number;
  row: number;
  mods: Mods;
}

/** その pane のモードで送る事象か（x10 は押下だけ・vt200 は押下と離す・drag はボタンを押したままの移動も・any は全部）。 */
export function trackingAccepts(mode: MouseTracking, ev: PaneMouseEvent): boolean {
  switch (mode) {
    case "none":
      return false;
    case "x10":
      return ev.action === "down" || ev.action === "wheel";
    case "vt200":
      return ev.action !== "move";
    case "drag":
      return ev.action !== "move" || ev.button >= 0;
    case "any":
      return true;
  }
}

/**
 * xterm のマウスの報告の列（herdr の `encode_mouse_cb` と同じ）。SGR（1006）は `CSI < cb ; col ; row M/m`、既定は `CSI M` と 32 足しのバイト
 * （223 を超える座標は送れない）、UTF-8（1005）は値を UTF-8 の文字で。URXVT（1015）は `CSI cb+32 ; col ; row M`。送れなければ null。
 */
export function encodeMouse(
  ev: PaneMouseEvent,
  encoding: MouseEncoding,
  tracking: MouseTracking,
): string | Uint8Array | null {
  if (!trackingAccepts(tracking, ev)) return null;
  const release = ev.action === "up";
  let base: number;
  if (ev.action === "wheel") base = ev.button;
  else if (ev.action === "move") base = 32 + (ev.button >= 0 ? ev.button : 3);
  else base = ev.button;
  const sgr = encoding === "sgr" || encoding === "sgr-pixels";
  let cb = release && !sgr ? 3 : base;
  // x10 は修飾を送らない。
  if (tracking !== "x10") {
    if (ev.mods.shift) cb += 4;
    if (ev.mods.alt) cb += 8;
    if (ev.mods.ctrl) cb += 16;
  }
  const col = ev.col + 1;
  const row = ev.row + 1;
  switch (encoding) {
    case "sgr":
    case "sgr-pixels":
      return `\x1b[<${cb};${col};${row}${release ? "m" : "M"}`;
    case "urxvt":
      return `\x1b[${cb + 32};${col};${row}M`;
    case "utf8":
      return `\x1b[M${String.fromCodePoint(cb + 32)}${String.fromCodePoint(col + 32)}${String.fromCodePoint(row + 32)}`;
    case "default":
      if (cb + 32 > 255 || col + 32 > 255 || row + 32 > 255) return null;
      // 128 以上の値を UTF-8 にしないよう、バイト列で返す。
      return Uint8Array.from([0x1b, 0x5b, 0x4d, cb + 32, col + 32, row + 32]);
  }
}
