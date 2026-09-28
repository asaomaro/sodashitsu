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
