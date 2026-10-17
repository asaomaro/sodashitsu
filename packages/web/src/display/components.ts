import { EXTENSION_ID_RE, type DisplayInfo, type Pane, type Tab } from "@sodashitsu/protocol";
import { isScriptFormat } from "./framePage.js";

export interface ComponentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TerminalComponent {
  id: string;
  paneId: string;
  interactive?: boolean;
  component?: "terminal" | "desktop-cdp";
  rect: ComponentRect;
  clip: ComponentRect;
}
export function readComponentRect(value: unknown): ComponentRect | null {
  if (!value || typeof value !== "object") return null;
  const r = value as ComponentRect;
  if (
    ![r.x, r.y, r.width, r.height].every(
      (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 32768,
    ) ||
    r.width < 0 ||
    r.height < 0
  )
    return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
/**
 * `soda.mount` を許す面か。**Sodashitsu が起動した拡張（プラグインのアプリを含む）が出した面だけ**。
 * 出どころは `DisplayInfo.source`（サーバが、拡張の `display.set` にだけ付ける。`/ws`・`pane.sock` 経由の面（pane のプログラムのもの）には付かず、
 * 面の中身・`set` の引数からは書けない）で見る。形の合う `{ type: "extension", id, scope }` のときだけ通す。
 */
export function isExtensionDisplay(info: DisplayInfo): boolean {
  const s = info.source as unknown;
  if (typeof s !== "object" || s === null) return false;
  const r = s as Record<string, unknown>;
  return (
    r["type"] === "extension" &&
    typeof r["id"] === "string" &&
    EXTENSION_ID_RE.test(r["id"]) &&
    (r["scope"] === "user" || r["scope"] === "project")
  );
}
/**
 * アプリタブのメイン画面として、覆いなしで操作中にしてよい面か（20261016-app-view-direct-operate の A）。**拡張が出した script の面だけ**（出どころは `terminalComponentAllowed` と同じ
 * `DisplayInfo.source`。pane のプログラムが同じ名前の面を出しても、`source` が付かないので `false`）。置く側（`PluginView`）が `main` を渡したときだけ、`DisplayFrame` がこれを使う。
 */
export function directOperable(info: DisplayInfo): boolean {
  return isScriptFormat(info.format) && isExtensionDisplay(info);
}
/** Author supplied IDs never bypass the owning display's workspace boundary. */
export function terminalComponentAllowed(
  info: DisplayInfo,
  paneId: string,
  panes: Map<string, Pane>,
  tabs: Map<string, Tab>,
): boolean {
  if (info.format !== "script-html" || !isExtensionDisplay(info)) return false;
  const owner = panes.get(info.paneId),
    target = panes.get(paneId);
  if (!owner || !target || target.virtual || target.status !== "running") return false;
  const workspaceId = tabs.get(owner.tabId)?.workspaceId;
  return workspaceId !== undefined && tabs.get(target.tabId)?.workspaceId === workspaceId;
}
/** Clip native DOM strictly to the iframe and the author supplied visible placeholder. */
export function componentViewport(
  c: TerminalComponent,
  width: number,
  height: number,
): ComponentRect {
  const x = Math.max(0, c.rect.x, c.clip.x),
    y = Math.max(0, c.rect.y, c.clip.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, c.rect.x + c.rect.width, c.clip.x + c.clip.width) - x),
    height: Math.max(0, Math.min(height, c.rect.y + c.rect.height, c.clip.y + c.clip.height) - y),
  };
}
