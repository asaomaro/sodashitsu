import { ScheduleSaveParams, ScheduleIdParams, RpcError } from "@sodashitsu/protocol";
import { z } from "zod";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
export function registerScheduleMethods(surface: ControlSurface, deps: MethodDeps) {
  const service = () => {
    if (!deps.scheduler) throw new RpcError("not_found", "予約機能を利用できません");
    return deps.scheduler;
  };
  surface.register("schedule.list", { schema: z.object({}), handler: () => service().list() });
  surface.register("schedule.save", {
    schema: ScheduleSaveParams,
    handler: (_ctx, p) => service().save(p.id, p.job),
  });
  surface.register("schedule.remove", {
    schema: ScheduleIdParams,
    handler: async (_ctx, p) => {
      await service().remove(p.id);
      return {};
    },
  });
  surface.register("schedule.run", {
    schema: ScheduleIdParams,
    handler: (_ctx, p) => service().run(p.id),
  });
}
