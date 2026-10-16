/**
 * prefix の中継で画面・タブを切り替えたあと、**端末へフォーカスを移さない**（20261016-app-view-direct-operate の B-1）。
 * 中継の知らせは偽れる。偽の切り替えのあとで、利用者が打っている途中のキーが端末へ入るのを防ぐ。
 * 切り替えの結果、端末（xterm の入力欄）がフォーカスを持っていたら、タブ行の選ばれているタブへ移す（無ければアプリ画面の根・どちらも無ければ blur）。
 * 端末で打つには、利用者が端末を押す。行き先がアプリのタブなら、そのメイン画面が枠へフォーカスを移す（端末ではないので、そのまま）。
 */
const TERMINAL_SELECTOR = ".xterm, .terminal-pane";

function terminalFocused(doc: Document): boolean {
  const a = doc.activeElement;
  // アプリの画面が埋め込んだ端末（`[data-native-component]`）は、アプリの一部。移さない。
  return a instanceof Element && a.closest(TERMINAL_SELECTOR) !== null && a.closest("[data-native-component]") === null;
}

/** 端末にフォーカスがあれば、当たり障りのない場所へ移す。移したら `true`。 */
export function parkFocusOffTerminal(doc: Document = document): boolean {
  if (!terminalFocused(doc)) return false;
  const target =
    doc.querySelector<HTMLElement>('.tab-bar [role="tab"][aria-selected="true"]') ??
    doc.querySelector<HTMLElement>("[data-plugin-view]");
  if (target) target.focus({ preventScroll: true });
  else (doc.activeElement as HTMLElement | null)?.blur();
  return true;
}

/**
 * 切り替えの直後と、描画・サーバの応答で端末への焦点が遅れて来る間（短い時間）、数回確かめる。
 * 端末が `view.focusedPaneId` の変化を見て `term.focus()` を呼ぶのは、次の描画の中。
 */
export function parkFocusAfterRelay(doc: Document = document): void {
  const w = doc.defaultView;
  if (!w) return;
  for (const ms of [0, 50, 200]) w.setTimeout(() => parkFocusOffTerminal(doc), ms);
}
