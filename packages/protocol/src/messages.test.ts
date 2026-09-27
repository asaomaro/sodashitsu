import { describe, expect, it } from "vitest";
import {
  AgentIntegrationInstallParams,
  AgentPromptParams,
  AgentSendKeysParams,
  ClientThemeParams,
  GroupAddMemberParams,
  GroupCreateParams,
  GroupDeleteParams,
  GroupRemoveMemberParams,
  GroupRenameParams,
  GroupToggleCollapsedParams,
  MAX_AGENT_PROMPT_BYTES,
  METADATA_RAW_TEXT_MAX,
  METADATA_TOKEN_ENTRIES_MAX,
  METHOD_SCHEMAS,
  NewCwd,
  PaneAttachParams,
  PaneAttachResizeParams,
  PaneDetachParams,
  PaneEditScrollbackParams,
  PaneMoveToEdgeParams,
  PaneMoveToNewTabParams,
  PaneMoveToTabParams,
  PaneReplaceParams,
  PaneReportMetadataParams,
  PaneSplitParams,
  TabCreateParams,
  TabMoveParams,
  WorkspaceCloseParams,
  WorkspaceCreateParams,
  WorkspaceMoveParams,
  WorkspaceMoveToParams,
  WorkspaceRenameParams,
  WorkspaceReportMetadataParams,
  WorktreeRemoveParams,
} from "./messages.js";
import { THEME_NAMES } from "./theme.js";

