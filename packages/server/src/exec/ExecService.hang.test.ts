import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({spawn}));
import { ExecService } from "./ExecService.js";
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it("finishes cancellation within a bound even if a detached descendant never closes stdio", async () => {
  vi.useFakeTimers(); vi.spyOn(process,"kill").mockImplementation(()=>true);
  const child = Object.assign(new EventEmitter(), {pid:987654321,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(),unref:vi.fn()});
  spawn.mockReturnValue(child);
  const service = new ExecService();
  try {
    const {id} = service.start("a",{command:"unused",cwd:process.cwd(),timeoutMs:5000});
    service.cancel("a",id);
    await vi.advanceTimersByTimeAsync(1001);
    expect(service.read("a",id)).toMatchObject({status:"exited",cancelled:true});
    expect(child.stdout.destroyed).toBe(true); expect(child.stderr.destroyed).toBe(true);
    expect(child.unref).toHaveBeenCalled();
  } finally {service.dispose();}
});
