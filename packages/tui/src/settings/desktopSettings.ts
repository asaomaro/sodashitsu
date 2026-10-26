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
    ["allowMonitors","全モニターの共有と切替を許可"],
    ["allowClipboard", "クリップボードを許可"],
    ["allowDisplayResize", "解像度変更を許可"],
    ["allowUnlock", "起動中のロック解除を許可（Windows専用サービスが必要）"],
  ] as const;
  return {
    id: "desktop-sharing",
    label: "デスクトップ共有",
    items: () => [
      { label: message, heading: true },
      ...(!state?.supported
        ? [{ label: "Windows補助プログラムを利用できません", heading: true }]
        : []),
      {
        label: "ファイル共有フォルダ",
        value: state?.permissions.fileRoot || "無効",
        disabled: busy || !state?.canConfigure,
        note: "空欄で無効。このサーバーOSの絶対パス（100MiB/上書きなし）。",
        activate: () => ({
          kind: "edit" as const,
          title: "ファイル共有フォルダ（空欄で無効）",
          initial: state?.permissions.fileRoot ?? "",
          commit: (text: string) => {
            if (busy || !state?.canConfigure) return;
            busy = true;
            port
              .set({ ...state.permissions, fileRoot: text.trim() })
              .then((result) => {
                state = result;
                message = "保存しました。共有を接続し直してください。";
              })
              .catch(() => {
                message = "保存できません。実在するフォルダの絶対パスを確認してください。";
              })
              .finally(() => {
                busy = false;
                changed();
              });
          },
        }),
      },
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
