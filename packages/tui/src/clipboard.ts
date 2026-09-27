/**
 * 外側の端末のクリップボードへ書く列（OSC 52。SSH 越しでも効く唯一の手段。research-rendering §4.2）。一部の端末は BEL 終端しか受けないので BEL で終える
 * （herdr の `selection.rs` と同じ）。手元の OS の道具への落とし（VTE 等）と tmux の中の扱いは 05 の `clipboard.ts` で足す。
 */
export function osc52(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`;
}
