import type { DisplayInfo, Pane, Tab } from "@sodashitsu/protocol";

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
/** Author supplied IDs never bypass the owning display's workspace boundary. */
export function terminalComponentAllowed(
  info: DisplayInfo,
  paneId: string,
  panes: Map<string, Pane>,
  tabs: Map<string, Tab>,
): boolean {
  if (info.format !== "script-html") return false;
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
