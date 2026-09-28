import {
  CSS_VAR_LABELS,
  CSS_VARS,
  DISPLAY_STATES,
  emptyThemeOverrides,
  loadThemeOverrides,
  serializeThemeOverrides,
  withOverride,
  withoutOverride,
  type ThemeOverrides,
  THEME_LABELS,
  loadScrollbackPref,
  loadTabBarPosition,
  scrollbackChoices,
  loadTabBarRightEntries,
  loadTabBarRightSeparator,
  loadThemePrefs,
  MAX_TAB_BAR_RIGHT_ENTRIES,
  sanitizeTabBarText,
  siblingThemes,
  stateGlyph,
  stateLabel,
  type DatetimeFormat,
  type TabBarRightEntry,
} from "@sodashitsu/client-core";
import {
  DEFAULT_THEME_NAME,
  THEME_APPEARANCE,
  THEME_NAMES,
  type AgentIntegrationKind,
  type AgentIntegrationStatusResult,
  type ThemeName,
} from "@sodashitsu/protocol";
import { NOTIFY_DELIVERIES, type NotifyDelivery, type PrefsModel } from "../model/PrefsModel.js";
import type { ColorModePref } from "../render/color.js";
import { isTuiColor } from "../render/cssColor.js";
import {
  onOff,
  type ChoiceOption,
  type Outcome,
  type SettingItem,
  type SettingsSection,
} from "./items.js";
import { parseWindowTitle } from "../app/windowTitle.js";
import { keySection, type KeySectionEnv } from "./keySection.js";
import { sidebarRowsItems } from "./sidebarRowsItems.js";
import type { SettingsWriter } from "./SettingsWriter.js";

/**
 * 設定画面の節（20260927-cli-mode の design「設定画面（端末版）」）。web の `SettingsDialog.vue` の 5 節（通知・テーマ・表示・端末・キー）と
 * エージェント連携、端末版の `tui` 節。**項目の意味と保存先は web と同じ**（共有の設定の同じ項目へ `prefs.set`）。端末版の画面に効かない
 * 見た目の項目（pane の枠の太さ等。ブラウザの画面の設定）も共有の設定なので、ここから変えられる（注記で「ブラウザの画面だけ」と添える）。
 * 端末ごとの項目（色の出し方）だけは手元の `tui-state.json`。
 */

export interface AgentIntegrationPort {
  /** 開いたときに読んだ状態（読めていなければ null）。`agent_integration.changed` で新しくなる。 */
  status(): AgentIntegrationStatusResult | null;
  install(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }>;
  uninstall(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }>;
  setAutoResume(enabled: boolean): Promise<void>;
}

export interface SettingsEnv extends KeySectionEnv {
  prefs: PrefsModel;
  write: SettingsWriter;
  /** サーバの scrollback の上限（snapshot の `limits`）。 */
  scrollbackLimit(): number;
  agentIntegration: AgentIntegrationPort;
  /** 自動の判定で決まった通知の出し方の説明（`tui.notifyDelivery` が auto のとき出す）。 */
  detectedDelivery?(): string;
  /** 非同期の結果の知らせ（導入の結果など）。 */
  message(text: string): void;
  /** はじめの案内を開き直す（設定画面を閉じて開く。web の「はじめの案内を開く」）。 */
  openOnboarding?(): void;
}

/** 端末版だけに効く項目の注記（ブラウザの画面には効かない）。 */
const TUI_ONLY = "端末版だけの設定です（ブラウザには効きません）。";

/** 端末版の画面には効かない（ブラウザの画面の見た目）項目の注記。 */
const BROWSER_ONLY =
  "ブラウザの画面の設定です（端末版の画面には効きません。共有の設定なので、ここから変えるとブラウザにも効きます）。";

const choose = (
  title: string,
  options: ChoiceOption[],
  pick: (index: number) => Outcome,
): Outcome => ({ kind: "choose", title, options, pick });

function choiceItem<T extends string | number>(
  label: string,
  choices: readonly { value: T; label: string }[],
  current: T,
  set: (v: T) => Outcome,
  note?: string,
): SettingItem {
  return {
    label,
    value: choices.find((c) => c.value === current)?.label ?? String(current),
    ...(note ? { note } : {}),
    activate: () =>
      choose(
        label,
        choices.map((c) => ({ label: c.label, current: c.value === current })),
        (i) => set(choices[i]!.value),
      ),
  };
}

