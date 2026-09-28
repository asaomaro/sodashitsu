import { CliUsageError } from "./cliArgs.js";
import { UnauthenticatedError } from "./withSession.js";
import { AuthError, RpcFailure } from "./wsClient.js";

/**
 * 終了コードと出力の整形（design.md「終了コードと出力（FR13）」）。
 * 0=成功 / 1=サーバ・プロトコル・認証のエラー（stderr へ JSON）/ 2=CLI 使用誤り（stderr へ人が読める行）。
 */

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

export function printLine(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

/**
 * 改行を付け足さずそのまま stdout へ書く（`pane read --follow` の継続出力用。T9）。
 * `printLine` は「1回で完結する1つの出力」を想定しており、パネの OUTPUT のような継続ストリームに
 * 使うと chunk ごとに余計な改行が混じる（chunk は行区切りとは限らない）。
 */
export function printRaw(text: string): void {
  process.stdout.write(text);
}

/**
 * 端末での見た目の幅（全角・CJK は 2、それ以外は 1）。表の桁をそろえるだけの目安（結合文字・絵文字の細かい幅は見ない）。
 */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1faff) ||
      (c >= 0x20000 && c <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}

/* eslint-disable no-control-regex -- 制御文字を逃がすための正規表現 */
/** 端末へそのまま出さない文字（server の `machineRules` の `CONTROL_RE` と同じ集合: C0・DEL・C1・LRM/RLM・行/段落の区切り・双方向の上書き）。 */
const TABLE_CONTROL_RE =
  /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
/* eslint-enable no-control-regex */

/**
 * 表に出す文字列の制御文字を `\uXXXX` の形に逃がす（g05 点検。履歴の文面〔受け渡した画面の文章〕などに混ざった C1・双方向の上書きで、
 * 利用者の端末の表示を偽装させない）。
 */
export function escapeControl(text: string): string {
  return text.replace(
    TABLE_CONTROL_RE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * 見出しと行を、列の幅をそろえた表の文字列にする（`soda session list` と同じく空白 2 つで区切り、最後の列は詰めない。行末の空白は落とす）。
 * 20260927-agent-graph の `sodactl graph` の表で使う。セルの制御文字は `escapeControl` で逃がす。
 */
export function formatTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  // 中身の制御文字は逃がしてから幅を測る（どの列も利用者やエージェントが書いた文字を含みうる）。
  const all = [header, ...rows].map((r) => r.map(escapeControl));
  const widths = header.map((_, i) => Math.max(...all.map((r) => displayWidth(r[i] ?? ""))));
  return all
    .map((r) =>
      r
        .map((cell, i) =>
          i === r.length - 1 ? cell : cell + " ".repeat(widths[i]! - displayWidth(cell)),
        )
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

interface Classified {
  code: string;
  message: string;
}

function classify(err: unknown): Classified {
  if (err instanceof UnauthenticatedError) return { code: "unauthenticated", message: err.message };
  if (err instanceof AuthError) return { code: "invalid_token", message: err.message };
  if (err instanceof RpcFailure) return { code: err.code, message: err.message };
  if (err instanceof Error) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 403) return { code: "forbidden", message: err.message };
    return { code: "internal", message: err.message };
  }
  return { code: "internal", message: String(err) };
}

/**
 * `err` を分類して stderr へ出し、対応する終了コードでプロセスを終える。
 * **戻り値は `never` にしない（`void`）**——`process.exit` 自体は `@types/node` 上 `never` を返すが、
 * 単体テストで `vi.spyOn(process, "exit").mockImplementation(...)` のように差し替えると実際には
 * 戻ってくる。関数を `never` にすると、その場合に備えた `process.exit(...)` 直後の `return` が
 * 「`never` な関数で値を返そうとしている」として型エラーになり（`return;` も `undefined` を返す扱い）、
 * かといって `throw` で塞ぐと今度はテスト側の `mockImplementation` の意図（呼び出しを記録するだけで
 * 実際には投げない）と衝突する。`void` にして `return;` を素直に書けるようにした（T6 taskcheck で
 * 実機の vitest により、`return` を欠いた版が CLI 使用誤りの分岐から JSON エラーの分岐へ
 * 「落ちる」ことを実際に検出したため、`return` 自体は必須）。
 */
export function reportAndExit(err: unknown): void {
  if (err instanceof CliUsageError) {
    console.error(`sodactl: ${err.message}`);
    console.error(err.hint);
    process.exit(2);
    return;
  }
  const { code, message } = classify(err);
  process.stderr.write(JSON.stringify({ error: { code, message } }) + "\n");
  process.exit(1);
  return;
}
