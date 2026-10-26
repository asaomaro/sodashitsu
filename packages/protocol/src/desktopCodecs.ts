import {z} from "zod";
export const DESKTOP_NATIVE_CODEC_PROTOCOL="soda-desktop-native-codecs-v1";
export const DESKTOP_CODEC_VIDEO_CHANNEL="soda-native-video-v2";
export const DesktopNativeCodec=z.enum(["h264","h264-444","hevc","av1"]);
export type DesktopNativeCodec=z.infer<typeof DesktopNativeCodec>;
export const DesktopNativeCodecString=z.string().max(128).refine(value=>/^avc1\.[0-9a-f]{6}$/.test(value)||/^(?:hev1|hvc1)\.[ABC]?[0-9]{1,2}\.[0-9A-F]{1,8}\.[LH][0-9]{1,3}(?:\.[0-9A-F]{2}){0,6}$/.test(value)||/^av01\.[0-2]\.[0-3][0-9][MH]\.(?:08|10|12)$/.test(value));
export const DesktopNativeCodecFallback=z.object({type:z.literal("native_codec_fallback"),id:z.string().uuid()}).strict();
export function desktopCodecMime(codec:DesktopNativeCodec):"video/h264"|"video/hevc"|"video/av1"{return codec==="hevc"?"video/hevc":codec==="av1"?"video/av1":"video/h264";}
export function desktopCodecMatches(codec:DesktopNativeCodec,value:string){return codec==="hevc"?/^(?:hev1|hvc1)\./.test(value):codec==="av1"?value.startsWith("av01."):codec==="h264-444"?value.startsWith("avc1.f4"):value.startsWith("avc1.");}