function toggleItem(
  label: string,
  value: boolean,
  set: (v: boolean) => Outcome,
  note?: string,
): SettingItem {
  return {
    label,
    value: onOff(value),
    toggle: true,
    ...(note ? { note } : {}),
    activate: () => set(!value),
  };
}

// --- 通知 ---

function notifySection(env: SettingsEnv): SettingsSection {
  return {
    id: "notify",
    label: "通知",
    items: () => {
      const n = env.prefs.notify;
      const set = (patch: Partial<typeof n>): void =>
        env.write.setShared({ notify: { ...n, ...patch } });
      return [
        toggleItem("画面の中の知らせ（トースト）", n.toast, (v) => set({ toast: v })),
        toggleItem(
          "デスクトップの通知",
          n.desktop,
          (v) => set({ desktop: v }),
          "外側の端末の通知の列（OSC 9・99・777）で出します。出し方は「端末版」の節の「通知の出し方」で選べます。",
        ),
        toggleItem("音", n.sound, (v) => set({ sound: v }), "端末版ではベル（BEL）で知らせます。"),
      ];
    },
  };
}

// --- テーマ ---

const darkThemes = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "dark");
const lightThemes = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "light");
const themeLabel = (n: ThemeName): string =>
  n === DEFAULT_THEME_NAME ? `${THEME_LABELS[n]}（既定）` : THEME_LABELS[n];

/** テーマの一覧（見出しつき）。`first` の明暗の群を先に。`defaultLabel` があれば先頭に「既定」（値 null）。 */
function themeOptions(
  first: "dark" | "light",
  current: ThemeName | null,
  defaultLabel?: string,
): { options: ChoiceOption[]; values: (ThemeName | null | undefined)[] } {
  const options: ChoiceOption[] = [];
  const values: (ThemeName | null | undefined)[] = [];
  if (defaultLabel !== undefined) {
    options.push({ label: defaultLabel, current: current === null });
    values.push(null);
  }
  const groups: ["dark" | "light", ThemeName[]][] =
    first === "dark"
      ? [
          ["dark", darkThemes],
          ["light", lightThemes],
        ]
      : [
          ["light", lightThemes],
          ["dark", darkThemes],
        ];
  for (const [kind, names] of groups) {
    options.push({ label: kind === "dark" ? "暗いテーマ" : "明るいテーマ", heading: true });
    values.push(undefined);
    for (const n of names) {
      options.push({ label: themeLabel(n), current: n === current });
      values.push(n);
    }
  }
  return { options, values };
}

function themeSection(env: SettingsEnv): SettingsSection {
  return {
    id: "theme",
    label: "テーマ",
    items: () => {
      const tp = loadThemePrefs(env.prefs.shared as Record<string, unknown>);
      const siblings = siblingThemes(tp.theme);
      const pickTheme = (
        label: string,
        first: "dark" | "light",
        current: ThemeName | null,
        set: (v: ThemeName | null) => void,
        defaultLabel?: string,
      ): Outcome => {
        const { options, values } = themeOptions(first, current, defaultLabel);
        return choose(label, options, (i) => {
          const v = values[i];
          if (v === undefined) return;
          set(v);
        });
      };
      const items: SettingItem[] = [
        {
          label: "テーマ",
          value: THEME_LABELS[tp.theme],
          note: "選ぶと明暗の自動の切り替えは切れます（web と同じ）。",
          activate: () =>
            pickTheme("テーマ", THEME_APPEARANCE[tp.theme], tp.theme, (v) =>
              env.write.setShared({ theme: v, themeAuto: false }),
            ),
        },
        toggleItem("明暗に合わせて切り替える", tp.auto, (v) =>
          env.write.setShared({ themeAuto: v }),
        ),
      ];
      if (tp.auto) {
        items.push(
          {
            label: "明るいとき",
            value: tp.light ? THEME_LABELS[tp.light] : `既定（${THEME_LABELS[siblings.light]}）`,
            activate: () =>
              pickTheme(
                "明るいとき",
                "light",
                tp.light,
                (v) => env.write.setShared({ themeLight: v }),
                `既定（${THEME_LABELS[siblings.light]}）`,
              ),
          },
          {
            label: "暗いとき",
            value: tp.dark ? THEME_LABELS[tp.dark] : `既定（${THEME_LABELS[siblings.dark]}）`,
            activate: () =>
              pickTheme(
                "暗いとき",
                "dark",
                tp.dark,
                (v) => env.write.setShared({ themeDark: v }),
                `既定（${THEME_LABELS[siblings.dark]}）`,
              ),
          },
        );
      }
      items.push({
        label: "いま使っているテーマ",
        value: THEME_LABELS[env.prefs.theme],
        disabled: true,
        ...(tp.auto
          ? {
              note: `外側の端末の背景が${env.prefs.systemDark ? "暗い" : "明るい"}ため（背景色の問い合わせ OSC 11・COLORFGBG で判定）。`,
            }
          : {}),
      });
      items.push(...overrideItems(env));
      return items;
    },
  };
}

