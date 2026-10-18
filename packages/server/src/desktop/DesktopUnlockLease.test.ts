import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
const spawn = vi.hoisted(()=>vi.fn());
vi.mock("node:child_process",()=>({spawn}));
import { DesktopUnlockLease } from "./DesktopUnlockLease.js";
afterEach(()=>{vi.useRealTimers();spawn.mockReset();});
function child() {
  const c = Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
  spawn.mockReturnValueOnce(c);return c;
}
it("keeps a heartbeat only while the server owns its lease and closes stdin on shutdown",()=>{
  vi.useFakeTimers();const c=child(), lease=new DesktopUnlockLease();let input="";
  c.stdin.on("data",data=>{input+=String(data);});
  lease.start(["trusted-helper","-UnlockLease"]);
  vi.advanceTimersByTime(2100);
  expect(input).toBe("heartbeat\nheartbeat\nheartbeat\n");
  lease.stop();expect(c.stdin.writableEnded).toBe(true);
  const before=input;vi.advanceTimersByTime(2000);
  expect(input).toBe(before);expect(c.kill).toHaveBeenCalledOnce();
});
it("an error from a retired child cannot stop the new lease",()=>{
  vi.useFakeTimers();const old=child(), next=child(), lease=new DesktopUnlockLease();
  lease.start(["helper"]);lease.start(["helper"]);
  old.stdin.emit("error",new Error("retired"));
  expect(next.stdin.writableEnded).toBe(false);
  next.emit("close");lease.stop();
});
