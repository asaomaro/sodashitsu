import {expect,it} from "vitest";
import {DesktopNativeMonitorRestore,DesktopNativeMonitorRestores} from "./DesktopNativeMonitorRestore.js";
it("keeps Portal restore tokens in one controller origin and consumes them exactly once",()=>{
 const store=new DesktopNativeMonitorRestores(()=>0);
 store.remember("https://a.example/desktop-share","generated-private-token");
 expect(store.take("https://b.example")).toBeUndefined();expect(store.take("https://a.example/another-view")).toBe("generated-private-token");expect(store.take("https://a.example")).toBeUndefined();
 store.remember("https://a.example","generated-private-token");expect(store.take("https://a.example")).toBeUndefined();
});
it("expires the original grant budget, rejects clock rollback and clears local permission state",()=>{
 let now=100;const store=new DesktopNativeMonitorRestores(()=>now);
 store.remember("https://a.example","expires");now=600100;expect(store.take("https://a.example")).toBeUndefined();
 store.remember("https://a.example","rollback");now=600099;expect(store.take("https://a.example")).toBeUndefined();
 store.remember("https://a.example","revoke");store.clear();expect(store.take("https://a.example")).toBeUndefined();
 store.remember("https://a.example","forget");store.forget("https://a.example");expect(store.take("https://a.example")).toBeUndefined();
});
it("bounds distinct origins and validates metadata without exposing an alternate authority",()=>{
 const store=new DesktopNativeMonitorRestores(()=>0);
 for(let n=0;n<33;n++)store.remember(`https://controller-${n}.example`,`generated-${n}`);
 expect(store.take("https://controller-32.example")).toBeUndefined();expect(store.take("https://controller-0.example")).toBe("generated-0");
 expect(()=>store.remember("https://user:password@a.example","token")).toThrow();expect(()=>store.remember("file:///generated","token")).toThrow();
 for(const raw of [{type:"native_monitor_restore",token:"token",monitors:[]},{type:"native_monitor_restore",token:"bad\0token",monitors:["portal:a"]},{type:"native_monitor_restore",token:"token",monitors:["portal:a"],path:"unexpected"}])expect(DesktopNativeMonitorRestore.safeParse(raw).success).toBe(false);
});
