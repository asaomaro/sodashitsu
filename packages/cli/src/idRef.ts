import { UUID_RE, type SessionSnapshot } from "@sodashitsu/protocol";
import type { GlobalOpts } from "./cliArgs.js";
import type { SessionStore } from "./session.js";
import { withSession } from "./withSession.js";
import { RpcFailure } from "./wsClient.js";

/**
 * 実体の id（UUID）の指定の解決。UUID は長いので、`sodactl` の pane・tab・workspace の指定は、完全な id か、**一意に決まる先頭の部分**（4 文字以上）を受ける。
 * 部分はつないだ先の snapshot（hello）の一覧から完全な id に直してから送る（サーバは完全な id しか受けない）。
 *
 * - 完全に一致する id があればそれ（部分としても一致する別の id があっても、完全一致が先）。
 * - 部分が 1 つに決まればその id。2 つ以上に当たるなら `id_ambiguous`（候補を並べる）。
 * - どれにも当たらない・4 文字未満なら、指定をそのまま返す（無い id への既存の扱い〔`not_found` など〕に任せる）。
 */
export const ID_PREFIX_MIN = 4;
/** 先頭の部分として扱う文字列（UUID の先頭になりうる文字だけ。エージェントの名前などを取り違えない）。 */
const PREFIX_RE = /^[0-9a-f-]+$/;

export function canBePrefix(spec: string): boolean {
  return spec.length >= ID_PREFIX_MIN && PREFIX_RE.test(spec);
}

export function resolveIdRef(ids: readonly string[], spec: string, what: string): string {
  if (!canBePrefix(spec) || ids.includes(spec)) return spec;
  const hits = ids.filter((id) => id.startsWith(spec));
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) {
    throw new RpcFailure(
      "id_ambiguous",
      `${what} ${spec} is ambiguous; candidates: ${hits.join(", ")} (give a longer prefix or the full id)`,
    );
  }
  return spec;
}

export function resolvePaneRef(snapshot: SessionSnapshot, spec: string): string {
  if (!canBePrefix(spec)) return spec;
  return resolveIdRef(
    snapshot.panes.map((p) => p.id),
    spec,
    "pane",
  );
}

export function resolveTabRef(snapshot: SessionSnapshot, spec: string): string {
  if (!canBePrefix(spec)) return spec;
  return resolveIdRef(
    snapshot.tabs.map((t) => t.id),
    spec,
    "tab",
  );
}

export function resolveWorkspaceRef(snapshot: SessionSnapshot, spec: string): string {
  if (!canBePrefix(spec)) return spec;
  return resolveIdRef(
    snapshot.workspaces.map((w) => w.id),
    spec,
    "workspace",
  );
}

/** 先頭の部分かもしれない指定か（完全な UUID・UUID の先頭になりえない文字列なら、一覧を引かずにそのまま使う）。 */
export function needsLookup(spec: string): boolean {
  return canBePrefix(spec) && !UUID_RE.test(spec);
}

/**
 * 接続の前に pane の指定を決めたいコマンド（`pane attach|observe|control`。イベントの受け口を hello の前に作る）用。完全な UUID ならそのまま、
 * そうでなければ別に 1 回つないで snapshot から解決する。
 */
export async function resolvePaneRefViaConnect(
  opts: GlobalOpts,
  store: SessionStore,
  spec: string,
): Promise<string> {
  if (!needsLookup(spec)) return spec;
  return withSession(opts, store, async (client) => resolvePaneRef((await client.hello()).snapshot, spec));
}
