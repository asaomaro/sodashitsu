import { expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { insightsFixture, resourcesFixture } from "../testing/monitorFixtures.js";
import type { SidebarHit } from "../render/chrome/sidebar.js";

it("opens both read-only screens from Other, consumes input and returns with Escape",async()=>{
 const h=await startedApp({cols:120,rows:35,respond:{"agent.usage_insights":insightsFixture(),"server.resource_monitor":resourcesFixture()}});
 try {
  await vi.waitFor(()=>expect(h.ws.requests("client.view")).toHaveLength(1));h.app.renderNow();
  const hits=(h.app as unknown as {sidebarHits:SidebarHit[]}).sidebarHits;
  const more=hits.find(b=>b.kind==="control"&&b.action==="screens") as Extract<SidebarHit,{kind:"control"}>;
  h.io.type(`\x1b[<0;${more.x+1};${more.y+1}M\x1b[<0;${more.x+1};${more.y+1}m`);h.app.renderNow();
  expect(await h.screen()).toContain("エージェント利用分析");expect(await h.screen()).toContain("リソースモニター");
  h.io.type("\r");await vi.waitFor(()=>expect(h.app.ui.screen).toBe("analytics"));
  await vi.waitFor(()=>expect(h.ws.requests("agent.usage_insights")).toHaveLength(1));
  h.app.renderNow();await vi.waitFor(async()=>expect(await h.screen()).toContain("エージェント利用分析"));
  const before=h.ws.sent.filter(m=>m instanceof Uint8Array).length;
  h.io.type("\x02\x02");
  expect(h.ws.sent.filter(m=>m instanceof Uint8Array)).toHaveLength(before);
  h.io.type("3");h.app.renderNow();expect(await h.screen()).toContain("メイン / サブ");
  h.io.type("\x1b[200~do not send\x1b[201~");expect(h.ws.sent.filter(m=>m instanceof Uint8Array)).toHaveLength(before);
  h.app.ui.setScreen("resources");await vi.waitFor(()=>expect(h.ws.requests("server.resource_monitor")).toHaveLength(1));
  await vi.waitFor(async()=>{h.app.renderNow();expect(await h.screen()).toContain("120.0% (1/2取得)");});
  h.io.type("r");await vi.waitFor(()=>expect(h.ws.requests("server.resource_monitor")).toHaveLength(2));
  h.io.type("\x1b");await vi.waitFor(()=>expect(h.app.ui.screen).toBe("base"));
  expect(h.ws.sent.filter(m=>m instanceof Uint8Array)).toHaveLength(before);expect(h.ws.requests("agent.usage_report")).toHaveLength(0);
 }finally{await h.close();}
});
