import {expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({spawn:vi.fn(()=>{throw Error("generated spawn boundary");}),prepare:vi.fn(),close:vi.fn(async()=>{})}));
vi.mock("node:child_process",async()=>({...await vi.importActual<typeof import("node:child_process")>("node:child_process"),spawn:f.spawn}));
vi.mock("./DesktopAudioPipes.js",()=>({desktopWslAudioCommand:()=>true,DesktopAudioPipes:class{prepare=f.prepare;close=f.close;}}));
import {DesktopProvider} from "./DesktopProvider.js";
it.each(["dead","generation","active","unavailable"] as const)("checks share lifetime after WSL preparation: %s",async mode=>{
 let resolve!:(ready:boolean)=>void;f.prepare.mockImplementation(()=>new Promise<boolean>(r=>{resolve=r;}));f.spawn.mockClear();
 const cfg={command:["powershell.exe"],allowInput:true,allowNativeVideo:true,allowSystemAudio:true,origins:()=>[]},provider=new DesktopProvider(cfg),state=provider as any,share:any={dead:false};
 const pending=state.prepareLaunch(share,cfg,{nativeAudio:true});expect(f.spawn).not.toHaveBeenCalled();
 if(mode==="dead")share.dead=true;if(mode==="generation")state.audioPipes={prepare:f.prepare,close:f.close};resolve(mode!=="unavailable");
 try{if(mode==="active"||mode==="unavailable"){await expect(pending).rejects.toThrow("generated spawn boundary");expect(f.spawn).toHaveBeenCalledOnce();expect(!!share.audioPipes).toBe(mode==="active");}else{await expect(pending).resolves.toBeUndefined();expect(f.spawn).not.toHaveBeenCalled();expect(share.audioPipes).toBeUndefined();}}finally{provider.dispose();}
});
