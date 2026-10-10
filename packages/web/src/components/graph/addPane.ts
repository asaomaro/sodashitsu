import { clientErrorMessage, errorCodeOf } from "@sodashitsu/client-core";
import type { GraphOp, NewCwd, NodeKey, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { isValidAgentName } from "@sodashitsu/protocol";

/**
 * グラフから pane を足す進行（20261008-graph-first の PR3 T14c・T14d。decisions D88・D89）。窓を開く・ノードを選ぶ・フォームの表示は、呼ぶ側（`GraphCanvas`）。
 *
 * 1. 分割する pane: その workspace で選ばれている tab の、最後にフォーカスのあった pane。向きは、桁が行の 2 倍以上なら右・そうでなければ下。
 * 2. `pane.split`（場所は基本画面と同じ設定）→ 新しい pane の id。
 * 3. （エージェントなら）`agent.start`。**送るのは種類の id・名前・`paneId` と、空の `args` だけ**（実行ファイルの文字列・引数は送らない）。新しいシェルの準備が間に合わず `agent_pane_busy`
 *    のときは、8 回（300ms 間隔）までやり直す。
 * 4. ノードが出るまで待つ（サーバが足す）→ 監督の線（`graph.update`）。
 * 失敗は `AddPaneError`（理由の文言つき）。pane を足した後の失敗は `paneId` を持つ——やり直しは、その pane を使う（また分割しない）。
 */
export class AddPaneError extends Error {
  constructor(
    message: string,
    /** すでに足した pane（あれば）。 */
    readonly paneId: string | null = null,
  ) {
    super(message);
  }
}

export interface AddPaneInput {
  workspaceId: string;
  /** `"shell"` か、エージェントの種類の id（`agent.kinds` の `kind`）。 */
  kind: string;
  /** エージェントの名前（空なら自動）。シェルでは使わない。 */
  name: string;
  /** 監督役にするノードの鍵（エージェントのときだけ使う）。 */
  supervisorKey: string | null;
  /** 前の試みで足した pane（エージェントの起動だけやり直すとき）。 */
  existingPaneId?: string | null;
}

export interface AddPaneDeps {
  conn: { request(method: string, params: unknown): Promise<unknown> };
  workspaces: ReadonlyMap<string, Workspace>;
  tabs: ReadonlyMap<string, Tab>;
  panes: ReadonlyMap<string, Pane>;
  /** 基本画面と同じ「新しい pane の場所」の設定から作った値（分割する pane の id を渡す）。 */
  newCwdFor(sourcePaneId: string): NewCwd;
  /** グラフにそのノードがある。 */
  hasNode(key: string): boolean;
  /** グラフを更新する（`store/graph` の `update`）。 */
  updateGraph(build: () => GraphOp[]): Promise<{ ok: true } | { ok: false; message: string }>;
  /** 使われているエージェントの名前（自動の名前の重なりを避ける）。 */
  agentNames(): ReadonlySet<string>;
  sleep(ms: number): Promise<void>;
  /** pane・ノードが現れるまで待つ上限（ms）。 */
  waitMs?: number;
}

export interface AddPaneHooks {
  /** 新しい pane ができて、画面（session）にも届いた。 */
  onPane?(paneId: string): void;
  /** ノードが出た（ここで、選ぶ・窓を開く）。 */
  onNode?(key: string, paneId: string): void;
  /** いま何をしているか（フォームに出す）。 */
  onStep?(text: string): void;
}

const BUSY_RETRIES = 8;
const BUSY_INTERVAL_MS = 300;
const POLL_MS = 100;

/** 分割する pane（その workspace の選ばれている tab の、最後にフォーカスのあった pane）。無ければ null。 */
export function splitSourceOf(deps: Pick<AddPaneDeps, "workspaces" | "tabs" | "panes">, workspaceId: string): Pane | null {
  const ws = deps.workspaces.get(workspaceId);
  if (!ws) return null;
  const tab = deps.tabs.get(ws.activeTabId) ?? ws.tabIds.map((id) => deps.tabs.get(id)).find((t) => t !== undefined);
  if (!tab) return null;
  const focused = deps.panes.get(tab.focusedPaneId);
  if (focused && focused.tabId === tab.id) return focused;
  for (const p of deps.panes.values()) if (p.tabId === tab.id) return p;
  return null;
}

/** 向き: 桁が行の 2 倍以上なら右（文字は縦長なので、桁 : 行 = 2 : 1 が見かけの正方形）、そうでなければ下。 */
export function splitDirectionOf(pane: Pick<Pane, "cols" | "rows">): "right" | "down" {
  return pane.cols >= pane.rows * 2 ? "right" : "down";
}

/** 自動の名前: 種類の id（名前の書式に合わない文字は落とす）に連番。 */
export function autoAgentName(kind: string, used: ReadonlySet<string>): string {
  const base = kind.toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[^a-z]+/, "") || "agent";
  for (let n = 1; n < 1000; n++) {
    const name = `${base.slice(0, 28)}-${n}`;
    if (!used.has(name)) return name;
  }
  return `${base.slice(0, 20)}-${Date.now() % 100000}`;
}

