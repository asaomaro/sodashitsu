import type { HandoffReply, HandoffStatus } from "./HandoffController.js";
import type { HandoffRequestHandler, StopReply } from "./HandoffSocket.js";

/**
 * 制御の socket（`handoff.sock`）に届いた指示の受け付けの判断（20260927-session-stop。design「インターフェース / データ構造」）。
 * - 止める指示: 引き継ぎの最中なら `busy` で断る。既に止まる途中（`beginClosing` 済み・前の止める指示を受けた）なら `alreadyStopping: true` と答えて
 *   何もしない。止める入口（`setStopHandler`）が無ければ `unsupported`。それ以外は印を立て、返事（自分の pid）を返してから入口を呼ぶ——
 *   返事を書けなかった（CLI が先に切った）ときも呼ぶ（指示は受けた）。
 * - 引き継ぎの指示: 止まる途中なら `stopping` で断る（止めながら execve で入れ替わらない）。それ以外は `HandoffController` へ。
 */
export interface ControlRequestsDeps {
  handoff: {
    request(reply: (r: HandoffReply) => Promise<void>): Promise<void>;
    status(): HandoffStatus;
    readonly isBusy: boolean;
    /** 引き継ぎの最中なら終わるまで待つ。 */
    waitIdle(): Promise<void>;
  };
  /** 返事に載せる pid（既定 `process.pid`）。 */
  pid?: number;
}

export interface ControlRequests extends HandoffRequestHandler {
  /** 止める指示を受けたときに呼ぶもの（`main.ts` の停止の手順）。登録しなければ止める指示は `unsupported`。 */
  setStopHandler(fn: () => void): void;
  /**
   * 止まり始めた（`close()` の最初）。以後の止める指示は `alreadyStopping`、引き継ぎの指示は `stopping`。既に受け付けた引き継ぎの最中なら、
   * それが終わる（元に戻す）まで待ってから解決する——停止（保存・端末の破棄）と引き継ぎ（読み取りの停止・execve）を並んで走らせない。
   */
  beginClosing(): Promise<void>;
  readonly isClosing: boolean;
}

export function createControlRequests(deps: ControlRequestsDeps): ControlRequests {
  const pid = deps.pid ?? process.pid;
  let stopHandler: (() => void) | undefined;
  let closing = false;
  return {
    get isClosing(): boolean {
      return closing;
    },
    setStopHandler(fn: () => void): void {
      stopHandler = fn;
    },
    async beginClosing(): Promise<void> {
      closing = true;
      await deps.handoff.waitIdle();
    },
    status: () => deps.handoff.status(),
    async request(reply: (r: HandoffReply) => Promise<void>): Promise<void> {
      if (closing) {
        await reply({ ok: false, reason: "stopping", message: "the server is stopping" });
        return;
      }
      await deps.handoff.request(reply);
    },
    async stop(reply: (r: StopReply) => Promise<void>): Promise<void> {
      if (deps.handoff.isBusy) {
        await reply({ ok: false, reason: "busy", message: "a handoff is in progress" });
        return;
      }
      if (closing) {
        await reply({ ok: true, pid, alreadyStopping: true });
        return;
      }
      const handler = stopHandler;
      if (handler === undefined) {
        await reply({
          ok: false,
          reason: "unsupported",
          message: "this server does not accept stop requests",
        });
        return;
      }
      closing = true;
      try {
        await reply({ ok: true, pid, alreadyStopping: false });
      } finally {
        handler();
      }
    },
  };
}
