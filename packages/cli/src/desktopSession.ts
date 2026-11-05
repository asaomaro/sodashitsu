import type {DesktopRegionRect} from "@sodashitsu/protocol";
import { DesktopMethods, type RemoteDesktopInput, type DesktopResults,type DesktopUiSnapshot,type ParamsOf } from "@sodashitsu/protocol";
import type { SodaClient } from "./wsClient.js";

export interface DesktopAgentConnection {
 readonly abort:AbortController;
 readonly expiresAt:number;
 observe(afterFrameSeq?:number,region?:DesktopRegionRect):Promise<DesktopResults["desktop.agent.observe"]>;
 act(observationId:string,inputs:RemoteDesktopInput[]):Promise<DesktopResults["desktop.agent.act"]>;
 uiObserve?(windowId?:string):Promise<DesktopUiSnapshot>;
 uiAct?(input:Omit<ParamsOf<"desktop.agent.ui_act">,"leaseId">):Promise<{acted:true}>;
 release():Promise<DesktopResults["desktop.agent.release"]>;
 close():void;
}
export class DesktopAgentSession implements DesktopAgentConnection {
  readonly abort = new AbortController();
  private timer: ReturnType<typeof setTimeout>|undefined;
  private closed = false;
  private constructor(
    private client: SodaClient,
    private lease: string,
    readonly expiresAt: number,
    private readonly headlessMode=false,
  ) {
    if(expiresAt>0)this.timer = setTimeout(
      () => this.close(),
      Math.max(1, Math.min(120000, expiresAt - Date.now())),
    );
    this.timer?.unref();
    client.onClose(() => this.close());
  }
  static async attach(client: SodaClient, ticket: string) {
    const p = DesktopMethods["desktop.agent.attach"].parse({ ticket });
    const grant = await client.request("desktop.agent.attach", p);
    return new DesktopAgentSession(client, grant.leaseId, grant.expiresAt);
  }
  static async headless(client:SodaClient,local:boolean){
    const lease=await client.request("desktop.agent.headless",{local},{timeoutMs:60000});
    return new DesktopAgentSession(client,lease.leaseId,lease.expiresAt,true);
  }
  private request<
    M extends "desktop.agent.observe" | "desktop.agent.act" | "desktop.agent.release"|"desktop.agent.ui_observe"|"desktop.agent.ui_act",
  >(method: M, params: Parameters<SodaClient["request"]>[1]): Promise<DesktopResults[M]> {
    if (this.abort.signal.aborted) return Promise.reject(new Error("Desktop session ended"));
    return new Promise((resolve, reject) => {
      const stop = () => reject(new Error("Desktop session ended"));
      this.abort.signal.addEventListener("abort", stop, { once: true });
      this.client
        .request(method, params as never, {
          timeoutMs: method === "desktop.agent.act" ? 60000 : method.startsWith("desktop.agent.ui_")?20000:10000,
        })
        .then((value) => resolve(value as DesktopResults[M]), reject)
        .finally(() => this.abort.signal.removeEventListener("abort", stop));
    });
  }
  observe(afterFrameSeq?: number,region?:DesktopRegionRect) {
    return this.request(
      "desktop.agent.observe",
      DesktopMethods["desktop.agent.observe"].parse({
        leaseId: this.lease,
        ...(afterFrameSeq === undefined ? {} : { afterFrameSeq }),
        ...(region?{region}:{}),
      }),
    );
  }
  uiObserve(windowId?:string):Promise<DesktopUiSnapshot>{
    if(!this.headlessMode)return Promise.resolve({available:false,reason:"UI情報はヘッドレス接続で利用できます"});
    return this.request("desktop.agent.ui_observe",DesktopMethods["desktop.agent.ui_observe"].parse({leaseId:this.lease,...(windowId?{windowId}:{})}));
  }
  uiAct(input:Omit<ParamsOf<"desktop.agent.ui_act">,"leaseId">){
    if(!this.headlessMode)return Promise.reject(new Error("UI操作にはヘッドレス接続が必要です"));
    return this.request("desktop.agent.ui_act",DesktopMethods["desktop.agent.ui_act"].parse({...input,leaseId:this.lease}));
  }
  async act(observationId: string, inputs: RemoteDesktopInput[]) {
    const params = DesktopMethods["desktop.agent.act"].parse({
      leaseId: this.lease,
      observationId,
      inputs,
    });
    try {
      return await this.request("desktop.agent.act", params);
    } catch (error) {
      this.close();
      throw error;
    }
  }
  async release() {
    try {
      return await this.request("desktop.agent.release", { leaseId: this.lease });
    } finally {
      this.close();
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.client.close();
  }
}
