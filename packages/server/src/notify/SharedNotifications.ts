import { notifyKeyOf } from "@sodashitsu/client-core";
import {
  RpcError,
  type NotificationState,
  type SharedNotice,
  type Pane,
} from "@sodashitsu/protocol";
import type { PrefsStore } from "../persist/PrefsStore.js";
export class SharedNotifications {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly prefs: PrefsStore,
    private readonly pane: (id: string) => Pane | undefined,
    private readonly publish: (state: NotificationState) => void,
  ) {}
  state(): NotificationState {
    const raw = this.prefs.get().prefs.notificationStates;
    if (!Array.isArray(raw)) return { notices: [] };
    return {
      notices: raw
        .filter(
          (v): v is SharedNotice =>
            !!v &&
            typeof v === "object" &&
            typeof v.key === "string" &&
            typeof v.paneId === "string" &&
            (v.status === "deferred" || v.status === "resolved") &&
            typeof v.at === "number" &&
            Number.isFinite(v.at) &&
            Date.now() - v.at < 7 * 24 * 60 * 60 * 1000,
        )
        .slice(-512),
    };
  }
  update(params: Omit<SharedNotice, "at">, clientId: string): Promise<NotificationState> {
    const next = this.pending.then(async () => {
      const agent = this.pane(params.paneId)?.agent;
      if (
        !agent ||
        ![
          notifyKeyOf("done", agent),
          ...(agent.state === "blocked" ? [notifyKeyOf("blocked", agent)] : []),
        ].includes(params.key)
      )
        throw new RpcError("not_found", "通知の対象が変わりました");
      const notices = this.state().notices.filter((n) => n.key !== params.key);
      const prev = this.state().notices.find((n) => n.key === params.key);
      // 遅れて届いた先送りで「対応済み」を未処理へ戻さない。
      notices.push({
        ...params,
        status: prev?.status === "resolved" ? "resolved" : params.status,
        at: Date.now(),
      });
      const state = { notices: notices.slice(-512) };
      await this.prefs.set({ notificationStates: state.notices }, clientId);
      this.publish(state);
      return state;
    });
    this.pending = next.catch(() => undefined);
    return next;
  }
}
