import { DesktopMethods,DesktopEndpointMethods, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerDesktopMethods(surface: ControlSurface, deps: MethodDeps): void {
  const nativeHelpers=deps.desktopNativeHelpers;
  if(nativeHelpers){
    surface.register("desktop.native_helper.start",{schema:DesktopMethods["desktop.native_helper.start"],handler:(ctx,p)=>{
      const origin=ctx.connection?.browserOrigin;if(!origin||ctx.connectionAuthorized?.()===false)throw new RpcError("unauthorized","ブラウザから接続してください");
      return nativeHelpers.start(ctx.clientId,p.viewerId,origin,()=>ctx.connectionAuthorized?.()!==false);
    }});
    surface.register("desktop.native_helper.stop",{schema:DesktopMethods["desktop.native_helper.stop"],handler:async(ctx,p)=>{await nativeHelpers.stop(ctx.clientId,p.viewerId);return {};}});
  }

  const endpoint=deps.desktopEndpoint;
  if(endpoint) {
    const owner=(ctx:{connection?:{localSettings?:boolean}})=>{if(ctx.connection?.localSettings!==true)throw new RpcError("unauthorized","暗号化接続の鍵と相手は、このPCのlocalhostの設定画面で管理してください。");};
    surface.register("desktop.endpoint.status",{schema:DesktopEndpointMethods["desktop.endpoint.status"],handler:ctx=>{owner(ctx);return endpoint.status();}});
    surface.register("desktop.endpoint.initialize",{schema:DesktopEndpointMethods["desktop.endpoint.initialize"],handler:ctx=>{owner(ctx);return endpoint.initialize();}});
    surface.register("desktop.endpoint.required",{schema:DesktopEndpointMethods["desktop.endpoint.required"],handler:(ctx,p)=>{owner(ctx);return endpoint.setRequired(p.required);}});
    surface.register("desktop.endpoint.trust",{schema:DesktopEndpointMethods["desktop.endpoint.trust"],handler:(ctx,p)=>{owner(ctx);return endpoint.trust(p);}});
    surface.register("desktop.endpoint.revoke",{schema:DesktopEndpointMethods["desktop.endpoint.revoke"],handler:(ctx,p)=>{owner(ctx);return endpoint.revoke(p.fingerprint,p.role);}});
    surface.register("desktop.endpoint.start",{schema:DesktopEndpointMethods["desktop.endpoint.start"],handler:(ctx,p)=>endpoint.start(ctx.clientId,p)});
  }
  const agents = deps.desktopRelay?.agents;
  if (agents) {
    surface.register("desktop.agent.attach", {
      schema: DesktopMethods["desktop.agent.attach"],
      handler: (ctx, p) => agents.attach(ctx.clientId, p.ticket),
    });
    surface.register("desktop.agent.observe", {
      schema: DesktopMethods["desktop.agent.observe"],
      handler: async (ctx, p) => {
        if (ctx.sink.bufferedAmount > 256 * 1024) {
          agents.release(ctx.clientId, p.leaseId);
          throw new RpcError("server_busy", "Agent output is congested; lease revoked");
        }
        await agents.refresh(ctx.clientId, p.leaseId, p.afterFrameSeq);
        if (ctx.sink.bufferedAmount > 256 * 1024) {
          agents.release(ctx.clientId, p.leaseId);
          throw new RpcError("server_busy", "Agent output is congested; lease revoked");
        }
        return agents.observe(ctx.clientId, p.leaseId, p.afterFrameSeq);
      },
    });
    surface.register("desktop.agent.act", {
      schema: DesktopMethods["desktop.agent.act"],
      handler: (ctx, p) => agents.act(ctx.clientId, p.leaseId, p.observationId, p.inputs),
    });
    surface.register("desktop.agent.release", {
      schema: DesktopMethods["desktop.agent.release"],
      handler: (ctx, p) => agents.release(ctx.clientId, p.leaseId),
    });
  }
  const settings = deps.desktopSettings;
  if (settings) {
    surface.register("desktop.settings.get", {
      schema: DesktopMethods["desktop.settings.get"],
      handler: (ctx) => settings.get(ctx.connection?.localSettings === true),
    });
    surface.register("desktop.settings.set", {
      schema: DesktopMethods["desktop.settings.set"],
      handler: (ctx, p) => {
        if (ctx.connection?.localSettings !== true)
          throw new RpcError("unauthorized", "接続先PCの localhost の画面、または端末版で設定してください。");
        return settings.set(p);
      },
    });
  }
  const provider = deps.desktop;
  if (!provider) return;
  surface.register("desktop.capabilities", {
    schema: DesktopMethods["desktop.capabilities"],
    handler: () => provider.capabilities(),
  });
  surface.register("desktop.start", {
    schema: DesktopMethods["desktop.start"],
    handler: (ctx, p) => provider.start(ctx.clientId, p),
  });
}
