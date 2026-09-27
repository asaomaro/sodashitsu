import { randomBytes } from "node:crypto";
import type { Logger } from "../log/Logger.js";
import type { HandoffHold, TerminalHost } from "../terminal/TerminalHost.js";
import {
  HANDOFF_FORMAT_VERSION,
  type HandoffPane,
  type HandoffScrollbackEditor,
  removeHandoffManifest,
  writeHandoffManifest,
} from "./HandoffManifest.js";

/**
 * 更新時の引き継ぎ（20260926-live-handoff）の、古い版の側の制御（design「`HandoffController`」「サーバ（古い版）の `request`」）。
 * 確かめる（preflight）→ `/ws` を閉じる → poller を止める → 各 pane の読み取りを止めて画面を取る → `session.json` を保存 → `handoff.json` を書く →
 * CLI に返す → ログを書き出す → execve。execve の前（戻れる区間）で失敗したら元に戻す。execve は成功すれば戻らない。
 */
export type HandoffFailureReason =
  | "unsupported"
  | "busy"
  /** サーバが止まる途中（`wtm session stop`・Ctrl+C。20260927-session-stop）。 */
  | "stopping"
  | "preflight_failed"
  | "pane_unavailable"
  | "prepare_failed"
  | "exec_failed"
  | "bad_request";

export type HandoffReply =
  | { ok: true; id: string; panes: number }
  | { ok: false; reason: HandoffFailureReason; message: string };

export interface LastHandoff {
  id: string;
  adopted: number;
  dropped: number;
  at: string;
  /** 受け付けた後に入れ替われなかった（execve が失敗して元に戻した）ときの理由。CLI が待たずに失敗を知る。 */
  error?: string;
}

export interface HandoffStatus {
  lastHandoff: LastHandoff | null;
}

export type PreflightResult = { ok: true } | { ok: false; message: string };

export interface HandoffControllerDeps {
  stateDir: string;
  logger: Logger;
  /** いまの全 pane と、その端末（起動に失敗した pane は端末が無い）。 */
  panes(): { paneId: string; host: TerminalHost | undefined }[];
  scrollbackEditors(): HandoffScrollbackEditor[];
  /** 待ち受けているポート。 */
  boundPort(): number;
  pausePollers(): Promise<void>;
  resumePollers(): void;
  /** `session.json` を保存する。 */
  flushSession(): Promise<void>;
  /** `/ws` を閉じ（1012）、受け付けを止める。 */
  closeClients(): void;
  /** `closeClients` を戻す。 */
  reopenClients(): void;
  flushLog(): Promise<void>;
  preflight(): Promise<PreflightResult>;
  /** 新しい版に入れ替える。成功すれば戻らない。戻った（投げた）ら失敗。 */
  execve(nonce: string): void;
  platform: NodeJS.Platform;
  /** この Node に `process.execve` があるか。 */
  hasExecve: boolean;
  /** pane ごとの読み取りの停止を待つ上限（ms）。 */
  holdTimeoutMs?: number;
  randomHex?: (bytes: number) => string;
  now?: () => Date;
}

