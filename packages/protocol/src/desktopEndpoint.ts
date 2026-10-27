import { z } from "zod";
import { DESKTOP_IMAGE_LANE_PROTOCOL } from "./desktop.js";
import { DESKTOP_FILES_PROTOCOL } from "./desktopFiles.js";
import { DESKTOP_MICROPHONE_PROTOCOL } from "./desktopMicrophone.js";
import { DESKTOP_RICH_CLIPBOARD_PROTOCOL } from "./desktopClipboard.js";
import { isDesktopAudio } from "./desktopAudio.js";
import { isDesktopCursor } from "./desktopCursor.js";
import { DESKTOP_VIDEO_LANE_PROTOCOL, isDesktopMediaChunk } from "./desktopMedia.js";
export const DESKTOP_ENDPOINT_PROTOCOL = "soda-desktop-e2e-v1";
export const DesktopEndpointMachine = z
  .string()
  .regex(/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/);
export const DesktopEndpointFingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const DesktopEndpointPeer = z
  .object({
    fingerprint: DesktopEndpointFingerprint,
    role: z.enum(["viewer", "agent"]),
    label: z.string().trim().min(1).max(80),
  })
  .strict();
export type DesktopEndpointPeer = z.infer<typeof DesktopEndpointPeer>;
export const DesktopEndpointHello = z
  .object({
    version: z.literal(DESKTOP_ENDPOINT_PROTOCOL),
    generation: z.number().int().min(1).max(0xffffffff),
    session: z.string().uuid(),
    role: z.enum(["provider", "viewer", "agent"]),
    identity: z.string().regex(/^04[a-f0-9]{128}$/),
    ephemeral: z.string().regex(/^04[a-f0-9]{128}$/),
    nonce: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const DesktopEndpointStart = z
  .object({
    url: z.string().url().max(2048),
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    machineId: DesktopEndpointMachine,
    session: z.string().uuid(),
    hello: DesktopEndpointHello,
    parent: z.string().uuid().optional(),
    attachment: z.string().uuid().optional(),
    binding: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.session === value.hello.session &&
      value.hello.generation === 1 &&
      value.hello.role !== "provider" &&
      (value.hello.role!=="agent"||!value.parent&&!value.attachment&&!value.binding) &&
      [value.parent, value.attachment, value.binding].filter((value) => value !== undefined)
        .length %
        3 ===
        0,
  );
export type DesktopEndpointStart = z.infer<typeof DesktopEndpointStart>;
export interface DesktopEndpointStatus {
  available: boolean;
  initialized: boolean;
  required: boolean;
  fingerprint?: string;
  peers: DesktopEndpointPeer[];
  message?: string;
}
export const DesktopEndpointMethods = {
  "desktop.endpoint.status": z.object({}).strict(),
  "desktop.endpoint.initialize": z.object({}).strict(),
  "desktop.endpoint.required": z.object({ required: z.boolean() }).strict(),
  "desktop.endpoint.trust": DesktopEndpointPeer,
  "desktop.endpoint.revoke": z
    .object({ fingerprint: DesktopEndpointFingerprint, role: z.enum(["viewer", "agent"]) })
    .strict(),
  "desktop.endpoint.start": DesktopEndpointStart,
};
export interface DesktopEndpointResults {
  "desktop.endpoint.status": DesktopEndpointStatus;
  "desktop.endpoint.initialize": DesktopEndpointStatus;
  "desktop.endpoint.required": DesktopEndpointStatus;
  "desktop.endpoint.trust": DesktopEndpointStatus;
  "desktop.endpoint.revoke": DesktopEndpointStatus;
  "desktop.endpoint.start": { started: true };
}
export type DesktopEndpointLane =
  | "control"
  | "image"
  | "video"
  | "cursor"
  | "audio"
  | "microphone"
  | "clipboard"
  | "files"
  | "agent";
export const DESKTOP_ENDPOINT_CHILDREN = new Map<string, string>([
  ["image_ticket", DESKTOP_IMAGE_LANE_PROTOCOL],
  ["video_ticket", DESKTOP_VIDEO_LANE_PROTOCOL],
  ["microphone_ticket", DESKTOP_MICROPHONE_PROTOCOL],
  ["files_ticket", DESKTOP_FILES_PROTOCOL],
  ["clipboard_rich_ticket", DESKTOP_RICH_CLIPBOARD_PROTOCOL],
]);
export function desktopEndpointLane(
  protocol: string | undefined,
  raw: Uint8Array,
  binary: boolean,
): DesktopEndpointLane {
  if (protocol === DESKTOP_FILES_PROTOCOL) return "files";
  if (protocol === DESKTOP_MICROPHONE_PROTOCOL) return "microphone";
  if (protocol === DESKTOP_RICH_CLIPBOARD_PROTOCOL) return "clipboard";
  if (binary) {
    if (isDesktopAudio(raw)) return "audio";
    if (isDesktopCursor(raw)) return "cursor";
    if (isDesktopMediaChunk(raw)) return "video";
    return "image";
  }
  const type = (
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as { type?: unknown }
  ).type;
  if (typeof type !== "string") throw Error("Desktop endpoint record type");
  if (type.startsWith("clipboard")) return "clipboard";
  if (type.startsWith("microphone")) return "microphone";
  if (type.startsWith("files_") || type.startsWith("desktop_file")) return "files";
  if (type.startsWith("agent_")) return "agent";
  return protocol === DESKTOP_IMAGE_LANE_PROTOCOL
    ? "image"
    : protocol === DESKTOP_VIDEO_LANE_PROTOCOL
      ? "video"
      : "control";
}
export const DesktopEndpointConnect = z
  .object({
    type: z.literal("connect"),
    protocols: z.array(z.string().regex(/^soda-desktop-[a-z0-9-]{1,64}$/)).max(32),
  })
  .strict();
