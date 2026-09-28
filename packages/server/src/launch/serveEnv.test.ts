import { describe, expect, it } from "vitest";
import { detachedServeEnv } from "./serveEnv.js";

describe("detachedServeEnv（裏で起動する soda serve の環境）", () => {
  it("多重化・SSH のセッション・外側の端末だけの変数を除き、ほかは残す", () => {
    const env = {
      PATH: "/usr/bin",
      HOME: "/home/u",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
      TMUX: "/tmp/tmux-1/default,1,0",
      TMUX_PANE: "%1",
      STY: "1.pts",
      WINDOW: "0",
      TERM_PROGRAM: "WezTerm",
      TERM_PROGRAM_VERSION: "1",
      TERM_SESSION_ID: "x",
      LC_TERMINAL: "iTerm2",
      LC_TERMINAL_VERSION: "3",
      WINDOWID: "123",
      WT_SESSION: "g",
      WT_PROFILE_ID: "p",
      KITTY_WINDOW_ID: "1",
      KITTY_PID: "2",
      KITTY_LISTEN_ON: "unix:/tmp/k",
      KITTY_PUBLIC_KEY: "k",
      ALACRITTY_WINDOW_ID: "1",
      ALACRITTY_SOCKET: "/tmp/a",
      ALACRITTY_LOG: "/tmp/a.log",
      KONSOLE_VERSION: "1",
      WEZTERM_PANE: "1",
      GHOSTTY_RESOURCES_DIR: "/g",
      ITERM_SESSION_ID: "i",
      VSCODE_IPC_HOOK_CLI: "/tmp/v.sock",
      GIT_ASKPASS: "/home/u/.vscode-server/bin/x/askpass.sh",
      BROWSER: "/home/u/.vscode-server/bin/x/helpers/browser.sh",
      SSH_AUTH_SOCK: "/run/user/1000/keyring/ssh",
    };
    expect(detachedServeEnv(env, "linux")).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/u",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
      // SSH のセッションの外（デスクトップの ssh-agent）なら残す
      SSH_AUTH_SOCK: "/run/user/1000/keyring/ssh",
    });
  });

  it("SSH のセッションの中なら SSH_* と SSH_AUTH_SOCK（転送したエージェント）を除く", () => {
    const out = detachedServeEnv(
      {
        PATH: "/usr/bin",
        SSH_CONNECTION: "1.2.3.4 5 6.7.8.9 22",
        SSH_CLIENT: "1.2.3.4 5 22",
        SSH_TTY: "/dev/pts/3",
        SSH_AUTH_SOCK: "/tmp/ssh-x/agent.1",
      },
      "linux",
    );
    expect(out).toEqual({ PATH: "/usr/bin" });
  });

  it("VS Code を指さない GIT_ASKPASS・BROWSER は残す", () => {
    expect(
      detachedServeEnv({ GIT_ASKPASS: "/usr/lib/ssh/ssh-askpass", BROWSER: "firefox" }, "linux"),
    ).toEqual({ GIT_ASKPASS: "/usr/lib/ssh/ssh-askpass", BROWSER: "firefox" });
  });

  it("Windows では大文字小文字を区別せずに比べる（ほかの OS では完全一致）", () => {
    expect(detachedServeEnv({ Wt_Session: "g", Path: "C:\\\\" }, "win32")).toEqual({
      Path: "C:\\\\",
    });
    expect(detachedServeEnv({ Wt_Session: "g" }, "linux")).toEqual({ Wt_Session: "g" });
  });
});
