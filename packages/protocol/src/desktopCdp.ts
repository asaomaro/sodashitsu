import { z } from "zod";
import { PreviewOrigin } from "./preview.js";

/** Narrow remote GUI messages. CDP method names/expressions never cross this boundary. */
export const DesktopInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("pointer"),
      event: z.enum(["mousePressed", "mouseReleased", "mouseMoved", "mouseWheel"]),
      x: z.number().finite().min(0).max(32768),
      y: z.number().finite().min(0).max(32768),
      button: z.enum(["none", "left", "middle", "right"]),
      buttons: z.number().int().min(0).max(7),
      modifiers: z.number().int().min(0).max(15),
      clickCount: z.number().int().min(0).max(3),
      deltaX: z.number().finite().min(-10000).max(10000),
      deltaY: z.number().finite().min(-10000).max(10000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("key"),
      event: z.enum(["keyDown", "keyUp"]),
      key: z.string().max(64),
      code: z.string().max(64),
      modifiers: z.number().int().min(0).max(15),
      repeat: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(8192) }).strict(),
]);
export type DesktopInput = z.infer<typeof DesktopInput>;
export const DesktopViewport = z.object({
  width: z.number().int().min(160).max(4096),
  height: z.number().int().min(120).max(2400),
}).strict().nullable();
export const DesktopViewerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("invite") }).strict(),
  z.object({ type: z.literal("launch") }).strict(),
  z.object({ type: z.literal("launchConnect"), targetId: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/) }).strict(),
  z.object({ type: z.literal("connect"), deviceId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("forget"), deviceId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("control"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("input"), input: DesktopInput }).strict(),
  z.object({ type: z.literal("viewport"), size: DesktopViewport }).strict(),
  z.object({ type: z.literal("ack"), seq: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("stop") }).strict(),
]);
export const DesktopBridgeMessage = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("hello"),
      token: z.string().regex(/^[a-f0-9]{64}$/),
      title: z.string().max(256),
      allowInput: z.boolean(),
      allowFit: z.boolean().optional().default(false),
      remember: z.boolean().optional().default(false),
    })
    .strict(),
  z.object({
    type: z.literal("resume"), deviceId: z.string().uuid(), secret: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().max(256), allowInput: z.boolean(), allowFit: z.boolean().optional().default(false),
  }).strict(),
  z.object({ type: z.literal("stopped"), shareId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("frame"),
      shareId: z.string().uuid().optional(),
      seq: z.number().int().positive(),
      width: z.number().int().positive().max(32768),
      height: z.number().int().positive().max(32768),
      data: z
        .string()
        .min(4)
        .max(3 * 1024 * 1024)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
]);

export const DesktopCdpOpenParams = z.object({}).strict();
export const DesktopCdpSendParams = z.object({ message: DesktopViewerMessage }).strict();

export const VscodeSharingPermissions = z.object({enabled:z.boolean(),allowInput:z.boolean(),allowFit:z.boolean(),sodaOrigin:z.union([z.literal(""),PreviewOrigin]).optional()}).strict();
export type VscodeSharingPermissions = z.infer<typeof VscodeSharingPermissions>;
export interface VscodeSharingSettingsResult { permissions: VscodeSharingPermissions; supported:boolean; canConfigure:boolean; customCommand:boolean }
export const VscodeSharingMethods = {
  "vscode.settings.get": z.object({}).strict(),
  "vscode.settings.set": VscodeSharingPermissions,
};
export interface VscodeSharingResults { "vscode.settings.get": VscodeSharingSettingsResult; "vscode.settings.set": VscodeSharingSettingsResult }
