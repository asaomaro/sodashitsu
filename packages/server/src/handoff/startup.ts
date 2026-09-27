import { closeSync } from "node:fs";
import type { Logger } from "../log/Logger.js";
import type { AdoptedPaneSpec } from "../session/SessionService.js";
import { type HandoffPane, type TakenHandoff, isPtyMaster } from "./HandoffManifest.js";

/**
 * 新しい版の起動での、受け取った引き継ぎの処理（20260926-live-handoff。design「サーバ（新しい版）の起動」）。`composeServer.listen` が使う。
 * 使わなかった PTY（`session.json` に無い pane・確かめに通らなかった fd・端末を作れなかった pane）は、fd を閉じてプロセスに SIGHUP を送る
 * ——見えない pane のプロセスを残さない。
 */
export interface HandoffStartupDeps {
  logger: Pick<Logger, "info" | "warn" | "error">;
  closeFd?: (fd: number) => void;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** fd が PTY の master か（既定 `isPtyMaster`）。確かめに通らなかった pane の fd は、これが真のときだけ閉じる。 */
  isPtyMaster?: (fd: number) => boolean;
}

export interface HandoffResult {
  id: string;
  adopted: number;
  dropped: number;
}

/** `SessionService.restore` に渡す形にする。 */
export function adoptedSpecsOf(
  taken: Extract<TakenHandoff, { kind: "taken" }>,
): Map<string, AdoptedPaneSpec> {
  return new Map(
    taken.panes.map((p) => [
      p.paneId,
      { fd: p.fd, pid: p.pid, cols: p.cols, rows: p.rows, screen: p.screen },
    ]),
  );
}

/**
 * 確かめに通らなかった pane を手放す。fd の番号はこのプロセスで別のもの（Node が起動時に開いた epoll 等）を指しているかもしれず、
 * pid も別のプロセスに再利用されているかもしれない——**PTY の master だと分かる fd だけを閉じ、シグナルは送らない**
 * （master を閉じればそのシェルには hangup が届く）。
 */
export function discardRejectedPanes(
  panes: readonly HandoffPane[],
  deps: HandoffStartupDeps,
): void {
  const closeFd = deps.closeFd ?? closeSync;
  const check = deps.isPtyMaster ?? ((fd: number) => isPtyMaster(fd));
  for (const p of panes) {
    if (!check(p.fd)) continue;
    try {
      closeFd(p.fd);
    } catch {
      // 既に閉じている。
    }
  }
}

/** 確かめ済みで使わない PTY を手放す（fd を閉じ、SIGHUP）。失敗は無視する（既に閉じている・終わっている）。 */
export function discardHandedOffPanes(
  panes: readonly HandoffPane[],
  deps: HandoffStartupDeps,
): void {
  const closeFd = deps.closeFd ?? closeSync;
  const kill = deps.kill ?? ((pid, signal) => process.kill(pid, signal));
  for (const p of panes) {
    try {
      closeFd(p.fd);
    } catch {
      // 既に閉じている。
    }
    try {
      kill(p.pid, "SIGHUP");
    } catch {
      // 既に終わっている。
    }
  }
}

/**
 * 復元の後に呼ぶ: 使わなかった PTY を手放し、結果（引き継いだ数・引き継げなかった数）を返す。
 * `adoptedPaneIds` は `SessionService.restore` の戻り値（`session.json` を読めなかったときは空）。
 */
export function finishTakenHandoff(
  taken: Extract<TakenHandoff, { kind: "taken" }>,
  adoptedPaneIds: ReadonlySet<string>,
  deps: HandoffStartupDeps,
): HandoffResult {
  const unused = taken.panes.filter((p) => !adoptedPaneIds.has(p.paneId));
  const dropped = [...taken.rejected, ...unused];
  // 確かめに通らなかった pane は、呼び出し側が PTY を開く前に `discardRejectedPanes` で手放している（ここでは数えるだけ）。
  discardHandedOffPanes(unused, deps);
  const result = {
    id: taken.id,
    adopted: taken.panes.length - unused.length,
    dropped: dropped.length,
  };
  if (taken.rejected.length > 0) {
    deps.logger.warn("handoff: some handed-off panes were not usable and were closed", {
      reason: taken.rejectReason,
      panes: taken.rejected.map((p) => p.paneId),
    });
  }
  if (unused.length > 0) {
    deps.logger.warn("handoff: some handed-off panes were not restored and were closed", {
      panes: unused.map((p) => p.paneId),
    });
  }
  deps.logger.info("handoff: complete", { ...result });
  return result;
}
