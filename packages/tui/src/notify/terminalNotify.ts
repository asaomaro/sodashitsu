/*
 * 外側の端末の判定と、デスクトップ通知の列（OSC 9・OSC 99）・tmux の包み・文字の洗いは herdr（https://github.com/herdrdev/herdr、
 * commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の `src/terminal_notify.rs`（`detect_backend`・`build_osc9_notification`・
 * `build_osc99_notification`・`sanitize_text`・`wrap_tmux_passthrough`）を TypeScript へ移し、Windows Terminal の OSC 777 と
 * 設定 `tui.notifyDelivery` の上書きを足したもの（Apache-2.0。ルートの `NOTICE` を参照）。
 */
import type { NotifyDelivery } from "../model/PrefsModel.js";

/** 実際の出し方（`auto` を判定した結果）。`none` は出さない。 */
export type Delivery = "osc9" | "osc99" | "osc777" | "bell" | "none";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * 外側の端末の判定（design「通知」）：kitty → OSC 99、ghostty・iTerm2・WezTerm → OSC 9、Windows Terminal → OSC 777（利用者が有効にしていれば出る）、
 * 判別できない → 出さない（herdr と同じ）。SSH 越しでは環境変数が届かないことが多いので、設定 `tui.notifyDelivery` で上書きできる。
 */
export function detectDelivery(env: Env): Delivery {
  switch (env["TERM_PROGRAM"]) {
    case "ghostty":
    case "iTerm.app":
    case "WezTerm":
      return "osc9";
  }
  if (env["KITTY_WINDOW_ID"]) return "osc99";
  if (env["GHOSTTY_RESOURCES_DIR"]) return "osc9";
  const term = env["TERM"] ?? "";
  if (term === "xterm-ghostty") return "osc9";
  if (term === "xterm-kitty") return "osc99";
  if (term.includes("wezterm")) return "osc9";
  if (env["WT_SESSION"]) return "osc777";
  return "none";
}

/** 設定と判定から出し方を決める。 */
export function deliveryOf(pref: NotifyDelivery, env: Env): Delivery {
  if (pref === "auto") return detectDelivery(env);
  return pref === "off" ? "none" : pref;
}

/** 判定の説明（設定画面の「自動」の注記）。 */
export function describeDelivery(d: Delivery): string {
  switch (d) {
    case "osc9":
      return "OSC 9（iTerm2・WezTerm・Ghostty）";
    case "osc99":
      return "OSC 99（kitty）";
    case "osc777":
      return "OSC 777（Windows Terminal。端末の設定で有効にしたとき）";
    case "bell":
      return "ベル";
    case "none":
      return "判別できない端末なので出さない";
  }
}

/**
 * 通知の文字から制御文字（C0・DEL・C1。ESC 無しで効く CSI〔U+009B〕・ST〔U+009C〕・CAN・SUB 等を含む）を除き、改行・タブは空白にする
 * （herdr の `sanitize_text` は ESC・BEL・ST だけ。server の `agentStart.ts` の制御文字の範囲に広げた）。
 */
export function sanitizeText(text: string): string {
  let out = "";
  for (const c of text) {
    if (c === "\n" || c === "\r" || c === "\t") out += " ";
    else if (!isControl(c.codePointAt(0)!)) out += c;
  }
  return out;
}

const isControl = (cp: number): boolean => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);

/** tmux の中なら素通しの包み（`ESC P tmux; … ESC \`。中の ESC は 2 つにする）。 */
export function wrapTmux(seq: string): string {
  return `\x1bPtmux;${seq.split("\x1b").join("\x1b\x1b")}\x1b\\`;
}

/** デスクトップ通知の列（出さないなら空）。`tmux` なら素通しの包みで。 */
export function notificationSequence(
  d: Delivery,
  title: string,
  body: string,
  tmux: boolean,
): string {
  const t = sanitizeText(title);
  const b = sanitizeText(body);
  let seq: string;
  switch (d) {
    case "osc9":
      seq = `\x1b]9;${b ? `${t}: ${b}` : t}\x1b\\`;
      break;
    case "osc99":
      seq = b ? `\x1b]99;i=1:d=0;${t}\x1b\\\x1b]99;i=1:p=body;${b}\x1b\\` : `\x1b]99;;${t}\x1b\\`;
      break;
    case "osc777":
      // `;` は欄の区切りなので、中の `;` は読点に（Windows Terminal・urxvt の notify）。
      seq = `\x1b]777;notify;${t.replace(/;/g, "，")};${b.replace(/;/g, "，")}\x1b\\`;
      break;
    case "bell":
      return "\x07";
    case "none":
      return "";
  }
  return tmux ? wrapTmux(seq) : seq;
}
