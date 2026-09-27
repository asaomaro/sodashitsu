import {
  ACTIONS,
  applyRecommended,
  COMMAND_GROUP,
  emptyKeyPrefs,
  formatBinding,
  isCommandKeyId,
  KEY_PRESETS,
  loadKeyPrefs,
  NAVIGATE_KEYS,
  navigateKeyDef,
  planNavigateReset,
  planReset,
  serializeKeyPrefs,
  validateAssignment,
  validateNavigateAssignment,
  withBindings,
  withNavigateBinding,
  withPrefix,
  type ActionGroup,
  type AssignResult,
  type AssignTarget,
  type KeyInput,
  type KeyPrefs,
  type KeyTargetId,
  type NavigateAssignTarget,
  type NavigateKeyId,
  type ResolvedKeymap,
  type ResolvedNavigateKeymap,
} from "@sodashitsu/client-core";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { Outcome, SettingItem, SettingsSection } from "./items.js";
import type { SettingsWriter } from "./SettingsWriter.js";

export interface KeySectionEnv {
  prefs: PrefsModel;
  write: SettingsWriter;
  /** 今の割り当ての表（独自コマンドを含む）。 */
  keymap(): ResolvedKeymap;
  navigateKeymap(): ResolvedNavigateKeymap;
}

const GROUPS: readonly ActionGroup[] = ["全体", "workspace / tab", "pane"];

/**
 * 節「キー」（web の `KeySettings.vue` と同じ操作・同じ検証〔client-core の `validateAssignment`・`planReset`・`applyRecommended`〕・同じ保存の形
 * 〔`prefs.keys` に既定との差だけ〕）。**押したキーをそのまま取り込む**（「次に押したキーを割り当てる」待ち。Esc で取り消し）。
 * 行は操作ごとに 1 つ。Enter で「変更・削除・追加（prefix の後／直接）・既定に戻す」の一覧を出す（web の `<details>` を開いた中身）。
 */
