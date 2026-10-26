import {z} from "zod";
export const DESKTOP_NATIVE_ADAPTIVE_PROTOCOL="soda-desktop-native-adaptive-v1";
export const DesktopNativeProfilePending=z.object({type:z.literal("native_profile_pending"),id:z.string().uuid(),generation:z.number().int().min(2).max(0xffffffff)}).strict();
export const DesktopNativeFormatAck=z.object({type:z.literal("native_format_ack"),id:z.string().uuid(),generation:z.number().int().min(2).max(0xffffffff),baseSeq:z.number().int().min(0).max(0xffffffff-1)}).strict();
export const DesktopNativeFormatReady=DesktopNativeFormatAck.extend({type:z.literal("native_format_ready")});
