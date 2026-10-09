import type { NodeKey, Tab, Workspace } from "@sodashitsu/protocol";
import type { GraphRect } from "./geometry.js";
import {
  frameRectOf,
  frames,
  placeFrame,
  type LayoutFrame,
  type LayoutStructure,
  type NodePositions,
} from "./graphLayout.js";
import { LOCAL_MACHINE, parseNodeKey } from "./nodeKey.js";

/**
 * グラフの空間（グループ 1 つか「グループなし」）の表示用の導出（20261008-graph-first の PR1c T11a）。**保存しない**。座標は全体で 1 枚の面のまま（D8）で、
 * 空間は「どのノード・囲いを出すか」の絞り込み。ブラウザ（画面）が使う純粋な関数。サーバ・`sodactl` の構成（`graphStructureFrom`）をそのまま使う。
 */

export interface GraphSpaceView {
  /** `g:<groupId>` か `u`（グループなし）。 */
  id: string;
  /** 見出しの並びに出す名前。 */
  label: string;
  /** 含む囲いの数（workspace と、別のマシンの囲い）。見出しの数。 */
  count: number;
  /** 含む手元の workspace の id（項目の並びの順）。 */
  workspaceIds: string[];
  /** 含むノードの鍵（手元・別のマシン）。 */
  nodeKeys: NodeKey[];
}

/** 「グループなし」の空間の名前。 */
export const UNGROUPED_SPACE_LABEL = "グループなし";

/** 空間の一覧（サイドバーのグループの並びの順）。グループの名前は `groupLabel` で引く（無ければ id）。 */
export function deriveGraphSpaces(
  structure: LayoutStructure,
  groupLabel: (groupId: string) => string | undefined,
): GraphSpaceView[] {
  return structure.spaces.map((sp) => {
    const members = sp.tops.flatMap((t) => [...t.members]);
    const groupId = sp.id.startsWith("g:") ? sp.id.slice(2) : null;
    return {
      id: sp.id,
      label: groupId === null ? UNGROUPED_SPACE_LABEL : (groupLabel(groupId) ?? groupId),
      count: members.length,
      workspaceIds: sp.tops.flatMap((t) =>
        t.kind === "machine" ? [] : t.members.map((m) => m.id),
      ),
      nodeKeys: members.flatMap((m) => [...m.nodes]),
    };
  });
}

/** ノードの鍵 → 属する空間の id。 */
export function spaceOfNodeMap(structure: LayoutStructure): Map<string, string> {
  const out = new Map<string, string>();
  for (const sp of structure.spaces)
    for (const t of sp.tops) for (const m of t.members) for (const k of m.nodes) out.set(k, sp.id);
  return out;
}

/** workspace（メンバー）の id → 属する空間の id。 */
export function spaceOfMemberMap(structure: LayoutStructure): Map<string, string> {
  const out = new Map<string, string>();
  for (const sp of structure.spaces)
    for (const t of sp.tops) for (const m of t.members) out.set(m.id, sp.id);
  return out;
}

/** 囲いの見出しに出すもの。 */
export interface FrameInfo {
  id: string;
  kind: "worktree" | "workspace" | "machine";
  parentId: string | null;
  spaceId: string;
  /** 太字の名前。 */
  title: string;
  /** フォルダ（末尾の名前）。無ければ null。 */
  folder: string | null;
  /** ブランチ。無ければ null。 */
  branch: string | null;
  /** workspace の tab の並び（`active` は workspace で選ばれている tab〔サーバの値〕）。workspace 以外は空。 */
  tabs: { id: string; label: string; active: boolean }[];
  /** worktree グループなら worktree の数。それ以外は null。 */
  worktreeCount: number | null;
  /** この囲いに属するメンバー（workspace）の id（worktree グループなら中のすべて。workspace・machine なら自分だけ）。 */
  memberIds: string[];
}

export interface FrameInfoSource {
  workspaces: readonly Workspace[];
  tabs: readonly Tab[];
}

function folderName(cwd: string | undefined): string | null {
  if (cwd === undefined) return null;
  const trimmed = cwd.replace(/[\\/]+$/, "");
  if (trimmed === "") return cwd === "" ? null : cwd;
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const name = trimmed.slice(i + 1);
  return name === "" ? trimmed : name;
}

