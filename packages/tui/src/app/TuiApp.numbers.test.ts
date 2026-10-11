import { expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { snapshot,workspace,tab,pane,agent,leaf,split } from "../testing/fixtures.js";
it("通常は番号を隠し、prefixからtab・pane・workspace・agentを表示順の数字で選べる",async()=>{
 const h=await startedApp({snapshot:snapshot({
  workspaces:[workspace("w1",["t1","tb"],{label:"PJ A"}),workspace("w2",["t2"],{label:"PJ B"})],
  tabs:[tab("t1","w1",split("right",leaf("p1"),leaf("p2")),{label:"Tab A"}),tab("tb","w1",leaf("pb"),{label:"Tab B"}),tab("t2","w2",leaf("p3"))],
  panes:[pane("p1","t1",{label:"Pane A",agent:agent({instanceId:"a1"})}),pane("p2","t1",{label:"Pane B",agent:agent({instanceId:"a2"})}),pane("pb","tb"),pane("p3","t2")]
 })});
 try {
  await vi.waitFor(()=>expect(h.ws.requests("client.view")).toHaveLength(1));h.app.renderNow();
  expect(await h.screen()).toContain("Tab A");expect(await h.screen()).not.toContain("1:Tab A");
  h.io.type("\x02");h.app.renderNow();expect(await h.screen()).toContain("1:Tab A");
  h.io.type("2");expect(h.app.model.tabId).toBe("tb");
  h.io.type("\x021");expect(h.app.model.tabId).toBe("t1");
  h.io.type("\x02f");h.app.renderNow();expect(await h.screen()).toContain("PANE 1-9");
  h.io.type("2");expect(h.app.model.focusedPaneId).toBe("p2");
  h.io.type("\x02u2");expect(h.app.model.workspaceId).toBe("w2");
  h.io.type("\x02d1");expect(h.app.model.focusedPaneId).toBe("p1");expect(h.app.model.workspaceId).toBe("w1");
  h.app.renderNow();expect(await h.screen()).not.toContain("1:Tab A");
 } finally {await h.close();}
});