/** 保存値の上書き（ほかのクライアントが書いた、端末版では読めない色も落とさずに持つ）。 */
const anyColor = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const BUCKETS = [
  ["light", "明るいとき"],
  ["dark", "暗いとき"],
] as const;

/** 色の個別の上書き（web の SettingsDialog の「色の上書き」。明るいとき・暗いときの 2 層。空にすると既定へ戻す）。 */
function overrideItems(env: SettingsEnv): SettingItem[] {
  const current = loadThemeOverrides(env.prefs.shared.themeOverrides, anyColor);
  const replace = (next: ThemeOverrides): void =>
    env.write.setShared({ themeOverrides: serializeThemeOverrides(next) ?? null });
  const items: SettingItem[] = [];
  for (const [bucket, bucketLabel] of BUCKETS) {
    items.push({ label: `色の上書き（${bucketLabel}）`, heading: true });
    for (const key of CSS_VARS) {
      const v = current[bucket][key];
      const label = `「${CSS_VAR_LABELS[key]}」（${bucketLabel}）`;
      items.push({
        label: `  ${CSS_VAR_LABELS[key]}`,
        value: v === undefined ? "既定" : isTuiColor(v) ? v : `${v}（端末版では読めない）`,
        note: `${key}。#rrggbb・rgb()・hsl()・色の名前。空にすると既定へ戻します。`,
        activate: () => ({
          kind: "edit",
          title: label,
          initial: v ?? "",
          commit: (text) => {
            const raw = text.trim();
            if (raw === "") {
              if (v === undefined) return;
              replace(withoutOverride(current, bucket, key));
              return `${label}の上書きを外しました。`;
            }
            if (!isTuiColor(raw)) return `${label}：${raw} は色として読めません。`;
            replace(withOverride(current, bucket, key, raw));
            return `${label}を ${raw} にしました。`;
          },
        }),
      });
    }
  }
  items.push({
    label: "  すべての上書きを既定に戻す",
    disabled: serializeThemeOverrides(current) === undefined,
    activate: () => ({
      kind: "confirm",
      title: "すべての色の上書きを既定へ戻しますか？（取り消せません）",
      yesLabel: "既定に戻す",
      yes: () => {
        replace(emptyThemeOverrides());
        return "すべての色の上書きを既定へ戻しました。";
      },
    }),
  });
  return items;
}

// --- 表示 ---

const PANE_BORDERS = [
  { value: "always", label: "常に" },
  { value: "auto", label: "分割しているときだけ" },
  { value: "off", label: "表示しない" },
] as const;
const PANE_FRAME = [
  { value: "thin", label: "細い" },
  { value: "default", label: "既定" },
  { value: "thick", label: "太い" },
] as const;
const TAB_BAR_POSITIONS = [
  { value: "top", label: "上" },
  { value: "bottom", label: "下" },
] as const;
const ENTRY_KINDS: readonly { value: TabBarRightEntry["kind"]; label: string }[] = [
  { value: "zoom", label: "拡大の状態" },
  { value: "hostname", label: "接続先のホスト名" },
  { value: "datetime", label: "日時" },
  { value: "text", label: "固定文字列" },
];
const DATETIME_FORMATS: readonly { value: DatetimeFormat; label: string }[] = [
  { value: "time", label: "時刻（時:分）" },
  { value: "time-seconds", label: "時刻（時:分:秒）" },
  { value: "date", label: "日付" },
  { value: "date-time", label: "日付と時刻" },
];

