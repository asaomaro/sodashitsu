import { TERMINAL_PALETTES, type TerminalPalette, type ThemeName } from "@sodashitsu/protocol";
import { watch, type WatchStopHandle } from "vue";
import type { useSettingsStore } from "../store/settings.js";
import { readPrefs } from "../store/view.js";
import { lightDarkOf, loadThemePrefs, loadUiStyle, type UiStyle } from "@sodashitsu/client-core";
import { loadThemeOverrides, mergeVars, type ThemeOverrideLayer, type ThemeOverrides } from "./themeOverrides.js";
import { CSS_VARS, uiTokens, type UiTokens } from "@sodashitsu/client-core";

type SettingsStore = ReturnType<typeof useSettingsStore>;

/** 起動用の控えの置き場所（localStorage。`public/theme-boot.js` が同じキーを読む。design D5）。 */
export const BOOT_KEY = "soda.themeBoot.v1";

/** 控えの 1 組（CSS 変数と color-scheme）。 */
export interface BootVars {
  vars: UiTokens["vars"];
  colorScheme: "light" | "dark";
}

/** 控え：自動の切替の入切と、固定・明るいとき・暗いときの 3 組。`theme-boot.js` は `auto ? (暗い ? dark : light) : fixed` を当てる。 */
export interface BootCache {
  auto: boolean;
  fixed: BootVars;
  light: BootVars;
  dark: BootVars;
  /** 画面の様式（20261008-ui-style）。`theme-boot.js` は `"modern"` のときだけ `data-ui-style` を当てる（無い・ほかの値はクラシック＝何もしない）。 */
  uiStyle: UiStyle;
}

export interface ThemeControllerOptions {
  settings: SettingsStore;
  /** CSS 変数を当てる先（`document.documentElement`）。 */
  root: HTMLElement;
  /** `matchMedia("(prefers-color-scheme: dark)")`。無い環境では null（暗い扱い・追従しない）。 */
  media: MediaQueryList | null;
  /** 開いている全端末の配色を替える（`TerminalRegistry.setTheme`）。 */
  setTerminalTheme(palette: TerminalPalette): void;
  /** サーバへ表示しているテーマを伝える（`client.theme`。接続が無ければ捨ててよい——次の接続で `resend`）。 */
  sendTheme(name: ThemeName): void;
  /** 控えの書き先（localStorage）。使えない環境では null。 */
  storage: Storage | null;
}

/**
 * テーマを当てる部品（20260921-theme-settings の design D5・「振る舞いの詳細」）。
 * - 当てる（`apply`）：CSS 変数・color-scheme・`data-theme` を root へ、配色を全端末へ、名前をサーバへ。直前と同じ名前なら省く。
 * - OS の明暗を追う：`media` の change → `settings.systemDark` → `settings.effectiveTheme` が変われば当てる（AC5）。
 * - 画面の様式（20261008-ui-style）：`settings.uiStyle` を `root.dataset.uiStyle` へ当てる（`applyUiStyle`。`start()` と変化のとき）。控えにも書く。
 * - 起動用の控え（`writeBoot`）：**5 つの設定が変わったときと `start()` のときだけ**書く（OS の明暗が変わっただけでは中身が変わらない）。
 *   中身は保存された設定（`soda.prefs.v1`）から作る。
 */
export class ThemeController {
  private applied: ThemeName | null = null;
  private readonly stops: (() => void)[] = [];

  constructor(private readonly opts: ThemeControllerOptions) {}

  /**
   * 省略せずに当て、控えを書き、OS の明暗と設定の変化を聞き始める。**1 回目は省略しない**（`applied` を空にしてから当てる）——
   * `theme-boot.js` が控えから別のテーマの変数を当てていても、ここで正しい値に当て直す（控えが古くても自己修復する）。
   */
  start(): void {
    const { settings, media } = this.opts;
    settings.systemDark = media ? media.matches : true;
    this.applied = null; // 1 回目は省略しない（start の前に apply が呼ばれていても・stop の後に start し直しても）
    this.apply(settings.effectiveTheme);
    this.applyUiStyle();
    this.writeBoot();
    if (media) {
      const onChange = (ev: MediaQueryListEvent): void => {
        settings.systemDark = ev.matches;
      };
      media.addEventListener("change", onChange);
      this.stops.push(() => media.removeEventListener("change", onChange));
    }
    // 既定の `pre`（同じタスクの変化をまとめて 1 回）で追う——`setTheme` は `theme` と `themeAuto` を順に変えるので、同期で追うと
    // 途中の状態のテーマ（新しいテーマの対）を当て、間違った名前をサーバへ送ってしまう（T13 のタスク点検）。
    const stopApply: WatchStopHandle = watch(
      () => settings.effectiveTheme,
      (name) => this.apply(name),
    );
    const stopBoot: WatchStopHandle = watch(
      [
        () => settings.theme,
        () => settings.themeAuto,
        () => settings.themeLight,
        () => settings.themeDark,
      ],
      () => this.writeBoot(),
    );
    // 画面の様式：再読み込みなしで `data-ui-style` を替え、控えも書く（次の起動の最初の描画で当たるように）。
    const stopUiStyle: WatchStopHandle = watch(
      () => settings.uiStyle,
      () => {
        this.applyUiStyle();
        this.writeBoot();
      },
    );
    // 20260922-theme-custom-overrides：色の上書きが変わったら、画面へは `applyOverrides()`（`apply()` の早期 return を
    // 経由しない別経路。テーマ名は変わっていないため）で、控えへは `writeBoot()` で反映する。`themeOverrides` は
    // setter がイミュータブルに丸ごと差し替える（`keyPrefs` と同じ）ので、深い watch は要らない。
    const stopOverrides: WatchStopHandle = watch(
      () => settings.themeOverrides,
      () => {
        this.applyOverrides();
        this.writeBoot();
      },
    );
    this.stops.push(stopApply, stopBoot, stopUiStyle, stopOverrides);
  }

