import { THEME_APPEARANCE, type DesktopAssistantPreferences, type SharedPrefs } from "@sodashitsu/protocol";
import { loadThemePrefs, resolveTheme, siblingThemes, uiTokens } from "@sodashitsu/client-core";

/** Use the same theme resolver and palette as the main UI. Only the desktop layout differs. */
export function assistantAppearance(preferences: Pick<DesktopAssistantPreferences,"appearance"|"colorTheme">, shared: SharedPrefs, systemDark: boolean) {
 const following=preferences.appearance==="sodashitsu";
 const pair=siblingThemes(preferences.colorTheme);
 const name=following?resolveTheme(loadThemePrefs(shared),systemDark):
  (preferences.appearance==="system"?systemDark:preferences.appearance==="dark")?pair.dark:pair.light;
 const mode=preferences.appearance==="system"?"system":THEME_APPEARANCE[name];
 const t=uiTokens(name).vars;
 // Keep the established assistant light/dark surfaces for its two original palettes.
 const vars:Record<string,string>=name.startsWith("sodashitsu-assistant")?{}:{
  "--assistant-bg":t["--soda-menu-bg"],"--assistant-fg":t["--soda-fg"],
  "--assistant-input":t["--soda-bg"],"--assistant-surface":t["--soda-menu-active-bg"],
  "--assistant-muted-surface":t["--soda-menu-hover-bg"],"--assistant-user":t["--soda-menu-active-bg"],
  "--assistant-border":t["--soda-menu-border"],"--assistant-gold":t["--soda-accent"],
  "--assistant-line":t["--soda-menu-border"],"--assistant-contrast":t["--soda-fg"],
  "--assistant-selection":t["--soda-menu-active-bg"],"--assistant-strong-surface":t["--soda-menu-active-bg"],
  "--assistant-button-bg":t["--soda-accent"],"--assistant-button-fg":t["--soda-accent-fg"],
  "--assistant-scroll-thumb":t["--soda-accent"],"--assistant-focus":t["--soda-resize-line"],
 };
 return {mode,theme:name,vars};
}
