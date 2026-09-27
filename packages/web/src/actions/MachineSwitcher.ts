/**
 * マシンの切り替えの手順（20260927-multi-host-machines の design「切り替え」・architecture の ports）。画面の接続（`Connection`）は 1 本で、その行き先を
 * 替える。**id（`w1`・`p1`・`a1`）はマシンをまたいで衝突する**ので、前のマシンのセッションのストア・端末・表示の記憶・既読・通知の基準を
 * 切り替え先へ持ち込まない。`main.ts` は単体テストできないので、順序（部品が外れてから端末を捨てる・後勝ち）をここに閉じ込めてテストする。
 */
export interface MachineSwitcherPorts {
  selectedId(): string;
  selectMachine(id: string): void;
  isSelectable(id: string): boolean;
  setViewScope(id: string): void;
  setSeenScope(id: string): void;
  rememberView(workspaceId: string, tabId: string): void;
  forgetStoredView(): void;
  /** 同じマシンのときの今までの workspace の選択（サイドバーの `focusWorkspace` と同じ）。 */
  focusWorkspaceHere(workspaceId: string): void;
  resetNotifications(): void;
  resetBaseline(): void;
  clearSession(): void;
  resetView(): void;
  nextTick(): Promise<void>;
  disposeTerminals(): void;
  retarget(url: string): void;
  wsUrlFor(id: string): string;
  /** 切り替え先で表示した workspace をサーバの「最後の選択」にする（`workspace.focus`）。 */
  requestWorkspaceFocus(workspaceId: string): void;
}

export interface SwitchTarget {
  workspaceId: string;
  tabId: string;
}

export class MachineSwitcher {
  private generation = 0;
  /** 切り替え先で 1 回だけ送る `workspace.focus`（世代つき）。 */
  private pendingFocus: { generation: number; workspaceId: string } | undefined;

  constructor(private readonly ports: MachineSwitcherPorts) {}

  /**
   * `id` のマシンへ切り替える。`target` はそのマシンで表示する workspace（見出しからなら無し＝そのマシンの今の focus）。
   * `force` は選べるか（繋がっているか）の確かめを飛ばす（選んでいるマシンが一覧から消えてローカルへ戻るとき）。切り替えたら true。
   */
  async switchTo(
    id: string,
    target?: SwitchTarget,
    opts: { force?: boolean } = {},
  ): Promise<boolean> {
    const p = this.ports;
    if (id === p.selectedId()) {
      if (target) p.focusWorkspaceHere(target.workspaceId);
      return false;
    }
    if (!opts.force && !p.isSelectable(id)) return false;
    const generation = ++this.generation;
    this.pendingFocus = target ? { generation, workspaceId: target.workspaceId } : undefined;
    p.selectMachine(id);
    p.setViewScope(id);
    p.setSeenScope(id);
    if (target) p.rememberView(target.workspaceId, target.tabId);
    else p.forgetStoredView();
    p.resetNotifications();
    p.resetBaseline();
    p.clearSession();
    p.resetView();
    // 端末の部品（TerminalPane）が外れてから端末を捨てる（表示中の端末を捨てない）。
    await p.nextTick();
    if (generation !== this.generation) return false; // 後の切り替えが勝つ
    p.disposeTerminals();
    p.retarget(p.wsUrlFor(id));
    return true;
  }

  /** 画面の接続の hello が通るたび（`Connection.onOpened`）。切り替えの直後の 1 回だけ `workspace.focus` を送る。 */
  onOpened(): void {
    const f = this.pendingFocus;
    this.pendingFocus = undefined;
    if (f && f.generation === this.generation) this.ports.requestWorkspaceFocus(f.workspaceId);
  }
}
