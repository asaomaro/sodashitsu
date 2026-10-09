import { stateLabel } from "@sodashitsu/client-core";
import type { GraphNodeInfo } from "../../store/graph.js";

/**
 * ノードの 2 行の文字（20261008-graph-first の PR1e T17a。AC-L1）。スナップショットにある情報だけを使う（無い情報は出さない）。
 * - 1 行目: エージェントの付けた名前 → pane の付けた名前 → エージェントの種類の名前 → （エージェントが居ない手元の pane は）いまの場所の末尾 → `pane <id>`。
 *   **手元の pane は、pane の題（`user@host: …`）を出さない**。別のマシンの pane は、要約の呼び名（`info.name`）のまま。
 * - 2 行目: エージェントが居れば「種類 ・ 状態の語」。居なければ「シェル ・ いまの場所の末尾」（1 行目と同じなら「シェル」だけ）。別のマシンの pane は、頭にマシンの名前。
 * 状態の語は、サイドバーの agents の行と同じ（`stateLabel`）。
 */
export interface NodeText {
  /** 1 行目の名前。 */
  name: string;
  /** 2 行目の頭のマシンの名前（別のマシンの pane だけ）。 */
  machine: string | null;
  /** 2 行目: エージェントの種類（居なければ「シェル」）。 */
  kind: string;
  /** 2 行目: 状態の語（エージェントが居て、状態が分かるとき）。 */
  state: string | null;
  /** 2 行目: シェルの場所の末尾（エージェントが居ないときで、1 行目と違うとき）。 */
  place: string | null;
}

/** パスの末尾（空・`/` だけなら null）。 */
export function pathTail(path: string | null): string | null {
  if (!path) return null;
  const t = path.replace(/[\\/]+$/, "");
  if (t === "") return null;
  return t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\")) + 1) || null;
}

export function nodeText(info: GraphNodeInfo): NodeText {
  const a = info.agent;
  const tail = pathTail(info.cwd);
  const agentName = a?.name || null;
  let name: string;
  if (!info.local) name = info.name;
  else name = agentName ?? info.label ?? a?.label ?? tail ?? info.name;
  const machine = info.local ? null : info.machineLabel;
  if (a) {
    return { name, machine, kind: a.label || a.kind, state: info.state === null ? null : stateLabel(info.state), place: null };
  }
  return { name, machine, kind: "シェル", state: null, place: tail !== null && tail !== name ? tail : null };
}