  /** 聞くのをやめる（テスト用）。 */
  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
  }

  /**
   * いま当てるべき CSS 変数（20260922-theme-custom-overrides）：`uiTokens(name)` の計算結果に、その `colorScheme`
   * （`light`／`dark`）に合う上書きの層を重ねる（`settings.themeAuto` の真偽では選ばない。研究 F2 の逸脱）。
   */
  private computeVars(name: ThemeName): Record<(typeof CSS_VARS)[number], string> {
    const base = uiTokens(name);
    const overrides = this.opts.settings.themeOverrides;
    const layer: ThemeOverrideLayer = base.colorScheme === "light" ? overrides.light : overrides.dark;
    return mergeVars(base.vars, layer);
  }

  /** 当てる。直前に当てた名前と同じなら何もしない（`start()` の 1 回目は `applied` が null なので必ず当たる）。 */
  apply(name: ThemeName): void {
    if (name === this.applied) return;
    this.applied = name;
    const { root } = this.opts;
    const vars = this.computeVars(name);
    for (const key of CSS_VARS) root.style.setProperty(key, vars[key]);
    root.style.colorScheme = uiTokens(name).colorScheme;
    root.dataset["theme"] = name;
    this.opts.setTerminalTheme(TERMINAL_PALETTES[name]);
    this.opts.sendTheme(name);
  }

  /** 画面の様式を root の `data-ui-style` へ当てる（`classic`・`modern`。属性が無いときもクラシックとして動く）。 */
  applyUiStyle(): void {
    this.opts.root.dataset["uiStyle"] = this.opts.settings.uiStyle;
  }

  /**
   * 色の上書きだけが変わったときに再適用する（20260922-theme-custom-overrides）。`apply()` の「直前と同じ名前なら省く」
   * 最適化はテーマ名の変化を追うためのもので、上書きの変化はこの経路で反映する（`applied` は書き換えない・端末の色や
   * サーバへ伝える名前には影響しない——上書きは画面の枠だけ）。`start()` より前（`applied` が null）なら何もしない。
   */
  applyOverrides(): void {
    if (this.applied === null) return;
    const vars = this.computeVars(this.applied);
    for (const key of CSS_VARS) this.opts.root.style.setProperty(key, vars[key]);
  }

  /** 控えを書く（固定＝1 つのテーマ、明るいとき・暗いとき＝`lightDarkOf`）。書けなくても落ちない（プライベートモード等）。 */
  writeBoot(): void {
    const { storage } = this.opts;
    // **保存された設定から作る**（このタブの store からではなく）——同じブラウザの別のタブで設定を変えていると、このタブの store は古い。
    // 次の読み込みが使うのは保存された設定なので、控えもそれに揃える（review ラウンド 1）。上書き（20260922-theme-custom-overrides）も同じ理由で保存値から読む
    // （`readPrefs()` は 1 回だけ呼び、`theme` の分・`themeOverrides` の分の両方に渡す。`readPrefs`/`writePrefs` の読み書きの所有者を 1 つにする方針〔`store/view.ts`〕
    // と揃え、無駄な再読み込みもしない）。
    const prefs = readPrefs();
    const saved = loadThemePrefs(prefs);
    const overrides = loadThemeOverrides(prefs["themeOverrides"]);
    const ld = lightDarkOf(saved);
    const cache: BootCache = {
      auto: saved.auto,
      fixed: bootVars(saved.theme, overrides),
      light: bootVars(ld.light, overrides),
      dark: bootVars(ld.dark, overrides),
      uiStyle: loadUiStyle(prefs["uiStyle"]),
    };
    try {
      storage?.setItem(BOOT_KEY, JSON.stringify(cache));
    } catch {
      // 書けなくても画面は正しい（次の読み込みの最初に既定の色が一瞬出るだけ）。
    }
  }

  /** 直前に当てた名前（`start()` の前は null）。 */
  current(): ThemeName | null {
    return this.applied;
  }

  /** 新しい接続の `client.hello` が通った後に呼ぶ（サーバは接続ごとに新しい clientId を振り、前の接続のテーマを持たない）。 */
  resend(): void {
    if (this.applied !== null) this.opts.sendTheme(this.applied);
  }
}

function bootVars(name: ThemeName, overrides: ThemeOverrides): BootVars {
  const t = uiTokens(name);
  const layer = t.colorScheme === "light" ? overrides.light : overrides.dark;
  return { vars: mergeVars(t.vars, layer), colorScheme: t.colorScheme };
}
