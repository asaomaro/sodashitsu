import type { AgentInfo } from "@sodashitsu/protocol";
import {
  describeParts,
  describeTarget,
  enqueue,
  notifyKeyOf,
  removeByKey,
  removeByPane,
  routesFor,
  shouldQueue,
  snapshotKeys,
  type Audience,
  type NotifyKey,
  type NotifyKind,
  type QueuedNotification,
} from "@sodashitsu/client-core";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import { deliveryOf, notificationSequence } from "./terminalNotify.js";

/** 入力待ちは 1 秒続いてから知らせる（すぐ戻る短い待ちで鳴らさない。web と同じ）。 */
export const BLOCKED_DELAY_MS = 1000;
/** 通知のトーストを出しておく時間（design「通知」：右下・5 秒）。 */
export const NOTIFY_TOAST_MS = 5000;

const TOAST_SUFFIX: Record<NotifyKind, string> = {
  blocked: "が入力待ちです",
  done: "が完了しました",
};
const TITLE_PREFIX: Record<NotifyKind, string> = { blocked: "入力待ち", done: "完了" };
export const CLOSED_TARGET_MESSAGE = "知らせの対象はすでに閉じられていました。";
export const NO_NOTIFICATION_MESSAGE = "未処理の知らせはありません。";

export interface NotifyHost {
  model: SessionModel;
  ui: UiState;
  prefs: PrefsModel;
  env: Readonly<Record<string, string | undefined>>;
  /** 外側の端末にフォーカスがあるか（フォーカスの報告。来ない端末ではあり）。 */
  hasFocus(): boolean;
  /** その pane が今の割り付けで見えているか。 */
  isPaneVisible(paneId: string): boolean;
  /** 外側の端末へ書く（デスクトップ通知の列・ベル）。 */
  write(seq: string): void;
  /** その pane へ移る（workspace・tab をまたいで）。 */
  focusPane(paneId: string): void;
  setTimer?(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer?(h: ReturnType<typeof setTimeout>): void;
}

/**
 * 通知（20260927-cli-mode の design「通知」・AC13）。web の `NotificationController` の判定を写した：出来事（入力待ち・完了）ごとに 1 回だけ
 * 判定し、経路は client-core の `routesFor`（見ている pane なら何も出さない・離れていれば設定のとおり）。出し方は画面内のトースト（押すと対象へ）、
 * 外側の端末へのデスクトップ通知（OSC 9・99・777。端末の判定か `tui.notifyDelivery`。tmux の中は素通しの包み）、音の代わりのベル。
 * `prefix+o`（`focusNext`）は未処理の知らせの対象へ移る（最大 8 件）。OS の通知の許可は要らないので、web の「許可しますか」の案内は出さない。
 */
export class NotificationController {
  private readonly judged = new Map<string, Set<NotifyKey>>();
  private queue: QueuedNotification[] = [];
  private readonly pending = new Map<NotifyKey, ReturnType<typeof setTimeout>>();

  constructor(private readonly host: NotifyHost) {}

  /** 未処理の知らせ（テスト・一覧）。 */
  get queued(): readonly QueuedNotification[] {
    return this.queue;
  }

  onAgentChanged(paneId: string, prev: AgentInfo | null, next: AgentInfo | null): void {
    if (!next) return;
    if (next.state === "blocked" && prev?.state !== "blocked")
      this.consider("blocked", paneId, next);
    if (prev && next.completionSeq > prev.completionSeq) this.consider("done", paneId, next);
  }

  /**
   * スナップショットを当てた。最初の 1 回は今ある出来事を「判定済み」にするだけ（起動しただけで昔の完了を鳴らさない）。再接続では、切れていた間の
   * 出来事を知らせる（web と同じ）。
   */
  onSnapshotApplied(panes: { paneId: string; agent: AgentInfo | null }[], first: boolean): void {
    const alive = new Set(panes.map((p) => p.paneId));
    for (const paneId of [...this.judged.keys()])
      if (!alive.has(paneId)) this.judged.delete(paneId);
    for (const e of this.queue.filter((q) => !alive.has(q.paneId))) this.dropPane(e.paneId);
    if (first) {
      for (const p of panes)
        if (p.agent) for (const { key } of snapshotKeys(p.agent)) this.mark(p.paneId, key);
      return;
    }
    for (const p of panes) {
      if (!p.agent) continue;
      for (const { kind } of snapshotKeys(p.agent)) this.consider(kind, p.paneId, p.agent);
    }
  }

  onPaneClosed(paneId: string): void {
    this.judged.delete(paneId);
    this.dropPane(paneId);
  }

