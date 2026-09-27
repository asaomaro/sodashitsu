/**
 * 保存した SSH のマシン（20260927-multi-host-machines）の、画面の接続・軽い接続の行き先。手元の `soda serve` の `/ws` に `?machine=<id>` を付けると、
 * 手元の認証（Cookie）を通ったうえでそのマシンの `soda serve` へ中継される。ローカルは今までの `/ws` そのもの。
 */
export const LOCAL_MACHINE_ID = "local";

export function wsUrlFor(base: string, machineId: string): string {
  if (machineId === LOCAL_MACHINE_ID) return base;
  return `${base}${base.includes("?") ? "&" : "?"}machine=${encodeURIComponent(machineId)}`;
}