const pick = <T>(raw: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(raw as T) ? (raw as T) : fallback;
const flag = (raw: unknown, fallback: boolean): boolean =>
  typeof raw === "boolean" ? raw : fallback;

function entryLabel(e: TabBarRightEntry): string {
  const kind = ENTRY_KINDS.find((k) => k.value === e.kind)?.label ?? e.kind;
  if (e.kind === "datetime")
    return `${kind}：${DATETIME_FORMATS.find((f) => f.value === e.format)?.label ?? e.format}`;
  if (e.kind === "text") return `${kind}：${e.text === "" ? "（空）" : e.text}`;
  return kind;
}

function displaySection(env: SettingsEnv): SettingsSection {
  return {
    id: "display",
    label: "表示",
    items: () => {
      const raw = env.prefs.shared;
      const set = (patch: Record<string, unknown>): void => env.write.setShared(patch);
      const entries = loadTabBarRightEntries(raw.tabBarRight);
      const setEntries = (next: readonly TabBarRightEntry[]): void =>
        set({ tabBarRight: loadTabBarRightEntries(next) });
      const symbolsNote = `色に加えて形でも見分けられます（${DISPLAY_STATES.map((s) => `${stateGlyph(s)} ${stateLabel(s)}`).join("、")}）。`;
      const items: SettingItem[] = [
        toggleItem(
          "状態を記号でも示す",
          env.prefs.statusSymbols,
          (v) => set({ statusSymbols: v }),
          symbolsNote,
        ),
        choiceItem(
          "pane の枠の表示",
          PANE_BORDERS,
          env.prefs.paneBorders,
          (v) => set({ paneBorders: v }),
          "端末版では、枠を描かないときも分割の境目に線を 1 本残します。",
        ),
        toggleItem(
          "pane の間の隙間",
          env.prefs.paneGaps,
          (v) => set({ paneGaps: v }),
          "端末版では、切にすると左右に並んだ pane の縦の罫線を 1 本にまとめます。",
        ),
        choiceItem(
          "pane の枠・隙間の太さ",
          PANE_FRAME,
          pick(raw.paneFrameThickness, ["thin", "default", "thick"] as const, "default"),
          (v) => set({ paneFrameThickness: v }),
          BROWSER_ONLY,
        ),
        toggleItem("pane にエージェント名を出す", env.prefs.paneAgentNameVisible, (v) =>
          set({ paneAgentNameVisible: v }),
        ),
        toggleItem(
          "pane の場所の外周の枠",
          flag(raw.paneOuterBorders, false),
          (v) => set({ paneOuterBorders: v }),
          BROWSER_ONLY,
        ),
        choiceItem(
          "tab バーの位置",
          TAB_BAR_POSITIONS,
          loadTabBarPosition(raw.tabBarPosition),
          (v) => set({ tabBarPosition: v }),
          "端末版は 1 列表示の間はいつも上です。",
        ),
        { label: "tab バー右端の表示", heading: true },
      ];
      entries.forEach((e, i) => {
        items.push({
          label: `  ${i + 1}. ${entryLabel(e)}`,
          activate: () => {
            const ops: { label: string; run: () => Outcome }[] = [];
            if (i > 0)
              ops.push({
                label: "上へ",
                run: () => {
                  const next = [...entries];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  setEntries(next);
                },
              });
            if (i < entries.length - 1)
              ops.push({
                label: "下へ",
                run: () => {
                  const next = [...entries];
                  [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
                  setEntries(next);
                },
              });
            if (e.kind === "datetime")
              ops.push({
                label: "書式を変える",
                run: () =>
                  choose(
                    "日時の書式",
                    DATETIME_FORMATS.map((f) => ({
                      label: f.label,
                      current: f.value === e.format,
                    })),
                    (k) => {
                      const next = [...entries];
                      next[i] = { kind: "datetime", format: DATETIME_FORMATS[k]!.value };
                      setEntries(next);
                    },
                  ),
              });
            if (e.kind === "text")
              ops.push({
                label: "文字列を変える",
                run: () => ({
                  kind: "edit",
                  title: "固定文字列",
                  initial: e.text,
                  commit: (text) => {
                    const next = [...entries];
                    next[i] = { kind: "text", text: sanitizeTabBarText(text) };
                    setEntries(next);
                  },
                }),
              });
            ops.push({ label: "削除", run: () => setEntries(entries.filter((_, k) => k !== i)) });
            return choose(
              entryLabel(e),
              ops.map((o) => ({ label: o.label, current: false })),
              (k) => ops[k]!.run(),
            );
          },
        });
      });
      items.push(
        {
          label: "  ＋ 追加",
          disabled: entries.length >= MAX_TAB_BAR_RIGHT_ENTRIES,
          activate: () =>
            choose(
              "追加する種類",
              ENTRY_KINDS.map((k) => ({ label: k.label, current: false })),
              (k) => {
                const kind = ENTRY_KINDS[k]!.value;
                const entry: TabBarRightEntry =
                  kind === "datetime"
                    ? { kind, format: "time" }
                    : kind === "text"
                      ? { kind, text: "" }
                      : { kind };
                setEntries([...entries, entry]);
              },
            ),
        },
        {
          label: "  区切り文字",
          value: JSON.stringify(loadTabBarRightSeparator(raw.tabBarRightSeparator)),
          activate: () => ({
            kind: "edit",
            title: "区切り文字",
            initial: loadTabBarRightSeparator(raw.tabBarRightSeparator),
            commit: (text) => set({ tabBarRightSeparator: loadTabBarRightSeparator(text) }),
          }),
        },
      );
      items.push(...sidebarRowsItems(env));
      return items;
    },
  };
}

// --- 端末 ---

const NEW_CWD = [
  { value: "follow", label: "引き継ぐ（いま見ている pane の場所）" },
  { value: "home", label: "ホーム" },
  { value: "current", label: "サーバを起動した場所" },
  { value: "path", label: "指定した場所" },
] as const;

function terminalSection(env: SettingsEnv): SettingsSection {
  return {
    id: "terminal",
    label: "端末",
    items: () => {
      const pref = loadScrollbackPref(env.prefs.shared.scrollback);
      const limit = env.scrollbackLimit();
      const saved = pref === "auto" ? undefined : pref;
      const selected: "auto" | number = saved === undefined ? "auto" : Math.min(saved, limit);
      const fmt = (n: number): string => `${n.toLocaleString("ja-JP")} 行`;
      const scrollChoices: { value: "auto" | number; label: string }[] = [
        { value: "auto", label: `自動（この端末では ${fmt(limit)}）` },
        ...scrollbackChoices(limit, saved).map((n) => ({ value: n, label: fmt(n) })),
      ];
      const policy = env.prefs.newCwdPolicy;
      return [
        choiceItem(
          "scrollback",
          scrollChoices,
          selected,
          (v) => env.write.setShared({ scrollback: v }),
          "新しく開く pane から効きます。",
        ),
        choiceItem(
          "新しく開く場所",
          NEW_CWD,
          policy,
          (v) => env.write.setShared({ newCwdPolicy: v }),
          "workspace・tab・分割を開く場所。",
        ),
        {
          label: "指定した場所のパス",
          value: env.prefs.newCwdPath === "" ? "（未設定）" : env.prefs.newCwdPath,
          disabled: policy !== "path",
          note:
            policy === "path"
              ? "~ はサーバのホーム。"
              : "「新しく開く場所」が「指定した場所」のときに使います。",
          activate: () => ({
            kind: "edit",
            title: "指定した場所のパス",
            initial: env.prefs.newCwdPath,
            commit: (text) => {
              if (text !== env.prefs.newCwdPath) env.write.setShared({ newCwdPath: text });
            },
          }),
        },
        toggleItem(
          "シェルの場所を追う（Windows）",
          env.prefs.shellCwdTracking,
          (v) => env.write.setShared({ shellCwdTracking: v }),
          "Windows のサーバで、pane の PowerShell・cmd がプロンプトのたびに今の場所を知らせます。新しく開く pane から効きます。",
        ),
      ];
    },
  };
}

// --- エージェント連携 ---

const AGENT_KINDS: readonly { value: AgentIntegrationKind; label: string }[] = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor Agent CLI" },
  { value: "copilot", label: "GitHub Copilot CLI" },
  { value: "devin", label: "Devin CLI" },
  { value: "droid", label: "Droid" },
  { value: "grok", label: "Grok CLI" },
  { value: "qwen", label: "Qwen Code" },
];

function agentSection(env: SettingsEnv): SettingsSection {
  let busy: AgentIntegrationKind | null = null;
  return {
    id: "agents",
    label: "エージェント連携",
    items: () => {
      const status = env.agentIntegration.status();
      if (!status) return [{ label: "状態を読み込んでいます…", disabled: true }];
      const items: SettingItem[] = AGENT_KINDS.map((k) => {
        const s = status.agents?.[k.value];
        const installed = s?.installed === true;
        return {
          label: k.label,
          value:
            busy === k.value
              ? "操作中…"
              : `${installed ? "導入済み" : "未導入"}${s?.cliDetected === false ? "（コマンドが見つかりません）" : ""}`,
          note: installed
            ? "押すと本製品のフックを外します。"
            : "押すと本製品のフックを入れます（状態の検出・セッションの再開に使います）。",
          disabled: busy !== null,
          activate: () => {
            if (busy) return;
            busy = k.value;
            const op = installed
              ? env.agentIntegration.uninstall(k.value)
              : env.agentIntegration.install(k.value);
            op.then(
              (r) =>
                env.message(
                  r.ok
                    ? (r.message ?? `${k.label}：${installed ? "外しました" : "入れました"}`)
                    : (r.message ?? "操作に失敗しました"),
                ),
              () => env.message("操作に失敗しました"),
            ).finally(() => {
              busy = null;
            });
            return `${k.label}：${installed ? "外しています" : "入れています"}…`;
          },
        };
      });
      items.push(
        toggleItem(
          "サーバの起動時にセッションを再開する",
          status.autoResumeEnabled,
          (v) => {
            env.agentIntegration.setAutoResume(v).catch(() => env.message("保存できませんでした"));
          },
          "サーバ全体の設定です（herdr の resume_agents_on_restore）。",
        ),
      );
      return items;
    },
  };
}

// --- 端末版 ---

const DELIVERY_LABELS: Record<NotifyDelivery, string> = {
  auto: "自動（端末を判定）",
  osc9: "OSC 9（iTerm2・WezTerm・Ghostty）",
  osc99: "OSC 99（kitty）",
  osc777: "OSC 777（Windows Terminal ほか）",
  bell: "ベルだけ",
  off: "出さない",
};
const COLOR_MODES: readonly { value: ColorModePref; label: string }[] = [
  { value: "auto", label: "自動（外側の端末から判定）" },
  { value: "truecolor", label: "24 ビット色" },
  { value: "256", label: "256 色" },
];

function numberItem(
  label: string,
  value: number,
  min: number,
  max: number,
  set: (v: number) => void,
  note: string,
): SettingItem {
  return {
    label,
    value: `${value} 桁`,
    note,
    activate: () => ({
      kind: "edit",
      title: `${label}（${min}〜${max}）`,
      initial: String(value),
      commit: (text) => {
        // 10 進の数字だけ（空・`0x40`・`1e2`・符号は通さない）。
        const t = text.trim();
        const n = /^\d+$/.test(t) ? Number(t) : Number.NaN;
        if (!Number.isInteger(n) || n < min || n > max)
          return `${min}〜${max} の整数を入れてください。`;
        set(n);
      },
    }),
  };
}

function tuiSection(env: SettingsEnv): SettingsSection {
  return {
    id: "tui",
    label: "端末版",
    items: () => {
      const p = env.prefs;
      const delivery = p.notifyDelivery;
      return [
        toggleItem(
          "マウスを使う",
          p.mouseCapture,
          (v) => env.write.setTui("mouseCapture", v),
          "切にすると外側の端末がマウスを扱います（外側の端末の選択・貼り付けがそのまま使えます。pane へもサイドバーへも届きません）。",
        ),
        toggleItem(
          "マウスで選んだらコピー",
          p.copyOnSelect,
          (v) => env.write.setTui("copyOnSelect", v),
          "切にすると、選んだ範囲を反転して見せるだけでクリップボードへは写しません。",
        ),
        choiceItem(
          "通知の出し方",
          NOTIFY_DELIVERIES.map((d) => ({ value: d, label: DELIVERY_LABELS[d] })),
          delivery,
          (v) => env.write.setTui("notifyDelivery", v),
          delivery === "auto" && env.detectedDelivery
            ? `自動の判定：${env.detectedDelivery()}。SSH 越しでは判定できないので、選んで上書きしてください。`
            : "SSH 越しで外側の端末を判定できないときに選びます。",
        ),
        numberItem(
          "サイドバーの既定の幅",
          p.sharedSidebarCols,
          10,
          200,
          (v) => env.write.setTui("sidebarCols", v),
          "ドラッグで変えた今の幅（この端末の tui-state）があればそちらが先です。",
        ),
        numberItem(
          "1 列表示にする幅",
          p.narrowThreshold,
          0,
          1000,
          (v) => env.write.setTui("narrowThreshold", v),
          "端末の幅がこれより狭いと、焦点の pane だけを出します（herdr の mobile）。",
        ),
        toggleItem(
          "tab が 1 つなら tab バーを隠す",
          p.hideTabBarWhenSingle,
          (v) => env.write.setTui("hideTabBarWhenSingle", v),
          `${TUI_ONLY}サイドバーを畳んでいる間は隠しません。隠している間のモードの印と接続の状態は、pane の場所の右上に出します。`,
        ),
        {
          label: "外側の端末のタイトル",
          value: p.windowTitle === "" ? "（変えない）" : JSON.stringify(p.windowTitle),
          note: `${TUI_ONLY}{hostname}・{workspace}・{tab}・{pane}・{terminal_title} が使えます（{{ と }} で括弧そのもの）。空にすると外側の端末のタイトルに触りません。終えるときに元のタイトルへ戻します（戻せる端末だけ）。`,
          activate: () => ({
            kind: "edit",
            title: "外側の端末のタイトルの書式",
            initial: p.windowTitle,
            commit: (text) => {
              try {
                parseWindowTitle(text);
              } catch (err) {
                return `書式が読めません（${err instanceof Error ? err.message : String(err)}）。`;
              }
              env.write.setTui("windowTitle", text);
            },
          }),
        },
        toggleItem(
          "外側の端末に戻ったら全部描き直す",
          p.redrawOnFocusGained,
          (v) => env.write.setTui("redrawOnFocusGained", v),
          `${TUI_ONLY}外側の端末の表示のまれな崩れを直します。切にすると戻ったときのちらつきが減ります（崩れは次に全部描き直すまで残ることがあります）。`,
        ),
        toggleItem(
          "pane のベルを外側の端末へ",
          p.forwardBell,
          (v) => env.write.setTui("forwardBell", v),
          `${TUI_ONLY}外側の端末にフォーカスがあり、その pane が画面に見えているときだけ鳴らします。`,
        ),
        toggleItem(
          "workspace を閉じる前に確かめる",
          p.confirmClose,
          (v) => env.write.setTui("confirmClose", v),
          `${TUI_ONLY}切でも、動作中のプロセスがある pane を閉じるときは確かめます。`,
        ),
        toggleItem(
          "新しい tab の名前を先に聞く",
          p.promptNewTabName,
          (v) => env.write.setTui("promptNewTabName", v),
          `${TUI_ONLY}切にすると、番号の名前ですぐ作ります。`,
        ),
        toggleItem(
          "新しい workspace の名前を先に聞く",
          p.promptNewWorkspaceName,
          (v) => env.write.setTui("promptNewWorkspaceName", v),
          `${TUI_ONLY}空のまま確定すると自動の名前になります。`,
        ),
        choiceItem(
          "色の出し方（この端末だけ）",
          COLOR_MODES,
          p.colorMode,
          (v) => env.write.setLocal({ colorMode: v === "auto" ? undefined : v }),
          "端末ごとの設定です（tui-state.json に残します）。環境変数 SODA_TRUECOLOR があればそちらが先です。",
        ),
        ...(env.openOnboarding
          ? [
              {
                label: "はじめの案内を開く",
                note: "起動したときに出た案内をもう一度出します。",
                activate: () => env.openOnboarding?.(),
              },
            ]
          : []),
      ];
    },
  };
}

/** 節の並び（web の設定と同じ順＋エージェント連携・端末版）。 */
export function settingsSections(env: SettingsEnv): SettingsSection[] {
  return [
    notifySection(env),
    themeSection(env),
    displaySection(env),
    terminalSection(env),
    agentSection(env),
    keySection(env),
    tuiSection(env),
  ];
}
