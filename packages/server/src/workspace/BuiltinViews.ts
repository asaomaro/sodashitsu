import {
  BUILTIN_WORKSPACE_KEY,
  BUILTIN_VIEWS,
  BUILTIN_DEVELOPMENT_DISPLAY,
  WorkspaceToolsParams,
  type BuiltinViewId,
} from "@sodashitsu/protocol";
import type { SessionService } from "../session/SessionService.js";
import type { DisplayService } from "../display/DisplayService.js";
import type { EventBus } from "../bus/EventBus.js";
import type { WorkspaceTools } from "./WorkspaceTools.js";
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export class BuiltinViews {
  private sub;
  private actions;
  private active = new Map<
    string,
    {
      paneId: string;
      name: string;
      workspaceId: string;
      root?: string | undefined;
      viewId: BuiltinViewId;
      placement: string;
      sourcePaneId?: string;
      terminal?: boolean;
    }
  >();
  private requests = new Map<string, number>();
  private states = new Map<string, { path: string; text: string; version?: string }>();
  constructor(
    private session: SessionService,
    private displays: DisplayService,
    bus: EventBus,
    private tools: WorkspaceTools,
  ) {
    this.sub = bus.subscribe((e) => {
      if (
        [
          "prefs.changed",
          "tab.created",
          "tab.updated",
          "workspace.updated",
          "pane.closed",
          "pane.updated",
          "session.focus_changed",
          "pane.agent_status_changed",
        ].includes(e.event)
      )
        this.sync();
    });
    this.actions = displays.onOwnedEvent((tag, e) => {
      if (tag !== BUILTIN_WORKSPACE_KEY || e.type !== "display.action") return;
      const id = `${e.paneId}|${e.name}`;
      if (this.active.has(id)) void this.act(id, e.action, e.data).catch(() => {});
    });
  }
  sync() {
    const wanted = new Map<string, typeof this.active extends Map<string, infer V> ? V : never>();
    for (const tab of this.session.snapshot().tabs) {
      for (const v of tab.views ?? [])
        if (v.extensionKey === BUILTIN_WORKSPACE_KEY) {
          for (const name of [v.display])
            wanted.set(`${v.paneId}|${name}`, {
              paneId: v.paneId,
              name,
              terminal: name === v.terminalDisplay,
              sourcePaneId: v.target === "pane" ? v.paneId : tab.focusedPaneId,
              workspaceId: tab.workspaceId,
              root: this.session.snapshot().workspaces.find((w) => w.id === tab.workspaceId)
                ?.projectDir,
              viewId: v.viewId as BuiltinViewId,
              placement: v.placement,
            });
        }
      if (tab.plugin?.extensionKey === BUILTIN_WORKSPACE_KEY && tab.displayPaneId)
        wanted.set(`${tab.displayPaneId}|${BUILTIN_DEVELOPMENT_DISPLAY}`, {
          paneId: tab.displayPaneId,
          name: BUILTIN_DEVELOPMENT_DISPLAY,
          workspaceId: tab.workspaceId,
          root: this.session.snapshot().workspaces.find((w) => w.id === tab.workspaceId)
            ?.projectDir,
          viewId: "development",
          placement: "right",
        });
    }
    for (const [id, v] of this.active)
      if (!wanted.has(id)) {
        if (this.session.hasPane(v.paneId)) this.displays.close(v.paneId, { name: v.name });
        this.states.delete(id);
      }
    for (const [id, v] of wanted)
      if (
        !this.active.has(id) ||
        this.active.get(id)?.placement !== v.placement ||
        this.active.get(id)?.root !== v.root ||
        this.active.get(id)?.workspaceId !== v.workspaceId
      ) {
        if (
          !this.states.has(id) ||
          this.active.get(id)?.root !== v.root ||
          this.active.get(id)?.workspaceId !== v.workspaceId
        )
          this.states.set(id, { path: "", text: "パスを入力し、開く／更新を選んでください。" });
        this.active.set(id, v);
        this.render(id);
      }
    for (const [id, v] of wanted) {
      const old = this.active.get(id);
      if (
        old &&
        old.workspaceId === v.workspaceId &&
        old.root === v.root &&
        old.placement === v.placement
      )
        wanted.set(id, old);
    }
    this.active = wanted;
  }
  private render(id: string) {
    const v = this.active.get(id),
      s = this.states.get(id);
    if (!v || !s || !this.session.hasPane(v.paneId)) return;
    const clipped = s.text.length > 16000;
    const shown = s.text.slice(0, 16000);
    const file = !clipped && (v.viewId === "file" || v.viewId === "development");
    const html = `<style>body{background:var(--soda-bg);color:var(--soda-fg);font:14px system-ui;margin:8px}input,textarea{box-sizing:border-box;width:100%;font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{min-height:32px}</style><form data-soda-action="read"><label>PJ内のパス<input name="path" value="${esc(s.path)}"></label><button type="submit">開く／更新</button></form>${file ? `<form data-soda-action="save"><input type="hidden" name="path" value="${esc(s.path)}"><input type="hidden" name="version" value="${s.version ?? ""}"><label>テキスト<textarea name="content">${esc(s.text)}</textarea></label><button type="submit">保存</button></form>` : ""}${clipped ? "<p>先頭部分だけを表示しています。標準のファイルウィンドウで全体を開いてください。</p>" : ""}<pre>${esc(shown)}</pre>`;
    this.displays.set(
      v.paneId,
      {
        name: v.name,
        title: BUILTIN_VIEWS.find((x) => x.id === v.viewId)?.title ?? "開発",
        kind: v.placement.startsWith("band-") ? "band" : "panel",
        format: v.terminal ? "text" : "html",
        content: v.terminal ? shown : html,
        ...(v.placement.startsWith("band-")
          ? { edge: v.placement === "band-top" ? "top" : "bottom", size: 32 }
          : { dock: v.placement, size: v.viewId === "files" ? 280 : 420 }),
      },
      {
        owner: {
          tag: BUILTIN_WORKSPACE_KEY,
          source: { type: "builtin", id: "workspace", scope: "user" },
        },
      },
    );
  }
  private async act(id: string, action: string, data: unknown) {
    const v = this.active.get(id),
      before = this.states.get(id);
    if (!v || !before) return;
    const request = (this.requests.get(id) ?? 0) + 1;
    this.requests.set(id, request);
    const fields = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    try {
      if (action !== "read" && action !== "save") return;
      const operation =
        action === "save"
          ? "write"
          : v.viewId === "files"
            ? "list"
            : v.viewId === "git-graph"
              ? "git-log"
              : v.viewId === "git-diff"
                ? "git-diff"
                : "read";
      const p = WorkspaceToolsParams.parse({
        workspaceId: v.workspaceId,
        operation,
        path: typeof fields.path === "string" ? fields.path : "",
        ...(action === "save" ? { content: fields.content, version: fields.version } : {}),
      });
      const r = await this.tools.run(p);
      if (this.active.get(id) !== v || this.requests.get(id) !== request) return;
      this.states.set(id, {
        path: p.path,
        text:
          r.text ?? r.entries?.map((e) => `${e.directory ? "▸" : " "} ${e.path}`).join("\n") ?? "",
        ...(r.version ? { version: r.version } : {}),
      });
    } catch (e) {
      if (this.active.get(id) !== v || this.requests.get(id) !== request) return;
      this.states.set(id, {
        ...before,
        text: e instanceof Error ? e.message : "操作に失敗しました",
      });
    }
    this.render(id);
  }
  close() {
    this.active.clear();
    this.sub.dispose();
    this.actions.dispose();
  }
}