  private mark(paneId: string, key: NotifyKey): void {
    let set = this.judged.get(paneId);
    if (!set) this.judged.set(paneId, (set = new Set()));
    set.add(key);
  }

  private consider(kind: NotifyKind, paneId: string, agent: AgentInfo): void {
    const key = notifyKeyOf(kind, agent);
    if (this.judged.get(paneId)?.has(key)) return;
    if (this.pending.has(key)) return;
    this.mark(paneId, key);
    if (kind === "done") {
      // 焦点の移り（同じ打鍵の中の表示の修復）を待ってから、見えているかを判定する（web の nextTick と同じ役）。
      queueMicrotask(() => this.deliver(kind, paneId, key));
      return;
    }
    const setT = this.host.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const h = setT(() => {
      this.pending.delete(key);
      const now = this.host.model.panes.get(paneId)?.agent;
      if (!now || notifyKeyOf("blocked", now) !== key || now.state !== "blocked") return;
      this.deliver(kind, paneId, key);
    }, BLOCKED_DELAY_MS);
    (h as { unref?: () => void }).unref?.();
    this.pending.set(key, h);
  }

  deliver(kind: NotifyKind, paneId: string, key: NotifyKey): void {
    const { host } = this;
    const audience: Audience = {
      windowFocused: host.hasFocus(),
      paneVisible: host.isPaneVisible(paneId),
    };
    const routes = routesFor(audience, host.prefs.notify);
    if (!shouldQueue(audience)) return; // 見ている pane は何も出さないし、行き先にもしない
    const label = describeTarget(host.model, paneId);
    const toastId = routes.toast
      ? host.ui.toast(`${label}${TOAST_SUFFIX[kind]}`, {
          ms: NOTIFY_TOAST_MS,
          onClick: () => this.focusNotification(key),
        })
      : null;
    const r = enqueue(this.queue, { key, kind, paneId, label, at: Date.now(), toastId });
    this.queue = r.queue;
    for (const e of r.removed) this.cleanup(e);
    let out = "";
    let belled = false;
    if (routes.desktop) {
      const delivery = deliveryOf(host.prefs.notifyDelivery, host.env);
      const { paneName, place } = describeParts(host.model, paneId);
      out += notificationSequence(
        delivery,
        `${TITLE_PREFIX[kind]}: ${paneName}`,
        place,
        !!host.env["TMUX"],
      );
      belled = delivery === "bell";
    }
    // 音は端末版ではベルで代える（デスクトップ通知をベルで出したなら重ねない）。
    if (routes.sound && !belled) out += "\x07";
    if (out !== "") host.write(out);
  }

  /** `prefix+o`：いちばん古い未処理の知らせの対象へ移る（対象が消えていれば飛ばして知らせる）。 */
  focusNext(): void {
    if (this.queue.length === 0) {
      this.host.ui.toast(NO_NOTIFICATION_MESSAGE);
      return;
    }
    let dropped = false;
    while (this.queue.length > 0) {
      const head = this.queue[0]!;
      const ok = this.focusEntry(head.paneId);
      this.drop(head.key);
      if (ok) break;
      dropped = true;
    }
    if (dropped) this.host.ui.toast(CLOSED_TARGET_MESSAGE);
  }

  /** 知らせ（トースト）を押した：その対象へ移る。 */
  focusNotification(key: NotifyKey): void {
    const entry = this.queue.find((q) => q.key === key);
    if (!entry) return;
    if (!this.focusEntry(entry.paneId)) this.host.ui.toast(CLOSED_TARGET_MESSAGE);
    this.drop(key);
  }

  private focusEntry(paneId: string): boolean {
    const pane = this.host.model.panes.get(paneId);
    if (!pane || !this.host.model.tabs.has(pane.tabId)) return false;
    this.host.focusPane(paneId);
    return true;
  }

  /** 一覧から外す（対象へは移らない。通知の一覧の Delete）。 */
  dismiss(key: NotifyKey): void {
    this.drop(key);
  }

  private drop(key: NotifyKey): void {
    const r = removeByKey(this.queue, key);
    this.queue = r.queue;
    for (const e of r.removed) this.cleanup(e);
  }

  private dropPane(paneId: string): void {
    const r = removeByPane(this.queue, paneId);
    this.queue = r.queue;
    for (const e of r.removed) this.cleanup(e);
  }

  private cleanup(e: QueuedNotification): void {
    if (e.toastId !== null) this.host.ui.dismissToast(e.toastId);
  }

  dispose(): void {
    const clearT = this.host.clearTimer ?? ((h) => clearTimeout(h));
    for (const h of this.pending.values()) clearT(h);
    this.pending.clear();
  }
}
