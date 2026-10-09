import type { GraphLink } from "@sodashitsu/protocol";

/**
 * pane・workspace を閉じると消えるグラフの線の本数（20261008-graph-first の PR3 T14e）。閉じる確認（基本画面と同じ `ConfirmDialog`）が「グラフの線 N 本も消えます」と添える。
 * 0 本なら何も足さない（基本画面は変わらない）。対象は手元（`local:`）の pane の鍵。
 */
export function linksTouching(links: readonly GraphLink[], paneIds: Iterable<string>): number {
  const keys = new Set([...paneIds].map((id) => `local:${id}`));
  return links.filter((l) => keys.has(l.from) || keys.has(l.to)).length;
}

export type CloseTarget = { type: "pane" | "tab" | "workspace"; id: string };

/** 閉じる対象（pane・tab・workspace）に含まれる pane の id。 */
export function paneIdsOfTargets(
  targets: readonly CloseTarget[],
  session: {
    panes: ReadonlyMap<string, { id: string; tabId: string }>;
    tabs: ReadonlyMap<string, { id: string; workspaceId?: string }>;
    workspaces: ReadonlyMap<string, { tabIds: readonly string[] }>;
  },
): Set<string> {
  const out = new Set<string>();
  for (const t of targets) {
    if (t.type === "pane") out.add(t.id);
    else {
      const tabIds = t.type === "tab" ? [t.id] : (session.workspaces.get(t.id)?.tabIds ?? []);
      for (const p of session.panes.values()) if (tabIds.includes(p.tabId)) out.add(p.id);
    }
  }
  return out;
}
