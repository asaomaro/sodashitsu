import type { DesktopPermissions, DesktopSettingsResult } from "@sodashitsu/protocol";
import { onOff, type SettingsSection } from "./items.js";
interface Port {
  get(): Promise<DesktopSettingsResult>;
  set(permissions: DesktopPermissions): Promise<DesktopSettingsResult>;
}
export function desktopSettingsSection(port: Port, changed: () => void): SettingsSection {
  let state: DesktopSettingsResult | undefined,
    busy = true,
    message = "読み込み中…";
  port
    .get()
    .then((result) => {
      state = result;
      message = result.canConfigure
        ? "このPCの画面共有を許可します。変更すると共有中の接続は停止します。"
        : "接続先PCのlocalhost画面、または端末版で設定してください。";
    })
    .catch(() => {
      message = "設定を取得できません。サーバーを更新してください。";
    })
    .finally(() => {
      busy = false;
      changed();
    });
  const entries = [
    ["enabled", "画面共有を許可"],
    ["allowInput", "マウス・キーボードを許可"],
    ["allowClipboard", "クリップボードを許可"],
    ["allowDisplayResize", "解像度変更を許可"],
  ] as const;
  return {
    id: "desktop-sharing",
    label: "デスクトップ共有",
    items: () => [
      { label: message, heading: true },
      ...(!state?.supported
        ? [{ label: "Windows補助プログラムを利用できません", heading: true }]
        : []),
      ...entries.map(([key, label]) => ({
        label,
        value: onOff(state?.permissions[key] === true),
        toggle: true,
        disabled: busy || !state?.canConfigure || (!state.supported && !state.permissions.enabled),
        note: "共有するPCに保存し、即時反映します。",
        activate: () => {
          if (busy || !state?.canConfigure) return;
          busy = true;
          port
            .set({ ...state.permissions, [key]: !state.permissions[key] })
            .then((result) => {
              state = result;
              message = "保存しました。接続し直すと新しい許可で共有します。";
            })
            .catch(() => {
              message = "保存できませんでした。設定を開き直してください。";
            })
            .finally(() => {
              busy = false;
              changed();
            });
        },
      })),
    ],
  };
}
