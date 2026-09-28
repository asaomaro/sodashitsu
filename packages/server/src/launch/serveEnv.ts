/**
 * 引数なしの `soda` が裏で起動する `soda serve` の環境（統合の review の差し戻し）。裏のサーバは最初に `soda` を打った端末より長く生き、
 * その環境は以後に作るすべての pane へ写る（`session/paneEnv.ts`）。最初の端末・セッションだけで意味を持つ変数を写すと、別の端末から
 * 繋いだ後の pane でも古い端末の値が残り、pane の中のプログラムが取り違える（tmux の中だと思う・死んだ SSH のエージェントの socket を使う等）。
 * そこで、次を**起動の前に取り除く**:
 *
 * - 多重化・入れ子: `TMUX`・`TMUX_PANE`・`STY`・`WINDOW`（GNU screen）
 * - SSH のセッション: `SSH_CONNECTION`・`SSH_CLIENT`・`SSH_TTY`。`SSH_AUTH_SOCK` は **SSH のセッションの中で起動したときだけ**（転送した
 *   エージェントの socket はそのセッションと一緒に消える。手元のデスクトップの ssh-agent・gnome-keyring の socket はログインの間続くので残す）
 * - 外側の端末の名前・版・窓: `TERM_PROGRAM`・`TERM_PROGRAM_VERSION`・`TERM_SESSION_ID`・`LC_TERMINAL`・`LC_TERMINAL_VERSION`・`WINDOWID`・
 *   `WT_SESSION`・`WT_PROFILE_ID`（Windows Terminal）・`KITTY_WINDOW_ID`・`KITTY_PID`・`KITTY_LISTEN_ON`・`KITTY_PUBLIC_KEY`・
 *   `ALACRITTY_WINDOW_ID`・`ALACRITTY_SOCKET`・`ALACRITTY_LOG`・`KONSOLE_*`・`WEZTERM_*`・`GHOSTTY_*`・`ITERM_*`・`VSCODE_*`
 * - VS Code の端末の補助: `GIT_ASKPASS`・`BROWSER` は、値が VS Code の補助（`VSCODE_*` の socket が要る）を指すときだけ
 *
 * 残すもの: `TERM`・`COLORTERM`（pane の端末はサーバの xterm の写しで、外側の端末に依らない）、`DISPLAY`・`WAYLAND_DISPLAY`
 * （デスクトップのセッションは端末より長く続き、pane のクリップボードの道具・ブラウザの起動に要る）、そのほかの利用者の変数。
 * 手で `soda serve` を起動したときは取り除かない（利用者が選んだ環境）。
 */

const DROPPED: readonly string[] = [
  "TMUX",
  "TMUX_PANE",
  "STY",
  "WINDOW",
  "SSH_CONNECTION",
  "SSH_CLIENT",
  "SSH_TTY",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "TERM_SESSION_ID",
  "LC_TERMINAL",
  "LC_TERMINAL_VERSION",
  "WINDOWID",
  "WT_SESSION",
  "WT_PROFILE_ID",
  "KITTY_WINDOW_ID",
  "KITTY_PID",
  "KITTY_LISTEN_ON",
  "KITTY_PUBLIC_KEY",
  "ALACRITTY_WINDOW_ID",
  "ALACRITTY_SOCKET",
  "ALACRITTY_LOG",
];

const DROPPED_PREFIXES: readonly string[] = [
  "KONSOLE_",
  "WEZTERM_",
  "GHOSTTY_",
  "ITERM_",
  "VSCODE_",
];

/** VS Code の補助を指す値（`GIT_ASKPASS`・`BROWSER`）。 */
const VSCODE_HELPER = /vscode/i;

export function detachedServeEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  // Windows の環境変数は大文字小文字を区別しない（`paneEnv.ts` と同じ）。
  const norm = (k: string): string => (platform === "win32" ? k.toUpperCase() : k);
  const get = (name: string): string | undefined => {
    for (const [k, v] of Object.entries(env)) if (norm(k) === name && v !== undefined) return v;
    return undefined;
  };
  const inSsh = (get("SSH_CONNECTION") ?? get("SSH_TTY") ?? get("SSH_CLIENT") ?? "") !== "";
  const dropped = new Set(DROPPED);
  if (inSsh) dropped.add("SSH_AUTH_SOCK");
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const k = norm(key);
    if (dropped.has(k)) continue;
    if (DROPPED_PREFIXES.some((p) => k.startsWith(p))) continue;
    if ((k === "GIT_ASKPASS" || k === "BROWSER") && VSCODE_HELPER.test(value)) continue;
    out[key] = value;
  }
  return out;
}