export function keySection(env: KeySectionEnv): SettingsSection {
  const keyPrefs = (): KeyPrefs => loadKeyPrefs(env.prefs.shared.keys);
  /** web の `replaceKeyPrefs` と同じ：読み直して正規化し、同じなら送らない。差が無くなれば `keys` を消す（null）。 */
  const replace = (next: KeyPrefs): void => {
    const normalized = serializeKeyPrefs(loadKeyPrefs(serializeKeyPrefs(next)));
    const now = serializeKeyPrefs(keyPrefs());
    if (JSON.stringify(normalized ?? null) === JSON.stringify(now ?? null)) return;
    env.write.setShared({ keys: normalized ?? null });
  };
  const bindingsText = (list: readonly string[]): string =>
    list.length === 0 ? "なし" : list.join(" / ");
  const describeSkip = (key: string, reason: string): string => {
    const text = reason.replace(/。$/, "");
    return text.startsWith(key) ? text : `${key}（${text}）`;
  };

  /** 取り込み：押したキーを検証し、通れば割り当てる。衝突なら「こちらへ移す」を訊く（web の US2）。 */
  const capture = (
    target: AssignTarget | NavigateAssignTarget,
    hint: string,
    apply: (binding: string) => string,
  ): Outcome => ({
    kind: "capture",
    hint,
    accept: (k: KeyInput) => {
      const result: AssignResult =
        target.kind === "navigateKey"
          ? validateNavigateAssignment(env.navigateKeymap(), target, k)
          : validateAssignment(env.keymap(), target, k);
      if (!result.ok) {
        if (result.ignore === true)
          return result.reason ? { wait: true, message: result.reason } : { wait: true };
        const conflict = result.conflict;
        if (conflict && target.kind === "binding") {
          const binding = formatBinding({ via: conflict.via, chord: conflict.chord, range: false });
          const owner = env.keymap().labelOf(conflict.ownerId);
          return {
            outcome: {
              kind: "confirm",
              title: `${result.reason}\n${binding} を「${owner}」から外して、こちらへ移しますか？`,
              yesLabel: "こちらへ移す",
              yes: () => {
                const without = withBindings(
                  keyPrefs(),
                  conflict.ownerId,
                  env
                    .keymap()
                    .bindingsOf(conflict.ownerId)
                    .filter((b) => b !== binding),
                );
                const current = env.keymap().bindingsOf(target.id);
                const list =
                  target.replacing !== undefined && current.includes(target.replacing)
                    ? current.map((b) => (b === target.replacing ? binding : b))
                    : [...current, binding];
                replace(withBindings(without, target.id, list));
                return `${binding} を「${owner}」から「${env.keymap().labelOf(target.id)}」へ移しました。`;
              },
            },
          };
        }
        return { outcome: result.reason };
      }
      return { outcome: apply(result.binding) };
    },
  });

  const via = (b: string): "prefix" | "direct" => (b.startsWith("prefix+") ? "prefix" : "direct");
  const hintFor = (id: KeyTargetId, v: "prefix" | "direct"): string => {
    if (
      !isCommandKeyId(id) &&
      ACTIONS.find((a) => a.id === id && "indexed" in a && a.indexed === true)
    )
      return "1〜9 の数字のキーを押してください（修飾キーと一緒でも。Esc で取り消し）";
    return v === "direct"
      ? "ctrl や alt を組み合わせたキーを押してください（Esc で取り消し）"
      : "prefix の後に押すキーを押してください（Esc で取り消し）";
  };

  const actionRow = (id: KeyTargetId, label: string, resettable: boolean): SettingItem => {
    const km = env.keymap();
    const list = km.bindingsOf(id);
    return {
      label: `  ${label}`,
      value: bindingsText(list),
      activate: () => {
        const ops: { label: string; run: () => Outcome }[] = [];
        const set = (bindings: readonly string[]): void =>
          replace(withBindings(keyPrefs(), id, bindings));
        for (const b of list) {
          ops.push({
            label: `変更：${b}`,
            run: () =>
              capture(
                { kind: "binding", id, via: via(b), replacing: b },
                hintFor(id, via(b)),
                (binding) => {
                  const current = env.keymap().bindingsOf(id);
                  set(
                    current.includes(b)
                      ? current.map((x) => (x === b ? binding : x))
                      : [...current, binding],
                  );
                  return `「${label}」に ${binding} を割り当てました。`;
                },
              ),
          });
          ops.push({
            label: `削除：${b}`,
            run: () => {
              set(
                env
                  .keymap()
                  .bindingsOf(id)
                  .filter((x) => x !== b),
              );
              return `「${label}」から ${b} を外しました。`;
            },
          });
        }
        for (const v of ["prefix", "direct"] as const)
          ops.push({
            label: v === "prefix" ? "追加：prefix の後" : "追加：直接",
            run: () =>
              capture({ kind: "binding", id, via: v }, hintFor(id, v), (binding) => {
                set([...env.keymap().bindingsOf(id), binding]);
                return `「${label}」に ${binding} を割り当てました。`;
              }),
          });
        if (resettable && keyPrefs().bindings[id as keyof KeyPrefs["bindings"]] !== undefined)
          ops.push({
            label: "既定に戻す",
            run: () => {
              const plan = planReset(env.keymap(), keyPrefs(), { kind: "action", id });
              if (!plan.ok) return plan.reason;
              replace(plan.prefs);
              return plan.skipped.length === 0
                ? `「${label}」を既定へ戻しました。`
                : `「${label}」の上書きを外しました。戻せなかった既定のキー：${plan.skipped.map((k) => describeSkip(k.binding, k.reason)).join("、")}。`;
            },
          });
        return {
          kind: "choose",
          title: `${label}（${bindingsText(list)}）`,
          options: ops.map((o) => ({ label: o.label })),
          pick: (i) => ops[i]!.run(),
        };
      },
    };
  };

  const navigateRow = (id: NavigateKeyId): SettingItem => {
    const def = navigateKeyDef(id)!;
    const list = env.navigateKeymap().bindingsOf(id);
    const set = (bindings: readonly string[]): void =>
      replace(withNavigateBinding(keyPrefs(), id, bindings));
    const hint = "navigate モードの中で押すキーを押してください（Esc で取り消し）";
    return {
      label: `  ${def.label}`,
      value: bindingsText(list),
      activate: () => {
        const ops: { label: string; run: () => Outcome }[] = [];
        for (const b of list) {
          ops.push({
            label: `変更：${b}`,
            run: () =>
              capture({ kind: "navigateKey", id, replacing: b }, hint, (binding) => {
                const current = env.navigateKeymap().bindingsOf(id);
                set(
                  current.includes(b)
                    ? current.map((x) => (x === b ? binding : x))
                    : [...current, binding],
                );
                return `「${def.label}」に ${binding} を割り当てました。`;
              }),
          });
          ops.push({
            label: `削除：${b}`,
            run: () => {
              set(
                env
                  .navigateKeymap()
                  .bindingsOf(id)
                  .filter((x) => x !== b),
              );
              return `「${def.label}」から ${b} を外しました。`;
            },
          });
        }
        ops.push({
          label: "追加",
          run: () =>
            capture({ kind: "navigateKey", id }, hint, (binding) => {
              set([...env.navigateKeymap().bindingsOf(id), binding]);
              return `「${def.label}」に ${binding} を割り当てました。`;
            }),
        });
        if (keyPrefs().navigateKeys[id] !== undefined)
          ops.push({
            label: "既定に戻す",
            run: () => {
              const plan = planNavigateReset(env.navigateKeymap(), keyPrefs(), {
                kind: "navigateKey",
                id,
              });
              if (!plan.ok) return plan.reason;
              replace(plan.prefs);
              return `「${def.label}」を既定へ戻しました。`;
            },
          });
        return {
          kind: "choose",
          title: `${def.label}（${bindingsText(list)}）`,
          options: ops.map((o) => ({ label: o.label })),
          pick: (i) => ops[i]!.run(),
        };
      },
    };
  };

  return {
    id: "keys",
    label: "キー",
    items: () => {
      const km = env.keymap();
      const items: SettingItem[] = [
        {
          label: "prefix",
          value: km.prefix,
          note: "prefix には ctrl+英字・alt+1 文字・ctrl+alt+英字・F1〜F12 を使えます。",
          activate: () => ({
            kind: "choose",
            title: `prefix（${km.prefix}）`,
            options: [{ label: "変更（次に押したキー）" }, { label: "既定に戻す" }],
            pick: (i) => {
              if (i === 0)
                return capture(
                  { kind: "prefix" },
                  "prefix にするキーを押してください（ctrl+英字など。Esc で取り消し）",
                  (binding) => {
                    replace(withPrefix(keyPrefs(), binding));
                    return `prefix を ${binding} にしました。`;
                  },
                );
              const plan = planReset(env.keymap(), keyPrefs(), { kind: "prefix" });
              if (!plan.ok) return plan.reason;
              replace(plan.prefs);
              return `prefix を既定（${env.keymap().prefix}）へ戻しました。`;
            },
          }),
        },
        {
          label: "プリセットを足す",
          note: "選んだ一式のうち、今の割り当てとぶつからないものを足します。",
          activate: () => ({
            kind: "choose",
            title: "プリセット",
            options: KEY_PRESETS.map((p) => ({ label: p.label })),
            pick: (i) => {
              const preset = KEY_PRESETS[i]!;
              const r = applyRecommended(env.keymap(), keyPrefs(), preset.bindings);
              replace(r.prefs);
              const parts: string[] = [];
              if (r.added.length > 0)
                parts.push(
                  `${preset.label}を ${r.added.length} 個足しました：${r.added.join("、")}。`,
                );
              if (r.added.length === 0 && r.skipped.length === 0)
                parts.push(`${preset.label}は、すでに全部入っています。`);
              else if (r.already.length > 0)
                parts.push(`すでにあった分：${r.already.join("、")}。`);
              if (r.skipped.length > 0)
                parts.push(
                  `足さなかった分：${r.skipped.map((k) => describeSkip(k.binding, k.reason)).join("、")}。`,
                );
              return parts.join("");
            },
          }),
        },
      ];
      for (const g of GROUPS) {
        items.push({ label: g, heading: true });
        for (const a of ACTIONS) if (a.group === g) items.push(actionRow(a.id, a.label, true));
      }
      items.push({ label: COMMAND_GROUP, heading: true });
      if (km.commands.length === 0)
        items.push({
          label: "  （独自コマンドはありません）",
          disabled: true,
          note: "状態ディレクトリの commands.json に書くと、ここで割り当てられます（docs/custom-commands.md）。",
        });
      for (const c of km.commands) items.push(actionRow(c.id, km.labelOf(c.id), false));
      items.push({ label: "navigate モードの移動", heading: true });
      for (const d of NAVIGATE_KEYS) items.push(navigateRow(d.id));
      items.push(
        {
          label: "全画面のときブラウザの予約キーも受け取る",
          value: env.prefs.shared.keyboardLockInFullscreen === true ? "入" : "切",
          toggle: true,
          note: "ブラウザの全画面だけの設定です（端末版には効きません）。",
          activate: () =>
            env.write.setShared({
              keyboardLockInFullscreen: env.prefs.shared.keyboardLockInFullscreen !== true,
            }),
        },
        {
          label: "すべて既定に戻す",
          activate: () => ({
            kind: "confirm",
            title: "すべての割り当てと prefix を既定へ戻しますか？（取り消せません）",
            yesLabel: "既定に戻す",
            yes: () => {
              replace(emptyKeyPrefs());
              return "すべての割り当てと prefix を既定へ戻しました。";
            },
          }),
        },
      );
      return items;
    },
  };
}
