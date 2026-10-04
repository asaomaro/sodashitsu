import type { Disposable } from "./util/Disposable.js";

/** 配線に要る poller の面（`DefaultGitInfoPoller` が満たす）。 */
interface FirstRoundSource {
  onFirstRoundDone(listener: () => void): Disposable;
  isRunning(): boolean;
}

/**
 * 最初の 1 周の確認が終わったら、layout の無い保存から始めた移行を確定する（20261004-group-worktree-items D2・D18）。
 * 引き継ぎの一時停止中に届いた合図は捨てる（再開の `start()` がまた 1 周して合図を出す。保存を止めた後に書き換えない）。
 */
export function wireLayoutConfirmation(poller: FirstRoundSource, session: { confirmLayout(): void }): Disposable {
  return poller.onFirstRoundDone(() => {
    if (poller.isRunning()) session.confirmLayout();
  });
}
