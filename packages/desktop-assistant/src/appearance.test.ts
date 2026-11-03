import {expect,it} from "vitest";
import {THEME_NAMES,THEME_APPEARANCE} from "@sodashitsu/protocol";
import {uiTokens} from "@sodashitsu/client-core";
import {assistantAppearance} from "./appearance.js";
it("supports every main UI palette and uses its action/control colors",()=>{
 for(const theme of THEME_NAMES){
  const result=assistantAppearance({appearance:THEME_APPEARANCE[theme],colorTheme:theme},{},false);
  expect(result.theme).toBe(theme);expect(result.mode).toBe(THEME_APPEARANCE[theme]);
  if(!theme.startsWith('sodashitsu-assistant')){
   expect(result.vars['--assistant-button-bg']).toBe(uiTokens(theme).vars['--soda-accent']);
   expect(result.vars['--assistant-scroll-thumb']).toBe(uiTokens(theme).vars['--soda-accent']);
   expect(result.vars['--assistant-button-fg']).toBe(uiTokens(theme).vars['--soda-accent-fg']);
  }
 }
});
it("uses shared automatic choices even when a dark OS explicitly selects a light theme",()=>{
 const prefs={appearance:'sodashitsu' as const,colorTheme:'nord' as const};
 expect(assistantAppearance(prefs,{theme:'dracula',themeAuto:true,themeLight:'one-dark',themeDark:'one-light'},true)).toMatchObject({mode:'light',theme:'one-light'});
 expect(assistantAppearance(prefs,{theme:'dracula',themeAuto:true,themeLight:'one-dark',themeDark:'one-light'},false)).toMatchObject({mode:'dark',theme:'one-dark'});
 expect(assistantAppearance(prefs,{} as never,false).theme).toBe('dracula');
});
