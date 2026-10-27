import { z } from "zod";
/** 48 kHz, mono, signed 16-bit little-endian PCM; exactly 20 ms per packet. */
export const DESKTOP_MICROPHONE_PROTOCOL = "soda-desktop-microphone-v1";
export const DESKTOP_MICROPHONE_BYTES = 1920;
export const DESKTOP_MICROPHONE_HELLO = new Uint8Array([83,68,77,73,1,1,16,0,128,187,0,0,192,3,0,0]);
const id = z.string().uuid();
export const DesktopMicrophoneRequest = z.discriminatedUnion("type", [
  z.object({ type:z.literal("microphone_start"), id }).strict(),
  z.object({ type:z.literal("microphone_stop"), id }).strict(),
  z.object({ type:z.literal("microphone_frame"), id, seq:z.number().int().min(1).max(0xffffffff),
    data:z.string().length(2560).regex(/^[A-Za-z0-9+/]{2560}$/) }).strict(),
]);
export type DesktopMicrophoneRequest = z.infer<typeof DesktopMicrophoneRequest>;
export const DesktopMicrophoneResult = z.discriminatedUnion("type", [
  z.object({ type:z.literal("microphone_status"), id, state:z.enum(["starting","running","stopped","unavailable"]) }).strict(),
  z.object({ type:z.literal("microphone_ack"), id, seq:z.number().int().min(1).max(0xffffffff) }).strict(),
]);
export type DesktopMicrophoneResult = z.infer<typeof DesktopMicrophoneResult>;
