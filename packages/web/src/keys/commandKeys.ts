import { COMMAND_ID_RE, type CommandInfo } from "@wtm/protocol";
import type { ActionDef, ActionId } from "./bindings.js";

/**
 * 独自コマンドのキー（20260927-custom-command-keys。herdr の `[[keys.command]]`）。コマンドの定義はサーバの `commands.json` にあり、ブラウザは
 * 一覧（id・種類・説明）だけを受け取る。キーの割り当ては既存の操作と同じ表（`keymap.ts`）に載せ、対象の id を `command:<id>` にして操作の id と
 * 分ける（`KeyTargetId`）。Vue・store に依存しない（`keys/` の規則）。
 */

export type CommandKeyId = `command:${string}`;
/** キーを割り当てる対象：カタログの操作か、独自コマンド。 */
export type KeyTargetId = ActionId | CommandKeyId;

const PREFIX = "command:";

export function commandKeyId(commandId: string): CommandKeyId {
  return `${PREFIX}${commandId}`;
}

export function isCommandKeyId(id: string): id is CommandKeyId {
  return id.startsWith(PREFIX);
}

export function commandIdOf(id: CommandKeyId): string {
  return id.slice(PREFIX.length);
}

/** 群の名前（設定画面・キー一覧）。 */
export const COMMAND_GROUP = "独自コマンド";

/** 独自コマンドのキーの対象の定義（名前は説明、無ければ id）。 */
export interface CommandKeyDef {
  id: CommandKeyId;
  commandId: string;
  label: string;
}

/** サーバの一覧から、キーの対象の定義を作る（規則外の id は捨てる——サーバが検証済みだが、表の鍵にする前にもう一度見る）。 */
export function commandKeyDefs(list: readonly CommandInfo[]): CommandKeyDef[] {
  const out: CommandKeyDef[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (!COMMAND_ID_RE.test(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: commandKeyId(c.id), commandId: c.id, label: c.description ?? c.id });
  }
  return out;
}

/** 表（`resolveKeymap`）の登録に使う操作の定義の形にする（既定のキーは無い・範囲ではない）。 */
export function commandActionDef(def: CommandKeyDef): ActionDef {
  return {
    id: def.id,
    label: def.label,
    group: "pane",
    defaults: [],
    action: { type: "runCommand", commandId: def.commandId },
  };
}
