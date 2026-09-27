import { RpcError, type PaneReportMetadataParams, type WorkspaceReportMetadataParams } from "@sodashitsu/protocol";
import type { Disposable, EventBus } from "../bus/EventBus.js";
import { monotonicNow } from "../log/LogThrottle.js";
import type { Logger } from "../log/Logger.js";
import { NotFoundError } from "../session/SessionModel.js";
import {
  MAX_SEQUENCE_SOURCES,
  MAX_TOKENS_PER_TARGET,
  MetadataTokenBook,
  normalizeMetadataSource,
  normalizeMetadataTokens,
  normalizeMetadataTtl,
} from "./metadataTokens.js";

/**
 * 独自トークンの報告（`workspace.report_metadata`・`pane.report_metadata`。20260927-sidebar-row-tokens）の配線:
 * 対象ごとの帳簿の表・herdr と同じ検査の順・期限のタイマー 1 つ・閉じた対象の破棄。規則そのものは `metadataTokens.ts`。
 *
 * session へは `MetadataTargets` の口越しにだけ書く（依存は一方向。`SessionService` はこの部品を知らない。architecture.md）。
 * 閉じたときの破棄は bus の `pane.closed`・`workspace.closed`——閉じる経路（pane・tab・workspace・置き換え・worktree）のどれでも出る。
 */

/** `SessionService` が満たす口（テストは偽物）。 */
export interface MetadataTargets {
  hasWorkspace(id: string): boolean;
  hasPane(id: string): boolean;
  /** 値の表（null＝1 つも無い）を model に写して配る。 */
  setWorkspaceTokens(id: string, tokens: Record<string, string> | null): void;
  setPaneTokens(id: string, tokens: Record<string, string> | null): void;
}

export interface MetadataTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface MetadataServiceOptions {
  targets: MetadataTargets;
  bus: EventBus;
  /** 締め切りの時計（ms）。既定は単調な `monotonicNow`（壁時計は戻りうる）。 */
  now?: () => number;
  /** 既定は `setTimeout`（`unref`——プロセスの終了を妨げない）と `clearTimeout`。 */
  timers?: MetadataTimers;
  /** 期限の掃除で、対象が無い以外の理由で写せなかったときに残す（タイマーの中なので投げ直さない）。 */
  logger?: Logger;
}

type TargetKind = "workspace" | "pane";

