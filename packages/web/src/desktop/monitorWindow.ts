import type { DesktopMonitorLayout } from "@sodashitsu/protocol";
import { normalizeSettings, type ConnectionSettings } from "./settings.js";

/** Launch preferences only. Never a grant, ticket, credential, key or image. */
export type MonitorWindowLaunch = {
  machineId: string; label: string; monitor: string; settings: ConnectionSettings;
  cursor: boolean; clipboard: boolean; deltas: boolean;
};
export function parseMonitorWindow(raw: unknown): MonitorWindowLaunch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid monitor window");
  const v = raw as Record<string, unknown>;
  const keys = ["machineId", "label", "monitor", "settings", "cursor", "clipboard", "deltas"];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k)) ||
      typeof v.machineId !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(v.machineId) ||
      typeof v.label !== "string" || v.label.length > 256 ||
      typeof v.monitor !== "string" || !v.monitor.length || v.monitor.length > 128 || v.monitor === "all" || v.monitor.includes("\0") ||
      typeof v.cursor !== "boolean" || typeof v.clipboard !== "boolean" || typeof v.deltas !== "boolean") throw Error("Invalid monitor window");
  const settings = normalizeSettings(v.settings);
  if (v.cursor && !settings.image.showCursor || v.deltas && !settings.deltas) throw Error("Invalid monitor cohort");
  return {machineId:v.machineId,label:v.label,monitor:v.monitor,settings,cursor:v.cursor,clipboard:v.clipboard,deltas:v.deltas};
}
export function monitorWindowUrl(raw: MonitorWindowLaunch, origin: string): URL {
  const url = new URL("/desktop-view", origin);
  url.hash = encodeURIComponent(JSON.stringify(parseMonitorWindow(raw)));
  return url;
}
export function readMonitorWindow(hash: string): MonitorWindowLaunch {
  if (hash.length > 8192) throw Error("Monitor window URL too long");
  return parseMonitorWindow(JSON.parse(decodeURIComponent(hash.slice(1))));
}
/** Fraction of the full capture. Keep the full canvas DOM rectangle for input mapping. */
export function monitorViewport(layout: DesktopMonitorLayout | undefined, id: string) {
  if (!layout || layout.selected !== "all") return undefined;
  const monitor = layout.monitors.find(m => m.id === id);
  if (!monitor) return undefined;
  return {x:(monitor.x-layout.bounds.x)/layout.bounds.width,y:(monitor.y-layout.bounds.y)/layout.bounds.height,
    width:monitor.width/layout.bounds.width,height:monitor.height/layout.bounds.height};
}
/** Clamp captured drags to the visible physical monitor, including its last pixel. */
export function monitorPointer(layout: DesktopMonitorLayout, id: string, x: number, y: number) {
  const monitor=layout.monitors.find(m=>m.id===id);
  if(layout.selected!=="all"||!monitor||!Number.isFinite(x)||!Number.isFinite(y))return undefined;
  const offsetX=monitor.x-layout.bounds.x,offsetY=monitor.y-layout.bounds.y;
  return {x:Math.max(offsetX,Math.min(offsetX+monitor.width-1,x*layout.bounds.width))/Math.max(1,layout.bounds.width-1),
    y:Math.max(offsetY,Math.min(offsetY+monitor.height-1,y*layout.bounds.height))/Math.max(1,layout.bounds.height-1)};
}

/** A desktop entry without a remote workspace; carries no key, ticket or grant. */
export type DesktopWindowLaunch={machineId:string;label:string};
export function parseDesktopWindow(raw:unknown):DesktopWindowLaunch{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid desktop window");const value=raw as Record<string,unknown>;
 if(Object.keys(value).length!==2||Object.keys(value).some(key=>key!=="machineId"&&key!=="label")||typeof value.machineId!=="string"||!/^[a-zA-Z0-9-]{1,128}$/.test(value.machineId)||typeof value.label!=="string"||value.label.length>256||value.label.includes("\0"))throw Error("Invalid desktop window");return {machineId:value.machineId,label:value.label};
}
export function desktopWindowUrl(raw:DesktopWindowLaunch,origin:string):URL{const url=new URL("/desktop-view",origin);url.hash=encodeURIComponent(JSON.stringify(parseDesktopWindow(raw)));return url;}
export function readDesktopWindow(hash:string):DesktopWindowLaunch|MonitorWindowLaunch{
 if(hash.length>8192)throw Error("Desktop window URL too long");const value=JSON.parse(decodeURIComponent(hash.slice(1)));return value&&typeof value==="object"&&Object.hasOwn(value,"monitor")?parseMonitorWindow(value):parseDesktopWindow(value);
}
