import { readFileSync } from "node:fs";

/**
 * プロセスの祖先の pid（自分自身から、親へ。init の手前まで。20261009-agent-session-attribution）。Linux の `/proc` が読めないとき（他の OS・
 * 既に終わったプロセス・権限）は `null`。報告したエージェントのプロセスが、その pane のシェルの子孫かを確かめるのに使う。
 */
export function procAncestors(pid: number, read: (path: string) => string = (p) => readFileSync(p, "utf8"), platform: string = process.platform): number[] | null {
  if (platform !== "linux" || !Number.isInteger(pid) || pid <= 0) return null;
  const chain: number[] = [];
  let cur = pid;
  for (let i = 0; i < 64 && cur > 1; i++) {
    chain.push(cur);
    let raw: string;
    try {
      raw = read(`/proc/${cur}/stat`);
    } catch {
      return i === 0 ? null : chain; // 最初が読めなければ（終わっている・権限）分からない。途中で切れたら、そこまで
    }
    const close = raw.lastIndexOf(")");
    if (close === -1) return chain;
    const ppid = Number(raw.slice(close + 2).trim().split(/\s+/)[1]);
    if (!Number.isFinite(ppid) || ppid <= 0) return chain;
    cur = ppid;
  }
  return chain;
}
