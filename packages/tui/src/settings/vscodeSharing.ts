import type { VscodeSharingPermissions, VscodeSharingSettingsResult } from "@sodashitsu/protocol";
import { onOff, type SettingsSection } from "./items.js";
interface Port {
  get(): Promise<VscodeSharingSettingsResult>;
  set(p: VscodeSharingPermissions): Promise<VscodeSharingSettingsResult>;
}
export function vscodeSharingSection(port: Port, changed: () => void): SettingsSection {
  let state: VscodeSharingSettingsResult | undefined,
    busy = true,
    message = "読み込み中…";
  port
    .get()
    .then((result) => {
      state = result;
      message = result.canConfigure
        ? "接続ボタンからhelperを自動起動する設定です。手動登録した共有元には適用しません。"
        : "共有するPCのlocalhost画面、または端末版で設定してください。";
    })
    .catch(() => {
      message = "設定を取得できません。サーバーを更新してください。";
    })
    .finally(() => {
      busy = false;
      changed();
    });
  function save(p: VscodeSharingPermissions): void {
    if (busy || !state?.canConfigure) return;
    busy = true;
    port
      .set(p)
      .then((result) => {
        state = result;
        message = "保存しました。自動起動した接続を停止し、次の起動から設定を使います。";
      })
      .catch(() => {
        message = "保存できませんでした。設定とURLを確認してください。";
      })
      .finally(() => {
        busy = false;
        changed();
      });
  }
  const entries = [
    ["enabled", "接続ボタンからの自動起動を許可"],
    ["allowInput", "自動起動した共有元の操作を許可"],
    ["allowFit", "自動起動した共有元のサイズ追従を許可"],
  ] as const;
  return {
    id: "vscode-sharing",
    label: "VSCode共有",
    items: () => [
      { label: message, heading: true },
      ...(!state?.supported
        ? [{ label: "Windows/WSLのVSCode補助プログラムを利用できません", heading: true }]
        : []),
      ...entries
        .filter(([key]) => key === "enabled" || !state?.customCommand)
        .map(([key, label]) => ({
          label,
          value: onOff(state?.permissions[key] === true),
          toggle: true,
          disabled:
            busy ||
            !state?.canConfigure ||
            (!state.supported && !state.permissions.enabled) ||
            (key === "allowFit" && !state.permissions.allowInput),
          activate: () => {
            if (state)
              save({
                ...state.permissions,
                [key]: !state.permissions[key],
                ...(key === "allowInput" && state.permissions.allowInput
                  ? { allowFit: false }
                  : {}),
              });
          },
        })),
      ...(!state?.customCommand
        ? [
            {
              label: "このPCのSodashitsu URL",
              value: state?.permissions.sodaOrigin || "localhost（自動）",
              disabled: busy || !state?.canConfigure,
              note: "HTTPSの場合は証明書名が有効なこのPCのURL。空欄はlocalhost。",
              activate: () => ({
                kind: "edit" as const,
                title: "このPCのSodashitsu URL",
                initial: state?.permissions.sodaOrigin ?? "",
                commit: (text: string) => {
                  if (state) save({ ...state.permissions, sodaOrigin: text.trim() });
                },
              }),
            },
          ]
        : []),
    ],
  };
}
