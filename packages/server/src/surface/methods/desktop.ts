import { DesktopMethods, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerDesktopMethods(surface: ControlSurface, deps: MethodDeps): void {
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
