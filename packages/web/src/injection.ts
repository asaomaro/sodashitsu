import type { InjectionKey } from "vue";
import type { ActionDispatcher } from "./actions/ActionDispatcher.js";
import type { MachineSwitcher } from "./actions/MachineSwitcher.js";
import type { KeyInputController } from "./keys/KeyInputController.js";
import type { NotificationController } from "./notify/NotificationController.js";
import type { ConnectionPort, DeviceKind } from "@sodashitsu/client-core";
import type { TerminalRegistry } from "./term/TerminalRegistry.js";
import type { ViewSync } from "./term/ViewSync.js";

/**
 * コンポーネントへ渡す部品の provide/inject キー（`main.ts` が組み立てて provide する。T26）。
 * `store/*` は Pinia 自身の仕組み（`useSessionStore()` 等）で届くので、ここには含めない。
 */
export const ConnectionKey: InjectionKey<ConnectionPort> = Symbol("connection");
export const ActionDispatcherKey: InjectionKey<ActionDispatcher> = Symbol("actionDispatcher");
export const TerminalRegistryKey: InjectionKey<TerminalRegistry> = Symbol("terminalRegistry");
export const ViewSyncKey: InjectionKey<ViewSync> = Symbol("viewSync");
/** 通知（20260920-agent-notifications）。設定ダイアログが許可と音の解除に触る。 */
export const NotificationControllerKey: InjectionKey<NotificationController> = Symbol("notificationController");
/**
 * 端末の種類（`main.ts` が `isCoarsePointer()` で 1 回だけ決める。20260921-herdr-settings-gaps）。設定ダイアログが
 * 「自動（この端末では N 行）」の N を出すのに使う。**判定を呼び直さない**——2 か所で判定すると、ブラウザが実際に使う
 * 行数（`main.ts` の `getScrollbackLines`）とダイアログの表示が食い違いうる。
 */
export const DeviceKindKey: InjectionKey<DeviceKind> = Symbol("deviceKind");
/** `mobile/ExtraKeys.vue`（04-mobile T3）が `injectKey` へ直接キーを流すために使う。 */
export const KeyInputControllerKey: InjectionKey<KeyInputController> = Symbol("keyInputController");
/** 保存した SSH のマシンの切り替え（20260927-multi-host-machines）。サイドバーのマシンのまとまりが使う。無ければ切り替えられない（テスト等）。 */
export const MachineSwitcherKey: InjectionKey<MachineSwitcher> = Symbol("machineSwitcher");
