import { NODE_KEY_RE, type NodeKey } from "@sodashitsu/protocol";

/**
 * ノードの鍵の組み立て・分解（20260927-agent-graph の design「protocol」）。手元の pane は `local:<paneId>`、登録したマシンの pane は
 * `<machineId>:<paneId>`（マシンの id は 32 桁の 16 進。名前は変えられるので鍵に使わない）。
 */
export const LOCAL_MACHINE = "local";
export type NodeMachine = typeof LOCAL_MACHINE | string;

export function nodeKey(machine: NodeMachine, paneId: string): NodeKey {
  return `${machine}:${paneId}`;
}

/** 形が正しくなければ null。 */
export function parseNodeKey(key: string): { machine: NodeMachine; paneId: string } | null {
  if (!NODE_KEY_RE.test(key)) return null;
  const i = key.indexOf(":");
  return { machine: key.slice(0, i), paneId: key.slice(i + 1) };
}

export function isLocalNodeKey(key: string): boolean {
  return parseNodeKey(key)?.machine === LOCAL_MACHINE;
}

/**
 * 2 つの鍵が同じマシンの pane か（どちらかの形が正しくなければ偽）。無効なノードの選び直し（`rekey_node`）は同じマシンの pane へだけ——
 * 別のマシンへ付け替えると線の意味（どこで動くか）が変わる（decisions D7-10・D8-5）。サーバ（`applyGraphOps`）・sodactl・画面がこの 1 つを使う。
 */
export function sameNodeMachine(a: string, b: string): boolean {
  const pa = parseNodeKey(a);
  const pb = parseNodeKey(b);
  return pa !== null && pb !== null && pa.machine === pb.machine;
}
