import { neighborPaneId, type Action, type Dir } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";

export interface DispatcherHost {
  model: SessionModel;
  conn: RequestPort;
  detach(): void;
  toggleSidebar(): void;
  /** まだ端末版に無い操作（04 で足す）。 */
  unsupported(action: Action): void;
}

/**
 * client-core の `Action` を RPC と画面の操作へ（20260927-cli-mode の architecture「actions/TuiDispatcher.ts」。web の `ActionDispatcher` と同じ RPC）。
 * 03 では `detach`・`focus_pane_*`・`toggle_sidebar` だけ。残りは 04。
 */
export class TuiDispatcher {
  constructor(private readonly host: DispatcherHost) {}

  dispatch(action: Action): void {
    switch (action.type) {
      case "detach":
        this.host.detach();
        return;
      case "focusDir":
        this.focusDir(action.dir);
        return;
      case "toggleSidebar":
        this.host.toggleSidebar();
        return;
      default:
        this.host.unsupported(action);
    }
  }

  /**
   * 移動先はクライアントで求め、焦点を即座に移してからサーバへ知らせる（web の `focusDir` と同じ。往復の間に打った文字が移動前の pane へ届かない）。
   */
  private focusDir(dir: Dir): void {
    const { model } = this.host;
    const paneId = model.focusedPaneId;
    const tab = model.currentTab();
    if (!paneId || !tab) return;
    const next = neighborPaneId(tab.layout, paneId, dir);
    if (!next) return;
    model.focusPane(next);
    void this.host.conn.request("pane.focus", { paneId: next }).catch(() => undefined);
  }
}
