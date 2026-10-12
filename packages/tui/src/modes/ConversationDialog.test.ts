import { expect, it, vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { PrefsModel } from "../model/PrefsModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { snapshot } from "../testing/fixtures.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { ConversationDialog } from "./ConversationDialog.js";
it('switches message order by key and mouse while keeping the selected message identity',async()=>{
  const model=new SessionModel();model.applySnapshot(snapshot(),'client');const ui=new UiState(model,vi.fn()),jump=vi.fn();
  const request=vi.fn(async()=>({messages:[{id:'old',role:'user',text:'最初の質問'},{id:'new',role:'user',text:'最後の質問'}],nextOffset:null,partial:false}));
  const d=new ConversationDialog('messages','p1',ui,{request} as unknown as RequestPort,new PrefsModel(),model,()=>{},()=>{},jump);
  const render=()=>{const grid=new Grid(100,30);d.render({grid,theme:new ThemeColors('dracula')});return Array.from({length:grid.h},(_,y)=>grid.rowText(y)).join('\n');};
  try{
    await vi.waitFor(()=>expect(render()).toContain('最初の質問'));
    expect(render().indexOf('最初の質問')).toBeLessThan(render().indexOf('最後の質問'));
    d.handleKey(chordToKeyInput('o'));expect(render().indexOf('最後の質問')).toBeLessThan(render().indexOf('最初の質問'));
    d.handleKey(chordToKeyInput('Space'));expect(jump).toHaveBeenCalledWith('p1','最初の質問');
    d.handleKey(chordToKeyInput('Escape'));render();d.handleMouse({action:'down',button:0,x:90,y:27});
    expect(render().indexOf('最初の質問')).toBeLessThan(render().indexOf('最後の質問'));
  }finally{d.dispose();}
});
function setup(mode: "messages" | "summary") {
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const ui = new UiState(model, vi.fn());
  const request = vi.fn(async (method: string) =>
    method === "agent.conversation"
      ? {
          messages: [{ id: "m", role: "user", text: "質問の本文" }],
          nextOffset: null,
          partial: false,
        }
      : method === "agent.summary_cached"
        ? {
            summary: {
              text: "保存した要約",
              kind: "claude",
              model: "",
              sessionId: null,
              partial: false,
            },
          }
        : { text: "生成した要約", kind: "claude", model: "", sessionId: null, partial: false },
  );
  const dialog = new ConversationDialog(
    mode,
    "p1",
    ui,
    { request } as unknown as RequestPort,
    new PrefsModel(),
    model,
    vi.fn(),
    vi.fn(),
    vi.fn(),
  );
  const screen = () => {
    const grid = new Grid(100, 30);
    dialog.render({ grid, theme: new ThemeColors("dracula") });
    return Array.from({ length: 30 }, (_, y) => grid.rowText(y)).join("\n");
  };
  return { dialog, request, screen };
}
it("Space and a mouse click open a message without generating; Enter requests a summary", async () => {
  const f = setup("messages");
  await vi.waitFor(() => expect(f.screen()).toContain("質問の本文"));
  f.dialog.handleKey(chordToKeyInput("Space"));
  expect(f.screen()).toContain("あなた");
  expect(f.request).not.toHaveBeenCalledWith("agent.summary", expect.anything());
  f.dialog.handleKey(chordToKeyInput("Escape"));
  f.screen();
  f.dialog.handleMouse({ action: "down", button: 0, x: 2, y: 2 });
  expect(f.screen()).toContain("あなた");
  expect(f.request).not.toHaveBeenCalledWith("agent.summary", expect.anything());
  f.dialog.handleKey(chordToKeyInput("Enter"));
  await vi.waitFor(() => expect(f.screen()).toContain("生成した要約"));
  expect(f.request).toHaveBeenCalledWith(
    "agent.summary",
    expect.objectContaining({ paneId: "p1", mode: "update" }),
  );
  f.dialog.dispose();
});
it("Space opens the saved summary and does not generate it", async () => {
  const f = setup("summary");
  await vi.waitFor(() => expect(f.screen()).toContain("保存した要約"));
  f.dialog.handleKey(chordToKeyInput("Escape"));
  f.dialog.handleKey(chordToKeyInput("Space"));
  await vi.waitFor(() => expect(f.screen()).toContain("保存した要約"));
  expect(f.request).not.toHaveBeenCalledWith("agent.summary", expect.anything());
  f.dialog.dispose();
});