/** 囲い（`frames()` の id）→ 見出しの情報。`machineLabel` は別のマシンの呼び名。 */
export function frameInfos(
  structure: LayoutStructure,
  src: FrameInfoSource,
  machineLabel: (machineId: string) => string,
): Map<string, FrameInfo> {
  const wsById = new Map(src.workspaces.map((w) => [w.id, w]));
  const tabById = new Map(src.tabs.map((t) => [t.id, t]));
  const out = new Map<string, FrameInfo>();
  const workspaceInfo = (
    wsId: string,
    spaceId: string,
    parentId: string | null,
  ): FrameInfo | null => {
    const ws = wsById.get(wsId);
    if (ws === undefined) return null;
    return {
      id: ws.id,
      kind: "workspace",
      parentId,
      spaceId,
      title: ws.label,
      folder: folderName(ws.cwd),
      branch: ws.git?.branch ?? null,
      tabs: (ws.tabIds ?? []).flatMap((id) => {
        const t = tabById.get(id);
        return t === undefined ? [] : [{ id, label: t.label, active: id === ws.activeTabId }];
      }),
      worktreeCount: null,
      memberIds: [ws.id],
    };
  };
  for (const sp of structure.spaces) {
    for (const top of sp.tops) {
      if (top.kind === "machine") {
        const m = top.members[0];
        if (m === undefined) continue;
        const machineId = m.id.startsWith("m:") ? m.id.slice(2) : m.id;
        out.set(m.id, {
          id: m.id,
          kind: "machine",
          parentId: null,
          spaceId: sp.id,
          title: machineLabel(machineId),
          folder: null,
          branch: null,
          tabs: [],
          worktreeCount: null,
          memberIds: [m.id],
        });
      } else if (top.kind === "worktree") {
        const head = wsById.get(top.members[0]?.id ?? "");
        out.set(top.id, {
          id: top.id,
          kind: "worktree",
          parentId: null,
          spaceId: sp.id,
          title: head?.label ?? top.id,
          folder: null,
          branch: null,
          tabs: [],
          worktreeCount: top.members.length,
          memberIds: top.members.map((m) => m.id),
        });
        for (const m of top.members) {
          const info = workspaceInfo(m.id, sp.id, top.id);
          if (info !== null) out.set(m.id, info);
        }
      } else {
        const m = top.members[0];
        const info = m === undefined ? null : workspaceInfo(m.id, sp.id, null);
        if (info !== null) out.set(info.id, info);
      }
    }
  }
  return out;
}

/** 表示する囲い（`LayoutFrame` に、ノードの無い workspace の仮の囲いを足したもの）。 */
export interface DisplayFrame extends LayoutFrame {
  /** サーバがまだノードを足していない workspace の、見出しだけの仮の囲い。 */
  placeholder: boolean;
}

/**
 * 空間 `spaceId` の囲いの一覧（囲いは重ならない決まり。仮の囲いは、置き場所の計算の結果の位置に 1 つずつ置く）。
 * 最上位の囲いが先、worktree グループなら続きがメンバーの囲い。
 */
export function displayFrames(
  structure: LayoutStructure,
  positions: NodePositions,
  spaceId: string,
): DisplayFrame[] {
  const space = structure.spaces.find((s) => s.id === spaceId);
  if (space === undefined) return [];
  const all = frames(structure, positions);
  const topIds = new Set(space.tops.map((t) => t.id));
  const memberIds = new Set(space.tops.flatMap((t) => t.members.map((m) => m.id)));
  const out: DisplayFrame[] = all
    .filter((f) => topIds.has(f.id) || memberIds.has(f.id))
    .map((f) => ({ ...f, placeholder: false }));

  // ノードの無い workspace（手元）。仮の位置は、それまでに決めた仮の囲いも含めて重ならないように 1 つずつ。
  const drawn = new Set(out.map((f) => f.id));
  const withGhost = new Map(positions);
  let ghostStructure = structure;
  for (const top of space.tops) {
    if (top.kind === "machine") continue;
    for (const m of top.members) {
      if (drawn.has(m.id) || m.nodes.length > 0) continue;
      const ghostKey = `${LOCAL_MACHINE}:__placeholder_${m.id}`;
      const p = placeFrame(ghostStructure, withGhost, m.id);
      const rect = frameRectOf([{ x: p.x, y: p.y }]);
      if (rect === null) continue;
      withGhost.set(ghostKey, { x: p.x, y: p.y });
      ghostStructure = {
        spaces: ghostStructure.spaces.map((sp) => ({
          ...sp,
          tops: sp.tops.map((t) => ({
            ...t,
            members: t.members.map((mm) =>
              mm.id === m.id ? { ...mm, nodes: [...mm.nodes, ghostKey as NodeKey] } : mm,
            ),
          })),
        })),
      };
      out.push({
        id: m.id,
        kind: "workspace",
        parentId: top.kind === "worktree" ? top.id : null,
        rect,
        placeholder: true,
      });
    }
  }
  return out;
}

/** 四角の並びの外接（無ければ null）。空間の全体表示に使う。 */
export function unionOfRects(rects: readonly GraphRect[]): GraphRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** ノードの鍵のマシン（手元は `local`）。形が正しくなければ null。 */
export function machineOfKey(key: string): string | null {
  return parseNodeKey(key)?.machine ?? null;
}
