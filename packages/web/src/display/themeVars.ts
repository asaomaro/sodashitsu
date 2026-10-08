import { CSS_VARS } from "@sodashitsu/client-core";

/** 枠へ `render` と一緒に渡す配色。アプリの `--soda-*` の変数の、計算済みの値と明暗。 */
export function readThemeVars(): { dark: boolean; vars: Record<string, string> } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const vars: Record<string, string> = {};
  for (const name of CSS_VARS) {
    const v = cs.getPropertyValue(name).trim();
    if (v !== "") vars[name] = v;
  }
  const scheme = root.style.colorScheme || cs.colorScheme || "";
  let dark: boolean;
  if (scheme.includes("dark") && !scheme.includes("light")) dark = true;
  else if (scheme.includes("light") && !scheme.includes("dark")) dark = false;
  else dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
  return { dark, vars };
}
