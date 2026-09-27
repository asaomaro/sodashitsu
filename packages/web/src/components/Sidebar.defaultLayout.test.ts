import type { AgentInfo, GitInfo, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey, ConnectionKey } from "../injection.js";
import type { ConnectionPort } from "../net/ports.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import Sidebar from "./Sidebar.vue";

/**
 * 既定の並び（行の並びを設定していないブラウザ）の描画が、変更前（main 97affb8）の `Sidebar.vue` と同じであること
 * （20260927-sidebar-row-tokens の AC10）。golden（`__golden__/sidebar-default-*.html`）は**変更前の `Sidebar.vue` で取った**
 * 行の `outerHTML` で、描き方を変えたら（既定の見た目を変えないかぎり）一致し続けなければならない。
 * 場面は既定の見た目の分かれ目を一通り含める: git 無し・ずれていない・ずれている（branch あり・null）・worktree 自動グループ・
 * 手動グループ（開・閉）・畳んだサイドバー・エージェントの付けた名前・未検証・状態の違い。
 */

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});

function git(overrides: Partial<GitInfo>): GitInfo {
  return { branch: "main", ahead: 0, behind: 0, repoKey: null, isLinkedWorktree: false, ...overrides };
}
function ws(id: string, overrides: Partial<Workspace> = {}): Workspace {
  return { id, label: id, cwd: "/", tabIds: [`t-${id}`], activeTabId: `t-${id}`, groupId: null, git: null, autoLabel: false, ...overrides };
}
function tab(id: string, workspaceId: string, paneId: string, label = id): Tab {
  return { id, workspaceId, label, layout: { type: "pane", paneId }, focusedPaneId: paneId, zoomedPaneId: null, sizeOwnerClientId: null };
}
function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0, ...overrides };
}
function pane(id: string, tabId: string, a: AgentInfo | null = null): Pane {
  return { id, tabId, label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: a, agentSession: null };
}

function makeConnection(): ConnectionPort {
  return { request: () => Promise.resolve({} as never), sendInput: vi.fn(), login: vi.fn(), logout: vi.fn(), connect: vi.fn() };
}

function populate(): void {
  const session = useSessionStore(pinia);
  const view = useViewStore(pinia);
  session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
  session.groupUpserted({ id: "g2", label: "closed-group", collapsed: true });
  session.workspaceUpserted(ws("plain"));
  session.workspaceUpserted(ws("clean", { git: git({}) }));
  session.workspaceUpserted(ws("ahead", { label: "Ahead <b>&amp;</b>", git: git({ ahead: 2, behind: 1 }) }));
  session.workspaceUpserted(ws("detached", { git: git({ branch: null, behind: 3 }) }));
  session.workspaceUpserted(ws("repo", { git: git({ repoKey: "/r/.git", ahead: 1 }) }));
  session.workspaceUpserted(ws("repo-wt", { git: git({ branch: "feat", repoKey: "/r/.git", isLinkedWorktree: true }) }));
  session.workspaceUpserted(ws("member1", { groupId: "g1" }));
  session.workspaceUpserted(ws("member2", { groupId: "g2" }));
  for (const w of ["plain", "clean", "ahead", "detached", "repo", "repo-wt", "member1", "member2"]) {
    session.tabUpserted(tab(`t-${w}`, w, `p-${w}`, `tab-${w}`));
  }
  session.paneUpserted(pane("p-plain", "t-plain", agent({ instanceId: "i1", state: "working" })));
  session.paneUpserted(pane("p-clean", "t-clean", agent({ instanceId: "i2", state: "blocked", name: "reviewer" })));
  session.paneUpserted(pane("p-ahead", "t-ahead", agent({ instanceId: "i3", state: "idle", label: "Codex", verified: false })));
  session.paneUpserted(pane("p-detached", "t-detached", agent({ instanceId: "i4", state: "unknown", label: "Pi", name: "n2", verified: false })));
  session.paneUpserted(pane("p-repo", "t-repo", null));
  view.setView("clean", "t-clean");
}

function mountSidebar() {
  return mount(Sidebar, {
    global: {
      plugins: [pinia],
      provide: {
        [ConnectionKey as symbol]: makeConnection(),
        [ActionDispatcherKey as symbol]: { openContextMenu: vi.fn(), run: vi.fn(), toggleGroupCollapsed: vi.fn(), moveWorkspacesByDrag: vi.fn(), openSessionSwitcher: vi.fn() },
      },
    },
  });
}

/**
 * 比べるのは見える構造（要素・属性・文字）。Vue の注釈（`<!--v-if-->`・テンプレートの注釈）・scoped CSS の属性（`data-v-*`。ファイルごとの印で、
 * クラスが同じなら同じ規則が当たる）・タグの間の空白は、描かれ方に効かないので除く。
 */
function normalize(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/ data-v-[0-9a-f]+=""/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

function rowsHtml(wrapper: ReturnType<typeof mountSidebar>): string {
  return wrapper
    .findAll(".sidebar-row")
    .map((r) => normalize(r.html()))
    .join("\n");
}

describe("Sidebar — 既定の並びは変更前の描画と同じ（AC10）", () => {
  it("展開したサイドバー", async () => {
    populate();
    const wrapper = mountSidebar();
    await expect(rowsHtml(wrapper)).toMatchFileSnapshot("./__golden__/sidebar-default-expanded.html");
  });

  it("畳んだサイドバー", async () => {
    populate();
    useViewStore(pinia).sidebarCollapsed = true;
    const wrapper = mountSidebar();
    await expect(rowsHtml(wrapper)).toMatchFileSnapshot("./__golden__/sidebar-default-collapsed.html");
  });
});
