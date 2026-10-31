import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import { DesktopProvider } from "./DesktopProvider.js";

it.each(["client", "dispose"])(
  "cancels a queued reconnect when its %s disappears before the old helper exits",
  async (reason) => {
    const provider = new DesktopProvider({
      command: ["unused"],
      allowInput: false,
      origins: () => ["http://127.0.0.1:1"],
    });
    const child = new EventEmitter();
    // Model only the retiring process; reaching the new connection would yield a spawn/connect error instead.
    const state = provider as unknown as {
      active?: { dead: boolean; process: EventEmitter; owner: string };
    };
    state.active = { dead: true, process: child, owner: "old" };
    const pending = provider.start("new", {
      url: "ws://127.0.0.1:1/desktop-share",
      ticket: "a".repeat(43),
      options: { width: 1280, fps: 10, quality: 65 },
    });
    if (reason === "client") provider.clientGone("new");
    else provider.dispose();
    delete state.active;
    child.emit("close");
    await expect(pending).rejects.toThrow(/cancelled/);
  },
);
it("requires a separate local ceiling for physical display changes before connecting or spawning", async () => {
  const provider = new DesktopProvider({
    command: ["unused"],
    allowInput: true,
    origins: () => ["http://127.0.0.1:1"],
  });
  expect(provider.capabilities().displayResize).toBe(false);
  await expect(
    provider.start("owner", {
      url: "ws://127.0.0.1:1/desktop-share",
      ticket: "a".repeat(43),
      options: {
        width: 1280,
        fps: 10,
        quality: 65,
        features: true,
        display: { width: 800, height: 600 },
      },
    }),
  ).rejects.toThrow("許可されていません");
  provider.dispose();
});

it("revoking configuration cancels a queued start before its helper can launch", async () => {
  const provider = new DesktopProvider({ command: ["unused"], allowInput: true, origins: () => ["http://127.0.0.1:1"] });
  const child = new EventEmitter();
  const state = provider as unknown as { active?: { dead: boolean; process: EventEmitter; owner: string } };
  state.active = { dead: true, process: child, owner: "old" };
  const pending = provider.start("new", { url: "ws://127.0.0.1:1/desktop-share", ticket: "a".repeat(43), options: { width: 1280, fps: 10, quality: 65 } });
  provider.configure(undefined);
  delete state.active; child.emit("close");
  await expect(pending).rejects.toThrow(/cancelled/);
  expect(provider.capabilities().available).toBe(false);
});

it.each(["linux-portal","macos-sck"] as const)("admits permitted %s microphone through to connection setup",async nativePlatform=>{
 const provider=new DesktopProvider({command:["never-launched"],nativePlatform,allowInput:false,allowMicrophone:true,microphoneEndpoint:"explicit-virtual-target",origins:()=>["http://127.0.0.1:1"]});
 try{await expect(provider.start("generated",{url:"ws://127.0.0.1:1/desktop-share",ticket:"a".repeat(43),options:{nativePlatform,width:320,fps:10,quality:65,features:true,microphone:true}})).rejects.toMatchObject({code:"spawn_failed"});}finally{provider.dispose();}
});
