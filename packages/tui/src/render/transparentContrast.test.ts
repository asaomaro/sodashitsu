import {expect,it,vi} from "vitest";
import {THEME_NAMES,contrastRatio} from "@sodashitsu/protocol";
import {DEFAULT_COLOR,ThemeColors,hexColor} from "./color.js";
import {startedApp} from "../testing/appHarness.js";
const hex=(n:number)=>"#"+(n&0xffffff).toString(16).padStart(6,"0");
it("keeps light and dark theme text readable on transparent terminal ground",()=>{
 for(const name of THEME_NAMES)for(const dark of [true,false]){
  const t=new ThemeColors(name,undefined,true,dark),bg=dark?"#202020":"#f5f5f5";
  for(const fg of [t.paneFg,t.ui("--soda-fg"),t.ui("--soda-menu-fg"),t.ui("--soda-state-idle"),t.ui("--soda-accent")]){
   const adjusted=t.readableForeground(fg,DEFAULT_COLOR);expect(contrastRatio(hex(adjusted),bg)).toBeGreaterThanOrEqual(4.5);
   if(contrastRatio(hex(fg),bg)>=4.5)expect(adjusted).toBe(fg);
  }
 }
});
it("retains readable opaque selection colors and explicit ANSI colors",()=>{
 const t=new ThemeColors("sodashitsu-assistant",undefined,true,true),fg=t.ui("--soda-fg"),bg=t.ui("--soda-menu-active-bg");
 expect(t.readableForeground(fg,bg)).toBe(fg);expect(t.readableForeground(DEFAULT_COLOR,DEFAULT_COLOR)).toBe(DEFAULT_COLOR);
 const explicit=hexColor("#e51020"),explicitBg=hexColor("#223344");expect(t.readableForeground(explicit,explicitBg)).toBe(explicit);
 expect(new ThemeColors("sodashitsu-assistant").readableForeground(fg,DEFAULT_COLOR)).toBe(fg);
 expect(t.readableForeground(t.paneFg,hexColor("#215e12"))).not.toBe(t.paneFg);
});
it("repaints after terminal brightness changes without changing the chosen normal theme",async()=>{
 const h=await startedApp();try{
  h.app.prefs.apply({theme:"sodashitsu-assistant",themeAuto:false},10);
  h.app.prefs.setLocal({...h.app.prefs.localState,transparentBg:true});
  const theme=()=> (h.app as unknown as {theme:ThemeColors}).theme;
  h.io.type("\x1b]11;rgb:2020/2020/2020\x1b\\");const dark=theme();
  expect(contrastRatio(hex(dark.readableForeground(dark.paneFg,DEFAULT_COLOR)),"#202020")).toBeGreaterThanOrEqual(4.5);
  h.io.type("\x1b]11;rgb:ffff/ffff/ffff\x1b\\");expect(theme().key).not.toBe(dark.key);expect(theme().terminalDark).toBe(false);
  expect(h.app.prefs.theme).toBe("sodashitsu-assistant");expect(h.app.prefs.shared.themeAuto).toBe(false);
 }finally{await h.close();}
});
