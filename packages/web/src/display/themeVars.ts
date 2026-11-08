import { CSS_VARS, loadButtonTheme } from "@sodashitsu/client-core";

import scrollbarCss from "../styles/displayScrollbar.css?raw";

import buttonCss from "../styles/buttonTheme.css?raw";

/** 枠へ `render` と一緒に渡す配色。アプリの `--soda-*` の変数の、計算済みの値と明暗。 */
export function readThemeVars(): { dark: boolean; vars: Record<string, string>; buttonTheme: import("@sodashitsu/protocol").ButtonThemeMode;buttonCss:string;scrollbarCss:string } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const vars: Record<string, string> = {};
  for (const name of CSS_VARS) {
    const v = cs.getPropertyValue(name).trim();
    if (v !== "") vars[name] = v;
  }
  vars["--soda-scrollbar-size"]=cs.getPropertyValue("--soda-scrollbar-size").trim()||"8px";
  vars["--soda-scrollbar-width"]=cs.getPropertyValue("--soda-scrollbar-width").trim()||"thin";
  // Always replace the supplemental track color; a prior Soda palette must not leak into the next palette.
  vars["--soda-assistant-scroll-track"]=cs.getPropertyValue("--soda-assistant-scroll-track").trim()||cs.getPropertyValue("--soda-menu-hover-bg").trim()||"transparent";
  const scheme = root.style.colorScheme || cs.colorScheme || "";
  let dark: boolean;
  if (scheme.includes("dark") && !scheme.includes("light")) dark = true;
  else if (scheme.includes("light") && !scheme.includes("dark")) dark = false;
  else dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
  return { dark, vars,buttonTheme:loadButtonTheme(root.dataset.buttonTheme),buttonCss,scrollbarCss };
}
