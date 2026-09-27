import { MachineListParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 保存した SSH のマシンの一覧と状態（20260927-multi-host-machines）。`machine/` を import しない（`MethodDeps.machines` の関数を受けるだけ。
 * architecture の境界）。依存が無ければ空の一覧（テストの組み立て等）。変化は `machine.changed` のイベントでも配る（`composeServer`）。
 */
export function registerMachineMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("machine.list", {
    schema: MachineListParams,
    handler: async () => ({ machines: deps.machines ? await deps.machines() : [] }),
  });
}
