import { createHash } from "node:crypto";
import type { ExtensionScope } from "@sodashitsu/protocol";
import type { ExtensionEntry } from "./extensionConfig.js";

/**
 * 拡張の鍵（20261007-ext-host。純粋）。**承認の画面に出るものは、すべて鍵に入れる**: 1 件の全項目と、根の実体のパス。
 * 鍵に入らないもの: ファイルの中のほかの 1 件・ファイルの体裁（空白・項目の順）・コマンドが指すファイルの中身。
 * 利用者の拡張では「設定が変わったか」の検知にだけ使い、プロジェクトの拡張では承認の鍵になる（承認の記録は `ApprovalStore`。PR3）。
 */

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * 拡張 1 件の指紋（SHA-256 の 16 進 64 文字）。利用者の拡張では `root` に `""`（空）を渡す。
 * 入力は項目の順を固定した JSON（`description`・`cwd` は無ければ `null`。`allow` は並べ替える）。
 */
export function entryDigest(root: string, entry: ExtensionEntry): string {
  return sha256(
    JSON.stringify({
      v: 1,
      root,
      id: entry.id,
      command: entry.command,
      description: entry.description ?? null,
      enabled: entry.enabled,
      allow: [...entry.allow].sort(),
      onUnresponsive: entry.onUnresponsive,
      cwd: entry.cwd ?? null,
    }),
  );
}

/**
 * 拡張の `key`。利用者は `user:<id>`、プロジェクトは `project:<SHA-256(根) の 16 進 64 文字>:<id>`
 * （先頭だけに切らない。別の根が、同じ key にならないように）。
 */
export function instanceKey(scope: ExtensionScope, root: string | null, id: string): string {
  if (scope === "user") return `user:${id}`;
  if (root === null) throw new Error("project extension needs a root");
  return `project:${sha256(root)}:${id}`;
}
