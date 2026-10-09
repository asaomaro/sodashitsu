import type { InjectionKey } from "vue";
import type { ActionDispatcher } from "./actions/ActionDispatcher.js";
import type { MachineSwitcher } from "./actions/MachineSwitcher.js";
import type { KeyInputController } from "./keys/KeyInputController.js";
import type { NotificationController } from "./notify/NotificationController.js";
import type { ConnectionPort, DeviceKind } from "@sodashitsu/client-core";
import type { TerminalRegistry } from "./term/TerminalRegistry.js";
import type { FileTransfer } from "./term/FileTransfer.js";
import type { ViewSync } from "./term/ViewSync.js";
import type { AskController } from "./ask/AskController.js";
import type { ExtensionController } from "./extensions/ExtensionController.js";
import type { DisplayController } from "./display/DisplayController.js";

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
/** 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）の通信の係。`AskDialog` が回答・取り消しを送る。 */
export const AskControllerKey: InjectionKey<AskController> = Symbol("askController");
/** 拡張（20261007-ext-host）の通信の係。節「拡張」（`ExtensionSettings`）が読み直し・入切・起動し直し・ログに使う。 */
export const ExtensionControllerKey: InjectionKey<ExtensionController> = Symbol("extensionController");
/**
 * 表示の面の枠（`DisplayFrame`）が、アプリの端末・キーの操作に触るための窓口（`main.ts` が組み立てる）。枠の `Esc`・prefix を端末へ戻す／prefix を注入する。
 * 提供されない環境（単体テスト・端末版でない配線）では、何もしない。
 */
export interface DisplayHost {
  /** その pane の端末へフォーカスを戻す（pane が表示中のときだけ）。 */
  focusTerminal(paneId: string): void;
  /** いまの prefix のキーを、利用者の次のキーの前に注入する。 */
  injectPrefix(): void;
  /** 利用者が選んでいる pane（`view.focusedPaneId`）の端末へフォーカスを戻す（スクリプトの面がフォーカスを取ったときの、元の場所が使えないときの戻し先）。 */
  focusSelectedTerminal(): void;
  /** 利用者が選んでいる pane（`view.focusedPaneId`。無ければ null）。 */
  focusedPaneId?(): string | null;
  /** いまの prefix のキー（枠へ `relayKeys` として渡す）。 */
  prefixKey(): { key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
}
export const DisplayHostKey: InjectionKey<DisplayHost> = Symbol("displayHost");
/**
 * 浮いた窓の見出しのつかむ場所（`[data-display-grip]`）の動き。窓（`DisplayFloat`）が提供すると、見出しの D&D（ドックの側へ置く）の代わりに、窓をその場で動かす。
 * ドックのパネルの見出しは提供されないので、今までどおり D&D。
 */
export interface FloatGrip {
  onPointerDown(ev: PointerEvent): void;
  onPointerMove(ev: PointerEvent): void;
  onPointerEnd(ev: PointerEvent): void;
}
export const FloatGripKey: InjectionKey<FloatGrip> = Symbol("floatGrip");
/** 表示の面（`sodactl display`。20261007-soda-extensions）の通信の係。`DisplayFrame` が操作・知らせを送る。 */
export const DisplayControllerKey: InjectionKey<DisplayController> = Symbol("displayController");
/** 端末のファイルのリンクとドロップ。`TerminalPane` がドロップを渡す。無ければドロップを受けない（テスト等）。 */
export const FileTransferKey: InjectionKey<FileTransfer> = Symbol("fileTransfer");
