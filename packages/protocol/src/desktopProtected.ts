import { z } from "zod";
export const DESKTOP_PROTECTED_PROTOCOL = "soda-desktop-protected-v1";
export const DesktopProtectedMode = z.enum(["elevated-default","elevated-uac"]);
export type DesktopProtectedMode = z.infer<typeof DesktopProtectedMode>;
export const DesktopProtectedFailure = z.object({
  type:z.literal("protected_desktop_failure"),
  code:z.enum(["service_missing","service_incompatible","worker_unavailable","source_changed","not_allowed","conflict"]),
}).strict();
export function desktopProtectedFailureMessage(code:z.infer<typeof DesktopProtectedFailure>["code"]):string {
  switch(code){
    case "source_changed":return "接続先の管理者画面・ロック・利用者の状態が変わりました。接続し直し、操作を許可し直してください。";
    case "not_allowed":return "接続先PCで管理者画面の共有が許可されていません。";
    case "conflict":return "管理者画面は仮想画面・モニター指定・解像度変更と併用できません。";
    default:return "管理者画面の補助プログラムを開始できません。接続先の許可と専用保護サービスの導入・更新を確認してください。";
  }
}
