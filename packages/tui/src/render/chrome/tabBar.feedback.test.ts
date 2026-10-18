import { expect, it } from "vitest";
import { SessionModel } from "../../model/SessionModel.js";
import { PrefsModel } from "../../model/PrefsModel.js";
import { snapshot } from "../../testing/fixtures.js";
import { Grid } from "../Screen.js";
import { ThemeColors } from "../color.js";
import type { ChromeContext } from "./context.js";
import { paintTabBar } from "./tabBar.js";

it("ドラッグ案内でタブ位置を動かさず、警告・再接続の表示も隠さない", () => {
  const model=new SessionModel();model.applySnapshot(snapshot(),"c1");
  const ctx:ChromeContext={model,prefs:new PrefsModel(),theme:new ThemeColors("dracula"),mode:"terminal",connection:"open",notice:null,session:"work"};
  const paint=(extra:Partial<ChromeContext>)=>{const grid=new Grid(100,1);const hits=paintTabBar(grid,{x:0,y:0,w:100,h:1},{...ctx,...extra});return {hits,text:grid.ch.join("")};};
  const before=paint({});
  const feedback=paint({dropTabId:model.tabId!,dragNotice:"移動中 · 離して確定"});
  expect(feedback.hits).toEqual(before.hits);expect(feedback.text).toContain("▶");
  expect(paint({dragNotice:"移動中",alert:"警告"}).text).toContain("警告");
  expect(paint({dragNotice:"移動中",connection:"reconnecting"}).text).toContain("再接続中");
});

it("keeps the full-width new-tab button out of the reserved alert column", () => {
  const model = new SessionModel(); model.applySnapshot(snapshot(), "c1");
  const prefs = new PrefsModel(); prefs.apply({tabBarRight: []}, 1);
  const ctx: ChromeContext = { model, prefs, theme: new ThemeColors("dracula"), mode: "terminal", connection: "open", notice: null, session: "", alert: "!" };
  const paint = (width: number) => {
    const grid = new Grid(width, 1);
    return { grid, hits: paintTabBar(grid, {x:0,y:0,w:width,h:1}, ctx) };
  };
  const tight = paint(10);
  expect(tight.hits.newTab).toBeNull();
  expect(tight.grid.ch[8]).toBe("!");
  const fits = paint(11);
  expect(fits.hits.newTab).not.toBeNull();
  expect(fits.grid.ch[9]).toBe("!");
  expect(fits.hits.newTab!.x + fits.hits.newTab!.w).toBeLessThanOrEqual(9);
});