class PrepareError extends Error {
  constructor(
    readonly reason: "pane_unavailable" | "prepare_failed",
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_HOLD_TIMEOUT_MS = 5000;

export class HandoffController {
  private busy = false;
  private running: Promise<void> | undefined;
  private last: LastHandoff | null = null;

  constructor(private readonly deps: HandoffControllerDeps) {}

  /** 引き継ぎの最中か（受け付けてから、元に戻すか execve するまで）。止める指示を断るのに使う（20260927-session-stop）。 */
  get isBusy(): boolean {
    return this.busy;
  }

  status(): HandoffStatus {
    return { lastHandoff: this.last };
  }

  /** 新しい版の起動で、受け取った結果を残す（`status` が答える）。 */
  recordTaken(result: { id: string; adopted: number; dropped: number }): void {
    this.last = { ...result, at: (this.deps.now ?? (() => new Date()))().toISOString() };
  }

  /**
   * 引き継ぎの指示を処理する。`reply` は CLI への返事（1 回だけ呼ぶ）。成功したら execve で戻らないので、この Promise は解決しない。
   */
  async request(reply: (r: HandoffReply) => Promise<void>): Promise<void> {
    const d = this.deps;
    if (d.platform === "win32" || !d.hasExecve) {
      await reply({
        ok: false,
        reason: "unsupported",
        message:
          "live handoff is not supported on this platform (needs process.execve; Linux/macOS)",
      });
      return;
    }
    if (this.busy) {
      await reply({ ok: false, reason: "busy", message: "a handoff is already in progress" });
      return;
    }
    this.busy = true;
    const running = this.run(reply);
    this.running = running.catch(() => undefined);
    try {
      await running;
    } finally {
      this.busy = false;
      this.running = undefined;
    }
  }

  /**
   * 引き継ぎの最中なら、それが終わる（元に戻す）まで待つ（最中でなければすぐ）。止め始めたサーバ（`close()`）が、進行中の引き継ぎと並んで
   * 端末を捨てたり保存したりしないため（20260927-session-stop の cross の点検）。引き継ぎが execve に成功すれば、このプロセスは入れ替わり戻らない。
   */
  waitIdle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async run(reply: (r: HandoffReply) => Promise<void>): Promise<void> {
    const d = this.deps;
    const log = d.logger;
    log.info("handoff: requested; running preflight");
    let pf: PreflightResult;
    try {
      pf = await d.preflight();
    } catch (err) {
      pf = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    if (!pf.ok) {
      log.warn("handoff: preflight failed; keeping the current server", { message: pf.message });
      await reply({ ok: false, reason: "preflight_failed", message: pf.message });
      return;
    }

    // ここから元に戻す対象（poller・読み取り・handoff.json・/ws）。
    const held: TerminalHost[] = [];
    let manifestWritten = false;
    let clientsClosed = false;
    // 戻す手順は 1 つずつ守る（1 つが投げても残りを戻す）。
    const quietly = (what: string, fn: () => void): void => {
      try {
        fn();
      } catch (err) {
        log.error(`handoff: rollback step failed: ${what}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
    const rollback = async (): Promise<void> => {
      for (const host of held) quietly("release pane", () => host.releaseHandoffHold?.());
      quietly("resume pollers", () => d.resumePollers());
      if (manifestWritten) await removeHandoffManifest(d.stateDir).catch(() => undefined);
      if (clientsClosed) quietly("reopen clients", () => d.reopenClients());
    };

    const random = d.randomHex ?? ((n: number) => randomBytes(n).toString("hex"));
    const id = random(8);
    const nonce = random(16);
    let panes: HandoffPane[];
    try {
      // 先に /ws を閉じる——読み取りを止めてから execve までの間に、ブラウザ・wtmctl の操作で pane が増えたり減ったりしない
      // （増えた pane の master は受け渡しに載らずに残り、減った pane の番号を新しい pane が使うと別のシェルを取り違える。cross の点検）。
      clientsClosed = true;
      d.closeClients();
      await d.pausePollers();
      panes = [];
      for (const { paneId, host } of d.panes()) {
        if (host === undefined) continue; // 起動に失敗した pane（新しい版では普通の復元になる）
        const hold = await this.holdWithTimeout(host, paneId);
        held.push(host);
        panes.push({
          paneId,
          fd: hold.fd,
          pid: host.pid,
          cols: hold.cols,
          rows: hold.rows,
          screen: hold.screen,
        });
      }
      try {
        await d.flushSession();
        await writeHandoffManifest(d.stateDir, {
          format: HANDOFF_FORMAT_VERSION,
          id,
          nonce,
          pid: process.pid,
          createdAt: (d.now ?? (() => new Date()))().toISOString(),
          port: d.boundPort(),
          panes,
          scrollbackEditors: d.scrollbackEditors(),
        });
        manifestWritten = true;
      } catch (err) {
        throw new PrepareError(
          "prepare_failed",
          `cannot save the session for the handoff: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } catch (err) {
      await rollback().catch(() => undefined);
      const reason = err instanceof PrepareError ? err.reason : "prepare_failed";
      const message = err instanceof Error ? err.message : String(err);
      log.warn("handoff: preparation failed; keeping the current server", { reason, message });
      await reply({ ok: false, reason, message });
      return;
    }

    // 返事は届かなくても続ける（CLI は status で確かめる）。返事は 1 回だけ——この後の失敗はログと status で知らせる。
    await reply({ ok: true, id, panes: panes.length }).catch(() => undefined);
    log.info("handoff: replacing this server with the version on disk", {
      id,
      panes: panes.length,
    });
    try {
      await d.flushLog();
      d.execve(nonce);
      // 戻ってきた＝入れ替わらなかった（実物の execve は成功すれば戻らない）。
      throw new Error("execve returned");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error("handoff: execve failed; keeping the current server", { error });
      await rollback();
      this.last = {
        id,
        adopted: 0,
        dropped: panes.length,
        at: (d.now ?? (() => new Date()))().toISOString(),
        error,
      };
    }
  }

  /** 読み取りを止めて画面を取る。上限を過ぎた・渡せない端末は `pane_unavailable`。 */
  private async holdWithTimeout(host: TerminalHost, paneId: string): Promise<HandoffHold> {
    if (host.holdForHandoff === undefined)
      throw new PrepareError("pane_unavailable", `pane ${paneId} cannot be handed off`);
    const ms = this.deps.holdTimeoutMs ?? DEFAULT_HOLD_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), ms);
    });
    let holding: Promise<HandoffHold | undefined> | undefined;
    try {
      holding = host.holdForHandoff();
      const result = await Promise.race([holding, timeout]);
      if (result === "timeout") {
        // 後から止まったら戻す（呼び出し側の rollback の対象に入らないため）。後から失敗しても落とさない。
        void holding
          .then((h) => h !== undefined && host.releaseHandoffHold?.())
          .catch(() => undefined);
        throw new PrepareError(
          "pane_unavailable",
          `pane ${paneId} did not stop reading within ${ms}ms`,
        );
      }
      if (result === undefined)
        throw new PrepareError("pane_unavailable", `pane ${paneId} cannot be handed off`);
      return result;
    } catch (err) {
      if (err instanceof PrepareError) throw err;
      // 止める途中で失敗した（読み取りだけ止まっていることがある）。戻してから断る。
      try {
        host.releaseHandoffHold?.();
      } catch {
        // 戻せなくても理由は同じ。
      }
      throw new PrepareError(
        "pane_unavailable",
        `pane ${paneId} cannot be handed off: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