const defaultTimers: MetadataTimers = {
  set(fn, ms) {
    const handle = setTimeout(fn, ms);
    handle.unref?.();
    return handle;
  },
  clear(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function keyOf(kind: TargetKind, id: string): string {
  return `${kind === "workspace" ? "w" : "p"}:${id}`;
}

export class MetadataService {
  private readonly targets: MetadataTargets;
  private readonly now: () => number;
  private readonly timers: MetadataTimers;
  private readonly logger: Logger | undefined;
  /** 対象（`w:<id>`・`p:<id>`）→ 帳簿。受け付けた報告があった対象だけ。閉じるまで捨てない（`seq` の枠を持ち続けるため）。 */
  private readonly books = new Map<string, { kind: TargetKind; id: string; book: MetadataTokenBook }>();
  private timer: { handle: unknown; at: number } | null = null;
  private readonly subscription: Disposable;

  constructor(opts: MetadataServiceOptions) {
    this.targets = opts.targets;
    this.now = opts.now ?? monotonicNow;
    this.timers = opts.timers ?? defaultTimers;
    this.logger = opts.logger;
    this.subscription = opts.bus.subscribe((e) => {
      if (e.event === "pane.closed") this.books.delete(keyOf("pane", e.data.paneId));
      else if (e.event === "workspace.closed") this.books.delete(keyOf("workspace", e.data.workspaceId));
    });
  }

  reportWorkspace(params: WorkspaceReportMetadataParams): void {
    if (!this.targets.hasWorkspace(params.workspaceId)) throw new RpcError("not_found", `workspace not found: ${params.workspaceId}`);
    this.report("workspace", params.workspaceId, params);
  }

  reportPane(params: PaneReportMetadataParams): void {
    if (!this.targets.hasPane(params.paneId)) throw new RpcError("not_found", `pane not found: ${params.paneId}`);
    this.report("pane", params.paneId, params);
  }

  /** タイマーを外し、購読を外し、表を空にする（サーバの終了）。 */
  dispose(): void {
    this.clearTimer();
    this.subscription.dispose();
    this.books.clear();
  }

  /**
   * herdr と同じ順で検査する（`herdr/src/app/api/workspaces.rs:241-300` `handle_workspace_report_metadata`）:
   * source → ttl → tokens → seq の新しさ（古ければ成功・何もしない）→ 反映後の名前の数 → seq の受け付け（枠）→ 反映。
   */
  private report(kind: TargetKind, id: string, params: WorkspaceReportMetadataParams | PaneReportMetadataParams): void {
    const source = normalizeMetadataSource(params.source);
    const ttlMs = normalizeMetadataTtl(params.ttlMs);
    const patch = normalizeMetadataTokens(params.tokens);
    const key = keyOf(kind, id);
    const existing = this.books.get(key);
    // 帳簿の無い対象は空の帳簿で検査し、受け付けたときだけ表に入れる（design「振る舞いの詳細」）。
    const book = existing?.book ?? new MetadataTokenBook();
    if (!book.isFresh(source, params.seq)) return;
    if (book.keyCountAfterPatch(patch) > MAX_TOKENS_PER_TARGET) {
      throw new RpcError("metadata_token_limit", `${kind} metadata may contain at most ${MAX_TOKENS_PER_TARGET} tokens`);
    }
    const accepted = book.acceptSequence(source, params.seq);
    if (accepted === "limit") {
      throw new RpcError("metadata_sequence_source_limit", `${kind} metadata may track at most ${MAX_SEQUENCE_SOURCES} sequenced sources`);
    }
    if (accepted === "stale") return;
    if (!existing) this.books.set(key, { kind, id, book });
    if (!book.patch(patch, ttlMs, this.now())) return;
    // 掛け直しを先に（写す側が投げても、反映済みの締め切りのタイマーは残す）。
    this.reschedule();
    this.publish(kind, id, book);
  }

  private publish(kind: TargetKind, id: string, book: MetadataTokenBook): void {
    if (kind === "workspace") this.targets.setWorkspaceTokens(id, book.values());
    else this.targets.setPaneTokens(id, book.values());
  }

  /** 全帳簿の最も早い締め切りへ、タイマーを 1 つ掛け直す（無ければ外す）。 */
  private reschedule(): void {
    let next: number | null = null;
    for (const { book } of this.books.values()) {
      const at = book.nextExpiry();
      if (at !== null && (next === null || at < next)) next = at;
    }
    if (next === null) {
      this.clearTimer();
      return;
    }
    if (this.timer && this.timer.at === next) return;
    this.clearTimer();
    const at = next;
    this.timer = { at, handle: this.timers.set(() => this.sweep(), Math.max(0, at - this.now())) };
  }

  private clearTimer(): void {
    if (this.timer) this.timers.clear(this.timer.handle);
    this.timer = null;
  }

  /**
   * 期限を掃く。変わった対象だけ反映し、1 つの失敗で残りを止めない。対象が無い（閉じた直後で購読より先にタイマーが来た）ときだけ帳簿を捨てる。
   * それ以外の失敗は帳簿（`seq` の記録）を残してログに出す（design「エラー処理 / 異常系」）。
   */
  private sweep(): void {
    this.timer = null;
    const now = this.now();
    for (const [key, { kind, id, book }] of this.books) {
      if (!book.expireAt(now)) continue;
      try {
        this.publish(kind, id, book);
      } catch (err) {
        if (err instanceof NotFoundError) this.books.delete(key);
        else this.logger?.warn("failed to publish expired metadata tokens", { target: key, error: String(err) });
      }
    }
    this.reschedule();
  }
}
