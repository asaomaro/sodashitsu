import type { ExtensionListResult, ExtensionLogResult } from "@sodashitsu/protocol";
import { CliUsageError, EXT_USAGE, type Command } from "../cliArgs.js";
import { printJson } from "../output.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/**
 * `sodactl ext`（20261007-ext-host）。拡張の一覧・ログ・読み直し・起動し直し。`/ws` の経路だけ（`pane.sock` には何も載っていない）。
 * 承認・取り消し・有効と無効のサブコマンドは作らない（画面でする）。古いサーバ（`extension.list` が `not_found`）は
 * `{"status":"unsupported",…}` で終了コード 0。
 */

type ExtCmd = Extract<Command, { kind: "ext" }>;

export const EXT_UNSUPPORTED_REASON = "このサーバは拡張に対応していません";

/**
 * `<id|key>` を拡張の `key` に引く: `key` の完全一致 → `id` が 1 つに決まるもの → 2 つ以上は使い方の誤り（候補の `key` を並べる）→ 無ければ `not_found`。
 */
export function resolveExtRef(list: ExtensionListResult, ref: string): string {
  const byKey = list.extensions.find((e) => e.key === ref);
  if (byKey) return byKey.key;
  const byId = list.extensions.filter((e) => e.id === ref);
  if (byId.length === 1) return byId[0]!.key;
  if (byId.length > 1) {
    throw new CliUsageError(
      `ambiguous extension id: ${ref}`,
      `同じ id の拡張が複数あります。key で指定してください:\n${byId.map((e) => `  ${e.key}`).join("\n")}\n${EXT_USAGE}`,
    );
  }
  throw new RpcFailure("not_found", `extension not found: ${ref.slice(0, 80)}`);
}

export async function runExt(cmd: ExtCmd, store: SessionStore): Promise<void> {
  const out = await withSession(cmd.opts, store, async (client: SodaClient) => {
    await client.hello();
    // 先に list を呼ぶ: 知らない方式（古いサーバ）の `not_found` と、「その拡張が無い」の `not_found` を見分けるため。
    let list: ExtensionListResult;
    try {
      list = await client.request("extension.list", {});
    } catch (err) {
      if (err instanceof RpcFailure && err.code === "not_found") return { status: "unsupported", reason: EXT_UNSUPPORTED_REASON };
      throw err;
    }
    switch (cmd.action.kind) {
      case "list":
        return { status: "ok", extensions: list.extensions, problems: list.problems, userConfigPath: list.userConfigPath };
      case "reload": {
        const r = await client.request("extension.reload", {});
        return { status: "ok", extensions: r.extensions, problems: r.problems, userConfigPath: r.userConfigPath };
      }
      case "log": {
        const key = resolveExtRef(list, cmd.action.ref);
        const r: ExtensionLogResult = await client.request("extension.log", { key });
        return { status: "ok", key, lines: r.lines, dropped: r.dropped };
      }
      case "restart": {
        const key = resolveExtRef(list, cmd.action.ref);
        await client.request("extension.restart", { key });
        return { status: "ok", key };
      }
    }
  });
  printJson(out);
}
