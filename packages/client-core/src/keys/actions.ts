/**
 * `keys/` 全体で共有する型（architecture.md「keys/KeyRouter.ts」）。Vue にも DOM にも依存しない。
 */

export type Dir = "left" | "right" | "up" | "down";

export type Mode = "terminal" | "prefix" | "navigate" | "copy" | "resize" | "dialog";

export interface KeyInput {
  key: string;
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  type: "keydown" | "keyup" | "keypress";
  composing: boolean;
  /** `getModifierState("AltGraph")`（20260921-keybinding-customization の D6a。AltGr で合成された文字を割り当てに取り込まない）。省略は偽。 */
  altGraph?: boolean;
  /** 押しっぱなしの繰り返し（同 D4。直接のキーは繰り返しを食う）。省略は偽。 */
  repeat?: boolean;
}

export type KeyDecision =
  | { kind: "pass" } // xterm.js に渡す（terminal モードの通常の入力）
  | { kind: "consume" } // 何もせず捨てる（割り当ての無いキー・keydown 以外のイベント等）
  | { kind: "send"; bytes: string } // 端末へ直接送る（Ctrl+B Ctrl+B → '\x02'）
  | { kind: "action"; action: Action };

/**
 * copy モードの移動の単位（D56 の訂正 5。herdr の `copy_mode.rs` の全キーを移植）。
 */
export type CopyCommand =
  | {
      op: "move";
      unit: "char" | "word" | "WORD" | "wordEnd" | "WORDEnd" | "paragraph" | "page" | "halfPage" | "line" | "lineStart" | "lineEnd" | "bufferTop" | "bufferBottom";
      dir: -1 | 1;
    }
  | { op: "searchStart"; dir: -1 | 1 }
  | { op: "searchInput"; text: string }
  | { op: "searchNext"; reverse: boolean }
  | { op: "selectStart"; linewise: boolean }
  | { op: "yank" }
  | { op: "clearOrExit" }
  | { op: "exit" };

export type Action =
  | { type: "split"; dir: "right" | "down" }
  | { type: "focusDir"; dir: Dir }
  | { type: "swap"; dir: Dir }
  | { type: "cyclePane"; delta: 1 | -1 }
  | { type: "closePane" }
  | { type: "zoom" }
  | { type: "renamePane" }
  | { type: "newTab" }
  | { type: "tabDelta"; delta: 1 | -1 }
  | { type: "tabIndex"; index: number }
  | { type: "renameTab" }
  | { type: "closeTab" }
  | { type: "newWorkspace" }
  | { type: "renameWorkspace" }
  | { type: "closeWorkspace" }
  | { type: "enterMode"; mode: "navigate" | "copy" | "resize" }
  | { type: "exitMode" }
  | { type: "help" }
  | { type: "goto" }
  | { type: "toggleSidebar" }
  | { type: "newWorktree" } // 20260920-git-worktree-actions（prefix+G）
  | { type: "settings" } // prefix+s（20260920-agent-notifications で通知の設定として足し、20260921-herdr-settings-gaps で設定全体に広げた）
  | { type: "nextNotification" } // 同（prefix+o）
  | { type: "detach" }
  | { type: "editScrollback" } // prefix+e（20260926-edit-scrollback の herdr `edit_scrollback` 相当）
  | { type: "reloadConfig" } // prefix+shift+r（20260922-appearance-settings-rest の herdr `reload_config` 相当）
  | { type: "runCommand"; commandId: string } // 独自コマンド（20260927-custom-command-keys の herdr `[[keys.command]]`。既定のキーは無い）
  | { type: "pasteImage" } // クリップボードの画像を貼り付け（20260927-clipboard-image-paste の herdr `remote_image_paste`。既定 ctrl+v）。`KeyInputController` が扱う
  | { type: "navigate"; op: "up" | "down" | "paneDir" | "activate" | "cancel" | "openMenu"; dir?: Dir }
  | { type: "resizeBy"; dir: Dir; amount: number }
  | { type: "copy"; cmd: CopyCommand }
  // 20260923-missing-keybinding-actions（herdr にあって本製品に操作自体が無かったもの）。
  | { type: "workspaceDelta"; delta: 1 | -1 } // previous_workspace / next_workspace
  | { type: "lastPane" } // last_pane
  | { type: "moveTab"; direction: "previous" | "next" } // move_tab_previous / move_tab_next
  | { type: "agentDelta"; delta: 1 | -1 } // previous_agent / next_agent
  | { type: "focusAgentIndex"; index: number } // focus_agent（1-9 → 0-8 に変換済みで渡す）
  // 20260923-workspace-grouping。
  | { type: "moveWorkspace"; direction: "previous" | "next" }; // move_workspace_previous / move_workspace_next