function fail(err: unknown, prefix: string, paneId: string | null): AddPaneError {
  const code = errorCodeOf(err);
  const detail = code === null ? (err instanceof Error ? err.message : "不明なエラー") : clientErrorMessage(code);
  return new AddPaneError(`${prefix}${detail}`, paneId);
}

export async function addPane(deps: AddPaneDeps, input: AddPaneInput, hooks: AddPaneHooks = {}): Promise<{ paneId: string; key: string }> {
  const waitMs = deps.waitMs ?? 5000;
  const isAgent = input.kind !== "shell";
  if (isAgent && input.name !== "" && !isValidAgentName(input.name)) {
    throw new AddPaneError(clientErrorMessage("invalid_agent_name"));
  }
  let paneId = input.existingPaneId ?? null;
  if (paneId === null) {
    const source = splitSourceOf(deps, input.workspaceId);
    if (!source) throw new AddPaneError("この workspace に、分割できる pane がありません。");
    hooks.onStep?.("pane を足しています…");
    try {
      const r = (await deps.conn.request("pane.split", {
        paneId: source.id,
        direction: splitDirectionOf(source),
        newCwd: deps.newCwdFor(source.id),
      })) as { pane: Pane };
      paneId = r.pane.id;
    } catch (err) {
      throw fail(err, "pane を足せませんでした。", null);
    }
  }
  const key = `local:${paneId}`;
  // 画面（session）に新しい pane が届くまで待つ（窓を開く前提）。
  const t0 = Date.now();
  while (!deps.panes.has(paneId) && Date.now() - t0 < waitMs) await deps.sleep(POLL_MS);
  hooks.onPane?.(paneId);
  while (!deps.hasNode(key) && Date.now() - t0 < waitMs) await deps.sleep(POLL_MS);
  if (!deps.hasNode(key)) throw new AddPaneError("pane は足しましたが、グラフのノードがまだ出ません。しばらくしてから見てください。", paneId);
  hooks.onNode?.(key, paneId);

  if (isAgent) {
    hooks.onStep?.("エージェントを起動しています…");
    const name = input.name !== "" ? input.name : autoAgentName(input.kind, deps.agentNames());
    let lastErr: unknown = null;
    let started = false;
    for (let i = 0; i <= BUSY_RETRIES; i++) {
      try {
        // 送るのは、種類の id・名前・pane の id と、空の args だけ（任意のコマンドの文字列は送らない。decisions D88）。
        await deps.conn.request("agent.start", { name, kind: input.kind, paneId, args: [] });
        started = true;
        break;
      } catch (err) {
        lastErr = err;
        if (errorCodeOf(err) !== "agent_pane_busy" || i === BUSY_RETRIES) break;
        await deps.sleep(BUSY_INTERVAL_MS);
      }
    }
    if (!started) throw fail(lastErr, "pane は足しましたが、エージェントを起動できませんでした。", paneId);
    if (input.supervisorKey !== null && input.supervisorKey !== key) {
      const sup = input.supervisorKey;
      const r = await deps.updateGraph(() => [{ op: "add_link", kind: "supervise", from: key as NodeKey, to: sup as NodeKey }]);
      if (!r.ok) throw new AddPaneError(`エージェントは起動しましたが、監督の線を結べませんでした（${r.message}）。`, paneId);
    }
  }
  return { paneId, key };
}
