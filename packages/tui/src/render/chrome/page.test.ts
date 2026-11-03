import {expect,it} from "vitest";
import {Grid} from "../Screen.js";
import {ATTR,ThemeColors} from "../color.js";
import {pageHeader} from "./page.js";
it("styles page titles without moving text, controls or content",()=>{
 for(const name of ["dracula","sodashitsu-assistant","sodashitsu-assistant-dark"] as const){
  const theme=new ThemeColors(name),g=new Grid(60,12),bg=theme.ground("--soda-menu-bg"),fg=theme.ui("--soda-fg");g.fill({x:3,y:2,w:50,h:8},fg,bg);g.text(4,2,"利用状況",fg,bg);g.text(30,2,"選択",fg,theme.ui("--soda-menu-active-bg"));g.text(4,4,"内容",fg,bg);
  const before=[...g.ch];pageHeader(g,{x:3,y:2,w:50,h:8},theme);expect(g.ch).toEqual(before);expect(g.fg[2*60+4]).toBe(theme.ui("--soda-accent"));expect(g.attrs[2*60+4]!&ATTR.bold).toBeTruthy();expect(g.bg[2*60+30]).toBe(theme.ui("--soda-menu-active-bg"));expect(g.fg[4*60+4]).toBe(fg);
 }
});
