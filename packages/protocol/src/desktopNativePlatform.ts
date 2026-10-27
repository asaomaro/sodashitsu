import { z } from "zod";
import type { RemoteDesktopInput } from "./desktop.js";

export const DESKTOP_NATIVE_PLATFORM_PROTOCOL = "soda-desktop-native-platform-v1";
export const DesktopNativePlatform = z.enum(["linux-portal", "macos-sck"]);
export type DesktopNativePlatform = z.infer<typeof DesktopNativePlatform>;
export const DesktopInputCapabilities = z.object({
  keys: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/)).max(256).refine(keys => new Set(keys).size === keys.length),
  text: z.boolean(),
  pointerButtons: z.array(z.number().int().min(0).max(4)).max(5).refine(buttons => new Set(buttons).size === buttons.length),
  wheel: z.boolean(),
}).strict();
export type DesktopInputCapabilities = z.infer<typeof DesktopInputCapabilities>;

export function supportsDesktopInput(capabilities: DesktopInputCapabilities | undefined, input: RemoteDesktopInput): boolean {
  if (!capabilities) return true;
  switch (input.kind) {
    case "key": return capabilities.keys.includes(input.code);
    case "text": return capabilities.text;
    case "pointer": return input.event === "move" ? capabilities.pointerButtons.length > 0 : capabilities.pointerButtons.includes(input.button);
    case "wheel": return capabilities.wheel;
  }
}

export const DesktopNativeFailureCode = z.enum([
  "dependencies", "unsupported", "permission_denied", "permission_cancelled",
  "source_changed", "source_stalled", "backend_failure", "input_unavailable",
]);
export type DesktopNativeFailureCode = z.infer<typeof DesktopNativeFailureCode>;
export const DesktopNativePlatformFailure = z.object({
  type: z.literal("platform_failure"), backend: DesktopNativePlatform, code: DesktopNativeFailureCode,
}).strict();

export function desktopNativePlatformFailureMessage(code: DesktopNativeFailureCode): string {
  const messages: Record<DesktopNativeFailureCode, string> = {
    dependencies: "接続先の画面共有に必要な部品がありません。接続先OS向けの補助プログラムと導入手順を確認してください。",
    unsupported: "接続先のOSまたは共有サービスが、この画面共有の利用条件を満たしていません。",
    permission_denied: "接続先OSで画面共有が許可されていません。画面収録・画面共有の許可を確認してください。",
    permission_cancelled: "接続先で画面共有の選択が取り消されました。必要な場合は接続し直してください。",
    source_changed: "接続先の画面・セッションまたはOSの共有許可が変わりました。接続し直し、操作を許可し直してください。",
    source_stalled: "接続先の共有サービスから新しい画像が届かないため停止しました。接続先OSの共有許可と補助プログラムを確認してください。",
    backend_failure: "接続先の画面共有を継続できません。接続先のOSと補助プログラムを確認してください。",
    input_unavailable: "接続先OSで操作が許可されていないか、この入力には対応していません。",
  };
  return messages[code];
}