describe("messages", () => {
  it("validates pane.split params", () => {
    const parsed = PaneSplitParams.parse({ paneId: "p1", direction: "right" });
    expect(parsed).toEqual({ paneId: "p1", direction: "right" });
  });

  it("rejects an out-of-range ratio", () => {
    expect(() => PaneSplitParams.parse({ paneId: "p1", direction: "right", ratio: 1.5 })).toThrow();
  });

  // 20260923-missing-keybinding-actions（move_tab_previous/move_tab_next 相当）。
  it("validates tab.move params (direction is previous/next only)", () => {
    expect(TabMoveParams.parse({ tabId: "t1", direction: "next" })).toEqual({ tabId: "t1", direction: "next" });
    expect(() => TabMoveParams.parse({ tabId: "t1", direction: "up" })).toThrow();
  });

  // 20260923-other-agents-session-resume（decisions D5。model.ts の AgentIntegrationKind と
  // 値を揃える必要がある別スキーマだったため、追加漏れを検知するテストを足す）。
  it("validates agent_integration.install params for all 8 kinds", () => {
    for (const kind of ["claude", "codex", "cursor", "copilot", "devin", "droid", "grok", "qwen"]) {
      expect(AgentIntegrationInstallParams.parse({ kind })).toEqual({ kind });
    }
    expect(() => AgentIntegrationInstallParams.parse({ kind: "gemini" })).toThrow();
  });

  // 20260923-workspace-grouping。herdr の close_group 相当。省略可（既定は呼び出し側で決める。
  // タスク点検の指摘：`.default(false)` だと z.infer の TS 型が必須になり既存の呼び出し元が壊れる）。
  it("workspace.close の closeLinkedWorktrees は省略可", () => {
    expect(WorkspaceCloseParams.parse({ workspaceId: "w1" })).toEqual({ workspaceId: "w1" });
    expect(WorkspaceCloseParams.parse({ workspaceId: "w1", closeLinkedWorktrees: true })).toEqual({
      workspaceId: "w1",
      closeLinkedWorktrees: true,
    });
  });

  // 20260923-workspace-grouping（キーバインド用。tab.move と同じ delta 指定の形）。
  it("validates workspace.move params (direction is previous/next only)", () => {
    expect(WorkspaceMoveParams.parse({ workspaceId: "w1", direction: "previous" })).toEqual({
      workspaceId: "w1",
      direction: "previous",
    });
    expect(() => WorkspaceMoveParams.parse({ workspaceId: "w1", direction: "up" })).toThrow();
  });

  // 20260923-workspace-grouping（D&D 用。anchor 指定。複数 ID で単一ドラッグ・グループ一括移動を両方表す）。
  it("validates workspace.move_to params", () => {
    expect(WorkspaceMoveToParams.parse({ workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w3" })).toEqual({
      workspaceIds: ["w1", "w2"],
      beforeWorkspaceId: "w3",
    });
    // 末尾へ移す（anchor 無し）
    expect(WorkspaceMoveToParams.parse({ workspaceIds: ["w1"], beforeWorkspaceId: null })).toEqual({
      workspaceIds: ["w1"],
      beforeWorkspaceId: null,
    });
    // 空配列は弾く（動かす対象が無い要求は不正）
    expect(() => WorkspaceMoveToParams.parse({ workspaceIds: [], beforeWorkspaceId: null })).toThrow();
  });

  // 20260923-workspace-grouping（手動グループの CRUD）。
  it("validates group.* params", () => {
    expect(GroupCreateParams.parse({ label: "backend" })).toEqual({ label: "backend" });
    expect(() => GroupCreateParams.parse({ label: "" })).toThrow(); // 空の名前は弾く
    expect(GroupRenameParams.parse({ groupId: "g1", label: "frontend" })).toEqual({ groupId: "g1", label: "frontend" });
    expect(() => GroupRenameParams.parse({ groupId: "g1", label: "" })).toThrow();
    expect(GroupDeleteParams.parse({ groupId: "g1" })).toEqual({ groupId: "g1" });
    expect(GroupAddMemberParams.parse({ groupId: "g1", workspaceId: "w1" })).toEqual({ groupId: "g1", workspaceId: "w1" });
    expect(GroupRemoveMemberParams.parse({ workspaceId: "w1" })).toEqual({ workspaceId: "w1" });
    expect(GroupToggleCollapsedParams.parse({ groupId: "g1" })).toEqual({ groupId: "g1" });
  });

  // 20260924-pane-dnd-split-move（ドラッグでの分割。縁は4方向）。
  it("validates pane.move_to_edge params (edge is top/bottom/left/right only)", () => {
    expect(PaneMoveToEdgeParams.parse({ paneId: "p1", targetPaneId: "p2", edge: "left" })).toEqual({
      paneId: "p1",
      targetPaneId: "p2",
      edge: "left",
    });
    expect(() => PaneMoveToEdgeParams.parse({ paneId: "p1", targetPaneId: "p2", edge: "up" })).toThrow();
  });

  // 20260924-pane-dnd-split-move（ドラッグでの分割解除）。
  it("validates pane.replace params", () => {
    expect(PaneReplaceParams.parse({ paneId: "p1", targetPaneId: "p2" })).toEqual({ paneId: "p1", targetPaneId: "p2" });
  });

  // 20260924-pane-move-cross-tab（ドラッグで tab バーの tab へ移動）。
  it("validates pane.move_to_tab params", () => {
    expect(PaneMoveToTabParams.parse({ paneId: "p1", targetTabId: "t2" })).toEqual({ paneId: "p1", targetTabId: "t2" });
  });

  // 20260924-pane-move-cross-tab（ドラッグでサイドバーの workspace 行へ移動）。
  it("validates pane.move_to_new_tab params", () => {
    expect(PaneMoveToNewTabParams.parse({ paneId: "p1", targetWorkspaceId: "w2" })).toEqual({ paneId: "p1", targetWorkspaceId: "w2" });
  });

  // 20260924-worktree-remove。
  it("validates worktree.remove params (force is optional)", () => {
    expect(WorktreeRemoveParams.parse({ workspaceId: "w1", path: "/tmp/wt1" })).toEqual({ workspaceId: "w1", path: "/tmp/wt1" });
    expect(WorktreeRemoveParams.parse({ workspaceId: "w1", path: "/tmp/wt1", force: true })).toEqual({ workspaceId: "w1", path: "/tmp/wt1", force: true });
    expect(() => WorktreeRemoveParams.parse({ workspaceId: "w1", path: "" })).toThrow(); // 空文字は拒否
  });

  it("pane.edit_scrollback は paneId だけを受け、それ以外の値は取り除く（20260926-edit-scrollback の AC14）", () => {
    expect(PaneEditScrollbackParams.parse({ paneId: "p1" })).toEqual({ paneId: "p1" });
    expect(PaneEditScrollbackParams.parse({ paneId: "p1", path: "/etc/passwd", editor: "rm -rf /" })).toEqual({ paneId: "p1" });
    expect(() => PaneEditScrollbackParams.parse({})).toThrow();
    expect(() => PaneEditScrollbackParams.parse({ paneId: "" })).toThrow();
    expect(METHOD_SCHEMAS["pane.edit_scrollback"]).toBe(PaneEditScrollbackParams);
  });

  it("registers a schema for every method the WebSocket table defines", () => {
    const methods = Object.keys(METHOD_SCHEMAS);
    expect(methods).toContain("client.hello");
    expect(methods).toContain("pane.subscribe");
    expect(methods).toContain("pane.unsubscribe");
    expect(methods).toContain("layout.set_split_ratio");
    expect(methods.length).toBe(Object.keys(METHOD_SCHEMAS).length);
    expect(new Set(methods).size).toBe(methods.length); // 重複登録が無い
  });
});

// 20260921-new-terminal-cwd：新しく開く場所の方針（herdr の `terminal.new_cwd`）。
describe("NewCwd", () => {
  it("4 つの方針の形を受け付ける", () => {
    expect(NewCwd.parse({ policy: "follow", sourcePaneId: "p1" })).toEqual({
      policy: "follow",
      sourcePaneId: "p1",
    });
    expect(NewCwd.parse({ policy: "follow" })).toEqual({ policy: "follow" }); // 分割では元の pane を付けない
    expect(NewCwd.parse({ policy: "home" })).toEqual({ policy: "home" });
    expect(NewCwd.parse({ policy: "current" })).toEqual({ policy: "current" });
    expect(NewCwd.parse({ policy: "path", path: "~/work" })).toEqual({
      policy: "path",
      path: "~/work",
    });
  });

  // 「指定した場所」を選んだまま何も入れていないブラウザから届く形。ここで弾くと作成が失敗する（サーバが使えない場所として扱う）。
  it("path の空文字・相対パスは通す（弾くのはサーバの検証）", () => {
    expect(NewCwd.parse({ policy: "path", path: "" })).toEqual({ policy: "path", path: "" });
    expect(NewCwd.parse({ policy: "path", path: "work/dir" })).toEqual({
      policy: "path",
      path: "work/dir",
    });
  });

  it("知らない方針・必要な値が無い形を弾く", () => {
    expect(() => NewCwd.parse({ policy: "elsewhere" })).toThrow();
    expect(() => NewCwd.parse({ policy: "path" })).toThrow(); // path が無い
    expect(() => NewCwd.parse({ policy: "follow", sourcePaneId: "" })).toThrow(); // 空の pane id
    expect(() => NewCwd.parse({})).toThrow();
  });

  it("3 つの作成の params が newCwd を受け付ける（無くてもよい）", () => {
    expect(WorkspaceCreateParams.parse({ newCwd: { policy: "home" } }).newCwd).toEqual({
      policy: "home",
    });
    expect(
      TabCreateParams.parse({ workspaceId: "w1", newCwd: { policy: "follow", sourcePaneId: "p1" } })
        .newCwd,
    ).toEqual({
      policy: "follow",
      sourcePaneId: "p1",
    });
    expect(
      PaneSplitParams.parse({ paneId: "p1", direction: "right", newCwd: { policy: "current" } })
        .newCwd,
    ).toEqual({ policy: "current" });
    expect(WorkspaceCreateParams.parse({}).newCwd).toBeUndefined();
  });

  // worktree を開く経路は cwd を明示する。両方来てもスキーマは通し、どちらを使うかはサーバが決める（cwd が勝つ。design D5）。
  it("workspace.create は cwd と newCwd を両方受け付ける", () => {
    expect(WorkspaceCreateParams.parse({ cwd: "/repo/wt", newCwd: { policy: "home" } })).toEqual({
      cwd: "/repo/wt",
      newCwd: { policy: "home" },
    });
  });
});

// 20260921-workspace-auto-label：null で自動の名前に戻す（pane の名前と同じ形）。
describe("WorkspaceRenameParams", () => {
  it("名前を付ける（文字列）と、自動の名前に戻す（null）を受け付ける", () => {
    expect(WorkspaceRenameParams.parse({ workspaceId: "w1", label: "api" }).label).toBe("api");
    expect(WorkspaceRenameParams.parse({ workspaceId: "w1", label: null }).label).toBeNull();
    // 空白だけはスキーマでは弾かず、サーバが trim して自動の名前として扱う（design D10 の前提）。
    expect(WorkspaceRenameParams.parse({ workspaceId: "w1", label: "  " }).label).toBe("  ");
  });

  // 空と null の 2 通りの「無い」を作らない（design D5）。空白だけはサーバが trim して自動として扱う（design D10）。
  it("空文字と、label の無い形は弾く", () => {
    expect(() => WorkspaceRenameParams.parse({ workspaceId: "w1", label: "" })).toThrow();
    expect(() => WorkspaceRenameParams.parse({ workspaceId: "w1" })).toThrow();
  });
});

// 20260921-theme-settings：ブラウザが表示しているテーマの名前をサーバへ伝える（design D1）。
describe("ClientThemeParams", () => {
  it("17 のテーマの名前だけを受ける", () => {
    expect(THEME_NAMES).toHaveLength(17);
    for (const theme of THEME_NAMES) expect(ClientThemeParams.parse({ theme })).toEqual({ theme });
    expect(() => ClientThemeParams.parse({ theme: "terminal" })).toThrow();
    expect(() => ClientThemeParams.parse({ theme: "Dracula" })).toThrow();
    expect(() => ClientThemeParams.parse({})).toThrow();
  });

  it("方式の表に client.theme がある", () => {
    expect(METHOD_SCHEMAS["client.theme"]).toBe(ClientThemeParams);
  });
});

// 20260926-agent-prompt-send-keys：herdr の agent.prompt / agent.send_keys に相当する方式。
describe("AgentPromptParams / AgentSendKeysParams", () => {
  it("本文は UTF-8 で 1MB まで受け、超えたら弾く（空は通す——サーバが empty_agent_prompt で返す）", () => {
    expect(AgentPromptParams.parse({ paneId: "p1", text: "" })).toEqual({ paneId: "p1", text: "" });
    expect(AgentPromptParams.parse({ paneId: "p1", text: "a".repeat(MAX_AGENT_PROMPT_BYTES) }).text).toHaveLength(MAX_AGENT_PROMPT_BYTES);
    expect(() => AgentPromptParams.parse({ paneId: "p1", text: "a".repeat(MAX_AGENT_PROMPT_BYTES + 1) })).toThrow();
    // 3 バイトの文字で数える（文字数ではなくバイト数）。
    const third = Math.floor(MAX_AGENT_PROMPT_BYTES / 3) + 1;
    expect(() => AgentPromptParams.parse({ paneId: "p1", text: "あ".repeat(third) })).toThrow();
    expect(() => AgentPromptParams.parse({ paneId: "", text: "x" })).toThrow();
    expect(AgentPromptParams.parse({ paneId: "p1", instanceId: "a1", text: "x" })).toEqual({ paneId: "p1", instanceId: "a1", text: "x" });
    expect(() => AgentPromptParams.parse({ paneId: "p1", instanceId: "", text: "x" })).toThrow();
  });

  it("キーは 1〜256 個", () => {
    expect(AgentSendKeysParams.parse({ paneId: "p1", keys: ["esc"] })).toEqual({ paneId: "p1", keys: ["esc"] });
    expect(() => AgentSendKeysParams.parse({ paneId: "p1", keys: [] })).toThrow();
    expect(() => AgentSendKeysParams.parse({ paneId: "p1", keys: Array.from({ length: 257 }, () => "a") })).toThrow();
  });

  it("方式の表にある", () => {
    expect(METHOD_SCHEMAS["agent.prompt"]).toBe(AgentPromptParams);
    expect(METHOD_SCHEMAS["agent.send_keys"]).toBe(AgentSendKeysParams);
  });
});

// 20260926-pane-direct-connect：herdr の terminal attach に相当する方式。
describe("PaneAttachParams / PaneAttachResizeParams / PaneDetachParams", () => {
  it("大きさは正の整数。takeover は省略できる", () => {
    expect(PaneAttachParams.parse({ paneId: "p1", cols: 80, rows: 24 })).toEqual({ paneId: "p1", cols: 80, rows: 24 });
    expect(PaneAttachParams.parse({ paneId: "p1", cols: 80, rows: 24, takeover: true }).takeover).toBe(true);
    for (const bad of [{ cols: 0, rows: 24 }, { cols: 80, rows: -1 }, { cols: 80.5, rows: 24 }]) {
      expect(() => PaneAttachParams.parse({ paneId: "p1", ...bad })).toThrow();
      expect(() => PaneAttachResizeParams.parse({ paneId: "p1", ...bad })).toThrow();
    }
    expect(() => PaneAttachParams.parse({ paneId: "", cols: 80, rows: 24 })).toThrow();
    expect(() => PaneDetachParams.parse({ paneId: "" })).toThrow();
  });

  it("方式の表にある", () => {
    expect(METHOD_SCHEMAS["pane.attach"]).toBe(PaneAttachParams);
    expect(METHOD_SCHEMAS["pane.attach_resize"]).toBe(PaneAttachResizeParams);
    expect(METHOD_SCHEMAS["pane.detach"]).toBe(PaneDetachParams);
  });
});

describe("独自トークンの報告（20260927-sidebar-row-tokens）", () => {
  it("workspace.report_metadata・pane.report_metadata が方式の表にある", () => {
    expect(METHOD_SCHEMAS["workspace.report_metadata"]).toBe(WorkspaceReportMetadataParams);
    expect(METHOD_SCHEMAS["pane.report_metadata"]).toBe(PaneReportMetadataParams);
  });

  it("tokens は {name, value} の配列で、value は null（消去）も取る。seq・ttlMs は任意", () => {
    const parsed = WorkspaceReportMetadataParams.parse({ workspaceId: "w1", source: "hook", tokens: [{ name: "a", value: "1" }, { name: "b", value: null }] });
    expect(parsed).toEqual({ workspaceId: "w1", source: "hook", tokens: [{ name: "a", value: "1" }, { name: "b", value: null }] });
    const pane = PaneReportMetadataParams.parse({ paneId: "p1", source: "s", tokens: [], seq: 3, ttlMs: 10 });
    expect(pane.seq).toBe(3);
    expect(pane.ttlMs).toBe(10);
  });

  it("__proto__ という名前も、ただの文字列として残る（map で受けないため。decisions D7）", () => {
    const raw = JSON.parse('{"workspaceId":"w1","source":"s","tokens":[{"name":"__proto__","value":"x"}]}') as unknown;
    const parsed = WorkspaceReportMetadataParams.parse(raw);
    expect(parsed.tokens).toEqual([{ name: "__proto__", value: "x" }]);
  });

  it("herdr の map の形（tokens: {名前: 値}）は受けない", () => {
    expect(WorkspaceReportMetadataParams.safeParse({ workspaceId: "w1", source: "s", tokens: { a: "1" } }).success).toBe(false);
  });

  it("seq は 0 以上の安全な整数だけ。小数・負・大きすぎる値は弾く", () => {
    const base = { workspaceId: "w1", source: "s", tokens: [] };
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, seq: 0 }).success).toBe(true);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, seq: Number.MAX_SAFE_INTEGER }).success).toBe(true);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, seq: -1 }).success).toBe(false);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, seq: 1.5 }).success).toBe(false);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, seq: Number.MAX_SAFE_INTEGER + 2 }).success).toBe(false);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, ttlMs: 1.5 }).success).toBe(false);
  });

  it("生の大きさを抑える（組の数・source・name・value の長さ）", () => {
    const base = { workspaceId: "w1", source: "s", tokens: [] as { name: string; value: string | null }[] };
    const long = "x".repeat(METADATA_RAW_TEXT_MAX + 1);
    const ok = "x".repeat(METADATA_RAW_TEXT_MAX);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, source: ok }).success).toBe(true);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, source: long }).success).toBe(false);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, tokens: [{ name: long, value: "v" }] }).success).toBe(false);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, tokens: [{ name: "n", value: long }] }).success).toBe(false);
    const many = Array.from({ length: METADATA_TOKEN_ENTRIES_MAX + 1 }, (_, i) => ({ name: `k${i}`, value: "v" }));
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, tokens: many }).success).toBe(false);
    expect(WorkspaceReportMetadataParams.safeParse({ ...base, tokens: many.slice(1) }).success).toBe(true);
  });
});
