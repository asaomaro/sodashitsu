/**
 * 切り替えの後に pane へ焦点を置く（20260927-agent-graph の 04・g04 点検）。切り替えの間にその pane が閉じた・別の tab へ移ったなら何もしない
 * （表示中でない pane に焦点を置いて、画面とサーバの焦点がずれないように）。
 */
export interface PaneFocusPorts {
  /** その pane のある tab（無ければ undefined）。 */
  paneTab(paneId: string): string | undefined;
  /** 表示中の tab。 */
  shownTab(): string | null;
  /** 画面の焦点とサーバの `pane.focus`。 */
  focus(paneId: string): void;
}

export function focusPaneIfShown(ports: PaneFocusPorts, paneId: string): boolean {
  const tab = ports.paneTab(paneId);
  if (tab === undefined || tab !== ports.shownTab()) return false;
  ports.focus(paneId);
  return true;
}
