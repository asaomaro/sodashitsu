import { z } from "zod";

export const PREVIEW_CHUNK_BYTES = 32 * 1024;
/** Negotiated HTTP download batch; uploads retain the original 32KiB limit. */
export const PREVIEW_READ_BYTES = 256 * 1024;
export const PREVIEW_WS_BYTES = 256 * 1024;
export const PreviewId = z.string().uuid();
const headers = z.record(z.string().max(128), z.union([z.string().max(8192), z.array(z.string().max(8192)).max(32)]))
  .refine((h) => Object.keys(h).length <= 100 && JSON.stringify(h).length <= 32 * 1024, "headers too large");
const path = z.string().min(1).max(8192).refine((s) => s.startsWith("/") && !s.startsWith("//") && !/[\\\r\n\u0000#]/.test(s), "expected an origin-relative path");
const base64 = (max: number) => z.string().max(Math.ceil(max / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const PreviewOrigin = z.string().max(512).refine((s) => {
  try { const u = new URL(s); return u.origin === s && !u.username && !u.password &&
    (u.protocol === "https:" || u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)); } catch { return false; }
});
export const PreviewLocalOrigin = z.string().max(256).regex(/^http:\/\/p[0-9a-f]{32}\.localhost:[1-9][0-9]{0,4}$/)
  .refine((s) => { try { return new URL(s).origin === s; } catch { return false; } });
export const PreviewMethods = {
  "preview.register": z.object({ paneId: PreviewId, name: z.string().trim().min(1).max(80), port: z.number().int().min(1).max(65535), replace: z.boolean().optional() }).strict(),
  "preview.list": z.object({ paneId: PreviewId.optional() }).strict(),
  "preview.stop": z.object({ appId: PreviewId, remove: z.boolean().optional() }).strict(),
  "preview.viewers": z.object({ paneId: PreviewId.optional() }).strict(),
  "preview.watch": z.object({ paneId: PreviewId, origin: PreviewOrigin, viewId: PreviewId.optional() }).strict(),
  "preview.unwatch": z.object({ viewId: PreviewId.optional() }).strict(),
  "preview.poll": z.object({ viewId: PreviewId.optional() }).strict(),
  "preview.helper": z.object({ viewerId: PreviewId }).strict(),
  "preview.work": z.object({}).strict(),
  "preview.ready": z.object({ requestId: PreviewId, origin: PreviewLocalOrigin, url: z.string().max(512), expiresAt: z.number().finite() }).strict(),
  "preview.open": z.object({ appId: PreviewId, viewerId: PreviewId.optional() }).strict(),
  "preview.abort_open": z.object({ appId: PreviewId }).strict(),
  "preview.ack": z.object({ requestId: PreviewId }).strict(),
  "preview.close": z.object({ requestId: PreviewId }).strict(),
  "preview.http.begin": z.object({ requestId: PreviewId, method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]), path, headers }).strict(),
  "preview.http.write": z.object({ streamId: PreviewId, data: base64(PREVIEW_CHUNK_BYTES), end: z.boolean() }).strict(),
  "preview.http.read": z.object({ streamId: PreviewId, maxBytes: z.number().int().min(1).max(PREVIEW_READ_BYTES).optional() }).strict(),
  "preview.cancel": z.object({ streamId: PreviewId }).strict(),
  "preview.ws.begin": z.object({ requestId: PreviewId, path, headers, protocols: z.array(z.string().min(1).max(128)).max(8) }).strict(),
  "preview.ws.write": z.object({ streamId: PreviewId, data: base64(PREVIEW_WS_BYTES), binary: z.boolean() }).strict(),
  "preview.ws.read": z.object({ streamId: PreviewId }).strict(),
} as const;

export type PreviewHeaders = z.infer<typeof headers>;
export interface PreviewApp { id: string; generation: string; paneId: string; workspaceId: string; name: string; port: number; state: "registered" | "stopped" }
export interface PreviewViewer { id: string; paneId: string; origin: string; helper: boolean }
export interface PreviewDisplay { requestId: string; app: PreviewApp; origin: string; url: string; expiresAt: number }
export interface PreviewJob { requestId: string; app: PreviewApp }
export interface PreviewResults {
  "preview.register": PreviewApp;
  "preview.list": { apps: PreviewApp[] };
  "preview.stop": {};
  "preview.viewers": { viewers: PreviewViewer[] };
  "preview.watch": { viewerId: string };
  "preview.unwatch": {};
  "preview.poll": { displays: PreviewDisplay[]; helper?: boolean };
  "preview.helper": { viewerId: string; paneId: string; origin: string; httpReadMaxBytes?: number };
  "preview.work": { jobs: PreviewJob[]; active: string[] };
  "preview.ready": {};
  "preview.open": { requestId: string; status: "view_opened" };
  "preview.abort_open": {};
  "preview.ack": {};
  "preview.close": {};
  "preview.http.begin": { streamId: string };
  "preview.http.write": {};
  "preview.http.read": { kind: "wait" } | { kind: "head"; status: number; headers: PreviewHeaders } | { kind: "data"; data: string } | { kind: "end" };
  "preview.cancel": {};
  "preview.ws.begin": { streamId: string; protocol: string };
  "preview.ws.write": {};
  "preview.ws.read": { kind: "wait" } | { kind: "data"; data: string; binary: boolean } | { kind: "end" };
}
