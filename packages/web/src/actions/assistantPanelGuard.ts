import { assistantPanelTarget, assistantPanelPane } from "./assistantPanelLink.js";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
export interface PanelPorts {
  model(): {
    panes: ReadonlyMap<string, Pane>;
    tabs: ReadonlyMap<string, Tab>;
    workspaces: ReadonlyMap<string, Workspace>;
  };
  connected(): boolean;
  focus(pane: Pane, tab: Tab): void;
}
/** Install before mount/connect/input controllers. Validate again synchronously on every input event. */
export function assistantPanelGuard(ports: PanelPorts, hash = location.hash) {
  if (!hash.startsWith("#assistantPane=")) return Object.assign(() => {}, { dispose() {} });
  let target: ReturnType<typeof assistantPanelTarget> = null,
    applied = false,
    project: string | null | undefined,
    cwd: string | undefined;
  let dialog: HTMLDialogElement | null = null;
  const root = document.getElementById("app");
  if (root) root.inert = true;
  const block = (message: string) => {
    if (root) root.inert = true;
    if (dialog) {
      dialog.querySelector("p")!.textContent = message;
      return;
    }
    dialog = document.createElement("dialog");
    dialog.id = "assistant-target-guard";
    const text = document.createElement("p");
    text.textContent = message;
    const normal = document.createElement("button");
    normal.textContent = "通常の操舵室を開く・ログイン";
    normal.onclick = () => {
      location.hash = "";
      location.reload();
    };
    const close = document.createElement("button");
    close.textContent = "閉じる";
    close.onclick = () => window.close();
    dialog.append(text, normal, close);
    document.body.append(dialog);
    dialog.showModal();
  };
  try {
    target = assistantPanelTarget(hash);
  } catch {
    block("アシスタントの表示先を確認できません。");
  }
  const check = () => {
    if (!target || !ports.connected())
      throw Error(
        "通知の端末へ接続しています。ログインが必要な場合は通常の操舵室を開いてください。",
      );
    const model = ports.model();
    const value = assistantPanelPane(target, model.panes, model.tabs),
      workspace = model.workspaces.get(value.tab.workspaceId);
    if (!workspace) throw Error("対象のプロジェクトが閉じられました。");
    if (applied && (workspace.projectDir !== project || workspace.cwd !== cwd))
      throw Error("端末のプロジェクトが変更されました。通知から開き直してください。");
    return { ...value, workspace };
  };
  const update = () => {
    try {
      const { pane, tab, workspace } = check();
      if (!applied) {
        project = workspace.projectDir;
        cwd = workspace.cwd;
        applied = true;
        ports.focus(pane, tab);
      }
      dialog?.close();
      dialog?.remove();
      dialog = null;
      if (root) root.inert = false;
    } catch (error) {
      block(error instanceof Error ? error.message : "通知の端末を確認できません。");
    }
  };
  const listeners: Array<[string, EventListener]> = [];
  for (const name of [
    "keydown",
    "keyup",
    "beforeinput",
    "paste",
    "drop",
    "pointerdown",
    "click",
    "wheel",
  ]) {
    const listener: EventListener = (event) => {
      if (dialog?.contains(event.target as Node)) return;
      try {
        check();
        if (!applied) throw Error("端末を確認しています。");
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        block(error instanceof Error ? error.message : "端末が変更されました。");
      }
    };
    listeners.push([name, listener]);
    document.addEventListener(name, listener, { capture: true, passive: false });
  }
  block("通知の端末へ接続しています。");
  return Object.assign(update, {
    dispose() {
      for (const [name, listener] of listeners) document.removeEventListener(name, listener, true);
      dialog?.close();
      dialog?.remove();
      if (root) root.inert = false;
    },
  });
}
