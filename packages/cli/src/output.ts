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
